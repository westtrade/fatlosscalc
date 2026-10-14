/* assets/calc/calc.app.js — калькулятор: расчёт нормы и БЖУ, шкала ИМТ,
   четыре варианта меню с пересчётом порций, дневник веса с графиком
   и сохранение введённых значений в localStorage. */
(function () {
  "use strict";

  window.FLC = window.FLC || {};

  window.FLC.calc = function calcApp() {
    const num = (v) => {
      const x = parseFloat(v);
      return Number.isFinite(x) && x > 0 ? x : 0;
    };
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

    const ICON = {
      protein:
        '<svg viewBox="0 0 24 24" class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 6.5a4 4 0 1 1 5.6 5.6 4 4 0 1 1-5.6-5.6Z"/><path d="m14 14 4 4"/><path d="M18 18a2.5 2.5 0 1 0 3.5 3.5"/></svg>',
      fat: '<svg viewBox="0 0 24 24" class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2C8 7 5 10.5 5 14a7 7 0 0 0 14 0c0-3.5-3-7-7-12Z"/><path d="M9 15a3 3 0 0 0 3 3"/></svg>',
      fiber:
        '<svg viewBox="0 0 24 24" class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 20A7 7 0 0 1 4 13c0-5 4-9 9-9h7v7a7 7 0 0 1-7 7Z"/><path d="M4 20 20 4"/></svg>',
      carbs:
        '<svg viewBox="0 0 24 24" class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12h4l3 8 6-16 3 8h4"/></svg>',
      meal: '<svg viewBox="0 0 24 24" class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2v7a3 3 0 0 0 6 0V2M6 2v20M15 2c-1.5 2-2 4-2 7 0 2 .7 3 2 3.5V22"/></svg>',
    };

    return {


/* ---------- state ---------- */
cw: 88,


tw: 78,


height: 175,


mode: "manual",

 // 'manual' | 'bmi'
spin: 0,



disp: { cal: 0, pro: 0, fat: 0, fib: 0, carb: 0 },


_raf: null,


_running: false,



/* ---------- persistence ---------- */
STORE_KEY: "fatlosscalc:input:v1",


HIST_KEY: "fatlosscalc:history:v1",


DEFAULTS: { cw: 88, tw: 78, height: 175, mode: "manual" },


_saveTimer: null,



/* ---------- weight tracker ---------- */
history: [],

 // [{ d: 'YYYY-MM-DD', w: Number }] по возрастанию даты
histWeight: null,


histDate: null,


HIST_MAX: 500,



/* ---------- constants ---------- */
BMI_MID: 21.7,

 // середина нормы (18,5 + 24,9) / 2
BMI_LOW: 18.5,


BMI_HIGH: 24.9,


SCALE_MIN: 14,


SCALE_MAX: 40,



bmiScale: [
  { from: 14, to: 16, color: "#FF6B8B", label: "Выраж. дефицит" },
  { from: 16, to: 18.5, color: "#FF8A3D", label: "Недовес" },
  { from: 18.5, to: 24.9, color: "#C6FF3D", label: "Норма" },
  { from: 24.9, to: 29.9, color: "#FF8A3D", label: "Избыток" },
  { from: 29.9, to: 34.9, color: "#FF6B8B", label: "Ожирение I" },
  { from: 34.9, to: 40, color: "#E11D48", label: "Ожирение II+" },
],



n: num,



/* ---------- helpers ---------- */
fmt(v, d = 0) {
  if (!Number.isFinite(v)) return "—";
  return v.toLocaleString("ru-RU", {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
},


pct(v, min, max) {
  const x = num(v);
  return clamp(((x - min) / (max - min)) * 100, 0, 100);
},


bmiPos(v) {
  return clamp(
    ((v - this.SCALE_MIN) / (this.SCALE_MAX - this.SCALE_MIN)) *
      100,
    0.5,
    99.5,
  );
},


bmiWeight(bmi) {
  const h = num(this.height) / 100;
  return h > 0 ? bmi * h * h : 0;
},



/* ---------- BMI ---------- */
get validBmi() {
  return num(this.cw) > 0 && num(this.height) >= 100;
},



get heightM() {
  return num(this.height) / 100;
},



get currentBmi() {
  return this.heightM > 0
    ? num(this.cw) / (this.heightM * this.heightM)
    : 0;
},



get currentCat() {
  const b = this.currentBmi;
  if (!b) return { label: "—", color: "#64748B" };
  const found = this.bmiScale.find((s) => b >= s.from && b < s.to);
  return found
    ? { label: found.label, color: found.color }
    : { label: "Ожирение II+", color: "#E11D48" };
},



/* ---------- effective target weight ---------- */
get twEff() {
  if (this.mode === "bmi") {
    const h = this.heightM;
    return h > 0 ? this.BMI_MID * h * h : 0;
  }
  return num(this.tw);
},



/* ---------- live formulas ---------- */
get tCal() {
  return num(this.cw) * 25;
},


get tPro() {
  return this.twEff * 2;
},


get tFat() {
  return num(this.cw) * 0.7;
},


get tFib() {
  return (this.tCal / 1000) * 14;
},


get tCarb() {
  return (this.tCal - num(this.cw) * 13) / 4;
},



get valid() {
  return num(this.cw) > 0 && this.twEff > 0 && this.tCarb > 0;
},



get delta() {
  return Math.max(0, num(this.cw) - this.twEff);
},



get projections() {
  const d = this.delta,
    r = 0.0075 * num(this.cw);
  return [
    { label: "4 недели", val: Math.min(d, r * 4) },
    { label: "8 недель", val: Math.min(d, r * 8) },
    { label: "12 недель", val: Math.min(d, r * 12) },
  ];
},



setMode(m) {
  if (this.mode === m) return;
  this.mode = m;
  if (m === "bmi") this.showToast("Цель считается по ИМТ 21,7");
  this.kick();
},



setDiet(id) {
  if (this.dietId === id) return;
  const d = this.diets.find((x) => x.id === id);
  if (!d) return;
  this.dietId = id;
  this.showToast(`Меню: ${d.label}`);
},



/* ---------- macro cards ---------- */
get macroCards() {
  const maxG = Math.max(
    this.tPro,
    this.tFat,
    Math.max(0, this.tCarb),
    this.tFib,
    1,
  );
  return [
    {
      key: "pro",
      label: "Белки",
      tag: "Шаг 2 · минимум",
      color: "#C6FF3D",
      icon: ICON.protein,
      dec: 0,
      formula: this.mode === "bmi" ? "ИМТ-цель × 2" : "цель × 2",
      note: "Минимум, чтобы сохранить мышечную массу и усилить насыщение.",
      share: () => (this.tPro / maxG) * 100,
      kcal: () => this.tPro * 4,
    },
    {
      key: "fat",
      label: "Жиры",
      tag: "Шаг 3 · максимум",
      color: "#FF8A3D",
      icon: ICON.fat,
      dec: 1,
      formula: "вес × 0,7",
      note: "Верхний предел — гормоны работают, но калории под контролем.",
      share: () => (this.tFat / maxG) * 100,
      kcal: () => this.tFat * 9,
    },
    {
      key: "carb",
      label: "Углеводы",
      tag: "Шаг 5 · остаток",
      color: "#59C7FF",
      icon: ICON.carbs,
      dec: 0,
      formula: "(ккал − вес×13) ÷ 4",
      note: "Всё, что осталось после белков и жиров — ваше топливо для тренировок.",
      share: () => (Math.max(0, this.tCarb) / maxG) * 100,
      kcal: () => Math.max(0, this.tCarb) * 4,
    },
    {
      key: "fib",
      label: "Клетчатка",
      tag: "Шаг 4 · каждый день",
      color: "#FF6B8B",
      icon: ICON.fiber,
      dec: 1,
      formula: "ккал ÷ 1000 × 14",
      note: "Долгое насыщение, стабильный сахар и здоровое пищеварение.",
      share: () => (this.tFib / maxG) * 100,
      kcal: () => this.tFib * 2,
    },
  ];
},



/* ---------- donut ---------- */
get donut() {
  const p = this.tPro * 4,
    f = this.tFat * 9,
    c = Math.max(0, this.tCarb) * 4;
  const total = p + f + c || 1;
  const C = 301.6;
  let off = 0;
  return [
    { key: "pro", label: "Белки", color: "#C6FF3D", v: p },
    { key: "carb", label: "Углеводы", color: "#59C7FF", v: c },
    { key: "fat", label: "Жиры", color: "#FF8A3D", v: f },
  ].map((x) => {
    const len = (x.v / total) * C;
    const seg = {
      ...x,
      len,
      off: -off,
      pct: Math.round((x.v / total) * 100),
    };
    off += len;
    return seg;
  });
},



/* ---------- bars ---------- */
get bars() {
  const max =
    Math.max(this.tPro, this.tFat, Math.max(0, this.tCarb), 1) *
    1.08;
  return [
    {
      label: "Белки",
      color: "#C6FF3D",
      dec: 0,
      max,
      value: () => this.tPro,
    },
    {
      label: "Жиры",
      color: "#FF8A3D",
      dec: 1,
      max,
      value: () => this.tFat,
    },
    {
      label: "Углеводы",
      color: "#59C7FF",
      dec: 0,
      max,
      value: () => Math.max(0, this.tCarb),
    },
    {
      label: "Клетчатка",
      color: "#FF6B8B",
      dec: 1,
      max,
      value: () => this.tFib,
    },
  ];
},



/* ---------- hero chips ---------- */
get heroChips() {
  return [
    {
      label: "Белки",
      color: "#C6FF3D",
      top: "4%",
      left: "-6%",
      get: () => this.tPro,
      dec: 0,
    },
    {
      label: "Жиры",
      color: "#FF8A3D",
      top: "44%",
      left: "82%",
      get: () => this.tFat,
      dec: 1,
    },
    {
      label: "Углеводы",
      color: "#59C7FF",
      top: "84%",
      left: "-2%",
      get: () => Math.max(0, this.tCarb),
      dec: 0,
    },
    {
      label: "Клетчатка",
      color: "#FF6B8B",
      top: "70%",
      left: "78%",
      get: () => this.tFib,
      dec: 1,
    },
  ];
},



/* ---------- steps ---------- */
get steps() {
  const w = this.fmt(num(this.cw), 1);
  const t = this.fmt(this.twEff, 1);
  const k = this.fmt(this.tCal, 0);
  const h = this.fmt(num(this.height), 0);
  const hm = this.fmt(this.heightM * this.heightM, 2).replace(
    ".",
    ",",
  );
  const bmi = this.mode === "bmi";

  const goalExpr = bmi
    ? `<span class="text-mint">${h}</span> см → <span class="text-mint">${hm}</span> м² × <span class="text-mint">21,7</span> = <span class="text-white font-bold">${t}</span> кг`
    : `<span class="text-mint">цель</span> = <span class="text-white font-bold">${t}</span> кг <span class="text-slate-500">(вручную)</span>`;

  return [
    {
      key: "cal",
      unit: "ккал",
      dec: 0,
      color: "#C6FF3D",
      badge: "Дефицит",
      title: "Норма калорий, запускающая жиросжигание",
      expr: `<span class="text-acid">${w}</span> × <span class="text-acid">25</span> = <span class="text-white font-bold">${k}</span>`,
      desc: "Умножьте текущий вес на 25 — это ваш идеальный дефицит. Достаточно агрессивно, чтобы горел жир, и достаточно мягко, чтобы не посыпались мышцы.",
    },

    {
      key: "tw",
      unit: "кг",
      dec: 1,
      color: "#3DF5B0",
      badge: bmi ? "ИМТ 21,7" : "Цель вручную",
      title: bmi
        ? "Целевой вес по середине нормы ИМТ"
        : "Вес, к которому вы стремитесь",
      expr: goalExpr,
      desc: bmi
        ? "Норма ИМТ — 18,5–24,9. Середина диапазона равна 21,7. Умножаем её на квадрат роста в метрах и получаем физиологичную, достижимую цель."
        : "Вы задаёте цель сами. Переключите режим на «По ИМТ» — и калькулятор предложит цель, лежащую ровно в середине диапазона нормы.",
    },

    {
      key: "pro",
      unit: "г",
      dec: 0,
      color: "#C6FF3D",
      badge: "Белки · минимум",
      title: "Минимальная норма белка",
      expr: `<span class="text-acid">${t}</span> × <span class="text-acid">2</span> = <span class="text-white font-bold">${this.fmt(this.tPro, 0)}</span> г`,
      desc: "Вес, к которому вы стремитесь, умножьте на 2. Это минимум, который сохраняет мышечную массу и заметно усиливает насыщение.",
    },

    {
      key: "fat",
      unit: "г",
      dec: 1,
      color: "#FF8A3D",
      badge: "Жиры · максимум",
      title: "Максимальная норма жиров",
      expr: `<span class="text-ember">${w}</span> × <span class="text-ember">0,7</span> = <span class="text-white font-bold">${this.fmt(this.tFat, 1)}</span> г`,
      desc: "Текущий вес умножьте на 0,7 — это потолок по жирам. Ниже опускаться не стоит: страдают гормоны, кожа и усвоение витаминов.",
    },

    {
      key: "fib",
      unit: "г",
      dec: 1,
      color: "#FF6B8B",
      badge: "Клетчатка",
      title: "Клетчатка каждый день",
      expr: `<span class="text-rose">${k}</span> ÷ 1000 × <span class="text-rose">14</span> = <span class="text-white font-bold">${this.fmt(this.tFib, 1)}</span> г`,
      desc: "Норму калорий разделите на тысячу и умножьте на 14. Столько клетчатки нужно съедать ежедневно — овощи, зелень, бобовые, цельные крупы.",
    },

    {
      key: "carb",
      unit: "г",
      dec: 0,
      color: "#59C7FF",
      badge: "Углеводы",
      title: "Остаток уходит в углеводы",
      expr: `(<span class="text-sky">${k}</span> − ${w} × <span class="text-sky">13</span>) ÷ 4 = <span class="text-white font-bold">${this.fmt(this.tCarb, 0)}</span> г`,
      desc: "Из нормы калорий вычтите вес, умноженный на 13, и разделите на 4. Полученные граммы — ваша дневная норма углеводов.",
    },
  ];
},



/* ---------- diets ----------
   Эталонные порции при k = 1 (коэффициент диеты).
   f — эластичность ингредиента: 1 = масштабируется полностью,
   0,3 — слабо (хлеб, авокадо, сухофрукты), 0,15 — масла и семена,
   0,1 — орехи (практически фиксированы).

   КБЖУ приёма при k = 1 в точности совпадают с исходным меню;
   дальше масштабируются на средневзвешенную эластичность приёма. */
dietId: "classic",


DIET_SCALE_MIN: 0.7,


DIET_SCALE_MAX: 1.5,



diets: [
  {
    id: "classic",
    badge: "Вариант 1",
    label: "Классический",
    sub: "бюджетный и простой",
    meals: [
      {
        name: "Завтрак",
        time: "07:30 – 09:00",
        kcal: 460,
        pro: 25,
        fat: 17,
        carb: 52,
        fib: 8,
        items: [
          { n: "Овсянка", q: 70, u: "г", f: 1 },
          { n: "Молоко 2,5%", q: 150, u: "мл", f: 1 },
          { n: "Творог 2,5%", q: 60, u: "г", f: 1 },
          { n: "Грецкий орех", q: 10, u: "г", f: 0.1 },
        ],
      },
      {
        name: "Обед",
        time: "12:30 – 14:00",
        kcal: 600,
        pro: 48,
        fat: 15,
        carb: 66,
        fib: 12,
        items: [
          { n: "Куриное филе", q: 150, u: "г", f: 1 },
          { n: "Гречка", q: 90, u: "г", f: 1 },
          { n: "Масло оливковое", q: 10, u: "г", f: 0.15 },
          { n: "Овощной салат", q: 200, u: "г", f: 1 },
        ],
      },
      {
        name: "Полдник",
        time: "16:00 – 17:00",
        kcal: 280,
        pro: 10,
        fat: 11,
        carb: 35,
        fib: 4,
        items: [
          { n: "Кефир 2,5%", q: 250, u: "мл", f: 1 },
          { n: "Банан", q: 100, u: "г", f: 1 },
          { n: "Миндаль", q: 10, u: "г", f: 0.1 },
        ],
      },
      {
        name: "Ужин",
        time: "19:00 – 20:30",
        kcal: 430,
        pro: 43,
        fat: 7,
        carb: 49,
        fib: 8,
        items: [
          { n: "Белая рыба", q: 200, u: "г", f: 1 },
          { n: "Картофель отварной", q: 250, u: "г", f: 1 },
          { n: "Квашеная капуста", q: 150, u: "г", f: 1 },
          { n: "Масло льняное", q: 5, u: "г", f: 0.15 },
        ],
      },
    ],
  },

  {
    id: "hearty",
    badge: "Вариант 2",
    label: "Сытный",
    sub: "высокий объём порций",
    meals: [
      {
        name: "Завтрак",
        time: "07:30 – 09:00",
        kcal: 365,
        pro: 28,
        fat: 13,
        carb: 29,
        fib: 5,
        items: [
          { n: "Яйца", q: 2, u: "шт", f: 1, step: 1 },
          { n: "Молоко 2,5% (в омлет)", q: 50, u: "мл", f: 1 },
          { n: "Хлеб цельнозерновой", q: 60, u: "г", f: 0.3 },
          { n: "Творог 2,5% с зеленью", q: 50, u: "г", f: 1 },
        ],
      },
      {
        name: "Обед",
        time: "12:30 – 14:00",
        kcal: 515,
        pro: 40,
        fat: 12,
        carb: 71,
        fib: 18,
        items: [
          { n: "Индейка / говядина постная", q: 140, u: "г", f: 1 },
          { n: "Перловка", q: 80, u: "г", f: 1 },
          { n: "Авокадо", q: 40, u: "г", f: 0.3 },
          { n: "Листовой салат", q: 200, u: "г", f: 1 },
        ],
      },
      {
        name: "Полдник",
        time: "16:00 – 17:00",
        kcal: 230,
        pro: 15,
        fat: 6,
        carb: 26,
        fib: 4,
        items: [
          { n: "Кефир 2,5%", q: 200, u: "мл", f: 1 },
          { n: "Творог 2,5%", q: 50, u: "г", f: 1 },
          { n: "Ягоды замороженные", q: 150, u: "г", f: 1 },
        ],
      },
      {
        name: "Ужин",
        time: "19:00 – 20:30",
        kcal: 550,
        pro: 43,
        fat: 8,
        carb: 72,
        fib: 4,
        items: [
          { n: "Печень куриная", q: 180, u: "г", f: 1 },
          { n: "Макароны твёрдых сортов", q: 70, u: "г", f: 1 },
          { n: "Томатный соус", q: 50, u: "г", f: 0.3 },
          { n: "Кабачки тушёные", q: 200, u: "г", f: 1 },
        ],
      },
    ],
  },

  {
    id: "gourmet",
    badge: "Вариант 3",
    label: "Гастрономический",
    sub: "разнообразие вкусов",
    meals: [
      {
        name: "Завтрак",
        time: "07:30 – 09:00",
        kcal: 500,
        pro: 31,
        fat: 8,
        carb: 74,
        fib: 6,
        items: [
          { n: "Творог 2,5% (сырники)", q: 120, u: "г", f: 1 },
          { n: "Овсяная мука", q: 40, u: "г", f: 1 },
          { n: "Яйцо", q: 1, u: "шт", f: 1, step: 1 },
          { n: "Молоко 2,5%", q: 150, u: "мл", f: 1 },
          { n: "Яблоко", q: 150, u: "г", f: 1 },
        ],
      },
      {
        name: "Обед",
        time: "12:30 – 14:00",
        kcal: 680,
        pro: 41,
        fat: 32,
        carb: 56,
        fib: 9,
        items: [
          { n: "Форель / кета", q: 130, u: "г", f: 1 },
          { n: "Киноа", q: 80, u: "г", f: 1 },
          { n: "Масло оливковое", q: 10, u: "г", f: 0.15 },
          { n: "Спаржа / стручковая фасоль", q: 200, u: "г", f: 1 },
        ],
      },
      {
        name: "Полдник",
        time: "16:00 – 17:00",
        kcal: 265,
        pro: 10,
        fat: 11,
        carb: 31,
        fib: 7,
        items: [
          { n: "Кефир 2,5%", q: 250, u: "мл", f: 1 },
          { n: "Семена чиа", q: 15, u: "г", f: 0.15 },
          { n: "Манго / персик", q: 100, u: "г", f: 1 },
        ],
      },
      {
        name: "Ужин",
        time: "19:00 – 20:30",
        kcal: 455,
        pro: 45,
        fat: 7,
        carb: 58,
        fib: 11,
        items: [
          { n: "Кальмары / креветки", q: 200, u: "г", f: 1 },
          { n: "Батат запечённый", q: 200, u: "г", f: 1 },
          { n: "Масло оливковое", q: 5, u: "г", f: 0.15 },
          { n: "Брокколи", q: 200, u: "г", f: 1 },
        ],
      },
    ],
  },

  {
    id: "mediterranean",
    badge: "Вариант 4",
    label: "Средиземноморский",
    sub: "рыба, бобовые, оливковое масло",
    meals: [
      {
        name: "Завтрак",
        time: "07:30 – 09:00",
        kcal: 510,
        pro: 28,
        fat: 16,
        carb: 61,
        fib: 11,
        items: [
          { n: "Творог 2,5%", q: 100, u: "г", f: 1 },
          { n: "Молоко 2,5%", q: 100, u: "мл", f: 1 },
          { n: "Овсяные хлопья", q: 50, u: "г", f: 1 },
          { n: "Груша", q: 150, u: "г", f: 1 },
          { n: "Грецкий орех", q: 10, u: "г", f: 0.1 },
          { n: "Семена льна", q: 5, u: "г", f: 0.15 },
        ],
      },
      {
        name: "Обед",
        time: "12:30 – 14:00",
        kcal: 780,
        pro: 42,
        fat: 39,
        carb: 65,
        fib: 10,
        items: [
          { n: "Скумбрия / сардина запечённая", q: 140, u: "г", f: 1 },
          { n: "Нут", q: 60, u: "г", f: 1 },
          { n: "Масло оливковое", q: 10, u: "г", f: 0.15 },
          { n: "Помидоры", q: 100, u: "г", f: 1 },
          { n: "Красный лук", q: 50, u: "г", f: 1 },
          { n: "Оливки", q: 10, u: "г", f: 0.15 },
          { n: "Руккола", q: 200, u: "г", f: 1 },
          { n: "Пита цельнозерновая", q: 40, u: "г", f: 0.3 },
        ],
      },
      {
        name: "Полдник",
        time: "16:00 – 17:00",
        kcal: 375,
        pro: 9,
        fat: 12,
        carb: 63,
        fib: 7,
        items: [
          { n: "Кефир 2,5%", q: 250, u: "мл", f: 1 },
          { n: "Курага / инжир", q: 40, u: "г", f: 0.3 },
          { n: "Фисташки / миндаль", q: 12, u: "г", f: 0.1 },
          { n: "Апельсин", q: 150, u: "г", f: 1 },
        ],
      },
      {
        name: "Ужин",
        time: "19:00 – 20:30",
        kcal: 502,
        pro: 35,
        fat: 11,
        carb: 66,
        fib: 10,
        items: [
          { n: "Мидии / креветки", q: 200, u: "г", f: 1 },
          { n: "Булгур / кускус", q: 65, u: "г", f: 1 },
          { n: "Масло оливковое", q: 8, u: "г", f: 0.15 },
          { n: "Овощи гриль", q: 250, u: "г", f: 1 },
        ],
      },
    ],
  },
],



tips: [
  {
    t: "Белок в каждом приёме",
    d: "— ровное распределение лучше защищает мышцы.",
  },
  {
    t: "Клетчатка из овощей",
    d: "— минимум 400 г зелени и овощей в сутки.",
  },
  { t: "Вода 30–35 мл/кг", d: "— часто жажду путают с голодом." },
  {
    t: "Взвешивайтесь 1 раз в неделю",
    d: "— утром, натощак, смотрите на тренд за 2–3 недели.",
  },
],



/* ---------- diets: расчёт порций ---------- */
get diet() {
  return this.diets.find((d) => d.id === this.dietId) || this.diets[0];
},



// базовая калорийность меню (при коэффициенте 1)
get dietBaseCal() {
  return this.diet.meals.reduce((s, m) => s + m.kcal, 0);
},



// во сколько раз подгоняем меню под текущую цель калькулятора
get dietK() {
  if (!this.valid || !this.dietBaseCal) return 1;
  return clamp(
    this.tCal / this.dietBaseCal,
    this.DIET_SCALE_MIN,
    this.DIET_SCALE_MAX,
  );
},



// если цель вышла за разумные рамки — честно об этом скажем
get dietClamped() {
  if (!this.valid || !this.dietBaseCal) return null;
  const raw = this.tCal / this.dietBaseCal;
  if (raw < this.DIET_SCALE_MIN) return "min";
  if (raw > this.DIET_SCALE_MAX) return "max";
  return null;
},



// округление до кухонной точности: штуки — целые, мелочь — по грамму
roundQty(q, item) {
  if (item.u === "шт") return Math.max(1, Math.round(q));
  if (q < 50) return Math.max(1, Math.round(q));
  return Math.max(5, Math.round(q / 5) * 5);
},



get dietMeals() {
  const k = this.dietK;
  const meals = this.diet.meals;

  // 1) эластичность приёма = средневзвешенная по массе ингредиентов
  const raw = meals.map((m) => {
    const tot = m.items.reduce((s, i) => s + i.q, 0) || 1;
    const w = m.items.reduce(
      (s, i) => s + i.q * (i.f == null ? 1 : i.f),
      0,
    );
    return 1 + (k - 1) * (w / tot);
  });

  // 2) нормировка: «жёсткие» ингредиенты (орехи, масла) не добирают
  //    калории, поэтому слегка подправляем множители так, чтобы
  //    сумма за день точно равнялась норме калькулятора
  const rawTotal = meals.reduce((s, m, i) => s + m.kcal * raw[i], 0);
  const target = k * this.dietBaseCal;
  const fix = rawTotal > 0 && target > 0 ? target / rawTotal : 1;

  return meals.map((m, i) => {
    const mult = raw[i] * fix;
    return {
      name: m.name,
      time: m.time,
      icon: ICON.meal,
      mult,
      items: m.items.map((it) => {
        const f = it.f == null ? 1 : it.f;
        const qty = this.roundQty(
          it.q * (1 + (mult - 1) * f),
          it,
        );
        return {
          n: it.n,
          u: it.u,
          qty,
          // подсвечиваем, только если порция реально изменилась
          scaled: Math.abs(qty - it.q) >= 1,
        };
      }),
      cal: m.kcal * mult,
      pro: m.pro * mult,
      fat: m.fat * mult,
      carb: m.carb * mult,
      fib: m.fib * mult,
    };
  });
},



get dietTotals() {
  return this.dietMeals.reduce(
    (a, m) => ({
      cal: a.cal + m.cal,
      pro: a.pro + m.pro,
      fat: a.fat + m.fat,
      carb: a.carb + m.carb,
      fib: a.fib + m.fib,
    }),
    { cal: 0, pro: 0, fat: 0, carb: 0, fib: 0 },
  );
},



/* ---------- warnings ---------- */
get warnings() {
  const out = [];
  if (!num(this.cw)) {
    out.push({
      level: "warn",
      text: "Укажите текущий вес — без него расчёт невозможен.",
    });
    return out;
  }
  if (num(this.cw) < 30 || num(this.cw) > 250) {
    out.push({
      level: "warn",
      text: "Проверьте текущий вес: расчёт рассчитан на диапазон 30–250 кг.",
    });
  }

  if (this.mode === "bmi") {
    if (num(this.height) < 120 || num(this.height) > 230) {
      out.push({
        level: "warn",
        text: "Укажите рост в диапазоне 120–230 см — иначе цель по ИМТ будет недостоверной.",
      });
    }
    if (this.currentBmi < this.BMI_LOW) {
      out.push({
        level: "warn",
        text: "Ваш ИМТ ниже нормы (18,5). Похудение вам не показано — цель по ИМТ 21,7 означает набор веса. Обратитесь к специалисту.",
      });
    }
    if (
      num(this.height) >= 100 &&
      (this.currentBmi > 35 || this.currentBmi < 15)
    ) {
      out.push({
        level: "warn",
        text: "ИМТ выходит за пределы шкалы. Формула «×25» здесь слишком агрессивна — план нужно составлять с врачом.",
      });
    }
  } else {
    if (!num(this.tw)) {
      out.push({
        level: "warn",
        text: "Укажите вес, к которому стремитесь, или переключитесь на расчёт по ИМТ.",
      });
    }
    if (num(this.tw) < 30 || num(this.tw) > 250) {
      out.push({
        level: "warn",
        text: "Проверьте целевой вес: допустимый диапазон 30–250 кг.",
      });
    }
  }

  if (this.tCarb <= 0) {
    out.push({
      level: "err",
      text: "Углеводы получились отрицательными — при таком весе формула «×25» даёт слишком жёсткий дефицит. Нужен индивидуальный план.",
    });
  } else if (this.tCarb < 60) {
    out.push({
      level: "warn",
      text: "Углеводов очень мало (<60 г). Это агрессивный режим — держите его коротко и следите за самочувствием и тренировками.",
    });
  }

  if (this.valid && this.twEff > num(this.cw)) {
    out.push({
      level: "warn",
      text:
        this.mode === "bmi"
          ? "Расчётный вес по ИМТ 21,7 больше вашего текущего — формула рассчитана на похудение. Для набора массы нужна другая стратегия."
          : "Целевой вес больше текущего — формула рассчитана на похудение. Для набора массы нужна другая стратегия.",
    });
  }
  if (this.tPro > (this.tCal / 4) * 0.45) {
    out.push({
      level: "warn",
      text: "Белок занимает очень большую долю калорий. Убедитесь, что цель реалистична, и пейте достаточно воды.",
    });
  }
  return out;
},



loadSaved() {
  const ls = this.storage();
  if (!ls) return false;
  let raw;
  try {
    raw = ls.getItem(this.STORE_KEY);
  } catch (e) {
    return false;
  }
  if (!raw) return false;

  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    this.clearSaved(); // битые данные — не блокируем работу
    return false;
  }
  if (!data || typeof data !== "object") {
    this.clearSaved();
    return false;
  }

  const weight = (v, min, max) => {
    const x = parseFloat(v);
    return Number.isFinite(x) && x >= min && x <= max
      ? Math.round(x * 2) / 2
      : null;
  };

  // рост: как и вес, принимаем только осмысленный диапазон
  const cm = (v) => {
    const x = parseFloat(v);
    return Number.isFinite(x) && x >= 120 && x <= 230
      ? Math.round(x)
      : null;
  };

  const cw = weight(data.cw, 30, 250);
  const tw = weight(data.tw, 30, 250);
  const height = cm(data.height);
  const mode = data.mode === "bmi" || data.mode === "manual"
    ? data.mode
    : null;

  // диета: принимаем только известный id, иначе остаётся текущая
  const dietId =
    typeof data.dietId === "string" &&
    this.diets.some((d) => d.id === data.dietId)
      ? data.dietId
      : null;

  if (cw !== null) this.cw = cw;
  if (tw !== null) this.tw = tw;
  if (height !== null) this.height = height;
  if (mode !== null) this.mode = mode;
  if (dietId !== null) this.dietId = dietId;

  const restored =
    cw !== null ||
    tw !== null ||
    height !== null ||
    mode !== null ||
    dietId !== null;
  // ни одно поле не пригодилось — хранить это незачем
  if (!restored) this.clearSaved();
  return restored;
},



save() {
  const ls = this.storage();
  if (!ls) return;
  const payload = {
    v: 1,
    cw: num(this.cw),
    tw: num(this.tw),
    height: num(this.height),
    mode: this.mode === "bmi" ? "bmi" : "manual",
    dietId: this.dietId,
    ts: Date.now(),
  };
  try {
    ls.setItem(this.STORE_KEY, JSON.stringify(payload));
  } catch (e) {
    /* переполнение квоты — молча игнорируем */
  }
},



queueSave() {
  clearTimeout(this._saveTimer);
  this._saveTimer = setTimeout(() => this.save(), 300);
},



clearSaved() {
  clearTimeout(this._saveTimer);
  const ls = this.storage();
  if (!ls) return;
  try {
    ls.removeItem(this.STORE_KEY);
  } catch (e) {}
},



/* ---------- weight tracker ---------- */
todayISO() {
  const d = new Date();
  const p = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
},



// 'YYYY-MM-DD' -> локальная дата (полдень, чтобы не ловить сдвиг TZ)
parseISO(s) {
  if (typeof s !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const y = +m[1],
    mo = +m[2],
    da = +m[3];
  if (mo < 1 || mo > 12 || da < 1 || da > 31) return null;
  const d = new Date(y, mo - 1, da, 12, 0, 0);
  // отсекаем несуществующие даты (31 февраля и т.п.)
  if (d.getFullYear() !== y || d.getMonth() !== mo - 1 || d.getDate() !== da)
    return null;
  return d;
},



dayLabel(s) {
  const d = this.parseISO(s);
  if (!d) return s || "—";
  const p = (x) => String(x).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${String(d.getFullYear()).slice(2)}`;
},



loadHistory() {
  const ls = this.storage();
  if (!ls) return;
  let raw;
  try {
    raw = ls.getItem(this.HIST_KEY);
  } catch (e) {
    return;
  }
  if (!raw) return;
  let arr;
  try {
    arr = JSON.parse(raw);
  } catch (e) {
    this.clearHistory(true);
    return;
  }
  if (!Array.isArray(arr)) {
    this.clearHistory(true);
    return;
  }
  const byDay = new Map();
  for (const it of arr) {
    if (!it || typeof it !== "object") continue;
    const d = typeof it.d === "string" ? it.d.trim() : "";
    const w = parseFloat(it.w);
    if (!this.parseISO(d)) continue;
    if (!Number.isFinite(w) || w < 30 || w > 250) continue;
    byDay.set(d, { d, w: Math.round(w * 10) / 10 });
  }
  this.history = [...byDay.values()]
    .sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0))
    .slice(-this.HIST_MAX);
  if (!this.history.length) this.clearHistory(true);
},



saveHistory() {
  const ls = this.storage();
  if (!ls) return;
  try {
    ls.setItem(
      this.HIST_KEY,
      JSON.stringify(this.history.slice(-this.HIST_MAX)),
    );
  } catch (e) {
    /* квота — молча игнорируем */
  }
},



addEntry() {
  const w = Math.round(parseFloat(this.histWeight) * 10) / 10;
  if (!Number.isFinite(w) || w < 30 || w > 250) {
    this.showToast("Введите вес в диапазоне 30–250 кг");
    return;
  }
  const day = this.histDate || this.todayISO();
  if (!this.parseISO(day)) {
    this.showToast("Укажите корректную дату");
    return;
  }
  if (day > this.todayISO()) {
    this.showToast("Дата не может быть в будущем");
    return;
  }

  const existed = this.history.some((e) => e.d === day);
  this.history = [
    ...this.history.filter((e) => e.d !== day),
    { d: day, w },
  ]
    .sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0))
    .slice(-this.HIST_MAX);
  this.saveHistory();

  // текущий вес в калькуляторе идёт за последней записью
  const last = this.history[this.history.length - 1];
  if (last) this.cw = last.w;

  this.showToast(
    existed ? `Запись за ${this.dayLabel(day)} обновлена` : `Добавлено: ${this.fmt(w, 1)} кг`,
  );
},



removeEntry(day) {
  const before = this.history.length;
  this.history = this.history.filter((e) => e.d !== day);
  if (this.history.length === before) return;
  this.saveHistory();
  const last = this.history[this.history.length - 1];
  if (last) this.cw = last.w;
  this.showToast("Запись удалена");
},



clearHistory(silent = false) {
  if (!silent && !this.history.length) return;
  this.history = [];
  const ls = this.storage();
  if (ls) {
    try {
      ls.removeItem(this.HIST_KEY);
    } catch (e) {}
  }
  if (!silent) this.showToast("История очищена");
},



get historyDesc() {
  const asc = this.history;
  return asc
    .map((e, i) => {
      const prev = i > 0 ? asc[i - 1] : null;
      let deltaText = "—",
        deltaColor = "#64748B";
      if (prev) {
        const d = Math.round((e.w - prev.w) * 10) / 10;
        if (d === 0) {
          deltaText = "0,0";
        } else {
          deltaText =
            (d > 0 ? "+" : "−") +
            this.fmt(Math.abs(d), 1).replace("\u00A0", " ");
          deltaColor = d > 0 ? "#FF8A3D" : "#3DF5B0";
        }
      }
      return {
        d: e.d,
        w: e.w,
        label: this.dayLabel(e.d),
        deltaText,
        deltaColor,
        delta: prev ? Math.round((e.w - prev.w) * 10) / 10 : 0,
      };
    })
    .reverse();
},



get histStats() {
  const h = this.history;
  if (!h.length) return null;
  const start = h[0].w,
    current = h[h.length - 1].w;
  const goal = this.valid ? this.twEff : null;
  const change = Math.round((current - start) * 10) / 10;
  let progress = 0;
  if (goal !== null && Number.isFinite(goal)) {
    const denom = start - goal;
    progress =
      denom > 0
        ? clamp((start - current) / denom, 0, 1)
        : current <= goal
          ? 1
          : 0;
  }
  return {
    start,
    current,
    change,
    goal,
    progress,
    toGoal: goal !== null ? Math.max(0, current - goal) : null,
  };
},



get histCards() {
  const s = this.histStats;
  if (!s) return [];
  const ch = s.change;
  const chColor = ch < 0 ? "#3DF5B0" : ch > 0 ? "#FF8A3D" : "#94A3B8";
  const chText =
    ch === 0
      ? "0,0"
      : (ch > 0 ? "+" : "−") + this.fmt(Math.abs(ch), 1);
  const cards = [
    { label: "Старт", value: this.fmt(s.start, 1), unit: "кг", color: "#94A3B8" },
    { label: "Сейчас", value: this.fmt(s.current, 1), unit: "кг", color: "#FFFFFF" },
    { label: "Изменение", value: chText, unit: "кг", color: chColor },
  ];
  if (s.toGoal !== null)
    cards.push({
      label: "До цели",
      value: this.fmt(s.toGoal, 1),
      unit: "кг",
      color: "#C6FF3D",
    });
  return cards;
},



/* ---------- chart geometry (viewBox 720×240) ---------- */
get chart() {
  const W = 720,
    H = 240;
  const h = this.history;
  const empty = {
    pts: [],
    line: "",
    area: "",
    yTicks: [],
    target: null,
    targetOff: null,
    firstLabel: "",
    lastLabel: "",
  };
  if (!h.length) return empty;

  const ws = h.map((e) => e.w);
  let lo = Math.min(...ws),
    hi = Math.max(...ws);
  if (hi - lo < 0.2) {
    // одна запись или все значения равны — даём диапазон
    lo -= 1;
    hi += 1;
  }
  const range = hi - lo;
  const pad = Math.max(0.4, range * 0.12);
  const yMin = lo - pad,
    yMax = hi + pad;
  const span = yMax - yMin || 1;

  const goal =
    this.valid && Number.isFinite(this.twEff) ? this.twEff : null;
  let target = null,
    targetOff = null;
  if (goal !== null) {
    if (goal < yMin) targetOff = "below";
    else if (goal > yMax) targetOff = "above";
    else target = ((yMax - goal) / span) * H;
  }

  const n = h.length;
  const pts = h.map((e, i) => {
    const xPct = n === 1 ? 50 : (i / (n - 1)) * 100;
    const yPct = ((yMax - e.w) / span) * 100;
    return {
      d: e.d,
      w: e.w,
      label: this.dayLabel(e.d),
      x: n === 1 ? W / 2 : (i / (n - 1)) * W,
      y: (yPct / 100) * H,
      xPct,
      yPct: clamp(yPct, 2, 98),
      // у краёв подсказку прижимаем внутрь, чтобы не вылезала
      tipAlign: xPct < 18 ? "left" : xPct > 82 ? "right" : "center",
    };
  });

  const line = this.smoothPath(pts);
  const area = line
    ? `${line}L${pts[pts.length - 1].x.toFixed(2)},${H}L${pts[0].x.toFixed(2)},${H}Z`
    : "";

  const yTicks = [0, 25, 50, 75, 100].map((pct) => ({
    pct,
    v: yMax - (pct / 100) * span,
  }));

  return {
    pts,
    line,
    area,
    yTicks,
    target,
    targetOff,
    firstLabel: this.dayLabel(h[0].d),
    lastLabel: this.dayLabel(h[n - 1].d),
  };
},



// сглаживание Catmull-Rom -> кубические Безье
smoothPath(pts) {
  if (!pts.length) return "";
  if (pts.length === 1) return "";
  const f = (v) => Number(v.toFixed(2));
  if (pts.length === 2)
    return `M${f(pts[0].x)},${f(pts[0].y)}L${f(pts[1].x)},${f(pts[1].y)}`;
  let d = `M${f(pts[0].x)},${f(pts[0].y)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const t = 0.2;
    const c1x = p1.x + (p2.x - p0.x) * t;
    const c1y = p1.y + (p2.y - p0.y) * t;
    const c2x = p2.x - (p3.x - p1.x) * t;
    const c2y = p2.y - (p3.y - p1.y) * t;
    d += `C${f(c1x)},${f(c1y)} ${f(c2x)},${f(c2y)} ${f(p2.x)},${f(p2.y)}`;
  }
  return d;
},



targets() {
  return {
    cal: this.tCal,
    pro: this.tPro,
    fat: this.tFat,
    fib: this.tFib,
    carb: Math.max(0, this.tCarb),
  };
},



snap() {
  this.disp = { ...this.targets() };
},



kick() {
  if (this._running) return;
  this._running = true;
  const step = () => {
    const t = this.targets();
    let moving = false;
    for (const k in t) {
      const d = t[k] - this.disp[k];
      if (Math.abs(d) > 0.05) {
        this.disp[k] += d * 0.22;
        moving = true;
      } else this.disp[k] = t[k];
    }
    if (moving) this._raf = requestAnimationFrame(step);
    else {
      this._running = false;
      cancelAnimationFrame(this._raf);
    }
  };
  this._raf = requestAnimationFrame(step);
},



reset() {
  this.cw = 88;
  this.tw = 78;
  this.height = 175;
  this.mode = "manual";
  this.kick();
  this.showToast("Значения сброшены к примеру");
},



copyResult() {
  if (!this.valid) {
    this.showToast("Сначала заполните данные");
    return;
  }
  const goal =
    this.mode === "bmi"
      ? `${this.fmt(this.twEff, 1)} кг (по ИМТ 21,7, рост ${this.fmt(num(this.height), 0)} см)`
      : `${this.fmt(this.twEff, 1)} кг (задан вручную)`;

  const txt = `МОЙ ПЛАН ЖИРОСЖИГАНИЯ
Текущий вес: ${this.fmt(num(this.cw), 1)} кг   Рост: ${this.fmt(num(this.height), 0)} см   ИМТ: ${this.fmt(this.currentBmi, 1)} (${this.currentCat.label})
Цель: ${goal}
Норма ИМТ (18,5–24,9) для вашего роста: ${this.fmt(this.bmiWeight(18.5), 1)}–${this.fmt(this.bmiWeight(24.9), 1)} кг

• Калории:   ${this.fmt(this.tCal, 0)} ккал  (вес × 25)
• Белки:     ${this.fmt(this.tPro, 0)} г     (цель × 2)
• Жиры:      ${this.fmt(this.tFat, 1)} г     (вес × 0,7)
• Углеводы:  ${this.fmt(this.tCarb, 0)} г    ((ккал − вес×13) ÷ 4)
• Клетчатка: ${this.fmt(this.tFib, 1)} г     (ккал ÷ 1000 × 14)`;

  const done = () =>
    this.showToast("План скопирован в буфер обмена");
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard
      .writeText(txt)
      .then(done)
      .catch(() => this.fallbackCopy(txt, done));
  } else this.fallbackCopy(txt, done);
},



fallbackCopy(text, cb) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand("copy");
    cb();
  } catch (e) {
    this.showToast("Не удалось скопировать");
  }
  document.body.removeChild(ta);
}
    };
  };
})();
