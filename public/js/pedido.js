/* NEW STAR — Módulo B: Talão de Pedido Digital
 * Fluxo: Cliente → Tabela → Placas/Produtos (dev. Display/Quebrada) →
 * Conferência → Assinatura → Concluído → PDF/Compartilhar/Imprimir */
(function () {
  'use strict';
  const { $, el, escH, toast, modal, confirmar, dataBR, hojeISO } = window.NSUI;
  const C = window.NSCalc, DB = window.NSDB;

  const precoDe = (p, tabela) => tabela === 'lucro' ? p.preco_lucro : p.preco_simples;
  const nomeProd = (p) => p.nome + (p.variacao ? ' (' + p.variacao + ')' : '');

  function sessao() { return window.NSApp.sessao(); }

  // ============ NOVO PEDIDO (wizard) ============
  function novo(clientePre) {
    const ped = {
      id: DB.uuid(), cliente_id: clientePre ? clientePre.id : null,
      data: hojeISO(), tabela: null, condicao_pagamento: null,
      itens: [], obs: '', assinatura: null
    };
    const m = modal(el('div'), { titulo: 'Novo Pedido', full: true, bloqueado: true });
    passoCliente();

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
            el('strong', null, c.nome),
            el('span', { class: 'sub' }, [c.cidade, c.uf].filter(Boolean).join(' - ') +
              (c.cnpj_cpf ? ' · ' + c.cnpj_cpf : '') + (c.rede ? ' · ' + c.rede : ''))));
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
      const btn = (tab, rot, desc) => el('button', {
        class: 'card-escolha' + (ped.tabela === tab ? ' ativo' : ''),
        onclick: () => { ped.tabela = tab; passoItens(); }
      }, el('strong', null, rot), el('span', { class: 'sub' }, desc));
      corpo(el('div', null,
        cabecalhoCliente(cli),
        el('h3', { class: 'mt12' }, 'Tabela de preço do pedido'),
        el('div', { class: 'col gap8 mt8' },
          btn('simples', 'Tabela Simples', 'Preços da tabela Simples para todos os itens'),
          btn('lucro', 'Tabela Lucro Presumido', 'Preços Lucro Presumido para todos os itens')),
        el('button', { class: 'btn-link mt8', onclick: () => { ped.cliente_id = null; passoCliente(); } }, '← trocar cliente')));
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
              el('button', { class: 'btn-icon', onclick: () => { ped.itens.splice(idx, 1); render(); } }, '🗑')),
            el('div', { class: 'sub' },
              (it.tamanho === 'AV'
                ? `Avulso · ${it.unid_colocadas} un`
                : `Placa ${it.tamanho} ×${it.placas} = ${it.unid_colocadas} un`) +
              ` · dev.display ${it.dev_display} · quebrada ${it.dev_quebrada}`),
            el('div', { class: 'row space mt4' },
              el('span', null, it.unid_vendidas < 0
                ? `↩ ${-it.unid_vendidas} recolhidas × ${C.fmtMoney(it.preco_unit)}`
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
          el('button', { class: 'btn btn-sec grow', onclick: passoTabela }, '← Voltar'),
          el('button', {
            class: 'btn grow', disabled: ped.itens.length ? null : '',
            onclick: passoConferencia
          }, 'Conferir →')));
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
            DB.all('produtos').filter(p => p.ativo !== false)
              .filter(p => !q || nomeProd(p).toLowerCase().includes(q) || (p.codigo || '').includes(q))
              .sort((a, b) => (a.codigo || '').localeCompare(b.codigo || ''))
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
                  el('span', { class: 'sub' }, (semUnid ? '⚠ unidades por placa a cadastrar · '
                    : `P=${p.unid_placa_p}un · G=${p.unid_placa_g}un · `) +
                    (semPreco ? '⚠ preço a cadastrar' : C.fmtMoney(preco)))));
              });
          }
          rend();
          box.appendChild(busca); box.appendChild(lista);
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
              (r.vendidas < 0 ? '<div class="aviso">↩ Recolhendo ' + (-r.vendidas) +
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
              el('button', { class: 'btn btn-sec grow', onclick: selecionarProduto }, '← Produto'),
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
        tot.valor < 0 ? el('div', { class: 'aviso mt4' },
          '↩ Pedido NEGATIVO — o valor vira CRÉDITO do cliente.') : null,
        el('div', { class: 'sub mt4' },
          `${cli.nome} · ${dataBR(ped.data)} · Vendedor: ${rep.nome} · ` +
          `Tabela ${ped.tabela === 'lucro' ? 'Lucro Presumido' : 'Simples'}` +
          (ped.condicao_pagamento ? ' · ' + ped.condicao_pagamento : '')),
        el('div', { class: 'tabela-scroll mt8' , html:
          `<table class="tabela"><thead><tr><th>Cód</th><th>Produto</th><th>Tam</th><th>Placas</th>` +
          `<th>Coloc.</th><th>Dev.Disp</th><th>Dev.Queb</th><th>Vend.</th><th>Preço</th><th>Total</th></tr></thead>` +
          `<tbody>${linhas}</tbody></table>` }),
        el('div', { class: 'total-bar mt8' },
          el('span', null, `${tot.colocadas} colocadas · ${tot.devDisplay} display · ${tot.devQuebrada} quebradas · ${tot.vendidas} vendidas`),
          el('strong', null, C.fmtMoney(tot.valor))),
        el('h3', { class: 'mt12' }, 'Condição de pagamento (prazo) *'),
        prazoIn,
        cli.condicao_pagamento_padrao ? el('p', { class: 'sub mt4' },
          'Último prazo deste cliente: ' + cli.condicao_pagamento_padrao) : null,
        el('h3', { class: 'mt12' }, 'Material deixado no cliente'),
        el('label', { class: 'row gap8 mt4' }, chkDisplay, el('span', null, '🪧 Deixei display/mostruário neste cliente')),
        el('div', { class: 'mt4' }, materialIn),
        el('div', { class: 'mt8' }, obsIn),
        el('div', { class: 'row gap8 mt12' },
          el('button', { class: 'btn btn-sec grow', onclick: () => { guardar(); passoItens(); } }, '← Itens'),
          el('button', { class: 'btn grow', onclick: () => {
            guardar();
            if (!ped.condicao_pagamento) {
              prazoIn.focus();
              return toast('Escreva a CONDIÇÃO DE PAGAMENTO (prazo) antes de assinar.', 'erro');
            }
            passoAssinatura();
          } }, 'Assinar →'))));

      function guardar() {
        ped.obs = obsIn.value;
        ped.condicao_pagamento = prazoIn.value.trim();
        ped.deixou_display = chkDisplay.checked;
        ped.material_deixado = materialIn.value.trim();
      }
    }

    // ---- Passo 5: assinatura ----
    function passoAssinatura() {
      const cli = DB.byId('clientes', ped.cliente_id) || {};
      const wrapCv = el('div', { class: 'assinatura-area' });
      const cv = el('canvas', { class: 'assinatura-cv' });
      wrapCv.appendChild(cv);
      const nomeAssinante = el('input', {
        class: 'input big', placeholder: 'Nome de quem assina * (obrigatório)',
        value: ped.assinante_nome || cli.contato || ''
      });
      const cont = el('div', null,
        el('h3', null, 'Assinatura do cliente'),
        el('p', { class: 'sub' }, 'Informe o nome de quem assina e colha a assinatura no quadro.'),
        nomeAssinante,
        wrapCv,
        el('div', { class: 'row gap8 mt8' },
          el('button', { class: 'btn btn-sec grow', onclick: () => { strokes.length = 0; desenhar(); } }, 'Limpar'),
          el('button', { class: 'btn btn-sec grow', onclick: () => { strokes.pop(); desenhar(); } }, 'Refazer último')),
        el('div', { class: 'row gap8 mt12' },
          el('button', { class: 'btn btn-sec grow', onclick: passoConferencia }, '← Voltar'),
          el('button', { class: 'btn grow', onclick: concluir }, '✓ Confirmar e concluir')));
      corpo(cont);

      const ctx = cv.getContext('2d');
      const strokes = [];
      let atual = null;
      function ajustar() {
        const r = wrapCv.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        cv.width = r.width * dpr; cv.height = 220 * dpr;
        cv.style.width = r.width + 'px'; cv.style.height = '220px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        desenhar();
      }
      function desenhar() {
        ctx.clearRect(0, 0, cv.width, cv.height);
        ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#16233b';
        for (const s of strokes) {
          ctx.beginPath();
          s.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
          ctx.stroke();
        }
      }
      function pos(e) {
        const r = cv.getBoundingClientRect();
        return { x: e.clientX - r.left, y: e.clientY - r.top };
      }
      cv.addEventListener('pointerdown', (e) => { e.preventDefault(); cv.setPointerCapture(e.pointerId); atual = [pos(e)]; strokes.push(atual); });
      cv.addEventListener('pointermove', (e) => { if (atual) { atual.push(pos(e)); desenhar(); } });
      const fim = () => { atual = null; };
      cv.addEventListener('pointerup', fim); cv.addEventListener('pointercancel', fim);
      setTimeout(ajustar, 60);

      function concluir() {
        if (!nomeAssinante.value.trim()) {
          nomeAssinante.focus();
          return toast('Informe o NOME de quem assina — é obrigatório.', 'erro');
        }
        if (!strokes.length || strokes.every(s => s.length < 2))
          return toast('Colete a assinatura do cliente antes de concluir.', 'erro');
        ped.assinante_nome = nomeAssinante.value.trim();
        ped.assinatura = cv.toDataURL('image/png');
        salvarConcluido();
      }
    }

    // ---- Persistência + integração com o Módulo A ----
    function salvarConcluido() {
      const tot = C.calcTotais(ped.itens);
      const rep = sessao().rep;
      const cli = DB.byId('clientes', ped.cliente_id);
      const agora = new Date().toISOString();

      // 1) pedido rascunho → 2) itens → 3) visita → 4) concluir (ordem respeitada pela fila offline;
      // no servidor o trigger de conclusão recalcula tudo e reaproveita a visita do dia)
      const numero = DB.all('pedidos').reduce((m, p) => Math.max(m, Number(p.numero) || 0), 0) + 1;
      DB.insert('pedidos', {
        id: ped.id, numero, cliente_id: ped.cliente_id, representante_id: rep.id,
        data_pedido: ped.data, tabela: ped.tabela, condicao_pagamento: ped.condicao_pagamento,
        deixou_display: !!ped.deixou_display, material_deixado: ped.material_deixado || null,
        status: 'rascunho', observacoes: ped.obs || null
      });
      for (const it of ped.itens) DB.insert('pedido_itens', Object.assign({ pedido_id: ped.id }, it));

      const jaComprou = C.clienteJaComprou(cli,
        DB.all('visitas').filter(v => v.cliente_id === ped.cliente_id));
      // pedido negativo (recolhimento) nunca usa % de cliente novo:
      // o crédito abate na comissão de reposição
      const com = C.calcComissao({
        valor: tot.valor, clienteNovo: tot.valor < 0 ? false : !jaComprou,
        pctNovo: rep.comissao_pct_novo, pctReposicao: rep.comissao_pct,
        dataPedido: ped.data, recebimentoDias: cli.recebimento_dias || 0
      });
      // reaproveita a visita do dia só se ela ainda não carrega OUTRO pedido:
      // 2ª venda ao mesmo cliente no mesmo dia ganha visita própria, com
      // comissão independente (excluir uma não apaga a comissão da outra)
      const visitaHoje = DB.all('visitas').find(v => v.cliente_id === ped.cliente_id &&
        v.data_visita === ped.data && (!v.pedido_id || v.pedido_id === ped.id));
      const visitaBody = {
        realizada: true, fez_pedido: true, pedido_id: ped.id, valor_pedido: tot.valor,
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
        total_unid_colocadas: tot.colocadas, total_unid_dev_display: tot.devDisplay,
        total_unid_dev_quebrada: tot.devQuebrada, total_unid_vendidas: tot.vendidas,
        total_valor: tot.valor, assinatura: ped.assinatura, assinado_em: agora,
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
      if (tot.valor > 0) patchCli.ultimo_pedido_em = ped.data;
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
      toast(com.valor < 0
        ? 'Pedido concluído com CRÉDITO de ' + C.fmtMoney(Math.abs(tot.valor)) + ' ao cliente (comissão abatida em ' + C.fmtMoney(Math.abs(com.valor)) + ').'
        : 'Pedido concluído! Comissão de ' + com.pct + '% (' + C.fmtMoney(com.valor) + ') registrada.');
      const salvo = DB.byId('pedidos', ped.id);
      abrir(salvo.id, true);
      if (window.NSApp.aoConcluirPedido) window.NSApp.aoConcluirPedido(salvo);
    }

    function cabecalhoCliente(cli, p) {
      return el('div', { class: 'chip-cliente' },
        el('strong', null, cli.nome),
        el('span', { class: 'sub' }, [cli.cidade, cli.uf].filter(Boolean).join(' - ') +
          (p && p.tabela ? ' · Tabela ' + (p.tabela === 'lucro' ? 'Lucro Presumido' : 'Simples') : '')));
    }
    function corpo(conteudo) {
      m.body.innerHTML = '';
      m.body.appendChild(conteudo);
      m.body.appendChild(el('button', {
        class: 'btn-link mt16', onclick: async () => {
          if (await confirmar('Descartar este pedido?')) m.fechar();
        }
      }, 'Cancelar pedido'));
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

  // Cupom estreito para mini impressoras térmicas Bluetooth (bobina 58mm)
  async function gerarCupom(pedidoId) {
    const p = DB.byId('pedidos', pedidoId);
    const itens = DB.all('pedido_itens').filter(i => i.pedido_id === pedidoId);
    const cliente = DB.byId('clientes', p.cliente_id) || {};
    const rep = DB.byId('representantes', p.representante_id) || {};
    const observacoes = DB.config('pdf_observacoes', '');
    return window.NSPDF.gerarCupomPedido({ pedido: p, itens, cliente, rep, produtos: DB.all('produtos'), observacoes });
  }

  function abrir(pedidoId, recemConcluido) {
    const p = DB.byId('pedidos', pedidoId);
    if (!p) return;
    const cli = DB.byId('clientes', p.cliente_id) || {};
    const itens = DB.all('pedido_itens').filter(i => i.pedido_id === pedidoId);
    const nomeArq = 'pedido-' + (p.numero || String(p.id).slice(0, 8)) + '.pdf';
    const acoes = el('div', { class: 'col gap8 mt12' },
      el('button', { class: 'btn big', onclick: async () => {
        const blob = await gerarPDF(pedidoId);
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank') || window.NSUI.baixar(blob, nomeArq);
      } }, '📄 Visualizar PDF'),
      el('button', { class: 'btn big btn-sec', onclick: async () => {
        const blob = await gerarPDF(pedidoId);
        const file = new File([blob], nomeArq, { type: 'application/pdf' });
        if (navigator.canShare && navigator.canShare({ files: [file] }))
          await navigator.share({ files: [file], title: 'Pedido New Star' }).catch(() => {});
        else { window.NSUI.baixar(blob, nomeArq); toast('PDF baixado (compartilhamento não suportado neste navegador).'); }
      } }, '📤 Compartilhar PDF'),
      el('button', { class: 'btn big btn-sec', onclick: async () => {
        const blob = await gerarPDF(pedidoId);
        const url = URL.createObjectURL(blob);
        const fr = el('iframe', { style: 'display:none', src: url });
        document.body.appendChild(fr);
        fr.onload = () => setTimeout(() => { fr.contentWindow.print(); }, 200);
      } }, '🖨 Imprimir'),
      el('button', { class: 'btn big btn-sec', onclick: async () => {
        const blob = await gerarCupom(pedidoId);
        const nomeCupom = 'cupom-' + (p.numero || String(p.id).slice(0, 8)) + '.pdf';
        const file = new File([blob], nomeCupom, { type: 'application/pdf' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          toast('Escolha o app da impressora na lista de compartilhar.');
          await navigator.share({ files: [file], title: 'Cupom New Star' }).catch(() => {});
        } else {
          window.open(URL.createObjectURL(blob), '_blank') || window.NSUI.baixar(blob, nomeCupom);
        }
      } }, '🧾 Cupom 58mm (impressora térmica)'));

    const linhas = itens.map(it => {
      const pr = DB.byId('produtos', it.produto_id) || {};
      return `<tr><td>${escH(pr.codigo || '')}</td><td>${escH(nomeProd(pr))}</td><td class="c">${it.tamanho}</td>` +
        `<td class="c">${it.placas}</td><td class="c">${it.unid_colocadas}</td><td class="c">${it.dev_display}</td>` +
        `<td class="c">${it.dev_quebrada}</td><td class="c">${it.unid_vendidas}</td><td class="r">${C.fmtMoney(it.valor_total)}</td></tr>`;
    }).join('');

    const mAbrir = modal(el('div', null,
      recemConcluido ? el('div', { class: 'sucesso-banner' }, '✅ Pedido concluído e assinado!') : null,
      el('div', { class: 'sub' }, `Pedido nº ${p.numero || 'PENDENTE (aguardando sync)'} · ${dataBR(p.data_pedido)} · ` +
        (Number(p.total_valor) < 0 ? '↩ CRÉDITO · ' : '') +
        `${p.status.toUpperCase()} · Tabela ${p.tabela === 'lucro' ? 'Lucro Presumido' : 'Simples'}` +
        (p.condicao_pagamento ? ' · ' + p.condicao_pagamento : '')),
      el('h3', { class: 'mt8' }, cli.nome || '—'),
      el('div', { class: 'tabela-scroll mt8', html:
        `<table class="tabela"><thead><tr><th>Cód</th><th>Produto</th><th>Tam</th><th>Placas</th><th>Coloc.</th>` +
        `<th>Dev.Disp</th><th>Dev.Queb</th><th>Vend.</th><th>Total</th></tr></thead><tbody>${linhas}</tbody></table>` }),
      el('div', { class: 'total-bar mt8' },
        el('span', null, Number(p.total_valor) < 0
          ? `crédito do cliente (${p.total_unid_vendidas} un líquidas)`
          : `${p.total_unid_vendidas} un vendidas`),
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
      }, '🗑 Excluir pedido')
    ), { titulo: 'Pedido ' + (p.numero ? 'nº ' + p.numero : '') });
  }

  window.NSPedido = { novo, abrir, gerarPDF, gerarCupom };
})();
