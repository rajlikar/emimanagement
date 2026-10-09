# =============================================================================
# EMIManagement — production image for Google Cloud Run
#
# Three stages so the final image carries no build tooling:
#   1. frontend  — Node + Vite compile resources/js into public/build
#   2. vendor    — Composer resolves PHP dependencies on the *same* PHP version
#                  that runs in production, so the platform check is honest
#   3. runtime   — php-fpm + nginx, supervised, listening on $PORT
#
# Cloud Run contract this image satisfies:
#   * listens on the port given in $PORT (not a hardcoded 80)
#   * listens on 0.0.0.0, not localhost
#   * container exits non-zero if either nginx or php-fpm dies
#   * writes all logs to stdout/stderr (Cloud Logging captures these)
#   * filesystem is treated as ephemeral; the SQLite database lives on local
#     disk and is continuously replicated to GCS by Litestream (see
#     docs/cloud-run-sqlite-litestream.md); uploads live on a GCS volume mount
# =============================================================================


# -----------------------------------------------------------------------------
# Stage 1: frontend assets
# -----------------------------------------------------------------------------
FROM node:20-alpine AS frontend

WORKDIR /app

# Vite substitutes import.meta.env.VITE_* at BUILD time and bakes the literal
# value into the JS bundle. These therefore CANNOT be supplied later as Cloud Run
# environment variables — they must be build args.
#   VITE_APP_NAME           -> resources/js/app.jsx (page <title> suffix)
#   VITE_TURNSTILE_SITE_KEY -> resources/js/Pages/Auth/Login.jsx (widget sitekey)
# A Turnstile *site* key is public by design. The *secret* key is a runtime env
# var and must never be passed as a build arg (it would be readable in the image).
ARG VITE_APP_NAME="EMI Management"
ARG VITE_TURNSTILE_SITE_KEY=""
ENV VITE_APP_NAME=$VITE_APP_NAME \
    VITE_TURNSTILE_SITE_KEY=$VITE_TURNSTILE_SITE_KEY

# package*.json first: this layer is cached until dependencies actually change,
# so ordinary source edits do not trigger a full npm reinstall.
COPY package.json package-lock.json ./
RUN npm ci

COPY resources ./resources
COPY vite.config.js postcss.config.js tailwind.config.js jsconfig.json ./
RUN npm run build


# -----------------------------------------------------------------------------
# Stage 2: PHP dependencies
# -----------------------------------------------------------------------------
# Built on php:8.2-cli-alpine rather than the rolling `composer:2` image on
# purpose. The composer image tracks the newest PHP, and several locked packages
# cap the PHP version they accept; resolving against a newer PHP than production
# either fails outright or silently picks different code paths. Resolving on 8.2
# — the same minor that stage 3 runs — keeps the lock file honest.
FROM php:8.2-cli-alpine AS vendor

COPY --from=composer:2.7 /usr/bin/composer /usr/bin/composer
RUN apk add --no-cache git unzip libzip-dev icu-dev \
    && docker-php-ext-install -j"$(nproc)" zip intl bcmath pdo_mysql

WORKDIR /app
COPY composer.json composer.lock ./

# --no-scripts: the artisan file is deliberately not in this stage, and Laravel's
#   post-autoload-dump hook would try to run it. package:discover is run instead
#   in stage 3, where the full application tree exists.
# --no-dev: PHPUnit, Faker, Breeze, Pint and Sail have no business in production.
RUN composer install \
        --no-dev \
        --no-interaction \
        --no-progress \
        --prefer-dist \
        --no-scripts \
        --optimize-autoloader


# -----------------------------------------------------------------------------
# Stage 3: runtime
# -----------------------------------------------------------------------------
FROM php:8.2-fpm-alpine AS runtime

