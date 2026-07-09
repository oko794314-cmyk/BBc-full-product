/**
 * 🔥 FIREBASE SYNC V2 - ОПТИМІЗОВАНА API
 * 
 * Більш простий та надійний варіант синхронізації з Firebase
 * для проекту bb-coin-aae0a
 * 
 * Функції:
 * - Збереження/завантаження користувачів
 * - Real-time слухачі для запитів на дружбу
 * - Передача монет з перевіркою балансу
 * - Оновлення балансу при майнингу
 * - Обробка помилок та fallback
 */

let firebaseSyncState = {
    isInitialized: false,
    db: null,
    listeners: {}
};

/**
 * 🚀 ІНІЦІАЛІЗАЦІЯ FIREBASE V2
 */
function initFirebaseSyncV2() {
    if (firebaseSyncState.isInitialized) {
        return firebaseSyncState.db;
    }

    if (!window.firebase) {
        console.error('❌ Firebase SDK не завантажено!');
        return null;
    }

    try {
        const db = firebase.database();
        firebaseSyncState.db = db;
        firebaseSyncState.isInitialized = true;
        
        console.log('🔥 Firebase Realtime Database V2 ініціалізовано');
        console.log('📍 Database: https://bb-coin-aae0a-default-rtdb.firebaseio.com');
        
        return db;
    } catch (error) {
        console.error('❌ Помилка ініціалізації Firebase:', error);
        return null;
    }
}

/**
 * 💾 ЗБЕРЕЖЕННЯ КОРИСТУВАЧА
 */
async function saveUserToFirebaseV2(username, userData) {
    try {
        if (!firebaseSyncState.db) {
            throw new Error('Firebase не ініціалізований');
        }

        const sanitized = {
            password: userData.password,
            balance: userData.balance || 0,
            avatar: userData.avatar || '',
            friends: userData.friends || [],
            friendRequests: userData.friendRequests || [],
            mining: userData.mining || false,
            miningStartTime: userData.miningStartTime || 0,
            updatedAt: firebase.database.ServerValue.TIMESTAMP
        };

        await firebaseSyncState.db.ref(`users/${username}`).set(sanitized);
        
        console.log(`✅ Користувач ${username} збережено в Firebase`);
        return true;
    } catch (error) {
        console.error(`❌ Помилка збереження ${username}:`, error);
        return false;
    }
}

/**
 * 📥 ЗАВАНТАЖЕННЯ КОРИСТУВАЧА
 */
async function loadUserFromFirebaseV2(username) {
    try {
        if (!firebaseSyncState.db) {
            throw new Error('Firebase не ініціалізований');
        }

        const snapshot = await firebaseSyncState.db.ref(`users/${username}`).once('value');
        const userData = snapshot.val();

        if (userData) {
            console.log(`✅ Дані ${username} завантажені з Firebase`);
            return userData;
        }

        return null;
    } catch (error) {
        console.error(`❌ Помилка завантаження ${username}:`, error);
        return null;
    }
}

/**
 * 👥 ЗАВАНТАЖИТИ ВСІ КОРИСТУВАЧІВ
 */
async function loadAllUsersFromFirebaseV2() {
    try {
        if (!firebaseSyncState.db) {
            throw new Error('Firebase не ініціалізований');
        }

        const snapshot = await firebaseSyncState.db.ref('users').once('value');
        const users = snapshot.val() || {};

        console.log(`✅ Завантажено ${Object.keys(users).length} користувачів`);
        return users;
    } catch (error) {
        console.error('❌ Помилка завантаження користувачів:', error);
        return {};
    }
}

/**
 * 📬 ВІДПРАВИТИ ЗАПИТ НА ДРУЖБУ
 */
