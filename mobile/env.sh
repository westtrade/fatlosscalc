#!/usr/bin/env bash
# Общие настройки тулчейна для build.sh и sign.sh.
# Тулчейн лежит вне репозитория. Путь задаётся ANDROID_TOOLCHAIN,
# по умолчанию ~/android-build.
#
# Требуется JDK 21: Capacitor 8 компилирует с source/target 21, на 17
# сборка падает с «invalid source release: 21».
set -euo pipefail

TC="${ANDROID_TOOLCHAIN:-$HOME/android-build}"

export ANDROID_HOME="$TC/sdk"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export GRADLE_USER_HOME="$TC/gradle"
export TMPDIR="$TC/tmp"
mkdir -p "$GRADLE_USER_HOME" "$TMPDIR"
export PATH="$ANDROID_HOME/platform-tools:$PATH"

# JDK 21 ищем в тулчейне, иначе берём системный и проверяем версию.
JDK21="$(find "$TC/jdk" -maxdepth 2 -name "java" -type f -path "*/bin/java" 2>/dev/null | head -1)"
if [ -n "$JDK21" ]; then
  export JAVA_HOME="$(dirname "$(dirname "$JDK21")")"
else
  export JAVA_HOME="${JAVA_HOME:-/usr/lib/jvm/java-21-openjdk-amd64}"
fi

if ! "$JAVA_HOME/bin/java" -version 2>&1 | grep -q '"21'; then
  echo "Нужен JDK 21, а выставлен $JAVA_HOME" >&2
  echo "Положите JDK 21 в $TC/jdk или задайте ANDROID_TOOLCHAIN." >&2
  exit 1
fi

export BT="$ANDROID_HOME/build-tools/36.0.0"
