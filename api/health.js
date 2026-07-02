// Diagnóstico temporário — NÃO expõe segredos, só booleans e metadados
import { db } from './_lib/core.js';

export default async function handler(req, res) {
  const url = process.env.SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  // decodifica só o payload do JWT p/ ver a role (anon vs service_role)
  let keyRole = null;
  try {
    const payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64').toString());
    keyRole = payload.role || null;
  } catch { keyRole = key ? 'nao_e_jwt' : null; }

  let settingsRead = null, verifyTokenLen = null, dbError = null;
  try {
    const { data, error } = await db.from('crm_settings').select('key,value').eq('key','meta_verify_token').single();
    if (error) dbError = error.message;
    settingsRead = !!data;
    verifyTokenLen = data ? data.value.length : null;
  } catch (e) { dbError = e.message; }

  res.status(200).json({
    has_supabase_url: !!url,
    supabase_url_host: url ? url.replace(/^https?:\/\//,'').split('/')[0] : null,
    has_service_key: !!key,
    key_role: keyRole,
    has_cron_secret: !!process.env.CRON_SECRET,
    settings_read_ok: settingsRead,
    verify_token_length: verifyTokenLen,
    db_error: dbError,
  });
}
