// Envio de mensagem pelo humano — respeita a janela de 24h quando o
// provedor ativo é a API oficial (na Z-API a janela não existe)
import { db, sendText, sendTemplate, insideWindow, requireUser, saveMessage } from './_lib/core.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const user = await requireUser(req);
  if (!user) return res.status(401).json({ error: 'Não autorizado' });

  const { leadId, body, useReopenTemplate } = req.body || {};
  if (!leadId) return res.status(400).json({ error: 'leadId obrigatório' });

  const { data: lead } = await db.from('crm_leads').select('*').eq('id', leadId).single();
  if (!lead) return res.status(404).json({ error: 'Lead não encontrado' });

  try {
    if (useReopenTemplate) {
      const firstName = (lead.name || 'Olá').split(' ')[0];
      await sendTemplate(lead.wa_id, 'retomada_atendimento', [firstName]);
      await saveMessage(lead.id, { direction: 'out', sender: 'human', body: '[Automática] Mensagem de retomada enviada' });
      return res.status(200).json({ ok: true });
    }

    if (!body) return res.status(400).json({ error: 'Mensagem vazia' });

    if (!(await insideWindow(lead.last_inbound_at))) {
      return res.status(409).json({
        error: 'window_closed',
        message: 'A janela de 24h fechou (API oficial). Envie o template de retomada — quando o paciente responder, a conversa reabre.',
      });
    }

    const sent = await sendText(lead.wa_id, body);
    await saveMessage(lead.id, { direction: 'out', sender: 'human', body, waMessageId: sent?.messageId || sent?.messages?.[0]?.id || null });
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('send error:', err);
    return res.status(500).json({ error: err.message });
  }
}
