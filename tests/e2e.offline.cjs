/* NEW STAR — teste E2E offline: login → novo pedido → itens → assinatura →
 * conclusão → PDF, tudo sem backend (backend bloqueado = modo offline). */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PUB = path.join(__dirname, '..', 'public');
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

const REP_ID = '11111111-1111-4111-8111-111111111111';
const CLI_ID = '22222222-2222-4222-8222-222222222222';
const PROD_ID = '33333333-3333-4333-8333-333333333333';

const seed = {
  ns_c_representantes: [{
    id: REP_ID, nome: 'Denilson', email: 'denilson@newstar.com.br',
    senha_hash: sha256('123456'), papel: 'vendedor', contato: '(49) 99999-0000',
    comissao_pct: 10, comissao_pct_novo: 15, custo_km: 0.8,
    cidade_base: 'Passo Fundo', lat_base: -28.2622, lng_base: -52.4083, ativo: true
  }],
  ns_c_clientes: [{
    id: CLI_ID, representante_id: REP_ID, nome: 'FARMACIA TESTE LTDA',
    cnpj_cpf: '11.222.333/0001-44', cidade: 'Passo Fundo', uf: 'RS', rede: 'Clamed',
    recebimento_dias: 45, semana_padrao: 1, dia_semana_padrao: 'Segunda', frequencia_dias: 60,
    status: 'ativo', status_legado: 'Novo', geocoding_status: 'aproximado',
    lat: -28.2622, lng: -52.4083
  }],
  ns_c_produtos: [{
    id: PROD_ID, codigo: '4109', nome: 'BRAG — Argolinha', variacao: null,
    linha: 'Argolinhas', preco_simples: 12.60, preco_lucro: 14.50,
    unid_placa_p: 48, unid_placa_g: 72, ativo: true
  }],
  ns_c_configuracoes: [
    { chave: 'ciclo_inicio', valor: '2026-01-05' },
    { chave: 'condicoes_pagamento', valor: ['À vista', '30 dias'] },
    { chave: 'pdf_observacoes', valor: 'A troca de peças com defeito será efetuada mediante a guarda das partes.' }
  ]
};

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };

