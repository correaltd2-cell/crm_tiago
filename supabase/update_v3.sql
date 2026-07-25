-- ============================================================
-- ATUALIZAÇÃO v3 — Produtos, comissão dupla e prazo Clamed
-- Rode DEPOIS do schema_v2.sql e da migracao_clientes_v2.sql
-- (no SQL Editor do Supabase, tudo de uma vez)
-- ============================================================

-- ─────────────────────────────────────────────
-- 1. LINHAS DE PRODUTO (coleções de brincos)
-- ─────────────────────────────────────────────
create table produtos (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  ativo boolean default true,
  criado_em timestamptz default now()
);

-- Linhas que cada cliente trabalha
create table cliente_produtos (
  cliente_id uuid not null references clientes(id) on delete cascade,
  produto_id uuid not null references produtos(id) on delete cascade,
  representante_id uuid not null references representantes(id) on delete cascade,
  criado_em timestamptz default now(),
  primary key (cliente_id, produto_id)
);
create index idx_cliprod_rep on cliente_produtos(representante_id);

alter table produtos enable row level security;
alter table cliente_produtos enable row level security;
create policy p_prod_all on produtos for all using (true) with check (true);
create policy p_cliprod_all on cliente_produtos for all using (true) with check (true);

-- Linhas vendidas em cada visita (array de produto_ids)
alter table visitas add column produtos jsonb;

-- ─────────────────────────────────────────────
-- 2. COMISSÃO DUPLA: 15% primeiro pedido, 10% reposição
-- ─────────────────────────────────────────────
alter table representantes add column comissao_pct_novo numeric(5,2) not null default 15.00;
-- (comissao_pct existente = % de reposição, já em 10.00)

-- ─────────────────────────────────────────────
-- 3. PRAZO DE RECEBIMENTO (Clamed = 45 dias; demais = 0)
-- ─────────────────────────────────────────────
alter table clientes add column recebimento_dias integer not null default 0;
alter table visitas add column comissao_recebimento_em date;

-- Marca as farmácias Clamed automaticamente
update clientes set recebimento_dias = 45 where nome ilike '%clamed%';

-- ─────────────────────────────────────────────
-- 4. TRIGGER DE COMISSÃO ATUALIZADO
--    Regra de "cliente novo": nunca registrou pedido no sistema,
--    não tem último pedido conhecido, não tem histórico da listagem
--    New Star (seed) e no sistema antigo estava marcado como "Novo"
--    (ou nem existia). Qualquer sinal de compra anterior = reposição.
-- ─────────────────────────────────────────────
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

  new.comissao_valor := round(
    coalesce(new.valor_pedido, 0) *
    (case when ja_comprou then coalesce(pct_repo, 10.00) else coalesce(pct_novo, 15.00) end)
    / 100.0, 2);

  new.comissao_recebimento_em := new.data_visita + (prazo || ' days')::interval;
  return new;
end $$;

-- Recria o trigger cobrindo também INSERT sem valor (pra sempre preencher o prazo)
drop trigger if exists trg_visitas_comissao on visitas;
create trigger trg_visitas_comissao
  before insert or update of valor_pedido on visitas
  for each row execute function fn_calcular_comissao();

-- ─────────────────────────────────────────────
-- 5. Algumas linhas de produto iniciais (edite/adicione pelo app)
-- ─────────────────────────────────────────────
-- insert into produtos (nome) values ('Coleção Exemplo 1'), ('Coleção Exemplo 2');
-- ↑ deixado comentado: o vendedor cadastra os nomes reais pelo próprio app
