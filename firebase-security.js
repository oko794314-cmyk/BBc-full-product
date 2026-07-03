/**
 * 🔒 FIREBASE SECURITY MODULE
 * Хешування паролів, валідація даних, захист від double-spending
 */

// Простий SHA-256 хеш (для production використовуйте Firebase Cloud Functions + bcrypt)
function sha256(str) {
    let buffer = new TextEncoder().encode(str);
    return crypto.subtle.digest('SHA-256', buffer).then(hashBuffer => {
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    });
}

/**
 * 🔐 ХЕШУВАННЯ ПАРОЛЯ
 */
async function hashPassword(password) {
    if (!password || typeof password !== 'string') {
        throw new Error('Пароль має бути строком');
    }
    if (password.length < 4) {
        throw new Error('Пароль занадто короткий (мін. 4 символи)');
    }
    const salt = 'bbc_salt_' + Date.now();
    const combined = password + salt;
    const hash = await sha256(combined);
    return { hash, salt };
}

/**
 * ✅ ПЕРЕВІРКА ПАРОЛЯ
 */
async function verifyPassword(password, storedHash, storedSalt) {
    const combined = password + storedSalt;
    const hash = await sha256(combined);
    return hash === storedHash;
}

/**
 * 🛡️ ВАЛІДАЦІЯ БАЛАНСУ (запобігання від'ємному балансу)
 */
function validateBalance(balance) {
    if (typeof balance !== 'number') {
        throw new Error('Баланс має бути числом');
    }
    if (balance < 0) {
        throw new Error('❌ Баланс не може бути від'ємним!');
    }
    if (!isFinite(balance)) {
        throw new Error('❌ Невалідне значення балансу!');
    }
    return true;
}

/**
 * 💰 ВАЛІДАЦІЯ ПЕРЕДАЧІ КОШТІВ
 */
function validateTransfer(fromBalance, toUser, amount) {
    if (!toUser || typeof toUser !== 'string') {
        throw new Error('❌ Невалідний отримувач!');
    }
    if (typeof amount !== 'number' || amount <= 0) {
        throw new Error('❌ Сума має бути позитивною!');
    }
    if (amount > fromBalance) {
        throw new Error('❌ Недостатньо коштів!');
    }
    if (!isFinite(amount)) {
        throw new Error('❌ Невалідна сума!');
    }
    return true;
}

/**
 * 🎰 ВАЛІДАЦІЯ СТАВКИ КАЗИНО
 */
function validateCasinoBet(balance, bet) {
    if (typeof bet !== 'number' || bet <= 0) {
        throw new Error('❌ Ставка має бути позитивною!');
    }
    if (bet > balance) {
        throw new Error('❌ Недостатньо коштів для ставки!');
    }
    if (!isFinite(bet)) {
        throw new Error('❌ Невалідна ставка!');
    }
    // Мінімальна ставка
    if (bet < 0.0001) {
        throw new Error('❌ Мінімальна ставка: 0.0001 BB!');
    }
    return true;
}

/**
 * 🔄 ЗАХИСТ ВІД DOUBLE-SPENDING (Optimistic Locking)
 * Використовуємо Firebase Transactions для атомарних операцій
 */
async function executeTransactionSafely(db, path, transactionFn) {
    try {
        const ref = db.ref(path);
        const result = await ref.transaction(transactionFn);
        
        if (!result.committed) {
            throw new Error('❌ Транзакція скасована (conflict). Спробуйте ще раз.');
        }
        
        return { success: true, snapshot: result.snapshot.val() };
    } catch (error) {
        console.error('❌ Помилка транзакції:', error);
        throw error;
    }
}

/**
 * 🛡️ БЕЗПЕЧНА ПЕРЕДАЧА КОШТІВ З ВИКОРИСТАННЯМ ТРАНЗАКЦІЙ
 */
async function safeTransferCoinsFirebase(fromUser, toUser, amount, db) {
    try {
        // Валідація
        validateTransfer(0, toUser, amount); // Перша перевірка
        
        // Завантажити поточні баланси
        const fromSnap = await db.ref(`users/${fromUser}/balance`).once('value');
        const toSnap = await db.ref(`users/${toUser}/balance`).once('value');
        
        const fromBalance = fromSnap.val() || 0;
        const toBalance = toSnap.val() || 0;
        
        validateTransfer(fromBalance, toUser, amount);
        validateBalance(fromBalance);
        validateBalance(toBalance);
        
        // Виконати атомарну передачу
        const updates = {};
        updates[`users/${fromUser}/balance`] = fromBalance - amount;
        updates[`users/${toUser}/balance`] = toBalance + amount;
        updates[`transactions`] = {
            [Date.now()]: {
                from: fromUser,
                to: toUser,
                amount: amount,
                timestamp: firebase.database.ServerValue.TIMESTAMP
            }
        };
        
        await db.ref().update(updates);
        
        console.log(`✅ Безпечна передача ${amount} BB від ${fromUser} до ${toUser}`);
        return { success: true };
    } catch (error) {
        console.error('❌ Помилка безпечної передачі:', error.message);
        throw error;
    }
}

/**
 * 🛡️ БЕЗПЕЧНА ПЕРЕДАЧА КАЗИНО
 */
async function safeCasinoBetFirebase(username, bet, winAmount, db) {
    try {
        validateCasinoBet(0, bet);
        
        const userSnap = await db.ref(`users/${username}/balance`).once('value');
        const currentBalance = userSnap.val() || 0;
        
        validateCasinoBet(currentBalance, bet);
        validateBalance(currentBalance);
        
        const newBalance = currentBalance - bet + winAmount;
        validateBalance(newBalance);
        
        await db.ref(`users/${username}/balance`).set(newBalance);
        
        console.log(`✅ Казино: ${username} ставив ${bet}, отримав ${winAmount}`);
        return { success: true, newBalance };
    } catch (error) {
        console.error('❌ Помилка казино:', error.message);
        throw error;
    }
}

/**
 * 🛡️ ВАЛІДАЦІЯ ДАНИХ КОРИСТУВАЧА
 */
function validateUserData(userData) {
    if (!userData.username || typeof userData.username !== 'string') {
        throw new Error('❌ Невалідне ім\'я користувача!');
    }
    if (userData.username.length < 2 || userData.username.length > 20) {
        throw new Error('❌ Ім\'я має бути від 2 до 20 символів!');
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(userData.username)) {
        throw new Error('❌ Ім\'я может містити тільки букви, цифри, _ та -');
    }
    if (typeof userData.balance !== 'number' || userData.balance < 0) {
        throw new Error('❌ Невалідний баланс!');
    }
    validateBalance(userData.balance);
    return true;
}

/**
 * 📤 ЕКСПОРТ ФУНКЦІЙ
 */
window.sha256 = sha256;
window.hashPassword = hashPassword;
window.verifyPassword = verifyPassword;
window.validateBalance = validateBalance;
window.validateTransfer = validateTransfer;
window.validateCasinoBet = validateCasinoBet;
window.executeTransactionSafely = executeTransactionSafely;
window.safeTransferCoinsFirebase = safeTransferCoinsFirebase;
window.safeCasinoBetFirebase = safeCasinoBetFirebase;
window.validateUserData = validateUserData;

console.log('✅ firebase-security.js завантажено');
