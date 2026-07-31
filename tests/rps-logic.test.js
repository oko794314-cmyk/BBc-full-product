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

// ===== REAL ESTATE TAXES =====
const TAX_BILL_BASE = 0.12;
const TAX_LEVEL_EXPONENT = 1.25;
const TAX_LEVEL_FACTOR = 0.28;
const TAX_PRICE_FACTOR = 0.0020;
const TAX_COUNT_FACTOR = 0.10;
const TAX_PORTFOLIO_FACTOR = 0.00012;

function toFiniteNumber(value, fallback = 0) {
    return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function getTaxablePropertyValue(definition, level) {
    const basePrice = Math.max(0, toFiniteNumber(definition?.price, 0));
    const upgradeBase = Math.max(0, toFiniteNumber(definition?.upgradeBase, 0));
    return basePrice + (upgradeBase * Math.max(0, level - 1));
}

function calcTaxBillAmount(catalog, properties) {
    const ownedProperties = catalog.filter(def => !!properties?.[def.id]);
    if (!ownedProperties.length) return 0;
    let total = 0;
    let portfolioValue = 0;
    ownedProperties.forEach(def => {
        const level = Math.max(1, toFiniteNumber(properties[def.id]?.level, 1));
        const propertyValue = getTaxablePropertyValue(def, level);
        portfolioValue += propertyValue;
        total += TAX_BILL_BASE + (Math.pow(level, TAX_LEVEL_EXPONENT) * TAX_LEVEL_FACTOR) + (propertyValue * TAX_PRICE_FACTOR);
    });
    const quantityMultiplier = 1 + Math.max(0, ownedProperties.length - 1) * TAX_COUNT_FACTOR;
    const portfolioMultiplier = 1 + (portfolioValue * TAX_PORTFOLIO_FACTOR);
    return Math.round(total * quantityMultiplier * portfolioMultiplier * 100) / 100;
}

// ===== TOURNAMENT BRACKET FLOW =====
function advanceBracket(bracket) {
    let changed = false;
    for (let ri = 0; ri < bracket.length - 1; ri++) {
        for (let mi = 0; mi < bracket[ri].length; mi++) {
            const m = bracket[ri][mi];
            if (!m?.winner) continue;
            const nextMi = Math.floor(mi / 2);
            const next = bracket[ri + 1]?.[nextMi];
            if (!next) continue;
            if (mi % 2 === 0 && !next.p1) { next.p1 = m.winner; changed = true; }
            if (mi % 2 === 1 && !next.p2) { next.p2 = m.winner; changed = true; }
            if (next.p1 && next.p2 && next.status === 'waiting') { next.status = 'queued'; changed = true; }
        }
    }
    return changed;
}

function activateNextPendingMatch(bracket) {
    for (const round of bracket) for (const m of round) if (m.status === 'pending') return false;
    for (const round of bracket) {
        for (const m of round) {
            if (m.status === 'queued' && m.p1 && m.p2) {
                m.status = 'pending';
                return true;
            }
        }
    }
    return false;
}

function buildBracket(players) {
    const rounds = [];
    const r1 = [];
    let pendingAssigned = false;
    for (let i = 0; i < players.length; i += 2) {
        if (i + 1 < players.length) {
            r1.push({ p1: players[i], p2: players[i + 1], winner: null, status: pendingAssigned ? 'queued' : 'pending' });
            pendingAssigned = true;
        } else {
            r1.push({ p1: players[i], p2: null, winner: players[i], status: 'bye' });
        }
    }
    rounds.push(r1);
    let matchCount = Math.ceil(players.length / 2);
    while (matchCount > 1) {
        matchCount = Math.ceil(matchCount / 2);
        rounds.push(Array.from({ length: matchCount }, () => ({ p1: null, p2: null, winner: null, status: 'waiting' })));
    }
    let changed = true;
    let guard = 0;
    while (changed && guard < 16) {
        changed = advanceBracket(rounds);
        guard++;
    }
    activateNextPendingMatch(rounds);
    return rounds;
}

function getTournamentTop3Users(bracket) {
    const top = {};
    const final = bracket?.[bracket.length - 1]?.[0];
    if (final?.winner) {
        top[1] = final.winner;
        if (final.p1 && final.p2) top[2] = final.winner === final.p1 ? final.p2 : final.p1;
    }
    const semis = bracket?.[bracket.length - 2] || [];
    const semiLosers = semis
        .filter(m => m?.status === 'done' && m.p1 && m.p2 && m.winner)
        .map(m => (m.winner === m.p1 ? m.p2 : m.p1))
        .filter(Boolean);
    if (semiLosers.length) top[3] = semiLosers[0];
    return top;
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

// ----- Real Estate Tax Tests -----
console.log('\n📋 Real Estate Tax Tests:');

const taxCatalog = [
    { id: 'apartment', price: 18, upgradeBase: 9 },
    { id: 'house', price: 35, upgradeBase: 15 },
    { id: 'space_station', price: 5000, upgradeBase: 1800 }
];

test('no real estate means no tax bill', () => {
    assertEqual(calcTaxBillAmount(taxCatalog, {}), 0);
});

test('single low-tier property has a small bill', () => {
    assertEqual(calcTaxBillAmount(taxCatalog, { apartment: { level: 1 } }), 0.44);
});

test('property level increases taxable market value and tax amount', () => {
    assertEqual(getTaxablePropertyValue({ price: 18, upgradeBase: 9 }, 3), 36);
    assertEqual(calcTaxBillAmount(taxCatalog, { apartment: { level: 3 } }), 1.30);
});

test('multiple properties increase tax through count and portfolio scaling', () => {
    assertEqual(calcTaxBillAmount(taxCatalog, {
        apartment: { level: 1 },
        house: { level: 2 }
    }), 1.47);
});

test('luxury property creates a much larger tax bill', () => {
    assertEqual(calcTaxBillAmount(taxCatalog, { space_station: { level: 2 } }), 26.12);
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

// ----- Tournament Flow Tests -----
console.log('\n📋 Tournament Flow Tests:');

test('only one pending match exists at start of tournament', () => {
    const bracket = buildBracket(['u1', 'u2', 'u3', 'u4', 'u5', 'u6']);
    const pendingCount = bracket.flat().filter(m => m.status === 'pending').length;
    assertEqual(pendingCount, 1);
});

test('next queued match becomes pending after previous resolves', () => {
    const bracket = buildBracket(['u1', 'u2', 'u3', 'u4']);
    bracket[0][0].winner = 'u1';
    bracket[0][0].status = 'done';
    activateNextPendingMatch(bracket);
    const pending = bracket[0].filter(m => m.status === 'pending');
    assertEqual(pending.length, 1);
    assertEqual(pending[0].p1, 'u3');
    assertEqual(pending[0].p2, 'u4');
});

test('top-3 extraction returns champion, finalist and semifinal loser', () => {
    const bracket = [
        [
            { p1: 'a', p2: 'b', winner: 'a', status: 'done' },
            { p1: 'c', p2: 'd', winner: 'c', status: 'done' }
        ],
        [
            { p1: 'a', p2: 'c', winner: 'c', status: 'done' }
        ]
    ];
    const top3 = getTournamentTop3Users(bracket);
    assertEqual(top3[1], 'c');
    assertEqual(top3[2], 'a');
    assertEqual(top3[3], 'b');
});

// ----- Week Key Tests -----
console.log('\n📋 Week Key Tests:');

// Mirrors the fixed getWeekKey() from bb-extended-features.js
function getWeekKey(date) {
    const d = date || new Date();
    const target = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayOfWeek = target.getUTCDay() || 7; // 1=Mon … 7=Sun
    target.setUTCDate(target.getUTCDate() + 4 - dayOfWeek); // Thursday of this week
    const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
    const weekNum = Math.ceil((((target - yearStart) / 86400000) + 1) / 7);
    return `${target.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

test('getWeekKey produces unique keys for different weeks in same month', () => {
    // Monday Jan 6 and Monday Jan 13 must have different week keys
    const jan6  = getWeekKey(new Date('2025-01-06'));
    const jan13 = getWeekKey(new Date('2025-01-13'));
    assert(jan6 !== jan13, `Jan 6 and Jan 13 both returned ${jan6}`);
});

test('getWeekKey produces unique keys for first weeks of different months', () => {
    // Old buggy code produced "2025-W01" for both; new code uses ISO week numbers
    const jan6  = getWeekKey(new Date('2025-01-06'));  // ISO week 2
    const feb3  = getWeekKey(new Date('2025-02-03'));  // ISO week 6
    assert(jan6 !== feb3, `Jan 6 and Feb 3 both returned ${jan6}`);
});

test('getWeekKey same day returns same key', () => {
    const a = getWeekKey(new Date('2025-07-14'));
    const b = getWeekKey(new Date('2025-07-14'));
    assertEqual(a, b);
});

test('getWeekKey days within the same ISO week share a key', () => {
    // Monday 2025-01-06 through Sunday 2025-01-12 are all ISO week 2025-W02
    const mon = getWeekKey(new Date('2025-01-06'));
    const wed = getWeekKey(new Date('2025-01-08'));
    const sun = getWeekKey(new Date('2025-01-12'));
    assertEqual(mon, wed);
    assertEqual(wed, sun);
});

test('getWeekKey key format is YYYY-Wnn', () => {
    const key = getWeekKey(new Date('2025-03-15'));
    assert(/^\d{4}-W\d{2}$/.test(key), `Key "${key}" does not match YYYY-Wnn format`);
});

// ----- Auth Case-Insensitive Fallback Tests -----
console.log('\n📋 Auth Case-Insensitive Fallback Tests:');

// Mirrors the fallback logic from auth() in index.html
function resolveUsername(inputUsername, db) {
    // db is a simple object mapping usernames to user data
    let userData = db[inputUsername] || null;
    let resolvedUsername = inputUsername;
    if (!userData) {
        const lower = inputUsername.toLowerCase();
        if (lower !== inputUsername && db[lower]) {
            userData = db[lower];
            resolvedUsername = lower;
        }
    }
    return { userData, resolvedUsername };
}

test('auth finds exact-case username', () => {
    const db = { 'Alice': { password: 'pass' }, 'bob': { password: '1234' } };
    const { userData, resolvedUsername } = resolveUsername('Alice', db);
    assert(userData !== null, 'should find Alice');
    assertEqual(resolvedUsername, 'Alice');
});

test('auth finds username via lowercase fallback', () => {
    const db = { 'alice': { password: 'pass' } };
    const { userData, resolvedUsername } = resolveUsername('Alice', db);
    assert(userData !== null, 'should find alice via fallback');
    assertEqual(resolvedUsername, 'alice');
});

test('auth returns null for completely unknown username', () => {
    const db = { 'alice': { password: 'pass' } };
    const { userData } = resolveUsername('bob', db);
    assert(userData === null, 'bob should not be found');
});

test('auth does not accidentally match partial lowercase', () => {
    const db = { 'alice_admin': { password: 'pass' } };
    const { userData } = resolveUsername('alice', db);
    assert(userData === null, 'alice should not match alice_admin');
});

// ===== SUMMARY =====
console.log(`\n${'='.repeat(40)}`);
console.log(`Total: ${passed + failed} | ✅ Passed: ${passed} | ❌ Failed: ${failed}`);
if (failed > 0) process.exit(1);
