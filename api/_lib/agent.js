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
