// modules/news/logic.js
// Logic for the consolidated News tab. This file populates the UI areas with data.
import {
  getTopTraders,
  getRichest,
  getRecentTransfers,
  getBiggestDeals,
  getEconomyStats,
  getCurrentRate,
  getOnlineCount,
  getUserCount,
  getNewsItems
} from '../rankings/logic.js';

export function initLogic({ rootEl, options } = {}) {
  if (!rootEl) return;

  const qs = sel => rootEl.querySelector(sel);

  const newsList = qs('.news-items');
  const rateCanvas = qs('#rate-chart-canvas');
  const currentRateEl = qs('#current-rate strong');
  const currentRatePanel = qs('.current-rate__value');
  const onlineCountEl = qs('#online-count strong');
  const onlinePanel = qs('.online__value');
  const usersCountEl = qs('#user-count strong');
  const usersPanel = qs('.users__value');
  const richestList = qs('.richest-list');
  const topTradersTbody = qs('.top-traders-table tbody');
  const transfersList = qs('.transfers-list');
  const dealsList = qs('.deals-list');
  const economyContent = qs('.economy-content');
  const refreshBtn = qs('#news-refresh');

  async function refreshAll() {
    // Fetch data from rankings helpers (mocked / to be wired with real API)
    const [newsItems, rate, online, users, richest, topTraders, transfers, deals, economy] = await Promise.all([
      getNewsItems(),
      getCurrentRate(),
      getOnlineCount(),
      getUserCount(),
      getRichest(),
      getTopTraders(),
      getRecentTransfers(),
      getBiggestDeals(),
      getEconomyStats()
    ]);

    // Populate news
    newsList.innerHTML = newsItems.map(n => `<li class="news-item"><strong>${escapeHtml(n.title)}</strong><div class="meta">${escapeHtml(n.time)}</div><p>${escapeHtml(n.text)}</p></li>`).join('');

    // Update rate and panels
    currentRateEl.textContent = rate.value + ' ' + (rate.currency || 'BBC');
    currentRatePanel.textContent = rate.value + ' ' + (rate.currency || 'BBC');

    onlineCountEl.textContent = String(online);
    onlinePanel.textContent = String(online);

    usersCountEl.textContent = String(users);
    usersPanel.textContent = String(users);

    // richest
    richestList.innerHTML = richest.map(r => `<li>${escapeHtml(r.name)} — ${r.amount}</li>`).join('');

    // top traders
    topTradersTbody.innerHTML = topTraders.map((t, i) => `<tr><td>${i+1}</td><td>${escapeHtml(t.name)}</td><td>${t.volume}</td></tr>`).join('');

    // transfers
    transfersList.innerHTML = transfers.map(t => `<li>${escapeHtml(t.from)} → ${escapeHtml(t.to)} : ${t.amount}</li>`).join('');

    // biggest deals
    dealsList.innerHTML = deals.map(d => `<li>${escapeHtml(d.user)} — ${d.amount} (${d.time})</li>`).join('');

    // economy
    economyContent.innerHTML = Object.keys(economy).map(k => `<div class="economy-row"><strong>${escapeHtml(k)}:</strong> ${escapeHtml(String(economy[k]))}</div>`).join('');

    // render chart with simple canvas drawing
    renderChart(rate.history || []);
  }

  function renderChart(points) {
    if (!rateCanvas) return;
    const ctx = rateCanvas.getContext('2d');
    const w = rateCanvas.width;
    const h = rateCanvas.height;
    ctx.clearRect(0,0,w,h);
    if (!points || points.length === 0) {
      ctx.fillStyle = '#999';
      ctx.fillText('No chart data', 10, 20);
      return;
    }
    const max = Math.max(...points);
    const min = Math.min(...points);
    ctx.beginPath();
    points.forEach((p,i) => {
      const x = (i/(points.length-1)) * w;
      const y = h - ((p - min)/(max - min || 1)) * h;
      if (i === 0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    });
    ctx.strokeStyle = '#2b8cff';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&#039;');
  }

  // initial load
  refreshAll().catch(err => {
    console.error('news: refresh failed', err);
  });

  if (refreshBtn) refreshBtn.addEventListener('click', () => refreshAll());
}

export default initLogic;
