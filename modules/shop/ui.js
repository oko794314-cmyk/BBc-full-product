// modules/shop/ui.js
// Vanilla JS UI skeleton for the shop module
export function initUI(rootEl = document.body, options = {}) {
  const container = document.createElement('div');
  container.className = 'shop-module';
  container.innerHTML = `
    <section class="shop-module__root">
      <h2>Магазин</h2>
      <div class="shop-module__content">
        <div class="shop-products">
          <!-- Products will be loaded here -->
          Module content goes here.
        </div>
        <div class="shop-sidebar">
          <div class="shop-cart">
            <h3>Корзина</h3>
            <div class="shop-cart-items">
              <!-- Cart items will be displayed here -->
            </div>
            <div class="shop-cart-total">
              <p>Всього: <strong>0 золотих</strong></p>
            </div>
            <button class="shop-checkout-btn">Перейти до оплати</button>
          </div>
          <div class="shop-user-balance">
            <h3>Баланс</h3>
            <p class="balance-amount">0 золотих</p>
          </div>
        </div>
      </div>
    </section>
  `;
  rootEl.appendChild(container);
  
  // Add to cart handler
  container.addEventListener('click', (e) => {
    if (e.target.classList.contains('add-to-cart')) {
      const itemId = e.target.dataset.itemId;
      console.log('Adding to cart:', itemId);
      // TODO: Implement add to cart
    }
  });
  
  // Checkout handler
  const checkoutBtn = container.querySelector('.shop-checkout-btn');
  checkoutBtn.addEventListener('click', () => {
    console.log('Proceeding to checkout');
    // TODO: Implement checkout
  });
  
  return container;
}

export default initUI;