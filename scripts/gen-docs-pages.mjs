/**
 * Gera as páginas de prosa (`docs/<rota>/index.html`) a partir de `docs/pages/registry.ts`,
 * nos mesmos moldes de `gen-api-pages.mjs`: registry compilado em memória com esbuild,
 * casca compartilhada de `scripts/docs-shell.mjs`. Ao contrário da referência de API,
 * aqui o CONTEÚDO também é renderizado em build-time (não há playground para montar no
 * client) — então cada página já sai com os dois idiomas no HTML, alternados por
 * `[data-lang]` e `docs/src/lang-switcher.js`. Não existe mais `docs/en/<rota>/`.
 *
 *   node scripts/gen-docs-pages.mjs
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { build } from 'esbuild';
import { head, topbar, sidebar, breadcrumb, footerPager, l, mobileMenuScript } from './docs-shell.mjs';

const root = resolve(import.meta.dirname, '..');
const docsDir = join(root, 'docs');

async function compileToModule(entryPoint) {
  const bundle = await build({ entryPoints: [entryPoint], bundle: true, format: 'esm', platform: 'neutral', write: false, logLevel: 'error' });
  const dataUrl = `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`;
  return import(dataUrl);
}

const { PAGES } = await compileToModule(join(docsDir, 'pages', 'registry.ts'));
const apiRegistry = await compileToModule(join(docsDir, 'api', 'registry.ts'));
const GROUPS = apiRegistry.GROUPS;

let i18n = {};
try {
  i18n = await compileToModule(join(docsDir, 'api', 'i18n.ts'));
} catch {
  console.warn('docs/api/i18n.ts não pôde ser compilado — seções importadas da API ficarão só em PT.');
}

// ─── Resolve um módulo de docs/api/registry.ts e sua tradução EN, se existir ────────────
function findApiModule(id) {
  for (const group of GROUPS) {
    const found = group.modules.find((m) => m.id === id);
    if (found) return found;
  }
  return null;
}

/** docs/api/i18n.ts traduz `desc` por texto exato (DESC_MAP_EN), não por nome de membro —
 *  `translateDesc` já faz esse lookup e devolve o próprio PT quando não encontra tradução. */
function translateMemberDesc(_moduleId, _memberName, descPt) {
  return i18n.translateDesc ? i18n.translateDesc(descPt, true) : descPt;
}

function memberSigHtml(member) {
  if (member.kind === 'event') return `on(${member.signature}, cb)`;
  return member.signature;
}

/** Monta as linhas de uma seção `params-table`/`methods-grid`/`events-table` a partir
 *  de `docs/api/registry.ts` em vez de dados reescritos à mão — isto é o que garante
 *  que a página de prosa não pode mais divergir da referência. */
function resolveApiMembers(apiModuleId, kinds) {
  const mod = findApiModule(apiModuleId);
  if (!mod) {
    console.warn(`docs/pages/registry.ts referencia apiModuleId "${apiModuleId}", que não existe em docs/api/registry.ts`);
    return [];
  }
  return mod.members
    .filter((m) => kinds.includes(m.kind))
    .map((m) => ({
      name: m.signature,
      sigHtml: memberSigHtml(m),
      desc: { pt: m.desc, en: translateMemberDesc(apiModuleId, m.signature, m.desc) }
    }));
}

// ─── Renderização de cada tipo de seção ─────────────────────────────────────────────────
function renderOverview(section) {
  return `
      <section class="flex flex-col gap-3 my-8" id="${section.id}">
        <h2 class="text-xl font-bold text-slate-900 border-b border-slate-200 pb-2">${l(section.title)}</h2>
        <p class="text-sm text-slate-600 leading-relaxed">${l(section.body)}</p>
      </section>`;
}

function renderCallout(section) {
  const styles = {
    info: 'border-sky-400 bg-sky-50 text-sky-900',
    tip: 'border-emerald-400 bg-emerald-50 text-emerald-900',
    warning: 'border-amber-400 bg-amber-50 text-amber-900'
  };
  const style = styles[section.calloutVariant || 'info'];
  return `
      <section class="my-8" id="${section.id}">
        <div class="rounded-lg border-l-4 ${style} p-4 text-xs leading-relaxed">
          <div class="font-bold mb-1">${l(section.title)}</div>
          ${l(section.body)}
        </div>
      </section>`;
}

