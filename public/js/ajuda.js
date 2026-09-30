/* PROMPT STAR — Suporte com IA (aba Ajuda)
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
O PROMPT STAR é o aplicativo da equipe de vendas da New Star (placas de brincos e semijoias em consignação para farmácias). O nome e a estrela que aparecem no alto da tela e no ícone do celular são a marca do APLICATIVO; a marca NEW STAR continua sendo a da empresa e é ela que sai impressa no cupom e no talão em PDF entregues ao cliente. Ele funciona no celular, mesmo sem internet — tudo que se faz sem sinal fica guardado e é enviado sozinho quando a conexão volta (o selo no topo mostra: verde "sincronizado", amarelo "pendente", "offline" sem sinal).

ABAS (barra embaixo da tela)
• HOJE — a rota manual por dia da semana. • CLIENTES — a lista de clientes. • PEDIDOS — os talões feitos. • PAINEL — os números do mês. • MAIS — financeiro, ajustes e administração. • AJUDA — este suporte.
O botão redondo dourado no canto de baixo à direita abre um NOVO PEDIDO de qualquer tela.

ABA ROTA (rota por dia da semana)
• ROTA MANUAL: quem monta a rota é o VENDEDOR. No alto ficam os dias da semana (Segunda a Sexta) — toque num dia para ver a rota daquele dia.
• CRIAR A ROTA: toque no botão grande "CRIAR ROTA DE <DIA>". Abre a lista de todos os clientes disponíveis, já ordenados por PRIORIDADE (classe A, B, C) e por quem está há mais tempo SEM PEDIDO. Dá para filtrar por cidade, região, prioridade, dias sem pedido e dias sem atendimento, e buscar por nome/cidade/CNPJ. Em cada cliente toque em "Adicionar à rota". Quando terminar, toque em "CONCLUIR" — os clientes escolhidos já aparecem na rota daquele dia, que fica salva.
• CLIENTE FICA VINCULADO A UM DIA SÓ: assim que entra numa rota, o cliente SAI da lista de disponíveis e não pode ser escolhido para outro dia — evita o mesmo cliente em duas rotas.
• O QUE APARECE NO CARTÃO DA ROTA: nome, selo de prospecção (quando for), o CNPJ EM DESTAQUE numa tarja escura (fácil de bater com a nota), razão social, endereço completo, telefone, farol, classe com o ciclo, dias sem pedido e sem visita, e a última observação interna — tudo sem precisar abrir o cadastro. Tocando no nome abre a FICHA COMPLETA (produtos que trabalha, último pedido, observações e histórico). O CNPJ em destaque aparece também no alto da ficha do cliente.
• CLIENTE JÁ ATENDIDO FICA COMPACTO: assim que a visita é registrada, o cartão daquele cliente ENCOLHE — fica só o nome, o CNPJ e o que foi feito (visitado ou pedido, com o valor). Assim sobra tela para quem ainda falta atender.
• TELA DA ROTA MAIS LIMPA: cada cliente é um cartão bem separado, com o nome grande, o CNPJ em destaque, endereço, telefone e o status. A ação principal é UM botão verde grande, "REGISTRAR VISITA". Embaixo ficam só ícones pequenos: GPS, estrela (prioridade), ↑, ↓ e ⋯ (mais opções: mandar para o 1º/último lugar, abrir a ficha, tirar da rota, excluir prospecção). As ferramentas do dia (organizar por proximidade, inverter ordem e resetar a rota) ficam no botão ☰ ao lado de "Editar rota".
• DESFAZER VISITA CLICADA SEM QUERER: no cartão de quem já foi atendido tem o botão vermelho "DESFAZER VISITA". Ele pergunta antes de apagar e o cliente volta para a fila de "a visitar". ATENÇÃO: visita que tem PEDIDO não é apagada por aí — ela carrega comissão e faturamento; nesse caso o app avisa e manda excluir o pedido na aba Pedidos, para não deixar número errado no painel.
• MUDAR A ORDEM DA ROTA (só por botões — o arrastar foi removido): as setas ↑ ↓ movem o cliente uma posição, e "PRIMEIRO"/"ÚLTIMO" jogam ele para as pontas. "INVERTER ORDEM" vira a rota de ponta-cabeça de uma vez. Nada de segurar e arrastar: o dedo no cartão só rola a tela.
• A ORDEM NÃO SE PERDE: a sequência que você deixar fica gravada em cada cliente. Pode fechar o app, desligar o celular ou ficar sem sinal — quando abrir de novo, a rota volta EXATAMENTE na mesma ordem, sem reorganizar nada sozinho.
• FILTROS DA ROTA: em cima da lista tem os botões "Todos", "Prospecção" e "Prioritários". Tocando num deles a rota mostra só aquele grupo (o número da posição continua sendo o da rota inteira).
• BOTÃO GPS EM CADA CLIENTE: ao lado de "Registrar visita" tem o botão verde GPS. Ele monta sozinho o endereço completo do cliente (rua, número, bairro e cidade) e abre direto o APLICATIVO do Google Maps já traçando a rota. O mesmo botão existe na aba Clientes, na ficha do cliente e na tela de montar a rota.
• CLIENTE ATENDIDO VAI PARA O FIM: assim que a visita é registrada, o cartão fica cinza, encolhe e desce para a seção "JÁ ATENDIDOS", no fim da tela. Quem ainda falta fica em cima, na seção "A VISITAR", com a contagem ao lado. O número da posição do cliente na rota não muda.
• ORGANIZAR POR PROXIMIDADE (botão ☰ → Ferramentas da rota): reorganiza a rota do dia sozinho. Você escolhe quem é o CLIENTE Nº 1 (use ↑ ou "Primeiro"); a partir dele o sistema calcula a distância entre os endereços e enfileira os demais do mais perto para o mais longe, montando um caminho curto. Quem estiver sem localização no cadastro vai para o fim da lista. Funciona sem internet.
• HISTÓRICO DA SEMANA: as abas dos dias guardam o que já foi feito. Na quinta-feira, abrindo a aba de QUARTA, os clientes atendidos naquele dia continuam lá, apagados, com a data e o valor do pedido. Quem foi atendido mas saiu da rota aparece embaixo, em "Também atendidos em <data>". Serve para não visitar o mesmo cliente duas vezes por engano. O histórico não some quando vira o dia.
• PEDIDO FORA DA ROTA: se você digitar um pedido para um cliente que não estava na rota de hoje, ele ENTRA SOZINHO na rota do dia já marcado como atendido, e conta na meta de visitação — não precisa adicionar na mão.
• Tocar no nome do cliente abre a FICHA COMPLETA. "Tirar da rota" (no menu ⋯) devolve o cliente para a lista de disponíveis.
• REGISTRAR VISITA abre 3 opções:
 1) NOVO PEDIDO — abre o talão e lança a venda.
 2) SEM PEDIDO — visitou mas não vendeu: escolha o motivo (responsável não estava, cliente não quis fazer pedido, sem necessidade de compra, outro) e escreva uma observação se quiser. A visita fica registrada e a observação vai para o histórico interno do cliente.
 3) NÃO VISITEI — não conseguiu passar no cliente: NÃO registra visita, o cliente sai da rota do dia e volta para a lista de disponíveis, podendo entrar numa rota futura.
• CORES NO CARTÃO DO CLIENTE (na rota e na hora de escolher): vermelho = visita atrasada · amarelo = vence logo · verde = em dia · cinza = sem visita registrada. O triângulo amarelo com "?" avisa que o cliente TEM OBSERVAÇÃO anotada — toque no cartão para abrir a ficha completa (produtos que trabalha, último pedido, dados e observações).
• RESETAR ROTA: fica no botão ☰ (Ferramentas da rota). Zera a rota daquele dia e devolve todos os clientes para a lista de disponíveis.
• SEMANA CERTA: as abas mostram a data de cada dia. Se você organizar no sábado ou domingo, o sistema já aponta para a SEMANA SEGUINTE — dá para deixar a semana toda montada no fim de semana.
• O gestor, no modo "Todos (consolidado)", vê as rotas de todos os vendedores (somente leitura); para montar rota, escolha o vendedor no seletor do topo.

ABA CLIENTES (farol de cores)
• vermelho = visita ATRASADA (mostra há quantos dias). amarelo = vence em poucos dias. verde = em dia. cinza = ainda sem visita registrada no sistema.
• A lista vem na ordem de urgência (mais atrasados primeiro) e mostra quantos clientes estão aparecendo com os filtros atuais.
• FILTROS EM UM LUGAR SÓ: acabaram as fileiras de bolinhas. Agora tem UM botão "FILTROS" nas abas Clientes e Pedidos. Ele abre um painel com todos os filtros e você liga quantos quiser AO MESMO TEMPO (ex.: potencial alto + sem visita há 60 dias + prioridade). O que está ligado vira uma etiqueta embaixo do botão — tocar na etiqueta desliga aquele filtro, e "limpar tudo" solta todos.
• FILTROS DE CLIENTES: tipo de cadastro (cliente/prospecção), prioridade, potencial, classe, status da visita, dias sem visita, dias sem pedido e mix de produtos (quem NÃO trabalha todas as linhas do catálogo).
• FILTROS DE PEDIDOS: faturamento no New Star (falta faturar / já faturado), mês, tabela de preço, com observação e registro de recebimento.
• POTENCIAL DO CLIENTE: o app classifica cada cliente pelo VALOR DO ÚLTIMO PEDIDO — até R$ 1.000 BAIXO · R$ 1.000 a R$ 1.500 NORMAL · R$ 1.500 a R$ 2.500 ALTO · acima de R$ 2.500 MUITO ALTO. O selo aparece no cartão do cliente e serve de filtro, para montar rota e prospecção pelos melhores.
• CNPJ SEMPRE À MÃO: o CNPJ aparece numa tarja escura direto na lista de Clientes, na lista de Pedidos e na rota — não precisa abrir o cadastro para conferir.
• BOTÕES RÁPIDOS EM CADA CLIENTE DA LISTA: GPS (abre o Google Maps no endereço), PRIORIZAR/PRIORIDADE (liga e desliga a prioridade num toque) e, só nas prospecções, EXCLUIR.
• CLIENTE PRIORITÁRIO: marque no cadastro (campo "Cliente prioritário"), na ficha ou direto pela lista e pela rota, no botão da estrela. O prioritário fica com FUNDO E BORDA AZUL e o selo PRIORIDADE, aparece no topo da lista quando você vai montar a rota, e tem filtro próprio na aba Clientes e na rota. Tirar a prioridade é o mesmo botão.
• EXCLUIR PROSPECÇÃO: prospecção ainda não é cliente, então dá para apagar fácil — botão vermelho EXCLUIR na lista, na tela de montar a rota, no cartão da rota e dentro da ficha. Ele pergunta "Deseja realmente excluir esta prospecção?" antes de apagar, e leva junto as visitas e observações daquela prospecção. CLIENTE EFETIVO NÃO TEM esse botão — não tem como apagar cliente por engano.
• A busca aceita nome, nome fantasia, razão social, cidade ou CNPJ (pode digitar só um pedaço).
• CADASTRO: o cadastro tem NOME NA LISTA (como você chama o cliente), NOME FANTASIA (o nome comercial da loja) e RAZÃO SOCIAL (o nome oficial da empresa) — são três campos separados, um não preenche o outro.
• CLASSE = CICLO (uma informação só): A = 45 dias · B = 60 · C = 90 · D = 120. Não existe mais um campo de "frequência" separado: a classe do cliente É o ciclo dele. A próxima visita, o atraso e a cor do farol saem sempre dessa regra — trocou a classe, tudo muda na hora.
• Se o cliente compra em toda visita, o app sugere subir de classe (visitar mais cedo); se passou 3 visitas sem pedido, sugere descer. É só aceitar na ficha.
• PROSPECÇÃO (possível cliente): botão "NOVA PROSPECÇÃO" no alto da aba Clientes. É o cadastro rápido das farmácias que o supervisor passa para prospectar — só nome, cidade e endereço. Elas aparecem em ROXO, com o selo PROSPECÇÃO, entram na rota igual aos clientes e dá para registrar visita normalmente. Quando a farmácia começar a comprar, abra a ficha e toque em "TRANSFORMAR EM CLIENTE": o cadastro vira cliente normal, você completa CNPJ e razão social, e todo o histórico de visitas e observações da prospecção é mantido.
• OBSERVAÇÕES SÃO INTERNAS: tudo que for escrito em observação (do pedido ou do cliente) fica SÓ no sistema — nunca sai no cupom, no PDF ou em qualquer papel entregue ao cliente.
• OBSERVAÇÕES INTERNAS: na ficha do cliente dá para anotar lembretes ("falar com a Dona Maria", "gosta de prazo maior", "loja fecha ao meio-dia"). Essas anotações são SÓ da equipe — nunca saem no talão nem no PDF — e a mais recente aparece no cartão do cliente na rota do dia, para ler antes de atender.
• TABELA DE PREÇO DO CLIENTE: no cadastro (Editar) tem o campo "Tabela de preço permitida neste cliente". O padrão é AMBAS (o vendedor escolhe Simples ou Lucro Presumido na hora do pedido). Se o cliente só trabalha com uma (ex.: a rede CLAMED é Lucro Presumido; muitas farmácias independentes são só Simples), escolha "Somente Tabela Simples" ou "Somente Lucro Presumido" — aí no pedido só aparece a tabela certa e o vendedor não erra. A tabela do cliente também aparece na ficha dele.
• Tocar no cliente abre a FICHA: dados, telefone, ciclo de visitas (a cada quantos dias visitar, com sugestão automática de encurtar ou alongar), linhas de produto que ele trabalha (tocar marca/desmarca), dica de upsell e o histórico de visitas e pedidos. Na ficha dá para excluir uma visita registrada errada — se ela tiver pedido, exclua o pedido primeiro.

FAZER UM PEDIDO (talão digital)
1. Toque no botão dourado redondo (ou Pedido no cliente do dia).
2. Escolha o cliente (busque por nome, cidade ou CNPJ).
3. Escolha a TABELA DE PREÇO: Simples ou Lucro Presumido (define os preços do pedido inteiro). SE O CLIENTE TIVER TABELA FIXA NO CADASTRO, só aparece a tabela dele — não tem como errar (ex.: a rede Clamed é Lucro Presumido). Isso é definido no cadastro do cliente, no campo "Tabela de preço permitida neste cliente" (o padrão é deixar as duas). Na conferência dá para trocar a DATA DO PEDIDO (esqueceu de lançar ontem? troca a data e ele entra na meta e comissão do dia certo). A CONDIÇÃO DE PAGAMENTO (prazo) é preenchida NO FINAL, na tela de conferência — é obrigatória para concluir, em texto livre ("7 dias", "30 dias", "35 dias", "30/60", o que negociar). CADA CLIENTE TEM SEU PRAZO: o prazo usado fica gravado como o prazo daquele cliente e já vem preenchido nas próximas vendas. Na conferência também dá para marcar "Deixei display/mostruário" e anotar o MATERIAL DEIXADO no cliente — isso fica na ficha e no relatório de displays.
3b. RECOLHER PEÇAS ANTIGAS (CRÉDITO): dentro do próprio pedido, se for só recolher peças de uma placa antiga sem deixar nada novo, lance o produto com 0 PLACAS e informe as unidades recolhidas na devolução — o item fica NEGATIVO e desconta do total do pedido. Se o pedido inteiro ficar negativo, o valor vira CRÉDITO do cliente: o recibo sai como "Recolhimento — Crédito do Cliente" e no Financeiro entra como comissão negativa (abate do total do mês). Dá para misturar no mesmo talão: produtos vendidos normais + produtos só recolhidos.
4. Adicione os produtos: escolha o produto e como vender — placa P, placa G ou AVULSO. Placa: informe quantas placas deixou (cada produto tem sua quantidade de unidades por placa). AVULSO: para quando o cliente não quer a placa inteira e leva só algumas peças — toque no botão "Avulso (un)" e informe a quantidade de unidades. Depois as devoluções em duas colunas: DISPLAY (peças devolvidas boas) e QUEBRADA (peças com defeito). O sistema calcula sozinho: colocadas = placas × unidades da placa (ou as unidades avulsas); VENDIDAS = colocadas − display − quebradas; valor = vendidas × preço da tabela.
5. DESCONTO NO PEDIDO: na tela de fechamento tem a caixa verde DESCONTO NO PEDIDO (%). Escreva só o número (3 para 3%) e o sistema mostra na hora o valor do pedido, quanto é o desconto e o VALOR FINAL. É esse valor final que conta no faturamento, na meta e na comissão — e ele sai impresso no talão e no cupom. TELA DE FECHAMENTO: cada informação fica numa caixa colorida própria — DATA DO PEDIDO (azul), CONDIÇÃO DE PAGAMENTO com o selo vermelho "obrigatório" (dourada), MATERIAL DEIXADO NO CLIENTE (roxa) e OBSERVAÇÕES INTERNAS com o selo "só no sistema" (cinza). Confira o resumo, escreva o nome na caixa azul RECEBIDO POR (quem recebeu a mercadoria) e toque em "CONCLUIR PEDIDO". O pedido já fica pronto — a assinatura é o passo seguinte.
5b. COLETAR A ASSINATURA (último passo): na tela do pedido pronto, embaixo das opções de PDF, imprimir e editar, tem o botão grande ROXO "COLETAR ASSINATURA". Toque nele e o quadro de assinatura ocupa a TELA INTEIRA. Nos aparelhos que permitem, a tela já trava na horizontal; nos outros (iPhone), é só VIRAR O APARELHO DE LADO e entregar para o cliente — o quadro acompanha. O cliente assina com o dedo e toca em "Confirmar assinatura": a assinatura fica gravada no pedido e o botão vira VERDE, escrito "ASSINATURA COLETADA". Dá para coletar na hora ou depois — o pedido não fica travado esperando. ONDE A ASSINATURA APARECE: só no PDF do talão. NO CUPOM 58MM não sai o desenho da assinatura — sai só o campo "RECEBIDO POR" com o nome da pessoa.
6. Pronto: dá para VISUALIZAR O PDF do talão, COMPARTILHAR (WhatsApp/e-mail), IMPRIMIR (impressora do celular) e gerar o CUPOM 58MM para a mini impressora térmica: toque em "Cupom 58mm (imagem)", escolha COMPARTILHAR e selecione o app da impressora. A assinatura fica gravada para sempre no pedido. LETRA DO CUPOM: sai grande, no mesmo porte da fonte da impressora. Se no aparelho de alguém ainda sair pequena (acontece em alguns Android, que encolhem a imagem para caber), aumente em Admin → Configurações → "Tamanho da letra do cupom 58mm": 1 = normal, 1,2 = padrão, 1,4 = bem grande. Quanto maior a letra, mais papel o cupom usa.
• Concluir o pedido já registra a visita do dia com o valor vendido e calcula a comissão sozinho.
• ERROU ALGO NO PEDIDO? Não precisa excluir e refazer: aba Pedidos → abra o pedido → "EDITAR PEDIDO". Dá para corrigir quantidades, devoluções, adicionar/remover produtos, trocar a tabela e o PRAZO. A assinatura já colhida é mantida e o total e a comissão são recalculados sozinhos (mantendo a % original de cliente novo ou reposição).
• OBSERVAÇÃO DO PEDIDO: pedido que tem observação ganha um selo ⚠️ vermelho no canto do card, na aba Pedidos, e um botão VERMELHO "VER OBSERVAÇÃO DO PEDIDO" junto dos botões de imprimir e assinatura. A observação abre grande, em vermelho — é para não entregar mercadoria sem ler o que foi combinado. Ela continua sendo interna: nunca sai no cupom nem no talão.
• CORRIGIR O CADASTRO SEM SAIR DO PEDIDO: no alto da tela do pedido aparece o cliente com o CNPJ. Se perceber que o CNPJ (ou qualquer dado) está errado — mesmo no fim do pedido — toque em "EDITAR CADASTRO" ali mesmo, arrume e continue. Não precisa cancelar o pedido nem voltar para a lista de clientes.
• QUEM RECEBEU O PEDIDO: na tela do pedido pronto tem o botão "INFORMAR QUEM RECEBEU". Toque e escreva o nome da pessoa que recebeu a mercadoria — fica gravado no pedido como comprovante e o botão passa a mostrar "Recebido por: <nome>". Dá para corrigir ou apagar depois. NO CUPOM DE 58 MM O NOME NÃO SAI: sai só "RECEBIMENTO CONFIRMADO — Pedido recebido e registrado digitalmente no aplicativo do vendedor". O nome fica guardado no sistema, para consultar quando precisar.
• IMPRESSÃO: existe UM botão de impressão, o LARANJA "IMPRIMIR CUPOM 58MM" — é ele que gera o cupom para a mini impressora térmica. O antigo botão "Imprimir" (da impressora do celular) foi retirado; para papel A4 use "Visualizar PDF" ou "Compartilhar PDF".
• FATURADO NO NEW STAR: na aba PEDIDOS, cada pedido tem o botão "MARCAR COMO FATURADO NO NEW STAR" — é para controlar o que já foi digitado no sistema de faturamento de fora. Marcou, aparece uma BOLINHA LARANJA COM A NOTA FISCAL no canto direito do card do pedido, e dá para ver de longe o que já foi faturado e o que ainda falta. O mesmo botão fica dentro do pedido aberto. Tocando de novo, desmarca (se marcou errado). Essa marca é só controle: não muda valor, comissão nem meta.
• Para excluir um pedido errado de vez: aba Pedidos → abra o pedido → "Excluir pedido" (desfaz também a visita e a comissão).

NOMES DOS PRODUTOS (catálogo padronizado)
Todo produto passou a ter a SIGLA na frente do nome, e a ordem é SEMPRE a mesma no pedido, na ficha do cliente, no talão e no cupom: 1) (BRAG) BRINCO ARGOLINHA · 2) (BRP) BRINCO PEQUENO CLASSIC · 3) (PONTO DE LUZ) PONTO DE LUZ ZIRCÔNIA · 4) (LUXO) LUXO DOURADO · 5) (LUXO) LUXO PRATA · 6) (PARIS) GARGANTILHA PARIS · 7) (PULA) PULSEIRA ADULTA · 8) (PUL) PULSEIRA INFANTIL · 9) (NEW YORK) GARGANTILHA NEW YORK · 10) (ANEL) ANEL REGULÁVEL. Quando o mesmo produto entra com placa P e placa G no mesmo pedido, a PEQUENA sai sempre antes da GRANDE. (ANEL) ANEL REGULÁVEL: placa P com 48 unidades e placa G com 72 · R$ 27,50 na Tabela Simples e R$ 29,90 no Lucro Presumido. Só o NOME mudou: preço, unidades por placa, pedidos antigos e comissões continuam iguais. Os demais itens do catálogo (BRG, BRAG Zircônia, BRP M. Encantado, DIVA, FOR MEN, PRATA 925 e TORNOZELEIRA) continuam com o nome antigo. Para mudar qualquer nome ou preço: MAIS → Admin → Produtos.

SINCRONIZAÇÃO E O SELO DO TOPO
O selo no alto da tela mostra como está a ligação com o banco de dados: VERDE "sincronizado" (tudo em dia), "sincronizando…", "X pendente(s)" (tem coisa na fila esperando sinal), "offline" (sem sinal — pode trabalhar normal, nada se perde) e VERMELHO "SEM ATUALIZAR". Esse último é novo e importante: quer dizer que o app está online e não perdeu nada, mas NÃO está conseguindo baixar as novidades do servidor. Toque no selo para ver o motivo.
ESPAÇO DO CELULAR: a assinatura é uma IMAGEM e ocupa espaço. Ela agora fica guardada num lugar separado do aparelho, com espaço de sobra, e não atrapalha mais o resto. Se ainda assim aparecer "sem espaço" no painel, o app libera sozinho e é só tocar em "Sincronizar agora".
LIMITE DIÁRIO DO BANCO: o banco de dados tem um limite de leituras por dia. Se ele estourar, o app avisa no selo vermelho e explica no painel de sincronização. NADA É PERDIDO: tudo que o vendedor digitar continua sendo salvo e enviado normalmente (a gravação não para); o que fica parado é só o download das novidades, que volta sozinho depois da virada do dia.
ECONOMIA DE LEITURA: no dia a dia o app baixa SÓ O QUE MUDOU desde a última vez, em vez de baixar a base inteira toda hora. A base completa é baixada na primeira instalação, uma vez a cada 12 horas e sempre que você tocar em "SINCRONIZAR AGORA" no painel do selo. Se desconfiar que algum dado não chegou, é esse botão que resolve.

EXPORTAR EM PDF E EXCEL (Mais → Exportar)
Dá para baixar a lista de CLIENTES e a de PEDIDOS em PDF ou em Excel (.xlsx). Primeiro escolha USAR OS FILTROS DO APP (sai só o que está filtrado nas abas Clientes e Pedidos) ou EXPORTAR TUDO (relatório completo). O app mostra quantos registros vão no arquivo antes de baixar. O PDF sai em paisagem, com cabeçalho e uma linha por registro; o Excel sai com uma coluna por informação, pronto para filtrar e somar. Tudo é gerado no próprio aparelho, funciona sem internet.

METAS
A meta padrão é R$ 200.000 POR MÊS, o que dá R$ 2.400.000 NO ANO. Ao cadastrar a meta do mês em Mais → Relatórios, a meta do ano acompanha sozinha (mês × 12). Dá para mudar as duas à mão quando precisar.

RESPOSTA AO TOQUE
Todo botão responde na hora: afunda de leve e o celular dá uma vibradinha curta. Ações importantes (concluir pedido, imprimir, assinar, excluir) vibram um pouco mais forte. É proposital: o app mexe com dinheiro, e cada toque precisa deixar claro que foi registrado. NA TELA DE PRODUTOS DO PEDIDO: os botões + e − dão a mesma vibradinha curta, o número piscar de leve confirmando que entrou, e só os números do cálculo mudam — a tela inteira não é mais redesenhada a cada toque. Ao adicionar um produto, o card dele entra deslizando e o total do pedido pisca quando muda. Digitar a quantidade direto no campo NÃO vibra e não tira o cursor do lugar: o cálculo acompanha a digitação. Quem usa iPhone não sente a vibração (o iOS não libera esse recurso para aplicativos na internet) — no iPhone a confirmação é visual: o botão afunda e o número pisca. Quem não quiser vibração pode desligar em MAIS → APARÊNCIA, na chave "Vibrar ao tocar nos botões" (vale só para aquele aparelho).
A VIBRAÇÃO PODE FALTAR: além do iPhone, alguns Android com o modo "não perturbe" ou a vibração do sistema desligada também não vibram. Isso não é defeito do aplicativo.

CONFERIR A PLACA NA TELA (o jeito rápido de lançar o pedido)
Dentro do pedido, em ADICIONAR PRODUTO, ao lado do nome do produto ficam DOIS botões:
• O botão ROXO de CALCULADORA abre uma calculadora dentro do próprio app — soma, subtrai, multiplica e divide. Serve para a conta do balcão, tipo "4 fileiras × 8 = 32". Feita a conta, toque em "LANÇAR EM DEVOLVIDA — DISPLAY" e o número entra sozinho no campo, sem digitar.
• O botão VERDE de PLACA abre a CONFERÊNCIA DA PLACA em tela cheia. É a novidade principal: em vez de contar e fazer conta, o vendedor põe a placa de verdade do lado do celular e reproduz na tela o que está vendido.
COMO FUNCIONA A CONFERÊNCIA: a tela desenha a placa com o número EXATO de posições daquele produto — 48, 64, 72, 99, 16 ou 22, conforme o cadastro. Cada bolinha é uma unidade.
• BOLINHA CHEIA (na cor da placa) = a peça ainda está lá na farmácia → vai como TROCADA/devolvida.
• BOLINHA VAZIA (branca) = a peça saiu da placa → foi VENDIDA.
Toque numa bolinha para marcar uma peça vendida. Toque no NÚMERO DA FILEIRA (à esquerda) para marcar ou desmarcar a fileira inteira de uma vez. Tem ainda os atalhos "VENDEU TUDO" e "NÃO VENDEU NADA".
Embaixo, o placar mostra o tempo todo quantas foram VENDIDAS e quantas FICAM NA PLACA.
MAIS DE UMA PLACA DO MESMO PRODUTO: no alto ficam as abas PLACA 1, PLACA 2… e o botão "+ PLACA". Cada placa tem a sua própria conferência, e o sistema soma tudo — mas você continua sabendo qual placa física está conferindo. A lixeira tira a placa aberta.
AO TOCAR EM CONCLUIR: o sistema joga tudo direto nos campos do pedido que já existiam — "Placas deixadas" vira a quantidade de placas conferidas e "Devolvida — Display" recebe o que sobrou na placa. Não precisa digitar nada de novo. As QUEBRADAS continuam sendo lançadas à mão, no campo próprio, porque só o vendedor sabe quais quebraram. Os avulsos também seguem como sempre.
CANCELAR não muda nada no pedido.
O DESENHO DA PLACA: a tela desenha a placa igual à placa física — fundo roxo, o cartão branco com o topo colorido, a sigla e o nome em duas linhas e o desenho do produto no canto, exatamente como nos modelos. A placa PEQUENA tem o topo em ARCO; a GRANDE tem o topo RETO. Cada modelo na sua cor: Luxo Dourado e Luxo Prata em azul claro, Argolinha e Pulseira Adulta em vermelho rosé, Ponto de Luz em preto, BRP Classic em verde escuro, Anel Regulável em dourado, Paris em cinza, New York em azul e Pulseira Infantil em azul claro com a peça bege. As gargantilhas e as pulseiras aparecem PENDURADAS nos ganchos do alto, como na placa real — nessas, arraste a placa de lado para ver todos os ganchos.

ABERTURA DO APP
Ao abrir, aparece por cerca de 2 segundos a animação da marca Prompt Star. Ela sai sozinha e NUNCA trava o app: se você tocar na tela, pula na hora; se o aparelho não conseguir tocar o vídeo, ela sai do mesmo jeito.

BOTÃO DE NOVO PEDIDO
O botão redondo do canto de baixo à direita agora é VERDE e ficou mais afastado da barra de abas, para não ser apertado sem querer.

CLIENTE PRIORITÁRIO EM AZUL
A marca de prioridade agora é AZUL (antes era roxa, igual à prospecção). E tem uma novidade: assim que você TIRA O PEDIDO daquele cliente, a prioridade SAI SOZINHA — ela serve para não esquecer o cliente, e depois do pedido já cumpriu o papel.

FATURADO NO NEW STAR EM LARANJA
O laranja voltou a ser só do faturamento: a bolinha da nota fiscal no card do pedido, o botão "FATURADO" e o pop-up de pedido pendente. Assim não se confunde com o amarelo da identidade do app.

COMO É O CUPOM DE 58 MM
O cupom foi reorganizado para ficar fácil de ler na mesa do cliente. No alto sai a MARCA NEW STAR impressa; embaixo, em blocos separados por um traço: os dados do pedido (número, data, prazo), o cliente, os produtos (um por bloco, com quantidade deixada, TROCADAS e vendidas), o total e, no fim, o mesmo rodapé de sempre com "RECEBIMENTO CONFIRMADO". A palavra que aparece no cupom é TROCADA/TROCADAS, porque é o que o cliente entende: a peça saiu e foi trocada por outra. NO SISTEMA E NO TALÃO EM PDF continua escrito DEVOLVIDA — é o termo do controle interno, e nada dos dados antigos mudou. O cupom também NÃO mostra mais qual tabela de preço foi usada (Simples ou Lucro Presumido); essa informação continua no talão em PDF, no pedido e nos relatórios.

O TALÃO EM PDF
O PDF agora sai com a MARCA NEW STAR no cabeçalho. Tudo o mais continua igual: a tabela de preços, a palavra DEVOLVIDA, a assinatura do cliente e as observações padrão.

DEPOIS DE IMPRIMIR O CUPOM
Ao voltar da tela de impressão/compartilhamento o app volta sozinho ao normal. Antes ele às vezes ficava com a tela preta e só destravava se você arrastasse para baixo — isso foi corrigido.

AVISO DE PEDIDO PENDENTE (faturamento no New Star)
Toda vez que o app abre, ele confere se ficou algum pedido dos ÚLTIMOS 30 DIAS sem ser marcado como faturado no New Star. O aviso agora aparece LARANJA, no meio da tela, com uma animação de entrada — impossível não ver. Se ficou, aparece o aviso "⚠️ PEDIDO PENDENTE" listando os pedidos, com o valor, a data e um botão para marcar cada um como faturado ali mesmo. Dá para fechar o aviso, mas ele volta na próxima abertura enquanto houver pedido pendente — é justamente para não esquecer nenhum.

TICKET MÉDIO
No PAINEL aparece o TICKET MÉDIO do mês: o total vendido dividido pela quantidade de pedidos, com o número de pedidos ao lado. Nos RELATÓRIOS ele acompanha o mês escolhido e o vendedor selecionado, e mostra também o ticket médio POR CLIENTE ATENDIDO (total ÷ quantos clientes compraram) e o ticket médio do dia.

O APP NÃO FECHA MAIS SOZINHO
Antes, quando saía uma versão nova, o aplicativo se recarregava sozinho ao voltar do bolso e parecia que tinha fechado. Agora ele NUNCA se recarrega no meio do serviço: quando existe versão nova, aparece uma faixa escura embaixo dizendo "Tem uma versão nova do app" com os botões DEPOIS e ATUALIZAR AGORA — quem decide a hora é você. O app também guarda em que aba e em que dia de rota você estava: se o celular fechar o app por falta de memória ou a bateria acabar, ao abrir de novo ele volta na mesma tela.

COMISSÕES (regras)
• Cliente NOVO (nunca comprou): 15% no primeiro pedido, em qualquer tabela.
• Reposição (já comprou antes): depende da TABELA do pedido — Tabela Simples 10% · LUCRO PRESUMIDO 8,75%.
• A comissão é calculada sobre o valor EFETIVAMENTE VENDIDO (devoluções e quebras já abatidas).
• RECEBIMENTO: a venda de um mês é recebida no MÊS SEGUINTE (ex.: vendeu em junho, recebe em julho).
• EXCEÇÃO CLAMED (regra dos 45 dias com fechamento no dia 15): venda feita ATÉ O DIA 15 entra no fechamento e cai no DIA 15 DO MÊS SEGUINTE. Venda feita DEPOIS DO DIA 15 perde o fechamento e só cai no DIA 15 DE DOIS MESES DEPOIS. Exemplos: vendeu 10/08 → recebe 15/09; vendeu 25/08 → recebe 15/10.

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
    return `Você é o assistente de suporte do aplicativo Prompt Star (o app de vendas da New Star). Quem pergunta é ${quem}, uma pessoa que pode ter pouca familiaridade com tecnologia — muitas vezes uma pessoa mais velha.

REGRAS DE RESPOSTA:
- Responda SEMPRE em português do Brasil, com frases curtas e palavras simples, sem termos técnicos.
- Quando ensinar a fazer algo, use passos numerados começando por onde tocar (ex.: "1. Toque em CLIENTES embaixo da tela").
- Seja direto: primeiro a resposta, depois no máximo 1 ou 2 detalhes úteis.
- Só fale sobre o aplicativo Prompt Star. Se perguntarem outra coisa, responda com gentileza que você é o suporte do aplicativo.
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
          'Olá! Eu sou o assistente do Prompt Star. Posso explicar qualquer tela ou botão do aplicativo. Toque numa pergunta pronta ou escreva a sua:'));
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
