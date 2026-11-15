/* PROMPT STAR — app principal: login, Hoje (rota), clientes, pedidos, dashboard,
 * despesas e área administrativa do gestor. */
(function () {
  'use strict';
  const { $, $$, el, escH, toast, modal, confirmar, dataBR, hojeISO, mesISO, baixar,
    ico, icoHTML, rot, farol, repor, piscar, texto } = window.NSUI;
  const C = window.NSCalc, DB = window.NSDB, R = window.NSRota;

  // ================= MARCA =================
  // Marca "Estrada da Estrela": a rota do vendedor termina na estrela
  // Marca do app: a estrela oficial (arquivo de imagem, não desenho improvisado)
  const LOGO_ARQ = 'marca-estrela.png';
  const NOME_APP = 'Prompt Star';

  function logoMarca(soIcone) {
    const { el } = window.NSUI;
    const span = el('span', { class: 'logo-mark' },
      el('img', { src: LOGO_ARQ, alt: NOME_APP, width: 30, height: 30 }));
    // o nome sai exatamente como na logo: "Prompt Star.", com o ponto
    if (!soIcone) span.appendChild(el('strong', null, NOME_APP + '.'));
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
      el('img', { class: 'login-logo', src: LOGO_ARQ, alt: NOME_APP }),
      // na tela de entrada o nome sai exatamente como na logo: "Prompt Star."
      el('h1', { class: 'login-marca' }, NOME_APP + '.'),
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
  // a aba aberta fica gravada: se o celular fechar o app (ou a bateria acabar),
  // ao voltar ele abre exatamente onde o vendedor estava
  let viewAtual = (function () {
    const v = localStorage.getItem('ns_view');
    return (v && Object.prototype.hasOwnProperty.call(VIEWS, v)) ? v : 'hoje';
  })();

  // ── nomes novos do catálogo nas bases que já estão instaladas ──
  // O seed só roda na primeira instalação, então quem já usa o app continuaria
  // com o nome antigo. Isto renomeia UMA vez, sem mexer em preço, placa nem
  // pedido nenhum: o produto é o mesmo, só o nome muda.
  const RENOME_PRODUTOS = {
    'BRAG - BRINCO ARGOLINHA': '(BRAG) BRINCO ARGOLINHA',
    'BRP - BRINCO PEQUENO CLASSIC': '(BRP) BRINCO PEQUENO CLASSIC',
    'PONTO DE LUZ - ZIRCÔNIA': '(PONTO DE LUZ) PONTO DE LUZ ZIRCÔNIA',
    'LUXO DOURADO': '(LUXO) LUXO DOURADO',
    'LUXO PRATA': '(LUXO) LUXO PRATA',
    'PARIS - GARGANTILHA': '(PARIS) GARGANTILHA PARIS',
    'PULA - PULSEIRA ADULTA': '(PULA) PULSEIRA ADULTA',
    'PUL - PULSEIRA INFANTIL': '(PUL) PULSEIRA INFANTIL',
    'NEW YORK - GARGANTILHA': '(NEW YORK) GARGANTILHA NEW YORK',
    'ANEL REGULÁVEL': '(ANEL) ANEL REGULÁVEL'
  };
  function renomearCatalogo() {
    if (localStorage.getItem('ns_renome_prod') === '1') return;
    let mudou = 0;
    for (const p of DB.all('produtos')) {
      const novo = RENOME_PRODUTOS[p.nome];
      if (novo && novo !== p.nome) { DB.update('produtos', p.id, { nome: novo }); mudou++; }
    }
    localStorage.setItem('ns_renome_prod', '1');
    if (mudou) console.log('[catálogo] ' + mudou + ' produtos renomeados');
  }

  // ── produtos novos do catálogo nas bases que já estão instaladas ──
  // Mesmo caso do renome: o seed só roda na primeira instalação. Entra com o id
  // FIXO, então se o celular do Denilson e o do Guilherme cadastrarem ao mesmo
  // tempo, os dois gravam o MESMO documento — nunca sai produto repetido.
  // Nada é sobrescrito: se o produto já existe, não encosta no preço dele.
  const PRODUTOS_NOVOS = [{
    id: 'prod-gift-collection', codigo: null, nome: '(GIFT) GIFT COLLECTION',
    variacao: null, linha: 'Gift Collection',
    preco_simples: 54.9, preco_lucro: 59.9,
    unid_placa_p: 27, unid_placa_g: 45, suporte: 'display', ativo: true
  }];
  function completarCatalogo() {
    const existe = new Set(DB.all('produtos').map(p => String(p.nome || '')));
    const porId = new Set(DB.all('produtos').map(p => p.id));
    for (const novo of PRODUTOS_NOVOS) {
      if (existe.has(novo.nome) || porId.has(novo.id)) continue;
      DB.insert('produtos', Object.assign({}, novo));
      console.log('[catálogo] produto incluído: ' + novo.nome);
    }
  }

  function iniciarApp() {
    $('#topbar').style.display = ''; $('#tabs').style.display = ''; $('#fab').style.display = '';
    try { renomearCatalogo(); } catch (e) {}
    montarTopbar();
    nav(viewAtual);
    // sempre sincroniza (fila + download) ao abrir e re-renderiza com os dados novos
    // O produto novo entra DEPOIS da sincronização de propósito: gravar antes
    // põe uma escritura na fila, e uma escritura na fila faz a abertura pular a
    // puxada. Sem sinal não há puxada nenhuma, então ali entra na hora.
    if (navigator.onLine && DB.configured())
      Promise.resolve(DB.sync()).then(() => {
        if (!sessao()) return; // representante removido do servidor — mantém a tela atual
        try { completarCatalogo(); } catch (e) {}
        montarTopbar(); nav(viewAtual);
        avisarPendentesNewStar();
      }).catch(() => {});
    else { try { completarCatalogo(); } catch (e) {} avisarPendentesNewStar(); }
  }

  // ── aviso de pedidos que faltam faturar no New Star ──
  // Aparece TODA vez que o app abre, enquanto houver pedido pendente. Olha só os
  // últimos 30 dias: pedido antigo demais já foi resolvido de outro jeito e viraria
  // um aviso eterno.
  const DIAS_ALERTA_FATURAMENTO = 30;
  function pedidosSemFaturar() {
    const repId = repEfetivoId();
    const limite = new Date(Date.now() - DIAS_ALERTA_FATURAMENTO * 86400000).toISOString().slice(0, 10);
    return DB.all('pedidos')
      .filter(doHistorico(repId))
      .filter(p => p.status === 'concluido' && !p.faturado_ns)
      .filter(p => (p.data_pedido || '') >= limite)
      .sort((a, b) => (a.data_pedido || '').localeCompare(b.data_pedido || ''));
  }
  function avisarPendentesNewStar() {
    if (!sessao()) return;
    const peds = pedidosSemFaturar();
    if (!peds.length) return;
    // Aviso curto e no meio da tela: só diz QUE existe pendência e leva para a
    // aba Pedidos. O nome, o número e o valor ficam lá — aqui não cabem e só
    // faziam o aviso virar uma tela inteira.
    const um = peds.length === 1;
    const corpo = el('div', { class: 'pend-corpo' },
      el('div', { class: 'pend-selo' }, ico('notaFiscal')),
      el('p', { class: 'pend-titulo' }, 'Existem pedidos pendentes para serem faturados no Newstar!'),
      el('p', { class: 'pend-sub' }, um ? '1 pedido esperando' : peds.length + ' pedidos esperando'),
      el('button', {
        class: 'btn big w100 mt12 btn-pendente', onclick: () => { m.fechar(); nav('pedidos'); }
      }, rot('recibo', 'Acessar pedidos')),
      el('button', { class: 'btn-link w100 mt8', onclick: () => m.fechar() }, 'Agora não'));
    const m = modal(corpo, { titulo: null, centro: true, classe: 'modal-pendente' });
    try { window.NSUI.vibrar([30, 60, 30]); } catch (e) {}
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
    // online, sem fila, mas a última puxada falhou: não pode dizer "sincronizado"
    else if (st.pullErro) { chip.textContent = 'sem atualizar'; chip.className = 'sync-chip erro'; }
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
      // sem isto o app dizia "Online / 0 pendentes" mesmo passando horas sem baixar nada
      st.pullErro ? el('div', { class: 'aviso-box mt8' },
        el('strong', null, ico('alerta', 'ic-erro'), 'Os dados não estão sendo atualizados'),
        el('p', { class: 'sub mt4' }, st.pullErro.cota
          ? 'O banco de dados atingiu o limite diário de leitura do plano gratuito. ' +
            'NADA FOI PERDIDO: tudo o que você digitou já foi salvo (as escrituras continuam ' +
            'funcionando) e o app segue trabalhando normalmente com os dados do aparelho. ' +
            'A atualização volta sozinha depois da virada do dia.'
          : st.pullErro.espaco
            ? 'O armazenamento do aparelho ficou sem espaço (as assinaturas dos pedidos são ' +
              'imagens e ocupavam muito). NADA FOI PERDIDO: o app já moveu as assinaturas para ' +
              'outro lugar e liberou espaço. Toque em "Sincronizar agora" logo abaixo.'
            : st.pullErro.msg),
        el('p', { class: 'sub mt4' }, 'Última tentativa: ' + new Date(st.pullErro.em).toLocaleString('pt-BR'))) : null,
      st.erros.length ? el('div', { class: 'mt8' },
        el('strong', null, ico('alerta', 'ic-erro'), st.erros.length + ' erro(s) de sincronização'),
        el('div', { class: 'sub', style: 'max-height:120px;overflow:auto' },
          st.erros.map(e => el('div', null, e.erro))),
        el('button', { class: 'btn-link', onclick: () => { DB.clearErros(); } }, 'limpar erros')) : null,
      el('button', {
        class: 'btn w100 mt12', onclick: async () => {
          await DB.sync(true);
          const d = DB.status();
          toast(d.pullErro ? 'Não deu para baixar os dados agora: ' + d.pullErro.msg
            : 'Sincronização executada.', d.pullErro ? 'erro' : '');
        }
      }, 'Sincronizar agora')), { titulo: 'Sincronização' });
  }

  function nav(v) {
    viewAtual = v;
    try { localStorage.setItem('ns_view', v); } catch (e) {}
    $$('#tabs button').forEach(b => b.classList.toggle('ativo', b.dataset.v === v));
    const view = $('#view');
    view.innerHTML = '';
    VIEWS[v](view);
    view.scrollTop = 0;
  }

  // ================= HELPERS DE DOMÍNIO =================
  // ── carteira compartilhada ──
  // Ligada (padrão), TODOS os vendedores enxergam TODOS os clientes ativos: é a
  // mesma carteira para a equipe inteira. O que continua separado por vendedor:
  //   • a ROTA do dia (cada um monta a sua — campos rota_dia__<vendedor>)
  //   • a VISITA e o PEDIDO (ficam no nome de quem atendeu/vendeu)
  //   • a COMISSÃO (sai do pedido, então também é de quem vendeu)
  // Desligando em Admin → Configurações, cada vendedor volta a ver só os
  // clientes que estão no nome dele, como era antes.
  const carteiraCompartilhada = () => DB.config('carteira_compartilhada', true) !== false;
  // Com a carteira compartilhada o HISTÓRICO é da equipe: todo mundo enxerga os
  // pedidos e as visitas de todo mundo, porque é o histórico DA FARMÁCIA, e o
  // vendedor precisa saber o que já foi deixado lá. O DINHEIRO continua de cada
  // um: comissão, meta, painel, despesas e financeiro nunca se misturam.
  const doHistorico = (repId) => (r) =>
    !repId || carteiraCompartilhada() || r.representante_id === repId;
  // nome de quem vendeu/atendeu, para o histórico da equipe não virar bagunça
  const nomeDoRep = (repId) => {
    const r = repId ? DB.byId('representantes', repId) : null;
    return r ? r.nome : '';
  };
  function clientesDoRep(repId) {
    return DB.all('clientes').filter(c => c.status !== 'inativo' &&
      (!repId || carteiraCompartilhada() || c.representante_id === repId));
  }
  function repEfetivoId() {
    const s = sessao();
    return s.consolidado ? null : s.rep.id;
  }
  // Mesma régua do farol da aba Clientes: atrasado é quem passou do ciclo SEM
  // PEDIDO. Em "dias" vai o que importa para o vendedor — há quantos dias
  // aquele cliente não compra.
  function alertasCiclo(repId) {
    const avisoDias = Number(DB.config('alerta_vencendo_dias', 7));
    const out = { atrasados: [], vencendo: [] };
    for (const c of clientesDoRep(repId)) {
      const dias = diasSemPedido(c);
      if (dias >= 9999) continue;           // nunca comprou: não é atraso de ciclo
      const falta = cicloDoCliente(c) - dias;
      if (falta < 0) out.atrasados.push({ c, dias, falta });
      else if (falta <= avisoDias) out.vencendo.push({ c, dias, falta });
    }
    out.atrasados.sort((a, b) => b.dias - a.dias);
    out.vencendo.sort((a, b) => a.falta - b.falta);
    return out;
  }
  function visitouHoje(clienteId) {
    return DB.all('visitas').find(v => v.cliente_id === clienteId && v.data_visita === hojeISO() && v.realizada);
  }

  // ================= VIEW: HOJE / PRÓXIMOS DIAS =================
  // ================= ROTA MANUAL (o vendedor monta) =================
  const DIAS_ROTA = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta'];
  // dia da semana em edição/visualização — também gravado, para o app voltar
  // no mesmo dia de rota depois de fechado
  let diaRota = (function () {
    const d = localStorage.getItem('ns_dia_rota');
    return DIAS_ROTA.indexOf(d) >= 0 ? d : null;
  })();
  let filtroRota = 'todos'; // 'todos' ou 'prospec' (só as prospecções da rota)
  function trocarDia(d) {
    diaRota = d;
    try { localStorage.setItem('ns_dia_rota', d); } catch (e) {}
  }

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
  // Faixa do ÚLTIMO PEDIDO: a informação que o vendedor mais procura na lista.
  // Mostra a data e há quantos dias o cliente não compra, com a cor do farol —
  // vermelho quando já passou do ciclo da classe.
  function faixaUltimoPedido(c) {
    const dias = diasSemPedido(c);
    const nunca = dias >= 9999;
    const ciclo = cicloDoCliente(c);
    const cor = nunca ? 'cinza' : (dias > ciclo ? 'vermelho' : (ciclo - dias <= 7 ? 'amarelo' : 'verde'));
    return el('div', { class: 'ped-chip ' + cor },
      ico('recibo', 'ic-sm'),
      el('span', { class: 'ped-rot' }, 'ÚLTIMO PEDIDO'),
      el('strong', null, nunca ? 'nunca comprou' : dataBR(c.ultimo_pedido_em) || '—'),
      nunca ? null : el('span', { class: 'ped-dias' }, dias + ' dias'));
  }
  // ordem padrão da seleção: prioridade (A→C) e depois quem está há mais tempo sem pedido
  function ordenarParaRota(lista) {
    return lista.sort((a, b) =>
      C.classeRank(a) - C.classeRank(b) || diasSemPedido(b) - diasSemPedido(a));
  }
  // ── a rota é de CADA vendedor ──
  // Na carteira compartilhada os dois enxergam os mesmos clientes, mas o
  // roteiro é pessoal: cada vendedor tem os campos dele dentro do cliente
  // (rota_dia__<vendedor> / rota_ordem__<vendedor>). Assim um nunca apaga a
  // rota do outro — nem trabalhando offline, porque cada gravação mexe só nos
  // campos do próprio vendedor.
  // Os campos ANTIGOS (rota_dia / rota_ordem) continuam valendo como a rota de
  // quem é o dono do cadastro, até ele mexer pela primeira vez: quem já tinha
  // rota montada não perde nada quando o app atualiza.
  const sufixoRep = (repId) => String(repId || '').replace(/[^A-Za-z0-9]/g, '_');
  const campoDia = (repId) => 'rota_dia__' + sufixoRep(repId);
  const campoOrdem = (repId) => 'rota_ordem__' + sufixoRep(repId);
  const temCampo = (c, k) => Object.prototype.hasOwnProperty.call(c, k);
  // de quem é a rota que está na tela: o vendedor logado, ou o que o gestor
  // escolheu ver. No consolidado ("todos") não existe rota para montar.
  function repDaRota() {
    const s = sessao();
    return (s && !s.consolidado) ? s.rep.id : null;
  }
  function rotaDiaDe(c, repId) {
    if (!c) return null;
    if (!repId) {   // gestor vendo "todos": vale a rota de qualquer vendedor
      const k = Object.keys(c).find(x => x.indexOf('rota_dia__') === 0 && c[x]);
      return k ? c[k] : (c.rota_dia || null);
    }
    const k = campoDia(repId);
    if (temCampo(c, k)) return c[k] || null;
    return (c.representante_id === repId) ? (c.rota_dia || null) : null;
  }
  function rotaOrdemDe(c, repId) {
    const k = campoOrdem(repId);
    if (repId && temCampo(c, k)) return c[k];
    return (!repId || c.representante_id === repId) ? c.rota_ordem : null;
  }
  // grava dia e posição do vendedor. Para o DONO do cadastro os campos antigos
  // continuam sendo atualizados junto, para nada depender da migração.
  function gravarRota(c, repId, dia, ordem) {
    const patch = {};
    patch[campoDia(repId)] = dia;
    patch[campoOrdem(repId)] = ordem;
    if (c.representante_id === repId) { patch.rota_dia = dia; patch.rota_ordem = ordem; }
    Object.assign(c, patch);
    DB.update('clientes', c.id, patch);
  }
  // outro vendedor já tem este cliente no MESMO dia? (evita visita dobrada)
  function outrosNaRota(c, dia, repId) {
    if (!dia || !carteiraCompartilhada()) return [];
    return DB.all('representantes')
      .filter(r => r.papel === 'vendedor' && r.ativo !== false && r.id !== repId)
      .filter(r => rotaDiaDe(c, r.id) === dia)
      .map(r => r.nome);
  }
  // A ordem da rota é SEMPRE a que o vendedor deixou salva (campo rota_ordem).
  // O desempate é por id, nunca pela ordem em que o Firestore devolveu os dados —
  // era isso que fazia a rota aparecer embaralhada depois de fechar e abrir o app.
  function clientesDaRota(repId, dia) {
    return clientesDoRep(repId).filter(c => rotaDiaDe(c, repId) === dia)
      .sort((a, b) => (ordemDe(a, repId) - ordemDe(b, repId)) ||
        String(a.id).localeCompare(String(b.id)));
  }
  // quem ainda não tem posição salva vai para o fim (e nunca embaralha os demais)
  const ordemDe = (c, repId) => {
    const n = Number(rotaOrdemDe(c, repId));
    return (Number.isFinite(n) && n > 0) ? n : 1e9;
  };
  // grava a ordem manual: a posição na lista vira rota_ordem 1, 2, 3…
  function gravarOrdem(lista, repId) {
    repId = repId || repDaRota();
    lista.forEach((c, i) => {
      if (Number(rotaOrdemDe(c, repId)) !== i + 1)
        gravarRota(c, repId, rotaDiaDe(c, repId), i + 1);
    });
  }
  // conserta posições faltando ou repetidas (rotas antigas, ou dois clientes que
  // caíram no mesmo número) gravando 1,2,3… uma única vez, sem mexer na sequência
  function normalizarOrdem(lista, repId) {
    repId = repId || repDaRota();
    const precisa = lista.some((c, i) => Number(rotaOrdemDe(c, repId)) !== i + 1);
    if (precisa) gravarOrdem(lista, repId);
    return lista;
  }
  // tira o cliente da rota DESTE vendedor (a do outro fica como está)
  function tirarDaRota(c, repId) {
    gravarRota(c, repId || repDaRota(), null, null);
  }
  // põe o cliente na rota de um dia, no fim da fila
  function porNaRota(cliente, dia, repId) {
    repId = repId || repDaRota() || cliente.representante_id;
    const atuais = clientesDaRota(repId, dia);
    const ultima = atuais.reduce((m, c) => Math.max(m, Number(rotaOrdemDe(c, repId)) || 0), 0);
    gravarRota(cliente, repId, dia, ultima + 1);
  }
  // prospecção = possível cliente que ainda não compra; entra na rota igual
  const ehProspec = (c) => c && c.status === 'prospect';
  // nome que aparece na tela: fantasia quando existir, senão o nome cadastrado
  const nomeExib = (c) => (c && (c.nome_fantasia || c.nome)) || '—';
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
    return visitaNoDia(clienteId, hojeISO());
  }
  // visita registrada numa data específica — usada para mostrar o histórico da
  // semana: na quinta-feira, a aba de quarta continua marcando quem foi atendido
  function visitaNoDia(clienteId, dataISO) {
    return DB.all('visitas').find(v => v.cliente_id === clienteId &&
      v.data_visita === dataISO && v.realizada);
  }

  // ---- visão do gestor (todos os vendedores, somente leitura) ----
  function vRotaConsolidado(view) {
    if (!diaRota) trocarDia(diaDeHoje());
    view.appendChild(abaDias(() => nav('hoje')));
    const reps = DB.all('representantes').filter(r => r.papel !== 'gestor' && r.ativo !== false);
    for (const rep of reps) {
      const lista = clientesDaRota(rep.id, diaRota);
      const feitos = lista.filter(c => visitaNoDia(c.id, dataDoDia(diaRota))).length;
      view.appendChild(el('h3', { class: 'mt16' }, ico('usuario', 'ic-sm'), rep.nome +
        (lista.length ? ` — ${feitos}/${lista.length} visitados` : '')));
      if (!lista.length) { view.appendChild(el('p', { class: 'vazio' }, 'Sem rota criada para ' + diaRota + '.')); continue; }
      const box = el('div', { class: 'col gap8 mt8' });
      lista.forEach((c, i) => box.appendChild(el('div', {
        class: 'card-visita st-' + statusDoCliente(c).k + (visitaNoDia(c.id, dataDoDia(diaRota)) ? ' feito' : ''),
        onclick: () => fichaCliente(c.id)
      },
        el('div', { class: 'row space' },
          el('div', null,
            el('strong', null, el('span', { class: 'st-tag ' + statusDoCliente(c).k }), marcaAlerta(c), `${i + 1}. ${c.nome}`),
            el('div', { class: 'sub' }, [c.cidade, c.uf].filter(Boolean).join(' - '))),
          visitaNoDia(c.id, dataDoDia(diaRota)) ? el('span', { class: 'badge ok' }, ico('check', 'ic-sm')) : null))));
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
        onclick: () => { trocarDia(d); aoTrocar(); }
      }, d + ' ' + dataDoDia(d).slice(8, 10) + '/' + dataDoDia(d).slice(5, 7)))));
  }

  // ---- tela principal da rota ----
  function vRota(view) {
    const s = sessao();
    if (s.consolidado) return vRotaConsolidado(view);
    const rep = s.rep;
    if (!diaRota) trocarDia(diaDeHoje());
    // a sequência salva manda; só arruma números faltando/repetidos de rotas antigas
    const lista = normalizarOrdem(clientesDaRota(rep.id, diaRota));

    view.appendChild(abaDias(() => nav('hoje')));
    view.appendChild(el('div', { class: 'row space mt8' },
      el('h2', null, 'Rota de ' + diaRota + (diaRota === diaDeHoje() ? ' (hoje)' : '')),
      el('span', { class: 'badge' }, lista.length + ' cliente(s)')));

    // data do dia que está aberto na aba — na quinta, a aba de quarta usa a data
    // de quarta, e por isso as visitas daquele dia continuam aparecendo
    const dataDaAba = dataDoDia(diaRota);
    if (lista.length) {
      const feitos = lista.filter(c => visitaNoDia(c.id, dataDaAba)).length;
      const pct = Math.round(feitos / lista.length * 100);
      view.appendChild(el('div', { class: 'progresso mt8' },
        el('div', { class: 'progresso-info' }, `${feitos} de ${lista.length} visitados · ${C.fmtPct(pct)}`),
        el('div', { class: 'progresso-barra' }, el('div', { class: 'progresso-fill', style: 'width:' + pct + '%' }))));
    }

    // uma ação principal + um menu com o resto: a tela abre no que importa
    view.appendChild(el('div', { class: 'row gap8 mt12' },
      el('button', {
        class: 'btn big grow', onclick: () => telaCriarRota(rep)
      }, lista.length ? rot('lapis', 'Editar rota de ' + diaRota) : rot('mais', 'Criar rota de ' + diaRota)),
      lista.length ? el('button', {
        class: 'btn big btn-sec', 'aria-label': 'Ferramentas da rota', onclick: () => ferramentasRota(lista)
      }, ico('menu')) : null));

    // ── histórico do dia: quem foi atendido nesta data mas não está mais na rota
    // (mudou de dia, foi removido, ou o pedido entrou fora da rota). Fica no fim,
    // apagado, só para o vendedor não visitar o mesmo cliente duas vezes.
    const idsNaRota = new Set(lista.map(c => c.id));
    const atendidosFora = DB.all('visitas')
      .filter(v => v.data_visita === dataDaAba && v.realizada &&
        (!rep.id || v.representante_id === rep.id) && !idsNaRota.has(v.cliente_id))
      .map(v => ({ v, c: DB.byId('clientes', v.cliente_id) }))
      .filter(x => !!x.c);

    function pintarHistorico() {
      if (!atendidosFora.length) return;
      view.appendChild(el('h4', { class: 'mt16' },
        'Também atendidos em ' + dataBR(dataDaAba) + ' (' + atendidosFora.length + ')'));
      const histEl = el('div', { class: 'col gap8 mt8' });
      view.appendChild(histEl);
      atendidosFora.forEach(({ v, c }) => {
        histEl.appendChild(el('button', {
          class: 'card-visita feito historico', onclick: () => fichaCliente(c.id)
        },
          el('div', { class: 'row space' },
            el('strong', null, nomeExib(c)),
            el('span', { class: 'badge ok' }, ico('check', 'ic-sm'),
              v.fez_pedido ? 'pedido' : 'visitado')),
          el('div', { class: 'sub' }, [c.cidade, c.uf].filter(Boolean).join(' - ') +
            ' · ' + dataBR(v.data_visita) +
            (v.fez_pedido ? ' · ' + C.fmtMoney(Number(v.valor_pedido || 0)) : ' · sem pedido'))));
      });
    }

    // ── filtros da rota: prospecção e clientes prioritários
    const nProspec = lista.filter(ehProspec).length;
    const nPrior = lista.filter(ehPrioritario).length;
    if (lista.length) {
      view.appendChild(el('div', { class: 'dias-scroll mt12' },
        el('button', {
          class: 'chip' + (filtroRota === 'todos' ? ' ativo' : ''),
          onclick: () => { filtroRota = 'todos'; nav('hoje'); }
        }, 'Todos ' + lista.length),
        el('button', {
          class: 'chip prospec' + (filtroRota === 'prospec' ? ' ativo' : ''),
          onclick: () => { filtroRota = 'prospec'; nav('hoje'); }
        }, ico('alvo', 'ic-sm'), 'Prospecção ' + nProspec),
        el('button', {
          class: 'chip prioritario' + (filtroRota === 'prioridade' ? ' ativo' : ''),
          onclick: () => { filtroRota = 'prioridade'; nav('hoje'); }
        }, ico('estrela', 'ic-sm'), 'Prioritários ' + nPrior)));
    }


    const listaEl = el('div', { class: 'col gap8 mt12' });
    view.appendChild(listaEl);
    if (!lista.length) {
      listaEl.appendChild(el('p', { class: 'vazio' },
        'Nenhum cliente na rota de ' + diaRota + '. Toque em "Criar rota" para escolher os clientes.'));
      pintarHistorico();
      return;
    }

    // o filtro só esconde da tela: a posição (1, 2, 3…) continua sendo a da rota inteira
    const visiveis = filtroRota === 'prospec' ? lista.filter(ehProspec)
      : filtroRota === 'prioridade' ? lista.filter(ehPrioritario) : lista;
    if (!visiveis.length)
      listaEl.appendChild(el('p', { class: 'vazio' }, filtroRota === 'prioridade'
        ? 'Nenhum cliente prioritário na rota de ' + diaRota + '.'
        : 'Nenhuma prospecção na rota de ' + diaRota + '.'));

    // ── quem falta primeiro, quem já foi atendido no fim, separados por título
    const pendentes = visiveis.filter(c => !visitaNoDia(c.id, dataDaAba));
    const atendidos = visiveis.filter(c => visitaNoDia(c.id, dataDaAba));

    function cartaoPendente(c) {
      const i = lista.indexOf(c);
      const st = statusDoCliente(c);
      const nota = ultimaNota(c.id);
      return el('div', {
        class: 'card-visita st-' + st.k +
          (ehProspec(c) ? ' prospec' : '') + (ehPrioritario(c) ? ' prioritario' : ''),
        'data-id': c.id
      },
        el('div', { class: 'cv-topo', onclick: () => fichaCliente(c.id) },
          el('span', { class: 'ordem-num' }, String(i + 1)),
          el('div', { class: 'grow' },
            el('strong', { class: 'cv-nome' }, marcaAlerta(c), nomeExib(c)),
            c.cnpj_cpf ? el('div', { class: 'cnpj-chip mt4' },
              el('span', { class: 'cnpj-rot' },
                String(c.cnpj_cpf).replace(/\D/g, '').length === 11 ? 'CPF' : 'CNPJ'),
              C.fmtCNPJ(c.cnpj_cpf)) : null),
          el('span', { class: 'farol-grande ' + st.k, title: st.rot })),
        (ehProspec(c) || ehPrioritario(c)) ? el('div', { class: 'row gap8 mt8 selos' },
          ehPrioritario(c) ? el('span', { class: 'badge prioritario' }, ico('estrela', 'ic-sm'), 'PRIORIDADE') : null,
          ehProspec(c) ? el('span', { class: 'badge prospec' }, 'PROSPECÇÃO') : null) : null,
        // o outro vendedor tem o mesmo cliente hoje: combine antes de ir
        (() => {
          const outros = outrosNaRota(c, diaRota, rep.id);
          return outros.length ? el('div', { class: 'aviso-dupla mt8' }, ico('alerta', 'ic-sm'),
            outros.join(' e ') + ' também tem este cliente em ' + diaRota) : null;
        })(),
        el('div', { class: 'cv-info mt8', onclick: () => fichaCliente(c.id) },
          el('div', null, ico('pin', 'ic-sm'),
            [c.endereco, c.bairro, c.cidade].filter(Boolean).join(', ') || 'sem endereço'),
          (c.telefone || c.celular) ? el('div', null, ico('telefone', 'ic-sm'), c.telefone || c.celular) : null,
          el('div', null, ico('relogio', 'ic-sm'), st.rot +
            ' · classe ' + C.classeDe(c) + ' (' + cicloDoCliente(c) + 'd)' +
            ' · ' + txtDias(diasSemPedido(c), 'pedido'))),
        nota ? el('div', { class: 'nota-previa mt8' }, nota.length > 90 ? nota.slice(0, 90) + '…' : nota) : null,
        // ação principal: grande, sozinha, impossível de errar
        el('button', {
          class: 'btn big w100 btn-visita mt12', onclick: () => dialogoVisita(c, rep)
        }, rot('check', 'Registrar visita')),
        // ações secundárias: ícones pequenos, sem poluir
        el('div', { class: 'cv-acoes mt8' },
          botaoMaps(c),
          el('button', {
            class: 'btn-mini' + (ehPrioritario(c) ? ' prioritario' : ''),
            'aria-label': 'Prioridade', title: ehPrioritario(c) ? 'Tirar a prioridade' : 'Marcar como prioridade',
            onclick: () => alternarPrioridade(c, () => nav('hoje'))
          }, ico('estrela')),
          el('button', {
            class: 'btn-mini', disabled: i === 0 ? '' : null, 'aria-label': 'Subir na rota',
            onclick: () => { const n = lista.slice(); n.splice(i - 1, 0, n.splice(i, 1)[0]); gravarOrdem(n); nav('hoje'); }
          }, ico('subir')),
          el('button', {
            class: 'btn-mini', disabled: i === lista.length - 1 ? '' : null, 'aria-label': 'Descer na rota',
            onclick: () => { const n = lista.slice(); n.splice(i + 1, 0, n.splice(i, 1)[0]); gravarOrdem(n); nav('hoje'); }
          }, ico('descer')),
          el('button', {
            class: 'btn-mini', 'aria-label': 'Mais opções', onclick: () => maisOpcoes(c, i)
          }, ico('menu'))));
    }

    // menu com o que raramente se usa — tira 4 botões de cada cartão
    function maisOpcoes(c, i, jaAtendido) {
      const m = modal(el('div', { class: 'col gap8' },
        jaAtendido ? el('button', {
          class: 'btn btn-sec w100', onclick: () => { m.fechar(); dialogoVisita(c, rep); }
        }, rot('mais', 'Atender de novo')) : null,
        el('button', {
          class: 'btn btn-sec w100', disabled: i === 0 ? '' : null,
          onclick: () => { const n = lista.slice(); n.unshift(n.splice(i, 1)[0]); gravarOrdem(n); m.fechar(); nav('hoje'); }
        }, rot('subir', 'Mandar para o 1º lugar')),
        el('button', {
          class: 'btn btn-sec w100', disabled: i === lista.length - 1 ? '' : null,
          onclick: () => { const n = lista.slice(); n.push(n.splice(i, 1)[0]); gravarOrdem(n); m.fechar(); nav('hoje'); }
        }, rot('descer', 'Mandar para o último lugar')),
        el('button', {
          class: 'btn btn-sec w100', onclick: () => { m.fechar(); fichaCliente(c.id); }
        }, rot('usuario', 'Abrir ficha do cliente')),
        el('button', {
          class: 'btn btn-sec w100 btn-perigo', onclick: () => { m.fechar(); removerDaRota(c); }
        }, rot('fechar', 'Tirar da rota de ' + diaRota)),
        ehProspec(c) ? el('button', {
          class: 'btn btn-sec w100 btn-perigo',
          onclick: () => { m.fechar(); excluirProspeccao(c, () => nav('hoje')); }
        }, rot('lixeira', 'Excluir esta prospecção')) : null),
        { titulo: nomeExib(c) });
    }

    function cartaoAtendido(c) {
      const i = lista.indexOf(c);
      const v = visitaNoDia(c.id, dataDaAba);
      const st = statusDoCliente(c);
      return el('div', {
        class: 'card-visita feito compacto st-' + st.k + (ehProspec(c) ? ' prospec' : ''),
        'data-id': c.id
      },
        el('div', { class: 'cv-topo', onclick: () => fichaCliente(c.id) },
          el('span', { class: 'ordem-num' }, String(i + 1)),
          el('div', { class: 'grow' },
            el('strong', { class: 'cv-nome' }, nomeExib(c)),
            c.cnpj_cpf ? el('div', { class: 'cnpj-chip mt4' },
              el('span', { class: 'cnpj-rot' },
                String(c.cnpj_cpf).replace(/\D/g, '').length === 11 ? 'CPF' : 'CNPJ'),
              C.fmtCNPJ(c.cnpj_cpf)) : null),
          el('span', { class: 'badge ok' }, ico('check', 'ic-sm'),
            v.fez_pedido ? 'pedido' : 'visitado')),
        el('div', { class: 'atendido-linha mt8' }, ico('check', 'ic-sm'),
          'Atendido em ' + dataBR(v.data_visita) +
          (v.fez_pedido ? ' · ' + C.fmtMoney(Number(v.valor_pedido || 0)) : ' · sem pedido')),
        el('div', { class: 'cv-acoes mt8' },
          botaoMaps(c),
          // clicou sem querer? dá para desfazer, com confirmação
          el('button', {
            class: 'btn-mini vermelho grow', onclick: () => excluirVisita(v, c)
          }, rot('retorno', 'Desfazer visita')),
          el('button', {
            class: 'btn-mini', 'aria-label': 'Mais opções', onclick: () => maisOpcoes(c, i, true)
          }, ico('menu'))));
    }

    if (pendentes.length) {
      listaEl.appendChild(el('div', { class: 'secao-rota' },
        el('strong', null, 'A visitar'),
        el('span', { class: 'badge' }, String(pendentes.length))));
      pendentes.forEach(c => listaEl.appendChild(cartaoPendente(c)));
    }
    if (atendidos.length) {
      listaEl.appendChild(el('div', { class: 'secao-rota feita mt16' },
        el('strong', null, ico('check', 'ic-sm'), 'Já atendidos'),
        el('span', { class: 'badge ok' }, String(atendidos.length))));
      atendidos.forEach(c => listaEl.appendChild(cartaoAtendido(c)));
    }

    pintarHistorico();
  }

  // tudo o que não é do dia a dia fica aqui, fora da tela principal
  function ferramentasRota(lista) {
    const m = modal(el('div', { class: 'col gap8' },
      el('p', { class: 'sub' }, 'Ordem atual: ' + lista.length + ' cliente(s) em ' + diaRota + '.'),
      lista.length > 1 ? el('button', {
        class: 'btn w100', onclick: () => { m.fechar(); organizarPorProximidade(lista); }
      }, rot('rota', 'Organizar por proximidade')) : null,
      lista.length > 1 ? el('p', { class: 'sub' },
        'Mantém quem está em 1º lugar e enfileira os demais do mais perto para o mais longe.') : null,
      lista.length > 1 ? el('button', {
        class: 'btn btn-sec w100 mt8', onclick: () => {
          gravarOrdem(lista.slice().reverse());
          toast('Ordem invertida.'); m.fechar(); nav('hoje');
        }
      }, rot('sincronizar', 'Inverter a ordem')) : null,
      el('button', {
        class: 'btn btn-sec w100 mt8 btn-perigo', onclick: async () => {
          if (!(await confirmar('Resetar a rota de ' + diaRota + '?\n\nOs ' + lista.length +
            ' cliente(s) voltam para a lista de disponíveis.',
          { titulo: 'Resetar rota', ok: 'Resetar', perigo: true }))) return;
          lista.forEach(c => tirarDaRota(c));
          toast('Rota de ' + diaRota + ' zerada.');
          m.fechar(); nav('hoje');
        }
      }, rot('lixeira', 'Resetar a rota de ' + diaRota))),
      { titulo: 'Ferramentas da rota' });
  }

  // Reordena a rota do dia partindo do cliente que está em 1º lugar.
  async function organizarPorProximidade(lista) {
    if (lista.length < 3) return toast('Precisa de pelo menos 3 clientes na rota.', 'erro');
    const primeiro = lista[0];
    if (primeiro.lat == null || primeiro.lng == null)
      return toast('O cliente nº 1 (' + nomeExib(primeiro) + ') está sem localização. ' +
        'Coloque outro cliente em 1º lugar ou atualize o GPS em Mais → Roteirização.', 'erro');
    if (!(await confirmar('Organizar a rota de ' + diaRota + ' por proximidade?\n\n' +
      'O cliente nº 1 continua sendo ' + nomeExib(primeiro) + ', e os demais são reordenados ' +
      'do mais perto para o mais longe. A ordem atual será substituída.'))) return;
    const r = ordenarPorProximidade(lista);
    gravarOrdem(r.ordem);
    toast('Rota organizada por proximidade' + (r.km ? ' · ~' + String(r.km).replace('.', ',') + ' km' : '') +
      (r.semCoord ? ' · ' + r.semCoord + ' sem localização foram para o fim' : '') + '.');
    nav('hoje');
  }

  // ---- desfazer visita registrada por engano ----
  // Visita com PEDIDO não é apagada por aqui: ela carrega comissão e
  // faturamento. Nesse caso o caminho é excluir o pedido, na aba Pedidos.
  async function excluirVisita(v, c) {
    if (!v) return;
    if (v.pedido_id || v.fez_pedido) {
      return modal(el('div', null,
        el('p', null, 'Esta visita tem um PEDIDO ligado a ela, com comissão e faturamento.'),
        el('p', { class: 'sub mt8' },
          'Para desfazer, exclua o pedido na aba Pedidos — a visita e a comissão ' +
          'somem junto, sem deixar número errado no painel.'),
        el('button', {
          class: 'btn w100 mt12', onclick: () => { document.querySelectorAll('.ns-overlay').forEach(o => o.remove()); nav('pedidos'); }
        }, rot('recibo', 'Ir para os pedidos'))), { titulo: 'Visita com pedido' });
    }
    if (!(await confirmar('Desfazer a visita de ' + nomeExib(c) + ' em ' + dataBR(v.data_visita) + '?\n\n' +
      'Ela volta a aparecer como "a visitar" na rota.', { titulo: 'Desfazer visita', ok: 'Desfazer', perigo: true }))) return;
    DB.remove('visitas', v.id);
    recalcularCicloCliente(c.id);
    toast('Visita desfeita. ' + nomeExib(c) + ' voltou para a fila.');
    nav('hoje');
  }

  function removerDaRota(c) {
    tirarDaRota(c);
    toast(c.nome + ' saiu da rota e voltou para a lista de clientes.');
    nav('hoje');
  }

  // ---- tela de seleção de clientes (filtros + adicionar) ----
  function telaCriarRota(rep) {
    const wrap = el('div');
    const m = modal(wrap, { titulo: 'Rota de ' + diaRota, full: true });
    const f = { busca: '', cidade: '', regiao: '', classe: '', semPedido: '', semVisita: '', tipo: 'todos' };
    render();

    function render() {
      wrap.innerHTML = '';
      const disponiveis = clientesDoRep(rep.id).filter(c => c.status !== 'inativo' && !rotaDiaDe(c, rep.id));
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

      // tipo de cadastro: cliente, prospecção ou só os prioritários
      const tipoEl = el('div', { class: 'dias-scroll mt8' });
      wrap.appendChild(tipoEl);
      const pintarTipo = () => {
        tipoEl.innerHTML = '';
        [['todos', 'Todos', null], ['clientes', 'Só clientes', null],
         ['prospec', 'Só prospecções', 'alvo'], ['prioridade', 'Prioritários', 'estrela']]
          .forEach(([k, rotulo, icone]) => {
            tipoEl.appendChild(el('button', {
              class: 'chip' + (k === 'prospec' ? ' prospec' : k === 'prioridade' ? ' prioritario' : '') +
                (f.tipo === k ? ' ativo' : ''),
              onclick: () => { f.tipo = k; pintarTipo(); renderLista(); }
            }, icone ? ico(icone, 'ic-sm') : null, rotulo));
          });
      };
      pintarTipo();

      const infoEl = el('div', { class: 'sub mt8' });
      const listaEl = el('div', { class: 'col gap8 mt8' });
      wrap.appendChild(infoEl); wrap.appendChild(listaEl);
      wrap.appendChild(el('button', {
        class: 'btn big w100 mt16', onclick: () => { m.fechar(); nav('hoje'); }
      }, rot('check', 'Concluir')));

      function renderLista() {
        const q = f.busca.trim().toLowerCase();
        const qNum = q.replace(/\D/g, '');
        let cls = clientesDoRep(rep.id).filter(c => c.status !== 'inativo' && !rotaDiaDe(c, rep.id));
        if (q) cls = cls.filter(c => (c.nome || '').toLowerCase().includes(q) ||
          (c.nome_fantasia || '').toLowerCase().includes(q) ||
          (c.razao_social || '').toLowerCase().includes(q) ||
          (c.cidade || '').toLowerCase().includes(q) ||
          (qNum && (c.cnpj_cpf || '').replace(/\D/g, '').includes(qNum)));
        if (f.cidade) cls = cls.filter(c => c.cidade === f.cidade);
        if (f.regiao) cls = cls.filter(c => (c.regiao || C.regiaoDoCliente(c)) === f.regiao);
        if (f.classe) cls = cls.filter(c => (c.classe || 'A') === f.classe);
        if (f.semPedido) cls = cls.filter(c => diasSemPedido(c) >= Number(f.semPedido));
        if (f.semVisita) cls = cls.filter(c => diasSemAtendimento(c) >= Number(f.semVisita));
        if (f.tipo === 'clientes') cls = cls.filter(c => !ehProspec(c));
        else if (f.tipo === 'prospec') cls = cls.filter(ehProspec);
        else if (f.tipo === 'prioridade') cls = cls.filter(ehPrioritario);
        cls = ordenarParaRota(cls);
        // prioritário sempre no topo da lista de escolha
        cls.sort((a, b) => (ehPrioritario(b) ? 1 : 0) - (ehPrioritario(a) ? 1 : 0));
        infoEl.textContent = cls.length + ' cliente(s) disponível(is) · prioritários no topo, depois por classe e tempo sem pedido';
        listaEl.innerHTML = '';
        cls.slice(0, 80).forEach(c => {
          const st = statusDoCliente(c);
          listaEl.appendChild(el('div', {
            class: 'card-visita st-' + st.k + (ehProspec(c) ? ' prospec' : '') +
              (ehPrioritario(c) ? ' prioritario' : '')
          },
            el('div', { onclick: () => fichaCliente(c.id) },
              el('strong', { class: 'row gap8' }, marcaAlerta(c), nomeExib(c)),
              (ehProspec(c) || ehPrioritario(c)) ? el('div', { class: 'row gap8 mt4' },
                ehPrioritario(c) ? el('span', { class: 'badge prioritario' }, ico('estrela', 'ic-sm'), 'PRIORIDADE') : null,
                ehProspec(c) ? el('span', { class: 'badge prospec' }, 'PROSPECÇÃO') : null) : null,
              c.cnpj_cpf ? el('div', { class: 'sub' }, 'CNPJ ' + C.fmtCNPJ(c.cnpj_cpf)) : null,
              el('div', { class: 'sub' }, [c.endereco, c.cidade, c.uf].filter(Boolean).join(' · ')),
              el('div', { class: 'sub' }, farol(st.k), st.rot),
              el('div', { class: 'sub' }, (c.regiao || C.regiaoDoCliente(c) || 'sem região') +
                ' · Classe ' + (c.classe || 'B') +
                ' · ' + txtDias(diasSemPedido(c), 'pedido') + ' · ' + txtDias(diasSemAtendimento(c), 'visita'))),
            el('div', { class: 'row gap8 mt8' },
              el('button', {
                class: 'btn-mini grow', onclick: () => {
                  // se o outro vendedor já tem este cliente no mesmo dia, avisa
                  // na hora — dois na mesma farmácia no mesmo dia é visita perdida
                  const outros = outrosNaRota(c, diaRota, rep.id);
                  porNaRota(c, diaRota, rep.id);
                  toast(outros.length
                    ? nomeExib(c) + ' entrou na rota de ' + diaRota + ' — atenção: ' +
                      outros.join(' e ') + ' também tem este cliente em ' + diaRota + '.'
                    : nomeExib(c) + ' entrou na rota de ' + diaRota + '.',
                  outros.length ? 'erro' : undefined);
                  render();
                }
              }, rot('mais', 'Adicionar à rota')),
              botaoMaps(c),
              botaoPrioridade(c, renderLista),
              ehProspec(c) ? el('button', {
                class: 'btn-mini vermelho', onclick: () => excluirProspeccao(c, render)
              }, rot('lixeira', 'Excluir')) : null)));
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
      el('p', { class: 'sub' }, nomeExib(c)),
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
    tirarDaRota(c);
    toast(c.nome + ' saiu da rota e voltou para a lista de clientes disponíveis.');
    nav('hoje');
  }

  function espelharVisitaLocal(c) {
    const d = new Date(hojeISO() + 'T12:00:00');
    d.setDate(d.getDate() + cicloDoCliente(c));
    DB.update('clientes', c.id, { ultima_visita_em: hojeISO(), proxima_visita_prevista: d.toISOString().slice(0, 10) });
    DB.all('pendencias').filter(p => p.cliente_id === c.id && !p.resolvida_em)
      .forEach(p => DB.update('pendencias', p.id, { resolvida_em: new Date().toISOString() }));
  }

  // CLASSE = CICLO: uma informação só. A 45 · B 60 · C 90 · D 120 dias.
  // Não existe mais "frequência" separada — quem manda é sempre a classe.
  const freqDaClasse = (cl) => C.cicloDaClasse(cl);
  const cicloDoCliente = (c) => C.cicloDoCliente(c);
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
    DB.update('clientes', clienteId, { classe: cl, proxima_visita_prevista: prox });
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
    if (ult) { const d = new Date(ult + 'T12:00:00'); d.setDate(d.getDate() + cicloDoCliente(c)); prox = d.toISOString().slice(0, 10); }
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

  // ---- GPS / Google Maps ----
  // O endereço escrito leva à porta certa; a coordenada só entra quando não há
  // endereço (a coordenada "aproximada" cai no centro da cidade, não no cliente).
  // O CEP vai junto do endereço escrito: é ele que desempata rua com nome
  // repetido e corrige cidade errada. Quando o cadastro só tem o CEP, o GPS vai
  // pelo CEP — que cai na rua certa, e não no meio da cidade.
  function linkMaps(c) {
    const cep = R.cepFormatado(c.cep);
    const rua = String(c.endereco || '').trim();
    const escrito = (rua && c.cidade) ? [rua, c.bairro, c.cidade, c.uf, cep].filter(Boolean).join(', ')
      : (cep ? [rua, c.cidade, c.uf, cep].filter(Boolean).join(', ') : '');
    const dest = escrito ? encodeURIComponent(escrito + ', Brasil')
      : (c.lat != null ? c.lat + ',' + c.lng : encodeURIComponent(R.enderecoCompleto(c)));
    // este endereço abre o APLICATIVO do Google Maps no celular e o site no computador
    return 'https://www.google.com/maps/dir/?api=1&destination=' + dest;
  }
  function abrirGPS(c) { window.open(linkMaps(c), '_blank'); }
  const temEndereco = (c) => !!((c.endereco && c.cidade) || c.cidade || R.cepFormatado(c.cep) || c.lat != null);

  // ---- CEP puxa o endereço ----
  // Serve para o cadastro completo e para a prospecção: o vendedor digita o CEP
  // e a rua, o bairro, a cidade e a UF entram sozinhos. O que já estava escrito
  // NUNCA é apagado — o CEP só preenche o que está em branco.
  function ligarBuscaCep(campos, dica) {
    const padrao = dica ? dica.textContent : '';
    let ultimo = '';
    async function puxar() {
      const d = String(campos.cep.value || '').replace(/\D+/g, '');
      if (d.length !== 8) { if (dica) texto(dica, padrao, false); ultimo = ''; return; }
      if (d === ultimo) return;
      ultimo = d;
      const fmt = d.slice(0, 5) + '-' + d.slice(5);
      if (dica) texto(dica, 'Buscando o endereço do CEP ' + fmt + '…', false);
      const dados = await R.buscarCep(d);
      if (String(campos.cep.value || '').replace(/\D+/g, '') !== d) return; // já mudou de CEP
      if (!dados) {
        if (dica) texto(dica, navigator.onLine
          ? 'Não achei este CEP. Confira o número ou escreva o endereço na mão.'
          : 'Sem internet agora — escreva o endereço na mão, ou volte no CEP quando pegar sinal.', false);
        return;
      }
      const postos = [];
      for (const campo of ['endereco', 'bairro', 'cidade', 'uf']) {
        if (!campos[campo] || !dados[campo]) continue;
        if (String(campos[campo].value || '').trim()) continue;
        campos[campo].value = dados[campo];
        piscar(campos[campo], 'campo-veio-do-cep');
        postos.push(campo);
      }
      campos.cep.value = fmt;
      if (!dica) return;
      texto(dica, postos.length
        ? 'Veio do CEP: ' + [dados.endereco, dados.bairro, dados.cidade, dados.uf].filter(Boolean).join(', ') +
          '. Agora só falta o número.'
        : 'CEP confere com o endereço que já está no cadastro.', false);
    }
    campos.cep.addEventListener('input', puxar);
    campos.cep.addEventListener('blur', puxar);
    return puxar;
  }
  // botão de GPS reaproveitado em todas as telas que mostram o endereço
  function botaoMaps(c, extra) {
    if (!temEndereco(c)) return null;
    return el('button', {
      class: 'btn-mini gps' + (extra ? ' ' + extra : ''), title: 'Abrir no Google Maps',
      onclick: (e) => { e.stopPropagation(); abrirGPS(c); }
    }, rot('mapa', 'GPS'));
  }

  // ---- cliente prioritário ----
  const ehPrioritario = (c) => !!(c && c.prioridade);
  function alternarPrioridade(c, aoMudar) {
    const novo = !ehPrioritario(c);
    DB.update('clientes', c.id, { prioridade: novo });
    c.prioridade = novo;
    toast(novo ? nomeExib(c) + ' marcado como PRIORIDADE.' : 'Prioridade removida de ' + nomeExib(c) + '.');
    if (aoMudar) aoMudar();
  }
  function botaoPrioridade(c, aoMudar) {
    return el('button', {
      class: 'btn-mini' + (ehPrioritario(c) ? ' prioritario' : ''),
      title: ehPrioritario(c) ? 'Tirar a prioridade' : 'Marcar como prioridade',
      onclick: (e) => { e.stopPropagation(); alternarPrioridade(c, aoMudar); }
    }, rot('estrela', ehPrioritario(c) ? 'Prioridade' : 'Priorizar'));
  }

  // ---- excluir prospecção ----
  // Só vale para PROSPECÇÃO: cliente que já compra nunca é excluído por aqui.
  async function excluirProspeccao(c, aoFeito) {
    if (!ehProspec(c)) return toast('Só prospecção pode ser excluída por aqui.', 'erro');
    if (!(await confirmar('Deseja realmente excluir esta prospecção?\n\n' + nomeExib(c) +
      '\nAs visitas e observações dela também serão apagadas.'))) return;
    DB.removeWhere('visitas', (v) => v.cliente_id === c.id);
    DB.removeWhere('cliente_notas', (n) => n.cliente_id === c.id);
    DB.removeWhere('cliente_produtos', (cp) => cp.cliente_id === c.id);
    DB.removeWhere('pendencias', (p) => p.cliente_id === c.id);
    DB.remove('clientes', c.id);
    toast('Prospecção excluída.');
    if (aoFeito) aoFeito();
  }

  // ---- ordenar a rota por proximidade a partir do cliente nº 1 ----
  // Nearest neighbour + 2-opt sobre a distância em linha reta (funciona offline).
  // Quem não tem coordenada fica no fim, na ordem em que estava.
  function ordenarPorProximidade(lista) {
    const comCoord = lista.filter(c => c.lat != null && c.lng != null);
    const semCoord = lista.filter(c => c.lat == null || c.lng == null);
    if (comCoord.length < 3) return { ordem: comCoord.concat(semCoord), semCoord: semCoord.length };
    const fator = Number(DB.config('haversine_fator', 1.3));
    const pontos = comCoord.map(c => ({ lat: c.lat, lng: c.lng }));
    const m = C.matrizHaversine(pontos, fator);
    // o índice 0 é o cliente nº 1 da rota: a otimização parte dele e ele não sai do lugar
    const seq = C.doisOpt(m, C.nearestNeighbor(m));
    const ordenados = [comCoord[0]].concat(seq.map(i => comCoord[i]));
    return { ordem: ordenados.concat(semCoord), semCoord: semCoord.length,
      km: Math.round(C.comprimentoRota(m, seq) * 10) / 10 };
  }

  // ================= VIEW: CLIENTES (farol de prazo) =================
  // verde dentro do prazo · amarelo vence em até X dias · vermelho atrasada · cinza sem registro
  // estado dos filtros — fica vivo enquanto o app está aberto
  const fClientes = {};
  const fPedidos = {};

  // O ciclo que manda é o da CLASSE (A 45 · B 60 · C 90 · D 120). A data prevista
  // é recalculada a partir da última visita/pedido, então mudar a classe do cliente
  // muda o farol na hora, sem precisar mexer em cada cadastro.
  function proximaVisitaDe(c) {
    const base = c.ultima_visita_em || c.ultimo_pedido_em;
    if (!base) return c.proxima_visita_prevista || null;
    const d = new Date(base + 'T12:00:00');
    d.setDate(d.getDate() + cicloDoCliente(c));
    return d.toISOString().slice(0, 10);
  }
  // O FAROL é contado pelos DIAS SEM PEDIDO, não pelos dias de atraso da visita.
  // Numa consignação quem repõe a mercadoria é o PEDIDO: visitar e sair sem
  // pedido não abastece a farmácia, então o relógio continua correndo.
  // Vermelho = passou do ciclo da classe (A 45 · B 60 · C 90 · D 120) sem comprar.
  function statusCliente(c, hoje, avisoDias) {
    const dias = diasSemPedido(c);
    if (dias >= 9999) return { k: 'cinza', rot: 'nunca comprou', ordem: 3, sub: 9e9 };
    const ciclo = cicloDoCliente(c);
    const falta = ciclo - dias;        // quanto ainda falta para fechar o ciclo
    if (falta < 0) return { k: 'vermelho', rot: dias + 'd sem pedido', ordem: 0, sub: falta };
    if (falta <= avisoDias) return { k: 'amarelo', rot: 'vence em ' + falta + 'd', ordem: 1, sub: falta };
    return { k: 'verde', rot: 'em dia · ' + dias + 'd sem pedido', ordem: 2, sub: falta };
  }

  // ================= FILTROS CENTRALIZADOS =================
  // Em vez de várias fileiras de bolinhas espalhadas pela tela, existe UM
  // botão "Filtros" que abre um painel com tudo, e uma linha de etiquetas
  // mostrando o que está ligado (cada etiqueta sai com um toque).
  const FILTROS_CLIENTES = [
    { k: 'tipo', rotulo: 'Tipo de cadastro', padrao: 'todos', opcoes: [
      ['todos', 'Todos'], ['clientes', 'Só clientes'], ['prospec', 'Só prospecções'] ] },
    { k: 'prioridade', rotulo: 'Prioridade', padrao: 'todos', opcoes: [
      ['todos', 'Todos'], ['sim', 'Só prioritários'], ['nao', 'Sem prioridade'] ] },
    { k: 'potencial', rotulo: 'Potencial (último pedido)', padrao: 'todos', opcoes: [
      ['todos', 'Todos'], ['muito_alto', 'Muito alto'], ['alto', 'Alto'],
      ['normal', 'Normal'], ['baixo', 'Baixo'], ['sem', 'Ainda sem pedido'] ] },
    { k: 'classe', rotulo: 'Classe (ciclo de visita)', padrao: 'todos', opcoes: [
      ['todos', 'Todas'], ['A', 'A · 45 dias'], ['B', 'B · 60 dias'],
      ['C', 'C · 90 dias'], ['D', 'D · 120 dias'] ] },
    { k: 'status', rotulo: 'Status da visita', padrao: 'todos', opcoes: [
      ['todos', 'Todos'], ['vermelho', 'Atrasados'], ['amarelo', 'Vencendo'],
      ['verde', 'Em dia'], ['cinza', 'Sem registro'] ] },
    { k: 'semVisita', rotulo: 'Dias sem visita', padrao: 'todos', opcoes: [
      ['todos', 'Qualquer'], ['30', '30+ dias'], ['45', '45+ dias'],
      ['60', '60+ dias'], ['90', '90+ dias'], ['120', '120+ dias'] ] },
    { k: 'semPedido', rotulo: 'Dias sem pedido', padrao: 'todos', opcoes: [
      ['todos', 'Qualquer'], ['30', '30+ dias'], ['60', '60+ dias'],
      ['90', '90+ dias'], ['180', '180+ dias'] ] },
    { k: 'mix', rotulo: 'Mix de produtos', padrao: 'todos', opcoes: [
      ['todos', 'Todos'], ['incompleto', 'Sem mix completo'], ['completo', 'Com mix completo'] ] }
  ];

  const FILTROS_PEDIDOS = [
    { k: 'faturado', rotulo: 'Faturamento no New Star', padrao: 'todos', opcoes: [
      ['todos', 'Todos'], ['pendente', 'Falta faturar'], ['sim', 'Já faturado'] ] },
    { k: 'mes', rotulo: 'Mês do pedido', padrao: 'todos', opcoes: [] }, // preenchido na hora
    { k: 'tabela', rotulo: 'Tabela de preço', padrao: 'todos', opcoes: [
      ['todos', 'Todas'], ['simples', 'Simples'], ['lucro', 'Lucro Presumido'] ] },
    { k: 'obs', rotulo: 'Observação', padrao: 'todos', opcoes: [
      ['todos', 'Todos'], ['sim', 'Só com observação'] ] },
    { k: 'recebimento', rotulo: 'Registro de recebimento', padrao: 'todos', opcoes: [
      ['todos', 'Todos'], ['sim', 'Com quem recebeu'], ['nao', 'Sem registro'] ] }
  ];

  // todo filtro começa no padrão (senão uma chave vazia esconderia tudo)
  function zerarFiltros(defs, f) { defs.forEach(d => { if (f[d.k] == null) f[d.k] = d.padrao; }); return f; }
  zerarFiltros(FILTROS_CLIENTES, fClientes);
  zerarFiltros(FILTROS_PEDIDOS, fPedidos);

  const filtrosAtivos = (defs, f) =>
    defs.filter(d => f[d.k] && f[d.k] !== d.padrao);
  const rotuloOpcao = (def, v) => {
    const o = (def.opcoes || []).find(x => x[0] === v);
    return o ? o[1] : v;
  };

  // linha compacta: botão Filtros (N) + etiquetas do que está ligado
  function barraFiltros(defs, f, aoMudar) {
    const box = el('div', { class: 'barra-filtros mt8' });
    const pintar = () => {
      const ativos = filtrosAtivos(defs, f);
      repor(box,
        el('div', { class: 'row gap8' },
          el('button', {
            class: 'btn-filtros' + (ativos.length ? ' ativo' : ''),
            onclick: () => abrirPainelFiltros(defs, f, () => { pintar(); aoMudar(); })
          }, ico('ajustes'), el('span', null, 'Filtros'),
            ativos.length ? el('span', { class: 'cont-filtros' }, String(ativos.length)) : null),
          ativos.length ? el('button', {
            class: 'btn-link', onclick: () => {
              defs.forEach(d => { f[d.k] = d.padrao; });
              pintar(); aoMudar();
            }
          }, 'limpar tudo') : null),
        ativos.length ? el('div', { class: 'etiquetas mt8' },
          ativos.map(d => el('button', {
            class: 'etiqueta', onclick: () => { f[d.k] = d.padrao; pintar(); aoMudar(); }
          }, el('span', null, rotuloOpcao(d, f[d.k])), ico('fechar', 'ic-sm')))) : null);
    };
    pintar();
    return box;
  }

  function abrirPainelFiltros(defs, f, aoAplicar) {
    const wrap = el('div', { class: 'col gap8' });
    const pintar = () => {
      repor(wrap,
        ...defs.map(d => el('div', { class: 'grupo-filtro' },
          el('div', { class: 'grupo-filtro-tit' }, d.rotulo),
          el('div', { class: 'opcoes-filtro' },
            (d.opcoes || []).map(([v, r]) => el('button', {
              class: 'op-filtro' + ((f[d.k] || d.padrao) === v ? ' ativo' : ''),
              onclick: () => { f[d.k] = v; pintar(); }
            }, r))))),
        el('div', { class: 'row gap8 mt12' },
          el('button', {
            class: 'btn btn-sec grow', onclick: () => {
              defs.forEach(d => { f[d.k] = d.padrao; }); pintar();
            }
          }, rot('sincronizar', 'Limpar')),
          el('button', {
            class: 'btn grow', onclick: () => { m.fechar(); aoAplicar(); }
          }, rot('check', 'Aplicar'))));
    };
    pintar();
    const m = modal(wrap, { titulo: 'Filtros' });
  }

  // ---- mix de produtos: cliente trabalha todas as linhas do catálogo? ----
  function linhasDoCatalogo() {
    return Array.from(new Set(DB.all('produtos')
      .filter(p => p.ativo !== false).map(p => p.linha || 'Outros')));
  }
  function mixCompleto(clienteId, linhas) {
    const meus = new Set(DB.all('cliente_produtos')
      .filter(cp => cp.cliente_id === clienteId)
      .map(cp => (DB.byId('produtos', cp.produto_id) || {}).linha || 'Outros'));
    return linhas.every(l => meus.has(l));
  }

  // ---- potencial: calculado pelo valor do ÚLTIMO pedido concluído ----
  function ultimoPedidoValor(clienteId) {
    const ps = DB.all('pedidos')
      .filter(p => p.cliente_id === clienteId && p.status === 'concluido')
      .sort((a, b) => (b.data_pedido || '').localeCompare(a.data_pedido || ''));
    return ps.length ? Number(ps[0].total_valor || 0) : null;
  }
  function potencialDoCliente(clienteId) {
    return C.potencialCliente(ultimoPedidoValor(clienteId));
  }
  // Sem potencial calculado não vira mais o selo "SEM PEDIDO": a faixa do
  // último pedido logo acima já diz isso, e dois avisos da mesma coisa, com
  // palavras diferentes, só confundem quem lê a lista correndo.
  function seloPotencial(pot) {
    if (!pot) return null;
    return el('span', { class: 'badge pot pot-' + pot },
      ico('tendencia', 'ic-sm'), C.nomePotencial(pot).toUpperCase());
  }

  function vClientes(view) {
    const repId = repEfetivoId();
    const hoje = hojeISO();
    const avisoDias = Number(DB.config('alerta_vencendo_dias', 7));
    const linhas = linhasDoCatalogo();
    const busca = el('input', { class: 'input big', placeholder: 'Buscar por CNPJ, nome ou cidade…', oninput: render });
    const lista = el('div', { class: 'col gap8 mt12' });
    const resumo = el('div', { class: 'sub mt8' });

    view.appendChild(el('div', { class: 'row space' },
      el('h2', null, 'Clientes'),
      el('button', { class: 'btn-mini', onclick: () => novaProspeccao(render) },
        rot('mais', 'Prospecção'))));
    view.appendChild(el('div', { class: 'mt8' }, busca));
    view.appendChild(barraFiltros(FILTROS_CLIENTES, fClientes, render));
    view.appendChild(resumo);
    view.appendChild(lista);

    function render() {
      const q = busca.value.trim().toLowerCase();
      const qNum = q.replace(/\D/g, '');
      const f = fClientes;
      const todos = clientesDoRep(repId)
        .map(c => ({ c, st: statusCliente(c, hoje, avisoDias), pot: potencialDoCliente(c.id) }))
        .filter(({ c }) => {
          if (!q) return true;
          return (c.nome || '').toLowerCase().includes(q) ||
            (c.nome_fantasia || '').toLowerCase().includes(q) ||
            (c.razao_social || '').toLowerCase().includes(q) ||
            (c.cidade || '').toLowerCase().includes(q) ||
            (qNum && (c.cnpj_cpf || '').replace(/\D/g, '').includes(qNum));
        });

      // os filtros se combinam: potencial alto + sem visita há 60 dias + prioridade
      const vis = todos.filter(({ c, st, pot }) => {
        if (f.tipo === 'clientes' && ehProspec(c)) return false;
        if (f.tipo === 'prospec' && !ehProspec(c)) return false;
        if (f.prioridade === 'sim' && !ehPrioritario(c)) return false;
        if (f.prioridade === 'nao' && ehPrioritario(c)) return false;
        if (f.potencial !== 'todos') {
          if (f.potencial === 'sem') { if (pot) return false; }
          else if (pot !== f.potencial) return false;
        }
        if (f.classe !== 'todos' && C.classeDe(c) !== f.classe) return false;
        if (f.status !== 'todos' && st.k !== f.status) return false;
        if (f.semVisita !== 'todos' && diasSemAtendimento(c) < Number(f.semVisita)) return false;
        if (f.semPedido !== 'todos' && diasSemPedido(c) < Number(f.semPedido)) return false;
        if (f.mix !== 'todos') {
          const completo = mixCompleto(c.id, linhas);
          if (f.mix === 'completo' && !completo) return false;
          if (f.mix === 'incompleto' && completo) return false;
        }
        return true;
      })
        // urgência primeiro: atrasados (mais atrasado no topo) → vencendo → em dia
        .sort((a, b) => (a.st.ordem - b.st.ordem) || (a.st.sub - b.st.sub) ||
          (a.c.nome || '').localeCompare(b.c.nome || ''))
        .slice(0, 300);

      resumo.textContent = vis.length + ' de ' + todos.length + ' cliente(s)' +
        (filtrosAtivos(FILTROS_CLIENTES, f).length ? ' · filtros aplicados' : '');

      lista.innerHTML = '';
      for (const { c, st, pot } of vis) {
        lista.appendChild(el('div', {
          class: 'item-lista st-' + st.k + (ehProspec(c) ? ' prospec' : '') +
            (ehPrioritario(c) ? ' prioritario' : '')
        },
          el('div', { class: 'grow', onclick: () => fichaCliente(c.id) },
            el('div', { class: 'row space w100' },
              el('div', { class: 'row gap8' }, farol(st.k), marcaAlerta(c), el('strong', null, nomeExib(c))),
              el('span', { class: 'badge ' + (st.k === 'vermelho' ? 'erro' : st.k === 'amarelo' ? 'aviso' : st.k === 'verde' ? 'ok' : '') },
                st.k === 'verde' ? 'em dia' : st.k === 'cinza' ? 'sem registro' : st.rot)),
            // CNPJ sempre visível: não precisa abrir o cadastro para conferir
            c.cnpj_cpf ? el('div', { class: 'cnpj-chip mt4' },
              el('span', { class: 'cnpj-rot' },
                String(c.cnpj_cpf).replace(/\D/g, '').length === 11 ? 'CPF' : 'CNPJ'),
              C.fmtCNPJ(c.cnpj_cpf)) : null,
            faixaUltimoPedido(c),
            (ehProspec(c) || ehPrioritario(c) || pot) ? el('div', { class: 'row gap8 mt4 selos' },
              ehProspec(c) ? el('span', { class: 'badge prospec' }, 'PROSPECÇÃO') : null,
              ehPrioritario(c) ? el('span', { class: 'badge prioritario' },
                ico('estrela', 'ic-sm'), 'PRIORIDADE') : null,
              seloPotencial(pot)) : null,
            el('span', { class: 'sub mt4' },
              'Classe ' + C.classeDe(c) + ' · ' + cicloDoCliente(c) + ' dias · ' +
              [c.cidade, c.uf].filter(Boolean).join(' - ') +
              (c.rede ? ' · ' + c.rede : ''))),
          el('div', { class: 'row gap8 mt8' },
            botaoMaps(c),
            botaoPrioridade(c, render),
            ehProspec(c) ? el('button', {
              class: 'btn-mini vermelho', onclick: (e) => { e.stopPropagation(); excluirProspeccao(c, render); }
            }, rot('lixeira', 'Excluir')) : null)));
      }
      if (!vis.length) lista.appendChild(el('p', { class: 'vazio' },
        'Nenhum cliente com esses filtros. Toque em "limpar tudo" para ver todos.'));
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
    const sug = c.frequencia_auto !== false ? C.sugestaoFrequencia(visitas, cicloDoCliente(c)) : null;

    // linhas que trabalha (chips com toque)
    const minhas = new Set(DB.all('cliente_produtos').filter(cp => cp.cliente_id === id).map(cp => cp.produto_id));
    const porLinha = {};
    DB.all('produtos').filter(p => p.ativo !== false).forEach(p => {
      (porLinha[p.linha || 'Outros'] = porLinha[p.linha || 'Outros'] || []).push(p);
    });
    const linhasTrab = new Set(DB.all('produtos').filter(p => minhas.has(p.id)).map(p => p.linha || 'Outros'));
    const upsell = Object.keys(porLinha).filter(l => !linhasTrab.has(l));

    const chips = el('div', { class: 'chips mt4' },
      C.ordenarProdutos(DB.all('produtos').filter(p => p.ativo !== false))
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
      c.razao_social && c.razao_social !== nomeExib(c)
        ? el('div', { class: 'sub' }, 'Razão social: ' + c.razao_social) : null,
      c.nome_fantasia && c.nome_fantasia !== c.nome
        ? el('div', { class: 'sub' }, 'Nome fantasia: ' + c.nome_fantasia) : null,
      // CNPJ em destaque, junto das informações principais do cliente
      c.cnpj_cpf ? el('div', { class: 'cnpj-chip grande mt4' },
        el('span', { class: 'cnpj-rot' }, String(c.cnpj_cpf).replace(/\D/g, '').length === 11 ? 'CPF' : 'CNPJ'),
        C.fmtCNPJ(c.cnpj_cpf)) : null,
      el('div', { class: 'sub mt4' }, [c.endereco, c.bairro, c.cidade, c.uf].filter(Boolean).join(', ')),
      el('div', { class: 'sub mt4' },
        'Contato: ' + (c.contato || '—') + ' · ' + (c.telefone || c.celular || '—') +
        (c.rede ? ' · Rede ' + c.rede + (c.recebimento_dias ? ' (comissão +' + c.recebimento_dias + 'd)' : '') : '') +
        ' · Prazo: ' + (c.condicao_pagamento_padrao || 'a definir no 1º pedido') +
        ' · Tabela: ' + (C.tabelaPermitida(c) === 'ambas'
          ? 'Simples ou Lucro Presumido' : 'somente ' + C.NOME_TABELA[C.tabelaPermitida(c)])),
      ehPrioritario(c) ? el('div', { class: 'mt8' },
        el('span', { class: 'badge prioritario' }, ico('estrela', 'ic-sm'), 'CLIENTE PRIORITÁRIO')) : null,
      ehProspec(c) ? el('div', { class: 'mt8' },
        el('span', { class: 'badge prospec' }, 'PROSPECÇÃO — ainda não é cliente'),
        el('button', { class: 'btn w100 mt8', onclick: () => transformarEmCliente(id, () => {
          document.querySelectorAll('.ns-overlay').forEach(o => o.remove()); fichaCliente(id);
        }) }, rot('checkCirculo', 'Transformar em cliente')),
        el('button', {
          class: 'btn btn-sec w100 mt8', onclick: () => excluirProspeccao(c, () => {
            document.querySelectorAll('.ns-overlay').forEach(o => o.remove()); nav(viewAtual);
          })
        }, rot('lixeira', 'Excluir prospecção'))) : null,
      // GPS em destaque: leva direto ao Google Maps com o endereço do cliente
      temEndereco(c) ? el('button', {
        class: 'btn big w100 mt8 btn-gps', onclick: () => abrirGPS(c)
      }, rot('mapa', 'Abrir no Google Maps')) : null,
      el('div', { class: 'row gap8 mt8' },
        el('button', { class: 'btn-mini', onclick: () => window.NSPedido.novo(c) }, rot('recibo', 'Novo pedido')),
        el('button', { class: 'btn-mini', onclick: () => editarCliente(c.id) }, rot('lapis', 'Editar')),
        botaoPrioridade(c, () => {
          document.querySelectorAll('.ns-overlay').forEach(o => o.remove()); fichaCliente(id);
        })),
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
        }, 'Classe ' + cl + ' · ' + freqDaClasse(cl) + 'd')),
        el('span', { class: 'badge' }, ico('pin', 'ic-sm'), c.regiao || C.regiaoDoCliente(c) || 'sem região')),

      el('div', { class: 'sub mt4' },
        `Classe ${C.classeDe(c)} = visita a cada ${cicloDoCliente(c)} dias · última: ` +
        `${dataBR(c.ultima_visita_em) || '—'} · próxima: ${dataBR(proximaVisitaDe(c)) || '—'}` +
        (dif != null ? (dif < 0 ? ` · ${-dif}d atrasado` : ` · vence em ${dif}d`) : '')),
      el('label', { class: 'row gap8 mt4 sub' },
        el('input', {
          type: 'checkbox', checked: c.frequencia_auto !== false ? '' : null,
          onchange: (e) => DB.update('clientes', c.id, { frequencia_auto: e.target.checked })
        }), 'Sugerir troca de classe automaticamente'),

      sug && sug.classe && sug.classe !== C.classeDe(c) ? el('div', { class: 'sugestao mt8' },
        el('span', { class: 'row gap8' }, ico('lampada', 'ic-sm'),
          `${sug.motivo} — passar para a classe ${sug.classe} (${sug.para} dias)?`),
        el('button', {
          class: 'btn-mini', onclick: (e) => {
            aplicarClasse(c.id, sug.classe);
            e.currentTarget.closest('.sugestao').remove();
            toast('Cliente passou para a classe ' + sug.classe + ' (' + sug.para + ' dias).');
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
    ), { titulo: nomeExib(c), full: true });
  }

  // ================= VIEW: PEDIDOS =================
  // marca/desmarca que o pedido já foi digitado no New Star (o sistema de
  // faturamento de fora). Só um controle do vendedor — não mexe em valor nenhum.
  // ── quem pode faturar no New Star ──
  // REGRA: cada vendedor fatura SÓ os pedidos que ele mesmo tirou. O gestor
  // continua podendo tudo. Esta é a porta única por onde o faturamento passa —
  // a tela esconde o botão, mas quem barra de verdade é esta função, então nem
  // chamando por fora dá para faturar o pedido do colega.
  function podeFaturar(p) {
    const s = sessao();
    if (!s || !p) return false;
    if (s.papel === 'gestor') return true;
    return !p.representante_id || p.representante_id === s.eu.id;
  }
  function motivoNaoFatura(p) {
    const dono = nomeDoRep(p && p.representante_id) || 'outro vendedor';
    return 'Este pedido é do ' + dono + '. Cada vendedor fatura só os pedidos dele.';
  }
  // marca/desmarca. Sem confirmar: use confirmarFaturamento para o fluxo de tela.
  function marcarFaturado(pedidoId, aoMudar) {
    const p = DB.byId('pedidos', pedidoId);
    if (!p) return false;
    if (!podeFaturar(p)) { toast(motivoNaoFatura(p), 'erro'); return false; }
    const novo = !p.faturado_ns;
    DB.update('pedidos', pedidoId, {
      faturado_ns: novo,
      faturado_ns_em: novo ? new Date().toISOString() : null,
      faturado_ns_por: novo ? sessao().eu.id : null
    });
    toast(novo ? 'Pedido marcado como FATURADO no New Star.' : 'Marca de faturado removida.');
    if (aoMudar) aoMudar();
    return true;
  }
  // pergunta antes — faturar por engano dá trabalho para desfazer no New Star
  async function confirmarFaturamento(pedidoId, aoMudar) {
    const p = DB.byId('pedidos', pedidoId);
    if (!p) return false;
    if (!podeFaturar(p)) { toast(motivoNaoFatura(p), 'erro'); return false; }
    if (p.faturado_ns) {
      const ok = await confirmar('Tirar a marca de faturado deste pedido?',
        { titulo: 'Desfazer faturamento', ok: 'Tirar a marca', perigo: true });
      if (!ok) return false;
      return marcarFaturado(pedidoId, aoMudar);
    }
    const cli = DB.byId('clientes', p.cliente_id) || {};
    const ok = await confirmar(
      'Tem certeza de que deseja marcar este pedido como faturado no Newstar?\n\n' +
      'Pedido nº ' + (p.numero || '—') + ' · ' + (cli.nome || '—') + '\n' +
      C.fmtMoney(Number(p.total_valor || 0)),
      { titulo: 'Faturar no New Star', ok: 'Confirmar faturamento', cancelar: 'Cancelar' });
    if (!ok) return false;
    return marcarFaturado(pedidoId, aoMudar);
  }
  function vPedidos(view) {
    const repId = repEfetivoId();
    const s0 = sessao();
    const busca = el('input', { class: 'input big', placeholder: 'Buscar por cliente, CNPJ, nº ou data…', oninput: render });
    const lista = el('div', { class: 'col gap8 mt12' });
    const resumo = el('div', { class: 'sub mt8' });

    // meses que existem nos pedidos viram opções do filtro
    const meses = Array.from(new Set(DB.all('pedidos')
      .filter(doHistorico(repId))
      .map(p => (p.data_pedido || '').slice(0, 7)).filter(Boolean))).sort().reverse();
    const defMes = FILTROS_PEDIDOS.find(d => d.k === 'mes');
    defMes.opcoes = [['todos', 'Todos']].concat(meses.slice(0, 12).map(m => [m, rotuloMes(m)]));

    view.appendChild(el('div', { class: 'row space' },
      el('h2', null, 'Pedidos'),
      el('button', { class: 'btn', onclick: () => window.NSPedido.novo() }, rot('mais', 'Novo pedido'))));
    view.appendChild(el('div', { class: 'mt8' }, busca));
    view.appendChild(barraFiltros(FILTROS_PEDIDOS, fPedidos, render));
    view.appendChild(resumo);
    view.appendChild(lista);

    function render() {
      const q = busca.value.trim().toLowerCase();
      const qNum = q.replace(/\D/g, '');
      const f = fPedidos;
      lista.innerHTML = '';
      const base = DB.all('pedidos')
        .filter(doHistorico(repId))
        .filter(p => p.status !== 'cancelado');
      const peds = base
        .filter(p => {
          const cli = DB.byId('clientes', p.cliente_id) || {};
          if (q && !((cli.nome || '').toLowerCase().includes(q) ||
            (cli.nome_fantasia || '').toLowerCase().includes(q) ||
            String(p.numero || '').includes(q) || (p.data_pedido || '').includes(q) ||
            (qNum && (cli.cnpj_cpf || '').replace(/\D/g, '').includes(qNum)))) return false;
          if (f.faturado === 'sim' && !p.faturado_ns) return false;
          if (f.faturado === 'pendente' && p.faturado_ns) return false;
          if (f.mes !== 'todos' && (p.data_pedido || '').slice(0, 7) !== f.mes) return false;
          if (f.tabela !== 'todos' && (p.tabela || 'simples') !== f.tabela) return false;
          if (f.obs === 'sim' && !(p.observacoes || '').trim()) return false;
          if (f.recebimento === 'sim' && !(p.assinante_nome || '').trim()) return false;
          if (f.recebimento === 'nao' && (p.assinante_nome || '').trim()) return false;
          return true;
        })
        .sort((a, b) => (b.data_pedido || '').localeCompare(a.data_pedido || '') ||
          (b.criado_em || '').localeCompare(a.criado_em || ''));

      const total = peds.reduce((t, p) => t + Number(p.total_valor || 0), 0);
      repor(resumo,
        el('span', null, peds.length + ' de ' + base.length + ' pedido(s)'),
        el('strong', null, ' · ' + C.fmtMoney(total)),
        peds.length ? el('span', null, ' · ticket ' +
          C.fmtMoney(C.ticketMedio(total, peds.length))) : null);

      for (const p of peds.slice(0, 80)) {
        const cli = DB.byId('clientes', p.cliente_id) || {};
        const temObs = !!(p.observacoes || '').trim();
        lista.appendChild(el('div', { class: 'item-lista card-pedido' + (temObs ? ' com-obs' : '') },
          el('div', { class: 'selos-pedido' },
            // bolinha laranja com a nota fiscal: pedido já faturado no New Star
            // o selo também sai na cor de quem faturou: bate o olho e já sabe
            p.faturado_ns ? el('span', {
              class: 'selo-nf', title: 'Faturado no New Star',
              style: '--cor-rep:' + corDoRep(p.representante_id) +
                ';--cor-rep-texto:' + corTextoRep(p.representante_id)
            }, ico('notaFiscal')) : null,
            temObs ? el('span', { class: 'selo-obs', title: 'Este pedido tem observação' }, '⚠️') : null),
          el('div', { class: 'grow', onclick: () => window.NSPedido.abrir(p.id) },
            el('div', { class: 'row space w100' },
              el('strong', null, 'Nº ' + (p.numero || '—') + ' · ' + nomeExib(cli)),
              el('strong', null, C.fmtMoney(Number(p.total_valor)))),
            cli.cnpj_cpf ? el('div', { class: 'cnpj-chip mt4' },
              el('span', { class: 'cnpj-rot' },
                String(cli.cnpj_cpf).replace(/\D/g, '').length === 11 ? 'CPF' : 'CNPJ'),
              C.fmtCNPJ(cli.cnpj_cpf)) : null,
            el('span', { class: 'sub mt4' }, dataBR(p.data_pedido) + ' · ' +
              (p.tabela === 'lucro' ? 'Lucro Presumido' : 'Simples') +
              ' · ' + p.total_unid_vendidas + ' un' +
              (p.assinante_nome ? ' · recebido por ' + p.assinante_nome : '')),
            // na carteira compartilhada o histórico é da equipe: diz quem vendeu
            (carteiraCompartilhada() && p.representante_id !== (s0 && s0.rep.id))
              ? el('span', { class: 'badge outro-vendedor mt4' },
                ico('usuario', 'ic-sm'), 'vendido por ' + nomeDoRep(p.representante_id)) : null),
          el('div', { class: 'row gap8 mt8' },
            (() => {
              // a cor é a do DONO do pedido: bate o olho e já sabe de quem é
              const meu = podeFaturar(p);
              const cor = corDoRep(p.representante_id);
              const btn = el('button', {
                class: 'btn-mini grow btn-faturar' + (p.faturado_ns ? ' feito' : '') + (meu ? '' : ' travado'),
                style: '--cor-rep:' + cor + ';--cor-rep-texto:' + corTextoRep(p.representante_id),
                title: meu ? 'Marcar como faturado no New Star' : motivoNaoFatura(p),
                onclick: () => {
                  if (!meu) return toast(motivoNaoFatura(p), 'erro');
                  confirmarFaturamento(p.id, render);
                }
              }, rot('notaFiscal', p.faturado_ns ? 'Faturado' : (meu ? 'Marcar faturado' : 'Só ' + (nomeDoRep(p.representante_id) || 'o dono') + ' fatura')));
              return btn;
            })(),
            temObs ? el('button', {
              class: 'btn-mini obs', onclick: () => window.NSPedido.verObservacao(p)
            }, el('span', { class: 'obs-emoji' }, '⚠️'), el('span', null, 'Observação')) : null)));
      }
      if (!peds.length) lista.appendChild(el('p', { class: 'vazio' },
        'Nenhum pedido com esses filtros.'));
      else if (peds.length > 80) lista.appendChild(el('p', { class: 'sub' },
        'Mostrando os 80 mais recentes — use os filtros para refinar.'));
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
    // ── comissões ──
    // Clamed paga 45 dias depois da venda; os demais clientes caem no dia 1 do
    // mês seguinte. Por isso separamos "o que a venda deste mês gerou" de
    // "o que efetivamente cai no caixa em cada mês".
    const ehClamed = (v) => {
      const c = DB.byId('clientes', v.cliente_id);
      return !!(c && Number(c.recebimento_dias) > 0);
    };
    const comValor = (arr) => arr.reduce((s, v) => s + Number(v.comissao_valor || 0), 0);
    const proxMes = (() => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + 1);
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); })();
    const comComissao = visitas.filter(v => Number(v.comissao_valor || 0) !== 0);

    // 1) o que a venda DESTE mês gerou de comissão (cai depois)
    const comissaoVendasMes = comValor(vMes);
    // 2) comissão da Clamed que CAI neste mês (venda de ~45 dias atrás)
    const clamedCaiEsteMes = comValor(comComissao.filter(v => ehClamed(v) && noMes(v.comissao_recebimento_em)));
    // "comissão gerada" = o que vendi agora + a Clamed que está caindo agora
    const comissaoGerada = C.round2(comissaoVendasMes + clamedCaiEsteMes);
    // 3) o que entra no PRÓXIMO mês (normais + Clamed que vence lá)
    const noProx = (iso) => (iso || '').slice(0, 7) === proxMes;
    const proxNormais = comValor(comComissao.filter(v => !ehClamed(v) && noProx(v.comissao_recebimento_em)));
    const proxClamed = comValor(comComissao.filter(v => ehClamed(v) && noProx(v.comissao_recebimento_em)));
    const aReceber = C.round2(proxNormais + proxClamed);
    // 4) TODA a Clamed ainda pendente (próximo mês e os seguintes)
    const clamedPendente = comValor(comComissao.filter(v => ehClamed(v) &&
      (v.comissao_recebimento_em || '') > hojeISO()));
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

    // ── A META DA EQUIPE EM PRIMEIRO LUGAR ──
    // A meta é UMA SÓ, da equipe: as vendas dos dois vendedores somam nela, no
    // mês e no dia. Logo abaixo vem o desempenho de cada um, separado.
    const { placar, meta: mq } = metaDoDiaEquipe(mes, hojeISO());
    const metaMes = mq.metaMes;
    if (metaMes > 0) {
      const linha = (rotulo, valor, cls) => el('div', { class: 'row space meta-linha' },
        el('span', null, rotulo), el('strong', { class: cls || null }, valor));
      const feriadoHoje = feriadosDe(hojeISO()).has(hojeISO());
      view.appendChild(el('div', { class: 'painel-meta mt8' },
        el('div', { class: 'painel-meta-topo' },
          el('span', null, 'Meta do mês · equipe'),
          el('strong', null, C.fmtMoney(metaMes))),
        el('div', { class: 'progresso-barra mt8' },
          el('div', { class: 'progresso-fill', style: 'width:' + Math.min(100, mq.pctMes) + '%' })),
        el('div', { class: 'meta-corpo mt8' },
          linha('Vendido pela equipe', C.fmtMoney(mq.vendidoMes), 'ok'),
          linha('Falta vender', C.fmtMoney(mq.faltaMes), mq.batidaMes ? 'ok' : 'destaque'),
          linha('Atingimento', C.fmtPct(mq.pctMes), mq.batidaMes ? 'ok' : null),
          linha('Dias úteis restantes', String(mq.uteisRestantes)),
          el('div', { class: 'meta-sep' }),
          linha('Meta de hoje · equipe', C.fmtMoney(mq.metaDia), 'destaque'),
          linha('Vendido hoje pela equipe', C.fmtMoney(mq.vendidoHoje), 'ok'),
          mq.excedenteHoje > 0
            ? linha('Passou da meta de hoje em', C.fmtMoney(mq.excedenteHoje), 'ok')
            : linha('Falta para a meta de hoje', C.fmtMoney(mq.faltaHoje), 'destaque')),
        el('div', { class: 'meta-selo ' + (mq.batidaMes || mq.batidaHoje ? 'ok' : 'falta') + ' mt8' },
          mq.batidaMes ? 'META DO MÊS BATIDA!'
            : (mq.batidaHoje ? 'Meta de hoje batida' : 'Meta de hoje ainda não batida')),
        el('p', { class: 'meta-rodape mt8' }, feriadoHoje
          ? 'Hoje é feriado (' + (nomeFeriado(hojeISO()) || 'dia parado') + ') e não conta como dia útil.'
          : 'A meta de hoje fica travada até a virada do dia. O que sobrar ou faltar entra na conta do próximo dia útil.')));
      // desempenho de cada vendedor, logo abaixo da meta da equipe
      const eq = blocoEquipe(mes, metaMes, placar);
      if (eq) view.appendChild(eq);
    } else {
      view.appendChild(el('p', { class: 'sub mt8' },
        'Nenhuma meta cadastrada para ' + rotuloMes(mes) + ' — cadastre em Mais → Relatórios.'));
    }

    // quadro de comissões: o que gerei agora e o que tenho para receber
    view.appendChild(el('div', { class: 'painel-comissao mt12' },
      el('div', { class: 'painel-meta-topo' },
        el('span', null, 'A receber no próximo mês'),
        el('strong', null, C.fmtMoney(aReceber))),
      el('div', { class: 'meta-corpo mt8' },
        el('div', { class: 'row space meta-linha' },
          el('span', null, 'Clientes normais'), el('strong', null, C.fmtMoney(proxNormais))),
        el('div', { class: 'row space meta-linha' },
          el('span', null, 'Clamed (45 dias)'), el('strong', null, C.fmtMoney(proxClamed))),
        el('div', { class: 'meta-sep' }),
        el('div', { class: 'row space meta-linha' },
          el('span', null, 'Clamed pendente (todos os meses)'),
          el('strong', { class: 'destaque' }, C.fmtMoney(clamedPendente))),
        el('div', { class: 'row space meta-linha' },
          el('span', null, 'Comissão das vendas deste mês'), el('strong', null, C.fmtMoney(comissaoVendasMes))),
        el('div', { class: 'row space meta-linha' },
          el('span', null, 'Clamed caindo neste mês'), el('strong', null, C.fmtMoney(clamedCaiEsteMes))))));

    // estes números são do VENDEDOR logado — a meta acima é que é da equipe
    const meusPedidosMes = DB.all('pedidos').filter(doRep)
      .filter(p => p.status === 'concluido' && noMes(p.data_pedido));
    const meuVendidoMes = meusPedidosMes.reduce((t, p) => t + Number(p.total_valor || 0), 0);
    view.appendChild(el('div', { class: 'kpis mt16' },
      kpi('Faturamento (vendido)', C.fmtMoney(faturamento)),
      kpi('Ticket médio (' + meusPedidosMes.length + ' pedidos)',
        C.fmtMoney(C.ticketMedio(meuVendidoMes, meusPedidosMes.length))),
      kpi('Comissão gerada no mês', C.fmtMoney(comissaoGerada)),
      kpi('A receber no próximo mês', C.fmtMoney(aReceber), 'destaque'),
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
        el('span', { class: 'row gap8' }, farol('vermelho'), a.c.nome),
        el('span', { class: 'sub' }, a.dias + 'd sem pedido'))));
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
    view.appendChild(item('documento', 'Exportar em PDF e Excel', 'Clientes e pedidos, com ou sem filtros', telaExportar));
    view.appendChild(item('dinheiro', 'Financeiro', 'Caixa da empresa: receitas, despesas e comissões', telaFinanceiro));
    view.appendChild(item('pin', 'Geocodificar clientes', 'Localizar endereços no mapa', telaGeocode));
    view.appendChild(item('paleta', 'Aparência', 'Cores do app', telaAparencia));
    view.appendChild(item('pessoas', 'Clientes', 'Cadastrar, editar, excluir, importar/exportar', telaAdminClientes));
    if (s.papel === 'gestor') {
      view.appendChild(el('h3', { class: 'mt16' }, 'Administração'));
      view.appendChild(item('joia', 'Produtos e preços', 'Catálogo e tabelas', telaAdminProdutos));
      view.appendChild(item('usuario', 'Vendedores', 'Equipe e comissões', telaAdminVendedores));
      view.appendChild(item('calendario', 'Feriados e dias parados', 'Dias que não contam na meta', telaFeriados));
      view.appendChild(item('etiqueta', 'Categorias do financeiro', 'Organizar os gastos por tipo', telaCategoriasFin));
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
  // meta padrão combinada com o gestor: R$ 200.000 por mês → R$ 2.400.000 no ano
  const META_MES_PADRAO = 200000;
  function metaDoPeriodo(base, periodo) {
    const v = DB.config(base + '_' + periodo, null);
    if (v !== null && v !== undefined && v !== '' && Number(v)) return Number(v);
    const geral = Number(DB.config(META_PADRAO[base], 0)) || 0;
    if (geral) return geral;
    if (base === 'meta_mes') return META_MES_PADRAO;
    // a meta do ano é a do mês × 12 quando ninguém cadastrou uma diferente
    if (base === 'meta_ano') return metaDoPeriodo('meta_mes', String(periodo).slice(0, 4) + '-01') * 12;
    return 0;
  }

  // ---------- cor de cada vendedor ----------
  // A mesma cor identifica o vendedor no painel da equipe e no botão de faturado
  // no New Star: bate o olho e já sabe de quem é o pedido. Fica no cadastro
  // (Admin → Vendedores), então entra vendedor novo e escolhe a dele.
  const CORES_REP = [
    ['laranja', 'Laranja', '#FF8A2B', '#9A4A00'],
    ['roxo', 'Roxo brilhante', '#8B2BFF', '#FFFFFF'],
    ['verde', 'Verde', '#15A05B', '#FFFFFF'],
    ['azul', 'Azul', '#2E8BE6', '#FFFFFF'],
    ['rosa', 'Rosa', '#E0218A', '#FFFFFF'],
    ['vermelho', 'Vermelho', '#E03131', '#FFFFFF']
  ];
  // os dois vendedores de hoje já nascem com a cor combinada
  const COR_PADRAO_REP = { gustavo: 'laranja', denilson: 'roxo' };
  function chaveCorRep(rep) {
    if (rep && rep.cor && CORES_REP.some(c => c[0] === rep.cor)) return rep.cor;
    const n = String((rep && rep.nome) || '').trim().toLowerCase().split(/\s+/)[0];
    return COR_PADRAO_REP[n] || 'azul';
  }
  function corRep(repId) {
    const rep = (repId && typeof repId === 'object') ? repId : DB.byId('representantes', repId);
    const c = CORES_REP.find(x => x[0] === chaveCorRep(rep));
    return c || CORES_REP[3];
  }
  const corDoRep = (repId) => corRep(repId)[2];
  const corTextoRep = (repId) => corRep(repId)[3];

  // ---------- feriados ----------
  // Nacionais (calculados por ano, inclusive a Paixão de Cristo que muda de data)
  // mais os que a empresa cadastrar em Admin → Feriados: estaduais, municipais,
  // pontos facultativos que ela decidir folgar e dias parados por qualquer motivo.
  function feriadosExtra() {
    const v = DB.config('feriados_extra', []);
    return Array.isArray(v) ? v : [];
  }
  function feriadosDe(anoOuISO) {
    const ano = Number(String(anoOuISO).slice(0, 4));
    return C.feriadosDoAno(ano, feriadosExtra());
  }
  // nome do feriado, para a tela mostrar o motivo do dia parado
  function nomeFeriado(iso) {
    const extra = feriadosExtra().find(f => (typeof f === 'string' ? f : f.data) === iso);
    if (extra && extra.nome) return extra.nome;
    const NACIONAIS = {
      '01-01': 'Confraternização Universal', '04-21': 'Tiradentes', '05-01': 'Dia do Trabalho',
      '09-07': 'Independência', '10-12': 'Nossa Senhora Aparecida', '11-02': 'Finados',
      '11-15': 'Proclamação da República', '11-20': 'Consciência Negra', '12-25': 'Natal'
    };
    if (NACIONAIS[iso.slice(5)]) return NACIONAIS[iso.slice(5)];
    if (C.feriadosNacionais(iso.slice(0, 4)).indexOf(iso) >= 0) return 'Paixão de Cristo';
    return extra ? 'Feriado cadastrado' : '';
  }

  // ---------- placar da equipe ----------
  // Os dois trabalham juntos e a meta do mês é da equipe, então cada vendedor vê
  // a parte dele E a do colega. Não é ranking para cobrar ninguém: é para os
  // dois saberem quanto falta para fechar o mês JUNTOS.
  function placarEquipe(mes, dia) {
    dia = dia || hojeISO();
    const vendedores = DB.all('representantes')
      .filter(r => r.papel === 'vendedor' && r.ativo !== false);
    const porRep = {};
    const zero = () => ({ vendido: 0, pedidos: 0, vendidoDia: 0, pedidosDia: 0, vendidoAteOntem: 0 });
    for (const p of DB.all('pedidos')) {
      if (p.status !== 'concluido') continue;
      if ((p.data_pedido || '').slice(0, 7) !== mes) continue;
      const r = (porRep[p.representante_id] = porRep[p.representante_id] || zero());
      const v = Number(p.total_valor || 0);
      r.vendido = C.round2(r.vendido + v);
      r.pedidos++;
      if (p.data_pedido === dia) { r.vendidoDia = C.round2(r.vendidoDia + v); r.pedidosDia++; }
      // base da meta do dia: tudo que foi vendido ANTES de hoje
      if ((p.data_pedido || '') < dia) r.vendidoAteOntem = C.round2(r.vendidoAteOntem + v);
    }
    const linhas = vendedores.map(r => Object.assign({ id: r.id, nome: r.nome }, zero(), porRep[r.id] || {}))
      .sort((a2, b2) => b2.vendido - a2.vendido);
    const soma = (campo) => C.round2(linhas.reduce((t, l) => t + l[campo], 0));
    const contar = (campo) => linhas.reduce((t, l) => t + l[campo], 0);
    return {
      linhas, total: soma('vendido'), totalDia: soma('vendidoDia'),
      totalAteOntem: soma('vendidoAteOntem'),
      pedidos: contar('pedidos'), pedidosDia: contar('pedidosDia')
    };
  }

  // ---------- meta do dia congelada ----------
  // O alvo do dia é gravado no dia em que é calculado. Depois disso ele não se
  // mexe mais: nem vendendo, nem editando um pedido antigo. Se a meta do MÊS
  // for alterada pelo gestor, aí sim o alvo do dia é refeito — senão ele ficaria
  // olhando para um número que não existe mais.
  function metaDiaCongelada(dia, metaMes, vendidoAteOntem) {
    const chave = 'meta_dia_fixa_' + dia;
    const salvo = DB.config(chave, null);
    if (salvo && Number(salvo.meta_mes) === Number(metaMes) && salvo.valor != null)
      return Number(salvo.valor);
    const r = C.metaDoDia({
      metaMes, vendidoAteOntem, hoje: dia, feriados: feriadosDe(dia),
      metaDiaManual: metaDoPeriodo('meta_dia', dia.slice(0, 7))
    });
    DB.upsertConfig(chave, {
      valor: r.metaDia, meta_mes: Number(metaMes) || 0,
      base: C.round2(vendidoAteOntem), dias_uteis: r.uteisRestantes,
      congelada_em: new Date().toISOString()
    });
    return r.metaDia;
  }
  // tudo que a meta do dia precisa, já com a equipe somada e o alvo congelado
  function metaDoDiaEquipe(mes, dia) {
    const pl = placarEquipe(mes, dia);
    const metaMes = metaDoPeriodo('meta_mes', mes);
    const ehHojeNesteMes = dia === hojeISO() && mes === mesISO();
    const fixada = (metaMes > 0 && ehHojeNesteMes)
      ? metaDiaCongelada(dia, metaMes, pl.totalAteOntem) : null;
    const m = C.metaEquipe({
      metaMes, vendidoMes: pl.total, vendidoHoje: pl.totalDia,
      vendidoAteOntem: pl.totalAteOntem, hoje: dia, feriados: feriadosDe(dia),
      metaDiaFixada: fixada, metaDiaManual: metaDoPeriodo('meta_dia', mes)
    });
    return { placar: pl, meta: m };
  }
  // ---------- desempenho de cada vendedor ----------
  // A meta é da equipe, mas o resultado de cada um aparece separado: mês, dia,
  // quantidade de pedidos e quanto ele representa da meta total.
  // Devolve null quando só existe um vendedor (aí não há equipe para comparar).
  function blocoEquipe(mes, metaMes, placar) {
    const s = sessao();
    const euId = s && s.rep ? s.rep.id : null;
    const pl = placar || placarEquipe(mes, hojeISO());
    if (pl.linhas.length < 2) return null;
    const pct = (v) => metaMes > 0 ? C.round2(v / metaMes * 100) : 0;
    const barra = (v) => Math.max(0, Math.min(100, pct(v)));
    const falta = C.round2(Math.max(0, metaMes - pl.total));
    const mini = (rot2, val) => el('div', { class: 'vend-mini' },
      el('span', { class: 'vend-mini-rot' }, rot2), el('strong', null, val));
    return el('div', { class: 'painel-equipe mt12' },
      el('div', { class: 'painel-meta-topo' },
        el('span', null, 'Desempenho por vendedor'),
        el('strong', null, C.fmtMoney(pl.total))),
      el('div', { class: 'meta-corpo mt8' },
        pl.linhas.map(l => el('div', { class: 'equipe-linha' + (l.id === euId ? ' eu' : '') },
          el('div', { class: 'row space' },
            el('span', { class: 'vend-nome' },
              el('span', { class: 'vend-bolinha', style: 'background:' + corDoRep(l.id) }),
              l.nome + (l.id === euId ? ' · você' : '')),
            el('strong', null, C.fmtMoney(l.vendido))),
          el('div', { class: 'progresso-barra fina mt4' },
            el('div', {
              class: 'progresso-fill',
              style: 'width:' + barra(l.vendido) + '%;background:' + corDoRep(l.id)
            })),
          el('div', { class: 'vend-grade mt4' },
            mini('no mês', C.fmtMoney(l.vendido)),
            mini('no dia', C.fmtMoney(l.vendidoDia)),
            mini('pedidos no mês', String(l.pedidos)),
            mini('pedidos no dia', String(l.pedidosDia))),
          el('span', { class: 'equipe-sub' }, metaMes > 0
            ? 'Representa ' + C.fmtPct(pct(l.vendido)) + ' da meta da equipe'
            : l.pedidos + (l.pedidos === 1 ? ' pedido' : ' pedidos')))),
        el('div', { class: 'meta-sep' }),
        el('div', { class: 'row space meta-linha' },
          el('span', null, pl.linhas.length === 2 ? 'Os dois juntos' : 'A equipe junta'),
          el('strong', { class: metaMes > 0 && pl.total >= metaMes ? 'ok' : 'destaque' },
            metaMes > 0 ? C.fmtPct(pct(pl.total)) + ' da meta' : C.fmtMoney(pl.total))),
        el('div', { class: 'row space meta-linha' },
          el('span', null, 'Vendido hoje pela equipe'),
          el('strong', null, C.fmtMoney(pl.totalDia) +
            (pl.pedidosDia ? ' · ' + pl.pedidosDia + (pl.pedidosDia === 1 ? ' pedido' : ' pedidos') : ''))),
        metaMes > 0 ? el('div', { class: 'row space meta-linha' },
          el('span', null, falta > 0 ? 'Falta para a equipe' : 'Passou da meta em'),
          el('strong', { class: falta > 0 ? null : 'ok' },
            C.fmtMoney(falta > 0 ? falta : C.round2(pl.total - metaMes)))) : null));
  }

  // ---------- Excel (.xlsx) sem biblioteca ----------
  // Um .xlsx é um ZIP com alguns XMLs dentro. Aqui o ZIP é montado sem
  // compressão (método "store"), o que dispensa qualquer biblioteca e abre
  // normalmente no Excel, no Google Planilhas e no LibreOffice.
  const TABELA_CRC = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(bytes) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) c = TABELA_CRC[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  function zipStore(arquivos) {
    const enc = new TextEncoder();
    const partes = [], central = [];
    let desloc = 0;
    const u16 = (n) => [n & 255, (n >>> 8) & 255];
    const u32 = (n) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];
    for (const a of arquivos) {
      const nome = enc.encode(a.nome);
      const dados = enc.encode(a.texto);
      const crc = crc32(dados);
      const cab = [].concat([0x50, 0x4b, 0x03, 0x04], u16(20), u16(0), u16(0), u16(0), u16(0),
        u32(crc), u32(dados.length), u32(dados.length), u16(nome.length), u16(0));
      partes.push(new Uint8Array(cab), nome, dados);
      central.push({ crc, tam: dados.length, nome, desloc });
      desloc += cab.length + nome.length + dados.length;
    }
    const dirPartes = [];
    let tamDir = 0;
    for (const c of central) {
      const cab = [].concat([0x50, 0x4b, 0x01, 0x02], u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
        u32(c.crc), u32(c.tam), u32(c.tam), u16(c.nome.length),
        u16(0), u16(0), u16(0), u16(0), u32(0), u32(c.desloc));
      dirPartes.push(new Uint8Array(cab), c.nome);
      tamDir += cab.length + c.nome.length;
    }
    const fim = new Uint8Array([].concat([0x50, 0x4b, 0x05, 0x06], u16(0), u16(0),
      u16(central.length), u16(central.length), u32(tamDir), u32(desloc), u16(0)));
    return new Blob(partes.concat(dirPartes, [fim]),
      { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }
  const escX = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/\u0000-\u0008|\u000b|\u000c|\u000e-\u001f/g, '');
  const colLetra = (n) => {
    let s = '';
    while (n >= 0) { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; }
    return s;
  };
  // linhas: primeira é o cabeçalho; números viram número de verdade na planilha
  function gerarXLSX(linhas, nomeAba) {
    const xmlLinhas = linhas.map((linha, i) => {
      const cels = linha.map((v, j) => {
        const ref = colLetra(j) + (i + 1);
        const num = typeof v === 'number' && Number.isFinite(v);
        if (num) return `<c r="${ref}"><v>${v}</v></c>`;
        return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escX(v)}</t></is></c>`;
      }).join('');
      return `<row r="${i + 1}">${cels}</row>`;
    }).join('');
    const sheet = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      (linhas.length ? `<sheetData>${xmlLinhas}</sheetData>` : '<sheetData/>') +
      '</worksheet>';
    return zipStore([
      { nome: '[Content_Types].xml', texto: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
        '</Types>' },
      { nome: '_rels/.rels', texto: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        '</Relationships>' },
      { nome: 'xl/workbook.xml', texto: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        `<sheets><sheet name="${escX((nomeAba || 'Dados').slice(0, 28))}" sheetId="1" r:id="rId1"/></sheets>` +
        '</workbook>' },
      { nome: 'xl/_rels/workbook.xml.rels', texto: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
        '</Relationships>' },
      { nome: 'xl/worksheets/sheet1.xml', texto: sheet }
    ]);
  }

  // ---------- PDF de tabela (relatório) ----------
  // Reaproveita o escritor de PDF do talão: paisagem, cabeçalho em faixa,
  // linhas zebradas e quebra de página automática.
  function gerarPDFTabela({ titulo, subtitulo, colunas, linhas }) {
    return window.NSPDF.gerarRelatorio({ titulo, subtitulo, colunas, linhas });
  }

  // ================= EXPORTAR RELATÓRIOS (PDF e Excel) =================
  // Exporta o que está na tela: se houver filtros ligados nas abas Clientes ou
  // Pedidos, o arquivo sai só com aqueles registros. Também dá para exportar
  // tudo, sem filtro nenhum.
  function dadosClientes(usarFiltros) {
    const repId = repEfetivoId();
    const hoje = hojeISO();
    const avisoDias = Number(DB.config('alerta_vencendo_dias', 7));
    const linhasCat = linhasDoCatalogo();
    const f = fClientes;
    let lista = clientesDoRep(repId).map(c => ({
      c, st: statusCliente(c, hoje, avisoDias), pot: potencialDoCliente(c.id)
    }));
    if (usarFiltros) lista = lista.filter(({ c, st, pot }) => {
      if (f.tipo === 'clientes' && ehProspec(c)) return false;
      if (f.tipo === 'prospec' && !ehProspec(c)) return false;
      if (f.prioridade === 'sim' && !ehPrioritario(c)) return false;
      if (f.prioridade === 'nao' && ehPrioritario(c)) return false;
      if (f.potencial !== 'todos') {
        if (f.potencial === 'sem') { if (pot) return false; }
        else if (pot !== f.potencial) return false;
      }
      if (f.classe !== 'todos' && C.classeDe(c) !== f.classe) return false;
      if (f.status !== 'todos' && st.k !== f.status) return false;
      if (f.semVisita !== 'todos' && diasSemAtendimento(c) < Number(f.semVisita)) return false;
      if (f.semPedido !== 'todos' && diasSemPedido(c) < Number(f.semPedido)) return false;
      if (f.mix !== 'todos') {
        const completo = mixCompleto(c.id, linhasCat);
        if (f.mix === 'completo' && !completo) return false;
        if (f.mix === 'incompleto' && completo) return false;
      }
      return true;
    });
    lista.sort((a, b) => (a.c.nome || '').localeCompare(b.c.nome || ''));
    const colunas = [
      { t: 'Cliente', peso: 2.4 }, { t: 'Nome fantasia', peso: 2 }, { t: 'CNPJ/CPF', peso: 1.5 },
      { t: 'Cidade', peso: 1.3 }, { t: 'UF', peso: .4 }, { t: 'Telefone', peso: 1.2 },
      { t: 'Situação', peso: .9 }, { t: 'Prioridade', peso: .8 }, { t: 'Classe', peso: .6 },
      { t: 'Ciclo (dias)', peso: .8, dir: true }, { t: 'Status', peso: 1.2 },
      { t: 'Última visita', peso: 1 }, { t: 'Próxima visita', peso: 1 },
      { t: 'Dias sem visita', peso: .9, dir: true }, { t: 'Dias sem pedido', peso: .9, dir: true },
      { t: 'Último pedido (R$)', peso: 1.1, dir: true }, { t: 'Potencial', peso: 1 },
      { t: 'Mix completo', peso: .9 }, { t: 'Rede', peso: 1 }
    ];
    const linhas = lista.map(({ c, st, pot }) => [
      c.nome || '', c.nome_fantasia || '', c.cnpj_cpf ? C.fmtCNPJ(c.cnpj_cpf) : '',
      c.cidade || '', c.uf || '', c.telefone || c.celular || '',
      ehProspec(c) ? 'Prospecção' : 'Cliente', ehPrioritario(c) ? 'SIM' : '',
      C.classeDe(c), cicloDoCliente(c), st.rot,
      dataBR(c.ultima_visita_em) === '—' ? '' : dataBR(c.ultima_visita_em),
      dataBR(proximaVisitaDe(c)) === '—' ? '' : dataBR(proximaVisitaDe(c)),
      diasSemAtendimento(c) >= 9999 ? '' : diasSemAtendimento(c),
      diasSemPedido(c) >= 9999 ? '' : diasSemPedido(c),
      ultimoPedidoValor(c.id) || '', pot ? C.nomePotencial(pot) : 'Sem pedido',
      mixCompleto(c.id, linhasCat) ? 'SIM' : 'não', c.rede || ''
    ]);
    return { colunas, linhas, titulo: 'Clientes', n: linhas.length };
  }

  function dadosPedidos(usarFiltros) {
    const repId = repEfetivoId();
    const f = fPedidos;
    let peds = DB.all('pedidos')
      .filter(doHistorico(repId))
      .filter(p => p.status !== 'cancelado');
    if (usarFiltros) peds = peds.filter(p => {
      if (f.faturado === 'sim' && !p.faturado_ns) return false;
      if (f.faturado === 'pendente' && p.faturado_ns) return false;
      if (f.mes !== 'todos' && (p.data_pedido || '').slice(0, 7) !== f.mes) return false;
      if (f.tabela !== 'todos' && (p.tabela || 'simples') !== f.tabela) return false;
      if (f.obs === 'sim' && !(p.observacoes || '').trim()) return false;
      if (f.recebimento === 'sim' && !(p.assinante_nome || '').trim()) return false;
      if (f.recebimento === 'nao' && (p.assinante_nome || '').trim()) return false;
      return true;
    });
    peds.sort((a, b) => (b.data_pedido || '').localeCompare(a.data_pedido || ''));
    const colunas = [
      { t: 'Nº', peso: .6, dir: true }, { t: 'Data', peso: 1 }, { t: 'Cliente', peso: 2.6 },
      { t: 'CNPJ/CPF', peso: 1.5 }, { t: 'Cidade', peso: 1.2 }, { t: 'Tabela', peso: 1.1 },
      { t: 'Un. vendidas', peso: .9, dir: true }, { t: 'Desconto %', peso: .8, dir: true },
      { t: 'Total (R$)', peso: 1.1, dir: true }, { t: 'Comissão %', peso: .8, dir: true },
      { t: 'Comissão (R$)', peso: 1, dir: true }, { t: 'Prazo', peso: 1 },
      { t: 'Faturado New Star', peso: 1 }, { t: 'Recebido por', peso: 1.4 },
      { t: 'Observação', peso: 2 }
    ];
    const linhas = peds.map(p => {
      const cli = DB.byId('clientes', p.cliente_id) || {};
      const v = DB.all('visitas').find(x => x.pedido_id === p.id) || {};
      return [
        p.numero || '', dataBR(p.data_pedido), cli.nome || '',
        cli.cnpj_cpf ? C.fmtCNPJ(cli.cnpj_cpf) : '', cli.cidade || '',
        p.tabela === 'lucro' ? 'Lucro Presumido' : 'Simples',
        Number(p.total_unid_vendidas || 0), Number(p.desconto_pct || 0),
        Number(p.total_valor || 0), Number(v.comissao_pct || 0), Number(v.comissao_valor || 0),
        p.condicao_pagamento || '', p.faturado_ns ? 'SIM' : 'não',
        p.assinante_nome || '', (p.observacoes || '').replace(/\s+/g, ' ')
      ];
    });
    return { colunas, linhas, titulo: 'Pedidos', n: linhas.length };
  }

  function telaExportar() {
    const wrap = el('div');
    const m = modal(wrap, { titulo: 'Exportar dados', full: true });
    let usarFiltros = true;
    const pintar = () => {
      const cli = dadosClientes(usarFiltros);
      const ped = dadosPedidos(usarFiltros);
      const nFiltrosCli = filtrosAtivos(FILTROS_CLIENTES, fClientes).length;
      const nFiltrosPed = filtrosAtivos(FILTROS_PEDIDOS, fPedidos).length;
      const quando = new Date().toLocaleString('pt-BR');
      const sufixo = hojeISO().replace(/-/g, '');

      const baixarPDF = (d) => {
        const blob = window.NSPDF.gerarRelatorio({
          titulo: 'NEW STAR — ' + d.titulo,
          subtitulo: (usarFiltros ? 'Com os filtros do app' : 'Relatório completo, sem filtros') +
            ' · ' + sessao().rep.nome + ' · ' + quando,
          colunas: d.colunas, linhas: d.linhas
        });
        window.NSUI.baixar(blob, d.titulo.toLowerCase() + '-' + sufixo + '.pdf');
        toast(d.titulo + ' em PDF: ' + d.n + ' registro(s).');
      };
      const baixarXLS = (d) => {
        const blob = gerarXLSX([d.colunas.map(c => c.t)].concat(d.linhas), d.titulo);
        window.NSUI.baixar(blob, d.titulo.toLowerCase() + '-' + sufixo + '.xlsx');
        toast(d.titulo + ' em Excel: ' + d.n + ' registro(s).');
      };

      const bloco = (d, nFiltros) => el('div', { class: 'card-export' },
        el('div', { class: 'row space w100' },
          el('strong', null, d.titulo),
          el('span', { class: 'badge' }, d.n + ' registro(s)')),
        el('p', { class: 'sub mt4' }, usarFiltros && nFiltros
          ? nFiltros + ' filtro(s) da aba ' + d.titulo + ' aplicados'
          : 'Sem filtro — todos os registros'),
        el('div', { class: 'row gap8 mt8' },
          el('button', { class: 'btn grow', onclick: () => baixarPDF(d) }, rot('documento', 'PDF')),
          el('button', { class: 'btn btn-sec grow', onclick: () => baixarXLS(d) }, rot('grafico', 'Excel'))));

      repor(wrap,
        el('div', { class: 'col gap8' },
          el('button', {
            class: 'card-escolha' + (usarFiltros ? ' ativo' : ''),
            onclick: () => { usarFiltros = true; pintar(); }
          }, el('strong', null, 'Usar os filtros do app'),
            el('span', { class: 'sub' }, 'Exporta só o que está aparecendo nas abas Clientes e Pedidos')),
          el('button', {
            class: 'card-escolha' + (!usarFiltros ? ' ativo' : ''),
            onclick: () => { usarFiltros = false; pintar(); }
          }, el('strong', null, 'Exportar tudo'),
            el('span', { class: 'sub' }, 'Relatório completo, ignorando os filtros'))),
        el('h4', { class: 'mt16' }, 'Escolha o arquivo'),
        el('div', { class: 'col gap8 mt8' }, bloco(cli, nFiltrosCli), bloco(ped, nFiltrosPed)),
        el('p', { class: 'sub mt12' },
          'O PDF sai em paisagem, com cabeçalho e uma linha por registro. ' +
          'O Excel (.xlsx) sai com uma coluna por informação, pronto para filtrar e somar. ' +
          'Os arquivos são gerados no próprio aparelho e funcionam sem internet.'));
    };
    pintar();
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
      // A meta é da EQUIPE: o progresso do mês conta a venda dos dois vendedores,
      // não só a de quem está olhando a tela.
      const plRel = placarEquipe(mes, ref);
      const vendMesEquipe = plRel.total;
      const mt = C.calcMeta({ metaMes, hoje: ref, vendidoMes: vendMesEquipe,
        metaDiaManual, feriados: feriadosExtra() });
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
        if (pedsHoje.length) wrap.appendChild(el('div', { class: 'sub mt4' },
          'Ticket médio de hoje: ' + C.fmtMoney(C.ticketMedio(vendHoje, pedsHoje.length))));
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
      // ticket médio do período escolhido (acompanha o mês e o vendedor filtrados)
      wrap.appendChild(el('div', { class: 'total-bar mt4' },
        el('span', null, 'Ticket médio por pedido'),
        el('strong', null, C.fmtMoney(C.ticketMedio(vendMes, pedsMes.length)))));
      (() => {
        const clientesMes = new Set(pedsMes.map(p => p.cliente_id)).size;
        if (!clientesMes) return;
        wrap.appendChild(el('div', { class: 'sub mt4' },
          'Por cliente atendido: ' + C.fmtMoney(C.ticketMedio(vendMes, clientesMes)) +
          ' (' + clientesMes + ' cliente(s) compraram no mês)'));
      })();

      // meta do ano (do ano do mês escolhido)
      const metaAno = metaDoPeriodo('meta_ano', ano);
      const pedsAno = peds.filter(p => (p.data_pedido || '').slice(0, 4) === ano);
      const vendAno = pedsAno.reduce((t, p) => t + Number(p.total_valor || 0), 0);

      wrap.appendChild(el('h3', { class: 'mt16' }, 'Meta de ' + rotuloMes(mes)));
      if (metaMes > 0) {
        wrap.appendChild(el('div', { class: 'progresso mt4' },
          el('div', { class: 'progresso-info' },
            `${C.fmtMoney(vendMesEquipe)} de ${C.fmtMoney(metaMes)} · ${C.fmtPct(mt.pct)} da meta (equipe)`),
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
              : `Mês fechado em ${C.fmtPct(mt.pct)} da meta — faltaram ${C.fmtMoney(C.round2(metaMes - vendMesEquipe))}.`));
        }
      } else {
        wrap.appendChild(el('p', { class: 'sub mt4' }, 'Nenhuma meta cadastrada para o mês.'));
      }
      // o mesmo mês visto pela EQUIPE: a parte de cada vendedor e o total
      const eqRel = blocoEquipe(mes, metaMes, plRel);
      if (eqRel) wrap.appendChild(eqRel);
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
        // digitou a meta do mês? a do ano acompanha sozinha (mês × 12)
        inMeta.addEventListener('input', () => {
          const v = Number(inMeta.value) || 0;
          if (v) inMetaAno.value = String(v * 12);
        });
        wrap.appendChild(el('h4', { class: 'mt16' }, 'Cadastrar metas de ' + rotuloMes(mes)));
        wrap.appendChild(el('p', { class: 'sub mt4' },
          'A meta vale só para este mês. Os meses seguintes começam com o mesmo valor até você trocar — e os meses já fechados continuam com a meta que tinham. ' +
          'A meta do ANO acompanha a do mês (mês × 12): R$ 200.000 por mês = R$ 2.400.000 no ano.'));
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
      const clientesAtivos = clientesDoRep(repId);
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

  // ================= FINANCEIRO DA EMPRESA =================
  // CAIXA ÚNICO: mesmo com dois vendedores, tudo que entra e sai é da MESMA
  // empresa. O vendedor que lançou fica gravado para conferência e auditoria,
  // mas o saldo NUNCA é dividido por vendedor.
  //
  // Os lançamentos ficam todos na tabela `despesas`, que já existia — o campo
  // `natureza` separa receita de despesa. Lançamento antigo não tem esse campo
  // e continua valendo como despesa, com o `tipo` antigo virando categoria.
  // Nada precisou ser migrado e nenhum dado foi tocado.
  const CATS_PADRAO = [
    ['alimentacao', 'Alimentação', 'despesa'],
    ['combustivel', 'Combustível', 'despesa'],
    ['transporte', 'Transporte', 'despesa'],
    ['pedagio', 'Pedágio', 'despesa'],
    ['manutencao', 'Manutenção', 'despesa'],
    ['hospedagem', 'Hospedagem', 'despesa'],
    ['materiais', 'Materiais', 'despesa'],
    ['escritorio', 'Escritório', 'despesa'],
    ['impostos', 'Impostos', 'despesa'],
    ['comissoes', 'Comissões pagas', 'despesa'],
    ['cartao_credito', 'Cartão de crédito', 'despesa'],
    ['outro', 'Outros', 'despesa'],
    ['venda', 'Venda de mercadoria', 'receita'],
    ['comissao_recebida', 'Comissão recebida', 'receita'],
    ['bonificacao', 'Bonificação', 'receita'],
    ['outra_receita', 'Outras receitas', 'receita']
  ];
  const FORMAS_PAG = [
    ['dinheiro', 'Dinheiro'], ['pix', 'PIX'], ['debito', 'Cartão de débito'],
    ['credito', 'Cartão de crédito'], ['boleto', 'Boleto'],
    ['transferencia', 'Transferência'], ['outra', 'Outra']
  ];
  // categorias = as de fábrica + as que a empresa cadastrar (Admin → Categorias)
  function categoriasFin(natureza) {
    const extras = DB.config('categorias_fin', []);
    const mapa = new Map(CATS_PADRAO.map(c => [c[0], { chave: c[0], nome: c[1], natureza: c[2] }]));
    (Array.isArray(extras) ? extras : []).forEach(c => {
      if (!c || !c.chave) return;
      mapa.set(c.chave, { chave: c.chave, nome: c.nome || c.chave, natureza: c.natureza || 'despesa' });
    });
    const lista = Array.from(mapa.values());
    return natureza ? lista.filter(c => c.natureza === natureza) : lista;
  }
  const nomeCategoria = (chave) => {
    const c = categoriasFin().find(x => x.chave === chave);
    return c ? c.nome : (chave || 'Outros');
  };
  const nomeForma = (k) => (FORMAS_PAG.find(f => f[0] === k) || [null, '—'])[1];
  // lançamento normalizado — é aqui que o formato antigo e o novo se encontram
  function lancFin(r) {
    return {
      id: r.id,
      natureza: r.natureza === 'receita' ? 'receita' : 'despesa',
      data: r.data_despesa || '',
      valor: C.round2(Number(r.valor || 0)),
      categoria: r.categoria || r.tipo || 'outro',
      descricao: r.descricao || '',
      forma: r.forma_pagamento || '',
      situacao: r.situacao || '',
      origem: r.origem || '',
      observacoes: r.observacoes || '',
      km_rodado: r.km_rodado,
      representante_id: r.representante_id,
      bruto: r
    };
  }
  const lancamentosFin = () => DB.all('despesas').map(lancFin);

  function telaFinanceiro() {
    const s = sessao();
    const wrap = el('div');
    const m = modal(wrap, { titulo: 'Financeiro da empresa', full: true });
    let aba = 'resumo';
    const filtro = { natureza: 'todos', categoria: 'todos', rep: 'todos' };

    // ── dados do período ──
    const noMes = (iso, mes) => (iso || '').slice(0, 7) === mes;
    // comissões CALCULADAS das vendas (não dependem de lançamento manual)
    function comissoesDoMes(mes, repId) {
      return DB.all('visitas')
        .filter(v => !repId || v.representante_id === repId)
        .filter(v => noMes(v.comissao_recebimento_em, mes) && Number(v.comissao_valor) !== 0)
        .sort((a, b) => (a.comissao_recebimento_em || '').localeCompare(b.comissao_recebimento_em || ''));
    }
    function lancamentosDoMes(mes) {
      return lancamentosFin().filter(l => noMes(l.data, mes))
        .filter(l => filtro.natureza === 'todos' || l.natureza === filtro.natureza)
        .filter(l => filtro.categoria === 'todos' || l.categoria === filtro.categoria)
        .filter(l => filtro.rep === 'todos' || l.representante_id === filtro.rep)
        .sort((a, b) => (b.data || '').localeCompare(a.data || ''));
    }
    function totaisDoMes(mes) {
      const todos = lancamentosFin().filter(l => noMes(l.data, mes));
      const soma = (f) => C.round2(todos.filter(f).reduce((t, l) => t + l.valor, 0));
      const receitas = soma(l => l.natureza === 'receita');
      const despesas = soma(l => l.natureza === 'despesa');
      const comissoes = C.round2(comissoesDoMes(mes).reduce((t, v) => t + Number(v.comissao_valor || 0), 0));
      return { receitas, despesas, comissoes, saldo: C.round2(receitas - despesas - comissoes), n: todos.length };
    }
    render();

    function render() {
      wrap.innerHTML = '';
      const mes = mesISOoffset(mesFinOffset);
      const t = totaisDoMes(mes);

      // navegação de mês
      wrap.appendChild(el('div', { class: 'row space' },
        el('button', { class: 'btn-mini', onclick: () => { mesFinOffset--; render(); }, 'aria-label': 'Mês anterior' }, ico('setaEsq')),
        el('h3', null, rotuloMes(mes) + (mesFinOffset === 0 ? ' · atual' : '')),
        el('button', { class: 'btn-mini', onclick: () => { mesFinOffset++; render(); }, 'aria-label': 'Próximo mês' }, ico('setaDir'))));

      // lançamento rápido, sempre no alto: dois toques e acabou
      wrap.appendChild(el('div', { class: 'row gap8 mt8' },
        el('button', { class: 'btn big grow btn-receita', onclick: () => lancar('receita', mes) },
          rot('mais', 'Receita')),
        el('button', { class: 'btn big grow btn-despesa', onclick: () => lancar('despesa', mes) },
          rot('menos', 'Despesa'))));

      // painel do caixa
      wrap.appendChild(el('div', { class: 'caixa-painel mt12' },
        el('div', { class: 'painel-meta-topo' },
          el('span', null, 'Saldo do mês · caixa único'),
          el('strong', { class: t.saldo >= 0 ? 'ok' : 'erro' }, C.fmtMoney(t.saldo))),
        el('div', { class: 'caixa-grade mt8' },
          el('div', { class: 'caixa-cel receita' },
            el('span', null, 'Receitas'), el('strong', null, C.fmtMoney(t.receitas))),
          el('div', { class: 'caixa-cel despesa' },
            el('span', null, 'Despesas'), el('strong', null, C.fmtMoney(t.despesas))),
          el('div', { class: 'caixa-cel comissao' },
            el('span', null, 'Comissões'), el('strong', null, C.fmtMoney(t.comissoes)))),
        el('p', { class: 'meta-rodape mt8' },
          'Um caixa só para a empresa inteira. As comissões são calculadas das ' +
          'vendas do mês — não precisa lançar como despesa.')));

      // abas
      const abas = [['resumo', 'Resumo'], ['lancamentos', 'Lançamentos'],
        ['comissoes', 'Comissões'], ['relatorio', 'Relatório']];
      wrap.appendChild(el('div', { class: 'dias-scroll mt12' },
        abas.map(([k, r]) => el('button', {
          class: 'chip' + (aba === k ? ' ativo' : ''), onclick: () => { aba = k; render(); }
        }, r))));

      const corpo = el('div', { class: 'mt12' });
      wrap.appendChild(corpo);
      if (aba === 'resumo') resumo(corpo, mes, t);
      else if (aba === 'lancamentos') listaLanc(corpo, mes);
      else if (aba === 'comissoes') listaComissoes(corpo, mes);
      else relatorio(corpo, mes, t);
    }

    // ── RESUMO: para onde o dinheiro foi, no mês ──
    function resumo(box, mes, t) {
      const porCat = {};
      lancamentosFin().filter(l => noMes(l.data, mes) && l.natureza === 'despesa')
        .forEach(l => { porCat[l.categoria] = C.round2((porCat[l.categoria] || 0) + l.valor); });
      const linhas = Object.entries(porCat).sort((a, b) => b[1] - a[1]);
      const maior = linhas.length ? linhas[0][1] : 0;
      box.appendChild(el('h4', null, 'Despesas por categoria'));
      box.appendChild(el('div', { class: 'col gap4 mt8' },
        linhas.length ? linhas.map(([cat, v]) => el('div', { class: 'cat-linha' },
          el('div', { class: 'row space' },
            el('span', null, nomeCategoria(cat)),
            el('strong', null, C.fmtMoney(v))),
          el('div', { class: 'progresso-barra fina mt4' },
            el('div', {
              class: 'progresso-fill',
              style: 'width:' + (maior > 0 ? Math.round(v / maior * 100) : 0) + '%'
            })),
          el('span', { class: 'sub' }, t.despesas > 0
            ? C.fmtPct(C.round2(v / t.despesas * 100)) + ' das despesas' : '')))
          : el('p', { class: 'vazio' }, 'Nenhuma despesa lançada em ' + rotuloMes(mes) + '.')));

      // evolução dos últimos 6 meses
      box.appendChild(el('h4', { class: 'mt16' }, 'Evolução — últimos 6 meses'));
      const serie = Array.from({ length: 6 }, (_, i) => {
        const mIso = mesISOoffset(mesFinOffset - (5 - i));
        const tt = totaisDoMes(mIso);
        return { mes: mIso, receitas: tt.receitas, despesas: C.round2(tt.despesas + tt.comissoes) };
      });
      const teto = Math.max(1, ...serie.map(x => Math.max(x.receitas, x.despesas)));
      box.appendChild(el('div', { class: 'grafico-barras mt8' },
        serie.map(x => el('div', { class: 'gb-col' },
          el('div', { class: 'gb-pilha' },
            el('div', { class: 'gb-barra receita', style: 'height:' + Math.round(x.receitas / teto * 100) + '%', title: 'Receitas ' + C.fmtMoney(x.receitas) }),
            el('div', { class: 'gb-barra despesa', style: 'height:' + Math.round(x.despesas / teto * 100) + '%', title: 'Saídas ' + C.fmtMoney(x.despesas) })),
          el('span', { class: 'gb-rot' }, x.mes.slice(5) + '/' + x.mes.slice(2, 4))))));
      box.appendChild(el('div', { class: 'row gap8 mt4' },
        el('span', { class: 'legenda receita' }, 'Receitas'),
        el('span', { class: 'legenda despesa' }, 'Despesas + comissões')));
    }

    // ── LANÇAMENTOS: lista com filtros, editar e excluir ──
    function listaLanc(box, mes) {
      const sel = (chave, rotulo, opcoes) => {
        const e = el('select', { class: 'input' },
          el('option', { value: 'todos', selected: filtro[chave] === 'todos' ? '' : null }, rotulo),
          opcoes.map(([v, r]) => el('option', { value: v, selected: filtro[chave] === v ? '' : null }, r)));
        e.onchange = () => { filtro[chave] = e.value; render(); };
        return e;
      };
      box.appendChild(el('div', { class: 'fin-filtros' },
        sel('natureza', 'Tudo', [['receita', 'Só receitas'], ['despesa', 'Só despesas']]),
        sel('categoria', 'Toda categoria', categoriasFin().map(c => [c.chave, c.nome])),
        sel('rep', 'Todos os vendedores', DB.all('representantes').map(r => [r.id, r.nome]))));

      const lista = lancamentosDoMes(mes);
      const tot = C.round2(lista.reduce((t2, l) => t2 + (l.natureza === 'receita' ? l.valor : -l.valor), 0));
      box.appendChild(el('div', { class: 'total-bar mt8' },
        el('span', null, lista.length + ' lançamento(s)'),
        el('strong', { class: tot >= 0 ? 'ok' : 'erro' }, C.fmtMoney(tot))));
      box.appendChild(el('div', { class: 'col gap4 mt8' },
        lista.length ? lista.map(l => el('div', { class: 'lanc-linha ' + l.natureza },
          el('div', { class: 'grow', onclick: () => lancar(l.natureza, mes, l) },
            el('div', { class: 'row space w100' },
              el('strong', null, nomeCategoria(l.categoria)),
              el('strong', { class: l.natureza === 'receita' ? 'ok' : 'erro' },
                (l.natureza === 'receita' ? '+ ' : '− ') + C.fmtMoney(l.valor))),
            el('span', { class: 'sub' }, dataBR(l.data) +
              (l.descricao ? ' · ' + l.descricao : '') +
              (l.forma ? ' · ' + nomeForma(l.forma) : '') +
              (l.km_rodado ? ' · ' + l.km_rodado + ' km' : '')),
            el('span', { class: 'sub' },
              (l.situacao ? l.situacao.replace(/_/g, ' ') + ' · ' : '') +
              'lançado por ' + (nomeDoRep(l.representante_id) || '—'))),
          el('button', {
            class: 'btn-icon', 'aria-label': 'Excluir lançamento', onclick: async () => {
              if (!(await confirmar('Excluir este lançamento de ' + C.fmtMoney(l.valor) + '?'))) return;
              DB.remove('despesas', l.id);
              toast('Lançamento excluído.'); render();
            }
          }, ico('lixeira'))))
          : el('p', { class: 'vazio' }, 'Nenhum lançamento com esses filtros.')));
    }

    // ── COMISSÕES: individual por vendedor + total da empresa ──
    function listaComissoes(box, mes) {
      const vends = DB.all('representantes').filter(r => r.papel === 'vendedor');
      const todas = comissoesDoMes(mes);
      const total = C.round2(todas.reduce((t2, v) => t2 + Number(v.comissao_valor || 0), 0));
      box.appendChild(el('div', { class: 'total-bar' },
        el('span', null, 'Total de comissões da empresa em ' + rotuloMes(mes)),
        el('strong', null, C.fmtMoney(total))));
      box.appendChild(el('div', { class: 'col gap8 mt8' },
        vends.map(r => {
          const minhas = todas.filter(v => v.representante_id === r.id);
          const tt = C.round2(minhas.reduce((t2, v) => t2 + Number(v.comissao_valor || 0), 0));
          return el('div', { class: 'cat-linha' },
            el('div', { class: 'row space' },
              el('span', { class: 'vend-nome' },
                el('span', { class: 'vend-bolinha', style: 'background:' + corDoRep(r.id) }), r.nome),
              el('strong', null, C.fmtMoney(tt))),
            el('span', { class: 'sub' }, minhas.length + ' venda(s) com comissão caindo neste mês'));
        })));
      box.appendChild(el('h4', { class: 'mt16' }, 'Detalhe'));
      box.appendChild(el('div', { class: 'col gap4 mt4' },
        todas.length ? todas.map(v => {
          const cli = DB.byId('clientes', v.cliente_id) || {};
          return el('div', { class: 'hist-linha' },
            el('span', null, dataBR(v.comissao_recebimento_em) + ' · ' + (cli.nome || '—') +
              ' · ' + (nomeDoRep(v.representante_id) || '—') +
              ' · venda ' + dataBR(v.data_visita) +
              ' (' + C.fmtMoney(Number(v.valor_pedido)) + ' × ' + v.comissao_pct + '%)'),
            el('strong', null, C.fmtMoney(Number(v.comissao_valor))));
        }) : el('p', { class: 'vazio' }, 'Nenhuma comissão prevista para este mês.')));
      box.appendChild(el('p', { class: 'sub mt8' },
        'As porcentagens de cada vendedor ficam em Admin → Vendedores. ' +
        'O prazo de recebimento vem do cadastro do cliente (Clamed = 45 dias).'));
    }

    // ── RELATÓRIO: período livre, por categoria, com exportação ──
    function relatorio(box, mes) {
      const per = DB.config('fin_periodo', null) || {};
      const de = el('input', { class: 'input', type: 'date', value: per.de || (mes + '-01') });
      const ate = el('input', { class: 'input', type: 'date', value: per.ate || ultimoDiaISO(mes) });
      const saida = el('div', { class: 'mt12' });
      const pintar = () => {
        const d1 = de.value, d2 = ate.value;
        saida.innerHTML = '';
        if (!d1 || !d2 || d1 > d2) {
          saida.appendChild(el('p', { class: 'vazio' }, 'Escolha um período válido.'));
          return;
        }
        const dentro = (iso) => iso >= d1 && iso <= d2;
        const lancs = lancamentosFin().filter(l => dentro(l.data))
          .filter(l => filtro.rep === 'todos' || l.representante_id === filtro.rep)
          .filter(l => filtro.categoria === 'todos' || l.categoria === filtro.categoria)
          .filter(l => filtro.natureza === 'todos' || l.natureza === filtro.natureza);
        const coms = DB.all('visitas')
          .filter(v => dentro((v.comissao_recebimento_em || '').slice(0, 10)) && Number(v.comissao_valor) !== 0)
          .filter(v => filtro.rep === 'todos' || v.representante_id === filtro.rep);
        const receitas = C.round2(lancs.filter(l => l.natureza === 'receita').reduce((t2, l) => t2 + l.valor, 0));
        const despesas = C.round2(lancs.filter(l => l.natureza === 'despesa').reduce((t2, l) => t2 + l.valor, 0));
        const comissoes = C.round2(coms.reduce((t2, v) => t2 + Number(v.comissao_valor || 0), 0));
        const saldo = C.round2(receitas - despesas - comissoes);
        const porCat = {};
        lancs.forEach(l => {
          const k = l.natureza + '|' + l.categoria;
          porCat[k] = C.round2((porCat[k] || 0) + l.valor);
        });
        const linhasCat = Object.entries(porCat)
          .map(([k, v]) => ({ natureza: k.split('|')[0], cat: k.split('|')[1], valor: v }))
          .sort((a, b) => b.valor - a.valor);

        saida.appendChild(el('div', { class: 'kpis' },
          el('div', { class: 'kpi ok' }, el('span', { class: 'kpi-rot' }, 'Receitas'),
            el('strong', { class: 'kpi-val' }, C.fmtMoney(receitas))),
          el('div', { class: 'kpi erro' }, el('span', { class: 'kpi-rot' }, 'Despesas'),
            el('strong', { class: 'kpi-val' }, C.fmtMoney(despesas))),
          el('div', { class: 'kpi' }, el('span', { class: 'kpi-rot' }, 'Comissões'),
            el('strong', { class: 'kpi-val' }, C.fmtMoney(comissoes))),
          el('div', { class: 'kpi ' + (saldo >= 0 ? 'ok' : 'erro') },
            el('span', { class: 'kpi-rot' }, 'Saldo do período'),
            el('strong', { class: 'kpi-val' }, C.fmtMoney(saldo)))));

        saida.appendChild(el('h4', { class: 'mt16' }, 'Por categoria'));
        saida.appendChild(el('div', { class: 'col gap4 mt4' },
          linhasCat.length ? linhasCat.map(l => el('div', { class: 'hist-linha' },
            el('span', null, (l.natureza === 'receita' ? '↑ ' : '↓ ') + nomeCategoria(l.cat)),
            el('strong', { class: l.natureza === 'receita' ? 'ok' : null }, C.fmtMoney(l.valor))))
            : el('p', { class: 'vazio' }, 'Nada lançado no período.')));
        if (comissoes > 0)
          saida.appendChild(el('div', { class: 'hist-linha' },
            el('span', null, '↓ Comissões calculadas das vendas'),
            el('strong', null, C.fmtMoney(comissoes))));

        // exportação
        const colunas = [{ t: 'Data', peso: 1 }, { t: 'Tipo', peso: 1 }, { t: 'Categoria', peso: 1.4 },
          { t: 'Descrição', peso: 2 }, { t: 'Forma', peso: 1 }, { t: 'Situação', peso: 1 },
          { t: 'Lançado por', peso: 1.2 }, { t: 'Valor', peso: 1 }];
        const linhasExp = lancs.sort((a, b) => (a.data || '').localeCompare(b.data || ''))
          .map(l => [dataBR(l.data), l.natureza === 'receita' ? 'Receita' : 'Despesa',
            nomeCategoria(l.categoria), l.descricao || '', nomeForma(l.forma),
            (l.situacao || '').replace(/_/g, ' '), nomeDoRep(l.representante_id) || '',
            C.fmtMoney(l.valor)])
          .concat(coms.map(v => [dataBR(v.comissao_recebimento_em), 'Comissão', 'Comissão da venda',
            (DB.byId('clientes', v.cliente_id) || {}).nome || '', '', 'calculada',
            nomeDoRep(v.representante_id) || '', C.fmtMoney(Number(v.comissao_valor))]));
        const subtitulo = 'De ' + dataBR(d1) + ' a ' + dataBR(d2) +
          ' · receitas ' + C.fmtMoney(receitas) + ' · despesas ' + C.fmtMoney(despesas) +
          ' · comissões ' + C.fmtMoney(comissoes) + ' · saldo ' + C.fmtMoney(saldo);
        saida.appendChild(el('div', { class: 'row gap8 mt16' },
          el('button', {
            class: 'btn grow', onclick: () => {
              const blob = window.NSPDF.gerarRelatorio({
                titulo: 'NEW STAR — Financeiro', subtitulo, colunas, linhas: linhasExp
              });
              window.NSUI.baixar(blob, 'financeiro-' + d1 + '-a-' + d2 + '.pdf');
              toast(linhasExp.length + ' linha(s) em PDF.');
            }
          }, rot('documento', 'Exportar PDF')),
          el('button', {
            class: 'btn btn-sec grow', onclick: () => {
              const blob = gerarXLSX([colunas.map(c => c.t)].concat(linhasExp), 'Financeiro');
              window.NSUI.baixar(blob, 'financeiro-' + d1 + '-a-' + d2 + '.xlsx');
              toast(linhasExp.length + ' linha(s) em Excel.');
            }
          }, rot('planilha', 'Exportar Excel'))));
      };
      box.appendChild(el('div', { class: 'fin-filtros' },
        el('label', { class: 'campo' }, el('span', { class: 'sub' }, 'De'), de),
        el('label', { class: 'campo' }, el('span', { class: 'sub' }, 'Até'), ate)));
      box.appendChild(el('button', {
        class: 'btn w100 mt8', onclick: () => {
          DB.upsertConfig('fin_periodo', { de: de.value, ate: ate.value });
          pintar();
        }
      }, rot('lupa', 'Gerar relatório')));
      box.appendChild(saida);
      pintar();
    }

    // ── LANÇAR: modal compacto, tudo na mesma tela, sem rolagem ──
    function lancar(natureza, mes, edit) {
      const ehReceita = natureza === 'receita';
      const hojeMes = mesISOoffset(0);
      const dataPadrao = edit ? edit.data : (mes === hojeMes ? hojeISO() : mes + '-01');
      const campo = (rotulo, elemento) => el('label', { class: 'campo' },
        el('span', { class: 'sub' }, rotulo), elemento);
      const val = el('input', {
        class: 'input big', type: 'number', step: '0.01', inputmode: 'decimal',
        placeholder: '0,00', value: edit ? edit.valor : ''
      });
      const dt = el('input', { class: 'input', type: 'date', value: dataPadrao });
      const cat = el('select', { class: 'input' }, categoriasFin(natureza)
        .map(c => el('option', { value: c.chave, selected: edit && edit.categoria === c.chave ? '' : null }, c.nome)));
      const desc = el('input', { class: 'input', placeholder: ehReceita ? 'Descrição da receita' : 'Descrição da despesa', value: edit ? edit.descricao : '' });
      const forma = el('select', { class: 'input' },
        el('option', { value: '' }, 'Forma de pagamento'),
        FORMAS_PAG.map(([v, r]) => el('option', { value: v, selected: edit && edit.forma === v ? '' : null }, r)));
      const origem = el('input', { class: 'input', placeholder: 'Origem (quem pagou)', value: edit ? edit.origem : '' });
      const sit = el('select', { class: 'input' }, (ehReceita
        ? [['recebido', 'Recebido'], ['a_receber', 'A receber']]
        : [['pago', 'Pago'], ['a_pagar', 'A pagar']])
        .map(([v, r]) => el('option', { value: v, selected: edit && edit.situacao === v ? '' : null }, r)));
      const km = el('input', {
        class: 'input', type: 'number', step: '1', inputmode: 'numeric',
        placeholder: 'Km (opcional)', value: edit && edit.km_rodado ? edit.km_rodado : ''
      });
      const obs = el('input', { class: 'input', placeholder: 'Observações (opcional)', value: edit ? edit.observacoes : '' });

      const mm = modal(el('div', { class: 'col gap8 form-fin' },
        el('div', { class: 'fin-topo ' + natureza },
          el('span', null, ehReceita ? 'ENTRADA NO CAIXA' : 'SAÍDA DO CAIXA'), val),
        el('div', { class: 'fin-grade' },
          campo('Data', dt), campo('Categoria', cat)),
        campo(ehReceita ? 'Descrição' : 'Descrição', desc),
        el('div', { class: 'fin-grade' },
          campo(ehReceita ? 'Origem' : 'Forma de pagamento', ehReceita ? origem : forma),
          campo('Situação', sit)),
        ehReceita ? null : el('div', { class: 'fin-grade' }, campo('Km rodado', km), campo('Observações', obs)),
        ehReceita ? campo('Observações', obs) : null,
        el('div', { class: 'row gap8 mt8' },
          el('button', { class: 'btn btn-sec grow', onclick: () => mm.fechar() }, 'Cancelar'),
          el('button', {
            class: 'btn grow ' + (ehReceita ? 'btn-receita' : 'btn-despesa'), onclick: () => {
              const v = Number(String(val.value).replace(',', '.'));
              if (!(v > 0)) return toast('Informe o valor.', 'erro');
              if (!dt.value) return toast('Informe a data.', 'erro');
              const body = {
                representante_id: (edit && edit.representante_id) || s.rep.id,
                data_despesa: dt.value, natureza,
                categoria: cat.value, tipo: cat.value,
                valor: C.round2(v),
                descricao: desc.value.trim() || null,
                forma_pagamento: ehReceita ? null : (forma.value || null),
                origem: ehReceita ? (origem.value.trim() || null) : null,
                situacao: sit.value,
                observacoes: obs.value.trim() || null,
                km_rodado: (!ehReceita && km.value) ? Number(km.value) : null
              };
              if (edit) DB.update('despesas', edit.id, body);
              else DB.insert('despesas', body);
              mm.fechar();
              toast((ehReceita ? 'Receita' : 'Despesa') + ' de ' + C.fmtMoney(C.round2(v)) + ' ' +
                (edit ? 'atualizada.' : 'lançada.'), ehReceita ? 'ok' : undefined);
              render();
            }
          }, rot('salvar', edit ? 'Salvar' : 'Lançar')))),
      { titulo: (edit ? 'Editar ' : 'Nova ') + (ehReceita ? 'receita' : 'despesa'), centro: true });
      setTimeout(() => { try { val.focus(); } catch (e) {} }, 60);
    }
  }

  // ---------- Admin: categorias do financeiro ----------
  function telaCategoriasFin() {
    const wrap = el('div');
    const m = modal(wrap, { titulo: 'Categorias do financeiro', full: true });
    render();
    function salvar(lista) { DB.upsertConfig('categorias_fin', lista); }
    function render() {
      wrap.innerHTML = '';
      const extras = DB.config('categorias_fin', []);
      const extrasArr = Array.isArray(extras) ? extras : [];
      wrap.appendChild(el('p', { class: 'sub' },
        'As categorias organizam o relatório de gastos. As de fábrica não somem; ' +
        'as que você criar aqui entram na lista de lançamento.'));
      for (const nat of ['despesa', 'receita']) {
        wrap.appendChild(el('div', { class: 'row space mt16' },
          el('h4', null, nat === 'despesa' ? 'Despesas' : 'Receitas'),
          el('button', { class: 'btn', onclick: () => nova(nat) }, '+ Categoria')));
        wrap.appendChild(el('div', { class: 'col gap4 mt4' },
          categoriasFin(nat).map(c => {
            const minha = extrasArr.some(x => x.chave === c.chave);
            return el('div', { class: 'hist-linha' },
              el('span', null, c.nome),
              minha ? el('button', {
                class: 'btn-icon', 'aria-label': 'Excluir', onclick: async () => {
                  const usada = DB.all('despesas').some(d => (d.categoria || d.tipo) === c.chave);
                  if (usada) return toast('Categoria já usada em lançamentos — renomeie em vez de excluir.', 'erro');
                  if (!(await confirmar('Excluir a categoria "' + c.nome + '"?'))) return;
                  salvar(extrasArr.filter(x => x.chave !== c.chave));
                  render();
                }
              }, ico('lixeira')) : el('span', { class: 'badge' }, 'de fábrica'));
          })));
      }
    }
    function nova(natureza) {
      const nm = el('input', { class: 'input big', placeholder: 'Nome da categoria' });
      const mm = modal(el('div', { class: 'col gap8' }, nm,
        el('button', {
          class: 'btn big w100', onclick: () => {
            const nome = nm.value.trim();
            if (!nome) return toast('Informe o nome.', 'erro');
            const chave = 'c_' + nome.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
              .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
            const extras = DB.config('categorias_fin', []);
            const lista = (Array.isArray(extras) ? extras : []).filter(x => x.chave !== chave);
            lista.push({ chave, nome, natureza });
            salvar(lista);
            mm.fechar(); toast('Categoria criada.'); render();
          }
        }, rot('salvar', 'Salvar categoria'))), { titulo: 'Nova categoria de ' + natureza });
    }
  }

  // ---------- Geocodificação em massa ----------
  function telaGeocode() {
    const repId = repEfetivoId();
    const todos = clientesDoRep(repId);
    const pend = todos.filter(c => c.geocoding_status === 'pendente' || c.geocoding_status === 'falhou' || c.lat == null);
    // quem tem CEP mas está sem rua, bairro ou cidade: o CEP resolve sem Google
    const faltaEnd = todos.filter(c => R.cepFormatado(c.cep) &&
      (!String(c.endereco || '').trim() || !String(c.bairro || '').trim() || !String(c.cidade || '').trim()));
    const info = el('p', { class: 'sub mt8' }, pend.length + ' cliente(s) sem coordenada precisa.');
    const barra = el('div', { class: 'sub mt8' });
    const barraCep = el('div', { class: 'sub mt8' });
    const m = modal(el('div', null,
      el('p', null, 'Geocodifica pelo endereço completo e pelo CEP via Google ' +
        '(status por cliente: preciso / aproximado / falhou).'),
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
      }, rot('globo', 'Geocodificar pendentes')),
      el('p', { class: 'sub mt12' },
        'Pelo CEP dá para completar rua, bairro, cidade e UF sem precisar da chave do Google. ' +
        faltaEnd.length + ' cliente(s) com CEP e endereço incompleto.'),
      barraCep,
      el('button', {
        class: 'btn w100 mt8', onclick: async (e) => {
          if (!faltaEnd.length) return toast('Nenhum cliente com CEP e endereço incompleto.');
          if (!navigator.onLine) return toast('Necessário estar online para buscar os CEPs.', 'erro');
          e.currentTarget.disabled = true;
          let n = 0;
          for (let i = 0; i < faltaEnd.length; i++) {
            const c = faltaEnd[i];
            const comp = await R.completarPeloCep(c);
            if (comp && Object.keys(comp.falta).length) {
              DB.update('clientes', c.id, Object.assign({ geocoding_status: 'pendente' }, comp.falta));
              Object.assign(c, comp.falta);
              n++;
            }
            texto(barraCep, (i + 1) + ' / ' + faltaEnd.length + ' consultados…', false);
            await new Promise(r => setTimeout(r, 120));
          }
          toast(n + ' endereço(s) completado(s) pelo CEP.');
          m.fechar();
        }
      }, rot('mapa', 'Completar endereços pelo CEP'))), { titulo: 'Endereços e geocodificação' });
  }

  // ---------- Admin: Clientes ----------
  const CAMPOS_CLIENTE = ['nome', 'nome_fantasia', 'razao_social', 'cnpj_cpf', 'inscricao_estadual', 'contato', 'email', 'telefone', 'celular',
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

  // ---------- Prospecção: cadastro rápido de possível cliente ----------
  // Só o essencial (nome, cidade, endereço) — o resto entra quando virar cliente.
  function novaProspeccao(aoSalvar) {
    const campos = {};
    const inp = (campo, rotulo, obrig) => {
      campos[campo] = el('input', { class: 'input big', placeholder: rotulo });
      return el('label', { class: 'campo' },
        el('span', { class: 'sub' }, rotulo + (obrig ? ' *' : '')), campos[campo]);
    };
    const s = sessao();
    // o CEP entra antes da cidade: digitando o CEP, cidade, UF e rua vêm prontos
    const dicaCep = el('span', { class: 'sub dica-cep' }, 'Digite o CEP e o endereço vem sozinho.');
    const campoCep = inp('cep', 'CEP (opcional)');
    campoCep.appendChild(dicaCep);
    campos.cep.setAttribute('inputmode', 'numeric');
    const mm = modal(el('div', { class: 'col gap8' },
      el('p', { class: 'sub' },
        'Para as farmácias que o supervisor passa para prospectar. Elas entram na rota ' +
        'igual aos clientes, com a cor roxa, e depois dá para "Transformar em cliente".'),
      inp('nome', 'Nome da farmácia', true),
      campoCep,
      inp('cidade', 'Cidade', true),
      inp('uf', 'UF', true),
      inp('endereco', 'Endereço (rua e número)'),
      inp('contato', 'Contato (opcional)'),
      inp('telefone', 'Telefone (opcional)'),
      el('button', {
        class: 'btn big w100 mt8', onclick: () => {
          const nome = campos.nome.value.trim();
          const cidade = campos.cidade.value.trim(), uf = campos.uf.value.trim().toUpperCase();
          if (!nome) return toast('Informe o nome da farmácia.', 'erro');
          if (!cidade || !uf) return toast('Cidade e UF são obrigatórias.', 'erro');
          DB.insert('clientes', {
            representante_id: s.rep ? s.rep.id : s.eu.id,
            nome, cidade, uf,
            cep: campos.cep.value.trim() || null,
            endereco: campos.endereco.value.trim() || null,
            contato: campos.contato.value.trim() || null,
            telefone: campos.telefone.value.trim() || null,
            status: 'prospect', classe: 'B',
            geocoding_status: 'pendente'
          });
          mm.fechar();
          toast('Prospecção cadastrada. Já dá para colocar na rota.');
          if (aoSalvar) aoSalvar();
        }
      }, rot('salvar', 'Salvar prospecção'))), { titulo: 'Nova prospecção' });
    ligarBuscaCep(campos, dicaCep);
  }

  // Prospecção → cliente: mantém o histórico (visitas, notas, id) e abre o
  // cadastro completo para preencher CNPJ, razão social e o que faltar.
  async function transformarEmCliente(id, aoSalvar) {
    const c = DB.byId('clientes', id);
    if (!c) return;
    if (!(await confirmar('Transformar "' + nomeExib(c) + '" em cliente? ' +
      'O histórico de visitas e as observações são mantidos.'))) return;
    DB.update('clientes', id, { status: 'ativo' });
    toast('Agora é cliente. Complete o cadastro (CNPJ, razão social…).');
    editarCliente(id, aoSalvar);
  }

  function editarCliente(id, aoSalvar) {
    const c = id ? DB.byId('clientes', id) : {};
    const campos = {};
    const inp = (campo, rotulo, tipo) => {
      campos[campo] = el('input', { class: 'input', type: tipo || 'text', value: c[campo] != null ? c[campo] : '', placeholder: rotulo });
      return el('label', { class: 'campo' }, el('span', { class: 'sub' }, rotulo), campos[campo]);
    };
    // CEP primeiro: digitando o CEP, a rua, o bairro, a cidade e a UF já entram
    const dicaCep = el('span', { class: 'sub dica-cep' }, 'Digite o CEP e o endereço vem sozinho.');
    const campoCep = inp('cep', 'CEP');
    campoCep.appendChild(dicaCep);
    campos.cep.setAttribute('inputmode', 'numeric');
    const repSel = el('select', { class: 'input' },
      DB.all('representantes').filter(r => r.papel === 'vendedor')
        .map(r => el('option', { value: r.id, selected: c.representante_id === r.id ? '' : null }, r.nome)));
    const diaSel = el('select', { class: 'input' },
      el('option', { value: '' }, '(sem dia fixo)'),
      C.DIAS_SEMANA.slice(1, 7).map(d => el('option', { value: d, selected: C.normDia(c.dia_semana_padrao) === C.normDia(d) ? '' : null }, d)));
    const statusSel = el('select', { class: 'input' },
      ['ativo', 'prospect', 'inativo'].map(st => el('option', { value: st, selected: (c.status || 'ativo') === st ? '' : null }, st)));
    const classeSel = el('select', { class: 'input' },
      C.CLASSES.map(([v, r]) => el('option', { value: v, selected: C.classeDe(c) === v ? '' : null }, r)));
    // qual tabela de preço o vendedor pode escolher neste cliente (evita erro no pedido)
    const prioSel = el('select', { class: 'input' },
      el('option', { value: '', selected: c.prioridade ? null : '' }, 'Não'),
      el('option', { value: '1', selected: c.prioridade ? '' : null }, 'SIM — cliente prioritário'));
    const tabSel = el('select', { class: 'input' },
      C.TABELAS_PERMITIDAS.map(([v, r]) =>
        el('option', { value: v, selected: C.tabelaPermitida(c) === v ? '' : null }, r)));
    const mm = modal(el('div', { class: 'col gap8' },
      inp('nome', 'Nome na lista * (como você chama o cliente)'),
      inp('nome_fantasia', 'Nome fantasia (nome comercial da loja)'),
      inp('razao_social', 'Razão social (nome oficial da empresa)'),
      inp('cnpj_cpf', 'CNPJ/CPF'),
      inp('inscricao_estadual', 'Inscrição Estadual'),
      inp('contato', 'Contato'), inp('email', 'E-mail', 'email'), inp('telefone', 'Telefone'), inp('celular', 'Celular'),
      campoCep,
      inp('endereco', 'Endereço (rua e número)'), inp('bairro', 'Bairro'), inp('cidade', 'Cidade *'), inp('uf', 'UF *'),
      inp('rede', 'Rede (ex.: Clamed)'), inp('recebimento_dias', 'Prazo comissão (dias — Clamed = 45)', 'number'),
      el('label', { class: 'campo' },
        el('span', { class: 'sub' }, 'Tabela de preço permitida neste cliente'), tabSel,
        el('span', { class: 'sub' }, 'Deixando só uma, o vendedor não escolhe errado na hora do pedido.')),
      inp('condicao_pagamento_padrao', 'Prazo de pagamento deste cliente (ex.: 30 dias)'),
      inp('semana_padrao', 'Semana do ciclo (1-7)', 'number'),
      el('label', { class: 'campo' }, el('span', { class: 'sub' }, 'Dia da semana'), diaSel),
      el('label', { class: 'campo' }, el('span', { class: 'sub' }, 'Representante'), repSel,
        carteiraCompartilhada() ? el('span', { class: 'sub' },
          'A carteira está compartilhada: TODOS os vendedores enxergam este cliente. ' +
          'Isto aqui é só quem responde pelo cadastro.') : null),
      el('label', { class: 'campo' }, el('span', { class: 'sub' }, 'Status'), statusSel),
      el('label', { class: 'campo' }, el('span', { class: 'sub' }, 'Classe (A/B/C)'), classeSel),
      el('label', { class: 'campo' }, el('span', { class: 'sub' }, 'Cliente prioritário'), prioSel,
        el('span', { class: 'sub' }, 'Prioritário aparece em azul na lista e na rota, e tem filtro próprio.')),
      el('button', {
        class: 'btn big w100', onclick: () => {
          if (!campos.nome.value.trim()) return toast('Nome é obrigatório.', 'erro');
          if (!campos.cidade.value.trim() || !campos.uf.value.trim()) return toast('Cidade e UF são obrigatórios.', 'erro');
          const body = {
            representante_id: repSel.value, status: statusSel.value,
            dia_semana_padrao: diaSel.value || null, classe: classeSel.value,
            tabela_permitida: tabSel.value, prioridade: prioSel.value === '1'
          };
          for (const [k, elInp] of Object.entries(campos)) {
            let v = elInp.value.trim();
            if (['semana_padrao', 'recebimento_dias'].includes(k))
              v = v === '' ? null : parseInt(v, 10);
            body[k] = v === '' ? null : v;
          }
          if (body.rede && String(body.rede).toUpperCase().includes('CLAMED') && !body.recebimento_dias)
            body.recebimento_dias = 45;
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
    ligarBuscaCep(campos, dicaCep);
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
        C.ordenarProdutos(DB.all('produtos'))
          .map(p => el('div', { class: 'hist-linha' },
            el('span', null, p.ativo === false ? ico('bloquear', 'ic-sm') : null, (p.codigo || '') + ' · ' + p.nome +
              (p.variacao ? ' (' + p.variacao + ')' : '') +
              ` · ${C.rotuloSuporte(p)} P=${p.unid_placa_p} G=${p.unid_placa_g} · ` +
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
      // placa ou display: muda só a palavra que o vendedor lê no pedido, no PDF
      // e no cupom. A conta das unidades é a mesma nos dois casos.
      const ehDisp = C.ehDisplay(p);
      const supSel = el('select', { class: 'input' },
        el('option', { value: 'placa', selected: ehDisp ? null : '' }, 'Placa'),
        el('option', { value: 'display', selected: ehDisp ? '' : null }, 'Display'));
      const mm = modal(el('div', { class: 'col gap8' },
        inp('codigo', 'Código'), inp('nome', 'Nome *'), inp('variacao', 'Variação'), inp('linha', 'Linha de produto'),
        inp('preco_simples', 'Preço Tabela Simples', 'number', '0.01'),
        inp('preco_lucro', 'Preço Lucro Presumido', 'number', '0.01'),
        el('label', { class: 'campo' }, el('span', { class: 'sub' }, 'Vem em placa ou em display?'), supSel),
        inp('unid_placa_p', 'Unidades no P *', 'number'), inp('unid_placa_g', 'Unidades no G *', 'number'),
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
              suporte: supSel.value, ativo: ativo.checked
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
      const corAtual = chaveCorRep(r);
      const corSel = el('select', { class: 'input' }, CORES_REP.map(([v, nome]) =>
        el('option', { value: v, selected: corAtual === v ? '' : null }, nome)));
      const mm = modal(el('div', { class: 'col gap8' },
        inp('nome', 'Nome *'), inp('email', 'E-mail (login) *', 'email'), inp('contato', 'Contato (sai no talão)'),
        inp('comissao_pct_novo', '% comissão cliente novo', 'number', '0.1'),
        inp('comissao_pct', '% comissão reposição — Tabela Simples', 'number', '0.1'),
        inp('comissao_pct_lucro', '% comissão reposição — Lucro Presumido', 'number', '0.1'),
        el('label', { class: 'campo' },
          el('span', { class: 'sub' }, 'Cor do vendedor — é a cor do botão "Faturado no New Star"'), corSel,
          el('span', { class: 'sub' }, 'É por esta cor que se enxerga de quem é cada pedido.')),
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
                comissao_pct_lucro: f.comissao_pct_lucro.value === '' ? null : Number(f.comissao_pct_lucro.value),
                cor: corSel.value,
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

  // ---------- Admin: Feriados ----------
  // Os feriados NACIONAIS já vêm prontos e se calculam sozinhos todo ano — a
  // Paixão de Cristo muda de data e o app acompanha. Aqui entram os outros: o
  // feriado da cidade, o do estado, o ponto facultativo que a empresa decidir
  // folgar e qualquer dia em que não se trabalha. Dia cadastrado aqui sai da
  // conta de dias úteis e, com isso, da divisão da meta.
  function telaFeriados() {
    const wrap = el('div');
    const m = modal(wrap, { titulo: 'Feriados e dias parados', full: true });
    let ano = Number(hojeISO().slice(0, 4));
    render();
    function salvar(lista) {
      DB.upsertConfig('feriados_extra', lista
        .map(f => ({ data: String(f.data).slice(0, 10), nome: (f.nome || '').trim() || 'Dia parado' }))
        .filter(f => /^\d{4}-\d{2}-\d{2}$/.test(f.data))
        .sort((a3, b3) => a3.data.localeCompare(b3.data)));
    }
    function render() {
      wrap.innerHTML = '';
      const extras = feriadosExtra();
      const nacionais = C.feriadosNacionais(ano);
      const doAno = (f) => String(typeof f === 'string' ? f : f.data).slice(0, 4) === String(ano);
      wrap.appendChild(el('div', { class: 'row space' },
        el('button', { class: 'btn-mini', onclick: () => { ano--; render(); }, 'aria-label': 'Ano anterior' }, ico('setaEsq')),
        el('h3', null, String(ano)),
        el('button', { class: 'btn-mini', onclick: () => { ano++; render(); }, 'aria-label': 'Próximo ano' }, ico('setaDir'))));
      wrap.appendChild(el('p', { class: 'sub mt8' },
        'Dia que está nesta tela não conta como dia útil: ele sai da divisão da meta do dia. ' +
        'Sábado e domingo já saem sozinhos.'));

      // quanto isso muda nos dias úteis de cada mês do ano
      const uteis = Array.from({ length: 12 }, (_, i) => {
        const mesIso = ano + '-' + String(i + 1).padStart(2, '0');
        return { mes: mesIso, n: C.diasUteisDoMes(mesIso, extras) };
      });
      wrap.appendChild(el('h4', { class: 'mt12' }, 'Dias úteis por mês'));
      wrap.appendChild(el('div', { class: 'dias-scroll mt4' },
        uteis.map(u => el('span', { class: 'chip' }, u.mes.slice(5) + '/' + ano + ' · ' + u.n + 'd'))));

      wrap.appendChild(el('h4', { class: 'mt16' }, 'Feriados nacionais ' + ano));
      wrap.appendChild(el('p', { class: 'sub' },
        'Já entram sozinhos, não precisa cadastrar. Carnaval e Corpus Christi são ponto ' +
        'facultativo, não feriado nacional: se a empresa for parar, cadastre embaixo.'));
      wrap.appendChild(el('div', { class: 'col gap4 mt4' },
        nacionais.map(f => el('div', { class: 'hist-linha' },
          el('span', null, dataBR(f) + ' · ' + (nomeFeriado(f) || 'Feriado nacional')),
          el('span', { class: 'badge ok' }, 'nacional')))));

      const meus = extras.filter(doAno);
      wrap.appendChild(el('div', { class: 'row space mt16' },
        el('h4', null, 'Dias parados cadastrados'),
        el('button', { class: 'btn', onclick: () => novo() }, '+ Adicionar dia')));
      wrap.appendChild(el('div', { class: 'col gap4 mt4' },
        meus.length ? meus.map(f => el('div', { class: 'hist-linha' },
          el('span', null, dataBR(f.data) + ' · ' + (f.nome || 'Dia parado')),
          el('button', {
            class: 'btn-icon', 'aria-label': 'Excluir', onclick: async () => {
              if (!(await confirmar('Tirar ' + dataBR(f.data) + ' da lista de dias parados?'))) return;
              salvar(extras.filter(x => (typeof x === 'string' ? x : x.data) !== f.data));
              toast('Dia removido. A meta já volta a contar com ele.');
              render();
            }
          }, ico('lixeira'))))
          : el('p', { class: 'vazio' }, 'Nenhum dia parado cadastrado para ' + ano + '.')));
    }
    function novo() {
      const dt = el('input', { class: 'input big', type: 'date', value: hojeISO() });
      const nm = el('input', { class: 'input big', placeholder: 'Motivo (ex.: feriado da cidade, Carnaval)' });
      const mm = modal(el('div', { class: 'col gap8' },
        el('p', { class: 'sub' }, 'Este dia deixa de contar como dia útil na meta.'),
        el('label', { class: 'campo' }, el('span', { class: 'sub' }, 'Data'), dt),
        nm,
        el('button', {
          class: 'btn big w100', onclick: () => {
            if (!dt.value) return toast('Informe a data.', 'erro');
            const lista = feriadosExtra().filter(f => (typeof f === 'string' ? f : f.data) !== dt.value);
            lista.push({ data: dt.value, nome: nm.value.trim() });
            salvar(lista);
            mm.fechar(); toast('Dia parado cadastrado.'); render();
          }
        }, rot('salvar', 'Salvar dia parado'))), { titulo: 'Novo dia parado' });
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
    // carteira compartilhada: a equipe inteira enxerga os mesmos clientes
    const compart = carteiraCompartilhada();
    const carteiraSel = el('select', { class: 'input' },
      el('option', { value: '1', selected: compart ? '' : null },
        'SIM — todos os vendedores veem todos os clientes'),
      el('option', { value: '', selected: compart ? null : '' },
        'NÃO — cada vendedor vê só a carteira dele'));
    const mm = modal(el('div', { class: 'col gap8' },
      el('label', { class: 'campo' },
        el('span', { class: 'sub' }, 'Carteira compartilhada entre os vendedores'), carteiraSel,
        el('span', { class: 'sub' }, 'A rota do dia continua sendo de cada vendedor, e o pedido, ' +
          'a visita e a comissão continuam no nome de quem atendeu.')),
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
          DB.upsertConfig('carteira_compartilhada', carteiraSel.value === '1');
          mm.fechar(); toast('Configurações salvas.');
        }
      }, 'Salvar configurações')), { titulo: 'Configurações', full: true });
  }


  // ================= APARÊNCIA (temas de cor) =================
  // cor de destaque — só as cores da paleta oficial do Prompt Star
  const TEMAS = [
    ['ouro', 'Amarelo', '#F9D132'], ['lilas', 'Lilás', '#DB80FF'],
    ['verde', 'Verde-limão', '#C1FF72'], ['vermelho', 'Vermelho', '#FF5757'],
    ['roxo', 'Roxo', '#290F5D']
  ];
  function aplicarTema(t) {
    if (t && t !== 'ouro') document.documentElement.dataset.tema = t;
    else delete document.documentElement.dataset.tema;
    localStorage.setItem('ns_tema', t || 'ouro');
  }
  function telaAparencia() {
    const atual = localStorage.getItem('ns_tema') || 'ouro';
    const grid = el('div', { class: 'tema-grid' });
    // vibração ao tocar: preferência DESTE aparelho, como o tema
    const chkVibra = el('input', { type: 'checkbox' });
    chkVibra.checked = localStorage.getItem('ns_vibrar') !== '0';
    chkVibra.addEventListener('change', () => {
      localStorage.setItem('ns_vibrar', chkVibra.checked ? '1' : '0');
      window.NSUI.ligarVibracao(chkVibra.checked);
      if (chkVibra.checked) window.NSUI.vibrar(18);
      toast(chkVibra.checked ? 'Vibração ligada.' : 'Vibração desligada.');
    });
    const m = modal(el('div', null,
      el('p', { class: 'sub mb12' }, 'Escolha a cor de destaque do aplicativo (vale para este aparelho).'),
      grid,
      el('label', { class: 'row gap8 mt12 campo-box roxo' }, chkVibra,
        el('div', null, el('strong', null, 'Vibrar ao tocar nos botões'),
          el('div', { class: 'sub' }, 'Vale só para este aparelho. O iPhone não vibra — o iOS não libera esse recurso para aplicativos abertos pelo navegador.')))
    ), { titulo: 'Aparência' });
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
      }, el('span', { class: 'tema-bola', style: 'background:' + cor }), rotulo));
    });
  }

  // ================= BOOT =================
  window.NSApp = {
    sessao, nav, recalcularCicloCliente, marcarFaturado, avisarPendentesNewStar, editarCliente,
    linkMaps, ligarBuscaCep, completarCatalogo, dataDoDia,
    podeFaturar, confirmarFaturamento, corDoRep, corTextoRep, motivoNaoFatura,
    // Pedido digitado para quem não estava na rota: o cliente entra na rota de
    // HOJE já atendido, e o atendimento conta na meta de visitação.
    aoConcluirPedido(pedido) {
      if (pedido && pedido.cliente_id) {
        const c = DB.byId('clientes', pedido.cliente_id);
        const diaHoje = C.DIAS_SEMANA[(new Date().getDay() === 0) ? 7 : new Date().getDay()];
        const ehDiaUtil = DIAS_ROTA.indexOf(diaHoje) >= 0;
        // entra na rota de QUEM VENDEU, não na do dono do cadastro
        const repPed = pedido.representante_id || repDaRota() || (c && c.representante_id);
        if (c && ehDiaUtil && rotaDiaDe(c, repPed) !== diaHoje) {
          porNaRota(c, diaHoje, repPed);
          toast(nomeExib(c) + ' entrou na rota de ' + diaHoje + ' como atendido.');
        }
        // A prioridade serve para NÃO esquecer o cliente. Tirado o pedido, ela
        // já cumpriu o papel e sai sozinha — senão a lista de prioritários vai
        // crescendo com quem já foi atendido.
        if (c && c.prioridade) {
          DB.update('clientes', c.id, { prioridade: false });
          c.prioridade = false;
          toast('Prioridade de ' + nomeExib(c) + ' encerrada — pedido tirado.');
        }
      }
      if (viewAtual === 'hoje' || viewAtual === 'pedidos') nav(viewAtual);
    }
  };

  // ── Atualização de versão SEM fechar o app ──
  // O app nunca se recarrega sozinho. Quando existe uma versão nova esperando,
  // aparece uma faixa discreta no rodapé; a troca só acontece quando o vendedor
  // toca em "Atualizar agora" — assim ele nunca perde a tela no meio do serviço.
  function ligarAtualizacao() {
    if (!('serviceWorker' in navigator)) return;
    let pedidoDeTroca = false, jaRecarregou = false;
    const recarregar = () => { if (!jaRecarregou) { jaRecarregou = true; location.reload(); } };
    // a troca de versão sozinha NÃO recarrega a tela; só recarrega se o
    // vendedor pedir no botão "Atualizar agora"
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (pedidoDeTroca) recarregar();
    });
    navigator.serviceWorker.register('sw.js').then((reg) => {
      const avisar = (sw) => {
        if (!navigator.serviceWorker.controller) return; // 1ª instalação: nada a avisar
        mostrarBarraAtualizar(() => {
          pedidoDeTroca = true;
          if (sw && sw.state === 'installed') sw.postMessage({ tipo: 'ATUALIZAR_AGORA' });
          setTimeout(recarregar, 700); // rede de segurança: recarrega de qualquer jeito
        });
      };
      if (reg.waiting) avisar(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const novo = reg.installing;
        if (!novo) return;
        novo.addEventListener('statechange', () => { if (novo.state === 'installed') avisar(novo); });
      });
      try { reg.update(); } catch (e) {}
    }).catch(() => {});
  }

  function mostrarBarraAtualizar(aoAceitar) {
    if (document.getElementById('barraAtualizar')) return;
    const barra = el('div', { class: 'barra-atualizar', id: 'barraAtualizar' },
      el('span', null, ico('sincronizar', 'ic-sm'), ' Tem uma versão nova do app.'),
      el('div', { class: 'row gap8' },
        el('button', { class: 'btn-mini', onclick: () => barra.remove() }, 'Depois'),
        el('button', { class: 'btn-mini verde', onclick: aoAceitar }, 'Atualizar agora')));
    document.body.appendChild(barra);
  }

  document.addEventListener('DOMContentLoaded', async () => {
    aplicarTema(localStorage.getItem('ns_tema') || 'ouro');
    window.NSUI.ligarVibracao(localStorage.getItem('ns_vibrar') !== '0');
    $$('#tabs button').forEach(b => b.addEventListener('click', () => nav(b.dataset.v)));
    $('#fab').addEventListener('click', () => window.NSPedido.novo());
    ligarAtualizacao();
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
