// Agente de IA do atendimento — Google Gemini
// (responde como padrão até o humano assumir)
import { db, getConfig } from './core.js';

export async function runAgent(lead) {
  const { agentName, systemPrompt, knowledgeBase, geminiKey, geminiModel } = await getConfig();
  if (!geminiKey) {
    console.error('Gemini não configurado — preencha a chave na aba Integrações.');
    return null;
  }

  // Últimas 24 mensagens da conversa como contexto
  const { data: history } = await db
    .from('crm_messages')
    .select('direction,sender,body')
    .eq('lead_id', lead.id)
    .order('created_at', { ascending: false })
    .limit(24);

  const contents = (history || [])
    .reverse()
    .filter((m) => m.sender !== 'system')
    .map((m) => ({
      role: m.direction === 'in' ? 'user' : 'model',
      parts: [{ text: m.body }],
    }));

  // O histórico precisa começar com o paciente (role user)
  while (contents.length && contents[0].role !== 'user') contents.shift();
  if (!contents.length) return null;

  const system =
    systemPrompt.replaceAll('{AGENT_NAME}', agentName) +
    '\n\n=== BASE DE CONHECIMENTO ===\n' +
    knowledgeBase +
    `\n\nDados já conhecidos do lead: nome=${lead.name || '?'}, cidade=${lead.city || '?'}, interesse=${lead.procedure_interest || '?'}.`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiKey}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: system }] },
        contents,
        generationConfig: {
          maxOutputTokens: 800,
          temperature: 0.7,
          responseMimeType: 'application/json',
        },
      }),
    }
  );

  const data = await res.json();
  if (!res.ok) {
    console.error('Gemini API error:', JSON.stringify(data));
    return null;
  }

  const raw = (data?.candidates?.[0]?.content?.parts || [])
    .map((p) => p.text || '')
    .join('\n')
    .replace(/```json|```/g, '')
    .trim();

  try {
    const parsed = JSON.parse(raw);
    return {
      reply: parsed.reply || null,
      action: parsed.action || 'none',
      extracted: parsed.extracted || {},
    };
  } catch {
    // Se o modelo fugir do JSON, usa o texto puro como resposta
    return { reply: raw || null, action: 'none', extracted: {} };
  }
}


// Gera um follow-up personalizado: lê a conversa e segue a instrução da etapa.
// Retorna o texto da mensagem, ou null (aí o cron usa o texto fixo de fallback).
export async function generateFollowUp(lead, stageInstruction) {
  const { agentName, systemPrompt, knowledgeBase, geminiKey, geminiModel } = await getConfig();
  if (!geminiKey || !stageInstruction) return null;

  const { data: history } = await db
    .from('crm_messages')
    .select('direction,sender,body')
    .eq('lead_id', lead.id)
    .order('created_at', { ascending: false })
    .limit(20);

  const convo = (history || [])
    .reverse()
    .filter((m) => m.sender !== 'system')
    .map((m) => `${m.direction === 'in' ? 'PACIENTE' : agentName.toUpperCase()}: ${m.body}`)
    .join('\n');

  const system =
    systemPrompt.replaceAll('{AGENT_NAME}', agentName) +
    '\n\n=== BASE DE CONHECIMENTO ===\n' + knowledgeBase +
    `\n\n=== TAREFA ESPECIAL: FOLLOW-UP ===
Você vai escrever UMA única mensagem de follow-up de WhatsApp para retomar o contato com este paciente, que parou de responder.

INSTRUÇÃO DESTA ETAPA DO FOLLOW-UP:
${stageInstruction}

REGRAS DA MENSAGEM:
- 2 a 4 frases, tom de WhatsApp, humana e calorosa — nunca robótica ou de mala direta.
- Use o primeiro nome do paciente e, se houver, cite com naturalidade algo da conversa (a queixa, a cidade).
- NUNCA mencione preço nem prometa resultado.
- Responda APENAS com o texto puro da mensagem, sem JSON, sem aspas, sem comentários.`;

  const userMsg = `Dados do paciente: nome=${lead.name || '?'}, cidade=${lead.city || '?'}, interesse=${lead.procedure_interest || 'Blefaroplastia'}.\n\nConversa até agora:\n${convo || '(sem histórico de conversa)'}`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiKey}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: userMsg }] }],
        generationConfig: { maxOutputTokens: 400, temperature: 0.8 },
      }),
    }
  );
  const data = await res.json();
  if (!res.ok) { console.error('Gemini followup error:', JSON.stringify(data)); return null; }
  const text = (data?.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join(' ').trim();
  return text || null;
}
