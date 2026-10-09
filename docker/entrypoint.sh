#!/bin/sh
#
# Container entrypoint. Runs once per instance start, before any request is
# served, then hands PID 1 to the CMD (supervisord).
#
# Everything here is either (a) required to satisfy the Cloud Run contract, or
# (b) a fail-fast check that turns a silent misconfiguration into one obvious
# line in the log instead of a 500 on every page.

set -eu

log() { echo "[entrypoint] $*"; }
fatal() { echo "[entrypoint] FATAL: $*" >&2; exit 1; }

# -----------------------------------------------------------------------------
# 1. Listen on the port Cloud Run asked for
# -----------------------------------------------------------------------------
# Cloud Run picks the port and passes it in $PORT. A container that listens
# anywhere else fails the startup probe and the revision never goes live.
PORT="${PORT:-8080}"
sed -i "s/listen 8080 default_server;/listen ${PORT} default_server;/; \
        s/listen \[::\]:8080 default_server;/listen [::]:${PORT} default_server;/" \
    /etc/nginx/http.d/default.conf
log "nginx will listen on port ${PORT}"

# -----------------------------------------------------------------------------
# 2. Fail fast on configuration that cannot possibly work
# -----------------------------------------------------------------------------
# No APP_KEY means no session cookies, no encrypted values and no signed URLs.
# Laravel would boot and then throw on the first request; better to never start.
[ -n "${APP_KEY:-}" ] || fatal "APP_KEY is unset. Generate one with 'php artisan key:generate --show' and set it as an environment variable or Secret Manager secret."

case "${APP_KEY}" in
    base64:*|*[!\ ]*) : ;;
    *) fatal "APP_KEY looks empty or malformed." ;;
esac

# -----------------------------------------------------------------------------
# 2b. Database: SQLite on local disk, replicated to GCS by Litestream
# -----------------------------------------------------------------------------
# Cloud Run instances have no persistent disk, so a bare SQLite file would be
# discarded every time an instance is recycled (constantly, at min-instances=0).
# Litestream makes it durable: it restores the latest replica here at start and
# streams every change back to GCS while running. See
# docs/cloud-run-sqlite-litestream.md for the model and its limits.
#
# LITESTREAM_ENABLED is read by supervisord.conf (%(ENV_LITESTREAM_ENABLED)s), so
# it MUST be exported in every branch, including the one that disables it.
LITESTREAM_ENABLED=false
export LITESTREAM_ENABLED

