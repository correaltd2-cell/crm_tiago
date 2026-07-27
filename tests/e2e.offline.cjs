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

  // sem prazo não avança
  await page.click('text=Tabela Lucro Presumido');
  await page.waitForTimeout(250);
  check('não deixa lançar pedido sem o prazo (condição de pagamento)',
    !(await page.isVisible('text=+ Adicionar produto')));
  // tabela Lucro Presumido → preço 14,50
  await page.selectOption('.ns-modal select', '30 dias');
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

  await page.click('text=Conferir →');
  const conf = await page.textContent('.ns-modal');
  check('conferência mostra tabela e total', conf.includes('Lucro Presumido') && conf.replace(/ /g, ' ').includes('594,50'));

  // assinatura no canvas
  await page.click('text=Assinar →');
  const cv = page.locator('.assinatura-cv');
  const bb = await cv.boundingBox();
  await page.mouse.move(bb.x + 30, bb.y + 100);
  await page.mouse.down();
  for (let i = 0; i < 12; i++) await page.mouse.move(bb.x + 30 + i * 18, bb.y + 100 + Math.sin(i) * 30);
  await page.mouse.up();
  // sem o nome de quem assina, não conclui
  await page.fill('.ns-modal input[placeholder*="Nome de quem assina"]', '');
  await page.click('text=✓ Confirmar e concluir');
  await page.waitForTimeout(250);
  check('não conclui sem o nome de quem assina', !(await page.isVisible('.sucesso-banner')));
  await page.fill('.ns-modal input[placeholder*="Nome de quem assina"]', 'João da Silva');
  await page.click('text=✓ Confirmar e concluir');
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

  // cupom 58mm para impressora térmica: página estreita (164pt) e válida
  const cupomInfo = await page.evaluate(async (pid) => {
    const blob = await window.NSPedido.gerarCupom(pid);
    const buf = new Uint8Array(await blob.arrayBuffer());
    const txt = new TextDecoder('latin1').decode(buf);
    const media = txt.match(/\/MediaBox \[0 0 (\d+) (\d+(?:\.\d+)?)\]/);
    return {
      head: txt.slice(0, 5), largura: media ? Number(media[1]) : 0,
      altura: media ? Number(media[2]) : 0,
      temImg: txt.includes('/DCTDecode') && txt.includes('/Im1'),
      temAssinante: txt.includes('Jo\xe3o da Silva'),
      xrefFecha: /startxref\n\d+\n%%EOF$/.test(txt)
    };
  }, dados.pedido.id);
  check('cupom 58mm: PDF válido com página de 164pt de largura',
    cupomInfo.head === '%PDF-' && cupomInfo.largura === 164 && cupomInfo.xrefFecha);
  check('cupom 58mm: altura sob medida, assinatura e assinante presentes',
    cupomInfo.altura >= 220 && cupomInfo.temImg && cupomInfo.temAssinante);

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

  // classe A/B/C: tocar em C ajusta ciclo para 90 dias
  await page.click('#tabs button[data-v=clientes]');
  await page.waitForTimeout(200);
  await page.locator('#view .item-lista').first().click();
  await page.waitForSelector('.ns-overlay');
  await page.locator('.ns-overlay button:has-text("C · 90d")').click();
  await page.waitForTimeout(250);
  const cliClasse = await page.evaluate(() => JSON.parse(localStorage.getItem('ns_c_clientes'))[0]);
  check('classe C aplica ciclo de 90 dias', cliClasse.classe === 'C' && cliClasse.frequencia_dias === 90);
  await page.locator('.ns-overlay').last().locator('.btn-icon').first().click();

  // observações internas: salvam, aparecem e NUNCA vazam para o PDF
  await page.locator('#view .item-lista').first().click();
  await page.waitForSelector('.ns-overlay');
  await page.locator('.ns-overlay input[placeholder*="Anotar algo"]').fill('NOTA-INTERNA-SIGILOSA-123');
  await page.locator('.ns-overlay button:has-text("➕")').click();
  await page.waitForTimeout(250);
  const notas = await page.evaluate(() => JSON.parse(localStorage.getItem('ns_c_cliente_notas') || '[]'));
  check('observação interna salva com autor', notas.length === 1 && notas[0].texto === 'NOTA-INTERNA-SIGILOSA-123' && !!notas[0].autor);
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
  await page.fill('#view input', 'o que faz o botão otimizar rota?');
  await page.click('#view .btn');
  await page.waitForFunction(() => document.querySelectorAll('.chat-msg').length >= 2, null, { timeout: 8000 });
  const chat = await page.textContent('.chat-lista');
  check('sem internet, responde com a parte certa do manual (otimizar rota)',
    chat.includes('MELHOR ORDEM') || chat.toLowerCase().includes('otimizar rota'));

  // excluir pedido: remove itens, reverte visita/comissão e recalcula o ciclo
  await page.click('#tabs button[data-v=pedidos]');
  await page.waitForTimeout(200);
  await page.locator('#view .item-lista').first().click();
  await page.locator('.ns-overlay').last().locator('text=🗑 Excluir pedido').click();
  await page.locator('.ns-overlay').last().locator('button:has-text("Confirmar")').click();
  await page.waitForTimeout(400);
  const posDel = await page.evaluate(() => ({
    pedidos: JSON.parse(localStorage.getItem('ns_c_pedidos')).length,
    itens: JSON.parse(localStorage.getItem('ns_c_pedido_itens')).length,
    visita: JSON.parse(localStorage.getItem('ns_c_visitas'))[0],
    cli: JSON.parse(localStorage.getItem('ns_c_clientes'))[0]
  }));
  check('excluir pedido remove pedido e itens', posDel.pedidos === 0 && posDel.itens === 0);
  check('visita revertida (sem pedido/comissão)', posDel.visita.fez_pedido === false && !posDel.visita.comissao_valor);
  check('ciclo recalculado (sem último pedido, com última visita)', posDel.cli.ultimo_pedido_em == null && !!posDel.cli.ultima_visita_em);

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

  await browser.close();
  server.close();
  console.log(`\nE2E: ${ok} ok, ${fail} falhas`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERRO FATAL:', e); process.exit(1); });
