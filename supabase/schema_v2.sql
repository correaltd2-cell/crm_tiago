-- ============================================================
-- SISTEMA DE GESTÃO DE REPRESENTANTES — NEW STAR
-- Schema v2 (auditado e corrigido) — rode este arquivo inteiro
-- de uma vez no SQL Editor do Supabase.
-- ============================================================
-- Correções vs v1:
--  [FIX 1] Comissão via trigger (lê comissao_pct do representante,
--          não mais 10% hardcoded no banco)
--  [FIX 2] RLS com policies criadas (v1 habilitava RLS sem policy
--          nenhuma = app bloqueado)
--  [FIX 3] View dashboard sem produto cartesiano (v1 somava errado)
--  [FIX 4] Campos-semente do aprendizado (dias_sem_visita/pedido
--          vindos da listagem New Star)
--  [FIX 5] Unique constraint por representante+cnpj (protege o
--          cruzamento com a lista completa)
--  [FIX 6] Trigger de atualizado_em
-- ============================================================

-- ─────────────────────────────────────────────
-- 1. REPRESENTANTES
-- ─────────────────────────────────────────────
create table representantes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  email text unique not null,
  senha_hash text not null,
  papel text not null default 'vendedor' check (papel in ('vendedor', 'gestor')),
  comissao_pct numeric(5,2) not null default 10.00,
  custo_km numeric(6,2) default 1.20,     -- custo médio por km (combustível+desgaste) p/ estimativa de rota
  cidade_base text,
  lat_base numeric(10,7),
  lng_base numeric(10,7),
  ativo boolean default true,
  criado_em timestamptz default now()
);

-- ─────────────────────────────────────────────
-- 2. CLIENTES
-- ─────────────────────────────────────────────
create table clientes (
  id uuid primary key default gen_random_uuid(),
  representante_id uuid not null references representantes(id) on delete cascade,

  nome text not null,
  razao_social text,
  cnpj_cpf text,
  telefone text,
  email text,

  endereco text,
  bairro text,
  cidade text not null,
  uf text not null,
  cep text,

  lat numeric(10,7),
  lng numeric(10,7),
  geocoding_status text default 'pendente' check (geocoding_status in ('pendente', 'preciso', 'aproximado', 'falhou')),
  geocoding_atualizado_em timestamptz,

  -- Frequência e aprendizado
  frequencia_dias integer default 60,
  frequencia_auto boolean default true,
  ultima_visita_em date,
  ultimo_pedido_em date,
  proxima_visita_prevista date,
  -- Semente vinda da listagem New Star (Dias S/Visita e Dias S/Pedido no dia da importação)
  seed_dias_sem_visita integer,
  seed_dias_sem_pedido integer,
  seed_data_referencia date,              -- data do relatório de origem (ex: 2026-03-24)

  regiao text,
  dia_semana_padrao text,
  semana_padrao integer,

  status text default 'ativo' check (status in ('ativo', 'inativo', 'prospect')),
  status_legado text,
  observacoes text,

  criado_em timestamptz default now(),
  atualizado_em timestamptz default now(),

  -- [FIX 5] impede duplicar o mesmo cliente no cruzamento de listas
  unique (representante_id, cnpj_cpf)
);

create index idx_clientes_representante on clientes(representante_id);
create index idx_clientes_geo on clientes(lat, lng);
create index idx_clientes_proxima_visita on clientes(proxima_visita_prevista);

-- [FIX 6] atualizado_em automático
create or replace function fn_touch_atualizado_em()
returns trigger language plpgsql as $$
begin
  new.atualizado_em = now();
  return new;
end $$;

create trigger trg_clientes_touch
  before update on clientes
  for each row execute function fn_touch_atualizado_em();

-- ─────────────────────────────────────────────
-- 3. VISITAS
-- ─────────────────────────────────────────────
create table visitas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete cascade,
  representante_id uuid not null references representantes(id) on delete cascade,
  rota_id uuid,                            -- vínculo opcional com a rota do dia

  data_visita date not null default current_date,
  realizada boolean default true,
  motivo_falta text,

  fez_pedido boolean default false,
  valor_pedido numeric(12,2) default 0,
  comissao_valor numeric(12,2) default 0,  -- [FIX 1] preenchido por trigger com o % do representante

  observacoes text,
  lat_visita numeric(10,7),
  lng_visita numeric(10,7),

  criado_em timestamptz default now()
);

create index idx_visitas_cliente on visitas(cliente_id);
create index idx_visitas_representante_data on visitas(representante_id, data_visita);

-- [FIX 1] Comissão calculada pelo % configurado no representante
create or replace function fn_calcular_comissao()
returns trigger language plpgsql as $$
declare
  pct numeric(5,2);
begin
  select comissao_pct into pct from representantes where id = new.representante_id;
  new.comissao_valor = round(coalesce(new.valor_pedido, 0) * coalesce(pct, 10.00) / 100.0, 2);
  return new;
end $$;

