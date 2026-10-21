#!/usr/bin/env bash
# Копирует статику приложения в www/ — Capacitor пакует только этот каталог.
set -euo pipefail
cd "$(dirname "$0")"
rm -rf www
mkdir -p www
cp -r ../index.html ../timer.html ../assets www/
echo "www: $(du -sh www | cut -f1)"
