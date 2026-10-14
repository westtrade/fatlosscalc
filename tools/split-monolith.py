#!/usr/bin/env python3
"""Разовая декомпозиция монолитного index.html на модули.

Использовался, чтобы разнести изначально единый файл (разметка + стили +
логика) на:

  assets/common.style.css      общие стили
  assets/calc/calc.style.css   стили калькулятора
  assets/timer/timer.style.css стили таймера
  assets/common.app.js         оболочка + сборка компонента
  assets/calc/calc.app.js      логика калькулятора
  assets/timer/timer.app.js    логика таймера

Скрипт одноразовый: он рассчитан на исходный монолит и перезаписывает
index.html. Для обычной работы он не нужен — правьте модули напрямую,
а CSS пересобирайте через ./build-assets.sh.

Запуск (из корня проекта):  python3 tools/split-monolith.py
"""
import re, pathlib, json, sys

ROOT = pathlib.Path('.')
src = (ROOT / 'index.html').read_text(encoding='utf-8')
lines = src.split('\n')

# ─────────────────────── 1. СТИЛИ ───────────────────────
style_open  = next(i for i,l in enumerate(lines) if l.strip() == '<style>')
style_close = next(i for i,l in enumerate(lines) if i > style_open and l.strip() == '</style>')

def block(a, b):
    """Строки a..b включительно (1-indexed как в выводе read)."""
    return '\n'.join(lines[a-1:b])

COMMON_CSS = '\n\n'.join([
    block(17, 48),    # html, body, .grain::after
    block(107, 118),  # спиннеры number, .num
    block(176, 188),  # @keyframes toastIn, .toast
    block(221, 242),  # ::selection, скроллбары, [x-cloak]
])
CALC_CSS = '\n\n'.join([
    block(49, 106),   # input[type=range]
    block(119, 175),  # .card-hover, .bar, .soft, floaty, pulseRing, rise
    block(189, 220),  # .dash, .stripe, date, .plot, .plot-dot
])
TIMER_CSS = '\n\n'.join([
    block(253, 335),  # .no-select ... .dragging, .drag-over
])

# ─────────────────────── 2. ЛОГИКА ───────────────────────
a = src.index('Alpine.data("fatCalc"')
ret = src.index('return {', a)
tail = src[ret:]

def scan(t):
    i = t.index('{'); depth = 0; out = []; cur = i + 1; n = len(t)
    while i < n:
        c = t[i]
        if c in '"\'"':
            q = c; i += 1
            while i < n:
                if t[i] == '\\': i += 2; continue
                if t[i] == q: break
                i += 1
            i += 1; continue
        if c == '`':
            i += 1
            while i < n:
                if t[i] == '\\': i += 2; continue
                if t[i] == '`': break
                if t[i] == '$' and i+1 < n and t[i+1] == '{':
                    d = 1; i += 2
                    while i < n and d:
                        if t[i] == '{': d += 1
                        elif t[i] == '}': d -= 1
                        i += 1
                    continue
                i += 1
            i += 1; continue
        if c == '/' and i+1 < n and t[i+1] == '/':
            while i < n and t[i] != '\n': i += 1
            continue
        if c == '/' and i+1 < n and t[i+1] == '*':
            i += 2
            while i < n-1 and not (t[i] == '*' and t[i+1] == '/'): i += 1
            i += 2; continue
        if c in '{[(': depth += 1; i += 1; continue
        if c in '}])':
            depth -= 1
            if depth == 0: out.append(t[cur:i]); break
            i += 1; continue
        if c == ',' and depth == 1: out.append(t[cur:i]); cur = i + 1
        i += 1
    return out

members = {}
for raw in scan(tail):
    s = raw
    # отрезаем ведущие пробелы и комментарии
    while True:
        s2 = re.sub(r'^\s+', '', s)
        if s2.startswith('//'):
            s = s2.split('\n', 1)[1] if '\n' in s2 else ''
            continue
        if s2.startswith('/*'):
            s = s2.split('*/', 1)[1] if '*/' in s2 else ''
            continue
        s = s2
        break
    if not s.strip(): continue
    m = re.match(r'(?:get\s+|async\s+)?(?:"([^"]+)"|\'([^\']+)\'|([A-Za-z_$][\w$]*))\s*[:(]', s)
    name = next((g for g in (m.groups() if m else []) if g), None)
    if not name: raise SystemExit('не удалось определить имя члена:\n' + raw[:200])
    members[name] = raw.rstrip()

COMMON_JS = {'route','toast','toastTimer','storage','showToast',
             'syncRoute','setRoute','syncBodyLock','runningTimer','runningRemaining','init'}
