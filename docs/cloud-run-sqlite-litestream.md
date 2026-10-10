# EMIManagement on Cloud Run — SQLite + Litestream (no Cloud SQL)

This replaces the **database part** of [cloud-run-deployment-guide.md](cloud-run-deployment-guide.md)
(§5.3 Cloud SQL, §7.1 migration Job, §7.2 reminder Job). Everything else in that
guide (project setup, Artifact Registry, secrets, uploads bucket, build/push,
custom domain) still applies unchanged.

**Why:** Cloud SQL was ~95% of the monthly bill (~$9–11). With SQLite the whole
deployment fits in the always-free tiers; the only billed items are a few MB in
GCS (~$0.10–0.50/month).

> Status: the application, the Docker image, Litestream restore/replicate/shutdown
> and the reminder endpoint were exercised locally (§9) using a local file replica.
> **The GCS replica itself and everything on GCP are untested** — do the §8
> restore drill on first deploy.

---

## 1. How it works

```
 request ─▶ nginx ─▶ php-fpm ─▶ /var/lib/emi-db/database.sqlite   (local disk, WAL mode)
                                          │
                       Litestream (same container, same user)
                                          │  streams WAL every 1s
                                          ▼
                        gs://<LITESTREAM_BUCKET>/emi/database/   (the durable copy)
```

On every instance start (`docker/entrypoint.sh`):

1. `litestream restore` pulls the latest replica to local disk (skipped if the
   bucket is empty — first deploy).
2. `php artisan migrate --force` runs as `www-data`.
3. supervisord starts Litestream first, then php-fpm and nginx.

On stop, supervisord shuts nginx and php-fpm down first and Litestream **last**
(`priority=5`, `stopwaitsecs=8`), so it can push the final WAL frames inside Cloud
Run's ~10 s SIGTERM→SIGKILL window.

## 2. Limits you are accepting — read this

| Risk | What happens | Mitigation |
|---|---|---|
| **Rollout overlap (most important)** | During `gcloud run deploy`, the new revision starts and restores from GCS *while the old one still serves*. Two instances then have separate copies of the DB and both replicate to the same path. Writes made on the old instance after the new one restored are lost or conflict. `max-instances=1` limits one revision, not the overlap between two. | Deploy when nobody is using the app. Do not deploy and use the app at the same moment. |
| Idle-shutdown race | If an instance is shutting down just as a request creates a new one, the new instance can restore before the old one's final flush. | Rare for a personal app; the loss is at most the last second of writes. |
| Hard crash / OOM kill | Up to ~1 s of writes (the sync interval) can be lost; a graceful stop loses nothing. | Accept, or set `--no-cpu-throttling` (bills ~$5–8/mo) so Litestream runs between requests. |
| CPU throttling between requests | With request-based billing, Litestream is throttled after a response, so replication can lag until the next request or shutdown flush. | Same as above. |
| Single writer | SQLite allows one writer, so `max-instances` **must stay 1**. | Set it; never raise it. |
| RAM-backed disk | Cloud Run's local filesystem counts toward container memory. The DB is well under 1 MB today. | Watch it if the DB ever grows past tens of MB. |
| `decimal` columns | SQLite stores `decimal(10,2)` as floating point, not exact decimal. | Fine for 2-dp rupee amounts; not a ledger-grade store. |

## 3. Environment variables (Cloud Run)

| Var | Value | Notes |
|---|---|---|
| `DB_CONNECTION` | `sqlite` | |
| `DB_DATABASE` | `/var/lib/emi-db/database.sqlite` | **Absolute** path; the entrypoint refuses anything else. |
| `LITESTREAM_BUCKET` | `<project>-emi-litestream` | Required when `APP_ENV=production`; the container refuses to start without it. |
| `LITESTREAM_PATH` | `emi/database` (default) | |
| `REMINDER_TOKEN` | long random string (Secret Manager) | Unset = reminder endpoint disabled (404). |
| `SESSION_DRIVER` / `CACHE_STORE` | `database` | Unchanged; they live in the same SQLite file. |

Remove `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD` and the Cloud SQL
connection / `DB_SOCKET`. That also drops the DB password secret (6 → 5 secrets,
plus `REMINDER_TOKEN` = 6, still inside the free 6 versions).

