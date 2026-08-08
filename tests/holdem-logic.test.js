/**
 * Tests for Hold'em / draw poker hand evaluation logic
 * Run with: node tests/holdem-logic.test.js
 */

const HOLDEM_PAYOUTS = {
    royal_flush: 100,
    straight_flush: 50,
    four_kind: 25,
    full_house: 12,
    flush: 8,
    straight: 6,
    three_kind: 4,
    two_pair: 2.5,
    pair: 1.5,
    high_card: 0
};

function evaluateHoldemHand(hand) {
    if (!Array.isArray(hand) || hand.length !== 5) {
        return { key: 'high_card', multiplier: 0 };
    }
    const values = hand.map(card => Number(card.value)).sort((a, b) => a - b);
    const suits = hand.map(card => card.suit);
    const countsMap = values.reduce((acc, value) => {
        acc[value] = (acc[value] || 0) + 1;
        return acc;
    }, {});
    const counts = Object.values(countsMap).sort((a, b) => b - a);
    const uniqueValues = [...new Set(values)];
    const isFlush = suits.every(suit => suit === suits[0]);
    const isWheel = uniqueValues.length === 5 && uniqueValues.join(',') === '2,3,4,5,14';
    const isStraight = uniqueValues.length === 5 && (isWheel || uniqueValues.every((value, index) => index === 0 || value === uniqueValues[index - 1] + 1));
    const isRoyal = isFlush && uniqueValues.join(',') === '10,11,12,13,14';

    let key = 'high_card';
    if (isRoyal) key = 'royal_flush';
    else if (isFlush && isStraight) key = 'straight_flush';
    else if (counts[0] === 4) key = 'four_kind';
    else if (counts[0] === 3 && counts[1] === 2) key = 'full_house';
    else if (isFlush) key = 'flush';
    else if (isStraight) key = 'straight';
    else if (counts[0] === 3) key = 'three_kind';
    else if (counts[0] === 2 && counts[1] === 2) key = 'two_pair';
    else if (counts[0] === 2) key = 'pair';

    return { key, multiplier: HOLDEM_PAYOUTS[key] || 0 };
}

function c(rank, suit) {
    const values = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, J: 11, Q: 12, K: 13, A: 14 };
    return { rank, suit, value: values[rank] };
}

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

function assertEqual(a, b, msg) {
    if (a !== b) throw new Error(`${msg || ''}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

console.log('\n🃏 Holdem Hand Evaluation Tests:');

test('detects royal flush', () => {
    const result = evaluateHoldemHand([c('10', '♠'), c('J', '♠'), c('Q', '♠'), c('K', '♠'), c('A', '♠')]);
    assertEqual(result.key, 'royal_flush');
    assertEqual(result.multiplier, 100);
});

test('detects straight flush', () => {
    const result = evaluateHoldemHand([c('5', '♥'), c('6', '♥'), c('7', '♥'), c('8', '♥'), c('9', '♥')]);
    assertEqual(result.key, 'straight_flush');
});

test('detects wheel straight', () => {
    const result = evaluateHoldemHand([c('A', '♠'), c('2', '♥'), c('3', '♦'), c('4', '♣'), c('5', '♠')]);
    assertEqual(result.key, 'straight');
});

test('detects full house', () => {
    const result = evaluateHoldemHand([c('K', '♠'), c('K', '♥'), c('K', '♦'), c('9', '♣'), c('9', '♠')]);
    assertEqual(result.key, 'full_house');
});

test('detects two pair', () => {
    const result = evaluateHoldemHand([c('Q', '♠'), c('Q', '♥'), c('8', '♦'), c('8', '♣'), c('2', '♠')]);
    assertEqual(result.key, 'two_pair');
    assertEqual(result.multiplier, 2.5);
});

test('detects losing high card hand', () => {
    const result = evaluateHoldemHand([c('A', '♠'), c('J', '♥'), c('8', '♦'), c('4', '♣'), c('2', '♠')]);
    assertEqual(result.key, 'high_card');
    assertEqual(result.multiplier, 0);
});

if (failed > 0) {
    console.error(`\n❌ Failed: ${failed}, Passed: ${passed}`);
    process.exit(1);
}

console.log(`\n✅ All Holdem tests passed (${passed})`);
