// modules/news/ui.js
// Vanilla JS UI skeleton for the news module
export function initUI(rootEl = document.body, options = {}) {
  const container = document.createElement('div');
  container.className = 'news-module';
  container.innerHTML = `\n    <section class="news-module__root">\n      <h2>News</h2>\n      <div class="news-module__content">Module content goes here.</div>\n    </section>\n  `;
  rootEl.appendChild(container);
  return container;
}

export default initUI;
