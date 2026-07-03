// modules/rankings/ui.js
// Vanilla JS UI skeleton for the rankings module
export function initUI(rootEl = document.body, options = {}) {
  const container = document.createElement('div');
  container.className = 'rankings-module';
  container.innerHTML = `\n    <section class="rankings-module__root">\n      <h2>Rankings</h2>\n      <div class="rankings-module__content">Module content goes here.</div>\n    </section>\n  `;
  rootEl.appendChild(container);
  return container;
}

export default initUI;
