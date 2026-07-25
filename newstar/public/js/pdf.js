/* NEW STAR — gerador de PDF do talão (sem bibliotecas externas → funciona offline)
 * Fontes padrão Helvetica com WinAnsiEncoding (acentos pt-BR) e assinatura
 * embutida como JPEG (DCTDecode). Saída: Blob application/pdf. */
(function () {
  'use strict';
  const C = window.NSCalc;

  // ---------- escritor PDF mínimo ----------
  function PDFWriter() {
    const objs = []; // strings latin-1 (binário de imagem incluso)
    function add(body) { objs.push(body); return objs.length; } // ids 1..n
    function build() {
      let out = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
      const offsets = [0];
      objs.forEach((body, i) => {
        offsets.push(out.length);
        out += (i + 1) + ' 0 obj\n' + body + '\nendobj\n';
      });
      const xref = out.length;
      out += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n';
      for (let i = 1; i <= objs.length; i++)
        out += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
      out += 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF';
      const bytes = new Uint8Array(out.length);
      for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xFF;
      return new Blob([bytes], { type: 'application/pdf' });
    }
    return { add, build, objs };
  }

  // texto JS → WinAnsi (latin-1) com escapes de PDF
  function esc(s) {
    s = String(s == null ? '' : s);
    let out = '';
    for (const ch of s) {
      let code = ch.charCodeAt(0);
      if (code === 0x2013 || code === 0x2014) code = 45;        // – — → -
      else if (code === 0x2018 || code === 0x2019) code = 39;   // ’ → '
      else if (code === 0x201C || code === 0x201D) code = 34;   // “ ” → "
      else if (code > 255) code = 63;                            // ? p/ fora do latin-1
      const c = String.fromCharCode(code);
      if (c === '(' || c === ')' || c === '\\') out += '\\' + c;
      else out += c;
    }
    return out;
  }

  // ---------- página com operações acumuladas ----------
  const W = 595, H = 842, M = 40; // A4 retrato, margem
  function Page() {
    let ops = '';
    return {
      text(x, y, s, size, bold, align, wMax) {
        size = size || 9;
        const font = bold ? '/F2' : '/F1';
        if (align === 'right' || align === 'center') {
          const w = textWidth(s, size, bold);
          x = align === 'right' ? x - w : x - w / 2;
        }
        ops += 'BT ' + font + ' ' + size + ' Tf ' + fx(x) + ' ' + fx(y) + ' Td (' + esc(s) + ') Tj ET\n';
      },
      line(x1, y1, x2, y2, wd) {
        ops += (wd || 0.5) + ' w ' + fx(x1) + ' ' + fx(y1) + ' m ' + fx(x2) + ' ' + fx(y2) + ' l S\n';
      },
      rect(x, y, w, h, fill) {
        ops += (fill ? '0.93 0.93 0.95 rg ' : '') + fx(x) + ' ' + fx(y) + ' ' + fx(w) + ' ' + fx(h) +
          (fill ? ' re f 0 0 0 rg\n' : ' re S\n');
      },
      image(name, x, y, w, h) {
        ops += 'q ' + fx(w) + ' 0 0 ' + fx(h) + ' ' + fx(x) + ' ' + fx(y) + ' cm ' + name + ' Do Q\n';
      },
      stream() { return ops; }
    };
  }
  function fx(n) { return Math.round(n * 100) / 100; }

  // largura aproximada Helvetica (suficiente p/ alinhamento à direita)
  const NARROW = /[iIl1jft\.,:;'"\(\)\[\]!\|]/, WIDE = /[mwMW@]/;
  function textWidth(s, size, bold) {
    let w = 0;
    for (const ch of String(s)) w += NARROW.test(ch) ? 0.35 : WIDE.test(ch) ? 0.85 : (bold ? 0.58 : 0.55);
    return w * size;
  }
  function wrap(s, size, maxW, bold) {
    const words = String(s || '').split(/\s+/), linhas = [];
    let cur = '';
    for (const w of words) {
      const t = cur ? cur + ' ' + w : w;
      if (textWidth(t, size, bold) > maxW && cur) { linhas.push(cur); cur = w; }
      else cur = t;
    }
    if (cur) linhas.push(cur);
    return linhas;
  }

  // PNG dataURL (assinatura) → JPEG base64 + dimensões, fundo branco
  function pngParaJpeg(dataURL) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const cv = document.createElement('canvas');
        cv.width = img.width; cv.height = img.height;
        const cx = cv.getContext('2d');
        cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height);
        cx.drawImage(img, 0, 0);
        const jpeg = cv.toDataURL('image/jpeg', 0.85);
        resolve({ b64: jpeg.split(',')[1], w: img.width, h: img.height });
      };
      img.onerror = reject;
      img.src = dataURL;
    });
  }

  // ---------- layout do talão ----------
  const COLS = [
    { t: 'Cód.',      w: 34,  k: 'codigo' },
    { t: 'Produto',   w: 148, k: 'nome', left: true },
    { t: 'Tam.',      w: 26,  k: 'tamanho' },
    { t: 'Placas',    w: 32,  k: 'placas' },
    { t: 'Coloc.',    w: 38,  k: 'unid_colocadas' },
    { t: 'Dev.Displ', w: 44,  k: 'dev_display' },
    { t: 'Dev.Queb',  w: 44,  k: 'dev_quebrada' },
    { t: 'Vend.',     w: 36,  k: 'unid_vendidas' },
    { t: 'Preço',     w: 50,  k: 'preco_unit', money: true },
    { t: 'Total',     w: 62,  k: 'valor_total', money: true }
  ];

  async function gerarPDFPedido({ pedido, itens, cliente, rep, produtos, observacoes }) {
    const pdf = PDFWriter();
    const pages = [];
    let pg = Page(), y = H - M;
    const nova = () => { pages.push(pg); pg = Page(); y = H - M; };
    const dataBR = (iso) => iso ? iso.split('-').reverse().join('/') : '';
    const nomeTabela = pedido.tabela === 'lucro' ? 'Lucro Presumido' : 'Tabela Simples';
    const prodDe = (id) => (produtos.find(p => p.id === id) || {});

    // Cabeçalho
    pg.rect(M, y - 46, W - 2 * M, 46, true);
    pg.text(M + 10, y - 20, 'NEW STAR', 16, true);
    pg.text(M + 10, y - 36, 'Talão de Pedido — Consignação', 8.5);
    pg.text(W - M - 10, y - 20, 'PEDIDO Nº ' + (pedido.numero || 'PENDENTE'), 12, true, 'right');
    pg.text(W - M - 10, y - 36, 'Data: ' + dataBR(pedido.data), 9, false, 'right');
    y -= 58;

    // Vendedor / tabela
    pg.text(M, y, 'Vendedor: ' + (rep.nome || ''), 9, true);
    pg.text(M + 220, y, 'Contato: ' + (rep.contato || '—'), 9);
    pg.text(W - M, y, 'Tabela: ' + nomeTabela, 9, true, 'right');
    y -= 14;
    pg.text(M, y, 'Condição de pagamento: ' + (pedido.condicao_pagamento || '—'), 9);
    y -= 16;

    // Cliente
    pg.rect(M, y - 62, W - 2 * M, 62);
    let cy = y - 12;
    pg.text(M + 8, cy, (cliente.nome || ''), 10, true);
    pg.text(W - M - 8, cy, 'CNPJ/CPF: ' + (cliente.cnpj || '—'), 9, false, 'right');
    cy -= 13;
    pg.text(M + 8, cy, 'Contato: ' + (cliente.contato || '—') + '   Tel: ' + (cliente.telefone || '—') + '   Cel: ' + (cliente.celular || '—'), 8.5);
    cy -= 12;
    pg.text(M + 8, cy, 'E-mail: ' + (cliente.email || '—') + '   I.E.: ' + (cliente.inscricao_estadual || '—'), 8.5);
    cy -= 12;
    pg.text(M + 8, cy, 'End.: ' + [cliente.endereco, cliente.bairro].filter(Boolean).join(', '), 8.5);
    cy -= 12;
    pg.text(M + 8, cy, [cliente.cidade, cliente.uf].filter(Boolean).join(' - ') + '   CEP: ' + (cliente.cep || '—'), 8.5);
    y -= 74;

    // Tabela de itens
    const drawHead = () => {
      pg.rect(M, y - 14, W - 2 * M, 14, true);
      let x = M;
      for (const c of COLS) {
        pg.text(c.left ? x + 3 : x + c.w / 2, y - 10, c.t, 7.5, true, c.left ? undefined : 'center');
        x += c.w;
      }
      y -= 14;
    };
    drawHead();
    for (const it of itens) {
      if (y < 150) { nova(); pg.text(M, y - 10, 'PEDIDO Nº ' + (pedido.numero || 'PENDENTE') + ' — continuação', 9, true); y -= 22; drawHead(); }
      const p = prodDe(it.produto_id);
      const nome = (p.nome || '') + (p.variacao ? ' (' + p.variacao + ')' : '');
      let x = M;
      const rowVals = {
        codigo: p.codigo || '', nome, tamanho: it.tamanho, placas: it.placas,
        unid_colocadas: it.unid_colocadas, dev_display: it.dev_display,
        dev_quebrada: it.dev_quebrada, unid_vendidas: it.unid_vendidas,
        preco_unit: it.preco_unit, valor_total: it.valor_total
      };
      const nomeLinhas = wrap(nome, 7.5, 142);
      const rowH = Math.max(13, nomeLinhas.length * 9 + 4);
      for (const c of COLS) {
        let v = rowVals[c.k];
        if (c.money) v = C.fmtMoney(Number(v));
        if (c.k === 'nome') nomeLinhas.forEach((l, i) => pg.text(x + 3, y - 10 - i * 9, l, 7.5));
        else pg.text(c.left ? x + 3 : x + c.w / 2, y - 10, String(v), 7.5, c.k === 'valor_total', c.left ? undefined : 'center');
        x += c.w;
      }
      y -= rowH;
      pg.line(M, y, W - M, y, 0.3);
    }

    // Totais (devoluções/quebras destacadas — a fábrica confere por aqui)
    y -= 6;
    if (y < 210) nova();
    pg.text(W - M - 200, y - 4, 'Unidades colocadas: ' + pedido.total_unid_colocadas, 8.5);
    pg.text(W - M, y - 4, 'Devolvidas (display): ' + pedido.total_unid_dev_display, 8.5, true, 'right');
    y -= 12;
    pg.text(W - M - 200, y - 4, 'Unidades vendidas: ' + pedido.total_unid_vendidas, 8.5, true);
    pg.text(W - M, y - 4, 'Quebradas: ' + pedido.total_unid_dev_quebrada, 8.5, true, 'right');
    y -= 20;
    pg.rect(W - M - 220, y - 20, 220, 20, true);
    pg.text(W - M - 8, y - 14, 'TOTAL: ' + C.fmtMoney(Number(pedido.total_valor)), 12, true, 'right');
    y -= 34;

    if (pedido.obs) {
      const l = wrap('Observações do pedido: ' + pedido.obs, 8.5, W - 2 * M);
      l.forEach(t => { pg.text(M, y, t, 8.5); y -= 11; });
      y -= 4;
    }

    // Observações padrão do talão (configuráveis no admin)
    if (observacoes) {
      const l = wrap(observacoes, 7.5, W - 2 * M);
      if (y - l.length * 10 - 110 < M) nova();
      pg.line(M, y, W - M, y, 0.5); y -= 12;
      l.forEach(t => { pg.text(M, y, t, 7.5); y -= 10; });
      y -= 8;
    }

    // Assinatura
    let img = null;
    if (pedido.assinatura) {
      try { img = await pngParaJpeg(pedido.assinatura); } catch (e) { img = null; }
    }
    const sigW = 180, sigH = img ? Math.min(70, sigW * img.h / img.w) : 50;
    if (y - sigH - 40 < M) nova();
    y -= sigH + 10;
    if (img) pg.image('/Im1', W / 2 - sigW / 2, y, sigW, sigH);
    pg.line(W / 2 - 110, y - 4, W / 2 + 110, y - 4, 0.6);
    pg.text(W / 2, y - 14, cliente.nome || '', 8, false, 'center');
    pg.text(W / 2, y - 24, 'Assinatura do cliente' +
      (pedido.assinado_em ? ' — ' + new Date(pedido.assinado_em).toLocaleString('pt-BR') : ''), 7.5, false, 'center');

    pages.push(pg);

    // ---------- montagem dos objetos ----------
    const nPag = pages.length;
    // ids: 1 catálogo, 2 pages, 3 F1, 4 F2, 5 imagem (se houver), depois páginas+conteúdos
    pdf.add('<< /Type /Catalog /Pages 2 0 R >>');
    const kidsStart = img ? 6 : 5;
    const kids = pages.map((_, i) => (kidsStart + i * 2) + ' 0 R').join(' ');
    pdf.add('<< /Type /Pages /Kids [' + kids + '] /Count ' + nPag + ' >>');
    pdf.add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    pdf.add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    if (img) {
      const bin = atob(img.b64);
      pdf.add('<< /Type /XObject /Subtype /Image /Width ' + img.w + ' /Height ' + img.h +
        ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + bin.length +
        ' >>\nstream\n' + bin + '\nendstream');
    }
    const res = '/Resources << /Font << /F1 3 0 R /F2 4 0 R >>' +
      (img ? ' /XObject << /Im1 5 0 R >>' : '') + ' >>';
    pages.forEach((page, i) => {
      const contentId = kidsStart + i * 2 + 1;
      pdf.add('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + W + ' ' + H + '] ' + res +
        ' /Contents ' + contentId + ' 0 R >>');
      const st = page.stream();
      pdf.add('<< /Length ' + st.length + ' >>\nstream\n' + st + '\nendstream');
    });

    return pdf.build();
  }

  window.NSPDF = { gerarPDFPedido };
})();
