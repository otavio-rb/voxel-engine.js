/**
 * Casca HTML compartilhada por TODAS as páginas geradas de docs/ — a referência de API
 * (`gen-api-pages.mjs`) e as páginas de prosa (`gen-docs-pages.mjs`). Único lugar onde
 * header, sidebar e o bloco de tema Tailwind são definidos; mudar a navegação do site
 * significa editar aqui, não em N arquivos.
 *
 * Bilíngue sem arquivo duplicado: todo texto de chrome (labels da sidebar, breadcrumbs)
 * é emitido duas vezes, envolvido em `[data-lang="pt"]` / `[data-lang="en"]`, e
 * `docs/src/lang-switcher.js` alterna a visibilidade via `hidden` conforme o idioma
 * resolvido (`?lang=`, prefixo `/docs/en/` legado, ou preferência salva).
 */

export const TAILWIND_CONFIG = `
    tailwind.config = {
      darkMode: "class",
      theme: {
        extend: {
          colors: {
            "on-surface-variant": "#475569",
            "outline-variant": "#e2e8f0",
            "on-surface": "#0f172a",
            "tertiary": "#7c3aed",
            "surface-variant": "#f8fafc",
            "primary": "#059669",
            "surface": "#ffffff"
          },
          fontFamily: {
            "display": ["Plus Jakarta Sans", "Inter", "sans-serif"],
            "body-md": ["Inter", "sans-serif"],
            "code-inline": ["JetBrains Mono", "monospace"],
            "label-sm": ["JetBrains Mono", "monospace"],
            "badge-voxel": ["JetBrains Mono", "monospace"]
          }
        }
      }
    };`;

/**
 * O site inteiro era light-mode com classes Tailwind escritas direto nos templates
 * (centenas de ocorrências espalhadas por 5 arquivos). Reescrever cada uma à mão seria
 * enorme e arriscado — em vez disso, um único bloco de overrides (`!important`, mais
 * específico que as utilities do Tailwind CDN independente da ordem de injeção) troca
 * a paleta clara pela escura em todo lugar que a usa, inclusive dentro de blocos de
 * código já escuros (onde os mesmos tons de cinza seguem legíveis). Os poucos lugares
 * onde isso não bastava (badges claro/escuro emparelhados, o toggle PT/EN) foram
 * ajustados direto na origem — ver `topbar()` e `docs/src/lang-switcher.js`.
 */
const DARK_OVERRIDES = `
    html, body { background-color: #0b0f17; }
    .bg-white, .bg-white\\/85, .bg-white\\/95 { background-color: #0b0f17 !important; }
    .bg-slate-50 { background-color: #121826 !important; }
    .bg-slate-100, .hover\\:bg-slate-50:hover, .hover\\:bg-slate-100:hover, .hover\\:bg-white:hover { background-color: #1a2232 !important; }
    .bg-slate-200 { background-color: #263044 !important; }
    .border-slate-200 { border-color: #232c3d !important; }
    .border-slate-300, .hover\\:border-slate-300:hover { border-color: #2e3a4e !important; }
    .divide-slate-100 > :not([hidden]) ~ :not([hidden]) { border-color: #232c3d !important; }
    .text-slate-900, .hover\\:text-slate-900:hover { color: #f1f5f9 !important; }
    .text-slate-800, .hover\\:text-slate-800:hover { color: #dce3ec !important; }
    .text-slate-700 { color: #c3ccd9 !important; }
    .text-slate-600 { color: #a3aec0 !important; }
    .bg-emerald-50 { background-color: rgba(16, 185, 129, 0.14) !important; }
    .border-emerald-200 { border-color: rgba(16, 185, 129, 0.35) !important; }
    .text-emerald-700, .hover\\:text-emerald-700:hover { color: #34d399 !important; }
    .text-emerald-800, .hover\\:text-emerald-800:hover { color: #6ee7b7 !important; }
    .text-emerald-900 { color: #6ee7b7 !important; }
    .bg-sky-50 { background-color: rgba(56, 189, 248, 0.14) !important; }
    .border-sky-200 { border-color: rgba(56, 189, 248, 0.4) !important; }
    .text-sky-800, .text-sky-900 { color: #7dd3fc !important; }
    .bg-amber-50 { background-color: rgba(245, 158, 11, 0.14) !important; }
    .text-amber-900 { color: #fcd34d !important; }

    html { scrollbar-width: thin; scrollbar-color: #2e3a4e #0b0f17; }
    *::-webkit-scrollbar { width: 10px; height: 10px; }
    *::-webkit-scrollbar-track { background: transparent; }
    *::-webkit-scrollbar-thumb { background-color: #2e3a4e; border-radius: 6px; border: 2px solid #0b0f17; }
    *::-webkit-scrollbar-thumb:hover { background-color: #3c4a61; }
    *::-webkit-scrollbar-corner { background: #0b0f17; }
  `;

