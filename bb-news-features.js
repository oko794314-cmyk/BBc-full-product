(() => {
    if (typeof firebase === 'undefined') return;

    const MIN_PRICE = 0.000001;
    const MAX_CANDLES = 48;
    const MAX_TRADE_RECORDS = 800;
    const QUESTS = [
        { id: 'buy_100', title: 'Купити 100 BB Coin', key: 'totalBought', target: 100, reward: { bb: 10, title: 'Трейдер' } },
        { id: 'sell_50', title: 'Продати 50 BB Coin', key: 'totalSold', target: 50, reward: { bb: 8 } },
        { id: 'login_7_days', title: 'Зайти 7 днів поспіль', key: 'loginStreak', target: 7, reward: { bb: 15, frame: 'frame_gold' } },
        { id: 'deals_10', title: 'Зробити 10 угод', key: 'totalDeals', target: 10, reward: { bb: 12 } },
        { id: 'earn_1000', title: 'Накопичити 1000 BB Coin', key: 'totalBought', target: 1000, reward: { bb: 25, background: 'bg_space' } },
        { id: 'invite_friend', title: 'Запросити друга', key: 'invitedFriends', target: 1, reward: { bb: 6 } }
    ];
    const ACHIEVEMENTS = [
        { id: 'first_purchase', title: 'Перша покупка', description: 'Купіть перший предмет у магазині.', check: () => num(state.accountHub?.stats?.shopPurchases, 0) >= 1 },
        { id: 'first_thousand', title: 'Перша тисяча BB Coin', description: 'Досягніть балансу 1000 BB.', check: () => num(gameState?.balance, 0) >= 1000 },
        { id: 'hundred_trades', title: '100 угод', description: 'Зробіть 100 біржових угод.', check: () => num(state.accountHub?.stats?.totalTrades, 0) >= 100 },
        { id: 'millionaire', title: 'Мільйонер', description: 'Накопичте 1 000 000 BB.', check: () => num(gameState?.balance, 0) >= 1000000 },
        { id: 'collector', title: 'Колекціонер', description: 'Зберіть 12 предметів акаунта.', check: () => getOwnedAssetCount() >= 12 },
        { id: 'investor', title: 'Інвестор', description: 'Отримайте 250 BB сукупного прибутку.', check: () => num(state.accountHub?.stats?.totalProfit, 0) >= 250 }
    ];
    const state = {
        chartRange: '24h',
        market: {
            currentPrice: 1,
            totalVolume: 0,
            completedTrades: 0,
            lastUpdated: 0,
            lastTradeAt: 0
        },
        trades: [],
        orders: [],
        news: [],
        userProgress: null,
        accountHub: null,
        marketListener: null,
        tradeListener: null,
        orderListener: null,
        newsListener: null,
        bootstrappedUser: null,
        isAdmin: false,
        knownNewsIds: new Set(),
        selectedCandleIndex: null,
        pendingTournamentWinners: {}
    };

    function getDb() {
        return firebase.database();
    }

    function escapeText(value) {
        if (typeof escapeHtml === 'function') return escapeHtml(value);
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function num(value, fallback = 0) {
        return Number.isFinite(Number(value)) ? Number(value) : fallback;
    }

    function makeEntryId(prefix = 'id') {
        return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    }

    function getDateKey(input = Date.now()) {
        const d = new Date(input);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }

    function buildDayDiff(prevDateKey, nextDateKey) {
        const prev = new Date(`${prevDateKey}T00:00:00`);
        const next = new Date(`${nextDateKey}T00:00:00`);
        return Math.floor((next - prev) / (24 * 60 * 60 * 1000));
    }

    function getDefaultProgress() {
        return {
            totalBought: 0,
            totalSold: 0,
            totalDeals: 0,
            loginStreak: 0,
            cumulativeEarned: 0,
            invitedFriends: 0,
            completed: {},
            titles: [],
            frames: [],
            backgrounds: [],
            lastLoginDate: ''
        };
    }

    function getDefaultAccountHub() {
        return {
            transactions: {},
            notifications: {},
            achievements: {},
            stats: {
                registeredAt: '',
                lastLoginAt: '',
                totalProfit: 0,
                totalTrades: 0,
                questsCompleted: 0,
                tournamentsWon: 0,
                shopPurchases: 0,
                workshopSales: 0,
                workshopPurchases: 0,
                giftsSent: 0,
                giftsReceived: 0,
                exchangeVolume: 0,
                lastSeenAt: ''
            }
        };
    }

    function normalizeAccountHub(raw) {
        const base = getDefaultAccountHub();
        if (!raw || typeof raw !== 'object') return base;
        return {
            transactions: raw.transactions && typeof raw.transactions === 'object' ? raw.transactions : {},
            notifications: raw.notifications && typeof raw.notifications === 'object' ? raw.notifications : {},
            achievements: raw.achievements && typeof raw.achievements === 'object' ? raw.achievements : {},
            stats: { ...base.stats, ...(raw.stats || {}) }
        };
    }

    function getOwnedAssetCount() {
        const shopOwned = Array.isArray(shopState?.owned) ? shopState.owned.length : 0;
        const workshopOwned = Object.keys(workshopStateEx?.ownedItemIds || {}).length;
        const properties = Object.keys(realEstateState?.properties || {}).length;
        const cars = Object.keys(carsState?.ownedCars || {}).length;
        return shopOwned + workshopOwned + properties + cars;
    }

    function getOpenOrders() {
        return state.orders.filter(order => order && order.status === 'open' && num(order.remaining, 0) > 0);
    }

    function getRangeStart(range) {
        const now = Date.now();
        if (range === '24h') return now - 24 * 60 * 60 * 1000;
        if (range === '7d') return now - 7 * 24 * 60 * 60 * 1000;
        if (range === '30d') return now - 30 * 24 * 60 * 60 * 1000;
        return 0;
    }

    function getBucketMs(range) {
        if (range === '24h') return 60 * 60 * 1000;
        if (range === '7d') return 6 * 60 * 60 * 1000;
        if (range === '30d') return 24 * 60 * 60 * 1000;
        return 7 * 24 * 60 * 60 * 1000;
    }

    function buildCandles(range) {
        const start = getRangeStart(range);
        const bucketMs = getBucketMs(range);
        const filtered = state.trades
            .filter(trade => num(trade.timestamp, 0) >= start)
            .sort((a, b) => num(a.timestamp, 0) - num(b.timestamp, 0));
        if (!filtered.length) return [];
        const buckets = new Map();
        filtered.forEach(trade => {
            const key = Math.floor(num(trade.timestamp, 0) / bucketMs) * bucketMs;
            const price = Math.max(MIN_PRICE, num(trade.price, state.market.currentPrice || 1));
            if (!buckets.has(key)) {
                buckets.set(key, { time: key, open: price, high: price, low: price, close: price, volume: num(trade.amount, 0) });
            } else {
                const candle = buckets.get(key);
                candle.high = Math.max(candle.high, price);
                candle.low = Math.min(candle.low, price);
                candle.close = price;
                candle.volume += num(trade.amount, 0);
            }
        });
        return Array.from(buckets.values()).sort((a, b) => a.time - b.time).slice(-MAX_CANDLES);
    }

    async function ensureMarketInitialized() {
        const snap = await getDb().ref('market').once('value');
        if (snap.exists()) return;
        await getDb().ref('market').set({
            currentPrice: 1,
            totalVolume: 0,
            completedTrades: 0,
            lastUpdated: firebase.database.ServerValue.TIMESTAMP,
            lastTradeAt: 0
        });
    }

    function canOrdersMatch(order, candidate, currentPrice) {
        if (!order || !candidate) return false;
        const orderLimit = Number(order.limitPrice);
        const candidatePrice = num(candidate.limitPrice, currentPrice || 1);
        if (order.orderType === 'limit' && order.side === 'buy') {
        return Number.isFinite(orderLimit) && candidatePrice <= orderLimit;
        }
        if (order.orderType === 'limit' && order.side === 'sell') {
        return Number.isFinite(orderLimit) && candidatePrice >= orderLimit;
        }
        return true;
    }

    async function isAdminUser(username) {
        if (!username) return false;
        const [roleSnap, aclSnap] = await Promise.all([
            getDb().ref(`users/${username}/role`).once('value'),
            getDb().ref(`config/adminUsers/${username}`).once('value')
        ]);
        return roleSnap.val() === 'admin' || aclSnap.val() === true;
    }

    async function loadUserProgress() {
        if (!gameState?.user) return;
        const snap = await getDb().ref(`userQuestProgress/${gameState.user}`).once('value');
        const raw = snap.val() || {};
        state.userProgress = {
            ...getDefaultProgress(),
            ...raw,
            completed: { ...(raw.completed || {}) },
            titles: Array.isArray(raw.titles) ? raw.titles : [],
            frames: Array.isArray(raw.frames) ? raw.frames : [],
            backgrounds: Array.isArray(raw.backgrounds) ? raw.backgrounds : []
        };
    }

    async function saveUserProgress() {
        if (!gameState?.user || !state.userProgress) return;
        await getDb().ref(`userQuestProgress/${gameState.user}`).set(state.userProgress);
    }

    async function loadAccountHub() {
        if (!gameState?.user) return;
        const raw = await loadUserFeatureStateFirebase(gameState.user, 'accountHub');
        state.accountHub = normalizeAccountHub(raw);
        const userData = await loadUserFromFirebase(gameState.user);
        if (userData?.createdAt && !state.accountHub.stats.registeredAt) {
            state.accountHub.stats.registeredAt = userData.createdAt;
        }
    }

    async function saveAccountHub() {
        if (!gameState?.user || !state.accountHub) return;
        state.accountHub.stats.lastSeenAt = new Date().toISOString();
        await saveUserFeatureStateFirebase(gameState.user, 'accountHub', state.accountHub);
    }

    async function writeRemoteHubEntry(username, type, entry) {
        if (!username) return;
        const id = entry.id || makeEntryId(type === 'transactions' ? 'tx' : 'nt');
        await getDb().ref(`users/${username}/accountHub/${type}/${id}`).set({ ...entry, id });
    }

    async function appendLocalTransaction(entry) {
        if (!state.accountHub) await loadAccountHub();
        if (!state.accountHub) return;
        const id = entry.id || makeEntryId('tx');
        state.accountHub.transactions[id] = { id, createdAt: Date.now(), ...entry };
        await saveAccountHub();
    }

    async function appendLocalNotification(entry) {
        if (!state.accountHub) await loadAccountHub();
        if (!state.accountHub) return;
        const id = entry.id || makeEntryId('nt');
        state.accountHub.notifications[id] = { id, createdAt: Date.now(), read: false, ...entry };
        await saveAccountHub();
    }

    async function updateLocalStats(delta = {}, patch = {}) {
        if (!state.accountHub) await loadAccountHub();
        if (!state.accountHub) return;
        Object.entries(delta).forEach(([key, value]) => {
            state.accountHub.stats[key] = num(state.accountHub.stats[key], 0) + num(value, 0);
        });
        Object.entries(patch).forEach(([key, value]) => {
            state.accountHub.stats[key] = value;
        });
        state.accountHub.stats.lastLoginAt = new Date().toISOString();
        await saveAccountHub();
    }

    async function grantAchievement(id) {
        if (!state.accountHub?.achievements || state.accountHub.achievements[id]) return;
        state.accountHub.achievements[id] = Date.now();
        const achievement = ACHIEVEMENTS.find(item => item.id === id);
        await appendLocalNotification({
            type: 'achievement',
            level: 'success',
            title: `🏅 Досягнення: ${achievement?.title || id}`,
            message: achievement?.description || 'Нове досягнення розблоковано.'
        });
        await saveAccountHub();
    }

    async function evaluateAchievements() {
        if (!state.accountHub) return;
        for (const achievement of ACHIEVEMENTS) {
            if (achievement.check()) {
                await grantAchievement(achievement.id);
            }
        }
    }

    async function addProgress(delta = {}) {
        if (!state.userProgress) await loadUserProgress();
        if (!state.userProgress) return;
        Object.keys(delta).forEach((key) => {
            state.userProgress[key] = num(state.userProgress[key], 0) + num(delta[key], 0);
        });
        await resolveCompletedQuests();
        await saveUserProgress();
        renderAchievementsHub();
    }

    async function resolveCompletedQuests() {
        if (!state.userProgress || !gameState?.user) return;
        for (const quest of QUESTS) {
            const currentValue = num(state.userProgress[quest.key], 0);
            if (currentValue < quest.target || state.userProgress.completed[quest.id]) continue;
            state.userProgress.completed[quest.id] = true;
            const reward = quest.reward || {};
            const rewardText = [];
            if (num(reward.bb, 0) > 0) {
                const result = await adjustUserBalanceFirebase(gameState.user, num(reward.bb, 0));
                if (result.success) {
                    gameState.balance = result.balance;
                    updateCachedUser(gameState.user, { balance: result.balance });
                    if (typeof updateHeader === 'function') updateHeader();
                    rewardText.push(`${reward.bb} BB`);
                    await appendLocalTransaction({ direction: 'income', amount: reward.bb, source: 'quest', reason: quest.title, details: 'Нагорода за квест' });
                }
            }
            if (reward.frame && shopState && !shopState.owned.includes(reward.frame)) {
                shopState.owned.push(reward.frame);
                rewardText.push(`рамка ${reward.frame}`);
                if (typeof shopSave === 'function') await shopSave();
            }
            if (reward.background && shopState && !shopState.owned.includes(reward.background)) {
                shopState.owned.push(reward.background);
                rewardText.push(`фон ${reward.background}`);
                if (typeof shopSave === 'function') await shopSave();
            }
            if (reward.title) rewardText.push(`титул ${reward.title}`);
            await updateLocalStats({ questsCompleted: 1 });
            await appendLocalNotification({ type: 'quest', level: 'success', title: `🎯 Квест виконано: ${quest.title}`, message: `Нагорода: ${rewardText.join(', ') || 'отримано'}` });
        }
        await evaluateAchievements();
    }

    async function processLoginStreak() {
        if (!state.userProgress) await loadUserProgress();
        if (!state.userProgress) return;
        const today = getDateKey();
        const last = state.userProgress.lastLoginDate || '';
        if (last === today) return;
        if (!last) {
            state.userProgress.loginStreak = 1;
        } else {
            const diff = buildDayDiff(last, today);
            state.userProgress.loginStreak = diff === 1 ? num(state.userProgress.loginStreak, 0) + 1 : 1;
        }
        state.userProgress.lastLoginDate = today;
        await saveUserProgress();
        await updateLocalStats({}, { lastLoginAt: new Date().toISOString() });
        await resolveCompletedQuests();
    }

    function usersArray() {
        return Object.entries(allUsers || {}).map(([username, data]) => ({
            username,
            balance: num(data?.balance, 0),
            online: data?.online === true,
            createdAt: data?.createdAt || ''
        }));
    }

    function getExchangeSearch() {
        return (document.getElementById('exchange-order-search')?.value || '').trim().toLowerCase();
    }

    function getFilteredOpenOrders(side) {
        const search = getExchangeSearch();
        return getOpenOrders()
            .filter(order => order.side === side)
            .filter(order => {
                if (!search) return true;
                const haystack = [order.user, order.creatorDisplayName, order.desiredAsset, order.source, order.notes]
                    .filter(Boolean)
                    .join(' ')
                    .toLowerCase();
                return haystack.includes(search);
            })
            .sort((a, b) => {
                const priceA = num(a.limitPrice, state.market.currentPrice || 1);
                const priceB = num(b.limitPrice, state.market.currentPrice || 1);
                return side === 'sell'
                    ? priceA - priceB || num(a.createdAt, 0) - num(b.createdAt, 0)
                    : priceB - priceA || num(a.createdAt, 0) - num(b.createdAt, 0);
            });
    }

    function renderNews() {
        const root = document.getElementById('news-list');
        if (!root) return;
        const sorted = [...state.news].sort((a, b) => {
            const pinA = a?.pinned ? 1 : 0;
            const pinB = b?.pinned ? 1 : 0;
            if (pinA !== pinB) return pinB - pinA;
            return num(b?.createdAt, 0) - num(a?.createdAt, 0);
        });
        if (!sorted.length) {
            root.innerHTML = '<div class="news-card"><div style="font-size:11px; color:#888;">Поки що новин немає.</div></div>';
            return;
        }
        root.innerHTML = sorted.map(item => {
            const date = item?.createdAt ? new Date(item.createdAt).toLocaleString('uk-UA') : '--';
            const image = item?.image ? `<img class="news-image" src="${escapeText(item.image)}" alt="news image">` : '';
            return `
                <article class="news-card ${item?.pinned ? 'pinned' : ''}">
                    <div class="news-meta"><span>${item?.pinned ? '📌 Закріплено' : '📰 Оновлення'}</span><span>👤 ${escapeText(item?.author || 'Адміністрація')}</span><span>🕒 ${escapeText(date)}</span></div>
                    <div style="font-size:13px; font-weight:900; color:var(--p); margin-bottom:6px;">${escapeText(item?.title || 'Без заголовка')}</div>
                    <div style="font-size:11px; line-height:1.45; color:#ddd; white-space:pre-wrap;">${escapeText(item?.text || '')}</div>
                    ${image}
                </article>
            `;
        }).join('');
    }

    function renderExchangeStats() {
        const root = document.getElementById('exchange-stats');
        if (!root) return;
        const orders = getOpenOrders();
        const trades24h = state.trades.filter(trade => num(trade.timestamp, 0) >= Date.now() - 24 * 60 * 60 * 1000);
        const biggestTrade = state.trades.slice().sort((a, b) => num(b.amount, 0) - num(a.amount, 0))[0];
        const stats = [
            ['Курс', `${num(state.market.currentPrice, 1).toFixed(6)} BB`],
            ['Відкриті ордери', String(orders.length)],
            ['Добовий обсяг', trades24h.reduce((sum, trade) => sum + num(trade.amount, 0), 0).toFixed(4)],
            ['Угод виконано', String(Math.round(num(state.market.completedTrades, 0)))],
            ['Найбільша угода', biggestTrade ? `${num(biggestTrade.amount, 0).toFixed(4)} BB` : '—'],
            ['Остання активність', state.market.lastTradeAt ? new Date(state.market.lastTradeAt).toLocaleString('uk-UA') : '—']
        ];
        root.innerHTML = stats.map(([label, value]) => `
            <div class="market-stat">
                <div class="market-stat-label">${label}</div>
                <div class="market-stat-value">${value}</div>
            </div>
        `).join('');
    }

    function renderOrderBook(side, rootId) {
        const root = document.getElementById(rootId);
        if (!root) return;
        const orders = getFilteredOpenOrders(side);
        if (!orders.length) {
            root.innerHTML = `<div class="hub-note">Немає ${side === 'sell' ? 'продавців' : 'покупців'} за поточним фільтром.</div>`;
            return;
        }
        root.innerHTML = orders.slice(0, 12).map(order => `
            <div class="order-card">
                <div class="order-head">
                    <div>
                        <div style="font-size:12px; font-weight:900; color:${side === 'sell' ? 'var(--r)' : 'var(--g)'};">${escapeText(order.creatorDisplayName || order.user)}</div>
                        <div class="order-meta"><span>${escapeText(order.orderType === 'market' ? 'Ринковий' : 'Лімітний')}</span><span>${new Date(order.createdAt).toLocaleString('uk-UA')}</span></div>
                    </div>
                    <span class="pill ${side === 'sell' ? 'sell' : 'buy'}">${side === 'sell' ? 'SELL' : 'BUY'}</span>
                </div>
                <div style="font-size:13px; font-weight:900; color:var(--p);">${num(order.remaining, 0).toFixed(4)} / ${num(order.amount, 0).toFixed(4)} BB</div>
                <div class="hub-note">Ціна: ${num(order.limitPrice, state.market.currentPrice || 1).toFixed(6)} • Потрібно: ${escapeText(order.desiredAsset || 'Домовленість між людьми')}</div>
                <div class="order-meta"><span>Джерело: ${escapeText(order.source || 'біржа')}</span></div>
                ${order.user !== gameState?.user ? `<div class="feature-actions"><button class="shop-item-btn" onclick="bbFeatures.fulfillOrder('${order.id}')">Виконати</button></div>` : ''}
            </div>
        `).join('');
    }

    function renderMyOrders() {
        const root = document.getElementById('exchange-my-orders');
        if (!root) return;
        const myOrders = state.orders.filter(order => order.user === gameState?.user).sort((a, b) => num(b.createdAt, 0) - num(a.createdAt, 0));
        if (!myOrders.length) {
            root.innerHTML = '<div class="hub-note">У вас ще немає ордерів.</div>';
            return;
        }
        root.innerHTML = myOrders.map(order => `
            <div class="order-card">
                <div class="order-head">
                    <div>
                        <div style="font-size:12px; font-weight:900; color:var(--p);">${escapeText(order.side === 'buy' ? 'Купівля' : 'Продаж')} • ${escapeText(order.orderType === 'market' ? 'Ринковий' : 'Лімітний')}</div>
                        <div class="order-meta"><span>${new Date(order.createdAt).toLocaleString('uk-UA')}</span><span>Статус: ${escapeText(order.status || 'open')}</span></div>
                    </div>
                    <span class="pill ${order.side === 'buy' ? 'buy' : 'sell'}">${escapeText(order.side)}</span>
                </div>
                <div class="hub-note">${num(order.remaining, 0).toFixed(4)} / ${num(order.amount, 0).toFixed(4)} BB • ${escapeText(order.desiredAsset || 'Без уточнення')}</div>
                ${order.status === 'open' ? `<div class="feature-actions"><button class="shop-item-btn equip-btn" onclick="bbFeatures.cancelOrder('${order.id}')">СКАСУВАТИ</button></div>` : ''}
            </div>
        `).join('');
    }

    function renderTradeHistory() {
        const root = document.getElementById('exchange-trades');
        if (!root) return;
        if (!state.trades.length) {
            root.innerHTML = '<div class="hub-note">Угод ще немає.</div>';
            return;
        }
        root.innerHTML = state.trades.slice().sort((a, b) => num(b.timestamp, 0) - num(a.timestamp, 0)).slice(0, 12).map(trade => `
            <div class="activity-card">
                <div class="order-head">
                    <div>
                        <div style="font-size:12px; font-weight:900; color:var(--gold);">${escapeText(trade.buyer)} ⇄ ${escapeText(trade.seller)}</div>
                        <div class="order-meta"><span>${new Date(trade.timestamp).toLocaleString('uk-UA')}</span><span>${escapeText(trade.executionType || 'trade')}</span></div>
                    </div>
                    <span class="pill info">${num(trade.amount, 0).toFixed(4)} BB</span>
                </div>
                <div class="hub-note">Ціна: ${num(trade.price, 0).toFixed(6)} • Запит: ${escapeText(trade.desiredAsset || 'поза біржею')}</div>
            </div>
        `).join('');
    }

    function renderLargestTrades() {
        const root = document.getElementById('exchange-largest-trades');
        if (!root) return;
        if (!state.trades.length) {
            root.innerHTML = '<div class="hub-note">Найбільші угоди зʼявляться після перших обмінів.</div>';
            return;
        }
        root.innerHTML = state.trades.slice().sort((a, b) => num(b.amount, 0) - num(a.amount, 0)).slice(0, 10).map((trade, index) => `
            <div class="activity-card">
                <div class="order-head">
                    <div style="font-size:12px; font-weight:900; color:var(--p);">#${index + 1} • ${num(trade.amount, 0).toFixed(4)} BB</div>
                    <span class="pill gold">${num(trade.price, 0).toFixed(6)}</span>
                </div>
                <div class="hub-note">${escapeText(trade.buyer)} забрав у ${escapeText(trade.seller)} • ${new Date(trade.timestamp).toLocaleString('uk-UA')}</div>
            </div>
        `).join('');
    }

    function selectCandle(index) {
        state.selectedCandleIndex = index;
        renderCandles();
    }

    function renderCandles() {
        const svg = document.getElementById('exchange-candles');
        const meta = document.getElementById('exchange-candle-meta');
        if (!svg) return;
        const candles = buildCandles(state.chartRange);
        if (!candles.length) {
            svg.innerHTML = '<text x="50%" y="50%" fill="#666" dominant-baseline="middle" text-anchor="middle" font-size="13">Недостатньо даних для графіка</text>';
            if (meta) meta.textContent = 'Натисніть на свічку, щоб побачити час і ціну угоди.';
            return;
        }
        const width = 640;
        const height = 220;
        const pad = 20;
        const prices = candles.flatMap(c => [c.low, c.high]);
        const min = Math.min(...prices);
        const max = Math.max(...prices);
        const range = Math.max(max - min, MIN_PRICE);
        const xStep = (width - pad * 2) / Math.max(candles.length, 1);
        const bodyW = Math.max(6, Math.min(12, xStep * 0.6));
        const y = price => height - pad - ((price - min) / range) * (height - pad * 2);
        const parts = [];
        candles.forEach((candle, index) => {
            const cx = pad + index * xStep + xStep / 2;
            const yHigh = y(candle.high);
            const yLow = y(candle.low);
            const yOpen = y(candle.open);
            const yClose = y(candle.close);
            const up = candle.close >= candle.open;
            const color = up ? '#00ff88' : '#ff3366';
            const bodyY = Math.min(yOpen, yClose);
            const bodyH = Math.max(2, Math.abs(yOpen - yClose));
            const selected = state.selectedCandleIndex === index;
            parts.push(`<g onclick="bbFeatures.selectCandle(${index})" style="cursor:pointer;">
                <line x1="${cx}" y1="${yHigh}" x2="${cx}" y2="${yLow}" stroke="${color}" stroke-width="2" />
                <rect x="${cx - bodyW / 2}" y="${bodyY}" width="${bodyW}" height="${bodyH}" fill="${color}" opacity="${selected ? '1' : '0.75'}" stroke="${selected ? '#fff' : 'transparent'}" stroke-width="1.5" />
            </g>`);
        });
        parts.push(`<text x="${pad}" y="${pad - 4}" fill="#888" font-size="10">MAX ${max.toFixed(6)}</text>`);
        parts.push(`<text x="${pad}" y="${height - 6}" fill="#888" font-size="10">MIN ${min.toFixed(6)}</text>`);
        svg.innerHTML = parts.join('');
        const selected = candles[state.selectedCandleIndex] || candles[candles.length - 1];
        if (meta && selected) {
            meta.textContent = `Свічка ${new Date(selected.time).toLocaleString('uk-UA')} • OPEN ${selected.open.toFixed(6)} • CLOSE ${selected.close.toFixed(6)} • VOL ${selected.volume.toFixed(4)} BB`;
        }
    }

    function getBalanceTransactions() {
        return Object.values(state.accountHub?.transactions || {}).sort((a, b) => num(b.createdAt, 0) - num(a.createdAt, 0));
    }

    function renderBalanceHub() {
        const summaryRoot = document.getElementById('balance-ledger-summary');
        const listRoot = document.getElementById('balance-list');
        if (!summaryRoot || !listRoot || !state.accountHub) return;
        const transactions = getBalanceTransactions();
        const search = (document.getElementById('balance-search')?.value || '').trim().toLowerCase();
        const sourceFilter = document.getElementById('balance-source-filter')?.value || 'all';
        const directionFilter = document.getElementById('balance-direction-filter')?.value || 'all';
        const dateFilter = document.getElementById('balance-date-filter')?.value || '';
        const sources = Array.from(new Set(transactions.map(item => item.source).filter(Boolean))).sort();
        const sourceSelect = document.getElementById('balance-source-filter');
        if (sourceSelect) {
            const current = sourceSelect.value || 'all';
            sourceSelect.innerHTML = ['<option value="all">Усі джерела</option>', ...sources.map(source => `<option value="${escapeText(source)}">${escapeText(source)}</option>`)].join('');
            sourceSelect.value = sources.includes(current) || current === 'all' ? current : 'all';
        }
        const filtered = transactions.filter(item => {
            if (sourceFilter !== 'all' && item.source !== sourceFilter) return false;
            if (directionFilter !== 'all' && item.direction !== directionFilter) return false;
            if (dateFilter && getDateKey(item.createdAt) !== dateFilter) return false;
            if (!search) return true;
            const haystack = [item.source, item.reason, item.details, item.counterparty].filter(Boolean).join(' ').toLowerCase();
            return haystack.includes(search);
        });
        const incoming = filtered.filter(item => item.direction === 'income').reduce((sum, item) => sum + num(item.amount, 0), 0);
        const outgoing = filtered.filter(item => item.direction === 'expense').reduce((sum, item) => sum + num(item.amount, 0), 0);
        summaryRoot.innerHTML = [
            ['Записів', String(filtered.length)],
            ['Надійшло', incoming.toFixed(4)],
            ['Списано', outgoing.toFixed(4)],
            ['Баланс', num(gameState?.balance, 0).toFixed(4)]
        ].map(([label, value]) => `
            <div class="market-stat">
                <div class="market-stat-label">${label}</div>
                <div class="market-stat-value">${value}</div>
            </div>
        `).join('');
        if (!filtered.length) {
            listRoot.innerHTML = '<div class="hub-note">Операцій за поточним фільтром немає.</div>';
            return;
        }
        listRoot.innerHTML = filtered.map(item => `
            <div class="transaction-item">
                <div class="transaction-head">
                    <div>
                        <div style="font-size:12px; font-weight:900; color:var(--p);">${escapeText(item.reason || 'Операція')}</div>
                        <div class="transaction-meta"><span>${escapeText(item.source || 'system')}</span><span>${new Date(item.createdAt).toLocaleString('uk-UA')}</span>${item.counterparty ? `<span>${escapeText(item.counterparty)}</span>` : ''}</div>
                    </div>
                    <div class="transaction-amount ${item.direction === 'income' ? 'income' : 'expense'}">${item.direction === 'income' ? '+' : '-'}${num(item.amount, 0).toFixed(4)} BB</div>
                </div>
                <div class="hub-note">${escapeText(item.details || 'Без деталей')}</div>
            </div>
        `).join('');
    }

    function renderProfileHub() {
        const identityRoot = document.getElementById('profile-identity');
        const statsRoot = document.getElementById('profile-stats-grid');
        const assetsRoot = document.getElementById('profile-assets-list');
        const activityRoot = document.getElementById('profile-recent-activity');
        if (!identityRoot || !statsRoot || !assetsRoot || !activityRoot || !state.accountHub) return;
        // Sanitize CSS color values: allow only hex, rgb/rgba, hsl, named colors, and CSS variables
        const safeCssColor = (v, fallback) => {
            const s = String(v || '');
            return /^(#[0-9a-fA-F]{3,8}|rgba?\([^)]{0,60}\)|hsla?\([^)]{0,60}\)|var\(--[a-zA-Z0-9-]{1,40}\)|[a-zA-Z]{1,20})$/.test(s.trim()) ? s.trim() : fallback;
        };
        identityRoot.innerHTML = `
            <img class="profile-avatar" src="${escapeText(gameState?.avatar || '')}" alt="avatar">
            <div>
                <div style="font-size:18px; font-weight:900; color:var(--p);">${escapeText(gameState?.displayName || gameState?.user || 'Гість')}</div>
                ${(function() {
                    const titleId = (typeof workshopStateEx !== 'undefined' && workshopStateEx?.equipped?.titleId) || null;
                    const workshopTitle = titleId && typeof getWorkshopItemById === 'function' ? getWorkshopItemById(titleId) : null;
                    const shopTitleId = (typeof shopState !== 'undefined' && shopState?.equippedTitle) || null;
                    const shopTitleItem = (!workshopTitle && shopTitleId && typeof shopCatalog !== 'undefined') ? shopCatalog.find(i => i.id === shopTitleId) : null;
                    if (workshopTitle?.type === 'title') {
                        const color = safeCssColor(workshopTitle.style?.color, 'var(--gold)');
                        const accent = safeCssColor(workshopTitle.style?.accent, 'rgba(255,204,0,0.35)');
                        return `<div class="profile-title-chip" style="display:inline-flex; color:${color}; border-color:${accent}; box-shadow:0 0 10px ${accent}33; margin-top:4px;"><span>${escapeText(workshopTitle.style?.icon||'✨')}</span><span>${escapeText(workshopTitle.name)}</span></div>`;
                    }
                    if (shopTitleItem?.titleStyle) {
                        const color = safeCssColor(shopTitleItem.titleStyle.color, 'var(--gold)');
                        const accent = safeCssColor(shopTitleItem.titleStyle.accent, 'rgba(255,204,0,0.35)');
                        return `<div class="profile-title-chip" style="display:inline-flex; color:${color}; border-color:${accent}; box-shadow:0 0 10px ${accent}33; margin-top:4px;"><span>${escapeText(shopTitleItem.titleStyle.icon||'🏷️')}</span><span>${escapeText(shopTitleItem.name)}</span></div>`;
                    }
                    return '';
                })()}
                <div class="hub-note">@${escapeText(gameState?.user || '---')} • Реєстрація: ${state.accountHub.stats.registeredAt ? new Date(state.accountHub.stats.registeredAt).toLocaleDateString('uk-UA') : '—'}</div>
                <div class="hub-note">Останній вхід: ${state.accountHub.stats.lastLoginAt ? new Date(state.accountHub.stats.lastLoginAt).toLocaleString('uk-UA') : '—'}</div>
            </div>
        `;
        const profileStats = [
            ['Баланс', `${num(gameState?.balance, 0).toFixed(4)} BB`],
            ['Загальний прибуток', `${num(state.accountHub.stats.totalProfit, 0).toFixed(4)} BB`],
            ['Кількість угод', String(Math.round(num(state.accountHub.stats.totalTrades, 0)))],
            ['Квести', String(Math.round(num(state.accountHub.stats.questsCompleted, 0)))],
            ['Турніри', String(Math.round(num(state.accountHub.stats.tournamentsWon, 0)))],
            ['Престиж', String(Math.round(num(gameState?.prestige, 0)))],
            ['Подарунки', `${Math.round(num(state.accountHub.stats.giftsSent, 0))}/${Math.round(num(state.accountHub.stats.giftsReceived, 0))}`],
            ['Майно', String(getOwnedAssetCount())]
        ];
        statsRoot.innerHTML = profileStats.map(([label, value]) => `<div class="profile-stat-card"><span class="hub-note">${label}</span><b>${value}</b></div>`).join('');
        const assets = [
            `Магазин: ${Array.isArray(shopState?.owned) ? shopState.owned.length : 0}`,
            `Майстерня: ${Object.keys(workshopStateEx?.ownedItemIds || {}).length}`,
            `Нерухомість: ${Object.keys(realEstateState?.properties || {}).length}`,
            `Авто: ${Object.keys(carsState?.ownedCars || {}).length}`
        ];
        assetsRoot.innerHTML = assets.map(text => `<div class="activity-card">${escapeText(text)}</div>`).join('');
        const recent = getBalanceTransactions().slice(0, 6);
        activityRoot.innerHTML = recent.length
            ? recent.map(item => `<div class="activity-card"><b style="color:var(--gold);">${escapeText(item.reason || 'Операція')}</b><div class="hub-note">${new Date(item.createdAt).toLocaleString('uk-UA')} • ${item.direction === 'income' ? '+' : '-'}${num(item.amount, 0).toFixed(4)} BB</div></div>`).join('')
            : '<div class="hub-note">Ще немає активності.</div>';
    }

    function renderAchievementsHub() {
        const summaryRoot = document.getElementById('achievements-summary');
        const listRoot = document.getElementById('achievements-list');
        const questsRoot = document.getElementById('quests-list');
        if (!summaryRoot || !listRoot || !questsRoot) return;
        const unlockedCount = Object.keys(state.accountHub?.achievements || {}).length;
        summaryRoot.innerHTML = [
            ['Відкрито', `${unlockedCount}/${ACHIEVEMENTS.length}`],
            ['Квестів виконано', String(Math.round(num(state.accountHub?.stats?.questsCompleted, 0)))],
            ['Трейдів', String(Math.round(num(state.accountHub?.stats?.totalTrades, 0)))],
            ['Колекція', String(getOwnedAssetCount())]
        ].map(([label, value]) => `<div class="market-stat"><div class="market-stat-label">${label}</div><div class="market-stat-value">${value}</div></div>`).join('');
        listRoot.innerHTML = ACHIEVEMENTS.map(item => {
            const unlockedAt = state.accountHub?.achievements?.[item.id];
            return `
                <div class="achievement-card ${unlockedAt ? '' : 'locked'}">
                    <div class="order-head">
                        <div style="font-size:12px; font-weight:900; color:${unlockedAt ? 'var(--gold)' : '#888'};">${unlockedAt ? '🏆' : '🔒'} ${escapeText(item.title)}</div>
                        <span class="pill ${unlockedAt ? 'success' : 'info'}">${unlockedAt ? 'Відкрито' : 'Очікує'}</span>
                    </div>
                    <div class="hub-note">${escapeText(item.description)}</div>
                    ${unlockedAt ? `<div class="order-meta"><span>${new Date(unlockedAt).toLocaleString('uk-UA')}</span></div>` : ''}
                </div>
            `;
        }).join('');
        const progress = state.userProgress || getDefaultProgress();
        questsRoot.innerHTML = QUESTS.map(q => {
            const current = num(progress[q.key], 0);
            const done = !!progress.completed?.[q.id];
            const pct = Math.min(100, (current / q.target) * 100);
            const reward = [];
            if (q.reward.bb) reward.push(`${q.reward.bb} BB`);
            if (q.reward.title) reward.push(`титул ${q.reward.title}`);
            if (q.reward.frame) reward.push(`рамка ${q.reward.frame}`);
            if (q.reward.background) reward.push(`фон ${q.reward.background}`);
            return `
                <div class="quest-item ${done ? 'done' : ''}">
                    <div style="font-size:12px; color:${done ? 'var(--g)' : 'var(--p)'}; font-weight:900;">${done ? '✅' : '🎯'} ${escapeText(q.title)}</div>
                    <div class="quest-progress">${Math.min(current, q.target).toFixed(2)} / ${q.target.toFixed(2)} • Нагорода: ${reward.join(', ')}</div>
                    <div style="height:6px; background:#111; border-radius:999px; margin-top:6px; overflow:hidden;">
                        <div style="height:100%; width:${pct}%; background:${done ? 'var(--g)' : 'var(--p)'};"></div>
                    </div>
                </div>
            `;
        }).join('');
    }

    function renderNotificationCenter() {
        const root = document.getElementById('notifications-list');
        if (!root) return;
        const search = (document.getElementById('notifications-search')?.value || '').trim().toLowerCase();
        const notifications = Object.values(state.accountHub?.notifications || {})
            .sort((a, b) => num(b.createdAt, 0) - num(a.createdAt, 0))
            .filter(item => {
                if (!search) return true;
                return [item.title, item.message, item.type].filter(Boolean).join(' ').toLowerCase().includes(search);
            });
        if (!notifications.length) {
            root.innerHTML = '<div class="hub-note">Поки що сповіщень немає.</div>';
            return;
        }
        root.innerHTML = notifications.map(item => `
            <div class="notification-item ${item.read ? '' : 'unread'}">
                <div class="notification-head">
                    <div>
                        <div style="font-size:12px; font-weight:900; color:var(--p);">${escapeText(item.title || 'Сповіщення')}</div>
                        <div class="notification-meta"><span>${escapeText(item.type || 'system')}</span><span>${new Date(item.createdAt).toLocaleString('uk-UA')}</span></div>
                    </div>
                    <span class="pill ${item.level === 'success' ? 'success' : item.level === 'warning' ? 'warning' : 'info'}">${item.read ? 'read' : 'new'}</span>
                </div>
                <div class="hub-note">${escapeText(item.message || '')}</div>
            </div>
        `).join('');
    }

    async function renderAllUsersStats() {
        if (typeof loadAllUsersFromFirebase !== 'function') return;
        try {
            allUsers = await loadAllUsersFromFirebase();
        } catch (_error) {}
    }

    function updateMiniTabState(containerId, key, value) {
        const root = document.getElementById(containerId);
        if (!root) return;
        root.querySelectorAll('.mini-tab').forEach(button => {
            button.classList.toggle('active', button.dataset[key] === value);
        });
    }

    async function publishNews() {
        if (!gameState?.user || !state.isAdmin) {
            alert('Тільки адміністрація може публікувати новини.');
            return;
        }
        const title = (document.getElementById('news-title')?.value || '').trim();
        const text = (document.getElementById('news-text')?.value || '').trim();
        const image = (document.getElementById('news-image')?.value || '').trim();
        const pinned = !!document.getElementById('news-pinned')?.checked;
        if (!title || !text) {
            alert('Заповніть заголовок і текст новини.');
            return;
        }
        await getDb().ref('newsPosts').push({
            title,
            text,
            author: gameState.user,
            image: image || null,
            pinned,
            createdAt: firebase.database.ServerValue.TIMESTAMP
        });
        document.getElementById('news-title').value = '';
        document.getElementById('news-text').value = '';
        document.getElementById('news-image').value = '';
        document.getElementById('news-pinned').checked = false;
        await appendLocalNotification({ type: 'news', level: 'info', title: '📰 Новина опублікована', message: title });
    }

    function getOrderInputs() {
        return {
            side: (document.getElementById('exchange-order-side')?.value || 'buy') === 'sell' ? 'sell' : 'buy',
            orderType: (document.getElementById('exchange-order-type')?.value || 'market') === 'limit' ? 'limit' : 'market',
            amount: num(document.getElementById('exchange-order-amount')?.value, 0),
            limitPrice: Math.max(MIN_PRICE, num(document.getElementById('exchange-order-price')?.value, state.market.currentPrice || 1)),
            desiredAsset: (document.getElementById('exchange-order-desired')?.value || '').trim(),
            source: (document.getElementById('exchange-order-source')?.value || '').trim()
        };
    }

    async function placeExchangeOrder() {
        if (!gameState?.user) {
            alert('Спочатку увійдіть в акаунт.');
            return;
        }
        const payload = getOrderInputs();
        if (payload.amount <= 0) {
            alert('Введіть коректну кількість BB.');
            return;
        }
        if (payload.side === 'sell' && num(gameState.balance, 0) < payload.amount) {
            alert('Недостатньо BB для продажу.');
            return;
        }
        const ref = getDb().ref('marketOrders').push();
        const order = {
            id: ref.key,
            user: gameState.user,
            creatorDisplayName: gameState.displayName || gameState.user,
            side: payload.side,
            orderType: payload.orderType,
            amount: Number(payload.amount.toFixed(4)),
            remaining: Number(payload.amount.toFixed(4)),
            limitPrice: Number(payload.limitPrice.toFixed(6)),
            desiredAsset: payload.desiredAsset,
            source: payload.source,
            notes: payload.desiredAsset,
            status: 'open',
            createdAt: Date.now(),
            updatedAt: Date.now()
        };
        await ref.set(order);
        document.getElementById('exchange-order-amount').value = '';
        document.getElementById('exchange-order-desired').value = '';
        document.getElementById('exchange-order-source').value = '';
        await appendLocalNotification({ type: 'exchange', level: 'info', title: '💹 Нова заявка на біржі', message: `${payload.side === 'buy' ? 'Купівля' : 'Продаж'} ${order.amount.toFixed(4)} BB` });
        await matchOrder(order.id);
        renderExchangeHub();
    }

    async function matchExchangeOrder() {
        const myOpenOrders = state.orders.filter(order => order.user === gameState?.user && order.status === 'open');
        const last = myOpenOrders.sort((a, b) => num(b.createdAt, 0) - num(a.createdAt, 0))[0];
        if (!last) {
            alert('Спочатку створіть заявку.');
            return;
        }
        await matchOrder(last.id);
    }

    async function fulfillOrder(orderId) {
        const target = state.orders.find(item => item.id === orderId);
        if (!target || target.user === gameState?.user) return;
        if (target.side === 'buy' && num(gameState?.balance, 0) < num(target.remaining, 0)) {
            alert('Недостатньо BB, щоб закрити цю заявку на купівлю.');
            return;
        }
        const ref = getDb().ref('marketOrders').push();
        const created = {
            id: ref.key,
            user: gameState.user,
            creatorDisplayName: gameState.displayName || gameState.user,
            side: target.side === 'buy' ? 'sell' : 'buy',
            orderType: 'market',
            amount: Number(num(target.remaining, 0).toFixed(4)),
            remaining: Number(num(target.remaining, 0).toFixed(4)),
            limitPrice: Number(num(target.limitPrice, state.market.currentPrice || 1).toFixed(6)),
            desiredAsset: target.desiredAsset || '',
            source: 'manual-fulfill',
            status: 'open',
            createdAt: Date.now(),
            updatedAt: Date.now()
        };
        await ref.set(created);
        await matchOrder(created.id, true);
    }

    async function cancelOrder(orderId) {
        await getDb().ref(`marketOrders/${orderId}`).update({ status: 'cancelled', remaining: 0, updatedAt: Date.now() });
        await appendLocalNotification({ type: 'exchange', level: 'warning', title: '🚫 Ордер скасовано', message: `Ордер ${orderId} знято з книги.` });
        renderExchangeHub();
    }

    async function settleTrade(match) {
        const sellerResult = await adjustUserBalanceFirebase(match.seller, -match.amount);
        if (!sellerResult.success) return false;
        const buyerResult = await adjustUserBalanceFirebase(match.buyer, match.amount);
        if (!buyerResult.success) {
            const rollbackResult = await adjustUserBalanceFirebase(match.seller, match.amount);
            if (!rollbackResult.success) {
                console.error('❌ Не вдалося відкотити баланс продавця після збою біржової угоди');
            }
            return false;
        }
        if (match.buyer === gameState?.user) {
            gameState.balance = buyerResult.balance;
            updateCachedUser(gameState.user, { balance: buyerResult.balance });
        }
        if (match.seller === gameState?.user) {
            gameState.balance = sellerResult.balance;
            updateCachedUser(gameState.user, { balance: sellerResult.balance });
        }
        if (typeof updateHeader === 'function') updateHeader();
        const tradeRef = getDb().ref('marketTrades').push();
        const trade = {
            id: tradeRef.key,
            buyer: match.buyer,
            seller: match.seller,
            buyOrderId: match.buyOrderId,
            sellOrderId: match.sellOrderId,
            amount: Number(match.amount.toFixed(4)),
            price: Number(match.price.toFixed(6)),
            desiredAsset: match.desiredAsset,
            source: match.source,
            executionType: match.executionType,
            timestamp: Date.now()
        };
        await tradeRef.set(trade);
        await getDb().ref('market').update({
            currentPrice: trade.price,
            totalVolume: num(state.market.totalVolume, 0) + trade.amount,
            completedTrades: num(state.market.completedTrades, 0) + 1,
            lastUpdated: trade.timestamp,
            lastTradeAt: trade.timestamp
        });
        await Promise.all([
            writeRemoteHubEntry(match.buyer, 'transactions', { direction: 'income', amount: trade.amount, source: 'exchange', reason: 'Купівля на біржі', details: `Отримано від ${match.seller}`, counterparty: match.seller, createdAt: trade.timestamp }),
            writeRemoteHubEntry(match.seller, 'transactions', { direction: 'expense', amount: trade.amount, source: 'exchange', reason: 'Продаж на біржі', details: `Передано для ${match.buyer}`, counterparty: match.buyer, createdAt: trade.timestamp }),
            writeRemoteHubEntry(match.buyer, 'notifications', { type: 'exchange', level: 'success', title: '🟢 Угоду виконано', message: `Отримано ${trade.amount.toFixed(4)} BB від ${match.seller}`, createdAt: trade.timestamp }),
            writeRemoteHubEntry(match.seller, 'notifications', { type: 'exchange', level: 'success', title: '🔴 Угоду виконано', message: `Передано ${trade.amount.toFixed(4)} BB для ${match.buyer}`, createdAt: trade.timestamp })
        ]);
        if (match.buyer === gameState?.user || match.seller === gameState?.user) {
            await updateLocalStats({ totalTrades: 1, exchangeVolume: trade.amount, totalProfit: match.seller === gameState?.user ? trade.amount : 0 });
            await addProgress({ totalDeals: 1, totalBought: match.buyer === gameState?.user ? trade.amount : 0, totalSold: match.seller === gameState?.user ? trade.amount : 0 });
            await evaluateAchievements();
        }
        return true;
    }

    async function matchOrder(orderId, fulfillExisting = false) {
        let order = state.orders.find(item => item.id === orderId);
        if (!order) {
            const snap = await getDb().ref(`marketOrders/${orderId}`).once('value');
            if (snap.exists()) {
                order = { id: orderId, ...(snap.val() || {}) };
            }
        }
        const initialRemaining = Number.isFinite(Number(order?.remaining)) ? Number(order.remaining) : Number(order?.amount);
        if (!order || order.status !== 'open' || !Number.isFinite(initialRemaining) || initialRemaining <= 0) return;
        order.remaining = Number(initialRemaining.toFixed(4));
        const oppositeSide = order.side === 'buy' ? 'sell' : 'buy';
        const candidates = getOpenOrders()
            .filter(item => item.id !== order.id && item.side === oppositeSide && item.user !== order.user)
            .sort((a, b) => order.side === 'buy'
                ? num(a.limitPrice, state.market.currentPrice || 1) - num(b.limitPrice, state.market.currentPrice || 1)
                : num(b.limitPrice, state.market.currentPrice || 1) - num(a.limitPrice, state.market.currentPrice || 1));
        let remaining = num(order.remaining, order.amount);
        for (const candidate of candidates) {
            if (remaining <= 0) break;
            const candidatePrice = num(candidate.limitPrice, state.market.currentPrice || 1);
            if (!canOrdersMatch(order, candidate, state.market.currentPrice || 1)) continue;
            const amount = Math.min(remaining, num(candidate.remaining, 0));
            if (amount <= 0) continue;
            const success = await settleTrade({
                buyer: order.side === 'buy' ? order.user : candidate.user,
                seller: order.side === 'sell' ? order.user : candidate.user,
                buyOrderId: order.side === 'buy' ? order.id : candidate.id,
                sellOrderId: order.side === 'sell' ? order.id : candidate.id,
                amount,
                price: candidatePrice || num(order.limitPrice, state.market.currentPrice || 1),
                desiredAsset: candidate.desiredAsset || order.desiredAsset,
                source: candidate.source || order.source,
                executionType: fulfillExisting ? 'manual-match' : order.orderType
            });
            if (!success) continue;
            remaining = Number((remaining - amount).toFixed(4));
            const candidateRemaining = Number((num(candidate.remaining, 0) - amount).toFixed(4));
            await Promise.all([
                getDb().ref(`marketOrders/${order.id}`).update({ remaining, status: remaining > 0 ? 'open' : 'filled', updatedAt: Date.now() }),
                getDb().ref(`marketOrders/${candidate.id}`).update({ remaining: candidateRemaining, status: candidateRemaining > 0 ? 'open' : 'filled', updatedAt: Date.now() })
            ]);
        }
        renderExchangeHub();
    }

    function renderExchangeHub() {
        renderExchangeStats();
        renderOrderBook('sell', 'exchange-book-sell');
        renderOrderBook('buy', 'exchange-book-buy');
        renderMyOrders();
        renderTradeHistory();
        renderLargestTrades();
        renderCandles();
    }

    async function refreshExchangeView() {
        await renderAllUsersStats();
        renderExchangeHub();
    }

    function renderAll() {
        renderNews();
        renderExchangeHub();
        renderBalanceHub();
        renderProfileHub();
        renderAchievementsHub();
        renderNotificationCenter();
    }

    function maybeNotifyAboutNews() {
        if (!state.accountHub) return;
        if (!state.knownNewsIds.size) {
            state.knownNewsIds = new Set(state.news.map(item => item.id).filter(Boolean));
            return;
        }
        const currentIds = new Set(state.news.map(item => item.id).filter(Boolean));
        state.news.forEach(item => {
            if (!item?.id || state.knownNewsIds.has(item.id)) return;
            if (state.bootstrappedUser) {
                appendLocalNotification({ type: 'news', level: 'info', title: `📰 ${item.title || 'Нова новина'}`, message: item.text || 'Є нове оголошення від адміністрації.' });
            }
        });
        state.knownNewsIds = currentIds;
    }

    function attachRealtimeListeners() {
        detachRealtimeListeners();
        const db = getDb();
        state.marketListener = db.ref('market').on('value', snap => {
            state.market = { ...state.market, ...(snap.val() || {}) };
            renderExchangeStats();
            renderCandles();
        });
        state.tradeListener = db.ref('marketTrades').limitToLast(MAX_TRADE_RECORDS).on('value', snap => {
            const raw = snap.val() || {};
            state.trades = Object.values(raw).sort((a, b) => num(a.timestamp, 0) - num(b.timestamp, 0));
            renderExchangeHub();
        });
        state.orderListener = db.ref('marketOrders').limitToLast(400).on('value', snap => {
            const raw = snap.val() || {};
            state.orders = Object.values(raw).sort((a, b) => num(b.createdAt, 0) - num(a.createdAt, 0));
            renderExchangeHub();
        });
        state.newsListener = db.ref('newsPosts').limitToLast(200).on('value', snap => {
            const raw = snap.val() || {};
            state.news = Object.entries(raw).map(([id, value]) => ({ id, ...(value || {}) }));
            renderNews();
            maybeNotifyAboutNews();
        });
    }

    function detachRealtimeListeners() {
        const db = getDb();
        if (state.marketListener) db.ref('market').off('value', state.marketListener);
        if (state.tradeListener) db.ref('marketTrades').off('value', state.tradeListener);
        if (state.orderListener) db.ref('marketOrders').off('value', state.orderListener);
        if (state.newsListener) db.ref('newsPosts').off('value', state.newsListener);
        state.marketListener = null;
        state.tradeListener = null;
        state.orderListener = null;
        state.newsListener = null;
    }

    async function onUserAuthenticated() {
        if (!gameState?.user || state.bootstrappedUser === gameState.user) return;
        state.bootstrappedUser = gameState.user;
        await ensureMarketInitialized();
        await Promise.all([loadUserProgress(), loadAccountHub(), renderAllUsersStats()]);
        await processLoginStreak();
        state.isAdmin = await isAdminUser(gameState.user);
        const form = document.getElementById('news-admin-form');
        if (form) form.style.display = state.isAdmin ? 'block' : 'none';
        attachRealtimeListeners();
        await evaluateAchievements();
        renderAll();
    }

    function onUserLoggedOut() {
        detachRealtimeListeners();
        state.bootstrappedUser = null;
        state.userProgress = null;
        state.accountHub = null;
        state.isAdmin = false;
        state.knownNewsIds = new Set();
        state.selectedCandleIndex = null;
    }

    function changeChartRange(range) {
        state.chartRange = range;
        updateMiniTabState('chart-range-tabs', 'range', range);
        renderCandles();
    }

    function handleExtendedTabOpen(tabNum) {
        if (tabNum === 7) renderNews();
        if (tabNum === 11) renderExchangeHub();
        if (tabNum === 12) renderBalanceHub();
        if (tabNum === 13) renderProfileHub();
        if (tabNum === 14) renderAchievementsHub();
        if (tabNum === 15) renderNotificationCenter();
    }

    function wrapAsync(name, callback) {
        const original = window[name];
        if (typeof original !== 'function') {
            console.warn(`⚠️ wrapAsync: ${name} недоступна`);
            return;
        }
        window[name] = async function(...args) {
            const beforeBalance = num(gameState?.balance, 0);
            try {
                const result = await original.apply(this, args);
                await callback({ args, result, beforeBalance, afterBalance: num(gameState?.balance, 0) });
                return result;
            } catch (error) {
                console.error(`❌ Помилка у ${name}:`, error);
                throw error;
            }
        };
    }

    wrapAsync('shopAction', async ({ beforeBalance, afterBalance }) => {
        if (afterBalance < beforeBalance) {
            const amount = Number((beforeBalance - afterBalance).toFixed(4));
            await appendLocalTransaction({ direction: 'expense', amount, source: 'shop', reason: 'Покупка в магазині', details: 'Новий предмет акаунта' });
            await appendLocalNotification({ type: 'shop', level: 'success', title: '🛍️ Нова покупка', message: `Списано ${amount.toFixed(4)} BB за предмет магазину.` });
            await updateLocalStats({ shopPurchases: 1 });
            await evaluateAchievements();
        }
    });

    wrapAsync('purchaseWorkshopItem', async ({ beforeBalance, afterBalance, args }) => {
        if (afterBalance < beforeBalance) {
            const amount = Number((beforeBalance - afterBalance).toFixed(4));
            await appendLocalTransaction({ direction: 'expense', amount, source: 'workshop', reason: 'Покупка авторського предмета', details: args[0] || 'Предмет майстерні' });
            await appendLocalNotification({ type: 'shop', level: 'success', title: '🎨 Авторський предмет куплено', message: `Списано ${amount.toFixed(4)} BB.` });
            await updateLocalStats({ workshopPurchases: 1 });
        }
    });

    wrapAsync('buyRealEstate', async ({ beforeBalance, afterBalance, args }) => {
        if (afterBalance < beforeBalance) {
            await appendLocalTransaction({ direction: 'expense', amount: Number((beforeBalance - afterBalance).toFixed(4)), source: 'estate', reason: 'Купівля нерухомості', details: args[0] || 'estate' });
        }
    });
    wrapAsync('collectRealEstateIncome', async ({ beforeBalance, afterBalance, args }) => {
        if (afterBalance > beforeBalance) {
            await appendLocalTransaction({ direction: 'income', amount: Number((afterBalance - beforeBalance).toFixed(4)), source: 'estate', reason: 'Прибуток з нерухомості', details: args[0] || 'estate' });
            await updateLocalStats({ totalProfit: Number((afterBalance - beforeBalance).toFixed(4)) });
        }
    });
    wrapAsync('buyCar', async ({ beforeBalance, afterBalance, args }) => {
        if (afterBalance < beforeBalance) {
            await appendLocalTransaction({ direction: 'expense', amount: Number((beforeBalance - afterBalance).toFixed(4)), source: 'cars', reason: 'Купівля авто', details: args[0] || 'car' });
        }
    });
    wrapAsync('sellCar', async ({ beforeBalance, afterBalance, args }) => {
        if (afterBalance > beforeBalance) {
            await appendLocalTransaction({ direction: 'income', amount: Number((afterBalance - beforeBalance).toFixed(4)), source: 'cars', reason: 'Продаж авто', details: args[0] || 'car' });
            await updateLocalStats({ totalProfit: Number((afterBalance - beforeBalance).toFixed(4)) });
        }
    });
    wrapAsync('transferCoinsFirebase', async ({ args, result }) => {
        if (!result) return;
        const [, recipient, amountRaw] = args;
        const amount = num(amountRaw, 0);
        if (amount > 0) {
            await appendLocalTransaction({ direction: 'expense', amount, source: 'transfer', reason: 'Переказ іншому гравцю', details: `Отримувач: ${recipient}`, counterparty: recipient });
            await appendLocalNotification({ type: 'gift', level: 'info', title: '🎁 Переказ відправлено', message: `${amount.toFixed(4)} BB → ${recipient}` });
            await updateLocalStats({ giftsSent: 1 });
            if (recipient) {
                await Promise.all([
                    writeRemoteHubEntry(recipient, 'transactions', { direction: 'income', amount, source: 'transfer', reason: 'Подарунок', details: `Від ${gameState.user}`, counterparty: gameState.user, createdAt: Date.now() }),
                    writeRemoteHubEntry(recipient, 'notifications', { type: 'gift', level: 'success', title: '🎁 Отримано подарунок', message: `${gameState.user} надіслав ${amount.toFixed(4)} BB`, createdAt: Date.now() })
                ]);
            }
        }
    });

    const baseAuth = window.auth;
    if (typeof baseAuth === 'function') {
        window.auth = async function(...args) {
            const result = await baseAuth.apply(this, args);
            if (gameState?.user) await onUserAuthenticated();
            return result;
        };
    }

    const baseLogout = window.logout;
    if (typeof baseLogout === 'function') {
        window.logout = function(...args) {
            onUserLoggedOut();
            return baseLogout.apply(this, args);
        };
    }

    const baseSendFriendRequestFirebase = window.sendFriendRequestFirebase;
    if (typeof baseSendFriendRequestFirebase === 'function') {
        window.sendFriendRequestFirebase = async function(fromUser, toUser) {
            const ok = await baseSendFriendRequestFirebase(fromUser, toUser);
            if (ok && gameState?.user && fromUser === gameState.user) {
                await addProgress({ invitedFriends: 1 });
                await appendLocalNotification({ type: 'social', level: 'info', title: '👥 Запит на дружбу', message: `Запит надіслано ${toUser}` });
            }
            return ok;
        };
    }

    const baseUpdateHeader = window.updateHeader;
    if (typeof baseUpdateHeader === 'function') {
        window.updateHeader = function(...args) {
            const result = baseUpdateHeader.apply(this, args);
            renderBalanceHub();
            renderProfileHub();
            renderAchievementsHub();
            renderExchangeStats();
            return result;
        };
    }

    const balanceSearch = document.getElementById('balance-search');
    if (balanceSearch) balanceSearch.addEventListener('input', () => renderBalanceHub());
    const notificationSearch = document.getElementById('notifications-search');
    if (notificationSearch) notificationSearch.addEventListener('input', () => renderNotificationCenter());
    const exchangeSearch = document.getElementById('exchange-order-search');
    if (exchangeSearch) exchangeSearch.addEventListener('input', () => renderExchangeHub());

    window.handleExtendedTabOpen = handleExtendedTabOpen;
    window.bbFeatures = {
        publishNews,
        placeExchangeOrder,
        matchExchangeOrder,
        fulfillOrder,
        cancelOrder,
        changeChartRange,
        refreshExchangeView,
        renderBalanceHub,
        renderNotificationCenter,
        selectCandle,
        addProgress
    };
})();
