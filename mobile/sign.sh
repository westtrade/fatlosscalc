#!/usr/bin/env bash
# Пересборка подписанного APK: release-сборка + досоглашение v1-подписью.
# AGP при minSdk 24 не кладёт v1 (флаг enableV1Signing игнорируется), а часть
# прошивок без неё APK не ставит — «Приложение не установлено».
set -euo pipefail
cd "$(dirname "$0")"
source ./env.sh

./copy-web.sh
npx cap sync android
(cd android && ./gradlew --no-daemon assembleRelease)

# --min-sdk-version 21 заставляет apksigner положить v1: при 24+ он считает её лишней.
"$BT/apksigner" sign \
  --ks keystore/fatlosscalc.jks --ks-pass pass:fatlosscalc \
  --ks-key-alias fatlosscalc --key-pass pass:fatlosscalc \
  --min-sdk-version 21 \
  --v1-signing-enabled true --v2-signing-enabled true --v3-signing-enabled true \
  --out fatlosscalc.apk \
  android/app/build/outputs/apk/release/app-release.apk

"$BT/apksigner" verify -v fatlosscalc.apk | head -4
echo "APK: $(pwd)/fatlosscalc.apk ($(du -h fatlosscalc.apk | cut -f1))"
