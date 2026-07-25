-- ============================================================
-- NEW STAR — MIGRAÇÃO DE CLIENTES V2 (2º arquivo)
-- ============================================================
-- ⚠️ ATENÇÃO: o arquivo original com os 255 clientes reais NÃO foi
-- anexado ao repositório. Este arquivo é o TEMPLATE no formato
-- esperado pelo schema_v2.sql. Duas formas de carregar a base real:
--
--   1) Colar aqui os INSERTs reais seguindo o modelo abaixo e rodar
--      no SQL Editor do Supabase; ou
--   2) Usar a IMPORTAÇÃO CSV/EXCEL do próprio app (Admin → Clientes
--      → Importar CSV), que tem mapeamento de colunas e já grava
--      semana/dia do ciclo, rede e prazo Clamed.
--
-- Colunas do ciclo: semana_ciclo 1–7 · dia_semana 1=segunda … 6=sábado
-- ============================================================

-- Modelo de INSERT (substituir pelos 255 clientes reais):
insert into clientes
  (representante_id, nome, cnpj, contato, telefone, celular, email,
   endereco, bairro, cidade, uf, cep, inscricao_estadual,
   rede, semana_ciclo, dia_semana, frequencia_dias)
select r.id, c.*
from (values
  -- ('FARMÁCIA EXEMPLO LTDA', '00.000.000/0001-00', 'Fulano', '(49) 3000-0000', '(49) 99000-0000', 'contato@exemplo.com',
  --  'Rua Principal, 100', 'Centro', 'Chapecó', 'SC', '89800-000', 'ISENTO',
  --  null::text, 1, 1, 49)
  ('__EXEMPLO_REMOVER__', null, null, null, null, null,
   null, null, null, null, null, null,
   null, 1, 1, 49)
) as c(nome, cnpj, contato, telefone, celular, email,
       endereco, bairro, cidade, uf, cep, inscricao_estadual,
       rede, semana_ciclo, dia_semana, frequencia_dias)
cross join (select id from representantes where email = 'denilson@newstar.com.br') r
where c.nome <> '__EXEMPLO_REMOVER__';

-- Rede Clamed: comissão recebida somente 45 dias após o pedido.
-- Rodar SEMPRE após carregar os clientes (a importação CSV do app já faz isso):
update clientes
   set recebimento_dias = 45
 where rede is not null and upper(rede) like '%CLAMED%';

-- Demais clientes recebem no mês (recebimento_dias = 0, default do schema).
