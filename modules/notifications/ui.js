// modules/notifications/ui.js
// Vanilla JS UI skeleton for the notifications module
export function initUI(rootEl = document.body, options = {}) {
  const container = document.createElement('div');
  container.className = 'notifications-module';
  container.innerHTML = `\n    <section class="notifications-module__root">\n      <h2>Notifications</h2>\n      <div class="notifications-module__content">Module content goes here.</div>\n    </section>\n  `;
  rootEl.appendChild(container);
  return container;
}

export default initUI;