(async () => {
  const server = http.createServer((req, res) => {
    let f = path.join(PUB, req.url === '/' ? 'index.html' : req.url.split('?')[0]);
    if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
    let body = fs.readFileSync(f);
    if (f.endsWith('index.html'))
      body = Buffer.from(body.toString()
        .replace(/FIREBASE_PROJECT_ID: '[^']*'/, "FIREBASE_PROJECT_ID: 'fake-proj'")
        .replace(/FIREBASE_API_KEY: '[^']*'/, "FIREBASE_API_KEY: 'fake-key'"));
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
    res.end(body);
  }).listen(8899);

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const erros = [];
  page.on('pageerror', (e) => erros.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('firestore.googleapis')) erros.push('console: ' + m.text()); });
  await page.route('**/firestore.googleapis.com/**', (r) => r.abort()); // backend fora do ar = offline

  await page.addInitScript((s) => {
    for (const [k, v] of Object.entries(s)) localStorage.setItem(k, JSON.stringify(v));
    Object.defineProperty(navigator, 'onLine', { get: () => false }); // simula sem sinal
  }, seed);

  let ok = 0, fail = 0;
  const check = (nome, cond) => { if (cond) { ok++; console.log('  ✓', nome); } else { fail++; console.error('  ✗', nome); } };

  await page.goto('http://localhost:8899/');
  await page.waitForSelector('.login-box input[type=email]');
  check('tela de login aparece', true);
  const seedInfo = await page.evaluate(() => ({
    clientes: window.NS_SEED.clientes.length,
    clamed: window.NS_SEED.clientes.filter(c => c.recebimento_dias === 45).length,
    produtos: window.NS_SEED.produtos.length,
    roteirizados: window.NS_SEED.clientes.filter(c => c.semana_padrao != null).length,
    comEndereco: window.NS_SEED.clientes.filter(c => c.endereco && c.cep).length
  }));
  check('seed: 314 clientes da lista nova, 25 Clamed, 17 produtos',
    seedInfo.clientes === 314 && seedInfo.clamed === 25 && seedInfo.produtos === 17);
  check('plano por urgência: 210 com dia fixo (6/dia × 35 dias úteis), todos com endereço',
    seedInfo.roteirizados === 210 && seedInfo.comEndereco === 314);
  const finaisSemana = await page.evaluate(() =>
    window.NS_SEED.clientes.filter(c => ['Sábado', 'Domingo'].includes(c.dia_semana_padrao)).length);
  check('atendimento só de segunda a sexta (0 clientes no fim de semana)', finaisSemana === 0);

  await page.fill('input[type=email]', 'denilson@newstar.com.br');
  await page.fill('input[type=password]', '123456');
  await page.click('text=Entrar');
  await page.waitForSelector('#tabs', { state: 'visible' });
  check('login offline com cache funciona', await page.isVisible('#topbar'));
  check('chip mostra offline', (await page.textContent('#syncChip')).includes('offline') || (await page.textContent('#syncChip')).includes('pendente'));

  // busca parcial de cliente por CNPJ
  await page.click('#tabs button[data-v=clientes]');
  await page.fill('#view input', '11222');
  await page.waitForTimeout(150);
  check('busca parcial por CNPJ encontra cliente', await page.isVisible('text=FARMACIA TESTE LTDA'));

  // novo pedido pelo FAB
  await page.click('#fab');
  await page.waitForSelector('.ns-modal');
  await page.fill('.ns-modal input', 'farm');
  await page.click('.ns-modal .item-lista');
  check('seleção de cliente carrega dados', await page.isVisible('text=Tabela de preço do pedido'));

  // tabela Lucro Presumido → preço 14,50 (o prazo agora é pedido só na conferência)
  await page.click('text=Tabela Lucro Presumido');
  await page.click('text=+ Adicionar produto');
  const modalItem = page.locator('.ns-overlay').last().locator('.ns-modal');
  await modalItem.waitFor();
  check('produto lista preço da tabela Lucro (14,50)', (await modalItem.textContent()).includes('14,50'));
  await modalItem.locator('.item-lista').click();

  // placa P, dev display 5, quebrada 2 → 41 × 14,50 = 594,50
  const steppers = modalItem.locator('.stepper');
  const plus = async (i, n) => { for (let k = 0; k < n; k++) await steppers.nth(i).locator('button', { hasText: '+' }).click(); };
  await plus(1, 5); await plus(2, 2);
  const live = await page.textContent('.calc-live');
  check('cálculo: 48 − 5 − 2 = 41 vendidas', live.includes('41'));
  check('valor 41 × 14,50 = 594,50', live.replace(/ /g, ' ').includes('594,50'));
  await modalItem.locator('button:has-text("Adicionar")').click();

  // venda avulsa: unidades sem placa inteira (3 un × 14,50 = 43,50)
  await page.click('text=+ Adicionar produto');
  const modalAv = page.locator('.ns-overlay').last().locator('.ns-modal');
  await modalAv.waitFor();
  await modalAv.locator('.item-lista').first().click();
  await modalAv.locator('button:has-text("Avulso")').click();
  await modalAv.locator('.stepper').first().locator('button', { hasText: '+' }).click();
  await modalAv.locator('.stepper').first().locator('button', { hasText: '+' }).click();
  const liveAv = (await modalAv.locator('.calc-live').textContent()).replace(/ /g, ' ');
  check('avulso: 3 unidades × 14,50 = 43,50', liveAv.includes('43,50'));
  await modalAv.locator('button:has-text("Adicionar")').click();
  await page.waitForTimeout(150);
  check('item avulso entra no pedido como unidades', (await page.locator('.card-item').count()) === 2 &&
    (await page.locator('.card-item').nth(1).textContent()).includes('Avulso · 3 un'));
  // remove o avulso para manter os totais do cenário
  await page.locator('.card-item').nth(1).locator('.btn-icon').click();
  await page.waitForTimeout(150);

  await page.click('button:has-text("Conferir")');
  const conf = await page.textContent('.ns-modal');
  check('conferência mostra tabela e total', conf.includes('Lucro Presumido') && conf.replace(/ /g, ' ').includes('594,50'));

  // prazo obrigatório — agora no FINAL (conferência), não no início
  await page.click('button:has-text("Assinar")');
  await page.waitForTimeout(250);
  check('não deixa assinar sem o prazo (condição de pagamento)', !(await page.isVisible('.assinatura-cv')));
  await page.fill('.ns-modal input[placeholder*="Prazo"]', '30 dias');

  // assinatura no canvas
  await page.click('button:has-text("Assinar")');
  // sem o nome de quem assina, não abre a tela cheia nem conclui
  await page.fill('.ns-modal input[placeholder*="Nome de quem assina"]', '');
  await page.click('button:has-text("Confirmar e concluir")');
  await page.waitForTimeout(250);
  check('não conclui sem o nome de quem assina', !(await page.isVisible('.sucesso-banner')));
  await page.fill('.ns-modal input[placeholder*="Nome de quem assina"]', 'João da Silva');
  await page.click('button:has-text("Assinar em tela cheia")');
  await page.waitForSelector('.assina-full canvas');
  await page.waitForTimeout(400);   // espera a tela assentar em modo deitado
  check('assinatura abre em TELA CHEIA', await page.isVisible('.assina-full'));
  const cv = page.locator('.assina-full canvas');
  const bb = await cv.boundingBox();
  await page.mouse.move(bb.x + 40, bb.y + bb.height / 2);
  await page.mouse.down();
  for (let i = 0; i < 12; i++) await page.mouse.move(bb.x + 40 + i * 20, bb.y + bb.height / 2 + Math.sin(i) * 40);
  await page.mouse.up();
  // o traço tem de sair exatamente onde o dedo passou — sem rotação de tela
  const tracoOndeEscreveu = await page.evaluate((pt) => {
    const cv = document.querySelector('.assina-full canvas');
    const r = cv.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const cx = cv.getContext('2d');
    // lê o pixel logo abaixo do ponto onde o mouse começou o traço
    const x = Math.round((pt.x - r.left) * dpr), y = Math.round((pt.y - r.top) * dpr);
    let achou = false;
    for (let dx = -6; dx <= 6 && !achou; dx++)
      for (let dy = -6; dy <= 6 && !achou; dy++) {
        const d = cx.getImageData(Math.max(0, x + dx), Math.max(0, y + dy), 1, 1).data;
        if (d[3] > 0) achou = true;
      }
    return { achou, semRotacao: !document.querySelector('.assina-full').classList.contains('deitada') };
  }, { x: bb.x + 40, y: bb.y + bb.height / 2 });
  check('a tinta aparece exatamente onde o dedo escreveu', tracoOndeEscreveu.achou);
  check('a tela de assinatura não é girada por CSS', tracoOndeEscreveu.semRotacao);
  await page.click('.assina-full button:has-text("Confirmar assinatura")');
  await page.waitForTimeout(300);
  check('após confirmar, volta para a tela do pedido', !(await page.isVisible('.assina-full')));
  await page.click('button:has-text("Confirmar e concluir")');
  await page.waitForSelector('.sucesso-banner');
  check('pedido concluído com assinatura', await page.isVisible('.sucesso-banner'));

  // dados persistidos + comissão 15% (cliente novo) + prazo Clamed +45d
  const dados = await page.evaluate(() => ({
    pedido: JSON.parse(localStorage.getItem('ns_c_pedidos'))[0],
    visita: JSON.parse(localStorage.getItem('ns_c_visitas'))[0],
    itens: JSON.parse(localStorage.getItem('ns_c_pedido_itens')),
    outbox: JSON.parse(localStorage.getItem('ns_outbox')).length,
    cliProds: JSON.parse(localStorage.getItem('ns_c_cliente_produtos') || '[]')
  }));
  check('pedido salvo concluído, total 594,50', dados.pedido.status === 'concluido' && dados.pedido.total_valor === 594.5);
  check('nº do pedido atribuído no app (nº 1)', dados.pedido.numero === 1);
  check('assinatura salva no pedido (PNG base64)', String(dados.pedido.assinatura || '').startsWith('data:image/png'));
  check('nome de quem assina gravado no pedido', dados.pedido.assinante_nome === 'João da Silva');
  const cliPrazo = await page.evaluate(() => JSON.parse(localStorage.getItem('ns_c_clientes'))[0].condicao_pagamento_padrao);
  check('prazo usado vira o prazo padrão do cliente', cliPrazo === '30 dias');
  check('visita com fez_pedido e valor vendido', dados.visita.fez_pedido === true && dados.visita.valor_pedido === 594.5 && !!dados.visita.data_visita);
  check('comissão 15% no 1º pedido = 89,18', dados.visita.comissao_pct === 15 && dados.visita.comissao_valor === 89.18);
  const dt = new Date(dados.pedido.data_pedido + 'T12:00:00'); dt.setDate(dt.getDate() + 45);
  check('recebimento Clamed +45 dias', dados.visita.comissao_recebimento_em === dt.toISOString().slice(0, 10));
  check('linha do produto virou "linha que trabalha"', dados.cliProds.some(cp => cp.produto_id === PROD_ID));
  check('escrituras na fila offline (sync posterior)', dados.outbox >= 4);

  // PDF gerado com assinatura embutida
  const pdfInfo = await page.evaluate(async (pid) => {
    const blob = await window.NSPedido.gerarPDF(pid);
    const buf = new Uint8Array(await blob.arrayBuffer());
    const head = String.fromCharCode(...buf.slice(0, 5));
    let temImg = false;
    const txt = new TextDecoder('latin1').decode(buf);
    temImg = txt.includes('/DCTDecode') && txt.includes('/Im1');
    return { size: buf.length, head, temImg, type: blob.type, temAssinante: txt.includes('Jo\xe3o da Silva') };
  }, dados.pedido.id);
  check('PDF válido (%PDF, application/pdf)', pdfInfo.head === '%PDF-' && pdfInfo.type === 'application/pdf');
  check('PDF > 5KB com assinatura embutida (DCTDecode)', pdfInfo.size > 5000 && pdfInfo.temImg);
  check('nome de quem assina impresso no PDF', pdfInfo.temAssinante === true);

  // estrutura interna do PDF: todos os offsets da xref apontam para "N 0 obj"
  const xrefOk = await page.evaluate(async (pid) => {
    const blob = await window.NSPedido.gerarPDF(pid);
    const buf = new Uint8Array(await blob.arrayBuffer());
    const txt = new TextDecoder('latin1').decode(buf);
    const start = Number(txt.match(/startxref\n(\d+)\n%%EOF$/)[1]);
    const tab = txt.slice(start);
    const linhas = tab.split('\n').slice(3); // pula "xref", "0 N" e a entrada livre
    let i = 1;
    for (const l of linhas) {
      const m2 = l.match(/^(\d{10}) 00000 n /);
      if (!m2) break;
      const off = Number(m2[1]);
      if (!txt.slice(off).startsWith(i + ' 0 obj')) return 'offset errado obj ' + i;
      i++;
    }
    return i > 5 ? 'ok' : 'poucos objetos: ' + i;
  }, dados.pedido.id);
  check('xref do PDF consistente (' + xrefOk + ')', xrefOk === 'ok');

  // cupom 58mm: agora é IMAGEM PNG (formato nativo dos apps de impressora)
  const cupomInfo = await page.evaluate(async (pid) => {
    const blob = await window.NSPedido.gerarCupom(pid);
    const bmp = await createImageBitmap(blob);
    return { type: blob.type, w: bmp.width, h: bmp.height, tam: blob.size };
  }, dados.pedido.id);
  check('cupom 58mm: imagem PNG com 384px de largura (tira térmica)',
    cupomInfo.type === 'image/png' && cupomInfo.w === 384);
  check('cupom 58mm: tira com conteúdo e assinatura desenhados',
    cupomInfo.h > 500 && cupomInfo.tam > 5000);
  // a letra do cupom é grande (fonte da impressora) e regulável em Configurações —
  // no Android o app encolhe a imagem inteira, e letra pequena vira letra de formiga
  const cupomEscalas = await page.evaluate(async (pid) => {
    const alturaCom = async (k) => {
      const p = window.NSDB.byId('pedidos', pid);
      const itens = window.NSDB.all('pedido_itens').filter(i => i.pedido_id === pid);
      const blob = await window.NSPDF.gerarCupomImagem({
        pedido: p, itens,
        cliente: window.NSDB.byId('clientes', p.cliente_id) || {},
        rep: window.NSDB.byId('representantes', p.representante_id) || {},
        produtos: window.NSDB.all('produtos'), observacoes: '', escala: k
      });
      const bmp = await createImageBitmap(blob);
      return { w: bmp.width, h: bmp.height };
    };
    return { k1: await alturaCom(1), k14: await alturaCom(1.4), k9: await alturaCom(9) };
  }, dados.pedido.id);
  check('cupom: letra maior deixa a tira mais alta (escala funciona)',
    cupomEscalas.k14.h > cupomEscalas.k1.h * 1.15);
  check('cupom: largura continua 384px em qualquer escala',
    cupomEscalas.k1.w === 384 && cupomEscalas.k14.w === 384 && cupomEscalas.k9.w === 384);
  check('cupom: escala absurda é limitada (não estoura o papel)',
    cupomEscalas.k9.h < cupomEscalas.k14.h * 1.4);
  check('cupom padrão sai com a letra grande (>= escala 1)',
    cupomInfo.h >= cupomEscalas.k1.h);
  // cupom grande (20 itens) divide em várias páginas curtas — páginas altas
  // demais faziam a impressora térmica cortar a impressão no meio
  const cupomGrande = await page.evaluate(async () => {
    const itens = Array.from({ length: 20 }, (_, i) => ({
      produto_id: 'x', tamanho: 'P', placas: 1, unid_colocadas: 48,
      dev_display: 2, dev_quebrada: 1, unid_vendidas: 45, preco_unit: 12.6, valor_total: 567
    }));
    const blob = await window.NSPDF.gerarCupomPedido({
      pedido: { numero: 99, data_pedido: '2026-08-02', tabela: 'simples', condicao_pagamento: '30 dias',
        total_unid_colocadas: 960, total_unid_dev_display: 40, total_unid_dev_quebrada: 20,
        total_unid_vendidas: 900, total_valor: 11340 },
      itens, cliente: { nome: 'FARMACIA GRANDE', cnpj_cpf: '11222333000144', cidade: 'Chapecó', uf: 'SC' },
      rep: { nome: 'Denilson', contato: '(49) 99999-0000' }, produtos: [], observacoes: ''
    });
    const txt = new TextDecoder('latin1').decode(new Uint8Array(await blob.arrayBuffer()));
    const paginas = (txt.match(/\/Type \/Page /g) || []).length;
    const count = Number((txt.match(/\/Count (\d+)/) || [])[1] || 0);
    const alturas = Array.from(txt.matchAll(/\/MediaBox \[0 0 164 (\d+(?:\.\d+)?)\]/g)).map(m => Number(m[1]));
    // xref: todos os offsets apontam para "N 0 obj"
    const start = Number(txt.match(/startxref\n(\d+)\n%%EOF$/)[1]);
    const tab = txt.slice(start).split('\n').slice(3);
    let okOff = true, oi = 1;
    for (const l of tab) {
      const m2 = l.match(/^(\d{10}) 00000 n /);
      if (!m2) break;
      if (!txt.slice(Number(m2[1])).startsWith(oi + ' 0 obj')) { okOff = false; break; }
      oi++;
    }
    return { paginas, count, maxAlt: Math.max.apply(null, alturas), okOff, temCont: txt.includes('continua\xe7\xe3o') };
  });
  check('cupom grande: várias páginas curtas (máx. ~700pt) com "continuação"',
    cupomGrande.paginas > 1 && cupomGrande.count === cupomGrande.paginas &&
    cupomGrande.maxAlt < 720 && cupomGrande.temCont);
  check('cupom grande: estrutura interna válida (xref confere)', cupomGrande.okOff === true);

  // histórico: pedido consultável depois
  await page.locator('.ns-overlay').last().locator('.btn-icon').first().click(); // fecha modal do pedido
  await page.click('#tabs button[data-v=pedidos]');
  check('pedido aparece no histórico', await page.isVisible('text=FARMACIA TESTE LTDA'));

  // 2º pedido do mesmo cliente = reposição 10% (testar via lógica local)
  const com2 = await page.evaluate(() => {
    const rep = JSON.parse(localStorage.getItem('ns_c_representantes'))[0];
    const cli = JSON.parse(localStorage.getItem('ns_c_clientes'))[0];
    const jaComprou = NSCalc.clienteJaComprou(cli, JSON.parse(localStorage.getItem('ns_c_visitas')));
    return NSCalc.calcComissao({ valor: 1000, clienteNovo: !jaComprou, pctNovo: rep.comissao_pct_novo, pctReposicao: rep.comissao_pct, dataPedido: '2026-07-25', recebimentoDias: 45 });
  });
  check('reposição usa 10% (cliente já comprou)', com2.pct === 10 && com2.valor === 100);

  // dashboard KPIs
  await page.click('#tabs button[data-v=dash]');
  const dash = (await page.textContent('#view')).replace(/ /g, ' ');
  check('dashboard: faturamento 594,50', dash.includes('594,50'));
  check('dashboard: comissão gerada 89,18', dash.includes('89,18'));
  check('dashboard: ranking de linhas (Argolinhas)', dash.includes('Argolinhas'));

  // relatórios: venda do dia, visitas e agrupamento por rede
  await page.click('#tabs button[data-v=mais]');
  await page.waitForTimeout(200);
  await page.click('.item-menu:has-text("Relatórios")');
  await page.waitForSelector('.ns-overlay');
  const rel = (await page.locator('.ns-overlay').last().textContent()).replace(/\u00a0/g, ' ');
  check('relatórios: venda de hoje 594,50', rel.includes('594,50'));
  check('relatórios: rede Clamed agrupada', rel.includes('Clamed'));
  check('relatórios: contador de visitas do dia', rel.includes('atendidos') || rel.includes('Visitas:'));
  check('relatórios: contador de novos clientes (15%)', rel.includes('Novos clientes') && rel.includes('1 novo(s) cliente(s)'));

  // navegação por mês: a meta é POR COMPETÊNCIA (senão cadastrar a meta de agora
  // reescreveria o histórico e a % dos meses fechados sairia errada)
  const relModal = page.locator('.ns-overlay').last();
  const mesAgora = new Date().toISOString().slice(0, 7);
  const mesPassado = (() => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 7); })();
  check('relatórios: mostra as vendas do mês escolhido', rel.includes('Vendas de'));
  check('relatórios: mês corrente mostra o bloco de hoje', rel.includes('Hoje —'));

  // metas diferentes em dois meses
  await page.evaluate((ms) => {
    window.NSDB.upsertConfig('meta_mes_' + ms[0], 1000);
    window.NSDB.upsertConfig('meta_mes_' + ms[1], 500);
  }, [mesAgora, mesPassado]);

  await relModal.locator('button[aria-label="Mês anterior"]').click();
  await page.waitForTimeout(250);
  const relAnterior = (await relModal.textContent()).replace(/\u00a0/g, ' ');
  check('mês anterior: some o bloco "Hoje" e avisa que o mês está fechado',
    !relAnterior.includes('Hoje —') && relAnterior.includes('Mês fechado'));
  check('mês anterior: 0 pedidos (não puxa a venda do mês corrente)',
    relAnterior.includes('0 pedido(s) no mês'));
  check('mês anterior usa a meta DELE (500), não a de agora',
    relAnterior.includes('500,00') && !relAnterior.includes('1.000,00'));

  await relModal.locator('button[aria-label="Próximo mês"]').click();
  await page.waitForTimeout(250);
  const relVolta = (await relModal.textContent()).replace(/\u00a0/g, ' ');
  check('mês corrente volta com a meta dele (1.000) e a venda de 594,50',
    relVolta.includes('1.000,00') && relVolta.includes('594,50') && relVolta.includes('Hoje —'));
  check('mês corrente: 594,50 de 1.000 = 59,5% da meta (vírgula, padrão BR)',
    relVolta.includes('59,5%') && !relVolta.includes('59.45'));

  // mês sem meta própria herda o padrão geral (compatível com o que já estava cadastrado)
  const herda = await page.evaluate(() => {
    window.NSDB.upsertConfig('meta_mes_valor', 7777);
    return window.NSDB.config('meta_mes_2019-01', null);
  });
  check('mês sem meta própria não tem chave dele (usa o padrão geral)', herda === null);

  // ── painel: metas na primeira tela, com meta do dia dinâmica ──
  await page.locator('.ns-overlay').last().locator('.ns-modal-head button').click();
  await page.waitForTimeout(200);
  await page.evaluate((ms) => window.NSDB.upsertConfig('meta_mes_' + ms, 200000), mesAgora);
  await page.click('#tabs button[data-v=dash]');
  await page.waitForTimeout(300);
  const painel = (await page.textContent('#view')).replace(/\u00a0/g, ' ');
  check('painel abre já com a meta do mês (sem entrar em Mais)',
    painel.includes('Meta do mês') && painel.includes('200.000,00'));
  check('painel mostra vendido, falta vender e dias úteis restantes',
    painel.includes('Vendido no mês') && painel.includes('Falta vender') && painel.includes('Dias úteis restantes'));
  check('painel mostra meta de hoje, vendido hoje e falta hoje',
    painel.includes('Meta de hoje') && painel.includes('Vendido hoje') && painel.includes('Falta vender hoje'));
  const metaConfere = await page.evaluate(() => {
    const hoje = new Date().toISOString().slice(0, 10);
    const rest = window.NSCalc.diasUteisRestantes(hoje);
    const md = window.NSCalc.metaDinamica({ metaMes: 200000, vendidoMes: 594.5, vendidoHoje: 594.5, hoje });
    return { rest, metaDia: md.metaDia, esperado: Math.round((200000 - 594.5) / rest * 100) / 100 };
  });
  check('meta do dia = (meta − vendido no mês) ÷ dias úteis restantes',
    metaConfere.metaDia === metaConfere.esperado);

  // ── prospecção ──
  await page.click('#tabs button[data-v=clientes]');
  await page.waitForTimeout(250);
  await page.click('#view button:has-text("Nova prospecção")');
  await page.waitForSelector('.ns-overlay');
  const mp = page.locator('.ns-overlay').last();
  await mp.locator('input').nth(0).fill('DROGARIA NOVA PROSPEC');
  await mp.locator('input').nth(1).fill('Chapecó');
  await mp.locator('input').nth(2).fill('SC');
  await mp.locator('input').nth(3).fill('Rua Teste, 100');
  await mp.locator('button:has-text("Salvar prospecção")').click();
  await page.waitForTimeout(300);
  const prospec = await page.evaluate(() =>
    window.NSDB.all('clientes').find(c => c.nome === 'DROGARIA NOVA PROSPEC'));
  check('prospecção salva com o mínimo (nome, cidade, endereço)',
    !!prospec && prospec.status === 'prospect' && prospec.cidade === 'Chapecó');
  await page.fill('#view input', 'PROSPEC');
  await page.waitForTimeout(250);
  check('prospecção aparece na lista com selo próprio',
    (await page.textContent('#view')).includes('PROSPECÇÃO'));
  check('prospecção tem cor própria (classe .prospec)',
    (await page.locator('#view .item-lista.prospec').count()) === 1);

  // entra na rota como qualquer cliente
  await page.click('#tabs button[data-v=hoje]');
  await page.waitForTimeout(250);
  await page.locator('#view button:has-text("rota de")').first().click();
  await page.waitForSelector('.ns-overlay');
  const mr = page.locator('.ns-overlay').last();
  await mr.locator('input').first().fill('PROSPEC');
  await page.waitForTimeout(250);
  check('prospecção aparece na lista para montar a rota',
    (await mr.textContent()).includes('DROGARIA NOVA PROSPEC'));
  await mr.locator('button:has-text("Adicionar à rota")').first().click();
  await page.waitForTimeout(200);
  await mr.locator('button:has-text("Concluir")').click();
  await page.waitForTimeout(300);
  const rotaComProspec = await page.textContent('#view');
  check('prospecção entra na rota e fica marcada', rotaComProspec.includes('PROSPECÇÃO'));

  // transformar em cliente mantém o histórico (mesmo id)
  await page.evaluate((id) => window.NSApp.__testTransformar
    ? null : null, prospec.id);
  await page.evaluate((id) => {
    window.NSDB.insert('visitas', { cliente_id: id, representante_id: window.NSDB.all('representantes')[0].id,
      data_visita: '2026-01-05', realizada: true, fez_pedido: false });
  }, prospec.id);
  await page.click('#tabs button[data-v=clientes]');
  await page.fill('#view input', 'PROSPEC');
  await page.waitForTimeout(250);
  await page.locator('#view .item-lista').first().click();
  await page.waitForSelector('.ns-overlay');
  await page.locator('.ns-overlay').last().locator('button:has-text("Transformar em cliente")').click();
  await page.waitForSelector('.ns-overlay button:has-text("Confirmar")');
  await page.locator('.ns-overlay').last().locator('button:has-text("Confirmar")').click();
  await page.waitForTimeout(400);
  const virouCliente = await page.evaluate((id) => {
    const c = window.NSDB.byId('clientes', id);
    return { status: c.status, visitas: window.NSDB.all('visitas').filter(v => v.cliente_id === id).length };
  }, prospec.id);
  check('transformar em cliente troca o status para ativo', virouCliente.status === 'ativo');
  check('e mantém o histórico de visitas da prospecção', virouCliente.visitas >= 1);
  await page.evaluate(() => document.querySelectorAll('.ns-overlay').forEach(o => o.remove()));

  // ── desconto no pedido: entra no faturamento, na meta e na comissão ──
  await page.click('#fab');
  await page.waitForSelector('.ns-modal');
  await page.fill('.ns-modal input', 'FARMACIA TESTE');
  await page.click('.ns-modal .item-lista');
  await page.click('text=Tabela Lucro Presumido');
  await page.click('text=+ Adicionar produto');
  const mDesc = page.locator('.ns-overlay').last().locator('.ns-modal');
  await mDesc.waitFor();
  await mDesc.locator('.item-lista').click();
  await mDesc.locator('button:has-text("Adicionar")').click();
  await page.waitForTimeout(200);
  await page.click('button:has-text("Conferir")');
  await page.waitForTimeout(300);
  const brutoDesc = await page.evaluate(() =>
    Number(document.querySelector('.total-bar strong').textContent.replace(/[^\d,]/g, '').replace(',', '.')));
  await page.locator('.ns-modal input[type=number]').last().fill('10');
  await page.waitForTimeout(250);
  const resumoDesc = (await page.textContent('.desc-resumo')).replace(/\u00a0/g, ' ');
  check('desconto mostra bruto, abatimento e valor final',
    resumoDesc.includes('Desconto de 10%') && resumoDesc.includes('Valor final'));
  await page.locator('.ns-modal input[placeholder*="Prazo"]').fill('à vista');
  await page.click('button:has-text("Assinar")');
  await page.waitForTimeout(250);
  await page.locator('.ns-modal input[placeholder*="Nome de quem assina"]').fill('Teste');
  await page.click('button:has-text("Assinar em tela cheia")');
  await page.waitForSelector('.assina-full canvas');
  await page.waitForTimeout(400);
  const bbD = await page.locator('.assina-full canvas').boundingBox();
  await page.mouse.move(bbD.x + 40, bbD.y + bbD.height / 2);
  await page.mouse.down();
  for (let i = 0; i < 8; i++) await page.mouse.move(bbD.x + 40 + i * 15, bbD.y + bbD.height / 2 + i * 4);
  await page.mouse.up();
  await page.click('.assina-full button:has-text("Confirmar assinatura")');
  await page.waitForTimeout(300);
  await page.click('button:has-text("Confirmar e concluir")');
  await page.waitForSelector('.sucesso-banner');
  const pedDesc = await page.evaluate(() => {
    const ps = window.NSDB.all('pedidos').filter(p => p.status === 'concluido')
      .sort((a, b) => (b.numero || 0) - (a.numero || 0));
    const p = ps[0];
    const v = window.NSDB.all('visitas').find(x => x.pedido_id === p.id);
    return { bruto: p.total_bruto, pct: p.desconto_pct, desc: p.desconto_valor,
      total: p.total_valor, comissao: v && v.comissao_valor, valorVisita: v && v.valor_pedido };
  });
  check('pedido grava bruto, % e valor do desconto',
    pedDesc.pct === 10 && Math.abs(pedDesc.bruto - brutoDesc) < 0.01 &&
    Math.abs(pedDesc.desc - brutoDesc * 0.1) < 0.02);
  check('total do pedido já é o líquido (com o desconto abatido)',
    Math.abs(pedDesc.total - brutoDesc * 0.9) < 0.02);
  check('comissão é calculada sobre o valor com desconto',
    Math.abs(pedDesc.comissao - pedDesc.total * 0.1) < 0.02);
  check('a visita (que alimenta meta e painel) usa o valor líquido',
    Math.abs(pedDesc.valorVisita - pedDesc.total) < 0.01);
  const cupomDesc = await page.evaluate(async () => {
    const p = window.NSDB.all('pedidos').filter(x => x.status === 'concluido')
      .sort((a, b) => (b.numero || 0) - (a.numero || 0))[0];
    const blob = await window.NSPedido.gerarCupom(p.id);
    return blob.size;
  });
  check('cupom sai com o desconto impresso (imagem gerada)', cupomDesc > 5000);
  // desfaz o pedido do teste de desconto para os cenários seguintes voltarem ao estado esperado
  await page.evaluate(() => {
    const p = window.NSDB.all('pedidos').filter(x => x.status === 'concluido')
      .sort((a, b) => (b.numero || 0) - (a.numero || 0))[0];
    window.NSDB.removeWhere('pedido_itens', i => i.pedido_id === p.id);
    window.NSDB.removeWhere('visitas', v => v.pedido_id === p.id);
    window.NSDB.remove('pedidos', p.id);
  });
  await page.evaluate(() => document.querySelectorAll('.ns-overlay').forEach(o => o.remove()));

  // ── histórico de visitas da semana ──
  const histSemana = await page.evaluate(() => {
    const rep = window.NSDB.all('representantes')[0];
    // cliente próprio do cenário, para não mexer nos números dos outros testes
    const cli = window.NSDB.insert('clientes', { representante_id: rep.id,
      nome: 'FARMACIA DE ONTEM', cidade: 'Erechim', uf: 'RS', status: 'ativo', classe: 'B' });
    // visita de ontem, num cliente que não está na rota de hoje
    const ontem = new Date(); ontem.setDate(ontem.getDate() - 1);
    const iso = ontem.toISOString().slice(0, 10);
    window.NSDB.insert('visitas', { cliente_id: cli.id, representante_id: rep.id,
      data_visita: iso, realizada: true, fez_pedido: true, valor_pedido: 1234.5 });
    return { iso, diaSemana: ontem.getDay() };
  });
  const DIAS = ['', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta'];
  if (histSemana.diaSemana >= 1 && histSemana.diaSemana <= 5) {
    await page.click('#tabs button[data-v=hoje]');
    await page.waitForTimeout(250);
    await page.locator('#view .chip', { hasText: DIAS[histSemana.diaSemana] }).first().click();
    await page.waitForTimeout(350);
    const abaOntem = await page.textContent('#view');
    if (process.env.DBG) console.log('--ABA ONTEM--', abaOntem.slice(0, 500));
    check('a aba do dia anterior continua mostrando quem foi atendido',
      abaOntem.includes('FARMACIA DE ONTEM') &&
      (abaOntem.includes('Também atendidos') || abaOntem.includes('Atendido em')));
    check('e o histórico mostra o valor do pedido daquele dia', abaOntem.includes('1.234,50'));
    await page.locator('#view .chip', { hasText: DIAS[new Date().getDay()] || 'Segunda' }).first().click();
    await page.waitForTimeout(250);
  }

  // ── ordem manual da rota ──
  await page.evaluate(() => {
    const reps = window.NSDB.all('representantes')[0];
    ['ORDEM A', 'ORDEM B', 'ORDEM C'].forEach((nome, i) => {
      window.NSDB.insert('clientes', { representante_id: reps.id, nome, cidade: 'PF', uf: 'RS',
        status: 'ativo', classe: 'B', rota_dia: null });
    });
  });
  await page.click('#tabs button[data-v=hoje]');
  await page.waitForTimeout(250);
  await page.locator('#view button:has-text("rota de")').first().click();
  await page.waitForSelector('.ns-overlay');
  const mo = page.locator('.ns-overlay').last();
  for (const n of ['ORDEM A', 'ORDEM B', 'ORDEM C']) {
    await mo.locator('input').first().fill(n);
    await page.waitForTimeout(200);
    await mo.locator('button:has-text("Adicionar à rota")').first().click();
    await page.waitForTimeout(150);
  }
  await mo.locator('button:has-text("Concluir")').click();
  await page.waitForTimeout(350);
  const nomesNaRota = () => page.evaluate(() =>
    Array.from(document.querySelectorAll('#view .card-visita strong')).map(x => x.textContent.replace(/^\d+/, '')));
  const antes = await nomesNaRota();
  check('ordem inicial é a de inclusão', antes.length >= 3);
  await page.locator('#view .card-visita').last().locator('button:has-text("Primeiro")').click();
  await page.waitForTimeout(300);
  const depois = await nomesNaRota();
  check('mover para "Primeiro" muda a ordem de verdade', depois[0] === antes[antes.length - 1]);
  await page.locator('#view button:has-text("Inverter ordem")').click();
  await page.waitForTimeout(300);
  const invertido = await nomesNaRota();
  check('inverter ordem vira a rota de ponta-cabeça',
    invertido[0] === depois[depois.length - 1] && invertido[invertido.length - 1] === depois[0]);
  const ordemGravada = await page.evaluate(() =>
    Array.from(document.querySelectorAll('#view .card-visita'))
      .map(x => window.NSDB.byId('clientes', x.getAttribute('data-id')).rota_ordem));
  check('a ordem manual fica gravada (1, 2, 3…)',
    ordemGravada.join(',') === ordemGravada.map((_, i) => i + 1).join(','));

  // arrastar com toque longo: segurar no cartão (não num botão) e puxar
  const cards = page.locator('#view .card-visita');
  const antesDrag = await nomesNaRota();
  const cx1 = await cards.first().boundingBox();
  const cx3 = await cards.nth(2).boundingBox();
  await page.mouse.move(cx1.x + cx1.width / 2, cx1.y + 24);
  await page.mouse.down();
  await page.waitForTimeout(400);                     // segura para virar arraste
  const segurando = await page.locator('#view .card-visita.arrastando').count();
  check('segurar o cartão inicia o arraste (não aciona botão)', segurando === 1);
  check('aparece o espaço tracejado mostrando onde vai cair',
    (await page.locator('#view .solta-aqui').count()) === 1);
  await page.mouse.move(cx1.x + cx1.width / 2, cx3.y + cx3.height - 10, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(350);
  const depoisDrag = await nomesNaRota();
  if (process.env.DBG) console.log('DRAG antes:', antesDrag.join('|'), '→ depois:', depoisDrag.join('|'));
  check('arrastar reordena de verdade', depoisDrag[0] !== antesDrag[0] &&
    depoisDrag.length === antesDrag.length);
  check('e a nova ordem fica gravada', (await page.evaluate(() =>
    Array.from(document.querySelectorAll('#view .card-visita'))
      .map(x => window.NSDB.byId('clientes', x.getAttribute('data-id')).rota_ordem)
      .join(','))) === antesDrag.map((_, i) => i + 1).join(','));
  // deslizar sem segurar = rolagem, não pode reordenar
  const ordemAntesScroll = await nomesNaRota();
  const c1 = await cards.first().boundingBox();
  await page.mouse.move(c1.x + c1.width / 2, c1.y + 24);
  await page.mouse.down();
  await page.mouse.move(c1.x + c1.width / 2, c1.y + 120, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  check('deslizar rápido é rolagem — não reordena',
    (await nomesNaRota()).join('|') === ordemAntesScroll.join('|'));

  // limpa a rota montada nos testes de ordem para o cenário seguinte começar do zero
  await page.evaluate(() => {
    // tira só os clientes criados para o teste de ordem/prospecção — o cliente do
    // pedido precisa continuar na rota, é o que o próximo bloco verifica
    window.NSDB.all('clientes')
      .filter(c => c.rota_dia && /^ORDEM |PROSPEC/.test(c.nome))
      .forEach(c => window.NSDB.update('clientes', c.id, { rota_dia: null, rota_ordem: null }));
  });
  // rota manual: criar rota do dia, adicionar cliente, registrar visita sem pedido
  await page.evaluate(() => document.querySelectorAll('.ns-overlay').forEach(o => o.remove()));
  await page.click('#tabs button[data-v=hoje]');
  await page.waitForTimeout(300);
  const rotaTxt = await page.textContent('#view');
  check('rota manual: abas dos dias, sem rota automática',
    rotaTxt.includes('Segunda') && rotaTxt.includes('Sexta') &&
    !rotaTxt.includes('Otimizar rota') && !rotaTxt.includes('Estou aqui'));

  // pedido digitado fora da rota entra sozinho na rota do dia, já atendido
  const diaUtilHoje = [1, 2, 3, 4, 5].includes(new Date().getDay());
  if (diaUtilHoje) {
    check('pedido fora da rota inclui o cliente na rota de hoje',
      rotaTxt.includes('FARMACIA TESTE LTDA') && rotaTxt.includes('Editar rota'));
    check('e já entra marcado como atendido (conta na meta de visitação)',
      rotaTxt.includes('pedido') && rotaTxt.includes('1 de 1 visitados'));
    check('cartão da rota mostra o CNPJ sem abrir o cadastro',
      rotaTxt.includes('CNPJ 11.222.333/0001-44'));
    const bolinhas = await page.locator('#view .card-visita .st-tag').count();
    check('uma única bolinha de status por cliente (sem duplicar)', bolinhas === 1);
    // tira da rota para o cenário seguinte começar do zero
    await page.locator('#view button:has-text("Remover da rota")').click();
    await page.waitForTimeout(250);
  }
  check('botão grande de Criar rota aparece quando o dia está vazio',
    (await page.textContent('#view')).includes('Criar rota'));
  await page.locator('#view button:has-text("Criar rota")').click();
  await page.waitForSelector('.ns-overlay');
  const selTxt = await page.locator('.ns-overlay').last().textContent();
  check('seleção mostra filtros e clientes disponíveis por prioridade',
    selTxt.includes('disponível') && selTxt.includes('Todas as cidades') && selTxt.includes('Dias sem pedido'));
  await page.locator('.ns-overlay').last().locator('input').first().fill('FARMACIA TESTE');
  await page.waitForTimeout(250);
  await page.locator('.ns-overlay').last().locator('button:has-text("Adicionar à rota")').first().click();
  await page.waitForTimeout(250);
  const depoisAdd = await page.locator('.ns-overlay').last().textContent();
  check('cliente adicionado sai da lista de disponíveis', depoisAdd.includes('1 cliente(s)'));
  await page.locator('.ns-overlay').last().locator('button:has-text("Concluir")').click();
  await page.waitForTimeout(400);
  const naRota = await page.textContent('#view');
  check('cliente aparece na rota do dia com os 2 botões',
    naRota.includes('FARMACIA TESTE LTDA') && naRota.includes('Registrar visita') && naRota.includes('Remover da rota'));
  await page.locator('#view button:has-text("Registrar visita")').first().click();
  await page.waitForSelector('.ns-overlay');
  const opc = await page.locator('.ns-overlay').last().textContent();
  check('registrar visita oferece as 3 opções', opc.includes('Novo pedido') && opc.includes('Sem pedido') && opc.includes('Não visitei'));
  await page.locator('.ns-overlay').last().locator('button:has-text("Sem pedido")').click();
  await page.waitForTimeout(250);
  await page.locator('.ns-overlay').last().locator('button:has-text("Cliente não quis fazer pedido")').click();
  await page.locator('.ns-overlay').last().locator('textarea').fill('Vai repor semana que vem');
  await page.locator('.ns-overlay').last().locator('button:has-text("Salvar visita")').click();
  await page.waitForTimeout(400);
  const visSem = await page.evaluate(() => JSON.parse(localStorage.getItem('ns_c_visitas')).find(v => v.motivo_sem_pedido));
  check('visita sem pedido grava motivo e observação',
    !!visSem && visSem.motivo_sem_pedido === 'Cliente não quis fazer pedido' && visSem.observacao === 'Vai repor semana que vem');
  await page.locator('#view button:has-text("Remover da rota")').first().click();
  await page.waitForTimeout(400);
  const cliRota = await page.evaluate(() => JSON.parse(localStorage.getItem('ns_c_clientes'))[0].rota_dia);
  check('remover da rota devolve o cliente para a lista', cliRota == null);
  // status colorido + alerta de observação + semana planejada + resetar rota
  const rotaUI = await page.evaluate(() => ({
    html: document.querySelector('#view').innerHTML,
    txt: document.querySelector('#view').textContent
  }));
  check('abas mostram a semana planejada com as datas',
    rotaUI.txt.includes('semana') && /Segunda \d{2}\/\d{2}/.test(rotaUI.txt));
  // observação interna já cadastrada antes deve virar alerta no card da seleção
  await page.locator('#view button:has-text("Criar rota")').click();
  await page.waitForSelector('.ns-overlay');
  const selUI = await page.evaluate(() => document.querySelector('.ns-overlay:last-of-type').innerHTML);
  check('card da seleção mostra bolinha de status (verde/amarelo/vermelho)', /st-tag (vermelho|amarelo|verde|cinza)/.test(selUI));
  await page.locator('.ns-overlay').last().locator('button:has-text("Adicionar à rota")').first().click();
  await page.waitForTimeout(200);
  await page.locator('.ns-overlay').last().locator('button:has-text("Concluir")').click();
  await page.waitForTimeout(300);
  check('botão de resetar rota aparece com a rota montada',
    (await page.textContent('#view')).includes('Resetar rota'));
  await page.locator('#view button:has-text("Resetar rota")').click();
  await page.locator('.ns-overlay').last().locator('button:has-text("Confirmar")').click();
  await page.waitForTimeout(400);
  const aposReset = await page.evaluate(() => JSON.parse(localStorage.getItem('ns_c_clientes')).filter(c => c.rota_dia).length);
  check('resetar rota devolve todos os clientes do dia', aposReset === 0);

  // classe A/B/C: tocar em C ajusta ciclo para 90 dias
  await page.click('#tabs button[data-v=clientes]');
  await page.waitForTimeout(200);
  await page.locator('#view .item-lista').first().click();
  await page.waitForSelector('.ns-overlay');
  await page.locator('.ns-overlay button:has-text("C · 90d")').click();
  await page.waitForTimeout(250);
  const cliClasse = await page.evaluate((id) => window.NSDB.byId('clientes', id), CLI_ID);
  check('classe C aplica ciclo de 90 dias', cliClasse.classe === 'C' && cliClasse.frequencia_dias === 90);
  await page.locator('.ns-overlay').last().locator('.btn-icon').first().click();

  // observações internas: salvam, aparecem e NUNCA vazam para o PDF
  await page.locator('#view .item-lista').first().click();
  await page.waitForSelector('.ns-overlay');
  await page.locator('.ns-overlay input[placeholder*="Anotar algo"]').fill('NOTA-INTERNA-SIGILOSA-123');
  await page.locator('.ns-overlay button[aria-label="Adicionar observação"]').click();
  await page.waitForTimeout(250);
  const notas = await page.evaluate(() => JSON.parse(localStorage.getItem('ns_c_cliente_notas') || '[]'));
  const notaNova = notas.find(n => n.texto === 'NOTA-INTERNA-SIGILOSA-123');
  check('observação interna salva com autor', !!notaNova && !!notaNova.autor);
  check('visita sem pedido também vira observação interna', notas.some(n => n.texto.includes('Vai repor semana que vem')));
  const pdfSemNota = await page.evaluate(async () => {
    const p = JSON.parse(localStorage.getItem('ns_c_pedidos'))[0];
    const blob = await window.NSPedido.gerarPDF(p.id);
    const txt = new TextDecoder('latin1').decode(new Uint8Array(await blob.arrayBuffer()));
    return !txt.includes('NOTA-INTERNA-SIGILOSA');
  });
  check('observação interna NÃO aparece no PDF do talão', pdfSemNota === true);
  await page.locator('.ns-overlay').last().locator('.btn-icon').first().click();

  // suporte com IA: aba Ajuda responde com o manual quando offline
  await page.click('#tabs button[data-v=ajuda]');
  await page.waitForSelector('.chat-lista');
  check('aba Ajuda abre com boas-vindas e sugestões', (await page.textContent('.chat-lista')).includes('assistente'));
  await page.fill('#view input', 'como monto a rota de um dia?');
  await page.click('#view .btn');
  await page.waitForFunction(() => document.querySelectorAll('.chat-msg').length >= 2, null, { timeout: 8000 });
  const chat = await page.textContent('.chat-lista');
  check('sem internet, responde com a parte certa do manual (criar rota)',
    chat.toLowerCase().includes('rota'));

  // excluir pedido: remove itens, reverte visita/comissão e recalcula o ciclo
  await page.click('#tabs button[data-v=pedidos]');
  await page.waitForTimeout(200);
  await page.locator('#view .item-lista').first().click();
  await page.locator('.ns-overlay').last().locator('button:has-text("Excluir pedido")').click();
  await page.locator('.ns-overlay').last().locator('button:has-text("Confirmar")').click();
  await page.waitForTimeout(400);
  const posDel = await page.evaluate(() => ({
    pedidos: JSON.parse(localStorage.getItem('ns_c_pedidos')).length,
    itens: JSON.parse(localStorage.getItem('ns_c_pedido_itens')).length,
    visita: JSON.parse(localStorage.getItem('ns_c_visitas'))[0],
    cli: window.NSDB.byId('clientes', '22222222-2222-4222-8222-222222222222')
  }));
  check('excluir pedido remove pedido e itens', posDel.pedidos === 0 && posDel.itens === 0);
  check('visita revertida (sem pedido/comissão)', posDel.visita.fez_pedido === false && !posDel.visita.comissao_valor);
  check('ciclo recalculado (sem último pedido, com última visita)', posDel.cli.ultimo_pedido_em == null && !!posDel.cli.ultima_visita_em);

  // recolher peças no próprio talão: 0 placas + devolução → item negativo (crédito)
  await page.click('#fab');
  await page.waitForSelector('.ns-modal');
  await page.fill('.ns-modal input', 'farm');
  await page.click('.ns-modal .item-lista');
  await page.click('text=Tabela Lucro Presumido');
  await page.click('text=+ Adicionar produto');
  const modalRet = page.locator('.ns-overlay').last().locator('.ns-modal');
  await modalRet.waitFor();
  await modalRet.locator('.item-lista').first().click();
  const stRet = modalRet.locator('.stepper');
  await stRet.nth(0).locator('button', { hasText: '\u2212' }).click();               // placas 1 \u2192 0
  for (let k = 0; k < 4; k++) await stRet.nth(1).locator('button', { hasText: '+' }).click(); // dev display 4
  const liveRet = (await modalRet.locator('.calc-live').textContent()).replace(/\u00a0/g, ' ');
  check('0 placas + 4 recolhidas: item negativo \u221258,00', liveRet.includes('-R$ 58,00'));
  check('aviso de cr\u00e9dito aparece no c\u00e1lculo', liveRet.includes('Recolhendo 4 un'));
  await modalRet.locator('button:has-text("Adicionar")').click();
  await page.waitForTimeout(150);
  await page.click('button:has-text("Conferir")');
  const confRet = (await page.textContent('.ns-modal')).replace(/\u00a0/g, ' ');
  check('confer\u00eancia mostra pedido negativo com aviso de cr\u00e9dito', confRet.includes('-R$ 58,00') && confRet.includes('CR\u00c9DITO'));
  await page.fill('.ns-modal input[placeholder*="Prazo"]', '30 dias');
  await page.click('button:has-text("Assinar")');
  await page.fill('.ns-modal input[placeholder*="Nome de quem assina"]', 'Maria Souza');
  await page.click('button:has-text("Assinar em tela cheia")');
  await page.waitForSelector('.assina-full canvas');
  await page.waitForTimeout(400);
  const cvR = page.locator('.assina-full canvas');
  const bbR = await cvR.boundingBox();
  await page.mouse.move(bbR.x + 40, bbR.y + bbR.height / 2);
  await page.mouse.down();
  for (let i = 0; i < 10; i++) await page.mouse.move(bbR.x + 40 + i * 18, bbR.y + bbR.height / 2 + Math.cos(i) * 30);
  await page.mouse.up();
  await page.click('.assina-full button:has-text("Confirmar assinatura")');
  await page.waitForTimeout(300);
  await page.click('button:has-text("Confirmar e concluir")');
  await page.waitForSelector('.sucesso-banner');
  const ret = await page.evaluate(() => ({
    pedido: JSON.parse(localStorage.getItem('ns_c_pedidos'))[0],
    visita: JSON.parse(localStorage.getItem('ns_c_visitas')).find(v => v.pedido_id),
    cli: JSON.parse(localStorage.getItem('ns_c_clientes'))[0]
  }));
  check('pedido negativo salvo: total −58,00', ret.pedido.total_valor === -58);
  check('crédito abate na comissão: 10% de −58 = −5,80', ret.visita.comissao_pct === 10 && ret.visita.comissao_valor === -5.8);
  check('pedido só de recolhimento não conta como compra', ret.cli.ultimo_pedido_em == null);
  const pdfRet = await page.evaluate(async () => {
    const p = JSON.parse(localStorage.getItem('ns_c_pedidos'))[0];
    const blob = await window.NSPedido.gerarPDF(p.id);
    const txt = new TextDecoder('latin1').decode(new Uint8Array(await blob.arrayBuffer()));
    return txt.includes('Recolhimento com Cr\xe9dito') && txt.includes('CR\xc9DITO DO CLIENTE');
  });
  check('PDF do pedido negativo sai como "Crédito do Cliente"', pdfRet === true);
  await page.locator('.ns-overlay').last().locator('.btn-icon').first().click();

  // editar pedido concluído: corrigir quantidade e prazo sem excluir
  await page.click('#tabs button[data-v=pedidos]');
  await page.waitForTimeout(200);
  await page.locator('#view .item-lista').first().click();
  await page.locator('.ns-overlay').last().locator('button:has-text("Editar pedido")').click();
  await page.waitForTimeout(300);
  await page.locator('.ns-overlay').last().locator('.card-item button:has-text("editar")').first().click();
  await page.waitForTimeout(200);
  const itemEd = page.locator('.ns-overlay').last();
  await itemEd.locator('.stepper').nth(1).locator('button', { hasText: '+' }).click(); // dev 4 \u2192 5
  await itemEd.locator('button:has-text("Salvar")').click();
  await page.waitForTimeout(150);
  await page.click('button:has-text("Conferir")');
  await page.fill('.ns-modal input[placeholder*="Prazo"]', '45 dias');
  await page.click('text=Salvar altera\u00e7\u00f5es');
  await page.waitForTimeout(400);
  const ed = await page.evaluate(() => ({
    p: JSON.parse(localStorage.getItem('ns_c_pedidos'))[0],
    v: JSON.parse(localStorage.getItem('ns_c_visitas')).find(x => x.pedido_id),
    nItens: JSON.parse(localStorage.getItem('ns_c_pedido_itens')).length
  }));
  check('edição: total recalculado (\u221272,50) e prazo trocado para 45 dias',
    ed.p.total_valor === -72.5 && ed.p.condicao_pagamento === '45 dias');
  check('edição: comissão recalculada mantendo a % (10% \u2192 \u22127,25)',
    ed.v.comissao_pct === 10 && ed.v.comissao_valor === -7.25);
  check('edição: assinatura e assinante preservados, itens sem duplicar',
    !!ed.p.assinatura && ed.p.assinante_nome === 'Maria Souza' && ed.nItens === 1);
  await page.locator('.ns-overlay').last().locator('.btn-icon').first().click();
  await page.waitForTimeout(200);

  check('sem erros de JavaScript na página', erros.length === 0);
  if (erros.length) console.error(erros.join('\n'));

  // ===== Cenário 2: conexão volta → fila sincroniza na ordem certa =====
  const dump = await page.evaluate(() => { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); o[k] = localStorage.getItem(k); } return o; });
  await page.close();

  const reqs = [];
  const page2 = await browser.newPage();
  await page2.route('**/firestore.googleapis.com/**', (r) => {
    const req = r.request();
    const u = new URL(req.url());
    const col = u.pathname.split('/documents/')[1] ? u.pathname.split('/documents/')[1].split('/')[0] : u.pathname.split('/').pop();
    const temMask = u.search.includes('updateMask');
    reqs.push(req.method() + ' ' + col + (temMask ? '#mask' : ''));
    if (req.method() === 'GET') return r.fulfill({ status: 200, contentType: 'application/json', body: '{"documents":[]}' });
    return r.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  await page2.addInitScript((d) => { for (const [k, v] of Object.entries(d)) localStorage.setItem(k, v); }, dump);
  await page2.goto('http://localhost:8899/');
  await page2.waitForFunction(() => JSON.parse(localStorage.getItem('ns_outbox') || '[]').length === 0, null, { timeout: 15000 });
  check('fila sincronizada ao voltar a conexão (outbox vazio)', true);
  const posts = reqs.filter(x => !x.startsWith('GET'));
  const iSetPed = posts.findIndex(x => x === 'PATCH pedidos');           // criação (doc inteiro)
  const iSetIt = posts.findIndex(x => x === 'PATCH pedido_itens');
  const iSetVis = posts.findIndex(x => x === 'PATCH visitas');
  const iConcl = posts.findIndex(x => x === 'PATCH pedidos#mask');       // conclusão (updateMask)
  check('ordem do sync: pedido → itens → visita → conclusão',
    iSetPed >= 0 && iSetIt > iSetPed && iSetVis > iSetIt && iConcl > iSetVis);
  await page2.waitForFunction(() => document.querySelector('#syncChip') && document.querySelector('#syncChip').textContent.includes('sincronizado'), null, { timeout: 8000 }).catch(async () => {
    console.log('    chip atual:', await page2.textContent('#syncChip').catch(() => '(sem chip)'));
  });
  check('chip confirma sincronizado', (await page2.textContent('#syncChip').catch(() => '')).includes('sincronizado'));

  await page2.close();

  // ===== Cenário 3: primeira instalação (seed → Firestore) + primeiro login =====
  const store = {}; // Firestore simulado com memória
  const page3 = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page3.on('pageerror', (e) => erros.push('pageerror3: ' + e.message));
  await page3.route('**/firestore.googleapis.com/**', (r) => {
    const req = r.request();
    const u = new URL(req.url());
    const json = (b) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
    if (u.pathname.endsWith(':commit')) {
      for (const w of JSON.parse(req.postData()).writes) {
        const parts = w.update.name.split('/documents/')[1].split('/');
        (store[parts[0]] = store[parts[0]] || {})[parts[1]] = w.update.fields;
      }
      return json({});
    }
    const rest = u.pathname.split('/documents/')[1] || '';
    const [col, id] = rest.split('/');
    if (req.method() === 'GET')
      return json({ documents: Object.entries(store[col] || {}).map(([did, fields]) =>
        ({ name: 'projects/fake-proj/databases/(default)/documents/' + col + '/' + did, fields })) });
    if (req.method() === 'PATCH') {
      (store[col] = store[col] || {})[id] = Object.assign({}, (store[col] || {})[id], JSON.parse(req.postData()).fields);
      return json({});
    }
    if (req.method() === 'DELETE') { if (store[col]) delete store[col][id]; return json({}); }
    return json({});
  });
  await page3.goto('http://localhost:8899/');
  await page3.waitForSelector('.login-box');
  check('botão de primeira instalação aparece', await page3.isVisible('text=Primeira instalação'));
  await page3.click('text=Primeira instalação');
  await page3.waitForFunction(() =>
    JSON.parse(localStorage.getItem('ns_c_clientes') || '[]').length === 314, null, { timeout: 20000 });
  await page3.waitForSelector('text=Primeira instalação', { state: 'detached', timeout: 10000 }); // tela re-renderizada
  check('instalação carregou 314 clientes no Firestore e no cache',
    (store.clientes && Object.keys(store.clientes).length === 314 &&
     store.produtos && Object.keys(store.produtos).length === 17 &&
     store.representantes && Object.keys(store.representantes).length === 2) === true);

  await page3.fill('input[type=email]', 'denilson@newstar.com.br');
  await page3.fill('input[type=password]', '123456');
  await page3.click('text=Entrar');
  await page3.waitForSelector('.ns-modal'); // primeiro acesso → definir senha
  const senhas = page3.locator('.ns-modal input[type=password]');
  await senhas.nth(0).fill('123456');
  await senhas.nth(1).fill('123456');
  await page3.click('text=Salvar senha e entrar');
  await page3.waitForSelector('#tabs', { state: 'visible' });
  check('primeiro login define a senha e entra', true);

  await page3.click('#tabs button[data-v=clientes]');
  await page3.fill('#view input', 'chapecó');
  await page3.waitForTimeout(250);
  check('base nova: busca por cidade acha clientes de Chapecó',
    (await page3.textContent('#view')).toLowerCase().includes('chapec'));
  await page3.click('#tabs button[data-v=dash]');
  const dash3 = await page3.textContent('#view');
  check('dashboard: 294 clientes ativos (314 − 20 inativos da lista)', dash3.includes('Clientes ativos294'));

  // ---- tabela de preço travada no cadastro do cliente ----
  const page4 = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page4.route('**/firestore.googleapis.com/**', (r) => r.abort());
  await page4.addInitScript((s) => {
    const cli = JSON.parse(JSON.stringify(s.ns_c_clientes));
    cli[0].tabela_permitida = 'lucro';           // cliente tipo Clamed: só Lucro Presumido
    cli.push(Object.assign({}, cli[0], {
      id: '44444444-4444-4444-8444-444444444444', nome: 'FARMACIA SO SIMPLES LTDA',
      cnpj_cpf: '99.888.777/0001-66', tabela_permitida: 'simples'
    }));
    for (const [k, v] of Object.entries(s)) localStorage.setItem(k, JSON.stringify(v));
    localStorage.setItem('ns_c_clientes', JSON.stringify(cli));
    Object.defineProperty(navigator, 'onLine', { get: () => false });
  }, seed);
  await page4.goto('http://localhost:8899/');
  await page4.waitForSelector('.login-box input[type=email]');
  await page4.fill('input[type=email]', 'denilson@newstar.com.br');
  await page4.fill('input[type=password]', '123456');
  await page4.click('text=Entrar');
  await page4.waitForSelector('#tabs', { state: 'visible' });

  await page4.click('#fab');
  await page4.waitForSelector('.ns-modal');
  await page4.fill('.ns-modal input', 'FARMACIA TESTE');
  await page4.click('.ns-modal .item-lista');
  await page4.waitForSelector('text=Tabela de preço do pedido');
  const escolhasLucro = page4.locator('.ns-modal .card-escolha');
  check('cliente só Lucro Presumido mostra uma única tabela', (await escolhasLucro.count()) === 1);
  check('e a tabela mostrada é a Lucro Presumido',
    (await escolhasLucro.first().textContent()).includes('Lucro Presumido'));
  check('avisa que a tabela veio do cadastro',
    (await page4.textContent('.ns-modal')).includes('definido no cadastro'));
  // segue o pedido normalmente com a tabela travada (preço 14,50 = lucro)
  await escolhasLucro.first().click();
  await page4.click('text=+ Adicionar produto');
  const mLucro = page4.locator('.ns-overlay').last().locator('.ns-modal');
  await mLucro.waitFor();
  check('preço aplicado é o da tabela travada (14,50)', (await mLucro.textContent()).includes('14,50'));
  await mLucro.locator('.item-lista').click();
  await page4.waitForTimeout(120);
  check('cálculo roda com a tabela travada (48 × 14,50 = 696,00)',
    (await mLucro.locator('.calc-live').textContent()).replace(/ /g, ' ').includes('696,00'));
  // o outro cliente é só Simples: preço 12,60 (recarrega para começar um pedido limpo)
  await page4.reload();
  await page4.waitForSelector('#tabs', { state: 'visible' });
  await page4.click('#fab');
  await page4.waitForSelector('.ns-modal');
  await page4.fill('.ns-modal input', 'SO SIMPLES');
  await page4.click('.ns-modal .item-lista');
  await page4.waitForSelector('text=Tabela de preço do pedido');
  const escolhasSimples = page4.locator('.ns-modal .card-escolha');
  check('cliente só Simples mostra uma única tabela', (await escolhasSimples.count()) === 1);
  check('e a tabela mostrada é a Simples',
    (await escolhasSimples.first().textContent()).includes('Simples'));
  await escolhasSimples.first().click();
  await page4.click('text=+ Adicionar produto');
  const mSimples = page4.locator('.ns-overlay').last().locator('.ns-modal');
  await mSimples.waitFor();
  check('cliente só Simples usa o preço Simples (12,60)', (await mSimples.textContent()).includes('12,60'));
  await page4.close();

  // sem o campo (base antiga) o vendedor continua escolhendo as duas
  const page5 = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page5.route('**/firestore.googleapis.com/**', (r) => r.abort());
  await page5.addInitScript((s) => {
    for (const [k, v] of Object.entries(s)) localStorage.setItem(k, JSON.stringify(v));
    Object.defineProperty(navigator, 'onLine', { get: () => false });
  }, seed);
  await page5.goto('http://localhost:8899/');
  await page5.waitForSelector('.login-box input[type=email]');
  await page5.fill('input[type=email]', 'denilson@newstar.com.br');
  await page5.fill('input[type=password]', '123456');
  await page5.click('text=Entrar');
  await page5.waitForSelector('#tabs', { state: 'visible' });
  await page5.click('#fab');
  await page5.waitForSelector('.ns-modal');
  await page5.fill('.ns-modal input', 'farm');
  await page5.click('.ns-modal .item-lista');
  await page5.waitForSelector('text=Tabela de preço do pedido');
  check('cliente sem restrição (padrão) continua com as duas tabelas',
    (await page5.locator('.ns-modal .card-escolha').count()) === 2);
  await page5.close();

  await browser.close();
  server.close();
  console.log(`\nE2E: ${ok} ok, ${fail} falhas`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERRO FATAL:', e); process.exit(1); });
