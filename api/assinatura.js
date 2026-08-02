// NEW STAR — serve a assinatura do pedido como PNG (usada pelo Bluetooth Print)
// GET /api/assinatura?id=<id do pedido>
const PROJ = 'app-newstar';
const KEY = 'AIzaSyC7LOnwuHFeXBIP2usV-0x6Nd9SY51r2g4';

module.exports = async (req, res) => {
  try {
    const id = (req.query && req.query.id) || '';
    const r = await fetch(
      `https://firestore.googleapis.com/v1/projects/${PROJ}/databases/(default)/documents/pedidos/${encodeURIComponent(id)}?key=${KEY}&mask.fieldPaths=assinatura`);
    if (!r.ok) return res.status(404).end();
    const d = await r.json();
    const dataURL = d.fields && d.fields.assinatura && d.fields.assinatura.stringValue;
    if (!dataURL || !dataURL.startsWith('data:image/')) return res.status(404).end();
    const b64 = dataURL.split(',')[1];
    const mime = dataURL.slice(5, dataURL.indexOf(';'));
    res.setHeader('Content-Type', mime);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.status(200).send(Buffer.from(b64, 'base64'));
  } catch (e) {
    res.status(500).end();
  }
};
