# Templates para aprovar no Meta (WhatsApp Manager → Modelos de mensagem)

Idioma: **Português (BR)** · Submeter com os nomes EXATOS abaixo (o backend chama por nome).

---

## 1. `aviso_secretaria` — Categoria: UTILIDADE
Aviso interno para a secretária do hospital quando um paciente é qualificado.

```
Novo paciente qualificado para consulta com o Dr. Tiago 👁️

Nome: {{1}}
WhatsApp: {{2}}
Resumo: {{3}}

Por favor, entre em contato para confirmar o agendamento da avaliação.
```

## 2. `retomada_atendimento` — Categoria: MARKETING
Reabre a conversa quando a janela de 24h fechou.

```
Olá, {{1}}! Aqui é do consultório do Dr. Tiago Franco Martins. Vi que conversamos sobre a sua avaliação e queria saber se posso te ajudar a dar o próximo passo. Posso continuar por aqui?
```
Botões (resposta rápida): `Sim, pode continuar` · `Agora não`

## 3. `reactivation_2h` — Categoria: MARKETING
```
Oi, {{1}}! Tudo bem? Ficou alguma dúvida específica que gostaria de saber?
```

## 4. `reactivation_2d` — Categoria: MARKETING
```
Oi, {{1}}! Continuo por aqui à disposição para conversar sobre a blefaroplastia, viu?
```

## 5. `reactivation_15d` — Categoria: MARKETING
```
Oi, {{1}}! Vou encerrar o atendimento por aqui, mas fico à disposição para qualquer dúvida no futuro. Foi um prazer falar com você!
```

### Observações sobre a cadência de reativação
- Cadência ÚNICA e simples: **2 horas → 2 dias → 15 dias (encerramento)**. Sem duplicação, sem repetição de conteúdo.
- Dispara automaticamente sempre que o lead fica em silêncio (Novo Lead, Em Atendimento ou Follow-up) — não depende de arrastar o card manualmente.
- Tom propositalmente leve, simples e sem termos clínicos — apropriado para saúde e conforme o CFM (sem preço, sem promessa, sem insistência).
- A menção de especialidade (2 dias) é sutil; não há gatilho de urgência repetido — a menção à agenda foi removida para evitar repetição/comercial excessivo.
- Mensagens FIXAS (não geradas por IA) — controle de conteúdo é prioridade na área da saúde.
- Assim que o paciente responde a qualquer uma delas, a conversa volta para a Maia normalmente e o relógio zera.