async function sendFriendRequestFirebaseV2(fromUser, toUser) {
    try {
        if (!firebaseSyncState.db) {
            throw new Error('Firebase не ініціалізований');
        }

        // Перевірити, чи користувач існує
        const toUserData = await loadUserFromFirebaseV2(toUser);
        if (!toUserData) {
            throw new Error('Користувач не знайдений');
        }

        // Отримати поточні запити
        const snapshot = await firebaseSyncState.db.ref(`users/${toUser}/friendRequests`).once('value');
        const requests = snapshot.val() || [];

        // Перевірити, чи запит вже існує
        if (requests.includes(fromUser)) {
            throw new Error('Запит вже надіслано');
        }

        // Додати новий запит
        requests.push(fromUser);
        await firebaseSyncState.db.ref(`users/${toUser}/friendRequests`).set(requests);

        console.log(`✅ Запит на дружбу від ${fromUser} до ${toUser}`);
        return true;
    } catch (error) {
        console.error('❌ Помилка надіслання запиту:', error);
        return false;
    }
}

/**
 * 💳 ПЕРЕДАЧА МОНЕТ
 */
function resolveTransferFeeV2(amount, feeOverride) {
    const normalizedAmount = Number((Number(amount) || 0).toFixed(4));
    const defaultFee = typeof calculateBbTransactionFee === 'function'
        ? calculateBbTransactionFee(normalizedAmount)
        : 0;
    return {
        amount: normalizedAmount,
        fee: Number((Number.isFinite(Number(feeOverride)) ? Number(feeOverride) : defaultFee).toFixed(4))
    };
}

async function transferCoinsFirebaseV2(fromUser, toUser, amount, feeOverride) {
    try {
        if (!firebaseSyncState.db) {
            throw new Error('Firebase не ініціалізований');
        }

        const { amount: normalizedAmount, fee } = resolveTransferFeeV2(amount, feeOverride);
        const totalAmount = Number((normalizedAmount + fee).toFixed(4));

        // Перевірки
        if (normalizedAmount <= 0) {
            throw new Error('Сума повинна бути > 0');
        }

        if (fromUser === toUser) {
            throw new Error('Не можна переказувати BB самому собі');
        }

        // Завантажити дані обох користувачів
        const fromUserData = await loadUserFromFirebaseV2(fromUser);
        const toUserData = await loadUserFromFirebaseV2(toUser);

        if (!fromUserData || !toUserData) {
            throw new Error('Користувач не знайдений');
        }

        if ((Number(fromUserData.balance) || 0) < totalAmount) {
            throw new Error('Недостатньо коштів');
        }

        const newFromBalance = Number(((Number(fromUserData.balance) || 0) - totalAmount).toFixed(4));
        const newToBalance = Number(((Number(toUserData.balance) || 0) + normalizedAmount).toFixed(4));

        await firebaseSyncState.db.ref().update({
            [`users/${fromUser}/balance`]: newFromBalance,
            [`users/${fromUser}/balanceUpdatedAt`]: firebase.database.ServerValue.TIMESTAMP,
            [`users/${toUser}/balance`]: newToBalance,
            [`users/${toUser}/balanceUpdatedAt`]: firebase.database.ServerValue.TIMESTAMP
        });

        // Записати транзакцію
        await firebaseSyncState.db.ref('transactions').push({
            from: fromUser,
            to: toUser,
            amount: normalizedAmount,
            fee,
            totalAmount,
            timestamp: firebase.database.ServerValue.TIMESTAMP
        });

        console.log(`✅ Передано ${normalizedAmount} монет від ${fromUser} до ${toUser} (комісія ${fee})`);
        return {
            success: true,
            amount: normalizedAmount,
            fee,
            totalAmount,
            senderBalance: newFromBalance,
            recipientBalance: newToBalance
        };
    } catch (error) {
        console.error('❌ Помилка передачі:', error);
        return { success: false, amount: 0, fee: 0, totalAmount: 0, senderBalance: null, recipientBalance: null };
    }
}

/**
 * ⛏️ ОНОВИТИ БАЛАНС ПРИ МАЙНИНГУ
 */
