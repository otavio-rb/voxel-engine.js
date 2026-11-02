/**
 * Gera as páginas da referência de API a partir de `docs/api/registry.ts`.
 *
 *   node scripts/gen-api-pages.mjs
 *
 * Uma página por módulo (`docs/api/<id>/index.html`) mais o índice
 * (`docs/api/index.html`). As páginas são só a casca: título, navegação e o
 * ponto de montagem — o conteúdo é renderizado no navegador pelo registry,
 * que continua sendo a única fonte da verdade. Chrome (header/sidebar/tema)
 * vem de `scripts/docs-shell.mjs`, compartilhado com `gen-docs-pages.mjs` —
 * isto é a seção "Docs" do site, ao lado do "Manual" (as páginas de prosa).
 */
import { mkdirSync, readFileSync, writeFileSync, rmSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { build } from 'esbuild';
import { head, topbar, apiSidebar, l } from './docs-shell.mjs';

const root = resolve(import.meta.dirname, '..');
const apiDir = join(root, 'docs', 'api');

// ─── Lê o registry compilando-o com esbuild (é TypeScript) ──────────────────
const bundle = await build({
  entryPoints: [join(apiDir, 'registry.ts')],
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  write: false,
  logLevel: 'error'
});

const dataUrl = `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`;
const { GROUPS, MODULE_COUNT } = await import(dataUrl);

const SEARCH_BOX = `
    <div class="hidden md:flex items-center flex-1 max-w-md mx-6">
      <div class="w-full flex items-center gap-2 px-3 py-1.5 bg-slate-50 rounded-lg border border-slate-200 focus-within:border-emerald-500 focus-within:bg-white transition-all">
        <span class="material-symbols-outlined text-[16px] text-slate-400">search</span>
        <input id="api-search" type="search" placeholder="Filtrar módulos: ChunkGeometry, fluido, shader…" class="w-full bg-transparent text-xs text-slate-700 placeholder:text-slate-400 outline-none"/>
      </div>
    </div>`;

// ─── Página de um módulo ────────────────────────────────────────────────────
const modulePage = (module, group) => `${head(
  `${module.name} · Docs @voxel/engine`,
  `${module.name} · @voxel/engine Docs`,
  `Referência de ${module.name} (${module.file}) com demonstração executável ao vivo.`,
  `Reference for ${module.name} (${module.file}) with a live, runnable demo.`
)}
<body class="bg-white font-body-md text-slate-800 antialiased selection:bg-emerald-100 selection:text-emerald-900" data-module="${module.id}">
${topbar('docs')}
${apiSidebar('')}
  <div class="md:pl-72">
    <main class="w-full min-h-screen pt-20 bg-white px-6 lg:px-12 max-w-[980px] mx-auto pb-24">
      <section class="flex items-center gap-2 text-slate-500 text-xs mb-5">
        <a class="hover:text-emerald-700 transition-colors flex items-center gap-1" href="/docs/api/">
          <span class="material-symbols-outlined text-[14px]">api</span><span>Docs</span>
        </a>
        <span class="text-slate-300">/</span>
        <span id="api-crumb">${group.title}</span>
        <span class="text-slate-300">/</span>
        <span class="text-emerald-700 font-semibold">${module.name}</span>
      </section>

      <article id="api-module"></article>

      <nav class="api-pager">
        <a id="api-prev" class="api-pager-link" href="#">
          <span class="material-symbols-outlined">arrow_back</span>
          <span><small>anterior</small><span class="name"></span></span>
        </a>
        <a id="api-next" class="api-pager-link next" href="#">
          <span><small>próximo</small><span class="name"></span></span>
          <span class="material-symbols-outlined">arrow_forward</span>
        </a>
      </nav>
    </main>
  </div>
  <script type="module" src="../module.ts"></script>
  <script type="module" src="/docs/src/lang-switcher.js"></script>
</body>
</html>
`;

// ─── Índice ─────────────────────────────────────────────────────────────────
const indexPage = () => `${head(
  'Docs · @voxel/engine',
  'Docs · @voxel/engine',
  'Referência da engine @voxel/engine módulo por módulo, cada um com demonstração executável ao vivo.',
  'The @voxel/engine reference, module by module, each with a live, runnable demo.'
)}
<body class="bg-white font-body-md text-slate-800 antialiased selection:bg-emerald-100 selection:text-emerald-900">
${topbar('docs', SEARCH_BOX)}
${apiSidebar('')}
  <div class="md:pl-72">
    <main class="w-full min-h-screen pt-20 bg-white px-6 lg:px-12 max-w-[1040px] mx-auto pb-24">
      <section class="flex items-center gap-2 text-slate-500 text-xs mb-4">
        <a class="hover:text-emerald-700 transition-colors flex items-center gap-1" href="/docs/">
          <span class="material-symbols-outlined text-[14px]">home</span><span>Docs</span>
        </a>
        <span class="text-slate-300">/</span>
        <span class="text-emerald-700 font-semibold">${l({ pt: 'Referência da API', en: 'API Reference' })}</span>
      </section>

      <header class="flex flex-col gap-4 mb-8">
        <div class="flex flex-wrap items-center gap-2">
          <span class="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 font-badge-voxel text-[10px] tracking-widest uppercase font-bold">${l({ pt: 'REFERÊNCIA DE API', en: 'API REFERENCE' })}</span>
          <span class="px-2.5 py-0.5 rounded-full bg-sky-50 text-sky-800 border border-sky-200 font-badge-voxel text-[10px] tracking-widest uppercase font-bold flex items-center gap-1">
            <span class="w-1.5 h-1.5 rounded-full bg-sky-500 animate-ping"></span> ${l({ pt: 'TODA DEMO É EXECUTÁVEL', en: 'EVERY DEMO RUNS LIVE' })}
          </span>
        </div>
        <h1 class="text-3xl font-extrabold tracking-tight text-slate-900 font-display">${l({ pt: 'A engine, módulo por módulo', en: 'The engine, module by module' })}</h1>
        <p class="text-base text-slate-600 leading-relaxed">${l({
          pt: 'Uma página por módulo, com a assinatura real do código-fonte e uma demonstração que <strong>roda de verdade</strong> contra os módulos de <code class="font-code-inline text-emerald-700">engine/</code>. Todo exemplo é editável: mexa no código e execute.',
          en: 'One page per module, with the real source-code signature and a demo that <strong>actually runs</strong> against the <code class="font-code-inline text-emerald-700">engine/</code> modules. Every example is editable: change the code and run it.'
        })} <span data-count-modules>…</span> ${l({ pt: 'módulos documentados.', en: 'modules documented.' })}</p>
        <div class="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600 leading-relaxed">
          ${l({
            pt: '<strong class="text-slate-900">Cada demo usa o sandbox mais barato que exercita o módulo</strong>, e nada além disso:',
            en: '<strong class="text-slate-900">Each demo uses the cheapest sandbox that exercises the module</strong>, and nothing more:'
          })}
          <ul class="mt-2 space-y-1 list-disc pl-5">
            <li>${l({
              pt: '<code class="font-code-inline">voxelScene()</code> — volume de voxels gerado por <code class="font-code-inline">ChunkData</code>, malhado por <code class="font-code-inline">ChunkGeometry</code> e iluminado pelo <code class="font-code-inline">Sky</code>. Serve a colisão, raycast, partículas, entidades e passes de tela.',
              en: '<code class="font-code-inline">voxelScene()</code> — a voxel volume generated by <code class="font-code-inline">ChunkData</code>, meshed by <code class="font-code-inline">ChunkGeometry</code>, and lit by <code class="font-code-inline">Sky</code>. Serves collision, raycasting, particles, entities, and screen passes.'
            })}</li>
            <li>${l({
              pt: '<code class="font-code-inline">worldSandbox()</code> — <code class="font-code-inline">ProceduralWorld</code> com chunk workers, só onde o streaming <em>é</em> o assunto: mundo, LOD, dimensões, fluidos, jogador e interação.',
              en: '<code class="font-code-inline">worldSandbox()</code> — <code class="font-code-inline">ProceduralWorld</code> with chunk workers, only where streaming <em>is</em> the point: world, LOD, dimensions, fluids, player, and interaction.'
            })}</li>
            <li>${l({
              pt: '<code class="font-code-inline">engineSandbox()</code> — a engine inteira num worker, com OffscreenCanvas, para <code class="font-code-inline">VoxelEngine</code>, <code class="font-code-inline">runEngineWorker</code>, <code class="font-code-inline">EngineContext</code> e comandos.',
              en: '<code class="font-code-inline">engineSandbox()</code> — the whole engine in a worker, with OffscreenCanvas, for <code class="font-code-inline">VoxelEngine</code>, <code class="font-code-inline">runEngineWorker</code>, <code class="font-code-inline">EngineContext</code>, and commands.'
            })}</li>
          </ul>
          <p class="mt-2">${l({
            pt: 'E todo cubo que aparece é voxel de verdade: volume preenchido e passado pelo mesher da engine, nunca <code class="font-code-inline">BoxGeometry</code>.',
            en: "And every cube on screen is a real voxel: a filled volume run through the engine's own mesher, never <code class=\"font-code-inline\">BoxGeometry</code>."
          })}</p>
        </div>
      </header>

      <div id="api-index"></div>
    </main>
  </div>
  <script type="module" src="./index-page.ts"></script>
  <script type="module" src="/docs/src/lang-switcher.js"></script>
</body>
</html>
`;

// ─── Escrita ────────────────────────────────────────────────────────────────
// Remove páginas de módulos que não existem mais no registry.
const ids = new Set(GROUPS.flatMap((g) => g.modules.map((m) => m.id)));
for (const name of readdirSync(apiDir)) {
  const dir = join(apiDir, name);
  if (!statSync(dir).isDirectory() || name === 'workers') continue;
  if (!ids.has(name)) {
    rmSync(dir, { recursive: true, force: true });
    console.log('removida', `docs/api/${name}/`);
  }
}

let escritas = 0;
for (const group of GROUPS) {
  for (const module of group.modules) {
    const file = join(apiDir, module.id, 'index.html');
    mkdirSync(dirname(file), { recursive: true });
    const html = modulePage(module, group);
    if (!existsSync(file) || readFileSync(file, 'utf8') !== html) {
      writeFileSync(file, html, 'utf8');
      escritas++;
    }
  }
}

writeFileSync(join(apiDir, 'index.html'), indexPage(), 'utf8');

console.log(`páginas da API geradas: ${MODULE_COUNT} módulos (${escritas} atualizadas) + índice`);
