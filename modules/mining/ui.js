// modules/mining/ui.js
// Vanilla JS UI skeleton for the mining module
export function initUI(rootEl = document.body, options = {}) {
  const container = document.createElement('div');
  container.className = 'mining-module';
  container.innerHTML = `\n    <section class="mining-module__root">\n      <h2>Mining</h2>\n      <div class="mining-module__content">Module content goes here.</div>\n    </section>\n  `;
  rootEl.appendChild(container);
  return container;
}

export default initUI;
