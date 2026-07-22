// Movimentação de etapa no Kanban — com os efeitos automáticos:
// - Qualificado → avisa a secretária do hospital (template) + confirma com o paciente
// - Follow-up   → zera o relógio de reativação (a cadência 2h/2d/15d roda sozinha)
// - Fechado/Perdido → registra motivo e desliga a IA
import { db, requireUser } from './_lib/core.js';
import { qualifyLead } from './_lib/actions.js';

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

    // ---------- FOLLOW-UP: zera o relógio — a reativação (2h/2d/15d) roda sozinha ----------
    if (toStage === 'followup') {
      updates.reactivation_step = 0;
      notices.push('Reativação automática ativa (2h, 2 dias e 15 dias).');
    }

    // ---------- FECHADO ou PERDIDO ----------
    if (toStage === 'fechado' || toStage === 'perdido') {
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