# Runtime libraries (icu-libs, libzip, libpng...) must be installed as permanent
# packages. The *-dev headers are only needed while compiling the extensions, so
# they go in a virtual package that is dropped in the same layer — this keeps the
# image small without the classic failure where apk removes a shared library that
# a compiled .so still links against.
RUN apk add --no-cache \
        nginx \
        supervisor \
        su-exec \
        bash \
        curl \
        icu-libs \
        libzip \
        libpng \
        libjpeg-turbo \
        freetype \
    && apk add --no-cache --virtual .build-deps \
        $PHPIZE_DEPS \
        icu-dev \
        libzip-dev \
        libpng-dev \
        libjpeg-turbo-dev \
        freetype-dev \
    && docker-php-ext-configure gd --with-freetype --with-jpeg \
    && docker-php-ext-install -j"$(nproc)" \
        pdo_mysql \
        bcmath \
        intl \
        zip \
        gd \
        exif \
        opcache \
    && apk del --no-network .build-deps \
    && rm -rf /var/cache/apk/*

WORKDIR /var/www/html

# Application source. .dockerignore keeps .env, node_modules, vendor, public/build
# and the emimanagement.sql dump out of this COPY — see that file for why.
COPY . /var/www/html

# Dependencies and compiled assets from the earlier stages.
COPY --from=vendor   /app/vendor        /var/www/html/vendor
COPY --from=frontend /app/public/build  /var/www/html/public/build

# Service configuration.
COPY docker/nginx.conf       /etc/nginx/http.d/default.conf
COPY docker/php.ini          /usr/local/etc/php/conf.d/zz-app.ini
COPY docker/php-fpm.conf     /usr/local/etc/php-fpm.d/zz-app.conf
COPY docker/supervisord.conf /etc/supervisor/conf.d/supervisord.conf
COPY docker/entrypoint.sh    /usr/local/bin/docker-entrypoint
COPY docker/start-nginx.sh    /usr/local/bin/start-nginx
COPY docker/litestream.yml   /etc/litestream.yml

# Litestream: continuous SQLite replication to GCS. Copied from the official
# image rather than downloaded from the GitHub release because the release
# tarballs are glibc-linked and will not run on Alpine (musl); this one is built
# static. Pinned to 0.3.13 — 0.5.x changed the on-disk replica format, so a bump
# is a migration, not a routine update.
COPY --from=litestream/litestream:0.3.13 /usr/local/bin/litestream /usr/local/bin/litestream

RUN chmod +x /usr/local/bin/docker-entrypoint /usr/local/bin/start-nginx

# The application generates document URLs of the form /storage/<path>, which
# nginx serves from public/storage. Laravel writes those files to
# storage/app/public. `artisan storage:link` cannot run here because it needs a
# booted app, so the symlink is created directly.
#
# storage/app/public is ALSO the mount point for the GCS bucket on Cloud Run:
#   --add-volume=name=uploads,type=cloud-storage,bucket=<BUCKET>
#   --add-volume-mount=volume=uploads,mount-path=/var/www/html/storage/app/public
# The symlink resolves into the bucket, so uploaded documents survive the
# instance being recycled. Without the bucket they live only in the container's
# writable layer and disappear on the next cold start.
RUN mkdir -p storage/app/public \
             storage/framework/cache/data \
             storage/framework/sessions \
             storage/framework/views \
             storage/logs \
             bootstrap/cache \
             /var/lib/emi-db \
    && ln -sfn /var/www/html/storage/app/public /var/www/html/public/storage

# Build the package manifest now instead of on every cold start. This is the
# `post-autoload-dump` step skipped in stage 2; it needs artisan + vendor, both
# of which exist at this point.
RUN php artisan package:discover --ansi

# php-fpm workers run as www-data. Only the paths Laravel actually writes to are
# made group-writable; the rest of the tree stays read-only to the web user,
# which limits what a code-execution bug can overwrite.
#
# /var/lib/emi-db holds the live SQLite file. SQLite needs the DIRECTORY to be
# writable, not just the file, because it creates the -wal and -shm side files
# next to it. Both php-fpm and Litestream run as www-data and must share it.
RUN chown -R www-data:www-data storage bootstrap/cache /var/lib/emi-db \
    && chmod -R 775 storage bootstrap/cache

# Documentation only — Cloud Run routes to whatever $PORT says.
EXPOSE 8080

# Fails fast and loudly if the container is misconfigured, then hands off to
# supervisord. See docker/entrypoint.sh.
ENTRYPOINT ["docker-entrypoint"]
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
