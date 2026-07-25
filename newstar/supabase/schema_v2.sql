-- ============================================================
-- NEW STAR — SCHEMA V2 (Módulo A: Gestão do Representante)
-- Rodar no SQL Editor do Supabase (1º arquivo)
-- Ordem: schema_v2.sql → migracao_clientes_v2.sql → update_v3.sql
-- ============================================================

create extension if not exists pgcrypto;

-- REPRESENTANTES (vendedores e gestor) ------------------------
create table if not exists representantes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  email text unique not null,
  -- primeiro login define a senha (hash SHA-256 calculado no app)
  senha_hash text not null default 'PLACEHOLDER',
  papel text not null default 'vendedor' check (papel in ('vendedor','gestor')),
  contato text,                                   -- telefone/WhatsApp exibido no talão
  comissao_pct numeric not null default 10,       -- reposição (cliente que já comprou)
  comissao_pct_novo numeric not null default 15,  -- primeiro pedido do cliente
  custo_km numeric not null default 0.80,         -- R$/km para custo estimado da rota
  cidade_base text,
  base_lat double precision,
  base_lng double precision,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

-- Usuários iniciais (senha definida no primeiro login)
insert into representantes (nome, email, papel, contato, cidade_base) values
  ('Denilson',  'denilson@newstar.com.br',  'vendedor', '', 'Chapecó - SC'),
  ('Guilherme', 'guilherme@newstar.com.br', 'gestor',   '', '')
on conflict (email) do nothing;

-- CLIENTES ----------------------------------------------------
create table if not exists clientes (
  id uuid primary key default gen_random_uuid(),
  representante_id uuid references representantes(id),
  nome text not null,
  cnpj text,
  inscricao_estadual text,
  contato text,
  email text,
  telefone text,
  celular text,
  endereco text,
  bairro text,
  cidade text,
  uf text,
  cep text,
  rede text,                                      -- ex.: 'Clamed'
  recebimento_dias int not null default 0,        -- 45 para rede Clamed
  semana_ciclo int check (semana_ciclo between 1 and 7),
  dia_semana int check (dia_semana between 1 and 6),  -- 1=segunda … 6=sábado
  frequencia_dias int not null default 49,        -- ciclo individual: 30/45/60/90…
  frequencia_auto boolean not null default true,  -- sistema pode ajustar sozinho
  ultima_visita date,
  proxima_visita date,
  lat double precision,
  lng double precision,
  geocode_status text not null default 'pendente'
    check (geocode_status in ('pendente','preciso','aproximado','falhou')),
  obs text,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_clientes_rep     on clientes(representante_id);
create index if not exists idx_clientes_ciclo   on clientes(semana_ciclo, dia_semana);
create index if not exists idx_clientes_proxima on clientes(proxima_visita);

-- VISITAS -----------------------------------------------------
create table if not exists visitas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete cascade,
  representante_id uuid references representantes(id),
  data date not null default current_date,
  realizada boolean not null default true,
  motivo text,                                    -- fechado | ausente | sem_tempo | reagendado
  fez_pedido boolean not null default false,
  pedido_id uuid,                                 -- preenchido pelo Módulo B
  valor_pedido numeric not null default 0,        -- valor EFETIVAMENTE vendido
  comissao_pct numeric,
  comissao_valor numeric,
  comissao_recebimento_em date,                   -- data + recebimento_dias do cliente
  obs text,
  created_at timestamptz not null default now()
);

create index if not exists idx_visitas_cliente on visitas(cliente_id);
create index if not exists idx_visitas_data    on visitas(data);
create index if not exists idx_visitas_receb   on visitas(comissao_recebimento_em);

-- PENDÊNCIAS (visitas não realizadas aguardando reencaixe) -----
create table if not exists pendencias (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete cascade,
  representante_id uuid references representantes(id),
  motivo text not null,
  criada_em timestamptz not null default now(),
  resolvida_em timestamptz                        -- null = ainda na fila
);

create index if not exists idx_pendencias_abertas on pendencias(representante_id) where resolvida_em is null;

-- ROTAS (sequência otimizada salva por dia) --------------------
create table if not exists rotas (
  id uuid primary key default gen_random_uuid(),
  representante_id uuid references representantes(id),
  data date not null,
  sequencia jsonb not null default '[]',          -- [{cliente_id, ordem, km_ate}]
  km_total numeric,
  tempo_min numeric,
  custo_estimado numeric,
  partida jsonb,                                  -- {lat,lng,label} — base ou pernoite
  fonte_matriz text default 'haversine',          -- haversine | google
  created_at timestamptz not null default now(),
  unique (representante_id, data)
);

-- PERNOITES ("📍 Estou aqui" — ponto de partida do dia seguinte)
create table if not exists pernoites (
  id uuid primary key default gen_random_uuid(),
  representante_id uuid references representantes(id),
  data date not null,                             -- noite de <data>; vale p/ manhã seguinte
  lat double precision not null,
  lng double precision not null,
  local_desc text,
  created_at timestamptz not null default now(),
  unique (representante_id, data)
);

