(() => {
    if (typeof firebase === 'undefined') return;

    const PAIRS = ['BTC/USDT', 'TON/USDT', 'ETH/USDT'];
    const BASE_PRICES = {
        'BTC/USDT': 64000,
        'TON/USDT': 7.8,
        'ETH/USDT': 3200
    };
    const HISTORY_LIMIT = 180;
    const PRICE_TICK_MS = 1200;
    const BET_DURATION_MS = 30000;
    const BET_MULTIPLIER = 38;
    const SAVE_DEBOUNCE_MS = 1000;

    const state = {
        user: null,
        selectedPair: PAIRS[0],
        prices: { ...BASE_PRICES },
        history: Object.fromEntries(PAIRS.map((pair) => [pair, []])),
        wallet: {
            usdt: 0,
            holdings: { BTC: 0, TON: 0, ETH: 0 },
            walletPasswordHash: ''
        },
        openBets: [],
        tickTimer: null,
        saveTimer: null,
        loaded: false
    };

    function db() {
        return firebase.database();
    }

    function num(value, fallback = 0) {
        const n = Number(value);
        return Number.isFinite(n) ? n : fallback;
    }

    function round(value, digits = 6) {
        const p = Math.pow(10, digits);
        return Math.round(num(value) * p) / p;
    }

    function getPairToken(pair) {
        return String(pair || '').split('/')[0];
    }

    function isWeekend() {
        const day = new Date().getDay();
        return day === 0 || day === 6;
    }

    function getCurrentUser() {
        return typeof gameState !== 'undefined' ? gameState.user : null;
    }

    function renderClosedBanner() {
        const banner = document.getElementById('market-closed-banner');
        if (!banner) return;
        banner.style.display = isWeekend() ? 'block' : 'none';
    }

    function ensureHistoryInitialized() {
        const now = Date.now();
        PAIRS.forEach((pair) => {
            if (!Array.isArray(state.history[pair])) state.history[pair] = [];
            if (state.history[pair].length === 0) {
                state.history[pair].push({ t: now, p: state.prices[pair] || BASE_PRICES[pair] });
            }
        });
    }

    function randomWalk(pair) {
        const current = num(state.prices[pair], BASE_PRICES[pair]);
        const drift = (Math.random() - 0.5) * 0.008;
        const wave = Math.sin(Date.now() / 15000) * 0.0015;
        const next = Math.max(0.000001, current * (1 + drift + wave));
        state.prices[pair] = round(next, pair === 'TON/USDT' ? 4 : 2);
    }

    function pushHistory(pair) {
        const arr = state.history[pair] || (state.history[pair] = []);
        arr.push({ t: Date.now(), p: state.prices[pair] });
        if (arr.length > HISTORY_LIMIT) arr.splice(0, arr.length - HISTORY_LIMIT);
    }

    function updateLivePrice() {
        const priceEl = document.getElementById('market-live-price');
        if (!priceEl) return;
        const price = num(state.prices[state.selectedPair], BASE_PRICES[state.selectedPair]);
        const symbol = state.selectedPair;
        priceEl.textContent = `${symbol}: ${price.toLocaleString('en-US', { maximumFractionDigits: symbol === 'TON/USDT' ? 4 : 2 })}`;
    }

    function renderWallet() {
        const el = document.getElementById('market-wallet-summary');
        if (!el) return;
        const usdt = num(state.wallet.usdt, 0);
        const holdings = state.wallet.holdings || {};
        el.innerHTML = `
            <div>💵 USDT: <b style="color:#26A17B;">${usdt.toFixed(2)}</b></div>
            <div>₿ BTC: <b>${num(holdings.BTC, 0).toFixed(6)}</b></div>
            <div>🪙 TON: <b>${num(holdings.TON, 0).toFixed(6)}</b></div>
            <div>◆ ETH: <b>${num(holdings.ETH, 0).toFixed(6)}</b></div>
        `;
    }

    function renderBets() {
        const el = document.getElementById('market-open-bets');
        if (!el) return;
        if (!state.openBets.length) {
            el.innerHTML = '<div style="font-size:12px;color:var(--text2);">Активних ставок немає.</div>';
            return;
        }
        const now = Date.now();
        el.innerHTML = state.openBets.slice(-8).reverse().map((bet) => {
            const leftSec = Math.max(0, Math.ceil((bet.endsAt - now) / 1000));
            return `<div style="padding:8px;border:1px solid var(--border);border-radius:10px;background:#10151c;">
                <div style="font-size:12px;"><b>${bet.pair}</b> • ${bet.direction === 'up' ? '📈 UP' : '📉 DOWN'}</div>
                <div style="font-size:11px;color:var(--text2);">Ставка: ${bet.amount.toFixed(2)} USDT • Таймер: ${leftSec}с</div>
            </div>`;
        }).join('');
    }

    function drawChart() {
        const canvas = document.getElementById('market-chart-canvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const w = canvas.width;
        const h = canvas.height;
        ctx.clearRect(0, 0, w, h);

        const list = state.history[state.selectedPair] || [];
        if (list.length < 2) return;

        const prices = list.map(item => num(item.p, 0));
        const min = Math.min(...prices);
        const max = Math.max(...prices);
        const span = Math.max(0.000001, max - min);

        ctx.strokeStyle = '#1f2a38';
        ctx.lineWidth = 1;
        for (let i = 0; i < 4; i += 1) {
            const y = 20 + ((h - 40) / 3) * i;
            ctx.beginPath();
            ctx.moveTo(10, y);
            ctx.lineTo(w - 10, y);
            ctx.stroke();
        }

        ctx.lineWidth = 2;
        const delta = prices[prices.length - 1] - prices[0];
        ctx.strokeStyle = delta >= 0 ? '#0ECB81' : '#F6465D';
        ctx.beginPath();
        list.forEach((item, idx) => {
            const x = 12 + (idx / (list.length - 1)) * (w - 24);
            const y = 20 + ((max - num(item.p, min)) / span) * (h - 40);
            if (idx === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.stroke();

        ctx.fillStyle = '#848E9C';
        ctx.font = '12px Orbitron, sans-serif';
        ctx.fillText(`High: ${max.toFixed(state.selectedPair === 'TON/USDT' ? 4 : 2)}`, 12, 14);
        ctx.fillText(`Low: ${min.toFixed(state.selectedPair === 'TON/USDT' ? 4 : 2)}`, w - 160, 14);
    }

    function renderAll() {
        renderClosedBanner();
        updateLivePrice();
        drawChart();
        renderWallet();
        renderBets();
    }

    function queueSave() {
        if (state.saveTimer) clearTimeout(state.saveTimer);
        state.saveTimer = setTimeout(() => {
            state.saveTimer = null;
            saveState().catch((error) => console.warn('Market save failed:', error));
        }, SAVE_DEBOUNCE_MS);
    }

    async function saveState() {
        if (!state.user) return;
        await db().ref(`users/${state.user}/marketData`).set({
            selectedPair: state.selectedPair,
            prices: state.prices,
            history: state.history,
            wallet: state.wallet,
            openBets: state.openBets,
            updatedAt: firebase.database.ServerValue.TIMESTAMP
        });
    }

    function normalizeLoaded(raw) {
        const base = {
            selectedPair: PAIRS[0],
            prices: { ...BASE_PRICES },
            history: Object.fromEntries(PAIRS.map((pair) => [pair, []])),
            wallet: {
                usdt: 0,
                holdings: { BTC: 0, TON: 0, ETH: 0 },
                walletPasswordHash: ''
            },
            openBets: []
        };
        if (!raw || typeof raw !== 'object') return base;
        const prices = { ...base.prices, ...(raw.prices || {}) };
        const history = { ...base.history };
        PAIRS.forEach((pair) => {
            history[pair] = Array.isArray(raw.history?.[pair]) ? raw.history[pair].slice(-HISTORY_LIMIT) : [];
        });
        const holdingsRaw = raw.wallet?.holdings || {};
        return {
            selectedPair: PAIRS.includes(raw.selectedPair) ? raw.selectedPair : base.selectedPair,
            prices,
            history,
            wallet: {
                usdt: round(num(raw.wallet?.usdt, 0), 2),
                holdings: {
                    BTC: round(num(holdingsRaw.BTC, 0)),
                    TON: round(num(holdingsRaw.TON, 0)),
                    ETH: round(num(holdingsRaw.ETH, 0))
                },
                walletPasswordHash: typeof raw.wallet?.walletPasswordHash === 'string' ? raw.wallet.walletPasswordHash : ''
            },
            openBets: Array.isArray(raw.openBets) ? raw.openBets.filter(Boolean).slice(-30) : []
        };
    }

    async function loadState(user) {
        const snap = await db().ref(`users/${user}/marketData`).once('value');
        const normalized = normalizeLoaded(snap.val());
        state.selectedPair = normalized.selectedPair;
        state.prices = normalized.prices;
        state.history = normalized.history;
        state.wallet = normalized.wallet;
        state.openBets = normalized.openBets;
        ensureHistoryInitialized();
    }

    function resolveExpiredBets() {
        const now = Date.now();
        let changed = false;
        state.openBets = state.openBets.filter((bet) => {
            if (now < num(bet.endsAt, 0)) return true;
            const livePrice = num(state.prices[bet.pair], bet.entryPrice);
            const change = (livePrice - num(bet.entryPrice, livePrice)) / Math.max(0.000001, num(bet.entryPrice, livePrice));
            const isWin = (bet.direction === 'up' && change > 0) || (bet.direction === 'down' && change < 0);
            if (isWin) {
                const reward = round(bet.amount + (bet.amount * Math.abs(change) * BET_MULTIPLIER), 2);
                state.wallet.usdt = round(num(state.wallet.usdt, 0) + reward, 2);
                if (typeof showGameNotification === 'function') {
                    showGameNotification(`✅ Ставка ${bet.pair} виграла: +${reward.toFixed(2)} USDT`);
                }
            } else if (typeof showGameNotification === 'function') {
                showGameNotification(`❌ Ставка ${bet.pair} не зіграла`);
            }
            changed = true;
            return false;
        });
        if (changed) queueSave();
    }

    function getPasswordInputValue() {
        return String(document.getElementById('market-wallet-password')?.value || '').trim();
    }

    async function verifyWalletPassword() {
        const hash = state.wallet.walletPasswordHash || '';
        const value = getPasswordInputValue();
        if (!hash) {
            alert('Спочатку встановіть пароль гаманця.');
            return false;
        }
        if (!value) {
            alert('Введіть пароль гаманця.');
            return false;
        }
        const calc = typeof hashTextSHA256 === 'function' ? await hashTextSHA256(value) : '';
        if (`sha256:${calc}` !== hash) {
            alert('Невірний пароль гаманця.');
            return false;
        }
        return true;
    }

    async function setWalletPassword() {
        const pwd = getPasswordInputValue();
        if (pwd.length < 4) {
            alert('Пароль гаманця має бути мінімум 4 символи.');
            return;
        }
        if (typeof hashTextSHA256 !== 'function') {
            alert('Хешування пароля недоступне.');
            return;
        }
        const hash = await hashTextSHA256(pwd);
        state.wallet.walletPasswordHash = `sha256:${hash}`;
        queueSave();
        if (typeof showGameNotification === 'function') showGameNotification('🔐 Пароль гаманця збережено');
    }

    async function depositUsdt() {
        if (!(await verifyWalletPassword())) return;
        const input = document.getElementById('market-deposit-amount');
        const amount = round(num(input?.value, 0), 2);
        if (!amount) {
            alert('Введіть суму поповнення (можна відʼємну).');
            return;
        }
        state.wallet.usdt = round(num(state.wallet.usdt, 0) + amount, 2);
        if (typeof gameState !== 'undefined') {
            gameState.usdt = state.wallet.usdt;
            if (typeof updateHeader === 'function') updateHeader();
        }
        if (input) input.value = '';
        queueSave();
        renderWallet();
        if (typeof showGameNotification === 'function') showGameNotification(`💵 Баланс USDT змінено на ${amount > 0 ? '+' : ''}${amount.toFixed(2)}`);
    }

    async function buyCurrent() {
        if (isWeekend()) {
            alert('Ринок зачинений у вихідні.');
            return;
        }
        if (!(await verifyWalletPassword())) return;
        const amount = round(num(document.getElementById('market-trade-amount')?.value, 0));
        if (amount <= 0) {
            alert('Введіть кількість монети.');
            return;
        }
        const token = getPairToken(state.selectedPair);
        const cost = round(amount * num(state.prices[state.selectedPair], 0), 2);
        state.wallet.usdt = round(num(state.wallet.usdt, 0) - cost, 2);
        state.wallet.holdings[token] = round(num(state.wallet.holdings[token], 0) + amount);
        if (typeof gameState !== 'undefined') {
            gameState.usdt = state.wallet.usdt;
            if (typeof updateHeader === 'function') updateHeader();
        }
        queueSave();
        renderWallet();
        if (typeof showGameNotification === 'function') showGameNotification(`🟢 Куплено ${amount} ${token} за ${cost.toFixed(2)} USDT`);
    }

    async function sellCurrent() {
        if (isWeekend()) {
            alert('Ринок зачинений у вихідні.');
            return;
        }
        if (!(await verifyWalletPassword())) return;
        const amount = round(num(document.getElementById('market-trade-amount')?.value, 0));
        if (amount <= 0) {
            alert('Введіть кількість монети.');
            return;
        }
        const token = getPairToken(state.selectedPair);
        const owned = num(state.wallet.holdings[token], 0);
        if (owned < amount) {
            alert(`Недостатньо ${token} в гаманці.`);
            return;
        }
        const revenue = round(amount * num(state.prices[state.selectedPair], 0), 2);
        state.wallet.holdings[token] = round(owned - amount);
        state.wallet.usdt = round(num(state.wallet.usdt, 0) + revenue, 2);
        if (typeof gameState !== 'undefined') {
            gameState.usdt = state.wallet.usdt;
            if (typeof updateHeader === 'function') updateHeader();
        }
        queueSave();
        renderWallet();
        if (typeof showGameNotification === 'function') showGameNotification(`🔴 Продано ${amount} ${token}, отримано ${revenue.toFixed(2)} USDT`);
    }

    async function placeBet() {
        if (isWeekend()) {
            alert('Ринок зачинений у вихідні.');
            return;
        }
        if (!(await verifyWalletPassword())) return;
        const direction = document.getElementById('market-bet-direction')?.value === 'down' ? 'down' : 'up';
        const amount = round(num(document.getElementById('market-bet-amount')?.value, 0), 2);
        if (amount <= 0) {
            alert('Введіть суму ставки.');
            return;
        }
        if (num(state.wallet.usdt, 0) < amount) {
            alert('Недостатньо USDT для ставки.');
            return;
        }
        state.wallet.usdt = round(num(state.wallet.usdt, 0) - amount, 2);
        const bet = {
            id: `bet_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            pair: state.selectedPair,
            direction,
            amount,
            entryPrice: num(state.prices[state.selectedPair], 0),
            placedAt: Date.now(),
            endsAt: Date.now() + BET_DURATION_MS
        };
        state.openBets.push(bet);
        if (typeof gameState !== 'undefined') {
            gameState.usdt = state.wallet.usdt;
            if (typeof updateHeader === 'function') updateHeader();
        }
        queueSave();
        renderAll();
        if (typeof showGameNotification === 'function') showGameNotification(`🎯 Ставка прийнята: ${direction === 'up' ? 'UP' : 'DOWN'} ${state.selectedPair}`);
    }

    function tickMarket() {
        if (!state.loaded) return;
        PAIRS.forEach((pair) => {
            randomWalk(pair);
            pushHistory(pair);
        });
        resolveExpiredBets();
        renderAll();
    }

    async function bootForCurrentUser() {
        const user = getCurrentUser();
        if (!user) return;
        if (state.user === user && state.loaded) return;
        state.user = user;
        await loadState(user);
        state.loaded = true;
        if (typeof gameState !== 'undefined') {
            gameState.usdt = round(num(state.wallet.usdt, gameState.usdt), 2);
            if (typeof updateHeader === 'function') updateHeader();
        }
        renderAll();
        queueSave();
    }

    function openTab() {
        bootForCurrentUser().catch((error) => console.warn('Market boot error:', error));
        renderAll();
    }

    function wireDom() {
        const pairSelect = document.getElementById('market-pair-select');
        if (!pairSelect || pairSelect.dataset.bound === '1') return;
        pairSelect.dataset.bound = '1';
        pairSelect.innerHTML = PAIRS.map((pair) => `<option value="${pair}">${pair}</option>`).join('');
        pairSelect.value = state.selectedPair;
        pairSelect.addEventListener('change', () => {
            state.selectedPair = pairSelect.value;
            queueSave();
            renderAll();
        });
    }

    function init() {
        wireDom();
        ensureHistoryInitialized();
        if (!state.tickTimer) {
            state.tickTimer = setInterval(tickMarket, PRICE_TICK_MS);
        }
        renderAll();
    }

    document.addEventListener('DOMContentLoaded', init);

    window.marketSim = {
        openTab,
        refreshNow: renderAll,
        setWalletPassword,
        depositUsdt,
        buyCurrent,
        sellCurrent,
        placeBet
    };
})();
