/*
 * CRM-переключатель статуса на листе лидов. Живёт только в этом браузере:
 * страница внутренняя, читает её один человек, и городить общее хранилище
 * ради одного пользователя было бы работой без пользы. localStorage —
 * ровно тот случай, для которого он существует.
 *
 * Приватный режим браузера, отключённое хранилище или квота — всё это
 * бросает исключение при обращении к localStorage, а сама разметка и
 * кнопки должны остаться рабочими даже тогда: лист по-прежнему читается
 * и по нему можно звонить, просто отметки не переживут перезагрузку.
 */
(function () {
  'use strict';

  var STORE_KEY = 'munister-daily-status-v1';
  var memory = {};
  var storageOK = true;

  function readStore() {
    try {
      var raw = window.localStorage.getItem(STORE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (err) {
      storageOK = false;
      return memory;
    }
  }

  function writeStore(data) {
    try {
      window.localStorage.setItem(STORE_KEY, JSON.stringify(data));
    } catch (err) {
      storageOK = false;
      memory = data;
    }
  }

  var state = readStore();

  function applyOutcome(bar, status) {
    var lead = bar.closest('.lead');
    if (!lead) return;
    if (status === 'won' || status === 'dead') {
      lead.setAttribute('data-lead-outcome', status);
    } else {
      lead.removeAttribute('data-lead-outcome');
    }
  }

  function render(bar) {
    var id = bar.getAttribute('data-lead');
    var current = state[id];
    var buttons = bar.querySelectorAll('.status-btn');
    for (var i = 0; i < buttons.length; i++) {
      var btn = buttons[i];
      var active = btn.getAttribute('data-status') === current;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    }
    applyOutcome(bar, current);
  }

  function setStatus(bar, status) {
    var id = bar.getAttribute('data-lead');
    if (state[id] === status) {
      // Повторный клик по уже активной кнопке возвращает к «без статуса» —
      // это единственный способ отменить пометку без отдельной кнопки-сброса.
      delete state[id];
    } else {
      state[id] = status;
    }
    writeStore(state);
    render(bar);
  }

  var bars = document.querySelectorAll('.lead-status');
  for (var j = 0; j < bars.length; j++) {
    render(bars[j]);
  }

  document.addEventListener('click', function (event) {
    var btn = event.target.closest('.status-btn');
    if (!btn) return;
    var bar = btn.closest('.lead-status');
    if (!bar) return;
    setStatus(bar, btn.getAttribute('data-status'));
  });

  if (!storageOK) {
    // Тихий отказ: страница работает как обычный список без сохранения
    // между визитами. Отдельного баннера об этом нет — это внутренний
    // инструмент, а не публичный продукт, где такое стоит объяснять.
    console.warn('daily/status.js: localStorage unavailable, status will not persist across reloads.');
  }
})();