-- DESPESAS DE ESTRADA ------------------------------------------
create table if not exists despesas (
  id uuid primary key default gen_random_uuid(),
  representante_id uuid references representantes(id),
  data date not null default current_date,
  categoria text not null check (categoria in
    ('combustivel','pedagio','hospedagem','alimentacao','manutencao','outro')),
  valor numeric not null,
  km numeric,                                     -- km rodado opcional → custo real/km
  obs text,
  created_at timestamptz not null default now()
);

create index if not exists idx_despesas_rep_data on despesas(representante_id, data);

-- CONFIGURAÇÕES (nada de regra de negócio hardcoded) -----------
create table if not exists configuracoes (
  chave text primary key,
  valor jsonb not null,
  descricao text
);

insert into configuracoes (chave, valor, descricao) values
  ('ciclo_inicio',          '"2026-01-05"', 'Segunda-feira da semana 1 do ciclo de 7 semanas'),
  ('visitas_dia_min',       '6',            'Mínimo de visitas por dia na redistribuição mensal'),
  ('visitas_dia_max',       '8',            'Máximo de visitas por dia'),
  ('pernoite_dist_km',      '150',          'Só sugerir pernoite se último cliente > X km da base'),
  ('pernoite_economia_km',  '60',           'Só sugerir pernoite se economizar > X km vs voltar'),
  ('reencaixe_detour_km',   '15',           'Desvio máximo (km) para reencaixar pendente na rota do dia'),
  ('alerta_vencendo_dias',  '7',            'Avisar "vence em Xd" com esta antecedência'),
  ('haversine_fator',       '1.3',          'Fator de correção do haversine no modo offline'),
  ('velocidade_media_kmh',  '60',           'Para estimar tempo de rota'),
  ('google_maps_key',       '""',           'Chave das APIs Google Maps (Geocoding/Distance Matrix/JS)'),
  ('condicoes_pagamento',   '["À vista","28 dias","30 dias","45 dias"]', 'Opções do campo Condição de Pagamento (editável)'),
  ('pdf_observacoes',       '"A troca de peças com defeito será efetuada mediante a guarda das partes trocadas. O display é entregue em regime de comodato civil, não está incluso no valor do pedido e deverá ser devolvido, sob pena de cobrança."', 'Observações padrão impressas no rodapé do talão/PDF')
on conflict (chave) do nothing;

-- ============================================================
-- TRIGGERS
-- ============================================================

-- Comissão calculada a partir do valor efetivamente vendido:
--   cliente novo (nunca fez pedido) → comissao_pct_novo (15%)
--   reposição → comissao_pct (10%)
--   recebimento = data + recebimento_dias do cliente (Clamed = 45)
create or replace function fn_visita_comissao() returns trigger as $$
declare
  v_rep representantes%rowtype;
  v_cli clientes%rowtype;
  v_ja_comprou boolean;
begin
  if new.fez_pedido and coalesce(new.valor_pedido, 0) > 0 then
    select * into v_rep from representantes where id = new.representante_id;
    select * into v_cli from clientes where id = new.cliente_id;
    select exists (
      select 1 from visitas v
      where v.cliente_id = new.cliente_id
        and v.fez_pedido
        and coalesce(v.valor_pedido, 0) > 0
        and v.id is distinct from new.id
        and v.data <= new.data
    ) into v_ja_comprou;
    new.comissao_pct := case when v_ja_comprou
      then coalesce(v_rep.comissao_pct, 10)
      else coalesce(v_rep.comissao_pct_novo, 15) end;
    new.comissao_valor := round(new.valor_pedido * new.comissao_pct / 100.0, 2);
    new.comissao_recebimento_em := new.data + coalesce(v_cli.recebimento_dias, 0);
  else
    new.comissao_pct := null;
    new.comissao_valor := null;
    new.comissao_recebimento_em := null;
  end if;
  return new;
end $$ language plpgsql;

drop trigger if exists trg_visita_comissao on visitas;
create trigger trg_visita_comissao
  before insert or update on visitas
  for each row execute function fn_visita_comissao();

-- Registrar visita atualiza última visita e próxima prevista
create or replace function fn_visita_atualiza_cliente() returns trigger as $$
begin
  if new.realizada then
    update clientes c
       set ultima_visita  = new.data,
           proxima_visita = new.data + c.frequencia_dias
     where c.id = new.cliente_id
       and (c.ultima_visita is null or new.data >= c.ultima_visita);
    -- visita realizada resolve pendência aberta do cliente
    update pendencias
       set resolvida_em = now()
     where cliente_id = new.cliente_id and resolvida_em is null;
  end if;
  return new;
end $$ language plpgsql;

drop trigger if exists trg_visita_atualiza_cliente on visitas;
create trigger trg_visita_atualiza_cliente
  after insert or update on visitas
  for each row execute function fn_visita_atualiza_cliente();
