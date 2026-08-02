(() => {
    if (typeof firebase === 'undefined') return;

    const PAIRS = ['BTC/USDT', 'TON/USDT', 'ETH/USDT'];
    const BASE_PRICES = {
        'BTC/USDT': 64000,
        'TON/USDT': 7.8,
        'ETH/USDT': 3200
    };
    const CANDLE_COUNT = 80;
    const CANDLE_STEP_PX = 12;   // pixels per candle (scroll chart)
    const CANDLE_INTERVAL_MS = 60 * 1000;
    const PRICE_TICK_MS = 15000;
    const BET_MULTIPLIER = 38;
    const SAVE_DEBOUNCE_MS = 1000;
    const PAIR_VOLATILITY = {
        'BTC/USDT': 0.0046,
        'TON/USDT': 0.0068,
        'ETH/USDT': 0.0052
    };

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
        loaded: false,
        sessionPasswordHash: null  // cached after first successful verification
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

    function hashNoise(input) {
        let h = 2166136261 >>> 0;
        const value = String(input);
        for (let i = 0; i < value.length; i += 1) {
            h ^= value.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        return (h >>> 0) / 4294967295;
    }

    function generateSharedCandles(pair, now = Date.now()) {
        const pairSeed = PAIRS.indexOf(pair) + 1;
        const bucketNow = Math.floor(now / CANDLE_INTERVAL_MS);
        const startBucket = bucketNow - CANDLE_COUNT + 1;
        const candles = [];
        const digits = pair === 'TON/USDT' ? 4 : 2;
        let prevClose = num(BASE_PRICES[pair], 1);
        const vol = num(PAIR_VOLATILITY[pair], 0.004);

        for (let bucket = startBucket; bucket <= bucketNow; bucket += 1) {
            const driftWave = Math.sin((bucket + pairSeed * 11) / 18) * vol * 0.55;
            const microWave = Math.cos((bucket + pairSeed * 7) / 5) * vol * 0.2;
            const noise = (hashNoise(`${pair}:d:${bucket}`) - 0.5) * vol * 1.1;
            const closeRaw = prevClose * (1 + driftWave + microWave + noise);
            const close = Math.max(0.000001, closeRaw);
            const open = prevClose;
            const wickUp = 1 + hashNoise(`${pair}:u:${bucket}`) * vol * 4;
            const wickDown = 1 - hashNoise(`${pair}:l:${bucket}`) * vol * 4;
            const high = Math.max(open, close) * wickUp;
            const low = Math.min(open, close) * Math.max(0.000001, wickDown);

            candles.push({
                t: bucket * CANDLE_INTERVAL_MS,
                o: round(open, digits),
                h: round(high, digits),
                l: round(low, digits),
                c: round(close, digits)
            });
            prevClose = close;
        }

        return candles;
    }

    function refreshSharedMarketData() {
        PAIRS.forEach((pair) => {
            const candles = generateSharedCandles(pair);
            state.history[pair] = candles;
            const last = candles[candles.length - 1];
            state.prices[pair] = num(last?.c, BASE_PRICES[pair]);
        });
    }

    function ensureHistoryInitialized() {
        refreshSharedMarketData();
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
        const mainUsdt = typeof gameState !== 'undefined' ? num(gameState.usdt, 0) : 0;
        el.innerHTML = `
            <div class="mkt-wallet-row"><span>💰 Гаманець USDT</span><b style="color:#26A17B;">${usdt.toFixed(2)}</b></div>
            <div class="mkt-wallet-row"><span>🏦 Основний USDT</span><b style="color:#848E9C;">${mainUsdt.toFixed(2)}</b></div>
            <div class="mkt-wallet-row"><span>₿ BTC</span><b>${num(holdings.BTC, 0).toFixed(6)}</b></div>
            <div class="mkt-wallet-row"><span>🪙 TON</span><b>${num(holdings.TON, 0).toFixed(6)}</b></div>
            <div class="mkt-wallet-row"><span>◆ ETH</span><b>${num(holdings.ETH, 0).toFixed(6)}</b></div>
        `;
    }

    function renderBets() {
        const el = document.getElementById('market-open-bets');
        if (!el) return;
        if (!state.openBets.length) {
            el.innerHTML = '<div style="font-size:12px;color:var(--text2);">Активних ставок немає.</div>';
            return;
        }
        el.textContent = '';
        state.openBets.slice(-8).reverse().forEach((bet) => {
            const card = document.createElement('div');
            card.className = 'market-open-bet-card';

            const top = document.createElement('div');
            top.className = 'market-open-bet-head';
            top.textContent = `${String(bet.pair || '')} • ${bet.direction === 'up' ? '📈 UP' : '📉 DOWN'}`;

            const livePrice = num(state.prices[bet.pair], bet.entryPrice);
            const entryPrice = Math.max(0.000001, num(bet.entryPrice, livePrice));
            const pnlRatio = bet.direction === 'up'
                ? ((livePrice - entryPrice) / entryPrice)
                : ((entryPrice - livePrice) / entryPrice);
            const pnlPercent = pnlRatio * 100;

            const bottom = document.createElement('div');
            bottom.className = 'market-open-bet-meta';
            bottom.innerHTML = `Ставка: ${num(bet.amount, 0).toFixed(2)} USDT • Вхід: ${entryPrice.toFixed(bet.pair === 'TON/USDT' ? 4 : 2)}<br>Поточний рух: <span style="color:${pnlPercent >= 0 ? '#0ECB81' : '#F6465D'}">${pnlPercent >= 0 ? '+' : ''}${pnlPercent.toFixed(2)}%</span>`;

            const closeBtn = document.createElement('button');
            closeBtn.className = 'market-open-bet-close';
            closeBtn.textContent = 'Закрити угоду';
            closeBtn.addEventListener('click', () => closeBet(bet.id));

            card.appendChild(top);
            card.appendChild(bottom);
            card.appendChild(closeBtn);
            el.appendChild(card);
        });
    }

    function drawChart() {
        const canvas = document.getElementById('market-chart-canvas');
        if (!canvas) return;
        const list = state.history[state.selectedPair] || [];
        const dpr = window.devicePixelRatio || 1;

        // Fixed dimensions for scrollable chart
        const padLeft = 6;
        const padRight = 88;
        const padTop = 14;
        const padBottom = 28;
        const step = CANDLE_STEP_PX;
        const cssH = 300;
        const cssW = Math.max(400, list.length * step + padLeft + padRight);

        canvas.style.width = cssW + 'px';
        canvas.style.height = cssH + 'px';
        canvas.width = Math.floor(cssW * dpr);
        canvas.height = Math.floor(cssH * dpr);

        const ctx = canvas.getContext('2d');
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(dpr, dpr);

        const W = cssW;
        const H = cssH;
        const chartW = W - padLeft - padRight;
        const chartH = H - padTop - padBottom;
        const BG = '#0B0E11';
        const GRID = 'rgba(132,142,156,0.14)';
        const GRID_LIGHT = 'rgba(132,142,156,0.26)';
        const UP = '#0ECB81';
        const DOWN = '#F6465D';
        const UP_DIM = 'rgba(14,203,129,0.22)';
        const DOWN_DIM = 'rgba(246,70,93,0.22)';
        const TEXT = '#848E9C';

        ctx.fillStyle = BG;
        ctx.fillRect(0, 0, W, H);

        if (list.length < 2) {
            ctx.fillStyle = TEXT;
            ctx.font = '13px Orbitron, monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('Недостатньо даних для графіка', W / 2, H / 2);
            return;
        }

        const lows = list.map(item => num(item.l, 0));
        const highs = list.map(item => num(item.h, 0));
        const min = Math.min(...lows);
        const max = Math.max(...highs);
        const range = Math.max(0.000001, max - min);
        const visPad = range * 0.08;
        const visMin = min - visPad;
        const visMax = max + visPad;
        const visRange = Math.max(0.000001, visMax - visMin);
        const toY = (price) => padTop + chartH - ((price - visMin) / visRange) * chartH;
        const decimals = state.selectedPair === 'TON/USDT' ? 4 : 2;
        const formatPrice = (price) => Number(price).toLocaleString('en-US', {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
        });

        const gridLines = 7;
        for (let i = 0; i <= gridLines; i += 1) {
            const y = padTop + (chartH / gridLines) * i;
            ctx.strokeStyle = i === 0 || i === gridLines ? GRID_LIGHT : GRID;
            ctx.lineWidth = i % 2 === 0 ? 1 : 0.5;
            ctx.beginPath();
            ctx.moveTo(padLeft, y);
            ctx.lineTo(W - padRight, y);
            ctx.stroke();

            const price = visMax - (visRange / gridLines) * i;
            ctx.fillStyle = TEXT;
            ctx.font = '11px monospace';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(formatPrice(price), W - padRight + 5, y);
        }

        const bodyW = Math.max(4, Math.min(10, step * 0.72));
        const wickW = Math.max(1, Math.min(2, bodyW * 0.14));
        list.forEach((item, idx) => {
            const cx = padLeft + idx * step + (step / 2);
            const open = num(item.o, min);
            const close = num(item.c, min);
            const high = num(item.h, min);
            const low = num(item.l, min);
            const up = close >= open;
            const color = up ? UP : DOWN;
            const colorDim = up ? UP_DIM : DOWN_DIM;

            const yHigh = toY(high);
            const yLow = toY(low);
            const yOpen = toY(open);
            const yClose = toY(close);
            const bodyTop = Math.min(yOpen, yClose);
            const bodyH = Math.max(2, Math.abs(yClose - yOpen));

            ctx.strokeStyle = color;
            ctx.lineWidth = wickW;
            ctx.beginPath();
            ctx.moveTo(cx, yHigh);
            ctx.lineTo(cx, bodyTop);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(cx, bodyTop + bodyH);
            ctx.lineTo(cx, yLow);
            ctx.stroke();

            ctx.fillStyle = colorDim;
            ctx.fillRect(cx - bodyW / 2, bodyTop, bodyW, bodyH);
            ctx.strokeStyle = color;
            ctx.lineWidth = 1;
            ctx.strokeRect(cx - bodyW / 2, bodyTop, bodyW, bodyH);
            ctx.fillStyle = color;
            ctx.fillRect(cx - bodyW / 2 + 0.5, bodyTop + 0.5, Math.max(1, bodyW - 1), Math.max(1, bodyH - 1));
        });

        const last = list[list.length - 1];
        if (last) {
            const isUp = num(last.c, 0) >= num(last.o, 0);
            const lineColor = isUp ? UP : DOWN;
            const cy = toY(num(last.c, 0));
            ctx.setLineDash([4, 3]);
            ctx.strokeStyle = lineColor;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(padLeft, cy);
            ctx.lineTo(W - padRight, cy);
            ctx.stroke();
            ctx.setLineDash([]);

            const tag = formatPrice(last.c);
            ctx.fillStyle = lineColor;
            ctx.beginPath();
            if (ctx.roundRect) {
                ctx.roundRect(W - padRight + 2, cy - 10, padRight - 4, 20, 3);
            } else {
                ctx.rect(W - padRight + 2, cy - 10, padRight - 4, 20);
            }
            ctx.fill();
            ctx.fillStyle = '#000';
            ctx.font = 'bold 10px monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(tag, W - padRight + (padRight - 4) / 2 + 2, cy);
        }

        // Scroll the chart container to the right so the latest candles are visible
        const scrollEl = document.getElementById('market-chart-scroll');
        if (scrollEl && scrollEl.dataset.userScrolled !== '1') {
            scrollEl.scrollLeft = scrollEl.scrollWidth;
        }
    }

    function renderAll() {
        renderClosedBanner();
        updateLivePrice();
        drawChart();
        renderWallet();
        renderBets();
        // Update live indicator timestamp
        const liveEl = document.getElementById('mkt-live-time');
        if (liveEl) {
            const now = new Date();
            liveEl.textContent = `Оновлено ${now.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
        }
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
            wallet: state.wallet,
            openBets: state.openBets,
            updatedAt: firebase.database.ServerValue.TIMESTAMP
        });
    }

    function normalizeLoaded(raw) {
        const base = {
            selectedPair: PAIRS[0],
            wallet: {
                usdt: 0,
                holdings: { BTC: 0, TON: 0, ETH: 0 },
                walletPasswordHash: ''
            },
            openBets: []
        };
        if (!raw || typeof raw !== 'object') return base;
        const holdingsRaw = raw.wallet?.holdings || {};
        return {
            selectedPair: PAIRS.includes(raw.selectedPair) ? raw.selectedPair : base.selectedPair,
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
        state.wallet = normalized.wallet;
        state.openBets = normalized.openBets;
        ensureHistoryInitialized();
    }

    function closeBet(betId) {
        const index = state.openBets.findIndex((bet) => bet.id === betId);
        if (index < 0) return;
        const bet = state.openBets[index];
        const livePrice = num(state.prices[bet.pair], bet.entryPrice);
        const entryPrice = Math.max(0.000001, num(bet.entryPrice, livePrice));
        const pnlRatio = bet.direction === 'up'
            ? ((livePrice - entryPrice) / entryPrice)
            : ((entryPrice - livePrice) / entryPrice);
        const isWin = pnlRatio > 0;
        if (isWin) {
            const reward = round(bet.amount + (bet.amount * Math.abs(pnlRatio) * BET_MULTIPLIER), 2);
            state.wallet.usdt = round(num(state.wallet.usdt, 0) + reward, 2);
            if (typeof showGameNotification === 'function') {
                showGameNotification(`✅ Угоду закрито з прибутком: +${reward.toFixed(2)} USDT`);
            }
        } else if (typeof showGameNotification === 'function') {
            showGameNotification('❌ Угоду закрито зі збитком');
        }
        state.openBets.splice(index, 1);
        if (typeof gameState !== 'undefined') {
            gameState.usdt = state.wallet.usdt;
            if (typeof updateHeader === 'function') updateHeader();
        }
        queueSave();
        renderAll();
    }

    function getPasswordInputValue() {
        return String(document.getElementById('market-wallet-password')?.value || '').trim();
    }

    async function verifyWalletPassword() {
        const hash = state.wallet.walletPasswordHash || '';
        if (!hash) {
            alert('Спочатку встановіть пароль гаманця.');
            return false;
        }
        // Use cached session hash for convenience (user doesn't have to re-enter each time)
        if (state.sessionPasswordHash && state.sessionPasswordHash === hash) {
            return true;
        }
        const value = getPasswordInputValue();
        if (!value) {
            alert('Введіть пароль гаманця.');
            return false;
        }
        const calc = typeof hashTextSHA256 === 'function' ? await hashTextSHA256(value) : '';
        if (`sha256:${calc}` !== hash) {
            alert('Невірний пароль гаманця.');
            return false;
        }
        // Cache for this session
        state.sessionPasswordHash = hash;
        // Clear input after successful verification so it's not visible
        const pwdInput = document.getElementById('market-wallet-password');
        if (pwdInput) pwdInput.value = '';
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
        state.sessionPasswordHash = state.wallet.walletPasswordHash; // cache immediately
        const pwdInput = document.getElementById('market-wallet-password');
        if (pwdInput) pwdInput.value = '';
        queueSave();
        if (typeof showGameNotification === 'function') showGameNotification('🔐 Пароль гаманця збережено та запамʼятано на сесію');
    }

    async function depositUsdt() {
        if (!(await verifyWalletPassword())) return;
        const input = document.getElementById('market-deposit-amount');
        const amount = round(num(input?.value, 0), 2);
        if (!amount) {
            alert('Введіть суму поповнення.');
            return;
        }
        if (amount > 0) {
            // Depositing: deduct from main USDT balance
            const mainUsdt = typeof gameState !== 'undefined' ? round(num(gameState.usdt, 0), 2) : 0;
            if (mainUsdt < amount) {
                alert(`Недостатньо USDT. На основному балансі: ${mainUsdt.toFixed(2)} USDT.`);
                return;
            }
            state.wallet.usdt = round(num(state.wallet.usdt, 0) + amount, 2);
            if (typeof gameState !== 'undefined') {
                gameState.usdt = round(mainUsdt - amount, 2);
                if (state.user) {
                    db().ref(`users/${state.user}/usdt`).set(gameState.usdt).catch(() => {});
                }
                if (typeof updateHeader === 'function') updateHeader();
            }
        } else {
            // Withdrawing: deduct from wallet, add to main USDT
            const walletUsdt = round(num(state.wallet.usdt, 0), 2);
            if (walletUsdt < -amount) {
                alert(`Недостатньо USDT у гаманці. В гаманці: ${walletUsdt.toFixed(2)} USDT.`);
                return;
            }
            state.wallet.usdt = round(walletUsdt + amount, 2); // amount is negative
            if (typeof gameState !== 'undefined') {
                gameState.usdt = round(num(gameState.usdt, 0) - amount, 2); // subtract negative = add
                if (state.user) {
                    db().ref(`users/${state.user}/usdt`).set(gameState.usdt).catch(() => {});
                }
                if (typeof updateHeader === 'function') updateHeader();
            }
        }
        if (input) input.value = '';
        queueSave();
        renderWallet();
        if (typeof showGameNotification === 'function') {
            showGameNotification(`💵 ${amount > 0 ? 'Поповнено гаманець на' : 'Виведено з гаманця'} ${Math.abs(amount).toFixed(2)} USDT`);
        }
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

    async function placeBet(directionParam) {
        if (isWeekend()) {
            alert('Ринок зачинений у вихідні.');
            return;
        }
        if (!(await verifyWalletPassword())) return;
        const direction = directionParam === 'down' ? 'down' : 'up';
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
            placedAt: Date.now()
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
        refreshSharedMarketData();
        renderAll();
    }

    async function bootForCurrentUser() {
        const user = getCurrentUser();
        if (!user) return;
        if (state.user === user && state.loaded) return;
        state.user = user;
        await loadState(user);
        state.loaded = true;
        // Do NOT overwrite gameState.usdt with wallet usdt — they are separate pools.
        // gameState.usdt = main game USDT; state.wallet.usdt = market wallet USDT.
        if (typeof updateHeader === 'function') updateHeader();
        refreshSharedMarketData();
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

        // Track manual scroll to prevent auto-scroll interfering with user scroll
        const scrollEl = document.getElementById('market-chart-scroll');
        if (scrollEl && scrollEl.dataset.scrollBound !== '1') {
            scrollEl.dataset.scrollBound = '1';
            scrollEl.addEventListener('scroll', () => {
                const atRight = scrollEl.scrollLeft >= scrollEl.scrollWidth - scrollEl.clientWidth - 10;
                scrollEl.dataset.userScrolled = atRight ? '0' : '1';
            }, { passive: true });
        }
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
