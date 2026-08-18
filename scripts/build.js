'use strict';

/**
 * Production build: copies public/ to dist/, then bundles+minifies JS.
 *
 * Dev keeps loading every file individually from public/ (fast iteration,
 * no build step, every file readable top to bottom - unchanged). Only
 * dist/ - what config.js serves when NODE_ENV=production - gets the
 * bundled/minified treatment. Source files are never touched.
 *
 * What happens to JS specifically:
 *   - config/*.js + services/*.js + models/*.js (loaded synchronously,
 *     order-independent - each just assigns itself to `window`) get
 *     minified individually then concatenated into one shared.min.js.
 *     Every page's HTML has that whole block of <script> tags collapsed
 *     into a single tag pointing at it.
 *   - pages/*.js (each page's own controller) and pwa.js are minified
 *     in place, same filename - no HTML change needed for those, they
 *     were already one file each.
 *   - sw.js gets shared.min.js added to its precache list, with a cache
 *     version bump, so the bundle itself is available offline too.
 */

const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'public');
const OUT = path.join(ROOT, 'dist');

const SHARED_DIRS = ['js/config', 'js/services', 'js/models'];

function minify(code, filename) {
  const result = esbuild.transformSync(code, { minify: true, loader: 'js', sourcefile: filename });
  return result.code;
}

function listJsFiles(dir) {
  return fs.readdirSync(dir).filter((f) => f.endsWith('.js')).map((f) => path.join(dir, f));
}

function build() {
  const started = Date.now();

  // ── 1. Fresh copy of public/ -> dist/ ──────────────────────────
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.cpSync(SRC, OUT, { recursive: true });
  console.log(`Copied ${SRC} -> ${OUT}`);

  // ── 2. Bundle the shared, load-order-independent scripts ───────
  const sharedFiles = SHARED_DIRS.flatMap((d) => listJsFiles(path.join(SRC, d)));
  let rawTotal = 0;
  const minifiedParts = sharedFiles.map((file) => {
    const code = fs.readFileSync(file, 'utf8');
    rawTotal += code.length;
    return minify(code, path.relative(SRC, file));
  });
  const bundle = minifiedParts.join(';\n');
  const bundlePath = path.join(OUT, 'js', 'shared.min.js');
  fs.writeFileSync(bundlePath, bundle);
  console.log(`Bundled ${sharedFiles.length} shared files: ${rawTotal} -> ${bundle.length} bytes (${Math.round((1 - bundle.length / rawTotal) * 100)}% smaller)`);

  // Remove the now-superseded individual copies from dist/ so nothing
  // stale is servable there - dev (public/) is completely untouched.
  SHARED_DIRS.forEach((d) => fs.rmSync(path.join(OUT, d), { recursive: true, force: true }));

  // ── 3. Minify each page controller + pwa.js in place ────────────
  const soloFiles = [...listJsFiles(path.join(SRC, 'js', 'pages')), path.join(SRC, 'js', 'pwa.js')];
  soloFiles.forEach((file) => {
    const rel = path.relative(SRC, file);
    const code = fs.readFileSync(file, 'utf8');
    const min = minify(code, rel);
    fs.writeFileSync(path.join(OUT, rel), min);
  });
  console.log(`Minified ${soloFiles.length} page/pwa scripts in place`);

  // ── 4. Rewrite each HTML file's shared <script> tags into one ──
  const sharedTagPattern = new RegExp(
    `[ \\t]*<script src="\\/(?:${SHARED_DIRS.join('|')})\\/[^"]+"><\\/script>\\r?\\n?`,
    'g',
  );
  const htmlFiles = fs.readdirSync(OUT).filter((f) => f.endsWith('.html'));
  let rewritten = 0;
  htmlFiles.forEach((f) => {
    const file = path.join(OUT, f);
    const html = fs.readFileSync(file, 'utf8');
    if (!sharedTagPattern.test(html)) return;
    sharedTagPattern.lastIndex = 0;
    let first = true;
    const next = html.replace(sharedTagPattern, () => {
      if (!first) return '';
      first = false;
      return '<script src="/js/shared.min.js"></script>\n';
    });
    fs.writeFileSync(file, next);
    rewritten += 1;
  });
  console.log(`Rewrote script tags in ${rewritten} HTML files`);

  // ── 5. Patch the service worker's precache list ─────────────────
  const swPath = path.join(OUT, 'sw.js');
  if (fs.existsSync(swPath)) {
    let sw = fs.readFileSync(swPath, 'utf8');
    sw = sw.replace(/'sitewise-shell-v(\d+)'/, (_m, n) => `'sitewise-shell-v${Number(n) + 1}-min'`);
    sw = sw.replace(/(const SHELL = \[\r?\n)/, `$1  '/js/shared.min.js',\n`);
    fs.writeFileSync(swPath, sw);
    console.log('Patched sw.js: added shared.min.js to SHELL, bumped cache version');
  }

  console.log(`\nBuild complete in ${Date.now() - started}ms -> ${OUT}`);
}

build();
