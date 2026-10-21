/* tools/check-kcal.js — проверка расчёта калорий в таймере.

   Запуск:  node tools/check-kcal.js

   Гоняет tick() с подставными часами и проверяет три вещи:
   1) время работы уходит в «бег», время отдыха — в «ходьбу»;
   2) на паузе ничего не начисляется;
   3) вес 0 не даёт NaN.

   Модуль таймера — не ES-модуль, поэтому поднимаем минимум окружения. */

const path = require("path");

global.window = { FLC: {}, addEventListener() {} };
global.document = { addEventListener() {}, visibilityState: "visible" };
global.navigator = {};
global.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };

let fakeNow = 0;
Object.defineProperty(globalThis, "performance", {
  value: { now: () => fakeNow },
  configurable: true,
  writable: true,
});

require(path.join(__dirname, "..", "assets", "timer", "timer.app.js"));

const mod = window.FLC.timer();

/* Собираем компонент как mergeModules: Object.assign вычислил бы геттеры. */
function makeTimer() {
  const o = {};
  Object.defineProperties(o, Object.getOwnPropertyDescriptors(mod));
  Object.defineProperties(
    o,
    Object.getOwnPropertyDescriptors({
      cw: 88,
      n: (v) => (parseFloat(v) > 0 ? parseFloat(v) : 0),
    }),
  );
  return o;
}

const MET_RUN = 9;
const MET_WALK = 3.5;

let failed = 0;
const check = (name, ok, detail) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  if (!ok) failed++;
};

/* 1. 60 с работы + 60 с отдыха: время делится по фазам, калории совпадают. */
{
  const t = makeTimer();
  Object.assign(t, {
    activeId: 1,
    seq: [
      { type: "work", duration: 60 },
      { type: "rest", duration: 60 },
    ],
    idx: 0,
    remaining: 60000,
    paused: false,
    countdownAnnounced: 0,
    finished: false,
    kcalRunMs: 0,
    kcalWalkMs: 0,
  });

  fakeNow = 0;
  t.lastTick = 0;
  for (let i = 0; i < 1500; i++) {
    t.tick();
    fakeNow += 100;
    if (t.finished) break;
  }

  const run = t.kcalRunMs / 1000;
  const walk = t.kcalWalkMs / 1000;
  const expected =
    (60 / 60) * (MET_RUN * 3.5 * 88) / 200 + (60 / 60) * (MET_WALK * 3.5 * 88) / 200;

  check("работа -> бег 60 с", Math.abs(run - 60) <= 0.2, `получено ${run} с`);
  check("отдых -> ходьба 60 с", Math.abs(walk - 60) <= 0.2, `получено ${walk} с`);
  check(
    "калории 1 мин бега + 1 мин ходьбы",
    Math.abs(t.kcalBurned - expected) < 0.5,
    `${t.kcalBurned.toFixed(2)} из ${expected.toFixed(2)}`,
  );
}

/* 2. Пауза: тик выходит сразу, счётчики не растут. */
{
  const t = makeTimer();
  Object.assign(t, {
    activeId: 2,
    seq: [{ type: "work", duration: 300 }],
    idx: 0,
    remaining: 300000,
    paused: true,
    countdownAnnounced: 0,
    kcalRunMs: 0,
    kcalWalkMs: 0,
  });
  for (let i = 0; i < 50; i++) {
    fakeNow = i * 100;
    t.tick();
  }
  check("на паузе не начисляется", t.kcalRunMs === 0, `${t.kcalRunMs} мс`);
}

/* 3. Переход work -> rest не теряет и не дублирует время. */
{
  const t = makeTimer();
  Object.assign(t, {
    activeId: 3,
    seq: [
      { type: "work", duration: 10 },
      { type: "rest", duration: 10 },
    ],
    idx: 0,
    remaining: 10000,
    paused: false,
    countdownAnnounced: 0,
    finished: false,
    kcalRunMs: 0,
    kcalWalkMs: 0,
  });
  fakeNow = 100;
  t.lastTick = 100;
  for (let i = 1; i <= 250; i++) {
    fakeNow = 100 + i * 100;
    t.tick();
    if (t.finished) break;
  }
  const total = (t.kcalRunMs + t.kcalWalkMs) / 1000;
  check("сумма времени = 20 с", Math.abs(total - 20) <= 0.3, `получено ${total} с`);
  check("обе фазы учтены", t.kcalRunMs > 0 && t.kcalWalkMs > 0);
}

/* 4. Нулевой вес — не NaN и не отрицательное. */
{
  const t = makeTimer();
  t.cw = 0;
  t.kcalRunMs = 60000;
  check("вес 0 -> 0 ккал", t.kcalBurned === 0, String(t.kcalBurned));
}

console.log(failed ? `\n${failed} проверок упало` : "\nвсе проверки прошли");
process.exit(failed ? 1 : 0);
