# SISTEMA NEW STAR — ESPECIFICAÇÃO COMPLETA PARA DESENVOLVIMENTO

> Prompt mestre para Claude Code. Leia tudo antes de começar. O sistema tem DOIS módulos
> integrados que compartilham a mesma base: (A) Gestão do Representante e (B) Talão de
> Pedido Digital. Não invente regras de negócio — o que não estiver definido aqui deve
> ficar configurável.

---

## 0. CONTEXTO DO NEGÓCIO

A New Star vende placas de brincos/semijoias em consignação para farmácias no RS/SC/PR.
O representante (Denilson) roda ~255 clientes em ciclos de 7 semanas, deixa placas
prontas nos clientes, e nas visitas seguintes faz a conferência: conta o que vendeu,
recolhe devoluções e quebras, repõe. O gestor (Guilherme) administra tudo.

**Usuários:** vendedores de campo (celular, muitas vezes sem sinal) e gestor (painel).

**Stack alvo:** app web PWA (uso em celular/tablet), Supabase (PostgreSQL) como backend,
Google Maps APIs (Geocoding, Distance Matrix, Maps JavaScript), deploy em Netlify ou
Vercel. Já existem 3 arquivos SQL prontos que DEVEM ser usados como base do banco
(anexados junto): `schema_v2.sql`, `migracao_clientes_v2.sql` (255 clientes reais),
`update_v3.sql`. Evolua a partir deles — não recrie do zero.

---

## 1. MÓDULO A — GESTÃO DO REPRESENTANTE

### 1.1 Login e papéis
- Login por e-mail/senha próprio de cada vendedor; papel `vendedor` ou `gestor`.
- Primeiro login define a senha (registro vem com hash placeholder).
- Do login derivam automaticamente: nome do vendedor, contato, comissões. O vendedor
  NUNCA redigita dados próprios em nenhuma tela.
- Gestor tem seletor para alternar entre representantes e ver tudo consolidado.

### 1.2 Rota e roteirização inteligente (coração do sistema)
- Clientes organizados em ciclo de 7 semanas × dias úteis (dados já vêm na migração).
- Tela "Hoje": o app detecta a data/semana do ciclo e monta o checklist do dia sozinho,
  com barra de progresso (X de Y visitados · %).
- **Motor de otimização**: sequência do dia calculada por Nearest Neighbor + 2-opt sobre
  matriz de distâncias reais (Google Distance Matrix; fallback haversine ×1.3 offline).
  Mostra km total, tempo e custo estimado (km × custo_km do representante). Salva na
  tabela `rotas`.
- **Reotimização automática — 3 gatilhos:**
  1. **Visita não realizada** (com motivo: fechado, ausente, sem tempo, reagendado):
     cliente entra na fila de pendentes e é reencaixado na próxima rota que passar
     perto, priorizando quem está perto de estourar o ciclo. A rota é recalculada
     inteira, não apenas anexada no fim.
  2. **Pernoite mudou**: botão "📍 Estou aqui" grava a posição real como ponto de
     partida do dia seguinte; a rota recalcula a partir dali.
  3. **Virada de mês**: redistribuição completa respeitando frequência individual,
     6–8 visitas/dia (configurável), menor km total.
- Regra de pernoite: só sugerir quando último cliente > 150 km da base E pernoitar
  economiza > 60 km vs voltar (valores configuráveis).

### 1.3 Localização precisa
- Cada cliente geocodificado pelo endereço completo (Google Geocoding), com status
  por cliente: `preciso` (ROOFTOP/RANGE) / `aproximado` / `pendente` / `falhou`.
- Botão de geocodificação em massa no app. Um toque abre o GPS já no destino exato.

### 1.4 Frequência que aprende
- Cada cliente tem ciclo próprio: 30/45/60/90 dias (`frequencia_dias`), com
  `frequencia_auto` para o sistema ajustar sozinho pelo histórico real.
- Sugestões com aceite de 1 toque: comprando toda visita → encurtar ciclo;
  3+ visitas sem pedido → alongar/revisar.
- Alertas preditivos: "vence em Xd" antes de atrasar; "Xd atrasado" depois.
- Registrar visita atualiza automaticamente última visita e próxima prevista (trigger).

### 1.5 Comissões (regras EXATAS — já implementadas nos SQLs)
- **Cliente novo (nunca fez pedido): 15%** no primeiro pedido.
- **Reposição (cliente que já comprou): 10%.**
- Percentuais configuráveis por representante (`comissao_pct_novo`, `comissao_pct`).
- **Prazo de recebimento**: clientes da rede **Clamed** recebem a comissão apenas
  **45 dias** após o pedido (`recebimento_dias = 45`, já marcado na migração);
  demais clientes, no mês. Toda visita grava `comissao_recebimento_em`.
- Dashboard separa **"comissão gerada no mês"** de **"a receber no mês"** (inclui
  Clamed de 45 dias atrás).
- A comissão é calculada por trigger no banco a partir do **valor efetivamente
  vendido** (ver Módulo B — devoluções e quebras abatem antes da comissão).

