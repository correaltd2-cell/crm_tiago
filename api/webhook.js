// Webhook do WhatsApp — aceita Z-API OU API oficial (Meta), conforme o
// provedor ativo em Config IA → Integrações. Detecta o formato sozinho.
import { db, sendText, saveMessage, getConfig } from './_lib/core.js';
import { runAgent } from './_lib/agent.js';
import { qualifyLead } from './_lib/actions.js';

export default async function handler(req, res) {
  // ---- GET: verificação do webhook da Meta (challenge) ----
  if (req.method === 'GET') {
    const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query;
    if (mode && token) {
      const cfg = await getConfig();
      if (mode === 'subscribe' && token === cfg.metaVerifyToken) {
        return res.status(200).send(challenge);
      }
      return res.status(403).send('forbidden');
    }
    return res.status(200).send('ok'); // ping da Z-API / health check
  }
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const cfg = await getConfig();
    const parsed = cfg.waProvider === 'meta' ? parseMetaPayload(req.body) : parseZapiPayload(req.body);
    if (!parsed) return res.status(200).json({ ok: true }); // evento irrelevante (status, grupo, etc)

    const { waId, body, contactName, fromMe, referral, messageId } = parsed;
    if (!waId) return res.status(200).json({ ok: true });

    // ---- Mensagem enviada POR NÓS (pelo celular ou pelo próprio CRM) ----
    // Registra no histórico para a conversa ficar completa, com dedupe.
    if (fromMe) {
      if (!body) return res.status(200).json({ ok: true });
      const { data: leadOut } = await db.from('crm_leads').select('id').eq('wa_id', waId).single();
      if (leadOut) {
        if (messageId) {
          const { data: dup } = await db.from('crm_messages').select('id').eq('wa_message_id', messageId).limit(1);
          if (dup && dup.length) return res.status(200).json({ ok: true });
        }
        await saveMessage(leadOut.id, { direction: 'out', sender: 'human', body, waMessageId: messageId || null });
      }
      return res.status(200).json({ ok: true });
    }

    if (!body) return res.status(200).json({ ok: true });

    // ---- Localiza ou cria o lead ----
    let { data: lead } = await db.from('crm_leads').select('*').eq('wa_id', waId).single();

    if (!lead) {
      const source = referral?.headline || referral?.title
        ? `Anúncio: ${referral.headline || referral.title}`
        : `1ª msg: "${body.slice(0, 60)}${body.length > 60 ? '…' : ''}"`;

      const { data: created } = await db
        .from('crm_leads')
        .insert({ wa_id: waId, name: contactName, source, referral: referral || null, unread: true, last_inbound_at: new Date().toISOString() })
        .select()
        .single();
      lead = created;
      await db.from('crm_stage_events').insert({ lead_id: lead.id, to_stage: 'novo_lead', actor: 'system' });
    } else {
      await db.from('crm_leads').update({ unread: true, last_inbound_at: new Date().toISOString(), name: lead.name || contactName }).eq('id', lead.id);
      lead = { ...lead, name: lead.name || contactName };
    }

    await saveMessage(lead.id, { direction: 'in', sender: 'patient', body, waMessageId: messageId || null });

    // ---- Paciente respondeu durante o follow-up: reengajou! ----
    if (lead.stage_id === 'followup') {
      await db.from('crm_follow_ups').update({ status: 'canceled' }).eq('lead_id', lead.id).eq('status', 'pending');
      await db.from('crm_leads').update({ stage_id: 'em_atendimento' }).eq('id', lead.id);
      await db.from('crm_stage_events').insert({ lead_id: lead.id, from_stage: 'followup', to_stage: 'em_atendimento', actor: 'system' });
      await saveMessage(lead.id, { direction: 'out', sender: 'system', body: '[Sistema] Paciente respondeu ao follow-up — conversa reativada e follow-ups pendentes cancelados.' });
      lead = { ...lead, stage_id: 'em_atendimento' };
    }

    // ---- IA responde como padrão nas etapas de atendimento ----
    const aiStages = ['novo_lead', 'em_atendimento'];
    if (lead.ai_enabled && aiStages.includes(lead.stage_id)) {
      const result = await runAgent({ ...lead });
      if (result?.reply) {
        const sent = await sendText(waId, result.reply);
        await saveMessage(lead.id, { direction: 'out', sender: 'ai', body: result.reply, waMessageId: sent?.messageId || sent?.messages?.[0]?.id || null });
      }

      const updates = {};
      const ex = result?.extracted || {};
      if (ex.name && !lead.name) updates.name = ex.name;
      if (ex.city && !lead.city) updates.city = ex.city;
      if (ex.complaint) updates.notes = appendNote(lead.notes, `Queixa: ${ex.complaint}`);

      if (lead.stage_id === 'novo_lead') {
        updates.stage_id = 'em_atendimento';
        await db.from('crm_stage_events').insert({ lead_id: lead.id, from_stage: 'novo_lead', to_stage: 'em_atendimento', actor: 'ai' });
      }
      if (result?.action === 'handoff') {
        updates.ai_enabled = false;
        updates.needs_human = true;
      }
      if (Object.keys(updates).length) {
        await db.from('crm_leads').update(updates).eq('id', lead.id);
      }
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

// ---- Parsers de cada formato de payload ----

function parseZapiPayload(b) {
  if (!b) return null;
  if (b.isGroup || b.isStatusReply) return null;
  const waId = String(b.phone || '').replace(/\D/g, '');
  return {
    waId,
    fromMe: !!b.fromMe,
    body: extractZapiBody(b),
    contactName: b.senderName || b.chatName || b.pushName || null,
    referral: b.referral || b.externalAdReply || null,
    messageId: b.messageId || null,
  };
}

function extractZapiBody(b) {
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

function parseMetaPayload(b) {
  const value = b?.entry?.[0]?.changes?.[0]?.value;
  const msg = value?.messages?.[0];
  if (!msg) return null; // pode ser evento de status (delivered/read) — ignora
  const contactName = value?.contacts?.[0]?.profile?.name || null;
  return {
    waId: msg.from,
    fromMe: false, // a API oficial não reenvia "enviadas por mim" neste payload
    body: extractMetaBody(msg),
    contactName,
    referral: msg.referral || null,
    messageId: msg.id || null,
  };
}

function extractMetaBody(msg) {
  if (msg.type === 'text') return msg.text?.body || null;
  if (msg.type === 'button') return msg.button?.text || null;
  if (msg.type === 'interactive') return msg.interactive?.button_reply?.title || msg.interactive?.list_reply?.title || null;
  if (msg.type === 'image') return '[Paciente enviou uma imagem]';
  if (msg.type === 'audio') return '[Paciente enviou um áudio]';
  if (msg.type === 'video') return '[Paciente enviou um vídeo]';
  if (msg.type === 'document') return '[Paciente enviou um documento]';
  return null;
}

function appendNote(existing, line) {
  if (!existing) return line;
  if (existing.includes(line)) return existing;
  return `${existing}\n${line}`;
}
