/**
 * Regression tests for market futures payout and SL/TP logic.
 * Run with: node tests/market-futures.test.js
 */

function round(value, digits = 2) {
    const p = Math.pow(10, digits);
    return Math.round(Number(value) * p) / p;
}

function calcPnlRatio(entryPrice, livePrice, direction) {
    return direction === 'up'
        ? (livePrice - entryPrice) / entryPrice
        : (entryPrice - livePrice) / entryPrice;
}

function calcCloseDelta(amount, leverage, pnlRatio) {
    const safeLeverage = Math.max(1, leverage);
    const scaledPnl = amount * pnlRatio * safeLeverage;
    const netResult = Math.max(-amount, scaledPnl);
    return round(Math.max(0, amount + netResult), 2);
}

function calcNetResult(amount, leverage, pnlRatio) {
    const safeLeverage = Math.max(1, leverage);
    return round(Math.max(-amount, amount * pnlRatio * safeLeverage), 2);
}

function shouldTriggerStopLoss({ netResult, stopLossAmount }) {
    return stopLossAmount > 0 && netResult <= -stopLossAmount;
}

function shouldTriggerTakeProfit({ netResult, takeProfitAmount }) {
    return takeProfitAmount > 0 && netResult >= takeProfitAmount;
}

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`  ✅ ${name}`);
        passed++;
    } catch (error) {
        console.error(`  ❌ ${name}: ${error.message}`);
        failed++;
    }
}

function assertEqual(actual, expected, message) {
    if (actual !== expected) {
        throw new Error(`${message}: expected ${expected}, got ${actual}`);
    }
}

console.log('\n📋 Market Futures Tests:');

test('breakeven leveraged trade returns full margin', () => {
    const pnlRatio = calcPnlRatio(100, 100, 'down');
    assertEqual(calcCloseDelta(500, 5, pnlRatio), 500, 'full margin should be returned');
    assertEqual(calcNetResult(500, 5, pnlRatio), 0, 'breakeven pnl should stay zero');
});

test('short trade earns profit when price falls', () => {
    const pnlRatio = calcPnlRatio(100, 90, 'down');
    assertEqual(calcCloseDelta(500, 5, pnlRatio), 750, 'closing value should include linear leveraged profit');
    assertEqual(calcNetResult(500, 5, pnlRatio), 250, 'net profit should be positive and proportional');
});

test('higher leverage increases loss size on failed trade', () => {
    const pnlRatio = calcPnlRatio(100, 90, 'up');
    assertEqual(calcCloseDelta(500, 2, pnlRatio), 400, 'x2 should magnify the loss');
    assertEqual(calcNetResult(500, 2, pnlRatio), -100, 'net loss should be larger at x2');
    assertEqual(calcCloseDelta(500, 5, pnlRatio), 250, 'x5 should magnify the loss more');
    assertEqual(calcNetResult(500, 5, pnlRatio), -250, 'net loss should grow with leverage');
});

test('liquidation caps maximum loss at margin amount', () => {
    const pnlRatio = calcPnlRatio(100, 70, 'up'); // -30% move => raw loss exceeds margin at 5x
    assertEqual(calcNetResult(500, 5, pnlRatio), -500, 'loss must be capped at full margin');
    assertEqual(calcCloseDelta(500, 5, pnlRatio), 0, 'closing value should be zero at liquidation');
});

test('stop loss is based on USDT loss, not trigger price', () => {
    assertEqual(shouldTriggerStopLoss({ netResult: -349.99, stopLossAmount: 350 }), false, 'must not close before loss threshold');
    assertEqual(shouldTriggerStopLoss({ netResult: -350, stopLossAmount: 350 }), true, 'should close exactly at loss threshold');
});

test('take profit does not trigger on zero pnl', () => {
    assertEqual(shouldTriggerTakeProfit({ netResult: 0, takeProfitAmount: 1000 }), false, 'zero pnl must not trigger take profit');
});

test('take profit triggers only after target profit is reached', () => {
    assertEqual(shouldTriggerTakeProfit({ netResult: 999.99, takeProfitAmount: 1000 }), false, 'must wait for full target');
    assertEqual(shouldTriggerTakeProfit({ netResult: 1000, takeProfitAmount: 1000 }), true, 'should trigger at target');
});