## 4. Provisioning (replaces §5.3 and §7.1–7.2 of the old guide)

Run these with your *verified* gcloud configuration (old guide §4.5) and the
variables from that guide (`PROJECT_ID`, `REGION`, `SA_EMAIL`, `SERVICE`).

```bash
# 4.1 Replica bucket — separate from the uploads bucket
gcloud storage buckets create "gs://${PROJECT_ID}-emi-litestream" \
  --location="$REGION" --uniform-bucket-level-access --public-access-prevention

# 4.2 The Cloud Run service account must be able to read/write it
gcloud storage buckets add-iam-policy-binding "gs://${PROJECT_ID}-emi-litestream" \
  --member="serviceAccount:${SA_EMAIL}" --role="roles/storage.objectAdmin"

# 4.3 Reminder token
printf '%s' "$(openssl rand -hex 32)" | gcloud secrets create emi-reminder-token --data-file=-
```

### Deploy flags that matter

```bash
gcloud run deploy "$SERVICE" \
  --image "$IMAGE" --region "$REGION" --service-account "$SA_EMAIL" \
  --execution-environment gen2 \
  --cpu 1 --memory 512Mi --concurrency 10 \
  --min-instances 0 --max-instances 1 \
  --timeout 900 \
  --set-env-vars "DB_CONNECTION=sqlite,DB_DATABASE=/var/lib/emi-db/database.sqlite,LITESTREAM_BUCKET=${PROJECT_ID}-emi-litestream,APP_ENV=production,APP_DEBUG=false" \
  --set-secrets "REMINDER_TOKEN=emi-reminder-token:latest,APP_KEY=...,..." \
  --add-volume name=uploads,type=cloud-storage,bucket="$UPLOADS_BUCKET" \
  --add-volume-mount volume=uploads,mount-path=/var/www/html/storage/app/public
```

`--max-instances 1` is mandatory (§2). `--timeout 900` is needed because the
reminder request stays open while the command sleeps between emails.

### Daily reminder (replaces the Cloud Run Job)

```bash
SERVICE_URL=$(gcloud run services describe "$SERVICE" --region "$REGION" --format='value(status.url)')
TOKEN=$(gcloud secrets versions access latest --secret=emi-reminder-token)

gcloud scheduler jobs create http emi-reminder \
  --location "$REGION" --schedule "0 10 * * *" --time-zone "Asia/Kolkata" \
  --uri "${SERVICE_URL}/internal/send-emi-reminders" --http-method POST \
  --headers "X-Reminder-Token=${TOKEN}" \
  --attempt-deadline 900s --max-retry-attempts 0
```

`--max-retry-attempts 0` matters: a retry after a partial run would email the same
people twice. The endpoint is `POST /internal/send-emi-reminders`
([ReminderController](../app/Http/Controllers/Internal/ReminderController.php)); it
runs `send:emi-reminder` in-process on a separate one-worker php-fpm pool
(`docker/php-fpm.conf` `[reminders]`, `docker/nginx.conf`) so the 10 s sleeps
between emails do not hit the normal 75 s limit.

## 5. First-time data load (optional)

Skip this for a clean start — the first deploy just creates an empty database.

```bash
# 5.1 Local MySQL with the data to carry over must be running and in .env.
#     (Restore backups/*.sql into a local MySQL first if needed.)
php scripts/mysql-to-sqlite.php ./seed/database.sqlite
```

The script is read-only against MySQL, builds the schema with the real
migrations, copies users / loan_details / emi_details / contact_forms /
loan_documents, and checks counts, money totals, `integrity_check` and
`foreign_key_check`. Sessions are not copied: everyone signs in again.

Then push that file into the replica **before the first deploy**, using the image
you just built so no local Litestream install is needed (needs
`gcloud auth application-default login`; on Windows use the gcloud folder under
`%APPDATA%`):

```bash
docker run --rm \
  -v "$PWD/seed:/seed" \
  -v "$HOME/.config/gcloud:/gcloud:ro" \
  -e GOOGLE_APPLICATION_CREDENTIALS=/gcloud/application_default_credentials.json \
  -e DB_DATABASE=/seed/database.sqlite \
  -e LITESTREAM_BUCKET="${PROJECT_ID}-emi-litestream" -e LITESTREAM_PATH=emi/database \
  --entrypoint litestream "$IMAGE" \
  replicate -config /etc/litestream.yml -exec "sleep 8"
```

