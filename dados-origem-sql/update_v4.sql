-- ============================================================
-- ATUALIZAÇÃO v4 — Talão de Pedido Digital (Módulo B) + apoios
-- Evolui schema_v2/migracao_v2/update_v3 SEM recriar nada.
-- Rode DEPOIS dos três, de uma vez, no SQL Editor do Supabase.
-- ============================================================

-- ─────────────────────────────────────────────
-- 1. Campos que o talão precisa e a v2 não tinha
-- ─────────────────────────────────────────────
alter table representantes add column if not exists contato text;  -- sai impresso no talão

alter table clientes add column if not exists contato text;
alter table clientes add column if not exists celular text;
alter table clientes add column if not exists inscricao_estadual text;
alter table clientes add column if not exists rede text;
update clientes set rede = 'Clamed' where rede is null and nome ilike '%clamed%';

-- ─────────────────────────────────────────────
-- 2. Produtos: expandir a tabela do update_v3 (não criar paralela)
--    código do talão + preços das 2 tabelas + unidades por placa P/G
-- ─────────────────────────────────────────────
alter table produtos add column if not exists codigo text;
alter table produtos add column if not exists variacao text;
alter table produtos add column if not exists linha text;
alter table produtos add column if not exists preco_simples numeric(10,2);
alter table produtos add column if not exists preco_lucro numeric(10,2);
alter table produtos add column if not exists unid_placa_p integer;
alter table produtos add column if not exists unid_placa_g integer;

-- variações (Classic/M.Encantado, Prata/Dourado) repetem o nome
alter table produtos drop constraint if exists produtos_nome_key;
create unique index if not exists uq_produtos_codigo_variacao
  on produtos (codigo, coalesce(variacao, ''));

-- Catálogo real do talão físico. Preços não informados = NULL
-- (o app bloqueia o lançamento e pede cadastro no Admin — nunca inventa).
insert into produtos (codigo, nome, variacao, linha, preco_simples, preco_lucro, unid_placa_p, unid_placa_g) values
  ('4109', 'BRAG — Argolinha',                      null,           'Argolinhas',    12.60, 14.50, 48, 72),
  ('3719', 'BRAG Zircônia — Argolinha de Zircônia', null,           'Argolinhas',    null,  null,  48, 72),
  ('4031', 'BRG — Brinco Grande',                   null,           'Brincos',       null,  null,  32, 48),
  ('4017', 'BRP — Brinco Pequeno',                  'Classic',      'Brincos',       8.99,  10.25, 64, 99),
  ('4017', 'BRP — Brinco Pequeno',                  'M. Encantado', 'Brincos',       null,  null,  64, 99),
  ('8073', 'BRP Ponto de Luz — Zircônia',           null,           'Brincos',       12.60, 14.50, 64, 99),
  ('8790', 'DIVA — Gargantilha Coleção Diva',       null,           'Gargantilhas',  null,  null,  48, 72),
  ('2927', 'FOR MEN — Gargantilha Col. For Men',    null,           'Gargantilhas',  null,  null,  64, 99),
  ('8585', 'GAR PARIS — Gargantilha Paris',         null,           'Gargantilhas',  26.50, 29.90, 16, 22),
  ('8677', 'LUXO — Brinco Argolinha',               'Prata',        'Luxo',          25.50, 29.90, 48, 72),
  ('8677', 'LUXO — Brinco Argolinha',               'Dourado',      'Luxo',          25.50, 29.90, 48, 72),
  ('8820', 'NEW YORK — Gargantilha Col. New York',  null,           'Gargantilhas',  30.95, 34.95, 16, 22),
  ('8806', 'PRATA 925 — Brinco Coleção Prata',      null,           'Prata 925',     null,  null,  48, 72),
  ('8899', 'PRATA 925 — Gargantilha Coleção Prata', null,           'Prata 925',     null,  null,  16, 22),
  ('4062', 'PULA — Pulseira Adulta',                null,           'Pulseiras',     22.10, 25.25, 16, 22),
  ('4024', 'PUL — Pulseira Infantil',               null,           'Pulseiras',     16.50, 18.80, 16, 22),
  ('5300', 'TORNOZELEIRA',                          null,           'Tornozeleiras', null,  null,  16, 22)
on conflict (codigo, coalesce(variacao, '')) do nothing;

-- ─────────────────────────────────────────────
-- 3. Visitas: % aplicado (auditoria) e vínculo com o pedido
-- ─────────────────────────────────────────────
alter table visitas add column if not exists comissao_pct numeric(5,2);
alter table visitas add column if not exists pedido_id uuid;

-- Evolui o trigger do update_v3 para também gravar o % aplicado
-- (mesma regra de cliente novo: qualquer sinal de compra anterior = reposição)
create or replace function fn_calcular_comissao()
returns trigger language plpgsql as $$
declare
  pct_repo numeric(5,2);
  pct_novo numeric(5,2);
  ja_comprou boolean;
  prazo integer;
