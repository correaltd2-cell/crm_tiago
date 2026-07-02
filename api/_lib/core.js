// Helpers compartilhados — Supabase (service role), Meta Cloud API e autenticação
// As credenciais de integração vêm da tabela `settings` (aba Integrações do CRM),
// com fallback para env vars se existirem.
import { createClient } from '@supabase/supabase-js';

export const db = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const GRAPH = 'https://graph.facebook.com/v21.0';

// ---- Configuração dinâmica (settings do banco) ----------------------------
let _cfgCache = null;
let _cfgAt = 0;

export async function getConfig() {
  // cache de 30s para não consultar o banco a cada mensagem
  if (_cfgCache && Date.now() - _cfgAt < 30000) return _cfgCache;
  const { data } = await db.from('crm_settings').select('key,value');
  const map = Object.fromEntries((data || []).map((r) => [r.key, r.value]));
  _cfgCache = {
    metaToken: map.meta_token || process.env.META_TOKEN || '',
    phoneNumberId: map.meta_phone_number_id || process.env.META_PHONE_NUMBER_ID || '',
    verifyToken: map.meta_verify_token || process.env.META_VERIFY_TOKEN || '',
    secretaryPhone: map.secretary_phone || process.env.SECRETARY_PHONE || '',
    geminiKey: map.gemini_api_key || process.env.GEMINI_API_KEY || '',
    geminiModel: map.gemini_model || process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    agentName: map.agent_name || 'Maia',
    systemPrompt: map.system_prompt || '',
    knowledgeBase: map.knowledge_base || '',
  };
  _cfgAt = Date.now();
  return _cfgCache;
}

// ---- Meta Cloud API -------------------------------------------------------
async function metaPost(payload) {
  const cfg = await getConfig();
  if (!cfg.metaToken || !cfg.phoneNumberId) {
    throw new Error('Integração do WhatsApp não configurada — preencha o token e o Phone Number ID na aba Integrações.');
  }
  const res = await fetch(`${GRAPH}/${cfg.phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.metaToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) {
    console.error('Meta API error:', JSON.stringify(data));
    throw new Error(data?.error?.message || 'Falha ao enviar mensagem via Meta');
  }
  return data;
}

export function sendText(to, body) {
  return metaPost({
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: { body, preview_url: false },
  });
}

// Envia template aprovado. params = array de strings para as variáveis {{1}}, {{2}}...
export function sendTemplate(to, templateName, params = [], lang = 'pt_BR') {
  const components = params.length
    ? [{ type: 'body', parameters: params.map((t) => ({ type: 'text', text: String(t) })) }]
    : [];
  return metaPost({
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: { name: templateName, language: { code: lang }, components },
  });
}

// ---- Janela de 24h da API oficial ----------------------------------------
export function insideWindow(lastInboundAt) {
  if (!lastInboundAt) return false;
  return Date.now() - new Date(lastInboundAt).getTime() < 24 * 60 * 60 * 1000;
}

// ---- Autenticação do painel (JWT do Supabase Auth) ------------------------
export async function requireUser(req) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return null;
  const res = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) return null;
  return res.json();
}

// ---- Persistência de mensagens --------------------------------------------
export async function saveMessage(leadId, { direction, sender, body, waMessageId = null }) {
  await db.from('crm_messages').insert({
    lead_id: leadId,
    direction,
    sender,
    body,
    wa_message_id: waMessageId,
  });
  await db
    .from('crm_leads')
    .update({ last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', leadId);
}