Treat `./seed/` as sensitive (real emails and password hashes). It is excluded
from the image by `.dockerignore` and from Cloud Build uploads by `.gcloudignore`;
delete it afterwards.

## 6. Reminder trigger vs. Laravel's scheduler

`Schedule::command('send:emi-reminder')->dailyAt('10:00')` in
`routes/console.php` is left in place for local `php artisan schedule:work`. On
Cloud Run nothing runs `schedule:run`, so Cloud Scheduler is the only trigger —
do not also add a `schedule:run` loop or reminders will be sent twice.

## 7. Cost (monthly)

| Item | Cost |
|---|---|
| Cloud Run (`min=0`, `max=1`, request-based CPU) | $0 — inside the free tier |
| Cloud Scheduler (1 job) | $0 |
| Secret Manager (≤6 versions) | $0 |
| GCS replica (a few MB, 24 h retention) | ~$0.01–0.05 |
| GCS uploads | ~$0.01–0.10 |
| Artifact Registry | ~$0–0.05 |
| **Total** | **~$0.10–0.50** |

## 8. Restore drill (do this once, before relying on it)

1. Deploy, create a loan in the UI.
2. Wait ~15 s, then `gcloud run services update "$SERVICE" --region "$REGION" --update-env-vars FORCE_RESTART=$(date +%s)` (forces a new instance).
3. Reload — the loan must still be there. The log line `restoring database from gs://…` confirms the restore ran.
4. `gcloud storage ls -r gs://${PROJECT_ID}-emi-litestream/emi/database` should show `generations/…/snapshots` and `wal` objects.
5. Disaster recovery from scratch: with the service stopped, `litestream restore -config … -o ./recovered.sqlite` against the bucket gives you a plain SQLite file.

## 9. What was and wasn't verified

**Verified on 2026-10-09** (PHP 8.4 locally; Docker 29 / linux-amd64 for the image):

- Full PHPUnit suite on SQLite: 30/30, including the 5 `ReminderEndpointTest` cases.
- All 10 migrations on a real SQLite file; pragmas `journal_mode=wal`,
  `foreign_keys=1`, `busy_timeout=5000`, `synchronous=NORMAL`.
- `scripts/mysql-to-sqlite.php` against the local MySQL (2 users / 8 loans / 82 EMIs
  / 1 document): counts and money sums equal, integrity + FK checks clean.
- **The image builds**; inside it: Litestream v0.3.13 runs on Alpine, `su-exec`
  works, `pdo_sqlite` present, `nginx -t` and `php-fpm -t` pass (including the
  second pool), and no `.sql` / `.sqlite` / `.env` / `backups` / `scripts` files
  leaked into it.
- **Container with Litestream off:** boots, migrates as `www-data`, `/`, `/up`,
  `/login`, `/privacy` all 200; supervisord's `%(ENV_LITESTREAM_ENABLED)s`
  expansion works for `false` (Litestream not spawned).
- **Reminder endpoint:** no token 404, wrong token 404, GET 405, correct token 200;
  port 9001 pool listening. An 8-EMI sweep ran **80 s** and returned 200 (the web
  pool would have killed it at 75 s), sending all 8 reminders.
- **Litestream replication (file replica standing in for GCS):**
  1. first start: no replica → restore is a no-op → migrate → replication starts;
  2. SIGTERM (`docker stop -t 10`) takes 1.5 s, exit 0, shutdown order is nginx →
     php-fpm → **Litestream last**;
  3. the container is deleted, a new one restores from the replica: both users
     present, including one written immediately before the stop;
  4. SIGKILL right after a commit, then restore: the row survived;
  5. with 3 generations in the replica, restore picks the newest.
- The entrypoint refuses a non-absolute `DB_DATABASE` (this caught Git Bash
  rewriting `/var/lib/...` into a Windows path while testing).

**Still not verified:**

- The **GCS** replica type itself (auth through the Cloud Run service account,
  bucket IAM). The tests above used `type: file`; only the config block differs.
  The §8 restore drill covers it on first deploy.
