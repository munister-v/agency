// ─── Scroll progress bar ───
const progressBar = document.getElementById('scrollProgress');
const backToTop   = document.getElementById('backToTop');
const navEl       = document.getElementById('nav');
const heroEl      = document.getElementById('home');

function navThreshold() {
  const h = heroEl ? heroEl.offsetHeight : window.innerHeight;
  return Math.max(h - 80, 60);
}

function updateNavState(scrolled) {
  navEl.classList.toggle('scrolled', scrolled > navThreshold());
}

window.addEventListener('scroll', () => {
  const scrolled = window.scrollY;
  const total    = document.documentElement.scrollHeight - window.innerHeight;
  progressBar.style.width = total > 0 ? (scrolled / total * 100) + '%' : '0%';

  // Back to top visibility
  if (scrolled > 600) backToTop.classList.add('visible');
  else backToTop.classList.remove('visible');

  // Nav transparent-over-hero → solid
  updateNavState(scrolled);

  // Active nav link highlight
  updateActiveNav();
}, { passive: true });

// Initial nav state on load
updateNavState(window.scrollY);

// ─── Back to top ───
backToTop.addEventListener('click', () => {
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

// ─── Active nav highlighting ───
const sections = ['home','about','services','portfolio','how'].map(id => document.getElementById(id)).filter(Boolean);

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
const menuClose = document.getElementById('menu-close');

function closeMobileNav() {
  const wasOpen = navLinks.classList.contains('open');
  navLinks.classList.remove('open');
  navEl.classList.remove('menu-open');
  burger.setAttribute('aria-expanded', 'false');
  burger.setAttribute('aria-label', 'Open menu');
  document.body.classList.remove('menu-active');
  if (wasOpen) burger.focus({ preventScroll: true });
}

burger.addEventListener('click', () => {
  const open = navLinks.classList.toggle('open');
  navEl.classList.toggle('menu-open', open);
  burger.setAttribute('aria-expanded', String(open));
  burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  document.body.classList.toggle('menu-active', open);
  if (open) burger.focus({ preventScroll: true });
});

navLinks.querySelectorAll('a').forEach(a => a.addEventListener('click', closeMobileNav));
menuClose?.addEventListener('click', closeMobileNav);

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

// ─── PWA install prompt ───
let deferredPrompt;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredPrompt = e;
});
