/* NEW STAR — app principal: login, Hoje (rota), clientes, pedidos, dashboard,
 * despesas e área administrativa do gestor. */
(function () {
  'use strict';
  const { $, $$, el, escH, toast, modal, confirmar, dataBR, hojeISO, mesISO, baixar,
    ico, icoHTML, rot, farol } = window.NSUI;
  const C = window.NSCalc, DB = window.NSDB, R = window.NSRota;

  // ================= MARCA =================
  // Marca "Estrada da Estrela": a rota do vendedor termina na estrela
  const LOGO_SVG =
    '<svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
    '<defs><linearGradient id="nscir" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0" stop-color="#5aa9e6"/><stop offset=".55" stop-color="#2b7bd4"/><stop offset="1" stop-color="#1150a8"/></linearGradient>' +
    '<linearGradient id="nsouro" x1="0" y1="0" x2="1" y2="1">' +
    '<stop offset="0" stop-color="#ffd062"/><stop offset=".55" stop-color="#f8b13c"/><stop offset="1" stop-color="#e79a25"/></linearGradient></defs>' +
    '<circle cx="256" cy="256" r="238" fill="url(#nscir)"/>' +
    '<path d="M226 142 L262.4 241.8 L368.7 245.6 L285 311.2 L314.2 413.4 L226 354 L137.8 413.4 L167 311.2 L83.3 245.6 L189.6 241.8 Z" fill="url(#nsouro)"/>' +
    '<path d="M336 176 C392 232 404 300 330 336 C388 322 412 258 372 200 Z" fill="url(#nsouro)"/>' +
    '<g transform="rotate(45 330 160)">' +
    '<path d="M330 92 C352 118 358 146 352 176 L308 176 C302 146 308 118 330 92 Z" fill="url(#nsouro)"/>' +
    '<path d="M308 154 L286 196 L310 186 Z" fill="url(#nsouro)"/>' +
    '<path d="M352 154 L374 196 L350 186 Z" fill="url(#nsouro)"/>' +
    '<path d="M318 178 L342 178 L336 200 L324 200 Z" fill="url(#nsouro)"/>' +
    '<circle cx="330" cy="136" r="13" fill="#1560bd"/></g>' +
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
            toast(DB.all('clientes').length + ' clientes, catálogo e usuários carregados. Faça o primeiro login.');
            telaLogin();
          } catch (err) { toast('Falha na instalação: ' + err.message, 'erro'); e.currentTarget.disabled = false; }
        }
      }, rot('caixa', 'Primeira instalação (carregar ' + window.NS_SEED.clientes.length + ' clientes + catálogo)')) : null);
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
  const VIEWS = { hoje: vRota, clientes: vClientes, pedidos: vPedidos, dash: vDashboard, mais: vMais, ajuda: (v) => window.NSAjuda.view(v) };
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
      el('option', { value: 'todos', selected: verRepId === 'todos' ? '' : null }, 'Todos (consolidado)'),
      DB.all('representantes').filter(r => r.papel === 'vendedor' && r.ativo !== false)
        .map(r => el('option', { value: r.id, selected: verRepId === r.id ? '' : null }, r.nome)));
    return sel;
  }

  function atualizarSyncChip(st) {
    const chip = $('#syncChip');
    if (!chip) return;
    if (!st.configured) { chip.textContent = 'configurar'; chip.className = 'sync-chip erro'; }
    else if (!st.online) { chip.textContent = 'offline' + (st.pendentes ? ' · ' + st.pendentes : ''); chip.className = 'sync-chip off'; }
    else if (st.syncing) { chip.textContent = 'sincronizando…'; chip.className = 'sync-chip'; }
    else if (st.pendentes) { chip.textContent = st.pendentes + ' pendente(s)'; chip.className = 'sync-chip off'; }
    else { chip.textContent = 'sincronizado'; chip.className = 'sync-chip ok'; }
  }
  DB.onStatus(atualizarSyncChip);

  function mostrarSync() {
    const st = DB.status();
    modal(el('div', null,
      el('p', { class: 'row gap8' }, farol(st.online ? 'verde' : 'vermelho'),
        st.online ? 'Online' : 'Offline — tudo continua funcionando; as alterações entram na fila.'),
      el('p', { class: 'sub mt4' }, 'Escrituras pendentes: ' + st.pendentes),
      st.lastSync ? el('p', { class: 'sub' }, 'Última sincronização: ' + new Date(st.lastSync).toLocaleString('pt-BR')) : null,
      st.erros.length ? el('div', { class: 'mt8' },
        el('strong', null, ico('alerta', 'ic-erro'), st.erros.length + ' erro(s) de sincronização'),
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
  // ================= ROTA MANUAL (o vendedor monta) =================
  const DIAS_ROTA = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta'];
  let diaRota = null; // dia da semana em edição/visualização

  function diaDeHoje() {
    const d = new Date().getDay(); // 0=dom
    return (d >= 1 && d <= 5) ? DIAS_ROTA[d - 1] : 'Segunda';
  }
  // segunda-feira da semana que está sendo planejada: no sábado/domingo já
  // aponta para a PRÓXIMA semana (é quando o vendedor organiza os dias)
  function segundaDaSemanaPlanejada() {
    const h = new Date(hojeISO() + 'T12:00:00');
    const dw = h.getDay(); // 0=dom .. 6=sáb
    const d = new Date(h);
    if (dw === 0) d.setDate(d.getDate() + 1);            // domingo → segunda de amanhã
    else if (dw === 6) d.setDate(d.getDate() + 2);       // sábado → segunda da próxima
    else d.setDate(d.getDate() - (dw - 1));              // seg–sex → segunda desta semana
    return d;
  }
  function dataDoDia(dia) {
    const seg = segundaDaSemanaPlanejada();
    seg.setDate(seg.getDate() + DIAS_ROTA.indexOf(dia));
    return seg.toISOString().slice(0, 10);
  }
  function rotuloSemana() {
    const ini = dataDoDia('Segunda'), fim = dataDoDia('Sexta');
    const curta = (iso) => iso.slice(8, 10) + '/' + iso.slice(5, 7);
    const proxima = new Date(ini + 'T12:00:00') > new Date(hojeISO() + 'T12:00:00');
    return (proxima ? 'Próxima semana' : 'Esta semana') + ' · ' + curta(ini) + ' a ' + curta(fim);
  }
  function diasEntre(iso) {
    if (!iso) return null;
    return Math.round((new Date(hojeISO() + 'T12:00:00') - new Date(String(iso).slice(0, 10) + 'T12:00:00')) / 86400000);
  }
  // dias sem pedido: usa o último pedido; se nunca houve, o valor trazido da listagem
  function diasSemPedido(c) {
    const d = diasEntre(c.ultimo_pedido_em);
    if (d != null) return d;
    if (c.seed_dias_sem_pedido != null)
      return Number(c.seed_dias_sem_pedido) + (diasEntre(c.seed_data_referencia) || 0);
    return 9999;
  }
  function diasSemAtendimento(c) {
    const d = diasEntre(c.ultima_visita_em);
    return d != null ? d : diasSemPedido(c);
  }
  // texto amigável (9999 = nunca comprou/visitou)
  const txtDias = (n, oque) => n >= 9999 ? 'sem ' + oque + ' registrado' : n + 'd sem ' + oque;
  // ordem padrão da seleção: prioridade (A→C) e depois quem está há mais tempo sem pedido
  function ordenarParaRota(lista) {
    return lista.sort((a, b) =>
      C.classeRank(a) - C.classeRank(b) || diasSemPedido(b) - diasSemPedido(a));
  }
  function clientesDaRota(repId, dia) {
    return clientesDoRep(repId).filter(c => c.rota_dia === dia)
      .sort((a, b) => (a.rota_ordem || 0) - (b.rota_ordem || 0));
  }
  function temAlerta(c) {
    return DB.all('pendencias').some(p => p.cliente_id === c.id && !p.resolvida_em) || !!ultimaNota(c.id);
  }
  // farol: vermelho atrasado · amarelo vencendo · verde em dia · cinza sem registro
  function statusDoCliente(c) {
    return statusCliente(c, hojeISO(), Number(DB.config('alerta_vencendo_dias', 7)));
  }
  // triângulo amarelo com "?" preto quando o cliente tem observação/pendência
  function marcaAlerta(c) {
    return temAlerta(c) ? el('span', { class: 'alerta-obs', title: 'Este cliente tem observação' }, '?') : null;
  }
  function visitaDeHoje(clienteId) {
    return DB.all('visitas').find(v => v.cliente_id === clienteId && v.data_visita === hojeISO() && v.realizada);
  }

  // ---- visão do gestor (todos os vendedores, somente leitura) ----
  function vRotaConsolidado(view) {
    if (!diaRota) diaRota = diaDeHoje();
    view.appendChild(abaDias(() => nav('hoje')));
    const reps = DB.all('representantes').filter(r => r.papel !== 'gestor' && r.ativo !== false);
    for (const rep of reps) {
      const lista = clientesDaRota(rep.id, diaRota);
      const feitos = lista.filter(c => visitaDeHoje(c.id)).length;
      view.appendChild(el('h3', { class: 'mt16' }, ico('usuario', 'ic-sm'), rep.nome +
        (lista.length ? ` — ${feitos}/${lista.length} visitados` : '')));
      if (!lista.length) { view.appendChild(el('p', { class: 'vazio' }, 'Sem rota criada para ' + diaRota + '.')); continue; }
      const box = el('div', { class: 'col gap8 mt8' });
      lista.forEach((c, i) => box.appendChild(el('div', {
        class: 'card-visita st-' + statusDoCliente(c).k + (visitaDeHoje(c.id) ? ' feito' : ''),
        onclick: () => fichaCliente(c.id)
      },
        el('div', { class: 'row space' },
          el('div', null,
            el('strong', null, el('span', { class: 'st-tag ' + statusDoCliente(c).k }), marcaAlerta(c), `${i + 1}. ${c.nome}`),
            el('div', { class: 'sub' }, [c.cidade, c.uf].filter(Boolean).join(' - '))),
          visitaDeHoje(c.id) ? el('span', { class: 'badge ok' }, ico('check', 'ic-sm')) : null))));
      view.appendChild(box);
    }
    view.appendChild(el('p', { class: 'sub mt12' },
      'Visão do gestor (somente leitura). Para montar rotas, escolha o vendedor no topo.'));
  }

  // ---- abas dos dias da semana ----
  function abaDias(aoTrocar) {
    return el('div', null,
      el('div', { class: 'sub row gap8' }, ico('agenda', 'ic-sm'), rotuloSemana()),
      el('div', { class: 'dias-scroll mt4' }, DIAS_ROTA.map(d => el('button', {
        class: 'chip' + (d === diaRota ? ' ativo' : ''),
        onclick: () => { diaRota = d; aoTrocar(); }
      }, d + ' ' + dataDoDia(d).slice(8, 10) + '/' + dataDoDia(d).slice(5, 7)))));
  }

  // ---- tela principal da rota ----
  function vRota(view) {
    const s = sessao();
    if (s.consolidado) return vRotaConsolidado(view);
    const rep = s.rep;
    if (!diaRota) diaRota = diaDeHoje();
    const lista = clientesDaRota(rep.id, diaRota);

    view.appendChild(abaDias(() => nav('hoje')));
    view.appendChild(el('div', { class: 'row space mt8' },
      el('h2', null, 'Rota de ' + diaRota + (diaRota === diaDeHoje() ? ' (hoje)' : '')),
      el('span', { class: 'badge' }, lista.length + ' cliente(s)')));

    if (lista.length) {
      const feitos = lista.filter(c => visitaDeHoje(c.id)).length;
      const pct = Math.round(feitos / lista.length * 100);
      view.appendChild(el('div', { class: 'progresso mt8' },
        el('div', { class: 'progresso-info' }, `${feitos} de ${lista.length} visitados · ${C.fmtPct(pct)}`),
        el('div', { class: 'progresso-barra' }, el('div', { class: 'progresso-fill', style: 'width:' + pct + '%' }))));
    }

    view.appendChild(el('button', {
      class: 'btn big w100 mt12', onclick: () => telaCriarRota(rep)
    }, lista.length ? rot('lapis', 'Editar rota de ' + diaRota) : rot('mais', 'Criar rota de ' + diaRota)));
    if (lista.length)
      view.appendChild(el('button', {
        class: 'btn btn-sec w100 mt8', onclick: async () => {
          if (!(await confirmar('Resetar a rota de ' + diaRota + '? Os ' + lista.length +
            ' cliente(s) voltam para a lista de disponíveis.'))) return;
          lista.forEach(c => DB.update('clientes', c.id, { rota_dia: null, rota_ordem: null }));
          toast('Rota de ' + diaRota + ' zerada.');
          nav('hoje');
        }
      }, rot('lixeira', 'Resetar rota de ' + diaRota)));

    const listaEl = el('div', { class: 'col gap8 mt12' });
    view.appendChild(listaEl);
    if (!lista.length) {
      listaEl.appendChild(el('p', { class: 'vazio' },
        'Nenhum cliente na rota de ' + diaRota + '. Toque em "Criar rota" para escolher os clientes.'));
      return;
    }
    lista.forEach((c, i) => {
      const v = visitaDeHoje(c.id);
      const st = statusDoCliente(c);
      listaEl.appendChild(el('div', { class: 'card-visita st-' + st.k + (v ? ' feito' : '') },
        el('div', { class: 'row space', onclick: () => fichaCliente(c.id) },
          el('div', null,
            el('strong', null, el('span', { class: 'st-tag ' + st.k }), marcaAlerta(c), `${i + 1}. ${c.nome}`),
            el('div', { class: 'sub' }, farol(st.k), st.rot),
            el('div', { class: 'sub' }, [c.endereco, c.cidade, c.uf].filter(Boolean).join(' · ')),
            el('div', { class: 'sub' }, 'Classe ' + (c.classe || 'A') +
              ' · ' + txtDias(diasSemPedido(c), 'pedido') + ' · ' + txtDias(diasSemAtendimento(c), 'visita')),
            (() => { const n = ultimaNota(c.id); return n ? el('div', { class: 'nota-previa' },
              n.length > 90 ? n.slice(0, 90) + '…' : n) : null; })()),
          v ? el('span', { class: 'badge ok' }, ico('check', 'ic-sm'), v.fez_pedido ? 'pedido' : 'visitado') : null),
        el('div', { class: 'row gap8 mt8' },
          el('button', { class: 'btn-mini verde', onclick: () => dialogoVisita(c, rep) }, rot('check', 'Registrar visita')),
          el('button', { class: 'btn-mini vermelho', onclick: () => removerDaRota(c) }, rot('fechar', 'Remover da rota')))));
    });
  }

  function removerDaRota(c) {
    DB.update('clientes', c.id, { rota_dia: null, rota_ordem: null });
    toast(c.nome + ' saiu da rota e voltou para a lista de clientes.');
    nav('hoje');
  }

  // ---- tela de seleção de clientes (filtros + adicionar) ----
  function telaCriarRota(rep) {
    const wrap = el('div');
    const m = modal(wrap, { titulo: 'Rota de ' + diaRota, full: true });
    const f = { busca: '', cidade: '', regiao: '', classe: '', semPedido: '', semVisita: '' };
    render();

    function render() {
      wrap.innerHTML = '';
      const disponiveis = clientesDoRep(rep.id).filter(c => c.status !== 'inativo' && !c.rota_dia);
      const cidades = Array.from(new Set(disponiveis.map(c => c.cidade).filter(Boolean))).sort();
      const regioes = Array.from(new Set(disponiveis.map(c => c.regiao || C.regiaoDoCliente(c)).filter(Boolean))).sort();

      const naRota = clientesDaRota(rep.id, diaRota);
      wrap.appendChild(el('div', { class: 'total-bar' },
        el('span', null, 'Na rota de ' + diaRota),
        el('strong', null, naRota.length + ' cliente(s)')));

      const inBusca = el('input', { class: 'input big mt8', placeholder: 'Buscar nome, cidade ou CNPJ…', value: f.busca });
      inBusca.oninput = () => { f.busca = inBusca.value; renderLista(); };
      const sel = (chave, rotulo, opcoes) => {
        const s = el('select', { class: 'input' },
          el('option', { value: '' }, rotulo),
          opcoes.map(o => el('option', { value: String(o.v != null ? o.v : o), selected: f[chave] === String(o.v != null ? o.v : o) ? '' : null },
            o.t || o)));
        s.onchange = () => { f[chave] = s.value; renderLista(); };
        return s;
      };
      wrap.appendChild(inBusca);
      wrap.appendChild(el('div', { class: 'row gap8 mt8' },
        sel('cidade', 'Todas as cidades', cidades),
        sel('regiao', 'Todas as regiões', regioes)));
      wrap.appendChild(el('div', { class: 'row gap8 mt8' },
        sel('classe', 'Todas as prioridades', [{ v: 'A', t: 'Classe A' }, { v: 'B', t: 'Classe B' }, { v: 'C', t: 'Classe C' }]),
        sel('semPedido', 'Dias sem pedido', [{ v: '30', t: '30+ dias' }, { v: '45', t: '45+ dias' }, { v: '60', t: '60+ dias' }, { v: '90', t: '90+ dias' }, { v: '180', t: '180+ dias' }])));
      wrap.appendChild(el('div', { class: 'row gap8 mt8' },
        sel('semVisita', 'Dias sem atendimento', [{ v: '30', t: '30+ dias' }, { v: '45', t: '45+ dias' }, { v: '60', t: '60+ dias' }, { v: '90', t: '90+ dias' }])));

      const infoEl = el('div', { class: 'sub mt8' });
      const listaEl = el('div', { class: 'col gap8 mt8' });
      wrap.appendChild(infoEl); wrap.appendChild(listaEl);
      wrap.appendChild(el('button', {
        class: 'btn big w100 mt16', onclick: () => { m.fechar(); nav('hoje'); }
      }, rot('check', 'Concluir')));

      function renderLista() {
        const q = f.busca.trim().toLowerCase();
        const qNum = q.replace(/\D/g, '');
        let cls = clientesDoRep(rep.id).filter(c => c.status !== 'inativo' && !c.rota_dia);
        if (q) cls = cls.filter(c => (c.nome || '').toLowerCase().includes(q) ||
          (c.cidade || '').toLowerCase().includes(q) ||
          (qNum && (c.cnpj_cpf || '').replace(/\D/g, '').includes(qNum)));
        if (f.cidade) cls = cls.filter(c => c.cidade === f.cidade);
        if (f.regiao) cls = cls.filter(c => (c.regiao || C.regiaoDoCliente(c)) === f.regiao);
        if (f.classe) cls = cls.filter(c => (c.classe || 'A') === f.classe);
        if (f.semPedido) cls = cls.filter(c => diasSemPedido(c) >= Number(f.semPedido));
        if (f.semVisita) cls = cls.filter(c => diasSemAtendimento(c) >= Number(f.semVisita));
        cls = ordenarParaRota(cls);
        infoEl.textContent = cls.length + ' cliente(s) disponível(is) · ordenados por prioridade e tempo sem pedido';
        listaEl.innerHTML = '';
        cls.slice(0, 80).forEach(c => {
          const st = statusDoCliente(c);
          listaEl.appendChild(el('div', { class: 'card-visita st-' + st.k },
            el('div', { onclick: () => fichaCliente(c.id) },
              el('strong', null, el('span', { class: 'st-tag ' + st.k }), marcaAlerta(c), c.nome),
              el('div', { class: 'sub' }, farol(st.k), st.rot),
              el('div', { class: 'sub' }, [c.cidade, c.uf].filter(Boolean).join(' - ') +
                ' · ' + (c.regiao || C.regiaoDoCliente(c) || 'sem região')),
              el('div', { class: 'sub' }, 'Classe ' + (c.classe || 'A') +
                ' · ' + txtDias(diasSemPedido(c), 'pedido') + ' · ' + txtDias(diasSemAtendimento(c), 'visita'))),
            el('button', {
              class: 'btn-mini mt8', onclick: () => {
                const ordem = clientesDaRota(rep.id, diaRota).length + 1;
                DB.update('clientes', c.id, { rota_dia: diaRota, rota_ordem: ordem });
                toast(c.nome + ' entrou na rota de ' + diaRota + '.');
                render();
              }
            }, rot('mais', 'Adicionar à rota'))));
        });
        if (!cls.length) listaEl.appendChild(el('p', { class: 'vazio' }, 'Nenhum cliente com esses filtros.'));
        else if (cls.length > 80) listaEl.appendChild(el('p', { class: 'sub' }, 'Mostrando os 80 primeiros — use os filtros para refinar.'));
      }
      renderLista();
    }
  }

  // ---- registrar visita: novo pedido · sem pedido (motivo) · não visitei ----
  function dialogoVisita(c, rep) {
    const dv = modal(el('div', { class: 'col gap8' },
      el('p', { class: 'sub' }, c.nome),
      el('button', { class: 'btn big', onclick: () => { dv.fechar(); window.NSPedido.novo(c); } }, rot('recibo', 'Novo pedido')),
      el('button', { class: 'btn btn-sec big', onclick: () => { dv.fechar(); semPedido(c, rep); } }, rot('checkCirculo', 'Sem pedido')),
      el('button', { class: 'btn btn-sec big', onclick: () => { dv.fechar(); naoVisitei(c); } }, rot('pular', 'Não visitei'))),
      { titulo: 'Registrar visita' });
  }

  const MOTIVOS_SEM_PEDIDO = [
    'Responsável não estava',
    'Cliente não quis fazer pedido',
    'Sem necessidade de compra',
    'Outro'
  ];

  function semPedido(c, rep) {
    let motivo = MOTIVOS_SEM_PEDIDO[0];
    const obs = el('textarea', { class: 'input mt8', rows: '3', placeholder: 'Observação (opcional)' });
    const botoes = MOTIVOS_SEM_PEDIDO.map(mt => el('button', {
      class: 'btn btn-sec big' + (mt === motivo ? ' ativo' : ''),
      onclick: (e) => {
        motivo = mt;
        e.currentTarget.parentElement.querySelectorAll('.btn').forEach(b => b.classList.remove('ativo'));
        e.currentTarget.classList.add('ativo');
      }
    }, mt));
    const ms = modal(el('div', null,
      el('p', { class: 'sub' }, 'Por que ' + c.nome + ' não fez pedido?'),
      el('div', { class: 'col gap8 mt8' }, botoes),
      obs,
      el('button', {
        class: 'btn big w100 mt12', onclick: () => {
          DB.insert('visitas', {
            cliente_id: c.id, representante_id: (c.representante_id || rep.id),
            data_visita: hojeISO(), realizada: true, fez_pedido: false, valor_pedido: 0,
            motivo_sem_pedido: motivo, observacao: obs.value.trim() || null
          });
          if (obs.value.trim())
            DB.insert('cliente_notas', {
              cliente_id: c.id, texto: motivo + ' — ' + obs.value.trim(),
              autor: rep.nome, data: hojeISO()
            });
          espelharVisitaLocal(c);
          ms.fechar();
          toast('Visita registrada sem pedido (' + motivo + ').');
          nav('hoje');
        }
      }, rot('salvar', 'Salvar visita'))), { titulo: 'Sem pedido' });
  }

  function naoVisitei(c) {
    DB.update('clientes', c.id, { rota_dia: null, rota_ordem: null });
    toast(c.nome + ' saiu da rota e voltou para a lista de clientes disponíveis.');
    nav('hoje');
  }

  function espelharVisitaLocal(c) {
    const d = new Date(hojeISO() + 'T12:00:00');
    d.setDate(d.getDate() + (c.frequencia_dias || 60));
    DB.update('clientes', c.id, { ultima_visita_em: hojeISO(), proxima_visita_prevista: d.toISOString().slice(0, 10) });
    DB.all('pendencias').filter(p => p.cliente_id === c.id && !p.resolvida_em)
      .forEach(p => DB.update('pendencias', p.id, { resolvida_em: new Date().toISOString() }));
  }

  // Frequências da lógica do vendedor: A = 45d, B = 60d, C = 90d
  function freqDaClasse(cl) {
    return Number(DB.config('freq_classe_' + cl.toLowerCase(), { A: 45, B: 60, C: 90, D: 120 }[cl] || 45));
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
    // endereço escrito leva à porta certa; coordenada só quando não há endereço
    // (a coordenada "aproximada" cai no centro da cidade, não no cliente)
    const dest = (c.endereco && c.cidade)
      ? encodeURIComponent([c.endereco, c.bairro, c.cidade, c.uf].filter(Boolean).join(', '))
      : (c.lat != null ? c.lat + ',' + c.lng : encodeURIComponent(R.enderecoCompleto(c)));
    window.open('https://www.google.com/maps/dir/?api=1&destination=' + dest, '_blank');
  }

  // ================= VIEW: CLIENTES (farol de prazo) =================
  // verde dentro do prazo · amarelo vence em até X dias · vermelho atrasada · cinza sem registro
  let filtroClientes = 'todos';

  function statusCliente(c, hoje, avisoDias) {
    if (!c.proxima_visita_prevista)
      return { k: 'cinza', rot: 'sem visita registrada', ordem: 3, sub: 9e9 };
    const dif = Math.round((new Date(c.proxima_visita_prevista) - new Date(hoje)) / 86400000);
    if (dif < 0) return { k: 'vermelho', rot: (-dif) + 'd atrasado', ordem: 0, sub: dif };
    if (dif <= avisoDias) return { k: 'amarelo', rot: 'vence em ' + dif + 'd', ordem: 1, sub: dif };
    return { k: 'verde', rot: 'em dia · próxima ' + dataBR(c.proxima_visita_prevista), ordem: 2, sub: dif };
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
      [['todos', null, 'Todos ' + cont.todos], ['vermelho', 'vermelho', 'Atrasados ' + cont.vermelho],
       ['amarelo', 'amarelo', 'Vencendo ' + cont.amarelo], ['verde', 'verde', 'Em dia ' + cont.verde],
       ['cinza', 'cinza', 'Sem registro ' + cont.cinza]].forEach(([k, cor, rotulo]) => {
        chipsEl.appendChild(el('button', {
          class: 'chip' + (filtroClientes === k ? ' ativo' : ''),
          onclick: () => { filtroClientes = k; render(); }
        }, cor ? farol(cor) : null, rotulo));
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
            el('div', { class: 'row gap8' }, farol(st.k), el('strong', null, c.nome)),
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
        (c.cnpj_cpf ? 'CNPJ ' + C.fmtCNPJ(c.cnpj_cpf) + ' · ' : '') + [c.endereco, c.bairro, c.cidade, c.uf].filter(Boolean).join(', ')),
      el('div', { class: 'sub mt4' },
        'Contato: ' + (c.contato || '—') + ' · ' + (c.telefone || c.celular || '—') +
        (c.rede ? ' · Rede ' + c.rede + (c.recebimento_dias ? ' (comissão +' + c.recebimento_dias + 'd)' : '') : '') +
        ' · Prazo: ' + (c.condicao_pagamento_padrao || 'a definir no 1º pedido') +
        ' · Tabela: ' + (C.tabelaPermitida(c) === 'ambas'
          ? 'Simples ou Lucro Presumido' : 'somente ' + C.NOME_TABELA[C.tabelaPermitida(c)])),
      el('div', { class: 'row gap8 mt8' },
        el('button', { class: 'btn-mini', onclick: () => abrirGPS(c) }, rot('mapa', 'GPS (' + c.geocoding_status + ')')),
        el('button', { class: 'btn-mini', onclick: () => window.NSPedido.novo(c) }, rot('recibo', 'Novo pedido')),
        el('button', { class: 'btn-mini', onclick: () => editarCliente(c.id) }, rot('lapis', 'Editar'))),
      // material deixado no cliente (display/mostruário) — vira relatório
      el('div', { class: 'row gap8 mt8' },
        el('button', {
          class: 'btn-mini' + (c.display_no_cliente ? ' classe-ativa' : ''),
          onclick: (e) => {
            const novo = !c.display_no_cliente;
            DB.update('clientes', c.id, { display_no_cliente: novo });
            c.display_no_cliente = novo;
            e.currentTarget.classList.toggle('classe-ativa', novo);
            e.currentTarget.replaceChildren(ico('display'), novo ? 'Display no cliente: SIM' : 'Display no cliente: não');
            toast(novo ? 'Marcado: este cliente está com display.' : 'Desmarcado: display recolhido.');
          }
        }, ico('display'), c.display_no_cliente ? 'Display no cliente: SIM' : 'Display no cliente: não'),
        (!DB.all('visitas').some(v => v.cliente_id === c.id && v.data_visita === hojeISO() && v.realizada))
          ? el('button', {
            class: 'btn-mini', onclick: (e) => {
              DB.insert('visitas', {
                cliente_id: c.id, representante_id: (c.representante_id || s.rep.id),
                data_visita: hojeISO(), realizada: true, fez_pedido: false, valor_pedido: 0
              });
              recalcularCicloCliente(c.id);
              e.currentTarget.remove();
              toast('Visita de hoje registrada (conta como fora da rota se não era o dia dele).');
            }
          }, rot('check', 'Registrar visita hoje')) : null),
      c.material_no_cliente ? el('div', { class: 'sub mt4 row gap8' }, ico('caixa', 'ic-sm'), 'Material anotado: ' + c.material_no_cliente) : null,
      el('div', { class: 'row gap8 mt8' },
        el('span', { class: 'sub' }, 'Classe:'),
        ...['A', 'B', 'C'].map(cl => el('button', {
          class: 'btn-mini' + ((c.classe || 'A') === cl ? ' classe-ativa' : ''),
          onclick: (e) => {
            const freq = aplicarClasse(c.id, cl);
            e.currentTarget.parentElement.querySelectorAll('.btn-mini').forEach(b => b.classList.remove('classe-ativa'));
            e.currentTarget.classList.add('classe-ativa');
            toast(`Classe ${cl}: visita a cada ${freq} dias desde a última visita.`);
          }
        }, cl + ' · ' + freqDaClasse(cl) + 'd')),
        el('span', { class: 'badge' }, ico('pin', 'ic-sm'), c.regiao || C.regiaoDoCliente(c) || 'sem região')),

      el('h4', { class: 'mt12' }, 'Ciclo de visitas'),
      el('div', { class: 'sub' },
        `A cada ${c.frequencia_dias || 49} dias · última: ${dataBR(c.ultima_visita_em)} · próxima: ${dataBR(c.proxima_visita_prevista)}` +
        (dif != null ? (dif < 0 ? ` · ${-dif}d atrasado` : ` · vence em ${dif}d`) : '')),
      el('label', { class: 'row gap8 mt4 sub' },
        el('input', {
          type: 'checkbox', checked: c.frequencia_auto !== false ? '' : null,
          onchange: (e) => DB.update('clientes', c.id, { frequencia_auto: e.target.checked })
        }), 'Ajuste automático de frequência'),

      sug ? el('div', { class: 'sugestao mt8' },
        el('span', { class: 'row gap8' }, ico('lampada', 'ic-sm'), `${sug.motivo} — ${sug.tipo} ciclo para ${sug.para} dias?`),
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
        el('span', { class: 'row gap8' }, ico('alvo', 'ic-sm'), 'Upsell: ainda não trabalha ' + upsell.join(', '))) : null,

      el('h4', { class: 'mt12' }, 'Observações internas'),
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
                class: 'btn-icon', 'aria-label': 'Excluir observação', onclick: async () => {
                  if (await confirmar('Excluir esta observação?')) { DB.remove('cliente_notas', n.id); desenhar(); }
                }
              }, ico('lixeira'))));
          }
          if (c.observacoes) caixa.appendChild(el('div', { class: 'hist-linha apagado' },
            el('span', null, c.observacoes)));
          if (!caixa.children.length) caixa.appendChild(el('p', { class: 'vazio' }, 'Nenhuma observação ainda.'));
        };
        desenhar();
        return el('div', null, caixa,
          el('div', { class: 'row gap8 mt8' }, inp,
            el('button', {
              class: 'btn', 'aria-label': 'Adicionar observação', onclick: () => {
                const t = inp.value.trim();
                if (!t) return;
                DB.insert('cliente_notas', {
                  cliente_id: id, representante_id: s.eu.id, autor: s.eu.nome, texto: t
                });
                inp.value = ''; desenhar(); toast('Observação salva.');
              }
            }, ico('mais'))));
      })(),

      el('h4', { class: 'mt12' }, 'Histórico'),
      el('div', { class: 'col gap4' },
        visitas.slice(0, 12).map(v => {
          const ped = v.pedido_id ? DB.byId('pedidos', v.pedido_id) : null;
          return el('div', { class: 'hist-linha' + (v.realizada ? '' : ' apagado') },
            el('span', null, dataBR(v.data_visita) + ' · ' + (v.realizada
              ? (v.fez_pedido ? 'pedido ' + C.fmtMoney(Number(v.valor_pedido)) +
                (v.comissao_pct ? ` (${v.comissao_pct}%)` : '') +
                (ped && (Number(ped.total_unid_dev_display) + Number(ped.total_unid_dev_quebrada)) > 0
                  ? ` · dev ${ped.total_unid_dev_display}+${ped.total_unid_dev_quebrada}q` : '')
                : 'visita sem pedido')
              : 'não realizada (' + (v.motivo_falta || '') + ')')),
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
              }, ico('lixeira'))));
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
            el('strong', null, 'Nº ' + (p.numero || '—') + ' · ' + (cli.nome || '—')),
            el('strong', null, C.fmtMoney(Number(p.total_valor)))),
          el('span', { class: 'sub' }, dataBR(p.data_pedido) + ' · ' + p.status +
            (p.assinatura ? ' · assinado por ' + (p.assinante_nome || '—') : '') +
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

    const kpi = (rotulo, val, cls) => el('div', { class: 'kpi ' + (cls || '') },
      el('span', { class: 'kpi-rot' }, rotulo), el('strong', { class: 'kpi-val' }, val));

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
        el('span', { class: 'row gap8' }, farol('vermelho'), a.c.nome), el('span', { class: 'sub' }, a.dias + 'd atrasado'))));
    alertas.vencendo.slice(0, 20).forEach(a => alertasEl.appendChild(
      el('button', { class: 'item-lista compacto', onclick: () => fichaCliente(a.c.id) },
        el('span', { class: 'row gap8' }, farol('amarelo'), a.c.nome), el('span', { class: 'sub' }, 'vence em ' + a.dias + 'd'))));
    if (!alertas.atrasados.length && !alertas.vencendo.length)
      alertasEl.appendChild(el('p', { class: 'vazio' }, 'Nenhum alerta.'));
    view.appendChild(alertasEl);
  }

  // ================= VIEW: MAIS (despesas + admin + config) =================
  function vMais(view) {
    const s = sessao();
    view.appendChild(el('h2', null, 'Mais'));
    const item = (icone, titulo, desc, fn) => el('button', { class: 'item-menu mt8', onclick: fn },
      ico(icone, 'ic-lg'),
      el('span', { class: 'col' }, el('strong', null, titulo), desc ? el('span', { class: 'sub' }, desc) : null),
      ico('setaDir', 'ic-sm'));
    view.appendChild(item('grafico', 'Relatórios', 'Venda do dia, metas e redes', telaRelatorios));
    view.appendChild(item('dinheiro', 'Financeiro', 'Comissões a receber e despesas', telaFinanceiro));
    view.appendChild(item('pin', 'Geocodificar clientes', 'Localizar endereços no mapa', telaGeocode));
    view.appendChild(item('paleta', 'Aparência', 'Cores do app', telaAparencia));
    view.appendChild(item('pessoas', 'Clientes', 'Cadastrar, editar, excluir, importar/exportar', telaAdminClientes));
    if (s.papel === 'gestor') {
      view.appendChild(el('h3', { class: 'mt16' }, 'Administração'));
      view.appendChild(item('joia', 'Produtos e preços', 'Catálogo e tabelas', telaAdminProdutos));
      view.appendChild(item('usuario', 'Vendedores', 'Equipe e comissões', telaAdminVendedores));
      view.appendChild(item('ajustes', 'Configurações', 'Chaves, ciclo e textos', telaAdminConfig));
    }
    view.appendChild(el('button', { class: 'btn-link mt16', onclick: sair }, 'Sair (' + s.eu.email + ')'));
    view.appendChild(el('p', { class: 'sub mt8' }, 'NEW STAR — App do Vendedor · offline-first · v1'));
  }

  // ---------- Relatórios: venda do dia, metas do mês/dia, redes, display ----------
  // O relatório navega por MÊS (mês atual e anteriores). Cada mês guarda a sua
  // própria meta — senão, ao cadastrar a meta agora, ela reescreveria o histórico
  // e a % dos meses já fechados sairia errada.
  let mesRelOffset = 0;

  // último dia do mês (ISO) — usado como "hoje" de referência num mês já fechado
  function ultimoDiaISO(mes) {
    const [a, m] = mes.split('-').map(Number);
    return mes + '-' + String(new Date(a, m, 0).getDate()).padStart(2, '0');
  }
  // meta do período: o valor daquele mês/ano; se nunca foi cadastrado, cai no padrão
  // geral (que é onde ficavam as metas antes de existir meta por competência)
  const META_PADRAO = {
    meta_mes: 'meta_mes_valor', meta_dia: 'meta_dia_valor',
    meta_ano: 'meta_ano_valor', meta_novos: 'meta_novos_clientes'
  };
  function metaDoPeriodo(base, periodo) {
    const v = DB.config(base + '_' + periodo, null);
    if (v === null || v === undefined || v === '') return Number(DB.config(META_PADRAO[base], 0)) || 0;
    return Number(v) || 0;
  }

  function telaRelatorios() {
    const s = sessao();
    const repId = s.consolidado ? null : s.rep.id;
    const doRep = (r) => !repId || r.representante_id === repId;
    const wrap = el('div');
    mesRelOffset = 0;   // sempre abre no mês corrente
    const m = modal(wrap, { titulo: 'Relatórios' + (s.consolidado ? ' — todos os vendedores' : ' — ' + s.rep.nome), full: true });
    render();

    function render() {
      wrap.innerHTML = '';
      const hoje = hojeISO(), mesAtual = hoje.slice(0, 7);
      const mes = mesISOoffset(mesRelOffset);
      const ehMesAtual = mes === mesAtual, futuro = mes > mesAtual;
      // referência de "onde estamos" no mês: hoje (mês corrente), o último dia
      // (mês fechado) ou o dia 1 (mês que ainda não começou)
      const ref = ehMesAtual ? hoje : (futuro ? mes + '-01' : ultimoDiaISO(mes));
      const ano = mes.slice(0, 4);

      // navegação de mês
      wrap.appendChild(el('div', { class: 'row space gap8' },
        el('button', { class: 'btn-mini', 'aria-label': 'Mês anterior',
          onclick: () => { mesRelOffset--; render(); } }, ico('setaEsq')),
        el('strong', null, rotuloMes(mes)),
        el('button', { class: 'btn-mini', 'aria-label': 'Próximo mês',
          onclick: () => { mesRelOffset++; render(); } }, ico('setaDir'))));
      if (!ehMesAtual) wrap.appendChild(el('p', { class: 'sub c mt4' },
        futuro ? 'Mês que ainda não começou — dá para deixar a meta cadastrada.'
               : 'Mês fechado — os números são os finais.'));

      const peds = DB.all('pedidos').filter(doRep).filter(p => p.status === 'concluido');
      const pedsHoje = peds.filter(p => p.data_pedido === hoje);
      const vendHoje = pedsHoje.reduce((t, p) => t + Number(p.total_valor || 0), 0);
      const pedsMes = peds.filter(p => (p.data_pedido || '').slice(0, 7) === mes);
      const vendMes = pedsMes.reduce((t, p) => t + Number(p.total_valor || 0), 0);

      // visitas de hoje: na rota × fora da rota
      const ciclo = C.cicloDoDia(hoje, DB.config('ciclo_inicio', '2026-01-05'));
      const visHoje = DB.all('visitas').filter(doRep).filter(v => v.data_visita === hoje && v.realizada);
      const naRota = visHoje.filter(v => {
        const c = DB.byId('clientes', v.cliente_id);
        return c && c.semana_padrao === ciclo.semana && C.mesmoDia(c.dia_semana_padrao, ciclo.diaSemana);
      }).length;
      const fora = visHoje.length - naRota;

      // metas DO MÊS ESCOLHIDO (cada mês guarda a sua; sem valor próprio usa o padrão)
      const metaMes = metaDoPeriodo('meta_mes', mes);
      const metaDiaManual = metaDoPeriodo('meta_dia', mes);
      const metaNovos = metaDoPeriodo('meta_novos', mes);
      const mt = C.calcMeta({ metaMes, hoje: ref, vendidoMes: vendMes, metaDiaManual });
      // novos clientes do mês = clientes com venda a 15% (primeira compra)
      const novosMes = new Set(DB.all('visitas').filter(doRep)
        .filter(v => (v.data_visita || '').slice(0, 7) === mes &&
          Number(v.comissao_pct) === 15 && Number(v.comissao_valor) > 0)
        .map(v => v.cliente_id)).size;

      if (ehMesAtual) {
        wrap.appendChild(el('h3', { class: 'mt12' }, 'Hoje — ' + dataBR(hoje)));
        wrap.appendChild(el('div', { class: 'total-bar mt4' },
          el('span', null, pedsHoje.length + ' pedido(s) hoje'),
          el('strong', null, C.fmtMoney(vendHoje))));
        wrap.appendChild(el('div', { class: 'sub mt4' },
          `Visitas: ${naRota} na rota` + (fora ? ` + ${fora} fora da rota = ${visHoje.length} atendidos` : '')));
        if (mt.metaDia > 0) {
          const pctDia = Math.round(vendHoje / mt.metaDia * 100);
          wrap.appendChild(el('div', { class: 'progresso mt8' },
            el('div', { class: 'progresso-info' },
              `Meta do dia: ${C.fmtMoney(mt.metaDia)} · vendido ${C.fmtMoney(vendHoje)} · ${C.fmtPct(pctDia)}`),
            el('div', { class: 'progresso-barra' }, el('div', { class: 'progresso-fill', style: 'width:' + Math.min(100, pctDia) + '%' }))));
        }
      }

      // vendas do mês escolhido — a base do cálculo da meta
      wrap.appendChild(el('h3', { class: 'mt16' }, 'Vendas de ' + rotuloMes(mes)));
      wrap.appendChild(el('div', { class: 'total-bar mt4' },
        el('span', null, pedsMes.length + ' pedido(s) no mês'),
        el('strong', null, C.fmtMoney(vendMes))));

      // meta do ano (do ano do mês escolhido)
      const metaAno = metaDoPeriodo('meta_ano', ano);
      const pedsAno = peds.filter(p => (p.data_pedido || '').slice(0, 4) === ano);
      const vendAno = pedsAno.reduce((t, p) => t + Number(p.total_valor || 0), 0);

      wrap.appendChild(el('h3', { class: 'mt16' }, 'Meta de ' + rotuloMes(mes)));
      if (metaMes > 0) {
        wrap.appendChild(el('div', { class: 'progresso mt4' },
          el('div', { class: 'progresso-info' },
            `${C.fmtMoney(vendMes)} de ${C.fmtMoney(metaMes)} · ${C.fmtPct(mt.pct)} da meta`),
          el('div', { class: 'progresso-barra' }, el('div', { class: 'progresso-fill', style: 'width:' + Math.min(100, mt.pct) + '%' }))));
        if (ehMesAtual) {
          wrap.appendChild(el('div', { class: 'sub mt4' },
            `${mt.uteisDecorridos} de ${mt.uteisTotal} dias úteis · ritmo de ${C.fmtMoney(mt.ritmoDia)}/dia útil`));
          wrap.appendChild(el('div', { class: (mt.projecaoPct >= 100 ? 'sugestao' : 'aviso') + ' mt8' },
            `Nesse ritmo o mês fecha em ${C.fmtMoney(mt.projecao)} — ${C.fmtPct(mt.projecaoPct)} da meta.`));
        } else if (!futuro) {
          wrap.appendChild(el('div', { class: (mt.pct >= 100 ? 'sugestao' : 'aviso') + ' mt8' },
            mt.pct >= 100
              ? `Mês fechado batendo a meta (${C.fmtPct(mt.pct)}).`
              : `Mês fechado em ${C.fmtPct(mt.pct)} da meta — faltaram ${C.fmtMoney(C.round2(metaMes - vendMes))}.`));
        }
      } else {
        wrap.appendChild(el('p', { class: 'sub mt4' }, 'Nenhuma meta cadastrada para o mês.'));
      }
      // meta do ano
      wrap.appendChild(el('h3', { class: 'mt16' }, 'Meta do ano — ' + ano));
      if (metaAno > 0) {
        const pctAno = C.round2(vendAno / metaAno * 100);
        // ritmo pelos meses decorridos (mês atual conta proporcional aos dias úteis)
        const mesesDecorridos = ano < mesAtual.slice(0, 4) ? 12
          : (Number(mes.slice(5)) - 1) + (mt.uteisDecorridos / (mt.uteisTotal || 1));
        const projAno = mesesDecorridos > 0 ? C.round2(vendAno / mesesDecorridos * 12) : 0;
        wrap.appendChild(el('div', { class: 'progresso mt4' },
          el('div', { class: 'progresso-info' },
            `${C.fmtMoney(vendAno)} de ${C.fmtMoney(metaAno)} · ${C.fmtPct(pctAno)} da meta do ano`),
          el('div', { class: 'progresso-barra' }, el('div', { class: 'progresso-fill', style: 'width:' + Math.min(100, pctAno) + '%' }))));
        // a projeção do ano só faz sentido olhando de hoje; num mês passado
        // ela confundiria (o ano continuou correndo depois daquele mês)
        if (ehMesAtual) wrap.appendChild(el('div', { class: (projAno >= metaAno ? 'sugestao' : 'aviso') + ' mt8' },
          `Nesse ritmo o ano fecha em ${C.fmtMoney(projAno)} — ${C.fmtPct(metaAno > 0 ? C.round2(projAno / metaAno * 100) : 0)} da meta.`));
      } else {
        wrap.appendChild(el('p', { class: 'sub mt4' },
          C.fmtMoney(vendAno) + ' vendidos no ano. Nenhuma meta anual cadastrada.'));
      }

      // meta de novos clientes (vendas a 15% — interessante para o vendedor)
      wrap.appendChild(el('h3', { class: 'mt16' }, 'Novos clientes em ' + rotuloMes(mes) + ' (comissão 15%)'));
      if (metaNovos > 0) {
        const pctNv = Math.round(novosMes / metaNovos * 100);
        const projNv = ehMesAtual ? Math.round(novosMes / mt.uteisDecorridos * mt.uteisTotal) : novosMes;
        wrap.appendChild(el('div', { class: 'progresso mt4' },
          el('div', { class: 'progresso-info' }, `${novosMes} de ${metaNovos} novos clientes · ${C.fmtPct(pctNv)}`),
          el('div', { class: 'progresso-barra' }, el('div', { class: 'progresso-fill', style: 'width:' + Math.min(100, pctNv) + '%' }))));
        if (ehMesAtual) wrap.appendChild(el('div', { class: (projNv >= metaNovos ? 'sugestao' : 'aviso') + ' mt8' },
          `Nesse ritmo o mês fecha com ~${projNv} novo(s) cliente(s).`));
      } else {
        wrap.appendChild(el('p', { class: 'sub mt4' },
          novosMes + ' novo(s) cliente(s) em ' + rotuloMes(mes) + '. Nenhuma meta cadastrada.'));
      }
      if (s.papel === 'gestor') {
        const inMeta = el('input', { class: 'input', type: 'number', inputmode: 'decimal', placeholder: 'Meta de ' + rotuloMes(mes) + ' em R$ (ex.: 200000)', value: metaMes || '' });
        const inMetaDia = el('input', { class: 'input', type: 'number', inputmode: 'decimal', placeholder: 'Meta do DIA em R$ (vazio = mês ÷ dias úteis)', value: metaDiaManual || '' });
        const inMetaNovos = el('input', { class: 'input', type: 'number', inputmode: 'numeric', placeholder: 'Meta de NOVOS CLIENTES no mês (ex.: 10)', value: metaNovos || '' });
        const inMetaAno = el('input', { class: 'input', type: 'number', inputmode: 'decimal', placeholder: 'Meta de ' + ano + ' em R$ (ex.: 2400000)', value: metaAno || '' });
        wrap.appendChild(el('h4', { class: 'mt16' }, 'Cadastrar metas de ' + rotuloMes(mes)));
        wrap.appendChild(el('p', { class: 'sub mt4' },
          'A meta vale só para este mês. Os meses seguintes começam com o mesmo valor até você trocar — e os meses já fechados continuam com a meta que tinham.'));
        wrap.appendChild(el('div', { class: 'col gap8 mt8' }, inMeta, inMetaDia, inMetaAno, inMetaNovos,
          el('button', {
            class: 'btn w100', onclick: () => {
              const salvar = (base, periodo, valor) => {
                DB.upsertConfig(base + '_' + periodo, valor);      // histórico daquele período
                DB.upsertConfig(META_PADRAO[base], valor);         // e vira o padrão dos próximos
              };
              salvar('meta_mes', mes, Number(inMeta.value) || 0);
              salvar('meta_dia', mes, Number(inMetaDia.value) || 0);
              salvar('meta_novos', mes, Number(inMetaNovos.value) || 0);
              salvar('meta_ano', ano, Number(inMetaAno.value) || 0);
              toast('Metas de ' + rotuloMes(mes) + ' salvas.'); render();
            }
          }, rot('salvar', 'Salvar metas de ' + rotuloMes(mes)))));
      }

      // por rede (mês)
      wrap.appendChild(el('h3', { class: 'mt16' }, 'Por rede — ' + rotuloMes(mes)));
      const clientesAtivos = DB.all('clientes').filter(doRep).filter(c => c.status !== 'inativo');
      const porRede = {};
      for (const c of clientesAtivos)
        (porRede[C.redeDoCliente(c)] = porRede[C.redeDoCliente(c)] || { clientes: 0, pedidos: 0, valor: 0 }).clientes++;
      for (const p of pedsMes) {
        const c = DB.byId('clientes', p.cliente_id);
        const r = C.redeDoCliente(c || {});
        porRede[r] = porRede[r] || { clientes: 0, pedidos: 0, valor: 0 };
        porRede[r].pedidos++; porRede[r].valor += Number(p.total_valor || 0);
      }
      const linhas = Object.entries(porRede).sort((a, b) => b[1].valor - a[1].valor)
        .map(([rede, d]) => `<tr><td>${escH(rede)}</td><td class="c">${d.clientes}</td>` +
          `<td class="c">${d.pedidos}</td><td class="r"><strong>${C.fmtMoney(d.valor)}</strong></td></tr>`).join('');
      wrap.appendChild(el('div', { class: 'tabela-scroll mt8', html:
        `<table class="tabela"><thead><tr><th>Rede</th><th>Clientes</th><th>Pedidos</th><th>Vendido no mês</th></tr></thead>` +
        `<tbody>${linhas}</tbody></table>` }));

      // display / material deixado
      const comDisplay = clientesAtivos.filter(c => c.display_no_cliente);
      wrap.appendChild(el('h3', { class: 'mt16' }, 'Display/material nos clientes (' + comDisplay.length + ')'));
      if (comDisplay.length) {
        const listaEl = el('div', { class: 'col gap8 mt8' });
        comDisplay.slice(0, 30).forEach(c => listaEl.appendChild(el('button', {
          class: 'item-lista', onclick: () => fichaCliente(c.id)
        }, el('strong', null, c.nome),
          el('span', { class: 'sub' }, [c.cidade, c.uf].filter(Boolean).join(' - ') +
            (c.material_no_cliente ? ' · ' + c.material_no_cliente : '')))));
        wrap.appendChild(listaEl);
        if (comDisplay.length > 30) wrap.appendChild(el('p', { class: 'sub mt4' }, '… e mais ' + (comDisplay.length - 30) + '.'));
      } else {
        wrap.appendChild(el('p', { class: 'sub mt4' }, 'Nenhum cliente marcado com display no momento.'));
      }
    }
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
    combustivel: 'Combustível', pedagio: 'Pedágio', hospedagem: 'Hospedagem',
    alimentacao: 'Alimentação', manutencao: 'Manutenção',
    cartao_credito: 'Cartão de crédito', outro: 'Outro'
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
        el('button', { class: 'btn-mini', onclick: () => { mesFinOffset--; render(); }, 'aria-label': 'Mês anterior' }, ico('setaEsq')),
        el('h3', null, rotuloMes(mes) + (mesFinOffset === 0 ? ' · atual' : '')),
        el('button', { class: 'btn-mini', onclick: () => { mesFinOffset++; render(); }, 'aria-label': 'Próximo mês' }, ico('setaDir'))));

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
              (clamed ? ' · ' + (cli.rede || 'prazo especial') : '')),
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
            el('button', { class: 'btn-icon', onclick: async () => { if (await confirmar('Excluir lançamento?')) { DB.remove('despesas', d.id); render(); } } }, ico('lixeira')))))
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
      }, rot('globo', 'Geocodificar pendentes'))), { titulo: 'Geocodificação em massa' });
  }

  // ---------- Admin: Clientes ----------
  const CAMPOS_CLIENTE = ['nome', 'razao_social', 'cnpj_cpf', 'inscricao_estadual', 'contato', 'email', 'telefone', 'celular',
    'endereco', 'bairro', 'cidade', 'uf', 'cep', 'rede', 'tabela_permitida',
    'semana_padrao', 'dia_semana_padrao', 'frequencia_dias'];

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
        el('button', { class: 'btn btn-sec grow', onclick: importarCSV }, rot('subir', 'Importar CSV')),
        el('button', { class: 'btn btn-sec grow', onclick: exportarCSV }, rot('descer', 'Exportar'))));
      wrap.appendChild(el('div', { class: 'mt8' }, busca));
      wrap.appendChild(listaEl);
      function lista() {
        const q = busca.value.trim().toLowerCase();
        listaEl.innerHTML = '';
        DB.all('clientes').filter(c => !q || (c.nome || '').toLowerCase().includes(q) || (c.cidade || '').toLowerCase().includes(q))
          .sort((a, b) => (a.nome || '').localeCompare(b.nome || '')).slice(0, 100)
          .forEach(c => listaEl.appendChild(el('div', { class: 'hist-linha' },
            el('span', null, c.status === 'inativo' ? ico('bloquear', 'ic-sm') : null, c.nome + ' · ' + (c.cidade || '') +
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
                  // aceita "simples"/"lucro"/"presumido"; qualquer outra coisa = ambas
                  if (campo === 'tabela_permitida') v = C.tabelaPermitida({ tabela_permitida: /presumido|lucro/i.test(v) ? 'lucro' : v.toLowerCase() });
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
    const inp = (campo, rotulo, tipo) => {
      campos[campo] = el('input', { class: 'input', type: tipo || 'text', value: c[campo] != null ? c[campo] : '', placeholder: rotulo });
      return el('label', { class: 'campo' }, el('span', { class: 'sub' }, rotulo), campos[campo]);
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
    // qual tabela de preço o vendedor pode escolher neste cliente (evita erro no pedido)
    const tabSel = el('select', { class: 'input' },
      C.TABELAS_PERMITIDAS.map(([v, r]) =>
        el('option', { value: v, selected: C.tabelaPermitida(c) === v ? '' : null }, r)));
    const mm = modal(el('div', { class: 'col gap8' },
      inp('nome', 'Nome *'), inp('razao_social', 'Razão social'), inp('cnpj_cpf', 'CNPJ/CPF'),
      inp('inscricao_estadual', 'Inscrição Estadual'),
      inp('contato', 'Contato'), inp('email', 'E-mail', 'email'), inp('telefone', 'Telefone'), inp('celular', 'Celular'),
      inp('endereco', 'Endereço'), inp('bairro', 'Bairro'), inp('cidade', 'Cidade *'), inp('uf', 'UF *'), inp('cep', 'CEP'),
      inp('rede', 'Rede (ex.: Clamed)'), inp('recebimento_dias', 'Prazo comissão (dias — Clamed = 45)', 'number'),
      el('label', { class: 'campo' },
        el('span', { class: 'sub' }, 'Tabela de preço permitida neste cliente'), tabSel,
        el('span', { class: 'sub' }, 'Deixando só uma, o vendedor não escolhe errado na hora do pedido.')),
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
          const body = {
            representante_id: repSel.value, status: statusSel.value,
            dia_semana_padrao: diaSel.value || null, classe: classeSel.value,
            tabela_permitida: tabSel.value
          };
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
      }, rot('lixeira', 'Excluir cliente')) : null), { titulo: id ? 'Editar cliente' : 'Novo cliente', full: true });
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
            el('span', null, p.ativo === false ? ico('bloquear', 'ic-sm') : null, (p.codigo || '') + ' · ' + p.nome +
              (p.variacao ? ' (' + p.variacao + ')' : '') +
              ` · P=${p.unid_placa_p} G=${p.unid_placa_g} · ` +
              (p.preco_simples != null ? C.fmtMoney(Number(p.preco_simples)) : 'sem preço') + ' / ' +
              (p.preco_lucro != null ? C.fmtMoney(Number(p.preco_lucro)) : 'sem preço')),
            el('button', { class: 'btn-link', onclick: () => editar(p) }, 'editar')))));
    }
    function editar(p) {
      p = p || {};
      const f = {};
      const inp = (k, rotulo, tipo, step) => {
        f[k] = el('input', { class: 'input', type: tipo || 'text', step: step || null, value: p[k] != null ? p[k] : '', placeholder: rotulo });
        return el('label', { class: 'campo' }, el('span', { class: 'sub' }, rotulo), f[k]);
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
        }, rot('lixeira', 'Excluir produto')) : null), { titulo: p.id ? 'Editar produto' : 'Novo produto', full: true });
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
          el('span', null, r.ativo === false ? ico('bloquear', 'ic-sm') : null, r.nome + ' (' + r.papel + ') · ' + r.email +
            ` · ${r.comissao_pct_novo}%/${r.comissao_pct}% · ${C.fmtMoney(Number(r.custo_km || 0))}/km`),
          el('button', { class: 'btn-link', onclick: () => editar(r) }, 'editar')))));
    }
    function editar(r) {
      r = r || {};
      const f = {};
      const inp = (k, rotulo, tipo, step) => {
        f[k] = el('input', { class: 'input', type: tipo || 'text', step: step || null, value: r[k] != null ? r[k] : '', placeholder: rotulo });
        return el('label', { class: 'campo' }, el('span', { class: 'sub' }, rotulo), f[k]);
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
          }, rot('chave', 'Resetar senha')) : null,
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
      ['cupom_escala', 'Tamanho da letra do cupom 58mm (1 = normal · 1,2 = maior · 1,4 = bem grande)', 'number'],
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
      CHAVES.map(([k, rotulo, tipo]) => {
        inputs[k] = el('input', { class: 'input', type: tipo, step: 'any', value: String(DB.config(k, '') ?? '') });
        return el('label', { class: 'campo' }, el('span', { class: 'sub' }, rotulo), inputs[k]);
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
      grid), { titulo: 'Aparência' });
    TEMAS.forEach(([k, rotulo, cor]) => {
      grid.appendChild(el('button', {
        class: 'tema-opt' + ((localStorage.getItem('ns_tema') || 'ouro') === k ? ' ativo' : ''),
        onclick: (e) => {
          aplicarTema(k);
          grid.querySelectorAll('.tema-opt').forEach(b => b.classList.remove('ativo'));
          e.currentTarget.classList.add('ativo');
          toast('Tema ' + rotulo + ' aplicado.');
          montarTopbar();
        }
      }, el('span', { class: 'tema-bola', style: 'background:radial-gradient(circle at 32% 26%,#fff, ' + cor + ' 55%, #000c 140%)' }), rotulo));
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
      $('#view').innerHTML = '<div class="login-box"><h1>Configuração</h1>' +
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
