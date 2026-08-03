(() => {
    if (typeof firebase === 'undefined') return;

    const PAIRS = ['BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'SOL/USDT', 'XRP/USDT', 'ADA/USDT', 'TON/USDT', 'DOGE/USDT',
                   'PEPE/USDT', 'WIF/USDT', 'SHIB/USDT', 'BONK/USDT', 'FLOKI/USDT'];
    const BASE_PRICES = {
        'BTC/USDT': 98000,
        'ETH/USDT': 5200,
        'BNB/USDT': 820,
        'SOL/USDT': 280,
        'XRP/USDT': 1.85,
        'ADA/USDT': 1.20,
        'TON/USDT': 18.5,
        'DOGE/USDT': 0.48,
        'PEPE/USDT': 0.0000480,
        'WIF/USDT': 5.8,
        'SHIB/USDT': 0.0000820,
        'BONK/USDT': 0.000095,
        'FLOKI/USDT': 0.000620
    };
    const CANDLE_COUNT = 80;
    const CANDLE_STEP_PX = 12;   // pixels per candle (scroll chart)
    // PnL model: each 1% market move = +10 USDT if direction is correct, -12 USDT if wrong.
    const PNL_PER_PERCENT_WIN_USDT = 100;
    const PNL_PER_PERCENT_LOSS_USDT = 112;
    const CANDLE_INTERVAL_MS = 2 * 1000;  // 2-second candles for lively charts
    const PRICE_TICK_MS = 2000;           // 2-second price updates
    const SAVE_DEBOUNCE_MS = 1000;
    // Volatile coins (PEPE, WIF, SHIB, BONK, FLOKI) have 8–14x higher volatility — big swings, hard to predict
    // Established coins boosted so real PnL of 500–5000 USDT is achievable per correct call
    const PAIR_VOLATILITY = {
        'BTC/USDT':   0.032,
        'ETH/USDT':   0.038,
        'BNB/USDT':   0.042,
        'SOL/USDT':   0.048,
        'XRP/USDT':   0.055,
        'ADA/USDT':   0.058,
        'TON/USDT':   0.045,
        'DOGE/USDT':  0.065,
        'PEPE/USDT':  0.28,
        'WIF/USDT':   0.26,
        'SHIB/USDT':  0.27,
        'BONK/USDT':  0.32,
        'FLOKI/USDT': 0.29
    };

    // Binance API constants
    const BINANCE_SYMBOL_MAP = {
        'BTC/USDT': 'BTCUSDT',
        'ETH/USDT': 'ETHUSDT',
        'BNB/USDT': 'BNBUSDT',
        'SOL/USDT': 'SOLUSDT',
        'XRP/USDT': 'XRPUSDT',
        'ADA/USDT': 'ADAUSDT',
        'TON/USDT': 'TONUSDT',
        'DOGE/USDT': 'DOGEUSDT',
        'PEPE/USDT': 'PEPEUSDT',
        'WIF/USDT': 'WIFUSDT',
        'SHIB/USDT': 'SHIBUSDT',
        'BONK/USDT': 'BONKUSDT',
        'FLOKI/USDT': 'FLOKIUSDT'
    };
    const BINANCE_REST = 'https://api.binance.com/api/v3/klines';
    const BINANCE_WS_BASE = 'wss://stream.binance.com:9443/ws';

    const TOKEN_EMOJI = {
        BTC: '₿',
        ETH: '◆',
        BNB: '🟡',
        SOL: '🟣',
        XRP: '💧',
        ADA: '🔵',
        TON: '🪙',
        DOGE: '🐕',
        PEPE: '🐸',
        WIF: '🐶',
        SHIB: '🔥',
        BONK: '💥',
        FLOKI: '⚡'
    };

    // Coin logo colors for custom picker
    const TOKEN_COLOR = {
        BTC:  '#F7931A',
        ETH:  '#627EEA',
        BNB:  '#F3BA2F',
        SOL:  '#9945FF',
        XRP:  '#00AAE4',
        ADA:  '#2C74F0',
        TON:  '#0098EA',
        DOGE: '#C2A633',
        PEPE: '#3AB549',
        WIF:  '#FF6B35',
        SHIB: '#E63312',
        BONK: '#FF9500',
        FLOKI:'#8B2FC9'
    };

    // Volatile pair labels shown in the picker
    const TOKEN_VOLATILE_LABEL = new Set(['PEPE', 'WIF', 'SHIB', 'BONK', 'FLOKI']);

    function makeCoinLogoSvg(token) {
        const color = TOKEN_COLOR[token] || '#848E9C';
        const label = token.length <= 3 ? token : token.slice(0, 3);
        const fontSize = label.length <= 2 ? 14 : 11;
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36"><circle cx="18" cy="18" r="18" fill="${color}"/><text x="18" y="18" text-anchor="middle" dominant-baseline="central" fill="#fff" font-family="Arial,Helvetica,sans-serif" font-size="${fontSize}" font-weight="bold">${label}</text></svg>`;
        return 'data:image/svg+xml;base64,' + btoa(svg);
    }

    function buildHoldingsTemplate() {
        const out = {};
        PAIRS.forEach((pair) => {
            const token = String(pair).split('/')[0];
            out[token] = 0;
        });
        return out;
    }

    const state = {
        user: null,
        selectedPair: PAIRS[0],
        prices: { ...BASE_PRICES },
        history: Object.fromEntries(PAIRS.map((pair) => [pair, []])),
        wallet: {
            usdt: 0,
            holdings: buildHoldingsTemplate(),
            walletPasswordHash: ''
        },
        openBets: [],
        closedBets: [],
        tickTimer: null,
        saveTimer: null,
        loaded: false,
        sessionPasswordHash: null,  // cached after first successful verification
        binanceInterval: '1m',
        binanceWs: null,
        useBinance: false,
        currentLeverage: 1
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

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function getPairToken(pair) {
        return String(pair || '').split('/')[0];
    }

    function getPairDigits(pair) {
        const token = getPairToken(pair);
        if (token === 'BTC' || token === 'ETH' || token === 'BNB' || token === 'SOL') return 2;
        if (token === 'TON') return 4;
        if (token === 'PEPE' || token === 'SHIB' || token === 'BONK' || token === 'FLOKI') return 8;
        return 5;
    }

    function isWeekend() { return false; }

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
        const digits = getPairDigits(pair);
        let prevClose = num(BASE_PRICES[pair], 1);
        const vol = num(PAIR_VOLATILITY[pair], 0.004);

        for (let bucket = startBucket; bucket <= bucketNow; bucket += 1) {
            // Moderate sine-wave trend component
            const driftWave = Math.sin((bucket + pairSeed * 11) / 14) * vol * 0.35;
            const microWave = Math.cos((bucket + pairSeed * 7) / 4) * vol * 0.20;
            // Large random noise — creates meaningful moves up AND down
            const noise1 = (hashNoise(`${pair}:d:${bucket}`) - 0.5) * vol * 3.2;
            const noise2 = (hashNoise(`${pair}:d2:${bucket}`) - 0.5) * vol * 1.8;
            // Occasional spike candle (~8% chance) for sudden large moves
            const spikeSeed = hashNoise(`${pair}:spk:${bucket}`);
            const spike = spikeSeed < 0.08 ? (hashNoise(`${pair}:spkv:${bucket}`) - 0.5) * vol * 5.0 : 0;
            const closeRaw = prevClose * (1 + driftWave + microWave + noise1 + noise2 + spike);
            const close = Math.max(0.000001, closeRaw);
            const open = prevClose;
            const wickUp = 1 + hashNoise(`${pair}:u:${bucket}`) * vol * 8;
            const wickDown = 1 - hashNoise(`${pair}:l:${bucket}`) * vol * 8;
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

    // ── Binance real-time data ────────────────────────────────────────────────

    function updateDataSourceLabel(live) {
        const el = document.getElementById('mkt-data-source');
        if (!el) return;
        el.textContent = live ? '🟢 Binance LIVE' : '🟡 Симуляція';
    }

    function setLeverage(lev) {
        state.currentLeverage = Number(lev) || 1;
        document.querySelectorAll('#market-leverage-row .mkt-leverage-btn').forEach((btn) => {
            btn.classList.toggle('active', Number(btn.dataset.lev) === state.currentLeverage);
        });
    }

    function updateDropdownPrices() {
        const dropdown = document.getElementById('mkt-coin-dropdown');
        if (!dropdown) return;
        dropdown.querySelectorAll('.mkt-coin-option').forEach((opt) => {
            const pair = opt.dataset.pair;
            if (!pair) return;
            const price = state.prices[pair];
            if (!price) return;
            let priceEl = opt.querySelector('.mkt-coin-option-price');
            if (!priceEl) {
                priceEl = document.createElement('span');
                priceEl.className = 'mkt-coin-option-price';
                opt.appendChild(priceEl);
            }
            priceEl.textContent = price.toLocaleString('en-US', { minimumFractionDigits: getPairDigits(pair), maximumFractionDigits: getPairDigits(pair) });
        });
    }

    async function fetchBinanceKlines(pair, interval, limit) {
        const symbol = BINANCE_SYMBOL_MAP[pair];
        if (!symbol) return null;
        const url = `${BINANCE_REST}?symbol=${symbol}&interval=${interval}&limit=${limit}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Binance HTTP ${res.status}`);
        const data = await res.json();
        if (!Array.isArray(data) || !data.length) return null;
        return data.map((k) => ({
            t: k[0],
            o: parseFloat(k[1]),
            h: parseFloat(k[2]),
            l: parseFloat(k[3]),
            c: parseFloat(k[4])
        }));
    }

    function stopBinanceWS() {
        if (state.binanceWs) {
            try { state.binanceWs.close(); } catch (_) {}
            state.binanceWs = null;
        }
    }

    function startBinanceWS(pair) {
        stopBinanceWS();
        const symbol = BINANCE_SYMBOL_MAP[pair];
        if (!symbol) return;
        const interval = state.binanceInterval || '1m';
        const wsUrl = `${BINANCE_WS_BASE}/${symbol.toLowerCase()}@kline_${interval}`;
        let ws;
        try {
            ws = new WebSocket(wsUrl);
        } catch (_) {
            return;
        }
        state.binanceWs = ws;

        ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                const kline = msg.k;
                if (!kline) return;
                const candle = {
                    t: kline.t,
                    o: parseFloat(kline.o),
                    h: parseFloat(kline.h),
                    l: parseFloat(kline.l),
                    c: parseFloat(kline.c)
                };
                const history = state.history[pair] || [];
                const last = history[history.length - 1];
                if (last && last.t === candle.t) {
                    history[history.length - 1] = candle;
                } else if (!last || candle.t > last.t) {
                    history.push(candle);
                    if (history.length > CANDLE_COUNT) history.splice(0, history.length - CANDLE_COUNT);
                }
                state.history[pair] = history;
                state.prices[pair] = candle.c;
                checkSlTpLiquidation();
                if (pair === state.selectedPair) {
                    updateLivePrice();
                    drawChart();
                    const liveEl = document.getElementById('mkt-live-time');
                    if (liveEl) {
                        const now = new Date();
                        liveEl.textContent = `Оновлено ${now.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
                    }
                }
            } catch (_) {}
        };

        ws.onerror = () => {
            if (state.binanceWs === ws) {
                state.binanceWs = null;
            }
        };

        ws.onclose = () => {
            if (state.binanceWs === ws) {
                state.binanceWs = null;
            }
        };
    }

    async function initBinancePair(pair) {
        try {
            const interval = state.binanceInterval || '1m';
            const candles = await fetchBinanceKlines(pair, interval, CANDLE_COUNT);
            if (!candles) return false;
            state.history[pair] = candles;
            const last = candles[candles.length - 1];
            if (last) state.prices[pair] = last.c;
            return true;
        } catch (_) {
            return false;
        }
    }

    async function initBinance() {
        const ok = await initBinancePair(state.selectedPair);
        if (!ok) {
            state.useBinance = false;
            updateDataSourceLabel(false);
            return;
        }
        state.useBinance = true;
        updateDataSourceLabel(true);
        startBinanceWS(state.selectedPair);
        renderAll();
    }

    function updateIntervalTabs(interval) {
        const tabs = document.querySelectorAll('#market-interval-tabs .mini-tab');
        tabs.forEach((btn) => {
            btn.classList.toggle('active', btn.dataset.interval === interval);
        });
    }

    async function changeInterval(interval) {
        state.binanceInterval = interval;
        updateIntervalTabs(interval);
        stopBinanceWS();
        state.useBinance = false;
        updateDataSourceLabel(false);
        const ok = await initBinancePair(state.selectedPair);
        if (ok) {
            state.useBinance = true;
            updateDataSourceLabel(true);
            startBinanceWS(state.selectedPair);
        } else {
            refreshSharedMarketData();
        }
        renderAll();
    }

    // ── end Binance ──────────────────────────────────────────────────────────

    function updateLivePrice() {
        const priceEl = document.getElementById('market-live-price');
        if (!priceEl) return;
        const price = num(state.prices[state.selectedPair], BASE_PRICES[state.selectedPair]);
        const symbol = state.selectedPair;
        const digits = getPairDigits(symbol);
        priceEl.textContent = `${symbol}: ${price.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
    }

    function renderWallet() {
        const el = document.getElementById('market-wallet-summary');
        if (!el) return;
        const usdt = num(state.wallet.usdt, 0);
        const holdings = state.wallet.holdings || {};
        const mainUsdt = typeof gameState !== 'undefined' ? num(gameState.usdt, 0) : 0;
        const walletColor = usdt >= 0 ? '#26A17B' : '#F6465D';
        const holdingsRows = PAIRS.map((pair) => {
            const token = getPairToken(pair);
            const icon = TOKEN_EMOJI[token] || '◽';
            return `<div class="mkt-wallet-row"><span>${icon} ${token}</span><b>${num(holdings[token], 0).toFixed(6)}</b></div>`;
        }).join('');
        el.innerHTML = `
            <div class="mkt-wallet-row"><span>💰 Гаманець USDT</span><b style="color:${walletColor};">${usdt.toFixed(2)}</b></div>
            <div class="mkt-wallet-row"><span>🏦 Основний USDT</span><b style="color:#848E9C;">${mainUsdt.toFixed(2)}</b></div>
            ${holdingsRows}
            ${usdt < 0 ? `<div class="mkt-wallet-row"><span>⚠️ Борг до погашення</span><b style="color:#F6465D;">${Math.abs(usdt).toFixed(2)} USDT</b></div>` : ''}
        `;
    }

    function calcPnlRatio(bet, price) {
        const entryPrice = Math.max(0.000001, num(bet.entryPrice, price));
        return bet.direction === 'up'
            ? (price - entryPrice) / entryPrice
            : (entryPrice - price) / entryPrice;
    }

    function calcCloseDelta(bet, pnlRatio) {
        const amount = num(bet.amount, 0);
        const leverage = Math.max(1, num(bet.leverage, 1));
        const movePercent = Math.abs(pnlRatio * 100);
        const perPercent = pnlRatio >= 0 ? PNL_PER_PERCENT_WIN_USDT : PNL_PER_PERCENT_LOSS_USDT;
        const netResult = round(movePercent * perPercent * leverage * (pnlRatio >= 0 ? 1 : -1), 2);
        return round(Math.max(0, amount + netResult), 2);
    }

    function calcNetResult(bet, pnlRatio) {
        return round(calcCloseDelta(bet, pnlRatio) - num(bet.amount, 0), 2);
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

            const leverage = num(bet.leverage, 1);
            const top = document.createElement('div');
            top.className = 'market-open-bet-head';
            top.textContent = `${String(bet.pair || '')} • ${bet.direction === 'up' ? '📈 UP' : '📉 DOWN'}${leverage > 1 ? ` ⚡${leverage}×` : ''}`;

            const livePrice = num(state.prices[bet.pair], bet.entryPrice);
            const entryPrice = Math.max(0.000001, num(bet.entryPrice, livePrice));
            const pnlRatio = calcPnlRatio(bet, livePrice);
            const pnlPercent = pnlRatio * 100;
            const closeDelta = calcCloseDelta(bet, pnlRatio);
            const netResult = calcNetResult(bet, pnlRatio);
            const slInfo = bet.stopLossAmount
                ? `🛑 SL: -${num(bet.stopLossAmount).toFixed(2)} USDT`
                : (bet.stopLoss ? `🛑 SL: ${num(bet.stopLoss).toFixed(getPairDigits(bet.pair))}` : '');
            const tpInfo = bet.takeProfitAmount
                ? `✅ TP: +${num(bet.takeProfitAmount).toFixed(2)} USDT`
                : (bet.takeProfit ? `✅ TP: ${num(bet.takeProfit).toFixed(getPairDigits(bet.pair))}` : '');
            const slTpLine = (slInfo || tpInfo) ? `<br>${[slInfo, tpInfo].filter(Boolean).join(' &nbsp; ')}` : '';

            const bottom = document.createElement('div');
            bottom.className = 'market-open-bet-meta';
            bottom.innerHTML = `Маржа: ${num(bet.amount, 0).toFixed(2)} USDT • Вхід: ${entryPrice.toFixed(getPairDigits(bet.pair))}${slTpLine}<br>Поточний рух: <span style="color:${pnlPercent >= 0 ? '#0ECB81' : '#F6465D'}">${pnlPercent >= 0 ? '+' : ''}${pnlPercent.toFixed(2)}%</span><br>Поточний PnL: <span style="color:${netResult >= 0 ? '#0ECB81' : '#F6465D'};font-weight:800;">${netResult >= 0 ? '+' : ''}${Math.abs(netResult).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT</span><br>Повернеться при закритті: <span style="color:#F0B90B;font-weight:700;">${closeDelta.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT</span>`;

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

    function renderClosedBets() {
        const el = document.getElementById('market-bet-history');
        if (!el) return;
        if (!state.closedBets.length) {
            el.innerHTML = '<div style="font-size:12px;color:var(--text2);">Закритих угод поки немає.</div>';
            return;
        }
        const reasonLabel = (reason) => {
            if (reason === 'liquidation') return '💥 Причина: Ліквідація';
            if (reason === 'stopLoss') return '🛑 Причина: Стоп-лос';
            if (reason === 'takeProfit') return '✅ Причина: Тейк-профіт';
            return '✋ Причина: Ручне закриття';
        };
        el.textContent = '';
        state.closedBets.slice(-12).reverse().forEach((item) => {
            const card = document.createElement('div');
            card.className = 'market-open-bet-card';
            const net = num(item.netResult, 0);
            const closeDelta = num(item.closeDelta, 0);
            const move = num(item.movementPercent, 0);
            const pair = String(item.pair || '—');
            const dir = item.direction === 'up' ? '📈 UP' : '📉 DOWN';
            const top = document.createElement('div');
            top.className = 'market-open-bet-head';
            top.textContent = `${pair} • ${dir}`;
            const meta = document.createElement('div');
            meta.className = 'market-open-bet-meta';
            meta.innerHTML = `
                Списано при вході: <span style="color:#F6465D;">-${num(item.amount, 0).toFixed(2)} USDT</span><br>
                Повернуто при закритті: <span style="color:#F0B90B;">${closeDelta.toFixed(2)} USDT</span> • Рух: <span style="color:${move >= 0 ? '#0ECB81' : '#F6465D'};">${move >= 0 ? '+' : ''}${move.toFixed(2)}%</span><br>
                Чистий PnL: <span style="color:${net >= 0 ? '#0ECB81' : '#F6465D'};font-weight:800;">${net >= 0 ? '+' : ''}${Math.abs(net).toFixed(2)} USDT</span><br>
                <span style="color:var(--text2);">${reasonLabel(item.closeReason)}</span>
            `;
            card.appendChild(top);
            card.appendChild(meta);
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
        const decimals = getPairDigits(state.selectedPair);
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
            const cy = toY(num(last.c, 0));
            const lastCx = padLeft + (list.length - 1) * step + step / 2;
            ctx.setLineDash([4, 3]);
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(lastCx, cy);
            ctx.lineTo(W - padRight, cy);
            ctx.stroke();
            ctx.setLineDash([]);

            const tag = formatPrice(last.c);
            ctx.fillStyle = '#FFFFFF';
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

        const activeBet = [...state.openBets].reverse().find((bet) => bet && bet.pair === state.selectedPair);
        if (activeBet) {
            const livePrice = num(state.prices[activeBet.pair], activeBet.entryPrice);
            const entryPrice = Math.max(0.000001, num(activeBet.entryPrice, livePrice));
            const pnlRatio = calcPnlRatio(activeBet, livePrice);
            const netResult = calcNetResult(activeBet, pnlRatio);
            const yEntry = toY(entryPrice);
            const label = `${netResult >= 0 ? '+' : '-'}${Math.abs(netResult).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT`;
            const labelW = Math.min(148, Math.max(94, ctx.measureText(label).width + 18));

            ctx.setLineDash([3, 3]);
            ctx.strokeStyle = 'rgba(255,255,255,0.85)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(padLeft, yEntry);
            ctx.lineTo(W - padRight, yEntry);
            ctx.stroke();
            ctx.setLineDash([]);

            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(W - padRight - labelW - 6, yEntry - 10, labelW, 20);
            ctx.fillStyle = netResult >= 0 ? '#0B8E11' : '#B42334';
            ctx.font = 'bold 10px monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(label, W - padRight - labelW / 2 - 6, yEntry);
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
        renderClosedBets();
        updateDropdownPrices();
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
            closedBets: state.closedBets,
            updatedAt: firebase.database.ServerValue.TIMESTAMP
        });
    }

    async function appendBankHistoryRecord(entry) {
        if (typeof window.recordBankHistoryEntry !== 'function') return;
        try {
            await window.recordBankHistoryEntry(entry);
        } catch (error) {
            console.warn('Bank history append failed:', error);
        }
    }

    function normalizeLoaded(raw) {
        const base = {
            selectedPair: PAIRS[0],
            wallet: {
                usdt: 0,
                holdings: buildHoldingsTemplate(),
                walletPasswordHash: ''
            },
            openBets: [],
            closedBets: []
        };
        if (!raw || typeof raw !== 'object') return base;
        const holdingsRaw = raw.wallet?.holdings || {};
        const holdings = buildHoldingsTemplate();
        Object.keys(holdings).forEach((token) => {
            holdings[token] = round(num(holdingsRaw[token], 0));
        });
        return {
            selectedPair: PAIRS.includes(raw.selectedPair) ? raw.selectedPair : base.selectedPair,
            wallet: {
                usdt: round(num(raw.wallet?.usdt, 0), 2),
                holdings,
                walletPasswordHash: typeof raw.wallet?.walletPasswordHash === 'string' ? raw.wallet.walletPasswordHash : ''
            },
            openBets: Array.isArray(raw.openBets) ? raw.openBets.filter(Boolean).slice(-30) : [],
            closedBets: Array.isArray(raw.closedBets) ? raw.closedBets.filter(Boolean).slice(-120) : []
        };
    }

    async function loadState(user) {
        const snap = await db().ref(`users/${user}/marketData`).once('value');
        const normalized = normalizeLoaded(snap.val());
        state.selectedPair = normalized.selectedPair;
        state.wallet = normalized.wallet;
        state.openBets = normalized.openBets;
        state.closedBets = normalized.closedBets;
        ensureHistoryInitialized();
    }

    function closeBet(betId, reason) {
        const index = state.openBets.findIndex((bet) => bet.id === betId);
        if (index < 0) return;
        const bet = state.openBets[index];
        const livePrice = num(state.prices[bet.pair], bet.entryPrice);
        const entryPrice = Math.max(0.000001, num(bet.entryPrice, livePrice));
        const pnlRatio = calcPnlRatio(bet, livePrice);
        const closeDelta = calcCloseDelta(bet, pnlRatio);
        const netResult = calcNetResult(bet, pnlRatio);
        state.wallet.usdt = round(num(state.wallet.usdt, 0) + closeDelta, 2);
        state.closedBets.push({
            id: `${bet.id}_closed_${Date.now()}`,
            pair: bet.pair,
            direction: bet.direction,
            leverage: num(bet.leverage, 1),
            amount: round(num(bet.amount, 0), 2),
            entryPrice: round(entryPrice, getPairDigits(bet.pair)),
            closePrice: round(livePrice, getPairDigits(bet.pair)),
            movementPercent: round(pnlRatio * 100, 2),
            closeDelta,
            netResult,
            closeReason: reason || 'manual',
            closedAt: Date.now()
        });
        if (state.closedBets.length > 120) state.closedBets = state.closedBets.slice(-120);
        const isWin = netResult > 0;
        const isFlat = netResult === 0;
        if (typeof showGameNotification === 'function') {
            if (reason === 'liquidation') {
                showGameNotification(`💥 Ліквідація! Позицію закрито зі збитком: -${num(bet.amount).toFixed(2)} USDT`);
            } else if (reason === 'stopLoss') {
                showGameNotification(`🛑 Стоп-лос: угоду закрито. ${netResult >= 0 ? '+' : ''}${netResult.toFixed(2)} USDT`);
            } else if (reason === 'takeProfit') {
                showGameNotification(`✅ Тейк-профіт: угоду закрито з прибутком +${netResult.toFixed(2)} USDT`);
            } else if (isWin) {
                showGameNotification(`✅ Угоду закрито з прибутком: +${netResult.toFixed(2)} USDT`);
            } else if (isFlat) {
                showGameNotification('➖ Угоду закрито без прибутку та збитку.');
            } else {
                showGameNotification(`❌ Угоду закрито зі збитком: -${Math.abs(netResult).toFixed(2)} USDT`);
            }
        }
        state.openBets.splice(index, 1);
        queueSave();
        renderAll();
    }

    function getPasswordInputValue() {
        return String(document.getElementById('market-wallet-password')?.value || '').trim();
    }

    async function verifyWalletPassword(options = {}) {
        const requireFresh = options.requireFresh === true;
        const hash = state.wallet.walletPasswordHash || '';
        if (!hash) {
            alert('Спочатку встановіть пароль гаманця.');
            return false;
        }
        if (!requireFresh && state.sessionPasswordHash && state.sessionPasswordHash === hash) {
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
        state.sessionPasswordHash = hash;
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

    async function setWalletPasswordFromSettings(userPassword, newWalletPassword) {
        const user = state.user || getCurrentUser();
        if (!user) return { success: false, error: 'Спочатку увійдіть у акаунт.' };
        const accountPassword = String(userPassword || '');
        const walletPassword = String(newWalletPassword || '');
        if (!accountPassword) return { success: false, error: 'Введіть пароль акаунта.' };
        if (walletPassword.length < 4) return { success: false, error: 'Пароль гаманця має бути мінімум 4 символи.' };
        if (typeof window.loadUserFromFirebase !== 'function' || typeof window.verifyStoredPassword !== 'function' || typeof window.hashTextSHA256 !== 'function') {
            return { success: false, error: 'Сервіс перевірки пароля недоступний.' };
        }
        const userData = await window.loadUserFromFirebase(user);
        const valid = !!userData && await window.verifyStoredPassword(userData.password, accountPassword);
        if (!valid) return { success: false, error: 'Неправильний пароль акаунта.' };
        if (state.user !== user || !state.loaded) {
            state.user = user;
            await loadState(user);
            state.loaded = true;
        }
        const hash = await window.hashTextSHA256(walletPassword);
        state.wallet.walletPasswordHash = `sha256:${hash}`;
        state.sessionPasswordHash = state.wallet.walletPasswordHash;
        queueSave();
        renderWallet();
        return { success: true };
    }

    async function depositUsdt() {
        if (!(await verifyWalletPassword({ requireFresh: true }))) return;
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
            if (walletUsdt < 0) {
                alert(`У вас борг у гаманці: ${Math.abs(walletUsdt).toFixed(2)} USDT. Спочатку погасіть його поповненням.`);
                return;
            }
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
        await appendBankHistoryRecord({
            type: 'market_buy',
            currency: 'usdt',
            amount: cost,
            note: `Ринок: купівля ${token}`,
            ts: Date.now(),
            meta: {
                side: 'buy',
                pair: state.selectedPair,
                quantity: amount,
                rate: num(state.prices[state.selectedPair], 0),
                total: cost,
                token
            }
        });
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
        await appendBankHistoryRecord({
            type: 'market_sell',
            currency: 'usdt',
            amount: revenue,
            note: `Ринок: продаж ${token}`,
            ts: Date.now(),
            meta: {
                side: 'sell',
                pair: state.selectedPair,
                quantity: amount,
                rate: num(state.prices[state.selectedPair], 0),
                total: revenue,
                token
            }
        });
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
        const leverage = num(state.currentLeverage, 1);
        const slRaw = num(document.getElementById('market-stop-loss')?.value, 0);
        const tpRaw = num(document.getElementById('market-take-profit')?.value, 0);
        const entryPrice = num(state.prices[state.selectedPair], 0);
        if (!entryPrice) {
            alert('Ціна ринку недоступна. Спробуйте ще раз.');
            return;
        }
        if (slRaw > 0 && slRaw >= amount) {
            alert('Стоп-лос має бути меншим за суму угоди: більше за вашу маржу втратити не можна.');
            return;
        }
        state.wallet.usdt = round(num(state.wallet.usdt, 0) - amount, 2);
        const bet = {
            id: `bet_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            pair: state.selectedPair,
            direction,
            amount,
            entryPrice,
            leverage: leverage > 1 ? leverage : 1,
            stopLossAmount: slRaw > 0 ? round(slRaw, 2) : null,
            takeProfitAmount: tpRaw > 0 ? round(tpRaw, 2) : null,
            stopLoss: null,
            takeProfit: null,
            placedAt: Date.now()
        };
        const slInput = document.getElementById('market-stop-loss');
        const tpInput = document.getElementById('market-take-profit');
        if (slInput) slInput.value = '';
        if (tpInput) tpInput.value = '';
        state.openBets.push(bet);
        queueSave();
        renderAll();
        const levLabel = leverage > 1 ? ` ⚡${leverage}×` : '';
        if (typeof showGameNotification === 'function') showGameNotification(`🎯 Ставка прийнята: ${direction === 'up' ? 'UP' : 'DOWN'} ${state.selectedPair}${levLabel}`);
    }

    function checkSlTpLiquidation() {
        if (!state.openBets.length) return;
        const toClose = [];
        state.openBets.forEach((bet) => {
            if (!bet) return;
            const price = num(state.prices[bet.pair], 0);
            if (!price) return;
            const pnlRatio = calcPnlRatio(bet, price);
            const leverage = Math.max(1, num(bet.leverage, 1));
            const netResult = calcNetResult(bet, pnlRatio);
            // Liquidation: actual PnL loss reaches the full stake (margin call)
            // This is correct: you can't lose more than you put in, and it only triggers on real large moves
            if (netResult <= -num(bet.amount, 0)) {
                toClose.push({ id: bet.id, reason: 'liquidation' });
                return;
            }
            // Stop loss
            if (bet.stopLossAmount) {
                const slAmount = num(bet.stopLossAmount, 0);
                if (slAmount > 0 && netResult <= -slAmount) {
                    toClose.push({ id: bet.id, reason: 'stopLoss' });
                    return;
                }
            } else if (bet.stopLoss) {
                const sl = num(bet.stopLoss, 0);
                if (sl > 0) {
                    const isSlTriggered = (bet.direction === 'up' && price <= sl) || (bet.direction === 'down' && price >= sl);
                    if (isSlTriggered && netResult < 0) {
                        toClose.push({ id: bet.id, reason: 'stopLoss' });
                        return;
                    }
                }
            }
            // Take profit — close immediately as soon as target is reached
            if (bet.takeProfitAmount) {
                const tpAmount = num(bet.takeProfitAmount, 0);
                if (tpAmount > 0 && netResult >= tpAmount) {
                    toClose.push({ id: bet.id, reason: 'takeProfit' });
                    return;
                }
            } else if (bet.takeProfit) {
                const tp = num(bet.takeProfit, 0);
                if (tp > 0) {
                    const isTpTriggered = (bet.direction === 'up' && price >= tp) || (bet.direction === 'down' && price <= tp);
                    if (isTpTriggered) {
                        toClose.push({ id: bet.id, reason: 'takeProfit' });
                        return;
                    }
                }
            }
        });
        toClose.forEach(({ id, reason }) => closeBet(id, reason));
    }

    function tickMarket() {
        if (!state.loaded) return;
        if (!state.useBinance) {
            refreshSharedMarketData();
        }
        checkSlTpLiquidation();
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
        initBinance().catch(() => {});
    }

    function openTab() {
        bootForCurrentUser().catch((error) => console.warn('Market boot error:', error));
        renderAll();
    }

    function wireDom() {
        const pairSelect = document.getElementById('market-pair-select');
        if (!pairSelect || pairSelect.dataset.bound === '1') return;
        pairSelect.dataset.bound = '1';

        // Build custom coin picker to replace native <select>
        const wrapper = document.createElement('div');
        wrapper.className = 'mkt-coin-picker';
        wrapper.id = 'mkt-coin-picker';

        const btn = document.createElement('button');
        btn.className = 'mkt-coin-btn';
        btn.type = 'button';
        btn.id = 'mkt-coin-btn';

        const logoImg = document.createElement('img');
        logoImg.className = 'mkt-coin-logo';
        logoImg.id = 'mkt-coin-logo-img';
        logoImg.alt = '';

        const labelSpan = document.createElement('span');
        labelSpan.id = 'mkt-coin-label';

        const badgeSpan = document.createElement('span');
        badgeSpan.className = 'mkt-coin-vol-badge';
        badgeSpan.id = 'mkt-coin-vol-badge';

        const arrow = document.createElement('span');
        arrow.className = 'mkt-coin-arrow';
        arrow.textContent = '▾';

        btn.appendChild(logoImg);
        btn.appendChild(labelSpan);
        btn.appendChild(badgeSpan);
        btn.appendChild(arrow);

        const dropdown = document.createElement('div');
        dropdown.className = 'mkt-coin-dropdown';
        dropdown.id = 'mkt-coin-dropdown';

        PAIRS.forEach((pair) => {
            const token = getPairToken(pair);
            const opt = document.createElement('div');
            opt.className = 'mkt-coin-option' + (pair === state.selectedPair ? ' selected' : '');
            opt.dataset.pair = pair;
            const oLogo = document.createElement('img');
            oLogo.className = 'mkt-coin-logo';
            oLogo.src = makeCoinLogoSvg(token);
            oLogo.alt = token;
            const oName = document.createElement('span');
            oName.className = 'mkt-coin-option-name';
            oName.textContent = pair;
            opt.appendChild(oLogo);
            opt.appendChild(oName);
            if (TOKEN_VOLATILE_LABEL.has(token)) {
                const volTag = document.createElement('span');
                volTag.className = 'mkt-coin-option-hot';
                volTag.textContent = '🔥 VOLATILE';
                opt.appendChild(volTag);
            }
            opt.addEventListener('click', () => {
                const newPair = pair;
                if (newPair === state.selectedPair) { dropdown.classList.remove('open'); return; }
                state.selectedPair = newPair;
                updatePickerDisplay();
                queueSave();
                dropdown.classList.remove('open');
                stopBinanceWS();
                state.useBinance = false;
                updateDataSourceLabel(false);
                initBinancePair(newPair).then((ok) => {
                    if (ok) {
                        state.useBinance = true;
                        updateDataSourceLabel(true);
                        startBinanceWS(newPair);
                    } else {
                        refreshSharedMarketData();
                    }
                    renderAll();
                }).catch(() => {
                    refreshSharedMarketData();
                    renderAll();
                });
            });
            dropdown.appendChild(opt);
        });

        wrapper.appendChild(btn);
        wrapper.appendChild(dropdown);

        pairSelect.parentNode.replaceChild(wrapper, pairSelect);

        function updatePickerDisplay() {
            const token = getPairToken(state.selectedPair);
            logoImg.src = makeCoinLogoSvg(token);
            labelSpan.textContent = state.selectedPair;
            if (TOKEN_VOLATILE_LABEL.has(token)) {
                badgeSpan.textContent = '🔥';
                badgeSpan.style.display = '';
            } else {
                badgeSpan.style.display = 'none';
            }
            dropdown.querySelectorAll('.mkt-coin-option').forEach((el) => {
                el.classList.toggle('selected', el.dataset.pair === state.selectedPair);
            });
        }

        updatePickerDisplay();

        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdown.classList.toggle('open');
        });

        document.addEventListener('click', () => dropdown.classList.remove('open'));

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
        updateIntervalTabs(state.binanceInterval);
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
        setWalletPasswordFromSettings,
        depositUsdt,
        buyCurrent,
        sellCurrent,
        placeBet,
        changeInterval,
        setLeverage
    };
})();