create trigger trg_visitas_comissao
  before insert or update of valor_pedido on visitas
  for each row execute function fn_calcular_comissao();

-- Mantém ultima_visita_em / ultimo_pedido_em / proxima_visita_prevista do cliente em dia
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
  end if;
  return new;
end $$;

create trigger trg_visitas_atualiza_cliente
  after insert on visitas
  for each row execute function fn_atualizar_cliente_pos_visita();

-- ─────────────────────────────────────────────
-- 4. DESPESAS
-- ─────────────────────────────────────────────
create table despesas (
  id uuid primary key default gen_random_uuid(),
  representante_id uuid not null references representantes(id) on delete cascade,

  data_despesa date not null default current_date,
  tipo text not null check (tipo in ('combustivel', 'pedagio', 'hospedagem', 'alimentacao', 'manutencao', 'outro')),
  descricao text,
  valor numeric(12,2) not null,
  km_rodado numeric(8,1),
  comprovante_url text,

  criado_em timestamptz default now()
);

create index idx_despesas_representante_data on despesas(representante_id, data_despesa);

-- ─────────────────────────────────────────────
-- 5. ROTAS
-- ─────────────────────────────────────────────
create table rotas (
  id uuid primary key default gen_random_uuid(),
  representante_id uuid not null references representantes(id) on delete cascade,

  data_rota date not null,
  sequencia jsonb not null,
  ponto_partida_lat numeric(10,7),
  ponto_partida_lng numeric(10,7),
  ponto_partida_tipo text default 'base' check (ponto_partida_tipo in ('base', 'pernoite_anterior', 'localizacao_atual')),

  distancia_total_km numeric(8,1),
  tempo_total_min integer,
  custo_estimado numeric(10,2),

  status text default 'planejada' check (status in ('planejada', 'em_andamento', 'concluida', 'reotimizada')),
  motivo_reotimizacao text,

  criado_em timestamptz default now()
);

create index idx_rotas_representante_data on rotas(representante_id, data_rota);

-- vínculo visitas → rota
alter table visitas
  add constraint fk_visitas_rota foreign key (rota_id) references rotas(id) on delete set null;

-- ─────────────────────────────────────────────
-- 6. [FIX 2] RLS COM POLICIES
-- Estratégia inicial: acesso via anon key com policies abertas
-- (mesmo padrão dos seus outros CRMs — o filtro por representante
-- é feito no app). Quando migrar pra Supabase Auth, troque as
-- policies abertas pelas versões auth.uid() comentadas no final.
-- ─────────────────────────────────────────────
alter table representantes enable row level security;
alter table clientes enable row level security;
alter table visitas enable row level security;
alter table despesas enable row level security;
alter table rotas enable row level security;

create policy p_repr_all on representantes for all using (true) with check (true);
create policy p_cli_all  on clientes       for all using (true) with check (true);
create policy p_vis_all  on visitas        for all using (true) with check (true);
create policy p_desp_all on despesas       for all using (true) with check (true);
create policy p_rota_all on rotas          for all using (true) with check (true);

-- ─────────────────────────────────────────────
-- 7. [FIX 3] VIEW DASHBOARD (sem produto cartesiano)
-- ─────────────────────────────────────────────
create view view_dashboard_representante as
select
  r.id as representante_id,
  r.nome,
  (select count(*) from clientes c where c.representante_id = r.id and c.status = 'ativo') as total_clientes,
  (select count(*) from visitas v where v.representante_id = r.id and v.data_visita = current_date and v.realizada) as visitas_hoje,
  (select count(*) from visitas v where v.representante_id = r.id and v.data_visita >= date_trunc('month', current_date) and v.realizada) as visitas_mes,
  (select coalesce(sum(v.valor_pedido),0) from visitas v where v.representante_id = r.id and v.data_visita >= date_trunc('month', current_date)) as faturamento_mes,
  (select coalesce(sum(v.comissao_valor),0) from visitas v where v.representante_id = r.id and v.data_visita >= date_trunc('month', current_date)) as comissao_mes,
  (select coalesce(sum(d.valor),0) from despesas d where d.representante_id = r.id and d.data_despesa >= date_trunc('month', current_date)) as despesas_mes,
  (select coalesce(sum(d.km_rodado),0) from despesas d where d.representante_id = r.id and d.data_despesa >= date_trunc('month', current_date)) as km_mes,
  (select count(*) from clientes c where c.representante_id = r.id and c.status = 'ativo' and c.proxima_visita_prevista < current_date) as clientes_atrasados
from representantes r
where r.ativo;

-- ─────────────────────────────────────────────
-- 8. POLICIES FUTURAS (Supabase Auth) — referência, NÃO rodar agora
-- ─────────────────────────────────────────────
-- drop policy p_cli_all on clientes;
-- create policy p_cli_own on clientes for all
--   using (representante_id = auth.uid()
--          or exists (select 1 from representantes g where g.id = auth.uid() and g.papel = 'gestor'));
-- (repetir padrão para visitas, despesas, rotas)
