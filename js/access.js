(() => {
  'use strict';
  const config = window.MENU_ACCESS;
  const gate = document.getElementById('access-gate');
  const form = document.getElementById('access-form');
  const input = document.getElementById('access-password');
  const error = document.getElementById('access-error');
  const remember = document.getElementById('access-remember');
  const key = 'kailong-access-v1';
  const token = encodeURIComponent('kailong:' + config.password);
  const days = Number.isFinite(config.rememberDays) ? config.rememberDays : 30;
  function read(storage) {
    try {
      const value = JSON.parse(storage.getItem(key) || 'null');
      return value?.token === token && value.expiresAt > Date.now();
    } catch { return false; }
  }
  function unlock(focus) {
    gate.hidden = true;
    document.body.classList.remove('access-locked');
    input.value = '';
    error.textContent = '';
    if (focus) document.querySelector('.brand').focus({preventScroll:true});
  }
  function lock() {
    for (const type of ['localStorage', 'sessionStorage']) {
      try { window[type].removeItem(key); } catch { /* Current page still locks. */ }
    }
    document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
    gate.hidden = false;
    document.body.classList.add('access-locked');
    remember.checked = false;
    input.value = '';
    input.type = 'password';
    document.getElementById('access-toggle').textContent = '显示';
    document.getElementById('access-toggle').setAttribute('aria-pressed', 'false');
    input.setAttribute('aria-invalid', 'false');
    error.textContent = '';
    window.scrollTo(0, 0);
    input.focus({preventScroll:true});
  }
  let allowed = false;
  try { allowed = read(window.localStorage) || read(window.sessionStorage); } catch { /* Storage may be disabled. */ }
  if (allowed) unlock(false);
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (input.value !== config.password) {
      error.textContent = '密码不正确，请重新输入。';
      input.setAttribute('aria-invalid', 'true');
      input.select();
      return;
    }
    input.setAttribute('aria-invalid', 'false');
    for (const type of ['localStorage', 'sessionStorage']) {
      try { window[type].removeItem(key); } catch {}
    }
    try {
      const storage = remember.checked ? window.localStorage : window.sessionStorage;
      storage.setItem(key, JSON.stringify({token, expiresAt:Date.now() + days * 86400000}));
    } catch { /* A correct password always opens this page, even without storage. */ }
    unlock(true);
  });
  input.addEventListener('input', () => {
    input.setAttribute('aria-invalid', 'false');
    error.textContent = '';
  });
  document.getElementById('access-toggle').addEventListener('click', event => {
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    event.currentTarget.textContent = show ? '隐藏' : '显示';
    event.currentTarget.setAttribute('aria-pressed', String(show));
  });
  document.getElementById('lock-access').addEventListener('click', lock);
})();
