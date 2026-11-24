// ─────────────────────────────────────────────────────────────
//  Builds a single, self-contained index.html from src/.
//  Inlines the CSS, the questions and every JS module, so the
//  game works when double-clicked, on GitHub Pages, anywhere.
//
//    node build.mjs
// ─────────────────────────────────────────────────────────────
import { readFileSync, writeFileSync } from 'node:fs';

const src = (p) => readFileSync(new URL(`./src/${p}`, import.meta.url), 'utf8');
const ORDER = ['config', 'trivia', 'state', 'audio', 'storage', 'art', 'main']; // dependency order

function bundleModule(name) {
  let code = src(`js/${name}.js`);
  const exportsList = [];

  // import { a, b } from './x.js';   →  const { a, b } = __m.x;
  code = code.replace(/^import\s*\{([^}]+)\}\s*from\s*'\.\/(\w+)\.js';?$/gm,
    (_, names, mod) => `const {${names}} = __m.${mod};`);
  // import * as s from './x.js';     →  const s = __m.x;
  code = code.replace(/^import\s+\*\s+as\s+(\w+)\s+from\s*'\.\/(\w+)\.js';?$/gm,
    (_, alias, mod) => `const ${alias} = __m.${mod};`);
  if (/^import\s/m.test(code)) throw new Error(`Unhandled import in ${name}.js`);

  // export function|class|const|let X  →  remember X, drop "export"
  code = code.replace(/^export\s+((?:async\s+)?(?:function|class|const|let)\s+(\w+))/gm,
    (_, decl, id) => { exportsList.push(id); return decl; });
  if (/^export\s/m.test(code)) throw new Error(`Unhandled export in ${name}.js`);

  return `/* ── ${name}.js ── */\n__m.${name} = (() => {\n${code}\nreturn { ${exportsList.join(', ')} };\n})();\n`;
}

const questions = JSON.parse(src('data/questions.json'));
const bundle =
  `(() => {\n'use strict';\nconst __m = {};\nwindow.__QUESTIONS__ = ${JSON.stringify(questions)};\n` +
  ORDER.map(bundleModule).join('\n') + '})();';

const safe = (s) => s.replace(/<\/(script|style)/gi, '<\\/$1');

let html = src('index.html');
const css = src('css/style.css');
if (!html.includes('<link rel="stylesheet" href="css/style.css" />')) throw new Error('stylesheet tag not found');
if (!html.includes('<script type="module" src="js/main.js"></script>')) throw new Error('script tag not found');
html = html
  .replace('<link rel="stylesheet" href="css/style.css" />', () => `<style>\n${safe(css)}\n</style>`)
  .replace('<script type="module" src="js/main.js"></script>', () => `<script>\n${safe(bundle)}\n</script>`)
  .replace('<head>', '<head>\n  <!-- BUILT FILE — edit src/ and run `node build.mjs` -->');

writeFileSync(new URL('./index.html', import.meta.url), html);
console.log(`index.html built: ${(html.length / 1024).toFixed(0)} KB, ${questions.questions.length} questions`);
