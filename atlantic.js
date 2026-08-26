/* ─────────────────────────────────────────────────────────────
   Hero: the transatlantic delivery line.

   The first screen used to say "U.S. clients, studio in Europe"
   and leave the visitor to take it on trust. This draws the claim
   instead: real state boundaries (the same Census file the
   coverage map parses, handed over on window.__US_STATES), a
   studio node in Europe, and a route that lands on one state at a
   time. Every clock and every overlap figure is computed live
   from the IANA database, so nothing here can quietly go stale.
   ───────────────────────────────────────────────────────────── */
(() => {
  'use strict';

  const stage = document.getElementById('atl-stage');
  const STATES = window.__US_STATES;
  if (!stage || !Array.isArray(STATES) || !STATES.length) return;

  const SVGNS = 'http://www.w3.org/2000/svg';
  const calm = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* Our working day, Kyiv time, and a 9-to-5 on the client's side. */
  const DAY_EU = [10, 22];
  const DAY_US = [9, 17];
  const TZ_EU = 'Europe/Kyiv';

  /* Landing points. A city is named because "Texas, 15:20" is not a
     time anybody keeps: clocks belong to places, not to polygons. */
  const HUBS = [
    { s: 'NY', city: 'New York',     tz: 'America/New_York',    dx:   2, dy:   4 },
    { s: 'FL', city: 'Miami',        tz: 'America/New_York',    dx:  14, dy:  34 },
    { s: 'IL', city: 'Chicago',      tz: 'America/Chicago',     dx:   6, dy: -10 },
    { s: 'TX', city: 'Austin',       tz: 'America/Chicago',     dx:  14, dy:  30 },
    { s: 'CO', city: 'Denver',       tz: 'America/Denver',      dx:  10, dy:   0 },
    { s: 'AZ', city: 'Phoenix',      tz: 'America/Phoenix',     dx:   6, dy:  10 },
    { s: 'CA', city: 'Los Angeles',  tz: 'America/Los_Angeles', dx:  22, dy:  46 },
    { s: 'WA', city: 'Seattle',      tz: 'America/Los_Angeles', dx:   0, dy:   6 },
    { s: 'AK', city: 'Anchorage',    tz: 'America/Anchorage',   dx:   0, dy:   0 },
    { s: 'HI', city: 'Honolulu',     tz: 'Pacific/Honolulu',    dx:   0, dy:   0 }
  ];

  /* ── geometry ──────────────────────────────────────────────── */

  /* The boundary file is drawn in a 1080×610 Albers composite. The
     hero frame is wider and keeps the eastern third free for the
     ocean, the studio node and the routes. */
  const W = 1400, H = 566;
  const SCALE = 0.78;
  const OX = 26, OY = 62;
  const EU = { x: 1284, y: 300 };

  const el = (name, attrs) => {
    const node = document.createElementNS(SVGNS, name);
    for (const k in attrs) node.setAttribute(k, attrs[k]);
    return node;
  };
  const toFrame = (st) => ({ x: OX + st.x * SCALE, y: OY + st.y * SCALE });
  const byId = Object.fromEntries(STATES.map(s => [s.i, s]));

  const svg = el('svg', {
    viewBox: `0 0 ${W} ${H}`, class: 'atl-svg',
    role: 'img', 'aria-label': 'Routes from a studio in Europe to client teams across the United States'
  });

  /* Ocean: latitude rails that give the crossing a sense of distance
     without pretending to be a second, differently projected map. */
  const rails = el('g', { class: 'atl-rails' });
  for (let i = 0; i < 6; i++) {
    const y = 96 + i * 74;
    rails.appendChild(el('path', {
      d: `M905,${y} Q1120,${y - 30 + i * 9} ${EU.x + 74},${y}`
    }));
  }
  svg.appendChild(rails);

  const land = el('g', { class: 'atl-land' });
  const shapes = {};
  STATES.forEach(st => {
    const path = el('path', {
      d: st.d, class: 'atl-state', 'data-zone': st.z, 'data-id': st.i
    });
    land.appendChild(path);
    shapes[st.i] = path;
  });
  land.setAttribute('transform', `translate(${OX},${OY}) scale(${SCALE})`);
  svg.appendChild(land);

  /* A zone ruler across the top of the landmass: four vertical marks
     where the continental zones change, named the way a U.S. client
     names them on a call. */
  const ruler = el('g', { class: 'atl-ruler' });
  [['ET', 745], ['CT', 585], ['MT', 380], ['PT', 165]].forEach(([name, fx]) => {
    const x = OX + fx * SCALE;
    ruler.appendChild(el('line', { x1: x, y1: 30, x2: x, y2: 56, class: 'atl-zonerule' }));
    const t = el('text', { x, y: 22, class: 'atl-zonebar' });
    t.textContent = name;
    ruler.appendChild(t);
  });
  svg.appendChild(ruler);

  const routes = el('g', { class: 'atl-routes' });
  const marks = el('g', { class: 'atl-marks' });
  svg.appendChild(routes);
  svg.appendChild(marks);

  /* One route per hub, all drawn at rest so the map reads as a network
     even before the animation reaches a particular city. */
  const legs = HUBS.map(h => {
    const st = byId[h.s];
    if (!st) return null;
    const p = toFrame(st);
    const tx = p.x + h.dx * SCALE, ty = p.y + h.dy * SCALE;
    const mx = (tx + EU.x) / 2;
    const my = Math.min(ty, EU.y) - Math.hypot(EU.x - tx, EU.y - ty) * 0.26;
    const d = `M${EU.x},${EU.y} Q${mx.toFixed(1)},${my.toFixed(1)} ${tx.toFixed(1)},${ty.toFixed(1)}`;
    const line = el('path', { d, class: 'atl-leg' });
    const live = el('path', { d, class: 'atl-leg-live' });
    routes.appendChild(line);
    routes.appendChild(live);
    const dot = el('circle', { cx: tx, cy: ty, r: 4.5, class: 'atl-dot' });
    marks.appendChild(dot);
    return { ...h, st, tx, ty, line, live, dot, len: 0 };
  }).filter(Boolean);

  /* The studio, last so it sits above every route that leaves it. */
  const home = el('g', { class: 'atl-home' });
  home.appendChild(el('circle', { cx: EU.x, cy: EU.y, r: 26, class: 'atl-home-ring' }));
  home.appendChild(el('circle', { cx: EU.x, cy: EU.y, r: 7, class: 'atl-home-core' }));
  const homeLabel = el('text', { x: EU.x, y: EU.y + 48, class: 'atl-home-label' });
  homeLabel.textContent = 'KYIV';
  home.appendChild(homeLabel);
  svg.appendChild(home);

  const packet = el('circle', { r: 5, class: 'atl-packet', cx: EU.x, cy: EU.y });
  svg.appendChild(packet);

  stage.appendChild(svg);
  legs.forEach(l => { l.len = l.live.getTotalLength(); });

  /* ── clocks and overlap ────────────────────────────────────── */

  const offsetOf = (tz, when) => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, timeZoneName: 'longOffset'
    }).formatToParts(when);
    const raw = (parts.find(p => p.type === 'timeZoneName') || {}).value || 'GMT+0';
    const m = raw.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
    if (!m) return 0;
    return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] || 0));
  };

  const clockIn = (tz, when) => new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false
  }).format(when);

  /* Hours the two workdays share, both expressed on the client's clock. */
  const overlapHours = (tz, when) => {
    const shift = (offsetOf(tz, when) - offsetOf(TZ_EU, when)) / 60;
    const ours = [DAY_EU[0] + shift, DAY_EU[1] + shift];
    const theirs = DAY_US;
    let total = 0;
    for (const k of [-24, 0, 24]) {
      total += Math.max(0, Math.min(ours[1] + k, theirs[1]) - Math.max(ours[0] + k, theirs[0]));
    }
    return Math.round(total * 10) / 10;
  };

  const fmtHours = (h) => (Number.isInteger(h) ? h : h.toFixed(1)) + ' h';

  const outEu = document.getElementById('atl-clock-eu');
  const outUs = document.getElementById('atl-clock-us');
  const outName = document.getElementById('atl-us-name');
  const outCity = document.getElementById('atl-city');
  const outNote = document.getElementById('atl-note');
  const outHours = document.getElementById('atl-hours');

  /* Zone shorthand rather than a translated word: ET, CT, PT read the
     same in every language a U.S. client is likely to write in. */
  const SHORT = {
    'America/New_York': 'ET', 'America/Chicago': 'CT', 'America/Denver': 'MT',
    'America/Phoenix': 'MT', 'America/Los_Angeles': 'PT',
    'America/Anchorage': 'AK', 'Pacific/Honolulu': 'HI'
  };

  let current = null;

  const paint = () => {
    const now = new Date();
    if (outEu) outEu.textContent = clockIn(TZ_EU, now);
    if (!current) return;
    if (outUs) outUs.textContent = clockIn(current.tz, now);
    if (outName) outName.textContent = current.st.n;
    if (outCity) outCity.textContent = current.city;
    if (outNote) outNote.textContent = current.st.n + ' · ' + (SHORT[current.tz] || current.st.z);
    if (outHours) outHours.textContent = fmtHours(overlapHours(current.tz, now));
  };

  /* ── the run ───────────────────────────────────────────────── */

  const select = (leg) => {
    legs.forEach(l => {
      l.dot.classList.toggle('is-live', l === leg);
      l.line.classList.toggle('is-live', l === leg);
      shapes[l.s] && shapes[l.s].classList.toggle('is-live', l === leg);
    });
    current = leg;
    paint();
  };

  let index = 0;
  let raf = 0;

  const fly = (leg, done) => {
    const dur = 1250;
    const start = performance.now();
    leg.live.style.strokeDasharray = leg.len;
    leg.live.style.strokeDashoffset = leg.len;
    leg.live.classList.add('is-flying');
    packet.classList.add('is-flying');
    const step = (t) => {
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

  const clear = (leg) => {
    leg.live.classList.remove('is-flying');
    leg.live.style.strokeDashoffset = leg.len;
  };

  let timer = 0;
  const cycle = () => {
    const leg = legs[index % legs.length];
    index++;
    select(leg);
    fly(leg, () => {
      timer = setTimeout(() => { clear(leg); cycle(); }, 2200);
    });
  };

  /* Hovering a state takes the wheel: a visitor looking for their own
     state should not have to wait for the loop to come round. */
  legs.forEach(leg => {
    const enter = () => {
      clearTimeout(timer);
      cancelAnimationFrame(raf);
      legs.forEach(clear);
      select(leg);
      if (!calm.matches) fly(leg, () => {});
    };
    [leg.dot, shapes[leg.s]].forEach(node => {
      if (!node) return;
      node.style.cursor = 'pointer';
      node.addEventListener('mouseenter', enter);
      node.addEventListener('focus', enter);
    });
  });

  stage.addEventListener('mouseleave', () => {
    if (calm.matches) return;
    clearTimeout(timer);
    cancelAnimationFrame(raf);
    legs.forEach(clear);
    timer = setTimeout(cycle, 400);
  });

  const begin = () => {
    if (calm.matches) {
      /* Motion off: the network still reads, it simply stops moving. */
      legs.forEach(l => { l.live.style.strokeDasharray = 'none'; l.live.style.strokeDashoffset = 0; });
      packet.remove();
      select(legs[0]);
      return;
    }
    cycle();
  };

  /* Nothing animates until the hero is actually on screen. */
  if ('IntersectionObserver' in window) {
    let running = false;
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting && !running) { running = true; begin(); }
        else if (!e.isIntersecting && running && !calm.matches) {
          running = false;
          clearTimeout(timer); cancelAnimationFrame(raf);
          legs.forEach(clear);
        }
      });
    }, { threshold: 0.12 });
    io.observe(stage);
  } else {
    begin();
  }

  paint();
  setInterval(paint, 15000);
  document.addEventListener('langchange', paint);
})();
