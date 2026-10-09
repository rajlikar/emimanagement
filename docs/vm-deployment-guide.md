# EMIManagement — Single-VM Deployment Guide (GCE + Laravel + MySQL + Caddy)

Written 2026-09-08 against commit `674050b` (Laravel 12, PHP `^8.2`, Cloud Run
container files still present but unused by this path). This replaces the earlier
Cloud Run deployment — that GCP project was fully deleted on 2026-09-08. This guide
provisions everything from scratch on one Google Compute Engine VM: PHP-FPM, MySQL,
Caddy (auto-HTTPS), cron, and a deploy script.

**Why one VM instead of Cloud Run:** everything lives together — no Cloud SQL, no
GCS bucket mount, no separate Cloud Scheduler/Jobs workaround for the daily
reminder. A real crontab runs Laravel's scheduler directly, and uploaded documents
just sit on local disk. Trade-off: no autoscaling, and you own OS patching.

**Good news since the last deployment:** the worst defect I found in the Cloud Run
analysis — no ownership checks on loans/EMIs/documents — is already fixed
(commit `42bb434`, real `LoanDetailPolicy`/`LoanDocumentPolicy` + `Gate::authorize()`
throughout). Nothing in this guide needs to work around it.

**If you have prior data to restore:** a verified SQL dump from the deleted Cloud Run
deployment exists locally at `backups/emi-final-backup-20260908.sql` (2 users, 4
loans, 52 EMI records). §6.4 covers importing it as an alternative to a clean start.

---

## Table of contents

