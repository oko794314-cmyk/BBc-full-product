// modules/marketplace/ui.js
// Vanilla JS UI skeleton for the marketplace module
export function initUI(rootEl = document.body, options = {}) {
  const container = document.createElement('div');
  container.className = 'marketplace-module';
  container.innerHTML = `\n    <section class="marketplace-module__root">\n      <h2>Marketplace</h2>\n      <div class="marketplace-module__content">Module content goes here.</div>\n    </section>\n  `;
  rootEl.appendChild(container);
  return container;
}

export default initUI;
