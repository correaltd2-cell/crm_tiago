// Reativação por inatividade — cadência ÚNICA: 2h → 2 dias → 15 dias (fim).
// Roda com frequência (idealmente de hora em hora) via agendador externo
// gratuito, já que o cron nativo da Vercel no plano Hobby só roda 1x/dia.
// Protegido pelo mesmo CRON_SECRET dos outros crons.
//
// Cobre leads em Novo Lead, Em Atendimento OU Follow-up — não precisa mais
// arrastar o card manualmente para receber a reativação automática.
//
// Mensagens FIXAS e leves (não geradas por IA) — apropriado para a área da
// saúde. sendTemplate() já cuida de mandar como template aprovado na API
// oficial ou como texto livre na Z-API.
import { db, sendTemplate, saveMessage, AUTO_TEXTS } from './_lib/core.js';

const STEPS = [
  { step: 1, afterMs: 2 * 60 * 60 * 1000, template: 'reactivation_2h', label: '2h' },
  { step: 2, afterMs: 2 * 24 * 60 * 60 * 1000, template: 'reactivation_2d', label: '2 dias' },
  { step: 3, afterMs: 15 * 24 * 60 * 60 * 1000, template: 'reactivation_15d', label: '15 dias' },
];

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Não autorizado' });
  }

  const { data: flagRow } = await db.from('crm_settings').select('value').eq('key', 'reactivation_enabled').single();
  if (flagRow?.value === 'false') {
    return res.status(200).json({ ok: true, sent: 0, motivo: 'reativação desativada em Config IA' });
  }

  const { data: leads } = await db
    .from('crm_leads')
    .select('*')
    .in('stage_id', ['novo_lead', 'em_atendimento', 'followup'])
    .eq('ai_enabled', true)
    .lt('reactivation_step', 3)
    .not('last_outbound_at', 'is', null);

  const now = Date.now();
  let sent = 0;

  for (const lead of leads || []) {
    const lastOut = new Date(lead.last_outbound_at).getTime();
    const lastIn = lead.last_inbound_at ? new Date(lead.last_inbound_at).getTime() : 0;
    if (lastIn >= lastOut) continue; // paciente já respondeu depois da nossa última msg

    const silenceMs = now - lastOut;
    const nextStep = STEPS.find((s) => s.step === lead.reactivation_step + 1);
    if (!nextStep || silenceMs < nextStep.afterMs) continue;

    try {
      const firstName = (lead.name || 'Olá').split(' ')[0];
      await sendTemplate(lead.wa_id, nextStep.template, [firstName]);
      const renderedText = (AUTO_TEXTS[nextStep.template] || '').replaceAll('{{1}}', firstName);

      await db.from('crm_leads').update({ reactivation_step: nextStep.step }).eq('id', lead.id);
      await saveMessage(lead.id, {
        direction: 'out',
        sender: 'ai',
        body: renderedText || `[Reativação ${nextStep.label}] mensagem enviada`,
      });
      sent++;
    } catch (err) {
      console.error(`reativação lead ${lead.id} falhou:`, err.message);
    }
  }

  return res.status(200).json({ ok: true, sent });
}
