// Helpers compartilhados — Supabase (service role), Z-API e autenticação
// Credenciais vêm da tabela crm_settings (aba Integrações do CRM)
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
    zapiInstance: map.zapi_instance_id || '',
    zapiToken: map.zapi_token || '',
    zapiClientToken: map.zapi_client_token || '',
    secretaryPhone: map.secretary_phone || '',
    reportPhone: map.report_phone || '',
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

export function sendText(to, body) {
  return zapiPost('send-text', { phone: String(to), message: body });
}

// Textos das mensagens automáticas (sem burocracia de template na Z-API).
// {{1}}, {{2}}, {{3}} são substituídos pelos parâmetros.
const AUTO_TEXTS = {
  aviso_secretaria:
    'Novo paciente qualificado para consulta com o Dr. Tiago 👁️\n\nNome: {{1}}\nWhatsApp: {{2}}\nResumo: {{3}}\n\nPor favor, entre em contato para confirmar o agendamento da avaliação.',
  retomada_atendimento:
    'Olá, {{1}}! Aqui é do consultório do Dr. Tiago Franco Martins. Vi que conversamos sobre a sua avaliação e queria saber se posso te ajudar a dar o próximo passo. Posso continuar por aqui?',
  followup_d2:
    'Oi, {{1}}! Aqui é do consultório do Dr. Tiago. Passando para saber se ficou alguma dúvida sobre a sua avaliação ou sobre o procedimento. Estou à disposição para te ajudar. 😊',
  followup_d7:
    'Olá, {{1}}! Muitas pacientes do Dr. Tiago contam que o que mais mudou depois da blefaroplastia foi se olhar no espelho e ver um olhar descansado de novo. Se quiser, posso te ajudar a organizar a sua avaliação. Faz sentido para você?',
  followup_d15:
    'Oi, {{1}}! A agenda de avaliações do Dr. Tiago para as próximas semanas está sendo organizada. Se ainda fizer sentido para você, consigo verificar um horário. Posso pedir para a secretária te enviar as opções?',
  followup_d30:
    'Olá, {{1}}! Este é meu último contato por aqui para não te incomodar. 😊 Se em algum momento você quiser retomar a conversa sobre a sua avaliação com o Dr. Tiago, é só me chamar nesta conversa. Será um prazer te atender!',
};

// Mantém a assinatura antiga (compatível com o resto do código):
// envia o texto correspondente ao "template" com as variáveis preenchidas
export function sendTemplate(to, templateName, params = []) {
  let text = AUTO_TEXTS[templateName];
  if (!text) throw new Error(`Mensagem automática desconhecida: ${templateName}`);
  params.forEach((p, i) => { text = text.replaceAll(`{{${i + 1}}}`, String(p)); });
  return sendText(to, text);
}

// ---- Janela de 24h: não existe na Z-API ------------------------------------
export function insideWindow() {
  return true;
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
