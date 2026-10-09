<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware) {
        // REQUIRED on Cloud Run (and behind any TLS-terminating proxy).
        //
        // Google's front end terminates HTTPS and forwards the request to the
        // container over plain HTTP, passing the original scheme, host and client
        // IP in X-Forwarded-* headers. Without trusting those headers Laravel
        // believes every request arrived over http://, which means:
        //   - url()/route() generate http:// links, so the browser blocks them
        //     as mixed content and asset URLs break
        //   - signed URLs (email verification, password reset) are generated for
        //     one scheme and validated against another, so they always fail
        //   - a secure-only session cookie is never sent back
        //   - $request->ip() returns the proxy address, not the real client
        //
        // Trusting '*' is correct here: a Cloud Run container is only reachable
        // through Google's front end, so a client has no path by which to forge
        // these headers. Narrow the list if the app is ever fronted differently.
        $middleware->trustProxies(
            at: '*',
            headers: Request::HEADER_X_FORWARDED_FOR
                | Request::HEADER_X_FORWARDED_HOST
                | Request::HEADER_X_FORWARDED_PORT
                | Request::HEADER_X_FORWARDED_PROTO
        );

        // Server-to-server call from Cloud Scheduler: there is no browser session
        // and so no CSRF token. The route authenticates with REMINDER_TOKEN instead.
        $middleware->validateCsrfTokens(except: [
            'internal/send-emi-reminders',
        ]);

        $middleware->web(append: [
            \App\Http\Middleware\HandleInertiaRequests::class,
            \Illuminate\Http\Middleware\AddLinkHeadersForPreloadedAssets::class,
        ]);

        //
    })
    ->withExceptions(function (Exceptions $exceptions) {
        //
    })->create();
