// ─── Burger menu ───
const burger = document.getElementById('burger');
const navLinks = document.getElementById('nav-links');

burger.addEventListener('click', () => {
  const open = navLinks.classList.toggle('open');
  burger.setAttribute('aria-expanded', open);
  document.body.style.overflow = open ? 'hidden' : '';
});

document.querySelectorAll('.nav-links a').forEach(a => {
  a.addEventListener('click', () => {
    navLinks.classList.remove('open');
    burger.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
  });
});

// Close on outside click
document.addEventListener('click', e => {
  if (navLinks.classList.contains('open') && !navLinks.contains(e.target) && !burger.contains(e.target)) {
    navLinks.classList.remove('open');
    burger.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
  }
});

// ─── Smooth scroll for anchor links ───
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', e => {
    const id = a.getAttribute('href');
    if (id === '#') return;
    const target = document.querySelector(id);
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
});

// ─── Reveal on scroll (IntersectionObserver) ───
const revealEls = document.querySelectorAll('.reveal');
if (revealEls.length) {
  const io = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });
  revealEls.forEach(el => io.observe(el));
}

// ─── Contact form → mailto ───
document.getElementById('contactForm').addEventListener('submit', function(e) {
  e.preventDefault();
  const data = new FormData(this);
  const name    = data.get('name') || '';
  const email   = data.get('email') || '';
  const service = data.get('service') || '';
  const message = data.get('message') || '';
  const subject = encodeURIComponent(`Munister Agency — запит від ${name}`);
  const body    = encodeURIComponent(
    `Ім'я: ${name}\nEmail: ${email}\nПослуга: ${service}\n\nЗавдання:\n${message}`
  );
  window.location.href = `mailto:munister@outlook.com?subject=${subject}&body=${body}`;
});

// ─── Lang from URL param (?lang=en) ───
const urlLang = new URLSearchParams(location.search).get('lang');
if (urlLang && ['uk','en','de','pl'].includes(urlLang)) {
  // i18n.js reads localStorage; pre-set it so applyLang on load picks it up
  localStorage.setItem('lang', urlLang);
}