### 1.6 Despesas de estrada
- Categorias: combustível, pedágio, hospedagem, alimentação, manutenção, outro.
- Km rodado opcional por lançamento → custo real por km calculado no mês.
- Dashboard: total, por categoria, líquido (comissão − despesas).

### 1.7 Linhas de produto e upsell
- Ficha do cliente mostra chips das linhas que ele trabalha (toque marca/desmarca).
- Dica de upsell automática: linhas ativas que o cliente ainda não trabalha.
- Linhas vendidas num pedido viram automaticamente "linhas que trabalha".
- Dashboard: ranking de linhas mais vendidas no mês.

### 1.8 Dashboard
- KPIs do mês: faturamento, comissão gerada, a receber, despesas, líquido, km,
  visitas hoje/mês, conversão (visitas→pedidos), clientes ativos, atrasados/vencendo.
- Lista de alertas de ciclo clicável (abre a ficha do cliente).

### 1.9 Offline-first (obrigatório)
- Funciona 100% sem sinal: cache local + fila de escrituras pendentes com
  sincronização automática e confirmação visual ao voltar a conexão.
- PWA instalável (manifest + service worker).

---

## 2. MÓDULO B — TALÃO DE PEDIDO DIGITAL

Substitui o talão físico em papel (foto de referência anexada). Preservar a lógica
comercial fielmente; interface moderna, mobile-first, botões grandes, mínimo de
digitação. O vendedor deve abrir um pedido e começar em poucos segundos.

### 2.1 Fluxo completo do pedido
Cliente → Tabela de preço → Placas/produtos → Devoluções → Quebras → Cálculo →
Conferência → Assinatura → Concluído → PDF → Compartilhar/Imprimir

### 2.2 Início do pedido
- "Novo Pedido" abre direto na seleção de cliente (base única, a mesma do Módulo A).
- Busca instantânea e parcial por **CNPJ, nome ou cidade** (poucos caracteres já
  filtram). Ao selecionar, TODOS os dados cadastrais carregam automaticamente
  (nome, CNPJ/CPF, contato, e-mail, telefone, celular, endereço, bairro, cidade,
  UF, CEP, inscrição estadual).
- Vendedor, contato do vendedor e data preenchem sozinhos pelo login.
- Campo "Condição de pagamento" (existe no talão físico — texto/seletor configurável).

### 2.3 Tabelas de preço (seleção obrigatória antes de lançar produtos)
- **Tabela Simples** e **Tabela Lucro Presumido** — preços diferentes por produto.
- A tabela escolhida define os preços do pedido inteiro e fica visível o tempo todo.

### 2.4 Sistema de placas
- Produtos vendidos em **placas prontas** (Pequena/Grande), cada produto com
  quantidade própria de unidades por tamanho — armazenado no cadastro do produto,
  nunca digitado pelo vendedor.

### 2.5 Catálogo real (da foto do talão físico — códigos e unidades por placa)

| Código | Produto | Placa P | Placa G |
|---|---|---|---|
| 4109 | BRAG — Argolinha | 48 | 72 |
| 3719 | BRAG Zircônia — Argolinha de Zircônia | 48 | 72 |
| 4031 | BRG — Brinco Grande | 32 | 48 |
| 4017 | BRP — Brinco Pequeno (variações: Classic / M. Encantado) | 64 | 99 |
| 8073 | BRP Ponto de Luz — Zircônia | 64 | 99 |
| 8790 | DIVA — Gargantilha Coleção Diva | 48 | 72 |
| 2927 | FOR MEN — Gargantilha Col. For Men | 64 | 99 |
| 8585 | GAR PARIS — Gargantilha Paris | 16 | 22 |
| 8677 | LUXO — Brinco Argolinha (variações: Prata / Dourado) | 48 | 72 |
| 8820 | NEW YORK — Gargantilha Col. New York | 16 | 22 |
| 8806 | PRATA 925 — Brinco Coleção Prata | 48 | 72 |
| 8899 | PRATA 925 — Gargantilha Coleção Prata | 16 | 22 |
| 4062 | PULA — Pulseira Adulta | 16 | 22 |
| 4024 | PUL — Pulseira Infantil | 16 | 22 |
| 5300 | TORNOZELEIRA | 16 | 22 |

**Preços conhecidos** (informados pelo cliente; itens fora desta lista ficam com preço
a cadastrar no admin — NÃO inventar):

| Produto | Tabela Simples | Lucro Presumido |
|---|---|---|
| BRAG — Argolinha | R$ 12,60 | R$ 14,50 |
| BRP — Brinco Pequeno Classic | R$ 8,99 | R$ 10,25 |
| BRP — Ponto de Luz Zircônia | R$ 12,60 | R$ 14,50 |
| Gargantilha Paris | R$ 26,50 | R$ 29,90 |
| Coleção Luxo Prata | R$ 25,50 | R$ 29,90 |
| Coleção Luxo Dourado | R$ 25,50 | R$ 29,90 |
| Coleção New York | R$ 30,95 | R$ 34,95 |
| Coleção Pula — Pulseira Adulta | R$ 22,10 | R$ 25,25 |
| Coleção Pulseira Infantil | R$ 16,50 | R$ 18,80 |

