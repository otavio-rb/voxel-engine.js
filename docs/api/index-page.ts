/** Índice da referência: lista todos os módulos, agrupados, com busca. */
import { GROUPS, MODULE_COUNT } from './registry';
import { isEn, GROUP_TRANSLATIONS_EN, MODULE_TRANSLATIONS_EN, UI_I18N } from './i18n';
import './playground.css';

function render(): void {
  const en = isEn();
  const root = document.getElementById('api-index');
  if (!root) return;

  // Cabeçalho, breadcrumb e badges já saem bilíngues da casca estática
  // (scripts/gen-api-pages.mjs, via `l()`/[data-lang]) — nada para corrigir aqui.

  root.innerHTML = GROUPS.map(
    (group) => {
      const gTitle = en ? (GROUP_TRANSLATIONS_EN[group.id]?.title ?? group.title) : group.title;
      const gBlurb = en ? (GROUP_TRANSLATIONS_EN[group.id]?.blurb ?? group.blurb) : group.blurb;

      return `
    <section class="index-group" data-group="${group.id}">
      <header class="api-group-head">
        <span class="material-symbols-outlined">${group.icon}</span>
        <div>
          <h2>${gTitle}</h2>
          <p>${gBlurb}</p>
        </div>
        <span class="api-group-count">${group.modules.length}</span>
      </header>
      <div class="index-grid">
        ${group.modules
          .map(
            (m) => {
              const summaryPlain = en ? (MODULE_TRANSLATIONS_EN[m.id]?.summaryPlain ?? m.summaryPlain) : m.summaryPlain;
              const exampleTitle = en ? (MODULE_TRANSLATIONS_EN[m.id]?.exampleTitle ?? m.example.title) : m.example.title;
              const link = `/docs/api/${m.id}/${en ? '?lang=en' : ''}`;

              return `
          <a class="index-card" href="${link}" data-search="${`${m.name} ${m.file} ${summaryPlain}`.toLowerCase()}">
            <div class="index-card-head">
              <span class="index-card-name">${m.name}</span>
              <span class="index-card-demo">${exampleTitle}</span>
            </div>
            <p class="index-card-summary">${summaryPlain}</p>
            <span class="index-card-file">${m.file}</span>
          </a>`;
            }
          )
          .join('')}
      </div>
    </section>`;
    }
  ).join('');

  for (const el of document.querySelectorAll<HTMLElement>('[data-count-modules]')) {
    el.textContent = String(MODULE_COUNT);
  }

  const nav = document.getElementById('api-nav');
  if (nav) {
    nav.innerHTML = GROUPS.map(
      (group) => {
        const gTitle = en ? (GROUP_TRANSLATIONS_EN[group.id]?.title ?? group.title) : group.title;
        return `
      <div class="nav-group">
        <span class="nav-group-title">${gTitle}</span>
        ${group.modules.map((m) => `<a class="nav-link" href="/docs/api/${m.id}/${en ? '?lang=en' : ''}">${m.name}</a>`).join('')}
      </div>`;
      }
    ).join('');
  }

  const search = document.getElementById('api-search') as HTMLInputElement | null;
  if (search) {
    search.placeholder = en ? UI_I18N.en.searchPlaceholder : UI_I18N.pt.searchPlaceholder;
  }
  search?.addEventListener('input', () => {
    const q = search.value.trim().toLowerCase();
    for (const card of document.querySelectorAll<HTMLElement>('.index-card')) {
      card.classList.toggle('filtered', Boolean(q) && !card.dataset.search!.includes(q));
    }
    for (const group of document.querySelectorAll<HTMLElement>('.index-group')) {
      group.classList.toggle('filtered', group.querySelectorAll('.index-card:not(.filtered)').length === 0);
    }
    for (const link of document.querySelectorAll<HTMLElement>('.nav-link')) {
      link.classList.toggle('filtered', Boolean(q) && !link.textContent!.toLowerCase().includes(q));
    }
  });

  document.getElementById('mobile-menu-btn')?.addEventListener('click', () => {
    document.getElementById('docs-sidebar')?.classList.toggle('-translate-x-full');
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render);
else render();
