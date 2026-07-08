(() => {
    if (typeof firebase === 'undefined') return;

    const MIN_PRICE = 0.000001;
    const REQUIRED_BB_SIDE_COUNT = 1;
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

    function toAssetKey(asset) {
        if (!asset?.type) return '';
        return `${asset.type}:${asset.id || ''}`;
    }

    function parseAssetKey(value) {
        const [type, id] = String(value || '').split(':');
        if (type === 'bb') return { type: 'bb', id: null };
        if (type === 'car' || type === 'estate') return { type, id: id || null };
        return null;
    }

    function getCarName(carId) {
        if (typeof getCarDefinition === 'function') {
            const definition = getCarDefinition(carId);
            if (definition?.name) return definition.name;
        }
        return carId || 'Авто';
    }

    function getEstateName(propertyId) {
        if (typeof getRealEstateDefinition === 'function') {
            const definition = getRealEstateDefinition(propertyId);
            if (definition?.name) return definition.name;
        }
        return propertyId || 'Нерухомість';
    }

    function formatAssetLabel(asset) {
        if (!asset || !asset.type) return '—';
        if (asset.type === 'bb') {
            return `${Number(asset.bbAmount || 0).toFixed(4)} BB`;
        }
        if (asset.type === 'car') {
            return `🚗 ${getCarName(asset.id)}`;
        }
        if (asset.type === 'estate') {
            return `🏠 ${getEstateName(asset.id)}`;
        }
        return '—';
    }

    function getOwnedOrderAssets() {
        const options = [{ value: 'bb:', label: '💰 BB Coin' }];
        Object.keys(carsState?.ownedCars || {}).forEach(carId => {
            options.push({ value: `car:${carId}`, label: `🚗 Моє авто: ${getCarName(carId)}` });
        });
        Object.keys(realEstateState?.properties || {}).forEach(propertyId => {
            options.push({ value: `estate:${propertyId}`, label: `🏠 Моя нерухомість: ${getEstateName(propertyId)}` });
        });
        return options;
    }

    function getDesiredOrderAssets() {
        const options = [{ value: 'bb:', label: '💰 BB Coin' }];
        if (typeof carsCatalog !== 'undefined' && Array.isArray(carsCatalog)) {
            carsCatalog.forEach(item => options.push({ value: `car:${item.id}`, label: `🚗 ${item.name}` }));
        }
        if (typeof realEstateCatalog !== 'undefined' && Array.isArray(realEstateCatalog)) {
            realEstateCatalog.forEach(item => options.push({ value: `estate:${item.id}`, label: `🏠 ${item.name}` }));
        }
        return options;
    }

    function fillSelectOptions(selectId, options, selectedValue) {
        const select = document.getElementById(selectId);
        if (!select) return;
        const previous = selectedValue || select.value;
        select.innerHTML = '';
        options.forEach(item => {
            const option = document.createElement('option');
            option.value = String(item.value ?? '');
            option.textContent = String(item.label ?? '');
            select.appendChild(option);
        });
        if (options.some(item => item.value === previous)) {
            select.value = previous;
        }
    }

    function renderExchangeAssetSelectors() {
        const ownedOptions = getOwnedOrderAssets();
        const desiredOptions = getDesiredOrderAssets();
        fillSelectOptions('exchange-order-offer', ownedOptions);
        fillSelectOptions('exchange-order-want', desiredOptions);
        fillSelectOptions('exchange-search-offer', [{ value: 'all', label: 'Віддають: усе' }, ...desiredOptions.map(item => ({ value: item.value, label: `Віддають: ${item.label}` }))]);
        fillSelectOptions('exchange-search-want', [{ value: 'all', label: 'Хочуть: усе' }, ...desiredOptions.map(item => ({ value: item.value, label: `Хочуть: ${item.label}` }))]);
    }

    function getOpenOrders() {
        return state.orders.filter(order => order && order.status === 'open');
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

    function getOrderBucket(order) {
        if (order?.offer?.type === 'bb') return 'sell';
        if (order?.want?.type === 'bb') return 'buy';
        if (order?.side === 'sell') return 'sell';
        if (order?.side === 'buy') return 'buy';
        return 'other';
    }

    function orderMatchesSearchFilters(order) {
        const search = getExchangeSearch();
        const offerFilter = document.getElementById('exchange-search-offer')?.value || 'all';
        const wantFilter = document.getElementById('exchange-search-want')?.value || 'all';
        const bbMin = num(document.getElementById('exchange-search-bb-amount')?.value, 0);
        if (offerFilter !== 'all' && toAssetKey(order.offer) !== offerFilter) return false;
        if (wantFilter !== 'all' && toAssetKey(order.want) !== wantFilter) return false;
        if (bbMin > 0 && num(order.bbAmount, 0) < bbMin) return false;
        if (!search) return true;
        const haystack = [
            order.user,
            order.creatorDisplayName,
            formatAssetLabel(order.offer),
            formatAssetLabel(order.want),
            order.summary
        ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
        return haystack.includes(search);
    }

    function getFilteredOpenOrders(side) {
        return getOpenOrders()
            .filter(order => getOrderBucket(order) === side)
            .filter(orderMatchesSearchFilters)
            .sort((a, b) => num(b.createdAt, 0) - num(a.createdAt, 0));
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
                        <div class="order-meta"><span>${escapeText(side === 'sell' ? 'Продає BB' : 'Купує BB')}</span><span>${new Date(order.createdAt).toLocaleString('uk-UA')}</span></div>
                    </div>
                    <span class="pill ${side === 'sell' ? 'sell' : 'buy'}">${side === 'sell' ? 'SELL' : 'BUY'}</span>
                </div>
                <div style="font-size:13px; font-weight:900; color:var(--p);">${escapeText(formatAssetLabel(order.offer))} ⇄ ${escapeText(formatAssetLabel(order.want))}</div>
                <div class="hub-note">${escapeText(order.summary || 'Обмін між гравцями')}</div>
                ${order.user !== gameState?.user && order.offer && order.want ? `<div class="feature-actions"><button class="shop-item-btn" onclick="bbFeatures.fulfillOrder('${order.id}')">Виконати</button></div>` : ''}
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
                        <div style="font-size:12px; font-weight:900; color:var(--p);">${escapeText(order.summary || 'Обмін')}</div>
                        <div class="order-meta"><span>${new Date(order.createdAt).toLocaleString('uk-UA')}</span><span>Статус: ${escapeText(order.status || 'open')}</span></div>
                    </div>
                    <span class="pill ${getOrderBucket(order) === 'buy' ? 'buy' : 'sell'}">${escapeText(getOrderBucket(order).toUpperCase())}</span>
                </div>
                <div class="hub-note">${escapeText(formatAssetLabel(order.offer))} ⇄ ${escapeText(formatAssetLabel(order.want))}</div>
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
                    <span class="pill info">${escapeText(formatAssetLabel(trade.offer))}</span>
                </div>
                <div class="hub-note">${escapeText(formatAssetLabel(trade.offer))} ⇄ ${escapeText(formatAssetLabel(trade.want))}</div>
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
        const offer = parseAssetKey(document.getElementById('exchange-order-offer')?.value || '');
        const want = parseAssetKey(document.getElementById('exchange-order-want')?.value || '');
        const bbAmount = num(document.getElementById('exchange-order-bb-amount')?.value, 0);
        if (offer?.type === 'bb') offer.bbAmount = bbAmount;
        if (want?.type === 'bb') want.bbAmount = bbAmount;
        return {
            offer,
            want,
            bbAmount
        };
    }

    function buildOrderSummary(offer, want) {
        return `${formatAssetLabel(offer)} → ${formatAssetLabel(want)}`;
    }

    function hasCurrentUserAsset(asset) {
        if (!asset || asset.type === 'bb') return true;
        if (asset.type === 'car') return !!carsState?.ownedCars?.[asset.id];
        if (asset.type === 'estate') return !!realEstateState?.properties?.[asset.id];
        return false;
    }

    function normalizeEstateState(raw) {
        if (typeof normalizeRealEstateState === 'function') return normalizeRealEstateState(raw);
        return { properties: raw?.properties && typeof raw.properties === 'object' ? { ...raw.properties } : {} };
    }

    function normalizeCarsStateSafe(raw) {
        if (typeof normalizeCarsState === 'function') return normalizeCarsState(raw);
        return {
            ownedCars: raw?.ownedCars && typeof raw.ownedCars === 'object' ? { ...raw.ownedCars } : {},
            activeCarId: raw?.activeCarId || null,
            prestige: num(raw?.prestige, 0)
        };
    }

    async function transferAssetBetweenUsers(asset, fromUser, toUser) {
        if (!asset || asset.type === 'bb') return { success: true };
        const featureKey = asset.type === 'car' ? 'carsData' : 'realEstate';
        const [fromRaw, toRaw] = await Promise.all([
            loadUserFeatureStateFirebase(fromUser, featureKey),
            loadUserFeatureStateFirebase(toUser, featureKey)
        ]);
        const fromState = asset.type === 'car' ? normalizeCarsStateSafe(fromRaw) : normalizeEstateState(fromRaw);
        const toState = asset.type === 'car' ? normalizeCarsStateSafe(toRaw) : normalizeEstateState(toRaw);
        const fromCollectionKey = asset.type === 'car' ? 'ownedCars' : 'properties';
        const transferPayload = fromState?.[fromCollectionKey]?.[asset.id];
        if (!transferPayload) {
            return { success: false, error: `У ${fromUser} вже немає цього предмета.` };
        }
        if (toState?.[fromCollectionKey]?.[asset.id]) {
            return { success: false, error: `${toUser} уже володіє цим предметом.` };
        }
        delete fromState[fromCollectionKey][asset.id];
        toState[fromCollectionKey][asset.id] = transferPayload;
        if (asset.type === 'car') {
            if (fromState.activeCarId === asset.id) {
                fromState.activeCarId = Object.keys(fromState.ownedCars || {})[0] || null;
            }
            if (!toState.activeCarId) {
                toState.activeCarId = asset.id;
            }
        }
        await Promise.all([
            saveUserFeatureStateFirebase(fromUser, featureKey, fromState),
            saveUserFeatureStateFirebase(toUser, featureKey, toState)
        ]);
        if (fromUser === gameState?.user) {
            if (asset.type === 'car') {
                carsState = fromState;
                if (typeof renderCarsTab === 'function') renderCarsTab();
            } else {
                realEstateState = fromState;
                if (typeof renderRealEstateTab === 'function') renderRealEstateTab();
            }
        }
        if (toUser === gameState?.user) {
            if (asset.type === 'car') {
                carsState = toState;
                if (typeof renderCarsTab === 'function') renderCarsTab();
            } else {
                realEstateState = toState;
                if (typeof renderRealEstateTab === 'function') renderRealEstateTab();
            }
        }
        return { success: true };
    }

    async function transferCoins(fromUser, toUser, amount) {
        const debit = await adjustUserBalanceFirebase(fromUser, -amount);
        if (!debit.success) {
            return { success: false };
        }
        const credit = await adjustUserBalanceFirebase(toUser, amount);
        if (!credit.success) {
            await adjustUserBalanceFirebase(fromUser, amount);
            return { success: false };
        }
        if (fromUser === gameState?.user) {
            gameState.balance = debit.balance;
            updateCachedUser(gameState.user, { balance: debit.balance });
        }
        if (toUser === gameState?.user) {
            gameState.balance = credit.balance;
            updateCachedUser(gameState.user, { balance: credit.balance });
        }
        return { success: true };
    }

    async function placeExchangeOrder() {
        if (!gameState?.user) {
            alert('Спочатку увійдіть в акаунт.');
            return;
        }
        const payload = getOrderInputs();
        if (!payload.offer || !payload.want) {
            alert('Оберіть предмети для обміну.');
            return;
        }
        if (toAssetKey(payload.offer) === toAssetKey(payload.want)) {
            alert('Предмети обміну не можуть бути однаковими.');
            return;
        }
        const bbSides = [payload.offer.type, payload.want.type].filter(type => type === 'bb').length;
        if (bbSides !== REQUIRED_BB_SIDE_COUNT) {
            alert('Одна сторона обміну має бути BB Coin, інша — авто або нерухомість.');
            return;
        }
        if (payload.bbAmount <= 0) {
            alert('Вкажіть коректну кількість BB.');
            return;
        }
        if (payload.offer.type !== 'bb' && !hasCurrentUserAsset(payload.offer)) {
            alert('Ви не володієте цим предметом.');
            return;
        }
        if (payload.offer.type === 'bb' && num(gameState.balance, 0) < payload.bbAmount) {
            alert('Недостатньо BB для цієї заявки.');
            return;
        }
        const ref = getDb().ref('marketOrders').push();
        const summary = buildOrderSummary(payload.offer, payload.want);
        const order = {
            id: ref.key,
            user: gameState.user,
            creatorDisplayName: gameState.displayName || gameState.user,
            offer: payload.offer,
            want: payload.want,
            bbAmount: Number(payload.bbAmount.toFixed(4)),
            amount: Number(payload.bbAmount.toFixed(4)),
            remaining: Number(payload.bbAmount.toFixed(4)),
            summary,
            status: 'open',
            createdAt: Date.now(),
            updatedAt: Date.now()
        };
        await ref.set(order);
        const amountInput = document.getElementById('exchange-order-bb-amount');
        if (amountInput) amountInput.value = '';
        await appendLocalNotification({ type: 'exchange', level: 'info', title: '💹 Нова заявка на біржі', message: summary });
        renderExchangeHub();
    }

    async function matchExchangeOrder() {
        renderExchangeHub();
    }

    async function fulfillOrder(orderId) {
        const target = state.orders.find(item => item.id === orderId);
        if (!target || target.user === gameState?.user || target.status !== 'open') return;
        const creator = target.user;
        const executor = gameState?.user;
        const offer = target.offer;
        const want = target.want;
        const bbAmount = num(target.bbAmount, 0);
        if (!offer || !want || !executor) return;
        if (want.type !== 'bb' && !hasCurrentUserAsset(want)) {
            alert('Для виконання заявки у вас має бути потрібний предмет.');
            return;
        }
        if (want.type === 'bb' && num(gameState?.balance, 0) < bbAmount) {
            alert('Недостатньо BB для виконання заявки.');
            return;
        }

        let coinTransferDone = false;
        if (bbAmount > 0) {
            const payer = offer.type === 'bb' ? creator : executor;
            const receiver = offer.type === 'bb' ? executor : creator;
            const coinResult = await transferCoins(payer, receiver, bbAmount);
            if (!coinResult.success) {
                alert('Не вдалося провести переказ BB. Перевірте баланс сторін.');
                return;
            }
            coinTransferDone = true;
        }

        const assetToTransfer = offer.type === 'bb' ? want : offer;
        const assetFrom = offer.type === 'bb' ? executor : creator;
        const assetTo = offer.type === 'bb' ? creator : executor;
        const assetResult = await transferAssetBetweenUsers(assetToTransfer, assetFrom, assetTo);
        if (!assetResult.success) {
            if (coinTransferDone && bbAmount > 0) {
                const rollbackFrom = offer.type === 'bb' ? executor : creator;
                const rollbackTo = offer.type === 'bb' ? creator : executor;
                await transferCoins(rollbackFrom, rollbackTo, bbAmount);
            }
            alert(assetResult.error || 'Не вдалося передати предмет.');
            return;
        }

        if (typeof updateHeader === 'function') updateHeader();

        const tradeRef = getDb().ref('marketTrades').push();
        const trade = {
            id: tradeRef.key,
            buyer: executor,
            seller: creator,
            buyOrderId: offer.type === 'bb' ? orderId : null,
            sellOrderId: offer.type === 'bb' ? null : orderId,
            amount: Number(bbAmount.toFixed(4)),
            price: Number(Math.max(MIN_PRICE, state.market.currentPrice || 1).toFixed(6)),
            offer,
            want,
            summary: target.summary || buildOrderSummary(offer, want),
            executionType: 'manual-execute',
            timestamp: Date.now()
        };
        await tradeRef.set(trade);
        await Promise.all([
            getDb().ref('market').update({
                currentPrice: trade.price,
                totalVolume: num(state.market.totalVolume, 0) + trade.amount,
                completedTrades: num(state.market.completedTrades, 0) + 1,
                lastUpdated: trade.timestamp,
                lastTradeAt: trade.timestamp
            }),
            getDb().ref(`marketOrders/${orderId}`).update({ status: 'filled', remaining: 0, updatedAt: Date.now(), fulfilledBy: executor, fulfilledAt: trade.timestamp })
        ]);

        // Якщо creator віддає BB (offer=bb) — це витрата для creator і надходження для executor.
        // Якщо creator віддає актив (offer!=bb) — creator отримує BB, executor витрачає BB.
        const creatorDirection = offer.type === 'bb' ? 'expense' : 'income';
        const executorDirection = offer.type === 'bb' ? 'income' : 'expense';
        await Promise.all([
            writeRemoteHubEntry(creator, 'transactions', { direction: creatorDirection, amount: trade.amount, source: 'exchange', reason: 'Виконана біржова заявка', details: `${formatAssetLabel(offer)} ⇄ ${formatAssetLabel(want)}`, counterparty: executor, createdAt: trade.timestamp }),
            writeRemoteHubEntry(executor, 'transactions', { direction: executorDirection, amount: trade.amount, source: 'exchange', reason: 'Виконана біржова заявка', details: `${formatAssetLabel(offer)} ⇄ ${formatAssetLabel(want)}`, counterparty: creator, createdAt: trade.timestamp }),
            writeRemoteHubEntry(creator, 'notifications', { type: 'exchange', level: 'success', title: '✅ Заявку виконано', message: `${executor} виконав вашу заявку: ${trade.summary}`, createdAt: trade.timestamp }),
            writeRemoteHubEntry(executor, 'notifications', { type: 'exchange', level: 'success', title: '✅ Угоду виконано', message: `Виконано: ${trade.summary}`, createdAt: trade.timestamp })
        ]);
        if (creator === gameState?.user || executor === gameState?.user) {
            const localBbIncome = (creator === gameState?.user && creatorDirection === 'income') || (executor === gameState?.user && executorDirection === 'income') ? trade.amount : 0;
            const localBbExpense = (creator === gameState?.user && creatorDirection === 'expense') || (executor === gameState?.user && executorDirection === 'expense') ? trade.amount : 0;
            await updateLocalStats({ totalTrades: 1, exchangeVolume: trade.amount, totalProfit: localBbIncome });
            await addProgress({ totalDeals: 1, totalBought: localBbIncome, totalSold: localBbExpense });
            await evaluateAchievements();
        }
        await appendLocalNotification({ type: 'exchange', level: 'success', title: '🤝 Угоду завершено', message: trade.summary });
        renderExchangeHub();
    }

    async function cancelOrder(orderId) {
        await getDb().ref(`marketOrders/${orderId}`).update({ status: 'cancelled', remaining: 0, updatedAt: Date.now() });
        await appendLocalNotification({ type: 'exchange', level: 'warning', title: '🚫 Ордер скасовано', message: `Ордер ${orderId} знято з книги.` });
        renderExchangeHub();
    }

    function renderExchangeHub() {
        renderExchangeAssetSelectors();
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
        renderExchangeAssetSelectors();
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
    const exchangeSearchOffer = document.getElementById('exchange-search-offer');
    if (exchangeSearchOffer) exchangeSearchOffer.addEventListener('change', () => renderExchangeHub());
    const exchangeSearchWant = document.getElementById('exchange-search-want');
    if (exchangeSearchWant) exchangeSearchWant.addEventListener('change', () => renderExchangeHub());
    const exchangeSearchAmount = document.getElementById('exchange-search-bb-amount');
    if (exchangeSearchAmount) exchangeSearchAmount.addEventListener('input', () => renderExchangeHub());

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
