// modules/news/ui.js
// Vanilla JS UI skeleton for the News tab. This single tab contains news and all statistics sections.
export function initUI(rootEl = document.body, options = {}) {
  const container = document.createElement('div');
  container.className = 'news-module';

  container.innerHTML = `
  <section class="news-module__root">
    <header class="news-header">
      <h1>Новини</h1>
      <div class="news-header__meta">
        <div id="current-rate" class="meta-item">Курс: <strong>—</strong></div>
        <div id="online-count" class="meta-item">Онлайн: <strong>—</strong></div>
        <div id="user-count" class="meta-item">Користувачів: <strong>—</strong></div>
        <button id="news-refresh" class="meta-item">Оновити</button>
      </div>
    </header>

    <div class="news-body">
      <aside class="news-left">
        <section id="news-list" class="panel news-list">
          <h2>📰 Останні новини</h2>
          <ul class="news-items"> <!-- populated dynamically --> </ul>
        </section>

        <section id="daily-bonus" class="panel daily-bonus">
          <h3>🎁 Щоденний бонус</h3>
          <div class="daily-bonus__content">Лічильник / статус бонусу</div>
        </section>

        <section id="achievements" class="panel achievements">
          <h3>🏅 Досягнення</h3>
          <div class="achievements__content">Список досягнень (вкладка «Новини», не окрема)</div>
        </section>

        <section id="tournaments" class="panel tournaments">
          <h3>🏆 Турніри</h3>
          <div class="tournaments__content">Турніри та поточні події</div>
        </section>
      </aside>

      <main class="news-main">
        <section id="rate-chart" class="panel rate-chart">
          <h2>📈 Графік курсу</h2>
          <canvas id="rate-chart-canvas" width="800" height="240"></canvas>
        </section>

        <section id="richest" class="panel richest">
          <h2>🏆 Найбагатші</h2>
          <ul class="richest-list"></ul>
        </section>

        <section id="top-traders" class="panel top-traders">
          <h2>📊 Топ трейдерів</h2>
          <table class="top-traders-table">
            <thead><tr><th>#</th><th>Користувач</th><th>Обсяг</th></tr></thead>
            <tbody></tbody>
          </table>
        </section>

        <section id="recent-transfers" class="panel recent-transfers">
          <h2>💸 Останні перекази</h2>
          <ul class="transfers-list"></ul>
        </section>

        <section id="biggest-deals" class="panel biggest-deals">
          <h2>🔥 Найбільші угоди</h2>
          <ul class="deals-list"></ul>
        </section>

        <section id="economy-stats" class="panel economy-stats">
          <h2>📊 Статистика економіки</h2>
          <div class="economy-content"></div>
        </section>
      </main>

      <aside class="news-right">
        <section id="current-rate-panel" class="panel current-rate-panel">
          <h3>💰 Поточний курс</h3>
          <div class="current-rate__value">—</div>
        </section>

        <section id="online-panel" class="panel online-panel">
          <h3>👥 Онлайн</h3>
          <div class="online__value">—</div>
        </section>

        <section id="user-count-panel" class="panel user-count-panel">
          <h3>👤 Кількість користувачів</h3>
          <div class="users__value">—</div>
        </section>
      </aside>
    </div>

    <footer class="news-footer">
      <small>Усі статистичні розділи знаходяться всередині вкладки «Новини».</small>
    </footer>
  </section>
  `;

  rootEl.appendChild(container);
  return container;
}

export default initUI;
