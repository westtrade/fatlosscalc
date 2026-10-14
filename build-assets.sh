#!/usr/bin/env bash
# Пересборка локальных ассетов (Tailwind CSS + шрифты + Alpine).
#
# Запуск:  ./build-assets.sh
# Требуется: node/npm и доступ в интернет (только для скачивания исходников).
# Результат кладётся в assets/ и коммитится в репозиторий — сама страница
# работает офлайн и никаких сборок во время просмотра не требует.

set -euo pipefail
cd "$(dirname "$0")"

TAILWIND_VERSION="3.4.17"   # совпадает с версией Play CDN, которая использовалась раньше
ALPINE_VERSION="3.17.4"
FONTSOURCE_VERSION="5.3.0"

# версия скрипта-плагина collapse держится в одном ряду с ядром Alpine
COLLAPSE_VERSION="$ALPINE_VERSION"

# node_modules кэшируется между запусками: первая сборка качает Tailwind
# (~1 мин), последующие проходят за секунды. Каталог в .gitignore.
BUILD_DIR=".build-tw"
CACHE_DIR=".tw-cache"

echo "==> 1/4  Tailwind ${TAILWIND_VERSION}"
mkdir -p "$BUILD_DIR" "$CACHE_DIR"
export npm_config_cache="$PWD/$CACHE_DIR/.npmcache"
mkdir -p "$npm_config_cache"

INSTALLED=""
if [ -f "$CACHE_DIR/node_modules/tailwindcss/package.json" ]; then
  INSTALLED=$(node -p "require('$PWD/$CACHE_DIR/node_modules/tailwindcss/package.json').version" 2>/dev/null || echo "")
fi

if [ "$INSTALLED" = "$TAILWIND_VERSION" ]; then
  echo "    уже установлен (${INSTALLED}), пропускаем npm install"
else
  echo "    установка tailwindcss@${TAILWIND_VERSION} (было: ${INSTALLED:-нет})"
  cat > "$CACHE_DIR/package.json" <<'JSON'
{ "name": "fatlosscalc-tw-build", "private": true, "version": "1.0.0" }
JSON
  (
    cd "$CACHE_DIR"
    npm install --no-audit --no-fund "tailwindcss@${TAILWIND_VERSION}" >/dev/null
  )
fi

echo "==> 2/4  Сборка CSS из index.html"
# content задаётся абсолютным путём: Tailwind резолвит его относительно cwd,
# а не относительно файла конфига (проверено — относительный путь даёт пустой CSS).
cat > "$BUILD_DIR/tailwind.config.js" <<JS
// Зеркало прежнего inline tailwind.config из index.html.
// При изменении цветов/шрифтов в разметке правьте и здесь.
module.exports = {
  content: ["$PWD/index.html"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Manrope", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        ink: "#070B09",
        panel: "#0D1512",
        panel2: "#111B17",
        line: "#1E2C26",
        acid: "#C6FF3D",
        mint: "#3DF5B0",
        ember: "#FF8A3D",
        sky: "#59C7FF",
        rose: "#FF6B8B",
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(198,255,61,.18), 0 20px 60px -20px rgba(198,255,61,.35)",
        card: "0 24px 60px -30px rgba(0,0,0,.9)",
      },
    },
  },
  plugins: [],
};
JS

printf '@tailwind base;\n@tailwind components;\n@tailwind utilities;\n' > "$BUILD_DIR/input.css"

mkdir -p assets/css
(
  cd "$CACHE_DIR"
  ./node_modules/.bin/tailwindcss \
    -c "$OLDPWD/$BUILD_DIR/tailwind.config.js" \
    -i "$OLDPWD/$BUILD_DIR/input.css" \
    -o "$OLDPWD/assets/css/tailwind.css" \
    --minify
)

echo "==> 3/4  Скачивание шрифтов Manrope ${FONTSOURCE_VERSION}"
mkdir -p assets/fonts
FONT_BASE="https://cdn.jsdelivr.net/npm/@fontsource/manrope@${FONTSOURCE_VERSION}/files"
for weight in 400 600 700 800; do
  for subset in cyrillic cyrillic-ext latin latin-ext; do
    file="manrope-${subset}-${weight}-normal.woff2"
    curl -sfL --retry 3 --max-time 60 "$FONT_BASE/$file" -o "assets/fonts/$file"
  done
done
echo "    скачано файлов: $(ls assets/fonts | wc -l)"

echo "==> 4/4  Скачивание Alpine.js ${ALPINE_VERSION} + collapse"
mkdir -p assets/vendor
curl -sfL --retry 3 --max-time 60 \
  "https://cdn.jsdelivr.net/npm/alpinejs@${ALPINE_VERSION}/dist/cdn.min.js" \
  -o assets/vendor/alpine.min.js
curl -sfL --retry 3 --max-time 60 \
  "https://cdn.jsdelivr.net/npm/@alpinejs/collapse@${COLLAPSE_VERSION}/dist/cdn.min.js" \
  -o assets/vendor/alpine-collapse.min.js

rm -rf "$BUILD_DIR"   # кэш node_modules (.tw-cache) остаётся для быстрых пересборок

echo
echo "Готово. Локальные ассеты:"
du -sh assets/css assets/fonts assets/vendor 2>/dev/null || true
echo
echo "Проверьте страницу: index.html должен открываться без интернета."
