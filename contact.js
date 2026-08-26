/* ─────────────────────────────────────────────────────────────
   Contact form.

   The site is static, so the form posts to the CRM the team
   already works in: POST /api/leads/intake on the Army Bank
   host writes an Inbound card into the Leads panel. If that
   request cannot go through, the visitor is not left holding a
   message: the error offers the same text as a prefilled email.
   ───────────────────────────────────────────────────────────── */
(() => {
  'use strict';

  const form = document.getElementById('contact-form');
  const status = document.getElementById('contact-status');
  if (!form || !status) return;

  /* The form carries its own endpoint so a staging build can point
     somewhere else without touching this file. */
  const ENDPOINT = form.dataset.endpoint || 'https://bank.munister.com.ua/api/leads/intake';
  const MAILBOX = 'munister@outlook.com';

  const dict = () => {
    try {
      return translations[currentLang] || translations.en;
    } catch (e) { return {}; }
  };
  const say = (key, fallback) => (dict()[key] || fallback);

  const setStatus = (state, text, extraHTML) => {
    status.className = 'cf-status is-' + state;
    status.innerHTML = '';
    const line = document.createElement('span');
    line.textContent = text;
    status.appendChild(line);
    if (extraHTML) status.insertAdjacentHTML('beforeend', extraHTML);
  };

  const value = name => (form.elements[name] ? String(form.elements[name].value || '').trim() : '');

  /* The browser's own validation messages are not translated with the
     page, so the form checks the two things it actually needs itself. */
  const firstProblem = () => {
    if (!value('name')) return ['name', say('ct_err_name', 'Please tell us your name.')];
    if (!value('message')) return ['message', say('ct_err_message', 'Please describe what you are solving.')];
    const email = value('email');
    if (!email && !value('phone')) return ['email', say('ct_err_contact', 'Leave an email or a phone number so we can answer.')];
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return ['email', say('ct_err_email', 'That email address looks incomplete.')];
    return null;
  };

  const mailtoFallback = () => {
    const lines = [
      ['Name', value('name')],
      ['Company', value('company')],
      ['Email', value('email')],
      ['Phone', value('phone')],
      ['Service', value('service')],
      ['Budget', value('budget')]
    ].filter(pair => pair[1]).map(pair => pair[0] + ': ' + pair[1]);
    const body = lines.join('\n') + '\n\n' + value('message');
    return 'mailto:' + MAILBOX + '?subject=' + encodeURIComponent('Project inquiry')
      + '&body=' + encodeURIComponent(body);
  };

  let sending = false;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (sending) return;

    const problem = firstProblem();
    if (problem) {
      setStatus('error', problem[1]);
      const field = form.elements[problem[0]];
      if (field) field.focus();
      return;
    }

    const button = form.querySelector('.cf-submit');
    sending = true;
    form.classList.add('is-sending');
    if (button) button.disabled = true;
    setStatus('sending', say('ct_sending', 'Sending…'));

    const payload = {
      name: value('name'),
      company: value('company'),
      email: value('email'),
      phone: value('phone'),
      service: value('service'),
      budget: value('budget'),
      message: value('message'),
      website: value('website'),
      page: location.origin + location.pathname,
      lang: (typeof currentLang === 'string' ? currentLang : 'en')
    };

    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok && data && data.ok) {
        form.reset();
        setStatus('ok', say('ct_ok', 'Thank you. Your message is with us and we will answer within one working day.'));
        return;
      }

      /* 429 is the one failure worth naming: it is not broken, it is
         "you have already written, give us a moment". */
      if (res.status === 429) {
        setStatus('error', say('ct_err_often', 'That is a few messages in a row. Please try again a little later.'));
        return;
      }
      throw new Error('rejected');
    } catch (e) {
      setStatus(
        'error',
        say('ct_err_send', 'The message could not be sent from here.'),
        ' <a href="' + mailtoFallback() + '">' + say('ct_err_mail', 'Send it as an email instead') + '</a>'
      );
    } finally {
      sending = false;
      form.classList.remove('is-sending');
      if (button) button.disabled = false;
    }
  });

  /* Anything that says "discuss a project" now opens this form, so the
     first field should be ready when the visitor arrives. */
  document.querySelectorAll('a[href="#contact"]').forEach(link => {
    link.addEventListener('click', () => {
      setTimeout(() => {
        const first = form.elements['name'];
        if (first && window.matchMedia('(min-width: 769px)').matches) first.focus({ preventScroll: true });
      }, 600);
    });
  });
})();
