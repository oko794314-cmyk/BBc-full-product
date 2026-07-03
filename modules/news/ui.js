// modules/news/ui.js
// Unified UI for News, Rankings, and Statistics in one tab
export function initUI(rootEl = document.body, options = {}) {
  const container = document.createElement('div');
  container.className = 'news-module';
  container.innerHTML = `
    <section class="news-module__root">
      <div class="news-header">
        <h2>📰 Новини</h2>
      </div>

      <!-- News Feed Section -->
      <div class="news-section">
        <div class="section-title">📰 Новини</div>
        <div class="news-feed" id="news-feed">
          <div class="loading">Завантаження новин...</div>
        </div>
      </div>

      <!-- Course Chart Section -->
      <div class="news-section">
        <div class="section-title">📈 Графік курсу</div>
        <div class="chart-container" id="course-chart">
          <canvas id="course-canvas"></canvas>
        </div>
      </div>

      <!-- Current Course & Online Stats -->
      <div class="stats-row">
        <div class="stat-card">
          <div class="stat-icon">💰</div>
          <div class="stat-content">
            <div class="stat-label">Поточний курс</div>
            <div class="stat-value" id="current-course">--</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon">👥</div>
          <div class="stat-content">
            <div class="stat-label">Онлайн</div>
            <div class="stat-value" id="online-count">--</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon">👤</div>
          <div class="stat-content">
            <div class="stat-label">Користувачів</div>
            <div class="stat-value" id="users-count">--</div>
          </div>
        </div>
      </div>

      <!-- Top Rankings Section -->
      <div class="rankings-section">
        <div class="section-title">🏆 Найбагатші</div>
        <div class="rankings-list" id="richest-list">
          <div class="loading">Завантаження рейтингу...</div>
        </div>
      </div>

      <!-- Top Traders Section -->
      <div class="rankings-section">
        <div class="section-title">📊 Топ трейдерів</div>
        <div class="rankings-list" id="top-traders-list">
          <div class="loading">Завантаження даних...</div>
        </div>
      </div>

      <!-- Recent Transfers Section -->
      <div class="news-section">
        <div class="section-title">💸 Останні перекази</div>
        <div class="transfers-feed" id="transfers-feed">
          <div class="loading">Завантаження перекладів...</div>
        </div>
      </div>

      <!-- Biggest Deals Section -->
      <div class="news-section">
        <div class="section-title">🔥 Найбільші угоди</div>
        <div class="deals-feed" id="biggest-deals">
          <div class="loading">Завантаження угод...</div>
        </div>
      </div>

      <!-- Achievements Section -->
      <div class="news-section">
        <div class="section-title">🏅 Досягнення</div>
        <div class="achievements-list" id="achievements-list">
          <div class="loading">Завантаження досягнень...</div>
        </div>
      </div>

      <!-- Tournaments Section -->
      <div class="news-section">
        <div class="section-title">🏆 Турніри</div>
        <div class="tournaments-list" id="tournaments-list">
          <div class="loading">Завантаження турнірів...</div>
        </div>
      </div>

      <!-- Daily Bonus Section -->
      <div class="news-section">
        <div class="section-title">🎁 Щоденний бонус</div>
        <div class="bonus-container" id="daily-bonus">
          <button class="bonus-button">Отримати бонус</button>
          <div class="bonus-info">Залишилось часу до наступного бонусу: <span id="bonus-timer">--</span></div>
        </div>
      </div>

      <!-- Economy Statistics Section -->
      <div class="news-section">
        <div class="section-title">📊 Статистика економіки</div>
        <div class="economy-stats" id="economy-stats">
          <div class="loading">Завантаження статистики...</div>
        </div>
      </div>
    </section>
  `;
  rootEl.appendChild(container);
  return container;
}

export default initUI;
