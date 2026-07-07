/**
 * Tests for RPS Online key logic
 * Run with: node tests/rps-logic.test.js
 */

// ===== RPS WINNER LOGIC =====
// Mirrors the rpsWinner() function from index.html
function rpsWinner(c1, c2) {
    if (!c1 && !c2) return 0;  // both timed out — draw
    if (!c1) return -1;         // player1 timed out — player2 wins
    if (!c2) return 1;          // player2 timed out — player1 wins
    if (c1 === c2) return 0;
    if (
        (c1 === 'rock' && c2 === 'scissors') ||
        (c1 === 'scissors' && c2 === 'paper') ||
        (c1 === 'paper' && c2 === 'rock')
    ) return 1;
    return -1;
}

// Mirrors the resolveRpsMatchFirebase winner logic from firebase-sync.js
function resolveWinner(c1, c2) {
    if (!c1 || !c2) return null;
    if (c1 === c2) return 'draw';
    if (
        (c1 === 'rock' && c2 === 'scissors') ||
        (c1 === 'scissors' && c2 === 'paper') ||
        (c1 === 'paper' && c2 === 'rock')
    ) return 'player1';
    return 'player2';
}

// ===== BET VALIDATION =====
function validateBet(bet, senderBalance, receiverBalance) {
    const errors = [];
    if (!bet || isNaN(bet) || bet <= 0) errors.push('invalid_bet');
    if (senderBalance < bet) errors.push('sender_insufficient');
    if (receiverBalance < bet) errors.push('receiver_insufficient');
    return errors;
}

// ===== BADGE COUNT =====
function computeUnreadCount(messages, lastReadCount, currentUser) {
    const newMsgs = messages.slice(Math.max(0, lastReadCount));
    return newMsgs.filter(m => m.from !== currentUser).length;
}

function badgeDisplay(total) {
    return total > 9 ? '9+' : String(total);
}

// ===== EXCHANGE LIMIT MATCHING =====
function canOrdersMatch(order, candidate, currentPrice) {
    if (!order || !candidate) return false;
    const orderLimit = Number(order.limitPrice);
    const candidatePrice = Number.isFinite(Number(candidate.limitPrice)) ? Number(candidate.limitPrice) : currentPrice || 1;
    if (order.orderType === 'limit' && order.side === 'buy') {
        return Number.isFinite(orderLimit) && candidatePrice <= orderLimit;
    }
    if (order.orderType === 'limit' && order.side === 'sell') {
        return Number.isFinite(orderLimit) && candidatePrice >= orderLimit;
    }
    return true;
}

// ===== TESTS =====
let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`  ✅ ${name}`);
        passed++;
    } catch (e) {
        console.error(`  ❌ ${name}: ${e.message}`);
        failed++;
    }
}

function assert(condition, msg) {
    if (!condition) throw new Error(msg || 'assertion failed');
}

