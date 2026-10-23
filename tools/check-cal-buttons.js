/* tools/check-cal-buttons.js — проверка кнопок корректировки калорийности
   в дневнике веса: «Снизить на 10%» при росте веса (gainDetected)
   и «Добавить 5%» после достижения цели при падении (lossAfterGoal).

   Запуск:  node tools/check-cal-buttons.js

   Модуль калькулятора — не ES-модуль, поэтому поднимаем минимум окружения. */

const path = require("path");

global.window = { FLC: {} };
global.document = { addEventListener() {} };

require(path.join(__dirname, "..", "assets", "calc", "calc.app.js"));

function makeCalc() {
  const o = {};
  Object.defineProperties(o, Object.getOwnPropertyDescriptors(window.FLC.calc()));
  return o;
}

let failed = 0;
const check = (name, ok, detail) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  if (!ok) failed++;
};

const hist = (...pairs) => pairs.map(([d, w]) => ({ d, w }));

/* ===== снижение при росте (gainDetected) ===== */

/* 1. Рост веса: 3 записи подряд выше якоря -> кнопка. */
{
  const c = makeCalc();
  c.history = hist(
    ["2026-01-01", 100],
    ["2026-01-02", 100.5],
    ["2026-01-03", 101],
    ["2026-01-04", 101.5],
  );
  check("рост 3 дня от первого замера", c.gainDetected === true);
}

/* 2. Рост, но ниже первого замера — не срабатывает (нет повышения от якоря). */
{
  const c = makeCalc();
  c.history = hist(
    ["2026-01-01", 100],
    ["2026-01-02", 99],
    ["2026-01-03", 99.5],
    ["2026-01-04", 100],
  );
  check("вес не выше первого замера", c.gainDetected === false);
}

/* 3. Меньше трёх записей — кнопки нет. */
{
  const c = makeCalc();
  c.history = hist(["2026-01-01", 100], ["2026-01-02", 101]);
  check("две записи", c.gainDetected === false);
  c.history = [];
  check("история пуста", c.gainDetected === false);
}

/* 4. Якорь — последнее снижение калорийности, а не первый замер. */
{
  const c = makeCalc();
  c.lastCut = "2026-01-10";
  c.history = hist(
    ["2026-01-01", 100],
    ["2026-01-10", 95],
    ["2026-01-11", 95.5],
    ["2026-01-12", 96],
    ["2026-01-13", 96.5],
  );
  check("рост после снижения калорийности", c.gainDetected === true);
}

/* 5. После снижения ещё не набралось трёх записей — кнопки нет. */
{
  const c = makeCalc();
  c.lastCut = "2026-01-10";
  c.history = hist(
    ["2026-01-01", 100],
    ["2026-01-10", 95],
    ["2026-01-11", 95.5],
  );
  check("после снижения <3 записей", c.gainDetected === false);
}

/* 6. Падение ниже якоря обнуляет серию роста. */
{
  const c = makeCalc();
  c.history = hist(
    ["2026-01-01", 100],
    ["2026-01-02", 99],
    ["2026-01-03", 99.5],
    ["2026-01-04", 100],
    ["2026-01-05", 100.5],
    ["2026-01-06", 101],
  );
  check("серия прервана уровнем якоря", c.gainDetected === false);
}

/* ===== добавка после цели (lossAfterGoal) ===== */

/* 7. Цель достигнута, три падения подряд -> кнопка. */
{
  const c = makeCalc();
  c.tw = 80;
  c.mode = "manual";
  c.history = hist(
    ["2026-01-01", 82],
    ["2026-01-02", 80],
    ["2026-01-03", 79.8],
    ["2026-01-04", 79.7],
    ["2026-01-05", 79.6],
  );
  check("после цели три падения подряд", c.lossAfterGoal === true);
}

/* 8. Вес ниже цели, но не падает — кнопки нет. */
{
  const c = makeCalc();
  c.tw = 80;
  c.mode = "manual";
  c.history = hist(
    ["2026-01-01", 82],
    ["2026-01-02", 80],
    ["2026-01-03", 79.8],
    ["2026-01-04", 79.8],
    ["2026-01-05", 79.7],
  );
  check("плато прерывает падение", c.lossAfterGoal === false);
}

/* 9. Цель ещё не достигнута (вес выше цели) — кнопки нет. */
{
  const c = makeCalc();
  c.tw = 75;
  c.mode = "manual";
  c.history = hist(
    ["2026-01-01", 82],
    ["2026-01-02", 81],
    ["2026-01-03", 80],
    ["2026-01-04", 79],
    ["2026-01-05", 78],
  );
  check("цель не достигнута", c.lossAfterGoal === false);
}

/* 10. Мало записей для трёх падений. */
{
  const c = makeCalc();
  c.tw = 80;
  c.mode = "manual";
  c.history = hist(
    ["2026-01-01", 82],
    ["2026-01-02", 80],
    ["2026-01-03", 79.8],
  );
  check("три записи (два падения)", c.lossAfterGoal === false);
}

/* 11. Без цели кнопки нет. */
{
  const c = makeCalc();
  c.history = hist(
    ["2026-01-01", 82],
    ["2026-01-02", 80],
    ["2026-01-03", 79.8],
    ["2026-01-04", 79.7],
    ["2026-01-05", 79.6],
  );
  check("цель не задана", c.lossAfterGoal === false);
}

/* ===== действия кнопок ===== */

const silent = (c) => {
  c.kick = () => {};
  c.queueSave = () => {};
  c.showToast = () => {};
};

