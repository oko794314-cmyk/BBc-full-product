// modules/exchange/ui.js
// Vanilla JS UI skeleton for the exchange module
export function initUI(rootEl = document.body, options = {}) {
  const container = document.createElement('div');
  container.className = 'exchange-module';
  container.innerHTML = `\n    <section class="exchange-module__root">\n      <h2>Exchange</h2>\n      <div class="exchange-module__content">Module content goes here.</div>\n    </section>\n  `;
  rootEl.appendChild(container);
  return container;
}

export default initUI;
