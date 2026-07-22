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
| `META_APP_ID` | ID do app Meta da Alcance 360 (Tech Provider) — só necessário se algum cliente usar API Oficial |
| `META_APP_SECRET` | Chave secreta do mesmo app — **nunca vai no banco, só aqui** |

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


## WhatsApp: Z-API ou API Oficial (por cliente)

O sistema suporta os dois transportes, escolhidos em **Config IA → Integrações → WhatsApp · Provedor**, sem precisar trocar código:

- **Z-API** (padrão): chip dedicado, QR code, sem burocracia — ver seção anterior.
- **API Oficial (Meta)**: para clientes que exigem o canal oficial. Como a Alcance 360 é **Tech Provider** do Meta, a conexão usa **Embedded Signup**: o médico clica em "Conectar número via Facebook", loga, escolhe/cria o WABA e o número — e o sistema recebe e salva tudo sozinho (token, WABA ID, Phone Number ID). Nada de copiar token manualmente.

  Pré-requisitos (uma vez só, por conta da Alcance 360, não por cliente):
  1. App em modo **Live** no developers.facebook.com, com App Review aprovado para `whatsapp_business_management` e `whatsapp_business_messaging`.
  2. Uma **Embedded Signup Configuration** criada em WhatsApp → Embedded Signup → Configurations (gera um Configuration ID).
  3. `META_APP_ID` e `META_APP_SECRET` nas env vars da Vercel (App Dashboard → Configurações → Básico).

  Por cliente, em Config IA → Integrações → API Oficial: cola o **App ID** e o **Configuration ID** (os mesmos da Alcance 360, reutilizáveis para todos os clientes) e clica em **Conectar número via Facebook**. O webhook (`https://SEU-PROJETO.vercel.app/api/webhook`) e o Verify Token continuam configurados uma vez no App Dashboard, compartilhados entre todos os clientes que usarem API Oficial nesse mesmo app.
  Templates (`templates-meta.md`) precisam ser submetidos e aprovados por WABA/cliente.


## Reativação por inatividade (2h / 24h / 72h / 15 dias)

Enquanto um lead está sendo atendido pela IA (etapas Novo Lead / Em Atendimento) e para de responder, o sistema reengaja sozinho com mensagens **fixas e leves** (não geradas por IA de propósito — controle de conteúdo na área da saúde), sempre oferecendo a alternativa de uma ligação do hospital:
- **2h** sem resposta → toque leve, oferece explicar por aqui ou pedir ligação
- **24h** → reforça disponibilidade, mesma oferta
- **72h** → lembrete gentil, mesma oferta
- **15 dias** → mensagem final, educada, avisando que encerra o atendimento automático por aqui mas segue à disposição (não força nenhuma mudança de etapa — o card continua onde está)

Textos em `api/_lib/core.js` (`AUTO_TEXTS`) e prontos como rascunho de template em `templates-meta.md`. Se o paciente responder a qualquer momento, o relógio zera e o ciclo recomeça do zero na próxima vez que ficar em silêncio.

### ⚠️ Importante: frequência do cron

O endpoint é `/api/cron-reactivation`, protegido pelo mesmo `CRON_SECRET`. Como o **plano Hobby da Vercel só executa cron nativo 1x por dia**, e aqui precisamos de checagem de hora em hora, use um agendador externo **gratuito**:

1. Crie uma conta em **cron-job.org** (grátis).
2. Novo cron job → URL: `https://SEU-PROJETO.vercel.app/api/cron-reactivation`
3. Método: **POST**. Em Headers, adicione: `Authorization: Bearer SEU_CRON_SECRET` (o mesmo valor da env var da Vercel).
4. Intervalo: a cada **30 ou 60 minutos**.

(Se no futuro migrar para o plano Pro da Vercel, pode trocar para um cron nativo em `vercel.json` com schedule `"*/30 * * * *"` e remover o agendador externo.)
