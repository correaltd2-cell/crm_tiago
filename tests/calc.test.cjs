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
eq('devolução maior que o colocado fica negativa (crédito)', r.vendidas, -4);
eq('crédito do excedente: −4 × 26,50 = −106,00', r.valor, -106);
r = C.calcItem({ placas: 0, unidPorPlaca: 24, devDisplay: 10, devQuebrada: 0, precoUnit: 12.60 });
eq('0 placas + 10 recolhidas = −10 vendidas', r.vendidas, -10);
eq('só recolher: valor −126,00 desconta do pedido', r.valor, -126);

console.log('Comissão:');
let c = C.calcComissao({ valor: 1000, clienteNovo: true, pctNovo: 15, pctReposicao: 10, dataPedido: '2026-07-25', recebimentoDias: 0 });
eq('cliente novo 15% = 150', c.valor, 150);
eq('venda de julho recebe em agosto (mês seguinte)', c.recebimentoEm, '2026-08-01');
c = C.calcComissao({ valor: 500, clienteNovo: false, pctNovo: 15, pctReposicao: 10, dataPedido: '2026-06-10', recebimentoDias: 0 });
eq('venda de junho recebe em julho', c.recebimentoEm, '2026-07-01');
c = C.calcComissao({ valor: 500, clienteNovo: false, pctNovo: 15, pctReposicao: 10, dataPedido: '2026-12-15', recebimentoDias: 0 });
eq('venda de dezembro recebe em janeiro (vira o ano)', c.recebimentoEm, '2027-01-01');
c = C.calcComissao({ valor: 1000, clienteNovo: false, pctNovo: 15, pctReposicao: 10, dataPedido: '2026-07-25', recebimentoDias: 45 });
eq('reposição 10% = 100', c.valor, 100);
eq('Clamed recebe +45d', c.recebimentoEm, '2026-09-08');
c = C.calcComissao({ valor: -800, clienteNovo: false, pctNovo: 15, pctReposicao: 10, dataPedido: '2026-07-28', recebimentoDias: 0 });
eq('retirada: comissão negativa −80 (crédito abate no mês)', c.valor, -80);
eq('retirada: crédito entra no mês seguinte', c.recebimentoEm, '2026-08-01');
r = C.calcTotais([{ unid_colocadas: 0, dev_display: 5, dev_quebrada: 0, unid_vendidas: -5, valor_total: -72.5 }]);
eq('totais aceitam item de retirada (valor negativo)', r.valor, -72.5);

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

console.log('Metas (dias úteis, % e projeção):');
eq('julho/2026 tem 23 dias úteis', C.diasUteisDoMes('2026-07'), 23);
eq('úteis decorridos até 28/07 (terça)', C.diasUteisAte('2026-07-28'), 20);
let mt = C.calcMeta({ metaMes: 200000, hoje: '2026-07-28', vendidoMes: 100000, metaDiaManual: 0 });
eq('meta/dia útil = 200000 ÷ 23', mt.metaDia, 8695.65);
eq('50% da meta batida', mt.pct, 50);
eq('ritmo de 5000/dia útil', mt.ritmoDia, 5000);
eq('nesse ritmo fecha em 115000', mt.projecao, 115000);
eq('projeção = 57,5% da meta', mt.projecaoPct, 57.5);
mt = C.calcMeta({ metaMes: 200000, hoje: '2026-07-28', vendidoMes: 0, metaDiaManual: 10000 });
eq('meta do dia manual tem prioridade', mt.metaDia, 10000);

console.log('Endpoint Bluetooth Print (JSON do cupom):');
const { montarLinhas } = require('../api/cupom.js');
const linhasBt = montarLinhas({
  pedido: { id: 'ped-1', numero: 16, data_pedido: '2026-07-30', tabela: 'lucro',
    condicao_pagamento: '30/45/60', total_unid_colocadas: 480, total_unid_dev_display: 310,
    total_unid_dev_quebrada: 10, total_unid_vendidas: 160, total_valor: 3285.1,
    assinatura: 'data:image/png;base64,x', assinante_nome: 'Raissa' },
  itens: [{ produto_id: 'p1', tamanho: 'G', placas: 1, unid_colocadas: 99,
    dev_display: 64, dev_quebrada: 1, unid_vendidas: 34, preco_unit: 14.5, valor_total: 493 }],
  cliente: { nome: 'Rede SAMIR FCT2* Lj421 Seara', cnpj_cpf: '10768389001498', cidade: 'Seara', uf: 'SC' },
  rep: { nome: 'Denilson', contato: '(54) 9999-0000' },
  produtos: [{ id: 'p1', codigo: '8073', nome: 'BRP Ponto de Luz', variacao: 'Zircônia' }],
  observacoes: 'Troca mediante a guarda das partes.',
  baseURL: 'https://app-newstar.vercel.app'
});
eq('cabeçalho NEW STAR grande, negrito e centralizado',
  JSON.stringify(linhasBt[0]), JSON.stringify({ type: 0, content: 'NEW STAR', bold: 1, align: 1, format: 2 }));
