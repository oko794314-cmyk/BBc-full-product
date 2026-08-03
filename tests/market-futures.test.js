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
    return round(Math.max(0, amount + (amount * pnlRatio * Math.max(1, leverage))), 2);
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
    assertEqual(calcCloseDelta(500, 5, pnlRatio), 750, 'closing value should include margin plus profit');
    assertEqual(calcNetResult(500, 5, pnlRatio), 250, 'net profit should be positive');
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

console.log(`\nPassed: ${passed}, Failed: ${failed}`);
if (failed > 0) process.exit(1);
