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
    { t: 'Devolv.',   w: 44,  k: 'dev_display' },
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
    pg.text(M + 10, y - 36, Number(pedido.total_valor) < 0
      ? 'Talão de Pedido — Recolhimento com Crédito do Cliente'
      : 'Talão de Pedido', 8.5);
    pg.text(W - M - 10, y - 20, 'PEDIDO Nº ' + (pedido.numero || 'PENDENTE'), 12, true, 'right');
    pg.text(W - M - 10, y - 36, 'Data: ' + dataBR(pedido.data_pedido), 9, false, 'right');
    y -= 58;

    // Vendedor / tabela
    pg.text(M, y, 'Vendedor: ' + (rep.nome || ''), 9, true);
    pg.text(M + 220, y, 'Contato: ' + (rep.contato || rep.telefone || rep.celular || '—'), 9);
    pg.text(W - M, y, 'Tabela: ' + nomeTabela, 9, true, 'right');
    y -= 14;
    pg.text(M, y, 'Condição de pagamento: ' + (pedido.condicao_pagamento || '—'), 9);
    y -= 16;

    // Cliente
    pg.rect(M, y - 62, W - 2 * M, 62);
    let cy = y - 12;
    pg.text(M + 8, cy, (cliente.nome || ''), 10, true);
    pg.text(W - M - 8, cy, 'CNPJ/CPF: ' + (cliente.cnpj_cpf ? C.fmtCNPJ(cliente.cnpj_cpf) : '—'), 9, false, 'right');
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
        codigo: p.codigo || '', nome,
        tamanho: it.tamanho === 'AV' ? 'Avul.' : it.tamanho,
        placas: it.tamanho === 'AV' ? '—' : it.placas,
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
    pg.text(W - M - 8, y - 14, (Number(pedido.total_valor) < 0 ? 'CRÉDITO DO CLIENTE: ' : 'TOTAL: ') +
      C.fmtMoney(Number(pedido.total_valor)), 12, true, 'right');
    y -= 34;

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
    pg.text(W / 2, y - 14, (pedido.assinante_nome ? pedido.assinante_nome + ' — ' : '') + (cliente.nome || ''), 8, false, 'center');
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

  // ---------- cupom 58mm (impressoras térmicas Bluetooth) ----------
  // Página estreita (58mm ≈ 164pt) com altura sob medida: o app da
  // impressora encaixa a página na largura da bobina, então o texto sai
  // legível (um A4 encolhido para 58mm ficaria minúsculo).
  async function gerarCupomPedido({ pedido, itens, cliente, rep, produtos, observacoes }) {
    const CW = 164, CM = 6, CIN = CW - 2 * CM;
    const dataBR = (iso) => iso ? iso.split('-').reverse().join('/') : '';
    const prodDe = (id) => (produtos.find(p => p.id === id) || {});
    const nomeTabela = pedido.tabela === 'lucro' ? 'Lucro Presumido' : 'Tabela Simples';
    let img = null;
    if (pedido.assinatura) {
      try { img = await pngParaJpeg(pedido.assinatura); } catch (e) { img = null; }
    }
    const sigW = 110, sigH = img ? Math.min(48, sigW * img.h / img.w) : 0;

    // Conteúdo em BLOCOS indivisíveis, paginados em páginas curtas:
    // páginas muito altas fazem o app da impressora térmica cortar a
    // impressão no meio (pedidos grandes falhavam; pequenos passavam).
    const ALT_MAX = 620; // altura máxima de conteúdo por página
    const cx = CW / 2;
    const blocos = [];
    let atual = [];
    const fecha = () => { if (atual.length) { blocos.push(atual); atual = []; } };
    const txt = (s, size, o, h) => atual.push({ k: 't', s, size, o: o || {}, h });
    const hr = (forte) => atual.push({ k: 'hr', forte: !!forte, h: 14 });
    const esp = (h) => atual.push({ k: 'esp', h });

    // cabeçalho
    txt('NEW STAR', 13, { b: true, al: 'center' }, 8);
    txt('APP DO VENDEDOR', 5.5, { al: 'center' }, 8);
    txt(Number(pedido.total_valor) < 0 ? 'RECOLHIMENTO — CRÉDITO DO CLIENTE' : 'TALÃO DE PEDIDO', 6.5, { al: 'center' }, 0);
    hr(true);
    txt('Pedido nº ' + (pedido.numero || 'PENDENTE'), 8.5, { b: true }, 10);
    txt('Data: ' + dataBR(pedido.data_pedido), 7, {}, 9);
    const foneRep = rep.contato || rep.telefone || rep.celular || '';
    txt('Vendedor: ' + (rep.nome || ''), 7, {}, 9);
    if (foneRep) txt('Contato do vendedor: ' + foneRep, 7, {}, 9);
    txt('Tabela: ' + nomeTabela, 7, {}, 9);
    for (const l of wrap('Cond. pgto: ' + (pedido.condicao_pagamento || '—'), 7, CIN)) txt(l, 7, {}, 9);
    hr();
    for (const l of wrap(cliente.nome || '', 8, CIN, true)) txt(l, 8, { b: true }, 10);
    if (cliente.cnpj_cpf) txt('CNPJ/CPF: ' + C.fmtCNPJ(cliente.cnpj_cpf), 6.5, {}, 8);
    const cid = [cliente.cidade, cliente.uf].filter(Boolean).join(' - ');
    if (cid) txt(cid, 6.5, {}, 8);
    hr();
    fecha();
    // um bloco por produto (nunca quebra no meio)
    for (const it of itens) {
      const p = prodDe(it.produto_id);
      const nome = (p.codigo ? p.codigo + ' ' : '') + (p.nome || '') +
        (p.variacao ? ' (' + p.variacao + ')' : '');
      for (const l of wrap(nome, 7, CIN, true)) txt(l, 7, { b: true }, 9);
      txt(it.tamanho === 'AV'
        ? 'Avulso · ' + it.unid_colocadas + ' un'
        : 'Placa ' + it.tamanho + ' ×' + it.placas + ' = ' + it.unid_colocadas + ' un', 6.5, {}, 8);
      txt('Qtd. devolvida: ' + it.dev_display + ' · Qtd. quebrada: ' + it.dev_quebrada, 6.5, {}, 8);
      txt('Qtd. vendida: ' + it.unid_vendidas + ' · Valor unit.: ' + C.fmtMoney(Number(it.preco_unit)), 6.5, {}, 9);
      txt('TOTAL ' + C.fmtMoney(Number(it.valor_total)), 8.5, { b: true, al: 'right' }, 12);
      esp(2);
      fecha();
    }
    // totais
    hr();
    txt('Colocadas: ' + pedido.total_unid_colocadas +
      ' · Devolvidas: ' + pedido.total_unid_dev_display, 6.5, {}, 8);
    txt('Quebradas: ' + pedido.total_unid_dev_quebrada +
      ' · Vendidas: ' + pedido.total_unid_vendidas, 6.5, {}, 11);
    txt(Number(pedido.total_valor) < 0 ? 'CRÉDITO' : 'TOTAL', 9, { b: true }, 0);
    txt(C.fmtMoney(Number(pedido.total_valor)), 10, { b: true, al: 'right' }, 12);
    fecha();
    if (observacoes) {
      hr();
      for (const l of wrap(observacoes, 5.5, CIN)) txt(l, 5.5, {}, 7);
      fecha();
    }
    // assinatura (bloco único)
    hr();
    if (img) atual.push({ k: 'img', h: sigH + 8 });
    else esp(22);
    atual.push({ k: 'lin', h: 9 });
    for (const l of wrap((pedido.assinante_nome ? pedido.assinante_nome + ' — ' : '') +
      (cliente.nome || ''), 6.5, CIN)) txt(l, 6.5, { al: 'center' }, 8);
    txt('Assinatura do cliente' + (pedido.assinado_em ? ' — ' +
      new Date(pedido.assinado_em).toLocaleString('pt-BR') : ''), 5.5, { al: 'center' }, 6);
    fecha();

    // paginação: junta blocos até ALT_MAX
    const CONT_H = 26; // cabeçalho de continuação
    const paginas = [];
    let pag = [], usado = 0;
    for (const bloco of blocos) {
      const bh = bloco.reduce((s, x) => s + x.h, 0) + 8; // margem do 1º item do bloco
      const teto = paginas.length === 0 ? ALT_MAX : ALT_MAX - CONT_H;
      if (pag.length && usado + bh > teto) { paginas.push(pag); pag = []; usado = 0; }
      pag = pag.concat(bloco);
      usado += bh;
    }
    if (pag.length) paginas.push(pag);

    // desenha cada página; com várias páginas, todas com a MESMA altura
    // (apps de impressora térmica deformam páginas de tamanhos diferentes)
    const altDe = (itensPg, pi) => {
      const contHead = pi > 0 ? CONT_H : 0;
      const alturaConteudo = itensPg.reduce((s, x) => s + x.h, 0) +
        itensPg.filter(x => x.k === 't' && x.size >= 8).length * 2; // folga p/ fontes maiores
      return Math.max(160, alturaConteudo + contHead + CM * 2 + 22);
    };
    const altUniforme = paginas.length > 1
      ? Math.max.apply(null, paginas.map(altDe)) : null;
    const pgs = paginas.map((itensPg, pi) => {
      const alt = altUniforme || altDe(itensPg, pi);
      const pg = Page();
      let y = alt - CM - 10;
      const desenharTxt = (x) => {
        pg.text(x.o.al === 'center' ? cx : x.o.al === 'right' ? CW - CM : CM, y, x.s, x.size, x.o.b, x.o.al);
        y -= x.h;
      };
      if (pi > 0) {
        pg.text(CM, y, 'Pedido nº ' + (pedido.numero || 'PENDENTE') + ' — continuação (' + (pi + 1) + '/' + paginas.length + ')', 7, true);
        y -= 6; pg.line(CM, y, CW - CM, y, 0.6); y -= 12;
      }
      for (const x of itensPg) {
        if (x.k === 't') desenharTxt(x);
        else if (x.k === 'hr') { y -= 4; pg.line(CM, y, CW - CM, y, x.forte ? 0.8 : 0.4); y -= 10; }
        else if (x.k === 'esp') y -= x.h;
        else if (x.k === 'img') { y -= sigH; pg.image('/Im1', cx - sigW / 2, y, sigW, sigH); y -= 8; }
        else if (x.k === 'lin') { pg.line(cx - 55, y, cx + 55, y, 0.5); y -= 9; }
      }
      return { pg, alt };
    });

    const pdf = PDFWriter();
    pdf.add('<< /Type /Catalog /Pages 2 0 R >>');
    const firstPageId = img ? 6 : 5;
    pdf.add('<< /Type /Pages /Kids [' +
      pgs.map((_, i) => (firstPageId + 2 * i) + ' 0 R').join(' ') +
      '] /Count ' + pgs.length + ' >>');
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
    for (const { pg, alt } of pgs) {
      const idPagina = pdf.objs.length + 1; // o conteúdo entra logo em seguida
      pdf.add('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + CW + ' ' + alt + '] ' + res +
        ' /Contents ' + (idPagina + 1) + ' 0 R >>');
      const st = pg.stream();
      pdf.add('<< /Length ' + st.length + ' >>\nstream\n' + st + '\nendstream');
    }
    return pdf.build();
  }

  // ---------- cupom 58mm como IMAGEM (PNG) ----------
  // Os apps das mini impressoras térmicas rasterizam PDF de forma instável
  // (impressões cortadas no meio). Imagem é o formato NATIVO deles: uma tira
  // contínua de 384px de largura (58mm ≈ 384 pontos térmicos) que o próprio
  // app fatia e imprime inteira.
  // Cupom 58mm como IMAGEM. A letra é grande de propósito: a fonte nativa dessas
  // impressoras tem 24 dots de altura em 384 de largura, e o cupom precisa sair no
  // mesmo porte — no Android o app da impressora encolhe a imagem inteira para
  // caber, então texto pequeno vira letra de formiga. `escala` (Configurações)
  // deixa aumentar mais ainda sem mexer no código.
  async function gerarCupomImagem({ pedido, itens, cliente, rep, produtos, observacoes, escala }) {
    const W = 384, M = 12, IN = W - 2 * M, CX = W / 2;
    const k = Math.min(1.6, Math.max(0.8, Number(escala) || 1));   // multiplicador da letra
    const F = (px) => Math.round(px * k);
    const dataBR = (iso) => iso ? iso.split('-').reverse().join('/') : '';
    const prodDe = (id) => (produtos.find(p => p.id === id) || {});
    const nomeTabela = pedido.tabela === 'lucro' ? 'Lucro Presumido' : 'Tabela Simples';
    const fone = rep.contato || rep.telefone || rep.celular || '';
    const negativo = Number(pedido.total_valor) < 0;

    // assinatura (PNG original, sem conversão)
    const imgAss = pedido.assinatura ? await new Promise((res) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = () => res(null);
      im.src = pedido.assinatura;
    }) : null;

    const cv = document.createElement('canvas');
    const ctx = cv.getContext('2d');
    const fonte = (px, b) => (b ? '700 ' : '') + px + 'px Arial, Helvetica, sans-serif';
    function quebra(texto, px, b, maxW) {
      ctx.font = fonte(px, b);
      const palavras = String(texto || '').split(/\s+/);
      const linhas = []; let atual = '';
      for (const p of palavras) {
        const tent = atual ? atual + ' ' + p : p;
        if (ctx.measureText(tent).width <= maxW || !atual) atual = tent;
        else { linhas.push(atual); atual = p; }
      }
      if (atual) linhas.push(atual);
      return linhas;
    }

    function render(pintar) {
      let y = 16;
      if (pintar) ctx.textBaseline = 'top'; // texto desenhado a partir do topo
      const t = (s, px, o) => {
        o = o || {};
        if (pintar) {
          ctx.font = fonte(px, o.b);
          ctx.fillStyle = '#000';
          ctx.textAlign = o.al || 'left';
          ctx.fillText(s, o.al === 'center' ? CX : o.al === 'right' ? W - M : M, y);
        }
        y += o.h != null ? o.h : px + Math.round(4 * k);
      };
      // rótulo à esquerda, valor à direita — usa a largura toda sem quebrar linha
      const par = (esq, dir, px, b) => {
        if (pintar) {
          ctx.font = fonte(px, b); ctx.fillStyle = '#000';
          ctx.textAlign = 'left'; ctx.fillText(esq, M, y);
          ctx.textAlign = 'right'; ctx.fillText(dir, W - M, y);
        }
        y += px + Math.round(4 * k);
      };
      const multi = (s, px, b, o) => { for (const l of quebra(s, px, b, IN)) t(l, px, Object.assign({ b }, o)); };
      const hr = (grossa) => {
        y += Math.round(3 * k);
        if (pintar) { ctx.fillStyle = '#000'; ctx.fillRect(M, y, IN, grossa ? 3 : 1.5); }
        y += Math.round(13 * k);
      };

      t('NEW STAR', F(36), { b: true, al: 'center' });
      t('APP DO VENDEDOR', F(14), { al: 'center' });
      t(negativo ? 'RECOLHIMENTO — CRÉDITO' : 'TALÃO DE PEDIDO', F(18), { b: true, al: 'center' });
      hr(true);
      t('PEDIDO Nº ' + (pedido.numero || 'PENDENTE'), F(26), { b: true });
      par('Data', dataBR(pedido.data_pedido), F(19));
      par('Vendedor', rep.nome || '—', F(19));
      if (fone) par('Contato', fone, F(19));
      par('Tabela', pedido.tabela === 'lucro' ? 'Lucro Pres.' : 'Simples', F(19));
      par('Prazo', pedido.condicao_pagamento || '—', F(19));
      hr();
      multi(cliente.nome || '', F(22), true);
      if (cliente.cnpj_cpf) t(C.fmtCNPJ(cliente.cnpj_cpf), F(18));
      const cid = [cliente.cidade, cliente.uf].filter(Boolean).join(' - ');
      if (cid) t(cid, F(18));
      hr();
      for (const it of itens) {
        multi(prodDe(it.produto_id).codigo ? prodDe(it.produto_id).codigo + ' ' +
          (prodDe(it.produto_id).nome || '') : (prodDe(it.produto_id).nome || ''), F(20), true);
        const p = prodDe(it.produto_id);
        if (p.variacao) t(p.variacao, F(17));
        t(it.tamanho === 'AV'
          ? 'Avulso ' + it.unid_colocadas + ' un'
          : 'Placa ' + it.tamanho + ' x' + it.placas + ' = ' + it.unid_colocadas + ' un', F(19));
        t('Devolv. ' + it.dev_display + '   Quebr. ' + it.dev_quebrada, F(19));
        t('Vendidas ' + it.unid_vendidas + '  x ' + C.fmtMoney(Number(it.preco_unit)), F(19));
        par('TOTAL', C.fmtMoney(Number(it.valor_total)), F(21), true);
        y += Math.round(7 * k);
      }
      hr();
      par('Colocadas', String(pedido.total_unid_colocadas), F(19));
      par('Devolvidas', String(pedido.total_unid_dev_display), F(19));
      par('Quebradas', String(pedido.total_unid_dev_quebrada), F(19));
      par('Vendidas', String(pedido.total_unid_vendidas), F(19));
      y += Math.round(6 * k);
      par(negativo ? 'CRÉDITO' : 'TOTAL', C.fmtMoney(Number(pedido.total_valor)), F(28), true);
      y += Math.round(8 * k);
      if (observacoes) { hr(); multi(observacoes, F(13), false); }
      hr();
      if (imgAss) {
        const aw = 250, ah = Math.min(115, aw * imgAss.height / imgAss.width);
        if (pintar) ctx.drawImage(imgAss, CX - aw / 2, y, aw, ah);
        y += ah + 8;
      } else y += 48;
      if (pintar) { ctx.fillStyle = '#000'; ctx.fillRect(CX - 125, y, 250, 1.5); }
      y += Math.round(14 * k);
      multi((pedido.assinante_nome ? pedido.assinante_nome + ' — ' : '') + (cliente.nome || ''),
        F(16), false, { al: 'center' });
      t('Assinatura do cliente', F(15), { al: 'center' });
      if (pedido.assinado_em)
        t(new Date(pedido.assinado_em).toLocaleString('pt-BR'), F(13), { al: 'center' });
      y += 16;
      return y;
    }

    const altura = Math.ceil(render(false));
    cv.width = W; cv.height = altura;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, altura);
    render(true);
    return new Promise((res) => cv.toBlob(res, 'image/png'));
  }

  window.NSPDF = { gerarPDFPedido, gerarCupomPedido, gerarCupomImagem };
})();