function rowsFromSection(section) {
  if (section.apiModuleId) return resolveApiMembers(section.apiModuleId, section.apiMemberKinds || []);
  return null;
}

function renderParamsTable(section) {
  const apiRows = rowsFromSection(section);
  const rows = apiRows
    ? apiRows.map((r) => `
              <tr>
                <td class="p-3 font-mono text-emerald-700 font-bold">${r.sigHtml}</td>
                <td class="p-3 text-xs" colspan="3">${l(r.desc)}</td>
              </tr>`)
    : (section.params || []).map(
        (p) => `
              <tr>
                <td class="p-3 font-mono text-emerald-700 font-bold">${p.name}</td>
                <td class="p-3 font-mono">${p.type}</td>
                <td class="p-3 font-mono">${p.default ?? ''}</td>
                <td class="p-3">${l(p.desc)}</td>
              </tr>`
      );
  return `
      <section class="flex flex-col gap-4 my-8" id="${section.id}">
        <h2 class="text-xl font-bold text-slate-900 border-b border-slate-200 pb-2">${l(section.title)}</h2>
        <div class="overflow-x-auto rounded-lg border border-slate-200 shadow-xs">
          <table class="w-full text-left text-xs border-collapse">
            <thead>
              <tr class="bg-slate-100 text-slate-900 border-b border-slate-200">
                <th class="p-3 font-semibold">${l({ pt: 'Parâmetro', en: 'Parameter' })}</th>
                <th class="p-3 font-semibold">${l({ pt: 'Tipo', en: 'Type' })}</th>
                <th class="p-3 font-semibold">${l({ pt: 'Padrão', en: 'Default' })}</th>
                <th class="p-3 font-semibold">${l({ pt: 'Descrição', en: 'Description' })}</th>
              </tr>
            </thead>
            <tbody class="text-slate-700 divide-y divide-slate-100">${rows.join('')}
            </tbody>
          </table>
        </div>
      </section>`;
}

function renderMethodsGrid(section) {
  const apiRows = rowsFromSection(section);
  const items = apiRows
    ? apiRows
    : (section.methods || []).map((m) => ({ sigHtml: m.sig, desc: m.desc }));
  return `
      <section class="flex flex-col gap-4 my-8" id="${section.id}">
        <h2 class="text-xl font-bold text-slate-900 border-b border-slate-200 pb-2">${l(section.title)}</h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono">
          ${items
            .map(
              (m) => `
          <div class="p-3 bg-slate-50 rounded-lg border border-slate-200 shadow-2xs flex flex-col gap-1">
            <span class="text-emerald-700 font-bold">${m.sigHtml}</span>
            ${m.desc ? `<p class="text-slate-600 text-[11px] font-sans">${l(m.desc)}</p>` : ''}
          </div>`
            )
            .join('')}
        </div>
      </section>`;
}

function renderEventsTable(section) {
  const apiRows = rowsFromSection(section);
  const rows = apiRows
    ? apiRows.map(
        (r) => `
              <tr>
                <td class="p-3 text-emerald-700 font-bold">${r.name}</td>
                <td class="p-3 font-sans" colspan="2">${l(r.desc)}</td>
              </tr>`
      )
    : (section.events || []).map(
        (e) => `
              <tr>
                <td class="p-3 text-emerald-700 font-bold">${e.name}</td>
                <td class="p-3">${e.payload}</td>
                <td class="p-3 font-sans">${l(e.desc)}</td>
              </tr>`
      );
  return `
      <section class="flex flex-col gap-4 my-8" id="${section.id}">
        <h2 class="text-xl font-bold text-slate-900 border-b border-slate-200 pb-2">${l(section.title)}</h2>
        <div class="overflow-x-auto rounded-lg border border-slate-200 shadow-xs">
          <table class="w-full text-left text-xs border-collapse">
            <thead>
              <tr class="bg-slate-100 text-slate-900 border-b border-slate-200">
                <th class="p-3 font-semibold">${l({ pt: 'Evento', en: 'Event' })}</th>
                <th class="p-3 font-semibold" colspan="2">${l({ pt: 'Descrição', en: 'Description' })}</th>
              </tr>
            </thead>
            <tbody class="text-slate-700 divide-y divide-slate-100 font-mono">${rows.join('')}
            </tbody>
          </table>
        </div>
      </section>`;
}

