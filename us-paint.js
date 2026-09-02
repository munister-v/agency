/* ─────────────────────────────────────────────────────────────
   Стена карты: 3142 округа США, которые закрашивает кто угодно.

   Живёт на своей странице /map/. Геометрия та же, что у карты покрытия на
   главной: границы Бюро переписи, композитная проекция Альберса, тот же кадр
   1080×610. Поэтому две карты совпадают до пикселя, и эта читается как
   увеличение той, а не как чужая картинка.

   Закраска общая: она уходит в службу на bank.munister.com.ua и приходит
   оттуда же всем остальным. У каждой заливки есть имя и дата, и они видны
   при наведении и в ленте справа.

   Файл геометрии около мегабайта и грузится отдельным запросом: на своей
   странице сразу, внутри длинной страницы по появлению на экране.
   ───────────────────────────────────────────────────────────── */
(() => {
  'use strict';

  const root = document.getElementById('paint-map');
  if (!root) return;

  const API = root.dataset.endpoint || 'https://bank.munister.com.ua/api/map';
  const GEOMETRY = root.dataset.geometry || 'data/us-counties.json?v=1';
  const NAME_KEY = 'munister:paint:name';
  const NOTE_KEY = 'munister:paint:note';
  const OWN_KEY = 'munister:paint:own';
  const CURSOR_KEY = 'munister:paint:cursor';
  const COLOR_KEY = 'munister:paint:color';

  const palette = document.getElementById('paint-palette');
  const nameInput = document.getElementById('paint-name');
  const noteInput = document.getElementById('paint-note');
  const readout = document.getElementById('paint-readout');
  const feed = document.getElementById('paint-feed');
  const counter = document.getElementById('paint-counter');
  const status = document.getElementById('paint-status');
  const marksBox = document.getElementById('paint-marks');

  /* Словарь i18n объявлен в i18n.js как const верхнего уровня, поэтому он
     виден по имени и НЕ висит на window: обращение через window вернуло бы
     undefined и молча оставило английские строки на всех языках. */
  const dict = () => (typeof translations === 'object' && translations) || {};
  const t = (key, fallback) => dict()[document.documentElement.lang]?.[key] || fallback;

  /* Цвета продублированы из службы: сервер всё равно проверяет присланное по
     своему списку, а браузеру нужно чем-то красить до первого ответа. */
  const COLORS = {
    ink: '#1c1c1c', clay: '#b4523a', ochre: '#c68a2e', moss: '#4f6b4a',
    sea: '#2f6a7d', indigo: '#3b4a86', plum: '#6d3f66', ash: '#8a8a86',
  };

  let brush = localStorage.getItem(COLOR_KEY) || 'clay';
  if (!COLORS[brush]) brush = 'clay';

  /* Своё удаляют только своим ключом, и ключ не выдаётся повторно: он живёт
     только в этом браузере. Если очистить localStorage, право на удаление
     теряется вместе с ним, как и было задумано — это не учётная запись. */
  const own = (() => {
    try { return JSON.parse(localStorage.getItem(OWN_KEY) || '[]'); }
    catch { return []; }
  })();
  const rememberOwn = (id, fips, owner) => {
    own.push({ id, fips, owner });
    if (own.length > 500) own.shift();
    localStorage.setItem(OWN_KEY, JSON.stringify(own));
  };
  const forgetOwn = (id) => {
    const i = own.findIndex((o) => o.id === id);
    if (i >= 0) { own.splice(i, 1); localStorage.setItem(OWN_KEY, JSON.stringify(own)); }
  };

  const paint = new Map();      // fips → {c, n, t}
  const shapes = new Map();     // fips → <path>
  const names = new Map();      // fips → «Harris County, TX»
  const index = [];             // строки поиска: округа и штаты
  const stateShapes = new Map(); // почтовый код → <path> контура штата

  /* ── дата закраски: день и месяц, как просили, без года и часов ────── */
  const stamp = (iso) => {
    const d = new Date(iso);
    if (Number.isNaN(+d)) return '';
    const lang = document.documentElement.lang || 'en';
    return d.toLocaleDateString(lang, { day: 'numeric', month: 'long' });
  };

  const say = (msg, kind) => {
    if (!status) return;
    status.textContent = msg;
    status.dataset.kind = kind || '';
  };

  /* ── палитра ───────────────────────────────────────────────────────── */
  const drawPalette = () => {
    if (!palette) return;
    palette.innerHTML = '';
    for (const key of Object.keys(COLORS)) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'pm-swatch';
      b.style.setProperty('--c', COLORS[key]);
      b.dataset.color = key;
      b.setAttribute('aria-pressed', String(key === brush));
      b.setAttribute('aria-label', key);
      b.addEventListener('click', () => {
        brush = key;
        localStorage.setItem(COLOR_KEY, key);
        palette.querySelectorAll('.pm-swatch').forEach((s) =>
          s.setAttribute('aria-pressed', String(s.dataset.color === key)));
      });
      palette.appendChild(b);
    }
  };

  const applyPaint = (fips, rec) => {
    paint.set(fips, rec);
    const el = shapes.get(fips);
    if (!el) return;
    el.setAttribute('fill', COLORS[rec.c] || '#999');
    el.dataset.painted = '1';
  };

  const setCounter = (n) => {
    if (counter) counter.textContent = String(n);
  };

  /* ── что показывает подпись под картой ─────────────────────────────── */
  const describe = (fips) => {
    if (!readout) return;
    const place = names.get(fips) || fips;
    const rec = paint.get(fips);
    readout.innerHTML = '';
    const head = document.createElement('b');
    head.textContent = place;
    readout.appendChild(head);
    const line = document.createElement('span');
    line.textContent = rec
      ? `${rec.n} · ${stamp(rec.t)}${rec.k > 1 ? ` · ${rec.k} ${t('pm_marks_short', 'пометок')}` : ''}`
      : t('pm_free', 'ещё никем не закрашен');
    readout.appendChild(line);
    if (rec?.m) {
      const note = document.createElement('em');
      note.textContent = rec.m;
      readout.appendChild(note);
    }
  };

  /* ── все пометки одного округа ──────────────────────────────────────
     Округ закрашивают не один раз: по одному месту может пройти несколько
     лидов, и каждый остаётся отдельной строкой. Поэтому клик показывает не
     последнюю запись, а весь список по этому округу. */
  let marksFor = null;

  const removeMark = async (id, fips) => {
    const mine = own.find((o) => o.id === id);
    if (!mine) return;
    try {
      const res = await fetch(`${API}/remove`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, owner: mine.owner }),
        signal: AbortSignal.timeout(12000),
      });
      if (!res.ok) throw new Error(String(res.status));
      forgetOwn(id);
      await load(true);                 // текущий цвет округа мог смениться на предыдущий слой
      if (!paint.has(fips)) {
        const el = shapes.get(fips);
        if (el) { el.setAttribute('fill', 'transparent'); delete el.dataset.painted; }
      }
      describe(fips);
      showMarks(fips);
      say(t('pm_removed', 'Пометка удалена.'), '');
    } catch {
      say(t('pm_fail', 'Не отправилось. Попробуйте ещё раз.'), 'warn');
    }
  };

  const showMarks = async (fips) => {
    if (!marksBox) return;
    marksFor = fips;
    marksBox.innerHTML = '';
    const head = document.createElement('p');
    head.className = 'pm-marks-head';
    head.textContent = names.get(fips) || fips;
    marksBox.appendChild(head);

    try {
      const res = await fetch(`${API}/county?fips=${encodeURIComponent(fips)}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      if (marksFor !== fips) return;            // пока ждали, кликнули другой округ
      if (!data.marks?.length) {
        const empty = document.createElement('p');
        empty.className = 'pm-marks-empty';
        empty.textContent = t('pm_free', 'ещё никем не закрашен');
        marksBox.appendChild(empty);
        return;
      }
      const mineIds = new Set(own.filter((o) => o.fips === fips).map((o) => o.id));
      const list = document.createElement('ul');
      for (const m of data.marks) {
        const li = document.createElement('li');
        const dot = document.createElement('i');
        dot.style.background = COLORS[m.c] || '#999';
        const who = document.createElement('b');
        who.textContent = m.n;
        const when = document.createElement('time');
        when.dateTime = m.t;
        when.textContent = stamp(m.t);
        li.append(dot, who, when);
        if (m.m) {
          const text = document.createElement('span');
          text.textContent = m.m;
          li.appendChild(text);
        }
        /* Кнопка удаления стоит только у пометок, оставленных этим же
           браузером: у остальных id совпасть с записью в own не может,
           потому что owner для них никогда сюда не приходил. */
        if (mineIds.has(m.id)) {
          const del = document.createElement('button');
          del.type = 'button';
          del.className = 'pm-mark-del';
          del.textContent = t('pm_remove', 'Delete');
          del.addEventListener('click', () => removeMark(m.id, fips));
          li.appendChild(del);
        }
        list.appendChild(li);
      }
      marksBox.appendChild(list);
    } catch {
      const fail = document.createElement('p');
      fail.className = 'pm-marks-empty';
      fail.textContent = t('pm_marks_fail', 'Пометки не загрузились.');
      marksBox.appendChild(fail);
    }
  };

  /* ── отправка закраски ─────────────────────────────────────────────── */
  /* Замок ставится на округ, а не на всю карту: общий замок «пока идёт
     запрос, ничего не красим» превращал зависший запрос в мёртвую карту, и
     подряд закрашивать несколько округов было нельзя. Один и тот же округ
     дважды подряд по-прежнему не уходит. */
  const inFlight = new Set();
  const sendPaint = async (fips) => {
    const who = (nameInput?.value || '').trim();
    const note = (noteInput?.value || '').trim();
    if (who.length < 2) {
      say(t('pm_need_name', 'Сначала имя: оно будет стоять рядом с округом.'), 'warn');
      nameInput?.focus();
      return;
    }
    if (inFlight.has(fips)) return;
    inFlight.add(fips);
    localStorage.setItem(NAME_KEY, who);
    if (note) localStorage.setItem(NOTE_KEY, note);

    /* Оптимистично красим сразу: ответ службы приходит через сеть, а рука
       уже нажала, и ждать полсекунды на каждый округ невозможно. При отказе
       возвращаем прежний вид. */
    const before = paint.get(fips);
    applyPaint(fips, { c: brush, n: who, t: new Date().toISOString(), m: note, k: (before?.k || 0) + 1 });
    describe(fips);

    try {
      const res = await fetch(`${API}/paint`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ fips, color: brush, name: who, note }),
        /* Сеть в дороге отваливается молча: без срока ожидания заливка
           висела бы «отправленной» до конца сеанса. */
        signal: AbortSignal.timeout(12000),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || String(res.status));
      applyPaint(fips, { c: data.color, n: data.name, t: data.painted_at, m: data.note, k: (before?.k || 0) + 1 });
      if (data.owner) rememberOwn(data.id ?? null, fips, data.owner);
      setCounter(paint.size);
      describe(fips);
      showMarks(fips);
      say('', '');
      load(true);
    } catch (err) {
      if (before) applyPaint(fips, before);
      else {
        paint.delete(fips);
        const el = shapes.get(fips);
        if (el) { el.setAttribute('fill', 'transparent'); delete el.dataset.painted; }
      }
      say(
        String(err.message) === 'rate_limited'
          ? t('pm_limit', 'На сегодня хватит: с одного адреса не больше 120 округов в час.')
          : t('pm_fail', 'Не отправилось. Попробуйте ещё раз.'),
        'warn'
      );
    } finally {
      inFlight.delete(fips);
    }
  };

  /* ── карта ─────────────────────────────────────────────────────────── */
  const SVG = 'http://www.w3.org/2000/svg';
  let svg;

  const buildMap = (geo) => {
    svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('viewBox', '0 0 1080 610');
    svg.setAttribute('class', 'pm-svg');
    svg.setAttribute('role', 'application');
    svg.setAttribute('aria-label', t('pm_aria', 'Карта округов США: выберите цвет и закрасьте округ'));

    const gCounties = document.createElementNS(SVG, 'g');
    gCounties.setAttribute('class', 'pm-counties');
    const gStates = document.createElementNS(SVG, 'g');
    gStates.setAttribute('class', 'pm-states');

    const stateName = Object.fromEntries(geo.states.map((s) => [s.i, s.n]));

    for (const c of geo.counties) {
      const p = document.createElementNS(SVG, 'path');
      p.setAttribute('d', c.d);
      p.setAttribute('fill', 'transparent');
      p.dataset.fips = c.i;
      p.setAttribute('tabindex', '-1');
      const label = `${c.n}, ${c.s}`;
      names.set(c.i, label);
      const title = document.createElementNS(SVG, 'title');
      title.textContent = label;
      p.appendChild(title);
      gCounties.appendChild(p);
      shapes.set(c.i, p);
      index.push({
        kind: 'county', id: c.i, label,
        name: c.n.toLowerCase(),
        key: (c.n + ' ' + c.s).toLowerCase(),
      });
    }

    /* Границы штатов рисуются поверх округов и не ловят мышь: иначе клик у
       границы попадал бы в штат, а закрашивается округ. */
    for (const s of geo.states) {
      const p = document.createElementNS(SVG, 'path');
      p.setAttribute('d', s.d);
      p.setAttribute('fill', 'none');
      p.dataset.state = s.i;
      p.appendChild(document.createElementNS(SVG, 'title')).textContent = stateName[s.i] || s.i;
      gStates.appendChild(p);
      stateShapes.set(s.i, p);
      index.push({
        kind: 'state', id: s.i,
        label: `${stateName[s.i] || s.i} (${s.i})`,
        name: (stateName[s.i] || s.i).toLowerCase(),
        key: ((stateName[s.i] || '') + ' ' + s.i).toLowerCase(),
      });
    }

    svg.append(gCounties, gStates);
    root.innerHTML = '';
    root.appendChild(svg);

    /* ── масштаб и перетаскивание ─────────────────────────────────────
       Округ Нью-Йорка на полной карте занимает пару пикселей, и без
       увеличения по нему попадают не пальцем, а везением. Масштаб меняет
       viewBox, а не transform: штрихи заданы non-scaling-stroke, поэтому
       границы остаются волосяными на любом увеличении.

       Перетаскивание и закраска делят одну кнопку мыши, поэтому клик
       считается кликом, только если указатель прошёл меньше четырёх
       пикселей: иначе всякая попытка сдвинуть карту красила бы округ. */
    const HOME = { x: 0, y: 0, w: 1080, h: 610 };
    /* На телефоне карта во всю страну это полоса в 190 пикселей высотой, где
       округ меньше буквы. Поэтому на узком экране открывается материковая
       часть без врезок Аляски и Гавайев, а кнопка «вся страна» возвращает
       полный кадр вместе с ними. */
    const MAINLAND = { x: 150, y: 0, w: 930, h: 525 };
    const narrow = window.matchMedia('(max-width: 760px)');
    let view = narrow.matches ? { ...MAINLAND } : { ...HOME };
    const MIN_W = 1080 / 40;

    const applyView = () => {
      svg.setAttribute('viewBox', `${view.x} ${view.y} ${view.w} ${view.h}`);
      root.dataset.zoom = (HOME.w / view.w).toFixed(1);
    };

    const clampView = () => {
      view.w = Math.min(HOME.w, Math.max(MIN_W, view.w));
      view.h = view.w * (HOME.h / HOME.w);
      view.x = Math.min(HOME.w - view.w, Math.max(0, view.x));
      view.y = Math.min(HOME.h - view.h, Math.max(0, view.y));
    };

    /* Точка под указателем в координатах карты: вокруг неё и вертится
       увеличение, иначе колесо уводит карту от места, куда смотрят. */
    const atPointer = (e) => {
      const r = svg.getBoundingClientRect();
      return {
        x: view.x + ((e.clientX - r.left) / r.width) * view.w,
        y: view.y + ((e.clientY - r.top) / r.height) * view.h,
      };
    };

    const zoomBy = (factor, anchor) => {
      const a = anchor || { x: view.x + view.w / 2, y: view.y + view.h / 2 };
      const w = Math.min(HOME.w, Math.max(MIN_W, view.w * factor));
      const k = w / view.w;
      view.x = a.x - (a.x - view.x) * k;
      view.y = a.y - (a.y - view.y) * k;
      view.w = w;
      clampView();
      applyView();
    };

    svg.addEventListener('wheel', (e) => {
      e.preventDefault();
      zoomBy(e.deltaY > 0 ? 1.18 : 1 / 1.18, atPointer(e));
    }, { passive: false });

    let drag = null;
    svg.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      drag = {
        id: e.pointerId, sx: e.clientX, sy: e.clientY,
        vx: view.x, vy: view.y, moved: 0,
        /* Округ, на котором нажали: запасной ответ, если под курсором к
           моменту отпускания уже ничего нет (палец увели за край). */
        hit: e.target?.dataset?.fips || null,
      };
      /* Захват указателя удерживает перетаскивание, когда курсор выходит за
         край карты. Он же бросает исключение, если указателя с таким номером
         уже нет (курсор увели, событие пришло синтетическим), а исключение
         здесь оборвало бы обработчик и вместе с ним и перетаскивание, и
         закраску. Захват это удобство, а не условие работы. */
      try { svg.setPointerCapture(e.pointerId); } catch { /* без захвата тоже работает */ }
    });
    svg.addEventListener('pointermove', (e) => {
      if (!drag) {
        const fips = countyAt(e);
        if (fips) describe(fips);
      }
      if (!drag || e.pointerId !== drag.id || pinch) return;
      const r = svg.getBoundingClientRect();
      const dx = e.clientX - drag.sx;
      const dy = e.clientY - drag.sy;
      drag.moved = Math.max(drag.moved, Math.hypot(dx, dy));
      view.x = drag.vx - (dx / r.width) * view.w;
      view.y = drag.vy - (dy / r.height) * view.h;
      clampView();
      applyView();
    });
    /* Округ под указателем берётся по координатам, а НЕ из e.target.
       Причина: захват указателя перенаправляет все следующие события на svg,
       поэтому у pointerup target это сама карта, а не округ, и закраска молча
       не срабатывала. elementFromPoint отвечает про то, что под курсором на
       самом деле, и одинаково верен на любом увеличении. */
    const countyAt = (e) => {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      return el?.dataset?.fips || null;
    };

    const endDrag = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const clicked = drag.moved < 4;
      const hit = countyAt(e) || drag.hit;
      drag = null;
      if (!clicked || !hit) return;
      sendPaint(hit);
    };
    svg.addEventListener('pointerup', endDrag);
    svg.addEventListener('pointercancel', () => { drag = null; });

    /* Кнопки нужны и без колеса: тачпад, телефон и клавиатура. */
    const zoomIn = document.getElementById('paint-zoom-in');
    const zoomOut = document.getElementById('paint-zoom-out');
    const zoomHome = document.getElementById('paint-zoom-home');
    zoomIn?.addEventListener('click', () => zoomBy(1 / 1.5));
    zoomOut?.addEventListener('click', () => zoomBy(1.5));
    zoomHome?.addEventListener('click', () => { view = { ...HOME }; clampView(); applyView(); });

    /* Приближение к области: поиск и двойной клик показывают округ не в
       упор, а с полем вокруг, иначе непонятно, куда именно попали. */
    const zoomToBox = (box, pad = 2.6) => {
      const w = Math.max(MIN_W, Math.max(box.width, box.height * (HOME.w / HOME.h)) * pad);
      view.w = Math.min(HOME.w, w);
      view.h = view.w * (HOME.h / HOME.w);
      view.x = box.x + box.width / 2 - view.w / 2;
      view.y = box.y + box.height / 2 - view.h / 2;
      clampView();
      applyView();
    };
    root.zoomToBox = zoomToBox;   // поиск живёт снаружи карты

    /* Щипок двумя пальцами: на телефоне колеса нет, а кнопками возить долго. */
    const active = new Map();
    let pinch = null;
    svg.addEventListener('pointerdown', (e) => {
      active.set(e.pointerId, e);
      if (active.size === 2) {
        drag = null;
        const [a, b] = [...active.values()];
        pinch = { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) };
      }
    });
    svg.addEventListener('pointermove', (e) => {
      if (!active.has(e.pointerId)) return;
      active.set(e.pointerId, e);
      if (active.size !== 2 || !pinch) return;
      const [a, b] = [...active.values()];
      const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      if (!d || !pinch.d) return;
      zoomBy(pinch.d / d, atPointer({
        clientX: (a.clientX + b.clientX) / 2,
        clientY: (a.clientY + b.clientY) / 2,
      }));
      pinch.d = d;
    });
    const dropPointer = (e) => {
      active.delete(e.pointerId);
      if (active.size < 2) pinch = null;
    };
    svg.addEventListener('pointerup', dropPointer);
    svg.addEventListener('pointercancel', dropPointer);

    /* Двойной клик приближает к округу, а не красит его: закраска висит на
       одиночном нажатии. */
    svg.addEventListener('dblclick', (e) => {
      const fips = countyAt(e);
      const el = fips && shapes.get(fips);
      if (el) zoomToBox(el.getBBox());
    });

    applyView();

    /* Клавиатура: перебор округов подряд бессмыслен, но подпись должна
       читаться и без мыши, поэтому фокус ведёт по штатам, а закраска
       остаётся действием указателя. */
    svg.addEventListener('focusin', (e) => {
      const fips = e.target?.dataset?.fips;
      if (fips) describe(fips);
    });
  };

  /* ── поиск по названию ──────────────────────────────────────────────
     Три тысячи округов мышью не перебирают, а половина названий повторяется
     в разных штатах (округов Washington девять), поэтому в строке подсказки
     всегда стоит штат, а в ключе поиска и название, и его почтовый код. */
  const search = document.getElementById('paint-search');
  const results = document.getElementById('paint-results');

  const goTo = (item) => {
    const el = item.kind === 'county' ? shapes.get(item.id) : stateShapes.get(item.id);
    if (!el || !root.zoomToBox) return;
    root.zoomToBox(el.getBBox(), item.kind === 'county' ? 3.4 : 1.25);
    if (item.kind === 'county') {
      describe(item.id);
      showMarks(item.id);
    }
    if (results) results.hidden = true;
    if (search) search.value = item.label;
  };

  const runSearch = () => {
    if (!search || !results) return;
    const q = search.value.trim().toLowerCase();
    results.innerHTML = '';
    if (q.length < 2) { results.hidden = true; return; }
    /* Порядок подсказок решает больше, чем сам поиск: округов с именем
       Washington девять, и человек, набравший «harris», ждёт Техас, а не
       случайный первый в списке. Поэтому сначала точное совпадение имени,
       затем начало имени, затем всё прочее; в пределах одной ступени
       по алфавиту. Штат при равном счёте идёт выше округа: их всего
       пятьдесят один, и промахнуться по ним дороже. */
    const score = (item) => {
      const name = item.name;
      if (name === q) return 0;
      if (item.key.startsWith(q)) return 1;
      if (name.startsWith(q)) return 2;
      if (item.key.includes(' ' + q)) return 3;
      if (item.key.includes(q)) return 4;
      return 9;
    };
    const hits = [];
    for (const item of index) {
      const sc = score(item);
      if (sc < 9) hits.push({ item, sc });
    }
    hits.sort((a, b) =>
      a.sc - b.sc ||
      (a.item.kind === b.item.kind ? 0 : a.item.kind === 'state' ? -1 : 1) ||
      a.item.label.localeCompare(b.item.label));
    for (const { item } of hits.slice(0, 10)) {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = item.label;
      b.addEventListener('click', () => goTo(item));
      li.appendChild(b);
      results.appendChild(li);
    }
    results.hidden = !results.children.length;
  };

  search?.addEventListener('input', runSearch);
  search?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      results?.querySelector('button')?.click();
    }
    if (e.key === 'Escape' && results) results.hidden = true;
  });
  document.addEventListener('click', (e) => {
    if (results && !results.hidden && !e.target.closest('.pm-search')) results.hidden = true;
  });

  /* ── состояние со службы ───────────────────────────────────────────── */
  let cursor = 0;
  const load = async (quiet) => {
    try {
      const res = await fetch(`${API}/state`, { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      const seen = new Set(Object.keys(data.counties || {}));
      /* Округ, пропавший из ответа службы, был у нас закрашен в прошлый раз
         и теперь очищен кем-то другим: сбрасываем заливку сами, не дожидаясь
         следующего клика по нему. */
      for (const fips of [...paint.keys()]) {
        if (!seen.has(fips)) {
          paint.delete(fips);
          const el = shapes.get(fips);
          if (el) { el.setAttribute('fill', 'transparent'); delete el.dataset.painted; }
        }
      }
      for (const [fips, rec] of Object.entries(data.counties || {})) applyPaint(fips, rec);
      setCounter(data.painted || 0);
      if (typeof data.cursor === 'number') cursor = data.cursor;
      if (!quiet) say('', '');
    } catch {
      if (!quiet) say(t('pm_offline', 'Общая закраска сейчас недоступна: карта открыта только на просмотр.'), 'warn');
    }
  };

  /* ── журнал изменений ─────────────────────────────────────────────────
     Лента показывает не срез, а сами события: закрасили, стёрли. Опрос раз
     в 20 секунд — достаточно живо для настенной карты и не бьёт по службе
     на общем домене с банком. */
  const journalEntry = (e) => {
    const li = document.createElement('li');
    li.className = e.action === 'remove' ? 'pm-j-remove' : 'pm-j-paint';
    const dot = document.createElement('i');
    dot.style.background = e.action === 'remove' ? 'transparent' : (COLORS[e.c] || '#999');
    const text = document.createElement('span');
    const place = names.get(e.fips) || e.fips;
    text.textContent = e.action === 'remove'
      ? t('pm_j_removed', 'Cleared') + ' — ' + place
      : `${e.n} — ${place}`;
    const when = document.createElement('time');
    when.dateTime = e.at;
    when.textContent = stamp(e.at);
    li.append(dot, text, when);
    if (e.action !== 'remove' && e.m) {
      const note = document.createElement('em');
      note.textContent = e.m;
      li.appendChild(note);
    }
    return li;
  };

  const pollJournal = async () => {
    try {
      const res = await fetch(`${API}/journal?since=${cursor}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      cursor = data.cursor ?? cursor;
      if (feed && data.events?.length) {
        for (const e of data.events.reverse()) feed.prepend(journalEntry(e));
        while (feed.children.length > 40) feed.removeChild(feed.lastChild);
      }
      if (data.events?.length) load(true);   // событие чужого браузера меняет счётчик и заливку
    } catch { /* тихий пропуск: журнал не критичен для самой карты */ }
  };

  /* ── ленивая загрузка геометрии ────────────────────────────────────── */
  let started = false;
  const start = async () => {
    if (started) return;
    started = true;
    say(t('pm_loading', 'Загружаем границы округов…'), '');
    try {
      const res = await fetch(GEOMETRY);
      if (!res.ok) throw new Error(String(res.status));
      const geo = await res.json();
      buildMap(geo);
      drawPalette();
      say('', '');
      await load();
      await pollJournal();
      setInterval(pollJournal, 20000);
      /* Скрытая вкладка усыпляет таймер браузером до минуты и реже: карта
         могла простоять открытой полдня в фоне. При возврате видимости
         подтягиваем упущенное сразу, а не ждём следующего тика. */
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') pollJournal();
      });
    } catch {
      say(t('pm_geo_fail', 'Границы не загрузились. Обновите страницу.'), 'warn');
    }
  };

  if (noteInput) noteInput.value = localStorage.getItem(NOTE_KEY) || '';
  if (nameInput) {
    nameInput.value = localStorage.getItem(NAME_KEY) || '';
    nameInput.addEventListener('change', () => {
      const v = nameInput.value.trim();
      if (v) localStorage.setItem(NAME_KEY, v);
    });
  }

  /* Страница /map состоит из этой карты и больше ни из чего, поэтому
     геометрия грузится сразу. Ждать пересечения с экраном здесь нечего, а
     наблюдатель видимости вдобавок молчит в нулевом вьюпорте (скрытая
     вкладка, снимок страницы, встроенная панель), и карта не появлялась бы
     вовсе. Если карту когда-нибудь вернут в длинную страницу, достаточно
     поставить на контейнер data-lazy. */
  if (root.dataset.lazy !== undefined && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { io.disconnect(); start(); }
    }, { rootMargin: '300px' });
    io.observe(root);
  } else {
    start();
  }
})();
