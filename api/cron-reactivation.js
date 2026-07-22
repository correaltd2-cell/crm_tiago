// Reativação por inatividade — 2h / 24h / 72h / 15 dias sem resposta.
// Roda com frequência (idealmente de hora em hora) via agendador externo
// gratuito, já que o cron nativo da Vercel no plano Hobby só roda 1x/dia.
// Protegido pelo mesmo CRON_SECRET dos outros crons.
//
// API oficial (Meta): fora da janela de 24h, mensagem só pode ser um
// TEMPLATE APROVADO (texto fixo) — nunca texto livre gerado pela IA.
// Na Z-API não existe essa restrição, então lá o texto da IA é sempre usado.
import { db, sendText, sendTemplate, saveMessage, canSendFreeText } from './_lib/core.js';
import { generateFollowUp } from './_lib/agent.js';

const STEPS = [
  { step: 1, afterMs: 2 * 60 * 60 * 1000, template: 'reactivation_2h', promptKey: 'reactivation_2h_prompt', label: '2h' },
  { step: 2, afterMs: 24 * 60 * 60 * 1000, template: 'reactivation_24h', promptKey: 'reactivation_24h_prompt', label: '24h' },
  { step: 3, afterMs: 72 * 60 * 60 * 1000, template: 'reactivation_72h', promptKey: 'reactivation_72h_prompt', label: '72h' },
  { step: 4, afterMs: 15 * 24 * 60 * 60 * 1000, template: 'reactivation_15d', promptKey: 'reactivation_15d_prompt', label: '15 dias' },
];

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Não autorizado' });
  }

  const { data: settingsRows } = await db.from('crm_settings').select('key,value');
  const settings = Object.fromEntries((settingsRows || []).map((r) => [r.key, r.value]));

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
      const freeTextOk = await canSendFreeText(lead);
      let text = null;
      if (freeTextOk) {
        const instruction = settings[nextStep.promptKey] || '';
        text = await generateFollowUp(lead, instruction);
      }

      if (!text) {
        // Fora da janela (API oficial) ou IA indisponível: template fixo aprovado
        const firstName = (lead.name || 'Olá').split(' ')[0];
        await sendTemplate(lead.wa_id, nextStep.template, [firstName]);
      } else {
        await sendText(lead.wa_id, text);
      }

      await db.from('crm_leads').update({ reactivation_step: nextStep.step }).eq('id', lead.id);
      await saveMessage(lead.id, {
        direction: 'out',
        sender: 'ai',
        body: text || `[Reativação ${nextStep.label}] mensagem padrão enviada`,
      });
      await saveMessage(lead.id, {
        direction: 'out',
        sender: 'system',
        body: `[Reativação por inatividade — ${nextStep.label}]`,
      });
      sent++;
    } catch (err) {
      console.error(`reativação lead ${lead.id} falhou:`, err.message);
    }
  }

  return res.status(200).json({ ok: true, sent });
}
