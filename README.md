# NEW STAR — Gestão do Representante + Talão de Pedido Digital

PWA offline-first para os representantes da New Star (placas de brincos/semijoias em
consignação em farmácias no RS/SC/PR) e painel do gestor. Dois módulos integrados na
mesma base:

- **Módulo A — Gestão do Representante**: rota do dia pelo ciclo de 7 semanas com
  otimização (Nearest Neighbor + 2-opt sobre Google Distance Matrix, fallback
  haversine ×1,3 offline), reencaixe automático de visitas não realizadas, pernoite
  ("📍 Estou aqui"), frequência que aprende, comissões 15%/10% com prazo Clamed +45d,
  despesas de estrada, linhas de produto/upsell e dashboard.
- **Módulo B — Talão de Pedido Digital**: cliente → tabela de preço (Simples/Lucro
  Presumido) → placas P/G → devoluções (Display/Quebrada) → conferência → assinatura
  na tela → PDF (visualizar/compartilhar/imprimir) → histórico permanente.

**Stack**: HTML/JS puro (sem build), Supabase (PostgreSQL + PostgREST), Google Maps
APIs (Geocoding, Distance Matrix, JS), deploy estático em Netlify ou Vercel.

## Estrutura

```
├── supabase/
│   ├── schema_v2.sql             # 1º — base original (tabelas + RLS + triggers)
│   ├── migracao_clientes_v2.sql  # 2º — 255 clientes reais do Denilson + usuários
│   ├── update_v3.sql             # 3º — linhas de produto, comissão dupla, prazo Clamed
│   └── update_v4.sql             # 4º — talão digital (pedidos/itens/trigger), catálogo
│                                 #      com preços e placas P/G, pendências, pernoites,
│                                 #      configurações (evolui os 3 originais, não recria)
├── public/                       # o app (deploy é só publicar esta pasta)
│   ├── index.html                # shell + CSS + bloco NS_CONFIG
│   ├── js/calc.js                # cálculos puros (placas, comissão, rotas, ciclo, CSV)
│   ├── js/db.js                  # offline-first: cache local + fila de sync (PostgREST)
│   ├── js/rota.js                # Google Geocoding/Distance Matrix + montagem da rota
│   ├── js/pdf.js                 # gerador de PDF próprio (offline, assinatura embutida)
│   ├── js/pedido.js              # wizard do talão + assinatura + ações de PDF
│   ├── js/app.js                 # login, Hoje, clientes, dashboard, despesas, admin
│   └── sw.js / manifest / icons  # PWA instalável
├── tests/
│   ├── calc.test.cjs             # 30 testes de cálculo (node tests/calc.test.cjs)
│   └── e2e.offline.cjs           # 29 testes E2E no Chromium (fluxo completo offline + sync)
└── docs_prompt_original.md       # especificação original do projeto
```

## Setup

### 1. Supabase
1. Criar projeto → SQL Editor → rodar **na ordem**: `schema_v2.sql`,
   `migracao_clientes_v2.sql`, `update_v3.sql`, `update_v4.sql`.
2. Anotar `Project URL` e `anon key` (Settings → API).
3. Usuários criados pela migração: `denilson@newstar.com.br` (vendedor, base Passo
   Fundo) e `guilherme@newstar.com.br` (gestor) — **a senha é definida no primeiro
   login** (registro vem com hash placeholder).
4. Os 255 clientes já entram com ciclo (semana 1-7 × dia da semana), coordenadas
   aproximadas por cidade e as 19 farmácias Clamed marcadas com `recebimento_dias = 45`.

> Nota de segurança: o padrão inicial é o do schema original — RLS habilitado com
> policies abertas e filtro por representante no app (anon key). As policies
> `auth.uid()` para migrar a Supabase Auth estão comentadas no fim do `schema_v2.sql`.

### 2. Google Maps
Criar chave com **Geocoding API**, **Distance Matrix API** e **Maps JavaScript API**
habilitadas e informá-la dentro do app em **Mais → Configurações** (gestor). Sem
chave o app segue funcionando com distâncias estimadas (haversine ×1,3). Use
**Mais → Geocodificar clientes** para converter os endereços em posição precisa
(status por cliente: preciso / aproximado / falhou).

### 3. Deploy (Netlify ou Vercel)
1. Editar `public/index.html` → bloco `NS_CONFIG` → preencher `SUPABASE_URL` e
   `SUPABASE_ANON_KEY`.
2. Publicar a pasta `public/` como site estático
   (Netlify: arrastar a pasta; Vercel: Output Directory = `public`).
3. No celular: abrir o site → "Adicionar à tela inicial" (PWA instalável, funciona
   100% offline; escrituras ficam na fila e sincronizam ao voltar o sinal).

## Regras de negócio no banco (triggers)

- **Comissão**: 15% no primeiro pedido (cliente sem qualquer sinal de compra anterior:
  sem último pedido, sem seed da listagem, status legado 'Novo'), 10% na reposição —
  percentuais por representante. `comissao_recebimento_em = data + recebimento_dias`
  (Clamed = 45; demais = 0). Calculada sobre o **valor efetivamente vendido**
  (colocadas − devolvidas − quebradas) × preço da tabela do pedido.
- **Conclusão de pedido** (`update_v4`): recalcula totais dos itens, registra/atualiza
  a visita do dia (dispara a comissão), grava as linhas em `visitas.produtos` e
  `cliente_produtos`.
- **Visita realizada**: atualiza última visita/último pedido/próxima prevista do
  cliente e resolve pendência aberta (fila de reencaixe).

## Configurável no Admin (nunca hardcoded)

Preços e unidades por placa de cada produto (os preços não informados ficaram NULL —
o app bloqueia o lançamento e pede cadastro) · % comissão novo/reposição e custo/km
por vendedor · prazo de recebimento por cliente · condições de pagamento ·
observações do rodapé do PDF · visitas/dia (6–8) · regra de pernoite (150 km / 60 km) ·
desvio máximo de reencaixe · início do ciclo de 7 semanas.

## Testes

```bash
node tests/calc.test.cjs     # cálculos: placas P/G, devolução+quebra, comissão, ciclo, rota, pernoite
node tests/e2e.offline.cjs   # Chromium: login offline → pedido → assinatura → PDF → sync posterior
```

Cobrem a lista obrigatória da especificação: busca parcial (CNPJ/nome/cidade), troca
de tabela refletindo preços, placa P vs G, devolução+quebra abatendo antes da
comissão (48−5−2=41), 15% no 1º pedido / 10% na reposição, +45d só para Clamed,
assinatura salva e embutida no PDF, pedido consultável depois, reencaixe de pendente
e funcionamento offline com sincronização posterior. Os 4 SQLs + triggers foram
validados em PostgreSQL 16 real com os 255 clientes carregados.
