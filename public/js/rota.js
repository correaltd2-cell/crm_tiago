/* NEW STAR — roteirização: Google Maps (Geocoding + Distance Matrix via JS API)
 * com fallback haversine × fator quando offline ou sem chave. */
(function () {
  'use strict';
  const C = window.NSCalc, DB = window.NSDB;

  let mapsPromise = null;
  function loadGoogleMaps() {
    const key = DB.config('google_maps_key', '');
    if (!key || !navigator.onLine) return Promise.resolve(null);
    if (window.google && window.google.maps) return Promise.resolve(window.google.maps);
    if (mapsPromise) return mapsPromise;
    mapsPromise = new Promise((resolve) => {
      const cb = '__nsMapsReady';
      window[cb] = () => resolve(window.google.maps);
      const s = document.createElement('script');
      s.src = 'https://maps.googleapis.com/maps/api/js?key=' + encodeURIComponent(key) +
        '&callback=' + cb + '&loading=async';
      s.onerror = () => { mapsPromise = null; resolve(null); };
      document.head.appendChild(s);
    });
    return mapsPromise;
  }

  // ---------- CEP ----------
  // O CEP é o caminho mais curto para o endereço certo: com ele vem a rua, o
  // bairro, a cidade e a UF, e o vendedor só precisa digitar o número da casa.
  // O que o CEP devolve fica guardado no aparelho, então o mesmo CEP continua
  // funcionando depois, sem internet.
  const CEP_CACHE = 'ns_cep_';
  const soDigitos = (v) => String(v == null ? '' : v).replace(/\D+/g, '');
  function cepValido(cep) { const d = soDigitos(cep); return d.length === 8 ? d : ''; }
  function cepFormatado(cep) { const d = cepValido(cep); return d ? d.slice(0, 5) + '-' + d.slice(5) : ''; }

  function cepGuardado(d) {
    try { const b = localStorage.getItem(CEP_CACHE + d); return b ? JSON.parse(b) : null; }
    catch (e) { return null; }
  }
  function guardarCep(d, dados) {
    try { localStorage.setItem(CEP_CACHE + d, JSON.stringify(dados)); } catch (e) { /* cheio: só não guarda */ }
  }

  // Dois serviços gratuitos e sem chave: se o primeiro estiver fora do ar, o
  // segundo responde. Nenhum dos dois cobra nada e os dois aceitam o navegador.
  const SERVICOS_CEP = [
    ['https://viacep.com.br/ws/{cep}/json/', (j) => (j && !j.erro) ? {
      endereco: j.logradouro || '', bairro: j.bairro || '',
      cidade: j.localidade || '', uf: String(j.uf || '').toUpperCase()
    } : null],
    ['https://brasilapi.com.br/api/cep/v1/{cep}', (j) => (j && j.cep) ? {
      endereco: j.street || '', bairro: j.neighborhood || '',
      cidade: j.city || '', uf: String(j.state || '').toUpperCase()
    } : null]
  ];

  async function buscarCep(cep) {
    const d = cepValido(cep);
    if (!d) return null;
    const salvo = cepGuardado(d);
    if (salvo) return salvo;
    if (!navigator.onLine) return null;
    for (const [molde, mapear] of SERVICOS_CEP) {
      try {
        const r = await fetch(molde.replace('{cep}', d), { cache: 'no-store' });
        if (!r.ok) continue;
        const dados = mapear(await r.json());
        if (dados && dados.cidade) {
          dados.cep = d;
          guardarCep(d, dados);
          return dados;
        }
      } catch (e) { /* tenta o próximo serviço */ }
    }
    return null;
  }

  // Completa o endereço do cliente pelo CEP SEM apagar nada: o que já está no
  // cadastro vale mais do que o que o CEP devolve (o número da rua, por exemplo,
  // o CEP não tem). Retorna só os campos que estavam em branco.
  async function completarPeloCep(c) {
    const dados = await buscarCep(c && c.cep);
    if (!dados) return null;
    const falta = {};
    const por = (campo) => {
      if (dados[campo] && !String((c && c[campo]) || '').trim()) falta[campo] = dados[campo];
    };
    por('endereco'); por('bairro'); por('cidade'); por('uf');
    return { dados, falta };
  }

  // ---------- Geocoding ----------
  function enderecoCompleto(c) {
    return [c.endereco, c.bairro, c.cidade, c.uf, cepFormatado(c.cep) || c.cep, 'Brasil']
      .filter(Boolean).join(', ');
  }

  // O Google acerta mais quando recebe a forma mais específica primeiro: rua +
  // número + CEP. Se essa falhar, desce para a rua sem CEP, depois para o CEP
  // sozinho (que já cai na rua certa) e só no fim para a cidade.
  function consultasDe(c, viaCep) {
    const cep = cepFormatado(c && c.cep);
    const parte = (campo) => String((c && c[campo]) || '').trim() || (viaCep && viaCep[campo]) || '';
    const rua = parte('endereco'), bairro = parte('bairro');
    const cidade = parte('cidade'), uf = parte('uf');
    const juntar = (...p) => p.filter(Boolean).join(', ');
    const lista = [];
    if (rua && cep) lista.push(juntar(rua, bairro, cidade, uf, cep, 'Brasil'));
    if (rua) lista.push(juntar(rua, bairro, cidade, uf, 'Brasil'));
    if (cep) lista.push(juntar(cep, cidade, uf, 'Brasil'));
    if (cidade) lista.push(juntar(cidade, uf, 'Brasil'));
    return lista.filter((v, i, a) => v && a.indexOf(v) === i);
  }

  async function geocodificar(cliente) {
    const maps = await loadGoogleMaps();
    if (!maps) throw new Error('Google Maps indisponível (sem chave ou offline)');
    // o CEP entra na busca e, quando o cadastro está sem rua, é ele que diz a rua
    const comp = await completarPeloCep(cliente);
    const preenchido = (comp && Object.keys(comp.falta).length) ? comp.falta : null;
    const geocoder = new maps.Geocoder();
    const uma = (address) => new Promise((resolve) => {
      geocoder.geocode({ address, region: 'br' }, (res, status) => {
        if (status === 'OK' && res && res[0]) {
          const g = res[0], loc = g.geometry.location;
          const lt = g.geometry.location_type;
          const precisao = (lt === 'ROOFTOP' || lt === 'RANGE_INTERPOLATED') ? 'preciso' : 'aproximado';
          resolve({ lat: loc.lat(), lng: loc.lng(), status: precisao });
        } else resolve(null);
      });
    });
    let melhor = null;
    for (const address of consultasDe(cliente, comp ? comp.dados : null)) {
      const r = await uma(address);
      if (r && r.status === 'preciso') { melhor = r; break; }   // achou a porta: para aqui
      if (r && !melhor) melhor = r;                             // guarda o aproximado e tenta melhorar
    }
    if (!melhor) return { status: 'falhou', preenchido };
    melhor.preenchido = preenchido;
    return melhor;
  }

  // Geocodificação em massa (respeita rate limit do Geocoder)
  async function geocodificarPendentes(clientes, onProgress) {
    let feitos = 0;
    for (const c of clientes) {
      try {
        const r = await geocodificar(c);
        const agora = new Date().toISOString();
        const body = r.status === 'falhou'
          ? { geocoding_status: 'falhou', geocoding_atualizado_em: agora }
          : { lat: r.lat, lng: r.lng, geocoding_status: r.status, geocoding_atualizado_em: agora };
        // o endereço que veio do CEP fica salvo no cadastro, para o vendedor ver
        if (r.preenchido) { Object.assign(body, r.preenchido); Object.assign(c, r.preenchido); }
        DB.update('clientes', c.id, body);
      } catch (e) { break; }
      feitos++;
      if (onProgress) onProgress(feitos, clientes.length);
      await new Promise(r => setTimeout(r, 250));
    }
    return feitos;
  }

  // ---------- Matriz de distâncias ----------
  // pontos: [{lat,lng}] — índice 0 é a partida. Retorna {matriz, fonte}
  async function matriz(pontos) {
    const fator = Number(DB.config('haversine_fator', 1.3));
    const fallback = () => ({ matriz: C.matrizHaversine(pontos, fator), fonte: 'haversine' });
    if (pontos.length < 2 || pontos.length > 10) return fallback(); // DM: máx 100 elementos/req
    const maps = await loadGoogleMaps();
    if (!maps) return fallback();
    try {
      const svc = new maps.DistanceMatrixService();
      const locs = pontos.map(p => new maps.LatLng(p.lat, p.lng));
      const res = await new Promise((resolve, reject) => {
        svc.getDistanceMatrix({
          origins: locs, destinations: locs,
          travelMode: maps.TravelMode.DRIVING
        }, (r, status) => status === 'OK' ? resolve(r) : reject(new Error(status)));
      });
      const n = pontos.length;
      const m = Array.from({ length: n }, () => new Array(n).fill(0));
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        const el = res.rows[i].elements[j];
        m[i][j] = (el.status === 'OK') ? el.distance.value / 1000
          : C.haversineKm(pontos[i], pontos[j]) * fator;
      }
      return { matriz: m, fonte: 'google' };
    } catch (e) { return fallback(); }
  }

  // ---------- Montagem da rota do dia ----------
  // partida: {lat,lng,label} · fixos: clientes do dia · candidatos: pendentes/atrasados
  // Reencaixa candidato se o desvio couber no limite (prioriza quem está perto de estourar o ciclo).
  async function montarRota({ partida, fixos, candidatos, hojeISO }) {
    const maxDia = Number(DB.config('visitas_dia_max', 8));
    const limDetour = Number(DB.config('reencaixe_detour_km', 15));
    const vel = Number(DB.config('velocidade_media_kmh', 60));

    const comCoord = fixos.filter(c => c.lat != null && c.lng != null);
    const semCoord = fixos.filter(c => c.lat == null || c.lng == null);

    let pontos = [partida].concat(comCoord.map(c => ({ lat: c.lat, lng: c.lng })));
    let { matriz: m, fonte } = await matriz(pontos);
    let { ordem } = C.otimizarRota(m);

    // Reencaixe: candidatos ordenados por urgência (mais atrasado primeiro)
    const urg = (c) => c.proxima_visita_prevista ? (new Date(hojeISO) - new Date(c.proxima_visita_prevista)) : 0;
    // A entra primeiro; C só depois de A e B (se ainda houver vaga no dia)
    const fila = candidatos.filter(c => c.lat != null && c.lng != null)
      .sort((a, b) => (C.classeRank(a) - C.classeRank(b)) || (urg(b) - urg(a)));
    const encaixados = [];
    for (const cand of fila) {
      if (comCoord.length + encaixados.length >= maxDia) break;
      const idxNovo = pontos.length;
      const pts2 = pontos.concat([{ lat: cand.lat, lng: cand.lng }]);
      const fator = Number(DB.config('haversine_fator', 1.3));
      // expandir matriz com haversine para o candidato (rápido, sem nova chamada de API)
      const m2 = pts2.map((p, i) => pts2.map((q, j) => {
        if (i < pontos.length && j < pontos.length) return m[i][j];
        return C.haversineKm(p, q) * fator;
      }));
      const detour = C.detourInsercao(m2, ordem, idxNovo);
      const atrasado = urg(cand) > 0;
      if (detour <= limDetour || (atrasado && detour <= limDetour * 2)) {
        pontos = pts2; m = m2;
        encaixados.push(cand);
        ordem = C.doisOpt(m, C.nearestNeighbor(m));
      }
    }

    const todos = comCoord.concat(encaixados);
    const km = C.comprimentoRota(m, ordem);
    const seq = ordem.map((idx, i) => ({
      cliente_id: todos[idx - 1].id, ordem: i + 1,
      reencaixado: idx - 1 >= comCoord.length
    }));
    // clientes sem coordenada entram no fim da lista (sem otimização)
    semCoord.forEach((c, i) => seq.push({ cliente_id: c.id, ordem: seq.length + 1, sem_coord: true }));

    return {
      sequencia: seq, distancia_total_km: Math.round(km * 10) / 10,
      tempo_total_min: Math.round(km / vel * 60), fonte,
      ordemIdx: ordem, pontos, matriz: m,
      ultimoPonto: ordem.length ? pontos[ordem[ordem.length - 1]] : partida
    };
  }

  function salvarRota(repId, dataISO, rota, partida, motivo) {
    const rep = DB.byId('representantes', repId);
    const custo = Math.round((rota.distancia_total_km * Number(rep && rep.custo_km || 0)) * 100) / 100;
    const existente = DB.all('rotas').find(r => r.representante_id === repId && r.data_rota === dataISO);
    const body = {
      representante_id: repId, data_rota: dataISO, sequencia: rota.sequencia,
      distancia_total_km: rota.distancia_total_km, tempo_total_min: rota.tempo_total_min,
      custo_estimado: custo,
      ponto_partida_lat: partida ? partida.lat : null,
      ponto_partida_lng: partida ? partida.lng : null,
      ponto_partida_tipo: partida && partida.tipo ? partida.tipo : 'base',
      status: motivo ? 'reotimizada' : 'planejada',
      motivo_reotimizacao: motivo || null
    };
    if (existente) DB.update('rotas', existente.id, body);
    else DB.insert('rotas', body);
    return custo;
  }

  window.NSRota = {
    loadGoogleMaps, geocodificar, geocodificarPendentes, matriz, montarRota, salvarRota,
    enderecoCompleto, consultasDe, buscarCep, completarPeloCep, cepFormatado, cepValido
  };
})();
