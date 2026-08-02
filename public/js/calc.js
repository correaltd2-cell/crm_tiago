/* NEW STAR — funções puras de cálculo (testáveis em Node: node tests/calc.test.js) */
(function (root) {
  'use strict';

  // ---------- Documentos ----------
  // 14 dígitos → 00.000.000/0000-00 · 11 dígitos → 000.000.000-00
  function fmtCNPJ(v) {
    const d = String(v || '').replace(/\D/g, '');
    if (d.length === 14)
      return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
    if (d.length === 11)
      return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    return String(v || '');
  }

  // ---------- Dinheiro ----------
  function round2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }
  function fmtMoney(n) {
    return (n == null ? 0 : n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  // ---------- Talão: cálculo de item ----------
  // unidades colocadas = placas × unidades da placa (P/G)
  // vendidas = colocadas − dev_display − dev_quebrada
  //   (pode ficar NEGATIVO: 0 placas + devolução = recolher peças antigas,
  //    o valor negativo desconta do total e vira crédito do cliente)
  // valor = vendidas × preço unitário da tabela do pedido
  function calcItem({ placas, unidPorPlaca, devDisplay, devQuebrada, precoUnit }) {
    placas = Math.max(0, parseInt(placas, 10) || 0);
    unidPorPlaca = Math.max(0, parseInt(unidPorPlaca, 10) || 0);
    devDisplay = Math.max(0, parseInt(devDisplay, 10) || 0);
    devQuebrada = Math.max(0, parseInt(devQuebrada, 10) || 0);
    const colocadas = placas * unidPorPlaca;
    const vendidas = colocadas - devDisplay - devQuebrada;
    const valor = round2(vendidas * (Number(precoUnit) || 0));
    return { colocadas, devDisplay, devQuebrada, vendidas, valor };
  }

  function calcTotais(itens) {
    const t = { colocadas: 0, devDisplay: 0, devQuebrada: 0, vendidas: 0, valor: 0 };
    for (const i of itens) {
      t.colocadas += i.unid_colocadas; t.devDisplay += i.dev_display;
      t.devQuebrada += i.dev_quebrada; t.vendidas += i.unid_vendidas;
      t.valor = round2(t.valor + Number(i.valor_total));
    }
    return t;
  }

  // ---------- Comissão ----------
  // Regra de recebimento: venda do mês M é recebida no mês M+1 (dia 1);
  // exceção: cliente com prazo próprio (rede Clamed = 45 dias corridos da venda).
  function calcComissao({ valor, clienteNovo, pctNovo, pctReposicao, dataPedido, recebimentoDias }) {
    const pct = clienteNovo ? (pctNovo ?? 15) : (pctReposicao ?? 10);
    const valorComissao = round2(valor * pct / 100);
    const d = new Date(dataPedido + 'T12:00:00');
    if (recebimentoDias > 0) d.setDate(d.getDate() + recebimentoDias);
    else d.setMonth(d.getMonth() + 1, 1); // mês seguinte ao da venda
    return { pct, valor: valorComissao, recebimentoEm: d.toISOString().slice(0, 10) };
  }

  // ---------- Ciclo de 7 semanas ----------
  // Na migração o dia vem como texto ('Segunda'…'Sexta') em dia_semana_padrao
  const DIAS_SEMANA = ['', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
  function normDia(s) {
    return String(s || '').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/-feira$/, '').trim();
  }
  function mesmoDia(diaTexto, diaNum) { return normDia(diaTexto) === normDia(DIAS_SEMANA[diaNum]); }

  // Regra de "cliente novo" — espelho do trigger fn_calcular_comissao:
  // qualquer sinal de compra anterior (último pedido, seed da listagem,
  // status legado ≠ 'Novo' ou visita com pedido) = reposição
  function clienteJaComprou(cliente, visitasDoCliente) {
    return !!(cliente.ultimo_pedido_em ||
      cliente.seed_dias_sem_pedido != null ||
      (cliente.status_legado && cliente.status_legado !== 'Novo') ||
      (visitasDoCliente || []).some(v => v.fez_pedido && Number(v.valor_pedido) > 0));
  }

  // Classe do cliente: A = prioridade máxima, B = normal (padrão),
  // C = baixa, D = mínima. No reencaixe entram nesta ordem: A, B, C, D.
  function classeRank(cliente) {
    return { A: 0, B: 1, C: 2, D: 3 }[(cliente && cliente.classe) || 'B'] ?? 1;
  }

  // cicloInicio = segunda-feira da semana 1 (ISO yyyy-mm-dd)
  function cicloDoDia(dateISO, cicloInicio) {
    const d = new Date(dateISO + 'T12:00:00');
    const ini = new Date(cicloInicio + 'T12:00:00');
    const dias = Math.floor((d - ini) / 86400000);
    const semanas = Math.floor(dias / 7);
    const semana = ((semanas % 7) + 7) % 7 + 1;             // 1..7
    const diaSemana = (d.getDay() === 0) ? 7 : d.getDay();  // 1=seg..6=sáb, 7=dom
    return { semana, diaSemana };
  }

  // ---------- Geo ----------
  function haversineKm(a, b) {
    const R = 6371, toRad = (x) => x * Math.PI / 180;
    const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
    const s = Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
  }

  // Matriz de distâncias por haversine × fator (fallback offline)
  function matrizHaversine(pontos, fator) {
    fator = fator || 1.3;
    const n = pontos.length, m = Array.from({ length: n }, () => new Array(n).fill(0));
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) {
        const d = haversineKm(pontos[i], pontos[j]) * fator;
        m[i][j] = d; m[j][i] = d;
      }
    return m;
  }

  // ---------- Otimização: Nearest Neighbor + 2-opt ----------
  // matriz inclui o ponto de partida no índice 0; retorna ordem dos índices 1..n
  function nearestNeighbor(matriz) {
    const n = matriz.length;
    const visitado = new Array(n).fill(false);
    visitado[0] = true;
    const ordem = [];
    let atual = 0;
    for (let k = 1; k < n; k++) {
      let melhor = -1, melhorD = Infinity;
      for (let j = 1; j < n; j++)
        if (!visitado[j] && matriz[atual][j] < melhorD) { melhorD = matriz[atual][j]; melhor = j; }
      visitado[melhor] = true; ordem.push(melhor); atual = melhor;
    }
    return ordem;
  }

  function comprimentoRota(matriz, ordem) {
    let d = 0, prev = 0;
    for (const i of ordem) { d += matriz[prev][i]; prev = i; }
    return d; // caminho aberto (não volta ao início)
  }

  function doisOpt(matriz, ordem) {
    ordem = ordem.slice();
    let melhorou = true;
    while (melhorou) {
      melhorou = false;
      for (let i = 0; i < ordem.length - 1; i++) {
        for (let j = i + 1; j < ordem.length; j++) {
          const nova = ordem.slice(0, i).concat(ordem.slice(i, j + 1).reverse(), ordem.slice(j + 1));
          if (comprimentoRota(matriz, nova) < comprimentoRota(matriz, ordem) - 1e-9) {
            ordem = nova; melhorou = true;
          }
        }
      }
    }
    return ordem;
  }

  function otimizarRota(matriz) {
    if (matriz.length <= 1) return { ordem: [], km: 0 };
    const ordem = doisOpt(matriz, nearestNeighbor(matriz));
    return { ordem, km: comprimentoRota(matriz, ordem) };
  }

  // Custo de desvio para inserir um ponto extra na melhor posição da rota
  function detourInsercao(matriz, ordem, idxNovo) {
    let melhor = Infinity;
    const seq = [0].concat(ordem);
    for (let p = 0; p < seq.length; p++) {
      const a = seq[p], b = seq[p + 1];
      const custo = (b === undefined)
        ? matriz[a][idxNovo]                                  // anexar no fim
        : matriz[a][idxNovo] + matriz[idxNovo][b] - matriz[a][b];
      if (custo < melhor) melhor = custo;
    }
    return melhor;
  }

  // ---------- Pernoite ----------
  // Sugerir apenas se: dist(último→base) > distMin  E
  // economia = dist(último→base) + dist(base→1º de amanhã) − dist(último→1º de amanhã) > economiaMin
  function decidirPernoite({ ultimo, base, primeiroAmanha, distMinKm, economiaMinKm, fator }) {
    fator = fator || 1.3;
    if (!ultimo || !base) return { sugerir: false };
    const dVolta = haversineKm(ultimo, base) * fator;
    if (dVolta <= distMinKm) return { sugerir: false, dVolta };
    if (!primeiroAmanha) return { sugerir: false, dVolta };
    const economia = dVolta + haversineKm(base, primeiroAmanha) * fator
      - haversineKm(ultimo, primeiroAmanha) * fator;
    return { sugerir: economia > economiaMinKm, dVolta, economia };
  }

  // ---------- Frequência que aprende ----------
  // visitas: mais recentes primeiro [{fez_pedido, dev_ratio?}]
  const CICLOS = [30, 45, 60, 90];
  function sugestaoFrequencia(visitasRecentes, freqAtual) {
    const ultimas = visitasRecentes.filter(v => v.realizada !== false).slice(0, 3);
    if (ultimas.length >= 3 && ultimas.every(v => !v.fez_pedido)) {
      const maior = CICLOS.find(c => c > freqAtual);
      return { tipo: 'alongar', para: maior || freqAtual,
        motivo: '3+ visitas seguidas sem pedido' };
    }
    if (ultimas.length >= 3 && ultimas.every(v => v.fez_pedido)) {
      const menores = CICLOS.filter(c => c < freqAtual);
      if (menores.length)
        return { tipo: 'encurtar', para: menores[menores.length - 1],
          motivo: 'comprando em toda visita' };
    }
    return null;
  }

  // ---------- Regiões de roteiro (lógica do vendedor) ----------
  // O roteiro anda em BLOCOS por região — assim nenhuma região é esquecida.
  const REGIOES = [
    { nome: 'Passo Fundo', lat: -28.2622, lng: -52.4083 },
    { nome: 'Santa Rosa', lat: -27.8702, lng: -54.4796 },
    { nome: 'Chapecó', lat: -27.0964, lng: -52.6183 },
    { nome: 'Joaçaba', lat: -27.1720, lng: -51.5106 },
    { nome: 'Erechim', lat: -27.6339, lng: -52.2697 },
    { nome: 'Frederico Westphalen', lat: -27.3586, lng: -53.3958 },
    { nome: 'São Miguel do Oeste', lat: -26.7242, lng: -53.5163 }
  ];
  // região = centro mais próximo; muito longe de todos (> limiteKm) = 'Fora de rota'
  // (redes/CDs de outros estados ficam no sistema mas fora do roteiro de visitas)
  function regiaoDoCliente(c, limiteKm) {
    limiteKm = limiteKm || 150;
    if (!c || c.lat == null || c.lng == null) return null;
    let melhor = null, dist = Infinity;
    for (const r of REGIOES) {
      const d = haversineKm(c, r);
      if (d < dist) { dist = d; melhor = r.nome; }
    }
    return dist <= limiteKm ? melhor : 'Fora de rota';
  }

  // Planejador: percorre as regiões da mais urgente para a menos, preenchendo
  // dias úteis (porDia clientes/dia, agrupados por proximidade dentro da região).
  // Vencimento conta da ÚLTIMA VISITA (não do último pedido).
  // Preferências do vendedor autônomo:
  //   diasTrabalho: dias da semana que ele trabalha (1=Seg..5=Sex; padrão todos)
  //   diaPertoBase: dia reservado para a região da base (ex.: 5 = sexta em Passo Fundo)
  //   baseCoord: {lat,lng} da base do vendedor (define a região "de casa")
  // Devolve atribuições {id, data, regiao, semana, dia} limitadas ao ciclo de 7 semanas.
  //   regiaoPrioritaria: região escolhida pelo vendedor para começar o roteiro
  //     (o sistema recomenda a mais urgente, mas quem decide é a pessoa)
  function planejarPorRegioes({ clientes, hoje, cicloInicio, porDia, horizonteDias,
    diasTrabalho, diaPertoBase, baseCoord, regiaoPrioritaria }) {
    porDia = porDia || 6; horizonteDias = horizonteDias || 45;
    const trabalha = (diasTrabalho && diasTrabalho.length) ? diasTrabalho : [1, 2, 3, 4, 5];
    const regiaoBase = (diaPertoBase && baseCoord) ? regiaoDoCliente(baseCoord, 1e9) : null;
    const due = (c) => {
      const base = c.ultima_visita_em || c.ultimo_pedido_em;
      if (!base) return new Date(hoje + 'T12:00:00');
      const d = new Date(base + 'T12:00:00');
      d.setDate(d.getDate() + (c.frequencia_dias || 45));
      return d;
    };
    const hojeD = new Date(hoje + 'T12:00:00');
    const fim = new Date(hojeD); fim.setDate(fim.getDate() + horizonteDias);
    const eleg = clientes
      .filter(c => c.lat != null && (c.regiao || regiaoDoCliente(c)) !== 'Fora de rota')
      .map(c => ({ c, due: due(c), regiao: c.regiao || regiaoDoCliente(c) }))
      .filter(x => x.regiao && x.due <= fim);
    const porRegiao = {};
    for (const x of eleg) (porRegiao[x.regiao] = porRegiao[x.regiao] || []).push(x);
    for (const r of Object.keys(porRegiao))
      porRegiao[r] = porRegiao[r].sort((a, b) => a.due - b.due).map(x => x.c);
    const regioes = Object.keys(porRegiao).sort((a, b) => {
      const dueMin = (r) => Math.min.apply(null, (porRegiao[r].length ? porRegiao[r] : [null])
        .map(c => c ? +due(c) : Infinity));
      return dueMin(a) - dueMin(b);
    });
    // dias úteis (respeitando os dias de trabalho) — máx. 34 sem repetir o ciclo
    const slots = [];
    const d = new Date(hojeD); d.setDate(d.getDate() + 1);
    let vistos = 0;
    while (slots.length < 34 && vistos < 60) {
      const dw = d.getDay();
      if (dw >= 1 && dw <= 5) {
        vistos++;
        if (trabalha.includes(dw)) slots.push({ data: d.toISOString().slice(0, 10), dw });
      }
      d.setDate(d.getDate() + 1);
    }
    const montarGrupo = (fila) => {
      const grupo = [fila.shift()];
      while (grupo.length < porDia && fila.length) {
        const cx = {
          lat: grupo.reduce((s, g) => s + g.lat, 0) / grupo.length,
          lng: grupo.reduce((s, g) => s + g.lng, 0) / grupo.length
        };
        let melhor = 0, md = Infinity;
        for (let i = 0; i < fila.length; i++) {
          const dd = haversineKm(cx, fila[i]);
          if (dd < md) { md = dd; melhor = i; }
        }
        grupo.push(fila.splice(melhor, 1)[0]);
      }
      return grupo;
    };
    // a fila da região da base fica RESERVADA para os dias "perto de casa";
    // só o excedente (que não cabe nesses dias) entra na rotação normal, no fim
    let filaBase = null;
    if (regiaoBase && porRegiao[regiaoBase] && porRegiao[regiaoBase].length) {
      const capacidadeBase = slots.filter(s => s.dw === diaPertoBase).length * porDia;
      filaBase = porRegiao[regiaoBase].slice(0, capacidadeBase);
      porRegiao[regiaoBase] = porRegiao[regiaoBase].slice(capacidadeBase);
    }
    let ordem = regiaoBase
      ? regioes.filter(r => r !== regiaoBase).concat(porRegiao[regiaoBase] && porRegiao[regiaoBase].length ? [regiaoBase] : [])
      : regioes;
    // região escolhida pelo vendedor vai para a frente da rotação
    if (regiaoPrioritaria && ordem.includes(regiaoPrioritaria))
      ordem = [regiaoPrioritaria].concat(ordem.filter(r => r !== regiaoPrioritaria));
    const atribuicoes = [];
    let ri = 0, dias = 0;
    const filaDe = (reg) => porRegiao[reg] || [];
    for (const slot of slots) {
      let reg = null, fila = null;
      // dia perto de casa: puxa da fila reservada da base
      if (filaBase && slot.dw === diaPertoBase && filaBase.length) { reg = regiaoBase; fila = filaBase; }
      else {
        while (ri < ordem.length && !filaDe(ordem[ri]).length) ri++;
        if (ri < ordem.length) { reg = ordem[ri]; fila = porRegiao[reg]; }
        else if (filaBase && filaBase.length) continue; // a base espera o dia perto de casa
        else break;
      }
      if (!reg || !fila.length) continue;
      const grupo = montarGrupo(fila);
      const ciclo = cicloDoDia(slot.data, cicloInicio);
      for (const c of grupo)
        atribuicoes.push({ id: c.id, data: slot.data, regiao: reg,
          semana: ciclo.semana, dia: DIAS_SEMANA[ciclo.diaSemana] });
      dias++;
    }
    return { atribuicoes, regioes, elegiveis: eleg.length, dias,
      semDia: eleg.length - atribuicoes.length };
  }

  // ---------- Metas (mês → dia útil, % batida e projeção de ritmo) ----------
  function diasUteisDoMes(mesISO) {
    const [a, m] = mesISO.split('-').map(Number);
    let n = 0;
    const d = new Date(a, m - 1, 1);
    while (d.getMonth() === m - 1) {
      const dw = d.getDay();
      if (dw >= 1 && dw <= 5) n++;
      d.setDate(d.getDate() + 1);
    }
    return n;
  }
  // dias úteis do mês decorridos até o dia (inclusive)
  function diasUteisAte(diaISO) {
    const [a, m, dd] = diaISO.split('-').map(Number);
    let n = 0;
    for (let i = 1; i <= dd; i++) {
      const dw = new Date(a, m - 1, i).getDay();
      if (dw >= 1 && dw <= 5) n++;
    }
    return n;
  }
  function calcMeta({ metaMes, hoje, vendidoMes, metaDiaManual }) {
    const uteisTotal = diasUteisDoMes(hoje.slice(0, 7));
    const uteisDecorridos = Math.max(1, diasUteisAte(hoje));
    const metaDia = (metaDiaManual > 0) ? metaDiaManual
      : round2((metaMes || 0) / (uteisTotal || 1));
    const pct = metaMes > 0 ? round2(vendidoMes / metaMes * 100) : 0;
    const ritmoDia = round2(vendidoMes / uteisDecorridos);
    const projecao = round2(ritmoDia * uteisTotal);
    const projecaoPct = metaMes > 0 ? round2(projecao / metaMes * 100) : 0;
    return { uteisTotal, uteisDecorridos, metaDia, pct, ritmoDia, projecao, projecaoPct };
  }

  // ---------- Rede do cliente (para relatórios por rede) ----------
  function redeDoCliente(c) {
    if (c && c.rede) return c.rede;
    const n = String((c && c.nome) || '');
    const padroes = [
      [/clamed/i, 'Clamed'], [/agafarma/i, 'Agafarma'], [/s[ãa]o rafael/i, 'São Rafael'],
      [/asfar/i, 'Asfar'], [/fz\s*farma/i, 'FZ Farma'], [/farm[áa]cias?\s+erechim/i, 'Rede Erechim'],
      [/vida farm/i, 'Vida Farmácias'], [/associada/i, 'Associadas']
    ];
    for (const [re, nome] of padroes) if (re.test(n)) return nome;
    const m = n.match(/rede\s+([A-Za-zÀ-ú0-9&.]+)/i);
    if (m) return 'Rede ' + m[1];
    return 'Independente';
  }

  // ---------- CSV ----------
  function parseCSV(texto) {
    const sep = (texto.split('\n')[0].match(/;/g) || []).length >=
                (texto.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
    const linhas = [];
    let campo = '', linha = [], aspas = false;
    for (let i = 0; i < texto.length; i++) {
      const c = texto[i];
      if (aspas) {
        if (c === '"') { if (texto[i + 1] === '"') { campo += '"'; i++; } else aspas = false; }
        else campo += c;
      } else if (c === '"') aspas = true;
      else if (c === sep) { linha.push(campo); campo = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && texto[i + 1] === '\n') i++;
        linha.push(campo); campo = '';
        if (linha.some(x => x.trim() !== '')) linhas.push(linha);
        linha = [];
      } else campo += c;
    }
    if (campo !== '' || linha.length) { linha.push(campo); if (linha.some(x => x.trim() !== '')) linhas.push(linha); }
    return linhas;
  }

  function toCSV(linhas) {
    return linhas.map(l => l.map(v => {
      v = v == null ? '' : String(v);
      return /[";\n,]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
    }).join(';')).join('\r\n');
  }

  const api = {
    fmtCNPJ,
    round2, fmtMoney, calcItem, calcTotais, calcComissao, cicloDoDia,
    DIAS_SEMANA, normDia, mesmoDia, clienteJaComprou, classeRank,
    haversineKm, matrizHaversine, nearestNeighbor, comprimentoRota, doisOpt,
    otimizarRota, detourInsercao, decidirPernoite, sugestaoFrequencia,
    diasUteisDoMes, diasUteisAte, calcMeta, redeDoCliente,
    REGIOES, regiaoDoCliente, planejarPorRegioes,
    parseCSV, toCSV, CICLOS
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.NSCalc = api;
})(typeof self !== 'undefined' ? self : globalThis);
