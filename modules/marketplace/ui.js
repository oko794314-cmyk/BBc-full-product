// modules/marketplace/ui.js
// Vanilla JS UI skeleton for the marketplace module
export function initUI(rootEl = document.body, options = {}) {
  const container = document.createElement('div');
  container.className = 'marketplace-module';
  container.innerHTML = `
    <section class="marketplace-module__root">
      <h2>Маркетплейс</h2>
      <div class="marketplace-module__sidebar">
        <div class="marketplace-search">
          <input type="text" placeholder="Пошук предметів..." class="marketplace-search-input" />
        </div>
        <div class="marketplace-filters">
          <h3>Категорії</h3>
          <div class="marketplace-categories">
            <!-- Categories will be loaded here -->
          </div>
          <h3>Сортування</h3>
          <select class="marketplace-sort">
            <option value="popular">Популярні</option>
            <option value="price-low">Ціна: низька</option>
            <option value="price-high">Ціна: висока</option>
            <option value="new">Нові</option>
          </select>
          <h3>Рідкість</h3>
          <div class="marketplace-rarity">
            <label class="rarity-item"><input type="checkbox" data-rarity="common" /> Common</label>
            <label class="rarity-item"><input type="checkbox" data-rarity="rare" /> Rare</label>
            <label class="rarity-item"><input type="checkbox" data-rarity="epic" /> Epic</label>
            <label class="rarity-item"><input type="checkbox" data-rarity="legendary" /> Legendary</label>
            <label class="rarity-item"><input type="checkbox" data-rarity="mythic" /> Mythic</label>
          </div>
        </div>
      </div>
      <div class="marketplace-module__content">
        <div class="marketplace-items">
          <!-- Items will be loaded here -->
          Module content goes here.
        </div>
      </div>
    </section>
  `;
  rootEl.appendChild(container);
  
  // Search handler
  const searchInput = container.querySelector('.marketplace-search-input');
  searchInput.addEventListener('input', (e) => {
    console.log('Searching for:', e.target.value);
    // TODO: Implement search
  });
  
  // Sort handler
  const sortSelect = container.querySelector('.marketplace-sort');
  sortSelect.addEventListener('change', (e) => {
    console.log('Sorting by:', e.target.value);
    // TODO: Implement sorting
  });
  
  // Rarity filter handler
  const rarityCheckboxes = container.querySelectorAll('input[data-rarity]');
  rarityCheckboxes.forEach(checkbox => {
    checkbox.addEventListener('change', (e) => {
      const selected = Array.from(rarityCheckboxes)
        .filter(c => c.checked)
        .map(c => c.dataset.rarity);
      console.log('Filtering by rarity:', selected);
      // TODO: Implement rarity filter
    });
  });
  
  return container;
}

export default initUI;