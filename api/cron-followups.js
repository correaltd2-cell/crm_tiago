// Cron diário (Vercel Cron) — dispara os follow-ups vencidos via template aprovado
import { db, sendTemplate, saveMessage } from './_lib/core.js';

export default async function handler(req, res) {
  // Proteção do cron (Vercel envia Authorization: Bearer CRON_SECRET)
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Não autorizado' });
  }

  const { data: due } = await db
    .from('crm_follow_ups')
    .select('*, crm_leads(*)')
    .eq('status', 'pending')
    .lte('due_at', new Date().toISOString())
    .limit(50);

  let sent = 0;
  for (const fu of due || []) {
    const lead = fu.crm_leads;
    // Só segue follow-up de quem continua na etapa Follow-up
    if (!lead || lead.stage_id !== 'followup') {
      await db.from('crm_follow_ups').update({ status: 'canceled' }).eq('id', fu.id);
      continue;
    }
    try {
      const firstName = (lead.name || 'Olá').split(' ')[0];
      await sendTemplate(lead.wa_id, fu.template, [firstName]);
      await db.from('crm_follow_ups').update({ status: 'sent' }).eq('id', fu.id);
      await saveMessage(lead.id, {
        direction: 'out',
        sender: 'system',
        body: `[Follow-up ${fu.label}] Template "${fu.template}" enviado`,
      });
      sent++;
    } catch (err) {
      console.error(`followup ${fu.id} falhou:`, err.message);
      await db.from('crm_follow_ups').update({ status: 'failed' }).eq('id', fu.id);
    }
  }

  return res.status(200).json({ ok: true, sent });
}