begin
  select comissao_pct, comissao_pct_novo into pct_repo, pct_novo
    from representantes where id = new.representante_id;

  select coalesce(
           (c.ultimo_pedido_em is not null)
           or (c.seed_dias_sem_pedido is not null)
           or (c.status_legado is not null and c.status_legado <> 'Novo')
           or exists (
             select 1 from visitas v
             where v.cliente_id = new.cliente_id and v.fez_pedido
               and v.id is distinct from new.id
           ), false),
         coalesce(c.recebimento_dias, 0)
    into ja_comprou, prazo
    from clientes c where c.id = new.cliente_id;

  new.comissao_pct := case when ja_comprou
    then coalesce(pct_repo, 10.00) else coalesce(pct_novo, 15.00) end;
  new.comissao_valor := round(coalesce(new.valor_pedido, 0) * new.comissao_pct / 100.0, 2);
  new.comissao_recebimento_em := new.data_visita + (prazo || ' days')::interval;
  return new;
end $$;

-- Visita realizada também resolve pendência aberta do cliente (fila de reencaixe)
create or replace function fn_atualizar_cliente_pos_visita()
returns trigger language plpgsql as $$
begin
  if new.realizada then
    update clientes set
      ultima_visita_em = greatest(coalesce(ultima_visita_em, new.data_visita), new.data_visita),
      ultimo_pedido_em = case when new.fez_pedido
        then greatest(coalesce(ultimo_pedido_em, new.data_visita), new.data_visita)
        else ultimo_pedido_em end,
      proxima_visita_prevista = new.data_visita + (frequencia_dias || ' days')::interval
    where id = new.cliente_id;
    update pendencias set resolvida_em = now()
      where cliente_id = new.cliente_id and resolvida_em is null;
  end if;
  return new;
end $$;

-- cobre também o caso do pedido atualizar uma visita já existente no dia
drop trigger if exists trg_visitas_atualiza_cliente_upd on visitas;
create trigger trg_visitas_atualiza_cliente_upd
  after update on visitas
  for each row execute function fn_atualizar_cliente_pos_visita();

-- ─────────────────────────────────────────────
-- 4. Fila de pendentes (reencaixe) e pernoites ("📍 Estou aqui")
-- ─────────────────────────────────────────────
create table if not exists pendencias (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete cascade,
  representante_id uuid references representantes(id) on delete cascade,
  motivo text not null,                  -- fechado | ausente | sem_tempo | reagendado
  criado_em timestamptz default now(),
  resolvida_em timestamptz               -- null = ainda na fila
);
create index if not exists idx_pendencias_abertas on pendencias(representante_id) where resolvida_em is null;

create table if not exists pernoites (
  id uuid primary key default gen_random_uuid(),
  representante_id uuid not null references representantes(id) on delete cascade,
  data date not null,                    -- noite de <data>; partida da manhã seguinte
  lat numeric(10,7) not null,
  lng numeric(10,7) not null,
  local_desc text,
  criado_em timestamptz default now(),
  unique (representante_id, data)
);

-- ─────────────────────────────────────────────
-- 5. Configurações (nada de regra hardcoded)
-- ─────────────────────────────────────────────
create table if not exists configuracoes (
  chave text primary key,
  valor jsonb not null,
  descricao text
);

insert into configuracoes (chave, valor, descricao) values
  ('ciclo_inicio',         '"2026-01-05"', 'Segunda-feira da semana 1 do ciclo de 7 semanas'),
  ('visitas_dia_min',      '6',            'Mínimo de visitas/dia na redistribuição mensal'),
  ('visitas_dia_max',      '8',            'Máximo de visitas/dia'),
  ('pernoite_dist_km',     '150',          'Só sugerir pernoite se último cliente > X km da base'),
  ('pernoite_economia_km', '60',           'Só sugerir pernoite se economizar > X km vs voltar'),
  ('reencaixe_detour_km',  '15',           'Desvio máximo (km) p/ reencaixar pendente na rota do dia'),
  ('alerta_vencendo_dias', '7',            'Antecedência do alerta "vence em Xd"'),
  ('haversine_fator',      '1.3',          'Fator de correção do haversine offline'),
  ('velocidade_media_kmh', '60',           'Para estimar tempo de rota'),
  ('google_maps_key',      '""',           'Chave das APIs Google Maps (Geocoding/Distance Matrix/JS)'),
  ('condicoes_pagamento',  '["À vista","28 dias","30 dias","45 dias"]', 'Opções do campo Condição de Pagamento (editável)'),
  ('pdf_observacoes',      '"A troca de peças com defeito será efetuada mediante a guarda das partes trocadas. O display é entregue em regime de comodato civil, não está incluso no valor do pedido e deverá ser devolvido, sob pena de cobrança."', 'Observações padrão do rodapé do talão/PDF')
on conflict (chave) do nothing;

