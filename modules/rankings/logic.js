// modules/rankings/logic.js
// Helpers that provide ranking and statistics data. These functions are lightweight and return
// mocked/sample data so the News tab can use them. Replace implementations with real API calls.

export async function getTopTraders() {
  // Return array of { name, volume }
  return [
    { name: 'TraderA', volume: 12500 },
    { name: 'TraderB', volume: 9800 },
    { name: 'TraderC', volume: 6500 }
  ];
}

export async function getRichest() {
  return [
    { name: 'Rich1', amount: '1,250,000' },
    { name: 'Rich2', amount: '980,000' },
    { name: 'Rich3', amount: '652,300' }
  ];
}

export async function getRecentTransfers() {
  return [
    { from: 'User1', to: 'User2', amount: '250' },
    { from: 'User3', to: 'User4', amount: '3,200' },
    { from: 'User5', to: 'User6', amount: '87' }
  ];
}

export async function getBiggestDeals() {
  return [
    { user: 'Whale1', amount: '100,000', time: '2h ago' },
    { user: 'Whale2', amount: '75,000', time: '4h ago' }
  ];
}

export async function getEconomyStats() {
  return {
    'Market Cap': '12,345,678',
    '24h Volume': '234,567',
    'Inflation': '0.5%'
  };
}

export async function getCurrentRate() {
  return {
    value: '0.012',
    currency: 'USD',
    history: [0.010,0.011,0.009,0.012,0.013,0.0125,0.012]
  };
}

export async function getOnlineCount() {
  return 1245;
}

export async function getUserCount() {
  return 98765;
}

export async function getNewsItems() {
  return [
    { title: 'Сьогоднішні оновлення', time: '1h ago', text: 'Короткий опис змін у системі.' },
    { title: 'Нове в маркетплейсі', time: '3h ago', text: 'Додано нові товари та опції.' },
    { title: 'Технічні роботи', time: '1d ago', text: 'Планове обслуговування сервера.' }
  ];
}

// Export default for compatibility
export default {
  getTopTraders,
  getRichest,
  getRecentTransfers,
  getBiggestDeals,
  getEconomyStats,
  getCurrentRate,
  getOnlineCount,
  getUserCount,
  getNewsItems
};