CALC_JS = {
 'cw','tw','height','mode','spin','disp','_raf','_running','STORE_KEY','HIST_KEY','DEFAULTS',
 '_saveTimer','history','histWeight','histDate','HIST_MAX','BMI_MID','BMI_LOW','BMI_HIGH',
 'SCALE_MIN','SCALE_MAX','bmiScale','n','fmt','pct','bmiPos','bmiWeight','validBmi','heightM',
 'currentBmi','currentCat','twEff','tCal','tPro','tFat','tFib','tCarb','valid','delta',
 'projections','setMode','setDiet','macroCards','donut','bars','heroChips','steps','dietId',
 'DIET_SCALE_MIN','DIET_SCALE_MAX','diets','tips','diet','dietBaseCal','dietK','dietClamped',
 'roundQty','dietMeals','dietTotals','warnings','loadSaved','save','queueSave','clearSaved',
 'todayISO','parseISO','dayLabel','loadHistory','saveHistory','addEntry','removeEntry',
 'clearHistory','historyDesc','histStats','histCards','chart','smoothPath','targets','snap',
 'kick','reset','copyResult','fallbackCopy',
}
TIMER_JS = set(members) - COMMON_JS - CALC_JS

missing = (COMMON_JS | CALC_JS) - set(members)
if missing: raise SystemExit('нет таких членов: ' + ', '.join(sorted(missing)))

def dedent(text):
    out = []
    for l in text.split('\n'):
        out.append(l[12:] if l.startswith(' ' * 12) else l)
    return '\n'.join(out).rstrip()

def keep_order(names):
    """Порядок как в исходнике."""
    return [n for n in members if n in names]

def body_for(names):
    # члены в исходнике разделены запятыми, но запятая попадала в 'сырой'
    # текст следующего члена и отрезалась вместе с ведущим комментарием,
    # поэтому расставляем разделители сами
    parts = [dedent(members[n]).rstrip().rstrip(',') for n in keep_order(names)]
    return ',\n\n'.join(parts)

# init() живёт в оболочке, но использует хелпер num() из модуля калькулятора.
# Через this.n() он доступен в объединённом компоненте; в модуле оболочки
# собственного замыкания num нет, поэтому обращаемся к методу.
_common_bodies = {n: members[n] for n in COMMON_JS}
if 'init' in _common_bodies:
    members['init'] = re.sub(r'(?<![\w.$])num\(', 'this.n(', members['init'])

# ─────────────────────── 3. ФАЙЛЫ ───────────────────────
for d in ('assets/calc', 'assets/timer'):
    (ROOT / d).mkdir(parents=True, exist_ok=True)

(ROOT / 'assets/common.style.css').write_text(
f"""/* assets/common.style.css — общие стили приложения.
   Фон и «зерно» страницы, типографика чисел, тост, скроллбары.
   Подключается первым; далее assets/calc/calc.style.css и\n   assets/timer/timer.style.css. */

{COMMON_CSS}
""", encoding='utf-8')

(ROOT / 'assets/calc/calc.style.css').write_text(
f"""/* assets/calc/calc.style.css — стили раздела «Калькулятор»:
   ползунки, карточки, диаграммы, график веса, поля даты. */

{CALC_CSS}
""", encoding='utf-8')

(ROOT / 'assets/timer/timer.style.css').write_text(
f"""/* assets/timer/timer.style.css — стили раздела «Таймер»:
   drag-n-drop, тонкие скроллбары, анимации фаз и Undo. */

{TIMER_CSS}
""", encoding='utf-8')

(ROOT / 'assets/common.app.js').write_text(
f"""/* assets/common.app.js — оболочка приложения.
   Маршрутизация (#/ — калькулятор, #/timer — таймер), тост, работа
   с localStorage и точка сборки компонента из трёх модулей.

   Модули регистрируют себя в window.FLC и объединяются в один
   Alpine-компонент fatCalc: это позволяет держать код раздельно и
   при этом открывать страницу напрямую с диска (file://), где
   ES-модули не работают. */
(function () {{
  "use strict";

  window.FLC = window.FLC || {{}};

  window.FLC.common = function commonApp() {{
    return {{
{body_for(COMMON_JS)}
    }};
  }};

  /**
   * Собирает объект из нескольких, сохраняя геттеры как геттеры.
   * Object.assign здесь не подходит: он копирует значения и тем самым
   * ВЫЧИСЛЯЕТ геттеры (например runningTimer обращается к this.timers,
   * которого в модуле оболочки нет). Копируем дескрипторы.
   */
  function mergeModules(...sources) {{
    const target = {{}};
    for (const src of sources) {{
      Object.defineProperties(target, Object.getOwnPropertyDescriptors(src));
    }}
    return target;
  }}

  // Точка сборки: три модуля -> один компонент.
  // Скрипты подключены до alpine.js, поэтому подписка успевает к alpine:init.
  document.addEventListener("alpine:init", () => {{
    Alpine.data("fatCalc", () =>
      mergeModules(
        window.FLC.common(),
        window.FLC.calc(),
        window.FLC.timer(),
      ),
    );
  }});
}})();
""", encoding='utf-8')