-- ─────────────────────────────────────────────
-- 6. PEDIDOS (talão digital)
-- ─────────────────────────────────────────────
create table if not exists pedidos (
  id uuid primary key default gen_random_uuid(),
  numero bigint generated by default as identity unique,
  cliente_id uuid not null references clientes(id),
  representante_id uuid not null references representantes(id),
  data_pedido date not null default current_date,
  tabela text not null check (tabela in ('simples', 'lucro')),
  condicao_pagamento text,
  status text not null default 'rascunho' check (status in ('rascunho', 'concluido', 'cancelado')),
  total_unid_colocadas integer not null default 0,
  total_unid_dev_display integer not null default 0,
  total_unid_dev_quebrada integer not null default 0,
  total_unid_vendidas integer not null default 0,
  total_valor numeric(12,2) not null default 0,   -- valor EFETIVAMENTE vendido
  assinatura text,                                -- PNG base64 — vínculo permanente
  assinado_em timestamptz,
  visita_id uuid references visitas(id) on delete set null,
  observacoes text,
  criado_em timestamptz default now()
);
create index if not exists idx_pedidos_cliente on pedidos(cliente_id);
create index if not exists idx_pedidos_data on pedidos(data_pedido);

create table if not exists pedido_itens (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references pedidos(id) on delete cascade,
  produto_id uuid not null references produtos(id),
  tamanho text not null check (tamanho in ('P', 'G')),
  placas integer not null default 1 check (placas > 0),
  unid_por_placa integer not null,       -- snapshot do cadastro na hora
  unid_colocadas integer not null,       -- placas × unid_por_placa
  dev_display integer not null default 0,   -- devolução: subcoluna Display
  dev_quebrada integer not null default 0,  -- devolução: subcoluna Quebrada
  unid_vendidas integer not null,        -- colocadas − display − quebrada
  preco_unit numeric(10,2) not null,     -- snapshot do preço da tabela usada
  valor_total numeric(12,2) not null,    -- vendidas × preço
  criado_em timestamptz default now()
);
create index if not exists idx_itens_pedido on pedido_itens(pedido_id);

-- ─────────────────────────────────────────────
-- 7. Conclusão do pedido → integração com o Módulo A
-- Fluxo do app: insert pedido (rascunho) → insert itens →
-- update status='concluido' (com assinatura). Este trigger então:
--   1. recalcula os totais a partir dos itens
--   2. registra/atualiza a visita do dia (fez_pedido, valor vendido)
--      → dispara fn_calcular_comissao (15%/10% + prazo Clamed)
--   3. grava as linhas em visitas.produtos e em cliente_produtos
-- ─────────────────────────────────────────────
create or replace function fn_pedido_concluir()
returns trigger language plpgsql as $$
declare
  v_visita_id uuid;
  v_produtos jsonb;
begin
  if new.status = 'concluido' and coalesce(old.status, '') <> 'concluido' then
    select coalesce(sum(unid_colocadas), 0), coalesce(sum(dev_display), 0),
           coalesce(sum(dev_quebrada), 0), coalesce(sum(unid_vendidas), 0),
           coalesce(sum(valor_total), 0),
           coalesce(jsonb_agg(distinct produto_id), '[]'::jsonb)
      into new.total_unid_colocadas, new.total_unid_dev_display,
           new.total_unid_dev_quebrada, new.total_unid_vendidas,
           new.total_valor, v_produtos
      from pedido_itens where pedido_id = new.id;

    if new.assinado_em is null and new.assinatura is not null then
      new.assinado_em := now();
    end if;

    select id into v_visita_id from visitas
      where cliente_id = new.cliente_id and data_visita = new.data_pedido
      order by criado_em desc limit 1;

    if v_visita_id is null then
      insert into visitas (cliente_id, representante_id, data_visita, realizada,
                           fez_pedido, pedido_id, valor_pedido, produtos)
      values (new.cliente_id, new.representante_id, new.data_pedido, true,
              true, new.id, new.total_valor, v_produtos)
      returning id into v_visita_id;
    else
      update visitas
         set realizada = true, fez_pedido = true, pedido_id = new.id,
             valor_pedido = new.total_valor, produtos = v_produtos
       where id = v_visita_id;
    end if;
    new.visita_id := v_visita_id;

    insert into cliente_produtos (cliente_id, produto_id, representante_id)
    select distinct new.cliente_id, i.produto_id, new.representante_id
      from pedido_itens i where i.pedido_id = new.id
    on conflict do nothing;
  end if;
  return new;
end $$;

drop trigger if exists trg_pedido_concluir on pedidos;
create trigger trg_pedido_concluir
  before update on pedidos
  for each row execute function fn_pedido_concluir();

-- ─────────────────────────────────────────────
-- 8. RLS das tabelas novas (mesmo padrão aberto do schema_v2;
--    migração p/ Supabase Auth documentada lá)
-- ─────────────────────────────────────────────
alter table pendencias enable row level security;
alter table pernoites enable row level security;
alter table configuracoes enable row level security;
alter table pedidos enable row level security;
alter table pedido_itens enable row level security;

create policy p_pend_all on pendencias    for all using (true) with check (true);
create policy p_pern_all on pernoites     for all using (true) with check (true);
create policy p_conf_all on configuracoes for all using (true) with check (true);
create policy p_ped_all  on pedidos       for all using (true) with check (true);
create policy p_pit_all  on pedido_itens  for all using (true) with check (true);
