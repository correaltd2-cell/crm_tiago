/* NEW STAR — Suporte com IA (aba Ajuda)
 * Chat que conhece o sistema inteiro e responde em linguagem simples,
 * passo a passo. Usa a API do Gemini (chave em Configurações → IA);
 * sem conexão ou sem chave, responde com o manual embutido. */
(function () {
  'use strict';
  const { $, el, escH, toast, ico } = window.NSUI;
  const DB = window.NSDB;

  // ---------- manual completo do sistema (base de conhecimento) ----------
  const MANUAL = `
VISÃO GERAL
O New Star é o aplicativo da equipe de vendas da New Star (placas de brincos e semijoias em consignação para farmácias). Ele funciona no celular, mesmo sem internet — tudo que se faz sem sinal fica guardado e é enviado sozinho quando a conexão volta (o selo no topo mostra: verde "sincronizado", amarelo "pendente", "offline" sem sinal).

ABAS (barra embaixo da tela)
• HOJE — a rota manual por dia da semana. • CLIENTES — a lista de clientes. • PEDIDOS — os talões feitos. • PAINEL — os números do mês. • MAIS — financeiro, ajustes e administração. • AJUDA — este suporte.
O botão redondo dourado no canto de baixo à direita abre um NOVO PEDIDO de qualquer tela.

ABA ROTA (rota por dia da semana)
• ROTA MANUAL: quem monta a rota é o VENDEDOR. No alto ficam os dias da semana (Segunda a Sexta) — toque num dia para ver a rota daquele dia.
• CRIAR A ROTA: toque no botão grande "CRIAR ROTA DE <DIA>". Abre a lista de todos os clientes disponíveis, já ordenados por PRIORIDADE (classe A, B, C) e por quem está há mais tempo SEM PEDIDO. Dá para filtrar por cidade, região, prioridade, dias sem pedido e dias sem atendimento, e buscar por nome/cidade/CNPJ. Em cada cliente toque em "Adicionar à rota". Quando terminar, toque em "CONCLUIR" — os clientes escolhidos já aparecem na rota daquele dia, que fica salva.
• CLIENTE FICA VINCULADO A UM DIA SÓ: assim que entra numa rota, o cliente SAI da lista de disponíveis e não pode ser escolhido para outro dia — evita o mesmo cliente em duas rotas.
• O QUE APARECE NO CARTÃO DA ROTA: nome, selo de prospecção (quando for), razão social, CNPJ, endereço completo, telefone, farol, classe com o ciclo, dias sem pedido e sem visita, e a última observação interna — tudo sem precisar abrir o cadastro. Tocando no nome abre a FICHA COMPLETA (produtos que trabalha, último pedido, observações e histórico).
• MUDAR A ORDEM DA ROTA: SEGURE O DEDO em cima do cliente por um instante — o cartão descola, o aparelho vibra e um espaço tracejado mostra onde ele vai cair. Aí é só arrastar e soltar. Deslizar rápido continua rolando a tela normalmente, e os botões do cartão continuam funcionando. Também dá para segurar o ⠿ do lado esquerdo, que começa o arraste na hora. Quem preferir botão: as setas ↑ ↓ movem uma posição, e "Primeiro"/"Último" jogam o cliente para as pontas. "INVERTER ORDEM" vira a rota de ponta-cabeça de uma vez. A ordem que você deixar é a que o sistema respeita.
• HISTÓRICO DA SEMANA: as abas dos dias guardam o que já foi feito. Na quinta-feira, abrindo a aba de QUARTA, os clientes atendidos naquele dia continuam lá, apagados, com a data e o valor do pedido. Quem foi atendido mas saiu da rota aparece embaixo, em "Também atendidos em <data>". Serve para não visitar o mesmo cliente duas vezes por engano. O histórico não some quando vira o dia.
• PEDIDO FORA DA ROTA: se você digitar um pedido para um cliente que não estava na rota de hoje, ele ENTRA SOZINHO na rota do dia já marcado como atendido, e conta na meta de visitação — não precisa adicionar na mão.
• NA ROTA, cada cliente tem 2 botões: "REGISTRAR VISITA" e "REMOVER DA ROTA" (remover devolve o cliente para a lista de disponíveis). Tocar no nome do cliente abre a ficha completa.
• REGISTRAR VISITA abre 3 opções:
 1) NOVO PEDIDO — abre o talão e lança a venda.
 2) SEM PEDIDO — visitou mas não vendeu: escolha o motivo (responsável não estava, cliente não quis fazer pedido, sem necessidade de compra, outro) e escreva uma observação se quiser. A visita fica registrada e a observação vai para o histórico interno do cliente.
 3) NÃO VISITEI — não conseguiu passar no cliente: NÃO registra visita, o cliente sai da rota do dia e volta para a lista de disponíveis, podendo entrar numa rota futura.
• CORES NO CARTÃO DO CLIENTE (na rota e na hora de escolher): vermelho = visita atrasada · amarelo = vence logo · verde = em dia · cinza = sem visita registrada. O triângulo amarelo com "?" avisa que o cliente TEM OBSERVAÇÃO anotada — toque no cartão para abrir a ficha completa (produtos que trabalha, último pedido, dados e observações).
• RESETAR ROTA: o botão "Resetar rota de <dia>" zera a rota daquele dia e devolve todos os clientes para a lista de disponíveis, para montar de novo.
• SEMANA CERTA: as abas mostram a data de cada dia. Se você organizar no sábado ou domingo, o sistema já aponta para a SEMANA SEGUINTE — dá para deixar a semana toda montada no fim de semana.
• O gestor, no modo "Todos (consolidado)", vê as rotas de todos os vendedores (somente leitura); para montar rota, escolha o vendedor no seletor do topo.

ABA CLIENTES (farol de cores)
• vermelho = visita ATRASADA (mostra há quantos dias). amarelo = vence em poucos dias. verde = em dia. cinza = ainda sem visita registrada no sistema.
• Os botões no alto filtram por cor e mostram a contagem. A lista vem na ordem de urgência (mais atrasados primeiro).
• A busca aceita nome, nome fantasia, razão social, cidade ou CNPJ (pode digitar só um pedaço).
• CADASTRO: o cadastro tem NOME NA LISTA (como você chama o cliente), NOME FANTASIA (o nome comercial da loja) e RAZÃO SOCIAL (o nome oficial da empresa) — são três campos separados, um não preenche o outro.
• CICLO POR CLASSE: A = 45 dias · B = 60 · C = 90 · D = 120. É a classe que manda no farol: trocou a classe, a data da próxima visita e a cor mudam na hora.
• PROSPECÇÃO (possível cliente): botão "NOVA PROSPECÇÃO" no alto da aba Clientes. É o cadastro rápido das farmácias que o supervisor passa para prospectar — só nome, cidade e endereço. Elas aparecem em ROXO, com o selo PROSPECÇÃO, entram na rota igual aos clientes e dá para registrar visita normalmente. Quando a farmácia começar a comprar, abra a ficha e toque em "TRANSFORMAR EM CLIENTE": o cadastro vira cliente normal, você completa CNPJ e razão social, e todo o histórico de visitas e observações da prospecção é mantido.
• OBSERVAÇÕES SÃO INTERNAS: tudo que for escrito em observação (do pedido ou do cliente) fica SÓ no sistema — nunca sai no cupom, no PDF ou em qualquer papel entregue ao cliente.
• OBSERVAÇÕES INTERNAS: na ficha do cliente dá para anotar lembretes ("falar com a Dona Maria", "gosta de prazo maior", "loja fecha ao meio-dia"). Essas anotações são SÓ da equipe — nunca saem no talão nem no PDF — e a mais recente aparece no cartão do cliente na rota do dia, para ler antes de atender.
• TABELA DE PREÇO DO CLIENTE: no cadastro (Editar) tem o campo "Tabela de preço permitida neste cliente". O padrão é AMBAS (o vendedor escolhe Simples ou Lucro Presumido na hora do pedido). Se o cliente só trabalha com uma (ex.: a rede CLAMED é Lucro Presumido; muitas farmácias independentes são só Simples), escolha "Somente Tabela Simples" ou "Somente Lucro Presumido" — aí no pedido só aparece a tabela certa e o vendedor não erra. A tabela do cliente também aparece na ficha dele.
• Tocar no cliente abre a FICHA: dados, telefone, ciclo de visitas (a cada quantos dias visitar, com sugestão automática de encurtar ou alongar), linhas de produto que ele trabalha (tocar marca/desmarca), dica de upsell e o histórico de visitas e pedidos. Na ficha dá para excluir uma visita registrada errada — se ela tiver pedido, exclua o pedido primeiro.

FAZER UM PEDIDO (talão digital)
1. Toque no botão dourado redondo (ou Pedido no cliente do dia).
2. Escolha o cliente (busque por nome, cidade ou CNPJ).
3. Escolha a TABELA DE PREÇO: Simples ou Lucro Presumido (define os preços do pedido inteiro). SE O CLIENTE TIVER TABELA FIXA NO CADASTRO, só aparece a tabela dele — não tem como errar (ex.: a rede Clamed é Lucro Presumido). Isso é definido no cadastro do cliente, no campo "Tabela de preço permitida neste cliente" (o padrão é deixar as duas). Na conferência dá para trocar a DATA DO PEDIDO (esqueceu de lançar ontem? troca a data e ele entra na meta e comissão do dia certo). A CONDIÇÃO DE PAGAMENTO (prazo) é preenchida NO FINAL, na tela de conferência — é obrigatória para assinar, em texto livre ("7 dias", "30 dias", "35 dias", "30/60", o que negociar). CADA CLIENTE TEM SEU PRAZO: o prazo usado fica gravado como o prazo daquele cliente e já vem preenchido nas próximas vendas. Na conferência também dá para marcar "Deixei display/mostruário" e anotar o MATERIAL DEIXADO no cliente — isso fica na ficha e no relatório de displays.
3b. RECOLHER PEÇAS ANTIGAS (CRÉDITO): dentro do próprio pedido, se for só recolher peças de uma placa antiga sem deixar nada novo, lance o produto com 0 PLACAS e informe as unidades recolhidas na devolução — o item fica NEGATIVO e desconta do total do pedido. Se o pedido inteiro ficar negativo, o valor vira CRÉDITO do cliente: o recibo sai como "Recolhimento — Crédito do Cliente" e no Financeiro entra como comissão negativa (abate do total do mês). Dá para misturar no mesmo talão: produtos vendidos normais + produtos só recolhidos.
4. Adicione os produtos: escolha o produto e como vender — placa P, placa G ou AVULSO. Placa: informe quantas placas deixou (cada produto tem sua quantidade de unidades por placa). AVULSO: para quando o cliente não quer a placa inteira e leva só algumas peças — toque no botão "Avulso (un)" e informe a quantidade de unidades. Depois as devoluções em duas colunas: DISPLAY (peças devolvidas boas) e QUEBRADA (peças com defeito). O sistema calcula sozinho: colocadas = placas × unidades da placa (ou as unidades avulsas); VENDIDAS = colocadas − display − quebradas; valor = vendidas × preço da tabela.
5. DESCONTO NO PEDIDO: na tela de fechamento tem a caixa verde DESCONTO NO PEDIDO (%). Escreva só o número (3 para 3%) e o sistema mostra na hora o valor do pedido, quanto é o desconto e o VALOR FINAL. É esse valor final que conta no faturamento, na meta e na comissão — e ele sai impresso no talão e no cupom. TELA DE FECHAMENTO: cada informação fica numa caixa colorida própria — DATA DO PEDIDO (azul), CONDIÇÃO DE PAGAMENTO com o selo vermelho "obrigatório" (dourada), MATERIAL DEIXADO NO CLIENTE (roxa) e OBSERVAÇÕES INTERNAS com o selo "só no sistema" (cinza). Confira o resumo, escreva o NOME DE QUEM ASSINA (obrigatório) e toque em "ASSINAR EM TELA CHEIA": o quadro de assinatura ocupa a tela inteira E FICA DEITADO (horizontal): é só virar o aparelho de lado e entregar para o cliente, que a assinatura sai na posição certa. Nos aparelhos que permitem, a tela trava sozinha na horizontal; nos que não permitem (iPhone), o próprio sistema gira a tela. O cliente assina com o dedo com bastante espaço e toca em "Confirmar assinatura" — aí o app volta para a tela do pedido. O nome sai impresso no talão junto da assinatura.
6. Pronto: dá para VISUALIZAR O PDF do talão, COMPARTILHAR (WhatsApp/e-mail), IMPRIMIR (impressora do celular) e gerar o CUPOM 58MM para a mini impressora térmica: toque em "Cupom 58mm (imagem)", escolha COMPARTILHAR e selecione o app da impressora. A assinatura fica gravada para sempre no pedido. LETRA DO CUPOM: sai grande, no mesmo porte da fonte da impressora. Se no aparelho de alguém ainda sair pequena (acontece em alguns Android, que encolhem a imagem para caber), aumente em Admin → Configurações → "Tamanho da letra do cupom 58mm": 1 = normal, 1,2 = padrão, 1,4 = bem grande. Quanto maior a letra, mais papel o cupom usa.
• Concluir o pedido já registra a visita do dia com o valor vendido e calcula a comissão sozinho.
• ERROU ALGO NO PEDIDO? Não precisa excluir e refazer: aba Pedidos → abra o pedido → "EDITAR PEDIDO". Dá para corrigir quantidades, devoluções, adicionar/remover produtos, trocar a tabela e o PRAZO. A assinatura já colhida é mantida e o total e a comissão são recalculados sozinhos (mantendo a % original de cliente novo ou reposição).
• Para excluir um pedido errado de vez: aba Pedidos → abra o pedido → "Excluir pedido" (desfaz também a visita e a comissão).

COMISSÕES (regras)
• Cliente NOVO (nunca comprou): 15% no primeiro pedido. Reposição (já comprou antes): 10%. Os percentuais são por vendedor (Admin → Vendedores).
• A comissão é calculada sobre o valor EFETIVAMENTE VENDIDO (devoluções e quebras já abatidas).
• RECEBIMENTO: a venda de um mês é recebida no MÊS SEGUINTE (ex.: vendeu em junho, recebe em julho). EXCEÇÃO: clientes da rede CLAMED recebem 45 dias corridos após a venda.

ABA PAINEL (números do mês)
COMISSÕES: o quadro azul mostra A RECEBER NO PRÓXIMO MÊS, separado entre CLIENTES NORMAIS (que caem no dia 1º do mês seguinte) e CLAMED (que paga 45 dias depois da venda). Abaixo aparece a CLAMED PENDENTE — tudo o que ainda há para receber da rede, caindo no próximo mês ou nos seguintes —, a comissão das vendas deste mês e a Clamed que está caindo neste mês.
METAS EM PRIMEIRO LUGAR: logo no alto do painel aparece o quadro de metas, sem precisar entrar em nada — META DO MÊS, VENDIDO NO MÊS, FALTA VENDER, DIAS ÚTEIS RESTANTES, META DE HOJE, VENDIDO HOJE e FALTA VENDER HOJE. A META DE HOJE É DINÂMICA: é o que falta para a meta do mês dividido pelos dias úteis que ainda restam (contando hoje). Vendeu bem hoje? amanhã a meta do dia cai. Ficou devendo? ela sobe sozinha. Só entram no mês os pedidos DAQUELE mês, e no "vendido hoje" só os pedidos com a data de HOJE — quando vira o dia, o contador do dia zera.
Faturamento (vendido), comissão gerada, A RECEBER no mês, despesas, líquido, km rodado, custo real por km, visitas hoje/mês, conversão de visitas em pedidos, clientes ativos, atrasados e vencendo, ranking das linhas mais vendidas e alertas de ciclo (tocar abre a ficha).

MAIS → MEU ROTEIRO — para o vendedor autônomo organizar a própria agenda
• DIAS EM QUE TRABALHO: desmarque os dias que não atende (ex.: segunda para organizar estoque). O roteiro só agenda nos dias marcados.
• DIA PERTO DE CASA: escolha um dia (ex.: sexta) para o roteiro puxar clientes da região da sua base — assim sexta-feira fica perto de casa.
• AGENDA DAS PRÓXIMAS SEMANAS: toque num dia para ver os clientes. "↔ MOVER" muda um cliente de dia (o sistema sugere os melhores dias, de preferência na mesma região e com vaga). "LIBERAR ESTE DIA" esvazia o dia (folga, estoque, imprevisto) e reencaixa os clientes sozinho nos melhores dias — quem não couber fica aguardando e o sistema avisa.
• ESCOLHER A REGIÃO DA SEMANA: a lista mostra cada região com a situação dela — quantos clientes vencidos, o maior atraso e quantos vencem nos próximos 14 dias. A mais urgente vem com (recomendada), mas QUEM ESCOLHE É O VENDEDOR: se não dá para ir a Joaçaba nesta semana, toque em outra região e o roteiro remonta começando por ela (o resto continua por urgência).
• Depois de mudar as preferências, toque em "Regerar roteiro com minhas preferências". O sistema continua sendo o guia: ele sempre mostra quem precisa de visita e sugere quando e onde repor — mas quem manda na agenda é o vendedor.

MAIS → RELATÓRIOS
• VENDA DO DIA: valor vendido hoje, quantos pedidos e as visitas do dia (na rota + fora da rota = total atendidos).
• METAS DO DIA, DO MÊS E DO ANO: os relatórios abrem no mês corrente e têm SETAS NO TOPO para ver MESES ANTERIORES (vendas, metas e redes daquele mês). A META É POR MÊS: o valor que o gestor cadastra vale para o mês que estiver na tela. Os meses seguintes já começam com o mesmo valor até ele trocar, e os meses JÁ FECHADOS continuam com a meta que tinham — assim mudar a meta de agora não bagunça a % dos meses passados. O sistema divide a meta do mês pelos DIAS ÚTEIS (segunda a sexta) e mostra a meta do dia, a % já batida e a PROJEÇÃO: "nesse ritmo o mês fecha em R$ X". Num mês fechado, em vez da projeção ele mostra o resultado final e quanto faltou. Dá para definir uma meta do dia própria, se quiser um valor diferente da divisão automática.
• META DE NOVOS CLIENTES: o gestor também cadastra quantos CLIENTES NOVOS quer no mês (venda com comissão de 15% = primeira compra, que é a mais interessante para o vendedor). O painel mostra quantos já entraram, a % da meta e a projeção no ritmo atual.
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
• ADMINISTRAÇÃO (somente o gestor vê): CLIENTES (cadastrar, editar, excluir, importar CSV, exportar), PRODUTOS (códigos, preços das 2 tabelas, unidades por placa P/G), VENDEDORES (criar, % de comissão, telefone que sai no talão, resetar senha) e CONFIGURAÇÕES (chave do Google Maps, textos do PDF, condições de pagamento, início do ciclo). As rotas são montadas manualmente pelo vendedor na aba Hoje — não existe mais redistribuição automática.
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
    const secoes = MANUAL.split(/\n(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ]{2,})/).filter(s => s.trim().length > 40);
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
    'Como monto a rota de um dia?',
    'Como faço um pedido do início ao fim?',
    'O que significam as cores verde, amarela e vermelha?',
    'Quando eu recebo a comissão?',
    'Como lanço uma despesa do cartão de crédito?'
  ];

  let pensando = false;

  function view(root) {
    const chatEl = el('div', { class: 'chat-lista', id: 'chatLista' });
    const input = el('input', { class: 'input big grow', placeholder: 'Escreva sua dúvida aqui…' });
    const btn = el('button', { class: 'btn', onclick: enviar, 'aria-label': 'Enviar' }, ico('setaDir'));
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') enviar(); });

    root.appendChild(el('div', { class: 'row space' },
      el('h2', { class: 'row gap8' }, ico('ajuda'), 'Ajuda'),
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