case "${DB_CONNECTION:-sqlite}" in
    sqlite)
        case "${DB_DATABASE:-}" in
            /*) : ;;
            *) fatal "DB_CONNECTION=sqlite requires DB_DATABASE to be an absolute path (e.g. /var/lib/emi-db/database.sqlite); got '${DB_DATABASE:-unset}'." ;;
        esac

        DB_DIR="$(dirname "${DB_DATABASE}")"
        mkdir -p "${DB_DIR}"
        chown www-data:www-data "${DB_DIR}"

        if [ -n "${LITESTREAM_BUCKET:-}" ]; then
            LITESTREAM_PATH="${LITESTREAM_PATH:-emi/database}"
            export LITESTREAM_PATH

            # -if-db-not-exists: never overwrite a database that is already here.
            # -if-replica-exists: a brand-new bucket has nothing to restore, which
            #   is the normal first-deploy case and must not be an error.
            # Any OTHER failure (permissions, network) is fatal on purpose, via
            # `set -e`: carrying on would let the migration below create an empty
            # database and Litestream start replicating THAT over the real history.
            # Runs as www-data so the files it creates are writable by php-fpm.
            log "restoring database from gs://${LITESTREAM_BUCKET}/${LITESTREAM_PATH} (if a replica exists)"
            su-exec www-data litestream restore                 -config /etc/litestream.yml                 -if-db-not-exists -if-replica-exists                 "${DB_DATABASE}"

            LITESTREAM_ENABLED=true
        elif [ "${APP_ENV:-}" = "production" ]; then
            fatal "APP_ENV=production with SQLite but LITESTREAM_BUCKET is unset: the database would be lost on every instance restart."
        else
            log "WARNING: LITESTREAM_BUCKET unset; SQLite at ${DB_DATABASE} is NOT replicated and"
            log "WARNING: will be lost when this container stops. Fine for local testing only."
        fi
        ;;
    *)
        log "DB_CONNECTION=${DB_CONNECTION}: using an external database; Litestream is not used."
        ;;
esac

# APP_DEBUG=true renders full stack traces — including environment variables and
# database credentials — to anyone who triggers an error.
case "${APP_DEBUG:-}" in
    true|1|on|On|TRUE)
        log "WARNING: APP_DEBUG is enabled. Stack traces with credentials will be"
        log "WARNING: shown to end users. Set APP_DEBUG=false for production."
        ;;
esac

# -----------------------------------------------------------------------------
# 3. Writable paths
# -----------------------------------------------------------------------------
# storage/app/public may be a freshly mounted (and therefore empty) GCS bucket,
# so the subdirectories are recreated on every start rather than only at build.
mkdir -p storage/framework/cache/data \
         storage/framework/sessions \
         storage/framework/views \
         storage/logs \
         storage/app/public \
         bootstrap/cache \
         /tmp/opcache

# Only chown what must be writable. Doing this to the whole tree on every start
# is slow and would also try to rewrite every object in the mounted bucket.
chown -R www-data:www-data storage/framework storage/logs bootstrap/cache 2>/dev/null || true
chmod -R 775 storage/framework storage/logs bootstrap/cache 2>/dev/null || true

# -----------------------------------------------------------------------------
# 4. Warm Laravel's caches
# -----------------------------------------------------------------------------
# These are built HERE, at container start, and deliberately not at image build
# time: config:cache freezes the values of env() at the moment it runs, and at
# build time none of the Cloud Run environment variables exist yet. Baking the
# cache into the image would ship a config that points at nothing.
#
# Caching config does NOT break the runtime env() calls in PaymentController.
# config:cache only stops Laravel from reading a .env *file*; variables injected
# into the process environment by Cloud Run remain visible to env() through
# php-fpm (which is why clear_env=no in php-fpm.conf is mandatory).
rm -f bootstrap/cache/config.php bootstrap/cache/routes-v7.php bootstrap/cache/events.php

php artisan config:cache
php artisan view:cache

# routes/web.php defines several routes as closures. Laravel 11+ ships
# laravel/serializable-closure and can cache these (older guidance that closure
# routes are uncacheable no longer applies), but it is not worth failing a
# deploy over a performance optimisation, so a failure here is non-fatal.
php artisan route:cache || log "WARNING: route:cache failed; continuing with runtime route resolution."

# -----------------------------------------------------------------------------
# 5. Migrations
# -----------------------------------------------------------------------------
# With SQLite there is exactly one instance holding the database (max-instances=1),
# so the concurrent-migrator race that makes migrate-on-boot unsafe against a
# shared MySQL cannot occur, and a separate Cloud Run Job could not reach the
# file anyway: it lives on this instance's local disk.
#
# Default: ON for SQLite, OFF for anything else (keep using a one-off Job there).
# RUN_MIGRATIONS=true|false overrides either way.
#
# Runs as www-data so the database and its -wal/-shm files are owned by the same
# user php-fpm and Litestream run as. A root-owned file here would make every
# later write fail with "attempt to write a readonly database". A failed
# migration is not swallowed: set -e aborts the start, producing one clear
# startup failure rather than "no such table" on random requests.
if [ -z "${RUN_MIGRATIONS:-}" ]; then
    if [ "${DB_CONNECTION:-sqlite}" = "sqlite" ]; then RUN_MIGRATIONS=true; else RUN_MIGRATIONS=false; fi
fi
if [ "${RUN_MIGRATIONS}" = "true" ]; then
    log "applying database migrations"
    su-exec www-data php artisan migrate --force
fi

# -----------------------------------------------------------------------------
# 5b. One-off security cleanup (opt-in)
# -----------------------------------------------------------------------------
# Accounts created before the fix carry the retired hardcoded password
# 'razorpod.in' (public in the repo). INVALIDATE_DEFAULT_PASSWORDS=true replaces
# any such password with a random one. Idempotent, and it only touches users that
# still match, so leaving it on costs one bcrypt check per user at cold start;
# set it for one deploy and unset it afterwards. Runs after the migrations so the
# users table is guaranteed to exist, and as www-data like everything else that
# writes the database.
if [ "${INVALIDATE_DEFAULT_PASSWORDS:-false}" = "true" ]; then
    log "invalidating accounts that still use the retired default password"
    su-exec www-data php artisan auth:invalidate-default-passwords
fi

log "startup complete; handing off to $*"
exec "$@"
