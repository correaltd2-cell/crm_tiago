/* PROMPT STAR — Conferência visual da placa + calculadora do pedido
 *
 * A ideia é simples: o vendedor põe a placa FÍSICA do lado da tela e reproduz
 * nela o que está vendido. Cada furo da tela é uma unidade da placa de verdade.
 *
 *   furo VAZIO (selecionado) = peça saiu da placa  →  VENDIDA
 *   furo CHEIO (com a peça)  = peça continua lá    →  TROCADA / devolvida
 *
 * No fim o sistema faz a conta sozinho e devolve os números para os mesmos
 * campos do pedido que já existiam — nada de controle paralelo. */
(function () {
  'use strict';
  const { el, ico, rot, toast, vibrar, piscar, texto } = window.NSUI;

  // ─────────── identidade de cada placa ───────────
  // cor = a cor da placa física, para o vendedor bater o olho e reconhecer.
  // forma: 'pequena' tem as pontas bem arredondadas; 'grande' é mais rígida.
  // tipo: 'brinco' são furos em fileiras; 'pendente' são gargantilhas e
  // pulseiras, que ficam PENDURADAS numa régua de ganchos no alto da placa.
  const PLACAS = {
    '(LUXO) LUXO DOURADO': { cor: '#5FC0F5', texto: '#290F5D', tipo: 'brinco' },
    '(LUXO) LUXO PRATA': { cor: '#5FC0F5', texto: '#290F5D', tipo: 'brinco' },
    '(BRAG) BRINCO ARGOLINHA': { cor: '#A81552', texto: '#ffffff', tipo: 'brinco' },
    '(PONTO DE LUZ) PONTO DE LUZ ZIRCÔNIA': { cor: '#1b1b1f', texto: '#ffffff', tipo: 'brinco' },
    '(BRP) BRINCO PEQUENO CLASSIC': { cor: '#14543a', texto: '#ffffff', tipo: 'brinco' },
    '(PULA) PULSEIRA ADULTA': { cor: '#7d0f2f', texto: '#ffffff', tipo: 'pendente' },
    '(PARIS) GARGANTILHA PARIS': { cor: '#7c8088', texto: '#ffffff', tipo: 'pendente' },
    '(NEW YORK) GARGANTILHA NEW YORK': { cor: '#8ec9f2', texto: '#10225c', tipo: 'pendente' },
    // sem referência enviada ainda — ficam na cor da identidade do app até o
    // cliente mandar a foto da placa física
    '(PUL) PULSEIRA INFANTIL': { cor: '#DB80FF', texto: '#290F5D', tipo: 'pendente' },
    '(ANEL) ANEL REGULÁVEL': { cor: '#F9D132', texto: '#290F5D', tipo: 'brinco' }
  };
  const PADRAO = { cor: '#290F5D', texto: '#ffffff', tipo: 'brinco' };
  function estiloPlaca(produto) {
    return PLACAS[(produto && produto.nome) || ''] || PADRAO;
  }

  // ─────────── distribuição dos furos ───────────
  // A placa de verdade tem fileiras inteiras. Procura o número de colunas que
  // FECHA as fileiras (48=8×6, 64=8×8, 72=8×9, 99=9×11) — e, se nenhum fechar,
  // usa o que sobra menos, para não deixar uma fileira solta com 1 furo.
  function grade(total, tipo) {
    if (total <= 0) return { colunas: 1, linhas: 0 };
    if (tipo === 'pendente') {
      // gargantilha/pulseira: poucos ganchos, mas compridos. Mais de 12 numa
      // fileira só fica apertado no celular, então quebra em duas.
      const colunas = total <= 12 ? total : Math.ceil(total / 2);
      return { colunas, linhas: Math.ceil(total / colunas) };
    }
    const exatos = [8, 9, 10, 7, 6, 12].filter(c => total % c === 0);
    if (exatos.length) return { colunas: exatos[0], linhas: total / exatos[0] };
    let melhor = 8, sobraMin = Infinity;
    for (const c of [8, 9, 7, 10, 6]) {
      const sobra = (c - (total % c)) % c;
      if (sobra < sobraMin) { sobraMin = sobra; melhor = c; }
    }
    return { colunas: melhor, linhas: Math.ceil(total / melhor) };
  }

  // ─────────── conferência da placa (tela cheia) ───────────
  // placasIni: array com a quantidade de VENDIDAS já conferida em cada placa.
  // aoConcluir({ placas, vendidas }) → quantas placas e quantas unidades saíram.
  function conferir({ produto, tamanho, unidPorPlaca, placas, vendidasIniciais, aoConcluir }) {
    const est = estiloPlaca(produto);
    const upp = Math.max(1, Number(unidPorPlaca) || 1);
    const g = grade(upp, est.tipo);
    const pequena = tamanho === 'P';

    // Estado: uma lista de Sets, uma por placa física. Cada Set guarda os
    // índices dos furos VAZIOS, ou seja, das peças que foram vendidas.
    const qtdPlacas = Math.max(1, Number(placas) || 1);
    const sel = [];
    for (let i = 0; i < qtdPlacas; i++) {
      const s = new Set();
      // reparte a quantidade já conferida entre as placas, enchendo uma por vez
      let resto = Math.max(0, (Number(vendidasIniciais) || 0) - i * upp);
      for (let k = 0; k < Math.min(resto, upp); k++) s.add(k);
      sel.push(s);
    }
    let atual = 0; // placa que está aberta

    const overlay = el('div', { class: 'placa-tela' });
    const tituloEl = el('strong', { class: 'placa-titulo' }, produto.nome || 'Placa');
    const abasEl = el('div', { class: 'placa-abas' });
    const palcoEl = el('div', { class: 'placa-palco' });
    const contVend = el('strong', null, '0');
    const contFica = el('strong', null, '0');

    const totalVendidas = () => sel.reduce((t, s) => t + s.size, 0);
    const totalUnidades = () => sel.length * upp;

    function atualizaPlacar() {
      const v = totalVendidas();
      texto(contVend, String(v));
      texto(contFica, String(totalUnidades() - v));
    }

    // ── uma placa desenhada ──
    function desenharPlaca() {
      const s = sel[atual];
      palcoEl.innerHTML = '';
      const corpo = el('div', {
        class: 'placa-corpo ' + (pequena ? 'p-pequena' : 'p-grande') + ' ' +
          (est.tipo === 'pendente' ? 'p-pendente' : 'p-brinco'),
        style: '--placa-cor:' + est.cor + ';--placa-txt:' + est.texto +
          ';--placa-cols:' + g.colunas
      });
      corpo.appendChild(el('div', { class: 'placa-cabeca' },
        el('span', null, produto.nome || ''),
        el('span', { class: 'placa-tam' }, (tamanho === 'P' ? 'Placa P' : 'Placa G') + ' · ' + upp + ' un')));

      const gradeEl = el('div', { class: 'placa-grade' });
      for (let linha = 0; linha < g.linhas; linha++) {
        const ini = linha * g.colunas;
        const fim = Math.min(upp, ini + g.colunas);
        if (ini >= fim) break;
        const idxLinha = [];
        for (let i = ini; i < fim; i++) idxLinha.push(i);

        const linhaEl = el('div', { class: 'placa-linha' });
        // botão da fileira inteira: o caminho rápido de quem vendeu tudo
        const btnLinha = el('button', {
          class: 'placa-fileira', type: 'button',
          'aria-label': 'Fileira ' + (linha + 1),
          onclick: () => {
            const todaSelecionada = idxLinha.every(i => s.has(i));
            idxLinha.forEach(i => todaSelecionada ? s.delete(i) : s.add(i));
            vibrar(18);
            desenharPlaca(); atualizaPlacar();
          }
        }, String(linha + 1));
        linhaEl.appendChild(btnLinha);

        const furos = el('div', { class: 'placa-furos' });
        for (const i of idxLinha) {
          const vendida = s.has(i);
          furos.appendChild(el('button', {
            class: 'furo' + (vendida ? ' vazio' : ''), type: 'button',
            'aria-label': 'Posição ' + (i + 1) + (vendida ? ' — vendida' : ' — na placa'),
            'aria-pressed': vendida ? 'true' : 'false',
            onclick: (e) => {
              if (s.has(i)) s.delete(i); else s.add(i);
              const b = e.currentTarget;
              b.classList.toggle('vazio', s.has(i));
              b.setAttribute('aria-pressed', s.has(i) ? 'true' : 'false');
              piscar(b, 'furo-muda');
              atualizaPlacar();
            }
          }, est.tipo === 'pendente' ? el('span', { class: 'fio' }) : null));
        }
        linhaEl.appendChild(furos);
        gradeEl.appendChild(linhaEl);
      }
      corpo.appendChild(gradeEl);
      palcoEl.appendChild(corpo);

      palcoEl.appendChild(el('div', { class: 'row gap8 mt12 placa-atalhos' },
        el('button', {
          class: 'btn-mini grow', onclick: () => {
            for (let i = 0; i < upp; i++) s.add(i);
            desenharPlaca(); atualizaPlacar();
          }
        }, 'Vendeu tudo'),
        el('button', {
          class: 'btn-mini grow', onclick: () => { s.clear(); desenharPlaca(); atualizaPlacar(); }
        }, 'Não vendeu nada')));
    }

    // ── abas: uma por placa física do mesmo produto ──
    function desenharAbas() {
      abasEl.innerHTML = '';
      sel.forEach((s, i) => {
        abasEl.appendChild(el('button', {
          class: 'placa-aba' + (i === atual ? ' ativa' : ''),
          onclick: () => { atual = i; desenharAbas(); desenharPlaca(); }
        }, 'Placa ' + (i + 1), el('span', { class: 'placa-aba-num' }, String(s.size))));
      });
      abasEl.appendChild(el('button', {
        class: 'placa-aba mais', 'aria-label': 'Adicionar outra placa deste produto',
        onclick: () => {
          if (sel.length >= 12) return toast('12 placas do mesmo produto já é o limite.', 'erro');
          sel.push(new Set());
          atual = sel.length - 1;
          desenharAbas(); desenharPlaca(); atualizaPlacar();
        }
      }, ico('mais', 'ic-sm'), 'Placa'));
      if (sel.length > 1) {
        abasEl.appendChild(el('button', {
          class: 'placa-aba tirar', 'aria-label': 'Tirar esta placa',
          onclick: () => {
            sel.splice(atual, 1);
            atual = Math.max(0, atual - 1);
            desenharAbas(); desenharPlaca(); atualizaPlacar();
          }
        }, ico('lixeira', 'ic-sm')));
      }
    }

    const fechar = () => { overlay.remove(); document.body.classList.remove('sem-rolagem'); };

    overlay.append(
      el('div', { class: 'placa-topo' },
        el('button', { class: 'btn-icon', 'aria-label': 'Voltar sem salvar', onclick: fechar }, ico('fechar')),
        tituloEl,
        el('span', { class: 'placa-dica' }, 'Toque no que FOI VENDIDO')),
      abasEl,
      palcoEl,
      el('div', { class: 'placa-rodape' },
        el('div', { class: 'placa-placar' },
          el('div', null, el('span', null, 'Vendidas'), contVend),
          el('div', null, el('span', null, 'Ficam na placa'), contFica)),
        el('div', { class: 'row gap8' },
          el('button', { class: 'btn btn-sec grow', onclick: fechar }, 'Cancelar'),
          el('button', {
            class: 'btn grow', onclick: () => {
              const v = totalVendidas();
              fechar();
              aoConcluir({ placas: sel.length, vendidas: v, unidPorPlaca: upp });
            }
          }, 'Concluir'))));

    document.body.appendChild(overlay);
    document.body.classList.add('sem-rolagem');
    desenharAbas(); desenharPlaca(); atualizaPlacar();
  }

  // ─────────── calculadora ───────────
  // Serve para a conta do dia a dia: "4 fileiras × 8 = 32". Fica dentro do
  // pedido justamente para o vendedor não precisar sair do app.
  function calculadora({ aoLancar, rotuloLancar }) {
    const { modal } = window.NSUI;
    let acumulado = null, operacao = null, digitando = '0', recomecar = false;
    const visor = el('div', { class: 'calc-visor' }, '0');
    const conta = el('div', { class: 'calc-conta' }, '');

    const mostrar = () => {
      texto(visor, digitando);
      texto(conta, acumulado == null ? '' :
        formata(acumulado) + ' ' + (operacao || '') + (recomecar ? '' : ' ' + digitando), false);
    };
    const formata = (n) => {
      const v = Math.round(Number(n) * 1e6) / 1e6;
      return String(v).replace('.', ',');
    };
    const digito = (d) => {
      if (recomecar) { digitando = '0'; recomecar = false; }
      if (d === ',') { if (!digitando.includes(',')) digitando += ','; }
      else digitando = digitando === '0' ? d : digitando + d;
      mostrar();
    };
    const num = () => Number(String(digitando).replace(',', '.')) || 0;
    const resolve = () => {
      if (acumulado == null || operacao == null) return num();
      const b = num();
      if (operacao === '+') return acumulado + b;
      if (operacao === '−') return acumulado - b;
      if (operacao === '×') return acumulado * b;
      if (operacao === '÷') return b === 0 ? 0 : acumulado / b;
      return b;
    };
    const op = (o) => {
      const r = resolve();
      acumulado = r; operacao = o; recomecar = true;
      digitando = formata(r);
      mostrar();
    };
    const igual = () => {
      const r = resolve();
      acumulado = null; operacao = null; recomecar = true;
      digitando = formata(r);
      mostrar();
    };
    const limpar = () => { acumulado = null; operacao = null; digitando = '0'; recomecar = false; mostrar(); };
    const apagar = () => {
      if (recomecar) return limpar();
      digitando = digitando.length > 1 ? digitando.slice(0, -1) : '0';
      mostrar();
    };

    const tecla = (rotulo, acao, cls) => el('button', {
      class: 'calc-tecla' + (cls ? ' ' + cls : ''), type: 'button', onclick: acao
    }, rotulo);

    const teclado = el('div', { class: 'calc-teclado' },
      tecla('C', limpar, 'apaga'), tecla('⌫', apagar, 'apaga'),
      tecla('÷', () => op('÷'), 'op'), tecla('×', () => op('×'), 'op'),
      tecla('7', () => digito('7')), tecla('8', () => digito('8')), tecla('9', () => digito('9')),
      tecla('−', () => op('−'), 'op'),
      tecla('4', () => digito('4')), tecla('5', () => digito('5')), tecla('6', () => digito('6')),
      tecla('+', () => op('+'), 'op'),
      tecla('1', () => digito('1')), tecla('2', () => digito('2')), tecla('3', () => digito('3')),
      tecla('=', igual, 'igual alto'),
      tecla('0', () => digito('0'), 'zero'), tecla(',', () => digito(',')));

    const m = modal(el('div', { class: 'calc-caixa' },
      conta, visor, teclado,
      el('button', {
        class: 'btn big w100 mt12', onclick: () => {
          const r = Math.round(resolve());
          if (r < 0) return toast('Não dá para lançar um número negativo.', 'erro');
          m.fechar();
          aoLancar(r);
        }
      }, rotuloLancar || 'Lançar no devolvido')), { titulo: 'Calculadora' });
    mostrar();
  }

  window.NSPlaca = { conferir, calculadora, estiloPlaca, grade, PLACAS };
})();
