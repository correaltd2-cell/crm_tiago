/* NEW STAR — Suporte com IA (aba Ajuda)
 * Chat que conhece o sistema inteiro e responde em linguagem simples,
 * passo a passo. Usa a API do Gemini (chave em Configurações → IA);
 * sem conexão ou sem chave, responde com o manual embutido. */
(function () {
  'use strict';
  const { $, el, escH, toast } = window.NSUI;
  const DB = window.NSDB;

  // ---------- manual completo do sistema (base de conhecimento) ----------
  const MANUAL = `
VISÃO GERAL
O New Star é o aplicativo da equipe de vendas da New Star (placas de brincos e semijoias em consignação para farmácias). Ele funciona no celular, mesmo sem internet — tudo que se faz sem sinal fica guardado e é enviado sozinho quando a conexão volta (o selo no topo mostra: verde "sincronizado", amarelo "pendente", "offline" sem sinal).

ABAS (barra embaixo da tela)
• 📅 HOJE — a rota do dia. • 🏪 CLIENTES — a lista de clientes. • 🧾 PEDIDOS — os talões feitos. • 📊 PAINEL — os números do mês. • ☰ MAIS — financeiro, ajustes e administração. • 🛟 AJUDA — este suporte.
O botão redondo dourado no canto de baixo à direita abre um NOVO PEDIDO de qualquer tela.

ABA HOJE (rota do dia)
• No alto há botões de dias: Hoje, Amanhã e os próximos dias — toque num deles para ver a rota daquele dia.
• A lista mostra os clientes programados para o dia, na ordem de visita, com barra de progresso (quantos já visitou).
• BOTÃO "OTIMIZAR ROTA": calcula a MELHOR ORDEM de visita entre os clientes do dia, para rodar menos quilômetros. Mostra o total de km, o tempo estimado e o custo (km × custo por km do vendedor). Também tenta encaixar na rota clientes pendentes (que ficaram para trás) e atrasados, se o desvio for pequeno. Com a chave do Google Maps configurada ele usa distâncias reais de estrada; sem ela, usa uma estimativa.
• BOTÃO "ESTOU AQUI": grava a posição do GPS no fim do dia; a rota de amanhã parte desse ponto (pernoite), em vez da base.
• "✎ TROCAR PARTIDA": define de que cidade a rota do dia visto vai partir, SEM precisar de GPS — serve para simular ("amanhã durmo em Joaçaba"): abra o dia no seletor, toque em trocar partida, escolha a cidade na lista e otimize a rota. Para desfazer, toque em "Usar a base".
• VISITAS FORA DA ROTA: se atender um cliente que não estava na rota do dia (pelo pedido ou pelo botão "✔ Registrar visita hoje" na ficha), ele conta no total do dia — a barra mostra, por exemplo, "3 de 6 da rota + 4 fora da rota = 7 atendidos".
• Em cada cliente do dia: 🗺 GPS (abre o Google Maps já com o destino), 👁 Ficha, 🧾 Pedido (abre o talão), ✔ Sem pedido (registra que visitou mas não vendeu), ✖ Não realizada (escolhe o motivo: fechado, ausente, sem tempo ou reagendado — o cliente entra na fila para ser reencaixado noutro dia e a rota é recalculada).
• Sugestão de pernoite: aparece quando o último cliente fica a mais de 150 km da base e dormir fora economiza mais de 60 km.
• CLIENTE QUE FICOU PARA TRÁS: ao marcar "Não realizada", o cliente entra na FILA DE REENCAIXE e o sistema tenta encaixá-lo sozinho nas rotas dos próximos dias, quando o desvio for pequeno (aparece com 🔁 na lista). O dia NUNCA passa do limite de visitas — se o dia seguinte já está cheio, o pendente espera um dia com vaga. Quem está estourando o prazo tem prioridade.
• CLASSE DO CLIENTE (A, B, C ou D): define a prioridade no reencaixe E o ritmo de visita — A = a cada 35 dias (prioridade máxima), B = a cada 60 dias (normal), C = a cada 90 dias (baixa), D = a cada 120 dias (mínima, para os clientes bem fraquinhos; no reencaixe é o último da fila). Ao tocar em A, B, C ou D na ficha do cliente, o ciclo dele muda na hora e a próxima visita é recalculada. Os dias de rota trabalham com 6 visitas FIXAS e folga até 9 para reencaixes.
• ATENDIMENTO ANTECIPADO: se visitar um cliente antes do dia programado dele (ex.: era da sexta e atendeu na segunda porque ele ligou), o registro vale normalmente (visita, pedido, comissão) e ele SAI SOZINHO da lista do dia original — só volta no próximo ciclo.

ABA CLIENTES (farol de cores)
• 🔴 vermelho = visita ATRASADA (mostra há quantos dias). 🟡 amarelo = vence em poucos dias. 🟢 verde = em dia. ⚪ cinza = ainda sem visita registrada no sistema.
• Os botões no alto filtram por cor e mostram a contagem. A lista vem na ordem de urgência (mais atrasados primeiro).
• A busca aceita nome, cidade ou CNPJ (pode digitar só um pedaço).
• OBSERVAÇÕES INTERNAS: na ficha do cliente dá para anotar lembretes ("falar com a Dona Maria", "gosta de prazo maior", "loja fecha ao meio-dia"). Essas anotações são SÓ da equipe — nunca saem no talão nem no PDF — e a mais recente aparece no cartão do cliente na rota do dia, para ler antes de atender.
• Tocar no cliente abre a FICHA: dados, telefone, ciclo de visitas (a cada quantos dias visitar, com sugestão automática de encurtar ou alongar), linhas de produto que ele trabalha (tocar marca/desmarca), dica de upsell e o histórico de visitas e pedidos. Na ficha dá para excluir uma visita registrada errada (🗑) — se ela tiver pedido, exclua o pedido primeiro.

FAZER UM PEDIDO (talão digital)
1. Toque no botão dourado redondo (ou 🧾 Pedido no cliente do dia).
2. Escolha o cliente (busque por nome, cidade ou CNPJ).
3. Escolha a TABELA DE PREÇO: Simples ou Lucro Presumido (define os preços do pedido inteiro). A CONDIÇÃO DE PAGAMENTO (prazo) é preenchida NO FINAL, na tela de conferência — é obrigatória para assinar, em texto livre ("7 dias", "30 dias", "35 dias", "30/60", o que negociar). CADA CLIENTE TEM SEU PRAZO: o prazo usado fica gravado como o prazo daquele cliente e já vem preenchido nas próximas vendas. Na conferência também dá para marcar "🪧 Deixei display/mostruário" e anotar o MATERIAL DEIXADO no cliente — isso fica na ficha e no relatório de displays.
3b. RECOLHER PEÇAS ANTIGAS (CRÉDITO): dentro do próprio pedido, se for só recolher peças de uma placa antiga sem deixar nada novo, lance o produto com 0 PLACAS e informe as unidades recolhidas na devolução — o item fica NEGATIVO e desconta do total do pedido. Se o pedido inteiro ficar negativo, o valor vira CRÉDITO do cliente: o recibo sai como "Recolhimento — Crédito do Cliente" e no Financeiro entra como comissão negativa (abate do total do mês). Dá para misturar no mesmo talão: produtos vendidos normais + produtos só recolhidos.
4. Adicione os produtos: escolha o produto e como vender — placa P, placa G ou AVULSO. Placa: informe quantas placas deixou (cada produto tem sua quantidade de unidades por placa). AVULSO: para quando o cliente não quer a placa inteira e leva só algumas peças — toque no botão "Avulso (un)" e informe a quantidade de unidades. Depois as devoluções em duas colunas: DISPLAY (peças devolvidas boas) e QUEBRADA (peças com defeito). O sistema calcula sozinho: colocadas = placas × unidades da placa (ou as unidades avulsas); VENDIDAS = colocadas − display − quebradas; valor = vendidas × preço da tabela.
5. Confira o resumo, escreva o NOME DE QUEM ASSINA (obrigatório — o sistema não conclui sem ele) e colha a ASSINATURA do cliente na tela (dedo ou caneta; dá para limpar e refazer). O nome sai impresso no talão junto da assinatura.
6. Pronto: dá para VISUALIZAR O PDF do talão, COMPARTILHAR (WhatsApp/e-mail), IMPRIMIR (impressora do celular) e gerar o CUPOM 58MM para mini impressora térmica Bluetooth. Para imprimir na impressorinha térmica: toque em "Cupom 58mm", escolha COMPARTILHAR e selecione o aplicativo da impressora na lista (o app que veio com a impressora, que conecta nela por Bluetooth). O cupom já sai no formato estreito da bobina, com letras no tamanho certo. A assinatura fica gravada para sempre no pedido.
• Concluir o pedido já registra a visita do dia com o valor vendido e calcula a comissão sozinho.
• Para excluir um pedido errado: aba Pedidos → abra o pedido → "Excluir pedido" (desfaz também a visita e a comissão).

COMISSÕES (regras)
• Cliente NOVO (nunca comprou): 15% no primeiro pedido. Reposição (já comprou antes): 10%. Os percentuais são por vendedor (Admin → Vendedores).
• A comissão é calculada sobre o valor EFETIVAMENTE VENDIDO (devoluções e quebras já abatidas).
• RECEBIMENTO: a venda de um mês é recebida no MÊS SEGUINTE (ex.: vendeu em junho, recebe em julho). EXCEÇÃO: clientes da rede CLAMED recebem 45 dias corridos após a venda.

ABA PAINEL (números do mês)
Faturamento (vendido), comissão gerada, A RECEBER no mês, despesas, líquido, km rodado, custo real por km, visitas hoje/mês, conversão de visitas em pedidos, clientes ativos, atrasados e vencendo, ranking das linhas mais vendidas e alertas de ciclo (tocar abre a ficha).

MAIS → RELATÓRIOS (📊)
• VENDA DO DIA: valor vendido hoje, quantos pedidos e as visitas do dia (na rota + fora da rota = total atendidos).
• METAS: o gestor cadastra a META DO MÊS (ex.: R$ 200.000). O sistema divide pelos DIAS ÚTEIS (segunda a sexta) e mostra a meta do dia, a % da meta já batida e a PROJEÇÃO: "nesse ritmo o mês fecha em R$ X (Y% da meta)". Dá para definir uma meta do dia própria, se quiser um valor diferente da divisão automática.
• POR REDE: vendas do mês agrupadas por rede (Clamed, Agafarma, São Rafael, FZ Farma, independentes…), com nº de clientes e pedidos de cada rede.
• DISPLAYS: lista de clientes marcados com display/material deixado (tocar abre a ficha).
• No painel do gestor, o seletor do topo escolhe de qual vendedor ver o relatório (ou Todos).

MAIS → FINANCEIRO
• Navegue pelos meses com ← e →. Mostra: COMISSÕES A RECEBER no mês (com cliente, data da venda, % e marcação Clamed), DESPESAS do mês e o SALDO projetado.
• A faixa de meses mostra quanto vai receber nos próximos meses.
• "+ Lançar despesa": combustível, pedágio, hospedagem, alimentação, manutenção, CARTÃO DE CRÉDITO ou outro — pode lançar em meses futuros (contas a pagar). O km rodado informado gera o custo real por km.

MAIS → OUTRAS FUNÇÕES
• GEOCODIFICAR CLIENTES: converte os endereços em posição exata no mapa (precisa da chave do Google Maps em Configurações). Status por cliente: preciso, aproximado, pendente ou falhou.
• APARÊNCIA: muda a cor do aplicativo (Ouro, Esmeralda, Safira, Rubi, Ametista, Prata) — vale só para o aparelho.
• ADMINISTRAÇÃO (somente o gestor vê): CLIENTES (cadastrar, editar, excluir, importar CSV, exportar), PRODUTOS (códigos, preços das 2 tabelas, unidades por placa P/G), VENDEDORES (criar, % de comissão, custo por km, resetar senha), CONFIGURAÇÕES (chave do Google Maps, textos do PDF, condições de pagamento, limites de visitas/dia, regra de pernoite, início do ciclo) e REDISTRIBUIR MÊS. O botão REDISTRIBUIR MÊS refaz o calendário inteiro das 7 semanas do zero: agrupa os clientes por proximidade geográfica e monta os dias com 6 visitas fixas. Use-o DEPOIS de uma mudança grande (ex.: reclassificar muitos clientes em A/B/C/D) — no dia a dia não precisa; o 'Otimizar rota' da tela Hoje já cuida da ordem e dos reencaixes.
• O gestor tem um seletor no topo para ver os dados de cada vendedor ou de todos juntos.

LOGIN E SENHA
• Cada um entra com seu e-mail. No PRIMEIRO acesso, a senha que digitar vira a senha definitiva.
• Esqueceu a senha? O gestor vai em Mais → Vendedores → editar → "Resetar senha"; no próximo login a pessoa define uma nova.

PROBLEMAS COMUNS
• "Não aparecem os clientes": toque no selo no topo → "Sincronizar agora" (precisa de internet na primeira vez).
• "O app está desatualizado": feche e abra de novo — ele se atualiza sozinho.
• Sem internet o aplicativo funciona normal; o que fizer é enviado quando o sinal voltar.`;

  // ---------- chat ----------
  const LS_CHAT = 'ns_ajuda_chat';
  function historico() { try { return JSON.parse(localStorage.getItem(LS_CHAT) || '[]'); } catch (e) { return []; } }
  function salvar(h) { localStorage.setItem(LS_CHAT, JSON.stringify(h.slice(-30))); }

  function promptSistema() {
    const s = window.NSApp.sessao();
    const quem = s ? `${s.eu.nome} (papel: ${s.eu.papel})` : 'usuário';
    return `Você é o assistente de suporte do aplicativo New Star. Quem pergunta é ${quem}, uma pessoa que pode ter pouca familiaridade com tecnologia — muitas vezes uma pessoa mais velha.

REGRAS DE RESPOSTA:
- Responda SEMPRE em português do Brasil, com frases curtas e palavras simples, sem termos técnicos.
- Quando ensinar a fazer algo, use passos numerados começando por onde tocar (ex.: "1. Toque em CLIENTES embaixo da tela").
- Seja direto: primeiro a resposta, depois no máximo 1 ou 2 detalhes úteis.
- Só fale sobre o aplicativo New Star. Se perguntarem outra coisa, responda com gentileza que você é o suporte do aplicativo.
- Se realmente não souber, oriente a falar com o Guilherme (gestor).

MANUAL OFICIAL DO APLICATIVO (única fonte de verdade):
${MANUAL}`;
  }

  async function perguntarIA(mensagens) {
    const key = DB.config('gemini_key', '');
    if (!key) throw Object.assign(new Error('sem_chave'), { semChave: true });
    const modelo = DB.config('ia_modelo', 'gemini-flash-latest');
    const contents = mensagens.slice(-12).map(m => ({
      role: m.de === 'eu' ? 'user' : 'model',
      parts: [{ text: m.texto }]
    }));
    const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' +
      encodeURIComponent(modelo) + ':generateContent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-goog-api-key': key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: promptSistema() }] },
        contents,
        generationConfig: { temperature: 0.3, maxOutputTokens: 700 }
      })
    });
    if (!r.ok) throw new Error('IA ' + r.status + ': ' + (await r.text()).slice(0, 200));
    const j = await r.json();
    const txt = j.candidates && j.candidates[0] && j.candidates[0].content &&
      j.candidates[0].content.parts.map(p => p.text || '').join('').trim();
    if (!txt) throw new Error('resposta vazia');
    return txt;
  }

  // fallback offline/sem chave: procura a seção do manual mais parecida
  function respostaManual(pergunta) {
    const norm = (t) => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const palavras = norm(pergunta).split(/\W+/).filter(w => w.length > 3);
    const secoes = MANUAL.split(/\n(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ🗺📅🏪🧾📊☰🛟]{2,})/).filter(s => s.trim().length > 40);
    let melhor = null, melhorPts = 0;
    for (const s of secoes) {
      const ns = norm(s);
      const pts = palavras.reduce((t, w) => t + (ns.includes(w) ? 1 : 0), 0);
      if (pts > melhorPts) { melhorPts = pts; melhor = s; }
    }
    const cab = navigator.onLine
      ? 'O assistente inteligente ainda não foi ativado pelo administrador. Do manual do sistema:'
      : 'Estou sem internet agora, mas aqui está a parte do manual que fala disso:';
    return melhorPts > 0 ? cab + '\n\n' + melhor.trim()
      : cab + '\n\nNão encontrei essa parte no manual. Tente perguntar com outras palavras ou fale com o Guilherme.';
  }

  const SUGESTOES = [
    'O que faz o botão Otimizar rota?',
    'Como faço um pedido do início ao fim?',
    'O que significam as cores verde, amarela e vermelha?',
    'Quando eu recebo a comissão?',
    'Como lanço uma despesa do cartão de crédito?'
  ];

  let pensando = false;

  function view(root) {
    const chatEl = el('div', { class: 'chat-lista', id: 'chatLista' });
    const input = el('input', { class: 'input big grow', placeholder: 'Escreva sua dúvida aqui…' });
    const btn = el('button', { class: 'btn', onclick: enviar }, '➤');
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') enviar(); });

    root.appendChild(el('div', { class: 'row space' },
      el('h2', null, '🛟 Ajuda'),
      el('button', {
        class: 'btn-link', onclick: () => { localStorage.removeItem(LS_CHAT); window.NSApp.nav('ajuda'); }
      }, 'limpar conversa')));
    root.appendChild(el('p', { class: 'sub mt4' }, 'Pergunte qualquer coisa sobre o aplicativo — do mais simples ao mais avançado.'));
    root.appendChild(chatEl);
    root.appendChild(el('div', { class: 'row gap8 mt8' }, input, btn));

    function render() {
      chatEl.innerHTML = '';
      const h = historico();
      if (!h.length) {
        chatEl.appendChild(el('div', { class: 'chat-msg bot' },
          'Olá! Eu sou o assistente do New Star. Posso explicar qualquer tela ou botão do aplicativo. Toque numa pergunta pronta ou escreva a sua:'));
        SUGESTOES.forEach(sg => chatEl.appendChild(el('button', {
          class: 'chip mt4', onclick: () => { input.value = sg; enviar(); }
        }, sg)));
      }
      for (const m of h)
        chatEl.appendChild(el('div', { class: 'chat-msg ' + (m.de === 'eu' ? 'eu' : 'bot') }, m.texto));
      if (pensando) chatEl.appendChild(el('div', { class: 'chat-msg bot pensando' }, 'Escrevendo…'));
      chatEl.scrollTop = chatEl.scrollHeight;
    }

    async function enviar() {
      const texto = input.value.trim();
      if (!texto || pensando) return;
      input.value = '';
      const h = historico();
      h.push({ de: 'eu', texto });
      salvar(h); pensando = true; render();
      let resposta;
      try {
        resposta = await perguntarIA(h);
      } catch (e) {
        resposta = respostaManual(texto);
        if (!e.semChave && navigator.onLine) console.warn('suporte IA:', e.message);
      }
      const h2 = historico();
      h2.push({ de: 'bot', texto: resposta });
      salvar(h2); pensando = false; render();
    }

    render();
    setTimeout(() => input.focus(), 200);
  }

  window.NSAjuda = { view };
})();