function renderSeeAlso(section) {
  return `
      <section class="flex flex-col gap-3 my-8" id="${section.id}">
        <h2 class="text-xl font-bold text-slate-900 border-b border-slate-200 pb-2">${l(section.title)}</h2>
        ${section.body ? `<p class="text-xs text-slate-600 leading-relaxed">${l(section.body)}</p>` : ''}
        <ul class="flex flex-col gap-1.5">
          ${(section.seeAlso || [])
            .map(
              (s) => `<li><a class="text-sm text-emerald-700 font-semibold hover:text-emerald-800 transition-colors" href="${s.href}">${l(s.label)}</a></li>`
            )
            .join('')}
        </ul>
      </section>`;
}

const RENDERERS = {
  overview: renderOverview,
  callout: renderCallout,
  'params-table': renderParamsTable,
  'methods-grid': renderMethodsGrid,
  'events-table': renderEventsTable,
  'see-also': renderSeeAlso
};

function renderToc(page) {
  const headed = page.sections.filter((s) => s.kind !== 'see-also' || s.seeAlso?.length);
  return `
    <aside class="fixed right-0 top-16 bottom-0 w-60 bg-white border-l border-slate-200 z-40 hidden xl:flex flex-col px-4 py-6 overflow-y-auto">
      <div class="flex items-center gap-1.5 mb-3 text-slate-900 font-label-sm text-[11px] uppercase tracking-wider font-semibold">
        <span class="material-symbols-outlined text-[16px] text-emerald-600">toc</span>
        <span>${l({ pt: 'Nesta página', en: 'On this page' })}</span>
      </div>
      <nav class="flex flex-col gap-1 border-l border-slate-200 pl-2 text-xs text-slate-600">
        ${headed.map((s) => `<a class="hover:text-emerald-700 py-0.5 pl-2 transition-colors" href="#${s.id}">${l(s.title)}</a>`).join('\n        ')}
      </nav>
    </aside>`;
}

function pagePage(page, chapter, prev, next) {
  const trailPt = [{ label: page.navLabel.pt }];
  const trailEn = [{ label: page.navLabel.en }];
  const badge = { pt: `Capítulo ${chapter}`, en: `Chapter ${chapter}` };
  return `${head(
    `${page.navLabel.pt} · Manual @voxel/engine`,
    `${page.navLabel.en} · @voxel/engine Manual`,
    `Manual técnico de ${page.navLabel.pt} (${page.sourceFile}).`,
    `Technical manual for ${page.navLabel.en} (${page.sourceFile}).`
  )}
<body class="bg-white font-body-md text-slate-800 antialiased selection:bg-emerald-100 selection:text-emerald-900">
${topbar('manual')}
${sidebar(PAGES, page.id)}
${renderToc(page)}
  <div class="md:pl-72 xl:pr-60">
    <main class="w-full min-h-screen pt-20 bg-white px-6 lg:px-12 max-w-[900px] mx-auto pb-20">
${breadcrumb(trailPt, trailEn)}
      <header class="flex flex-col gap-3 mb-8">
        <span class="px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 font-mono text-[11px] tracking-widest uppercase font-bold w-fit">${l(badge)}</span>
        <h1 class="text-3xl font-extrabold tracking-tight text-slate-900 font-display">${l(page.title)}</h1>
        <p class="text-base text-slate-600 leading-relaxed">${l(page.lead)}</p>
      </header>
${page.sections.map((s) => RENDERERS[s.kind](s)).join('')}
${footerPager(prev, next)}
    </main>
  </div>
${mobileMenuScript}
  <script type="module" src="/docs/src/lang-switcher.js"></script>
</body>
</html>
`;
}

