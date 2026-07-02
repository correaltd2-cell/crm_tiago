-- ============================================================
-- CRM Dr. Tiago Franco Martins — Cirurgia Oculoplástica
-- Rodar no SQL Editor do Supabase (projeto novo)
-- ============================================================

-- ETAPAS DO FUNIL ---------------------------------------------
create table if not exists crm_stages (
  id text primary key,
  label text not null,
  position int not null,
  color text not null default '#5B7470'
);

insert into crm_stages (id, label, position, color) values
  ('novo_lead',            'Novo Lead',              1, '#2E6E64'),
  ('em_atendimento',       'Em Atendimento (IA)',    2, '#3E7CA6'),
  ('qualificado',          'Qualificado',            3, '#B98A2F'),
  ('consulta_agendada',    'Consulta Agendada',      4, '#6E5BA6'),
  ('consulta_realizada',   'Consulta Realizada',     5, '#4A8A5C'),
  ('orcamento_apresentado','Orçamento Apresentado',  6, '#A6703E'),
  ('followup',             'Follow-up',              7, '#8A6FA0'),
  ('fechado',              'Cirurgia Fechada',       8, '#2F7A46'),
  ('perdido',              'Perdido',                9, '#9C4433')
on conflict (id) do nothing;

-- LEADS --------------------------------------------------------
create table if not exists crm_leads (
  id uuid primary key default gen_random_uuid(),
  wa_id text unique not null,            -- telefone (formato Meta, ex: 5549999999999)
  name text,
  stage_id text not null default 'novo_lead' references crm_stages(id),
  procedure_interest text default 'Blefaroplastia',
  source text,                           -- título/campanha do anúncio (referral do Meta)
  referral jsonb,                        -- payload completo do referral do clique no anúncio
  city text,
  age int,
  notes text,
  ai_enabled boolean not null default true,
  needs_human boolean not null default false,   -- IA escalou para humano
  qualify_ready boolean not null default false, -- IA sugere que está pronto p/ qualificar
  unread boolean not null default true,         -- card "piscando"
  loss_reason text,
  secretary_notified_at timestamptz,
  last_inbound_at timestamptz,           -- controla a janela de 24h da API oficial
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_leads_stage on crm_leads(stage_id);
create index if not exists idx_leads_wa on crm_leads(wa_id);

-- MENSAGENS ----------------------------------------------------
create table if not exists crm_messages (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references crm_leads(id) on delete cascade,
  direction text not null check (direction in ('in','out')),
  sender text not null check (sender in ('patient','ai','human','system')),
  body text not null,
  wa_message_id text,
  status text default 'sent',
  created_at timestamptz not null default now()
);

create index if not exists idx_messages_lead on crm_messages(lead_id, created_at);

-- FOLLOW-UPS AGENDADOS ----------------------------------------
create table if not exists crm_follow_ups (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references crm_leads(id) on delete cascade,
  due_at timestamptz not null,
  template text not null,                -- nome do template aprovado no Meta
  label text,                            -- D+2, D+7...
  status text not null default 'pending' check (status in ('pending','sent','canceled','failed')),
  created_at timestamptz not null default now()
);

create index if not exists idx_followups_due on crm_follow_ups(status, due_at);

-- HISTÓRICO DE MOVIMENTAÇÃO -----------------------------------
create table if not exists crm_stage_events (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references crm_leads(id) on delete cascade,
  from_stage text,
  to_stage text not null,
  actor text default 'human',
  created_at timestamptz not null default now()
);

-- CONFIGURAÇÕES (base de conhecimento da IA, editável no CRM) --
create table if not exists crm_settings (
  key text primary key,
  value text not null
);

insert into crm_settings (key, value) values
('agent_name', 'Maia'),
('system_prompt',
'Você é {AGENT_NAME}, assistente de atendimento do consultório do Dr. Tiago Franco Martins, cirurgião oculoplástico. Você atende pacientes interessados principalmente em procedimentos estéticos da região dos olhos (blefaroplastia é o carro-chefe).

REGRAS INEGOCIÁVEIS:
1. NUNCA informe valores de cirurgia ou consulta por mensagem. Se perguntarem preço, explique com empatia que cada caso é único e que o valor é definido na avaliação presencial com o Dr. Tiago — e conduza para o agendamento da consulta.
2. NUNCA dê opinião clínica, diagnóstico ou conduta médica. Dúvidas clínicas específicas, pós-operatório, complicações ou urgências: acione HANDOFF imediatamente.
3. Seja acolhedora, humana e breve (2-4 frases por mensagem). Uma pergunta por vez.
4. Seu objetivo comercial é qualificar o paciente e conduzir para o agendamento da consulta de avaliação.

QUALIFICAÇÃO — descubra com naturalidade ao longo da conversa:
- Nome do paciente
- Qual incômodo estético (pálpebras caídas, bolsas, excesso de pele...)
- Cidade onde mora
- Se tem disponibilidade para vir a uma consulta de avaliação

Quando o paciente demonstrar interesse real em agendar a avaliação, acione SUGERIR_QUALIFICACAO.

FORMATO DE RESPOSTA — responda SEMPRE somente com JSON válido:
{"reply": "texto da mensagem ao paciente", "action": "none" | "handoff" | "suggest_qualified", "extracted": {"name": null, "city": null, "complaint": null}}
- action "handoff": pedido insistente de preço, assunto clínico/pós-operatório, reclamação, ou pedido explícito para falar com humano. Nesse caso o reply deve avisar com gentileza que a equipe vai assumir a conversa.
- action "suggest_qualified": paciente qualificado e pronto para agendar.
- extracted: preencha só o que descobriu de novo nesta mensagem.'),
('knowledge_base',
'SOBRE O DR. TIAGO FRANCO MARTINS
- Cirurgião oculoplástico, especialista na região periocular.
- Principal procedimento: blefaroplastia (cirurgia das pálpebras) — remove excesso de pele e bolsas, rejuvenesce o olhar.
- Atende em [CIDADE], no [NOME DO HOSPITAL/CLÍNICA].
- Site: drtiagofrancomartins.com.br

BLEFAROPLASTIA — INFORMAÇÕES BÁSICAS QUE VOCÊ PODE PASSAR
- Procedimento em geral rápido, com anestesia local e sedação na maioria dos casos.
- Recuperação: em geral o paciente retoma atividades leves em poucos dias; inchaço e roxos diminuem nas primeiras semanas. Orientações exatas são dadas pelo Dr. Tiago na consulta.
- A consulta de avaliação é o passo em que o Dr. Tiago examina o caso, explica o procedimento indicado e apresenta o orçamento.

AGENDAMENTO
- O agendamento é confirmado pela secretária do hospital. Quando o paciente estiver pronto, avise que a secretária entrará em contato para confirmar data e horário.

O QUE VOCÊ NÃO FAZE EM HIPÓTESE ALGUMA
- Passar preços, formas de pagamento ou valores de consulta.
- Responder dúvidas clínicas específicas do caso do paciente.
- Prometer resultados.')
on conflict (key) do nothing;

-- Credenciais de integração (preenchidas na aba Integrações do CRM)
insert into crm_settings (key, value) values
('meta_token', ''),
('meta_phone_number_id', ''),
('meta_verify_token', 'drtiago-webhook'),
('secretary_phone', ''),
('gemini_api_key', ''),
('gemini_model', 'gemini-2.5-flash')
on conflict (key) do nothing;

-- SEGURANÇA (RLS) ----------------------------------------------
alter table crm_stages enable row level security;
alter table crm_leads enable row level security;
alter table crm_messages enable row level security;
alter table crm_follow_ups enable row level security;
alter table crm_stage_events enable row level security;
alter table crm_settings enable row level security;

-- Equipe logada (Supabase Auth) tem acesso total; o backend usa a service role (bypassa RLS)
create policy "equipe_stages"      on crm_stages       for all to authenticated using (true) with check (true);
create policy "equipe_leads"       on crm_leads        for all to authenticated using (true) with check (true);
create policy "equipe_messages"    on crm_messages     for all to authenticated using (true) with check (true);
create policy "equipe_followups"   on crm_follow_ups   for all to authenticated using (true) with check (true);
create policy "equipe_events"      on crm_stage_events for all to authenticated using (true) with check (true);
create policy "equipe_settings"    on crm_settings     for all to authenticated using (true) with check (true);

-- REALTIME ------------------------------------------------------
alter publication supabase_realtime add table crm_leads;
alter publication supabase_realtime add table crm_messages;