- The §5 seeding command (`docker run … litestream replicate -exec`).
- All Cloud Run behaviour in §2 (rollout overlap, CPU throttling between requests,
  the real ~10 s SIGTERM window, GCS volume mount for uploads, Cloud Scheduler).
- A bug found by this test and fixed: two Dockerfile edits (`su-exec`, and the
  `/var/lib/emi-db` directory) had silently not applied, so the first image would
  have failed at the restore step.

Observed behaviour worth knowing: **every instance start creates a new Litestream
generation** (a fresh snapshot of a few KB). Restore correctly uses the newest;
retention (24 h) prunes the old ones, so the bucket stays at a few MB.

## 9b. Security fix found during deployment: retired default password

Every account created through Google sign-in (and the two migrated accounts) had the
constant password `razorpod.in`, which is public in the repo. On a public URL that is
a working login for anyone who knows the account's email.

- `GoogleAuthController` now gives new Google users `Str::random(64)`.
- `php artisan auth:invalidate-default-passwords` replaces any remaining default
  hash with a random one (idempotent, counts only in the log).
- The entrypoint runs it when `INVALIDATE_DEFAULT_PASSWORDS=true` (set for the
  revision-2 deploy; **unset it on the next deploy** — it is only needed once).
- Existing users sign in with Google (matched by email) or "Forgot password".
- Tests: `tests/Feature/DefaultPasswordTest.php`. Verified live: both accounts
  rejected `razorpod.in` after revision 2, and the replica snapshot postdates the cleanup.
- The service was made private (`allUsers` run.invoker removed) while this was fixed.

## 9c. Verified on the real deployment (2026-10-09)

- **Restore drill passed on Cloud Run with the real GCS replica:** a loan created in
  the UI was replicated (object written 3 s after the POST); a new revision then
  started a fresh instance with an empty disk, which restored snapshot + WAL 0–11
  from the newest generation, and the loan was present after reload. This closes the
  "GCS replica type untested" gap in §9.
- **Practical lesson — flush before you restart.** CPU is throttled between requests,
  so Litestream can lag a write. Before any deploy/restart, make a few harmless
  requests (e.g. page views of `/login`, which write a session row) and confirm a
  fresh object appears in the replica bucket. Otherwise a new instance can restore
  from a replica that is missing the latest change.
- Seeded data (2 users / 8 loans / 82 EMIs / 1 PDF) restored on first start
  ("Nothing to migrate" = existing migrations table came along).
- Note the data is split by user: `…7@gmail.com` owns 1 loan and `…1996@gmail.com`
  owns 7. The app only shows a user their own loans.

## 9d. Custom domain and later production configuration (2026-10-09/10)

### Custom domain `akktechnology.org` (Cloud Run domain mapping)

Domain mapping is a **beta** feature with more latency than a load balancer; it is
fine for this app. Steps that worked:

1. Create the mapping in the Cloud Run console for service `emimanagement`
   (`asia-southeast1`) and verify domain ownership. Google adds a
   `google-site-verification=…` TXT record at the root — **keep it**; the mapping
   depends on it.
2. For a **root** domain Cloud Run lists A and AAAA records (not a CNAME): four of
   each, Google's front-end addresses `216.239.32/34/36/38.21` and
   `2001:4860:4802:32/34/36/38::15`. Add all of them in Cloudflare with
   **Name `@`** and proxy status **DNS only** (grey cloud) — the orange proxy blocks
   certificate issuance. Delete any old A/AAAA at the same name first. For a
   subdomain the Name is just the label (e.g. `emi`) and the record is a CNAME.
3. Wait for the certificate ("Waiting for DNS" → "Certificate provisioning" → done).
   Verified by querying Cloudflare's authoritative nameservers and then
   `https://akktechnology.org/login` (TLS handshake failed until issued; HTTP
   returned a Google 404 from `ghs` in the meantime).
4. Set the app URLs to the domain — **flush replication first** (see §9c), then one
   new revision:

   ```bash
   gcloud run services update emimanagement --region=asia-southeast1 \
     --update-env-vars=APP_URL=https://akktechnology.org,GOOGLE_REDIRECT_URL=https://akktechnology.org/auth/google/callback \
     --account=karnwalakshay7@gmail.com --project=karnwalak-511113
   ```

