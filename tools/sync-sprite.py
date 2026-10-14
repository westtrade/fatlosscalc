#!/usr/bin/env python3
"""Синхронизация спрайта иконок: assets/icons.svg -> index.html.

Почему спрайт встраивается в документ, а не подключается ссылкой:
на протоколе file:// внешняя ссылка <use href="assets/icons.svg#i-check">
блокируется CORS (как и fetch/XHR к локальному файлу), а страница должна
открываться двойным щелчком с диска. Символы в том же документе работают
всегда.

Запуск (из корня проекта):  python3 tools/sync-sprite.py
Вызывается автоматически из build-assets.sh.

Регион в index.html ограничен маркерами ICON SPRITE, поэтому ручные правки
рядом с ним сохраняются.
"""
import pathlib, re, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
ICONS = ROOT / "assets/icons.svg"
INDEX = ROOT / "index.html"
START = "<!-- ===== ICON SPRITE"
END = "<!-- ===== /ICON SPRITE ===== -->"

def main() -> int:
    if not ICONS.exists():
        print(f"нет файла {ICONS}", file=sys.stderr)
        return 1
    svg = ICONS.read_text(encoding="utf-8")
    # Сначала убираем XML-пролог и комментарии: в шапке icons.svg есть
    # пример разметки с <svg>...</svg>, и без этого шага regex поймал бы
    # его вместо корневого элемента.
    svg = re.sub(r"<\?xml.*?\?>", "", svg, flags=re.S)
    svg = re.sub(r"<!--.*?-->", "", svg, flags=re.S)
    m = re.search(r"<svg\b.*?</svg>", svg, re.S)
    if not m:
        print("в icons.svg не найден корневой <svg>", file=sys.stderr)
        return 1
    body = m.group(0).strip()
    # корневому svg даём id и скрываем: он нужен только как хранилище symbol
    body = body.replace(
        "<svg ", '<svg id="flc-icons" ', 1
    ).replace('style="display:none"', 'style="display:none"', 1)

    count = body.count("<symbol")
    region = (
        f"{START} — генерируется из assets/icons.svg,\n"
        f"          не редактировать вручную: запустите ./build-assets.sh -->\n"
        f"    {body}\n"
        f"    {END}"
    )

    html = INDEX.read_text(encoding="utf-8")
    if START in html and END in html:
        html = re.sub(re.escape(START) + r".*?" + re.escape(END), region, html, flags=re.S)
    else:
        # первый запуск: вставляем сразу после открытия <body>
        marker = re.search(r"<body\b[^>]*>\n", html)
        if not marker:
            print("не найден <body> в index.html", file=sys.stderr)
            return 1
        html = html[: marker.end()] + "    " + region + "\n" + html[marker.end() :]

    INDEX.write_text(html, encoding="utf-8")
    print(f"  спрайт: {count} symbol встроено в index.html ({len(body)} байт)")
    return 0

if __name__ == "__main__":
    sys.exit(main())