eq('todas as linhas têm type válido (0 texto ou 1 imagem)',
  linhasBt.every(l => l.type === 0 || l.type === 1), true);
eq('contato do vendedor presente', linhasBt.some(l => String(l.content).includes('(54) 9999-0000')), true);
eq('item com TOTAL em negrito à direita',
  linhasBt.some(l => l.content === 'TOTAL R$ 493,00' && l.bold === 1 && l.align === 2), true);
eq('assinatura vira imagem apontando para o endpoint',
  linhasBt.some(l => l.type === 1 && l.path === 'https://app-newstar.vercel.app/api/assinatura?id=ped-1' && l.align === 1), true);
eq('CNPJ formatado no cupom', linhasBt.some(l => String(l.content).includes('10.768.389/0014-98')), true);

console.log('CNPJ/CPF formatado:');
eq('CNPJ com pontuação', C.fmtCNPJ('09446409000100'), '09.446.409/0001-00');
eq('CPF com pontuação', C.fmtCNPJ('12345678901'), '123.456.789-01');
eq('já formatado continua certo', C.fmtCNPJ('09.446.409/0001-00'), '09.446.409/0001-00');
eq('valor estranho volta como veio', C.fmtCNPJ('123'), '123');

console.log('Rede do cliente:');
eq('Clamed pelo nome', C.redeDoCliente({ nome: 'Rede CLAMED PP 679 Getúlio III' }), 'Clamed');
eq('Agafarma pelo nome', C.redeDoCliente({ nome: '[Agafarma 26 JA] Agafarma Tucunduva' }), 'Agafarma');
eq('São Rafael pelo nome', C.redeDoCliente({ nome: 'Farmácias São Rafael Lj 08' }), 'São Rafael');
eq('sem rede = Independente', C.redeDoCliente({ nome: 'Farmácia Menino Jesus' }), 'Independente');
eq('campo rede tem prioridade sobre o nome', C.redeDoCliente({ rede: 'MinhaRede', nome: 'Rede CLAMED' }), 'MinhaRede');

console.log('Regiões de roteiro:');
eq('cliente em Chapecó → região Chapecó', C.regiaoDoCliente({ lat: -27.10, lng: -52.61 }), 'Chapecó');
eq('cliente em Sarandi → região Frederico ou Passo Fundo (mais próxima)',
  ['Passo Fundo', 'Frederico Westphalen'].includes(C.regiaoDoCliente({ lat: -27.94, lng: -52.92 })), true);
eq('Curitiba (outro estado) → Fora de rota', C.regiaoDoCliente({ lat: -25.43, lng: -49.27 }), 'Fora de rota');
eq('sem coordenada → null', C.regiaoDoCliente({}), null);

console.log('Planejador por regiões:');
const cls = [
  // região Chapecó, bem atrasados (última visita antiga)
  { id: 'a1', lat: -27.10, lng: -52.61, ultima_visita_em: '2026-05-01', frequencia_dias: 45 },
  { id: 'a2', lat: -27.11, lng: -52.62, ultima_visita_em: '2026-05-02', frequencia_dias: 45 },
  // região Passo Fundo, menos atrasado
  { id: 'b1', lat: -28.26, lng: -52.41, ultima_visita_em: '2026-07-01', frequencia_dias: 45 },
  // em dia (vence longe) → fora do horizonte
  { id: 'c1', lat: -28.26, lng: -52.40, ultima_visita_em: '2026-07-30', frequencia_dias: 90 },
  // fora de rota (Curitiba)
  { id: 'd1', lat: -25.43, lng: -49.27, ultima_visita_em: '2026-01-01', frequencia_dias: 45 }
];
const plano = C.planejarPorRegioes({ clientes: cls, hoje: '2026-08-02', cicloInicio: '2026-07-27', porDia: 2 });
eq('agenda só os elegíveis (3): atrasados dentro do horizonte e na rota', plano.atribuicoes.length, 3);
eq('região mais urgente (Chapecó) vem primeiro', plano.atribuicoes[0].regiao, 'Chapecó');
eq('primeiro dia útil é 03/08 (segunda)', plano.atribuicoes[0].data, '2026-08-03');
eq('bloco de Chapecó fecha antes de Passo Fundo',
  plano.atribuicoes.filter(a => a.regiao === 'Chapecó').every(a => a.data <= plano.atribuicoes.find(x => x.regiao === 'Passo Fundo').data), true);
