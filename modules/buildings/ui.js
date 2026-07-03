// modules/buildings/ui.js
// Vanilla JS UI skeleton for the buildings module
export function initUI(rootEl = document.body, options = {}) {
  const container = document.createElement('div');
  container.className = 'buildings-module';
  container.innerHTML = `\n    <section class="buildings-module__root">\n      <h2>Buildings</h2>\n      <div class="buildings-module__content">Module content goes here.</div>\n    </section>\n  `;
  rootEl.appendChild(container);
  return container;
}

export default initUI;