/** \`l({pt,en})\` -> as duas variantes lado a lado, uma delas escondida pelo lang-switcher. */
export const l = (loc, cls = '') =>
  `<span data-lang="pt" class="${cls}">${loc.pt}</span><span data-lang="en" class="${cls}" hidden>${loc.en}</span>`;

export const head = (titlePt, titleEn, descPt, descEn) => `<!DOCTYPE html>
<html class="light" lang="pt-BR" data-bilingual="true">
<head>
  <meta charset="utf-8"/>
  <meta content="width=device-width, initial-scale=1.0" name="viewport"/>
  <title data-lang="pt">${titlePt}</title>
  <title data-lang="en" hidden>${titleEn}</title>
  <meta name="description" data-lang="pt" content="${descPt}"/>
  <meta name="description" data-lang="en" content="${descEn}" hidden/>
  <link rel="icon" type="image/svg+xml" href="/docs/src/favicon.svg"/>
  <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" rel="stylesheet"/>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Plus+Jakarta+Sans:wght@500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet"/>
  <script src="https://cdn.tailwindcss.com"></script>
  <script id="tailwind-config">${TAILWIND_CONFIG}
  </script>
  <style>
    @layer base { html, body { margin: 0; padding: 0; } }
  </style>
  <style>${DARK_OVERRIDES}</style>
</head>`;

/**
 * Itens fixos do header — os mesmos em toda página do site, nos moldes do three.js
 * (Manual vs Docs como as duas seções de topo, não uma lista de subsistemas). `active`
 * é 'manual' ou 'docs'.
 */
const HEADER_LINKS = [
  { id: 'manual', href: '/docs/', label: { pt: 'Manual', en: 'Manual' } },
  { id: 'docs', href: '/docs/api/', label: { pt: 'Docs', en: 'Docs' } }
];

export const topbar = (active, searchInput = '') => `
  <header class="fixed top-0 left-0 right-0 h-16 bg-white/85 backdrop-blur-xl border-b border-slate-200/80 z-50 flex items-center justify-between px-6 shadow-sm">
    <div class="flex items-center gap-4">
      <button id="mobile-menu-btn" class="md:hidden text-slate-800 p-1 hover:bg-slate-100 rounded" aria-label="Abrir Menu">
        <span class="material-symbols-outlined text-[22px]">menu</span>
      </button>
      <a href="/docs/" class="flex items-center gap-3">
        <img src="/docs/src/logo-animated.svg" alt="@voxel/engine" class="w-8 h-8 rounded-lg"/>
        <span class="font-code-inline font-bold tracking-tight text-slate-900 text-base">@voxel/engine</span>
        <span class="font-badge-voxel text-[10px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded border border-emerald-200">v0.9.4-beta</span>
      </a>
    </div>
    ${searchInput}
    <div class="flex items-center gap-4">
      <nav class="hidden lg:flex items-center gap-4 text-xs font-medium">
        ${HEADER_LINKS.map(
          (item) =>
            `<a class="${item.id === active ? 'text-emerald-700 font-semibold' : 'text-slate-600 hover:text-slate-900 transition-colors'}" href="${item.href}">${l(item.label)}</a>`
        ).join('\n        ')}
        <a class="text-slate-600 hover:text-emerald-700 transition-colors flex items-center gap-1" href="https://voxel-engine-js.vercel.app" target="_blank" rel="noreferrer">
          ${l({ pt: 'Demo Online', en: 'Live Demo' })}<span class="material-symbols-outlined text-[14px]">open_in_new</span>
        </a>
      </nav>
      <div class="h-4 w-px bg-slate-200 hidden lg:block"></div>
      <div class="flex items-center gap-2">
        <div class="flex items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs font-mono" id="docs-lang-toggle" title="Alterar idioma / Switch language">
          <button type="button" data-lang="pt" class="px-2 py-0.5 rounded font-semibold transition-all bg-slate-700 text-emerald-400 shadow-xs">PT</button>
          <button type="button" data-lang="en" class="px-2 py-0.5 rounded font-semibold transition-all text-slate-500 hover:text-slate-200">EN</button>
        </div>
        <a class="flex items-center gap-1.5 px-2.5 py-1 bg-slate-50 rounded-lg border border-slate-200 font-code-inline text-xs text-slate-700 hover:bg-slate-100 transition-colors" href="https://github.com/voxel/engine" target="_blank" rel="noreferrer">
          <span class="material-symbols-outlined text-[16px]">code</span><span>GitHub</span>
        </a>
      </div>
    </div>
  </header>`;

/**
 * Sidebar do Manual: uma lista única e numerada (capítulo 1..N), na ordem de
 * `docs/pages/registry.ts` — a sequência narrativa é a ordem do array, não dois
 * grupos soltos. Isto é a tabela de capítulos; a navegação da API (por módulo,
 * agrupada por categoria) é outra coisa e vive em `apiSidebar` abaixo, só nas
 * páginas de `/docs/api/`.
 */
