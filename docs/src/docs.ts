import './docs.css';

document.addEventListener('DOMContentLoaded', () => {
  // 1. Mobile Sidebar Toggle
  const toggleBtn = document.getElementById('mobile-menu-btn');
  const sidebar = document.getElementById('docs-sidebar');

  toggleBtn?.addEventListener('click', () => {
    sidebar?.classList.toggle('open');
  });

  // 2. Highlight current page in sidebar
  const currentPath = window.location.pathname.replace(/\/index\.html$/, '/');
  const links = document.querySelectorAll<HTMLAnchorElement>('.sidebar-nav-link');

  links.forEach(link => {
    const linkPath = new URL(link.href, window.location.origin).pathname.replace(/\/index\.html$/, '/');
    if (linkPath === currentPath) {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  });

  // 3. Copy Code Buttons
  const copyButtons = document.querySelectorAll<HTMLButtonElement>('.copy-btn');
  copyButtons.forEach(btn => {
    btn.addEventListener('click', async () => {
      const codeBlock = btn.closest('.code-block');
      const codeElement = codeBlock?.querySelector('pre code');
      if (!codeElement) return;

      try {
        await navigator.clipboard.writeText(codeElement.textContent || '');
        const originalText = btn.textContent;
        btn.textContent = 'Copiado!';
        setTimeout(() => {
          btn.textContent = originalText;
        }, 2000);
      } catch (err) {
        console.error('Falha ao copiar código:', err);
      }
    });
  });
});
