#!/bin/sh
set -e
cd "$(dirname "$0")/../front"
npm run build
cp -a dist/. /var/www/flux.ndevelopment.org/
chown -R www-data:www-data /var/www/flux.ndevelopment.org
echo "OK: /var/www/flux.ndevelopment.org zaktualizowany"
