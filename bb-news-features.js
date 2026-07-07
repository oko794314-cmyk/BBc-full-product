(() => {
    if (typeof firebase === 'undefined') return;

    const ADMIN_USERS = new Set(['admin', 'administrator', 'oko794314-cmyk']);
    const QUESTS = [
        { id: 'buy_100', title: 'Купити 100 BB Coin', key: 'totalBought', target: 100, reward: { bb: 10, title: 'Трейдер' } },
        { id: 'sell_50', title: 'Продати 50 BB Coin', key: 'totalSold', target: 50, reward: { bb: 8 } },
        { id: 'login_7_days', title: 'Зайти 7 днів поспіль', key: 'loginStreak', target: 7, reward: { bb: 15, frame: 'frame_gold' } },
        { id: 'deals_10', title: 'Зробити 10 угод', key: 'totalDeals', target: 10, reward: { bb: 12 } },
        { id: 'earn_1000', title: 'Заробити 1000 BB Coin', key: 'cumulativeEarned', target: 1000, reward: { bb: 25, background: 'bg_space' } },
        { id: 'invite_friend', title: 'Запросити друга', key: 'invitedFriends', target: 1, reward: { bb: 6 } }
    ];

    const state = {
        chartRange: '24h',
        tournamentPeriod: 'daily',
        market: {
            currentPrice: 1,
            totalSupply: 0,
            circulatingSupply: 0,
            totalVolume: 0,
            totalPurchases: 0,
            totalSales: 0
        },
        trades: [],
        news: [],
        userProgress: null,
        marketListener: null,
        tradeListener: null,
        newsListener: null,
        bootstrappedUser: null
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
        const ms = next - prev;
        return Math.floor(ms / (24 * 60 * 60 * 1000));
    }

    async function ensureMarketInitialized() {
        const db = getDb();
        const marketRef = db.ref('market');
        const snap = await marketRef.once('value');
        if (snap.exists()) return;
        await marketRef.set({
            currentPrice: 1,
            totalSupply: 0,
            circulatingSupply: 0,
            totalVolume: 0,
            totalPurchases: 0,
            totalSales: 0,
            lastUpdated: firebase.database.ServerValue.TIMESTAMP
        });
    }

    async function loadUserProgress() {
        if (!gameState?.user) return;
        const db = getDb();
        const ref = db.ref(`userQuestProgress/${gameState.user}`);
        const snap = await ref.once('value');
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
        const db = getDb();
        await db.ref(`userQuestProgress/${gameState.user}`).set(state.userProgress);
    }

    async function addProgress(delta = {}) {
        if (!state.userProgress) await loadUserProgress();
        if (!state.userProgress) return;
        Object.keys(delta).forEach((key) => {
            state.userProgress[key] = num(state.userProgress[key], 0) + num(delta[key], 0);
        });
        await resolveCompletedQuests();
        await saveUserProgress();
        renderQuests();
    }

    async function resolveCompletedQuests() {
        if (!state.userProgress || !gameState?.user) return;
        for (const quest of QUESTS) {
            const currentValue = num(state.userProgress[quest.key], 0);
            if (currentValue < quest.target || state.userProgress.completed[quest.id]) continue;
            state.userProgress.completed[quest.id] = true;

            const reward = quest.reward || {};
            let rewardText = [];
            if (num(reward.bb, 0) > 0) {
                gameState.balance = num(gameState.balance, 0) + num(reward.bb, 0);
                rewardText.push(`${reward.bb} BB`);
                await getDb().ref(`users/${gameState.user}/balance`).set(gameState.balance);
                if (typeof updateHeader === 'function') updateHeader();
            }
            if (reward.title && !state.userProgress.titles.includes(reward.title)) {
                state.userProgress.titles.push(reward.title);
                rewardText.push(`титул "${reward.title}"`);
            }
            if (reward.frame && !state.userProgress.frames.includes(reward.frame)) {
                state.userProgress.frames.push(reward.frame);
                rewardText.push(`рамка ${reward.frame}`);
            }
            if (reward.background && !state.userProgress.backgrounds.includes(reward.background)) {
                state.userProgress.backgrounds.push(reward.background);
                rewardText.push(`фон ${reward.background}`);
            }
            if (typeof showGameNotification === 'function') {
                showGameNotification(`🏆 Квест "${quest.title}" виконано! Нагорода: ${rewardText.join(', ') || 'отримано'}`);
            }
        }
    }

    function renderNews() {
        const root = document.getElementById('news-list');
        if (!root) return;
        const sorted = [...(state.news || [])].sort((a, b) => {
            const pinA = a?.pinned ? 1 : 0;
            const pinB = b?.pinned ? 1 : 0;
            if (pinA !== pinB) return pinB - pinA;
            return num(b?.createdAt, 0) - num(a?.createdAt, 0);
        });
        if (!sorted.length) {
            root.innerHTML = `<div class="news-card"><div style="font-size:11px; color:#888;">Поки що новин немає.</div></div>`;
            return;
        }
        root.innerHTML = sorted.map(item => {
            const date = item?.date || (item?.createdAt ? new Date(item.createdAt).toLocaleString('uk-UA') : '--');
            const title = escapeText(item?.title || 'Без заголовка');
            const text = escapeText(item?.text || '');
            const author = escapeText(item?.author || 'Адміністрація');
            const image = item?.image ? `<img class="news-image" src="${escapeText(item.image)}" alt="news image">` : '';
            const pinned = item?.pinned ? `<span style="color:var(--gold);">📌 Закріплено</span>` : '';
            return `
                <article class="news-card ${item?.pinned ? 'pinned' : ''}">
                    <div class="news-meta">${pinned}<span>👤 ${author}</span><span>🕒 ${escapeText(date)}</span></div>
                    <div style="font-size:13px; font-weight:900; color:var(--p); margin-bottom:6px;">${title}</div>
                    <div style="font-size:11px; line-height:1.45; color:#ddd; white-space:pre-wrap;">${text}</div>
                    ${image}
                </article>
            `;
        }).join('');
    }

    function usersArray() {
        return Object.entries(allUsers || {}).map(([username, data]) => ({
            username,
            balance: num(data?.balance, 0),
            online: data?.online === true,
            createdAt: data?.createdAt || ''
        }));
    }

    function renderStats() {
        const root = document.getElementById('market-stats');
        if (!root) return;
        const users = usersArray();
        const onlineUsers = users.filter(u => u.online).length;
        const today = getDateKey();
        const newToday = users.filter(u => {
            if (!u.createdAt) return false;
            return getDateKey(u.createdAt) === today;
        }).length;
        const richest = users.slice().sort((a, b) => b.balance - a.balance)[0];
        const stats = [
            ['Поточний курс', `${num(state.market.currentPrice, 1).toFixed(6)} BB`],
            ['Загальна кількість BB Coin', num(state.market.totalSupply, 0).toFixed(4)],
            ['Монет в обігу', num(state.market.circulatingSupply, 0).toFixed(4)],
            ['Користувачів', String(users.length)],
            ['Користувачів онлайн', String(onlineUsers)],
            ['Нових користувачів сьогодні', String(newToday)],
            ['Загальний обсяг торгів', num(state.market.totalVolume, 0).toFixed(4)],
            ['Кількість покупок', String(Math.round(num(state.market.totalPurchases, 0)))],
            ['Кількість продажів', String(Math.round(num(state.market.totalSales, 0)))],
            ['Найбагатший користувач', richest ? `${escapeText(richest.username)} (${richest.balance.toFixed(4)} BB)` : '—']
        ];
        root.innerHTML = stats.map(([label, value]) => `
            <div class="market-stat">
                <div class="market-stat-label">${label}</div>
                <div class="market-stat-value">${value}</div>
            </div>
        `).join('');
    }

    function renderTop10() {
        const root = document.getElementById('market-top10');
        if (!root) return;
        const top = usersArray().sort((a, b) => b.balance - a.balance).slice(0, 10);
        if (!top.length) {
            root.innerHTML = `<div style="font-size:11px; color:#888;">Немає даних.</div>`;
            return;
        }
        root.innerHTML = `
            <table class="leaders-table">
                <thead><tr><th>#</th><th>Користувач</th><th>Баланс</th></tr></thead>
                <tbody>
                    ${top.map((u, idx) => `<tr><td>${idx + 1}</td><td>${escapeText(u.username)}</td><td>${u.balance.toFixed(4)} BB</td></tr>`).join('')}
                </tbody>
            </table>
        `;
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
        const filtered = (state.trades || [])
            .filter(t => num(t.timestamp, 0) >= start)
            .sort((a, b) => num(a.timestamp, 0) - num(b.timestamp, 0));
        if (!filtered.length) return [];

        const buckets = new Map();
        filtered.forEach(trade => {
            const key = Math.floor(num(trade.timestamp, 0) / bucketMs) * bucketMs;
            const price = num(trade.priceAfter, num(trade.priceBefore, 1));
            if (!buckets.has(key)) {
                buckets.set(key, { time: key, open: price, high: price, low: price, close: price });
            } else {
                const c = buckets.get(key);
                c.high = Math.max(c.high, price);
                c.low = Math.min(c.low, price);
                c.close = price;
            }
        });
        return Array.from(buckets.values()).sort((a, b) => a.time - b.time).slice(-48);
    }

    function renderCandles() {
        const svg = document.getElementById('market-candles');
        if (!svg) return;
        const candles = buildCandles(state.chartRange);
        if (!candles.length) {
            svg.innerHTML = `<text x="50%" y="50%" fill="#666" dominant-baseline="middle" text-anchor="middle" font-size="13">Недостатньо даних для графіка</text>`;
            return;
        }
        const width = 640;
        const height = 220;
        const pad = 20;
        const prices = candles.flatMap(c => [c.low, c.high]);
        const min = Math.min(...prices);
        const max = Math.max(...prices);
        const range = Math.max(max - min, 0.000001);
        const xStep = (width - pad * 2) / Math.max(candles.length, 1);
        const bodyW = Math.max(3, Math.min(10, xStep * 0.6));
        const y = p => height - pad - ((p - min) / range) * (height - pad * 2);
        const parts = [];
        candles.forEach((c, i) => {
            const cx = pad + (i * xStep) + xStep / 2;
            const yHigh = y(c.high);
            const yLow = y(c.low);
            const yOpen = y(c.open);
            const yClose = y(c.close);
            const up = c.close >= c.open;
            const color = up ? '#00ff88' : '#ff3366';
            const bodyY = Math.min(yOpen, yClose);
            const bodyH = Math.max(2, Math.abs(yOpen - yClose));
            parts.push(`<line x1="${cx}" y1="${yHigh}" x2="${cx}" y2="${yLow}" stroke="${color}" stroke-width="2" />`);
            parts.push(`<rect x="${cx - bodyW / 2}" y="${bodyY}" width="${bodyW}" height="${bodyH}" fill="${color}" opacity="0.75" />`);
        });
        parts.push(`<text x="${pad}" y="${pad - 4}" fill="#888" font-size="10">MAX ${max.toFixed(6)}</text>`);
        parts.push(`<text x="${pad}" y="${height - 6}" fill="#888" font-size="10">MIN ${min.toFixed(6)}</text>`);
        svg.innerHTML = parts.join('');
    }

    function getTournamentWindow(period) {
        const now = Date.now();
        if (period === 'daily') return now - 24 * 60 * 60 * 1000;
        if (period === 'weekly') return now - 7 * 24 * 60 * 60 * 1000;
        return now - 30 * 24 * 60 * 60 * 1000;
    }

    function renderTournaments() {
        const winnerEl = document.getElementById('tournament-winner');
        const boardEl = document.getElementById('tournament-leaderboard');
        if (!winnerEl || !boardEl) return;
        const start = getTournamentWindow(state.tournamentPeriod);
        const scores = {};
        (state.trades || []).forEach(tr => {
            if (num(tr.timestamp, 0) < start || !tr.user) return;
            const delta = tr.type === 'buy' ? num(tr.amount, 0) : -num(tr.amount, 0);
            scores[tr.user] = num(scores[tr.user], 0) + delta;
        });
        const leaders = Object.entries(scores)
            .map(([user, score]) => ({ user, score }))
            .sort((a, b) => b.score - a.score)
            .slice(0, 10);
        const winner = leaders[0];
        winnerEl.textContent = winner
            ? `🥇 Переможець (${state.tournamentPeriod}): ${winner.user} — ${winner.score.toFixed(4)}`
            : 'Переможець буде визначений автоматично після появи угод.';

        if (!leaders.length) {
            boardEl.innerHTML = `<div style="font-size:11px; color:#888;">Недостатньо угод для турнірної таблиці.</div>`;
            return;
        }
        boardEl.innerHTML = `
            <table class="leaders-table">
                <thead><tr><th>#</th><th>Користувач</th><th>Результат</th></tr></thead>
                <tbody>${leaders.map((l, i) => `<tr><td>${i + 1}</td><td>${escapeText(l.user)}</td><td>${l.score.toFixed(4)}</td></tr>`).join('')}</tbody>
            </table>
        `;
    }

    function renderQuests() {
        const root = document.getElementById('quests-list');
        if (!root) return;
        const progress = state.userProgress || getDefaultProgress();
        root.innerHTML = QUESTS.map(q => {
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
                    <div style="font-size:12px; color:${done ? 'var(--g)' : 'var(--p)'}; font-weight:900;">${done ? '✅' : '🎯'} ${q.title}</div>
                    <div class="quest-progress">${Math.min(current, q.target).toFixed(2)} / ${q.target.toFixed(2)} • Нагорода: ${reward.join(', ')}</div>
                    <div style="height:6px; background:#111; border-radius:999px; margin-top:6px; overflow:hidden;">
                        <div style="height:100%; width:${pct}%; background:${done ? 'var(--g)' : 'var(--p)'};"></div>
                    </div>
                </div>
            `;
        }).join('');
    }

    function updateMiniTabState(containerId, key, value) {
        const root = document.getElementById(containerId);
        if (!root) return;
        root.querySelectorAll('.mini-tab').forEach(btn => {
            btn.classList.toggle('active', btn.dataset[key] === value);
        });
    }

    async function refreshUsers() {
        try {
            allUsers = await loadAllUsersFromFirebase();
        } catch (_e) {}
    }

    async function renderAll() {
        await refreshUsers();
        renderNews();
        renderStats();
        renderTop10();
        renderCandles();
        renderTournaments();
        renderQuests();
    }

    function attachRealtimeListeners() {
        const db = getDb();
        detachRealtimeListeners();

        state.marketListener = db.ref('market').on('value', snap => {
            state.market = { ...state.market, ...(snap.val() || {}) };
            renderStats();
            renderCandles();
        });

        state.tradeListener = db.ref('marketTrades').limitToLast(5000).on('value', snap => {
            const raw = snap.val() || {};
            state.trades = Object.values(raw).sort((a, b) => num(a.timestamp, 0) - num(b.timestamp, 0));
            renderCandles();
            renderTournaments();
        });

        state.newsListener = db.ref('newsPosts').limitToLast(200).on('value', snap => {
            state.news = Object.values(snap.val() || {});
            renderNews();
        });
    }

    function detachRealtimeListeners() {
        const db = getDb();
        if (state.marketListener) db.ref('market').off('value', state.marketListener);
        if (state.tradeListener) db.ref('marketTrades').off('value', state.tradeListener);
        if (state.newsListener) db.ref('newsPosts').off('value', state.newsListener);
        state.marketListener = null;
        state.tradeListener = null;
        state.newsListener = null;
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
        await resolveCompletedQuests();
        await saveUserProgress();
    }

    async function publishNews() {
        if (!gameState?.user || !ADMIN_USERS.has(gameState.user)) {
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
            date: new Date().toLocaleString('uk-UA'),
            image: image || null,
            pinned,
            createdAt: firebase.database.ServerValue.TIMESTAMP
        });
        document.getElementById('news-title').value = '';
        document.getElementById('news-text').value = '';
        document.getElementById('news-image').value = '';
        document.getElementById('news-pinned').checked = false;
    }

    async function executeTrade() {
        if (!gameState?.user) {
            alert('Спочатку увійдіть в акаунт.');
            return;
        }
        const amountInput = document.getElementById('market-trade-amount');
        const typeInput = document.getElementById('market-trade-type');
        const amount = num(amountInput?.value, 0);
        const type = typeInput?.value === 'sell' ? 'sell' : 'buy';
        if (!amount || amount <= 0) {
            alert('Введіть коректну кількість BB.');
            return;
        }
        if (type === 'sell' && num(gameState.balance, 0) < amount) {
            alert('Недостатньо BB для продажу.');
            return;
        }

        const db = getDb();
        const [marketSnap, userSnap] = await Promise.all([
            db.ref('market').once('value'),
            db.ref(`users/${gameState.user}`).once('value')
        ]);
        const market = {
            ...state.market,
            ...(marketSnap.val() || {})
        };
        const user = userSnap.val() || {};
        const currentPrice = Math.max(0.000001, num(market.currentPrice, 1));
        const impact = Math.min(0.2, amount / 10000);
        const newPrice = type === 'buy'
            ? currentPrice * (1 + impact)
            : Math.max(0.000001, currentPrice * (1 - impact));
        const nextBalance = type === 'buy'
            ? num(user.balance, 0) + amount
            : num(user.balance, 0) - amount;

        const totalSupply = Math.max(0, num(market.totalSupply, 0) + (type === 'buy' ? amount : -amount));
        const circulatingSupply = Math.max(0, num(market.circulatingSupply, totalSupply) + (type === 'buy' ? amount : -amount));
        const tradeValue = amount * currentPrice;

        const tradeId = db.ref('marketTrades').push().key;
        const now = Date.now();
        const updates = {};
        updates[`users/${gameState.user}/balance`] = nextBalance;
        updates['market/currentPrice'] = newPrice;
        updates['market/totalSupply'] = totalSupply;
        updates['market/circulatingSupply'] = circulatingSupply;
        updates['market/totalVolume'] = num(market.totalVolume, 0) + tradeValue;
        updates['market/totalPurchases'] = num(market.totalPurchases, 0) + (type === 'buy' ? 1 : 0);
        updates['market/totalSales'] = num(market.totalSales, 0) + (type === 'sell' ? 1 : 0);
        updates['market/lastUpdated'] = now;
        updates[`marketTrades/${tradeId}`] = {
            id: tradeId,
            user: gameState.user,
            type,
            amount,
            value: tradeValue,
            priceBefore: currentPrice,
            priceAfter: newPrice,
            timestamp: now
        };
        await db.ref().update(updates);

        gameState.balance = nextBalance;
        if (typeof updateHeader === 'function') updateHeader();
        amountInput.value = '';

        await addProgress({
            totalDeals: 1,
            totalBought: type === 'buy' ? amount : 0,
            totalSold: type === 'sell' ? amount : 0,
            cumulativeEarned: type === 'buy' ? amount : 0
        });
        if (typeof showGameNotification === 'function') {
            showGameNotification(`${type === 'buy' ? '🟢 Куплено' : '🔴 Продано'} ${amount.toFixed(4)} BB`);
        }
    }

    async function onUserAuthenticated() {
        if (!gameState?.user || state.bootstrappedUser === gameState.user) return;
        state.bootstrappedUser = gameState.user;
        await ensureMarketInitialized();
        await loadUserProgress();
        await processLoginStreak();
        document.getElementById('news-admin-form').style.display = ADMIN_USERS.has(gameState.user) ? 'block' : 'none';
        attachRealtimeListeners();
        await renderAll();
    }

    function onUserLoggedOut() {
        detachRealtimeListeners();
        state.bootstrappedUser = null;
        state.userProgress = null;
    }

    function changeChartRange(range) {
        state.chartRange = range;
        updateMiniTabState('chart-range-tabs', 'range', range);
        renderCandles();
    }

    function changeTournamentPeriod(period) {
        state.tournamentPeriod = period;
        updateMiniTabState('tournament-tabs', 'period', period);
        renderTournaments();
    }

    async function onNewsTabOpen() {
        await renderAll();
    }

    const baseSwitchTab = window.switchTab;
    if (typeof baseSwitchTab === 'function') {
        window.switchTab = function(tabNum) {
            document.querySelectorAll('.view').forEach(v => v.style.display = 'none');
            document.querySelectorAll('nav .tab').forEach(t => t.classList.remove('active'));

            const tabMap = { 1: 'tab1', 2: 'tab2', 3: 'tab3', 4: 'tab4', 5: 'tab5', 6: 'tab6', 7: 'tab7' };
            const tabId = tabMap[tabNum];
            if (!tabId) return;
            const tabEl = document.getElementById(tabId);
            if (tabEl) tabEl.style.display = 'block';
            const navTab = document.querySelectorAll('nav .tab')[tabNum - 1];
            if (navTab) navTab.classList.add('active');

            if (tabNum === 4) {
                if (typeof updateFriendRequestsList === 'function') updateFriendRequestsList();
                if (typeof updateFriendsList === 'function') updateFriendsList();
            } else if (tabNum === 5) {
                if (typeof refreshSettingsForm === 'function') refreshSettingsForm();
            } else if (tabNum === 6) {
                if (typeof shopRender === 'function') shopRender();
            } else if (tabNum === 7) {
                onNewsTabOpen();
            }
        };
    }

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
            }
            return ok;
        };
    }

    const baseUpdateHeader = window.updateHeader;
    if (typeof baseUpdateHeader === 'function') {
        window.updateHeader = function(...args) {
            const result = baseUpdateHeader.apply(this, args);
            if (document.getElementById('tab7')?.style.display === 'block') {
                renderStats();
                renderTop10();
                renderQuests();
            }
            return result;
        };
    }

    window.bbFeatures = {
        publishNews,
        executeTrade,
        changeChartRange,
        changeTournamentPeriod,
        onNewsTabOpen,
        addProgress
    };
})();
