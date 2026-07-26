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

  // ---------- Geocoding ----------
  function enderecoCompleto(c) {
    return [c.endereco, c.bairro, c.cidade, c.uf, c.cep, 'Brasil']
      .filter(Boolean).join(', ');
  }

  async function geocodificar(cliente) {
    const maps = await loadGoogleMaps();
    if (!maps) throw new Error('Google Maps indisponível (sem chave ou offline)');
    const geocoder = new maps.Geocoder();
    return new Promise((resolve) => {
      geocoder.geocode({ address: enderecoCompleto(cliente), region: 'br' }, (res, status) => {
        if (status === 'OK' && res && res[0]) {
          const g = res[0], loc = g.geometry.location;
          const lt = g.geometry.location_type;
          const precisao = (lt === 'ROOFTOP' || lt === 'RANGE_INTERPOLATED') ? 'preciso' : 'aproximado';
          resolve({ lat: loc.lat(), lng: loc.lng(), status: precisao });
        } else resolve({ status: 'falhou' });
      });
    });
  }

  // Geocodificação em massa (respeita rate limit do Geocoder)
  async function geocodificarPendentes(clientes, onProgress) {
    let feitos = 0;
    for (const c of clientes) {
      try {
        const r = await geocodificar(c);
        const agora = new Date().toISOString();
        DB.update('clientes', c.id, r.status === 'falhou'
          ? { geocoding_status: 'falhou', geocoding_atualizado_em: agora }
          : { lat: r.lat, lng: r.lng, geocoding_status: r.status, geocoding_atualizado_em: agora });
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

  window.NSRota = { loadGoogleMaps, geocodificar, geocodificarPendentes, matriz, montarRota, salvarRota, enderecoCompleto };
})();
