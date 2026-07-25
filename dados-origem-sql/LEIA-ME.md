# Dados de origem (referência histórica)

Estes SQLs eram a base pensada para Supabase/PostgreSQL. O sistema roda em
**Firebase (Firestore)** — os dados e regras daqui foram convertidos:

- os **255 clientes reais**, usuários e catálogo viraram `public/js/seed.js`
  (carregados pelo botão "Primeira instalação" da tela de login);
- as regras dos triggers (comissão 15%/10%, prazo Clamed +45d, conclusão de
  pedido → visita, ciclo do cliente) rodam no app (`calc.js` / `pedido.js`),
  como já rodavam no modo offline.

Mantidos apenas como documentação da regra de negócio e fonte dos dados.
