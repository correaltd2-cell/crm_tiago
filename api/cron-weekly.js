// Relatório semanal via WhatsApp — roda toda segunda às 8h (Brasília)
// Envia para o número configurado em Config IA → Integrações (WhatsApp do relatório)
import { db, sendText, getConfig } from './_lib/core.js';

const STAGE_LABEL = {
  novo_lead: 'Novo Lead', em_atendimento: 'Em Atendimento (IA)', qualificado: 'Qualificado',
  consulta_agendada: 'Consulta Agendada', consulta_realizada: 'Consulta Realizada',
  orcamento_apresentado: 'Orçamento Apresentado', followup: 'Follow-up',
  fechado: 'Cirurgia Fechada ✅', perdido: 'Perdido ❌',
};

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Não autorizado' });
  }

  const cfg = await getConfig();
  if (!cfg.reportPhone) return res.status(200).json({ ok: false, motivo: 'report_phone não configurado' });

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [{ data: leads }, { data: events }] = await Promise.all([
    db.from('crm_leads').select('*'),
    db.from('crm_stage_events').select('lead_id,to_stage,created_at,actor').gte('created_at', since),
  ]);

  const byId = Object.fromEntries((leads || []).map((l) => [l.id, l]));
  const novos = (leads || []).filter((l) => l.created_at >= since);
  const ev = events || [];
  const count = (st) => ev.filter((e) => e.to_stage === st).length;

  const fmt = (d) => new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  const hoje = new Date();
  const inicio = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // Motivos de perda da semana
  const lostIds = [...new Set(ev.filter((e) => e.to_stage === 'perdido').map((e) => e.lead_id))];
  const reasons = {};
  lostIds.forEach((id) => {
    const r = byId[id]?.loss_reason || 'Não informado';
    reasons[r] = (reasons[r] || 0) + 1;
  });
  const reasonsTxt = Object.entries(reasons).map(([r, n]) => `${r}: ${n}`).join(', ');

  const lines = [];
  lines.push('📊 *Resumo semanal — Dr. Tiago*');
  lines.push(`Semana de ${fmt(inicio)} a ${fmt(hoje)}`);
  lines.push('');
  lines.push(`📥 Novos leads: *${novos.length}*`);
  lines.push(`✨ Qualificados: *${count('qualificado')}*`);
  lines.push(`📅 Consultas agendadas: *${count('consulta_agendada')}*`);
  lines.push(`🩺 Consultas realizadas: *${count('consulta_realizada')}*`);
  lines.push(`✅ Cirurgias fechadas: *${count('fechado')}*`);
  lines.push(`❌ Perdidos: *${count('perdido')}*${reasonsTxt ? ` (${reasonsTxt})` : ''}`);

  if (novos.length) {
    lines.push('');
    lines.push('*Novos leads da semana e situação atual:*');
    novos
      .sort((a, b) => (a.created_at < b.created_at ? -1 : 1))
      .slice(0, 25)
      .forEach((l) => {
        lines.push(`• ${l.name || 'Sem nome'} — ${STAGE_LABEL[l.stage_id] || l.stage_id}${l.source ? ` _(${l.source})_` : ''}`);
      });
    if (novos.length > 25) lines.push(`…e mais ${novos.length - 25} leads.`);
  }

  // Movimentações de leads antigos (que não são novos desta semana)
  const novosIds = new Set(novos.map((l) => l.id));
  const moved = {};
  ev.filter((e) => !novosIds.has(e.lead_id) && !['novo_lead', 'em_atendimento'].includes(e.to_stage))
    .forEach((e) => { moved[e.lead_id] = e.to_stage; }); // última movimentação relevante
  const movedRows = Object.entries(moved).slice(0, 20);
  if (movedRows.length) {
    lines.push('');
    lines.push('*Andamento de leads anteriores:*');
    movedRows.forEach(([id, st]) => {
      const l = byId[id];
      if (l) lines.push(`• ${l.name || 'Sem nome'} → ${STAGE_LABEL[st] || st}`);
    });
  }

  // Lembrete de gestão: cards parados nas etapas manuais há mais de 7 dias
  const manualStages = ['qualificado', 'consulta_agendada', 'consulta_realizada', 'orcamento_apresentado'];
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const stuck = (leads || []).filter((l) => manualStages.includes(l.stage_id) && (l.updated_at || l.created_at) < cutoff);
  if (stuck.length) {
    lines.push('');
    lines.push(`📌 *Lembrete:* ${stuck.length} paciente${stuck.length > 1 ? 's' : ''} sem movimentação há mais de 7 dias — vale conferir com a secretária e atualizar o funil:`);
    stuck.slice(0, 12).forEach((l) => {
      lines.push(`• ${l.name || 'Sem nome'} — parado em ${STAGE_LABEL[l.stage_id] || l.stage_id}`);
    });
    if (stuck.length > 12) lines.push(`…e mais ${stuck.length - 12}.`);
  }

  lines.push('');
  lines.push('_Relatório automático do CRM · crm-tiago.vercel.app_');

  await sendText(cfg.reportPhone, lines.join('\n'));
  return res.status(200).json({ ok: true, novos: novos.length });
}
