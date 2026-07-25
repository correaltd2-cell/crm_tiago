/* NEW STAR — utilitários de interface */
(function () {
  'use strict';
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  function escH(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function el(tag, attrs, ...children) {
    const e = document.createElement(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') e.className = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else if (v !== null && v !== undefined) e.setAttribute(k, v);
    }
    for (const c of children.flat()) {
      if (c == null) continue;
      e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return e;
  }

  let toastTimer;
  function toast(msg, tipo) {
    let t = $('#ns-toast');
    if (!t) { t = el('div', { id: 'ns-toast' }); document.body.appendChild(t); }
    t.textContent = msg;
    t.className = 'show ' + (tipo || '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.className = ''; }, 3200);
  }

  function modal(content, opts) {
    opts = opts || {};
    const overlay = el('div', { class: 'ns-overlay' });
    const box = el('div', { class: 'ns-modal ' + (opts.full ? 'full' : '') });
    if (opts.titulo) {
      box.appendChild(el('div', { class: 'ns-modal-head' },
        el('strong', null, opts.titulo),
        el('button', { class: 'btn-icon', onclick: fechar, 'aria-label': 'Fechar' }, '✕')));
    }
    const body = el('div', { class: 'ns-modal-body' });
    if (typeof content === 'string') body.innerHTML = content; else body.appendChild(content);
    box.appendChild(body);
    overlay.appendChild(box);
    function fechar() { overlay.remove(); if (opts.onClose) opts.onClose(); }
    if (!opts.bloqueado) overlay.addEventListener('click', (e) => { if (e.target === overlay) fechar(); });
    document.body.appendChild(overlay);
    return { fechar, body, box };
  }

  function confirmar(msg) {
    return new Promise((resolve) => {
      const c = el('div', null,
        el('p', { class: 'mb12' }, msg),
        el('div', { class: 'row gap8' },
          el('button', { class: 'btn btn-sec grow', onclick: () => { m.fechar(); resolve(false); } }, 'Cancelar'),
          el('button', { class: 'btn grow', onclick: () => { m.fechar(); resolve(true); } }, 'Confirmar')));
      const m = modal(c, { titulo: 'Confirmação' });
    });
  }

  const dataBR = (iso) => iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '—';
  const hojeISO = () => {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };
  const mesISO = (iso) => String(iso || hojeISO()).slice(0, 7);

  function baixar(blob, nome) {
    const a = el('a', { href: URL.createObjectURL(blob), download: nome });
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  }

  window.NSUI = { $, $$, el, escH, toast, modal, confirmar, dataBR, hojeISO, mesISO, baixar };
})();
