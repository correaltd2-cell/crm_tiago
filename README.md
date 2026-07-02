# CRM — Dr. Tiago Franco Martins (Oculoplástica)

CRM de leads com Kanban, atendimento por IA (padrão) com assunção humana, integração com anúncios click-to-WhatsApp e encaminhamento automático de pacientes qualificados para a secretária do hospital. Stack: **Vercel (front + serverless) + Supabase + WhatsApp Cloud API (oficial) + Google Gemini**.

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

### 2. WhatsApp Cloud API (Meta)
1. developers.facebook.com → criar app Business → adicionar produto **WhatsApp**.
2. Cadastrar/migrar o número comercial do Dr. Tiago (o número NÃO pode estar ativo no app WhatsApp normal — precisa ser dedicado à API).
3. Anotar `Phone Number ID` e gerar um **token permanente** (System User no Business Manager com permissão whatsapp_business_messaging).
4. WhatsApp Manager → **Modelos de mensagem** → criar os 6 templates de `templates-meta.md` (nomes idênticos).
5. Depois do deploy (passo 3): Configuração do Webhook → URL `https://SEU-PROJETO.vercel.app/api/webhook`, verify token = o mesmo `META_VERIFY_TOKEN` das env vars, e assinar o campo **messages**.

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
Nas campanhas click-to-WhatsApp do Meta, apontar para o número da API. O webhook captura o `referral` (título/campanha do anúncio) e grava na origem do lead — dá pra ver qual anúncio converte melhor.

## Regras importantes da API oficial
- **Janela de 24h**: mensagens livres só até 24h após a última mensagem do paciente. Fora disso, só template aprovado — o CRM já trata isso (banner + botão "template de retomada").
- Follow-ups são templates de MARKETING (têm custo por envio).
- O aviso à secretária usa template de UTILIDADE.

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
- [ ] Preencher a seção **Integrações** (Config IA no painel): token do Meta, Phone Number ID, WhatsApp da secretária e chave do Gemini.
- [ ] Preencher a base de conhecimento (Config IA no painel): cidade, hospital, particularidades.
- [ ] Confirmar o nome da agente de IA (padrão: **Maia**) — editável em Config IA.
- [ ] Testar o fluxo completo com seu próprio número antes de ligar os anúncios.
