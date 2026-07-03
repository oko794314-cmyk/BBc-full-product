// modules/casino/ui.js
// Vanilla JS UI skeleton for the casino module
export function initUI(rootEl = document.body, options = {}) {
  const container = document.createElement('div');
  container.className = 'casino-module';
  container.innerHTML = `\n    <section class="casino-module__root">\n      <h2>Casino</h2>\n      <div class="casino-module__content">Module content goes here.</div>\n    </section>\n  `;
  rootEl.appendChild(container);
  return container;
}

export default initUI;
