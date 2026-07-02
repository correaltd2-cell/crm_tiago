// Movimentação de etapa no Kanban — com os efeitos automáticos:
// - Qualificado  → avisa a secretária do hospital (template) + confirma com o paciente
// - Follow-up    → agenda a cadência D+2 / D+7 / D+15 / D+30
// - Perdido      → registra motivo de perda e cancela follow-ups pendentes
// - Fechado      → cancela follow-ups pendentes
import { db, sendText, sendTemplate, insideWindow, requireUser, saveMessage, getConfig } from './_lib/core.js';

const FOLLOWUP_PLAN = [
  { days: 2, template: 'followup_d2', label: 'D+2' },
  { days: 7, template: 'followup_d7', label: 'D+7' },
  { days: 15, template: 'followup_d15', label: 'D+15' },
  { days: 30, template: 'followup_d30', label: 'D+30' },
];

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const user = await requireUser(req);
  if (!user) return res.status(401).json({ error: 'Não autorizado' });

  const { leadId, toStage, lossReason } = req.body || {};
  if (!leadId || !toStage) return res.status(400).json({ error: 'leadId e toStage obrigatórios' });

  const { data: lead } = await db.from('crm_leads').select('*').eq('id', leadId).single();
  if (!lead) return res.status(404).json({ error: 'Lead não encontrado' });
  if (lead.stage_id === toStage) return res.status(200).json({ ok: true });

  const updates = { stage_id: toStage, updated_at: new Date().toISOString() };
  const notices = [];

  try {
    // ---------- QUALIFICADO: encaminha p/ secretária do hospital ----------
    if (toStage === 'qualificado') {
      const firstName = (lead.name || 'Paciente').split(' ')[0];
      const phonePretty = formatPhone(lead.wa_id);
      const resumo = [
        lead.procedure_interest || 'Blefaroplastia',
        lead.city ? `de ${lead.city}` : null,
        lead.source ? `origem: ${lead.source}` : null,
      ]
        .filter(Boolean)
        .join(' · ');

      // 1) Template p/ a secretária (conversa iniciada pela empresa → precisa de template)
      const cfg = await getConfig();
      if (cfg.secretaryPhone) {
        await sendTemplate(cfg.secretaryPhone, 'aviso_secretaria', [
          lead.name || 'Paciente sem nome',
          phonePretty,
          resumo,
        ]);
        updates.secretary_notified_at = new Date().toISOString();
        notices.push('Secretária avisada no WhatsApp do hospital.');
        await saveMessage(lead.id, {
          direction: 'out',
          sender: 'system',
          body: `[Sistema] Lead encaminhado à secretária do hospital (${phonePretty}).`,
        });
      }

      // 2) Confirmação para o paciente (texto simples se a janela estiver aberta)
      if (insideWindow(lead.last_inbound_at)) {
        const msg = `Perfeito, ${firstName}! 😊 Já encaminhei seus dados para a secretária do hospital — ela vai entrar em contato com você por WhatsApp para confirmar a data e o horário da sua consulta de avaliação com o Dr. Tiago.`;
        await sendText(lead.wa_id, msg);
        await saveMessage(lead.id, { direction: 'out', sender: 'ai', body: msg });
      }

      updates.qualify_ready = false;
    }

    // ---------- FOLLOW-UP: agenda a cadência ----------
    if (toStage === 'followup') {
      const rows = FOLLOWUP_PLAN.map((f) => ({
        lead_id: lead.id,
        due_at: new Date(Date.now() + f.days * 24 * 60 * 60 * 1000).toISOString(),
        template: f.template,
        label: f.label,
      }));
      await db.from('crm_follow_ups').insert(rows);
      notices.push('Cadência de follow-up agendada (D+2, D+7, D+15, D+30).');
    }

    // ---------- FECHADO ou PERDIDO: encerra follow-ups pendentes ----------
    if (toStage === 'fechado' || toStage === 'perdido') {
      await db
        .from('crm_follow_ups')
        .update({ status: 'canceled' })
        .eq('lead_id', lead.id)
        .eq('status', 'pending');
      if (toStage === 'perdido') updates.loss_reason = lossReason || 'Não informado';
      updates.ai_enabled = false;
    }

    await db.from('crm_leads').update(updates).eq('id', lead.id);
    await db.from('crm_stage_events').insert({
      lead_id: lead.id,
      from_stage: lead.stage_id,
      to_stage: toStage,
      actor: user.email || 'human',
    });

    return res.status(200).json({ ok: true, notices });
  } catch (err) {
    console.error('stage error:', err);
    return res.status(500).json({ error: err.message });
  }
}

function formatPhone(waId) {
  // 5549999999999 → +55 (49) 99999-9999 (aproximação amigável)
  const m = String(waId).match(/^55(\d{2})(\d{4,5})(\d{4})$/);
  return m ? `+55 (${m[1]}) ${m[2]}-${m[3]}` : `+${waId}`;
}
