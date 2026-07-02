// Webhook da API oficial do WhatsApp (Meta Cloud API)
// - GET: verificação do webhook no painel do Meta
// - POST: mensagens recebidas → cria/atualiza lead, salva mensagem e aciona a IA
import { db, sendText, saveMessage, getConfig } from './_lib/core.js';
import { runAgent } from './_lib/agent.js';

export default async function handler(req, res) {
  // ---- Verificação do webhook (configuração no Meta) ----
  if (req.method === 'GET') {
    const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query;
    const cfg = await getConfig();
    if (mode === 'subscribe' && token === cfg.verifyToken) {
      return res.status(200).send(challenge);
    }
    return res.status(403).send('forbidden');
  }

  if (req.method !== 'POST') return res.status(405).end();

  try {
    const value = req.body?.entry?.[0]?.changes?.[0]?.value;

    // Ignora eventos de status (entregue/lido) nesta versão
    const incoming = value?.messages;
    if (!incoming?.length) return res.status(200).json({ ok: true });

    const contactName = value?.contacts?.[0]?.profile?.name || null;

    for (const msg of incoming) {
      const waId = msg.from;
      const body = extractBody(msg);
      if (!body) continue;

      // ---- Localiza ou cria o lead ----
      let { data: lead } = await db.from('crm_leads').select('*').eq('wa_id', waId).single();

      if (!lead) {
        // referral = veio de clique em anúncio (click-to-WhatsApp)
        const referral = msg.referral || null;
        const source = referral
          ? `${referral.headline || referral.body || 'Anúncio Meta'}`
          : 'Orgânico / direto';

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
        waMessageId: msg.id,
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
            waMessageId: sent?.messages?.[0]?.id || null,
          });
        }

        const updates = {};
        // Dados extraídos pela IA (nome, cidade, queixa)
        const ex = result?.extracted || {};
        if (ex.name && !lead.name) updates.name = ex.name;
        if (ex.city && !lead.city) updates.city = ex.city;
        if (ex.complaint) updates.notes = appendNote(lead.notes, `Queixa: ${ex.complaint}`);

        // Primeiro contato respondido → move de Novo Lead p/ Em Atendimento
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
        if (result?.action === 'suggest_qualified') {
          updates.qualify_ready = true;
        }

        if (Object.keys(updates).length) {
          await db.from('crm_leads').update(updates).eq('id', lead.id);
        }
      }
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('webhook error:', err);
    // Sempre 200 para o Meta não reenfileirar indefinidamente
    return res.status(200).json({ ok: false });
  }
}

function extractBody(msg) {
  if (msg.type === 'text') return msg.text?.body || null;
  if (msg.type === 'button') return msg.button?.text || null;
  if (msg.type === 'interactive')
    return msg.interactive?.button_reply?.title || msg.interactive?.list_reply?.title || null;
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
