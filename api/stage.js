// Movimentação de etapa no Kanban — com os efeitos automáticos:
// - Qualificado  → avisa a secretária do hospital (template) + confirma com o paciente
// - Follow-up    → agenda a cadência D+2 / D+7 / D+15 / D+30
// - Perdido      → registra motivo de perda e cancela follow-ups pendentes
// - Fechado      → cancela follow-ups pendentes
import { db, sendTemplate, requireUser } from './_lib/core.js';
import { qualifyLead } from './_lib/actions.js';

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
    // ---------- QUALIFICADO: mesma rotina usada pela IA ----------
    if (toStage === 'qualificado') {
      const ns = await qualifyLead(lead, user.email || 'human');
      ns.forEach((n) => notices.push(n));
      return res.status(200).json({ ok: true, notices });
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

