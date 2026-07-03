// modules/workshop/ui.js
// Vanilla JS UI skeleton for the workshop module
export function initUI(rootEl = document.body, options = {}) {
  const container = document.createElement('div');
  container.className = 'workshop-module';
  container.innerHTML = `
    <section class="workshop-module__root">
      <h2>Майстерня</h2>
      <div class="workshop-module__tabs">
        <button class="workshop-tab active" data-tab="frames">Рамки</button>
        <button class="workshop-tab" data-tab="backgrounds">Фони</button>
        <button class="workshop-tab" data-tab="titles">Титули</button>
        <button class="workshop-tab" data-tab="items">Предмети</button>
        <button class="workshop-tab" data-tab="moderation">Модерація</button>
      </div>
      <div class="workshop-module__content">
        <div id="frames-tab" class="workshop-tab-content active">
          <h3>Створення рамок</h3>
          <div class="workshop-form">Module content goes here.</div>
        </div>
        <div id="backgrounds-tab" class="workshop-tab-content">
          <h3>Створення фонів</h3>
          <div class="workshop-form">Module content goes here.</div>
        </div>
        <div id="titles-tab" class="workshop-tab-content">
          <h3>Створення титулів</h3>
          <div class="workshop-form">Module content goes here.</div>
        </div>
        <div id="items-tab" class="workshop-tab-content">
          <h3>Створення предметів</h3>
          <div class="workshop-form">Module content goes here.</div>
        </div>
        <div id="moderation-tab" class="workshop-tab-content">
          <h3>Модерація</h3>
          <div class="workshop-form">Module content goes here.</div>
        </div>
      </div>
    </section>
  `;
  rootEl.appendChild(container);
  
  // Tab switching
  const tabs = container.querySelectorAll('.workshop-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', (e) => {
      const tabName = e.target.dataset.tab;
      container.querySelectorAll('.workshop-tab').forEach(t => t.classList.remove('active'));
      container.querySelectorAll('.workshop-tab-content').forEach(c => c.classList.remove('active'));
      e.target.classList.add('active');
      document.getElementById(tabName + '-tab').classList.add('active');
    });
  });
  
  return container;
}

export default initUI;