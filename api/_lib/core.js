// Helpers compartilhados — Supabase (service role), WhatsApp (Z-API OU API oficial Meta) e autenticação
// Credenciais e o provedor escolhido vêm da tabela crm_settings (aba Integrações do CRM)
import { createClient } from '@supabase/supabase-js';

export const db = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

// ---- Configuração dinâmica (settings do banco) ----------------------------
let _cfgCache = null;
let _cfgAt = 0;

export async function getConfig() {
  if (_cfgCache && Date.now() - _cfgAt < 30000) return _cfgCache;
  const { data } = await db.from('crm_settings').select('key,value');
  const map = Object.fromEntries((data || []).map((r) => [r.key, r.value]));
  _cfgCache = {
    waProvider: map.wa_provider || 'zapi', // 'zapi' | 'meta'
    // Z-API
    zapiInstance: map.zapi_instance_id || '',
    zapiToken: map.zapi_token || '',
    zapiClientToken: map.zapi_client_token || '',
    // Meta Cloud API (oficial)
    metaToken: map.meta_token || '',
    metaPhoneNumberId: map.meta_phone_number_id || '',
    metaVerifyToken: map.meta_verify_token || '',
    metaWabaId: map.meta_waba_id || '',
    // comuns
    secretaryPhone: map.secretary_phone || '',
    reportPhone: map.report_phone || '',
    signupCode: map.signup_code || '',
    aiProvider: map.ai_provider || 'gemini',
    aiKey: map.ai_api_key || map.gemini_api_key || '',
    aiModel: map.ai_model || map.gemini_model || '',
    agentName: map.agent_name || 'Maia',
    systemPrompt: map.system_prompt || '',
    knowledgeBase: map.knowledge_base || '',
  };
  _cfgAt = Date.now();
  return _cfgCache;
}

// ---- Z-API -----------------------------------------------------------------
async function zapiPost(path, payload) {
  const cfg = await getConfig();
  if (!cfg.zapiInstance || !cfg.zapiToken) {
    throw new Error('Z-API não configurada — preencha Instance ID e Token na aba Integrações.');
  }
  const res = await fetch(
    `https://api.z-api.io/instances/${cfg.zapiInstance}/token/${cfg.zapiToken}/${path}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(cfg.zapiClientToken ? { 'Client-Token': cfg.zapiClientToken } : {}),
      },
      body: JSON.stringify(payload),
    }
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error('Z-API error:', res.status, JSON.stringify(data));
    throw new Error(data?.error || data?.message || `Falha Z-API (${res.status})`);
  }
  return data;
}

// ---- Meta Cloud API (oficial) ----------------------------------------------
const GRAPH = 'https://graph.facebook.com/v21.0';

async function metaPost(payload) {
  const cfg = await getConfig();
  if (!cfg.metaToken || !cfg.metaPhoneNumberId) {
    throw new Error('API oficial não configurada — preencha o Token e o Phone Number ID na aba Integrações.');
  }
  const res = await fetch(`${GRAPH}/${cfg.metaPhoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.metaToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error('Meta API error:', JSON.stringify(data));
    throw new Error(data?.error?.message || 'Falha ao enviar mensagem via Meta');
  }
  return data;
}

// Textos das mensagens automáticas (usados como texto livre na Z-API,
// e como template aprovado na API oficial). {{1}}, {{2}}, {{3}} = variáveis.
// Cadência única de reativação por inatividade: 2h → 2 dias → 15 dias (fim).
export const AUTO_TEXTS = {
  aviso_secretaria:
    'Novo paciente qualificado para consulta ✨\n\nNome: {{1}}\nWhatsApp: {{2}}\nResumo: {{3}}\n\nPor favor, entre em contato para confirmar o agendamento da avaliação.',
  retomada_atendimento:
    'Olá, {{1}}! Vi que conversamos sobre a sua avaliação e queria saber se posso te ajudar a dar o próximo passo. Posso continuar por aqui?',
  reactivation_2h:
    'Oi, {{1}}! Tudo bem? Ficou alguma dúvida específica que gostaria de saber?',
  reactivation_2d:
    'Oi, {{1}}! Continuo por aqui à disposição para conversar sobre a blefaroplastia, viu?',
  reactivation_15d:
    'Oi, {{1}}! Vou encerrar o atendimento por aqui, mas fico à disposição para qualquer dúvida no futuro. Foi um prazer falar com você!',
};

// Nomes de template esperados na Meta — precisam existir e estar APROVADOS
// no WhatsApp Manager com esses nomes exatos (ver templates-meta.md).
const META_TEMPLATE_NAMES = {
  aviso_secretaria: 'aviso_secretaria',
  retomada_atendimento: 'retomada_atendimento',
  reactivation_2h: 'reactivation_2h',
  reactivation_2d: 'reactivation_2d',
  reactivation_15d: 'reactivation_15d',
};

// ---- API pública unificada (o resto do código nunca sabe qual provedor está ativo) ----

export async function sendText(to, body) {
  const cfg = await getConfig();
  if (cfg.waProvider === 'meta') {
    return metaPost({ messaging_product: 'whatsapp', to, type: 'text', text: { body, preview_url: false } });
  }
  return zapiPost('send-text', { phone: String(to), message: body });
}

// "Mensagem automática" — na Z-API sai como texto livre; na oficial, como
// TEMPLATE aprovado (obrigatório para iniciar conversa fora da janela de 24h).
export async function sendTemplate(to, templateName, params = [], lang = 'pt_BR') {
  const cfg = await getConfig();
  if (cfg.waProvider === 'meta') {
    const name = META_TEMPLATE_NAMES[templateName] || templateName;
    const components = params.length
      ? [{ type: 'body', parameters: params.map((t) => ({ type: 'text', text: String(t) })) }]
      : [];
    return metaPost({
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: { name, language: { code: lang }, components },
    });
  }
  let text = AUTO_TEXTS[templateName];
  if (!text) throw new Error(`Mensagem automática desconhecida: ${templateName}`);
  params.forEach((p, i) => { text = text.replaceAll(`{{${i + 1}}}`, String(p)); });
  return zapiPost('send-text', { phone: String(to), message: text });
}

// Janela de 24h: só existe na API oficial. Na Z-API não há essa restrição.
export async function insideWindow(lastInboundAt) {
  const cfg = await getConfig();
  if (cfg.waProvider !== 'meta') return true;
  if (!lastInboundAt) return false;
  return Date.now() - new Date(lastInboundAt).getTime() < 24 * 60 * 60 * 1000;
}

// Pode mandar texto livre (gerado pela IA) para este lead agora?
// Z-API: sempre sim. API oficial: só dentro da janela de 24h — fora dela,
// o Meta EXIGE um template aprovado (texto fixo, sem personalização por IA).
export async function canSendFreeText(lead) {
  return insideWindow(lead.last_inbound_at);
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
  const updates = { last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  if (direction === 'out' && sender !== 'system') {
    updates.last_outbound_at = new Date().toISOString();
  }
  if (direction === 'in') {
    updates.reactivation_step = 0; // paciente respondeu — zera o relógio de reativação
  }
  await db.from('crm_leads').update(updates).eq('id', leadId);
}
