/* NEW STAR — camada de dados offline-first
 * Cache local (localStorage) + fila de escrituras pendentes (outbox)
 * com sincronização automática ao voltar a conexão.
 * IDs são UUID gerados no cliente → escrever offline não gera conflito de chave. */
(function () {
  'use strict';
  const CFG = window.NS_CONFIG || {};
  const TABLES = ['representantes', 'clientes', 'visitas', 'pendencias', 'rotas',
    'pernoites', 'despesas', 'configuracoes', 'produtos', 'cliente_produtos',
    'pedidos', 'pedido_itens'];
  const PK = { configuracoes: 'chave' }; // demais: id
  const PULL_LIMIT = {
    visitas: 8000, pedidos: 3000, pedido_itens: 20000, rotas: 400,
    pernoites: 120, despesas: 3000, pendencias: 1000
  };

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

  // ---------- REST (PostgREST) ----------
  function configured() { return !!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY); }
  async function rest(path, opts) {
    opts = opts || {};
    const res = await fetch(CFG.SUPABASE_URL + '/rest/v1/' + path, {
      method: opts.method || 'GET',
      headers: Object.assign({
        apikey: CFG.SUPABASE_ANON_KEY,
        Authorization: 'Bearer ' + CFG.SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
        Prefer: opts.prefer || 'return=representation'
      }, opts.headers || {}),
      body: opts.body ? JSON.stringify(opts.body) : undefined
    });
    if (!res.ok) {
      const txt = await res.text();
      const err = new Error('Supabase ' + res.status + ': ' + txt.slice(0, 300));
      err.status = res.status;
      throw err;
    }
    if (res.status === 204) return null;
    const t = await res.text();
    return t ? JSON.parse(t) : null;
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
          if (op.method === 'POST')
            await rest(op.table, { method: 'POST', body: op.body, prefer: 'return=minimal,resolution=merge-duplicates' });
          else if (op.method === 'PATCH')
            await rest(op.table + '?' + op.match, { method: 'PATCH', body: op.body, prefer: 'return=minimal' });
          else if (op.method === 'DELETE')
            await rest(op.table + '?' + op.match, { method: 'DELETE', prefer: 'return=minimal' });
        } catch (e) {
          if (e.status && e.status >= 400 && e.status < 500) {
            // erro de dados: registrar e descartar para não travar a fila
            erros.push({ op, erro: String(e.message), em: new Date().toISOString() });
            lsSet('ns_sync_erros', erros.slice(-50));
          } else throw e; // rede/5xx: parar e tentar depois
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
      const lim = PULL_LIMIT[t];
      const order = (PK[t] || 'id') === 'id' && t !== 'configuracoes' ? '&order=created_at.desc' : '';
      const rows = await rest(t + '?select=*' + (order || '') + (lim ? '&limit=' + lim : ''));
      mem[t] = rows || []; save(t);
    }
    lsSet('ns_last_sync', Date.now());
    notify();
    return true;
  }

  // ---------- API pública ----------
  const DB = {
    uuid, configured, rest,
    all(table) { return load(table).slice(); },
    byId(table, id) {
      const pk = PK[table] || 'id';
      return load(table).find(r => r[pk] === id) || null;
    },
    insert(table, row) {
      const pk = PK[table] || 'id';
      if (pk === 'id' && !row.id) row.id = uuid();
      if (!row.created_at && table !== 'configuracoes' && table !== 'cliente_produtos') row.created_at = new Date().toISOString();
      load(table).unshift(row); save(table);
      queue({ table, method: 'POST', body: row });
      return row;
    },
    update(table, id, patch) {
      const pk = PK[table] || 'id';
      const arr = load(table);
      const r = arr.find(x => x[pk] === id);
      if (r) { Object.assign(r, patch); save(table); }
      queue({ table, method: 'PATCH', match: pk + '=eq.' + encodeURIComponent(id), body: patch });
      return r;
    },
    upsertConfig(chave, valor) {
      const arr = load('configuracoes');
      const r = arr.find(x => x.chave === chave);
      if (r) { r.valor = valor; save('configuracoes'); DB.update('configuracoes', chave, { valor }); }
      else DB.insert('configuracoes', { chave, valor });
    },
    remove(table, id) {
      const pk = PK[table] || 'id';
      mem[table] = load(table).filter(x => x[pk] !== id); save(table);
      queue({ table, method: 'DELETE', match: pk + '=eq.' + encodeURIComponent(id) });
    },
    removeWhere(table, match, predicate) { // match: query PostgREST; predicate: filtro local
      mem[table] = load(table).filter(r => !predicate(r)); save(table);
      queue({ table, method: 'DELETE', match });
    },
    config(chave, dft) {
      const r = load('configuracoes').find(x => x.chave === chave);
      return r ? r.valor : dft;
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