function assertEqual(a, b, msg) {
    if (a !== b) throw new Error(`${msg || ''}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

// ----- RPS Outcome Tests -----
console.log('\n📋 RPS Outcome Tests:');

test('rock beats scissors', () => {
    assertEqual(rpsWinner('rock', 'scissors'), 1);
    assertEqual(resolveWinner('rock', 'scissors'), 'player1');
});

test('scissors beats paper', () => {
    assertEqual(rpsWinner('scissors', 'paper'), 1);
    assertEqual(resolveWinner('scissors', 'paper'), 'player1');
});

test('paper beats rock', () => {
    assertEqual(rpsWinner('paper', 'rock'), 1);
    assertEqual(resolveWinner('paper', 'rock'), 'player1');
});

test('scissors loses to rock', () => {
    assertEqual(rpsWinner('scissors', 'rock'), -1);
    assertEqual(resolveWinner('scissors', 'rock'), 'player2');
});

test('paper loses to scissors', () => {
    assertEqual(rpsWinner('paper', 'scissors'), -1);
    assertEqual(resolveWinner('paper', 'scissors'), 'player2');
});

test('rock loses to paper', () => {
    assertEqual(rpsWinner('rock', 'paper'), -1);
    assertEqual(resolveWinner('rock', 'paper'), 'player2');
});

test('same choice is draw', () => {
    assertEqual(rpsWinner('rock', 'rock'), 0);
    assertEqual(rpsWinner('scissors', 'scissors'), 0);
    assertEqual(rpsWinner('paper', 'paper'), 0);
    assertEqual(resolveWinner('rock', 'rock'), 'draw');
});

test('player1 timeout loses', () => {
    assertEqual(rpsWinner(null, 'rock'), -1);
});

test('player2 timeout loses', () => {
    assertEqual(rpsWinner('rock', null), 1);
});

test('both timeout is draw', () => {
    assertEqual(rpsWinner(null, null), 0);
});

// ----- Bet Validation Tests -----
console.log('\n📋 Bet Validation Tests:');

test('valid bet with sufficient balances', () => {
    const errors = validateBet(5, 10, 10);
    assertEqual(errors.length, 0);
});

test('zero bet is invalid', () => {
    const errors = validateBet(0, 10, 10);
    assert(errors.includes('invalid_bet'));
});

test('negative bet is invalid', () => {
    const errors = validateBet(-1, 10, 10);
    assert(errors.includes('invalid_bet'));
});

test('NaN bet is invalid', () => {
    const errors = validateBet(NaN, 10, 10);
    assert(errors.includes('invalid_bet'));
});

test('sender has insufficient balance', () => {
    const errors = validateBet(5, 3, 10);
    assert(errors.includes('sender_insufficient'));
});

test('receiver has insufficient balance', () => {
    const errors = validateBet(5, 10, 3);
    assert(errors.includes('receiver_insufficient'));
});

test('both players insufficient', () => {
    const errors = validateBet(5, 3, 3);
    assert(errors.includes('sender_insufficient'));
    assert(errors.includes('receiver_insufficient'));
});

test('exact bet equals balance (valid)', () => {
    const errors = validateBet(10, 10, 10);
    assertEqual(errors.length, 0);
});

// ----- Badge Count Tests -----
console.log('\n📋 Badge Count (Notification) Tests:');

const msgs = [
    { from: 'alice', text: 'hi' },
    { from: 'alice', text: 'hello' },
    { from: 'me',    text: 'hey' },
    { from: 'alice', text: 'how are you' },
    { from: 'alice', text: 'msg5' },
    { from: 'alice', text: 'msg6' },
    { from: 'alice', text: 'msg7' },
    { from: 'alice', text: 'msg8' },
    { from: 'alice', text: 'msg9' },
    { from: 'alice', text: 'msg10' },
    { from: 'alice', text: 'msg11' },
];

test('no unread when lastReadCount equals total messages', () => {
    const unread = computeUnreadCount(msgs, msgs.length, 'me');
    assertEqual(unread, 0);
});

test('correct unread count from stored position', () => {
    // Stored lastRead = 2 (read first 2 messages), then 9 new ones: msgs 3-11 (indices 2-10)
    // From those: msg[2] is from 'me' (not counted), msgs[3..10] are from 'alice' = 8
    const unread = computeUnreadCount(msgs, 2, 'me');
    assertEqual(unread, 8);
});

test('all messages unread when lastRead = 0', () => {
    // 10 from alice, 1 from me = 10 unread from others
    const unread = computeUnreadCount(msgs, 0, 'me');
    assertEqual(unread, 10);
});

test('badge shows exact count when <= 9', () => {
    assertEqual(badgeDisplay(0), '0');
    assertEqual(badgeDisplay(1), '1');
    assertEqual(badgeDisplay(9), '9');
});

test('badge shows 9+ when count > 9', () => {
    assertEqual(badgeDisplay(10), '9+');
    assertEqual(badgeDisplay(99), '9+');
});

test('badge does NOT show 9+ when count is exactly 9', () => {
    assert(badgeDisplay(9) !== '9+', 'count=9 should not be 9+');
});

// ----- Exchange Matching Tests -----
console.log('\n📋 Exchange Matching Tests:');

test('limit buy matches only if candidate price is not above limit', () => {
    assertEqual(canOrdersMatch({ orderType: 'limit', side: 'buy', limitPrice: 2 }, { limitPrice: 1.5 }, 1), true);
    assertEqual(canOrdersMatch({ orderType: 'limit', side: 'buy', limitPrice: 2 }, { limitPrice: 2.5 }, 1), false);
});

test('limit sell matches only if candidate price is not below limit', () => {
    assertEqual(canOrdersMatch({ orderType: 'limit', side: 'sell', limitPrice: 2 }, { limitPrice: 2.5 }, 1), true);
    assertEqual(canOrdersMatch({ orderType: 'limit', side: 'sell', limitPrice: 2 }, { limitPrice: 1.5 }, 1), false);
});

test('market orders ignore explicit price limits', () => {
    assertEqual(canOrdersMatch({ orderType: 'market', side: 'buy' }, { limitPrice: 999 }, 1), true);
    assertEqual(canOrdersMatch({ orderType: 'market', side: 'sell' }, { limitPrice: 0.0001 }, 1), true);
});

test('badge shows 0 not 9+ when no unread', () => {
    assertEqual(badgeDisplay(0), '0');
});

// ----- Shop Prices Tests -----
console.log('\n📋 Shop Prices Tests:');

const shopCatalog = [
    { id: 'frame_gold',   price: 7  },
    { id: 'frame_neon',   price: 3  },
    { id: 'frame_red',    price: 2  },
    { id: 'frame_cyan',   price: 9  },
    { id: 'bg_space',     price: 4  },
    { id: 'bg_neon',      price: 6  },
    { id: 'bg_purple',    price: 5  },
    { id: 'bg_matrix',    price: 8  },
    { id: 'badge_vip',    price: 10 },
    { id: 'title_boss',   price: 8  },
    { id: 'effect_spark', price: 10 },
];

test('all shop prices are in range 1-10', () => {
    shopCatalog.forEach(item => {
        assert(item.price >= 1 && item.price <= 10,
            `${item.id} price ${item.price} is outside 1-10 range`);
    });
});

test('no shop item has old high price (>10)', () => {
    shopCatalog.forEach(item => {
        assert(item.price <= 10, `${item.id} still has high price ${item.price}`);
    });
});

// ===== SUMMARY =====
console.log(`\n${'='.repeat(40)}`);
console.log(`Total: ${passed + failed} | ✅ Passed: ${passed} | ❌ Failed: ${failed}`);
if (failed > 0) process.exit(1);
