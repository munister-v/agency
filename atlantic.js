/* ─────────────────────────────────────────────────────────────
   Hero: the working line between the studio and its clients.

   Two real maps in their own projections, a studio node in Kyiv,
   client cities on both sides of the Atlantic, and a twenty-four
   hour bar that shows the day the studio and the client actually
   share. Every clock, every band on that bar and every overlap
   figure is computed from the IANA time-zone database at render
   time, so daylight saving on either side cannot make this page
   lie. The U.S. boundaries are the same Census file the coverage
   map parses, handed over rather than shipped twice.
   ───────────────────────────────────────────────────────────── */
(() => {
  'use strict';

  const stage = document.getElementById('atl-stage');
  const US = window.__US_STATES;
  const EUR = window.__EUROPE;
  if (!stage || !Array.isArray(US) || !US.length || !EUR) return;

  const SVGNS = 'http://www.w3.org/2000/svg';
  const calm = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* Our day, Kyiv time, against a 9-to-5 wherever the client sits. */
  const DAY_US = [10, 22];
  const DAY_CLIENT = [9, 17];
  const TZ_HOME = 'Europe/Kyiv';

  /* ── frames ────────────────────────────────────────────────── */

  /* Side by side on a desk, stacked on a phone. A phone squeezed into
     the wide frame turned the scene into a two-centimetre strip with
     four city names on top of each other, so the narrow layout is a
     different composition rather than the same one scaled down. */
  const WIDE = {
    w: 1520, h: 646,
    us: { x: 8, y: 132, k: 0.60 },     /* Albers USA composite, 1080×610 */
    eu: { x: 1002, y: 88, k: 0.78 },   /* Europe, 560×520 */
    rails: { x1: 665, x2: 1005, cx: 835, y0: 92, step: 76, n: 7, lift: 34 },
    usCap: [24, 60], euCap: [1012, 60],
    ruler: { tick: [106, 132], text: 98 },
    bow: { us: 0.24, eu: 0.42 },
    tags: {
      LVIV:   { lx: -14, ly: 22,  align: 'end' },
      BERLIN: { lx: -14, ly: -12, align: 'end' },
      ROME:   { lx: 16,  ly: 8,   align: 'start' }
    },
    homeTag: { lx: 16, ly: -13, sub: 4 }
  };

  const NARROW = {
    w: 760, h: 1020,
    us: { x: 16, y: 86, k: 0.66 },
    eu: { x: 288, y: 560, k: 0.80 },
    rails: { x1: 46, x2: 714, cx: 380, y0: 508, step: 20, n: 4, lift: 8 },
    usCap: [22, 30], euCap: [296, 540],
    ruler: { tick: [62, 86], text: 52 },
    bow: { us: 0.20, eu: 0.34 },
    tags: {
      LVIV:   { lx: -18, ly: 30,  align: 'end' },
      BERLIN: { lx: -18, ly: -16, align: 'end' },
      ROME:   { lx: 22,  ly: 12,  align: 'start' }
    },
    homeTag: { lx: 22, ly: -18, sub: 8 }
  };

  const narrow = window.matchMedia('(max-width: 620px)');

  /* ── cities ────────────────────────────────────────────────── */

  /* Nothing here is a company name: the page claims a place and a
     clock, which are the two things a client can actually check. */
  const CITIES = [
    { id: 'LVIV',   label: 'Lviv',        area: 'Ukraine',    tz: 'Europe/Kyiv',         side: 'eu', anchor: 'LVIV' },
    { id: 'NY',     label: 'New York',    area: 'New York',   tz: 'America/New_York',    side: 'us', state: 'NY', dx: 2,  dy: 4 },
    { id: 'BERLIN', label: 'Berlin',      area: 'Germany',    tz: 'Europe/Berlin',       side: 'eu', anchor: 'BERLIN' },
    { id: 'IL',     label: 'Chicago',     area: 'Illinois',   tz: 'America/Chicago',     side: 'us', state: 'IL', dx: 6,  dy: -10 },
    { id: 'ROME',   label: 'Rome',        area: 'Italy',      tz: 'Europe/Rome',         side: 'eu', anchor: 'ROME' },
    { id: 'TX',     label: 'Austin',      area: 'Texas',      tz: 'America/Chicago',     side: 'us', state: 'TX', dx: 14, dy: 30 },
    { id: 'CO',     label: 'Denver',      area: 'Colorado',   tz: 'America/Denver',      side: 'us', state: 'CO', dx: 10, dy: 0 },
    { id: 'CA',     label: 'Los Angeles', area: 'California', tz: 'America/Los_Angeles', side: 'us', state: 'CA', dx: 22, dy: 46 },
    { id: 'WA',     label: 'Seattle',     area: 'Washington', tz: 'America/Los_Angeles', side: 'us', state: 'WA', dx: 0,  dy: 6 },
    { id: 'FL',     label: 'Miami',       area: 'Florida',    tz: 'America/New_York',    side: 'us', state: 'FL', dx: 14, dy: 34 }
  ];

  const el = (name, attrs) => {
    const node = document.createElementNS(SVGNS, name);
    for (const k in attrs) node.setAttribute(k, attrs[k]);
    return node;
  };
  const usById = Object.fromEntries(US.map(s => [s.i, s]));

  /* ── time ──────────────────────────────────────────────────── */

  const offsetOf = (tz, when) => {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' }).formatToParts(when);
    const raw = (parts.find(p => p.type === 'timeZoneName') || {}).value || 'GMT+0';
    const m = raw.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
    if (!m) return 0;
    return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] || 0));
  };

  const clockIn = (tz, when) => new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false
  }).format(when);

  /* Segments stay on our own clock, which is the axis the bar draws,
     and are wrapped into [0,24) so a Pacific workday shows as two
     visible pieces instead of one running off the end. */
  const wrap = ([a, b]) => {
    let s = a, e = b;
    while (s < 0) { s += 24; e += 24; }
    while (s >= 24) { s -= 24; e -= 24; }
    const out = e > 24 ? [[s, 24], [0, e - 24]] : [[s, e]];
    return out.filter(([x, y]) => y - x > 0.01);
  };

  const clientOnOurClock = (tz, when) => {
    const shift = (offsetOf(tz, when) - offsetOf(TZ_HOME, when)) / 60;
    return wrap([DAY_CLIENT[0] - shift, DAY_CLIENT[1] - shift]);
  };

  const intersect = (a, b) => {
    const out = [];
    a.forEach(([s1, e1]) => b.forEach(([s2, e2]) => {
      const s = Math.max(s1, s2), e = Math.min(e1, e2);
      if (e - s > 0.01) out.push([s, e]);
    }));
    return out;
  };

  const hoursIn = segs => segs.reduce((n, [s, e]) => n + (e - s), 0);

  /* "7 h" under a Ukrainian caption reads like an oversight, so the unit
     comes from the dictionary the rest of the page is using. Both names
     are script-level globals in i18n.js, hence the guard. */
  const hourUnit = () => {
    try {
      const dict = translations[currentLang] || translations.en;
      return dict.atl_hours_unit || 'h';
    } catch (e) { return 'h'; }
  };
  const fmtHours = h =>
    (Math.abs(h - Math.round(h)) < 0.05 ? Math.round(h) : h.toFixed(1)) + ' ' + hourUnit();

  /* ── readout ───────────────────────────────────────────────── */

  const outHome = document.getElementById('atl-clock-eu');
  const outThere = document.getElementById('atl-clock-us');
  const outThereName = document.getElementById('atl-us-name');
  const outCity = document.getElementById('atl-city');
  const outNote = document.getElementById('atl-note');
  const outHours = document.getElementById('atl-hours');
  const barCity = document.getElementById('atl-bar-city');
  const trackOurs = document.querySelector('#atl-bar [data-track="ours"]');
  const trackTheirs = document.querySelector('#atl-bar [data-track="theirs"]');
  const nowMark = document.getElementById('atl-bar-now');
  const scaleRow = document.getElementById('atl-bar-scale');

  if (scaleRow && !scaleRow.children.length) {
    for (let h = 0; h <= 24; h += 3) {
      const t = document.createElement('span');
      t.style.left = (h / 24 * 100) + '%';
      t.textContent = String(h).padStart(2, '0');
      scaleRow.appendChild(t);
    }
  }

  const band = (cls, [s, e]) => {
    const i = document.createElement('i');
    i.className = cls;
    i.style.left = (s / 24 * 100) + '%';
    i.style.width = ((e - s) / 24 * 100) + '%';
    return i;
  };

  let scene = null;      /* everything that belongs to the drawn frame */
  let currentId = CITIES[0].id;

  const paint = () => {
    const now = new Date();
    const here = (offsetOf(TZ_HOME, now) + now.getUTCHours() * 60 + now.getUTCMinutes()) / 60;
    const hereWrapped = ((here % 24) + 24) % 24;

    if (outHome) outHome.textContent = clockIn(TZ_HOME, now);
    if (scene && scene.homeSub) scene.homeSub.textContent = clockIn(TZ_HOME, now);
    if (nowMark) nowMark.style.left = (hereWrapped / 24 * 100) + '%';
    if (trackOurs) {
      trackOurs.innerHTML = '';
      trackOurs.appendChild(band('atl-band atl-band-ours', DAY_US));
    }

    const leg = scene && scene.legs.find(l => l.id === currentId);
    if (!leg) return;

    const theirs = clientOnOurClock(leg.tz, now);
    const shared = intersect([DAY_US], theirs);

    if (outThere) outThere.textContent = clockIn(leg.tz, now);
    if (outThereName) outThereName.textContent = leg.label;
    if (outCity) outCity.textContent = leg.label;
    if (outNote) outNote.textContent = leg.area;
    if (outHours) outHours.textContent = fmtHours(hoursIn(shared));
    if (barCity) barCity.textContent = leg.label;

    if (trackTheirs) {
      trackTheirs.innerHTML = '';
      theirs.forEach(seg => trackTheirs.appendChild(band('atl-band atl-band-theirs', seg)));
      shared.forEach(seg => trackTheirs.appendChild(band('atl-band atl-band-shared', seg)));
    }
  };

  /* ── the scene ─────────────────────────────────────────────── */

  const build = (L) => {
    const inUS = (st, dx = 0, dy = 0) => ({ x: L.us.x + (st.x + dx) * L.us.k, y: L.us.y + (st.y + dy) * L.us.k });
    const inEU = name => ({ x: L.eu.x + EUR.cities[name][0] * L.eu.k, y: L.eu.y + EUR.cities[name][1] * L.eu.k });
    const HOME = inEU('KYIV');

    const svg = el('svg', {
      viewBox: `0 0 ${L.w} ${L.h}`, class: 'atl-svg', role: 'img',
      'aria-label': 'A studio in Kyiv working with client teams in Europe and across the United States'
    });

    /* Ocean rails. They carry no data and say so by staying behind
       everything else. */
    const rails = el('g', { class: 'atl-rails' });
    for (let i = 0; i < L.rails.n; i++) {
      const y = L.rails.y0 + i * L.rails.step;
      rails.appendChild(el('path', {
        d: `M${L.rails.x1},${y} Q${L.rails.cx},${y - L.rails.lift + i * (L.rails.lift / 3)} ${L.rails.x2},${y}`
      }));
    }
    svg.appendChild(rails);

    const usLand = el('g', { class: 'atl-land atl-land-us', transform: `translate(${L.us.x},${L.us.y}) scale(${L.us.k})` });
    const usShapes = {};
    US.forEach(st => {
      const path = el('path', { d: st.d, class: 'atl-state', 'data-zone': st.z, 'data-id': st.i });
      usLand.appendChild(path);
      usShapes[st.i] = path;
    });
    svg.appendChild(usLand);

    const euLand = el('g', { class: 'atl-land atl-land-eu', transform: `translate(${L.eu.x},${L.eu.y}) scale(${L.eu.k})` });
    EUR.shapes.forEach(s => euLand.appendChild(el('path', { d: s.d, class: 'atl-country' })));
    svg.appendChild(euLand);

    /* Which side is which, said once, in the quietest voice on the page. */
    const capUS = el('text', { x: L.usCap[0], y: L.usCap[1], class: 'atl-side' });
    capUS.textContent = 'UNITED STATES';
    const capEU = el('text', { x: L.euCap[0], y: L.euCap[1], class: 'atl-side' });
    capEU.textContent = 'EUROPE';
    svg.appendChild(capUS);
    svg.appendChild(capEU);

    /* A zone ruler over the continental U.S.: the map reads as a clock. */
    const ruler = el('g', { class: 'atl-ruler' });
    [['ET', 745], ['CT', 585], ['MT', 380], ['PT', 165]].forEach(([name, fx]) => {
      const x = L.us.x + fx * L.us.k;
      ruler.appendChild(el('line', { x1: x, y1: L.ruler.tick[0], x2: x, y2: L.ruler.tick[1], class: 'atl-zonerule' }));
      const t = el('text', { x, y: L.ruler.text, class: 'atl-zonebar' });
      t.textContent = name;
      ruler.appendChild(t);
    });
    svg.appendChild(ruler);

    const routes = el('g', { class: 'atl-routes' });
    const marks = el('g', { class: 'atl-marks' });
    svg.appendChild(routes);
    svg.appendChild(marks);

    const legs = CITIES.map(c => {
      const st = c.side === 'us' ? usById[c.state] : null;
      if (c.side === 'us' && !st) return null;
      const p = c.side === 'us' ? inUS(st, c.dx, c.dy) : inEU(c.anchor);
      const span = Math.hypot(HOME.x - p.x, HOME.y - p.y);
      const mx = (p.x + HOME.x) / 2;
      const my = Math.min(p.y, HOME.y) - span * L.bow[c.side];
      const d = `M${HOME.x.toFixed(1)},${HOME.y.toFixed(1)} Q${mx.toFixed(1)},${my.toFixed(1)} ${p.x.toFixed(1)},${p.y.toFixed(1)}`;

      const line = el('path', { d, class: 'atl-leg' });
      const live = el('path', { d, class: 'atl-leg-live' });
      routes.appendChild(line);
      routes.appendChild(live);

      const dot = el('circle', { cx: p.x, cy: p.y, r: 5, class: 'atl-dot', tabindex: '0', role: 'button' });
      dot.setAttribute('aria-label', c.label);
      marks.appendChild(dot);

      /* European clients keep their names on the map: three cities in
         one corner are unreadable if the name appears only on hover. */
      let tag = null;
      if (c.side === 'eu') {
        const t = L.tags[c.anchor];
        tag = el('text', {
          x: p.x + t.lx, y: p.y + t.ly, class: 'atl-tag',
          'text-anchor': t.align === 'end' ? 'end' : 'start'
        });
        tag.textContent = c.label;
        marks.appendChild(tag);
      }

      return { ...c, st, x: p.x, y: p.y, line, live, dot, tag, len: 0 };
    }).filter(Boolean);

    const home = el('g', { class: 'atl-home' });
    home.appendChild(el('circle', { cx: HOME.x, cy: HOME.y, r: 30, class: 'atl-home-ring' }));
    home.appendChild(el('circle', { cx: HOME.x, cy: HOME.y, r: 7.5, class: 'atl-home-core' }));
    const homeTag = el('text', { x: HOME.x + L.homeTag.lx, y: HOME.y + L.homeTag.ly, class: 'atl-home-label' });
    homeTag.textContent = 'KYIV';
    home.appendChild(homeTag);
    const homeSub = el('text', { x: HOME.x + L.homeTag.lx, y: HOME.y + L.homeTag.ly + (L.homeTag.sub + 11), class: 'atl-home-sub' });
    home.appendChild(homeSub);
    svg.appendChild(home);

    /* The U.S. city currently on the line, named on the map itself. */
    const flag = el('text', { class: 'atl-flag', x: 0, y: 0 });
    svg.appendChild(flag);

    const packet = el('circle', { r: 5.5, class: 'atl-packet', cx: HOME.x, cy: HOME.y });
    svg.appendChild(packet);

    stage.insertBefore(svg, stage.firstChild);
    legs.forEach(l => { l.len = l.live.getTotalLength(); });

    return { svg, legs, usShapes, flag, packet, homeSub, home: HOME };
  };

  /* ── the run ───────────────────────────────────────────────── */

  let raf = 0, timer = 0, index = 0;

  const clear = leg => {
    leg.live.classList.remove('is-flying');
    leg.live.style.strokeDashoffset = leg.len;
  };

  const select = leg => {
    scene.legs.forEach(l => {
      const on = l === leg;
      l.dot.classList.toggle('is-live', on);
      l.line.classList.toggle('is-live', on);
      if (l.tag) l.tag.classList.toggle('is-live', on);
      if (l.side === 'us' && scene.usShapes[l.state]) scene.usShapes[l.state].classList.toggle('is-live', on);
    });
    if (leg.side === 'us') {
      scene.flag.setAttribute('x', leg.x + 12);
      scene.flag.setAttribute('y', leg.y - 12);
      scene.flag.textContent = leg.label;
      scene.flag.classList.add('is-on');
    } else {
      scene.flag.classList.remove('is-on');
    }
    currentId = leg.id;
    paint();
  };

  const fly = (leg, done) => {
    const dur = leg.side === 'us' ? 1300 : 850;
    const start = performance.now();
    const packet = scene.packet;
    leg.live.style.strokeDasharray = leg.len;
    leg.live.style.strokeDashoffset = leg.len;
    leg.live.classList.add('is-flying');
    packet.classList.add('is-flying');
    const step = t => {
      const k = Math.min(1, (t - start) / dur);
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      leg.live.style.strokeDashoffset = leg.len * (1 - e);
      const pt = leg.live.getPointAtLength(leg.len * e);
      packet.setAttribute('cx', pt.x);
      packet.setAttribute('cy', pt.y);
      if (k < 1) { raf = requestAnimationFrame(step); return; }
      packet.classList.remove('is-flying');
      leg.dot.classList.add('is-landing');
      setTimeout(() => leg.dot.classList.remove('is-landing'), 900);
      done();
    };
    raf = requestAnimationFrame(step);
  };

  const stop = () => {
    clearTimeout(timer);
    cancelAnimationFrame(raf);
    if (scene) scene.legs.forEach(clear);
  };

  const cycle = () => {
    const leg = scene.legs[index % scene.legs.length];
    index++;
    select(leg);
    fly(leg, () => { timer = setTimeout(() => { clear(leg); cycle(); }, 2300); });
  };

  const wire = () => {
    scene.legs.forEach(leg => {
      /* A visitor looking for their own city should not wait for the
         loop to come round to it. */
      const take = () => {
        stop();
        select(leg);
        if (!calm.matches) fly(leg, () => {});
      };
      [leg.dot, leg.tag, leg.side === 'us' ? scene.usShapes[leg.state] : null].forEach(node => {
        if (!node) return;
        node.style.cursor = 'pointer';
        node.addEventListener('mouseenter', take);
        node.addEventListener('focus', take);
      });
    });
  };

  let running = false;

  const begin = () => {
    if (calm.matches) {
      scene.legs.forEach(l => { l.live.style.strokeDasharray = 'none'; l.live.style.strokeDashoffset = 0; });
      scene.packet.remove();
      select(scene.legs.find(l => l.id === currentId) || scene.legs[0]);
      return;
    }
    cycle();
  };

  const mount = () => {
    stop();
    if (scene && scene.svg.parentNode) scene.svg.remove();
    scene = build(narrow.matches ? NARROW : WIDE);
    wire();
    select(scene.legs.find(l => l.id === currentId) || scene.legs[0]);
    if (running) begin();
  };

  mount();

  /* Rotating a phone, or dragging a window across the breakpoint,
     rebuilds the scene in the other composition. */
  const onBreak = () => mount();
  if (narrow.addEventListener) narrow.addEventListener('change', onBreak);
  else narrow.addListener(onBreak);

  stage.addEventListener('mouseleave', () => {
    if (calm.matches || !running) return;
    stop();
    timer = setTimeout(cycle, 500);
  });

  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting && !running) { running = true; begin(); }
        else if (!e.isIntersecting && running && !calm.matches) { running = false; stop(); }
      });
    }, { threshold: 0.12 });
    io.observe(stage);
  } else {
    running = true;
    begin();
  }

  setInterval(paint, 15000);
  document.addEventListener('langchange', paint);
})();
