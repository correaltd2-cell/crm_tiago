// NEW STAR — testes dos cálculos obrigatórios (node newstar/tests/calc.test.js)
const C = require('../public/js/calc.js');
let ok = 0, fail = 0;
function eq(nome, atual, esperado) {
  const a = JSON.stringify(atual), e = JSON.stringify(esperado);
  if (a === e) { ok++; console.log('  ✓', nome); }
  else { fail++; console.error('  ✗', nome, '\n    esperado:', e, '\n    obtido:  ', a); }
}

console.log('Cálculo de item (placas × devoluções × quebras):');
// Exemplo validador da especificação: BRAG placa P (48un), devolveu 5, quebrou 2 → 41 vendidas
let r = C.calcItem({ placas: 1, unidPorPlaca: 48, devDisplay: 5, devQuebrada: 2, precoUnit: 12.60 });
eq('BRAG P: 48 − 5 − 2 = 41 vendidas', r.vendidas, 41);
eq('BRAG P: valor 41 × 12,60 = 516,60', r.valor, 516.60);
r = C.calcItem({ placas: 2, unidPorPlaca: 72, devDisplay: 0, devQuebrada: 0, precoUnit: 14.50 });
eq('placa G ×2: 144 colocadas', r.colocadas, 144);
eq('placa G ×2: valor 2088,00', r.valor, 2088.00);
r = C.calcItem({ placas: 1, unidPorPlaca: 16, devDisplay: 10, devQuebrada: 10, precoUnit: 26.50 });
eq('devolução maior que colocado não fica negativa', r.vendidas, 0);

console.log('Comissão:');
let c = C.calcComissao({ valor: 1000, clienteNovo: true, pctNovo: 15, pctReposicao: 10, dataPedido: '2026-07-25', recebimentoDias: 0 });
eq('cliente novo 15% = 150', c.valor, 150);
eq('recebimento no mês (D+0)', c.recebimentoEm, '2026-07-25');
c = C.calcComissao({ valor: 1000, clienteNovo: false, pctNovo: 15, pctReposicao: 10, dataPedido: '2026-07-25', recebimentoDias: 45 });
eq('reposição 10% = 100', c.valor, 100);
eq('Clamed recebe +45d', c.recebimentoEm, '2026-09-08');

console.log('Ciclo de 7 semanas:');
eq('dia do início = semana 1, segunda', C.cicloDoDia('2026-01-05', '2026-01-05'), { semana: 1, diaSemana: 1 });
eq('7 semanas depois volta à semana 1', C.cicloDoDia('2026-02-23', '2026-01-05').semana, 1);
eq('sexta da semana 3', C.cicloDoDia('2026-01-23', '2026-01-05'), { semana: 3, diaSemana: 5 });

console.log('Rota (NN + 2-opt):');
// pontos numa linha: partida (0,0), clientes em x=3, x=1, x=2 → ordem ótima 1,2,3 = índices [2,3,1]
const pontos = [{ lat: 0, lng: 0 }, { lat: 0, lng: 0.03 }, { lat: 0, lng: 0.01 }, { lat: 0, lng: 0.02 }];
const m = C.matrizHaversine(pontos, 1);
const rota = C.otimizarRota(m);
eq('ordem ótima em linha', rota.ordem, [2, 3, 1]);
// 2-opt corrige cruzamento que o NN cria
const quad = [{ lat: 0, lng: 0 }, { lat: 1, lng: 1 }, { lat: 0, lng: 1.05 }, { lat: 1, lng: 0.05 }];
const m2 = C.matrizHaversine(quad, 1);
const nn = C.nearestNeighbor(m2);
const opt = C.doisOpt(m2, nn);
if (C.comprimentoRota(m2, opt) <= C.comprimentoRota(m2, nn) + 1e-9) { ok++; console.log('  ✓ 2-opt nunca piora o NN'); }
else { fail++; console.error('  ✗ 2-opt piorou a rota'); }

console.log('Reencaixe de pendente (detour de inserção):');
const det = C.detourInsercao(m, rota.ordem, 1); // ponto já no caminho → detour ~0
if (det < 0.2) { ok++; console.log('  ✓ ponto no caminho tem desvio ~0 km'); }
else { fail++; console.error('  ✗ desvio inesperado:', det); }

console.log('Pernoite:');
let p = C.decidirPernoite({ ultimo: { lat: 0, lng: 2 }, base: { lat: 0, lng: 0 },
  primeiroAmanha: { lat: 0, lng: 2.2 }, distMinKm: 150, economiaMinKm: 60, fator: 1.3 });
eq('longe da base e amanhã perto → pernoitar', p.sugerir, true);
p = C.decidirPernoite({ ultimo: { lat: 0, lng: 0.5 }, base: { lat: 0, lng: 0 },
  primeiroAmanha: { lat: 0, lng: 0.6 }, distMinKm: 150, economiaMinKm: 60, fator: 1.3 });
eq('perto da base (<150km) → não sugerir', p.sugerir, false);

console.log('Frequência que aprende:');
eq('3 sem pedido → alongar', C.sugestaoFrequencia(
  [{ fez_pedido: false }, { fez_pedido: false }, { fez_pedido: false }], 45).tipo, 'alongar');
eq('3 com pedido → encurtar p/ 30', C.sugestaoFrequencia(
  [{ fez_pedido: true }, { fez_pedido: true }, { fez_pedido: true }], 45).para, 30);
eq('misto → sem sugestão', C.sugestaoFrequencia(
  [{ fez_pedido: true }, { fez_pedido: false }, { fez_pedido: true }], 45), null);

console.log('CSV:');
eq('parse ; com aspas', C.parseCSV('nome;cidade\n"Farm ""A"";B";Chapecó\n'),
  [['nome', 'cidade'], ['Farm "A";B', 'Chapecó']]);
eq('roundtrip toCSV', C.parseCSV(C.toCSV([['a', 'b;c'], ['d', 'e"f']])), [['a', 'b;c'], ['d', 'e"f']]);

console.log('Totais do pedido:');
const itens = [
  { unid_colocadas: 48, dev_display: 5, dev_quebrada: 2, unid_vendidas: 41, valor_total: 516.60 },
  { unid_colocadas: 22, dev_display: 0, dev_quebrada: 1, unid_vendidas: 21, valor_total: 556.50 },
];
eq('soma dos itens', C.calcTotais(itens), { colocadas: 70, devDisplay: 5, devQuebrada: 3, vendidas: 62, valor: 1073.10 });

console.log('Ciclo com dia em texto (migração real):');
eq('Segunda == dia 1', C.mesmoDia('Segunda', 1), true);
eq('terça-feira == dia 2 (acento/feira)', C.mesmoDia('terça-feira', 2), true);
eq('Sexta != dia 3', C.mesmoDia('Sexta', 3), false);

console.log('Cliente novo (regra do trigger):');
eq('status legado Novo sem histórico → novo', C.clienteJaComprou({ status_legado: 'Novo' }, []), false);
eq('status legado Ativo → já comprou (10%)', C.clienteJaComprou({ status_legado: 'Ativo' }, []), true);
eq('seed da listagem → já comprou', C.clienteJaComprou({ seed_dias_sem_pedido: 30 }, []), true);
eq('visita com pedido → já comprou', C.clienteJaComprou({ status_legado: 'Novo' }, [{ fez_pedido: true, valor_pedido: 100 }]), true);

console.log(`\n${ok} ok, ${fail} falhas`);
process.exit(fail ? 1 : 0);
