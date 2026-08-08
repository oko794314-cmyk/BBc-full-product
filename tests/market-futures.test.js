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
    const scaledPnl = pnlRatio >= 0
        ? amount * pnlRatio * 2.5 * safeLeverage
        : amount * pnlRatio * (1 / safeLeverage);
    return round(Math.max(0, amount + scaledPnl), 2);
}

function calcNetResult(amount, leverage, pnlRatio) {
    return round(calcCloseDelta(amount, leverage, pnlRatio) - amount, 2);
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
    assertEqual(calcCloseDelta(500, 5, pnlRatio), 1125, 'closing value should include leveraged profit');
    assertEqual(calcNetResult(500, 5, pnlRatio), 625, 'net profit should be positive and multiplied');
});

test('higher leverage reduces loss size on failed trade', () => {
    const pnlRatio = calcPnlRatio(100, 90, 'up');
    assertEqual(calcCloseDelta(500, 2, pnlRatio), 475, 'x2 should divide the loss by 2');
    assertEqual(calcNetResult(500, 2, pnlRatio), -25, 'net loss should be halved at x2');
    assertEqual(calcCloseDelta(500, 5, pnlRatio), 490, 'x5 should divide the loss by 5');
    assertEqual(calcNetResult(500, 5, pnlRatio), -10, 'net loss should shrink with higher leverage');
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
// Simulate the fix: after a timeframe switch the bet's lastCandleT must be
// advanced to the last closed candle in the new history so that historical
// candles from the new timeframe are never re-processed.

function simulateTimeframeSwitch(bet, newHistory) {
    // Mirror the fix applied in changeInterval()
    const lastClosedCandle = newHistory.length >= 2
        ? newHistory[newHistory.length - 2]
        : newHistory[newHistory.length - 1];
    if (lastClosedCandle) {
        bet.lastCandleT = Math.max(bet.lastCandleT, lastClosedCandle.t);
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

console.log(`\nPassed: ${passed}, Failed: ${failed}`);
if (failed > 0) process.exit(1);