export const sidebar = (pages, active) => {
  const item = (p, i) => `
        <a class="flex items-start gap-2.5 px-3 py-1.5 rounded-lg text-xs transition-colors ${
          p.id === active
            ? 'bg-emerald-50 text-emerald-800 font-semibold border-l-2 border-emerald-600 shadow-xs'
            : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
        }" href="${p.route}">
          <span class="font-mono text-[10px] text-slate-400 mt-0.5 w-4 shrink-0 text-right">${i + 1}</span><span>${l(p.navLabel)}</span>
        </a>`;

  return `
  <aside id="docs-sidebar" class="fixed left-0 top-16 bottom-0 w-72 bg-white/95 backdrop-blur-md z-40 overflow-y-auto px-4 py-6 flex flex-col gap-6 border-r border-slate-200 shadow-sm transition-transform -translate-x-full md:translate-x-0">
    <div class="flex flex-col gap-1.5">
      <span class="font-label-sm text-[11px] uppercase tracking-wider text-slate-400 font-semibold px-2">${l({ pt: 'MANUAL', en: 'MANUAL' })}</span>
      <nav class="flex flex-col gap-0.5">
        <a class="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-colors ${
          active === 'intro' ? 'bg-emerald-50 text-emerald-800 font-semibold border-l-2 border-emerald-600 shadow-xs' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
        }" href="/docs/">
          <span class="material-symbols-outlined text-[16px] text-emerald-600">deployed_code</span>${l({ pt: 'Introdução', en: 'Introduction' })}
        </a>${pages.map(item).join('')}
      </nav>
    </div>
  </aside>`;
};

/**
 * Sidebar da referência de API: um link de volta ao Manual + o ponto de montagem
 * (`#api-nav`) que `index-page.ts`/`module.ts` preenchem com os módulos agrupados
 * por categoria — a "Docs" do three.js, separada do Manual.
 */
export const apiSidebar = (extra = '') => `
  <aside id="docs-sidebar" class="fixed left-0 top-16 bottom-0 w-72 bg-white/95 backdrop-blur-md z-40 overflow-y-auto px-3 py-5 flex flex-col gap-4 border-r border-slate-200 transition-transform -translate-x-full md:translate-x-0">
    <nav class="flex flex-col gap-0.5 px-1">
      <a class="flex items-center gap-2 px-3 py-1.5 rounded-lg text-slate-600 hover:bg-slate-50 hover:text-slate-900 text-xs transition-colors" href="/docs/">
        <span class="material-symbols-outlined text-[16px] text-emerald-600">arrow_back</span>${l({ pt: 'Voltar ao Manual', en: 'Back to Manual' })}
      </a>
    </nav>
    <div id="api-nav" class="px-1"></div>
    ${extra}
  </aside>`;

export const breadcrumb = (trailPt, trailEn) => {
  const render = (trail, lang, hidden) => `
      <section data-lang="${lang}" ${hidden ? 'hidden' : ''} class="flex items-center gap-2 text-slate-500 text-xs mb-4">
        <a class="hover:text-emerald-700 transition-colors flex items-center gap-1" href="/docs/">
          <span class="material-symbols-outlined text-[14px]">home</span><span>Manual</span>
        </a>${trail
          .map(
            (step, i) =>
              `\n        <span class="text-slate-300">/</span>\n        ${
                step.href && i < trail.length - 1
                  ? `<a class="hover:text-emerald-700 transition-colors" href="${step.href}">${step.label}</a>`
                  : `<span class="${i === trail.length - 1 ? 'text-emerald-700 font-semibold' : ''}">${step.label}</span>`
              }`
          )
          .join('')}
      </section>`;
  return render(trailPt, 'pt', false) + render(trailEn, 'en', true);
};

export const footerPager = (prev, next) => `
      <footer class="mt-12 p-6 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between shadow-xs gap-4">
        ${
          prev
            ? `<a class="text-xs text-slate-600 hover:text-slate-900 flex items-center gap-1 font-mono" href="${prev.route}">
          <span class="material-symbols-outlined text-[16px]">arrow_back</span>
          <span>${l(prev.navLabel)}</span>
        </a>`
            : '<span></span>'
        }
        ${
          next
            ? `<a class="px-4 py-2 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-700 transition-colors flex items-center gap-1.5 text-xs shadow-sm ml-auto" href="${next.route}">
          <span>${l(next.navLabel)}</span>
          <span class="material-symbols-outlined text-[16px]">arrow_forward</span>
        </a>`
            : ''
        }
      </footer>`;

export const mobileMenuScript = `
  <script>
    document.getElementById('mobile-menu-btn')?.addEventListener('click', () => {
      document.getElementById('docs-sidebar')?.classList.toggle('-translate-x-full');
    });
  </script>`;
