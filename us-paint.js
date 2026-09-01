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
  const COLOR_KEY = 'munister:paint:color';

  const palette = document.getElementById('paint-palette');
  const nameInput = document.getElementById('paint-name');
  const readout = document.getElementById('paint-readout');
  const feed = document.getElementById('paint-feed');
  const counter = document.getElementById('paint-counter');
  const status = document.getElementById('paint-status');

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

  const paint = new Map();      // fips → {c, n, t}
  const shapes = new Map();     // fips → <path>
  const names = new Map();      // fips → «Harris County, TX»

  /* ── дата закраски: день и месяц, как просили, без года и часов ────── */
  const stamp = (iso) => {
    const d = new Date(iso);
    if (Number.isNaN(+d)) return '';
    const lang = document.documentElement.lang || 'uk';
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

  /* ── лента последних закрасок ──────────────────────────────────────── */
  const drawFeed = (rows) => {
    if (!feed) return;
    feed.innerHTML = '';
    for (const r of rows) {
      const li = document.createElement('li');
      const dot = document.createElement('i');
      dot.style.background = COLORS[r.c] || '#999';
      const who = document.createElement('b');
      who.textContent = r.n;
      const where = document.createElement('span');
      where.textContent = names.get(r.fips) || r.fips;
      const when = document.createElement('time');
      when.dateTime = r.t;
      when.textContent = stamp(r.t);
      li.append(dot, who, where, when);
      feed.appendChild(li);
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
      ? `${rec.n} · ${stamp(rec.t)}`
      : t('pm_free', 'ещё никем не закрашен');
    readout.appendChild(line);
  };

  /* ── отправка закраски ─────────────────────────────────────────────── */
  let sending = false;
  const sendPaint = async (fips) => {
    const who = (nameInput?.value || '').trim();
    if (who.length < 2) {
      say(t('pm_need_name', 'Сначала имя: оно будет стоять рядом с округом.'), 'warn');
      nameInput?.focus();
      return;
    }
    if (sending) return;
    sending = true;
    localStorage.setItem(NAME_KEY, who);

    /* Оптимистично красим сразу: ответ службы приходит через сеть, а рука
       уже нажала, и ждать полсекунды на каждый округ невозможно. При отказе
       возвращаем прежний вид. */
    const before = paint.get(fips);
    applyPaint(fips, { c: brush, n: who, t: new Date().toISOString() });
    describe(fips);

    try {
      const res = await fetch(`${API}/paint`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ fips, color: brush, name: who }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || String(res.status));
      applyPaint(fips, { c: data.color, n: data.name, t: data.painted_at });
      setCounter(paint.size);
      describe(fips);
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
      sending = false;
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
    let view = { ...HOME };
    const MIN_W = 1080 / 24;

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
      drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y, moved: 0 };
      svg.setPointerCapture(e.pointerId);
    });
    svg.addEventListener('pointermove', (e) => {
      const fips = e.target?.dataset?.fips;
      if (fips && !drag) describe(fips);
      if (!drag || e.pointerId !== drag.id) return;
      const r = svg.getBoundingClientRect();
      const dx = e.clientX - drag.sx;
      const dy = e.clientY - drag.sy;
      drag.moved = Math.max(drag.moved, Math.hypot(dx, dy));
      view.x = drag.vx - (dx / r.width) * view.w;
      view.y = drag.vy - (dy / r.height) * view.h;
      clampView();
      applyView();
    });
    const endDrag = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const clicked = drag.moved < 4;
      drag = null;
      if (!clicked) return;
      const fips = e.target?.dataset?.fips;
      if (fips) sendPaint(fips);
    };
    svg.addEventListener('pointerup', endDrag);
    svg.addEventListener('pointercancel', () => { drag = null; });

    /* Кнопки нужны и без колеса: тачпад, телефон и клавиатура. */
    const zoomIn = document.getElementById('paint-zoom-in');
    const zoomOut = document.getElementById('paint-zoom-out');
    const zoomHome = document.getElementById('paint-zoom-home');
    zoomIn?.addEventListener('click', () => zoomBy(1 / 1.5));
    zoomOut?.addEventListener('click', () => zoomBy(1.5));
    zoomHome?.addEventListener('click', () => { view = { ...HOME }; applyView(); });

    applyView();

    /* Клавиатура: перебор округов подряд бессмыслен, но подпись должна
       читаться и без мыши, поэтому фокус ведёт по штатам, а закраска
       остаётся действием указателя. */
    svg.addEventListener('focusin', (e) => {
      const fips = e.target?.dataset?.fips;
      if (fips) describe(fips);
    });
  };

  /* ── состояние со службы ───────────────────────────────────────────── */
  const load = async (quiet) => {
    try {
      const res = await fetch(`${API}/state`, { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      for (const [fips, rec] of Object.entries(data.counties || {})) applyPaint(fips, rec);
      setCounter(data.painted || 0);
      drawFeed(data.recent || []);
      if (!quiet) say('', '');
    } catch {
      if (!quiet) say(t('pm_offline', 'Общая закраска сейчас недоступна: карта открыта только на просмотр.'), 'warn');
    }
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
    } catch {
      say(t('pm_geo_fail', 'Границы не загрузились. Обновите страницу.'), 'warn');
    }
  };

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
