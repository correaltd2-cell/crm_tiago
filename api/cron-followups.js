// Cron diário (10h Brasília) — follow-ups da etapa "Follow-up" (D+2/7/15/30)
// A instrução de cada etapa é editável no CRM (Config IA → Follow-ups).
//
// IMPORTANTE (API oficial / Meta): mensagem fora da janela de 24h só pode
// ser um TEMPLATE APROVADO, com texto fixo — não dá pra mandar o texto livre
// gerado pela IA. Como a Z-API não tem essa restrição, lá o texto livre da
// IA é sempre usado (é o que dá o toque personalizado). Na API oficial,
// só usamos o texto livre da IA se, por acaso, a janela ainda estiver aberta;
// fora dela, vai direto de template — sem gastar chamada de IA à toa.
import { db, sendText, sendTemplate, saveMessage, canSendFreeText } from './_lib/core.js';
import { generateFollowUp } from './_lib/agent.js';

const PROMPT_KEYS = {
  followup_d2: 'followup_d2_prompt',
  followup_d7: 'followup_d7_prompt',
  followup_d15: 'followup_d15_prompt',
  followup_d30: 'followup_d30_prompt',
};

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Não autorizado' });
  }

  const { data: settingsRows } = await db.from('crm_settings').select('key,value');
  const settings = Object.fromEntries((settingsRows || []).map((r) => [r.key, r.value]));

  const { data: due } = await db
    .from('crm_follow_ups')
    .select('*, crm_leads(*)')
    .eq('status', 'pending')
    .lte('due_at', new Date().toISOString())
    .limit(50);

  let sent = 0;
  for (const fu of due || []) {
    const lead = fu.crm_leads;
    if (!lead || lead.stage_id !== 'followup') {
      await db.from('crm_follow_ups').update({ status: 'canceled' }).eq('id', fu.id);
      continue;
    }
    try {
      const freeTextOk = await canSendFreeText(lead);
      let text = null;
      if (freeTextOk) {
        const instruction = settings[PROMPT_KEYS[fu.template]] || '';
        text = await generateFollowUp(lead, instruction);
      }

      if (!text) {
        // Fora da janela (oficial) ou IA indisponível: template fixo aprovado
        const firstName = (lead.name || 'Olá').split(' ')[0];
        await sendTemplate(lead.wa_id, fu.template, [firstName]);
      } else {
        await sendText(lead.wa_id, text);
      }

      await db.from('crm_follow_ups').update({ status: 'sent' }).eq('id', fu.id);
      await saveMessage(lead.id, {
        direction: 'out',
        sender: 'ai',
        body: text || `[Follow-up ${fu.label}] mensagem padrão enviada`,
      });
      if (text) {
        await saveMessage(lead.id, {
          direction: 'out',
          sender: 'system',
          body: `[Follow-up ${fu.label} — personalizado pela IA]`,
        });
      }
      sent++;
    } catch (err) {
      console.error(`followup ${fu.id} falhou:`, err.message);
      await db.from('crm_follow_ups').update({ status: 'failed' }).eq('id', fu.id);
    }
  }

  return res.status(200).json({ ok: true, sent });
}
