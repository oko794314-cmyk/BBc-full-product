// modules/profile/ui.js
// Vanilla JS UI skeleton for the profile module
export function initUI(rootEl = document.body, options = {}) {
  const container = document.createElement('div');
  container.className = 'profile-module';
  container.innerHTML = `\n    <section class="profile-module__root">\n      <h2>Profile</h2>\n      <div class="profile-module__content">Module content goes here.</div>\n    </section>\n  `;
  rootEl.appendChild(container);
  return container;
}

export default initUI;
