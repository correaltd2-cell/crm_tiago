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
  // As cores e o desenho saem das placas FÍSICAS: o vendedor bate o olho na
  // tela e reconhece qual placa tem na mão.
  //   cabeca = cor do topo da placa · peca = cor da peça presa no furo
  //   texto  = cor do nome escrito no topo
  //   tipo   = 'brinco' (furos em fileiras) ou 'pendente' (gargantilha e
  //            pulseira, que ficam penduradas nos ganchos do alto)
  //   sigla/nome = as duas linhas escritas no topo da placa
  const CINZA_VAZIO = '#737373';   // furo sem peça = unidade vendida
  const PLACAS = {
    '(BRAG) BRINCO ARGOLINHA': {
      cabeca: '#9B114F', peca: '#9B114F', texto: '#ffffff', tipo: 'brinco',
      sigla: 'BRAG', nome: 'ARGOLINHA', arte: 'brincoPerola'
    },
    '(BRP) BRINCO PEQUENO CLASSIC': {
      cabeca: '#14543A', peca: '#14543A', texto: '#ffffff', tipo: 'brinco',
      sigla: 'BRP', nome: 'CLASSIC', arte: 'brincoPequeno'
    },
    '(PONTO DE LUZ) PONTO DE LUZ ZIRCÔNIA': {
      cabeca: '#1B1B1F', peca: '#1B1B1F', texto: '#ffffff', tipo: 'brinco',
      sigla: 'PONTO DE LUZ', nome: 'ZIRCÔNIA', arte: 'pontoDeLuz'
    },
    '(LUXO) LUXO DOURADO': {
      cabeca: '#8BD5FF', peca: '#5CB7EB', texto: '#290F5D', tipo: 'brinco',
      sigla: 'LUXO', nome: 'DOURADO', arte: 'argolaDourada'
    },
    '(LUXO) LUXO PRATA': {
      cabeca: '#8BD5FF', peca: '#5CB7EB', texto: '#290F5D', tipo: 'brinco',
      sigla: 'LUXO', nome: 'PRATA', arte: 'argolaPrata'
    },
    '(PARIS) GARGANTILHA PARIS': {
      cabeca: '#7C8088', peca: '#7C8088', texto: '#ffffff', tipo: 'pendente',
      sigla: 'PARIS', nome: 'GARGANTILHA', arte: 'gargantilha'
    },
    '(PULA) PULSEIRA ADULTA': {
      cabeca: '#9B114F', peca: '#9B114F', texto: '#ffffff', tipo: 'pendente',
      sigla: 'PULA', nome: 'PULSEIRA ADULTA', arte: 'corrente'
    },
    '(PUL) PULSEIRA INFANTIL': {
      cabeca: '#8BD5FF', peca: '#F5D19A', texto: '#7801D6', tipo: 'pendente',
      fioCheio: true, sigla: 'PUL', nome: 'PULSEIRA INFANTIL', arte: 'castelo'
    },
    '(NEW YORK) GARGANTILHA NEW YORK': {
      cabeca: '#8BD5FF', peca: '#2F6FB5', texto: '#10225C', tipo: 'pendente',
      sigla: 'NEW YORK', nome: 'GARGANTILHA', arte: 'gargantilha'
    },
    '(ANEL) ANEL REGULÁVEL': {
      cabeca: '#BF8A39', peca: '#BF8A39', texto: '#ffffff', tipo: 'brinco',
      sigla: 'ANEL', nome: 'REGULÁVEL', arte: 'anel'
    }
  };
  const PADRAO = { cabeca: '#290F5D', peca: '#290F5D', texto: '#ffffff', tipo: 'brinco' };

  // Desenhos do canto do topo, no espírito das placas físicas. São decoração:
  // se um dia vierem as artes definitivas, é só trocar aqui.
  const ARTES = {
    argolaDourada:
      '<circle cx="34" cy="34" r="20" fill="none" stroke="#F2B21B" stroke-width="7"/>' +
      '<circle cx="34" cy="34" r="20" fill="none" stroke="#FFD75E" stroke-width="3.5"/>' +
      '<circle cx="56" cy="34" r="20" fill="none" stroke="#D9970E" stroke-width="7"/>' +
      '<circle cx="56" cy="34" r="20" fill="none" stroke="#FFCE4B" stroke-width="3.5"/>',
    argolaPrata:
      '<circle cx="34" cy="34" r="20" fill="none" stroke="#B9BDC4" stroke-width="7"/>' +
      '<circle cx="34" cy="34" r="20" fill="none" stroke="#EDEFF2" stroke-width="3.5"/>' +
      '<circle cx="56" cy="34" r="20" fill="none" stroke="#9AA0A8" stroke-width="7"/>' +
      '<circle cx="56" cy="34" r="20" fill="none" stroke="#DDE1E6" stroke-width="3.5"/>',
    brincoPerola:
      '<path d="M30 12a11 11 0 0 1 11 11v10" fill="none" stroke="#F2B21B" stroke-width="6" stroke-linecap="round"/>' +
      '<path d="M41 33v6" stroke="#D9970E" stroke-width="4" stroke-linecap="round"/>' +
      '<circle cx="41" cy="50" r="11" fill="#F2F2F2"/><circle cx="37" cy="46" r="3.6" fill="#ffffff"/>' +
      '<path d="M58 12a11 11 0 0 1 11 11v10" fill="none" stroke="#F2B21B" stroke-width="6" stroke-linecap="round"/>' +
      '<path d="M69 33v6" stroke="#D9970E" stroke-width="4" stroke-linecap="round"/>' +
      '<circle cx="69" cy="50" r="11" fill="#F2F2F2"/><circle cx="65" cy="46" r="3.6" fill="#ffffff"/>',
    brincoPequeno:
      '<g fill="none" stroke="#F2B21B" stroke-width="5">' +
      '<path d="M26 50a13 13 0 1 1 26 0 13 13 0 0 1-26 0Z"/><path d="M52 30a13 13 0 1 1 26 0 13 13 0 0 1-26 0Z"/></g>' +
      '<circle cx="39" cy="50" r="6" fill="#BFE9FF"/><circle cx="65" cy="30" r="6" fill="#BFE9FF"/>' +
      '<path d="M39 26a8 8 0 0 1 8 8" fill="none" stroke="#D9970E" stroke-width="4" stroke-linecap="round"/>' +
      '<path d="M65 6a8 8 0 0 1 8 8" fill="none" stroke="#D9970E" stroke-width="4" stroke-linecap="round"/>',
    pontoDeLuz:
      '<path d="M40 16 47 33 64 40 47 47 40 64 33 47 16 40 33 33Z" fill="#BFE9FF"/>' +
      '<path d="M40 24 44.5 35.5 56 40 44.5 44.5 40 56 35.5 44.5 24 40 35.5 35.5Z" fill="#ffffff"/>' +
      '<path d="M70 14 73 22 81 25 73 28 70 36 67 28 59 25 67 22Z" fill="#9BD9F7"/>',
    anel:
      '<circle cx="44" cy="52" r="20" fill="none" stroke="#F2B21B" stroke-width="8"/>' +
      '<circle cx="44" cy="52" r="20" fill="none" stroke="#FFD75E" stroke-width="3.5"/>' +
      '<path d="m44 8 13 13-13 13-13-13Z" fill="#BFE9FF"/><path d="m44 13 8 8-8 8-8-8Z" fill="#ffffff"/>',
    corrente:
      '<g fill="none" stroke="#F2B21B" stroke-width="5.5">' +
      '<ellipse cx="16" cy="38" rx="9" ry="6"/><ellipse cx="32" cy="34" rx="9" ry="6"/>' +
      '<ellipse cx="48" cy="34" rx="9" ry="6"/><ellipse cx="64" cy="38" rx="9" ry="6"/>' +
      '<ellipse cx="78" cy="44" rx="9" ry="6"/></g>',
    gargantilha:
      '<path d="M14 16a30 26 0 0 0 52 0" fill="none" stroke="#F2B21B" stroke-width="6"/>' +
      '<path d="M40 40v10" stroke="#D9970E" stroke-width="4" stroke-linecap="round"/>' +
      '<path d="m40 50 10 10-10 10-10-10Z" fill="#BFE9FF"/>',
    castelo:
      '<path d="M14 72V38h12V26h10v12h8V20h12v18h8V26h10v12h12v34Z" fill="#E6D9F5"/>' +
      '<path d="M20 38 26 22l6 16ZM48 20l6-14 6 14ZM76 38l6-16 6 16Z" fill="#D633C8"/>' +
      '<rect x="44" y="52" width="16" height="20" rx="8" fill="#7801D6"/>' +
      '<rect x="24" y="50" width="9" height="12" rx="4.5" fill="#D633C8"/>' +
      '<rect x="71" y="50" width="9" height="12" rx="4.5" fill="#D633C8"/>'
  };

  function estiloPlaca(produto) {
    const nome = (produto && produto.nome) || '';
    const e = PLACAS[nome];
    if (e) return e;
    // produto sem referência de placa: usa a cor do app e parte o nome em duas
    const m = nome.match(/^\(([^)]+)\)\s*(.*)$/);
    return Object.assign({}, PADRAO, {
      sigla: m ? m[1] : nome.slice(0, 12), nome: m ? m[2] : ''
    });
  }

  // ─────────── distribuição dos furos ───────────
  // As placas de verdade têm fileiras fechadas, e cada modelo tem a sua largura:
  // 48 = 8×6 · 64 = 8×8 · 72 = 9×8 · 99 = 9×11. Fora dessas, procura o número
  // de colunas que fecha as fileiras, para não sobrar fileira com um furo só.
  const COLUNAS_CONHECIDAS = { 16: 8, 32: 8, 48: 8, 64: 8, 72: 9, 96: 8, 99: 9 };
  function grade(total, tipo) {
    if (total <= 0) return { colunas: 1, linhas: 0 };
    // Gargantilha e pulseira ficam PENDURADAS numa régua de ganchos. Até 12
    // cabem numa fileira só; acima disso a régua é partida em duas, senão o
    // gancho fica fino demais para o dedo acertar (22 numa linha dá 14px).
    if (tipo === 'pendente') {
      const colunas = total <= 12 ? total : Math.ceil(total / 2);
      return { colunas, linhas: Math.ceil(total / colunas) };
    }
    const col = COLUNAS_CONHECIDAS[total];
    if (col) return { colunas: col, linhas: Math.ceil(total / col) };
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
  // aoConcluir({ placas, vendidas }) → quantas placas e quantas unidades saíram.
  function conferir({ produto, tamanho, unidPorPlaca, placas, vendidasIniciais, aoConcluir }) {
    const est = estiloPlaca(produto);
    const upp = Math.max(1, Number(unidPorPlaca) || 1);
    const g = grade(upp, est.tipo);
    const pendente = est.tipo === 'pendente';
    const pequena = tamanho === 'P';   // placa P tem o topo em arco; a G é reta

    // Uma lista de Sets, uma por placa física. Cada Set guarda os índices dos
    // furos SEM peça — ou seja, as unidades vendidas.
    const qtdPlacas = Math.max(1, Number(placas) || 1);
    const sel = [];
    for (let i = 0; i < qtdPlacas; i++) {
      const s = new Set();
      const resto = Math.max(0, (Number(vendidasIniciais) || 0) - i * upp);
      for (let k = 0; k < Math.min(resto, upp); k++) s.add(k);
      sel.push(s);
    }
    let atual = 0;

    const overlay = el('div', { class: 'placa-tela' });
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
      abasEl.querySelectorAll('.placa-aba-num').forEach((n, i) => {
        if (sel[i]) texto(n, String(sel[i].size), false);
      });
    }

    // ── a placa desenhada, igual à placa física ──
    function desenharPlaca() {
      const s = sel[atual];
      palcoEl.innerHTML = '';

      const cartao = el('div', {
        class: 'placa-cartao' + (pequena ? ' p-pequena' : ' p-grande') +
          (pendente ? ' p-pendente' : ' p-brinco'),
        style: '--cabeca:' + est.cabeca + ';--peca:' + est.peca +
          ';--txt:' + est.texto + ';--vazio:' + CINZA_VAZIO +
          ';--cols:' + g.colunas
      });

      // topo: sigla e nome em duas linhas, com o desenho do produto no canto
      const arte = est.arte && ARTES[est.arte];
      const sigla = est.sigla || '', nome = est.nome || '';
      // o nome sempre em DUAS linhas: encolhe a letra quando o texto é comprido
      const maior = Math.max(sigla.length, nome.length);
      const escala = maior > 14 ? 6.2 : maior > 11 ? 7.4 : maior > 8 ? 8.6 : 10;
      const cabeca = el('div', { class: 'placa-cabeca', style: '--nome-tam:' + escala + 'cqw' },
        el('div', { class: 'placa-nome' },
          el('span', null, sigla),
          el('span', null, nome)));
      if (arte) {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 92 80');
        svg.setAttribute('class', 'placa-arte');
        svg.setAttribute('aria-hidden', 'true');
        svg.innerHTML = arte;
        cabeca.appendChild(svg);
      }
      cartao.appendChild(cabeca);

      // corpo branco com os furos
      const corpo = el('div', { class: 'placa-corpo' });
      const gradeEl = el('div', { class: 'placa-grade' });
      const fileiras = el('div', { class: 'placa-fileiras' });

      for (let linha = 0; linha < g.linhas; linha++) {
        const ini = linha * g.colunas;
        const fim = Math.min(upp, ini + g.colunas);
        if (ini >= fim) break;
        const idx = [];
        for (let i = ini; i < fim; i++) idx.push(i);

        // o botão da fileira fica FORA da placa, para não sujar o desenho
        fileiras.appendChild(el('button', {
          class: 'placa-fileira', type: 'button',
          'aria-label': 'Fileira ' + (linha + 1) + ' inteira',
          onclick: () => {
            const cheia = idx.every(i => s.has(i));
            idx.forEach(i => cheia ? s.delete(i) : s.add(i));
            vibrar(18);
            desenharPlaca(); atualizaPlacar();
          }
        }, String(linha + 1)));

        for (const i of idx) {
          const vendida = s.has(i);
          gradeEl.appendChild(el('button', {
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
          }, pendente ? el('span', { class: 'fio' + (est.fioCheio ? ' cheio' : '') }) : null));
        }
      }
      corpo.appendChild(gradeEl);
      cartao.appendChild(corpo);

      palcoEl.appendChild(el('div', { class: 'placa-linha-cartao' }, fileiras, cartao));

      // A placa tem que caber INTEIRA na tela. Rolar faz o vendedor perder as
      // primeiras fileiras de vista, e aí ele não consegue bater a conferência
      // com a placa física que está na mão. Como tudo dentro do cartão está em
      // cqw, a altura é proporcional à largura: mede-se a proporção e calcula-se
      // a largura que faz a placa fechar na altura disponível.
      const FURO_MIN = pendente ? 15 : 19;   // abaixo disso o dedo não acerta mais
      function encaixarNaTela() {
        const f0 = gradeEl.children[0];
        if (!f0 || !palcoEl.clientHeight) return;
        cartao.style.maxWidth = '';
        // duas passadas: a primeira acerta a largura, a segunda corrige o que
        // mudou de altura no cabeçalho ao encolher a letra
        for (let passo = 0; passo < 2; passo++) {
          const largura = cartao.getBoundingClientRect().width;
          const altura = cartao.getBoundingClientRect().height;
          if (!largura || !altura) return;
          const sobra = palcoEl.clientHeight - (palcoEl.scrollHeight - altura);
          if (sobra <= 0) return;
          const proporcao = altura / largura;
          const alvo = Math.min(largura, Math.floor(sobra / proporcao));
          // não encolhe a ponto de o furo virar um pontinho: aí volta a rolar
          const furoAgora = f0.getBoundingClientRect().height;
          const minimo = largura * (FURO_MIN / furoAgora);
          cartao.style.maxWidth = Math.max(alvo, Math.ceil(minimo)) + 'px';
        }
      }
      // os botões de fileira ficam do lado de fora, então precisam ser medidos
      // pela placa de verdade para casar linha a linha
      function alinharFileiras() {
        const f0 = gradeEl.children[0], f1 = gradeEl.children[g.colunas];
        if (!f0) return;
        const r0 = f0.getBoundingClientRect();
        const gap = f1 ? (f1.getBoundingClientRect().top - r0.bottom) : 0;
        fileiras.style.setProperty('--furo-alt', r0.height + 'px');
        fileiras.style.setProperty('--furo-gap', gap + 'px');
        fileiras.style.setProperty('--topo-grade',
          (r0.top - fileiras.getBoundingClientRect().top) + 'px');
      }
      requestAnimationFrame(() => {
        encaixarNaTela();
        alinharFileiras();
      });
      // virou o celular de lado: refaz a conta do encaixe
      if (!overlay._aoGirar) {
        overlay._aoGirar = () => {
          const g2 = overlay.querySelector('.placa-grade');
          if (g2) requestAnimationFrame(() => { encaixarNaTela(); alinharFileiras(); });
        };
        window.addEventListener('resize', overlay._aoGirar);
      }

      palcoEl.appendChild(el('div', { class: 'placa-atalhos' },
        el('button', {
          class: 'placa-atalho', onclick: () => {
            for (let i = 0; i < upp; i++) s.add(i);
            desenharPlaca(); atualizaPlacar();
          }
        }, 'Vendeu tudo'),
        el('button', {
          class: 'placa-atalho', onclick: () => { s.clear(); desenharPlaca(); atualizaPlacar(); }
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

    const fechar = () => {
      if (overlay._aoGirar) window.removeEventListener('resize', overlay._aoGirar);
      overlay.remove();
      document.body.classList.remove('sem-rolagem');
    };

    overlay.append(
      el('button', { class: 'placa-x', 'aria-label': 'Voltar sem salvar', onclick: fechar },
        ico('fechar')),
      abasEl,
      palcoEl,
      el('div', { class: 'placa-rodape' },
        el('div', { class: 'placa-placar' },
          el('div', null, el('span', null, 'Vendidas'), contVend),
          el('div', null, el('span', null, 'Ficam'), contFica)),
        el('div', { class: 'row gap8' },
          el('button', { class: 'placa-cancelar', onclick: fechar }, 'Cancelar'),
          el('button', {
            class: 'placa-concluir', onclick: () => {
              const v = totalVendidas();
              fechar();
              aoConcluir({ placas: sel.length, vendidas: v, unidPorPlaca: upp });
            }
          }, 'CONCLUÍDO'))));

    document.body.appendChild(overlay);
    document.body.classList.add('sem-rolagem');
    desenharAbas(); desenharPlaca(); atualizaPlacar();
  }

  // ─────────── calculadora ───────────
  // O número grande mostra a CONTA INTEIRA sendo montada ("9 × 2"), para o
  // vendedor enxergar o que está fazendo. Só no "=" ele vira o resultado, e
  // aí a conta que gerou o número fica na linha de cima ("9 × 2 =").
  function calculadora({ aoLancar, rotuloLancar }) {
    const { modal } = window.NSUI;
    const OPS = ['+', '−', '×', '÷'];
    let pecas = ['0'];        // ['4','×','8','+','2'] — números e operadores
    let fechado = '';         // a conta já resolvida, mostrada em cima
    let recemResolvido = false;

    const visor = el('div', { class: 'calc-visor' }, '0');
    const conta = el('div', { class: 'calc-conta' }, '\u00a0');
    const rotuloBase = rotuloLancar || 'Lançar no devolvido';
    const btnLancar = el('button', { class: 'btn big w100 mt12' }, rotuloBase);

    const ehOp = (t) => OPS.indexOf(t) >= 0;
    const fmt = (n) => {
      const v = Math.round(Number(n) * 1e6) / 1e6;
      return String(v).replace('.', ',');
    };
    const num = (t) => Number(String(t).replace(',', '.')) || 0;

    // resolve da esquerda para a direita, como qualquer calculadora de celular
    function resolver(lista) {
      const p = lista.slice();
      if (ehOp(p[p.length - 1])) p.pop();     // operador solto no fim não conta
      if (!p.length) return 0;
      let total = num(p[0]);
      for (let i = 1; i < p.length - 1; i += 2) {
        const o = p[i], b = num(p[i + 1]);
        if (o === '+') total += b;
        else if (o === '−') total -= b;
        else if (o === '×') total *= b;
        else if (o === '÷') total = b === 0 ? 0 : total / b;
      }
      return total;
    }

    function mostrar() {
      const texto1 = pecas.join(' ');
      texto(visor, texto1, false);
      // a letra encolhe conforme a conta cresce, para nunca cortar na tela
      visor.classList.toggle('medio', texto1.length > 10);
      visor.classList.toggle('pequeno', texto1.length > 15);
      visor.classList.toggle('mini', texto1.length > 22);
      texto(conta, fechado || '\u00a0', false);
      const r = Math.round(resolver(pecas));
      btnLancar.textContent = rotuloBase + (r > 0 ? ' · ' + r : '');
    }

    const digito = (d) => {
      // depois do "=" um número novo começa uma conta nova
      if (recemResolvido) { pecas = ['0']; fechado = ''; recemResolvido = false; }
      const i = pecas.length - 1;
      if (ehOp(pecas[i])) { pecas.push(d === ',' ? '0,' : d); return mostrar(); }
      let t = pecas[i];
      if (d === ',') { if (!t.includes(',')) t += ','; }
      else if (t.length < 12) t = t === '0' ? d : t + d;
      pecas[i] = t;
      mostrar();
    };
    const operador = (o) => {
      // depois do "=" o operador continua a conta a partir do resultado
      if (recemResolvido) { fechado = ''; recemResolvido = false; }
      const i = pecas.length - 1;
      if (ehOp(pecas[i])) pecas[i] = o;        // trocou de ideia no operador
      else pecas.push(o);
      mostrar();
    };
    const igual = () => {
      if (pecas.length < 3) return;            // ainda não há conta para fechar
      const limpa = pecas.slice();
      if (ehOp(limpa[limpa.length - 1])) limpa.pop();
      if (limpa.length < 3) return;
      fechado = limpa.join(' ') + ' =';
      pecas = [fmt(resolver(limpa))];
      recemResolvido = true;
      mostrar();
    };
    const limpar = () => { pecas = ['0']; fechado = ''; recemResolvido = false; mostrar(); };
    const apagar = () => {
      if (recemResolvido) return limpar();
      const i = pecas.length - 1;
      if (ehOp(pecas[i]) || pecas[i].length <= 1) {
        if (pecas.length > 1) pecas.pop(); else pecas[0] = '0';
      } else pecas[i] = pecas[i].slice(0, -1);
      if (!pecas.length) pecas = ['0'];
      mostrar();
    };

    const tecla = (rotulo, acao, cls) => el('button', {
      class: 'calc-tecla' + (cls ? ' ' + cls : ''), type: 'button',
      'aria-label': rotulo === '⌫' ? 'Apagar o último número' : rotulo,
      onclick: acao
    }, rotulo);

    // mesma disposição da calculadora do celular
    const teclado = el('div', { class: 'calc-teclado' },
      tecla('C', limpar, 'apaga'), tecla('⌫', apagar, 'apaga'),
      tecla('÷', () => operador('÷'), 'op'), tecla('×', () => operador('×'), 'op'),
      tecla('7', () => digito('7')), tecla('8', () => digito('8')), tecla('9', () => digito('9')),
      tecla('−', () => operador('−'), 'op'),
      tecla('4', () => digito('4')), tecla('5', () => digito('5')), tecla('6', () => digito('6')),
      tecla('+', () => operador('+'), 'op'),
      tecla('1', () => digito('1')), tecla('2', () => digito('2')), tecla('3', () => digito('3')),
      tecla('=', igual, 'igual alto'),
      tecla('0', () => digito('0'), 'zero'), tecla(',', () => digito(',')));

    const m = modal(el('div', { class: 'calc-caixa' },
      el('div', { class: 'calc-tela' }, conta, visor),
      teclado, btnLancar), { titulo: 'Calculadora' });

    btnLancar.onclick = () => {
      const r = Math.round(resolver(pecas));
      if (r < 0) return toast('Não dá para lançar um número negativo.', 'erro');
      m.fechar();
      aoLancar(r);
    };
    mostrar();
  }

  window.NSPlaca = { conferir, calculadora, estiloPlaca, grade, PLACAS };
})();
