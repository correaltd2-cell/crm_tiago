# CRM — Dr. Tiago Franco Martins (Oculoplástica)

CRM de leads com Kanban, atendimento por IA (padrão) com assunção humana, integração com anúncios click-to-WhatsApp e encaminhamento automático de pacientes qualificados para a secretária do hospital. Stack: **Vercel (front + serverless) + Supabase + Z-API (WhatsApp) + Google Gemini**.

## Fluxo
1. Paciente clica no anúncio do Meta → cai no WhatsApp oficial → webhook cria o lead em **Novo Lead** (card piscando) com a campanha de origem.
2. A **IA responde por padrão** (informações básicas, qualificação, condução p/ consulta). Ela mesma escala para humano em: pedido insistente de preço, assunto clínico, reclamação.
3. Humano pode **assumir a conversa** a qualquer momento (toggle ou simplesmente enviando uma mensagem — isso pausa a IA).
4. Arrastar o card para **Qualificado** → dispara template com o resumo do lead para o WhatsApp da secretária do hospital + avisa o paciente.
5. Arrastar para **Follow-up** → agenda cadência automática D+2 / D+7 / D+15 / D+30 (templates aprovados, cron diário).
6. **Perdido** exige motivo (relatório de conversão) e **Fechado**/Perdido cancelam follow-ups pendentes.

## Setup

### 1. Supabase
1. Criar projeto novo → SQL Editor → rodar `supabase/schema.sql`.
2. Authentication → Users → criar os usuários da equipe (e-mail + senha).
3. Anotar: `Project URL`, `anon key`, `service_role key` (Settings → API).

### 2. Z-API (WhatsApp)
1. Criar conta em z-api.io → criar uma instância.
2. Conectar o **número novo dedicado aos anúncios** lendo o QR code (não usar o número pessoal/oficial do Dr. Tiago).
3. Anotar: **Instance ID**, **Token da instância** e o **Client-Token** (menu Segurança da conta).
4. Na instância → Webhooks → **"Ao receber"** → colar `https://SEU-PROJETO.vercel.app/api/webhook`.
5. Preencher os três valores no CRM em **Config IA → Integrações**.

⚠️ Estratégia anti-banimento: número dedicado só pros anúncios, volume baixo, conversa sempre iniciada pelo paciente, sem disparo em massa. Lead qualificado é encaminhado para o WhatsApp da secretária (número oficial, fora de risco).

💡 Rastreio de campanha: configure uma mensagem pré-preenchida DIFERENTE em cada anúncio ("Olá! Vi o anúncio sobre olhar descansado…") — o CRM grava a 1ª mensagem como origem do lead.

### 3. Vercel
1. Subir esta pasta num repositório GitHub → importar no Vercel.
2. Environment Variables:

| Variável | Valor |
|---|---|
| `SUPABASE_URL` | URL do projeto |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key |
| `CRON_SECRET` | string aleatória (protege o cron) |

**Só isso.** Todas as credenciais de integração (token do Meta, Phone Number ID, verify token do webhook, WhatsApp da secretária, chave e modelo do Gemini) são preenchidas **dentro do CRM**, no botão **Config IA → seção Integrações** — salvou, já está valendo (sem redeploy).

3. Em `public/index.html`, preencher `SUPABASE_URL` e `SUPABASE_ANON_KEY` no bloco CONFIG.
4. Deploy. O cron de follow-ups roda todo dia às 10h (Brasília) — configurado em `vercel.json`.

### 4. Anúncios
Nas campanhas click-to-WhatsApp do Meta, apontar para o número conectado na Z-API, com mensagem pré-preenchida diferente por campanha — o CRM grava a 1ª mensagem como origem do lead.

## Mensagens automáticas
Sem templates pra aprovar: os textos dos follow-ups (D+2/D+7/D+15/D+30), da retomada e do aviso à secretária estão em `api/_lib/core.js` (constante `AUTO_TEXTS`) — edite lá se quiser mudar o tom.

## Estrutura
```
api/webhook.js        → recebe mensagens do Meta, cria leads, roda a IA
api/send.js           → envio humano (com tratamento da janela de 24h)
api/stage.js          → movimentação de etapa + automações (secretária, follow-ups, perda)
api/cron-followups.js → cron diário dos follow-ups
api/_lib/core.js      → Supabase, Meta API, auth, janela 24h
api/_lib/agent.js     → agente de IA (prompt + base de conhecimento editáveis no CRM)
public/index.html     → o CRM (Kanban + chat + Config IA)
supabase/schema.sql   → banco completo
templates-meta.md     → textos dos templates para aprovar no Meta
```

## Antes de entregar ao Dr. Tiago
- [ ] Preencher a seção **Integrações** (Config IA no painel): Instance ID/Token/Client-Token da Z-API, WhatsApp da secretária e chave do Gemini.
- [ ] Preencher a base de conhecimento (Config IA no painel): cidade, hospital, particularidades.
- [ ] Confirmar o nome da agente de IA (padrão: **Maia**) — editável em Config IA.
- [ ] Testar o fluxo completo com seu próprio número antes de ligar os anúncios.
