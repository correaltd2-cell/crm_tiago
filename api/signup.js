// Criação de acesso pela tela de login — protegida por código de acesso
// (o código fica em crm_settings.signup_code, editável em Config IA → Integrações)
import { db } from './_lib/core.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { email, password, code } = req.body || {};
  if (!email || !password || !code) return res.status(400).json({ error: 'Preencha e-mail, senha e código de acesso.' });
  if (password.length < 6) return res.status(400).json({ error: 'A senha precisa ter pelo menos 6 caracteres.' });

  const { data: row } = await db.from('crm_settings').select('value').eq('key', 'signup_code').single();
  const expected = (row?.value || '').trim();
  if (!expected || code.trim().toLowerCase() !== expected.toLowerCase()) {
    return res.status(403).json({ error: 'Código de acesso incorreto.' });
  }

  // Cria o usuário via Admin API (service role), já confirmado
  const r = await fetch(`${process.env.SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = /already/i.test(JSON.stringify(data)) ? 'Esse e-mail já tem acesso — use "Entrar".' : (data?.msg || data?.message || 'Não foi possível criar o acesso.');
    return res.status(400).json({ error: msg });
  }
  return res.status(200).json({ ok: true });
}
