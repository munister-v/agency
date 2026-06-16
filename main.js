// ─── Scroll progress bar ───
const progressBar = document.getElementById('scrollProgress');
const backToTop   = document.getElementById('backToTop');

window.addEventListener('scroll', () => {
  const scrolled = window.scrollY;
  const total    = document.documentElement.scrollHeight - window.innerHeight;
  progressBar.style.width = total > 0 ? (scrolled / total * 100) + '%' : '0%';

  // Back to top visibility
  if (scrolled > 600) backToTop.classList.add('visible');
  else backToTop.classList.remove('visible');

  // Active nav link highlight
  updateActiveNav();
}, { passive: true });

// ─── Back to top ───
backToTop.addEventListener('click', () => {
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

// ─── Active nav highlighting ───
const sections = ['home','about','services','portfolio','how','contact'].map(id => document.getElementById(id)).filter(Boolean);

function updateActiveNav() {
  const scrollY = window.scrollY + 100;
  let current = '';
  sections.forEach(sec => {
    if (sec.offsetTop <= scrollY) current = sec.id;
  });
  document.querySelectorAll('.nav-links a[href^="#"]').forEach(a => {
    const target = a.getAttribute('href').replace('#', '');
    a.classList.toggle('active', target === current);
  });
}

// ─── Burger menu ───
const burger   = document.getElementById('burger');
const navLinks = document.getElementById('nav-links');

function closeMobileNav() {
  navLinks.classList.remove('open');
  burger.setAttribute('aria-expanded', 'false');
  document.body.style.overflow = '';
}

burger.addEventListener('click', () => {
  const open = navLinks.classList.toggle('open');
  burger.setAttribute('aria-expanded', String(open));
  document.body.style.overflow = open ? 'hidden' : '';
});

navLinks.querySelectorAll('a').forEach(a => a.addEventListener('click', closeMobileNav));

document.addEventListener('click', e => {
  if (navLinks.classList.contains('open') && !navLinks.contains(e.target) && !burger.contains(e.target)) {
    closeMobileNav();
  }
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeMobileNav();
});

// ─── Smooth scroll for anchor links ───
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', e => {
    const id = a.getAttribute('href');
    if (id === '#') { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    const target = document.querySelector(id);
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
});

// ─── Reveal on scroll (IntersectionObserver) ───
const revealEls = document.querySelectorAll('.reveal, .work-card');
if ('IntersectionObserver' in window) {
  const io = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
  revealEls.forEach(el => {
    el.classList.add('reveal');
    io.observe(el);
  });
} else {
  revealEls.forEach(el => el.classList.add('visible'));
}

// ─── Contact form with validation + mailto ───
const form    = document.getElementById('contactForm');
const formBtn = document.getElementById('formBtn');
const toast   = document.getElementById('formToast');

function showToast(msg, isError = false) {
  toast.textContent = msg;
  toast.className = 'form-toast' + (isError ? ' error' : '');
  setTimeout(() => { toast.textContent = ''; toast.className = 'form-toast'; }, 6000);
}

function validateField(group, value, label) {
  if (!value.trim()) {
    group.classList.add('has-error');
    let err = group.querySelector('.field-error');
    if (!err) { err = document.createElement('p'); err.className = 'field-error'; group.appendChild(err); }
    err.textContent = `${label} — обов'язкове поле`;
    return false;
  }
  group.classList.remove('has-error');
  const err = group.querySelector('.field-error');
  if (err) err.remove();
  return true;
}

// Live validation on blur
form.querySelectorAll('input, textarea').forEach(el => {
  el.addEventListener('blur', () => {
    const group = el.closest('.form-group');
    if (el.required) validateField(group, el.value, el.previousElementSibling?.textContent || '');
  });
  el.addEventListener('input', () => {
    if (el.closest('.form-group').classList.contains('has-error') && el.value.trim()) {
      el.closest('.form-group').classList.remove('has-error');
      const err = el.closest('.form-group').querySelector('.field-error');
      if (err) err.remove();
    }
  });
});

form.addEventListener('submit', function(e) {
  e.preventDefault();
  const data = new FormData(this);
  const name    = data.get('name') || '';
  const email   = data.get('email') || '';
  const message = data.get('message') || '';
  const service = data.get('service') || '';

  // Validate
  let valid = true;
  const nameGroup = form.querySelector('[name="name"]').closest('.form-group');
  const emailGroup = form.querySelector('[name="email"]').closest('.form-group');
  const msgGroup  = form.querySelector('[name="message"]').closest('.form-group');
  if (!validateField(nameGroup, name, "Ім'я")) valid = false;
  if (!validateField(emailGroup, email, 'Email')) valid = false;
  if (!validateField(msgGroup, message, 'Завдання')) valid = false;
  if (!valid) { showToast('Заповніть усі обов\'язкові поля', true); return; }

  // Email validation
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    validateField(emailGroup, '', 'Невірний формат email');
    emailGroup.classList.add('has-error');
    let err = emailGroup.querySelector('.field-error');
    if (!err) { err = document.createElement('p'); err.className = 'field-error'; emailGroup.appendChild(err); }
    err.textContent = 'Невірний формат email';
    return;
  }

  formBtn.classList.add('loading');
  const subject = encodeURIComponent(`Munister Agency — запит від ${name}`);
  const body    = encodeURIComponent(
    `Ім'я: ${name}\nEmail: ${email}\nПослуга: ${service}\n\nЗавдання:\n${message}`
  );
  window.location.href = `mailto:munister@outlook.com?subject=${subject}&body=${body}`;
  setTimeout(() => {
    formBtn.classList.remove('loading');
    showToast('✓ Лист відкрито у вашому поштовому клієнті');
    form.reset();
  }, 1200);
});

// ─── Lang from URL param (?lang=en) ───
const urlLang = new URLSearchParams(location.search).get('lang');
if (urlLang && ['uk','en','de','pl'].includes(urlLang)) {
  localStorage.setItem('lang', urlLang);
}

// ─── PWA install prompt ───
let deferredPrompt;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredPrompt = e;
});
