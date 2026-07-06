// Simulador de conversa — mesma IA, mesmo prompt, sem WhatsApp
// Nada é gravado no banco: a conversa vive só na tela do simulador
import { requireUser, getConfig } from './_lib/core.js';
import { chatLLM } from './_lib/llm.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const user = await requireUser(req);
  if (!user) return res.status(401).json({ error: 'Não autorizado' });

  const { messages, lead } = req.body || {};
  if (!Array.isArray(messages) || !messages.length) {
    return res.status(400).json({ error: 'Envie a conversa.' });
  }

  const { agentName, systemPrompt, knowledgeBase } = await getConfig();
  const system =
    systemPrompt.replaceAll('{AGENT_NAME}', agentName) +
    '\n\n=== BASE DE CONHECIMENTO ===\n' +
    knowledgeBase +
    `\n\nDados já conhecidos do lead: nome=${lead?.name || '?'}, cidade=${lead?.city || '?'}, interesse=${lead?.procedure_interest || 'Blefaroplastia'}.`;

  const clean = messages
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && m.content)
    .slice(-24);

  const raw = await chatLLM({ system, messages: clean, maxTokens: 700, wantJson: true });
  if (!raw) return res.status(500).json({ error: 'A IA não respondeu — confira a chave e o modelo nas Integrações.' });

  const stripped = raw.replace(/```json|```/g, '').trim();
  try {
    const parsed = JSON.parse(stripped);
    return res.status(200).json({
      reply: parsed.reply || null,
      action: parsed.action || 'none',
      extracted: parsed.extracted || {},
    });
  } catch {
    return res.status(200).json({ reply: stripped, action: 'none', extracted: {} });
  }
}