// ── Timeframe-switch regression tests ────────────────────────────────────────
// Timeframe invariant model: PnL depends only on entry/current price distance,
// so switching timeframe must never mutate position PnL by itself.

const CANDLE_WIN_SCALE = 12.5;
const CANDLE_LOSS_SCALE = 1.0;
const DEFAULT_BASE_VOL = 0.04;

function getAnchorPrice(bet, candle) {
    if (bet.formingAnchorT === candle.t && Number(bet.formingAnchorPrice) > 0) {
        return bet.formingAnchorPrice;
    }
    return candle.o;
}

function calcAnchoredCandlePnl(bet, candle, currentPrice = candle.c) {
    const openPrice = Math.max(0.000001, getAnchorPrice(bet, candle));
    const rawMove = (currentPrice - openPrice) / openPrice;
    const signedMove = bet.direction === 'up' ? rawMove : -rawMove;
    const normRatio = Math.min(3.0, Math.abs(signedMove) / (DEFAULT_BASE_VOL * 1.5));
    if (signedMove >= 0) {
        return round(bet.amount * normRatio * CANDLE_WIN_SCALE * bet.leverage, 2);
    }
    return round(-bet.amount * normRatio * CANDLE_LOSS_SCALE * bet.leverage, 2);
}

function simulateTimeframeSwitch(bet, newHistory) {
    // Mirror the fix applied in changeInterval()
    const lastClosedCandle = newHistory.length >= 2
        ? newHistory[newHistory.length - 2]
        : newHistory[newHistory.length - 1];
    const formingCandle = newHistory[newHistory.length - 1];
    if (lastClosedCandle) {
        bet.lastCandleT = Math.max(bet.lastCandleT, lastClosedCandle.t);
    }
    if (formingCandle) {
        bet.formingAnchorT = formingCandle.t;
        bet.formingAnchorPrice = formingCandle.c;
    }
    return bet;
}

function countProcessableCandles(bet, history) {
    // Mirror the filter in processNewCandlesForBets()
    const closedCandles = history.slice(0, -1);
    return closedCandles.filter((c) => c && c.t > bet.lastCandleT).length;
}

test('switching from 1h to 1m does not reprocess historical 1m candles', () => {
    // Bet placed on 1h chart: lastCandleT = start of current 1h candle - 1
    const hourStart = 1754650800000; // e.g. 2026-08-08 12:00 UTC
    const bet = { lastCandleT: hourStart - 1, candlePnl: 0, pair: 'BTCUSDT' };

    // New 1m history: 200 candles from 12:00 onwards (each 60 000 ms apart)
    const newHistory = [];
    for (let i = 0; i < 200; i++) {
        newHistory.push({ t: hourStart + i * 60000, o: 100, c: 100 });
    }
    // Before fix: many historical candles would be re-processed
    const countBefore = countProcessableCandles(bet, newHistory);
    assertEqual(countBefore > 0, true, 'historical candles must be present before fix');

    // After fix: no historical candle should be re-processed
    simulateTimeframeSwitch(bet, newHistory);
    const countAfter = countProcessableCandles(bet, newHistory);
    assertEqual(countAfter, 0, 'no historical candles should be processed after timeframe switch');
});

test('switching from 1m to 1h does not reprocess historical 1h candles', () => {
    // Bet placed on 1m chart: lastCandleT = current 1m candle start - 1 (after several minutes)
    const hourStart = 1754650800000;
    const minuteOffset = 25 * 60000; // 25 minutes into the hour
    const bet = { lastCandleT: hourStart + minuteOffset - 1, candlePnl: 0, pair: 'BTCUSDT' };

    // New 1h history: the last closed 1h candle is at hourStart (well before bet.lastCandleT)
    const newHistory = [
        { t: hourStart - 3600000, o: 100, c: 100 },
        { t: hourStart,           o: 100, c: 100 }, // last closed 1h candle
        { t: hourStart + 3600000, o: 100, c: 100 }, // forming candle (excluded by slice)
    ];

    simulateTimeframeSwitch(bet, newHistory);
    const countAfter = countProcessableCandles(bet, newHistory);
    assertEqual(countAfter, 0, 'no historical 1h candles should be processed when switching up');
});

