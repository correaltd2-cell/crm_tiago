/* NEW STAR — compatibilidade com Safari antigo (iPad/iPhone com iOS 12/13).
 *
 * O cliente usa um iPad com iOS 12. O Safari de lá é ES2019: um único "??" ou "?."
 * num arquivo é ERRO DE SINTAXE e derruba o script inteiro — o app abre em branco.
 * Este teste trava a régua: se alguém escrever sintaxe nova, o teste quebra aqui
 * em vez de o vendedor descobrir na farmácia.
 */
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const JS = ['public/js/calc.js', 'public/js/seed.js', 'public/js/ui.js', 'public/js/db.js',
  'public/js/rota.js', 'public/js/pdf.js', 'public/js/pedido.js', 'public/js/ajuda.js',
  'public/js/app.js', 'public/sw.js', 'api/cupom.js', 'api/assinatura.js'];

let ok = 0, fail = 0;
const check = (nome, cond, detalhe) => {
  if (cond) { ok++; console.log('  ✓', nome); }
  else { fail++; console.error('  ✗', nome, detalhe ? '→ ' + detalhe : ''); }
};

// ── 1. sintaxe: tudo tem de fazer parse como ES2019 ─────────────────────────
function carregarAcorn() {
  const tentativas = ['acorn',
    '/opt/node22/lib/node_modules/eslint/node_modules/acorn',
    '/opt/node22/lib/node_modules/ts-node/node_modules/acorn'];
  for (const t of tentativas) { try { return require(t); } catch (e) { /* segue */ } }
  return null;
}

// sem acorn instalado, caímos para varredura por texto (tira strings e comentários antes)
function semStringsNemComentarios(src) {
  let fora = '', i = 0;
  while (i < src.length) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') { i += 2; while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; continue; }
    if (c === '"' || c === "'") {
      const aspa = c; i++;
      while (i < src.length && src[i] !== aspa) { if (src[i] === '\\') i++; i++; }
      i++; fora += '""'; continue;
    }
    if (c === '`') { // preserva só o miolo dos ${ } (lá tem código de verdade)
      i++;
      while (i < src.length && src[i] !== '`') {
        if (src[i] === '\\') { i += 2; continue; }
        if (src[i] === '$' && src[i + 1] === '{') {
          let nivel = 1; i += 2; fora += '(';
          while (i < src.length && nivel > 0) {
            if (src[i] === '{') nivel++;
            if (src[i] === '}') { nivel--; if (!nivel) break; }
            fora += src[i]; i++;
          }
          fora += ')'; i++; continue;
        }
        i++;
      }
      i++; continue;
    }
    fora += c; i++;
  }
  return fora;
}

const PROIBIDOS = [
  [/\?\?=/, '??= (atribuição nullish, Safari 14+)'],
  [/\|\|=|&&=/, '||= / &&= (atribuição lógica, Safari 14+)'],
  [/\?\?/, '?? (nullish coalescing, Safari 13.1+)'],
  [/\?\.[A-Za-z_$([]/, '?. (optional chaining, Safari 13.1+)'],
  [/\.replaceAll\s*\(/, '.replaceAll() (Safari 13.1+)'],
  [/\.matchAll\s*\(/, '.matchAll() (Safari 13+)'],
  [/\.flatMap\s*\(/, '.flatMap() — trocar por .map().flat()'],
  [/Promise\.allSettled|Promise\.any/, 'Promise.allSettled/any (Safari 13+)'],
  [/Object\.hasOwn|structuredClone|\.findLast\s*\(|\.at\s*\(\s*-/, 'API de Safari 15+'],
  [/\(\?<[=!]/, 'regex lookbehind (Safari 16.4+)']
];

const acorn = carregarAcorn();
console.log(acorn ? 'Sintaxe ES2019 (parser real):' : 'Sintaxe ES2019 (varredura de texto — acorn não encontrado):');
for (const rel of JS) {
  const src = fs.readFileSync(path.join(RAIZ, rel), 'utf8');
  if (acorn) {
    let erro = null;
    try { acorn.parse(src, { ecmaVersion: 2019 }); } catch (e) { erro = e.message; }
    check(rel + ' roda no Safari do iOS 12', !erro, erro);
  } else {
    const limpo = semStringsNemComentarios(src);
    const achado = PROIBIDOS.find(([re]) => re.test(limpo));
    check(rel + ' roda no Safari do iOS 12', !achado, achado && achado[1]);
  }
}

// mesmo com parser, a varredura pega APIs que existem mas não naquele Safari
console.log('\nAPIs recentes demais para o iOS 12:');
for (const rel of JS) {
  const limpo = semStringsNemComentarios(fs.readFileSync(path.join(RAIZ, rel), 'utf8'));
  const achado = PROIBIDOS.find(([re]) => re.test(limpo));
  check(rel + ' sem API nova demais', !achado, achado && achado[1]);
}

// ── 2. CSS: o que o Safari 12 ignora silenciosamente e desmonta o layout ────
console.log('\nCSS que o Safari do iOS 12 não entende:');
const html = fs.readFileSync(path.join(RAIZ, 'public/index.html'), 'utf8');
const css = (html.match(/<style>[\s\S]*?<\/style>/) || [''])[0];

check('sem "inset:" (só chegou no Safari 14.1 — usar top/right/bottom/left)',
  !/[^-]inset\s*:/.test(css));
check('position:sticky vem com -webkit-sticky antes',
  !/position\s*:\s*sticky/.test(css) || /position\s*:\s*-webkit-sticky/.test(css));

const semPrefixo = (prop) => {
  const re = new RegExp('(^|[;{\\s])' + prop + '\\s*:', 'g');
  let m, faltando = 0;
  while ((m = re.exec(css))) {
    const antes = css.slice(Math.max(0, m.index - 200), m.index);
    const depois = css.slice(m.index, m.index + 260);
    if (!antes.includes('-webkit-' + prop) && !depois.includes('-webkit-' + prop)) faltando++;
  }
  return faltando;
};
check('todo backdrop-filter tem o par -webkit-backdrop-filter', semPrefixo('backdrop-filter') === 0);
check('todo clip-path tem o par -webkit-clip-path', semPrefixo('clip-path') === 0);

// flexbox gap: o Safari 12 ignora, então precisa da detecção + regras de margem
check('o <html> ganha .sem-gap quando o flexbox não tem gap', /sem-gap/.test(html) && /row-gap:12px/.test(html));
const regrasSemGap = (css.match(/\.sem-gap /g) || []).length;
check('existem regras de margem para .sem-gap (>= 15)', regrasSemGap >= 15, 'achei ' + regrasSemGap);
// cada container flex com gap precisa de um fallback correspondente
const alvos = ['.col.gap4', '.col.gap8', '.row.gap4', '.row.gap8', '.campo', '.lista',
  '.card-escolha', '.chip-cliente', '.calc-live', '.kpi', '.chat-lista', '.login-box',
  '.stepper', '.dias-scroll', '.sugestao', '.hist-linha', '.total-bar', '.logo-mark',
  '.tema-opt', '.chips'];
const semFallback = alvos.filter(a => !css.includes('.sem-gap ' + a));
check('todo container com gap tem fallback de margem', semFallback.length === 0, semFallback.join(', '));

console.log(`\nCompatibilidade iOS 12: ${ok} ok, ${fail} falhas`);
process.exit(fail ? 1 : 0);
