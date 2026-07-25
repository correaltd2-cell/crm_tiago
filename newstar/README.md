# NEW STAR — Gestão do Representante + Talão de Pedido Digital

PWA offline-first para os representantes da New Star (placas de brincos/semijoias em
consignação) e painel do gestor. Dois módulos integrados na mesma base:

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
newstar/
├── supabase/
│   ├── schema_v2.sql             # 1º — base do Módulo A (tabelas + triggers de comissão/ciclo)
│   ├── migracao_clientes_v2.sql  # 2º — TEMPLATE da carga de clientes (ver aviso abaixo)
│   └── update_v3.sql             # 3º — produtos (catálogo do talão), pedidos e trigger de conclusão
├── public/                       # o app (deploy é só publicar esta pasta)
│   ├── index.html                # shell + CSS + bloco NS_CONFIG
│   ├── js/calc.js                # cálculos puros (placas, comissão, rotas, CSV) — testável em Node
│   ├── js/db.js                  # offline-first: cache local + fila de sync (PostgREST)
│   ├── js/rota.js                # Google Geocoding/Distance Matrix + montagem da rota
│   ├── js/pdf.js                 # gerador de PDF próprio (funciona offline, assinatura embutida)
│   ├── js/pedido.js              # wizard do talão + assinatura + ações de PDF
│   ├── js/app.js                 # login, Hoje, clientes, dashboard, despesas, admin
│   └── sw.js / manifest / icons  # PWA instalável
└── tests/
    ├── calc.test.cjs             # 23 testes de cálculo (node tests/calc.test.cjs)
    └── e2e.offline.cjs           # 29 testes E2E no Chromium (fluxo completo offline + sync)
```

## ⚠️ Sobre os 255 clientes reais

O arquivo original `migracao_clientes_v2.sql` com os 255 clientes **não estava no
repositório**. O arquivo aqui é o template no formato correto. Para carregar a base
real: cole os INSERTs no template **ou** use **Admin → Clientes → Importar CSV**
(com mapeamento de colunas; marca `recebimento_dias = 45` automaticamente para rede
Clamed). Produtos sem preço informado ficaram com preço NULL — o app bloqueia o
lançamento e pede cadastro em Admin → Produtos (nada foi inventado).

## Setup

### 1. Supabase
1. Criar projeto → SQL Editor → rodar **na ordem**: `schema_v2.sql`,
   `migracao_clientes_v2.sql` (com os clientes reais), `update_v3.sql`.
2. Anotar `Project URL` e `anon key` (Settings → API).
3. Usuários iniciais criados pelo schema: `denilson@newstar.com.br` (vendedor) e
   `guilherme@newstar.com.br` (gestor) — **a senha é definida no primeiro login**.

> Nota de segurança: o app usa a `anon key` com login próprio na tabela
> `representantes` (hash SHA-256). As tabelas ficam sem RLS por padrão — para
> endurecer, restrinja a `anon key` por rede/domínio ou migre para Supabase Auth.

### 2. Google Maps
Criar chave com **Geocoding API**, **Distance Matrix API** e **Maps JavaScript API**
habilitadas e informá-la dentro do app em **Mais → Configurações** (gestor). Sem
chave o app segue funcionando com distâncias estimadas (haversine ×1,3).

### 3. Deploy (Netlify ou Vercel)
1. Editar `public/index.html` → bloco `NS_CONFIG` → preencher `SUPABASE_URL` e
   `SUPABASE_ANON_KEY`.
2. Publicar a pasta `newstar/public` como site estático
   (Netlify: arrastar a pasta; Vercel: projeto com Output Directory = `newstar/public`).
3. No celular: abrir o site → "Adicionar à tela inicial" (PWA instalável, funciona
   100% offline; escrituras ficam na fila e sincronizam ao voltar o sinal).

## Configurável no Admin (nunca hardcoded)

Preços e unidades por placa de cada produto · % comissão novo/reposição e custo/km
por vendedor · prazo de recebimento por cliente (Clamed = 45) · condições de
pagamento · observações do rodapé do PDF · visitas/dia (6–8) · regra de pernoite
(150 km / 60 km) · desvio máximo de reencaixe · início do ciclo de 7 semanas.

## Testes

```bash
cd newstar
node tests/calc.test.cjs     # cálculos: placas P/G, devolução+quebra, comissão, ciclo, rota, pernoite
node tests/e2e.offline.cjs   # Chromium: login offline → pedido → assinatura → PDF → sync posterior
```

Cobrem a lista obrigatória da especificação: busca parcial (CNPJ/nome/cidade), troca
de tabela refletindo preços, placa P vs G, devolução+quebra abatendo antes da
comissão (48−5−2=41), 15% no 1º pedido / 10% na reposição, +45d só para Clamed,
assinatura salva e embutida no PDF, pedido consultável depois, reencaixe de pendente
e funcionamento offline com sincronização posterior. Os 3 SQLs + triggers foram
validados em PostgreSQL 16 real.
