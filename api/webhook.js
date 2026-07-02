// Webhook da Z-API — mensagem recebida → cria/atualiza lead, salva e aciona a IA
// Configurar na Z-API: "Ao receber" → https://SEU-PROJETO.vercel.app/api/webhook
import { db, sendText, saveMessage } from './_lib/core.js';
import { runAgent } from './_lib/agent.js';
import { qualifyLead } from './_lib/actions.js';

export default async function handler(req, res) {
  if (req.method === 'GET') return res.status(200).send('ok'); // ping/health
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const b = req.body || {};

    // Ignora: mensagens enviadas por nós, grupos, status e callbacks sem conteúdo
    if (b.fromMe || b.isGroup || b.isStatusReply) return res.status(200).json({ ok: true });

    const waId = String(b.phone || '').replace(/\D/g, '');
    const body = extractBody(b);
    if (!waId || !body) return res.status(200).json({ ok: true });

    const contactName = b.senderName || b.chatName || b.pushName || null;

    // ---- Localiza ou cria o lead ----
    let { data: lead } = await db.from('crm_leads').select('*').eq('wa_id', waId).single();

    if (!lead) {
      // Origem: referral do anúncio (se a Z-API repassar) ou a 1ª mensagem
      // Dica: use mensagens pré-preenchidas diferentes por campanha nos anúncios
      const referral = b.referral || b.externalAdReply || null;
      const source = referral?.headline || referral?.title
        ? `Anúncio: ${referral.headline || referral.title}`
        : `1ª msg: "${body.slice(0, 60)}${body.length > 60 ? '…' : ''}"`;

      const { data: created } = await db
        .from('crm_leads')
        .insert({
          wa_id: waId,
          name: contactName,
          source,
          referral,
          unread: true,
          last_inbound_at: new Date().toISOString(),
        })
        .select()
        .single();
      lead = created;

      await db.from('crm_stage_events').insert({
        lead_id: lead.id,
        to_stage: 'novo_lead',
        actor: 'system',
      });
    } else {
      await db
        .from('crm_leads')
        .update({
          unread: true,
          last_inbound_at: new Date().toISOString(),
          name: lead.name || contactName,
        })
        .eq('id', lead.id);
      lead = { ...lead, name: lead.name || contactName };
    }

    await saveMessage(lead.id, {
      direction: 'in',
      sender: 'patient',
      body,
      waMessageId: b.messageId || null,
    });

    // ---- IA responde como padrão nas etapas de atendimento ----
    const aiStages = ['novo_lead', 'em_atendimento'];
    if (lead.ai_enabled && aiStages.includes(lead.stage_id)) {
      const result = await runAgent({ ...lead });
      if (result?.reply) {
        const sent = await sendText(waId, result.reply);
        await saveMessage(lead.id, {
          direction: 'out',
          sender: 'ai',
          body: result.reply,
          waMessageId: sent?.messageId || sent?.id || null,
        });
      }

      const updates = {};
      const ex = result?.extracted || {};
      if (ex.name && !lead.name) updates.name = ex.name;
      if (ex.city && !lead.city) updates.city = ex.city;
      if (ex.complaint) updates.notes = appendNote(lead.notes, `Queixa: ${ex.complaint}`);

      if (lead.stage_id === 'novo_lead') {
        updates.stage_id = 'em_atendimento';
        await db.from('crm_stage_events').insert({
          lead_id: lead.id,
          from_stage: 'novo_lead',
          to_stage: 'em_atendimento',
          actor: 'ai',
        });
      }

      if (result?.action === 'handoff') {
        updates.ai_enabled = false;
        updates.needs_human = true;
      }

      if (Object.keys(updates).length) {
        await db.from('crm_leads').update(updates).eq('id', lead.id);
      }

      // IA qualificou → move o card sozinha e aciona a secretária
      // (a resposta da Maia já avisa o paciente, então notifyPatient=false)
      if (result?.action === 'suggest_qualified') {
        const fresh = { ...lead, ...updates };
        await qualifyLead(fresh, 'ai', { notifyPatient: false });
      }
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('webhook error:', err);
    return res.status(200).json({ ok: false });
  }
}

function extractBody(b) {
  if (b.text?.message) return b.text.message;
  if (b.buttonsResponseMessage?.message) return b.buttonsResponseMessage.message;
  if (b.listResponseMessage?.message) return b.listResponseMessage.message;
  if (b.image) return b.image.caption ? `[Imagem] ${b.image.caption}` : '[Paciente enviou uma imagem]';
  if (b.audio) return '[Paciente enviou um áudio]';
  if (b.video) return b.video.caption ? `[Vídeo] ${b.video.caption}` : '[Paciente enviou um vídeo]';
  if (b.document) return '[Paciente enviou um documento]';
  if (b.sticker) return '[Paciente enviou uma figurinha]';
  return null;
}

function appendNote(existing, line) {
  if (!existing) return line;
  if (existing.includes(line)) return existing;
  return `${existing}\n${line}`;
}
