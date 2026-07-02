// Envio de mensagem pelo humano a partir do painel
// Respeita a janela de 24h da API oficial: fora dela, oferece o template de retomada
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
    if (insideWindow(lead.last_inbound_at)) {
      if (!body) return res.status(400).json({ error: 'Mensagem vazia' });
      const sent = await sendText(lead.wa_id, body);
      await saveMessage(lead.id, {
        direction: 'out',
        sender: 'human',
        body,
        waMessageId: sent?.messages?.[0]?.id || null,
      });
      return res.status(200).json({ ok: true });
    }

    // Fora da janela de 24h → só template aprovado
    if (useReopenTemplate) {
      const firstName = (lead.name || 'Olá').split(' ')[0];
      const sent = await sendTemplate(lead.wa_id, 'retomada_atendimento', [firstName]);
      await saveMessage(lead.id, {
        direction: 'out',
        sender: 'human',
        body: '[Template] Retomada de atendimento enviada',
        waMessageId: sent?.messages?.[0]?.id || null,
      });
      return res.status(200).json({ ok: true, template: true });
    }

    return res.status(409).json({
      error: 'window_closed',
      message:
        'A janela de 24h fechou. Envie o template de retomada — quando o paciente responder, a conversa reabre.',
    });
  } catch (err) {
    console.error('send error:', err);
    return res.status(500).json({ error: err.message });
  }
}
