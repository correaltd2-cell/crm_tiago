/* NEW STAR — Módulo B: Talão de Pedido Digital
 * Fluxo: Cliente → Tabela → Placas/Produtos (dev. Display/Quebrada) →
 * Conferência → Assinatura → Concluído → PDF/Compartilhar/Imprimir */
(function () {
  'use strict';
  const { $, el, escH, toast, modal, confirmar, dataBR, hojeISO, ico, icoHTML, rot } = window.NSUI;
  const C = window.NSCalc, DB = window.NSDB;

  const precoDe = (p, tabela) => tabela === 'lucro' ? p.preco_lucro : p.preco_simples;
  const nomeProd = (p) => p.nome + (p.variacao ? ' (' + p.variacao + ')' : '');

  function sessao() { return window.NSApp.sessao(); }

  // triângulo de alerta = cliente com pendência aberta ou observação interna anotada
  function temAlertaCliente(clienteId) {
    return DB.all('pendencias').some(p => p.cliente_id === clienteId && !p.resolvida_em) ||
      DB.all('cliente_notas').some(n => n.cliente_id === clienteId);
  }

  // ============ NOVO PEDIDO (wizard) — também edita um pedido concluído ============
  function novo(clientePre, pedidoExistente) {
    const editando = !!pedidoExistente;
    const ped = editando ? {
      id: pedidoExistente.id, cliente_id: pedidoExistente.cliente_id,
      data: pedidoExistente.data_pedido, tabela: pedidoExistente.tabela,
      condicao_pagamento: pedidoExistente.condicao_pagamento,
      itens: DB.all('pedido_itens').filter(i => i.pedido_id === pedidoExistente.id)
        .map(i => Object.assign({}, i)),
      obs: pedidoExistente.observacoes || '',
      desconto_pct: Number(pedidoExistente.desconto_pct || 0),
      assinatura: pedidoExistente.assinatura || null,
      assinante_nome: pedidoExistente.assinante_nome || null,
      deixou_display: !!pedidoExistente.deixou_display,
      material_deixado: pedidoExistente.material_deixado || ''
    } : {
      id: DB.uuid(), cliente_id: clientePre ? clientePre.id : null,
      data: hojeISO(), tabela: null, condicao_pagamento: null,
      itens: [], obs: '', assinatura: null, desconto_pct: 0
    };
    const m = modal(el('div'), {
      titulo: editando ? 'Editar Pedido nº ' + (pedidoExistente.numero || '') : 'Novo Pedido',
      full: true, bloqueado: true
    });
    if (editando) passoItens(); else passoCliente();

    // ---- Passo 1: cliente (busca parcial CNPJ / nome / cidade) ----
    function passoCliente() {
      if (ped.cliente_id) return passoTabela();
      const lista = el('div', { class: 'lista' });
      const busca = el('input', {
        class: 'input big', placeholder: 'Buscar por CNPJ, nome ou cidade…',
        autofocus: '', oninput: render
      });
      function render() {
        const q = busca.value.trim().toLowerCase();
        const qNum = q.replace(/\D/g, '');
        lista.innerHTML = '';
        const cls = DB.all('clientes').filter(c => c.status !== 'inativo').filter(c => {
          if (!q) return true;
          return (c.nome || '').toLowerCase().includes(q) ||
            (c.cidade || '').toLowerCase().includes(q) ||
            (qNum && (c.cnpj_cpf || '').replace(/\D/g, '').includes(qNum));
        }).slice(0, 40);
        for (const c of cls) {
          lista.appendChild(el('button', {
            class: 'item-lista', onclick: () => { ped.cliente_id = c.id; passoTabela(); }
          },
            el('strong', null, temAlertaCliente(c.id) ? ico('alerta', 'ic-aviso') : null, c.nome),
            el('span', { class: 'sub' }, [c.cidade, c.uf].filter(Boolean).join(' - ') +
              (c.cnpj_cpf ? ' · ' + C.fmtCNPJ(c.cnpj_cpf) : '') + (c.rede ? ' · ' + c.rede : ''))));
        }
        if (!cls.length) lista.appendChild(el('p', { class: 'vazio' }, 'Nenhum cliente encontrado.'));
      }
      render();
      corpo(el('div', null, busca, lista));
      setTimeout(() => busca.focus(), 50);
    }

    // ---- Passo 2: tabela de preço (o prazo fica para a conferência) ----
    function passoTabela() {
      const cli = DB.byId('clientes', ped.cliente_id);
      // o cadastro do cliente manda: se ele é só Simples ou só Lucro, só essa aparece
      const permitidas = C.tabelasDoCliente(cli);
      const so1 = permitidas.length === 1;
      if (so1) ped.tabela = permitidas[0];
      const btn = (tab, rot, desc) => el('button', {
        class: 'card-escolha' + (ped.tabela === tab ? ' ativo' : ''),
        onclick: () => { ped.tabela = tab; passoItens(); }
      }, el('strong', null, rot), el('span', { class: 'sub' }, desc));
      corpo(el('div', null,
        cabecalhoCliente(cli),
        el('h3', { class: 'mt12' }, 'Tabela de preço do pedido'),
        so1 ? el('p', { class: 'sub mt4' },
          `Este cliente é ${C.NOME_TABELA[permitidas[0]]} — definido no cadastro.`) : null,
        el('div', { class: 'col gap8 mt8' },
          permitidas.includes('simples')
            ? btn('simples', 'Tabela Simples', 'Preços da tabela Simples para todos os itens') : null,
          permitidas.includes('lucro')
            ? btn('lucro', 'Tabela Lucro Presumido', 'Preços Lucro Presumido para todos os itens') : null),
        el('button', { class: 'btn-link mt8', onclick: () => { ped.cliente_id = null; passoCliente(); } }, rot('setaEsq', 'trocar cliente'))));
    }

    // ---- Passo 3: itens ----
    function passoItens() {
      const cli = DB.byId('clientes', ped.cliente_id);
      const wrap = el('div');
      const render = () => {
        wrap.innerHTML = '';
        wrap.appendChild(cabecalhoCliente(cli, ped));
        const listEl = el('div', { class: 'col gap8 mt8' });
        ped.itens.forEach((it, idx) => {
          const p = DB.byId('produtos', it.produto_id);
          listEl.appendChild(el('div', { class: 'card-item' },
            el('div', { class: 'row space' },
              el('strong', null, (p.codigo ? p.codigo + ' · ' : '') + nomeProd(p)),
              el('button', { class: 'btn-icon', onclick: () => { ped.itens.splice(idx, 1); render(); }, 'aria-label': 'Remover produto' }, ico('lixeira'))),
            el('div', { class: 'sub' },
              (it.tamanho === 'AV'
                ? `Avulso · ${it.unid_colocadas} un`
                : `Placa ${it.tamanho} ×${it.placas} = ${it.unid_colocadas} un`) +
              ` · dev.display ${it.dev_display} · quebrada ${it.dev_quebrada}`),
            el('div', { class: 'row space mt4' },
              el('span', null, it.unid_vendidas < 0
                ? `${-it.unid_vendidas} recolhidas × ${C.fmtMoney(it.preco_unit)}`
                : `${it.unid_vendidas} vendidas × ${C.fmtMoney(it.preco_unit)}`),
              el('strong', null, C.fmtMoney(it.valor_total))),
            el('button', { class: 'btn-link', onclick: () => formItem(it, idx) }, 'editar')));
        });
        const tot = C.calcTotais(ped.itens);
        wrap.appendChild(listEl);
        wrap.appendChild(el('button', { class: 'btn btn-sec big mt12 w100', onclick: () => formItem(null) }, '+ Adicionar produto'));
        wrap.appendChild(el('div', { class: 'total-bar mt12' },
          el('span', null, `${tot.vendidas} un vendidas`),
          el('strong', null, C.fmtMoney(tot.valor))));
        wrap.appendChild(el('div', { class: 'row gap8 mt12' },
          el('button', { class: 'btn btn-sec grow', onclick: passoTabela }, rot('setaEsq', 'Voltar')),
          el('button', {
            class: 'btn grow', disabled: ped.itens.length ? null : '',
            onclick: passoConferencia
          }, 'Conferir', ico('setaDir'))));
      };
      render();
      corpo(wrap);

      // ---- formulário de um item ----
      function formItem(item, idx) {
        const isNovo = !item;
        item = item || { produto_id: null, tamanho: 'P', placas: 1, dev_display: 0, dev_quebrada: 0 };
        const box = el('div');
        const mi = modal(box, { titulo: isNovo ? 'Adicionar produto' : 'Editar produto' });

        function selecionarProduto() {
          box.innerHTML = '';
          const busca = el('input', { class: 'input big', placeholder: 'Buscar produto ou código…', oninput: rend });
          const lista = el('div', { class: 'lista' });
          function rend() {
            const q = busca.value.trim().toLowerCase();
            lista.innerHTML = '';
            // só produtos ATIVOS e com preço na tabela escolhida (inativos não aparecem)
            const ativos = DB.all('produtos').filter(p =>
              p.ativo !== false && String(p.ativo) !== 'false' && p.status !== 'inativo' &&
              precoDe(p, ped.tabela) != null);
            // quem casa com a busca vem primeiro (código/começo do nome antes do meio)
            const rank = (p) => {
              if (!q) return 3;
              const cod = String(p.codigo || '').toLowerCase(), nome = nomeProd(p).toLowerCase();
              if (cod === q) return 0;
              if (cod.startsWith(q) || nome.startsWith(q)) return 1;
              return 2;
            };
            ativos
              .filter(p => !q || nomeProd(p).toLowerCase().includes(q) || String(p.codigo || '').toLowerCase().includes(q))
              .sort((a, b) => rank(a) - rank(b) || String(a.codigo || '').localeCompare(String(b.codigo || '')))
              .forEach(p => {
                const preco = precoDe(p, ped.tabela);
                const semPreco = preco == null;
                const semUnid = p.unid_placa_p == null || p.unid_placa_g == null;
                lista.appendChild(el('button', {
                  class: 'item-lista' + (semPreco ? ' desabilitado' : ''),
                  onclick: () => {
                    if (semPreco) return toast('Produto sem preço na tabela escolhida — cadastre no Admin → Produtos.', 'erro');
                    if (semUnid) { item.tamanho = 'AV'; }
                    item.produto_id = p.id; formQtde();
                  }
                },
                  el('strong', null, (p.codigo ? p.codigo + ' · ' : '') + nomeProd(p)),
                  el('span', { class: 'sub' }, (semUnid ? 'unidades por placa a cadastrar · '
                    : `P=${p.unid_placa_p}un · G=${p.unid_placa_g}un · `) +
                    (semPreco ? 'preço a cadastrar' : C.fmtMoney(preco)))));
              });
          }
          rend();
          box.appendChild(busca); box.appendChild(lista);
          // resultado sempre visível: rola a lista e o modal para o topo a cada busca
          busca.addEventListener('input', () => {
            lista.scrollTop = 0;
            if (box.parentElement) box.parentElement.scrollTop = 0;
          });
          setTimeout(() => busca.focus(), 60);
        }

        function formQtde() {
          const p = DB.byId('produtos', item.produto_id);
          const preco = precoDe(p, ped.tabela);
          // AV = venda avulsa (por unidade, sem placa inteira)
          const avulso = item.tamanho === 'AV';
          const uppDe = () => avulso ? 1 : (item.tamanho === 'P' ? p.unid_placa_p : p.unid_placa_g);
          box.innerHTML = '';
          const resumo = el('div', { class: 'calc-live mt8' });
          const stepper = (label, key, min) => {
            const val = el('input', {
              class: 'input num', type: 'number', inputmode: 'numeric',
              min: String(min), value: String(item[key]),
              oninput: () => { item[key] = Math.max(min, parseInt(val.value, 10) || min); atualiza(); }
            });
            return el('div', { class: 'stepper' },
              el('span', { class: 'stepper-label' }, label),
              el('div', { class: 'row gap4' },
                el('button', { class: 'btn-step', onclick: () => { item[key] = Math.max(min, (item[key] || 0) - 1); val.value = item[key]; atualiza(); } }, '−'),
                val,
                el('button', { class: 'btn-step', onclick: () => { item[key] = (item[key] || 0) + 1; val.value = item[key]; atualiza(); } }, '+')));
          };
          const tamBtn = (t, rot, indisponivel) => el('button', {
            class: 'btn-tam' + (item.tamanho === t ? ' ativo' : ''),
            disabled: indisponivel ? '' : null,
            onclick: () => { item.tamanho = t; formQtde(); }
          }, rot);
          const tamBtns = [
            tamBtn('P', `P (${p.unid_placa_p ?? '—'} un)`, p.unid_placa_p == null),
            tamBtn('G', `G (${p.unid_placa_g ?? '—'} un)`, p.unid_placa_g == null),
            tamBtn('AV', 'Avulso (un)', false)
          ];

          function atualiza() {
            const upp = uppDe();
            const r = C.calcItem({
              placas: item.placas, unidPorPlaca: upp,
              devDisplay: item.dev_display, devQuebrada: item.dev_quebrada, precoUnit: preco
            });
            resumo.innerHTML =
              `<div class="row space"><span>Unidades colocadas</span><strong>${r.colocadas}</strong></div>` +
              `<div class="row space"><span>− Devolvidas (display)</span><strong>${item.dev_display}</strong></div>` +
              `<div class="row space"><span>− Quebradas</span><strong>${item.dev_quebrada}</strong></div>` +
              `<div class="row space destaque"><span>= Vendidas</span><strong>${r.vendidas}</strong></div>` +
              `<div class="row space destaque"><span>${r.vendidas} × ${C.fmtMoney(preco)}</span><strong>${C.fmtMoney(r.valor)}</strong></div>` +
              (r.vendidas < 0 ? '<div class="aviso">' + icoHTML('retorno', 'ic-sm') + ' Recolhendo ' + (-r.vendidas) +
                ' un — crédito de ' + C.fmtMoney(-r.valor) + ' descontado do total do pedido.</div>' : '');
          }
          atualiza();
          box.appendChild(el('div', null,
            el('strong', null, (p.codigo ? p.codigo + ' · ' : '') + nomeProd(p)),
            el('div', { class: 'sub' }, `Preço (${ped.tabela === 'lucro' ? 'Lucro Presumido' : 'Simples'}): ${C.fmtMoney(preco)}`),
            el('div', { class: 'row gap8 mt12' }, tamBtns),
            el('div', { class: 'col gap8 mt12' },
              stepper(avulso ? 'Unidades avulsas' : 'Placas deixadas (0 = só recolher)', 'placas', 0),
              stepper('Devolvida — Display', 'dev_display', 0),
              stepper('Devolvida — Quebrada', 'dev_quebrada', 0)),
            resumo,
            el('div', { class: 'row gap8 mt12' },
              el('button', { class: 'btn btn-sec grow', onclick: selecionarProduto }, rot('setaEsq', 'Produto')),
              el('button', {
                class: 'btn grow', onclick: () => {
                  const upp = uppDe();
                  const r = C.calcItem({
                    placas: item.placas, unidPorPlaca: upp,
                    devDisplay: item.dev_display, devQuebrada: item.dev_quebrada, precoUnit: preco
                  });
                  const feito = {
                    id: item.id || DB.uuid(), produto_id: p.id, tamanho: item.tamanho,
                    placas: item.placas, unid_por_placa: upp, unid_colocadas: r.colocadas,
                    dev_display: item.dev_display, dev_quebrada: item.dev_quebrada,
                    unid_vendidas: r.vendidas, preco_unit: preco, valor_total: r.valor
                  };
                  if (isNovo) ped.itens.push(feito); else ped.itens[idx] = feito;
                  mi.fechar(); render();
                }
              }, isNovo ? 'Adicionar' : 'Salvar'))));
        }

        if (item.produto_id) formQtde(); else selecionarProduto();
      }
    }

    // ---- Passo 4: conferência (prazo obrigatório entra AQUI, no final) ----
    function passoConferencia() {
      const cli = DB.byId('clientes', ped.cliente_id);
      const rep = sessao().rep;
      const tot = C.calcTotais(ped.itens);
      const obsIn = el('textarea', { class: 'input', rows: '2', placeholder: 'Observações do pedido (opcional)' }, ped.obs || '');
      const prazoIn = el('input', {
        class: 'input big', placeholder: 'Prazo… ex.: 7 dias, 30 dias, 30/60',
        value: ped.condicao_pagamento || cli.condicao_pagamento_padrao || ''
      });
      // data do pedido editável: pedido esquecido de ontem entra na data certa
      const dataIn = el('input', { class: 'input big', type: 'date', value: ped.data || hojeISO() });
      const descIn = el('input', {
        class: 'input big', type: 'number', inputmode: 'decimal', step: '0.01', min: '0', max: '100',
        placeholder: '0', value: ped.desconto_pct || ''
      });
      const descResumo = el('div', { class: 'desc-resumo' });
      const atualizaDesc = () => {
        const d = C.aplicarDesconto(tot.valor, descIn.value);
        descResumo.innerHTML = '';
        if (!d.pct) { descResumo.appendChild(el('span', { class: 'sub' }, 'Sem desconto — vale o valor cheio.')); return; }
        descResumo.appendChild(el('div', { class: 'row space' },
          el('span', null, 'Valor do pedido'), el('strong', null, C.fmtMoney(d.bruto))));
        descResumo.appendChild(el('div', { class: 'row space' },
          el('span', null, 'Desconto de ' + C.fmtPct(d.pct)), el('strong', { class: 'menos' }, '− ' + C.fmtMoney(d.desconto))));
        descResumo.appendChild(el('div', { class: 'row space total' },
          el('span', null, 'Valor final'), el('strong', null, C.fmtMoney(d.liquido))));
      };
      descIn.addEventListener('input', atualizaDesc);
      const chkDisplay = el('input', { type: 'checkbox' });
      if (ped.deixou_display) chkDisplay.checked = true;
      const materialIn = el('input', {
        class: 'input', placeholder: 'Material deixado (ex.: 1 display de balcão, 2 placas mostruário)',
        value: ped.material_deixado || ''
      });
      const linhas = ped.itens.map(it => {
        const p = DB.byId('produtos', it.produto_id);
        return `<tr><td>${escH(p.codigo || '')}</td><td>${escH(nomeProd(p))}</td><td class="c">${it.tamanho}</td>` +
          `<td class="c">${it.placas}</td><td class="c">${it.unid_colocadas}</td><td class="c">${it.dev_display}</td>` +
          `<td class="c">${it.dev_quebrada}</td><td class="c">${it.unid_vendidas}</td>` +
          `<td class="r">${C.fmtMoney(it.preco_unit)}</td><td class="r"><strong>${C.fmtMoney(it.valor_total)}</strong></td></tr>`;
      }).join('');
      corpo(el('div', null,
        el('h3', null, 'Conferência'),
        tot.valor < 0 ? el('div', { class: 'aviso mt4' }, ico('retorno', 'ic-sm'),
          ' Pedido NEGATIVO — o valor vira CRÉDITO do cliente.') : null,
        el('div', { class: 'sub mt4' },
          `${cli.nome} · ${dataBR(ped.data)} · Vendedor: ${rep.nome}` +
          ((rep.contato || rep.telefone) ? ' (' + (rep.contato || rep.telefone) + ')' : '') + ' · ' +
          `Tabela ${ped.tabela === 'lucro' ? 'Lucro Presumido' : 'Simples'}` +
          (ped.condicao_pagamento ? ' · ' + ped.condicao_pagamento : '')),
        el('div', { class: 'tabela-scroll mt8' , html:
          `<table class="tabela"><thead><tr><th>Cód</th><th>Produto</th><th>Tam</th><th>Placas</th>` +
          `<th>Coloc.</th><th>Dev.Disp</th><th>Dev.Queb</th><th>Vend.</th><th>Preço</th><th>Total</th></tr></thead>` +
          `<tbody>${linhas}</tbody></table>` }),
        (() => {
          const d = C.aplicarDesconto(tot.valor, ped.desconto_pct);
          return el('div', { class: 'total-bar mt8' },
            el('span', null, `${tot.colocadas} colocadas · ${tot.devDisplay} display · ` +
              `${tot.devQuebrada} quebradas · ${tot.vendidas} vendidas` +
              (d.pct ? ' · desconto ' + C.fmtPct(d.pct) : '')),
            el('strong', null, C.fmtMoney(d.liquido)));
        })(),
        // cada informação do fechamento numa caixa própria, com cor e rótulo
        // grandes — antes era campo branco em cima de campo branco
        el('div', { class: 'campo-box azul mt12' },
          el('div', { class: 'campo-box-tit' }, 'Data do pedido'),
          dataIn,
          el('p', { class: 'campo-box-ajuda' },
            'Esqueceu de lançar ontem? Troque a data — o pedido entra na meta e na comissão do dia certo.')),
        el('div', { class: 'campo-box ouro mt12' },
          el('div', { class: 'campo-box-tit' }, 'Condição de pagamento (prazo)',
            el('span', { class: 'obrig' }, 'obrigatório')),
          prazoIn,
          cli.condicao_pagamento_padrao ? el('p', { class: 'campo-box-ajuda' },
            'Último prazo deste cliente: ' + cli.condicao_pagamento_padrao) : null),
        el('div', { class: 'campo-box verde mt12' },
          el('div', { class: 'campo-box-tit' }, 'Desconto no pedido (%)',
            el('span', { class: 'so-interno' }, 'entra na nota')),
          descIn,
          descResumo,
          el('p', { class: 'campo-box-ajuda' },
            'Ex.: 3 para 3% de desconto à vista. O valor final (já com o abatimento) ' +
            'é o que conta no faturamento, na meta e na comissão.')),
        el('div', { class: 'campo-box roxo mt12' },
          el('div', { class: 'campo-box-tit' }, 'Material deixado no cliente'),
          el('label', { class: 'row gap8 chk-grande' }, chkDisplay,
            el('span', null, 'Deixei display/mostruário neste cliente')),
          el('div', { class: 'mt8' }, materialIn)),
        el('div', { class: 'campo-box cinza mt12' },
          el('div', { class: 'campo-box-tit' }, 'Observações internas',
            el('span', { class: 'so-interno' }, 'só no sistema')),
          obsIn,
          el('p', { class: 'campo-box-ajuda' },
            'Isto NÃO sai no talão, no PDF nem no cupom — é só para você e o gestor.')),
        editando ? el('p', { class: 'sub mt8' },
          'A assinatura já colhida será mantida — as alterações só recalculam valores e comissão.') : null,
        el('div', { class: 'row gap8 mt12' },
          el('button', { class: 'btn btn-sec grow', onclick: () => { guardar(); passoItens(); } }, rot('setaEsq', 'Itens')),
          el('button', { class: 'btn grow', onclick: () => {
            guardar();
            if (!ped.condicao_pagamento) {
              prazoIn.focus();
              return toast('Escreva a CONDIÇÃO DE PAGAMENTO (prazo) antes de ' + (editando ? 'salvar' : 'assinar') + '.', 'erro');
            }
            if (editando) salvarConcluido(); else passoAssinatura();
          } }, editando ? rot('salvar', 'Salvar alterações') : el('span', { class: 'row gap8' }, 'Assinar', ico('setaDir'))))));

      atualizaDesc();
      function guardar() {
        ped.obs = obsIn.value;
        ped.desconto_pct = Math.min(100, Math.max(0, Number(descIn.value) || 0));
        ped.condicao_pagamento = prazoIn.value.trim();
        ped.deixou_display = chkDisplay.checked;
        ped.material_deixado = materialIn.value.trim();
        if (dataIn.value && /^\d{4}-\d{2}-\d{2}$/.test(dataIn.value)) ped.data = dataIn.value;
      }
    }

    // ---- Passo 5: assinatura ----
    function passoAssinatura() {
      const cli = DB.byId('clientes', ped.cliente_id) || {};
      const nomeAssinante = el('input', {
        class: 'input big', placeholder: 'Nome de quem assina * (obrigatório)',
        value: ped.assinante_nome || cli.contato || ''
      });
      // a assinatura é colhida em TELA CHEIA (área grande e confortável) e,
      // ao confirmar, volta para esta tela do pedido com a prévia
      const previa = el('div', { class: 'sub mt8' }, 'Nenhuma assinatura colhida ainda.');
      const imgPrev = el('img', { style: 'display:none;max-width:100%;background:#fff;border-radius:10px;margin-top:8px' });
      const cont = el('div', null,
        el('h3', null, 'Assinatura do cliente'),
        el('p', { class: 'sub' }, 'Informe o nome de quem assina e toque no botão para o cliente assinar em tela cheia.'),
        nomeAssinante,
        el('button', { class: 'btn big w100 mt12', onclick: abrirTelaCheia }, rot('assinatura', 'Assinar em tela cheia')),
        previa, imgPrev,
        el('div', { class: 'row gap8 mt12' },
          el('button', { class: 'btn btn-sec grow', onclick: passoConferencia }, rot('setaEsq', 'Voltar')),
          el('button', { class: 'btn grow', onclick: concluir }, rot('check', 'Confirmar e concluir'))));
      corpo(cont);
      if (ped.assinatura) { imgPrev.src = ped.assinatura; imgPrev.style.display = 'block'; previa.textContent = 'Assinatura colhida — toque no botão para refazer.'; }

      function abrirTelaCheia() {
        if (!nomeAssinante.value.trim()) {
          nomeAssinante.focus();
          return toast('Informe o NOME de quem assina antes de colher a assinatura.', 'erro');
        }
        const cvF = el('canvas');
        const area = el('div', { class: 'area' }, cvF);
        const tela = el('div', { class: 'assina-full' },
          el('div', { class: 'topo' },
            el('strong', null, 'Assinatura de ' + nomeAssinante.value.trim()),
            el('div', { class: 'sub' }, cli.nome || '')),
          area,
          el('div', { class: 'acoes' },
            el('button', { class: 'btn btn-sec grow', onclick: () => { st.length = 0; pinta(); } }, 'Limpar'),
            el('button', { class: 'btn btn-sec grow', onclick: () => { liberarTela(); } }, 'Cancelar'),
            el('button', {
              class: 'btn grow', onclick: () => {
                if (!st.length || st.every(x => x.length < 2)) return toast('Colete a assinatura antes de confirmar.', 'erro');
                ped.assinatura = cvF.toDataURL('image/png');
                ped.assinante_nome = nomeAssinante.value.trim();
                imgPrev.src = ped.assinatura; imgPrev.style.display = 'block';
                previa.textContent = 'Assinatura colhida — toque no botão para refazer.';
                liberarTela();
                toast('Assinatura salva. Agora toque em "Confirmar e concluir".');
              }
            }, rot('check', 'Confirmar assinatura'))));
        document.body.appendChild(tela);

        // ── assinatura SEMPRE deitada (paisagem) ──
        // No Android dá para travar a orientação de verdade. No iPhone o Safari
        // não deixa, então giramos a própria tela de assinatura 90° por CSS —
        // o cliente assina na horizontal do mesmo jeito, sem virar o aparelho.
        let girado = false, tr = null;
        (async () => {
          try {
            if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
            if (screen.orientation && screen.orientation.lock) await screen.orientation.lock('landscape');
          } catch (e) { /* iOS e navegadores sem suporte caem no giro por CSS */ }
          ajustar();
        })();
        function emRetrato() { return window.innerHeight > window.innerWidth; }
        // Monta o "papel deitado": o comprimento do papel é a altura da tela e a
        // espessura é a largura. Reservamos duas faixas (cabeçalho e botões) para
        // que o quadro de assinatura não cubra os botões depois de girar.
        const FAIXA_TOPO = 46, FAIXA_ACOES = 84, MARGEM = 16;
        function ajustar() {
          girado = emRetrato();
          tela.classList.toggle('deitada', girado);
          const alvos = [tela.querySelector('.topo'), area, tela.querySelector('.acoes')];
          if (!girado) { alvos.forEach(x => { if (x) { x.style.cssText = ''; } }); medirCanvas(); return; }
          const L = window.innerHeight;                  // comprimento do papel
          const E = window.innerWidth;                   // espessura do papel
          const base = 'position:absolute;top:50%;left:50%;margin:0;transform-origin:center center;';
          // translateY(D) no espaço local move D px para a ESQUERDA na tela
          const giro = (D) => 'translate(-50%,-50%) rotate(90deg) translateY(' + D + 'px)';
          const topo = tela.querySelector('.topo'), acoes = tela.querySelector('.acoes');
          if (topo) topo.style.cssText = base + 'width:' + L + 'px;height:' + FAIXA_TOPO +
            'px;transform:' + giro(E / 2 - FAIXA_TOPO / 2) + ';';
          if (acoes) acoes.style.cssText = base + 'width:' + L + 'px;height:' + FAIXA_ACOES +
            'px;transform:' + giro(-(E / 2 - FAIXA_ACOES / 2)) + ';';
          const alturaUtil = E - FAIXA_TOPO - FAIXA_ACOES - MARGEM * 2;
          area.style.cssText = base + 'width:' + (L - MARGEM * 2) + 'px;height:' + alturaUtil +
            'px;transform:' + giro(-(FAIXA_TOPO - FAIXA_ACOES) / 2) + ';';
          medirCanvas();
        }
        // não remexer no layout no meio de um traço (o dedo está desenhando)
        const reajustar = () => { if (!tr) ajustar(); };
        window.addEventListener('resize', reajustar);
        window.addEventListener('orientationchange', reajustar);

        function liberarTela() {
          window.removeEventListener('resize', reajustar);
          window.removeEventListener('orientationchange', reajustar);
          try { if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock(); } catch (e) {}
          try { if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen(); } catch (e) {}
          tela.remove();
        }

        const cx = cvF.getContext('2d');
        const st = [];
        const dpr = window.devicePixelRatio || 1;
        // tamanho lógico do canvas (o desenho é feito neste espaço)
        let logW = 0, logH = 0;
        function medirCanvas() {
          const larg = area.clientWidth || area.getBoundingClientRect().width;
          const alt = area.clientHeight || area.getBoundingClientRect().height;
          if (!larg || !alt) return;
          logW = larg; logH = alt;
          cvF.width = Math.round(larg * dpr); cvF.height = Math.round(alt * dpr);
          cx.setTransform(dpr, 0, 0, dpr, 0, 0);
          pinta();
        }
        setTimeout(medirCanvas, 40);
        function pinta() {
          cx.clearRect(0, 0, cvF.width, cvF.height);
          cx.lineWidth = 3.2; cx.lineCap = 'round'; cx.lineJoin = 'round'; cx.strokeStyle = '#16233b';
          for (const linha of st) {
            cx.beginPath();
            linha.forEach((pt, i) => i ? cx.lineTo(pt.x, pt.y) : cx.moveTo(pt.x, pt.y));
            cx.stroke();
          }
        }
        // Ponto do dedo → coordenada dentro do canvas. Quando a tela está girada
        // 90° por CSS, o retângulo que o navegador devolve já vem transformado;
        // desfazemos a rotação na mão para o traço sair no lugar certo.
        const posF = (e) => {
          const r = cvF.getBoundingClientRect();
          if (!girado) return { x: e.clientX - r.left, y: e.clientY - r.top };
          const cxr = r.left + r.width / 2, cyr = r.top + r.height / 2;
          const dx = e.clientX - cxr, dy = e.clientY - cyr;
          // rotate(90°) leva (lx,ly) → (−ly, lx); invertendo: lx = dy, ly = −dx
          return { x: logW / 2 + dy, y: logH / 2 - dx };
        };
        cvF.addEventListener('pointerdown', (e) => { e.preventDefault(); cvF.setPointerCapture(e.pointerId); tr = [posF(e)]; st.push(tr); });
        cvF.addEventListener('pointermove', (e) => { if (tr) { tr.push(posF(e)); pinta(); } });
        const fimF = () => { tr = null; };
        cvF.addEventListener('pointerup', fimF); cvF.addEventListener('pointercancel', fimF);
      }

      function concluir() {
        if (!nomeAssinante.value.trim()) {
          nomeAssinante.focus();
          return toast('Informe o NOME de quem assina — é obrigatório.', 'erro');
        }
        if (!ped.assinatura)
          return toast('Toque em "Assinar em tela cheia" e colha a assinatura do cliente.', 'erro');
        ped.assinante_nome = nomeAssinante.value.trim();
        salvarConcluido();
      }
    }

    // ---- Persistência + integração com o Módulo A ----
    function salvarConcluido() {
      const tot = C.calcTotais(ped.itens);
      const rep = sessao().rep;
      const cli = DB.byId('clientes', ped.cliente_id);
      const agora = new Date().toISOString();
      // desconto do pedido: daqui para a frente vale o LÍQUIDO — é ele que entra
      // no faturamento, na meta e na comissão
      const desc = C.aplicarDesconto(tot.valor, ped.desconto_pct);

      // 1) pedido rascunho → 2) itens → 3) visita → 4) concluir (ordem respeitada pela fila offline;
      // no servidor o trigger de conclusão recalcula tudo e reaproveita a visita do dia)
      if (editando) {
        // edição: mantém número, assinatura e a % de comissão original —
        // só os itens/valores/prazo são regravados e recalculados
        DB.removeWhere('pedido_itens', i => i.pedido_id === ped.id);
      } else {
        const numero = DB.all('pedidos').reduce((m, p) => Math.max(m, Number(p.numero) || 0), 0) + 1;
        DB.insert('pedidos', {
          id: ped.id, numero, cliente_id: ped.cliente_id, representante_id: rep.id,
          data_pedido: ped.data, tabela: ped.tabela, condicao_pagamento: ped.condicao_pagamento,
          deixou_display: !!ped.deixou_display, material_deixado: ped.material_deixado || null,
          status: 'rascunho', observacoes: ped.obs || null
        });
      }
      for (const it of ped.itens) DB.insert('pedido_itens', Object.assign({}, it, { pedido_id: ped.id }));

      // % de cliente novo: na edição preserva a % original da visita;
      // pedido negativo (recolhimento) nunca usa % de cliente novo
      const visOriginal = editando ? DB.all('visitas').find(v => v.pedido_id === ped.id) : null;
      const pctNovoRep = (rep.comissao_pct_novo != null) ? Number(rep.comissao_pct_novo) : 15;
      let clienteNovo;
      if (desc.liquido < 0) clienteNovo = false;
      else if (visOriginal && visOriginal.comissao_pct != null)
        clienteNovo = Number(visOriginal.comissao_pct) === pctNovoRep;
      else clienteNovo = !C.clienteJaComprou(cli,
        DB.all('visitas').filter(v => v.cliente_id === ped.cliente_id));
      const com = C.calcComissao({
        valor: desc.liquido, clienteNovo,
        pctNovo: rep.comissao_pct_novo, pctReposicao: rep.comissao_pct,
        dataPedido: ped.data, recebimentoDias: cli.recebimento_dias || 0
      });
      // reaproveita a visita do dia só se ela ainda não carrega OUTRO pedido:
      // 2ª venda ao mesmo cliente no mesmo dia ganha visita própria, com
      // comissão independente (excluir uma não apaga a comissão da outra)
      const visitaHoje = DB.all('visitas').find(v => v.cliente_id === ped.cliente_id &&
        v.data_visita === ped.data && (!v.pedido_id || v.pedido_id === ped.id));
      const visitaBody = {
        realizada: true, fez_pedido: true, pedido_id: ped.id, valor_pedido: desc.liquido,
        data_visita: ped.data,
        comissao_pct: com.pct, comissao_valor: com.valor, comissao_recebimento_em: com.recebimentoEm
      };
      visitaBody.produtos = Array.from(new Set(ped.itens.map(i => i.produto_id)));
      let visitaId;
      if (visitaHoje) { DB.update('visitas', visitaHoje.id, visitaBody); visitaId = visitaHoje.id; }
      else visitaId = DB.insert('visitas', Object.assign({
        cliente_id: ped.cliente_id, representante_id: rep.id, data_visita: ped.data
      }, visitaBody)).id;

      DB.update('pedidos', ped.id, {
        status: 'concluido',
        data_pedido: ped.data,
        tabela: ped.tabela, condicao_pagamento: ped.condicao_pagamento,
        deixou_display: !!ped.deixou_display, material_deixado: ped.material_deixado || null,
        total_unid_colocadas: tot.colocadas, total_unid_dev_display: tot.devDisplay,
        total_unid_dev_quebrada: tot.devQuebrada, total_unid_vendidas: tot.vendidas,
        total_bruto: desc.bruto, desconto_pct: desc.pct, desconto_valor: desc.desconto,
        total_valor: desc.liquido, assinatura: ped.assinatura,
        assinado_em: editando ? (pedidoExistente.assinado_em || agora) : agora,
        assinante_nome: ped.assinante_nome || null,
        visita_id: visitaId, observacoes: ped.obs || null
      });

      // espelho local do que os triggers fazem no servidor
      // (o prazo usado vira o prazo padrão deste cliente; pedido só de
      //  recolhimento — total ≤ 0 — não conta como compra)
      const proxima = (() => { const d = new Date(ped.data + 'T12:00:00'); d.setDate(d.getDate() + (cli.frequencia_dias || 60)); return d.toISOString().slice(0, 10); })();
      const patchCli = {
        condicao_pagamento_padrao: ped.condicao_pagamento || cli.condicao_pagamento_padrao || null,
        ultima_visita_em: ped.data, proxima_visita_prevista: proxima
      };
      if (desc.liquido > 0) patchCli.ultimo_pedido_em = ped.data;
      // material deixado fica marcado na ficha (para relatórios e recolha futura)
      if (ped.deixou_display) patchCli.display_no_cliente = true;
      if (ped.material_deixado) patchCli.material_no_cliente = ped.material_deixado;
      DB.update('clientes', cli.id, patchCli);
      DB.all('pendencias').filter(p => p.cliente_id === cli.id && !p.resolvida_em)
        .forEach(p => DB.update('pendencias', p.id, { resolvida_em: agora }));
      // só itens vendidos (valor positivo) marcam a linha como "trabalhada"
      const linhas = new Set(ped.itens.filter(i => Number(i.valor_total) > 0).map(i => i.produto_id));
      const jaTem = new Set(DB.all('cliente_produtos').filter(cp => cp.cliente_id === cli.id).map(cp => cp.produto_id));
      for (const pid of linhas) if (!jaTem.has(pid))
        DB.insert('cliente_produtos', { id: cli.id + '_' + pid, cliente_id: cli.id, produto_id: pid, representante_id: rep.id });

      m.fechar();
      const txtDesc = desc.pct ? ' (desconto de ' + C.fmtPct(desc.pct) + ' já abatido)' : '';
      toast(editando
        ? 'Pedido atualizado! Novo total ' + C.fmtMoney(desc.liquido) + txtDesc + ' · comissão recalculada (' + com.pct + '% = ' + C.fmtMoney(com.valor) + ').'
        : com.valor < 0
          ? 'Pedido concluído com CRÉDITO de ' + C.fmtMoney(Math.abs(desc.liquido)) + ' ao cliente (comissão abatida em ' + C.fmtMoney(Math.abs(com.valor)) + ').'
          : 'Pedido concluído! Comissão de ' + com.pct + '% (' + C.fmtMoney(com.valor) + ') registrada' + txtDesc + '.');
      const salvo = DB.byId('pedidos', ped.id);
      abrir(salvo.id, true);
      if (window.NSApp.aoConcluirPedido) window.NSApp.aoConcluirPedido(salvo);
    }

    function cabecalhoCliente(cli, p) {
      return el('div', { class: 'chip-cliente' },
        el('strong', null, temAlertaCliente(cli.id) ? ico('alerta', 'ic-aviso') : null, cli.nome),
        el('span', { class: 'sub' }, [cli.cidade, cli.uf].filter(Boolean).join(' - ') +
          (p && p.tabela ? ' · Tabela ' + (p.tabela === 'lucro' ? 'Lucro Presumido' : 'Simples') : '')));
    }
    function corpo(conteudo) {
      m.body.innerHTML = '';
      m.body.appendChild(conteudo);
      m.body.appendChild(el('button', {
        class: 'btn-link mt16', onclick: async () => {
          if (await confirmar(editando ? 'Descartar as alterações? O pedido continua como estava.' : 'Descartar este pedido?')) m.fechar();
        }
      }, editando ? 'Descartar alterações' : 'Cancelar pedido'));
    }
  }

  // ============ PEDIDO CONCLUÍDO / HISTÓRICO ============
  async function gerarPDF(pedidoId) {
    const p = DB.byId('pedidos', pedidoId);
    const itens = DB.all('pedido_itens').filter(i => i.pedido_id === pedidoId);
    const cliente = DB.byId('clientes', p.cliente_id) || {};
    const rep = DB.byId('representantes', p.representante_id) || {};
    const observacoes = DB.config('pdf_observacoes', '');
    return window.NSPDF.gerarPDFPedido({ pedido: p, itens, cliente, rep, produtos: DB.all('produtos'), observacoes });
  }

  // Cupom para mini impressoras térmicas Bluetooth (bobina 58mm) — sai como
  // IMAGEM (formato nativo desses apps; o PDF era rasterizado de forma
  // instável e a impressão cortava no meio)
  async function gerarCupom(pedidoId) {
    const p = DB.byId('pedidos', pedidoId);
    const itens = DB.all('pedido_itens').filter(i => i.pedido_id === pedidoId);
    const cliente = DB.byId('clientes', p.cliente_id) || {};
    const rep = DB.byId('representantes', p.representante_id) || {};
    const observacoes = DB.config('pdf_observacoes', '');
    // escala da letra do cupom (Configurações) — Android às vezes encolhe a imagem
    const escala = Number(DB.config('cupom_escala', 1.2)) || 1.2;
    return window.NSPDF.gerarCupomImagem({ pedido: p, itens, cliente, rep, produtos: DB.all('produtos'), observacoes, escala });
  }

  // impressão sem vazar memória: um iframe único reaproveitado e URLs
  // revogadas depois do uso (imprimir vários pedidos seguidos travava o app)
  let frameImpressao = null;
  function imprimirBlob(blob) {
    const url = URL.createObjectURL(blob);
    if (frameImpressao) { try { frameImpressao.remove(); } catch (e) {} }
    frameImpressao = el('iframe', { style: 'display:none', src: url });
    document.body.appendChild(frameImpressao);
    frameImpressao.onload = () => setTimeout(() => {
      try { frameImpressao.contentWindow.print(); } catch (e) {}
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    }, 200);
  }
  function abrirBlob(blob, nomeArq) {
    const url = URL.createObjectURL(blob);
    const w = window.open(url, '_blank');
    if (!w) window.NSUI.baixar(blob, nomeArq);
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  function abrir(pedidoId, recemConcluido) {
    const p = DB.byId('pedidos', pedidoId);
    if (!p) return;
    const cli = DB.byId('clientes', p.cliente_id) || {};
    const itens = DB.all('pedido_itens').filter(i => i.pedido_id === pedidoId);
    const nomeArq = 'pedido-' + (p.numero || String(p.id).slice(0, 8)) + '.pdf';
    const acoes = el('div', { class: 'col gap8 mt12' },
      el('button', { class: 'btn big', onclick: async () => {
        abrirBlob(await gerarPDF(pedidoId), nomeArq);
      } }, rot('documento', 'Visualizar PDF')),
      el('button', { class: 'btn big btn-sec', onclick: async () => {
        const blob = await gerarPDF(pedidoId);
        const file = new File([blob], nomeArq, { type: 'application/pdf' });
        if (navigator.canShare && navigator.canShare({ files: [file] }))
          await navigator.share({ files: [file], title: 'Pedido New Star' }).catch(() => {});
        else { window.NSUI.baixar(blob, nomeArq); toast('PDF baixado (compartilhamento não suportado neste navegador).'); }
      } }, rot('compartilhar', 'Compartilhar PDF')),
      el('button', { class: 'btn big btn-sec', onclick: async () => {
        imprimirBlob(await gerarPDF(pedidoId));
      } }, rot('impressora', 'Imprimir')),
      el('button', { class: 'btn big btn-sec', onclick: async () => {
        const blob = await gerarCupom(pedidoId);
        const nomeCupom = 'cupom-' + (p.numero || String(p.id).slice(0, 8)) + '.png';
        const file = new File([blob], nomeCupom, { type: 'image/png' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          toast('Escolha o app da impressora na lista de compartilhar.');
          await navigator.share({ files: [file], title: 'Cupom New Star' }).catch(() => {});
        } else {
          abrirBlob(blob, nomeCupom);
        }
      } }, rot('recibo', 'Cupom 58mm (imagem)')),
      p.status === 'concluido' ? el('button', { class: 'btn big btn-sec', onclick: () => {
        mAbrir.fechar();
        novo(null, p);
      } }, rot('lapis', 'Editar pedido (itens, prazo, devoluções)')) : null);

    const linhas = itens.map(it => {
      const pr = DB.byId('produtos', it.produto_id) || {};
      return `<tr><td>${escH(pr.codigo || '')}</td><td>${escH(nomeProd(pr))}</td><td class="c">${it.tamanho}</td>` +
        `<td class="c">${it.placas}</td><td class="c">${it.unid_colocadas}</td><td class="c">${it.dev_display}</td>` +
        `<td class="c">${it.dev_quebrada}</td><td class="c">${it.unid_vendidas}</td><td class="r">${C.fmtMoney(it.valor_total)}</td></tr>`;
    }).join('');

    const mAbrir = modal(el('div', null,
      recemConcluido ? el('div', { class: 'sucesso-banner' }, ico('checkCirculo'), 'Pedido concluído e assinado!') : null,
      el('div', { class: 'sub' }, `Pedido nº ${p.numero || 'PENDENTE (aguardando sync)'} · ${dataBR(p.data_pedido)} · ` +
        (Number(p.total_valor) < 0 ? 'CRÉDITO · ' : '') +
        `${p.status.toUpperCase()} · Tabela ${p.tabela === 'lucro' ? 'Lucro Presumido' : 'Simples'}` +
        (p.condicao_pagamento ? ' · ' + p.condicao_pagamento : '')),
      (() => {
        const rp = DB.byId('representantes', p.representante_id) || {};
        const fone = rp.contato || rp.telefone || rp.celular || '';
        return el('div', { class: 'sub mt4' }, ico('usuario', 'ic-sm'), ' Vendedor: ' + (rp.nome || '—') +
          (fone ? ' · ' + fone : ' · sem telefone no cadastro (Admin → Vendedores)'));
      })(),
      el('h3', { class: 'mt8' }, cli.nome || '—'),
      el('div', { class: 'tabela-scroll mt8', html:
        `<table class="tabela"><thead><tr><th>Cód</th><th>Produto</th><th>Tam</th><th>Placas</th><th>Coloc.</th>` +
        `<th>Dev.Disp</th><th>Dev.Queb</th><th>Vend.</th><th>Total</th></tr></thead><tbody>${linhas}</tbody></table>` }),
      Number(p.desconto_pct) > 0 ? el('div', { class: 'sub mt8' },
        'Subtotal ' + C.fmtMoney(Number(p.total_bruto || 0)) +
        ' · desconto de ' + C.fmtPct(Number(p.desconto_pct)) +
        ' (−' + C.fmtMoney(Number(p.desconto_valor || 0)) + ')') : null,
      el('div', { class: 'total-bar mt8' },
        el('span', null, Number(p.total_valor) < 0
          ? `crédito do cliente (${p.total_unid_vendidas} un líquidas)`
          : `${p.total_unid_vendidas} un vendidas` + (Number(p.desconto_pct) > 0 ? ' · já com desconto' : '')),
        el('strong', null, C.fmtMoney(Number(p.total_valor)))),
      p.assinatura ? el('div', { class: 'mt8 assinatura-preview' },
        el('img', { src: p.assinatura, alt: 'Assinatura do cliente' }),
        el('div', { class: 'sub c' }, 'Assinatura vinculada ao pedido')) : null,
      acoes,
      el('button', {
        class: 'btn-link mt12', style: 'color:#ef7076', onclick: async () => {
          if (!(await confirmar('Excluir o pedido nº ' + (p.numero || '—') + ' de ' + (cli.nome || '—') +
            '? Isso remove os itens, desfaz o vínculo com a visita e a comissão.'))) return;
          DB.removeWhere('pedido_itens', (i) => i.pedido_id === p.id);
          const vis = DB.all('visitas').find(v => v.pedido_id === p.id);
          if (vis) DB.update('visitas', vis.id, {
            fez_pedido: false, valor_pedido: 0, pedido_id: null,
            comissao_pct: null, comissao_valor: null, comissao_recebimento_em: null, produtos: null
          });
          DB.remove('pedidos', p.id);
          if (window.NSApp.recalcularCicloCliente) window.NSApp.recalcularCicloCliente(p.cliente_id);
          mAbrir.fechar();
          toast('Pedido excluído.');
          if (window.NSApp.aoConcluirPedido) window.NSApp.aoConcluirPedido();
        }
      }, rot('lixeira', 'Excluir pedido'))
    ), { titulo: 'Pedido ' + (p.numero ? 'nº ' + p.numero : '') });
  }

  window.NSPedido = { novo, abrir, gerarPDF, gerarCupom };
})();
