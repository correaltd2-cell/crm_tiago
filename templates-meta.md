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

## 3. `followup_d2` — Categoria: MARKETING
```
Oi, {{1}}! Aqui é do consultório do Dr. Tiago. Passando para saber se ficou alguma dúvida sobre a sua avaliação ou sobre o procedimento. Estou à disposição para te ajudar. 😊
```
Botões: `Tenho uma dúvida` · `Quero agendar`

## 4. `followup_d7` — Categoria: MARKETING
```
Olá, {{1}}! Muitas pacientes do Dr. Tiago contam que o que mais mudou depois da blefaroplastia foi se olhar no espelho e ver um olhar descansado de novo. Se quiser, posso te ajudar a organizar a sua avaliação. Faz sentido para você?
```
Botões: `Quero saber mais` · `Agora não`

## 5. `followup_d15` — Categoria: MARKETING
```
Oi, {{1}}! A agenda de avaliações do Dr. Tiago para as próximas semanas está sendo organizada. Se ainda fizer sentido para você, consigo verificar um horário. Posso pedir para a secretária te enviar as opções?
```
Botões: `Sim, pode enviar` · `Agora não`

## 6. `followup_d30` — Categoria: MARKETING
```
Olá, {{1}}! Este é meu último contato por aqui para não te incomodar. 😊 Se em algum momento você quiser retomar a conversa sobre a sua avaliação com o Dr. Tiago, é só me chamar nesta conversa. Será um prazer te atender!
```

---

### Observações
- Templates de MARKETING têm custo por envio e podem levar de minutos a horas para aprovar.
- Se algum for reprovado, ajustar levemente o texto e reenviar (evitar promessas de resultado — o texto acima já respeita as regras de publicidade médica do CFM: sem antes/depois, sem preço, sem garantia de resultado).
- O nome do template no Meta precisa ser idêntico ao usado no código (`followup_d2`, etc.).

---

## Templates de reativação por inatividade (para clientes em API Oficial)

## 7. `reactivation_2h` — Categoria: MARKETING
```
Oi, {{1}}! Tudo bem? Ficou alguma dúvida?
```

## 8. `reactivation_24h` — Categoria: MARKETING
```
Oi, {{1}}! Continuo por aqui à disposição, viu? Se precisar de algo é só chamar.
```

## 9. `reactivation_72h` — Categoria: MARKETING
```
Oi, {{1}}! Passando só para lembrar que sigo à disposição por aqui, tá bom?
```

## 10. `reactivation_15d` — Categoria: MARKETING
```
Oi, {{1}}! Vou encerrar o atendimento por aqui, mas fico à disposição para qualquer dúvida no futuro. Foi um prazer falar com você!
```

### Observações sobre a cadência de reativação
- Tom propositalmente leve, simples e sem termos clínicos — apropriado para saúde e conforme o CFM (sem preço, sem promessa, sem insistência).
- Retomadas curtas e variadas entre si, sem repetir a mesma oferta em cada etapa — evita soar como script de call center.
- Mensagens FIXAS (não geradas por IA) nesta cadência específica — controle de conteúdo é prioridade aqui.
- Cadência completa: 2h → 24h → 72h → 15 dias (encerramento educado). Zera e recomeça se o paciente responder a qualquer momento.