1. [What you're deploying](#part-1--what-youre-deploying)
2. [Create the GCP project + VM](#part-2--create-the-gcp-project--vm)
3. [First login and OS baseline](#part-3--first-login-and-os-baseline)
4. [Install the stack: PHP, MySQL, Node, Caddy](#part-4--install-the-stack)
5. [MySQL setup](#part-5--mysql-setup)
6. [Deploy the application](#part-6--deploy-the-application)
7. [PHP-FPM tuning](#part-7--php-fpm-tuning)
8. [Caddy — reverse proxy + automatic HTTPS](#part-8--caddy)
9. [The scheduler and the daily reminder](#part-9--scheduler)
10. [Security hardening](#part-10--security-hardening)
11. [Deploy script for updates](#part-11--deploy-script)
12. [Backups](#part-12--backups)
13. [Verification checklist](#part-13--verification-checklist)
14. [Operations — logs, restarts, troubleshooting](#part-14--operations)
15. [Environment variable reference](#appendix-a--environment-variable-reference)

---

# Part 1 — What you're deploying

Same app as before: Laravel 12 + Inertia/React, MySQL, PHP `^8.2`. Full analysis is
in `docs/cloud-run-deployment-guide.md` — the stack/dependency facts there
(no Redis needed, no queue worker needed, `send:emi-reminder` daily) are still
accurate. What's different for a VM:

| | Cloud Run (deleted) | This VM |
|---|---|---|
| Database | Cloud SQL, separate service | MySQL installed locally |
| File storage | GCS bucket mounted at `storage/app/public` | Local disk, same path |
| Daily reminder | Cloud Scheduler → Cloud Run Job | Real cron + Laravel scheduler |
| HTTPS | Handled by Cloud Run's front end | Caddy, on this VM |
| Scaling | Automatic, to zero | None — one VM, always on |
| `trustProxies` | `at: '*'` (only Google's edge could reach it) | Narrow to `127.0.0.1` (§6.3) |

---

# Part 2 — Create the GCP project + VM

Your personal GCP account currently has **zero projects** (the last one was deleted
2026-09-08, 30-day undelete window open but irrelevant here — this is a fresh
build). Existing billing account `011EB9-30345D-159817` ("My Billing Account 2")
is still open and gets reused.

## 2.1 Create a fresh project

```bash
gcloud projects create emipro-vm --name="EMIManagement VM" --account=akshaykarnwal2017@gmail.com
```

`emipro-vm` is the project ID — must be globally unique; if taken, gcloud tells you
immediately and you pick another (e.g. `emipro-vm-2026`).

Link billing — without this, Compute Engine refuses to create anything:

```bash
gcloud billing projects link emipro-vm --billing-account=011EB9-30345D-159817 --account=akshaykarnwal2017@gmail.com
```

Set this as your working project for the rest of the guide so you don't need to
repeat `--project` on every command:

```bash
gcloud config set project emipro-vm --account=akshaykarnwal2017@gmail.com
```

## 2.2 Enable Compute Engine

```bash
gcloud services enable compute.googleapis.com --project=emipro-vm --account=akshaykarnwal2017@gmail.com
```

Takes 1-2 minutes on a brand-new project.

## 2.3 Reserve a static external IP

A VM's default IP is **ephemeral** — it changes on stop/start, which would silently
break DNS and Caddy's certificate. Reserve a static one before creating the VM:

```bash
gcloud compute addresses create emipro-vm-ip --region=asia-south1 --project=emipro-vm --account=akshaykarnwal2017@gmail.com
```

```bash
gcloud compute addresses describe emipro-vm-ip --region=asia-south1 --project=emipro-vm --account=akshaykarnwal2017@gmail.com --format="value(address)"
```

Save that IP — you'll point DNS at it in §8, and use it to SSH in below.

## 2.4 Firewall rules

Compute Engine blocks all inbound traffic by default except what you explicitly
allow. Three rules: SSH, HTTP (for Let's Encrypt's initial handshake), HTTPS.

```bash
gcloud compute firewall-rules create allow-ssh --network=default --direction=INGRESS --action=ALLOW --rules=tcp:22 --source-ranges=0.0.0.0/0 --project=emipro-vm --account=akshaykarnwal2017@gmail.com
```

```bash
gcloud compute firewall-rules create allow-http-https --network=default --direction=INGRESS --action=ALLOW --rules=tcp:80,tcp:443 --source-ranges=0.0.0.0/0 --project=emipro-vm --account=akshaykarnwal2017@gmail.com
```

## 2.5 Create the VM

```bash
gcloud compute instances create emipro-vm \
  --project=emipro-vm --account=akshaykarnwal2017@gmail.com \
  --zone=asia-south1-a \
  --machine-type=e2-small \
  --image-family=ubuntu-2404-lts-amd64 --image-project=ubuntu-os-cloud \
  --boot-disk-size=20GB --boot-disk-type=pd-standard \
  --address=emipro-vm-ip \
  --tags=http-server,https-server
```

Flag by flag:

- `--machine-type=e2-small` — 2 shared vCPUs, 2 GB RAM, ~$13-14/month. Enough for
  Caddy + PHP-FPM + MySQL together on a personal app's traffic. **Cheaper option:**
  `e2-micro` (2 vCPU, 1 GB RAM) is in Compute Engine's **Always Free tier** — but
  only in `us-west1`, `us-central1`, or `us-east1`, and 1 GB is tight for MySQL +
  PHP-FPM together; you'd want the swap file in §3.4 without exception. If cost
  matters more than latency to India, switch `--zone` to `us-central1-a` and this
  machine type to `e2-micro` and the VM itself becomes free (data transfer/disk
  still cost a little).
- `--image-family=ubuntu-2404-lts-amd64` — Ubuntu 24.04 LTS, supported until 2029.
- `--boot-disk-size=20GB` — plenty; the app + MySQL data + logs won't come close.
- `--address` — attaches the static IP from §2.3, so it survives restarts.
- `--tags` — matches the firewall rules' target (they apply to any instance with
  these tags, which is the default network's convention for HTTP/HTTPS).

Confirm it's running and get the IP one more time:

```bash
gcloud compute instances describe emipro-vm --zone=asia-south1-a --project=emipro-vm --account=akshaykarnwal2017@gmail.com --format="value(status,networkInterfaces[0].accessConfigs[0].natIP)"
```

---

# Part 3 — First login and OS baseline

## 3.1 SSH in

`gcloud` handles key generation and injection automatically the first time:

```bash
gcloud compute ssh emipro-vm --zone=asia-south1-a --project=emipro-vm --account=akshaykarnwal2017@gmail.com
```

Everything from here runs **on the VM**, not your local machine, unless stated
otherwise.

## 3.2 Update the OS and set the hostname/timezone

```bash
sudo apt update && sudo apt upgrade -y
```

```bash
sudo timedatectl set-timezone Asia/Kolkata
```

The app's `APP_TIMEZONE=Asia/Kolkata` only affects Laravel's own date handling;
setting the OS timezone too means cron fires at the times you expect and log
timestamps are legible without mental math.

## 3.3 Create a non-root deploy user

Running the app as `root` is unnecessary risk. `gcloud compute ssh` already logs
you in as a sudo-capable non-root user matching your Google account, so this step
is usually already satisfied — confirm:

```bash
whoami && groups
```

If you see your own username with `sudo` in the group list, skip to §3.4.

## 3.4 Add swap (recommended on 1-2 GB RAM)

`composer install` and `npm run build` are memory-hungry, and MySQL + PHP-FPM
running concurrently benefit from headroom. A 2 GB swap file is a cheap safety net
against an OOM-killed build or database:

```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
```

Make it permanent across reboots:

```bash
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

---

# Part 4 — Install the stack

## 4.1 PHP 8.2

Ubuntu 24.04's default repos ship PHP 8.3, but `composer.json` pins
`config.platform.php` to **exactly `8.2.0`** — a deliberate fix from the Cloud Run
work, because two locked packages (`mailersend/mailersend`, `nette/schema`) reject
newer PHP. Installing 8.2 specifically avoids fighting that pin. Add the PPA that
carries every PHP version Ubuntu itself doesn't:

```bash
sudo apt install -y software-properties-common && sudo add-apt-repository -y ppa:ondrej/php && sudo apt update
```

Install PHP-FPM plus every extension the app's `composer.lock` actually requires
(traced in the Cloud Run analysis — no `redis`, `mongodb`, `soap`, or `amqp`
extensions needed, despite scaffolding referencing them):

```bash
sudo apt install -y php8.2-fpm php8.2-cli php8.2-mysql php8.2-mbstring php8.2-xml php8.2-curl php8.2-zip php8.2-bcmath php8.2-gd php8.2-intl php8.2-opcache
```

Confirm:

```bash
php -v
```

Should print `PHP 8.2.x`.

## 4.2 Composer

```bash
curl -sS https://getcomposer.org/installer | php -- --install-dir=/usr/local/bin --filename=composer
```

```bash
composer --version
```

## 4.3 Node.js 20 (for `npm run build`)

Only needed to compile frontend assets — not required at runtime once
`public/build` exists.

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
```

```bash
sudo apt install -y nodejs
```

```bash
node --version && npm --version
```

## 4.4 MySQL 8

```bash
sudo apt install -y mysql-server
```

```bash
sudo systemctl enable --now mysql
```

## 4.5 Caddy

Caddy isn't in Ubuntu's default repos; add its official one:

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
```

```bash
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
```

```bash
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
```

```bash
sudo apt update && sudo apt install -y caddy
```

`apt` also enables and starts Caddy's systemd service automatically — leave it
running with its default placeholder config for now; §8 replaces it.

## 4.6 Git and other small utilities

```bash
sudo apt install -y git unzip
```

---

# Part 5 — MySQL setup

## 5.1 Secure the installation

```bash
sudo mysql_secure_installation
```

Interactive prompts: set a root password (or keep `auth_socket` — Ubuntu's default
lets `sudo mysql` in as root with no password, which is fine since only local
sudoers can reach it), remove anonymous users (yes), disallow root remote login
(yes), remove the test database (yes), reload privileges (yes).

## 5.2 Create the database and a dedicated app user

**Never point the app at `root`.** Log in and create both:

```bash
sudo mysql
```

Inside the MySQL prompt:

```sql
CREATE DATABASE emimanagement CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'emiapp'@'localhost' IDENTIFIED BY 'CHOOSE_A_STRONG_PASSWORD';
GRANT ALL PRIVILEGES ON emimanagement.* TO 'emiapp'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

`'emiapp'@'localhost'` — scoped to local Unix-socket/TCP-loopback connections only.
The app and MySQL are on the same VM, so nothing needs to connect over the network;
MySQL's default bind address (`127.0.0.1`) already refuses external connections,
and no firewall rule in §2.4 opens port 3306 — confirm that stays true.

---

# Part 6 — Deploy the application

## 6.1 Add a deploy key so the VM can clone the private repo

The repo is private, at `git@github-personal:rajlikar/emimanagement.git`. Generate
a dedicated key on the VM (read-only, scoped to this one repo — never reuse your
personal SSH key here):

```bash
ssh-keygen -t ed25519 -C "emipro-vm-deploy" -f ~/.ssh/emipro_deploy_key -N ""
```

```bash
cat ~/.ssh/emipro_deploy_key.pub
```

Copy that output. On GitHub: repo → **Settings → Deploy keys → Add deploy key** →
paste it, leave **"Allow write access" unchecked** (read-only — the VM only ever
pulls).

Tell SSH to use this key for GitHub:

```bash
cat >> ~/.ssh/config <<'EOF'
Host github.com
  HostName github.com
  User git
  IdentityFile ~/.ssh/emipro_deploy_key
  IdentitiesOnly yes
EOF
```

```bash
chmod 600 ~/.ssh/config
```

## 6.2 Clone the repo

```bash
sudo mkdir -p /var/www && sudo chown $USER:$USER /var/www
```

```bash
git clone git@github.com:rajlikar/emimanagement.git /var/www/emimanagement
```

```bash
cd /var/www/emimanagement
```

## 6.3 Fix `trustProxies` for this topology

The Cloud Run version trusts `at: '*'` because Google's edge was the *only* way to
reach the container. Here, Caddy and PHP-FPM share one machine — Caddy proxies to
PHP-FPM over `127.0.0.1`, so trust only the loopback address rather than
everything:

```bash
sed -i "s/at: '\\*',/at: ['127.0.0.1', '::1'],/" bootstrap/app.php
```

Confirm it landed correctly:

```bash
grep -A2 "trustProxies" bootstrap/app.php
```

Should show `at: ['127.0.0.1', '::1'],`. This is a real security tightening, not
just cosmetic: on Cloud Run, nothing else could reach the container to forge
`X-Forwarded-*` headers; on a VM with `at: '*'`, anything that ever got access to
port 8080/9000 directly could spoof its IP and scheme to the app. Narrowing to
loopback means only Caddy (the actual, sole reverse proxy) is trusted.

## 6.4 Install dependencies and build assets

```bash
composer install --no-dev --optimize-autoloader
```

```bash
npm ci && npm run build
```

## 6.5 Configure `.env`

```bash
cp .env.example .env
```

Edit it (`nano .env`) to match — full reference in [Appendix A](#appendix-a--environment-variable-reference).
The values that differ from the Cloud Run setup:

```env
APP_NAME="EMI Management"
APP_ENV=production
APP_DEBUG=false
APP_TIMEZONE=Asia/Kolkata
APP_URL=https://your-domain.example.com

DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=emimanagement
DB_USERNAME=emiapp
DB_PASSWORD=the_password_you_set_in_5.2

SESSION_DRIVER=database
SESSION_SECURE_COOKIE=true
CACHE_STORE=database
QUEUE_CONNECTION=sync
FILESYSTEM_DISK=public

MAIL_MAILER=smtp
MAIL_HOST=smtp.mailgun.org
MAIL_PORT=587
MAIL_ENCRYPTION=tls
MAIL_USERNAME=emimanagement@akktechnology.org
MAIL_PASSWORD=the_mailgun_smtp_password
MAIL_FROM_ADDRESS=no-reply@akktechnology.org
MAIL_FROM_NAME="EMI Management"

GOOGLE_CLIENT_ID=your_google_oauth_client_id
GOOGLE_CLIENT_SECRET=your_google_oauth_client_secret
GOOGLE_REDIRECT_URL=https://your-domain.example.com/auth/google/callback

RAZORPAY_KEY_ID=your_razorpay_key_id
RAZORPAY_KEY_SECRET=your_razorpay_key_secret

TURNSTILE_SITE_KEY=your_turnstile_site_key
TURNSTILE_SECRET_KEY=your_turnstile_secret_key

VITE_APP_NAME="EMI Management"
VITE_TURNSTILE_SITE_KEY=your_turnstile_site_key
```

`SESSION_SECURE_COOKIE=true` requires HTTPS to actually be live (§8) — if you're
testing over plain HTTP first (no domain yet), set it to `false` temporarily or
login will silently fail to persist the session.

**No domain yet?** Set `APP_URL=http://YOUR_STATIC_IP` and
`SESSION_SECURE_COOKIE=false` for now; revisit both once §8's DNS step is done.

Generate the encryption key:

```bash
php artisan key:generate
```

(No `--no-ansi` caveat here, unlike the Cloud Run guide — `key:generate` without
`--show` writes straight into `.env` itself rather than printing to a variable you
might capture with stray escape codes.)

## 6.6 Run migrations

```bash
php artisan migrate --force
```

**Restoring prior data instead of starting clean:** if you want the loans/EMIs/
users from the deleted Cloud Run deployment (`backups/emi-final-backup-20260908.sql`
on your local machine, 2 users / 4 loans / 52 EMI records), copy it to the VM and
import it **instead of** running a bare `migrate` — the dump already contains the
full schema plus data:

```bash
# on your LOCAL machine
scp "D:/MyData/Coding/Personal/emimanagement/backups/emi-final-backup-20260908.sql" emipro-vm:~/
```

```bash
# back on the VM
mysql -u emiapp -p emimanagement < ~/emi-final-backup-20260908.sql
```

If you do this, **skip** the `php artisan migrate --force` above — the dump already
has every table populated, including the `migrations` table itself.

## 6.7 Storage symlink and permissions

```bash
php artisan storage:link
```

```bash
sudo chown -R www-data:www-data storage bootstrap/cache
```

```bash
sudo chmod -R 775 storage bootstrap/cache
```

`www-data` is the user PHP-FPM's pool runs as (§7) — it needs to write session
files, cache, logs, and uploaded documents.

## 6.8 Cache config, routes, views

Safe here for the same reason established in the Cloud Run analysis: closure
routes cache fine on Laravel 11+, and `config:cache` doesn't block `env()` reads
of real environment variables — but on a VM, `.env` **is** the only source of
those variables (no Cloud Run injection), so this is more straightforwardly safe
than it was there.

```bash
php artisan config:cache && php artisan route:cache && php artisan view:cache
```

**Remember:** any future `.env` edit needs `php artisan config:cache` re-run (or
`config:clear` if you'd rather not cache during iteration) — a stale cached config
is the single most common "I changed .env and nothing happened" trap.

---

# Part 7 — PHP-FPM tuning

Adapting the settings already proven in the Cloud Run image (`docker/php.ini`,
`docker/php-fpm.conf`) — same reasoning, adjusted for a persistent 2 GB VM instead
of an ephemeral 512 Mi container.

## 7.1 Pool config

```bash
sudo tee /etc/php/8.2/fpm/pool.d/emipro.conf > /dev/null <<'EOF'
[emipro]
user = www-data
group = www-data
listen = /run/php/emipro.sock
listen.owner = www-data
listen.group = www-data

; Static sizing on a fixed-RAM VM, same reasoning as the Cloud Run pool: bursts
; right after a quiet period are exactly when `dynamic` would be busy forking
; children instead of serving.
pm = static
pm.max_children = 6
pm.max_requests = 500

catch_workers_output = yes
decorate_workers_output = no

slowlog = /var/log/php-emipro-slow.log
request_slowlog_timeout = 15s
request_terminate_timeout = 90s
EOF
```

`listen = /run/php/emipro.sock` — a Unix socket rather than a TCP port. Caddy and
PHP-FPM are on the same machine, so a socket avoids the (tiny) overhead of the
loopback network stack and can't be reached by anything remote even in principle.

Remove the distro's default pool so it doesn't also try to bind a conflicting
socket:

```bash
sudo rm -f /etc/php/8.2/fpm/pool.d/www.conf
```

## 7.2 php.ini overrides

```bash
sudo tee /etc/php/8.2/fpm/conf.d/99-emipro.ini > /dev/null <<'EOF'
upload_max_filesize = 32M
post_max_size = 64M
max_file_uploads = 20
max_execution_time = 60
max_input_time = 60
memory_limit = 256M

display_errors = Off
display_startup_errors = Off
log_errors = On
error_log = /var/log/php-emipro-error.log
error_reporting = E_ALL & ~E_DEPRECATED & ~E_STRICT
expose_php = Off
date.timezone = Asia/Kolkata

opcache.enable = 1
opcache.enable_cli = 0
opcache.memory_consumption = 128
opcache.interned_strings_buffer = 16
opcache.max_accelerated_files = 20000
opcache.save_comments = 1

; Unlike the immutable Cloud Run image, this filesystem changes on every deploy
; (a `git pull`). validate_timestamps=0 means PHP would keep serving cached,
; stale bytecode after a deploy until something restarts php-fpm. Part 11's
; deploy script ALWAYS restarts php-fpm as its last step specifically to make
; this setting safe — if you ever deploy by hand instead, do not skip that
; restart, or code changes silently won't take effect.
opcache.validate_timestamps = 0
EOF
```

`memory_limit = 256M` (vs. Cloud Run's 128M) — this VM has 2 GB total instead of a
512 Mi container split four ways; more headroom per worker is free to give.

Restart PHP-FPM to pick both files up:

```bash
sudo systemctl restart php8.2-fpm
```

```bash
sudo systemctl enable php8.2-fpm
```

---

# Part 8 — Caddy

## 8.1 Point DNS at the VM (if you have a domain)

At your DNS provider, create an **A record**:

```
your-domain.example.com  →  YOUR_STATIC_IP (from §2.3)
```

Propagation is usually minutes, occasionally longer. Confirm before continuing:

```bash
dig +short your-domain.example.com
```

Should print your static IP.

## 8.2 The Caddyfile

```bash
sudo tee /etc/caddy/Caddyfile > /dev/null <<'EOF'
your-domain.example.com {
	root * /var/www/emimanagement/public
	encode gzip

	@phpFile path *.php
	php_fastcgi unix//run/php/emipro.sock

	file_server

	# Vite's build output is content-hashed - the filename changes whenever the
	# content does, so it's safe to cache forever.
	@buildAssets path /build/*
	header @buildAssets Cache-Control "public, max-age=31536000, immutable"

	# Block dotfiles (.env, .git) from ever being served, mirroring the same
	# rule from the Cloud Run nginx config.
	@dotfiles path_regexp ^/\.(?!well-known)
	respond @dotfiles 404
}
EOF
```

`php_fastcgi unix//run/php/emipro.sock` is a Caddy directive that expands into the
full FastCGI proxy config (equivalent to nginx's `fastcgi_pass` + `fastcgi_param`
block) *and* automatically requests + renews the Let's Encrypt certificate for the
domain in the header line above — this single block replaces both the Cloud Run
`nginx.conf` and its certificate management entirely.

**No domain yet?** Replace the first line with `:80` (Caddy then serves plain HTTP
on port 80, no certificate — matches `APP_URL=http://YOUR_STATIC_IP` from §6.5):

```
:80 {
	root * /var/www/emimanagement/public
	...
```

Validate the config before reloading:

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
```

Apply it:

```bash
sudo systemctl reload caddy
```

Watch the first request trigger certificate issuance:

```bash
sudo journalctl -u caddy -f
```

Then in another terminal, or a browser: visit `https://your-domain.example.com` —
the first hit may take a couple of seconds while Caddy completes the ACME
challenge.

---

# Part 9 — Scheduler

This is genuinely simpler than the Cloud Run version. There, `send:emi-reminder`
needed a Cloud Run Job plus a Cloud Scheduler entry because Cloud Run has no
concept of a long-lived cron daemon. A VM has one natively — Laravel's own
scheduler just needs a single crontab line running every minute, and
`routes/console.php`'s existing `Schedule::command('send:emi-reminder')->dailyAt('10:00')`
handles the actual timing.

```bash
crontab -e
```

Add exactly one line:

```
* * * * * cd /var/www/emimanagement && php artisan schedule:run >> /dev/null 2>&1
```

That's the entire cron footprint needed — no separate line per scheduled command,
ever. Laravel checks its own schedule every minute and fires anything that's due.

**A reminder from the Cloud Run analysis, still true here:** `SendEmiReminder`
`sleep(10)`s between each email it sends, so a day with many due EMIs takes real
wall-clock minutes. On a VM this is unremarkable (the process just runs a bit
longer once a day) — it was only a problem on Cloud Run because of the request
timeout.

---

# Part 10 — Security hardening

## 10.1 SSH: key-only, no root login

Ubuntu 24.04's cloud image already disables password auth and root SSH login by
default via cloud-init — confirm rather than assume:

```bash
sudo grep -E "^PasswordAuthentication|^PermitRootLogin" /etc/ssh/sshd_config /etc/ssh/sshd_config.d/*.conf 2>/dev/null
```

Should show `PasswordAuthentication no` and `PermitRootLogin` either absent or
`prohibit-password`. If not, add both as `no` to
`/etc/ssh/sshd_config.d/99-hardening.conf` and `sudo systemctl restart ssh`.

## 10.2 `ufw` as a second layer

The GCP firewall rules (§2.4) are the real gate, but a host-level firewall costs
nothing and catches misconfiguration on either side:

```bash
sudo ufw allow 22/tcp && sudo ufw allow 80/tcp && sudo ufw allow 443/tcp && sudo ufw --force enable
```

```bash
sudo ufw status
```

## 10.3 Automatic security updates

```bash
sudo apt install -y unattended-upgrades
```

```bash
sudo dpkg-reconfigure -plow unattended-upgrades
```

Accept the prompt — this applies security patches automatically without you
needing to remember to `apt upgrade`.

## 10.4 `fail2ban` (optional but cheap)

Blocks repeated failed SSH login attempts automatically:

```bash
sudo apt install -y fail2ban && sudo systemctl enable --now fail2ban
```

## 10.5 Confirm `APP_DEBUG=false` and rotate anything that sat in a plaintext `.env`

Same warning as the Cloud Run guide: `APP_DEBUG=true` renders stack traces —
including DB credentials — to any visitor who triggers an error. Already set to
`false` in §6.5; just don't flip it for "quick debugging" on the live VM.

If you're restoring the old `.env`'s Mailgun password or Google OAuth secret
(rather than typing fresh ones), those sat in a plaintext file across the earlier
Cloud Run work — rotating them is still worthwhile, independent of this migration.

---

# Part 11 — Deploy script

A single script on the VM to run on every future code change — pulls, rebuilds,
migrates, and restarts PHP-FPM (mandatory, per §7.2's `opcache.validate_timestamps`
note).

```bash
tee /var/www/emimanagement/deploy.sh > /dev/null <<'EOF'
#!/bin/bash
set -euo pipefail
cd /var/www/emimanagement

echo "[deploy] pulling latest code"
git pull origin main

echo "[deploy] installing PHP dependencies"
composer install --no-dev --optimize-autoloader

echo "[deploy] building frontend assets"
npm ci && npm run build

echo "[deploy] running migrations"
php artisan migrate --force

echo "[deploy] refreshing caches"
php artisan config:cache
php artisan route:cache
php artisan view:cache

echo "[deploy] fixing permissions"
sudo chown -R www-data:www-data storage bootstrap/cache

echo "[deploy] restarting php-fpm (required - see php.ini opcache note)"
sudo systemctl restart php8.2-fpm

echo "[deploy] done"
EOF
```

```bash
chmod +x /var/www/emimanagement/deploy.sh
```

Run it any time you push a change:

```bash
/var/www/emimanagement/deploy.sh
```

---

# Part 12 — Backups

Nothing here is durable by default — the entire dataset lives on this one VM's
disk. Minimum viable protection: a nightly `mysqldump` retained for a week.

```bash
sudo tee /usr/local/bin/emipro-backup.sh > /dev/null <<'EOF'
#!/bin/bash
set -euo pipefail
BACKUP_DIR=/var/backups/emipro
mkdir -p "$BACKUP_DIR"
STAMP=$(date +%Y%m%d)
mysqldump -u emiapp -p'CHOOSE_A_STRONG_PASSWORD' emimanagement > "$BACKUP_DIR/emipro-$STAMP.sql"
find "$BACKUP_DIR" -name "emipro-*.sql" -mtime +7 -delete
EOF
```

```bash
sudo chmod 700 /usr/local/bin/emipro-backup.sh
```

Add to root's crontab (`sudo crontab -e`):

```
0 2 * * * /usr/local/bin/emipro-backup.sh
```

**This is still single-point-of-failure protection** — a dump on the same disk
survives a bad migration, not a lost VM. For real durability, periodically copy
`/var/backups/emipro/` somewhere else (a GCS bucket, `rsync` to another machine,
even downloading it locally the way `backups/emi-final-backup-20260908.sql` was
captured during the Cloud Run teardown).

---

# Part 13 — Verification checklist

- [ ] `sudo systemctl status php8.2-fpm caddy mysql` — all three `active (running)`
- [ ] `curl -I https://your-domain.example.com/up` (or `http://IP/up` if no domain) → `200`
- [ ] Homepage loads, static assets under `/build/` load (check browser devtools Network tab)
- [ ] Register a user, log in, session persists across a page reload
- [ ] Create a loan, confirm the EMI schedule generates
- [ ] Upload a document, confirm it downloads
- [ ] Google sign-in works (redirect URI registered for this domain — see the
  original guide's §7.3 pattern, same idea, new URL)
- [ ] `crontab -l` shows the scheduler line; wait a day or force-test:
  `php artisan send:emi-reminder` manually once to confirm mail sends
- [ ] `sudo ufw status` shows only 22/80/443 open
- [ ] `mysql -u root -e "SELECT user,host FROM mysql.user;"` shows no anonymous users
- [ ] A backup file exists under `/var/backups/emipro/` after the first 2am run

---

# Part 14 — Operations

## Logs

```bash
sudo journalctl -u caddy -f          # Caddy access/error + ACME activity
sudo journalctl -u php8.2-fpm -f     # PHP-FPM worker lifecycle
sudo tail -f /var/log/php-emipro-error.log   # PHP application errors
tail -f /var/www/emimanagement/storage/logs/laravel.log   # Laravel's own log
```

## Restarting services

```bash
sudo systemctl restart php8.2-fpm    # after any code or php.ini change
sudo systemctl reload caddy          # after any Caddyfile change (no downtime)
sudo systemctl restart mysql         # rarely needed
```

## Common failures

| Symptom | Cause |
|---|---|
| 502 from Caddy | PHP-FPM isn't running, or the socket path in the Caddyfile doesn't match `pool.d/emipro.conf`'s `listen =` |
| Login redirects back to login forever | `SESSION_SECURE_COOKIE=true` but you're on plain HTTP, or `trustProxies` wasn't updated (§6.3) |
| Code change has no visible effect | Forgot to restart `php8.2-fpm` after a manual deploy — opcache is still serving old bytecode |
| Certificate never issues | DNS A record doesn't point at this VM yet, or port 80 is blocked (needed for the ACME HTTP challenge even though the site itself serves HTTPS) |
| `.env` edit does nothing | Config is cached — run `php artisan config:cache` again |
| MySQL connection refused | Check `DB_HOST=127.0.0.1` (not a socket path — that was the Cloud SQL-specific form) |

---

# Appendix A — Environment variable reference

Same variables as the Cloud Run guide's Appendix B, with these VM-specific values:

| Variable | VM value |
|---|---|
| `DB_CONNECTION` | `mysql` |
| `DB_HOST` | `127.0.0.1` |
| `DB_PORT` | `3306` |
| `DB_DATABASE` | `emimanagement` |
| `DB_USERNAME` | `emiapp` (never `root`) |
| `DB_SOCKET` | unset — this was the Cloud SQL-specific connection form |
| `FILESYSTEM_DISK` | `public` — local disk, no bucket mount needed |
| `SESSION_SECURE_COOKIE` | `true` once HTTPS is live (§8), `false` if testing over plain HTTP |
| `LOG_CHANNEL` | `stack` or `single` is fine here (a real persistent disk, unlike Cloud Run's `stderr`-only requirement) |
| `APP_URL` | your domain (`https://...`) or `http://STATIC_IP` |
| `GOOGLE_REDIRECT_URL` | `<APP_URL>/auth/google/callback` — must be re-registered in the Google Cloud Console for this new URL |
| `RUN_MIGRATIONS`, Cloud Run job/scheduler vars | N/A — not applicable outside Cloud Run |

Everything else (`APP_KEY`, `RAZORPAY_*`, `TURNSTILE_*`, `MAIL_*`,
`GOOGLE_CLIENT_ID`/`SECRET`) carries over unchanged in meaning, just now living in
a plain `.env` file on disk instead of Secret Manager. Nothing enforces file
permissions on `.env` by default — confirm it's not world-readable:

```bash
chmod 600 /var/www/emimanagement/.env
```
