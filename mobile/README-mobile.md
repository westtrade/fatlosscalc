# APK-сборка FATLOSS·CALC

Приложение — статическая страница, поэтому в APK оно пакуется как есть:
Capacitor кладёт `www/` в `android/app/src/main/assets/public` и открывает
в WebView с `https://localhost` (secure context — clipboard и wakeLock работают).

## Сборка

```bash
./sign.sh          # → fatlosscalc.apk (подписан, ставится на телефон)
./build.sh         # → debug APK, без v1-подписи
```

`build.sh` требует: JDK 21, Android SDK (platform 36, build-tools 36.0.0),
Gradle 8.14.3. Пути к ним — в переменных в начале скрипта.

## Что меняется в приложении

- `../index.html`, `../timer.html`, `../assets/` — источник, копируется в `www/`
  скриптом `copy-web.sh`. Правки делаются в исходниках, не в `www/`.
- `../assets/common.style.css` — `padding-top: env(safe-area-inset-top)` для
  edge-to-edge WebView.
- `android/app/src/main/AndroidManifest.xml` — разрешение `VIBRATE`.
- `assets/icon.svg` → `icon.png` → `android/app/src/main/res/mipmap-*`.

## Установка на телефон

```bash
adb install -r fatlosscalc.apk
```

Или перекинуть файл на устройство и открыть (нужно разрешить установку из
неизвестных источников). `minSdk 24` — Android 7.0 и новее.

## Подпись

`./sign.sh` → `fatlosscalc.apk`: release-сборка, досоглашенная ключом
`keystore/fatlosscalc.jks` вручную.

Почему не хватает `assembleRelease`: AGP при `minSdk 24` не кладёт **v1**
(JAR) подпись, а `enableV1Signing true` в `build.gradle` игнорируется.
Часть прошивок (старые и некоторые китайские) без v1 APK не ставит —
«Приложение не установлено». `sign.sh` вызывает `apksigner` с
`--min-sdk-version 21`, и v1 появляется: `Verified using v1 scheme: true`.

Сертификат выпущен с `-startdate 2020/01/01`, а не текущей датой: если часы
на телефоне отстают, APK, подписанный «из будущего», не устанавливается.

`keystore/` и `*.apk` в `.gitignore` — ключ не должен попасть в репозиторий.
Потеряешь ключ — обновить установленное приложение будет нельзя.
