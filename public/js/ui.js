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

  /* ═══ Ícones — traço fino, 24×24, herdam a cor do texto ═══
     Desenhados à mão para o NEW STAR: linha de 1.7, cantos arredondados,
     nada de emoji (que muda de desenho em cada aparelho e tem cara amadora). */
  const ICONES = {
    calendario: '<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M8 3v4M16 3v4M3 10h18"/><circle cx="8.4" cy="14.4" r="1.15" fill="currentColor" stroke="none"/>',
    agenda: '<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M8 3v4M16 3v4M3 10h18"/><circle cx="8" cy="14" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="14" r="1" fill="currentColor" stroke="none"/><circle cx="16" cy="14" r="1" fill="currentColor" stroke="none"/><circle cx="8" cy="17.6" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="17.6" r="1" fill="currentColor" stroke="none"/>',
    loja: '<path d="M4.5 10.8V20a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1v-9.2"/><path d="M2.6 9.6 4.3 4.2a1.2 1.2 0 0 1 1.15-.85h13.1a1.2 1.2 0 0 1 1.15.85l1.7 5.4a2.7 2.7 0 0 1-4.6 2.2 2.7 2.7 0 0 1-4.6 0 2.7 2.7 0 0 1-4.6 0 2.7 2.7 0 0 1-4.6-2.2Z"/><path d="M9.8 21v-5.2h4.4V21"/>',
    recibo: '<path d="M5.5 3.4a1 1 0 0 1 1-1h11a1 1 0 0 1 1 1v17.9l-2.6-1.6-2.45 1.6L11 19.7l-2.45 1.6L6 19.7l-.5.3Z"/><path d="M9 7.6h6M9 11.2h6M9 14.8h3.5"/>',
    grafico: '<path d="M3.2 21h17.6"/><path d="M7 21v-8.2M12 21V4.6M17 21v-5.6"/>',
    menu: '<path d="M4 7.2h16M4 12h16M4 16.8h16"/>',
    ajuda: '<circle cx="12" cy="12" r="9"/><path d="M9.3 9.4a2.8 2.8 0 1 1 3.5 4.2v1.2"/><circle cx="12" cy="17.6" r="1" fill="currentColor" stroke="none"/>',
    fechar: '<path d="M6.2 6.2 17.8 17.8M17.8 6.2 6.2 17.8"/>',
    lixeira: '<path d="M4 6.4h16"/><path d="M9.6 6.4V4.8a1.3 1.3 0 0 1 1.3-1.3h2.2a1.3 1.3 0 0 1 1.3 1.3v1.6"/><path d="m6.4 6.4.9 13.4a1.4 1.4 0 0 0 1.4 1.3h6.6a1.4 1.4 0 0 0 1.4-1.3l.9-13.4"/><path d="M10.4 10.4v6.6M13.6 10.4v6.6"/>',
    lapis: '<path d="M4 20h4.1L20 8.1a2 2 0 0 0 0-2.9l-1.2-1.2a2 2 0 0 0-2.9 0L4 15.9Z"/><path d="m14.6 6.5 2.9 2.9"/>',
    assinatura: '<path d="M3 16.4c2.3 0 3-8.5 5-8.5s.6 8.5 2.9 8.5c1.5 0 1.9-3.2 3.4-3.2 1.2 0 1.4 3.2 2.9 3.2H21"/><path d="M4 20.5h16"/>',
    alerta: '<path d="M10.3 4 2.6 17.5A1.9 1.9 0 0 0 4.3 20.4h15.4a1.9 1.9 0 0 0 1.7-2.9L13.7 4a1.9 1.9 0 0 0-3.4 0Z"/><path d="M12 9.6v4"/><circle cx="12" cy="16.7" r=".95" fill="currentColor" stroke="none"/>',
    check: '<path d="m4.8 12.4 4.9 4.9L19.2 6.8"/>',
    checkCirculo: '<circle cx="12" cy="12" r="9"/><path d="m8.1 12.3 2.7 2.7 5.4-5.5"/>',
    mais: '<path d="M12 5.2v13.6M5.2 12h13.6"/>',
    setaEsq: '<path d="M19 12H5.4"/><path d="m11 6-6 6 6 6"/>',
    setaDir: '<path d="M5 12h13.6"/><path d="m13 6 6 6-6 6"/>',
    retorno: '<path d="M9 6.5 3.8 12 9 17.5"/><path d="M3.8 12h11.4a5 5 0 0 1 5 5v2.5"/>',
    ajustes: '<path d="M4 7.5h8M16.5 7.5H20M4 16.5h3.5M12 16.5h8"/><circle cx="14.2" cy="7.5" r="2.4"/><circle cx="9.7" cy="16.5" r="2.4"/>',
    caixa: '<path d="M3.6 7.6 12 3.2l8.4 4.4v8.8L12 20.8l-8.4-4.4Z"/><path d="m3.6 7.6 8.4 4.5 8.4-4.5M12 20.8v-8.7"/>',
    display: '<rect x="3.4" y="3.6" width="17.2" height="9.6" rx="1.6"/><path d="M12 13.2V20.6M8.4 20.6h7.2"/>',
    pin: '<path d="M20 10.4c0 5.4-8 10.9-8 10.9s-8-5.5-8-10.9a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10.2" r="2.8"/>',
    salvar: '<path d="M4.4 5.6A1.6 1.6 0 0 1 6 4h9.6L20 8.4V18.4A1.6 1.6 0 0 1 18.4 20H6a1.6 1.6 0 0 1-1.6-1.6Z"/><path d="M8 4v5.2h6.8V4M8 20v-5.6h8V20"/>',
    tendencia: '<path d="m3.2 16.6 6.3-6.3 4 4 7.3-7.3"/><path d="M15.4 7h5.4v5.4"/>',
    bloquear: '<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6 18.4 18.4"/>',
    pessoas: '<path d="M16.2 20.4v-1.8a3.5 3.5 0 0 0-3.5-3.5H6.7a3.5 3.5 0 0 0-3.5 3.5v1.8"/><circle cx="9.7" cy="7.6" r="3.5"/><path d="M20.8 20.4v-1.8a3.5 3.5 0 0 0-2.6-3.4M15.4 4.3a3.5 3.5 0 0 1 0 6.8"/>',
    relogio: '<circle cx="12" cy="12" r="9"/><path d="M12 6.8v5.4l3.4 2"/>',
    nota: '<path d="M13.2 3.4H6.8A1.6 1.6 0 0 0 5.2 5v14A1.6 1.6 0 0 0 6.8 20.6h10.4A1.6 1.6 0 0 0 18.8 19V9Z"/><path d="M13.2 3.4V9h5.6"/><path d="M8.4 13.2h7.2M8.4 16.6h4.6"/>',
    alvo: '<circle cx="12" cy="12" r="8.6"/><circle cx="12" cy="12" r="4.6"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/>',
    documento: '<path d="M13.4 3.2H7A1.6 1.6 0 0 0 5.4 4.8v14.4A1.6 1.6 0 0 0 7 20.8h10a1.6 1.6 0 0 0 1.6-1.6V8.4Z"/><path d="M13.4 3.2v5.2h5.2"/><path d="M8.6 13h6.8M8.6 16.4h4.4"/>',
    paleta: '<path d="M12 20.8a8.8 8.8 0 1 1 8.8-8.8c0 1.7-1.4 3-3.1 3h-1.6a2 2 0 0 0-1.5 3.3 1.9 1.9 0 0 1-1.5 2.5Z"/><circle cx="7.8" cy="12.2" r="1.1" fill="currentColor" stroke="none"/><circle cx="10" cy="7.9" r="1.1" fill="currentColor" stroke="none"/><circle cx="15" cy="8.2" r="1.1" fill="currentColor" stroke="none"/>',
    offline: '<path d="m3 3 18 18"/><path d="M8.7 15.4a4.8 4.8 0 0 1 6.2-.3M5.4 12a9.6 9.6 0 0 1 3.1-2M18.6 12a9.6 9.6 0 0 0-4.4-2.4M2.2 8.6a14.4 14.4 0 0 1 3.9-2.4M21.8 8.6a14.4 14.4 0 0 0-9.4-2.8"/><circle cx="12" cy="18.9" r=".95" fill="currentColor" stroke="none"/>',
    sincronizar: '<path d="M20.4 11.4A8.4 8.4 0 0 0 5.8 6.9L3.4 9.2"/><path d="M3.6 12.6a8.4 8.4 0 0 0 14.6 4.5l2.4-2.3"/><path d="M3.2 4.6v4.8h4.8M20.8 19.4v-4.8H16"/>',
    cidade: '<path d="M3 21h18"/><path d="M5.2 21V10l5.4-3.1V21"/><path d="M10.6 21V4l8.2 3.5V21"/><circle cx="7.6" cy="13.2" r=".8" fill="currentColor" stroke="none"/><circle cx="7.6" cy="16.8" r=".8" fill="currentColor" stroke="none"/><circle cx="14.6" cy="12.2" r=".8" fill="currentColor" stroke="none"/><circle cx="14.6" cy="15.8" r=".8" fill="currentColor" stroke="none"/>',
    estrela: '<path d="m12 3.4 2.68 5.43 6 .87-4.34 4.23 1.02 5.97L12 17.1l-5.36 2.8 1.02-5.97-4.34-4.23 6-.87Z"/>',
    carro: '<path d="M3.6 17.4v-4.1l1.8-4.5a2 2 0 0 1 1.86-1.25h9.48a2 2 0 0 1 1.86 1.25l1.8 4.5v4.1"/><path d="M3.6 13.3h16.8"/><circle cx="7.4" cy="17.5" r="1.7"/><circle cx="16.6" cy="17.5" r="1.7"/>',
    pular: '<path d="M5.4 5.6 14 12l-8.6 6.4Z"/><path d="M17.8 5.6v12.8"/>',
    mapa: '<path d="m3.2 6.9 5.8-2.2 6 2.2 5.8-2.2v12.4l-5.8 2.2-6-2.2-5.8 2.2Z"/><path d="M9 4.7v14.6M15 6.9v14.6"/>',
    lampada: '<path d="M9.3 17.2a5.8 5.8 0 1 1 5.4 0"/><path d="M9.6 20.4h4.8M10.2 17.2v3.2M13.8 17.2v3.2"/>',
    dinheiro: '<rect x="2.6" y="5.2" width="18.8" height="13.6" rx="2.2"/><circle cx="12" cy="12" r="3.1"/><path d="M6.1 9.2v5.6M17.9 9.2v5.6"/>',
    joia: '<path d="M12 21 3.2 9.8 6 3.6h12l2.8 6.2Z"/><path d="M3.2 9.8h17.6"/><path d="M9 3.6 7.4 9.8 12 21l4.6-11.2L15 3.6"/>',
    trofeu: '<path d="M8 3.6h8v5.2a4 4 0 0 1-8 0Z"/><path d="M8 5.4H5.4a2.6 2.6 0 0 0 2.6 4.2M16 5.4h2.6a2.6 2.6 0 0 1-2.6 4.2"/><path d="M12 12.8v3.6"/><path d="M9.4 20.4h5.2l-.7-4H10.1Z"/>',
    brilho: '<path d="m11 3 1.75 4.7L17.4 9.4l-4.65 1.75L11 15.8 9.25 11.15 4.6 9.4l4.65-1.7Z"/><path d="m18 14.4.9 2.3 2.3.9-2.3.9-.9 2.3-.9-2.3-2.3-.9 2.3-.9Z"/>',
    combustivel: '<path d="M4.4 20.8V5a2 2 0 0 1 2-2h4.8a2 2 0 0 1 2 2v15.8"/><path d="M3 20.8h11.6"/><path d="M6.8 8.4h4"/><path d="M13.2 9.8h2.6a1.8 1.8 0 0 1 1.8 1.8v5.2a1.7 1.7 0 0 0 3.4 0V9.4l-2.6-2.6"/>',
    estrada: '<path d="M6.6 3 4.4 21M17.4 3l2.2 18"/><path d="M12 3.4v3.2M12 10.4v3.2M12 17.4v3.2"/>',
    cama: '<path d="M3.2 19.4V6.6"/><path d="M3.2 11.4h12.6a5 5 0 0 1 5 5v3"/><path d="M3.2 16.2h17.6"/><circle cx="7.6" cy="8.6" r="1.9"/>',
    refeicao: '<path d="M6 3v7.6a2.6 2.6 0 0 0 5.2 0V3"/><path d="M8.6 10.2V21"/><path d="M17.6 21V3s2.6 1.6 2.6 6.2-2.6 5.2-2.6 5.2"/>',
    ferramenta: '<path d="M15.4 3.4a5 5 0 0 0-4.25 7.6L3.7 18.5a1.85 1.85 0 0 0 2.6 2.6l7.5-7.45a5 5 0 0 0 6.4-6.4l-2.9 2.9-2.75-.7-.7-2.75Z"/>',
    cartao: '<rect x="2.6" y="5" width="18.8" height="14" rx="2.2"/><path d="M2.6 9.8h18.8M6.2 15h3.4"/>',
    etiqueta: '<path d="M11.6 3.4H5.2a1.8 1.8 0 0 0-1.8 1.8v6.4a1.8 1.8 0 0 0 .53 1.27l7.2 7.2a1.8 1.8 0 0 0 2.54 0l6.4-6.4a1.8 1.8 0 0 0 0-2.54l-7.2-7.2a1.8 1.8 0 0 0-1.27-.53Z"/><circle cx="7.8" cy="7.8" r="1.3"/>',
    globo: '<circle cx="12" cy="12" r="9"/><path d="M3.2 12h17.6"/><path d="M12 3a13.6 13.6 0 0 1 0 18 13.6 13.6 0 0 1 0-18Z"/>',
    subir: '<path d="M12 19.6V5"/><path d="m6 11 6-6 6 6"/>',
    descer: '<path d="M12 4.4V19"/><path d="m6 13 6 6 6-6"/>',
    chave: '<circle cx="7.6" cy="15.4" r="3.9"/><path d="M10.4 12.6 20.4 2.6"/><path d="m17.2 5.8 2.4 2.4M14.6 8.4l2.4 2.4"/>',
    compartilhar: '<path d="M12 3.2v12.4"/><path d="m8 7 4-4 4 4"/><path d="M5.2 13.6v5.2a2 2 0 0 0 2 2h9.6a2 2 0 0 0 2-2v-5.2"/>',
    impressora: '<path d="M6.6 9.2V3.4h10.8v5.8"/><rect x="3.2" y="9.2" width="17.6" height="7.4" rx="2"/><path d="M6.6 14h10.8v6.6H6.6Z"/><circle cx="17.4" cy="12.2" r=".9" fill="currentColor" stroke="none"/>',
    telefone: '<path d="M20.8 16.9v2.5a1.8 1.8 0 0 1-2 1.8 17.6 17.6 0 0 1-7.7-2.75 17.3 17.3 0 0 1-5.3-5.3A17.6 17.6 0 0 1 3.05 5.4a1.8 1.8 0 0 1 1.8-2h2.5a1.8 1.8 0 0 1 1.8 1.55c.11.85.32 1.68.6 2.47a1.8 1.8 0 0 1-.4 1.9L8.2 10.45a14.2 14.2 0 0 0 5.35 5.35l1.13-1.13a1.8 1.8 0 0 1 1.9-.4c.79.28 1.62.49 2.47.6a1.8 1.8 0 0 1 1.55 1.83Z"/>',
    usuario: '<circle cx="12" cy="8" r="4"/><path d="M4.6 20.6a7.4 7.4 0 0 1 14.8 0"/>',
    rota: '<circle cx="6.2" cy="18.4" r="2.6"/><circle cx="17.8" cy="5.6" r="2.6"/><path d="M15.2 5.6H10a3.6 3.6 0 0 0 0 7.2h4a3.6 3.6 0 0 1 0 7.2H8.8"/>'
  };

  // <svg> pronto para ir no innerHTML (template string)
  function icoHTML(nome, cls) {
    const d = ICONES[nome];
    if (!d) return '';
    return '<svg class="ic' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" aria-hidden="true">' + d + '</svg>';
  }
  // nó DOM do ícone
  function ico(nome, cls) {
    const caixa = document.createElement('span');
    caixa.innerHTML = icoHTML(nome, cls);
    return caixa.firstChild;
  }
  // ícone + texto no mesmo botão/linha
  function rot(nome, texto, cls) {
    const f = document.createDocumentFragment();
    const s = ico(nome, cls);
    if (s) f.appendChild(s);
    f.appendChild(document.createTextNode(texto));
    return f;
  }
  // bolinha do farol (vermelho/amarelo/verde/cinza) — some o emoji, fica um ponto limpo
  function farol(cor) {
    return el('span', { class: 'st-tag ' + cor, 'aria-hidden': 'true' });
  }
  function farolHTML(cor) {
    return '<span class="st-tag ' + cor + '" aria-hidden="true"></span>';
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
        el('button', { class: 'btn-icon', onclick: fechar, 'aria-label': 'Fechar' }, ico('fechar'))));
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

  window.NSUI = { $, $$, el, escH, toast, modal, confirmar, dataBR, hojeISO, mesISO, baixar,
    ico, icoHTML, rot, farol, farolHTML, ICONES };
})();
