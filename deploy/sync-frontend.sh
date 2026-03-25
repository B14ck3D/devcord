#!/bin/sh
set -e
cd "$(dirname "$0")/../front"
npm run build
# nginx (www-data) musi przejść ścieżką do dist i czytać pliki
chmod o+x /root /root/disc /root/disc/front 2>/dev/null || true
chmod -R a+rX dist
echo "OK: nginx serwuje z /root/disc/front/dist"
