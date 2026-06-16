// Burger menu
const burger = document.getElementById('burger');
const navLinks = document.getElementById('nav-links');
burger.addEventListener('click', () => {
  navLinks.classList.toggle('open');
});
document.querySelectorAll('.nav-links a').forEach(a => {
  a.addEventListener('click', () => navLinks.classList.remove('open'));
});

// Nav shadow on scroll
const nav = document.getElementById('nav');
window.addEventListener('scroll', () => {
  nav.style.boxShadow = window.scrollY > 10 ? '0 2px 20px rgba(0,0,0,0.06)' : '';
});

// Contact form → mailto
document.getElementById('contactForm').addEventListener('submit', function(e) {
  e.preventDefault();
  const data = new FormData(this);
  const name = data.get('name');
  const email = data.get('email');
  const service = data.get('service');
  const message = data.get('message');
  const subject = encodeURIComponent(`Munister Agency — запит від ${name}`);
  const body = encodeURIComponent(`Ім'я: ${name}\nEmail: ${email}\nПослуга: ${service}\n\nЗавдання:\n${message}`);
  window.location.href = `mailto:munister@outlook.com?subject=${subject}&body=${body}`;
});