5. Add `https://akktechnology.org/auth/google/callback` to the Google OAuth client's
   authorized redirect URIs (keep the `…run.app` one). Optionally add the hostname
   in Cloudflare Turnstile (login works without it: nothing validates the widget).

Notes: the old `…run.app` URL still serves the app but its Google sign-in now
redirects to the domain; sessions are host-bound, so users sign in again. Rollback =
set the two env vars back to the `run.app` URL and delete the mapping.

### Other changes made after the first deploy (live in Cloud Run, not in git)

- **Mail:** the original Mailgun SMTP credential (`emimanagement@akktechnology.org`)
  was rejected with `535`, and the domain was not in the Mailgun account, so mail
  now goes through **Gmail SMTP** (`smtp.gmail.com:587`, `tls`, sender
  `karnwalakshay7@gmail.com`) using an app password stored as version 2 of
  `emi-mail-password` (version 1 disabled). Gmail limits: ~500 recipients/day, the
  From address is always the account, and changing the Google password revokes the
  app password. Verified with a real "Forgot password" email.
- **Payments:** `RAZORPAY_KEY_ID` (a `rzp_test_…` test key) is set; the matching test
  secret is `emi-razorpay-secret`. A test-mode checkout was run on the live domain and
  works. Moving to live payments means replacing both the key id (env var) and the
  secret (new version of `emi-razorpay-secret`) with the live pair, together.
- **Secrets:** six `emi-*` secrets, one active version each (Secret Manager's free
  limit); the unused `emi-mailersend-key` was deleted.
- **Budget alert:** a monthly budget of **₹450 (~$5)** scoped to this project only, with
  alerts at 50 % / 90 % / 100 % of actual spend and 100 % of forecasted spend. The
  billing account (`Akk-Tech`) bills in INR, so the dollar figure is approximate. It is
  an email warning, not a cutoff: nothing stops if the limit is passed. Recipients are
  the billing account's default admins/users. It needed
  `billingbudgets.googleapis.com` enabled on the project (free). Manage it under
  Billing → Budgets & alerts, or `gcloud billing budgets list --billing-account=<id>`.
- **Reminders:** Cloud Scheduler job `emi-reminder` (`0 10 * * *`, Asia/Kolkata, no
  retries) is enabled. The first automatic run (2026-10-10 04:30 UTC) returned 200 in
  0.6 s; no EMIs were pending, so no email was sent.
- **Revision history:** 00001 first deploy → 00002 default-password cleanup →
  00003 restore drill → 00004 nginx/upload fix → 00005 delete-files fix → 00006 Gmail
  → 00007 Razorpay key id → 00008 custom domain URLs.
- **Bugs found only on the real deployment and fixed:** uploads saved as path `0`
  (gcsfuse rejects chmod), first request after idle returned 502 (nginx ready
  before php-fpm), and document files were never deleted with their rows.

## 10. Files changed

| File | Change |
|---|---|
| `Dockerfile` | Litestream binary, `su-exec`, `/var/lib/emi-db` |
| `docker/entrypoint.sh` | restore → migrate (as `www-data`) → hand off; fail-fast checks |
| `docker/supervisord.conf` | `litestream` program, starts first / stops last |
| `docker/litestream.yml` | new — replica config |
| `docker/php-fpm.conf` | `[reminders]` pool on :9001 |
| `docker/nginx.conf` | exact-match `/internal/send-emi-reminders` → :9001 |
| `app/Http/Controllers/Internal/ReminderController.php` | new — token-protected trigger |
| `routes/web.php`, `bootstrap/app.php` | route + CSRF exemption for it |
| `config/services.php` | `reminder.token` |
| `config/database.php` | SQLite WAL / busy_timeout / synchronous defaults |
| `.dockerignore`, `.gcloudignore` | keep `backups/`, `*.sql`, `*.sqlite*`, `scripts/` out of the image and uploads |
| `.env.example` | new vars documented |
| `scripts/mysql-to-sqlite.php` | new — one-time data import |
| `tests/Feature/ReminderEndpointTest.php` | new |
