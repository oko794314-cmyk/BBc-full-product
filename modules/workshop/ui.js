// modules/workshop/ui.js
// Vanilla JS UI skeleton for the workshop module
export function initUI(rootEl = document.body, options = {}) {
  const container = document.createElement('div');
  container.className = 'workshop-module';
  container.innerHTML = `\n    <section class="workshop-module__root">\n      <h2>Workshop</h2>\n      <div class="workshop-module__content">Module content goes here.</div>\n    </section>\n  `;
  rootEl.appendChild(container);
  return container;
}

export default initUI;