// ─── Landing page (/docs/) ───────────────────────────────────────────────────────────
// Reescrita porque a versão anterior inventava opções de VoxelEngine/runEngineWorker/
// WorldGenerator que não existem (ver auditoria) e exibia números de benchmark sem
// fonte (ex.: "42.8M voxels/sec"). Código abaixo conferido contra:
// engine/core/VoxelEngine.ts, engine/runtime/EngineRuntime.ts, engine/world/WorldGenerator.ts.
function landingPage() {
  const moduleCount = GROUPS.reduce((n, g) => n + g.modules.length, 0);

  const quickStartTabs = [
    {
      id: 'main',
      label: { pt: '1. Main Thread', en: '1. Main Thread' },
      file: 'src/main.ts',
      code: `<span class="text-purple-400">import</span> { <span class="text-sky-300">VoxelEngine</span> } <span class="text-purple-400">from</span> <span class="text-emerald-300">'@voxel/engine'</span>;

<span class="text-purple-400">const</span> canvas = <span class="text-sky-400">document</span>.<span class="text-sky-300">querySelector</span>(<span class="text-emerald-300">'canvas'</span>)!;
<span class="text-purple-400">const</span> worker = <span class="text-purple-400">new</span> <span class="text-sky-300">Worker</span>(<span class="text-purple-400">new</span> <span class="text-sky-300">URL</span>(<span class="text-emerald-300">'./workers/engine.worker.ts'</span>, <span class="text-purple-400">import</span>.meta.url), { type: <span class="text-emerald-300">'module'</span> });

<span class="text-purple-400">const</span> engine = <span class="text-purple-400">new</span> <span class="text-sky-300">VoxelEngine</span>({ canvas, worker });
engine.<span class="text-sky-300">on</span>(<span class="text-emerald-300">'stats'</span>, (s) => <span class="text-sky-400">console</span>.<span class="text-sky-300">log</span>(s.fps, s.triangles));
engine.<span class="text-sky-300">start</span>();`
    },
    {
      id: 'engine',
      label: { pt: '2. Engine Worker', en: '2. Engine Worker' },
      file: 'src/workers/engine.worker.ts',
      code: `<span class="text-purple-400">import</span> { <span class="text-sky-300">runEngineWorker</span>, <span class="text-purple-400">type</span> <span class="text-sky-300">EnginePlugin</span> } <span class="text-purple-400">from</span> <span class="text-emerald-300">'@voxel/engine/worker'</span>;

<span class="text-purple-400">const</span> hydrationPlugin: <span class="text-sky-300">EnginePlugin</span> = {
  name: <span class="text-emerald-300">'hydration'</span>,
  <span class="text-sky-300">setup</span>(ctx) {
    ctx.<span class="text-sky-300">on</span>(<span class="text-emerald-300">'fixedUpdate'</span>, ({ deltaMs }) => { <span class="text-slate-500">/* 1 vez por tick */</span> });
  }
};

<span class="text-sky-300">runEngineWorker</span>({
  createChunkWorker: () => <span class="text-purple-400">new</span> <span class="text-sky-300">Worker</span>(<span class="text-purple-400">new</span> <span class="text-sky-300">URL</span>(<span class="text-emerald-300">'./chunk.worker.ts'</span>, <span class="text-purple-400">import</span>.meta.url), { type: <span class="text-emerald-300">'module'</span> }),
  targetTps: <span class="text-amber-400">60</span>,
  plugins: [hydrationPlugin]
});`
    },
    {
      id: 'chunk',
      label: { pt: '3. Chunk Worker', en: '3. Chunk Worker' },
      file: 'src/workers/chunk.worker.ts',
      code: `<span class="text-purple-400">import</span> { <span class="text-sky-300">runChunkWorker</span>, <span class="text-purple-400">type</span> <span class="text-sky-300">WorldGenerator</span> } <span class="text-purple-400">from</span> <span class="text-emerald-300">'@voxel/engine/chunk-worker'</span>;

<span class="text-purple-400">class</span> <span class="text-sky-300">TerrainGenerator</span> <span class="text-purple-400">implements</span> <span class="text-sky-300">WorldGenerator</span> {
  readonly id = <span class="text-emerald-300">'simplex-mountains'</span>;
  <span class="text-sky-300">generate</span>(ctx) {
    <span class="text-slate-500">// ctx.setBlock(x, y, z, blockId) para cada posição do volume deste chunk</span>
  }
}

<span class="text-sky-300">runChunkWorker</span>({ generators: [<span class="text-purple-400">new</span> <span class="text-sky-300">TerrainGenerator</span>()] });`
    }
  ];

  return `${head(
    '@voxel/engine (voxel-engine.js) · Documentação Técnica',
    '@voxel/engine (voxel-engine.js) · Technical Documentation',
    'Motor voxel 3D em TypeScript com Web Workers, Greedy Meshing, GPU Raymarching e autômato celular de fluidos.',
    '3D voxel engine in TypeScript with Web Workers, Greedy Meshing, GPU Raymarching, and a fluid cellular automaton.'
  )}
<body class="bg-white font-body-md text-slate-800 antialiased selection:bg-emerald-100 selection:text-emerald-900">
${topbar('manual')}
${sidebar(PAGES, 'intro')}
  <div class="md:pl-72">
    <main class="w-full min-h-screen pt-20 bg-white px-6 lg:px-12 max-w-[980px] mx-auto pb-24">
      <header class="flex flex-col gap-4 mb-8" id="introducao">
        <span class="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 font-badge-voxel text-[10px] tracking-widest uppercase font-bold w-fit">${l({ pt: 'DOCUMENTAÇÃO TÉCNICA', en: 'TECHNICAL DOCUMENTATION' })}</span>
        <h1 class="font-display text-4xl font-extrabold tracking-tight text-slate-900">@voxel/engine</h1>
        <p class="text-base text-slate-600 max-w-3xl leading-relaxed">${l({
          pt: 'Motor voxel 3D para navegadores, em TypeScript e Three.js, com a simulação e a geração de mundo isoladas em Web Workers dedicados — a main thread só possui o canvas e o input.',
          en: 'A 3D voxel engine for the browser, in TypeScript and Three.js, with simulation and world generation isolated in dedicated Web Workers — the main thread only owns the canvas and input.'
        })}</p>
      </header>

      <section class="flex flex-col gap-4 my-8" id="quick-start">
        <h2 class="text-2xl font-bold text-slate-900">${l({ pt: 'Quick Start', en: 'Quick Start' })}</h2>
        <div class="bg-slate-900 rounded-xl overflow-hidden shadow-lg border border-slate-800">
          <div class="flex items-center bg-slate-950 px-4 pt-2 border-b border-slate-800 gap-2">
            ${quickStartTabs
              .map(
                (t, i) => `<button class="px-4 py-2 rounded-t-lg font-mono text-xs flex items-center gap-1.5 transition-all ${
                  i === 0 ? 'bg-slate-900 text-emerald-400 font-semibold border-t-2 border-emerald-500' : 'text-slate-400 hover:text-slate-200'
                }" id="btn-tab-${t.id}" onclick="switchTab('tab-${t.id}', this)"><span>${l(t.label)}</span></button>`
              )
              .join('')}
          </div>
          ${quickStartTabs
            .map(
              (t, i) => `
          <div class="code-tab-pane flex flex-col p-4 ${i === 0 ? '' : 'hidden'}" id="tab-${t.id}">
            <div class="flex items-center justify-between pb-2 text-slate-400 font-mono text-xs"><span>${t.file}</span></div>
            <pre class="bg-slate-950/60 p-4 rounded-lg overflow-x-auto font-mono text-xs leading-relaxed text-slate-200 border border-slate-800/80"><code>${t.code}</code></pre>
          </div>`
            )
            .join('')}
        </div>
      </section>

      <section class="flex flex-col gap-4 my-8" id="sumario">
        <h2 class="text-2xl font-bold text-slate-900">${l({ pt: 'Sumário do Manual', en: 'Manual Contents' })}</h2>
        <p class="text-xs text-slate-600 leading-relaxed">${l({
          pt: 'Em ordem de leitura — cada capítulo assume os anteriores.',
          en: 'In reading order — each chapter builds on the ones before it.'
        })}</p>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          ${PAGES.map(
            (p, i) => `
          <a href="${p.route}" class="p-3.5 rounded-xl bg-slate-50 border border-slate-200 hover:border-slate-300 hover:bg-white flex items-start gap-3 shadow-xs hover:shadow-md transition-all">
            <span class="font-mono text-xs text-slate-400 mt-0.5">${i + 1}</span>
            <span class="flex flex-col gap-0.5">
              <span class="text-sm font-bold text-slate-900 flex items-center gap-1.5"><span class="material-symbols-outlined text-[16px] text-emerald-600">${p.navIcon}</span>${l(p.navLabel)}</span>
            </span>
          </a>`
          ).join('')}
        </div>
      </section>

      <section class="flex flex-col gap-4 my-8" id="docs">
        <h2 class="text-2xl font-bold text-slate-900">${l({ pt: 'Referência (Docs)', en: 'Reference (Docs)' })}</h2>
        <p class="text-xs text-slate-600 leading-relaxed">${l({
          pt: `O Manual acima explica o porquê; a referência é o onde — assinatura exata, ${moduleCount} módulos, um por página, cada um com demonstração executável.`,
          en: `The Manual above explains the why; the reference is the where — exact signatures, ${moduleCount} modules, one per page, each with a runnable demo.`
        })}</p>
        <a class="text-sm text-emerald-700 font-semibold hover:text-emerald-800 transition-colors" href="/docs/api/">${l({ pt: 'Abrir Docs →', en: 'Open Docs →' })}</a>
      </section>

      <section class="flex flex-col gap-4 my-8" id="scripts-qualidade">
        <h2 class="text-2xl font-bold text-slate-900">${l({ pt: 'Scripts & Qualidade', en: 'Scripts & Quality' })}</h2>
        <p class="text-xs text-slate-600 leading-relaxed">${l({
          pt: 'Scripts de validação de AST rodam a cada build para impedir que APIs do DOM ou do Three.js vazem para dentro dos workers de background.',
          en: 'AST validation scripts run on every build to stop DOM or Three.js APIs from leaking into the background workers.'
        })}</p>
        <div class="bg-slate-900 rounded-xl p-4 flex flex-col gap-1.5 font-mono text-xs shadow-md border border-slate-800 text-slate-200">
          <div><span class="text-emerald-400 font-bold">❯</span> <span class="text-emerald-300 font-semibold">npm run check:boundary</span></div>
          <div><span class="text-sky-400 font-bold">❯</span> <span class="text-sky-300 font-semibold">npm run check:shared</span></div>
          <div><span class="text-slate-400 font-bold">❯</span> <span class="text-slate-300 font-semibold">npm run typecheck</span></div>
        </div>
      </section>

      <footer class="mt-12 p-6 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xs">
        <span class="text-xs text-slate-600">${l({ pt: 'Comece pelo capítulo 1:', en: 'Start with chapter 1:' })}</span>
        <a class="px-4 py-2 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-700 transition-colors flex items-center gap-1.5 shadow-sm text-xs" href="${PAGES[0].route}">
          <span>${l(PAGES[0].navLabel)}</span>
          <span class="material-symbols-outlined text-[16px]">arrow_forward</span>
        </a>
      </footer>
    </main>
  </div>
  <script>
    document.getElementById('mobile-menu-btn')?.addEventListener('click', () => {
      document.getElementById('docs-sidebar')?.classList.toggle('-translate-x-full');
    });
    function switchTab(tabId, el) {
      document.querySelectorAll('.code-tab-pane').forEach((p) => p.classList.add('hidden'));
      document.querySelectorAll('[id^="btn-tab-"]').forEach((b) => {
        b.classList.remove('bg-slate-900', 'text-emerald-400', 'font-semibold', 'border-t-2', 'border-emerald-500');
        b.classList.add('text-slate-400');
      });
      document.getElementById(tabId)?.classList.remove('hidden');
      el.classList.remove('text-slate-400');
      el.classList.add('bg-slate-900', 'text-emerald-400', 'font-semibold', 'border-t-2', 'border-emerald-500');
    }
  </script>
  <script type="module" src="/docs/src/lang-switcher.js"></script>
