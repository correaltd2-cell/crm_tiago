// NEW STAR — endpoint para o app "Bluetooth Print" (iOS/Android)
// GET /api/cupom?id=<id do pedido>  →  JSON no formato do app:
//   type 0 = texto {content, bold, align, format} · type 1 = imagem {path, align}
//   align: 0 esquerda · 1 centro · 2 direita · format: 0 normal · 2 grande
// O app é aberto pelo sistema via bprint://<esta URL> e imprime direto na térmica.

const PROJ = 'app-newstar';
const KEY = 'AIzaSyC7LOnwuHFeXBIP2usV-0x6Nd9SY51r2g4';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJ}/databases/(default)/documents`;

function dec(v) {
  if (!v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  return null;
}
function docToObj(d) {
  const o = { id: d.name.split('/').pop() };
  for (const [k, v] of Object.entries(d.fields || {})) o[k] = dec(v);
  return o;
}
async function getDoc(col, id) {
  const r = await fetch(`${BASE}/${col}/${encodeURIComponent(id)}?key=${KEY}`);
  if (!r.ok) return null;
  return docToObj(await r.json());
}
async function query(col, campo, valor) {
  const r = await fetch(`${BASE.replace(/\/documents$/, '')}/documents:runQuery?key=${KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ structuredQuery: {
      from: [{ collectionId: col }],
      where: { fieldFilter: { field: { fieldPath: campo }, op: 'EQUAL', value: { stringValue: valor } } }
    } })
  });
  const rows = await r.json();
  return rows.filter(x => x.document).map(x => docToObj(x.document));
}

const fmtBR = (n) => 'R$ ' + Number(n || 0).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const dataBR = (iso) => iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '';
function fmtCNPJ(v) {
  const d = String(v || '').replace(/\D/g, '');
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  return String(v || '');
}

// montarLinhas é puro (testável em Node)
function montarLinhas({ pedido, itens, cliente, rep, produtos, observacoes, baseURL }) {
  const L = [];
  const t = (content, o) => L.push(Object.assign({ type: 0, content, bold: 0, align: 0, format: 0 }, o));
  const negativo = Number(pedido.total_valor) < 0;
  const fone = rep.contato || rep.telefone || rep.celular || '';
  const prodDe = (id) => produtos.find(p => p.id === id) || {};

  t('NEW STAR', { bold: 1, align: 1, format: 2 });
  t('APP DO VENDEDOR', { align: 1 });
  t(negativo ? 'RECOLHIMENTO - CREDITO DO CLIENTE' : 'TALAO DE PEDIDO', { align: 1 });
  t('--------------------------------', { align: 1 });
  t('Pedido no ' + (pedido.numero || 'PENDENTE'), { bold: 1, format: 1 });
  t('Data: ' + dataBR(pedido.data_pedido));
  t('Vendedor: ' + (rep.nome || ''));
  if (fone) t('Contato do vendedor: ' + fone);
  t('Tabela: ' + (pedido.tabela === 'lucro' ? 'Lucro Presumido' : 'Tabela Simples'));
  t('Cond. pgto: ' + (pedido.condicao_pagamento || '-'));
  t('--------------------------------', { align: 1 });
  t(cliente.nome || '', { bold: 1 });
  if (cliente.cnpj_cpf) t('CNPJ/CPF: ' + fmtCNPJ(cliente.cnpj_cpf));
  const cid = [cliente.cidade, cliente.uf].filter(Boolean).join(' - ');
  if (cid) t(cid);
  t('--------------------------------', { align: 1 });
  for (const it of itens) {
    const p = prodDe(it.produto_id);
    t((p.codigo ? p.codigo + ' ' : '') + (p.nome || '') + (p.variacao ? ' (' + p.variacao + ')' : ''), { bold: 1 });
    t(it.tamanho === 'AV'
      ? 'Avulso: ' + it.unid_colocadas + ' un'
      : 'Placa ' + it.tamanho + ' x' + it.placas + ' = ' + it.unid_colocadas + ' un');
    t('Qtd. devolvida: ' + it.dev_display + ' | Qtd. quebrada: ' + it.dev_quebrada);
    t('Qtd. vendida: ' + it.unid_vendidas + ' | Valor unit.: ' + fmtBR(it.preco_unit));
    t('TOTAL ' + fmtBR(it.valor_total), { bold: 1, align: 2 });
    t(' ');
  }
  t('--------------------------------', { align: 1 });
  t('Colocadas: ' + pedido.total_unid_colocadas + ' | Devolvidas: ' + pedido.total_unid_dev_display);
  t('Quebradas: ' + pedido.total_unid_dev_quebrada + ' | Vendidas: ' + pedido.total_unid_vendidas);
  t((negativo ? 'CREDITO ' : 'TOTAL ') + fmtBR(pedido.total_valor), { bold: 1, align: 2, format: 1 });
  if (observacoes) t(observacoes);
  t('--------------------------------', { align: 1 });
  // O cupom NAO leva o nome de quem recebeu nem a assinatura: os dois ficam
  // guardados no pedido, dentro do app. Aqui vai so a confirmacao do recebimento.
  t('RECEBIMENTO CONFIRMADO', { bold: 1, align: 1 });
  t('Pedido recebido e registrado digitalmente no aplicativo do vendedor.', { align: 1 });
  t(cliente.nome || '', { bold: 1, align: 1 });
  t(' ');
  t(' ');
  return L;
}

module.exports = async (req, res) => {
  try {
    const id = (req.query && req.query.id) || '';
    if (!id) return res.status(400).json([{ type: 0, content: 'Pedido nao informado.', bold: 1, align: 1, format: 0 }]);
    const pedido = await getDoc('pedidos', id);
    if (!pedido) return res.status(404).json([{ type: 0, content: 'Pedido nao encontrado.', bold: 1, align: 1, format: 0 }]);
    const [itens, cliente, rep, produtosDocs, cfg] = await Promise.all([
      query('pedido_itens', 'pedido_id', id),
      getDoc('clientes', pedido.cliente_id),
      getDoc('representantes', pedido.representante_id),
      fetch(`${BASE}/produtos?pageSize=300&key=${KEY}`).then(r => r.json()),
      getDoc('configuracoes', 'pdf_observacoes')
    ]);
    const produtos = (produtosDocs.documents || []).map(docToObj);
    const proto = (req.headers['x-forwarded-proto'] || 'https');
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const linhas = montarLinhas({
      pedido, itens, cliente: cliente || {}, rep: rep || {}, produtos,
      observacoes: (cfg && cfg.valor) || '', baseURL: proto + '://' + host
    });
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json(linhas);
  } catch (e) {
    res.status(500).json([{ type: 0, content: 'Erro ao montar o cupom: ' + e.message, bold: 1, align: 1, format: 0 }]);
  }
};
module.exports.montarLinhas = montarLinhas;