/* 12. Снижение: ×0,9, якорь обновляется. */
{
  const c = makeCalc();
  silent(c);
  c.cw = 100;
  c.calCut = 1;
  c.cutCalories();
  check("множитель 0,9", c.calCut === 0.9, String(c.calCut));
  check("норма снижена на 10%", c.tCal === 2250, String(c.tCal));
  check("якорь = сегодня", typeof c.lastCut === "string" && /^\d{4}-\d{2}-\d{2}$/.test(c.lastCut));
}

/* 13. Добавка: ×1,05, повторное нажатие копит. */
{
  const c = makeCalc();
  silent(c);
  c.cw = 100;
  c.calCut = 1;
  c.addCalories();
  check("множитель 1,05", c.calCut === 1.05, String(c.calCut));
  check("норма повышена на 5%", c.tCal === 2625, String(c.tCal));
  c.addCalories();
  check("повторная добавка 1,1", c.calCut === 1.1, String(c.calCut));
}

/* 14. Снижение после добавки идёт от текущей нормы. */
{
  const c = makeCalc();
  silent(c);
  c.cw = 100;
  c.calCut = 1.1;
  c.cutCalories();
  check("снижение от 1,1 -> 0,99", c.calCut === 0.99, String(c.calCut));
  check("снижение ставит якорь lastCalChange", typeof c.lastCalChange === "string" && /^\d{4}-\d{2}-\d{2}$/.test(c.lastCalChange));
}

/* ===== медленное снижение (slowLossDetected) ===== */

const withGoal = (c, goal = 80) => {
  c.tw = goal;
  c.mode = "manual";
};

/* 15. Месячный темп ниже нормы (<2%) при снижении -> кнопка. */
{
  const c = makeCalc();
  withGoal(c);
  c.history = hist(
    ["2026-01-01", 100],
    ["2026-01-02", 99.95],
    ["2026-01-03", 99.9],
    ["2026-01-04", 99.9],
  );
  // падение 0,1 кг за 3 дня = 0,1% -> ~1% в месяц < 2%
  check("медленное снижение", c.slowLossDetected === true);
}

/* 16. Темп в норме (2–4% в месяц) — кнопки нет. */
{
  const c = makeCalc();
  withGoal(c);
  c.history = hist(
    ["2026-01-01", 100],
    ["2026-01-02", 99.9],
    ["2026-01-03", 99.8],
    ["2026-01-04", 99.7],
  );
  // 0,3% за 3 дня -> ~3% в месяц — норма
  check("нормальный темп", c.slowLossDetected === false);
}

/* 17. Нет снижения (рост/плато) — кнопки нет. */
{
  const c = makeCalc();
  withGoal(c);
  c.history = hist(
    ["2026-01-01", 100],
    ["2026-01-02", 100],
    ["2026-01-03", 100.2],
    ["2026-01-04", 100.3],
  );
  check("рост веса", c.slowLossDetected === false);
  c.history = hist(
    ["2026-01-01", 100],
    ["2026-01-02", 100],
    ["2026-01-03", 100],
    ["2026-01-04", 100],
  );
  check("плато", c.slowLossDetected === false);
}

/* 18. Меньше трёх записей после якоря — кнопки нет. */
{
  const c = makeCalc();
  withGoal(c);
  c.history = hist(["2026-01-01", 100], ["2026-01-02", 99.9]);
  check("две записи", c.slowLossDetected === false);
}

/* 19. Якорь — последняя корректировка калорийности (в любую сторону). */
{
  const c = makeCalc();
  withGoal(c);
  c.lastCalChange = "2026-01-10";
  c.history = hist(
    ["2026-01-01", 100],
    ["2026-01-10", 95],
    ["2026-01-11", 94.95],
    ["2026-01-13", 94.9],
  );
  // от 95 до 94,9 за 3 дня = 0,105% -> ~1% в месяц < 2%
  check("после корректировки калорийности", c.slowLossDetected === true);
}

/* 20. Цель достигнута — кнопка медленного снижения не нужна. */
{
  const c = makeCalc();
  withGoal(c, 100);
  c.history = hist(
    ["2026-01-01", 101],
    ["2026-01-02", 100.9],
    ["2026-01-03", 100.8],
    ["2026-01-04", 100.7],
  );
  check("цель достигнута", c.slowLossDetected === false);
}

/* 21. Без цели — кнопки нет. */
{
  const c = makeCalc();
  c.tw = 0;
  c.mode = "manual";
  c.history = hist(
    ["2026-01-01", 100],
    ["2026-01-02", 99.95],
    ["2026-01-03", 99.9],
    ["2026-01-04", 99.9],
  );
  check("цель не задана", c.slowLossDetected === false);
}

/* 22. Мягкое снижение на 5%: множитель 0,95 и якоря обновляются. */
{
  const c = makeCalc();
  silent(c);
  c.cw = 100;
  c.calCut = 1;
  c.trimCalories();
  check("множитель 0,95", c.calCut === 0.95, String(c.calCut));
  check("норма снижена на 5%", c.tCal === 2375, String(c.tCal));
  check("якорь lastCut = сегодня", typeof c.lastCut === "string" && /^\d{4}-\d{2}-\d{2}$/.test(c.lastCut));
  check("якорь lastCalChange = сегодня", typeof c.lastCalChange === "string" && /^\d{4}-\d{2}-\d{2}$/.test(c.lastCalChange));
  c.trimCalories();
  check("повторное снижение 0,9", c.calCut === 0.9, String(c.calCut));
}

console.log(failed ? `\n${failed} проверок упало` : "\nвсе проверки прошли");
process.exit(failed ? 1 : 0);
