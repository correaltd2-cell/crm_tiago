/* NEW STAR — app principal: login, Hoje (rota), clientes, pedidos, dashboard,
 * despesas e área administrativa do gestor. */
(function () {
  'use strict';
  const { $, $$, el, escH, toast, modal, confirmar, dataBR, hojeISO, mesISO, baixar } = window.NSUI;
  const C = window.NSCalc, DB = window.NSDB, R = window.NSRota;

  // ================= MARCA =================
  // Marca "Estrada da Estrela": a rota do vendedor termina na estrela
  const LOGO_SVG =
    '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
    '<defs><linearGradient id="nsgrad" x1="0" y1="0" x2="1" y2="1">' +
    '<stop offset="0" stop-color="var(--ouro-claro)"/><stop offset=".55" stop-color="var(--ouro)"/>' +
    '<stop offset="1" stop-color="var(--ouro-escuro)"/></linearGradient>' +
    '<linearGradient id="nsgrad2" x1="0" y1="1" x2="1" y2="0">' +
    '<stop offset="0" stop-color="var(--ouro-escuro)"/><stop offset=".55" stop-color="var(--ouro)"/>' +
    '<stop offset="1" stop-color="var(--ouro-claro)"/></linearGradient></defs>' +
    '<path d="M7.5 58.8 C26.3 53.8 31.3 43.8 33.5 31.3 L41.5 31.3 C37.5 50 30 57.5 14.8 62 Z" fill="url(#nsgrad2)"/>' +
    '<path d="M13.5 58.8 C29 52.5 33.5 43.8 37 31.5" fill="none" stroke="rgba(10,14,26,.55)" stroke-width="1.6" stroke-linecap="round" stroke-dasharray=".2 5.2"/>' +
    '<path d="M37.5 5 C39 16.3 43.8 21 54.8 22.5 C43.8 24 39 28.8 37.5 40 C36 28.8 31.3 24 20.3 22.5 C31.3 21 36 16.3 37.5 5 Z" fill="url(#nsgrad)"/>' +
    '<path d="M37.5 5 C38.6 13.5 41.8 18.3 49 21 C42.8 21.5 38.8 20.5 37.5 22.5 C36.3 20.5 32.3 21.5 26 21 C33.3 18.3 36.4 13.5 37.5 5 Z" fill="rgba(255,255,255,.32)"/>' +
    '<path d="M53.8 7.5 C54.3 11 55.8 12.5 59.3 13 C55.8 13.5 54.3 15 53.8 18.5 C53.3 15 51.8 13.5 48.3 13 C51.8 12.5 53.3 11 53.8 7.5 Z" fill="url(#nsgrad)" opacity=".85"/>' +
    '</svg>';
  function logoMarca(soIcone) {
    const { el } = window.NSUI;
    const span = el('span', { class: 'logo-mark', html: LOGO_SVG });
    if (!soIcone) span.appendChild(el('strong', null, 'New Star'));
    return span;
  }

  // ================= SESSÃO / LOGIN =================
  let session = JSON.parse(localStorage.getItem('ns_session') || 'null');
  let verRepId = localStorage.getItem('ns_ver_rep') || null; // seletor do gestor

  async function sha256(txt) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(txt));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  function sessao() {
    const eu = session ? DB.byId('representantes', session.repId) : null;
    if (!eu) return null;
    let rep = eu;
    if (eu.papel === 'gestor' && verRepId && verRepId !== 'todos')
      rep = DB.byId('representantes', verRepId) || eu;
    return { eu, rep, papel: eu.papel, consolidado: eu.papel === 'gestor' && verRepId === 'todos' };
  }

  async function telaLogin(msg) {
    const email = el('input', { class: 'input big', type: 'email', placeholder: 'E-mail', autocomplete: 'username' });
    const senha = el('input', { class: 'input big', type: 'password', placeholder: 'Senha', autocomplete: 'current-password' });
    const box = el('div', { class: 'login-box' },
      el('div', { class: 'login-logo', html: LOGO_SVG }),
      el('h1', null, 'New Star'),
      el('p', { class: 'login-tag' }, 'App do Vendedor'),
      msg ? el('p', { class: 'aviso' }, msg) : null,
      email, senha,
      el('button', { class: 'btn big w100 mt8', onclick: entrar }, 'Entrar'),
      (!DB.all('representantes').length && window.NS_SEED) ? el('button', {
        class: 'btn-link mt8', onclick: async (e) => {
          if (!navigator.onLine) return toast('Conecte-se à internet para a primeira instalação.', 'erro');
          e.currentTarget.disabled = true;
          toast('Carregando dados iniciais no Firestore…');
          try {
            await DB.seedInicial(window.NS_SEED);
            toast('✅ ' + DB.all('clientes').length + ' clientes, catálogo e usuários carregados. Faça o primeiro login.');
            telaLogin();
          } catch (err) { toast('Falha na instalação: ' + err.message, 'erro'); e.currentTarget.disabled = false; }
        }
      }, '⚙ Primeira instalação (carregar ' + window.NS_SEED.clientes.length + ' clientes + catálogo)') : null);
    $('#view').innerHTML = ''; $('#view').appendChild(box);
    $('#topbar').style.display = 'none'; $('#tabs').style.display = 'none'; $('#fab').style.display = 'none';

    async function entrar() {
      const em = email.value.trim().toLowerCase();
      if (!em || !senha.value) return toast('Informe e-mail e senha.', 'erro');
      if (!DB.all('representantes').length && navigator.onLine && DB.configured()) {
        try { await DB.pullAll(); } catch (e) {}
      }
      const rep = DB.all('representantes').find(r => (r.email || '').toLowerCase() === em && r.ativo !== false);
      if (!rep) return toast('Usuário não encontrado' + (navigator.onLine ? '.' : ' no cache offline — conecte uma vez.'), 'erro');
      if (rep.senha_hash === 'PLACEHOLDER' || rep.senha_hash === 'TROCAR_NA_TELA_DE_LOGIN') return definirSenha(rep, senha.value);
      const h = await sha256(senha.value);
      if (h !== rep.senha_hash) return toast('Senha incorreta.', 'erro');
      autenticar(rep);
    }

    function definirSenha(rep, senhaDigitada) {
      const s1 = el('input', { class: 'input big', type: 'password', placeholder: 'Nova senha (mín. 6)', value: senhaDigitada || '' });
      const s2 = el('input', { class: 'input big', type: 'password', placeholder: 'Repita a nova senha' });
      const m = modal(el('div', null,
        el('p', { class: 'sub mb12' }, 'Primeiro acesso de ' + rep.nome + ': defina sua senha.'),
        s1, el('div', { class: 'mt8' }, s2),
        el('button', {
          class: 'btn big w100 mt12', onclick: async () => {
            if (s1.value.length < 6) return toast('Senha muito curta (mínimo 6).', 'erro');
            if (s1.value !== s2.value) return toast('As senhas não conferem.', 'erro');
            DB.update('representantes', rep.id, { senha_hash: await sha256(s1.value) });
            m.fechar(); autenticar(rep);
          }
        }, 'Salvar senha e entrar')), { titulo: 'Definir senha' });
    }
  }

  function autenticar(rep) {
    session = { repId: rep.id };
    localStorage.setItem('ns_session', JSON.stringify(session));
    if (rep.papel === 'gestor' && !verRepId) {
      const v = DB.all('representantes').find(r => r.papel === 'vendedor' && r.ativo !== false);
      verRepId = v ? v.id : 'todos';
      localStorage.setItem('ns_ver_rep', verRepId);
    }
    iniciarApp();
  }

  function sair() {
    localStorage.removeItem('ns_session'); session = null;
    location.reload();
  }

  // ================= SHELL =================
  const VIEWS = { hoje: vHoje, clientes: vClientes, pedidos: vPedidos, dash: vDashboard, mais: vMais, ajuda: (v) => window.NSAjuda.view(v) };
  let viewAtual = 'hoje';

  function iniciarApp() {
    $('#topbar').style.display = ''; $('#tabs').style.display = ''; $('#fab').style.display = '';
    montarTopbar();
    nav(viewAtual);
    // sempre sincroniza (fila + download) ao abrir e re-renderiza com os dados novos
    if (navigator.onLine && DB.configured())
      Promise.resolve(DB.sync()).then(() => {
        if (!sessao()) return; // representante removido do servidor — mantém a tela atual
        montarTopbar(); nav(viewAtual);
      }).catch(() => {});
  }

  function montarTopbar() {
    const s = sessao();
    const top = $('#topbar');
    top.innerHTML = '';
    top.appendChild(el('div', { class: 'row space w100' },
      el('div', { class: 'row gap8' },
        logoMarca(),
        s.papel === 'gestor' ? seletorRep() : el('span', { class: 'sub' }, s.eu.nome)),
      el('button', { class: 'sync-chip', id: 'syncChip', onclick: mostrarSync }, '…')));
    atualizarSyncChip(DB.status());
  }

  function seletorRep() {
    const sel = el('select', {
      class: 'sel-rep', onchange: () => {
        verRepId = sel.value; localStorage.setItem('ns_ver_rep', verRepId); nav(viewAtual);
      }
    },
      el('option', { value: 'todos', selected: verRepId === 'todos' ? '' : null }, '👥 Todos (consolidado)'),
      DB.all('representantes').filter(r => r.papel === 'vendedor' && r.ativo !== false)
        .map(r => el('option', { value: r.id, selected: verRepId === r.id ? '' : null }, r.nome)));
    return sel;
  }

  function atualizarSyncChip(st) {
    const chip = $('#syncChip');
    if (!chip) return;
    if (!st.configured) { chip.textContent = '⚙ configurar'; chip.className = 'sync-chip erro'; }
    else if (!st.online) { chip.textContent = '📴 offline' + (st.pendentes ? ' · ' + st.pendentes : ''); chip.className = 'sync-chip off'; }
    else if (st.syncing) { chip.textContent = '🔄 sincronizando…'; chip.className = 'sync-chip'; }
    else if (st.pendentes) { chip.textContent = '⏳ ' + st.pendentes + ' pendente(s)'; chip.className = 'sync-chip off'; }
    else { chip.textContent = '✅ sincronizado'; chip.className = 'sync-chip ok'; }
  }
  DB.onStatus(atualizarSyncChip);

  function mostrarSync() {
    const st = DB.status();
    modal(el('div', null,
      el('p', null, st.online ? '🟢 Online' : '🔴 Offline — tudo continua funcionando; as alterações entram na fila.'),
      el('p', { class: 'sub mt4' }, 'Escrituras pendentes: ' + st.pendentes),
      st.lastSync ? el('p', { class: 'sub' }, 'Última sincronização: ' + new Date(st.lastSync).toLocaleString('pt-BR')) : null,
      st.erros.length ? el('div', { class: 'mt8' },
        el('strong', null, '⚠ ' + st.erros.length + ' erro(s) de sincronização'),
        el('div', { class: 'sub', style: 'max-height:120px;overflow:auto' },
          st.erros.map(e => el('div', null, e.erro))),
        el('button', { class: 'btn-link', onclick: () => { DB.clearErros(); } }, 'limpar erros')) : null,
      el('button', {
        class: 'btn w100 mt12', onclick: async () => { await DB.sync(); toast('Sincronização executada.'); }
      }, 'Sincronizar agora')), { titulo: 'Sincronização' });
  }

  function nav(v) {
    viewAtual = v;
    $$('#tabs button').forEach(b => b.classList.toggle('ativo', b.dataset.v === v));
    const view = $('#view');
    view.innerHTML = '';
    VIEWS[v](view);
    view.scrollTop = 0;
  }

  // ================= HELPERS DE DOMÍNIO =================
  function clientesDoRep(repId) {
    return DB.all('clientes').filter(c => c.status !== 'inativo' &&
      (!repId || c.representante_id === repId));
  }
  function repEfetivoId() {
    const s = sessao();
    return s.consolidado ? null : s.rep.id;
  }
  function alertasCiclo(repId) {
    const hoje = hojeISO();
    const avisoDias = Number(DB.config('alerta_vencendo_dias', 7));
    const out = { atrasados: [], vencendo: [] };
    for (const c of clientesDoRep(repId)) {
      if (!c.proxima_visita_prevista) continue;
      const dif = Math.round((new Date(c.proxima_visita_prevista) - new Date(hoje)) / 86400000);
      if (dif < 0) out.atrasados.push({ c, dias: -dif });
      else if (dif <= avisoDias) out.vencendo.push({ c, dias: dif });
    }
    out.atrasados.sort((a, b) => b.dias - a.dias);
    out.vencendo.sort((a, b) => a.dias - b.dias);
    return out;
  }
  function visitouHoje(clienteId) {
    return DB.all('visitas').find(v => v.cliente_id === clienteId && v.data_visita === hojeISO() && v.realizada);
  }

  // ================= VIEW: HOJE / PRÓXIMOS DIAS =================
  let diaOffset = 0; // 0 = hoje · 1..7 = próximos dias

  function addDias(iso, n) {
    const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  }
  function rotuloDia(off, iso) {
    if (off === 0) return 'Hoje';
    if (off === 1) return 'Amanhã';
    const d = new Date(iso + 'T12:00:00');
    return ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][d.getDay()] + ' ' + iso.slice(8, 10) + '/' + iso.slice(5, 7);
  }

  // Visão consolidada do gestor: rota do dia de TODOS os vendedores
  // (somente leitura — para agir, escolher o vendedor no topo)
  function vHojeConsolidado(view) {
    const hoje = hojeISO();
    const dataVista = addDias(hoje, diaOffset);
    const ehHoje = diaOffset === 0;
    const ciclo = C.cicloDoDia(dataVista, DB.config('ciclo_inicio', '2026-01-05'));
    view.appendChild(el('div', { class: 'dias-scroll' },
      Array.from({ length: 8 }, (_, off) => {
        const dISO = addDias(hoje, off);
        return el('button', {
          class: 'chip' + (off === diaOffset ? ' ativo' : ''),
          onclick: () => { diaOffset = off; nav('hoje'); }
        }, rotuloDia(off, dISO));
      })));
    view.appendChild(el('div', { class: 'row space mt8' },
      el('h2', null, (ehHoje ? 'Hoje' : rotuloDia(diaOffset, dataVista)) + ' · ' + dataBR(dataVista)),
      el('span', { class: 'badge' }, 'Semana ' + ciclo.semana + ' · ' +
        ['', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'][ciclo.diaSemana])));
    const visitou = (cid) => DB.all('visitas').find(v => v.cliente_id === cid && v.data_visita === dataVista && v.realizada);
    const reps = DB.all('representantes').filter(r => r.papel !== 'gestor' && r.ativo !== false);
    for (const rep of reps) {
      const doDiaTodos = clientesDoRep(rep.id).filter(c =>
        c.semana_padrao === ciclo.semana && C.mesmoDia(c.dia_semana_padrao, ciclo.diaSemana));
      const doDia = doDiaTodos.filter(c => !(c.ultima_visita_em && !visitou(c.id) &&
        (new Date(dataVista) - new Date(c.ultima_visita_em)) / 86400000 < Math.max(7, (c.frequencia_dias || 60) / 2)));
      const rotaSalva = DB.all('rotas').find(r => r.representante_id === rep.id && r.data_rota === dataVista);
      const listaIds = rotaSalva ? rotaSalva.sequencia.map(x => x.cliente_id) : doDia.map(c => c.id);
      const listaCls = listaIds.map(id => DB.byId('clientes', id)).filter(Boolean);
      doDia.forEach(c => { if (!listaCls.some(x => x.id === c.id)) listaCls.push(c); });
      const feitos = listaCls.filter(c => visitou(c.id)).length;
      view.appendChild(el('h3', { class: 'mt16' }, '🧑‍💼 ' + rep.nome +
        (listaCls.length ? ` — ${feitos}/${listaCls.length} visitados` : '')));
      if (rotaSalva)
        view.appendChild(el('div', { class: 'rota-info mt4' },
          `🛣 ${rotaSalva.distancia_total_km} km · ⏱ ~${Math.round(rotaSalva.tempo_total_min)} min` +
          (rotaSalva.fonte_matriz === 'google' ? ' · Google' : ' · estimado')));
      if (!listaCls.length) {
        view.appendChild(el('p', { class: 'vazio' }, 'Nenhum cliente programado para este dia.'));
        continue;
      }
      const listaEl = el('div', { class: 'col gap8 mt8' });
      listaCls.forEach((c, i) => {
        const v = visitou(c.id);
        const seqInfo = rotaSalva && rotaSalva.sequencia.find(x => x.cliente_id === c.id);
        listaEl.appendChild(el('div', {
          class: 'card-visita' + (v ? ' feito' : ''),
          onclick: () => fichaCliente(c.id)
        },
          el('div', { class: 'row space' },
            el('div', null,
              el('strong', null, `${i + 1}. ${c.nome}`),
              el('div', { class: 'sub' }, [c.cidade, c.uf].filter(Boolean).join(' - ') +
                (seqInfo && seqInfo.reencaixado ? ' · 🔁 reencaixado' : ''))),
            v ? el('span', { class: 'badge ok' }, '✅') : null)));
      });
      view.appendChild(listaEl);
    }
    view.appendChild(el('p', { class: 'sub mt12' },
      'Visão do gestor (somente leitura). Para otimizar a rota ou registrar visitas, escolha o vendedor no topo.'));
  }

  async function vHoje(view) {
    const s = sessao();
    if (s.consolidado) return vHojeConsolidado(view);
    const rep = s.rep;
    const hoje = hojeISO();
    const dataVista = addDias(hoje, diaOffset);
    const ehHoje = diaOffset === 0;
    const ciclo = C.cicloDoDia(dataVista, DB.config('ciclo_inicio', '2026-01-05'));
    const visitouEm = (cid, dia) => DB.all('visitas').find(v => v.cliente_id === cid && v.data_visita === dia && v.realizada);
    // atendido antecipadamente (há menos de meio ciclo) sai da lista do dia
    const atendidoRecente = (c) => c.ultima_visita_em && !visitouEm(c.id, dataVista) &&
      (new Date(dataVista) - new Date(c.ultima_visita_em)) / 86400000 < Math.max(7, (c.frequencia_dias || 60) / 2);
    const doDiaTodos = clientesDoRep(rep.id).filter(c =>
      c.semana_padrao === ciclo.semana && C.mesmoDia(c.dia_semana_padrao, ciclo.diaSemana));
    const doDia = doDiaTodos.filter(c => !atendidoRecente(c));
    const antecipados = doDiaTodos.length - doDia.length;
    const pendencias = DB.all('pendencias').filter(p => !p.resolvida_em &&
      (p.representante_id === rep.id || !p.representante_id));
    const pendentes = pendencias.map(p => DB.byId('clientes', p.cliente_id)).filter(Boolean)
      .filter(c => !doDia.some(d => d.id === c.id));
    const atrasados = alertasCiclo(rep.id).atrasados.map(a => a.c)
      .filter(c => !doDia.some(d => d.id === c.id) && !pendentes.some(pp => pp.id === c.id));

    // partida: pernoite da véspera > base do representante
    const vespera = addDias(dataVista, -1);
    const pernoite = DB.all('pernoites').find(p => p.representante_id === rep.id && p.data === vespera);
    const partida = pernoite
      ? { lat: pernoite.lat, lng: pernoite.lng, label: '📍 Pernoite: ' + (pernoite.local_desc || 'posição salva') }
      : (rep.lat_base != null ? { lat: rep.lat_base, lng: rep.lng_base, label: '🏠 Base: ' + (rep.cidade_base || '') } : null);

    const rotaSalva = DB.all('rotas').find(r => r.representante_id === rep.id && r.data_rota === dataVista);
    const visitou = (cid) => DB.all('visitas').find(v => v.cliente_id === cid && v.data_visita === dataVista && v.realizada);

    // seletor: hoje + próximos 7 dias
    view.appendChild(el('div', { class: 'dias-scroll' },
      Array.from({ length: 8 }, (_, off) => {
        const dISO = addDias(hoje, off);
        return el('button', {
          class: 'chip' + (off === diaOffset ? ' ativo' : ''),
          onclick: () => { diaOffset = off; nav('hoje'); }
        }, rotuloDia(off, dISO));
      })));

    view.appendChild(el('div', { class: 'row space mt8' },
      el('h2', null, (ehHoje ? 'Hoje' : rotuloDia(diaOffset, dataVista)) + ' · ' + dataBR(dataVista)),
      el('span', { class: 'badge' }, 'Semana ' + ciclo.semana + ' · ' +
        ['', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'][ciclo.diaSemana])));

    const listaIds = rotaSalva ? rotaSalva.sequencia.map(x => x.cliente_id) : doDia.map(c => c.id);
    const listaCls = listaIds.map(id => DB.byId('clientes', id)).filter(Boolean);
    doDia.forEach(c => { if (!listaCls.some(x => x.id === c.id)) listaCls.push(c); });

    if (ehHoje) {
      const feitos = listaCls.filter(c => visitou(c.id)).length;
      const pct = listaCls.length ? Math.round(feitos / listaCls.length * 100) : 0;
      view.appendChild(el('div', { class: 'progresso mt8' },
        el('div', { class: 'progresso-info' }, `${feitos} de ${listaCls.length} visitados · ${pct}%`),
        el('div', { class: 'progresso-barra' }, el('div', { class: 'progresso-fill', style: 'width:' + pct + '%' }))));
    }

    if (rotaSalva)
      view.appendChild(el('div', { class: 'rota-info mt8' },
        `🛣 ${rotaSalva.distancia_total_km} km · ⏱ ~${Math.round(rotaSalva.tempo_total_min)} min · 💰 ${C.fmtMoney(Number(rotaSalva.custo_estimado || 0))}` +
        (rotaSalva.fonte_matriz === 'google' ? ' · Google' : ' · estimado (offline)')));

    view.appendChild(el('div', { class: 'row gap8 mt8' },
      el('button', { class: 'btn grow', onclick: otimizar }, rotaSalva ? '🔄 Reotimizar rota' : '⚡ Otimizar rota'),
      ehHoje ? el('button', { class: 'btn btn-sec', onclick: estouAqui }, '📍 Estou aqui') : null));
    if (partida) view.appendChild(el('div', { class: 'sub mt4' }, 'Partida: ' + partida.label));
    if (pendentes.length || atrasados.length)
      view.appendChild(el('div', { class: 'sub mt4' },
        `Fila de reencaixe: ${pendentes.length} pendente(s), ${atrasados.length} atrasado(s) — entram na rota se o desvio compensar (prioridade A > B > C).`));
    if (antecipados)
      view.appendChild(el('div', { class: 'sub mt4' },
        `✅ ${antecipados} cliente(s) deste dia já foi(ram) atendido(s) antecipadamente e saiu(íram) da lista.`));

    const listaEl = el('div', { class: 'col gap8 mt12' });
    view.appendChild(listaEl);
    renderLista();

    function renderLista() {
      listaEl.innerHTML = '';
      if (!listaCls.length) {
        listaEl.appendChild(el('p', { class: 'vazio' }, ehHoje
          ? 'Nenhum cliente programado para hoje. 🎉'
          : 'Nenhum cliente programado para este dia.'));
        return;
      }
      listaCls.forEach((c, i) => {
        const v = ehHoje ? visitou(c.id) : null;
        const seqInfo = rotaSalva && rotaSalva.sequencia.find(x => x.cliente_id === c.id);
        listaEl.appendChild(el('div', { class: 'card-visita' + (v ? ' feito' : '') },
          el('div', { class: 'row space' },
            el('div', null,
              el('strong', null, `${i + 1}. ${c.nome}`),
              el('div', { class: 'sub' }, [c.endereco, c.cidade].filter(Boolean).join(' · ') +
                (seqInfo && seqInfo.reencaixado ? ' · 🔁 reencaixado' : '') +
                (c.geocoding_status !== 'preciso' ? ' · 📍' + c.geocoding_status : '')),
              (() => { const n = ultimaNota(c.id); return n ? el('div', { class: 'nota-previa' },
                '📝 ' + (n.length > 90 ? n.slice(0, 90) + '…' : n)) : null; })()),
            v ? el('span', { class: 'badge ok' }, v.fez_pedido ? '✅ pedido' : '✅ visitado') : null),
          el('div', { class: 'row gap8 mt8' },
            el('button', { class: 'btn-mini', onclick: () => abrirGPS(c) }, '🗺 GPS'),
            el('button', { class: 'btn-mini', onclick: () => fichaCliente(c.id) }, '👁 Ficha'),
            (ehHoje && !v) ? el('button', { class: 'btn-mini', onclick: () => window.NSPedido.novo(c) }, '🧾 Pedido') : null,
            (ehHoje && !v) ? el('button', { class: 'btn-mini', onclick: () => visitaSemPedido(c) }, '✔ Sem pedido') : null,
            (ehHoje && !v) ? el('button', { class: 'btn-mini vermelho', onclick: () => naoRealizada(c) }, '✖ Não realizada') : null)));
      });
    }

    async function otimizar() {
      const restantes = listaCls.filter(c => !visitou(c.id));
      if (!partida && !restantes.some(c => c.lat != null))
        return toast('Sem coordenadas: geocodifique os clientes (Mais → Geocodificar) e defina a base do representante.', 'erro');
      const start = partida || { lat: restantes.find(c => c.lat != null).lat, lng: restantes.find(c => c.lat != null).lng, label: '1º cliente' };
      toast('Calculando melhor sequência…');
      const rota = await R.montarRota({
        partida: start,
        fixos: doDia.filter(c => !visitou(c.id)),
        candidatos: pendentes.concat(atrasados),
        hojeISO: dataVista
      });
      R.salvarRota(rep.id, dataVista, rota, start);
      // sugestão de pernoite ao fim do dia visto
      const base = rep.lat_base != null ? { lat: rep.lat_base, lng: rep.lng_base } : null;
      if (base && rota.ultimoPonto) {
        const seguinteISO = addDias(dataVista, 1);
        const cicloSeg = C.cicloDoDia(seguinteISO, DB.config('ciclo_inicio', '2026-01-05'));
        const seguinte = clientesDoRep(rep.id).filter(c => c.semana_padrao === cicloSeg.semana && C.mesmoDia(c.dia_semana_padrao, cicloSeg.diaSemana) && c.lat != null)[0];
        const dec = C.decidirPernoite({
          ultimo: rota.ultimoPonto, base, primeiroAmanha: seguinte ? { lat: seguinte.lat, lng: seguinte.lng } : null,
          distMinKm: Number(DB.config('pernoite_dist_km', 150)),
          economiaMinKm: Number(DB.config('pernoite_economia_km', 60)),
          fator: Number(DB.config('haversine_fator', 1.3))
        });
        if (dec.sugerir)
          toast(`🛏 Sugestão: pernoitar na região (volta = ${Math.round(dec.dVolta)} km; economia ~${Math.round(dec.economia)} km).`);
      }
      nav('hoje');
    }

    function estouAqui() {
      if (!navigator.geolocation) return toast('GPS não disponível neste aparelho.', 'erro');
      toast('Obtendo posição…');
      navigator.geolocation.getCurrentPosition((pos) => {
        const existente = DB.all('pernoites').find(p => p.representante_id === rep.id && p.data === hoje);
        const body = { representante_id: rep.id, data: hoje, lat: pos.coords.latitude, lng: pos.coords.longitude, local_desc: 'GPS ' + new Date().toLocaleTimeString('pt-BR') };
        if (existente) DB.update('pernoites', existente.id, body); else DB.insert('pernoites', body);
        toast('📍 Posição salva! A rota de amanhã parte daqui.');
      }, () => toast('Não foi possível obter o GPS.', 'erro'), { enableHighAccuracy: true, timeout: 15000 });
    }

    function visitaSemPedido(c) {
      DB.insert('visitas', {
        cliente_id: c.id, representante_id: rep.id, data_visita: hoje,
        realizada: true, fez_pedido: false, valor_pedido: 0
      });
      espelharVisitaLocal(c);
      toast('Visita registrada (sem pedido).');
      nav('hoje');
    }

    function naoRealizada(c) {
      const motivos = [['fechado', '🚪 Fechado'], ['ausente', '👤 Responsável ausente'], ['sem_tempo', '⏰ Sem tempo'], ['reagendado', '📅 Reagendado']];
      const m = modal(el('div', { class: 'col gap8' },
        motivos.map(([val, rot]) => el('button', {
          class: 'btn btn-sec big', onclick: async () => {
            DB.insert('visitas', { cliente_id: c.id, representante_id: rep.id, data_visita: hoje, realizada: false, fez_pedido: false, motivo_falta: val, valor_pedido: 0 });
            DB.insert('pendencias', { cliente_id: c.id, representante_id: rep.id, motivo: val });
            m.fechar();
            toast(c.nome + ' entrou na fila de reencaixe. Recalculando a rota…');
            const idx = listaCls.findIndex(x => x.id === c.id);
            if (idx >= 0) listaCls.splice(idx, 1);
            await otimizar(); // rota recalculada inteira, não apenas anexada
          }
        }, rot))), { titulo: 'Por que não visitou ' + c.nome + '?' });
    }
  }

  function espelharVisitaLocal(c) {
    const d = new Date(hojeISO() + 'T12:00:00');
    d.setDate(d.getDate() + (c.frequencia_dias || 60));
    DB.update('clientes', c.id, { ultima_visita_em: hojeISO(), proxima_visita_prevista: d.toISOString().slice(0, 10) });
    DB.all('pendencias').filter(p => p.cliente_id === c.id && !p.resolvida_em)
      .forEach(p => DB.update('pendencias', p.id, { resolvida_em: new Date().toISOString() }));
  }

  function freqDaClasse(cl) {
    return Number(DB.config('freq_classe_' + cl.toLowerCase(), { A: 35, B: 60, C: 90, D: 120 }[cl] || 60));
  }
  function aplicarClasse(clienteId, cl) {
    const c = DB.byId('clientes', clienteId);
    if (!c) return;
    const freq = freqDaClasse(cl);
    const base = c.ultima_visita_em || c.ultimo_pedido_em;
    let prox = c.proxima_visita_prevista;
    if (base) {
      const d = new Date(base + 'T12:00:00'); d.setDate(d.getDate() + freq);
      prox = d.toISOString().slice(0, 10);
    }
    DB.update('clientes', clienteId, { classe: cl, frequencia_dias: freq, proxima_visita_prevista: prox });
    return freq;
  }

  function recalcularCicloCliente(clienteId) {
    const c = DB.byId('clientes', clienteId);
    if (!c) return;
    const vs = DB.all('visitas').filter(v => v.cliente_id === clienteId && v.realizada);
    const ult = vs.reduce((m, v) => (v.data_visita > m ? v.data_visita : m), '') || null;
    const ultPed = vs.filter(v => v.fez_pedido && Number(v.valor_pedido) > 0)
      .reduce((m, v) => (v.data_visita > m ? v.data_visita : m), '') || null;
    let prox = null;
    if (ult) { const d = new Date(ult + 'T12:00:00'); d.setDate(d.getDate() + (c.frequencia_dias || 60)); prox = d.toISOString().slice(0, 10); }
    DB.update('clientes', clienteId, { ultima_visita_em: ult, ultimo_pedido_em: ultPed, proxima_visita_prevista: prox });
  }

  function notasDoCliente(clienteId) {
    return DB.all('cliente_notas').filter(n => n.cliente_id === clienteId)
      .sort((a, b) => (b.criado_em || '').localeCompare(a.criado_em || ''));
  }
  function ultimaNota(clienteId) {
    const n = notasDoCliente(clienteId)[0];
    return n ? n.texto : null;
  }

  function abrirGPS(c) {
    const dest = (c.lat != null && c.geocoding_status !== 'falhou')
      ? c.lat + ',' + c.lng
      : encodeURIComponent(R.enderecoCompleto(c));
    window.open('https://www.google.com/maps/dir/?api=1&destination=' + dest, '_blank');
  }

  // ================= VIEW: CLIENTES (farol de prazo) =================
  // 🟢 dentro do prazo · 🟡 vence em até X dias · 🔴 visita atrasada · ⚪ sem visita registrada
  let filtroClientes = 'todos';

  function statusCliente(c, hoje, avisoDias) {
    if (!c.proxima_visita_prevista)
      return { k: 'cinza', dot: '⚪', rot: 'sem visita registrada', ordem: 3, sub: 9e9 };
    const dif = Math.round((new Date(c.proxima_visita_prevista) - new Date(hoje)) / 86400000);
    if (dif < 0) return { k: 'vermelho', dot: '🔴', rot: (-dif) + 'd atrasado', ordem: 0, sub: dif };
    if (dif <= avisoDias) return { k: 'amarelo', dot: '🟡', rot: 'vence em ' + dif + 'd', ordem: 1, sub: dif };
    return { k: 'verde', dot: '🟢', rot: 'em dia · próxima ' + dataBR(c.proxima_visita_prevista), ordem: 2, sub: dif };
  }

  function vClientes(view) {
    const repId = repEfetivoId();
    const hoje = hojeISO();
    const avisoDias = Number(DB.config('alerta_vencendo_dias', 7));
    const busca = el('input', { class: 'input big', placeholder: 'Buscar por CNPJ, nome ou cidade…', oninput: render });
    const chipsEl = el('div', { class: 'dias-scroll mt8' });
    const lista = el('div', { class: 'col gap8 mt8' });
    view.appendChild(el('h2', null, 'Clientes'));
    view.appendChild(el('div', { class: 'mt8' }, busca));
    view.appendChild(chipsEl);
    view.appendChild(lista);

    function render() {
      const q = busca.value.trim().toLowerCase();
      const qNum = q.replace(/\D/g, '');
      const todos = clientesDoRep(repId)
        .map(c => ({ c, st: statusCliente(c, hoje, avisoDias) }))
        .filter(({ c }) => {
          if (!q) return true;
          return (c.nome || '').toLowerCase().includes(q) || (c.cidade || '').toLowerCase().includes(q) ||
            (qNum && (c.cnpj_cpf || '').replace(/\D/g, '').includes(qNum));
        });
      const cont = { todos: todos.length, vermelho: 0, amarelo: 0, verde: 0, cinza: 0 };
      todos.forEach(({ st }) => cont[st.k]++);

      chipsEl.innerHTML = '';
      [['todos', 'Todos ' + cont.todos], ['vermelho', '🔴 Atrasados ' + cont.vermelho],
       ['amarelo', '🟡 Vencendo ' + cont.amarelo], ['verde', '🟢 Em dia ' + cont.verde],
       ['cinza', '⚪ Sem registro ' + cont.cinza]].forEach(([k, rot]) => {
        chipsEl.appendChild(el('button', {
          class: 'chip' + (filtroClientes === k ? ' ativo' : ''),
          onclick: () => { filtroClientes = k; render(); }
        }, rot));
      });

      // urgência primeiro: atrasados (mais atrasado no topo) → vencendo → em dia → sem registro
      const vis = todos
        .filter(({ st }) => filtroClientes === 'todos' || st.k === filtroClientes)
        .sort((a, b) => (a.st.ordem - b.st.ordem) || (a.st.sub - b.st.sub) ||
          (a.c.nome || '').localeCompare(b.c.nome || ''))
        .slice(0, 300);

      lista.innerHTML = '';
      for (const { c, st } of vis) {
        lista.appendChild(el('button', { class: 'item-lista st-' + st.k, onclick: () => fichaCliente(c.id) },
          el('div', { class: 'row space w100' },
            el('div', { class: 'row gap8' }, el('span', { class: 'st-dot' }, st.dot), el('strong', null, c.nome)),
            el('span', { class: 'badge ' + (st.k === 'vermelho' ? 'erro' : st.k === 'amarelo' ? 'aviso' : st.k === 'verde' ? 'ok' : '') },
              st.k === 'verde' ? 'em dia' : st.k === 'cinza' ? 'sem registro' : st.rot)),
          el('span', { class: 'sub' }, 'Classe ' + (c.classe || 'B') + ' · ' +
            [c.cidade, c.uf].filter(Boolean).join(' - ') +
            (c.rede ? ' · ' + c.rede : '') + ' · ciclo ' + (c.frequencia_dias || 60) + 'd' +
            (st.k === 'verde' || st.k === 'cinza' ? '' : ' · ' + st.rot))));
      }
      if (!vis.length) lista.appendChild(el('p', { class: 'vazio' }, 'Nenhum cliente neste filtro.'));
    }
    render();
  }

  function fichaCliente(id) {
    const c = DB.byId('clientes', id);
    if (!c) return;
    const s = sessao();
    const visitas = DB.all('visitas').filter(v => v.cliente_id === id)
      .sort((a, b) => (b.data_visita || '').localeCompare(a.data_visita || ''));
    const pedidos = DB.all('pedidos').filter(p => p.cliente_id === id && p.status === 'concluido')
      .sort((a, b) => (b.data_pedido || '').localeCompare(a.data_pedido || ''));
    const sug = c.frequencia_auto !== false ? C.sugestaoFrequencia(visitas, c.frequencia_dias || 49) : null;

    // linhas que trabalha (chips com toque)
    const minhas = new Set(DB.all('cliente_produtos').filter(cp => cp.cliente_id === id).map(cp => cp.produto_id));
    const porLinha = {};
    DB.all('produtos').filter(p => p.ativo !== false).forEach(p => {
      (porLinha[p.linha || 'Outros'] = porLinha[p.linha || 'Outros'] || []).push(p);
    });
    const linhasTrab = new Set(DB.all('produtos').filter(p => minhas.has(p.id)).map(p => p.linha || 'Outros'));
    const upsell = Object.keys(porLinha).filter(l => !linhasTrab.has(l));

    const chips = el('div', { class: 'chips mt4' },
      DB.all('produtos').filter(p => p.ativo !== false)
        .sort((a, b) => (a.linha || '').localeCompare(b.linha || ''))
        .map(p => el('button', {
          class: 'chip' + (minhas.has(p.id) ? ' ativo' : ''),
          onclick: (e) => {
            const btn = e.currentTarget;
            if (minhas.has(p.id)) {
              minhas.delete(p.id); btn.classList.remove('ativo');
              DB.removeWhere('cliente_produtos', (r) => r.cliente_id === id && r.produto_id === p.id);
            } else {
              minhas.add(p.id); btn.classList.add('ativo');
              DB.insert('cliente_produtos', { id: id + '_' + p.id, cliente_id: id, produto_id: p.id, representante_id: (c.representante_id || s.rep.id) });
            }
          }
        }, (p.codigo ? p.codigo + ' ' : '') + p.nome + (p.variacao ? ' (' + p.variacao + ')' : ''))));

    const dif = c.proxima_visita_prevista ? Math.round((new Date(c.proxima_visita_prevista) - new Date(hojeISO())) / 86400000) : null;

    modal(el('div', null,
      el('div', { class: 'sub' },
        (c.cnpj_cpf ? 'CNPJ ' + c.cnpj_cpf + ' · ' : '') + [c.endereco, c.bairro, c.cidade, c.uf].filter(Boolean).join(', ')),
      el('div', { class: 'sub mt4' },
        'Contato: ' + (c.contato || '—') + ' · ' + (c.telefone || c.celular || '—') +
        (c.rede ? ' · Rede ' + c.rede + (c.recebimento_dias ? ' (comissão +' + c.recebimento_dias + 'd)' : '') : '') +
        ' · Prazo: ' + (c.condicao_pagamento_padrao || 'a definir no 1º pedido')),
      el('div', { class: 'row gap8 mt8' },
        el('button', { class: 'btn-mini', onclick: () => abrirGPS(c) }, '🗺 GPS (' + c.geocoding_status + ')'),
        el('button', { class: 'btn-mini', onclick: () => window.NSPedido.novo(c) }, '🧾 Novo pedido'),
        s.papel === 'gestor' ? el('button', { class: 'btn-mini', onclick: () => editarCliente(c.id) }, '✏ Editar') : null),
      el('div', { class: 'row gap8 mt8' },
        el('span', { class: 'sub' }, 'Classe:'),
        ...['A', 'B', 'C', 'D'].map(cl => el('button', {
          class: 'btn-mini' + ((c.classe || 'B') === cl ? ' classe-ativa' : ''),
          onclick: (e) => {
            const freq = aplicarClasse(c.id, cl);
            e.currentTarget.parentElement.querySelectorAll('.btn-mini').forEach(b => b.classList.remove('classe-ativa'));
            e.currentTarget.classList.add('classe-ativa');
            toast(`Classe ${cl}: visita a cada ${freq} dias` + (cl === 'A' ? ' · prioridade máxima' : cl === 'C' || cl === 'D' ? ' · prioridade baixa no reencaixe' : ''));
          }
        }, cl + ' · ' + freqDaClasse(cl) + 'd'))),

      el('h4', { class: 'mt12' }, 'Ciclo de visitas'),
      el('div', { class: 'sub' },
        `A cada ${c.frequencia_dias || 49} dias · última: ${dataBR(c.ultima_visita_em)} · próxima: ${dataBR(c.proxima_visita_prevista)}` +
        (dif != null ? (dif < 0 ? ` · ⚠ ${-dif}d atrasado` : ` · vence em ${dif}d`) : '')),
      el('label', { class: 'row gap8 mt4 sub' },
        el('input', {
          type: 'checkbox', checked: c.frequencia_auto !== false ? '' : null,
          onchange: (e) => DB.update('clientes', c.id, { frequencia_auto: e.target.checked })
        }), 'Ajuste automático de frequência'),

      sug ? el('div', { class: 'sugestao mt8' },
        el('span', null, `💡 ${sug.motivo} — ${sug.tipo} ciclo para ${sug.para} dias?`),
        el('button', {
          class: 'btn-mini', onclick: (e) => {
            DB.update('clientes', c.id, { frequencia_dias: sug.para });
            e.currentTarget.closest('.sugestao').remove();
            toast('Ciclo ajustado para ' + sug.para + ' dias.');
          }
        }, 'Aceitar')) : null,

      el('h4', { class: 'mt12' }, 'Linhas que trabalha (toque para marcar)'),
      chips,
      upsell.length ? el('div', { class: 'sugestao mt8' },
        el('span', null, '🎯 Upsell: ainda não trabalha ' + upsell.join(', '))) : null,

      el('h4', { class: 'mt12' }, '📝 Observações internas'),
      el('p', { class: 'sub' }, 'Só a equipe vê — nunca sai no talão nem no PDF.'),
      (() => {
        const caixa = el('div', { class: 'col gap4 mt4' });
        const inp = el('input', { class: 'input grow', placeholder: 'Anotar algo sobre este cliente…' });
        const desenhar = () => {
          caixa.innerHTML = '';
          for (const n of notasDoCliente(id)) {
            caixa.appendChild(el('div', { class: 'hist-linha' },
              el('span', null, dataBR((n.criado_em || '').slice(0, 10)) + (n.autor ? ' · ' + n.autor : '') + ' — ' + n.texto),
              el('button', {
                class: 'btn-icon', onclick: async () => {
                  if (await confirmar('Excluir esta observação?')) { DB.remove('cliente_notas', n.id); desenhar(); }
                }
              }, '🗑')));
          }
          if (c.observacoes) caixa.appendChild(el('div', { class: 'hist-linha apagado' },
            el('span', null, '📄 ' + c.observacoes)));
          if (!caixa.children.length) caixa.appendChild(el('p', { class: 'vazio' }, 'Nenhuma observação ainda.'));
        };
        desenhar();
        return el('div', null, caixa,
          el('div', { class: 'row gap8 mt8' }, inp,
            el('button', {
              class: 'btn', onclick: () => {
                const t = inp.value.trim();
                if (!t) return;
                DB.insert('cliente_notas', {
                  cliente_id: id, representante_id: s.eu.id, autor: s.eu.nome, texto: t
                });
                inp.value = ''; desenhar(); toast('Observação salva.');
              }
            }, '➕')));
      })(),

      el('h4', { class: 'mt12' }, 'Histórico'),
      el('div', { class: 'col gap4' },
        visitas.slice(0, 12).map(v => {
          const ped = v.pedido_id ? DB.byId('pedidos', v.pedido_id) : null;
          return el('div', { class: 'hist-linha' + (v.realizada ? '' : ' apagado') },
            el('span', null, dataBR(v.data_visita) + ' · ' + (v.realizada
              ? (v.fez_pedido ? '🧾 pedido ' + C.fmtMoney(Number(v.valor_pedido)) +
                (v.comissao_pct ? ` (${v.comissao_pct}%)` : '') +
                (ped && (Number(ped.total_unid_dev_display) + Number(ped.total_unid_dev_quebrada)) > 0
                  ? ` · dev ${ped.total_unid_dev_display}+${ped.total_unid_dev_quebrada}q` : '')
                : 'visita sem pedido')
              : '✖ não realizada (' + (v.motivo_falta || '') + ')')),
            el('div', { class: 'row gap4' },
              ped ? el('button', { class: 'btn-link', onclick: () => window.NSPedido.abrir(ped.id) }, 'ver') : null,
              el('button', {
                class: 'btn-icon', onclick: async () => {
                  if (v.pedido_id) return toast('Esta visita tem pedido — exclua o pedido primeiro.', 'erro');
                  if (!(await confirmar('Excluir esta visita de ' + dataBR(v.data_visita) + '?'))) return;
                  DB.remove('visitas', v.id);
                  recalcularCicloCliente(id);
                  toast('Visita excluída.');
                  document.querySelector('.ns-overlay') && document.querySelector('.ns-overlay').remove();
                  fichaCliente(id);
                }
              }, '🗑')));
        }),
        !visitas.length ? el('p', { class: 'vazio' }, 'Sem visitas registradas.') : null)
    ), { titulo: c.nome });
  }

  // ================= VIEW: PEDIDOS =================
  function vPedidos(view) {
    const repId = repEfetivoId();
    const busca = el('input', { class: 'input big', placeholder: 'Buscar por cliente, nº ou data (aaaa-mm-dd)…', oninput: render });
    const lista = el('div', { class: 'col gap8 mt8' });
    view.appendChild(el('div', { class: 'row space' },
      el('h2', null, 'Pedidos'),
      el('button', { class: 'btn', onclick: () => window.NSPedido.novo() }, '+ Novo Pedido')));
    view.appendChild(el('div', { class: 'mt8' }, busca));
    view.appendChild(lista);

    function render() {
      const q = busca.value.trim().toLowerCase();
      lista.innerHTML = '';
      const peds = DB.all('pedidos')
        .filter(p => !repId || p.representante_id === repId)
        .filter(p => p.status !== 'cancelado')
        .filter(p => {
          if (!q) return true;
          const cli = DB.byId('clientes', p.cliente_id) || {};
          return (cli.nome || '').toLowerCase().includes(q) ||
            String(p.numero || '').includes(q) || (p.data_pedido || '').includes(q);
        })
        .sort((a, b) => (b.criado_em || '').localeCompare(a.criado_em || ''))
        .slice(0, 60);
      for (const p of peds) {
        const cli = DB.byId('clientes', p.cliente_id) || {};
        lista.appendChild(el('button', { class: 'item-lista', onclick: () => window.NSPedido.abrir(p.id) },
          el('div', { class: 'row space w100' },
            el('strong', null, 'Nº ' + (p.numero || '⏳') + ' · ' + (cli.nome || '—')),
            el('strong', null, C.fmtMoney(Number(p.total_valor)))),
          el('span', { class: 'sub' }, dataBR(p.data_pedido) + ' · ' + p.status +
            (p.assinatura ? ' · ✍ ' + (p.assinante_nome || 'assinado') : '') +
            ` · ${p.total_unid_vendidas} un vendidas`)));
      }
      if (!peds.length) lista.appendChild(el('p', { class: 'vazio' }, 'Nenhum pedido.'));
    }
    render();
  }

  // ================= VIEW: DASHBOARD =================
  function vDashboard(view) {
    const repId = repEfetivoId();
    const mes = mesISO();
    const noMes = (iso) => (iso || '').slice(0, 7) === mes;
    const doRep = (r) => !repId || r.representante_id === repId;

    const visitas = DB.all('visitas').filter(doRep);
    const vMes = visitas.filter(v => noMes(v.data_visita));
    const vHojeArr = visitas.filter(v => v.data_visita === hojeISO() && v.realizada);
    const realizadasMes = vMes.filter(v => v.realizada);
    const comPedido = realizadasMes.filter(v => v.fez_pedido);
    const faturamento = comPedido.reduce((s, v) => s + Number(v.valor_pedido || 0), 0);
    const comissaoGerada = vMes.reduce((s, v) => s + Number(v.comissao_valor || 0), 0);
    const aReceber = visitas.filter(v => noMes(v.comissao_recebimento_em))
      .reduce((s, v) => s + Number(v.comissao_valor || 0), 0);
    const despesas = DB.all('despesas').filter(doRep).filter(d => noMes(d.data_despesa));
    const totDesp = despesas.reduce((s, d) => s + Number(d.valor || 0), 0);
    const kmLanc = despesas.reduce((s, d) => s + Number(d.km_rodado || 0), 0);
    const kmRotas = DB.all('rotas').filter(doRep).filter(r => noMes(r.data_rota))
      .reduce((s, r) => s + Number(r.distancia_total_km || 0), 0);
    const conversao = realizadasMes.length ? Math.round(comPedido.length / realizadasMes.length * 100) : 0;
    const alertas = alertasCiclo(repId);
    const custoRealKm = kmLanc > 0 ? totDesp / kmLanc : null;

    const kpi = (rot, val, cls) => el('div', { class: 'kpi ' + (cls || '') },
      el('span', { class: 'kpi-rot' }, rot), el('strong', { class: 'kpi-val' }, val));

    view.appendChild(el('h2', null, 'Dashboard · ' + mes.split('-').reverse().join('/')));
    view.appendChild(el('div', { class: 'kpis mt8' },
      kpi('Faturamento (vendido)', C.fmtMoney(faturamento)),
      kpi('Comissão gerada', C.fmtMoney(comissaoGerada)),
      kpi('A receber no mês', C.fmtMoney(aReceber), 'destaque'),
      kpi('Despesas', C.fmtMoney(totDesp)),
      kpi('Líquido (comissão − despesas)', C.fmtMoney(comissaoGerada - totDesp), comissaoGerada - totDesp >= 0 ? 'ok' : 'erro'),
      kpi('Km rodado (rotas)', Math.round(kmRotas) + ' km'),
      kpi('Custo real por km', custoRealKm ? C.fmtMoney(custoRealKm) : '—'),
      kpi('Visitas hoje / mês', vHojeArr.length + ' / ' + realizadasMes.length),
      kpi('Conversão visitas→pedidos', conversao + '%'),
      kpi('Clientes ativos', String(clientesDoRep(repId).length)),
      kpi('Atrasados', String(alertas.atrasados.length), alertas.atrasados.length ? 'erro' : 'ok'),
      kpi('Vencendo', String(alertas.vencendo.length), alertas.vencendo.length ? 'aviso' : 'ok')));

    // Ranking de linhas mais vendidas no mês
    const pedMes = new Set(DB.all('pedidos').filter(doRep)
      .filter(p => p.status === 'concluido' && noMes(p.data_pedido)).map(p => p.id));
    const porLinha = {};
    DB.all('pedido_itens').filter(i => pedMes.has(i.pedido_id)).forEach(i => {
      const p = DB.byId('produtos', i.produto_id) || {};
      const l = p.linha || 'Outros';
      porLinha[l] = porLinha[l] || { un: 0, valor: 0 };
      porLinha[l].un += Number(i.unid_vendidas || 0);
      porLinha[l].valor += Number(i.valor_total || 0);
    });
    const ranking = Object.entries(porLinha).sort((a, b) => b[1].valor - a[1].valor);
    view.appendChild(el('h3', { class: 'mt16' }, 'Linhas mais vendidas no mês'));
    view.appendChild(el('div', { class: 'col gap4 mt8' },
      ranking.length ? ranking.map(([l, d], i) => el('div', { class: 'hist-linha' },
        el('span', null, `${i + 1}º ${l} — ${d.un} un`),
        el('strong', null, C.fmtMoney(d.valor))))
        : el('p', { class: 'vazio' }, 'Sem vendas no mês.')));

    // Alertas de ciclo clicáveis
    view.appendChild(el('h3', { class: 'mt16' }, 'Alertas de ciclo'));
    const alertasEl = el('div', { class: 'col gap4 mt8' });
    alertas.atrasados.slice(0, 20).forEach(a => alertasEl.appendChild(
      el('button', { class: 'item-lista compacto', onclick: () => fichaCliente(a.c.id) },
        el('span', null, '🔴 ' + a.c.nome), el('span', { class: 'sub' }, a.dias + 'd atrasado'))));
    alertas.vencendo.slice(0, 20).forEach(a => alertasEl.appendChild(
      el('button', { class: 'item-lista compacto', onclick: () => fichaCliente(a.c.id) },
        el('span', null, '🟡 ' + a.c.nome), el('span', { class: 'sub' }, 'vence em ' + a.dias + 'd'))));
    if (!alertas.atrasados.length && !alertas.vencendo.length)
      alertasEl.appendChild(el('p', { class: 'vazio' }, 'Nenhum alerta. 👌'));
    view.appendChild(alertasEl);
  }

  // ================= VIEW: MAIS (despesas + admin + config) =================
  function vMais(view) {
    const s = sessao();
    view.appendChild(el('h2', null, 'Mais'));
    const item = (rot, fn) => el('button', { class: 'item-lista mt8', onclick: fn }, el('strong', null, rot));
    view.appendChild(item('💰 Financeiro — comissões a receber e despesas', telaFinanceiro));
    view.appendChild(item('📍 Geocodificar clientes', telaGeocode));
    view.appendChild(item('🎨 Aparência (cores do app)', telaAparencia));
    if (s.papel === 'gestor') {
      view.appendChild(el('h3', { class: 'mt16' }, 'Administração'));
      view.appendChild(item('👥 Clientes (CRUD / Importar CSV / Exportar)', telaAdminClientes));
      view.appendChild(item('💍 Produtos e preços', telaAdminProdutos));
      view.appendChild(item('🧑‍💼 Vendedores', telaAdminVendedores));
      view.appendChild(item('⚙ Configurações', telaAdminConfig));
      view.appendChild(item('🗓 Redistribuir mês (virada de mês)', telaReplanejarMes));
    }
    view.appendChild(el('button', { class: 'btn-link mt16', onclick: sair }, 'Sair (' + s.eu.email + ')'));
    view.appendChild(el('p', { class: 'sub mt8' }, 'NEW STAR — App do Vendedor · offline-first · v1'));
  }

  // ---------- Financeiro: comissões a receber + despesas (inclusive futuras) ----------
  let mesFinOffset = 0;

  function mesISOoffset(off) {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + off);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }
  function rotuloMes(mes) {
    const [a, m] = mes.split('-');
    return ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho',
      'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'][Number(m)] + ' ' + a;
  }

  const CATS_FIN = {
    combustivel: '⛽ Combustível', pedagio: '🛣 Pedágio', hospedagem: '🛏 Hospedagem',
    alimentacao: '🍽 Alimentação', manutencao: '🔧 Manutenção',
    cartao_credito: '💳 Cartão de crédito', outro: '📦 Outro'
  };

  function telaFinanceiro() {
    const s = sessao();
    const repId = s.consolidado ? null : s.rep.id;
    const doRep = (r) => !repId || r.representante_id === repId;
    const wrap = el('div');
    const m = modal(wrap, { titulo: 'Financeiro', full: true });
    render();

    function comissoesDoMes(mes) {
      return DB.all('visitas').filter(doRep)
        .filter(v => (v.comissao_recebimento_em || '').slice(0, 7) === mes && Number(v.comissao_valor) !== 0)
        .sort((a, b) => (a.comissao_recebimento_em || '').localeCompare(b.comissao_recebimento_em || ''));
    }
    function despesasDoMes(mes) {
      return DB.all('despesas').filter(doRep)
        .filter(d => (d.data_despesa || '').slice(0, 7) === mes)
        .sort((a, b) => (b.data_despesa || '').localeCompare(a.data_despesa || ''));
    }

    function render() {
      wrap.innerHTML = '';
      const mes = mesISOoffset(mesFinOffset);
      const coms = comissoesDoMes(mes);
      const desps = despesasDoMes(mes);
      const totCom = coms.reduce((t, v) => t + Number(v.comissao_valor || 0), 0);
      const totDesp = desps.reduce((t, d) => t + Number(d.valor || 0), 0);
      const saldo = totCom - totDesp;

      // navegação de mês
      wrap.appendChild(el('div', { class: 'row space' },
        el('button', { class: 'btn-mini', onclick: () => { mesFinOffset--; render(); } }, '←'),
        el('h3', null, rotuloMes(mes) + (mesFinOffset === 0 ? ' · atual' : '')),
        el('button', { class: 'btn-mini', onclick: () => { mesFinOffset++; render(); } }, '→')));

      wrap.appendChild(el('div', { class: 'kpis mt8' },
        el('div', { class: 'kpi destaque' },
          el('span', { class: 'kpi-rot' }, 'Comissões a receber'),
          el('strong', { class: 'kpi-val' }, C.fmtMoney(totCom))),
        el('div', { class: 'kpi' },
          el('span', { class: 'kpi-rot' }, 'Despesas do mês'),
          el('strong', { class: 'kpi-val' }, C.fmtMoney(totDesp))),
        el('div', { class: 'kpi ' + (saldo >= 0 ? 'ok' : 'erro'), style: 'grid-column:1/-1' },
          el('span', { class: 'kpi-rot' }, 'Saldo projetado (comissões − despesas)'),
          el('strong', { class: 'kpi-val' }, C.fmtMoney(saldo)))));

      // visão dos próximos 6 meses
      wrap.appendChild(el('h4', { class: 'mt12' }, 'A receber nos próximos meses'));
      wrap.appendChild(el('div', { class: 'dias-scroll mt4' },
        Array.from({ length: 7 }, (_, i) => {
          const mIso = mesISOoffset(i);
          const tot = comissoesDoMes(mIso).reduce((t, v) => t + Number(v.comissao_valor || 0), 0);
          return el('button', {
            class: 'chip' + (mIso === mes ? ' ativo' : ''),
            onclick: () => { mesFinOffset = i; render(); }
          }, mIso.split('-').reverse().join('/') + ' · ' + C.fmtMoney(tot));
        })));

      // comissões detalhadas
      wrap.appendChild(el('h4', { class: 'mt12' }, `Comissões que caem em ${rotuloMes(mes)}`));
      wrap.appendChild(el('div', { class: 'col gap4 mt4' },
        coms.length ? coms.map(v => {
          const cli = DB.byId('clientes', v.cliente_id) || {};
          const clamed = Number(cli.recebimento_dias) > 0;
          return el('div', { class: 'hist-linha' },
            el('span', null, dataBR(v.comissao_recebimento_em) + ' · ' + (cli.nome || '—') +
              ' · venda ' + dataBR(v.data_visita) + ' (' + C.fmtMoney(Number(v.valor_pedido)) + ' × ' + v.comissao_pct + '%)' +
              (clamed ? ' · 🏷 ' + (cli.rede || 'prazo especial') : '')),
            el('strong', null, C.fmtMoney(Number(v.comissao_valor))));
        }) : el('p', { class: 'vazio' }, 'Nenhuma comissão prevista para este mês.')));

      // despesas
      wrap.appendChild(el('div', { class: 'row space mt12' },
        el('h4', null, 'Despesas de ' + rotuloMes(mes)),
        el('button', { class: 'btn', onclick: () => nova(mes) }, '+ Lançar despesa')));
      wrap.appendChild(el('div', { class: 'col gap4 mt4' },
        desps.length ? desps.map(d => el('div', { class: 'hist-linha' },
          el('span', null, dataBR(d.data_despesa) + ' · ' + (CATS_FIN[d.tipo] || d.tipo) +
            (d.km_rodado ? ' · ' + d.km_rodado + ' km' : '') + (d.descricao ? ' · ' + d.descricao : '')),
          el('div', { class: 'row gap8' },
            el('strong', null, C.fmtMoney(Number(d.valor))),
            el('button', { class: 'btn-icon', onclick: async () => { if (await confirmar('Excluir lançamento?')) { DB.remove('despesas', d.id); render(); } } }, '🗑'))))
          : el('p', { class: 'vazio' }, 'Sem despesas lançadas neste mês.')));
    }

    function nova(mes) {
      const hojeMes = mesISOoffset(0);
      const dataPadrao = mes === hojeMes ? hojeISO() : mes + '-01';
      const cat = el('select', { class: 'input big' }, Object.entries(CATS_FIN).map(([v, r2]) => el('option', { value: v }, r2)));
      const val = el('input', { class: 'input big', type: 'number', step: '0.01', inputmode: 'decimal', placeholder: 'Valor (R$)' });
      const km = el('input', { class: 'input big', type: 'number', step: '1', inputmode: 'numeric', placeholder: 'Km rodado (opcional)' });
      const dt = el('input', { class: 'input big', type: 'date', value: dataPadrao });
      const obs = el('input', { class: 'input big', placeholder: 'Descrição (ex.: fatura do cartão, parcela…)' });
      const mm = modal(el('div', { class: 'col gap8' },
        el('p', { class: 'sub' }, 'Pode lançar em qualquer mês — inclusive futuros (contas a pagar).'),
        cat, val, km, dt, obs,
        el('button', {
          class: 'btn big w100', onclick: () => {
            if (!Number(val.value)) return toast('Informe o valor.', 'erro');
            if (!dt.value) return toast('Informe a data.', 'erro');
            DB.insert('despesas', {
              representante_id: repId || s.rep.id, data_despesa: dt.value, tipo: cat.value,
              valor: Number(val.value), km_rodado: km.value ? Number(km.value) : null, descricao: obs.value || null
            });
            mm.fechar(); render();
          }
        }, 'Salvar')), { titulo: 'Nova despesa' });
    }
  }

  // ---------- Geocodificação em massa ----------
  function telaGeocode() {
    const repId = repEfetivoId();
    const pend = clientesDoRep(repId).filter(c => c.geocoding_status === 'pendente' || c.geocoding_status === 'falhou' || c.lat == null);
    const info = el('p', { class: 'sub mt8' }, pend.length + ' cliente(s) sem coordenada precisa.');
    const barra = el('div', { class: 'sub mt8' });
    const m = modal(el('div', null,
      el('p', null, 'Geocodifica pelo endereço completo via Google (status por cliente: preciso / aproximado / falhou).'),
      info, barra,
      el('button', {
        class: 'btn big w100 mt12', onclick: async (e) => {
          if (!DB.config('google_maps_key', '')) return toast('Configure a chave do Google Maps em Admin → Configurações.', 'erro');
          if (!navigator.onLine) return toast('Necessário estar online.', 'erro');
          e.currentTarget.disabled = true;
          const n = await R.geocodificarPendentes(pend, (f, t) => { barra.textContent = f + ' / ' + t + ' processados…'; });
          toast(n + ' cliente(s) geocodificado(s).');
          m.fechar();
        }
      }, '🌍 Geocodificar pendentes')), { titulo: 'Geocodificação em massa' });
  }

  // ---------- Admin: Clientes ----------
  const CAMPOS_CLIENTE = ['nome', 'razao_social', 'cnpj_cpf', 'inscricao_estadual', 'contato', 'email', 'telefone', 'celular',
    'endereco', 'bairro', 'cidade', 'uf', 'cep', 'rede', 'semana_padrao', 'dia_semana_padrao', 'frequencia_dias'];

  function telaAdminClientes() {
    const wrap = el('div');
    const m = modal(wrap, { titulo: 'Admin · Clientes', full: true });
    render();
    function render() {
      wrap.innerHTML = '';
      const busca = el('input', { class: 'input big', placeholder: 'Buscar…', oninput: lista });
      const listaEl = el('div', { class: 'col gap4 mt8' });
      wrap.appendChild(el('div', { class: 'row gap8' },
        el('button', { class: 'btn grow', onclick: () => editarCliente(null, render) }, '+ Novo'),
        el('button', { class: 'btn btn-sec grow', onclick: importarCSV }, '⬆ Importar CSV'),
        el('button', { class: 'btn btn-sec grow', onclick: exportarCSV }, '⬇ Exportar')));
      wrap.appendChild(el('div', { class: 'mt8' }, busca));
      wrap.appendChild(listaEl);
      function lista() {
        const q = busca.value.trim().toLowerCase();
        listaEl.innerHTML = '';
        DB.all('clientes').filter(c => !q || (c.nome || '').toLowerCase().includes(q) || (c.cidade || '').toLowerCase().includes(q))
          .sort((a, b) => (a.nome || '').localeCompare(b.nome || '')).slice(0, 100)
          .forEach(c => listaEl.appendChild(el('div', { class: 'hist-linha' },
            el('span', null, (c.status === 'inativo' ? '🚫 ' : '') + c.nome + ' · ' + (c.cidade || '') +
              ' · S' + (c.semana_padrao || '?') + 'D' + (c.dia_semana_padrao || '?')),
            el('button', { class: 'btn-link', onclick: () => editarCliente(c.id, render) }, 'editar'))));
      }
      lista();
    }
    function exportarCSV() {
      const linhas = [CAMPOS_CLIENTE.concat(['recebimento_dias', 'geocoding_status', 'ultima_visita_em', 'proxima_visita_prevista'])];
      DB.all('clientes').forEach(c => linhas.push(linhas[0].map(k => c[k])));
      baixar(new Blob(['﻿' + C.toCSV(linhas)], { type: 'text/csv;charset=utf-8' }), 'clientes-newstar.csv');
    }
    function importarCSV() {
      const file = el('input', { type: 'file', accept: '.csv,text/csv', class: 'input big' });
      const mm = modal(el('div', null,
        el('p', { class: 'sub' }, 'CSV com cabeçalho (separador ; ou ,). Na próxima tela você mapeia as colunas.'),
        el('div', { class: 'mt8' }, file)), { titulo: 'Importar CSV' });
      file.addEventListener('change', () => {
        const f = file.files[0];
        if (!f) return;
        const reader = new FileReader();
        reader.onload = () => { mm.fechar(); mapear(C.parseCSV(String(reader.result))); };
        reader.readAsText(f, 'utf-8');
      });
    }
    function mapear(linhas) {
      if (linhas.length < 2) return toast('CSV vazio.', 'erro');
      const header = linhas[0];
      const sels = CAMPOS_CLIENTE.map(campo => {
        const auto = header.findIndex(h2 => h2.trim().toLowerCase().replace(/\s/g, '_') === campo ||
          h2.trim().toLowerCase().includes(campo.replace(/_/g, ' ')));
        return el('select', { class: 'input', 'data-campo': campo },
          el('option', { value: '-1' }, '(ignorar)'),
          header.map((h2, i) => el('option', { value: String(i), selected: i === auto ? '' : null }, h2)));
      });
      const repSel = el('select', { class: 'input big' },
        DB.all('representantes').filter(r => r.papel === 'vendedor').map(r => el('option', { value: r.id }, 'Atribuir a: ' + r.nome)));
      const mm = modal(el('div', null,
        el('p', { class: 'sub' }, linhas.length - 1 + ' linha(s). Mapeie as colunas:'),
        repSel,
        el('div', { class: 'col gap4 mt8' },
          CAMPOS_CLIENTE.map((campo, i) => el('div', { class: 'row space gap8' },
            el('span', { class: 'sub', style: 'min-width:130px' }, campo), sels[i]))),
        el('button', {
          class: 'btn big w100 mt12', onclick: () => {
            let n = 0;
            for (const linha of linhas.slice(1)) {
              const row = { representante_id: repSel.value, status: 'ativo', geocoding_status: 'pendente' };
              CAMPOS_CLIENTE.forEach((campo, i) => {
                const idx = Number(sels[i].value);
                if (idx >= 0 && linha[idx] != null && String(linha[idx]).trim() !== '') {
                  let v = String(linha[idx]).trim();
                  if (['semana_padrao', 'frequencia_dias'].includes(campo)) v = parseInt(v, 10) || null;
                  row[campo] = v;
                }
              });
              if (!row.nome || !row.cidade || !row.uf) continue; // cidade/uf são not null no schema
              if (row.rede && String(row.rede).toUpperCase().includes('CLAMED')) row.recebimento_dias = 45;
              DB.insert('clientes', row); n++;
            }
            mm.fechar(); toast(n + ' cliente(s) importado(s).'); render();
          }
        }, 'Importar')), { titulo: 'Mapeamento de colunas', full: true });
    }
  }

  function editarCliente(id, aoSalvar) {
    const c = id ? DB.byId('clientes', id) : {};
    const campos = {};
    const inp = (campo, rot, tipo) => {
      campos[campo] = el('input', { class: 'input', type: tipo || 'text', value: c[campo] != null ? c[campo] : '', placeholder: rot });
      return el('label', { class: 'campo' }, el('span', { class: 'sub' }, rot), campos[campo]);
    };
    const repSel = el('select', { class: 'input' },
      DB.all('representantes').filter(r => r.papel === 'vendedor')
        .map(r => el('option', { value: r.id, selected: c.representante_id === r.id ? '' : null }, r.nome)));
    const diaSel = el('select', { class: 'input' },
      el('option', { value: '' }, '(sem dia fixo)'),
      C.DIAS_SEMANA.slice(1, 7).map(d => el('option', { value: d, selected: C.normDia(c.dia_semana_padrao) === C.normDia(d) ? '' : null }, d)));
    const statusSel = el('select', { class: 'input' },
      ['ativo', 'prospect', 'inativo'].map(st => el('option', { value: st, selected: (c.status || 'ativo') === st ? '' : null }, st)));
    const classeSel = el('select', { class: 'input' },
      [['A', 'A — prioridade máxima (35d)'], ['B', 'B — normal (60d)'], ['C', 'C — baixa (90d)'], ['D', 'D — mínima (120d; reencaixa por último)']]
        .map(([v, r]) => el('option', { value: v, selected: (c.classe || 'B') === v ? '' : null }, r)));
    const mm = modal(el('div', { class: 'col gap8' },
      inp('nome', 'Nome *'), inp('razao_social', 'Razão social'), inp('cnpj_cpf', 'CNPJ/CPF'),
      inp('inscricao_estadual', 'Inscrição Estadual'),
      inp('contato', 'Contato'), inp('email', 'E-mail', 'email'), inp('telefone', 'Telefone'), inp('celular', 'Celular'),
      inp('endereco', 'Endereço'), inp('bairro', 'Bairro'), inp('cidade', 'Cidade *'), inp('uf', 'UF *'), inp('cep', 'CEP'),
      inp('rede', 'Rede (ex.: Clamed)'), inp('recebimento_dias', 'Prazo comissão (dias — Clamed = 45)', 'number'),
      inp('condicao_pagamento_padrao', 'Prazo de pagamento deste cliente (ex.: 30 dias)'),
      inp('semana_padrao', 'Semana do ciclo (1-7)', 'number'),
      el('label', { class: 'campo' }, el('span', { class: 'sub' }, 'Dia da semana'), diaSel),
      inp('frequencia_dias', 'Frequência (dias)', 'number'),
      el('label', { class: 'campo' }, el('span', { class: 'sub' }, 'Representante'), repSel),
      el('label', { class: 'campo' }, el('span', { class: 'sub' }, 'Status'), statusSel),
      el('label', { class: 'campo' }, el('span', { class: 'sub' }, 'Classe (A/B/C)'), classeSel),
      el('button', {
        class: 'btn big w100', onclick: () => {
          if (!campos.nome.value.trim()) return toast('Nome é obrigatório.', 'erro');
          if (!campos.cidade.value.trim() || !campos.uf.value.trim()) return toast('Cidade e UF são obrigatórios.', 'erro');
          const body = { representante_id: repSel.value, status: statusSel.value, dia_semana_padrao: diaSel.value || null, classe: classeSel.value };
          for (const [k, elInp] of Object.entries(campos)) {
            let v = elInp.value.trim();
            if (['semana_padrao', 'frequencia_dias', 'recebimento_dias'].includes(k))
              v = v === '' ? null : parseInt(v, 10);
            body[k] = v === '' ? null : v;
          }
          if (body.rede && String(body.rede).toUpperCase().includes('CLAMED') && !body.recebimento_dias)
            body.recebimento_dias = 45;
          if (body.frequencia_dias == null) body.frequencia_dias = 60;
          if (body.recebimento_dias == null) body.recebimento_dias = 0;
          const antigo = id ? DB.byId('clientes', id) : null;
          if (antigo && (antigo.endereco !== body.endereco || antigo.cidade !== body.cidade || antigo.cep !== body.cep))
            body.geocoding_status = 'pendente';
          if (id) DB.update('clientes', id, body); else DB.insert('clientes', body);
          mm.fechar(); toast('Cliente salvo.');
          if (aoSalvar) aoSalvar();
        }
      }, 'Salvar'),
      id ? el('button', {
        class: 'btn-link', style: 'color:#ef7076', onclick: async () => {
          const nPed = DB.all('pedidos').filter(p => p.cliente_id === id && p.status !== 'cancelado').length;
          if (nPed) return toast(`Cliente tem ${nPed} pedido(s) no histórico — use o status "inativo" para preservar os registros.`, 'erro');
          if (!(await confirmar('Excluir DEFINITIVAMENTE o cliente "' + (c.nome || '') + '"? Visitas e pendências dele também serão removidas.'))) return;
          DB.removeWhere('visitas', (v) => v.cliente_id === id);
          DB.removeWhere('pendencias', (p) => p.cliente_id === id);
          DB.removeWhere('cliente_produtos', (cp) => cp.cliente_id === id);
          DB.remove('clientes', id);
          mm.fechar(); toast('Cliente excluído.');
          if (aoSalvar) aoSalvar();
        }
      }, '🗑 Excluir cliente') : null), { titulo: id ? 'Editar cliente' : 'Novo cliente', full: true });
  }

  // ---------- Admin: Produtos ----------
  function telaAdminProdutos() {
    const wrap = el('div');
    const m = modal(wrap, { titulo: 'Admin · Produtos e preços', full: true });
    render();
    function render() {
      wrap.innerHTML = '';
      wrap.appendChild(el('button', { class: 'btn w100', onclick: () => editar(null) }, '+ Novo produto'));
      wrap.appendChild(el('div', { class: 'col gap4 mt8' },
        DB.all('produtos').sort((a, b) => (a.codigo || '').localeCompare(b.codigo || ''))
          .map(p => el('div', { class: 'hist-linha' },
            el('span', null, (p.ativo === false ? '🚫 ' : '') + (p.codigo || '') + ' · ' + p.nome +
              (p.variacao ? ' (' + p.variacao + ')' : '') +
              ` · P=${p.unid_placa_p} G=${p.unid_placa_g} · ` +
              (p.preco_simples != null ? C.fmtMoney(Number(p.preco_simples)) : '⚠ sem preço') + ' / ' +
              (p.preco_lucro != null ? C.fmtMoney(Number(p.preco_lucro)) : '⚠ sem preço')),
            el('button', { class: 'btn-link', onclick: () => editar(p) }, 'editar')))));
    }
    function editar(p) {
      p = p || {};
      const f = {};
      const inp = (k, rot, tipo, step) => {
        f[k] = el('input', { class: 'input', type: tipo || 'text', step: step || null, value: p[k] != null ? p[k] : '', placeholder: rot });
        return el('label', { class: 'campo' }, el('span', { class: 'sub' }, rot), f[k]);
      };
      const ativo = el('input', { type: 'checkbox', checked: p.ativo !== false ? '' : null });
      const mm = modal(el('div', { class: 'col gap8' },
        inp('codigo', 'Código'), inp('nome', 'Nome *'), inp('variacao', 'Variação'), inp('linha', 'Linha de produto'),
        inp('preco_simples', 'Preço Tabela Simples', 'number', '0.01'),
        inp('preco_lucro', 'Preço Lucro Presumido', 'number', '0.01'),
        inp('unid_placa_p', 'Unidades placa P *', 'number'), inp('unid_placa_g', 'Unidades placa G *', 'number'),
        el('label', { class: 'row gap8' }, ativo, 'Ativo'),
        el('button', {
          class: 'btn big w100', onclick: () => {
            if (!f.nome.value.trim() || !f.unid_placa_p.value || !f.unid_placa_g.value)
              return toast('Nome e unidades por placa são obrigatórios.', 'erro');
            const body = {
              codigo: f.codigo.value.trim() || null, nome: f.nome.value.trim(),
              variacao: f.variacao.value.trim() || null, linha: f.linha.value.trim() || null,
              preco_simples: f.preco_simples.value === '' ? null : Number(f.preco_simples.value),
              preco_lucro: f.preco_lucro.value === '' ? null : Number(f.preco_lucro.value),
              unid_placa_p: parseInt(f.unid_placa_p.value, 10), unid_placa_g: parseInt(f.unid_placa_g.value, 10),
              ativo: ativo.checked
            };
            if (p.id) DB.update('produtos', p.id, body); else DB.insert('produtos', body);
            mm.fechar(); render();
          }
        }, 'Salvar'),
        p.id ? el('button', {
          class: 'btn-link', style: 'color:#ef7076', onclick: async () => {
            const usado = DB.all('pedido_itens').some(i => i.produto_id === p.id);
            if (usado) return toast('Produto já usado em pedidos — desative-o em vez de excluir.', 'erro');
            if (!(await confirmar('Excluir o produto "' + p.nome + '"?'))) return;
            DB.removeWhere('cliente_produtos', (cp) => cp.produto_id === p.id);
            DB.remove('produtos', p.id);
            mm.fechar(); toast('Produto excluído.'); render();
          }
        }, '🗑 Excluir produto') : null), { titulo: p.id ? 'Editar produto' : 'Novo produto', full: true });
    }
  }

  // ---------- Admin: Vendedores ----------
  function telaAdminVendedores() {
    const wrap = el('div');
    const m = modal(wrap, { titulo: 'Admin · Vendedores', full: true });
    render();
    function render() {
      wrap.innerHTML = '';
      wrap.appendChild(el('button', { class: 'btn w100', onclick: () => editar(null) }, '+ Novo vendedor'));
      wrap.appendChild(el('div', { class: 'col gap4 mt8' },
        DB.all('representantes').map(r => el('div', { class: 'hist-linha' },
          el('span', null, (r.ativo === false ? '🚫 ' : '') + r.nome + ' (' + r.papel + ') · ' + r.email +
            ` · ${r.comissao_pct_novo}%/${r.comissao_pct}% · ${C.fmtMoney(Number(r.custo_km || 0))}/km`),
          el('button', { class: 'btn-link', onclick: () => editar(r) }, 'editar')))));
    }
    function editar(r) {
      r = r || {};
      const f = {};
      const inp = (k, rot, tipo, step) => {
        f[k] = el('input', { class: 'input', type: tipo || 'text', step: step || null, value: r[k] != null ? r[k] : '', placeholder: rot });
        return el('label', { class: 'campo' }, el('span', { class: 'sub' }, rot), f[k]);
      };
      const papel = el('select', { class: 'input' },
        el('option', { value: 'vendedor', selected: r.papel !== 'gestor' ? '' : null }, 'Vendedor'),
        el('option', { value: 'gestor', selected: r.papel === 'gestor' ? '' : null }, 'Gestor'));
      const ativo = el('input', { type: 'checkbox', checked: r.ativo !== false ? '' : null });
      const mm = modal(el('div', { class: 'col gap8' },
        inp('nome', 'Nome *'), inp('email', 'E-mail (login) *', 'email'), inp('contato', 'Contato (sai no talão)'),
        inp('comissao_pct_novo', '% comissão cliente novo', 'number', '0.1'),
        inp('comissao_pct', '% comissão reposição', 'number', '0.1'),
        inp('custo_km', 'Custo por km (R$)', 'number', '0.01'),
        inp('cidade_base', 'Cidade base'),
        inp('lat_base', 'Base — latitude', 'number', 'any'), inp('lng_base', 'Base — longitude', 'number', 'any'),
        el('label', { class: 'campo' }, el('span', { class: 'sub' }, 'Papel'), papel),
        el('label', { class: 'row gap8' }, ativo, 'Ativo'),
        el('div', { class: 'row gap8' },
          r.id ? el('button', {
            class: 'btn btn-sec grow', onclick: async () => {
              if (await confirmar('Resetar a senha de ' + r.nome + '? Ele definirá uma nova no próximo login.')) {
                DB.update('representantes', r.id, { senha_hash: 'TROCAR_NA_TELA_DE_LOGIN' });
                toast('Senha resetada.');
              }
            }
          }, '🔑 Resetar senha') : null,
          el('button', {
            class: 'btn grow', onclick: () => {
              if (!f.nome.value.trim() || !f.email.value.trim()) return toast('Nome e e-mail obrigatórios.', 'erro');
              const body = {
                nome: f.nome.value.trim(), email: f.email.value.trim().toLowerCase(),
                contato: f.contato.value.trim() || null,
                comissao_pct_novo: Number(f.comissao_pct_novo.value) || 15,
                comissao_pct: Number(f.comissao_pct.value) || 10,
                custo_km: Number(f.custo_km.value) || 0.8,
                cidade_base: f.cidade_base.value.trim() || null,
                lat_base: f.lat_base.value === '' ? null : Number(f.lat_base.value),
                lng_base: f.lng_base.value === '' ? null : Number(f.lng_base.value),
                papel: papel.value, ativo: ativo.checked
              };
              if (r.id) DB.update('representantes', r.id, body);
              else DB.insert('representantes', Object.assign({ senha_hash: 'TROCAR_NA_TELA_DE_LOGIN' }, body));
              mm.fechar(); render();
            }
          }, 'Salvar'))), { titulo: r.id ? 'Editar vendedor' : 'Novo vendedor', full: true });
    }
  }

  // ---------- Admin: Configurações ----------
  function telaAdminConfig() {
    const CHAVES = [
      ['google_maps_key', 'Chave Google Maps (Geocoding/Distance Matrix/JS)', 'text'],
      ['gemini_key', 'Chave Gemini — IA do suporte (aistudio.google.com/apikey)', 'text'],
      ['ia_modelo', 'Modelo da IA do suporte', 'text'],
      ['ciclo_inicio', 'Início do ciclo (segunda da semana 1, aaaa-mm-dd)', 'text'],
      ['visitas_dia_min', 'Visitas FIXAS por dia (alvo da redistribuição)', 'number'],
      ['visitas_dia_max', 'Teto do dia (fixas + reencaixes)', 'number'],
      ['freq_classe_a', 'Classe A — visitar a cada (dias)', 'number'],
      ['freq_classe_b', 'Classe B — visitar a cada (dias)', 'number'],
      ['freq_classe_c', 'Classe C — visitar a cada (dias)', 'number'],
      ['freq_classe_d', 'Classe D — visitar a cada (dias)', 'number'],
      ['pernoite_dist_km', 'Pernoite: distância mínima da base (km)', 'number'],
      ['pernoite_economia_km', 'Pernoite: economia mínima (km)', 'number'],
      ['reencaixe_detour_km', 'Reencaixe: desvio máximo (km)', 'number'],
      ['alerta_vencendo_dias', 'Alerta "vence em Xd" — antecedência', 'number'],
      ['haversine_fator', 'Fator haversine offline', 'number'],
      ['velocidade_media_kmh', 'Velocidade média (km/h)', 'number']
    ];
    const inputs = {};
    const condTxt = el('textarea', { class: 'input', rows: '3' },
      (DB.config('condicoes_pagamento', []) || []).join('\n'));
    const obsTxt = el('textarea', { class: 'input', rows: '5' }, DB.config('pdf_observacoes', ''));
    const mm = modal(el('div', { class: 'col gap8' },
      CHAVES.map(([k, rot, tipo]) => {
        inputs[k] = el('input', { class: 'input', type: tipo, step: 'any', value: String(DB.config(k, '') ?? '') });
        return el('label', { class: 'campo' }, el('span', { class: 'sub' }, rot), inputs[k]);
      }),
      el('label', { class: 'campo' }, el('span', { class: 'sub' }, 'Condições de pagamento (uma por linha)'), condTxt),
      el('label', { class: 'campo' }, el('span', { class: 'sub' }, 'Observações padrão do PDF/talão'), obsTxt),
      el('button', {
        class: 'btn big w100', onclick: () => {
          for (const [k, , tipo] of CHAVES) {
            const v = inputs[k].value.trim();
            DB.upsertConfig(k, tipo === 'number' ? Number(v) : v);
          }
          DB.upsertConfig('condicoes_pagamento', condTxt.value.split('\n').map(x => x.trim()).filter(Boolean));
          DB.upsertConfig('pdf_observacoes', obsTxt.value.trim());
          mm.fechar(); toast('Configurações salvas.');
        }
      }, 'Salvar configurações')), { titulo: 'Configurações', full: true });
  }

  // ---------- Redistribuição mensal (virada de mês) ----------
  function telaReplanejarMes() {
    const s = sessao();
    if (s.consolidado) return toast('Selecione um representante no topo.', 'erro');
    const rep = s.rep;
    const m = modal(el('div', null,
      el('p', null, 'Redistribui os clientes de ' + rep.nome + ' pelo ciclo de 7 semanas respeitando a frequência individual, ' +
        DB.config('visitas_dia_min', 6) + '–' + DB.config('visitas_dia_max', 8) + ' visitas/dia e proximidade geográfica (menor km).'),
      el('p', { class: 'aviso mt8' }, 'Isso regrava semana e dia do ciclo de todos os clientes ativos do representante.'),
      el('button', {
        class: 'btn big w100 mt12', onclick: async () => {
          const res = replanejar(rep.id);
          m.fechar();
          toast(`Redistribuído: ${res.n} clientes em ${res.dias} dias úteis (média ${res.media}/dia).`);
        }
      }, '🗓 Redistribuir agora')), { titulo: 'Virada de mês' });

    function replanejar(repId) {
      const maxDia = Number(DB.config('visitas_dia_max', 8));
      const minDia = Number(DB.config('visitas_dia_min', 6));
      const cls = clientesDoRep(repId).slice();
      // urgência: quem está mais perto de estourar o ciclo primeiro
      cls.sort((a, b) => (a.proxima_visita_prevista || '9999').localeCompare(b.proxima_visita_prevista || '9999'));
      const slots = []; // 7 semanas × 6 dias
      for (let ss = 1; ss <= 7; ss++) for (let dd = 1; dd <= 5; dd++) slots.push({ s: ss, d: dd, membros: [] }); // dias úteis: Seg–Sex
      const alvo = Math.min(maxDia, Math.max(minDia, Math.ceil(cls.length / slots.length)));
      const restantes = new Set(cls.map(c => c.id));
      for (const slot of slots) {
        if (!restantes.size) break;
        // semente: mais urgente restante
        const seed = cls.find(c2 => restantes.has(c2.id));
        slot.membros.push(seed); restantes.delete(seed.id);
        // vizinhos mais próximos da semente (haversine) até o alvo
        while (slot.membros.length < alvo && restantes.size) {
          let melhor = null, melhorD = Infinity;
          for (const c2 of cls) {
            if (!restantes.has(c2.id)) continue;
            const d2 = (seed.lat != null && c2.lat != null)
              ? C.haversineKm(seed, c2)
              : (seed.cidade === c2.cidade ? 0.5 : 999);
            if (d2 < melhorD) { melhorD = d2; melhor = c2; }
          }
          if (!melhor) break;
          slot.membros.push(melhor); restantes.delete(melhor.id);
        }
      }
      let n = 0, dias = 0;
      for (const slot of slots) {
        if (!slot.membros.length) continue;
        dias++;
        for (const c2 of slot.membros) { DB.update('clientes', c2.id, { semana_padrao: slot.s, dia_semana_padrao: C.DIAS_SEMANA[slot.d] }); n++; }
      }
      return { n, dias, media: dias ? Math.round(n / dias * 10) / 10 : 0 };
    }
  }

  // ================= APARÊNCIA (temas de cor) =================
  const TEMAS = [
    ['ouro', 'Ouro', '#d4af37'], ['esmeralda', 'Esmeralda', '#2ec27e'],
    ['safira', 'Safira', '#4d8dff'], ['rubi', 'Rubi', '#f2545e'],
    ['ametista', 'Ametista', '#a86bf5'], ['prata', 'Prata', '#aebdd6']
  ];
  function aplicarTema(t) {
    if (t && t !== 'ouro') document.documentElement.dataset.tema = t;
    else delete document.documentElement.dataset.tema;
    localStorage.setItem('ns_tema', t || 'ouro');
  }
  function telaAparencia() {
    const atual = localStorage.getItem('ns_tema') || 'ouro';
    const grid = el('div', { class: 'tema-grid' });
    const m = modal(el('div', null,
      el('p', { class: 'sub mb12' }, 'Escolha a cor de destaque do aplicativo (vale para este aparelho).'),
      grid), { titulo: '🎨 Aparência' });
    TEMAS.forEach(([k, rot, cor]) => {
      grid.appendChild(el('button', {
        class: 'tema-opt' + ((localStorage.getItem('ns_tema') || 'ouro') === k ? ' ativo' : ''),
        onclick: (e) => {
          aplicarTema(k);
          grid.querySelectorAll('.tema-opt').forEach(b => b.classList.remove('ativo'));
          e.currentTarget.classList.add('ativo');
          toast('Tema ' + rot + ' aplicado ✨');
          montarTopbar();
        }
      }, el('span', { class: 'tema-bola', style: 'background:radial-gradient(circle at 32% 26%,#fff, ' + cor + ' 55%, #000c 140%)' }), rot));
    });
  }

  // ================= BOOT =================
  window.NSApp = {
    sessao, nav, recalcularCicloCliente,
    aoConcluirPedido() { if (viewAtual === 'hoje' || viewAtual === 'pedidos') nav(viewAtual); }
  };

  document.addEventListener('DOMContentLoaded', async () => {
    aplicarTema(localStorage.getItem('ns_tema') || 'ouro');
    $$('#tabs button').forEach(b => b.addEventListener('click', () => nav(b.dataset.v)));
    $('#fab').addEventListener('click', () => window.NSPedido.novo());
    if ('serviceWorker' in navigator) {
      // autoatualização: quando uma versão nova assume, recarrega uma única vez
      const tinhaControlador = !!navigator.serviceWorker.controller;
      let recarregou = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!tinhaControlador || recarregou) return;
        recarregou = true; location.reload();
      });
      navigator.serviceWorker.register('sw.js').then(r => { try { r.update(); } catch (e) {} }).catch(() => {});
    }
    if (!DB.configured()) {
      $('#view').innerHTML = '<div class="login-box"><h1>⚙ Configuração</h1>' +
        '<p class="sub">Preencha FIREBASE_PROJECT_ID e FIREBASE_API_KEY no bloco NS_CONFIG do index.html (projeto Firebase com Firestore ativado). Depois use "Primeira instalação" na tela de login para carregar os 255 clientes, o catálogo e os usuários.</p></div>';
      $('#topbar').style.display = 'none'; $('#tabs').style.display = 'none'; $('#fab').style.display = 'none';
      return;
    }
    if (session && !DB.all('representantes').length && navigator.onLine) {
      try { await DB.pullAll(); } catch (e) {}
    }
    if (session && DB.byId('representantes', session.repId)) iniciarApp();
    else telaLogin();
  });
})();