eq('fora de rota não entra', plano.atribuicoes.some(a => a.id === 'd1'), false);
eq('semana/dia coerentes com o ciclo', plano.atribuicoes[0].semana >= 1 && !!plano.atribuicoes[0].dia, true);

console.log('Planejador com preferências do vendedor autônomo:');
const cls2 = [
  { id: 'x1', lat: -27.10, lng: -52.61, ultima_visita_em: '2026-05-01', frequencia_dias: 45 }, // Chapecó
  { id: 'x2', lat: -27.11, lng: -52.62, ultima_visita_em: '2026-05-02', frequencia_dias: 45 }, // Chapecó
  { id: 'x3', lat: -28.26, lng: -52.41, ultima_visita_em: '2026-05-03', frequencia_dias: 45 }, // Passo Fundo (base)
  { id: 'x4', lat: -28.25, lng: -52.42, ultima_visita_em: '2026-05-04', frequencia_dias: 45 }  // Passo Fundo (base)
];
const p2 = C.planejarPorRegioes({
  clientes: cls2, hoje: '2026-08-02', cicloInicio: '2026-07-27', porDia: 2,
  diasTrabalho: [2, 3, 4, 5], diaPertoBase: 5, baseCoord: { lat: -28.2622, lng: -52.4083 }
});
eq('sem segunda: nenhum agendamento cai na segunda-feira',
  p2.atribuicoes.every(a => new Date(a.data + 'T12:00:00').getDay() !== 1), true);
eq('sexta é dia perto de casa: só região Passo Fundo',
  p2.atribuicoes.filter(a => new Date(a.data + 'T12:00:00').getDay() === 5)
    .every(a => a.regiao === 'Passo Fundo'), true);
eq('todos os 4 clientes agendados', p2.atribuicoes.length, 4);
eq('clientes da base aparecem na sexta',
  p2.atribuicoes.some(a => a.regiao === 'Passo Fundo' && new Date(a.data + 'T12:00:00').getDay() === 5), true);

console.log('Região escolhida pelo vendedor:');
const p3 = C.planejarPorRegioes({
  clientes: cls2, hoje: '2026-08-02', cicloInicio: '2026-07-27', porDia: 2,
  regiaoPrioritaria: 'Passo Fundo'
});
eq('vendedor escolheu Passo Fundo: o roteiro começa por ela mesmo sendo menos urgente',
  p3.atribuicoes[0].regiao, 'Passo Fundo');
eq('as demais regiões vêm depois, por urgência',
  p3.atribuicoes[p3.atribuicoes.length - 1].regiao, 'Chapecó');

console.log('Classe A/B/C (prioridade no reencaixe):');
eq('A antes de B, C e D por último', [{classe:'C'},{classe:'D'},{classe:'A'},{},{classe:'B'}]
  .sort((a,b) => C.classeRank(a) - C.classeRank(b)).map(c => c.classe || 'B').join(''), 'ABBCD');
eq('sem classe = B', C.classeRank({}), 1);

console.log('\nPorcentagem no padrão brasileiro:');
eq('vírgula decimal, não ponto', C.fmtPct(59.45), '59,5%');
eq('inteiro sai sem casa decimal', C.fmtPct(100), '100%');
eq('uma casa quando precisa', C.fmtPct(12.3), '12,3%');
eq('zero', C.fmtPct(0), '0%');
eq('nulo vira zero', C.fmtPct(null), '0%');

console.log('\nTabela de preço permitida por cliente:');
eq('sem o campo = ambas (padrão)', C.tabelaPermitida({}), 'ambas');
eq('cliente novo (undefined) = ambas', C.tabelaPermitida(undefined), 'ambas');
eq('valor inválido cai para ambas', C.tabelaPermitida({ tabela_permitida: 'qualquer' }), 'ambas');
eq('travado em lucro', C.tabelaPermitida({ tabela_permitida: 'lucro' }), 'lucro');
eq('travado em simples', C.tabelaPermitida({ tabela_permitida: 'simples' }), 'simples');
eq('ambas oferece as duas tabelas', C.tabelasDoCliente({}).join(','), 'simples,lucro');
eq('Clamed só Lucro Presumido oferece uma', C.tabelasDoCliente({ rede: 'Clamed', tabela_permitida: 'lucro' }).join(','), 'lucro');
eq('só Simples oferece uma', C.tabelasDoCliente({ tabela_permitida: 'simples' }).join(','), 'simples');
eq('nomes legíveis das tabelas', C.NOME_TABELA.lucro + '/' + C.NOME_TABELA.simples, 'Lucro Presumido/Tabela Simples');
eq('3 opções no cadastro (ambas, simples, lucro)', C.TABELAS_PERMITIDAS.map(t => t[0]).join(','), 'ambas,simples,lucro');

console.log(`\n${ok} ok, ${fail} falhas`);
process.exit(fail ? 1 : 0);
