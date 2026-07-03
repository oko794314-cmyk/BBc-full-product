// modules/economy/ui.js
// Vanilla JS UI skeleton for the economy module
export function initUI(rootEl = document.body, options = {}) {
  const container = document.createElement('div');
  container.className = 'economy-module';
  container.innerHTML = `\n    <section class="economy-module__root">\n      <h2>Economy</h2>\n      <div class="economy-module__content">Module content goes here.</div>\n    </section>\n  `;
  rootEl.appendChild(container);
  return container;
}

export default initUI;
