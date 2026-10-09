# EMIManagement — Google Cloud Run Deployment Guide

> **Database update:** the container now supports SQLite + Litestream instead of Cloud SQL
> (~$0.10–0.50/month instead of ~$10). For the database, migrations and reminder
> parts, follow [cloud-run-sqlite-litestream.md](cloud-run-sqlite-litestream.md); the
> Cloud SQL steps below (§5.3, §7.1, §7.2) are the alternative path.

Written against the repository as of commit `c2d4097`, analysed and verified on
2026-08-02. Every command below is written for a **brand-new Google Cloud
account** with nothing configured, and is designed so it cannot touch your
company's Google Cloud account.

**How to read this:** Parts 1–3 are the analysis and the changes the project
needed. Parts 4–8 are the deployment itself, in order. Part 9 is the recommended
Free Tier configuration. Part 10 is a checklist to tick off as you go.

If you only want to deploy, start at **Part 4** — but read **Part 2** first,
because two things (the database and the Google OAuth redirect URI) require
decisions you cannot defer.

---

## Table of contents

1. [Project analysis](#part-1--project-analysis)
2. [Cloud Run compatibility: what was wrong and what changed](#part-2--cloud-run-compatibility)
3. [The container files, explained](#part-3--the-container-files-explained)
4. [Google Cloud from zero, safely alongside your company account](#part-4--google-cloud-from-zero)
5. [Provisioning: APIs, registry, database, storage, secrets](#part-5--provisioning)
6. [Build, push, deploy](#part-6--build-push-deploy)
7. [Post-deploy: migrations, cron, OAuth, custom domain](#part-7--post-deploy)
8. [Operations: logs, updates, rollback, teardown](#part-8--operations)
9. [Recommended Free Tier configuration and real costs](#part-9--free-tier-configuration-and-costs)
10. [Deployment checklist](#part-10--deployment-checklist)
11. [Appendix A — what was verified, and how](#appendix-a--verification-log)
12. [Appendix B — complete environment variable reference](#appendix-b--environment-variable-reference)

---

# Part 1 — Project analysis

## 1.1 What this application is

A personal loan / EMI (equated monthly instalment) tracker. A user registers,
records loans they are repaying, and the app generates an EMI schedule, tracks
payments, stores loan documents, shows a dashboard of charts, and emails
reminders before instalments fall due.

## 1.2 Stack

| Layer | Technology | Version | Evidence |
|---|---|---|---|
| Backend framework | Laravel | 12.26.4 (locked) | `composer.json`, verified via `artisan about` |
| Language runtime | PHP | `^8.2` required | `composer.json` `require.php` |
| Frontend framework | React | 18.3 | `package.json` |
| SPA bridge | Inertia.js | 2.x server / 1.x client | `inertiajs/inertia-laravel`, `@inertiajs/react` |
| Asset bundler | Vite | 5.x | `vite.config.js` |
| CSS | Tailwind CSS 3 + `@tailwindcss/forms` | 3.2 | `tailwind.config.js` |
| Database | **MySQL** | 8.x | `.env` `DB_CONNECTION=mysql` |
| PHP package manager | Composer | 2.x | `composer.lock` |
| JS package manager | npm | lockfile v3 | `package-lock.json` |
| Web server (prod) | nginx + php-fpm | supplied by this guide | `docker/` |

### Notable dependencies

- `laravel/socialite` — "Sign in with Google" (`GoogleAuthController`).
- `razorpay/razorpay` — payment gateway, used by `PaymentController`.
- `mailersend/laravel-driver` — installed but **not used**; `.env` selects the
  generic `smtp` mailer pointed at Mailgun.
- `tightenco/ziggy` — exposes named routes to JS via the `@routes` Blade
  directive.
- `laravel/sanctum` — installed by default scaffolding; no API-token routes
  exist, so it is inert.
- `zircote/swagger-php` — installed; no OpenAPI annotations found in `app/`.
- `chart.js` + `react-chartjs-2` — dashboard charts.
- `datatables.net-*` — the loan list table, backed by `GET /api/loan-detail`.

## 1.3 How it builds and starts

**Build** is two independent halves:

```
npm ci && npm run build      # resources/js -> public/build (Vite manifest)
composer install --no-dev    # vendor/
```

**Start**, in production, is nginx serving `public/` and forwarding `.php` to
php-fpm. There is no `artisan serve` in production — that is a single-threaded
development server.

A detail that matters: `resources/views/app.blade.php` asks Vite for a **per-page**
entry point:

```php
@vite(['resources/js/app.jsx', "resources/js/Pages/{$page['component']}.jsx"])
```

but `vite.config.js` declares only `app.jsx` as an input. This looks like it
should fail in a production build. **It does not** — `app.jsx` pulls in every page
through `import.meta.glob('./Pages/**/*.jsx')`, so Vite emits each page as a
dynamic-import chunk and records it in the manifest under its source path. I
confirmed this by running the real production build: all 30 manifest entries are
present, including `resources/js/Pages/Dashboard.jsx` and
`resources/js/Pages/Auth/Login.jsx`. No change is needed here.

## 1.4 Required services

| Service | Needed? | Why / detail |
|---|---|---|
| **MySQL database** | **Yes — mandatory** | Application data, plus `sessions`, `cache` and `jobs` tables. The app cannot start a session without it. |
| **Redis** | No | `config/database.php` defines a Redis connection and `.env` has `REDIS_*`, but `CACHE_STORE=database` and `SESSION_DRIVER=database`. No code references Redis. Do not provision it. |
| **Queue worker** | **No** | This is the important one — see below. |
| **Cron / scheduler** | **Yes** | `routes/console.php` schedules `send:emi-reminder` daily at 10:00. |
| **File storage** | **Yes** | Loan documents uploaded to the `public` disk (`storage/app/public`). Needs durable storage on Cloud Run. |
| **Outbound SMTP** | Yes | EMI reminders and contact-form mail. |
| **Search / broadcasting** | No | `BROADCAST_CONNECTION=log`; no Echo/Pusher client code. |

### Why no queue worker

`app/Notifications/EmiReminder.php` and `ContactRecieved.php` both `use Queueable`
— but neither `implements ShouldQueue`. The `Queueable` trait on its own only
adds `onQueue()`/`onConnection()` helpers; **without the `ShouldQueue` interface
Laravel sends the notification synchronously**. There are no `Job` classes and no
`dispatch()` calls anywhere in `app/`.

So `QUEUE_CONNECTION=database` is set but nothing ever writes to the `jobs` table.
**Do not deploy a queue-worker service.** It would idle forever, and on Cloud Run
a background worker requires always-on CPU, which is outside the free tier.

The practical consequence: `send:emi-reminder` sends every email inline, and the
command sleeps 10 seconds between each one (`SendEmiReminder.php:44`). 30 due EMIs
= 5 minutes of wall-clock. This is why reminders must run as a **Cloud Run Job**
with a generous timeout, not inside a web request.

## 1.5 Environment variables

Full reference with production values in [Appendix B](#appendix-b--environment-variable-reference).
The short version — the app genuinely needs:

- **Core:** `APP_KEY`, `APP_ENV`, `APP_DEBUG`, `APP_URL`, `APP_NAME`, `APP_TIMEZONE`
- **Database:** `DB_CONNECTION`, `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD`, and
  either `DB_SOCKET` (Cloud SQL) or `DB_HOST`/`DB_PORT`
- **Drivers:** `SESSION_DRIVER`, `CACHE_STORE`, `QUEUE_CONNECTION`, `FILESYSTEM_DISK`, `LOG_CHANNEL`
- **Mail:** `MAIL_MAILER`, `MAIL_HOST`, `MAIL_PORT`, `MAIL_USERNAME`, `MAIL_PASSWORD`, `MAIL_ENCRYPTION`, `MAIL_FROM_ADDRESS`, `MAIL_FROM_NAME`
- **Google OAuth:** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URL`
- **Razorpay:** `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`
- **Turnstile:** `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` (see §2.7 — currently decorative)
- **Build-time only (Vite):** `VITE_APP_NAME`, `VITE_TURNSTILE_SITE_KEY`

---

# Part 2 — Cloud Run compatibility

The project had **no container files at all** when I analysed it — no Dockerfile,
no `.dockerignore`, no CI config. Those are now generated (Part 3). Beyond that,
here is every issue that would have broken a Cloud Run deployment, and its status.

## 2.1 Blockers — fixed in this change

### B1. No trusted-proxy configuration *(fixed: `bootstrap/app.php`)*

Cloud Run terminates TLS at Google's front end and forwards to your container over
**plain HTTP**, passing the original scheme/host/IP in `X-Forwarded-*` headers.
Laravel does not trust those headers by default, so without this fix the app
believes every request is `http://`:

- `url()` / `route()` emit `http://` links → the browser blocks them as mixed
  content, and Inertia's asset URLs break;
- signed URLs (email verification, password reset) are generated under one scheme
  and validated under another → **they always fail**;
- `$request->ip()` returns Google's proxy address, not the client.

Fixed by calling `$middleware->trustProxies(at: '*', ...)`. Trusting `*` is correct
here specifically because a Cloud Run container is only reachable through Google's
front end — a client has no route by which to forge the headers.

### B2. Container must listen on `$PORT` *(fixed: `docker/entrypoint.sh`)*

Cloud Run chooses the port and passes it in `$PORT`. A container listening on a
hardcoded 80 fails the startup probe and the revision never goes live. The
entrypoint rewrites the nginx `listen` directive at boot.

### B3. php-fpm would discard every environment variable *(fixed: `docker/php-fpm.conf`)*

This one is subtle and would have been very hard to diagnose. php-fpm's default is
`clear_env = On`, which **wipes the parent process environment from every worker**.
Cloud Run delivers all configuration — `APP_KEY`, `DB_*`, every Secret Manager
secret — as process environment variables. With `clear_env` on, `env()` returns
`null` for all of them and the app boots with no database credentials and no
encryption key. Set explicitly to `clear_env = no`.

### B4. Ephemeral filesystem loses uploaded documents *(addressed: GCS volume mount)*

`LoanDetailController` writes uploads to the `public` disk =
`storage/app/public`. On Cloud Run that is the container's writable layer, which is
destroyed when the instance is recycled — which, at `min-instances=0`, is
constantly. Part 5.5 mounts a Cloud Storage bucket at that exact path.

### B5. `composer install` resolved against the wrong PHP *(fixed: `composer.json`)*

Your workstation runs PHP 8.4; production runs 8.2. Without a pinned platform,
Composer resolves against whatever PHP it finds, which can select package versions
that do not run on 8.2. Added `config.platform.php = "8.2.0"`. The vendor build
stage also runs on `php:8.2-cli-alpine` so the resolution platform matches
production exactly.

## 2.2 Non-blockers I checked and cleared

These are commonly-cited Laravel-on-Cloud-Run problems that **do not** apply here.
I verified each rather than assuming.

| Claim | Verdict | Evidence |
|---|---|---|
| "`route:cache` fails — `routes/web.php` has closure routes" | **False.** Laravel 11+ ships `laravel/serializable-closure` and caches them fine. | Ran `route:cache` (succeeded), then served `/`, `/privacy`, `/terms`, `/support` from the built image — all HTTP 200. |
| "`config:cache` breaks Razorpay because `PaymentController` calls `env()` at runtime" | **False on Cloud Run.** `config:cache` only stops Laravel reading a `.env` *file*; real process environment variables stay visible to `env()`. | `RAZORPAY_KEY_ID=from_os_env php artisan tinker` with config cached returned `from_os_env`. |
| "Per-page `@vite()` entry breaks the production build" | **False.** `import.meta.glob` puts every page in the manifest. | Real `npm run build`; all page paths present in `manifest.json`. |

Because both caches are safe, the entrypoint builds `config:cache`, `view:cache`
and `route:cache` at container start — worth roughly 10–20 ms per request.

They are built **at start, not at image build time**: `config:cache` freezes the
value of every `env()` call at the moment it runs, and at build time none of the
Cloud Run variables exist yet. Baking it into the image would ship a config
pointing at nothing.

## 2.3 Security issues found — NOT fixed, please read

These are pre-existing application defects. They are not deployment blockers, so I
have not changed application logic beyond the proxy fix. But deploying to a public
URL is exactly when they start to matter.

### S1. No ownership checks on EMIs, documents, or payments — **most serious**

`LoanDetailController` scopes its **list** query by `user_id`
(`LoanDetailController.php:28`) and sets `user_id` on create (`:169`). But there
are **no policies and no gates anywhere in the project** and the per-record actions
do not verify ownership. Endpoints including:

```
GET|PUT|DELETE  /loan-detail/{id}
POST            /update-emi
POST            /emi-skipped
POST            /foreclose-loan
DELETE          /loan-document/{loanDocument}
POST            /loan-detail/{loanDetail}/upload-documents
```

take an integer ID straight from the request. **Any logged-in user can read,
modify, or delete another user's loans and documents by changing the number in the
URL.** With a single-user private app this is invisible; on a public URL where
anyone can register, it is a full data breach.

The fix is a `LoanDetailPolicy` plus `$this->authorize(...)` in each method, or at
minimum `->where('user_id', Auth::id())` on every lookup. I can implement this if
you want — say the word.

### S2. `dd()` in two production code paths

- `PaymentController::verifyPayment()` ends in `dd($isVerified)` — the payment
  verification endpoint **dumps and dies** instead of returning a response.
  Separately, `verifyPaymentSignature()` *throws* on mismatch rather than
  returning `false`, so a forged signature surfaces as an unhandled 500.
- `GoogleAuthController::loginWithGoogle()` catches its exception and calls
  `dd($e)` — rendering a full stack trace, including environment values, to
  whoever hit the callback.

With `APP_DEBUG=false` these produce blank 500s rather than leaking data, which is
why setting `APP_DEBUG=false` is non-negotiable (§2.4). But both endpoints are
still broken.

### S3. Real credentials are in the repository's history and working tree

- `.env` holds live secrets: a Mailgun SMTP password, Razorpay test keys, a
  **Google OAuth client secret**, a MailerSend API key, and the Turnstile secret
  key. It is correctly `.gitignore`d, so it was never committed — but it is on
  disk, and `.dockerignore`/`.gcloudignore` now explicitly exclude it so it cannot
  be baked into an image or uploaded to Cloud Build.
- **`emimanagement.sql` IS tracked in git.** It contains real user rows —
  email addresses, bcrypt password hashes — and session records with IP addresses.
  It is excluded from the build context, but it is in your git history. If this
  repository ever becomes public, or is pushed to a shared remote, that data goes
  with it.

Recommended: rotate the Google OAuth client secret and the Mailgun password before
going live, since both have sat in a working tree. Purging
`emimanagement.sql` from history requires a rewrite (`git filter-repo`) and a force
push — a separate task, and one to do deliberately.

### S4. `APP_DEBUG=true` in the working `.env`

Fine locally, catastrophic in production — it renders stack traces containing
environment variables and database credentials to any visitor who triggers an
error. The entrypoint logs a loud warning if it sees this, and the deploy commands
in Part 6 set `APP_DEBUG=false` explicitly.

## 2.4 Google OAuth needs a redirect URI you may not control

`GOOGLE_REDIRECT_URL` currently points at `http://localhost:8000/auth/google/callback`.
After deploying you must add the Cloud Run callback URL to the **existing OAuth
client's** authorised redirect URIs.

**This is a cross-account concern.** That OAuth client
(`455864286265-...apps.googleusercontent.com`) lives in whichever Google Cloud
project originally created it. If that is your **company** project, you will need
access to it to add the URI — or, cleaner, create a **new** OAuth client in your
new personal project and use its ID and secret instead. Creating a new client in
the personal project is the recommended path: it keeps the two accounts fully
separate. See Part 7.3.

## 2.5 Cloudflare Turnstile is currently decorative

`app/Rules/CloudflareTurnstileRule.php` exists but is **referenced by no validator
anywhere** in `app/` or `routes/`. The login page renders the widget, but nothing
server-side verifies the token. It neither blocks bots nor breaks anything. Wiring
it up means adding the rule to `LoginRequest`; leaving it is also fine. Just do not
expect it to be protecting the login form today.

---

# Part 3 — The container files, explained

Six files were generated. All were built and run before being handed over — see
[Appendix A](#appendix-a--verification-log).

| File | Purpose |
|---|---|
| `Dockerfile` | Three-stage production image (281 MB) |
| `docker/nginx.conf` | vhost: static files, PHP FastCGI, caching, security headers |
| `docker/php.ini` | Memory, upload limits, opcache, error handling |
| `docker/php-fpm.conf` | Worker pool sizing and `clear_env=no` |
| `docker/supervisord.conf` | Runs nginx + php-fpm; exits the container if either dies |
| `docker/entrypoint.sh` | `$PORT` binding, fail-fast checks, cache warming |
| `.dockerignore` / `.gcloudignore` | Keep secrets and bulk out of the build context |
| `cloudbuild.yaml` | Optional server-side build |

## 3.1 Why three stages

```
Stage 1  node:20-alpine        npm ci && npm run build   ->  public/build
Stage 2  php:8.2-cli-alpine    composer install --no-dev ->  vendor/
Stage 3  php:8.2-fpm-alpine    nginx + php-fpm + app     ->  the shipped image
```

Only stage 3 is shipped. Node, npm, Composer and the compiler toolchain never
reach production — that is most of the difference between a 281 MB image and a
~900 MB one, and it removes a lot of attack surface.

Stage 2 runs on `php:8.2-cli-alpine` rather than the usual `composer:2` image on
purpose: the `composer` image tracks the newest PHP release, and several locked
packages cap the PHP version they accept. Resolving on 8.2 — the same minor stage 3
runs — keeps the lock file honest.

## 3.2 Decisions worth knowing about

**Vite variables are build args, not runtime env vars.** Vite substitutes
`import.meta.env.VITE_*` at build time and bakes the literal into the JS bundle.
`VITE_APP_NAME` and `VITE_TURNSTILE_SITE_KEY` therefore have to be `--build-arg`s;
setting them on the Cloud Run service does nothing. A Turnstile *site* key is
public by design (it is in the page HTML for every visitor), so this is safe — but
it is why `docker build` emits a `SecretsUsedInArgOrEnv` warning for it. That
warning is a false positive here. The Turnstile **secret** key is a runtime
variable and must never be a build arg.

**The `public/storage` symlink is created in the Dockerfile.** `artisan
storage:link` needs a booted app, so the link is made directly. In production the
GCS bucket mounts at `storage/app/public` and the symlink resolves into it.

**Log output goes to stdout/stderr only.** Cloud Logging captures both. nginx
access logs are switched *off* because Cloud Run already records every request with
status, latency and trace ID — duplicating that doubles log volume against the free
allowance.

**The container exits if nginx or php-fpm dies.** Without this, a dead nginx would
leave php-fpm and supervisord running, so PID 1 looks healthy while the instance
serves nothing. The `die-on-child-exit` event listener kills supervisord instead,
the container exits, and Cloud Run replaces it. I verified this by killing nginx
inside a running container: it exited within seconds.

**`opcache.validate_timestamps=0`.** The image is immutable, so opcache never needs
to `stat()` source files. This removes a filesystem check per included file per
request. It is also why a code change requires a new image, never a file copy.

---

# Part 4 — Google Cloud from zero

This part is the answer to "I have a company GCP account and must not touch it."

## 4.0 The one idea that makes this safe: **configurations**

gcloud stores its state — active account, active project, default region — in a
named **configuration**. You can have many, and switch between them atomically. If
you create one configuration for your company and one for this project, you can
never half-switch (right account, wrong project), which is the usual way people
deploy to the wrong place.

We will create a configuration called `emipro` and keep it selected for all work in
this guide.

## 4.1 Install the Google Cloud CLI

You already have **Google Cloud SDK 555.0.0** and **Docker 29.6.2** installed, so
you can skip this section. It is here for completeness / a fresh machine.

**Windows** — download and run the installer:

```
https://dl.google.com/dl/cloudsdk/channels/rapid/GoogleCloudSDKInstaller.exe
```

Leave "Start Google Cloud CLI" ticked at the end. Then in a **new** terminal:

```bash
gcloud --version
```

**Docker Desktop for Windows** (needed only for the local-build path in Part 6A):

```
https://www.docker.com/products/docker-desktop/
```

Requires WSL2. Verify with:

```bash
docker --version
```

Docker Desktop must be *running* (whale icon in the tray) before any `docker`
command works — the CLI being installed is not the same as the daemon being up.

## 4.2 Create an isolated configuration BEFORE logging in

Do this first. It means your personal login never lands in the configuration your
company work uses.

```bash
gcloud config configurations create emipro
```

This creates and **activates** it. Confirm — and see what else exists:

```bash
gcloud config configurations list
```

You will see `emipro` with `IS_ACTIVE = True`, alongside `default` (which is
presumably your company setup). Everything from here on writes only to `emipro`.

> If `emipro` already exists, activate it instead:
> `gcloud config configurations activate emipro`

## 4.3 Log in with your personal account

```bash
gcloud auth login
```

A browser opens. **Choose your new personal Google account, not your company
one.** If the browser is already signed into the company account, use an incognito
window or sign out first — this is the single most likely place to make a mistake.

gcloud can hold credentials for several accounts simultaneously. List them:

```bash
gcloud auth list
```

The `*` marks the active account. If the wrong one is active:

```bash
gcloud config set account you@personal-example.com
```

## 4.4 Find your project ID and set it

The display name is `My First Project`; the **project ID** is different — usually
something like `my-first-project-461208`. Commands need the ID.

```bash
gcloud projects list
```

Set it on the `emipro` configuration only:

```bash
gcloud config set project YOUR_PROJECT_ID
```

Set a default region so you can omit `--region` later. `asia-south1` (Mumbai) is
the right choice for users in India:

```bash
gcloud config set run/region asia-south1
```

## 4.5 The verification snippet — run this before every critical step

This is the habit that protects you. One command, three answers:

```bash
gcloud config list --format="value(core.account,core.project,run.region)"
```

Expected output:

```
you@personal-example.com	YOUR_PROJECT_ID	asia-south1
```

**If the account or project is not what you expect, stop and fix it before running
anything else.** Every "Verify" checkpoint in Part 5 and Part 6 means "run this".

### Extra belt-and-braces options

**Option 1 — pin the configuration for a whole terminal session.** This environment
variable overrides the globally active configuration for that shell only, so even
if another window switches to the company config, this one is unaffected:

```bash
export CLOUDSDK_ACTIVE_CONFIG_NAME=emipro
```

(PowerShell: `$env:CLOUDSDK_ACTIVE_CONFIG_NAME = "emipro"`)

**Option 2 — be explicit on destructive commands.** Every gcloud command accepts
`--project`. Passing it means the command cannot be misrouted regardless of
configuration state:

```bash
gcloud run services list --project=YOUR_PROJECT_ID
```

**Option 3 — a guard function.** Add to your shell profile; it refuses to proceed
if the active project is not the expected one:

```bash
emi() {
  local want="YOUR_PROJECT_ID"
  local have; have="$(gcloud config get-value project 2>/dev/null)"
  if [ "$have" != "$want" ]; then
    echo "REFUSING: active project is '$have', expected '$want'" >&2
    return 1
  fi
  gcloud "$@"
}
```

Then use `emi run deploy ...` instead of `gcloud run deploy ...`.

## 4.6 Switching back to your company account

```bash
gcloud config configurations activate default
```

And back to this project:

```bash
gcloud config configurations activate emipro
```

Nothing is shared between them except the credential store, so switching is
instant and safe. **After every switch, run the §4.5 verification snippet.**

## 4.7 Link billing

Cloud Run, Artifact Registry and Cloud SQL all require a billing account attached,
even to use the free tier. A new account normally comes with $300 of trial credit.

Check what is linked:

```bash
gcloud billing accounts list
```

Link it — **make sure you pick your personal billing account, not the company
one**; this is the other place a mistake actually costs money:

```bash
gcloud billing projects link YOUR_PROJECT_ID --billing-account=XXXXXX-XXXXXX-XXXXXX
```

Confirm which billing account the project now uses:

```bash
gcloud billing projects describe YOUR_PROJECT_ID
```

> **Set a budget alert now, before deploying.** Console → Billing → Budgets &
> alerts → Create budget. A ₹500 / $10 monthly budget with alerts at 50/90/100%
> costs nothing and is the only thing that will tell you if something starts
> costing money. Highly recommended on a personal account.

---

# Part 5 — Provisioning

Set shell variables once so the rest of the guide is copy-pasteable:

```bash
export PROJECT_ID="YOUR_PROJECT_ID"
export REGION="asia-south1"
export REPO="emi-repo"
export SERVICE="emipro"
export IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/emimanagement"
```

PowerShell equivalent:

```powershell
$PROJECT_ID = "YOUR_PROJECT_ID"; $REGION = "asia-south1"; $REPO = "emi-repo"; $SERVICE = "emipro"
$IMAGE = "$REGION-docker.pkg.dev/$PROJECT_ID/$REPO/emimanagement"
```

**Verify** (§4.5) before continuing.

## 5.1 Enable APIs

Nothing works until these are on. Enabling is free; you are billed for usage, not
for the API being enabled.

```bash
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  sqladmin.googleapis.com \
  secretmanager.googleapis.com \
  cloudscheduler.googleapis.com \
  storage.googleapis.com \
  logging.googleapis.com
```

What each is for:

| API | Why |
|---|---|
| `run` | Cloud Run itself |
| `artifactregistry` | Stores your Docker images |
| `cloudbuild` | Needed even for `gcloud run deploy --source`; optional for local builds |
| `sqladmin` | Cloud SQL (MySQL) |
| `secretmanager` | Storing `APP_KEY`, DB password, API keys |
| `cloudscheduler` | Daily EMI reminder cron |
| `storage` | GCS bucket for uploaded loan documents |
| `logging` | Log ingestion and viewing |

This takes 1–2 minutes. Confirm:

```bash
gcloud services list --enabled --format="value(config.name)"
```

## 5.2 Create the Artifact Registry repository

Artifact Registry is where your built images live. Cloud Run can only deploy from
here (or GCR, which is deprecated).

```bash
gcloud artifacts repositories create "${REPO}" \
  --repository-format=docker \
  --location="${REGION}" \
  --description="EMIManagement container images"
```

- `--repository-format=docker` — a Docker/OCI image repo.
- `--location` — must match your Cloud Run region, or every deploy pays a
  cross-region pull in cold-start latency and egress.

Let Docker authenticate to it. This writes a credential helper into
`~/.docker/config.json` so `docker push` works:

```bash
gcloud auth configure-docker "${REGION}-docker.pkg.dev"
```

> Free tier: Artifact Registry includes 0.5 GB of storage free. This image is
> 281 MB, so **one** image version fits free; a handful of versions costs a few
> cents a month. Part 8.5 shows how to prune old ones.

## 5.3 Create the MySQL database

**Be aware: Cloud SQL has no always-free tier.** This is the one unavoidable cost
of this deployment. Your $300 trial credit covers it for 90 days; after that the
smallest instance is roughly **$9–11/month**.

Create the instance (this takes 5–10 minutes):

```bash
gcloud sql instances create emipro-sql \
  --database-version=MYSQL_8_0 \
  --tier=db-f1-micro \
  --region="${REGION}" \
  --storage-size=10GB \
  --storage-type=HDD \
  --no-backup \
  --availability-type=zonal
```

Flag by flag:

- `--tier=db-f1-micro` — the smallest shared-core machine. Ample for a personal app.
- `--storage-size=10GB --storage-type=HDD` — HDD is cheaper than SSD and fine at
  this scale. 10 GB is the minimum.
- `--no-backup` — saves cost. **Turn backups on if this holds data you care
  about** (`--backup-start-time=19:00`); automated backups cost roughly the price
  of the storage they use.
- `--availability-type=zonal` — single zone. Regional HA roughly doubles the price.

Create the database and a dedicated user (not `root`):

```bash
gcloud sql databases create emimanagement --instance=emipro-sql
```

```bash
gcloud sql users create emiapp --instance=emipro-sql --password='CHOOSE_A_STRONG_PASSWORD'
```

Get the **connection name** — the `project:region:instance` string Cloud Run uses:

```bash
gcloud sql instances describe emipro-sql --format="value(connectionName)"
```

Save it:

```bash
export SQL_CONNECTION="$(gcloud sql instances describe emipro-sql --format='value(connectionName)')"
```

### How Cloud Run connects

Cloud Run mounts a Unix socket at `/cloudsql/<connection-name>`. Laravel supports
this natively — `config/database.php` already reads `DB_SOCKET`:

```php
'unix_socket' => env('DB_SOCKET', ''),
```

So in production you set `DB_SOCKET=/cloudsql/<connection-name>` and **leave
`DB_HOST` unset**. No public IP, no SSL certificates, no IP allow-listing.

### If you want to avoid the Cloud SQL cost entirely

The app needs MySQL 8-compatible storage; it does not need it to be Google's. Any
externally-hosted MySQL with a public endpoint works — set `DB_HOST`/`DB_PORT`
instead of `DB_SOCKET`. Providers with genuine free tiers include **TiDB Cloud
Serverless** (MySQL-compatible) and **Aiven for MySQL** (free plan). Trade-offs:
higher latency from outside GCP, and you must supply `MYSQL_ATTR_SSL_CA` if the
provider requires TLS (`config/database.php` already reads that variable). Cloud
SQL remains the lower-friction choice.

## 5.4 Create a dedicated service account

The default Compute Engine service account has broad permissions. A dedicated one
with only the three roles this app needs is better practice and makes the blast
radius of a compromise small.

```bash
gcloud iam service-accounts create emipro-run \
  --display-name="EMIManagement Cloud Run runtime"
```

```bash
export RUN_SA="emipro-run@${PROJECT_ID}.iam.gserviceaccount.com"
```

Grant exactly three roles:

```bash
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${RUN_SA}" --role="roles/cloudsql.client"
```

```bash
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${RUN_SA}" --role="roles/secretmanager.secretAccessor"
```

```bash
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${RUN_SA}" --role="roles/storage.objectAdmin"
```

- `cloudsql.client` — open the Cloud SQL socket.
- `secretmanager.secretAccessor` — read secret *values* (not create or modify them).
- `storage.objectAdmin` — read/write/delete objects in the uploads bucket. The app
  deletes documents (`LoanDetailController:360`), so read-only is not enough.

## 5.5 Create the uploads bucket

Loan documents must outlive the container.

```bash
export BUCKET="${PROJECT_ID}-emipro-uploads"
```

```bash
gcloud storage buckets create "gs://${BUCKET}" \
  --location="${REGION}" \
  --uniform-bucket-level-access
```

- `--uniform-bucket-level-access` — IAM-only permissions, no legacy per-object
  ACLs. Simpler and safer.
- The bucket is **private**. Documents are served through the app (nginx reads the
  mounted path), not directly from GCS, so users still need a session to fetch
  them. Note that the app itself does not currently check *which* user is asking —
  see §2.3 S1.

> Free tier note: Cloud Storage's always-free 5 GB applies only to US regions
> (`us-east1`, `us-west1`, `us-central1`). In `asia-south1` you pay from the first
> byte — but that is about **$0.02/GB/month**, so a few hundred documents costs
> under a cent. Keeping everything in one region is worth more than that.

## 5.6 Store secrets in Secret Manager

Anything sensitive should be a secret, not a plain `--set-env-vars` value. Env vars
are visible to anyone with `roles/run.viewer`; secret *values* need
`secretAccessor`.

First generate a **fresh** `APP_KEY` for production — do not reuse the development
one:

```bash
php artisan key:generate --show --no-ansi
```

> Note the `--no-ansi`. Without it, artisan colourises the output and you can
> capture invisible ANSI escape codes along with the key. That produces the
> baffling error `Unsupported cipher or incorrect key length` at runtime. I hit
> exactly this while testing.

Create each secret (replace the values):

```bash
printf '%s' 'base64:THE_KEY_YOU_JUST_GENERATED' | gcloud secrets create APP_KEY --data-file=-
```

```bash
printf '%s' 'CHOOSE_A_STRONG_PASSWORD' | gcloud secrets create DB_PASSWORD --data-file=-
```

```bash
printf '%s' 'your-google-oauth-client-secret' | gcloud secrets create GOOGLE_CLIENT_SECRET --data-file=-
```

```bash
printf '%s' 'your-razorpay-key-secret' | gcloud secrets create RAZORPAY_KEY_SECRET --data-file=-
```

```bash
printf '%s' 'your-smtp-password' | gcloud secrets create MAIL_PASSWORD --data-file=-
```

```bash
printf '%s' 'your-turnstile-secret-key' | gcloud secrets create TURNSTILE_SECRET_KEY --data-file=-
```

`printf '%s'` rather than `echo` matters: `echo` appends a newline, which becomes
part of the secret. A trailing newline in `APP_KEY` or a password causes
authentication failures that look like nothing is wrong.

Confirm:

```bash
gcloud secrets list
```

> Free tier: 6 active secret versions are free; we have 6. Additional versions
> cost about $0.06 each per month.

---

# Part 6 — Build, push, deploy

**Verify** (§4.5) before this part. This is where a wrong project actually deploys
something.

## Option A — build locally, push (recommended on the Free Tier)

Uses zero Cloud Build minutes. Requires Docker Desktop running.

Build, tagging with the git SHA so every image is traceable:

```bash
export TAG="$(git rev-parse --short HEAD)"
```

```bash
docker build --build-arg VITE_APP_NAME="EMI Management" --build-arg VITE_TURNSTILE_SITE_KEY="0x4AAAAAACK5F8rD67apEfVP" -t "${IMAGE}:${TAG}" -t "${IMAGE}:latest" .
```

- `--build-arg VITE_*` — build-time only; see §3.2. Substitute your own Turnstile
  site key, or `""` if you are not using it.
- Two tags: an immutable SHA tag to roll back to, and a moving `latest`.

Push both:

```bash
docker push "${IMAGE}:${TAG}" && docker push "${IMAGE}:latest"
```

If push fails with an auth error, re-run `gcloud auth configure-docker
"${REGION}-docker.pkg.dev"`.

## Option B — build in Cloud Build

No local Docker needed. Uses your free monthly build minutes.

```bash
gcloud builds submit --config=cloudbuild.yaml --substitutions=_TAG="$(git rev-parse --short HEAD)",_TURNSTILE_SITE_KEY="0x4AAAAAACK5F8rD67apEfVP",_REGION="${REGION}",_REPO="${REPO}"
```

`.gcloudignore` controls what is uploaded — importantly it excludes `.env` and
`emimanagement.sql`, so neither leaves your machine.

## 6.1 Deploy to Cloud Run

> ### ⚠️ Git Bash on Windows mangles Unix paths — read this first
>
> If you run gcloud from **Git Bash / MINGW64**, MSYS automatically rewrites
> arguments that look like Unix absolute paths into Windows paths before the
> native `gcloud.cmd` ever sees them. This:
>
> ```
> --add-volume-mount=volume=uploads,mount-path=/var/www/html/storage/app/public
> ```
>
> silently becomes:
>
> ```
> --add-volume-mount=volume=uploads,mount-path=C:/Program Files/Git/var/www/html/storage/app/public
> ```
>
> and the deploy fails with the very confusing:
>
> ```
> ERROR: (gcloud.run.deploy) service.spec.template.spec.containers[0].volume_mounts[0].mount_path:
> should be a valid unix absolute path
> ```
>
> gcloud is correct — it really did receive a non-Unix path.
>
> **Do NOT use `MSYS_NO_PATHCONV=1` to fix this.** It appears to work on a test
> command, but it breaks gcloud itself: gcloud's Windows launcher is a shell
> script that relies on the same conversion to locate `gcloud.py`, so with the
> variable set you get
>
> ```
> python.exe: can't open file 'D:\c\Users\...\google-cloud-sdk\lib\gcloud.py'
> ```
>
> There is a second, quieter hazard in Git Bash: **long multi-line commands get
> visually mangled when pasted into MINGW64**, silently splicing one line into
> another. A corrupted `--set-env-vars` is very hard to spot in a wall of text.
>
> **Use PowerShell, and use the script rather than pasting:**
>
> ```powershell
> cd D:\MyData\Coding\Personal\emimanagement
> .\scripts\deploy.ps1
> ```
>
> `scripts/deploy.ps1` performs the whole sequence — deploy, set `APP_URL`,
> create/update the migration job, run migrations, smoke test — and refuses to
> run if the active gcloud project is not the expected one. `-DryRun` prints the
> commands without executing them; `-SkipMigrate` skips the schema step.
>
> PowerShell does no path conversion, and a script is never pasted, so neither
> failure mode applies. Linux/macOS shells are unaffected and can use the raw
> commands below.
>
> (`DB_SOCKET=/cloudsql/<connection-name>` happens to survive Git Bash unmangled,
> because the colons make MSYS skip it — but do not rely on that.)

The full command. Every flag is explained underneath — do not run it blind.

```bash
gcloud run deploy "${SERVICE}" \
  --image="${IMAGE}:${TAG}" \
  --region="${REGION}" \
  --platform=managed \
  --allow-unauthenticated \
  --service-account="${RUN_SA}" \
  --port=8080 \
  --cpu=1 \
  --memory=512Mi \
  --concurrency=10 \
  --timeout=120 \
  --min-instances=0 \
  --max-instances=3 \
  --execution-environment=gen2 \
  --add-cloudsql-instances="${SQL_CONNECTION}" \
  --add-volume=name=uploads,type=cloud-storage,bucket="${BUCKET}" \
  --add-volume-mount=volume=uploads,mount-path=/var/www/html/storage/app/public \
  --set-env-vars="APP_NAME=EMI Management,APP_ENV=production,APP_DEBUG=false,APP_TIMEZONE=Asia/Kolkata,APP_LOCALE=en,LOG_CHANNEL=stderr,LOG_LEVEL=warning,DB_CONNECTION=mysql,DB_SOCKET=/cloudsql/${SQL_CONNECTION},DB_DATABASE=emimanagement,DB_USERNAME=emiapp,SESSION_DRIVER=database,SESSION_LIFETIME=120,SESSION_SECURE_COOKIE=true,CACHE_STORE=database,QUEUE_CONNECTION=sync,FILESYSTEM_DISK=public,MAIL_MAILER=smtp,MAIL_HOST=smtp.mailgun.org,MAIL_PORT=587,MAIL_ENCRYPTION=tls,MAIL_USERNAME=emimanagement@akktechnology.org,MAIL_FROM_ADDRESS=no-reply@akktechnology.org,MAIL_FROM_NAME=EMI Management,GOOGLE_CLIENT_ID=YOUR_CLIENT_ID,RAZORPAY_KEY_ID=YOUR_RAZORPAY_KEY_ID,TURNSTILE_SITE_KEY=0x4AAAAAACK5F8rD67apEfVP" \
  --set-secrets="APP_KEY=APP_KEY:latest,DB_PASSWORD=DB_PASSWORD:latest,GOOGLE_CLIENT_SECRET=GOOGLE_CLIENT_SECRET:latest,RAZORPAY_KEY_SECRET=RAZORPAY_KEY_SECRET:latest,MAIL_PASSWORD=MAIL_PASSWORD:latest,TURNSTILE_SECRET_KEY=TURNSTILE_SECRET_KEY:latest"
```

### What each flag does

| Flag | Meaning |
|---|---|
| `--allow-unauthenticated` | Makes the service publicly reachable. Without it, every request needs a Google identity token — correct for internal APIs, wrong for a public web app. |
| `--service-account` | Runs as the restricted SA from §5.4 rather than the broad default. |
| `--port=8080` | The value placed in `$PORT`. The entrypoint reconfigures nginx to match. |
| `--cpu` / `--memory` | See Part 9. |
| `--concurrency=10` | Simultaneous requests per instance. Matched to 4 php-fpm workers. |
| `--timeout=120` | Request timeout in seconds. Above php.ini's 60 s so PHP times out first and logs a stack trace. |
| `--min-instances=0` | **Required for the free tier.** Any value above 0 bills idle CPU. Costs a cold start on the first request after idle. |
| `--max-instances=3` | Hard cost ceiling. Prevents a traffic spike or a loop from scaling into a large bill. |
| `--execution-environment=gen2` | Required for Cloud Storage volume mounts. |
| `--add-cloudsql-instances` | Mounts the Cloud SQL socket at `/cloudsql/<connection>`. |
| `--add-volume` / `--add-volume-mount` | Mounts the GCS bucket at `storage/app/public` so uploads persist. |
| `--set-env-vars` | Plain config. **Replaces the whole set** each time — see §8.2. |
| `--set-secrets` | Injects secret values as env vars. `NAME=SECRET:latest` resolves at instance start. |

Note `QUEUE_CONNECTION=sync` rather than `database`: nothing is queued (§1.4), and
`sync` makes that explicit instead of implying a worker exists.

`SESSION_SECURE_COOKIE=true` is safe now that trusted proxies are configured (§2.1
B1) — without that fix it would have broken login entirely.

On success gcloud prints the service URL:

```
https://emipro-<hash>-el.a.run.app
```

Save it:

```bash
export SERVICE_URL="$(gcloud run services describe ${SERVICE} --region=${REGION} --format='value(status.url)')"
```

## 6.2 Set `APP_URL` to the real URL

`APP_URL` cannot be known before the first deploy. Update it now — otherwise
generated links and the `/storage` document URLs point somewhere wrong:

```bash
gcloud run services update "${SERVICE}" --region="${REGION}" --update-env-vars="APP_URL=${SERVICE_URL}"
```

`--update-env-vars` **merges**; `--set-env-vars` would wipe everything else.

---

# Part 7 — Post-deploy

## 7.1 Run migrations as a Cloud Run Job

Do **not** migrate from the web container's entrypoint. During a rollout several
instances boot at once, and Laravel's migrator takes no distributed lock — they
race on the `migrations` table and can half-apply a schema. A Job runs exactly
once.

Create it (same image, same SA, same Cloud SQL attachment, different command):

```bash
gcloud run jobs create emipro-migrate \
  --image="${IMAGE}:${TAG}" \
  --region="${REGION}" \
  --service-account="${RUN_SA}" \
  --set-cloudsql-instances="${SQL_CONNECTION}" \
  --command="php" \
  --args="artisan,migrate,--force" \
  --max-retries=1 \
  --task-timeout=600 \
  --set-env-vars="APP_ENV=production,APP_DEBUG=false,LOG_CHANNEL=stderr,DB_CONNECTION=mysql,DB_SOCKET=/cloudsql/${SQL_CONNECTION},DB_DATABASE=emimanagement,DB_USERNAME=emiapp,CACHE_STORE=array,SESSION_DRIVER=array" \
  --set-secrets="APP_KEY=APP_KEY:latest,DB_PASSWORD=DB_PASSWORD:latest"
```

- `--command="php" --args="artisan,migrate,--force"` overrides the image
  entrypoint. `--force` is required: `migrate` refuses to run unprompted in
  production without it.
- `CACHE_STORE=array,SESSION_DRIVER=array` — the job must not depend on the
  `cache`/`sessions` tables, which may not exist yet on a first run. This is a
  genuine chicken-and-egg trap.

Run it:

```bash
gcloud run jobs execute emipro-migrate --region="${REGION}" --wait
```

`--wait` blocks and returns a non-zero exit code on failure, so it is safe in a
deploy script. **Run this before switching traffic to a revision with new
migrations.**

## 7.2 Schedule the daily EMI reminder

`routes/console.php` schedules `send:emi-reminder` at 10:00. Laravel's scheduler
needs a per-minute cron, which Cloud Run has no concept of — so instead of running
`schedule:run`, invoke the command directly on the schedule it declares.

Create the job:

```bash
gcloud run jobs create emipro-reminder \
  --image="${IMAGE}:${TAG}" \
  --region="${REGION}" \
  --service-account="${RUN_SA}" \
  --set-cloudsql-instances="${SQL_CONNECTION}" \
  --command="php" \
  --args="artisan,send:emi-reminder" \
  --max-retries=0 \
  --task-timeout=1800 \
  --set-env-vars="APP_ENV=production,APP_DEBUG=false,APP_TIMEZONE=Asia/Kolkata,LOG_CHANNEL=stderr,DB_CONNECTION=mysql,DB_SOCKET=/cloudsql/${SQL_CONNECTION},DB_DATABASE=emimanagement,DB_USERNAME=emiapp,CACHE_STORE=array,SESSION_DRIVER=array,QUEUE_CONNECTION=sync,MAIL_MAILER=smtp,MAIL_HOST=smtp.mailgun.org,MAIL_PORT=587,MAIL_ENCRYPTION=tls,MAIL_USERNAME=emimanagement@akktechnology.org,MAIL_FROM_ADDRESS=no-reply@akktechnology.org,MAIL_FROM_NAME=EMI Management,APP_URL=${SERVICE_URL}" \
  --set-secrets="APP_KEY=APP_KEY:latest,DB_PASSWORD=DB_PASSWORD:latest,MAIL_PASSWORD=MAIL_PASSWORD:latest"
```

- `--task-timeout=1800` (30 min) — the command sleeps 10 s between emails
  (§1.4), so 100 due EMIs takes ~17 minutes. The default 10-minute timeout would
  cut it off mid-run.
- `--max-retries=0` — a retry would re-send reminders people already received.

Give Cloud Scheduler permission to run jobs:

```bash
gcloud projects add-iam-policy-binding "${PROJECT_ID}" --member="serviceAccount:${RUN_SA}" --role="roles/run.invoker"
```

Create the schedule — 10:00 India time, matching the app's declared intent:

```bash
gcloud scheduler jobs create http emipro-reminder-daily \
  --location="${REGION}" \
  --schedule="0 10 * * *" \
  --time-zone="Asia/Kolkata" \
  --uri="https://${REGION}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${PROJECT_ID}/jobs/emipro-reminder:run" \
  --http-method=POST \
  --oauth-service-account-email="${RUN_SA}"
```

Test it immediately rather than waiting until tomorrow:

```bash
gcloud scheduler jobs run emipro-reminder-daily --location="${REGION}"
```

> Free tier: 3 Cloud Scheduler jobs per month are free. You are using 1.

## 7.3 Fix the Google OAuth redirect URI

Sign-in with Google will fail until the deployed callback URL is registered. As
noted in §2.4, the **recommended** path is a new OAuth client in your personal
project, so nothing depends on company-account access.

1. Console → **APIs & Services → OAuth consent screen**. Configure it (External;
   add yourself as a test user while it is unverified).
2. Console → **APIs & Services → Credentials → Create credentials → OAuth client
   ID → Web application**.
3. Under **Authorised redirect URIs** add exactly:
   `https://emipro-<hash>-el.a.run.app/auth/google/callback`
4. Update the service with the new client ID, and store the new secret:

```bash
printf '%s' 'NEW_CLIENT_SECRET' | gcloud secrets versions add GOOGLE_CLIENT_SECRET --data-file=-
```

```bash
gcloud run services update "${SERVICE}" --region="${REGION}" --update-env-vars="GOOGLE_CLIENT_ID=NEW_CLIENT_ID,GOOGLE_REDIRECT_URL=${SERVICE_URL}/auth/google/callback"
```

A new secret *version* does not reach running instances until a new revision
starts, because `:latest` resolves at instance start. The `services update` above
creates one, so the order here is correct.

## 7.4 Custom domain (optional)

Cloud Run domain mappings are not available in every region. The more portable
route is a **global external Application Load Balancer** with a serverless NEG,
which also gives you Cloud CDN and Cloud Armor — but it costs roughly $18/month
for the forwarding rule alone, so it is hard to justify here.

If domain mapping is supported in your region:

```bash
gcloud beta run domain-mappings create --service="${SERVICE}" --domain=emi.example.com --region="${REGION}"
```

It prints DNS records to add at your registrar. After DNS propagates, update
`APP_URL` and the OAuth redirect URI to the custom domain.

---

# Part 8 — Operations

## 8.1 Viewing logs

Tail live (needs the `log-streaming` component; gcloud offers to install it):

```bash
gcloud beta run services logs tail "${SERVICE}" --region="${REGION}"
```

Last 50 entries:

```bash
gcloud run services logs read "${SERVICE}" --region="${REGION}" --limit=50
```

Errors only, across the whole service — the query most worth remembering:

```bash
gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="'"${SERVICE}"'" AND severity>=ERROR' --limit=30 --format="table(timestamp,textPayload)"
```

Job logs:

```bash
gcloud run jobs executions list --job=emipro-migrate --region="${REGION}"
```

The Console (Cloud Run → your service → **Logs**) is genuinely better for
browsing; the CLI is better for grepping.

## 8.2 Updating a deployment

**Code change** — rebuild, push, deploy the new tag:

```bash
export TAG="$(git rev-parse --short HEAD)" && docker build --build-arg VITE_APP_NAME="EMI Management" --build-arg VITE_TURNSTILE_SITE_KEY="0x4AAAAAACK5F8rD67apEfVP" -t "${IMAGE}:${TAG}" . && docker push "${IMAGE}:${TAG}"
```

```bash
gcloud run deploy "${SERVICE}" --region="${REGION}" --image="${IMAGE}:${TAG}"
```

Flags you do not repeat are retained from the previous revision, so you do not need
the whole Part 6.1 command again.

**If the change includes new migrations**, update the job to the new image and run
it *before* deploying the service:

```bash
gcloud run jobs update emipro-migrate --region="${REGION}" --image="${IMAGE}:${TAG}" && gcloud run jobs execute emipro-migrate --region="${REGION}" --wait
```

**Change one environment variable** (merges — this is almost always what you want):

```bash
gcloud run services update "${SERVICE}" --region="${REGION}" --update-env-vars="LOG_LEVEL=debug"
```

**Remove one:**

```bash
gcloud run services update "${SERVICE}" --region="${REGION}" --remove-env-vars="LOG_LEVEL"
```

> ⚠️ `--set-env-vars` **replaces the entire set**, silently dropping any variable
> you did not list. Using it when you meant `--update-env-vars` is the single most
> common way to break a working Cloud Run service. Prefer `--update-env-vars`.

Every deploy creates a new immutable **revision** and shifts 100% of traffic to it
by default.

## 8.3 Rolling back

List revisions, newest first:

```bash
gcloud run revisions list --service="${SERVICE}" --region="${REGION}"
```

Send all traffic back to a known-good one:

```bash
gcloud run services update-traffic "${SERVICE}" --region="${REGION}" --to-revisions=emipro-00003-abc=100
```

This is instant — the old revision's image is already in the registry; nothing is
rebuilt. **Rollback does not undo database migrations**, so a revision that depends
on a schema change cannot be rolled back past that change safely.

Return to "always serve the newest":

```bash
gcloud run services update-traffic "${SERVICE}" --region="${REGION}" --to-latest
```

### Safer deploys: split traffic

Deploy without taking traffic, then move it gradually:

```bash
gcloud run deploy "${SERVICE}" --region="${REGION}" --image="${IMAGE}:${TAG}" --no-traffic --tag=candidate
```

The revision gets its own preview URL (`https://candidate---emipro-...run.app`) for
testing. Then shift 10%:

```bash
gcloud run services update-traffic "${SERVICE}" --region="${REGION}" --to-tags=candidate=10
```

## 8.4 Common failures and what they actually mean

| Symptom | Cause |
|---|---|
| `mount_path: should be a valid unix absolute path` | Running gcloud from Git Bash on Windows. MSYS rewrote `/var/www/...` to `C:/Program Files/Git/var/www/...`. Fix: use PowerShell + `scripts/deploy.ps1` (§6.1). Do **not** use `MSYS_NO_PATHCONV=1`. |
| `python.exe: can't open file 'D:\c\Users\...\gcloud.py'` | `MSYS_NO_PATHCONV=1` is set. It breaks gcloud's own launcher, which needs that conversion to find `gcloud.py`. Unset it and use PowerShell instead. |
| Arguments look spliced together / a value contains part of another flag | A long multi-line command was pasted into Git Bash and got visually mangled. Use `scripts/deploy.ps1` instead of pasting. |
| `does not have permission to access projects instance [...]` where the project name looks truncated | Bash parameter-expansion trap: `${project-my-id}` means "value of `$project`, else `my-id`" — it silently eats the prefix. Use the literal project ID or a correctly-named variable. |
| `Container failed to start... listen on PORT=8080` | Entrypoint exited. Check logs: almost always the `APP_KEY is unset` fail-fast. |
| `Unsupported cipher or incorrect key length` | `APP_KEY` has stray whitespace or ANSI codes. Regenerate with `--no-ansi` and `printf '%s'`. |
| HTTP 500 on every page, health check `/up` fine | The app boots but the DB is unreachable. Check `DB_SOCKET` matches the connection name and the SA has `cloudsql.client`. |
| Login redirects back to login forever | Session not persisting. Check `sessions` table exists (migrations ran) and `SESSION_SECURE_COOKIE` with trusted proxies configured. |
| Uploaded documents 404 after some time | GCS volume mount missing — files went to the ephemeral layer. |
| `Permission denied on secret` | The runtime SA lacks `secretmanager.secretAccessor`, or the secret is in a different project. |
| Google sign-in `redirect_uri_mismatch` | §7.3 not done, or `APP_URL` and the registered URI disagree. |

## 8.5 Deleting resources — avoiding charges

**Order matters**: delete the service before the database, or you will get error
noise.

Nothing (Cloud Run scales to zero, images cost pennies) bills meaningfully except
**Cloud SQL, which bills 24/7 whether or not anyone uses it**. If you only do one
thing, do this one.

**Stop Cloud SQL without deleting data** (still charged for storage, but not the
instance — much cheaper):

```bash
gcloud sql instances patch emipro-sql --activation-policy=NEVER
```

Restart it later with `--activation-policy=ALWAYS`.

**Full teardown**, in order:

```bash
gcloud run services delete "${SERVICE}" --region="${REGION}" --quiet
```

```bash
gcloud run jobs delete emipro-migrate --region="${REGION}" --quiet && gcloud run jobs delete emipro-reminder --region="${REGION}" --quiet
```

```bash
gcloud scheduler jobs delete emipro-reminder-daily --location="${REGION}" --quiet
```

```bash
gcloud sql instances delete emipro-sql --quiet
```

```bash
gcloud storage rm --recursive "gs://${BUCKET}"
```

```bash
gcloud artifacts repositories delete "${REPO}" --location="${REGION}" --quiet
```

**Prune old images** without deleting the repo (keeps you inside the 0.5 GB free
allowance):

```bash
gcloud artifacts docker images list "${IMAGE}" --include-tags --sort-by=~UPDATE_TIME
```

```bash
gcloud artifacts docker images delete "${IMAGE}:OLD_TAG" --delete-tags --quiet
```

**Nuclear option** — delete the whole project. Everything inside goes with it,
and this cannot affect your company account because the project ID is explicit:

```bash
gcloud projects delete YOUR_PROJECT_ID
```

(Recoverable for 30 days.)

---

# Part 9 — Free Tier configuration and costs

## 9.1 Recommended settings

| Setting | Value | Reasoning |
|---|---|---|
| **CPU** | `1` | The free allowance is 180,000 vCPU-seconds/month. Below 1 vCPU, Cloud Run restricts concurrency and cold starts get noticeably worse for PHP. |
| **Memory** | `512Mi` | Fits 4 php-fpm workers at a 128 M limit each, plus nginx and supervisord. Measured image RSS at idle is comfortably under this. |
| **Concurrency** | `10` | Matched to `pm.max_children=4` with headroom for static-file requests, which nginx serves without touching PHP. Requests beyond this queue in nginx rather than failing. |
| **Request timeout** | `120s` | Above php.ini's `max_execution_time=60`, so PHP times out first and logs a stack trace instead of Cloud Run returning an opaque 504. |
| **Min instances** | `0` | **Non-negotiable for free.** Above 0 you pay for idle CPU around the clock. |
| **Max instances** | `3` | A cost ceiling. Three instances × 10 concurrency = 30 simultaneous requests, far beyond a personal app's needs. |
| **Execution environment** | `gen2` | Required for the GCS volume mount. |
| **CPU allocation** | request-time only (default) | The always-free tier applies only to this mode. Do not set `--cpu-always-allocated`. |
| **Startup CPU boost** | optional | `--cpu-boost` cuts PHP cold starts meaningfully but bills boosted vCPU-seconds during startup. Add it if cold starts annoy you. |

The trade-off you are accepting with `min-instances=0` is a **cold start of roughly
2–4 seconds** on the first request after a quiet period: container pull, entrypoint
(config/route/view cache), php-fpm start. Every subsequent request is fast. For a
personal app this is the right trade; if it bothers you, `--min-instances=1` costs
roughly $5–8/month.

## 9.2 What the free tier actually covers (per month)

| Service | Always-free allowance | Your likely usage |
|---|---|---|
| Cloud Run requests | 2,000,000 | Far under |
| Cloud Run vCPU | 180,000 vCPU-s | ~50 hours of request processing — far under |
| Cloud Run memory | 360,000 GiB-s | Far under |
| Artifact Registry | 0.5 GB | 281 MB per image → prune to 1–2 versions |
| Cloud Build | free minutes on the default machine type | Only if using Option B |
| Secret Manager | 6 active versions | Exactly 6 |
| Cloud Scheduler | 3 jobs | 1 |
| Cloud Logging | 50 GiB ingestion | Far under (nginx access logs are off) |
| Cloud Storage | 5 GB — **US regions only** | Not free in `asia-south1`, but ~$0.02/GB |

## 9.3 Honest cost estimate

| Item | Monthly |
|---|---|
| Cloud Run | **$0** (within free tier at `min-instances=0`) |
| Artifact Registry | ~$0.00–0.05 (prune old images) |
| Cloud Storage | ~$0.01–0.10 |
| Secret Manager | $0 at 6 versions |
| Cloud Scheduler | $0 |
| **Cloud SQL (db-f1-micro, 10 GB HDD, zonal)** | **~$9–11** |
| **Total** | **~$9–11/month** |

**Cloud SQL is ~95% of the cost.** Your $300 trial credit covers roughly 27 months
of it, though the credit expires after 90 days. If you want a genuinely $0
deployment, use an external free MySQL host (§5.3) — everything else here already
fits inside the always-free tier.

---

# Part 10 — Deployment checklist

Tick each before moving on. Run the verification snippet
(`gcloud config list --format="value(core.account,core.project,run.region)"`)
at every ⚠️.

### Before you start
- [ ] Decided on the database: Cloud SQL (~$10/mo) or an external free MySQL
- [ ] Decided on the Google OAuth client: new one in the personal project (recommended) or reuse the existing one
- [ ] Read §2.3 — you understand the missing ownership checks (S1) and accept the risk, or asked for them to be fixed first

### Account isolation
- [ ] `gcloud config configurations create emipro` — created and active
- [ ] `gcloud auth login` — signed in with the **personal** account
- [ ] `gcloud config set project YOUR_PROJECT_ID`
- [ ] `gcloud config set run/region asia-south1`
- [ ] ⚠️ Verification snippet shows the personal account + correct project
- [ ] Billing linked to the **personal** billing account (`gcloud billing projects describe`)
- [ ] Budget alert created (₹500 / $10, alerts at 50/90/100%)

### Provisioning
- [ ] ⚠️ Verified
- [ ] 8 APIs enabled
- [ ] Artifact Registry repo `emi-repo` created in `asia-south1`
- [ ] `gcloud auth configure-docker asia-south1-docker.pkg.dev` run
- [ ] Cloud SQL instance + `emimanagement` database + `emiapp` user created
- [ ] `SQL_CONNECTION` captured
- [ ] Service account `emipro-run` created with all 3 roles
- [ ] GCS bucket created with uniform access
- [ ] 6 secrets created — **`APP_KEY` freshly generated with `--no-ansi`, no trailing newline**

### Build & deploy
- [ ] ⚠️ Verified
- [ ] Image built with `--build-arg VITE_*` supplied
- [ ] Image pushed; visible in `gcloud artifacts docker images list`
- [ ] `gcloud run deploy` succeeded; service URL captured
- [ ] `APP_URL` updated to the real service URL

### Post-deploy
- [ ] Migration Job created and executed successfully (`--wait` returned 0)
- [ ] `curl -I $SERVICE_URL/up` returns **200**
- [ ] `curl -I $SERVICE_URL/` returns **200**
- [ ] Registered a user and logged in — session persists across page loads
- [ ] Created a loan; the EMI schedule generated
- [ ] Uploaded a document; it downloads; **still downloads after forcing a new revision** (proves the GCS mount)
- [ ] Google sign-in works (OAuth redirect URI registered)
- [ ] Reminder Job + Scheduler created; manual run succeeded and mail arrived
- [ ] Logs show no ERROR-severity entries

### Hardening
- [ ] `APP_DEBUG=false` confirmed on the service
- [ ] Rotated the Google OAuth client secret and Mailgun password (both sat in a working tree)
- [ ] Decided what to do about `emimanagement.sql` in git history
- [ ] Old image versions pruned to stay under 0.5 GB

### Know your exits
- [ ] You can find logs (§8.1)
- [ ] You can roll back (§8.3)
- [ ] You know Cloud SQL is the only meaningful cost and how to stop it (§8.5)

---

# Appendix A — Verification log

What I actually ran on 2026-08-02, rather than assumed. Everything below passed.

**Static analysis**
- Enumerated all controllers, models, notifications, commands, routes, migrations and config env references.
- Confirmed no `Job` classes, no `dispatch()`, and that neither Notification implements `ShouldQueue` → no queue worker needed.
- Confirmed `CloudflareTurnstileRule` is referenced by no validator.
- Confirmed `emimanagement.sql` is git-tracked; `.env` is not.

**Frontend build** — `npm run build` succeeded (7.5 s). Inspected `manifest.json`: 30 entries; `app.jsx` present as `isEntry=true` and every page (`Pages/Dashboard.jsx`, `Pages/Auth/Login.jsx`, …) present as dynamic chunks. This disproves the expected per-page `@vite` breakage.

**Laravel caching claims**
- `php artisan route:cache` → succeeded despite closure routes.
- With config cached, `RAZORPAY_KEY_ID=from_os_env php artisan tinker` → `env()` returned `from_os_env`, proving `config:cache` is safe when variables come from the process environment.
- Cleared both afterwards; working tree left clean.

**Docker image** — built successfully; **281 MB**. Two `SecretsUsedInArgOrEnv` warnings for `VITE_TURNSTILE_SITE_KEY`, both false positives (public site key, §3.2).

**Runtime, against a real MySQL 8 container**
- Entrypoint rewrote the nginx port, cached config/views/routes, applied all 10 migrations cleanly, and started both processes.
- Route smoke test: `/` 200, `/up` 200, `/login` 200, `/register` 200, `/privacy` 200, `/terms` 200, `/support` 200, `/dashboard` 302 (correct auth redirect), `/nonexistent` 404. **The closure routes returning 200 confirms `route:cache` is genuinely safe.**
- `artisan about` inside the container: Laravel 12.26.4, PHP 8.2.33, env `production`, debug OFF, timezone Asia/Kolkata.
- Sessions persisted to MySQL (11 rows in `sessions`).
- CSRF meta tag and Inertia `data-page` root present in the served HTML.
- Static asset served with a single `Cache-Control: public, max-age=31536000, immutable`.
- Wrote a file to `storage/app/public` and fetched it at `/storage/probe.txt` → 200 — the symlink that makes document downloads work is correct.
- Killed nginx inside the container → supervisord shut down and **the container exited**, confirming the crash guard.

**Also found this way:** `php artisan key:generate --show` emits ANSI colour codes, which silently corrupt a captured `APP_KEY` and produce `Unsupported cipher or incorrect key length`. Hence the `--no-ansi` guidance in §5.6.

**Not verified** — anything requiring real GCP resources (Cloud SQL socket, GCS volume mount, Scheduler, IAM) or third-party credentials (Razorpay, Mailgun, Google OAuth, Turnstile). The gcloud commands are written from the documented behaviour of each service; they have not been executed against a live project.

---

# Appendix B — Environment variable reference

`Where` — **env**: plain `--set-env-vars`; **secret**: Secret Manager via
`--set-secrets`; **build**: `--build-arg` at image build time only.

| Variable | Where | Production value | Notes |
|---|---|---|---|
| `APP_NAME` | env | `EMI Management` | |
| `APP_ENV` | env | `production` | |
| `APP_KEY` | **secret** | `base64:…` | Generate fresh with `--no-ansi`. No trailing newline. |
| `APP_DEBUG` | env | `false` | Never `true` in production (§2.3 S4). |
| `APP_URL` | env | service URL | Set after first deploy (§6.2). |
| `APP_TIMEZONE` | env | `Asia/Kolkata` | Reminder command runs on this. |
| `APP_LOCALE` | env | `en` | |
| `LOG_CHANNEL` | env | `stderr` | Cloud Logging reads stderr. Not `stack`/`single` — no persistent disk. |
| `LOG_LEVEL` | env | `warning` | `debug` will flood your log allowance. |
| `DB_CONNECTION` | env | `mysql` | |
| `DB_SOCKET` | env | `/cloudsql/<connection-name>` | Cloud SQL path. Leave `DB_HOST` unset. |
| `DB_HOST` / `DB_PORT` | env | — | Only for external MySQL instead of `DB_SOCKET`. |
| `DB_DATABASE` | env | `emimanagement` | |
| `DB_USERNAME` | env | `emiapp` | Not `root`. |
| `DB_PASSWORD` | **secret** | — | |
| `MYSQL_ATTR_SSL_CA` | env | — | Only if an external provider requires TLS. |
| `SESSION_DRIVER` | env | `database` | Must be shared across instances — never `file`. |
| `SESSION_LIFETIME` | env | `120` | Minutes. |
| `SESSION_SECURE_COOKIE` | env | `true` | Requires the trusted-proxy fix (§2.1 B1). |
| `CACHE_STORE` | env | `database` | `file` would not be shared between instances. |
| `QUEUE_CONNECTION` | env | `sync` | Nothing is queued (§1.4). |
| `FILESYSTEM_DISK` | env | `public` | Maps to the GCS-mounted `storage/app/public`. |
| `MAIL_MAILER` | env | `smtp` | |
| `MAIL_HOST` / `MAIL_PORT` / `MAIL_ENCRYPTION` | env | `smtp.mailgun.org` / `587` / `tls` | |
| `MAIL_USERNAME` | env | | |
| `MAIL_PASSWORD` | **secret** | — | Rotate — it has been sitting in `.env`. |
| `MAIL_FROM_ADDRESS` / `MAIL_FROM_NAME` | env | | |
| `GOOGLE_CLIENT_ID` | env | | Public identifier. |
| `GOOGLE_CLIENT_SECRET` | **secret** | — | Rotate (§2.3 S3). |
| `GOOGLE_REDIRECT_URL` | env | `<APP_URL>/auth/google/callback` | Must match the registered URI exactly (§7.3). |
| `RAZORPAY_KEY_ID` | env | | Read at runtime via `env()` — works with cached config (§2.2). |
| `RAZORPAY_KEY_SECRET` | **secret** | — | |
| `TURNSTILE_SITE_KEY` | env | | Public. |
| `TURNSTILE_SECRET_KEY` | **secret** | — | Currently unused by any validator (§2.5). |
| `VITE_APP_NAME` | **build** | `EMI Management` | Baked into JS; a runtime var has no effect. |
| `VITE_TURNSTILE_SITE_KEY` | **build** | `0x4AAA…` | Same. |
| `RUN_MIGRATIONS` | — | **unset** | Local compose only. Use the migration Job (§7.1). |

**Not needed in production** — set by default scaffolding but unused here:
`REDIS_*` (no Redis), `AWS_*` (no S3), `MEMCACHED_*`, `MAILERSEND_API_KEY`
(driver installed but `MAIL_MAILER=smtp`), `BROADCAST_CONNECTION`,
`PHP_CLI_SERVER_WORKERS`, `BCRYPT_ROUNDS` (the default of 12 is correct).
