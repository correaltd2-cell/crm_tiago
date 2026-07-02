// Ações de etapa reutilizáveis — usadas tanto pelo humano (stage.js)
// quanto pela IA (webhook.js) quando ela qualifica sozinha
import { db, sendText, sendTemplate, insideWindow, getConfig, saveMessage } from './core.js';

export function formatPhone(waId) {
  const m = String(waId).match(/^55(\d{2})(\d{4,5})(\d{4})$/);
  return m ? `+55 (${m[1]}) ${m[2]}-${m[3]}` : `+${waId}`;
}

// Move o lead para Qualificado + avisa a secretária + (opcional) confirma com o paciente
export async function qualifyLead(lead, actor = 'human', { notifyPatient = true } = {}) {
  const cfg = await getConfig();
  const notices = [];
  const updates = {
    stage_id: 'qualificado',
    qualify_ready: false,
    updated_at: new Date().toISOString(),
  };

  const phonePretty = formatPhone(lead.wa_id);
  const resumo = [
    lead.procedure_interest || 'Blefaroplastia',
    lead.city ? `de ${lead.city}` : null,
    lead.source ? `origem: ${lead.source}` : null,
  ].filter(Boolean).join(' · ');

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
      body: `[Sistema] Lead qualificado ${actor === 'ai' ? 'pela IA' : ''} e encaminhado à secretária do hospital.`,
    });
  }

  if (notifyPatient && insideWindow(lead.last_inbound_at)) {
    const firstName = (lead.name || '').split(' ')[0] || 'Olá';
    const msg = `Perfeito, ${firstName}! 😊 Já encaminhei seus dados para a secretária do hospital — ela vai entrar em contato com você por WhatsApp para confirmar a data e o horário da sua consulta de avaliação com o Dr. Tiago.`;
    await sendText(lead.wa_id, msg);
    await saveMessage(lead.id, { direction: 'out', sender: 'ai', body: msg });
  }

  await db.from('crm_leads').update(updates).eq('id', lead.id);
  await db.from('crm_stage_events').insert({
    lead_id: lead.id,
    from_stage: lead.stage_id,
    to_stage: 'qualificado',
    actor,
  });

  return notices;
}
