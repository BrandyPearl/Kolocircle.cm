// KoloCircle - shared JS
document.addEventListener('DOMContentLoaded', () => {
  // mobile menu toggle
  const menuBtn = document.querySelector('.menu-btn');
  if (menuBtn) {
    menuBtn.addEventListener('click', () => {
      document.querySelector('.nav-links')?.classList.toggle('open');
      document.querySelector('.nav-cta')?.classList.toggle('open');
    });
  }

  // active nav link
  const path = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-links a').forEach(a => {
    if (a.getAttribute('href') === path) a.classList.add('active');
  });

  // FAQ accordion
  document.querySelectorAll('.faq-q').forEach(q => {
    q.addEventListener('click', () => q.parentElement.classList.toggle('open'));
  });

  // Tabs
  document.querySelectorAll('[data-tabs]').forEach(group => {
    const tabs = group.querySelectorAll('.tab');
    const panes = document.querySelectorAll(`[data-pane="${group.dataset.tabs}"] > [data-tab]`);
    tabs.forEach(t => t.addEventListener('click', () => {
      tabs.forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      panes.forEach(p => p.style.display = (p.dataset.tab === t.dataset.tab) ? '' : 'none');
    }));
  });

  // Toggle balance visibility
  document.querySelectorAll('[data-toggle-balance]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-balance]').forEach(el => {
        if (el.dataset.original === undefined) el.dataset.original = el.textContent;
        el.textContent = el.textContent.includes('•') ? el.dataset.original : '•••••••';
      });
    });
  });

  // Year
  document.querySelectorAll('[data-year]').forEach(el => el.textContent = new Date().getFullYear());
});
