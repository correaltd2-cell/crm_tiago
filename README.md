# NEW STAR — Gestão do Representante + Talão de Pedido Digital

PWA offline-first para os representantes da New Star (placas de brincos/semijoias em
consignação em farmácias no RS/SC/PR) e painel do gestor. Backend: **Firebase
(Firestore)**. Dois módulos integrados na mesma base:

- **Módulo A — Gestão do Representante**: rota do dia pelo ciclo de 7 semanas com
  otimização (Nearest Neighbor + 2-opt sobre Google Distance Matrix, fallback
  haversine ×1,3 offline), reencaixe automático de visitas não realizadas, pernoite
  ("📍 Estou aqui"), frequência que aprende, comissões 15%/10% com prazo Clamed +45d,
  despesas de estrada, linhas de produto/upsell e dashboard.
- **Módulo B — Talão de Pedido Digital**: cliente → tabela de preço (Simples/Lucro
  Presumido) → placas P/G → devoluções (Display/Quebrada) → conferência → assinatura
  na tela → PDF (visualizar/compartilhar/imprimir) → histórico permanente.

**Stack**: HTML/JS puro (sem build), Firestore via REST (sem SDK — funciona com a
fila offline própria), Google Maps APIs (Geocoding, Distance Matrix, JS), deploy
estático em Firebase Hosting, Netlify ou Vercel.

## Estrutura

```
├── public/                       # o app (deploy é só publicar esta pasta)
│   ├── index.html                # shell + CSS + bloco NS_CONFIG (Firebase)
│   ├── js/seed.js                # dados iniciais: 255 clientes reais, usuários,
│   │                             #   catálogo do talão e configurações
│   ├── js/calc.js                # cálculos puros (placas, comissão, rotas, ciclo, CSV)
│   ├── js/db.js                  # offline-first: cache + fila de sync (Firestore REST)
│   ├── js/rota.js                # Google Geocoding/Distance Matrix + montagem da rota
│   ├── js/pdf.js                 # gerador de PDF próprio (offline, assinatura embutida)
│   ├── js/pedido.js              # wizard do talão + assinatura + ações de PDF
│   ├── js/app.js                 # login, Hoje, clientes, dashboard, despesas, admin
│   └── sw.js / manifest / icons  # PWA instalável
├── firebase.json / firestore.rules  # deploy no Firebase Hosting + regras do Firestore
├── tests/
│   ├── calc.test.cjs             # 30 testes de cálculo (node tests/calc.test.cjs)
│   └── e2e.offline.cjs           # 36 testes E2E no Chromium (offline, sync, instalação)
├── dados-origem-sql/             # SQLs originais (referência histórica dos dados/regras)
└── docs_prompt_original.md       # especificação original do projeto
```

## Setup (só Firebase — não precisa de Supabase)

### 1. Projeto Firebase
1. [console.firebase.google.com](https://console.firebase.google.com) → **Adicionar
   projeto** (plano Spark gratuito serve).
2. Menu **Firestore Database** → *Criar banco de dados* (modo produção, região
   `southamerica-east1`).
3. Aba **Regras** → colar o conteúdo de `firestore.rules` → *Publicar*.
4. ⚙ **Configurações do projeto → Geral**: anotar o **ID do projeto** e a
   **Chave de API da Web** (se não houver app Web, clique em `</>` para criar um).

### 2. Configurar e publicar o app
1. Editar `public/index.html` → bloco `NS_CONFIG` → preencher `FIREBASE_PROJECT_ID`
   e `FIREBASE_API_KEY`.
2. Publicar a pasta `public/` como site estático:
   - **Firebase Hosting**: `npm i -g firebase-tools && firebase login &&
     firebase use SEU_PROJETO && firebase deploy`;
   - ou **Netlify** (arrastar a pasta) / **Vercel** (Output Directory = `public`).

### 3. Primeira instalação (carga dos dados)
Abrir o site → na tela de login, tocar em **"⚙ Primeira instalação"**. Isso grava no
Firestore, em lote: os **255 clientes reais** (ciclo semana×dia, coordenadas por
cidade, 19 farmácias Clamed já com `recebimento_dias = 45`, 6 inativos do legado),
o **catálogo do talão** (códigos, unidades por placa P/G e os preços informados —
os demais ficam a cadastrar no Admin), as **configurações** e os usuários
`denilson@newstar.com.br` (vendedor) e `guilherme@newstar.com.br` (gestor).
**A senha de cada um é definida no primeiro login.**

### 4. Google Maps (opcional, recomendado)
Criar chave com **Geocoding API**, **Distance Matrix API** e **Maps JavaScript API**
e informá-la no app em **Mais → Configurações** (gestor). Sem chave o app funciona
com distâncias estimadas (haversine ×1,3). Use **Mais → Geocodificar clientes** para
posição precisa (status por cliente: preciso / aproximado / falhou).

### 5. Celular
Abrir o site → "Adicionar à tela inicial" (PWA instalável). Funciona 100% sem sinal:
as escrituras ficam na fila local e sincronizam sozinhas ao voltar a conexão, com
indicador visual no topo.

> Nota de segurança: o padrão inicial são regras abertas no Firestore (equivalente
> ao desenho original — o filtro por representante é feito no app). Para endurecer,
> integre Firebase Auth e restrinja as regras por `request.auth`.

## Regras de negócio (no app, valem online e offline)

- **Comissão**: 15% no primeiro pedido — cliente sem qualquer sinal de compra
  anterior (sem último pedido, sem seed da listagem, status legado 'Novo') — e 10%
  na reposição; percentuais configuráveis por representante.
  `comissao_recebimento_em = data + recebimento_dias` (Clamed = 45; demais = 0).
  Calculada sobre o **valor efetivamente vendido**: (colocadas − devolvidas −
  quebradas) × preço da tabela do pedido.
- **Conclusão de pedido**: soma os itens, registra/atualiza a visita do dia
  (`fez_pedido`, valor vendido → comissão), alimenta `visitas.produtos` e
  `cliente_produtos` (linhas que trabalha) e resolve pendência de reencaixe.
- **Visita realizada**: atualiza última visita / último pedido / próxima prevista
  pelo ciclo individual do cliente.

## Configurável no Admin (nunca hardcoded)

Preços e unidades por placa de cada produto · % comissão novo/reposição e custo/km
por vendedor · prazo de recebimento por cliente · condições de pagamento ·
observações do rodapé do PDF · visitas/dia (6–8) · regra de pernoite (150 km / 60 km) ·
desvio máximo de reencaixe · início do ciclo de 7 semanas.

## Testes

```bash
node tests/calc.test.cjs     # cálculos: placas P/G, devolução+quebra, comissão, ciclo, rota, pernoite
node tests/e2e.offline.cjs   # Chromium: instalação → login → pedido → assinatura → PDF → sync
```

Cobrem a lista obrigatória da especificação: busca parcial (CNPJ/nome/cidade), troca
de tabela refletindo preços, placa P vs G, devolução+quebra abatendo antes da
comissão (48−5−2=41), 15% no 1º pedido / 10% na reposição, +45d só para Clamed,
assinatura salva e embutida no PDF, pedido consultável depois, reencaixe de
pendente, funcionamento offline com sincronização posterior e a primeira instalação
completa (255 clientes no Firestore simulado + primeiro login definindo senha).
