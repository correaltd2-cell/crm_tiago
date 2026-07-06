// Agente de IA do atendimento — usa o provedor escolhido nas Integrações
import { db, getConfig } from './core.js';
import { chatLLM } from './llm.js';

export async function runAgent(lead) {
  const { agentName, systemPrompt, knowledgeBase } = await getConfig();

  const { data: history } = await db
    .from('crm_messages')
    .select('direction,sender,body')
    .eq('lead_id', lead.id)
    .order('created_at', { ascending: false })
    .limit(24);

  const messages = (history || [])
    .reverse()
    .filter((m) => m.sender !== 'system')
    .map((m) => ({
      role: m.direction === 'in' ? 'user' : 'assistant',
      content: m.body,
    }));

  while (messages.length && messages[0].role !== 'user') messages.shift();
  if (!messages.length) return null;

  const system =
    systemPrompt.replaceAll('{AGENT_NAME}', agentName) +
    '\n\n=== BASE DE CONHECIMENTO ===\n' +
    knowledgeBase +
    `\n\nDados já conhecidos do lead: nome=${lead.name || '?'}, cidade=${lead.city || '?'}, interesse=${lead.procedure_interest || '?'}.`;

  const raw = await chatLLM({ system, messages, maxTokens: 700, wantJson: true });
  if (!raw) return null;

  const clean = raw.replace(/```json|```/g, '').trim();
  try {
    const parsed = JSON.parse(clean);
    return {
      reply: parsed.reply || null,
      action: parsed.action || 'none',
      extracted: parsed.extracted || {},
    };
  } catch {
    return { reply: clean || null, action: 'none', extracted: {} };
  }
}

// Follow-up personalizado: lê a conversa e segue a instrução da etapa
export async function generateFollowUp(lead, stageInstruction) {
  const { agentName, systemPrompt, knowledgeBase } = await getConfig();
  if (!stageInstruction) return null;

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

  return chatLLM({ system, messages: [{ role: 'user', content: userMsg }], maxTokens: 400 });
}
