#!/usr/bin/env bash
# Сборка debug APK (без v1-подписи — для быстрой проверки, не для установки).
set -euo pipefail
cd "$(dirname "$0")"
source ./env.sh

./copy-web.sh
npx cap sync android
(cd android && ./gradlew --no-daemon assembleDebug)
cp android/app/build/outputs/apk/debug/app-debug.apk ./fatlosscalc-debug.apk
echo "APK: $(pwd)/fatlosscalc-debug.apk ($(du -h fatlosscalc-debug.apk | cut -f1))"