> Observação: unificar este catálogo com a tabela `produtos` já criada no
> `update_v3.sql` (linhas de produto) — expandir a tabela com código, preços das duas
> tabelas e unidades por placa P/G, em vez de criar uma tabela paralela.

### 2.6 Lançamento por produto
Para cada item o vendedor informa (com automação máxima):
- Produto (lista/autocomplete) · tamanho da placa (P/G) · **qtde de placas deixadas**
- **Qtde devolvida** — o talão físico separa devolução em **Quebrada** e **Display**;
  manter as duas subcolunas
- O sistema calcula sozinho: unidades colocadas = placas × unidades da placa;
  **unidades efetivamente vendidas = colocadas − devolvidas − quebradas**;
  valor = vendidas × preço unitário da tabela do pedido
- Valor total do pedido = soma dos itens
- Exemplo validador: BRAG placa P (48un), devolveu 5, quebrou 2 → 41 vendidas × preço.

### 2.7 Conferência, assinatura e conclusão
- Tela de resumo com tudo: cliente, vendedor, data, tabela, itens (placas P/G,
  colocadas, devolvidas, quebradas, vendidas, valores), total.
- **Assinatura digital na tela** (dedo/stylus): área de assinatura com limpar/refazer/
  confirmar. A assinatura é salva PERMANENTEMENTE vinculada ao pedido (ex: PNG base64
  no registro). Pedido só vira "Concluído" após assinar.
- Pós-conclusão: **Visualizar PDF · Compartilhar PDF · Imprimir**.

### 2.8 PDF e impressão
- PDF = versão digital do talão: nº do pedido, data, vendedor+contato, dados do
  cliente, tabela usada, itens completos (com devolvidas/quebradas destacadas — a
  fábrica confere devoluções por esse documento), total, observações e a assinatura
  visível.
- Incluir no rodapé as observações padrão do talão físico (troca de peças com defeito
  mediante guarda das partes; display em comodato civil, não incluso no valor, deve
  ser devolvido sob pena de cobrança) — texto configurável no admin.
- Impressão via diálogo nativo do sistema (funciona com impressoras portáteis
  Bluetooth/Wi-Fi registradas no celular/tablet); layout de impressão limpo e legível.

### 2.9 Histórico de pedidos
- Pedidos salvos permanentemente; busca por cliente/data/nº; reabrir, regerar PDF,
  recompartilhar, reimprimir. Assinatura sempre vinculada (prova em divergências).

### 2.10 Integração com o Módulo A (importante!)
- Concluir um pedido registra/atualiza a visita do dia daquele cliente com
  `fez_pedido = true` e `valor_pedido` = valor efetivamente vendido → a comissão
  (15%/10% + prazo Clamed) é calculada em cima desse valor automaticamente.
- As linhas dos produtos do pedido alimentam `cliente_produtos` (linhas que trabalha)
  e o ranking do dashboard.
- Devoluções e quebras aparecem no histórico do cliente (sinal pro aprendizado de
  frequência: muita devolução = ciclo talvez curto demais).

---

## 3. ÁREA ADMINISTRATIVA (gestor)

- **Clientes**: CRUD completo + **importação CSV/Excel com mapeamento de colunas** e
  exportação. (Base inicial: 255 clientes já na migração SQL.)
- **Produtos**: código, nome, variações, preço Tabela Simples, preço Lucro Presumido,
  unidades placa P, unidades placa G, ativo — tudo editável sem mexer em código.
- **Vendedores**: criar/desativar, nome, e-mail/login, contato, % comissão novo/
  reposição, custo por km, cidade base, reset de senha.
- **Configurações**: textos das observações do PDF, condições de pagamento
  disponíveis, limites de visitas/dia, regra de pernoite.

---

## 4. PRIORIDADES (nesta ordem)

1. Facilidade de uso com uma mão no celular
2. Velocidade pra lançar um pedido
3. Cálculos corretos (placas, devoluções, quebras, comissões)
4. Nunca redigitar o que já está cadastrado
5. Offline confiável
6. Assinatura digital permanente
7. PDF completo e impressão
8. Histórico e auditabilidade

## 5. NÃO INVENTAR REGRAS

Preços faltantes, novas condições de pagamento, regras de outras redes com prazo
diferente, quantidades de placa de produtos novos: tudo isso é CONFIGURÁVEL no admin,
nunca hardcoded nem inventado.

## 6. TESTES OBRIGATÓRIOS ANTES DE ENTREGAR

Busca parcial de cliente (CNPJ/nome/cidade) · troca de tabela refletindo preços ·
cálculo placa P vs G · devolução + quebra abatendo corretamente · comissão 15% no 1º
pedido e 10% na reposição · recebimento +45d só em cliente Clamed · assinatura salva e
aparecendo no PDF · compartilhar/imprimir · pedido consultável depois · rota otimizada
com pendente reencaixado · funcionamento offline com sync posterior.
