/**
 * Language switcher for @voxel/engine documentation.
 *
 * Every generated docs page (API reference and, since the formal-docs restructure,
 * every prose page too) is bilingual in a single file: PT and EN markup both ship,
 * wrapped in `[data-lang="pt"]` / `[data-lang="en"]`, and this script toggles which
 * one is visible based on `?lang=`. There is no more `/docs/en/<page>/` mirror file
 * to redirect to — the only legacy case handled below is an old bookmark pointing at
 * one of those now-removed paths.
 */
(function() {
  const STORAGE_KEY = 'voxel_docs_lang';

  function getCurrentLang() {
    const urlParams = new URLSearchParams(window.location.search);
    const langParam = urlParams.get('lang');
    if (langParam === 'en' || langParam === 'pt') {
      return langParam;
    }
    if (window.location.pathname.includes('/docs/en/')) {
      return 'en';
    }
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'en' || stored === 'pt') {
      return stored;
    }
    return 'pt';
  }

  function getTargetUrl(targetLang) {
    const url = new URL(window.location.href);
    if (targetLang === 'en') {
      url.searchParams.set('lang', 'en');
    } else {
      url.searchParams.delete('lang');
    }
    return url.pathname + url.search + url.hash;
  }

  /** Mostra só os nós `[data-lang]` do idioma atual (chrome e conteúdo das páginas geradas). */
  function applyLangVisibility(lang) {
    document.querySelectorAll('[data-lang]').forEach((el) => {
      if (el.closest('#docs-lang-toggle')) return; // botões PT/EN do próprio toggle, não conteúdo
      el.hidden = el.getAttribute('data-lang') !== lang;
    });
  }

  /** Propaga `?lang=en` para links internos de /docs em qualquer página bilíngue. */
  function fixLinksForCurrentLang(lang) {
    document.querySelectorAll('a[href]').forEach((a) => {
      const href = a.getAttribute('href');
      if (!href || href.startsWith('http://') || href.startsWith('https://')) return;

      try {
        const url = new URL(href, window.location.origin);
        if (!url.pathname.includes('/docs')) return;

        if (lang === 'en') {
          url.searchParams.set('lang', 'en');
        } else {
          url.searchParams.delete('lang');
        }
        a.setAttribute('href', url.pathname + url.search + url.hash);
      } catch {
        /* href relativo não resolvível (ex.: '#ancora') — ignora */
      }
    });
  }

  function setupToggleUI() {
    const currentLang = getCurrentLang();
    const toggle = document.getElementById('docs-lang-toggle');

    applyLangVisibility(currentLang);

    if (toggle) {
      const ptBtn = toggle.querySelector('[data-lang="pt"]');
      const enBtn = toggle.querySelector('[data-lang="en"]');

      if (currentLang === 'en') {
        ptBtn?.classList.remove('bg-slate-700', 'text-emerald-400', 'shadow-xs');
        ptBtn?.classList.add('text-slate-500', 'hover:text-slate-200');
        enBtn?.classList.add('bg-slate-700', 'text-emerald-400', 'shadow-xs');
        enBtn?.classList.remove('text-slate-500', 'hover:text-slate-200');
        document.documentElement.lang = 'en';
      } else {
        enBtn?.classList.remove('bg-slate-700', 'text-emerald-400', 'shadow-xs');
        enBtn?.classList.add('text-slate-500', 'hover:text-slate-200');
        ptBtn?.classList.add('bg-slate-700', 'text-emerald-400', 'shadow-xs');
        ptBtn?.classList.remove('text-slate-500', 'hover:text-slate-200');
        document.documentElement.lang = 'pt-BR';
      }

      ptBtn?.addEventListener('click', (e) => {
        e.preventDefault();
        localStorage.setItem(STORAGE_KEY, 'pt');
        const target = getTargetUrl('pt');
        if (target !== window.location.pathname + window.location.search + window.location.hash) {
          window.location.href = target;
        }
      });

      enBtn?.addEventListener('click', (e) => {
        e.preventDefault();
        localStorage.setItem(STORAGE_KEY, 'en');
        const target = getTargetUrl('en');
        if (target !== window.location.pathname + window.location.search + window.location.hash) {
          window.location.href = target;
        }
      });
    }

    fixLinksForCurrentLang(currentLang);
  }

  // Bookmark antigo para um `/docs/en/<página>/` que não existe mais: redireciona
  // para o equivalente PT com `?lang=en` em vez de deixar 404.
  (function redirectLegacyEnPath() {
    const path = window.location.pathname;
    if (!path.startsWith('/docs/en/') && path !== '/docs/en' && path !== '/docs/en/') return;
    const rest = path === '/docs/en' || path === '/docs/en/' ? '/docs/' : path.replace(/^\/docs\/en\//, '/docs/');
    const params = new URLSearchParams(window.location.search);
    params.set('lang', 'en');
    window.location.replace(rest + '?' + params.toString() + window.location.hash);
  })();

  // Auto-redirect se o usuário já tinha escolhido um idioma antes.
  function checkPreferenceRedirect() {
    const params = new URLSearchParams(window.location.search);
    if (params.has('noredirect')) return;

    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return;

    if (stored === 'en' && params.get('lang') !== 'en') {
      params.set('lang', 'en');
      window.history.replaceState(null, '', window.location.pathname + '?' + params.toString() + window.location.hash);
    } else if (stored === 'pt' && params.get('lang') === 'en') {
      params.delete('lang');
      const query = params.toString() ? '?' + params.toString() : '';
      window.history.replaceState(null, '', window.location.pathname + query + window.location.hash);
    }
  }

  checkPreferenceRedirect();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupToggleUI);
  } else {
    setupToggleUI();
  }
})();
