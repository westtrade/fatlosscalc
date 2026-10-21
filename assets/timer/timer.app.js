/* assets/timer/timer.app.js — интервальный таймер: фазы подготовки, работы,
   отдыха, паузы между сетами и успокоения. Шаблоны, свои таймеры,
   drag-n-drop порядка, звук, вибрация, Wake Lock, импорт/экспорт JSON. */
(function () {
  "use strict";

  window.FLC = window.FLC || {};

  window.FLC.timer = function timerApp() {
    // геометрия кольца прогресса
    const RING_R = 90, RING_C = 2 * Math.PI * RING_R;
    const LP_R = 95, LP_C = 2 * Math.PI * LP_R;

    // Расход: работа — умеренный бег, все паузы — ходьба.
    // ккал/мин = MET × 3,5 × вес(кг) / 200
    const MET_RUN = 9;
    const MET_WALK = 3.5;

    return {


/* ================= ТАЙМЕР (перенесён из timer.html) ================= */

          C: RING_C,


          C2: LP_C,



          /* ── Описание полей ── */
          fieldDefs: [
{
  key: "prep",
  label: "Подготовка",
  hint: "сек",
  step: 5,
  min: 0,
  max: 3600,
},
{
  key: "work",
  label: "Работа",
  hint: "сек",
  step: 5,
  min: 0,
  max: 3600,
},
{
  key: "rest",
  label: "Отдых",
  hint: "сек",
  step: 5,
  min: 0,
  max: 3600,
},
{
  key: "cycles",
  label: "Циклы",
  hint: "работа + отдых",
  step: 1,
  min: 1,
  max: 100,
},
{
  key: "sets",
  label: "Сеты",
  hint: "групп",
  step: 1,
  min: 1,
  max: 50,
},
{
  key: "setRest",
  label: "Между сетами",
  hint: "сек",
  step: 5,
  min: 0,
  max: 3600,
},
{
  key: "cooldown",
  label: "Успокоиться",
  hint: "сек",
  step: 5,
  min: 0,
  max: 3600,
},
          ],



          templates: [
{
  name: "Дефолт",
  settings: {
    prep: 10,
    work: 30,
    rest: 15,
    cycles: 8,
    sets: 3,
    setRest: 60,
    cooldown: 30,
  },
},
{
  name: "Tabata",
  settings: {
    prep: 10,
    work: 20,
    rest: 10,
    cycles: 8,
    sets: 1,
    setRest: 0,
    cooldown: 20,
  },
},
{
  name: "HIIT",
  settings: {
    prep: 15,
    work: 40,
    rest: 20,
    cycles: 6,
    sets: 3,
    setRest: 60,
    cooldown: 30,
  },
},
{
  name: "EMOM",
  settings: {
    prep: 10,
    work: 45,
    rest: 15,
    cycles: 10,
    sets: 1,
    setRest: 0,
    cooldown: 30,
  },
},
{
  name: "Пилометрия",
  settings: {
    prep: 15,
    work: 30,
    rest: 30,
    cycles: 10,
    sets: 2,
    setRest: 90,
    cooldown: 60,
  },
},
          ],



          /* ── Модель ── */
          timers: [],



          /* ── Стейт активного таймера ── */
          activeId: null,


          finished: false,



          seq: [],


          idx: 0,


          remaining: 0,


          paused: false,


          lastTotal: 0,


          lastTick: 0,


          timerId: null,


          elapsedAtStop: 0,


          countdownAnnounced: 0,


          /* ── Расход калорий: миллисекунды по типу фазы ── */
          kcalRunMs: 0,


          kcalWalkMs: 0,





          /* ── Ресурсы ── */
          audioCtx: null,


          anchorOsc: null,


          wakeLock: null,



          /* ── Long press ── */
          longPressRAF: null,


          longPressActive: false,


          longPressFired: false,


          longPressProgress: 0,



          /* ── Drag ── */
          dragId: null,


          dragStartY: 0,


          dragOriginalIndex: -1,



          /* ── Undo ── */
          undo: null,


          undoTimerId: null,



          /* ── Импорт ── */





          /* ═══════════ ИНИЦИАЛИЗАЦИЯ ═══════════ */
          initTimer() {
try {
  const raw = localStorage.getItem("itimer.timers.v2");
  if (raw) {
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) this.timers = arr;
  }
} catch (e) {}

if (!this.timers.length) {
  const t = this.createTimer();
  t.open = true;
  this.timers = [t];
}

this.$watch("timers", () => this.persist(), { deep: true });

window.addEventListener("keydown", this.onKeydown.bind(this));
window.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && this.activeId)
    this.requestWakeLock();
});
          },



          persist() {
try {
  localStorage.setItem(
    "itimer.timers.v2",
    JSON.stringify(this.timers),
  );
} catch (e) {}
          },



          /* ═══════════ ГОРЯЧИЕ КЛАВИШИ ═══════════ */
          onKeydown(e) {
if (this.route !== "timer") return;
if (e.key === "Escape") {
  if (this.activeId !== null) {
    this.stopTimerWithUndo();
    return;
  }
  this.timers.forEach((t) => (t.open = false));
  return;
}
if (this.activeId === null || this.finished) return;
if (e.code === "Space") {
  e.preventDefault();
  this.togglePause();
} else if (e.key === "ArrowRight") {
  e.preventDefault();
  this.skip();
} else if (e.key === "ArrowLeft") {
  e.preventDefault();
  this.prev();
} else if (e.key === "+" || e.key === "=") {
  this.addMinute();
}
          },



          /* ═══════════ СОЗДАНИЕ ═══════════ */
          createTimer(settings) {
return {
  id:
    "t" +
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 6),
  name: "Таймер " + (this.timers.length + 1),
  settings: settings
    ? { ...settings }
    : {
        prep: 10,
        work: 30,
        rest: 15,
        cycles: 8,
        sets: 3,
        setRest: 60,
        cooldown: 30,
      },
  saved: false,
  open: false,
  savingPulse: false,
};
          },



          get hasUnsaved() {
return this.timers.some((t) => !t.saved);
          },



          addFromTemplate(tpl) {
if (this.hasUnsaved) return;
const t = this.createTimer(tpl.settings);
t.name = tpl.name;
t.saved = true;
this.timers.push(t);
this.scrollToTimer(t.id);
this.vibrate(15);
          },



          duplicateTimer(src) {
const t = this.createTimer({ ...src.settings });
t.name = src.name + " (копия)";
t.saved = true;
const idx = this.timers.findIndex((x) => x.id === src.id);
this.timers.splice(idx + 1, 0, t);
this.vibrate(15);
          },



          deleteTimer(id) {
const idx = this.timers.findIndex((t) => t.id === id);
if (idx === -1) return;
const [removed] = this.timers.splice(idx, 1);

if (this.activeId === id) this.stopTimer();
if (!this.timers.length) {
  const t = this.createTimer();
  t.open = true;
  this.timers = [t];
}

// Undo
this.showUndo("Таймер удалён", () => {
  this.timers.splice(Math.min(idx, this.timers.length), 0, removed);
});
          },



          saveTimer(t) {
if (t.savingPulse) return;
t.savingPulse = true;
this.vibrate(20);
setTimeout(() => {
  t.saved = true;
  t.open = false;
  t.savingPulse = false;
}, 450);
          },



          toggleSettings(t) {
const wasOpen = t.open;
this.timers.forEach((x) => (x.open = false));
t.open = !wasOpen;
          },



          scrollToTimer(id) {
this.$nextTick(() => {
  const el = document.querySelector(`[data-timer-id="${id}"]`);
  if (el)
    el.scrollIntoView({ behavior: "smooth", block: "center" });
});
          },



          /* ═══════════ НОРМАЛИЗАЦИЯ ═══════════ */
          norm(s) {
const int = (v, min, max) => {
  let n = Math.floor(Number(v));
  if (!isFinite(n)) n = min;
  return Math.min(max, Math.max(min, n));
};
return {
  prep: int(s.prep, 0, 3600),
  work: int(s.work, 0, 3600),
  rest: int(s.rest, 0, 3600),
  cycles: int(s.cycles, 1, 100),
  sets: int(s.sets, 1, 50),
  setRest: int(s.setRest, 0, 3600),
  cooldown: int(s.cooldown, 0, 3600),
};
          },



          totalFor(t) {
const n = this.norm(t.settings);
return (
  n.prep +
  n.sets * n.cycles * n.work +
  n.sets * Math.max(0, n.cycles - 1) * n.rest +
  Math.max(0, n.sets - 1) * n.setRest +
  n.cooldown
);
          },



          intervalsFor(t) {
const n = this.norm(t.settings);
let c = 0;
if (n.prep > 0) c++;
if (n.work > 0) c += n.sets * n.cycles;
if (n.rest > 0) c += n.sets * Math.max(0, n.cycles - 1);
if (n.setRest > 0) c += Math.max(0, n.sets - 1);
if (n.cooldown > 0) c++;
return c;
          },



          numsSummary(t) {
const n = this.norm(t.settings);
return `${n.work}/${n.rest} × ${n.cycles}`;
          },



          adjust(t, key, dir) {
const f = this.fieldDefs.find((x) => x.key === key);
if (!f) return;
const cur = Number(t.settings[key]) || 0;
let next = cur + dir * f.step;
next = Math.max(f.min, Math.min(f.max, next));
t.settings[key] = next;
this.vibrate(6);
          },



          clampField(t, key) {
const f = this.fieldDefs.find((x) => x.key === key);
if (!f) return;
let v = Number(t.settings[key]);
if (!isFinite(v)) v = f.min;
v = Math.floor(v);
v = Math.max(f.min, Math.min(f.max, v));
t.settings[key] = v;
          },



          /* ═══════════ СОСТОЯНИЕ ═══════════ */
          get activeTimer() {
return this.timers.find((t) => t.id === this.activeId) || null;
          },


          isActive(t) {
return this.activeId === t.id;
          },



          get current() {
return this.seq[this.idx] || null;
          },


          get nextPhase() {
return this.seq[this.idx + 1] || null;
          },


          get prevPhase() {
return this.idx > 0 ? this.seq[this.idx - 1] : null;
          },


          get remainingSeconds() {
return Math.max(0, Math.ceil(this.remaining / 1000));
          },


          get kcalBurned() {
const kg = this.n(this.cw);
if (!kg) return 0;
const perMin = (MET_RUN * this.kcalRunMs + MET_WALK * this.kcalWalkMs) / 60000;
return (perMin * 3.5 * kg) / 200;
          },


          get elapsedSeconds() {
return Math.max(0, this.lastTotal - this.remainingTotal());
          },



          get progress() {
const c = this.current;
if (!c) return 0;
const total = c.duration * 1000;
return Math.min(1, Math.max(0, 1 - this.remaining / total));
          },



          get overallProgress() {
if (!this.seq.length) return 0;
const totalMs = this.seq.reduce((a, p) => a + p.duration * 1000, 0);
let done = 0;
for (let i = 0; i < this.idx; i++)
  done += this.seq[i].duration * 1000;
done += this.seq[this.idx].duration * 1000 - this.remaining;
return Math.min(1, Math.max(0, done / totalMs));
          },



          remainingTotal() {
if (!this.seq.length) return 0;
let total = this.remaining;
for (let i = this.idx + 1; i < this.seq.length; i++)
  total += this.seq[i].duration * 1000;
return total / 1000;
          },



          get subLabel() {
const c = this.current;
if (!c) return "";
const act = this.activeTimer;
const n = act ? this.norm(act.settings) : null;
if (c.type === "setrest")
  return `Сет ${c.set} из ${n ? n.sets : "?"}`;
if (c.set && c.cycle)
  return `Сет ${c.set}/${n ? n.sets : "?"} · Цикл ${c.cycle}/${n ? n.cycles : "?"}`;
if (c.set) return `Сет ${c.set}/${n ? n.sets : "?"}`;
return "";
          },



          get phaseStroke() {
const t = this.current && this.current.type;
return (
  {
    prep: "stroke-sky",
    work: "stroke-acid",
    rest: "stroke-ember",
    setrest: "stroke-rose",
    cooldown: "stroke-mint",
  }[t] || "stroke-line"
);
          },



          typeColor(type) {
return (
  {
    prep: "text-sky",
    work: "text-acid",
    rest: "text-ember",
    setrest: "text-rose",
    cooldown: "text-mint",
  }[type] || "text-slate-300"
);
          },



          /**
           * Приглушённый цвет дорожки сегмента (ещё не пройденная часть).
           * Имена классов записаны целиком: Tailwind не находит классы,
           * собранные склейкой строк, и эти цвета не попали бы в сборку.
           */
          typeBarDim(type) {
            return (
              {
                prep: "bg-sky/20",
                work: "bg-acid/20",
                rest: "bg-ember/20",
                setrest: "bg-rose/20",
                cooldown: "bg-mint/20",
              }[type] || "bg-slate-600/20"
            );
          },

          /** Цвет сегмента прогресс-бара для типа фазы. */
          typeBar(type) {
            return (
              {
                prep: "bg-sky",
                work: "bg-acid",
                rest: "bg-ember",
                setrest: "bg-rose",
                cooldown: "bg-mint",
              }[type] || "bg-slate-600"
            );
          },

          /**
           * Сегменты прогресс-бара под таймером.
           *
           * Ширина сегмента — доля его длительности в общей, поэтому
           * размер на экране честно отражает длительность фазы.
           * Цвет сегмента — всегда цвет его типа фазы.
           *
           * Две ловушки, из-за которых это раньше ломалось:
           *
           * 1. Соседние фазы разных типов нельзя сливать в один
           *    сегмент: у слитого сегмента цвет приходится выбирать
           *    «по большинству», и тогда работа (30с) съедала отдых
           *    (15с) — весь бар становился acid. Поэтому сначала
           *    склеиваются только соседние фазы ОДНОГО типа (runs).
           *
           * 2. Промежутки между сегментами (gap) отбирали у бара
           *    фиксированные 1px на каждый сегмент — при 40 сегментах
           *    это 10% ширины, и пропорции уезжали. Промежутков нет:
           *    ширины сегментов складываются ровно в ширину бара.
           *
           * Фаз может быть больше тысячи (100 циклов × 50 сетов), а
           * дорожек на телефоне влезает ~40. Поэтому runs выше
           * BAR_MAX_SEGMENTS объединяются в группы, но внутри группы
           * каждый тип остаётся отдельным куском со своей шириной —
           * цвет и доли не теряются.
           */
          get barSegments() {
            const seq = this.seq;
            if (!seq.length) return [];
            const total = seq.reduce((a, p) => a + p.duration, 0);
            if (total <= 0) return [];

            // 1. соседние фазы одного типа — один отрезок
            const runs = [];
            for (const p of seq) {
              const last = runs[runs.length - 1];
              if (last && last.type === p.type) last.duration += p.duration;
              else runs.push({ type: p.type, duration: p.duration });
            }

            // 2. слишком много отрезков — объединяем в группы,
            //    сохраняя внутри каждой куски по типам
            const BAR_MAX_SEGMENTS = 40;
            const groups = [];
            if (runs.length <= BAR_MAX_SEGMENTS) {
              for (const r of runs) groups.push([r]);
            } else {
              const k = BAR_MAX_SEGMENTS;
              const base = Math.floor(runs.length / k);
              const extra = runs.length % k;
              let i = 0;
              for (let g = 0; g < k; g++) {
                const size = base + (g < extra ? 1 : 0);
                const byType = {};
                const order = [];
                for (let n = 0; n < size && i < runs.length; n++, i++) {
                  const t = runs[i].type;
                  if (!(t in byType)) {
                    byType[t] = 0;
                    order.push(t);
                  }
                  byType[t] += runs[i].duration;
                }
                groups.push(order.map((t) => ({ type: t, duration: byType[t] })));
              }
            }

            // 3. ширина группы и доля заливки каждого куска внутри неё
            const done = this.overallProgress * total;
            let cursor = 0;
            const out = [];
            for (const slices of groups) {
              const groupDuration = slices.reduce((a, s) => a + s.duration, 0);
              if (groupDuration <= 0) continue;
              const parts = slices.map((s) => {
                const start = cursor;
                cursor += s.duration;
                return {
                  type: s.type,
                  width: (s.duration / groupDuration) * 100,
                  fill:
                    Math.min(1, Math.max(0, (done - start) / s.duration)) * 100,
                };
              });
              out.push({
                width: (groupDuration / total) * 100,
                parts,
              });
            }
            return out;
          },




          /* ═══════════ ЗАПУСК ═══════════ */
          startTimer(t) {
if (this.activeId && this.activeId !== t.id) this.stopTimer();

const n = this.norm(t.settings);
const seq = this.buildSequence(n);
if (!seq.length) return;

t.open = false;
this.finished = false;
this.activeId = t.id;
this.seq = seq;
this.idx = 0;
this.remaining = seq[0].duration * 1000;
this.lastTotal = seq.reduce((a, p) => a + p.duration, 0);
this.paused = false;
this.countdownAnnounced = 0;
this.kcalRunMs = 0;
this.kcalWalkMs = 0;
this.lastTick = performance.now();

this.unlockAudio();
this.startAnchor();
this.requestWakeLock();
this.beep(880, 0.1);
this.vibrate(30);

if (this.timerId) clearInterval(this.timerId);
this.timerId = setInterval(() => this.tick(), 100);
          },



          restartTimer() {
const t = this.activeTimer;
if (!t) return;
this.stopTimer(false);
this.startTimer(t);
          },



          /* ═══════════ ТИК ═══════════ */
          tick() {
if (!this.activeId || this.paused) return;

const now = performance.now();
let dt = now - this.lastTick;
this.lastTick = now;
if (dt < 0 || dt > 2000) dt = 100;

const beforeRemaining = this.remaining;
this.remaining -= dt;

// Расход считаем по фазе, в которой прошёл тик:
// работа — умеренный бег, все паузы — ходьба.
const phase = this.current;
if (phase) {
  const ms = Math.min(dt, Math.max(0, beforeRemaining));
  if (phase.type === "work") this.kcalRunMs += ms;
  else this.kcalWalkMs += ms;
}

// Отсчёт последних 3 секунд
const secNow = Math.ceil(Math.max(0, this.remaining) / 1000);
if (
  secNow <= 3 &&
  secNow >= 1 &&
  secNow !== this.countdownAnnounced
) {
  this.countdownAnnounced = secNow;
  this.beep(secNow === 1 ? 900 : 700, 0.08);
  this.vibrate(secNow === 1 ? 25 : 15);
}

let advanced = false;
let lastType = null;
while (this.remaining <= 0) {
  this.idx++;
  if (this.idx >= this.seq.length) {
    this.finish();
    return;
  }
  this.remaining += this.seq[this.idx].duration * 1000;
  advanced = true;
  lastType = this.seq[this.idx].type;
}

if (advanced) {
  this.countdownAnnounced = 0;
  this.onPhaseEnter(lastType);
}
          },



          onPhaseEnter(type) {
// разные паттерны вибрации по фазам
const patterns = {
  prep: [30, 40, 30],
  work: [60, 40, 60],
  rest: [30],
  setrest: [40, 80, 40],
  cooldown: [20, 30, 20],
};
const freqs = {
  prep: 700,
  work: 880,
  rest: 560,
  setrest: 620,
  cooldown: 520,
};
this.vibrate(patterns[type] || [40]);
this.beep(freqs[type] || 700, 0.16);

          },



          /* ═══════════ УПРАВЛЕНИЕ ═══════════ */
          togglePause() {
if (!this.activeId) return;
if (this.paused) {
  this.paused = false;
  this.lastTick = performance.now();
} else {
  this.paused = true;
}
this.vibrate(10);
          },



          skip() {
if (!this.activeId) return;
if (this.idx + 1 >= this.seq.length) {
  this.finish();
  return;
}
this.idx++;
this.remaining = this.seq[this.idx].duration * 1000;
this.lastTick = performance.now();
this.countdownAnnounced = 0;
this.onPhaseEnter(this.seq[this.idx].type);
          },



          prev() {
if (!this.activeId || this.idx <= 0) return;
this.idx--;
this.remaining = this.seq[this.idx].duration * 1000;
this.lastTick = performance.now();
this.countdownAnnounced = 0;
this.onPhaseEnter(this.seq[this.idx].type);
          },



          addMinute() {
if (!this.activeId) return;
const c = this.current;
if (!c) return;
this.remaining += 60000;
c.duration += 60;
this.beep(700, 0.08);
this.vibrate(20);
          },



          finish() {
if (this.timerId) clearInterval(this.timerId);
this.timerId = null;
this.paused = false;
this.finished = true;
this.idx = 0;
this.remaining = 0;
this.stopAnchor();
this.releaseWakeLock();

this.beep(660, 0.15);
setTimeout(() => this.beep(880, 0.15), 170);
setTimeout(() => this.beep(1180, 0.35), 340);
this.vibrate([80, 60, 80, 60, 160]);
          },



          stopTimer(releaseActive = true) {
if (this.timerId) clearInterval(this.timerId);
this.timerId = null;
this.paused = false;
this.finished = false;
this.seq = [];
this.idx = 0;
this.remaining = 0;
if (releaseActive) this.activeId = null;
this.stopAnchor();
this.releaseWakeLock();
          },



          stopTimerWithUndo() {
if (this.activeId === null) return;

// снимок состояния
const snap = {
  id: this.activeId,
  seq: this.seq.map((x) => ({ ...x })),
  idx: this.idx,
  remaining: this.remaining,
  paused: this.paused,
  lastTotal: this.lastTotal,
};
const wasFinished = this.finished;

this.stopTimer();

if (!wasFinished) {
  this.showUndo("Таймер остановлен", () => {
    this.activeId = snap.id;
    this.seq = snap.seq;
    this.idx = snap.idx;
    this.remaining = snap.remaining;
    this.paused = true;
    this.lastTotal = snap.lastTotal;
    this.lastTick = performance.now();
    this.startAnchor();
    this.requestWakeLock();
    if (this.timerId) clearInterval(this.timerId);
    this.timerId = setInterval(() => this.tick(), 100);
  });
}
          },



          /* ═══════════ LONG PRESS ═══════════ */
          startLongPress() {
this.longPressActive = true;
this.longPressFired = false;
this.longPressProgress = 0;

const start = performance.now();
const duration = 600;

const step = (now) => {
  if (!this.longPressActive) return;
  const t = Math.min(1, (now - start) / duration);
  this.longPressProgress = t;
  if (t >= 1) {
    this.longPressFired = true;
    this.vibrate([20, 30, 20]);
    this.stopTimerWithUndo();
    this.longPressActive = false;
    this.longPressProgress = 0;
    return;
  }
  this.longPressRAF = requestAnimationFrame(step);
};
this.longPressRAF = requestAnimationFrame(step);
          },



          endLongPress() {
this.longPressActive = false;
if (this.longPressRAF) {
  cancelAnimationFrame(this.longPressRAF);
  this.longPressRAF = null;
}
const wasFired = this.longPressFired;
this.longPressFired = false;
const wasProgress = this.longPressProgress > 0;
this.longPressProgress = 0;
if (!wasFired && !wasProgress) {
  // одиночный клик
} else if (!wasFired) {
  this.togglePause();
} else {
  this.togglePause();
}
          },



          cancelLongPress() {
this.longPressActive = false;
if (this.longPressRAF) {
  cancelAnimationFrame(this.longPressRAF);
  this.longPressRAF = null;
}
this.longPressFired = false;
this.longPressProgress = 0;
          },



          /* ═══════════ UNDO ═══════════ */
          showUndo(label, restoreFn) {
if (this.undoTimerId) clearTimeout(this.undoTimerId);
this.undo = { label, restore: restoreFn };
this.undoTimerId = setTimeout(() => {
  this.undo = null;
  this.undoTimerId = null;
}, 3500);
          },



          applyUndo() {
if (!this.undo) return;
if (this.undoTimerId) clearTimeout(this.undoTimerId);
const fn = this.undo.restore;
this.undo = null;
this.undoTimerId = null;
fn();
this.vibrate(15);
          },



          /* ═══════════ DRAG-REORDER ═══════════ */
          startDrag(t, e) {
if (this.activeId !== null) return;
if (e.pointerType === "mouse" && e.button !== 0) return;
this.dragId = t.id;
this.dragStartY = e.clientY;
this.dragOriginalIndex = this.timers.findIndex(
  (x) => x.id === t.id,
);

this._dragMove = (ev) => this.onDragMove(ev);
this._dragEnd = () => this.onDragEnd();
window.addEventListener("pointermove", this._dragMove);
window.addEventListener("pointerup", this._dragEnd);
window.addEventListener("pointercancel", this._dragEnd);
document.body.style.userSelect = "none";
          },



          onDragMove(e) {
if (!this.dragId) return;
// Автоскролл если близко к краям
if (e.clientY < 80) window.scrollBy({ top: -10, behavior: "auto" });
else if (e.clientY > window.innerHeight - 80)
  window.scrollBy({ top: 10, behavior: "auto" });

// Найти карточку под указателем
const cards = Array.from(
  document.querySelectorAll("[data-timer-id]"),
);
for (const el of cards) {
  if (el.dataset.timerId === this.dragId) continue;
  const rect = el.getBoundingClientRect();
  if (e.clientY >= rect.top && e.clientY <= rect.bottom) {
    const fromIdx = this.timers.findIndex(
      (x) => x.id === this.dragId,
    );
    const toIdx = this.timers.findIndex(
      (x) => x.id === el.dataset.timerId,
    );
    if (fromIdx !== -1 && toIdx !== -1 && fromIdx !== toIdx) {
      const arr = [...this.timers];
      const [item] = arr.splice(fromIdx, 1);
      arr.splice(toIdx, 0, item);
      this.timers = arr;
    }
    break;
  }
}
          },



          onDragEnd() {
if (!this.dragId) return;
window.removeEventListener("pointermove", this._dragMove);
window.removeEventListener("pointerup", this._dragEnd);
window.removeEventListener("pointercancel", this._dragEnd);
this.dragId = null;
document.body.style.userSelect = "";
          },



          /* ═══════════ ПОСТРОЕНИЕ ПЛАНА ═══════════ */
          buildSequence(n) {
const seq = [];
if (n.prep > 0)
  seq.push({
    type: "prep",
    label: "Подготовка",
    duration: n.prep,
  });
for (let set = 1; set <= n.sets; set++) {
  for (let cyc = 1; cyc <= n.cycles; cyc++) {
    if (n.work > 0)
      seq.push({
        type: "work",
        label: "Работа",
        duration: n.work,
        set,
        cycle: cyc,
      });
    // В последнем цикле сета отдыха нет: дальше идёт отдых между
    // сетами, а после последнего сета — успокоиться или финиш.
    if (n.rest > 0 && cyc < n.cycles)
      seq.push({
        type: "rest",
        label: "Отдых",
        duration: n.rest,
        set,
        cycle: cyc,
      });
  }
  if (set < n.sets && n.setRest > 0) {
    seq.push({
      type: "setrest",
      label: "Отдых между сетами",
      duration: n.setRest,
      set,
    });
  }
}
if (n.cooldown > 0)
  seq.push({
    type: "cooldown",
    label: "Успокоиться",
    duration: n.cooldown,
  });
return seq;
          },



          /* ═══════════ WAKE LOCK ═══════════ */
          async requestWakeLock() {
try {
  if ("wakeLock" in navigator) {
    this.wakeLock = await navigator.wakeLock.request("screen");
  }
} catch (e) {}
          },



          releaseWakeLock() {
if (this.wakeLock) {
  try {
    this.wakeLock.release();
  } catch (e) {}
  this.wakeLock = null;
}
          },



          /* ═══════════ AUDIO ANCHOR ═══════════ */
          unlockAudio() {
try {
  if (!this.audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (Ctx) this.audioCtx = new Ctx();
  }
  if (this.audioCtx && this.audioCtx.state === "suspended")
    this.audioCtx.resume();
} catch (e) {}
          },



          startAnchor() {
try {
  if (!this.audioCtx) return;
  if (this.anchorOsc) return;
  const osc = this.audioCtx.createOscillator();
  const gain = this.audioCtx.createGain();
  osc.type = "sine";
  osc.frequency.value = 40; // почти неслышно
  gain.gain.value = 0.0008; // очень тихо, но держит контекст активным
  osc.connect(gain);
  gain.connect(this.audioCtx.destination);
  osc.start();
  this.anchorOsc = { osc, gain };
} catch (e) {}
          },



          stopAnchor() {
try {
  if (this.anchorOsc) {
    this.anchorOsc.osc.stop();
    this.anchorOsc = null;
  }
} catch (e) {}
          },



          beep(freq, dur) {
try {
  if (!this.audioCtx) return;
  const ctx = this.audioCtx;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  osc.connect(gain);
  gain.connect(ctx.destination);
  const t = ctx.currentTime;
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.28, t + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.start(t);
  osc.stop(t + dur + 0.03);
} catch (e) {}
          },



          vibrate(pattern) {
try {
  if (navigator.vibrate) navigator.vibrate(pattern);
} catch (e) {}
          },



          /* ═══════════ ФОРМАТ ═══════════ */
          fmtTime(sec) {
sec = Math.max(0, Math.round(Number(sec) || 0));
const h = Math.floor(sec / 3600);
const m = Math.floor((sec % 3600) / 60);
const s = sec % 60;
const pad = (v) => String(v).padStart(2, "0");
return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
          }
    };
  };
})();
