// Troca o "code" do Embedded Signup por um token de acesso permanente,
// inscreve o app no WABA do cliente e salva tudo em crm_settings.
// Chamado pelo front logo após o popup do Facebook fechar com sucesso.
import { db, requireUser } from './_lib/core.js';

const GRAPH = 'https://graph.facebook.com/v21.0';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const user = await requireUser(req);
  if (!user) return res.status(401).json({ error: 'Não autorizado' });

  const { code, wabaId, phoneNumberId } = req.body || {};
  if (!code || !wabaId || !phoneNumberId) {
    return res.status(400).json({ error: 'Dados incompletos do Embedded Signup (code, wabaId, phoneNumberId).' });
  }

  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) {
    return res.status(500).json({ error: 'META_APP_ID / META_APP_SECRET não configurados no servidor (Vercel).' });
  }

  try {
    // 1) Troca o code por um token de usuário de curta duração
    const shortRes = await fetch(
      `${GRAPH}/oauth/access_token?client_id=${appId}&client_secret=${appSecret}&code=${encodeURIComponent(code)}`
    );
    const shortData = await shortRes.json();
    if (!shortRes.ok) throw new Error(shortData?.error?.message || 'Falha ao trocar o code pelo token');
    const shortToken = shortData.access_token;

    // 2) Estende para token de longa duração (~60 dias) — base para o System User token
    const longRes = await fetch(
      `${GRAPH}/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${shortToken}`
    );
    const longData = await longRes.json();
    if (!longRes.ok) throw new Error(longData?.error?.message || 'Falha ao estender o token');
    const longToken = longData.access_token;

    // 3) Inscreve o app para receber webhooks deste WABA
    const subRes = await fetch(`${GRAPH}/${wabaId}/subscribed_apps`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${longToken}` },
    });
    const subData = await subRes.json().catch(() => ({}));
    if (!subRes.ok) console.error('Aviso: falha ao inscrever webhooks:', JSON.stringify(subData));

    // 4) Salva tudo — o cliente já fica pronto para operar em API Oficial
    const rows = [
      { key: 'wa_provider', value: 'meta' },
      { key: 'meta_token', value: longToken },
      { key: 'meta_phone_number_id', value: String(phoneNumberId) },
      { key: 'meta_waba_id', value: String(wabaId) },
    ];
    await db.from('crm_settings').upsert(rows);

    return res.status(200).json({ ok: true, wabaId, phoneNumberId });
  } catch (err) {
    console.error('embedded-signup-exchange error:', err);
    return res.status(500).json({ error: err.message });
  }
}
