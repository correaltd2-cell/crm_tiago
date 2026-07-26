/* NEW STAR — funções puras de cálculo (testáveis em Node: node tests/calc.test.js) */
(function (root) {
  'use strict';

  // ---------- Dinheiro ----------
  function round2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }
  function fmtMoney(n) {
    return (n == null ? 0 : n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  // ---------- Talão: cálculo de item ----------
  // unidades colocadas = placas × unidades da placa (P/G)
  // vendidas = colocadas − dev_display − dev_quebrada
  // valor = vendidas × preço unitário da tabela do pedido
  function calcItem({ placas, unidPorPlaca, devDisplay, devQuebrada, precoUnit }) {
    placas = Math.max(0, parseInt(placas, 10) || 0);
    unidPorPlaca = Math.max(0, parseInt(unidPorPlaca, 10) || 0);
    devDisplay = Math.max(0, parseInt(devDisplay, 10) || 0);
    devQuebrada = Math.max(0, parseInt(devQuebrada, 10) || 0);
    const colocadas = placas * unidPorPlaca;
    const vendidas = Math.max(0, colocadas - devDisplay - devQuebrada);
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
    round2, fmtMoney, calcItem, calcTotais, calcComissao, cicloDoDia,
    DIAS_SEMANA, normDia, mesmoDia, clienteJaComprou, classeRank,
    haversineKm, matrizHaversine, nearestNeighbor, comprimentoRota, doisOpt,
    otimizarRota, detourInsercao, decidirPernoite, sugestaoFrequencia,
    parseCSV, toCSV, CICLOS
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.NSCalc = api;
})(typeof self !== 'undefined' ? self : globalThis);