test('timeframe switch preserves existing candlePnl (no mutation)', () => {
    const hourStart = 1754650800000;
    const bet = { lastCandleT: hourStart - 1, candlePnl: 123.45, pair: 'BTCUSDT' };
    const newHistory = [
        { t: hourStart + 60000,  o: 100, c: 101 },
        { t: hourStart + 120000, o: 101, c: 102 },
        { t: hourStart + 180000, o: 102, c: 103 }, // forming
    ];
    simulateTimeframeSwitch(bet, newHistory);
    assertEqual(bet.candlePnl, 123.45, 'existing PnL must not be mutated during timeframe switch');
});

test('TP/SL not triggered on timeframe switch when PnL unchanged', () => {
    const hourStart = 1754650800000;
    const bet = { lastCandleT: hourStart - 1, candlePnl: 50, pair: 'BTCUSDT', stopLossAmount: 100, takeProfitAmount: 200 };
    const newHistory = [];
    for (let i = 0; i < 200; i++) {
        newHistory.push({ t: hourStart + i * 60000, o: 100, c: 100 });
    }
    simulateTimeframeSwitch(bet, newHistory);
    // candlePnl must still be 50 — TP at 200 and SL at -100 must not be reached
    assertEqual(shouldTriggerStopLoss({ netResult: bet.candlePnl, stopLossAmount: bet.stopLossAmount }), false, 'SL must not fire after timeframe switch');
    assertEqual(shouldTriggerTakeProfit({ netResult: bet.candlePnl, takeProfitAmount: bet.takeProfitAmount }), false, 'TP must not fire after timeframe switch');
});

test('timeframe switch keeps the same live PnL when price is unchanged', () => {
    const hourStart = 1754650800000;
    const bet = {
        lastCandleT: hourStart - 1,
        candlePnl: 50,
        pair: 'BTCUSDT',
        direction: 'up',
        amount: 500,
        leverage: 5,
        entryPrice: 100
    };
    const newHistory = [
        { t: hourStart + 60000,  o: 100, c: 101 },
        { t: hourStart + 120000, o: 101, c: 102 },
        { t: hourStart + 180000, o: 80,  c: 120 }
    ];

    const pnlBefore = calcNetResult(bet.amount, bet.leverage, calcPnlRatio(bet.entryPrice, 120, bet.direction));
    simulateTimeframeSwitch(bet, newHistory);
    const pnlAfter = calcNetResult(bet.amount, bet.leverage, calcPnlRatio(bet.entryPrice, 120, bet.direction));
    assertEqual(pnlAfter, pnlBefore, 'switching timeframe must not change live PnL');
});

test('anchored candle closes using anchor price instead of candle open after timeframe switch', () => {
    const candleT = 1754650800000;
    const bet = {
        direction: 'up',
        amount: 100,
        leverage: 2,
        formingAnchorT: candleT,
        formingAnchorPrice: 120
    };
    const closedCandle = { t: candleT, o: 80, c: 126 };

    const anchoredPnl = calcAnchoredCandlePnl(bet, closedCandle);
    const unanchoredPnl = calcAnchoredCandlePnl({ ...bet, formingAnchorT: null, formingAnchorPrice: null }, closedCandle);

    assertEqual(anchoredPnl < unanchoredPnl, true, 'pre-switch candle move must be ignored after re-anchoring');
    assertEqual(anchoredPnl > 0, true, 'post-switch move in the right direction should still count');
});

test('new bet starts with zero live PnL inside current candle', () => {
    const candleT = 1754650800000;
    const bet = {
        direction: 'up',
        amount: 100,
        leverage: 2,
        formingAnchorT: candleT,
        formingAnchorPrice: 120
    };
    const formingCandle = { t: candleT, o: 80, c: 120 };

    assertEqual(calcAnchoredCandlePnl(bet, formingCandle, 120), 0, 'placing a bet mid-candle must not inherit prior move');
});

console.log(`\nPassed: ${passed}, Failed: ${failed}`);
if (failed > 0) process.exit(1);