async function updateMiningBalanceFirebaseV2(username, newBalance) {
    try {
        if (!firebaseSyncState.db) {
            throw new Error('Firebase не ініціалізований');
        }

        await firebaseSyncState.db.ref(`users/${username}/balance`).set(newBalance);
        await firebaseSyncState.db.ref(`users/${username}/miningUpdatedAt`).set(firebase.database.ServerValue.TIMESTAMP);

        return true;
    } catch (error) {
        console.error('❌ Помилка оновлення балансу:', error);
        return false;
    }
}

/**
 * 🔔 НАЛАШТУВАННЯ СЛУХАЧА ДЛЯ ЗАПИТІВ НА ДРУЖБУ
 */
function setupFriendRequestListenerV2(currentUser, callback) {
    try {
        if (!firebaseSyncState.db) {
            throw new Error('Firebase не ініціалізований');
        }

        const ref = firebaseSyncState.db.ref(`users/${currentUser}/friendRequests`);

        // Видалити старий слухач
        if (firebaseSyncState.listeners[`fr_${currentUser}`]) {
            ref.off('value', firebaseSyncState.listeners[`fr_${currentUser}`]);
        }

        // Налаштувати новий слухач
        const listener = ref.on('value', (snapshot) => {
            const requests = snapshot.val() || [];
            if (callback) callback(requests);
            console.log(`📬 Оновлено запити для ${currentUser}: ${requests.length}`);
        });

        firebaseSyncState.listeners[`fr_${currentUser}`] = listener;
        console.log(`✅ Слухач запитів налаштований для ${currentUser}`);

    } catch (error) {
        console.error('❌ Помилка налаштування слухача:', error);
    }
}

/**
 * 🎯 НАЛАШТУВАННЯ ВСІХ СЛУХАЧІВ ПРИ ВХОДІ
 */
function setupAllListenersOnLoginV2(currentUser) {
    try {
        console.log(`🔔 Налаштування слухачів для ${currentUser}...`);

        // Налаштувати слухач запитів на дружбу
        setupFriendRequestListenerV2(currentUser, (requests) => {
            if (gameState) {
                gameState.friendRequests = requests;
                if (typeof updateFriendRequestsList === 'function') {
                    updateFriendRequestsList();
                }
            }
        });

        console.log(`✅ Слухачі налаштовані`);
    } catch (error) {
        console.error('❌ Помилка налаштування слухачів:', error);
    }
}

/**
 * 🧹 ВИДАЛИТИ ВСІ СЛУХАЧІ
 */
function removeAllListenersV2() {
    try {
        if (!firebaseSyncState.db) return;

        const ref = firebaseSyncState.db.ref();
        ref.off();

        firebaseSyncState.listeners = {};
        console.log('🧹 Усі слухачі видалені');
    } catch (error) {
        console.error('❌ Помилка видалення слухачів:', error);
    }
}

/**
 * 📊 ОТРИМАТИ СТАТУС
 */
function getFirebaseSyncStatus() {
    return {
        initialized: firebaseSyncState.isInitialized,
        activeListeners: Object.keys(firebaseSyncState.listeners).length,
        database: 'bb-coin-aae0a-default-rtdb'
    };
}

// Експортувати функції в глобальний scope
window.initFirebaseSyncV2 = initFirebaseSyncV2;
window.saveUserToFirebaseV2 = saveUserToFirebaseV2;
window.loadUserFromFirebaseV2 = loadUserFromFirebaseV2;
window.loadAllUsersFromFirebaseV2 = loadAllUsersFromFirebaseV2;
window.sendFriendRequestFirebaseV2 = sendFriendRequestFirebaseV2;
window.transferCoinsFirebaseV2 = transferCoinsFirebaseV2;
window.updateMiningBalanceFirebaseV2 = updateMiningBalanceFirebaseV2;
window.setupFriendRequestListenerV2 = setupFriendRequestListenerV2;
window.setupAllListenersOnLoginV2 = setupAllListenersOnLoginV2;
window.removeAllListenersV2 = removeAllListenersV2;
window.getFirebaseSyncStatus = getFirebaseSyncStatus;

console.log('✅ firebase-sync-v2.js завантажено');