</body>
</html>
`;
}

// ─── Escrita ─────────────────────────────────────────────────────────────────────────
const ids = new Set(PAGES.map((p) => p.id));
for (const name of readdirSync(docsDir)) {
  const dir = join(docsDir, name);
  if (!statSync(dir).isDirectory() || ['api', 'en', 'src', 'pages'].includes(name)) continue;
  if (!ids.has(name)) {
    rmSync(dir, { recursive: true, force: true });
    console.log('removida', `docs/${name}/`);
  }
}

let escritas = 0;
PAGES.forEach((page, i) => {
  const prev = PAGES[i - 1] || null;
  const next = PAGES[i + 1] || null;
  const file = join(docsDir, page.id, 'index.html');
  mkdirSync(dirname(file), { recursive: true });
  const html = pagePage(page, i + 1, prev, next);
  if (!existsSync(file) || readFileSync(file, 'utf8') !== html) {
    writeFileSync(file, html, 'utf8');
    escritas++;
  }
});

const landingFile = join(docsDir, 'index.html');
const landingHtml = landingPage();
if (!existsSync(landingFile) || readFileSync(landingFile, 'utf8') !== landingHtml) {
  writeFileSync(landingFile, landingHtml, 'utf8');
  escritas++;
}

console.log(`páginas de prosa geradas: ${PAGES.length + 1} páginas (${escritas} atualizadas)`);
