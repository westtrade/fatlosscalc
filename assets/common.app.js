/* assets/common.app.js — оболочка приложения.
   Маршрутизация (#/ — калькулятор, #/timer — таймер), тост, работа
   с localStorage и точка сборки компонента из трёх модулей.

   Модули регистрируют себя в window.FLC и объединяются в один
   Alpine-компонент fatCalc: это позволяет держать код раздельно и
   при этом открывать страницу напрямую с диска (file://), где
   ES-модули не работают.

   Собирается в компонент fatCalc вместе с assets/calc/calc.app.js
   и assets/timer/timer.app.js. */
(function () {
  "use strict";

  window.FLC = window.FLC || {};

  window.FLC.common = function commonApp() {
    return {

/* ---------- роутер ---------- */
route: "calc",


toast: { show: false, text: "" },


toastTimer: null,



/* ---------- persistence ---------- */
storage() {
  try {
    const ls = window.localStorage;
    if (!ls) return null;
    // приватный режим / отключённое хранилище — пробуем запись
    const probe = "__flc_probe__";
    ls.setItem(probe, "1");
    ls.removeItem(probe);
    return ls;
  } catch (e) {
    return null;
  }
},



/* ---------- animation ---------- */
init() {
  const restored = this.loadSaved();
  this.histDate = this.todayISO();
  this.loadHistory();

  const d = this.DEFAULTS;
  const differs =
    this.n(this.cw) !== d.cw ||
    this.n(this.tw) !== d.tw ||
    this.n(this.height) !== d.height ||
    this.mode !== d.mode;

  // роутер: начальный маршрут + реакция на изменение хеша
  this.syncRoute();
  window.addEventListener("hashchange", () => this.syncRoute());

  // состояние таймера (localStorage, слушатели, wake lock)
  this.initTimer();

  // блокируем прокрутку фона, только когда полноэкранный таймер
  // действительно открыт И мы находимся на его маршруте
  this.$watch("activeId", () => this.syncBodyLock());
  this.$watch("route", () => this.syncBodyLock());
  this.syncBodyLock();

  this.snap();
  this.kick();
  ["cw", "tw", "height", "mode", "dietId"].forEach((k) =>
    this.$watch(k, () => {
      this.kick();
      this.queueSave();
    }),
  );

  // не теряем правку, сделанную в последние 300 мс перед закрытием
  const flush = () => {
    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
      this._saveTimer = null;
      this.save();
    }
  };
  window.addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });

  if (restored && differs) {
    this.$nextTick(() =>
      this.showToast("Восстановили ваши прошлые значения"),
    );
  }
  const rotate = () => {
    this.spin = (this.spin + 0.18) % 360;
    requestAnimationFrame(rotate);
  };
  rotate();
},



showToast(text) {
  this.toast.text = text;
  this.toast.show = true;
  clearTimeout(this.toastTimer);
  this.toastTimer = setTimeout(
    () => (this.toast.show = false),
    2400,
  );
},


/* ================= РОУТЕР ================= */
syncRoute() {
  const h = location.hash || "";
  this.route = h.startsWith("#/timer") ? "timer" : "calc";
},



setRoute(r) {
  if (r === this.route) {
    // повторный клик — прокрутить наверх
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }
  if (r === "timer") {
    location.hash = "#/timer";
  } else {
    // убираем хеш-маршрут, не ломая якоря разделов
    location.hash = "#/";
  }
  this.syncRoute();
  window.scrollTo({ top: 0, behavior: "auto" });
},



syncBodyLock() {
  const lock = this.route === "timer" && this.activeId !== null;
  document.body.style.overflow = lock ? "hidden" : "";
},



get runningTimer() {
  if (this.activeId === null || this.finished) return null;
  return this.timers.find((t) => t.id === this.activeId) || null;
},



get runningRemaining() {
  return this.remainingSeconds;
}
    };
  };

  /**
   * Собирает объект из нескольких, сохраняя геттеры как геттеры.
   * Object.assign здесь не подходит: он копирует значения и тем самым
   * ВЫЧИСЛЯЕТ геттеры (например runningTimer обращается к this.timers,
   * которого в модуле оболочки нет). Копируем дескрипторы.
   */
  function mergeModules(...sources) {
    const target = {};
    for (const src of sources) {
      Object.defineProperties(target, Object.getOwnPropertyDescriptors(src));
    }
    return target;
  }

  // Точка сборки: три модуля -> один компонент.
  // Скрипты подключены до alpine.js, поэтому подписка успевает к alpine:init.
  document.addEventListener("alpine:init", () => {
    Alpine.data("fatCalc", () =>
      mergeModules(
        window.FLC.common(),
        window.FLC.calc(),
        window.FLC.timer(),
      ),
    );
  });
})();
