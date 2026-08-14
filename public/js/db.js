/* NEW STAR — camada de dados offline-first sobre o FIRESTORE (REST v1)
 * Cache local (localStorage) + fila de escrituras pendentes (outbox)
 * com sincronização automática ao voltar a conexão.
 * IDs são gerados no cliente → escrever offline não gera conflito.
 * Toda a regra de negócio (comissão, conclusão de pedido, ciclo) roda
 * no app — o Firestore é o armazenamento sincronizado. */
(function () {
  'use strict';
  const CFG = window.NS_CONFIG || {};
  const TABLES = ['representantes', 'clientes', 'visitas', 'pendencias', 'rotas',
    'pernoites', 'despesas', 'configuracoes', 'produtos', 'cliente_produtos',
    'pedidos', 'pedido_itens', 'cliente_notas'];
  const PK = { configuracoes: 'chave' }; // demais: id

  const mem = {}; // cache em memória (espelho do localStorage)

  function lsGet(k, dft) {
    try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : dft; }
    catch (e) { return dft; }
  }
  function lsSet(k, v) { localStorage.setItem(k, JSON.stringify(v)); }
  // gravação de informação pequena (marcadores de sincronização): se o aparelho
  // estiver sem espaço não pode derrubar o resto do app
  function lsTenta(k, v) { try { lsSet(k, v); } catch (e) {} }

  // ---------- espaço no aparelho ----------
  // A assinatura é uma IMAGEM dentro do pedido e passa fácil de 100 KB. O
  // localStorage do iPhone tem cerca de 5 MB no total: com algumas dezenas de
  // pedidos assinados o espaço acabava, o gravador do cache passava a dar erro
  // ("The quota has been exceeded") e o app parava de atualizar os dados.
  // Agora o localStorage guarda SÓ TEXTO e as assinaturas vão para o
  // IndexedDB, que tem espaço de sobra.
  const TABELAS_COM_IMAGEM = { pedidos: true };
  const ehImagem = (v) => typeof v === 'string' && v.slice(0, 11) === 'data:image/';

  function semImagens(linhas) {
    let achou = false;
    const out = linhas.map(r => {
      let copia = null;
      for (const k in r) {
        if (!ehImagem(r[k])) continue;
        copia = copia || Object.assign({}, r);
        delete copia[k];
        achou = true;
      }
      return copia || r;
    });
    return achou ? out : linhas;
  }

  let liberando = false;
  // último recurso: reescreve os caches sem imagem nenhuma para destravar o
  // aparelho (as assinaturas continuam no IndexedDB e no servidor)
  function liberarEspaco() {
    if (liberando) return false;
    liberando = true;
    let mexeu = false;
    for (const t of TABLES) {
      try {
        const bruto = localStorage.getItem('ns_c_' + t);
        if (!bruto || bruto.indexOf('data:image/') < 0) continue;
        const linhas = mem[t] || lsGet('ns_c_' + t, []);
        try { lsSet('ns_c_' + t, semImagens(linhas)); }
        catch (e) { localStorage.removeItem('ns_c_' + t); }
        mexeu = true;
      } catch (e) {}
    }
    try { localStorage.removeItem('ns_sync_erros'); } catch (e) {}
    liberando = false;
    return mexeu;
  }

  function load(table) {
    if (!mem[table]) mem[table] = lsGet('ns_c_' + table, []);
    return mem[table];
  }
  function save(table) {
    const linhas = mem[table] || [];
    const paraDisco = TABELAS_COM_IMAGEM[table] ? semImagens(linhas) : linhas;
    if (TABELAS_COM_IMAGEM[table] && paraDisco !== linhas) guardarImagens(linhas);
    try { lsSet('ns_c_' + table, paraDisco); }
    catch (e) {
      if (!liberarEspaco()) throw e;
      lsSet('ns_c_' + table, paraDisco);
    }
  }

  // ---------- assinaturas em IndexedDB ----------
  const IDB_BANCO = 'ns_arquivos', IDB_LOJA = 'assinaturas';
  let idbAberto = null;
  function idbAbrir() {
    if (idbAberto) return idbAberto;
    idbAberto = new Promise((ok) => {
      try {
        if (!window.indexedDB) return ok(null);
        const req = indexedDB.open(IDB_BANCO, 1);
        req.onupgradeneeded = () => {
          const b = req.result;
          if (!b.objectStoreNames.contains(IDB_LOJA)) b.createObjectStore(IDB_LOJA);
        };
        req.onsuccess = () => ok(req.result);
        req.onerror = () => ok(null);
        req.onblocked = () => ok(null);
      } catch (e) { ok(null); }
    });
    return idbAberto;
  }
  function idbTx(modo, fn) {
    return idbAbrir().then((b) => {
      if (!b) return null;
      return new Promise((ok) => {
        try {
          const tx = b.transaction(IDB_LOJA, modo);
          const r = fn(tx.objectStore(IDB_LOJA));
          tx.oncomplete = () => ok(r && 'result' in r ? r.result : null);
          tx.onerror = () => ok(null);
          tx.onabort = () => ok(null);
        } catch (e) { ok(null); }
      });
    }).catch(() => null);
  }
  const jaGravadas = new Set();
  function guardarImagens(linhas) {
    for (const r of linhas) {
      if (!ehImagem(r.assinatura) || jaGravadas.has(r.id)) continue;
      jaGravadas.add(r.id);
      idbTx('readwrite', (loja) => loja.put(r.assinatura, r.id));
    }
  }
  function apagarImagem(id) {
    jaGravadas.delete(id);
    idbTx('readwrite', (loja) => loja.delete(id));
  }
  // na abertura do app, devolve as assinaturas guardadas para a memória
  function hidratarImagens() {
    return idbAbrir().then((b) => {
      if (!b) return;
      return new Promise((ok) => {
        const mapa = new Map();
        try {
          const tx = b.transaction(IDB_LOJA, 'readonly');
          const req = tx.objectStore(IDB_LOJA).openCursor();
          req.onsuccess = () => {
            const c = req.result;
            if (c) { mapa.set(c.key, c.value); c.continue(); }
          };
          tx.oncomplete = () => ok(mapa);
          tx.onerror = () => ok(mapa);
          tx.onabort = () => ok(mapa);
        } catch (e) { ok(mapa); }
      }).then((mapa) => {
        if (!mapa.size) return;
        mapa.forEach((_, k) => jaGravadas.add(k));
        const arr = load('pedidos');
        let mudou = false;
        for (const r of arr) {
          if (!ehImagem(r.assinatura) && mapa.has(r.id)) { r.assinatura = mapa.get(r.id); mudou = true; }
        }
        if (mudou) notify();
      });
    }).catch(() => {});
  }

  function uuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16);
    });
  }

  // ---------- Firestore REST ----------
  function configured() { return !!(CFG.FIREBASE_PROJECT_ID && CFG.FIREBASE_API_KEY); }
  const baseURL = () =>
    'https://firestore.googleapis.com/v1/projects/' + CFG.FIREBASE_PROJECT_ID +
    '/databases/(default)/documents';
  const docPath = (table, id) =>
    'projects/' + CFG.FIREBASE_PROJECT_ID + '/databases/(default)/documents/' +
    table + '/' + id;

  // JS ⇄ Firestore Value (datas ficam como string ISO)
  function enc(v) {
    if (v === null || v === undefined) return { nullValue: null };
    if (typeof v === 'boolean') return { booleanValue: v };
    if (typeof v === 'number')
      return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
    if (typeof v === 'string') return { stringValue: v };
    if (Array.isArray(v)) return { arrayValue: { values: v.map(enc) } };
    if (typeof v === 'object') return { mapValue: { fields: encFields(v) } };
    return { stringValue: String(v) };
  }
  function encFields(obj) {
    const f = {};
    for (const [k, v] of Object.entries(obj)) f[k] = enc(v);
    return f;
  }
  function dec(val) {
    if (!val) return null;
    if ('nullValue' in val) return null;
    if ('booleanValue' in val) return val.booleanValue;
    if ('integerValue' in val) return Number(val.integerValue);
    if ('doubleValue' in val) return val.doubleValue;
    if ('stringValue' in val) return val.stringValue;
    if ('timestampValue' in val) return val.timestampValue;
    if ('arrayValue' in val) return (val.arrayValue.values || []).map(dec);
    if ('mapValue' in val) return decFields(val.mapValue.fields || {});
    return null;
  }
  function decFields(fields) {
    const o = {};
    for (const [k, v] of Object.entries(fields || {})) o[k] = dec(v);
    return o;
  }

  async function fs(path, opts) {
    opts = opts || {};
    const sep = path.includes('?') ? '&' : '?';
    const res = await fetch(baseURL() + path + sep + 'key=' + encodeURIComponent(CFG.FIREBASE_API_KEY), {
      method: opts.method || 'GET',
      headers: { 'Content-Type': 'application/json' },
      body: opts.body ? JSON.stringify(opts.body) : undefined
    });
    if (!res.ok) {
      const txt = await res.text();
      const err = new Error('Firestore ' + res.status + ': ' + txt.slice(0, 300));
      err.status = res.status;
      throw err;
    }
    const t = await res.text();
    return t ? JSON.parse(t) : null;
  }

  async function fsListAll(table) {
    const pk = PK[table] || 'id';
    const rows = [];
    let pageToken = '';
    do {
      const r = await fs('/' + table + '?pageSize=300' + (pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : ''));
      for (const d of (r && r.documents) || []) {
        const row = decFields(d.fields);
        row[pk] = d.name.split('/').pop();
        rows.push(row);
      }
      pageToken = (r && r.nextPageToken) || '';
    } while (pageToken);
    return rows;
  }

  // set = PATCH sem updateMask (substitui/cria o doc inteiro) — idempotente no retry
  function fsSet(table, id, body) {
    return fs('/' + table + '/' + encodeURIComponent(id), { method: 'PATCH', body: { fields: encFields(body) } });
  }
  // patch = PATCH com updateMask (só os campos alterados; cria se não existir)
  function fsPatch(table, id, body) {
    const mask = Object.keys(body).map(k => 'updateMask.fieldPaths=' + encodeURIComponent(k)).join('&');
    return fs('/' + table + '/' + encodeURIComponent(id) + '?' + mask, { method: 'PATCH', body: { fields: encFields(body) } });
  }
  function fsDelete(table, id) {
    return fs('/' + table + '/' + encodeURIComponent(id), { method: 'DELETE' });
  }
  // carga em lote via :commit (máx. 500 escritas; :batchWrite exige IAM e
  // não funciona com regras + chave de API) — usada na primeira instalação
  async function fsBatchSet(table, rows) {
    const pk = PK[table] || 'id';
    for (let i = 0; i < rows.length; i += 400) {
      const writes = rows.slice(i, i + 400).map(r => ({
        update: { name: docPath(table, r[pk]), fields: encFields(r) }
      }));
      await fs(':commit', { method: 'POST', body: { writes } });
    }
  }

  // ---------- Outbox ----------
  let outbox = lsGet('ns_outbox', []);
  // a fila não pode se perder: se faltar espaço, libera o que dá e tenta de novo
  function gravarFila() {
    try { lsSet('ns_outbox', outbox); }
    catch (e) { if (liberarEspaco()) lsTenta('ns_outbox', outbox); }
  }
  function queue(op) {
    op.opId = uuid(); op.ts = Date.now();
    outbox.push(op); gravarFila();
    notify(); trySync();
  }

  let syncing = false;
  // o erro da última puxada também fica em MEMÓRIA: quando o aparelho está sem
  // espaço, nem o aviso conseguia ser gravado no localStorage e o app ficava
  // mudo justamente na hora em que mais precisava avisar
  let erroPuxada = lsGet('ns_pull_erro', null);
  const listeners = [];
  function notify() { listeners.forEach(fn => { try { fn(DB.status()); } catch (e) {} }); }

  // ---------- Puxada de dados (cota de leitura) ----------
  // O plano gratuito do Firestore dá 50 mil LEITURAS por dia. Baixar as 13
  // tabelas inteiras a cada volta ao app (são 300+ clientes, mais pedidos,
  // itens e visitas) gastava ~700 leituras por vez e estourava a cota antes do
  // fim do dia — o app ficava horas sem atualizar, sem avisar ninguém. Agora:
  //   • puxada COMPLETA: só quando o cache está vazio, no botão "Sincronizar
  //     agora" e uma vez a cada 12 h;
  //   • puxada INCREMENTAL: traz só o que mudou desde a última vez (campo
  //     atualizado_em), o que custa pouquíssimas leituras.
  const PULL_COMPLETO_MS = 12 * 3600000;
  const PULL_MIN_MS = 120000;   // nunca duas puxadas automáticas a menos de 2 min
  const FOLGA_RELOGIO_MS = 300000; // 5 min de folga: relógios de aparelhos diferentes
  let ultimaPuxada = 0;
  const PODE_PUXAR = () => Date.now() - ultimaPuxada > PULL_MIN_MS;
  const precisaCompleta = () =>
    !lsGet('ns_ultimo_pull_iso', null) ||
    Date.now() - Number(lsGet('ns_ultimo_pull_completo', 0)) > PULL_COMPLETO_MS;

  async function trySync(forcarPull, completa) {
    if (syncing || !navigator.onLine || !configured()) { notify(); return; }
    const vaiPuxar = (forcarPull && (completa || PODE_PUXAR()));
    if (!outbox.length && !vaiPuxar) { notify(); return; }
    syncing = true; notify();
    const erros = lsGet('ns_sync_erros', []);
    try {
      while (outbox.length) {
        const op = outbox[0];
        try {
          if (op.method === 'set') await fsSet(op.table, op.docId, op.body);
          else if (op.method === 'patch') await fsPatch(op.table, op.docId, op.body);
          else if (op.method === 'delete') await fsDelete(op.table, op.docId);
        } catch (e) {
          if (e.status && e.status >= 400 && e.status < 500 && e.status !== 429) {
            // erro de dados/permissão: registrar e descartar para não travar a fila
            erros.push({ op: { table: op.table, method: op.method, docId: op.docId }, erro: String(e.message), em: new Date().toISOString() });
            lsTenta('ns_sync_erros', erros.slice(-50));
          } else throw e; // rede/5xx/429: parar e tentar depois
        }
        outbox.shift(); gravarFila();
      }
    } catch (e) { /* offline ou instabilidade — fica na fila */ }
    if (vaiPuxar) {
      try {
        await pullAll({ completa: completa || precisaCompleta() });
      } catch (e) {
        // guardar o motivo: sem isso o app parecia "online e sincronizado"
        // enquanto na verdade não baixava nada havia horas
        // três motivos bem diferentes, e cada um pede uma explicação própria:
        // limite do banco, falta de espaço no aparelho, ou falha de rede
        const cota = e.status === 429;
        const semEspaco = !e.status && (e.name === 'QuotaExceededError' || e.code === 22 ||
          /quota/i.test(String(e.message || '')));
        erroPuxada = {
          em: Date.now(), cota, espaco: semEspaco,
          msg: cota ? 'Limite diário de leitura do banco atingido.'
            : semEspaco ? 'O armazenamento do aparelho ficou sem espaço.'
              : String(e.message || e).slice(0, 200)
        };
        lsTenta('ns_pull_erro', erroPuxada);
        // falha de rede/consulta: na próxima vez tenta a puxada completa, que
        // não depende da consulta incremental. (Cota e falta de espaço não —
        // insistir na puxada completa só gastaria mais leitura à toa.)
        if (!cota && !semEspaco) lsTenta('ns_ultimo_pull_completo', 0);
      }
    }
    syncing = false; notify();
  }

  // traz só os documentos alterados depois de `desdeISO`
  async function fsMudancasDesde(table, desdeISO) {
    const pk = PK[table] || 'id';
    const LIMITE = 300;
    const r = await fs(':runQuery', {
      method: 'POST', body: {
        structuredQuery: {
          from: [{ collectionId: table }],
          where: { fieldFilter: { field: { fieldPath: 'atualizado_em' }, op: 'GREATER_THAN', value: { stringValue: desdeISO } } },
          limit: LIMITE
        }
      }
    });
    const rows = [];
    for (const linha of (r || [])) {
      if (!linha.document) continue;
      const row = decFields(linha.document.fields);
      row[pk] = linha.document.name.split('/').pop();
      rows.push(row);
    }
    // veio cheio: mudou muita coisa, mais seguro baixar a tabela inteira
    if (rows.length >= LIMITE) return { rows: await fsListAll(table), completa: true };
    return { rows, completa: false };
  }

  function mesclar(table, rows) {
    if (!rows.length) return;
    const pk = PK[table] || 'id';
    const mapa = new Map(load(table).map(r => [r[pk], r]));
    for (const row of rows) mapa.set(row[pk], row);
    mem[table] = Array.from(mapa.values());
    save(table);
  }

  async function pullAll(opts) {
    if (!navigator.onLine || !configured()) return false;
    const completa = !opts || opts.completa !== false;
    const marca = new Date(Date.now() - FOLGA_RELOGIO_MS).toISOString();
    if (completa) {
      for (const t of TABLES) { mem[t] = await fsListAll(t); save(t); }
      lsTenta('ns_ultimo_pull_completo', Date.now());
    } else {
      const desde = lsGet('ns_ultimo_pull_iso', null);
      for (const t of TABLES) {
        const r = await fsMudancasDesde(t, desde);
        if (r.completa) { mem[t] = r.rows; save(t); } else mesclar(t, r.rows);
      }
    }
    ultimaPuxada = Date.now();
    lsTenta('ns_ultimo_pull_iso', marca);
    lsTenta('ns_last_sync', Date.now());
    erroPuxada = null;
    lsTenta('ns_pull_erro', null);
    notify();
    return true;
  }

  // ---------- API pública ----------
  const DB = {
    uuid, configured,
    // relê o cache do localStorage (outra janela do app pode ter gravado nele)
    recarregarCache() { for (const t of TABLES) delete mem[t]; },
    all(table) { return load(table).slice(); },
    byId(table, id) {
      const pk = PK[table] || 'id';
      return load(table).find(r => r[pk] === id) || null;
    },
    insert(table, row) {
      const pk = PK[table] || 'id';
      if (!row[pk]) row[pk] = uuid();
      if (!row.criado_em && table !== 'configuracoes') row.criado_em = new Date().toISOString();
      // carimbo usado pela puxada incremental (baixar só o que mudou)
      row.atualizado_em = new Date().toISOString();
      load(table).unshift(row); save(table);
      queue({ table, method: 'set', docId: row[pk], body: Object.assign({}, row) });
      return row;
    },
    update(table, id, patch) {
      const pk = PK[table] || 'id';
      const arr = load(table);
      patch = Object.assign({}, patch, { atualizado_em: new Date().toISOString() });
      const r = arr.find(x => x[pk] === id);
      if (r) { Object.assign(r, patch); save(table); }
      queue({ table, method: 'patch', docId: id, body: patch });
      return r;
    },
    upsertConfig(chave, valor) {
      const arr = load('configuracoes');
      const r = arr.find(x => x.chave === chave);
      if (r) {
        const em = new Date().toISOString();
        r.valor = valor; r.atualizado_em = em; save('configuracoes');
        queue({ table: 'configuracoes', method: 'patch', docId: chave, body: { valor, atualizado_em: em } });
      } else DB.insert('configuracoes', { chave, valor });
    },
    remove(table, id) {
      const pk = PK[table] || 'id';
      mem[table] = load(table).filter(x => x[pk] !== id); save(table);
      if (TABELAS_COM_IMAGEM[table]) apagarImagem(id);
      queue({ table, method: 'delete', docId: id });
    },
    removeWhere(table, predicate) {
      const pk = PK[table] || 'id';
      const alvo = load(table).filter(predicate);
      mem[table] = load(table).filter(r => !predicate(r)); save(table);
      for (const r of alvo) queue({ table, method: 'delete', docId: r[pk] });
    },
    config(chave, dft) {
      const r = load('configuracoes').find(x => x.chave === chave);
      return (r && r.valor !== undefined && r.valor !== null) ? r.valor : dft;
    },
    // Primeira instalação: grava usuários, 255 clientes, catálogo e
    // configurações no Firestore em lote (requer conexão)
    async seedInicial(seed) {
      if (!navigator.onLine || !configured()) throw new Error('Necessário estar online e configurado.');
      // trava de segurança: se o banco JÁ tem dados, nunca regravar por cima
      const jaInstalado = await fsListAll('representantes');
      if (jaInstalado.length) {
        await pullAll();
        throw new Error('O sistema JÁ ESTÁ INSTALADO — os dados foram baixados agora. É só fazer login.');
      }
      await fsBatchSet('representantes', seed.representantes);
      await fsBatchSet('produtos', seed.produtos);
      await fsBatchSet('configuracoes', seed.configuracoes);
      await fsBatchSet('clientes', seed.clientes);
      await pullAll();
    },
    status() {
      return {
        online: navigator.onLine, configured: configured(), syncing,
        pendentes: outbox.length,
        lastSync: lsGet('ns_last_sync', null),
        pullErro: erroPuxada,
        erros: lsGet('ns_sync_erros', [])
      };
    },
    onStatus(fn) { listeners.push(fn); },
    // sync() na abertura do app = leve (só o que mudou, respeitando o intervalo).
    // sync(true), do botão "Sincronizar agora", força a puxada completa.
    sync: (completa) => trySync(true, completa === true), pullAll,
    clearErros() { lsTenta('ns_sync_erros', []); notify(); }
  };

  // 1) devolve as assinaturas guardadas no IndexedDB para a memória;
  // 2) tira do localStorage qualquer imagem que tenha sobrado de versões
  //    antigas do app — é o que destrava o aparelho que já está sem espaço
  hidratarImagens().then(() => {
    try {
      const bruto = localStorage.getItem('ns_c_pedidos');
      if (bruto && bruto.indexOf('data:image/') >= 0) { load('pedidos'); save('pedidos'); }
    } catch (e) { liberarEspaco(); }
  });

  window.addEventListener('online', () => trySync(true));
  setInterval(() => { if (outbox.length) trySync(); }, 30000);
  // atualização periódica mesmo sem escrituras (novos dados de outros aparelhos)
  setInterval(() => { trySync(true); }, 3600000);
  // ao voltar para o app (troca de aba/celular desbloqueado), atualiza uma vez
  document.addEventListener('visibilitychange', () => { if (!document.hidden) trySync(true); });

  window.NSDB = DB;
})();