(ROOT / 'assets/calc/calc.app.js').write_text(
f"""/* assets/calc/calc.app.js — калькулятор: расчёт нормы и БЖУ, шкала ИМТ,
   четыре варианта меню с пересчётом порций, дневник веса с графиком
   и сохранение введённых значений в localStorage. */
(function () {{
  "use strict";

  window.FLC = window.FLC || {{}};

  window.FLC.calc = function calcApp() {{
    const num = (v) => {{
      const x = parseFloat(v);
      return Number.isFinite(x) && x > 0 ? x : 0;
    }};
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

    const ICON = {{
      protein:
        '<svg viewBox="0 0 24 24" class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 6.5a4 4 0 1 1 5.6 5.6 4 4 0 1 1-5.6-5.6Z"/><path d="m14 14 4 4"/><path d="M18 18a2.5 2.5 0 1 0 3.5 3.5"/></svg>',
      fat: '<svg viewBox="0 0 24 24" class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2C8 7 5 10.5 5 14a7 7 0 0 0 14 0c0-3.5-3-7-7-12Z"/><path d="M9 15a3 3 0 0 0 3 3"/></svg>',
      fiber:
        '<svg viewBox="0 0 24 24" class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 20A7 7 0 0 1 4 13c0-5 4-9 9-9h7v7a7 7 0 0 1-7 7Z"/><path d="M4 20 20 4"/></svg>',
      carbs:
        '<svg viewBox="0 0 24 24" class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12h4l3 8 6-16 3 8h4"/></svg>',
      meal: '<svg viewBox="0 0 24 24" class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2v7a3 3 0 0 0 6 0V2M6 2v20M15 2c-1.5 2-2 4-2 7 0 2 .7 3 2 3.5V22"/></svg>',
    }};

    return {{
{body_for(CALC_JS)}
    }};
  }};
}})();
""", encoding='utf-8')

(ROOT / 'assets/timer/timer.app.js').write_text(
f"""/* assets/timer/timer.app.js — интервальный таймер: фазы подготовки, работы,
   отдыха, паузы между сетами и успокоения. Шаблоны, свои таймеры,
   drag-n-drop порядка, звук, вибрация, Wake Lock, импорт/экспорт JSON. */
(function () {{
  "use strict";

  window.FLC = window.FLC || {{}};

  window.FLC.timer = function timerApp() {{
    // геометрия кольца прогресса
    const RING_R = 90, RING_C = 2 * Math.PI * RING_R;
    const LP_R = 95, LP_C = 2 * Math.PI * LP_R;

    return {{
{body_for(TIMER_JS)}
    }};
  }};
}})();
""", encoding='utf-8')

# ─────────────────────── 4. index.html ───────────────────────
sc_open  = next(i for i,l in enumerate(lines) if l.strip() == '<script>' and i > style_close)
sc_close = next(i for i,l in enumerate(lines) if i > sc_open and l.strip() == '</script>')

head_links = """    <!-- Стили: общие, затем разделов -->
    <link rel="stylesheet" href="assets/css/tailwind.css" />
    <link rel="stylesheet" href="assets/css/fonts.css" />
    <link rel="stylesheet" href="assets/common.style.css" />
    <link rel="stylesheet" href="assets/calc/calc.style.css" />
    <link rel="stylesheet" href="assets/timer/timer.style.css" />"""

scripts = """    <!-- Alpine-приложения: оболочка, калькулятор, таймер.
         Подключены до alpine.js, чтобы успеть подписаться на alpine:init. -->
    <script defer src="assets/common.app.js"></script>
    <script defer src="assets/calc/calc.app.js"></script>
    <script defer src="assets/timer/timer.app.js"></script>
    <script defer src="assets/vendor/alpine-collapse.min.js"></script>
    <script defer src="assets/vendor/alpine.min.js"></script>"""

new = lines[:]
# вырезаем встроенный <script> (с конца, чтобы индексы не поехали)
del new[sc_open:sc_close+1]
# вырезаем <style>
del new[style_open:style_close+1]

text = '\n'.join(new)
# заменяем прежние подключения на новые
text = text.replace('''    <!-- Стили и скрипты подключены локально: страница работает без интернета.
         Tailwind собран заранее в assets/css/tailwind.css (см. README-ASSETS). -->
    <link rel="stylesheet" href="assets/css/tailwind.css" />
    <link rel="stylesheet" href="assets/css/fonts.css" />

    <script defer src="assets/vendor/alpine-collapse.min.js"></script>
    <script defer src="assets/vendor/alpine.min.js"></script>''',
    '''    <!-- Всё подключено локально: страница работает без интернета.
         Стили разделены по разделам, логика — на Alpine-модули (см. README.md). -->
''' + head_links + '\n\n' + scripts)

# подчищаем возможные двойные пустые строки
text = re.sub(r'\n{4,}', '\n\n\n', text)
(ROOT / 'index.html').write_text(text, encoding='utf-8')

json.dump({'common':keep_order(COMMON_JS),'calc':keep_order(CALC_JS),'timer':keep_order(TIMER_JS)},
          open('.verify/split_result.json','w',encoding='utf-8'), ensure_ascii=False, indent=1)
print('common.app.js :', len(keep_order(COMMON_JS)), 'членов')
print('calc.app.js   :', len(keep_order(CALC_JS)), 'членов')
print('timer.app.js  :', len(keep_order(TIMER_JS)), 'членов')
print('index.html    :', len(text.split(chr(10))), 'строк')
