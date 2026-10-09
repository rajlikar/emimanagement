#!/bin/bash
# Starts nginx only once php-fpm is accepting connections.
#
# Cloud Run treats the instance as ready as soon as something listens on $PORT,
# and holds the request that triggered the cold start until then. nginx binds its
# port almost immediately, php-fpm about a second later, so the very first request
# after an idle period was forwarded to an upstream that was not up yet and came
# back as a 502 ("connect() failed (111: Connection refused) ... 127.0.0.1:9000").
# Delaying nginx's bind until php-fpm is ready closes that window.
#
# No upper bound on purpose: if php-fpm never comes up, supervisord's
# die-on-child-exit listener ends the container, and the startup probe fails the
# revision, which is the correct outcome.
until (echo > /dev/tcp/127.0.0.1/9000) 2>/dev/null; do
    sleep 0.1
done
exec nginx -g "daemon off;"
