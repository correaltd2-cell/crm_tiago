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
    'pedidos', 'pedido_itens'];
  const PK = { configuracoes: 'chave' }; // demais: id

  const mem = {}; // cache em memória (espelho do localStorage)

  function lsGet(k, dft) {
    try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : dft; }
    catch (e) { return dft; }
  }
  function lsSet(k, v) { localStorage.setItem(k, JSON.stringify(v)); }

  function load(table) {
    if (!mem[table]) mem[table] = lsGet('ns_c_' + table, []);
    return mem[table];
  }
  function save(table) { lsSet('ns_c_' + table, mem[table] || []); }

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
  // carga em lote (máx. 500 escritas por chamada) — usada na primeira instalação
  async function fsBatchSet(table, rows) {
    const pk = PK[table] || 'id';
    for (let i = 0; i < rows.length; i += 400) {
      const writes = rows.slice(i, i + 400).map(r => ({
        update: { name: docPath(table, r[pk]), fields: encFields(r) }
      }));
      await fs(':batchWrite', { method: 'POST', body: { writes } });
    }
  }

  // ---------- Outbox ----------
  let outbox = lsGet('ns_outbox', []);
  function queue(op) {
    op.opId = uuid(); op.ts = Date.now();
    outbox.push(op); lsSet('ns_outbox', outbox);
    notify(); trySync();
  }

  let syncing = false;
  const listeners = [];
  function notify() { listeners.forEach(fn => { try { fn(DB.status()); } catch (e) {} }); }

  async function trySync() {
    if (syncing || !navigator.onLine || !configured() || !outbox.length) { notify(); return; }
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
            lsSet('ns_sync_erros', erros.slice(-50));
          } else throw e; // rede/5xx/429: parar e tentar depois
        }
        outbox.shift(); lsSet('ns_outbox', outbox);
      }
      await pullAll();
    } catch (e) { /* offline ou instabilidade — fica na fila */ }
    syncing = false; notify();
  }

  async function pullAll() {
    if (!navigator.onLine || !configured()) return false;
    for (const t of TABLES) {
      mem[t] = await fsListAll(t); save(t);
    }
    lsSet('ns_last_sync', Date.now());
    notify();
    return true;
  }

  // ---------- API pública ----------
  const DB = {
    uuid, configured,
    all(table) { return load(table).slice(); },
    byId(table, id) {
      const pk = PK[table] || 'id';
      return load(table).find(r => r[pk] === id) || null;
    },
    insert(table, row) {
      const pk = PK[table] || 'id';
      if (!row[pk]) row[pk] = uuid();
      if (!row.criado_em && table !== 'configuracoes') row.criado_em = new Date().toISOString();
      load(table).unshift(row); save(table);
      queue({ table, method: 'set', docId: row[pk], body: Object.assign({}, row) });
      return row;
    },
    update(table, id, patch) {
      const pk = PK[table] || 'id';
      const arr = load(table);
      const r = arr.find(x => x[pk] === id);
      if (r) { Object.assign(r, patch); save(table); }
      queue({ table, method: 'patch', docId: id, body: patch });
      return r;
    },
    upsertConfig(chave, valor) {
      const arr = load('configuracoes');
      const r = arr.find(x => x.chave === chave);
      if (r) {
        r.valor = valor; save('configuracoes');
        queue({ table: 'configuracoes', method: 'patch', docId: chave, body: { valor } });
      } else DB.insert('configuracoes', { chave, valor });
    },
    remove(table, id) {
      const pk = PK[table] || 'id';
      mem[table] = load(table).filter(x => x[pk] !== id); save(table);
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
        erros: lsGet('ns_sync_erros', [])
      };
    },
    onStatus(fn) { listeners.push(fn); },
    sync: trySync, pullAll,
    clearErros() { lsSet('ns_sync_erros', []); notify(); }
  };

  window.addEventListener('online', trySync);
  setInterval(() => { if (outbox.length) trySync(); }, 30000);

  window.NSDB = DB;
})();
