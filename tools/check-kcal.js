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

/* 5. Подготовка и успокоение в расход не идут: считаются только
      работа (бег) и отдых (ходьба). */
{
  const t = makeTimer();
  Object.assign(t, {
    activeId: "w",
    seq: [
      { type: "prep", duration: 10 },
      { type: "work", duration: 30 },
      { type: "rest", duration: 15 },
      { type: "cooldown", duration: 30 },
    ],
    idx: 0,
    remaining: 10000,
    paused: false,
    finished: false,
    countdownAnnounced: 0,
    kcalRunMs: 0,
    kcalWalkMs: 0,
  });
  fakeNow = 0;
  t.lastTick = 0;
  for (let i = 0; i < 900; i++) {
    fakeNow += 100;
    t.tick();
    if (t.finished) break;
  }
  check("работа учтена целиком", Math.abs(t.kcalRunMs - 30000) <= 200, `${t.kcalRunMs} мс`);
  check("отдых учтён целиком", Math.abs(t.kcalWalkMs - 15000) <= 200, `${t.kcalWalkMs} мс`);
  const exp = ((9 * 30000 + 3.5 * 15000) / 60000) * 3.5 * 88 / 200;
  check(
    "расход без подготовки/успокоения",
    Math.abs(t.kcalBurned - exp) < 0.05,
    `${t.kcalBurned.toFixed(3)} из ${exp.toFixed(3)}`,
  );
  check("на финише оценка = фактическому расходу", Math.abs(t.workoutKcal - t.kcalBurned) < 0.05);
}

/* 6. Оценка за тренировку: весь план минус подготовка/успокоение. */
{
  const t = makeTimer();
  Object.assign(t, {
    activeId: "w",
    seq: [
      { type: "prep", duration: 10 },
      { type: "work", duration: 30 },
      { type: "rest", duration: 15 },
      { type: "work", duration: 30 },
      { type: "cooldown", duration: 30 },
    ],
    idx: 0,
    remaining: 10000,
    finished: false,
    kcalRunMs: 0,
    kcalWalkMs: 0,
  });
  const exp = ((9 * 60000 + 3.5 * 15000) / 60000) * 3.5 * 88 / 200;
  check("оценка всей тренировки", Math.abs(t.workoutKcal - exp) < 0.01, `${t.workoutKcal} из ${exp}`);
}

/* 7. Пропуск интервала уменьшает оценку за тренировку. */
{
  const t = makeTimer();
  Object.assign(t, {
    activeId: "w",
    seq: [
      { type: "work", duration: 30 },
      { type: "rest", duration: 15 },
      { type: "work", duration: 30 },
    ],
    idx: 0,
    remaining: 30000,
    finished: false,
    kcalRunMs: 0,
    kcalWalkMs: 0,
  });
  const full = ((9 * 60000 + 3.5 * 15000) / 60000) * 3.5 * 88 / 200;
  check("полный план = оценка целиком", Math.abs(t.workoutKcal - full) < 0.01, `${t.workoutKcal} из ${full}`);
  // пропускаем отдых: idx 1 -> 2, остаётся только вторая работа
  t.idx = 2;
  t.remaining = 30000;
  const skipped = (9 * 30000 / 60000) * 3.5 * 88 / 200;
  check("после пропуска оценка ниже", t.workoutKcal < full - 0.5, `skip ${t.workoutKcal}, full ${full}`);
  check("после пропуска = только работа", Math.abs(t.workoutKcal - skipped) < 0.01, `${t.workoutKcal} из ${skipped}`);
}

/* 8. Оценка по настройкам таймера (kcalFor): только работа и отдых,
      без подготовки и успокоения, и совпадает с планом последовательности. */
{
  const t = makeTimer();
  const settings = {
    prep: 10,
    work: 30,
    rest: 15,
    cycles: 8,
    sets: 3,
    setRest: 60,
    cooldown: 30,
  };
  const timer = { id: "t1", settings };
  const exp = ((9 * 720000 + 3.5 * 435000) / 60000) * 3.5 * 88 / 200;
  check("kcalFor: дефолтный план", Math.abs(t.kcalFor(timer) - exp) < 0.01, `${t.kcalFor(timer)} из ${exp}`);

  const n = t.norm(settings);
  const seq = t.buildSequence(n);
  let runMs = 0, walkMs = 0;
  for (const p of seq) {
    if (p.type === "work") runMs += p.duration * 1000;
    else if (p.type === "rest" || p.type === "setrest") walkMs += p.duration * 1000;
  }
  const expSeq = ((9 * runMs + 3.5 * walkMs) / 60000) * 3.5 * 88 / 200;
  check("kcalFor = плану последовательности", Math.abs(t.kcalFor(timer) - expSeq) < 0.01, `${t.kcalFor(timer)} из ${expSeq}`);

  // подготовка и успокоение на оценку не влияют
  timer.settings = { prep: 300, work: 30, rest: 0, cycles: 1, sets: 1, setRest: 0, cooldown: 300 };
  const exp2 = (9 * 30000 / 60000) * 3.5 * 88 / 200;
  check("kcalFor: без подготовки/успокоения", Math.abs(t.kcalFor(timer) - exp2) < 0.01, `${t.kcalFor(timer)} из ${exp2}`);
}

console.log(failed ? `\n${failed} проверок упало` : "\nвсе проверки прошли");
process.exit(failed ? 1 : 0);
