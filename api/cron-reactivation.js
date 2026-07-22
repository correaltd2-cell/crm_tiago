// Reativação por inatividade — 2h / 24h / 72h / 15 dias sem resposta.
// Roda com frequência (idealmente de hora em hora) via agendador externo
// gratuito, já que o cron nativo da Vercel no plano Hobby só roda 1x/dia.
// Protegido pelo mesmo CRON_SECRET dos outros crons.
//
// Mensagens FIXAS e leves (não geradas por IA) — apropriado para a área da
// saúde: nada de a IA improvisar sozinha sobre o assunto nessa cadência.
// sendTemplate() já cuida de mandar como template aprovado na API oficial
// ou como texto livre na Z-API — o texto usado é o mesmo dos dois lados
// (ver AUTO_TEXTS em _lib/core.js) e pode virar template Meta sem alterações.
import { db, sendTemplate, saveMessage, AUTO_TEXTS } from './_lib/core.js';

const STEPS = [
  { step: 1, afterMs: 2 * 60 * 60 * 1000, template: 'reactivation_2h', label: '2h' },
  { step: 2, afterMs: 24 * 60 * 60 * 1000, template: 'reactivation_24h', label: '24h' },
  { step: 3, afterMs: 72 * 60 * 60 * 1000, template: 'reactivation_72h', label: '72h' },
  { step: 4, afterMs: 15 * 24 * 60 * 60 * 1000, template: 'reactivation_15d', label: '15 dias' },
];

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Não autorizado' });
  }

  // Candidatos: em atendimento pela IA, silenciosos desde a nossa última mensagem,
  // e que ainda não passaram pelo último passo (4).
  const { data: leads } = await db
    .from('crm_leads')
    .select('*')
    .in('stage_id', ['novo_lead', 'em_atendimento'])
    .eq('ai_enabled', true)
    .lt('reactivation_step', 4)
    .not('last_outbound_at', 'is', null);

  const now = Date.now();
  let sent = 0;

  for (const lead of leads || []) {
    // só reativa quem realmente ficou em silêncio: nossa última msg é mais
    // recente que a última mensagem do paciente (ele não respondeu depois)
    const lastOut = new Date(lead.last_outbound_at).getTime();
    const lastIn = lead.last_inbound_at ? new Date(lead.last_inbound_at).getTime() : 0;
    if (lastIn >= lastOut) continue;

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
