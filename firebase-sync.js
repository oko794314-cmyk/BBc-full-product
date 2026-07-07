/**
 * 🔥 FIREBASE REALTIME DATABASE - РЕАЛЬНА СИНХРОНІЗАЦІЯ
 * 
 * Використовує Firebase Realtime Database (bb-coin-8ec70) для:
 * - Чати - синхро в реальному часі
 * - Запити на дружбу - миттєвий прихід
 * - Запрошення на гру - блискавичне сповіщення
 * - Передача монет - інстантна
 * 
 * Конфіг завантажується з firebase-config.js (ініціалізується раніше).
 */

let firebaseState = {
    isInitialized: false,
    userListeners: {},
    chatListeners: {},
    friendRequestListeners: {},
    gameInvitationListeners: {},
    balanceListeners: {},
    onlineListeners: {},
    typingListeners: {},
    rpsMatchListeners: {},
    rpsMatchIdListeners: {},
    rpsOutgoingListeners: {}
};

/**
 * 🚀 ІНІЦІАЛІЗАЦІЯ FIREBASE
 * Firebase app ініціалізується в firebase-config.js (завантажується раніше).
 */
function initFirebaseSync() {
    if (firebaseState.isInitialized) return;
    
    if (!window.firebase) {
        console.error('❌ Firebase SDK не завантажено! Додайте скрипти в <head>');
        return;
    }
    
    if (!firebase.apps.length) {
        console.error('❌ Firebase не ініціалізований! Переконайтесь, що firebase-config.js завантажено перед firebase-sync.js');
        return;
    }
    
    firebaseState.isInitialized = true;
    const db = firebase.database();
    
    console.log('🔥 Firebase Realtime Database активована (bb-coin-8ec70)');
    console.log('✅ Миттєва синхронізація готова');
    
    return db;
}

/**
 * 💾 ЗБЕРЕГТИ ДАНІ КОРИСТУВАЧА В FIREBASE
 */
async function saveUserToFirebase(username, userData) {
    try {
        const db = firebase.database();
        await db.ref(`users/${username}`).set(userData);
        console.log(`✅ Користувач ${username} збережено в Firebase`);
        updateSyncIndicator(true);
        return true;
    } catch (error) {
        console.error('❌ Помилка збереження в Firebase:', error);
        updateSyncIndicator(false);
        return false;
    }
}

/**
 * 📥 ЗАВАНТАЖИТИ ДАНІ КОРИСТУВАЧА З FIREBASE
 */
async function loadUserFromFirebase(username) {
    try {
        const db = firebase.database();
        const snapshot = await db.ref(`users/${username}`).once('value');
        const userData = snapshot.val();
        console.log(`✅ Дані ${username} завантажені з Firebase`);
        return userData;
    } catch (error) {
        console.error('❌ Помилка завантаження з Firebase:', error);
        return null;
    }
}

/**
 * 👥 ЗАВАНТАЖИТИ ВСІ КОРИСТУВАЧІВ
 */
async function loadAllUsersFromFirebase() {
    try {
        const db = firebase.database();
        const snapshot = await db.ref('users').once('value');
        const users = snapshot.val() || {};
        console.log(`✅ Завантажено ${Object.keys(users).length} користувачів`);
        return users;
    } catch (error) {
        console.error('❌ Помилка завантаження користувачів:', error);
        return {};
    }
}

/**
 * 🔔 СЛУХАЧ ДЛЯ ЗАПИТІВ НА ДРУЖБУ - МИТТЄВО
 */
function setupFriendRequestListener(currentUser) {
    const db = firebase.database();
    const ref = db.ref(`users/${currentUser}/friendRequests`);
    
    // Видалити старий слухач
    if (firebaseState.friendRequestListeners[currentUser]) {
        ref.off('value', firebaseState.friendRequestListeners[currentUser]);
    }
    
    const listener = ref.on('value', (snapshot) => {
        const requests = snapshot.val() || [];
        
        // Перевірити нові запити
        if (gameState.friendRequests.length < requests.length) {
            const newRequests = requests.filter(req => !gameState.friendRequests.includes(req));
            
            newRequests.forEach(requester => {
                console.log(`📬 МИТТЄВИЙ ЗАПИТ ВІД: ${requester}`);
                showGameNotification(`📬 Запит на дружбу від ${requester}!`);
            });
        }
        
        gameState.friendRequests = requests;
        updateFriendRequestsList();
        
    }, (error) => {
        console.warn('⚠️ Помилка слухача запитів:', error);
    });
    
    firebaseState.friendRequestListeners[currentUser] = listener;
}

/**
 * 💬 СЛУХАЧ ДЛЯ ПРИВАТНИХ ЧАТІВ - МИТТЄВО
 */
function setupChatListener(currentUser, friendUsername) {
    const db = firebase.database();
    const chatKey = [currentUser, friendUsername].sort().join('_');
    const ref = db.ref(`chats/${chatKey}/messages`);
    
    // Видалити старий слухач
    if (firebaseState.chatListeners[chatKey]) {
        db.ref(`chats/${chatKey}/messages`).off('value', firebaseState.chatListeners[chatKey]);
    }
    
    const listener = ref.on('value', (snapshot) => {
        const messages = snapshot.val() || [];
        const realtimeHandler = window.stickChatRealtime && typeof window.stickChatRealtime.handleSnapshot === 'function'
            ? window.stickChatRealtime.handleSnapshot
            : (typeof window.handleRealtimeChatSnapshot === 'function' ? window.handleRealtimeChatSnapshot : null);

        if (realtimeHandler) {
            // Якщо UI зареєстрував власний обробник, передаємо дані й не дублюємо локальний рендер тут.
            realtimeHandler(friendUsername, messages);
            return;
        }
        
        if (gameState.currentChatFriend === friendUsername) {
            gameState.privateChatMessages[friendUsername] = messages;
            displayPrivateChat(); // Оновити екран миттєво
            console.log(`💬 Чат з ${friendUsername} оновлено`);
        }
        
    }, (error) => {
        console.warn('⚠️ Помилка слухача чату:', error);
    });
    
    firebaseState.chatListeners[chatKey] = listener;
}

/**
 * 📥 ЗАВАНТАЖИТИ ПОВІДОМЛЕННЯ ЧАТУ ОДИН РАЗ
 * Використовується як fallback polling, коли realtime listener недоступний.
 */
async function loadChatMessagesFirebase(currentUser, friendUsername) {
    try {
        const db = firebase.database();
        const chatKey = [currentUser, friendUsername].sort().join('_');
        const snapshot = await db.ref(`chats/${chatKey}/messages`).once('value');
        return snapshot.val() || [];
    } catch (error) {
        console.warn('⚠️ Помилка завантаження повідомлень чату:', error);
        return [];
    }
}

/**
 * 🎮 СЛУХАЧ ДЛЯ ЗАПРОШЕНЬ НА ГРУ - МИТТЄВО
 */
function setupGameInvitationListener(currentUser) {
    const db = firebase.database();
    const ref = db.ref(`users/${currentUser}/gameInvitations`);
    
    // Видалити старий слухач
    if (firebaseState.gameInvitationListeners[currentUser]) {
        ref.off('value', firebaseState.gameInvitationListeners[currentUser]);
    }
    
    const listener = ref.on('value', (snapshot) => {
        const invitations = snapshot.val() || {};
        
        // Перевірити нові запрошення
        Object.keys(invitations).forEach(inviteId => {
            const invite = invitations[inviteId];
            
            if (invite && invite.status === 'pending' && !invite.notified) {
                console.log(`🎮 МИТТЄВЕ ЗАПРОШЕННЯ НА ГРУ ВІД: ${invite.from}`);
                pendingGameRequest = invite;
                showGameRequestModal(invite);
                
                // Позначити як сповіщено
                db.ref(`users/${currentUser}/gameInvitations/${inviteId}/notified`).set(true);
            }
        });
        
        gameState.gameInvitations = invitations;
        
    }, (error) => {
        console.warn('⚠️ Помилка слухача запрошень:', error);
    });
    
    firebaseState.gameInvitationListeners[currentUser] = listener;
}

/**
 * 📤 ВІДПРАВИТИ ПРИВАТНЕ ПОВІДОМЛЕННЯ
 */
async function sendPrivateMessageFirebase(fromUser, toUser, message) {
    try {
        const db = firebase.database();
        const chatKey = [fromUser, toUser].sort().join('_');
        
        const newMessage = {
            from: fromUser,
            to: toUser,
            text: message,
            timestamp: firebase.database.ServerValue.TIMESTAMP
        };
        
        // Додати повідомлення в чат
        await db.ref(`chats/${chatKey}/messages`).push(newMessage);
        
        // Позначити чат як активний
        await db.ref(`chats/${chatKey}/lastMessage`).set(newMessage);
        await db.ref(`chats/${chatKey}/lastMessageTime`).set(firebase.database.ServerValue.TIMESTAMP);
        
        console.log(`💬 Повідомлення надіслано ${toUser}`);
        updateSyncIndicator(true);
        return true;
        
    } catch (error) {
        console.error('❌ Помилка надіслання повідомлення:', error);
        updateSyncIndicator(false);
        return false;
    }
}

/**
 * 👥 ВІДПРАВИТИ ЗАПИТ НА ДРУЖБУ
 */
async function sendFriendRequestFirebase(fromUser, toUser) {
    try {
        const db = firebase.database();
        
        // Додати запит до списку запитів отримувача
        const snapshot = await db.ref(`users/${toUser}/friendRequests`).once('value');
        const requests = snapshot.val() || [];
        
        if (!requests.includes(fromUser)) {
            requests.push(fromUser);
            await db.ref(`users/${toUser}/friendRequests`).set(requests);
            
            console.log(`📬 Запит на дружбу від ${fromUser} до ${toUser} надіслано`);
            updateSyncIndicator(true);
            return true;
        }
        
        return false;
        
    } catch (error) {
        console.error('❌ Помилка надіслання запиту на дружбу:', error);
        updateSyncIndicator(false);
        return false;
    }
}

/**
 * ✅ ПРИЙНЯТИ ЗАПИТ НА ДРУЖБУ
 */
async function acceptFriendRequestFirebase(currentUser, requester) {
    try {
        const db = firebase.database();
        const currentRef = db.ref(`users/${currentUser}`);
        const requesterRef = db.ref(`users/${requester}`);

        const [currentSnapshot, requesterSnapshot] = await Promise.all([
            currentRef.once('value'),
            requesterRef.once('value')
        ]);

        const currentData = currentSnapshot.val();
        const requesterData = requesterSnapshot.val();

        if (!currentData || !requesterData) {
            throw new Error('Користувача не знайдено');
        }

        const currentRequests = (currentData.friendRequests || []).filter(name => name !== requester);
        const currentFriends = [...new Set([...(currentData.friends || []), requester])];
        const requesterFriends = [...new Set([...(requesterData.friends || []), currentUser])];

        await Promise.all([
            currentRef.child('friendRequests').set(currentRequests),
            currentRef.child('friends').set(currentFriends),
            requesterRef.child('friends').set(requesterFriends)
        ]);

        console.log(`✅ ${currentUser} прийняв запит від ${requester}`);
        updateSyncIndicator(true);
        return true;
    } catch (error) {
        console.error('❌ Помилка прийняття запиту:', error);
        updateSyncIndicator(false);
        return false;
    }
}

/**
 * ❌ ВІДХИЛИТИ ЗАПИТ НА ДРУЖБУ
 */
async function rejectFriendRequestFirebase(currentUser, requester) {
    try {
        const db = firebase.database();
        const currentRef = db.ref(`users/${currentUser}`);
        const snapshot = await currentRef.once('value');
        const currentData = snapshot.val();

        if (!currentData) {
            throw new Error('Користувача не знайдено');
        }

        const currentRequests = (currentData.friendRequests || []).filter(name => name !== requester);
        await currentRef.child('friendRequests').set(currentRequests);

        console.log(`❌ ${currentUser} відхилив запит від ${requester}`);
        updateSyncIndicator(true);
        return true;
    } catch (error) {
        console.error('❌ Помилка відхилення запиту:', error);
        updateSyncIndicator(false);
        return false;
    }
}

/**
 * ⚙️ ОНОВИТИ ПРОФІЛЬ КОРИСТУВАЧА
 */
async function updateUserProfileFirebase(username, updates) {
    try {
        const db = firebase.database();
        const allowedFields = ['avatar', 'displayName'];
        const safeUpdates = Object.fromEntries(
            Object.entries(updates).filter(([key]) => allowedFields.includes(key))
        );

        if (Object.keys(safeUpdates).length === 0) {
            throw new Error('Немає дозволених полів для оновлення');
        }

        await db.ref(`users/${username}`).update(safeUpdates);
        console.log(`⚙️ Профіль ${username} оновлено`);
        updateSyncIndicator(true);
        return true;
    } catch (error) {
        console.error('❌ Помилка оновлення профілю:', error);
        updateSyncIndicator(false);
        return false;
    }
}

/**
 * 🔒 ОНОВИТИ ПАРОЛЬ КОРИСТУВАЧА
 */
async function updateUserPasswordFirebase(username, password) {
    try {
        const db = firebase.database();
        await db.ref(`users/${username}/password`).set(password);
        console.log(`🔒 Пароль ${username} оновлено`);
        updateSyncIndicator(true);
        return true;
    } catch (error) {
        console.error('❌ Помилка оновлення пароля:', error);
        updateSyncIndicator(false);
        return false;
    }
}

/**
 * 🎮 ВІДПРАВИТИ ЗАПРОШЕННЯ НА ГРУ
 */
async function sendGameInvitationFirebase(fromUser, toUser, bet) {
    try {
        const db = firebase.database();
        const inviteId = Date.now().toString();
        
        const invitation = {
            id: inviteId,
            from: fromUser,
            to: toUser,
            bet: bet,
            status: 'pending',
            notified: false,
            createdAt: firebase.database.ServerValue.TIMESTAMP
        };
        
        await db.ref(`users/${toUser}/gameInvitations/${inviteId}`).set(invitation);
        
        console.log(`🎮 Запрошення на гру від ${fromUser} до ${toUser}`);
        updateSyncIndicator(true);
        return true;
        
    } catch (error) {
        console.error('❌ Помилка надіслання запрошення на гру:', error);
        updateSyncIndicator(false);
        return false;
    }
}

/**
 * 💳 ПЕРЕДАЧА МОНЕТ
 */
async function transferCoinsFirebase(fromUser, toUser, amount) {
    try {
        const db = firebase.database();
        
        // Завантажити дані обох користувачів
        const fromSnapshot = await db.ref(`users/${fromUser}`).once('value');
        const toSnapshot = await db.ref(`users/${toUser}`).once('value');
        
        const fromData = fromSnapshot.val();
        const toData = toSnapshot.val();
        
        if (!fromData || !toData) {
            throw new Error('Користувач не знайдений');
        }
        
        // Перевірити баланс
        if (fromData.balance < amount) {
            throw new Error('Недостатньо коштів');
        }
        
        // Виконати передачу
        fromData.balance -= amount;
        toData.balance += amount;
        
        // Зберегти зміни
        await db.ref(`users/${fromUser}/balance`).set(fromData.balance);
        await db.ref(`users/${toUser}/balance`).set(toData.balance);
        
        // Записати транзакцію в історію (non-critical — помилка не скасовує передачу)
        try {
            await db.ref(`transactions`).push({
                from: fromUser,
                to: toUser,
                amount: amount,
                timestamp: firebase.database.ServerValue.TIMESTAMP
            });
        } catch (txError) {
            console.warn('⚠️ Помилка запису транзакції (передача все одно виконана):', txError);
        }
        
        console.log(`💳 Передача ${amount} від ${fromUser} до ${toUser}`);
        updateSyncIndicator(true);
        return true;
        
    } catch (error) {
        console.error('❌ Помилка передачі:', error);
        updateSyncIndicator(false);
        return false;
    }
}

/**
 * ⛏️ ОНОВИТИ БАЛАНС ПІД ЧАС МАЙНИНГУ
 */
async function updateMiningBalanceFirebase(username, newBalance) {
    try {
        const db = firebase.database();
        await db.ref(`users/${username}/balance`).set(newBalance);
        await db.ref(`users/${username}/miningUpdatedAt`).set(firebase.database.ServerValue.TIMESTAMP);
        updateSyncIndicator(true);
        return true;
    } catch (error) {
        console.error('❌ Помилка оновлення балансу:', error);
        updateSyncIndicator(false);
        return false;
    }
}

/**
 * 💰 СЛУХАЧ БАЛАНСУ - МИТТЄВЕ ОНОВЛЕННЯ UI
 */
function setupBalanceListener(currentUser) {
    const db = firebase.database();
    const ref = db.ref(`users/${currentUser}/balance`);

    if (firebaseState.balanceListeners[currentUser]) {
        ref.off('value', firebaseState.balanceListeners[currentUser]);
    }

    const listener = ref.on('value', (snapshot) => {
        const newBalance = snapshot.val();
        if (newBalance === null || typeof newBalance !== 'number') return;
        if (newBalance !== gameState.balance) {
            gameState.balance = newBalance;
            if (typeof updateHeader === 'function') updateHeader();
        }
    }, (error) => {
        console.warn('⚠️ Помилка слухача балансу:', error);
    });

    firebaseState.balanceListeners[currentUser] = listener;
}

/**
 * 🟢 ВСТАНОВИТИ ОНЛАЙН-СТАТУС
 */
function setupOnlinePresence(currentUser) {
    const db = firebase.database();
    const onlineRef = db.ref(`users/${currentUser}/online`);
    onlineRef.set(true);
    onlineRef.onDisconnect().set(false);
}

/**
 * 🔴 ВСТАНОВИТИ ОФЛАЙН-СТАТУС
 */
function setOffline(currentUser) {
    try {
        const db = firebase.database();
        db.ref(`users/${currentUser}/online`).set(false);
    } catch (error) {
        console.warn('⚠️ Помилка встановлення офлайн:', error);
    }
}

/**
 * 👀 СЛУХАЧ ОНЛАЙН-СТАТУСУ ДРУГА
 */
function setupFriendOnlineListener(friendUsername, callback) {
    const db = firebase.database();
    const ref = db.ref(`users/${friendUsername}/online`);

    if (firebaseState.onlineListeners[friendUsername]) {
        ref.off('value', firebaseState.onlineListeners[friendUsername]);
    }

    const listener = ref.on('value', (snapshot) => {
        const isOnline = snapshot.val() === true;
        if (callback) callback(friendUsername, isOnline);
    }, (error) => {
        console.warn(`⚠️ Помилка слухача онлайн (${friendUsername}):`, error);
    });

    firebaseState.onlineListeners[friendUsername] = listener;
}

/**
 * ✏️ НАДІСЛАТИ ІНДИКАТОР НАБОРУ
 */
function sendTypingIndicator(currentUser, friendUsername) {
    try {
        const db = firebase.database();
        const chatKey = [currentUser, friendUsername].sort().join('_');
        db.ref(`chats/${chatKey}/typing/${currentUser}`).set(true);
    } catch (error) {
        console.warn('⚠️ Помилка індикатора набору:', error);
    }
}

/**
 * ✏️ ЗНЯТИ ІНДИКАТОР НАБОРУ
 */
function clearTypingIndicator(currentUser, friendUsername) {
    try {
        const db = firebase.database();
        const chatKey = [currentUser, friendUsername].sort().join('_');
        db.ref(`chats/${chatKey}/typing/${currentUser}`).set(false);
    } catch (error) {
        console.warn('⚠️ Помилка зняття індикатора набору:', error);
    }
}

/**
 * 👁️ СЛУХАЧ ІНДИКАТОРА НАБОРУ
 */
function setupTypingListener(currentUser, friendUsername, callback) {
    const db = firebase.database();
    const chatKey = [currentUser, friendUsername].sort().join('_');
    const ref = db.ref(`chats/${chatKey}/typing/${friendUsername}`);

    if (firebaseState.typingListeners[chatKey]) {
        db.ref(`chats/${chatKey}/typing/${friendUsername}`).off('value', firebaseState.typingListeners[chatKey]);
    }

    const listener = ref.on('value', (snapshot) => {
        const isTyping = snapshot.val() === true;
        if (callback) callback(isTyping);
    }, (error) => {
        console.warn(`⚠️ Помилка слухача набору (${friendUsername}):`, error);
    });

    firebaseState.typingListeners[chatKey] = listener;
}

/**
 * 🔇 ЗНЯТИ СЛУХАЧ ІНДИКАТОРА НАБОРУ
 */
function removeTypingListener(currentUser, friendUsername) {
    const db = firebase.database();
    const chatKey = [currentUser, friendUsername].sort().join('_');
    if (firebaseState.typingListeners[chatKey]) {
        db.ref(`chats/${chatKey}/typing/${friendUsername}`).off('value', firebaseState.typingListeners[chatKey]);
        delete firebaseState.typingListeners[chatKey];
    }
}

/**
 * 🎯 НАЛАШТУВАННЯ СЛУХАЧІВ ПРИ ВХОДІ
 */
function setupAllListenersOnLogin(currentUser) {
    console.log(`🔔 Налаштування слухачів для ${currentUser}...`);
    
    // Баланс — миттєве оновлення після передачі/майнингу
    setupBalanceListener(currentUser);
    
    // Онлайн-присутність
    setupOnlinePresence(currentUser);
    
    // Запити на дружбу
    setupFriendRequestListener(currentUser);
    
    // Запрошення на гру
    setupGameInvitationListener(currentUser);
    
    // Чати - налаштуються при вході у чат
    gameState.friends.forEach(friend => {
        setupChatListener(currentUser, friend);
    });

    // Онлайн-статус друзів
    gameState.friends.forEach(friend => {
        setupFriendOnlineListener(friend, (friendName, isOnline) => {
            if (!gameState) return;
            gameState.friendsOnline = gameState.friendsOnline || {};
            gameState.friendsOnline[friendName] = isOnline;
            if (typeof updateFriendsList === 'function') updateFriendsList();
            if (gameState.currentChatFriend === friendName && typeof updateChatOnlineDot === 'function') {
                updateChatOnlineDot(isOnline);
            }
        });
    });
    
    console.log(`✅ Всі слухачі налаштовані для ${currentUser}`);
}

/**
 * ✊ ВІДПРАВИТИ ЗАПРОШЕННЯ НА КНП ONLINE
 */
async function sendRpsInvitationFirebase(fromUser, toUser, bet) {
    try {
        const db = firebase.database();
        const inviteId = Date.now().toString();

        const invitation = {
            id: inviteId,
            from: fromUser,
            to: toUser,
            bet: bet,
            gameType: 'rps',
            status: 'pending',
            notified: false,
            createdAt: firebase.database.ServerValue.TIMESTAMP
        };

        const updates = {};
        updates[`users/${toUser}/gameInvitations/${inviteId}`] = invitation;
        updates[`users/${fromUser}/outgoingRpsInvite`] = {
            inviteId,
            to: toUser,
            bet,
            status: 'pending',
            createdAt: firebase.database.ServerValue.TIMESTAMP
        };

        await db.ref().update(updates);

        console.log(`✊ RPS запрошення від ${fromUser} до ${toUser} (ставка: ${bet})`);
        updateSyncIndicator(true);
        return { success: true, inviteId };

    } catch (error) {
        console.error('❌ Помилка надіслання RPS запрошення:', error);
        updateSyncIndicator(false);
        return { success: false };
    }
}

/**
 * ✅ ПРИЙНЯТИ RPS ЗАПРОШЕННЯ (Player B)
 * Деблокує ставки і створює матч.
 */
async function acceptRpsInvitationFirebase(currentUser, invite) {
    try {
        const db = firebase.database();

        if (!invite || !invite.from || !invite.id) throw new Error('Невалідне запрошення');
        if (invite.from === currentUser) throw new Error('Не можна грати із собою');

        const matchId = `rps_${invite.id}`;

        // Load both users' data
        const [p1Snap, p2Snap] = await Promise.all([
            db.ref(`users/${invite.from}`).once('value'),
            db.ref(`users/${currentUser}`).once('value')
        ]);

        const p1Data = p1Snap.val();
        const p2Data = p2Snap.val();

        if (!p1Data || !p2Data) throw new Error('Користувача не знайдено');

        const bet = Number(invite.bet);
        if (!bet || bet <= 0) throw new Error('Невалідна ставка');

        if ((p1Data.balance || 0) < bet) throw new Error(`${invite.from} не має достатньо коштів`);
        if ((p2Data.balance || 0) < bet) throw new Error('У вас недостатньо коштів');

        // Check invite is still pending (not expired or already used)
        const inviteSnap = await db.ref(`users/${currentUser}/gameInvitations/${invite.id}`).once('value');
        const currentInvite = inviteSnap.val();
        if (!currentInvite || currentInvite.status !== 'pending') {
            throw new Error('Запрошення вже недійсне або прийняте');
        }

        // Deduct bets and create match atomically
        const updates = {};
        updates[`rpsMatches/${matchId}`] = {
            id: matchId,
            player1: invite.from,
            player2: currentUser,
            bet,
            status: 'active',
            choice1: null,
            choice2: null,
            winner: null,
            createdAt: firebase.database.ServerValue.TIMESTAMP,
            completedAt: null
        };
        updates[`users/${invite.from}/balance`]     = (p1Data.balance || 0) - bet;
        updates[`users/${currentUser}/balance`]     = (p2Data.balance || 0) - bet;
        updates[`users/${invite.from}/activeRpsMatchId`]    = matchId;
        updates[`users/${currentUser}/activeRpsMatchId`]    = matchId;
        updates[`users/${invite.from}/outgoingRpsInvite/status`]  = 'accepted';
        updates[`users/${invite.from}/outgoingRpsInvite/matchId`] = matchId;
        updates[`users/${currentUser}/gameInvitations/${invite.id}/status`] = 'accepted';

        await db.ref().update(updates);

        console.log(`✅ RPS матч створено: ${matchId}`);
        updateSyncIndicator(true);
        return { success: true, matchId };

    } catch (error) {
        console.error('❌ Помилка прийняття RPS запрошення:', error);
        updateSyncIndicator(false);
        return { success: false, error: error.message };
    }
}

/**
 * ❌ ВІДХИЛИТИ RPS ЗАПРОШЕННЯ
 */
async function rejectRpsInvitationFirebase(currentUser, invite) {
    try {
        if (!invite || !invite.id) return false;
        const db = firebase.database();
        const updates = {};
        updates[`users/${currentUser}/gameInvitations/${invite.id}/status`] = 'rejected';
        if (invite.from) {
            updates[`users/${invite.from}/outgoingRpsInvite/status`] = 'rejected';
        }
        await db.ref().update(updates);
        console.log(`❌ RPS запрошення відхилено: ${invite.id}`);
        updateSyncIndicator(true);
        return true;
    } catch (error) {
        console.error('❌ Помилка відхилення RPS запрошення:', error);
        updateSyncIndicator(false);
        return false;
    }
}

/**
 * ✊ ЗРОБИТИ ВИБІР У RPS ONLINE
 */
async function submitRpsChoiceFirebase(matchId, playerNum, choice) {
    try {
        const db = firebase.database();
        const choiceField = playerNum === 1 ? 'choice1' : 'choice2';

        // Write choice
        await db.ref(`rpsMatches/${matchId}/${choiceField}`).set(choice);

        // Try to resolve if both have chosen
        const matchSnap = await db.ref(`rpsMatches/${matchId}`).once('value');
        const match = matchSnap.val();
        if (match && match.choice1 && match.choice2 && match.status === 'active') {
            await resolveRpsMatchFirebase(matchId);
        }

        updateSyncIndicator(true);
        return true;
    } catch (error) {
        console.error('❌ Помилка подачі вибору RPS:', error);
        updateSyncIndicator(false);
        return false;
    }
}

/**
 * 🏆 ВИРІШИТИ RPS МАТЧ (транзакція + виплата)
 */
async function resolveRpsMatchFirebase(matchId) {
    try {
        const db = firebase.database();
        const matchRef = db.ref(`rpsMatches/${matchId}`);

        let finalMatch = null;

        // Use transaction to safely mark as completed (prevents double-resolution)
        const txResult = await matchRef.transaction((match) => {
            if (!match || match.status !== 'active') return; // abort
            if (!match.choice1 || !match.choice2) return; // abort

            const c1 = match.choice1;
            const c2 = match.choice2;
            let winner;
            if (c1 === c2) {
                winner = 'draw';
            } else if (
                (c1 === 'rock' && c2 === 'scissors') ||
                (c1 === 'scissors' && c2 === 'paper') ||
                (c1 === 'paper' && c2 === 'rock')
            ) {
                winner = 'player1';
            } else {
                winner = 'player2';
            }

            finalMatch = { ...match, status: 'completed', winner, completedAt: Date.now() };
            return finalMatch;
        });

        if (!txResult.committed || !finalMatch) {
            // Transaction aborted — already resolved by the other client, that's OK
            return true;
        }

        // Pay out balances
        const bet = finalMatch.bet;
        const [p1Snap, p2Snap] = await Promise.all([
            db.ref(`users/${finalMatch.player1}/balance`).once('value'),
            db.ref(`users/${finalMatch.player2}/balance`).once('value')
        ]);

        const p1Bal = p1Snap.val() || 0;
        const p2Bal = p2Snap.val() || 0;

        const balUpdates = {};
        if (finalMatch.winner === 'player1') {
            balUpdates[`users/${finalMatch.player1}/balance`] = p1Bal + bet * 2;
        } else if (finalMatch.winner === 'player2') {
            balUpdates[`users/${finalMatch.player2}/balance`] = p2Bal + bet * 2;
        } else {
            // Draw — return bets to both
            balUpdates[`users/${finalMatch.player1}/balance`] = p1Bal + bet;
            balUpdates[`users/${finalMatch.player2}/balance`] = p2Bal + bet;
        }

        await db.ref().update(balUpdates);
        console.log(`🏆 RPS матч ${matchId} завершено. Переможець: ${finalMatch.winner}`);
        updateSyncIndicator(true);
        return true;

    } catch (error) {
        console.error('❌ Помилка вирішення RPS матчу:', error);
        updateSyncIndicator(false);
        return false;
    }
}

/**
 * 🎮 СЛУХАЧ RPS МАТЧУ
 */
function setupRpsMatchListener(matchId, callback) {
    const db = firebase.database();
    const ref = db.ref(`rpsMatches/${matchId}`);

    if (firebaseState.rpsMatchListeners[matchId]) {
        ref.off('value', firebaseState.rpsMatchListeners[matchId]);
    }

    const listener = ref.on('value', (snapshot) => {
        if (callback) callback(snapshot.val());
    }, (error) => {
        console.warn('⚠️ Помилка слухача RPS матчу:', error);
    });

    firebaseState.rpsMatchListeners[matchId] = listener;
}

/**
 * 📬 СЛУХАЧ ACTIVE RPS MATCH ID (для Player A — щоб дізнатися matchId після accept)
 */
function setupRpsMatchIdListener(currentUser, callback) {
    const db = firebase.database();
    const ref = db.ref(`users/${currentUser}/activeRpsMatchId`);

    if (firebaseState.rpsMatchIdListeners[currentUser]) {
        ref.off('value', firebaseState.rpsMatchIdListeners[currentUser]);
    }

    const listener = ref.on('value', (snapshot) => {
        if (callback) callback(snapshot.val());
    }, (error) => {
        console.warn('⚠️ Помилка слухача RPS matchId:', error);
    });

    firebaseState.rpsMatchIdListeners[currentUser] = listener;
}

/**
 * 📤 СЛУХАЧ ВІДПОВІДІ НА ВІДІСЛАНЕ RPS ЗАПРОШЕННЯ
 */
function setupRpsOutgoingInviteListener(currentUser, callback) {
    const db = firebase.database();
    const ref = db.ref(`users/${currentUser}/outgoingRpsInvite`);

    if (firebaseState.rpsOutgoingListeners[currentUser]) {
        ref.off('value', firebaseState.rpsOutgoingListeners[currentUser]);
    }

    const listener = ref.on('value', (snapshot) => {
        if (callback) callback(snapshot.val());
    }, (error) => {
        console.warn('⚠️ Помилка слухача outgoing RPS invite:', error);
    });

    firebaseState.rpsOutgoingListeners[currentUser] = listener;
    return listener;
}

/**
 * 🧹 ВИДАЛИТИ ВСІ СЛУХАЧІ
 */
function removeAllListeners() {
    const db = firebase.database();
    
    Object.keys(firebaseState.friendRequestListeners).forEach(user => {
        db.ref(`users/${user}/friendRequests`).off('value', firebaseState.friendRequestListeners[user]);
    });
    
    Object.keys(firebaseState.gameInvitationListeners).forEach(user => {
        db.ref(`users/${user}/gameInvitations`).off('value', firebaseState.gameInvitationListeners[user]);
    });
    
    Object.keys(firebaseState.chatListeners).forEach(chatKey => {
        db.ref(`chats/${chatKey}/messages`).off('value', firebaseState.chatListeners[chatKey]);
    });

    Object.keys(firebaseState.balanceListeners).forEach(user => {
        db.ref(`users/${user}/balance`).off('value', firebaseState.balanceListeners[user]);
    });

    Object.keys(firebaseState.onlineListeners).forEach(user => {
        db.ref(`users/${user}/online`).off('value', firebaseState.onlineListeners[user]);
    });

    Object.keys(firebaseState.typingListeners).forEach(chatKey => {
        db.ref(`chats/${chatKey}/typing`).off();
    });

    Object.keys(firebaseState.rpsMatchListeners || {}).forEach(matchId => {
        db.ref(`rpsMatches/${matchId}`).off('value', firebaseState.rpsMatchListeners[matchId]);
    });

    Object.keys(firebaseState.rpsMatchIdListeners || {}).forEach(user => {
        db.ref(`users/${user}/activeRpsMatchId`).off('value', firebaseState.rpsMatchIdListeners[user]);
    });

    Object.keys(firebaseState.rpsOutgoingListeners || {}).forEach(user => {
        db.ref(`users/${user}/outgoingRpsInvite`).off('value', firebaseState.rpsOutgoingListeners[user]);
    });
    
    firebaseState.friendRequestListeners = {};
    firebaseState.gameInvitationListeners = {};
    firebaseState.chatListeners = {};
    firebaseState.balanceListeners = {};
    firebaseState.onlineListeners = {};
    firebaseState.typingListeners = {};
    firebaseState.rpsMatchListeners = {};
    firebaseState.rpsMatchIdListeners = {};
    firebaseState.rpsOutgoingListeners = {};
    
    console.log('🧹 Всі слухачі видалені');
}

/**
 * 📊 ОТРИМАТИ СТАТУС
 */
function getFirebaseStatus() {
    return {
        initialized: firebaseState.isInitialized,
        friendRequestListeners: Object.keys(firebaseState.friendRequestListeners).length,
        gameInvitationListeners: Object.keys(firebaseState.gameInvitationListeners).length,
        chatListeners: Object.keys(firebaseState.chatListeners).length
    };
}

function firebaseNumber(value, fallback = 0) {
    return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

async function saveUserFeatureStateFirebase(username, featureKey, data) {
    try {
        const db = firebase.database();
        await db.ref(`users/${username}/${featureKey}`).set(data);
        updateSyncIndicator(true);
        return true;
    } catch (error) {
        console.error(`❌ Помилка збереження ${featureKey}:`, error);
        updateSyncIndicator(false);
        return false;
    }
}

async function loadUserFeatureStateFirebase(username, featureKey) {
    try {
        const db = firebase.database();
        const snapshot = await db.ref(`users/${username}/${featureKey}`).once('value');
        return snapshot.val();
    } catch (error) {
        console.error(`❌ Помилка завантаження ${featureKey}:`, error);
        return null;
    }
}

async function adjustUserBalanceFirebase(username, delta) {
    try {
        const db = firebase.database();
        let nextBalance = null;
        const result = await db.ref(`users/${username}/balance`).transaction((currentBalance) => {
            const normalized = firebaseNumber(currentBalance, 0);
            const candidate = normalized + firebaseNumber(delta, 0);
            if (candidate < 0) return;
            nextBalance = candidate;
            return candidate;
        });

        if (!result.committed) {
            return { success: false, balance: null };
        }

        await db.ref(`users/${username}/miningUpdatedAt`).set(firebase.database.ServerValue.TIMESTAMP);
        updateSyncIndicator(true);
        return { success: true, balance: nextBalance };
    } catch (error) {
        console.error('❌ Помилка зміни балансу:', error);
        updateSyncIndicator(false);
        return { success: false, balance: null };
    }
}

async function isAdminUserFirebase(username) {
    try {
        if (!username) return false;
        const db = firebase.database();
        const [roleSnapshot, aclSnapshot] = await Promise.all([
            db.ref(`users/${username}/role`).once('value'),
            db.ref(`config/adminUsers/${username}`).once('value')
        ]);
        return roleSnapshot.val() === 'admin' || aclSnapshot.val() === true;
    } catch (error) {
        console.error('❌ Помилка перевірки адміністратора:', error);
        return false;
    }
}

// Експортувати функції
window.initFirebaseSync = initFirebaseSync;
window.saveUserToFirebase = saveUserToFirebase;
window.loadUserFromFirebase = loadUserFromFirebase;
window.loadAllUsersFromFirebase = loadAllUsersFromFirebase;
window.setupFriendRequestListener = setupFriendRequestListener;
window.setupChatListener = setupChatListener;
window.loadChatMessagesFirebase = loadChatMessagesFirebase;
window.setupGameInvitationListener = setupGameInvitationListener;
window.sendPrivateMessageFirebase = sendPrivateMessageFirebase;
window.sendFriendRequestFirebase = sendFriendRequestFirebase;
window.acceptFriendRequestFirebase = acceptFriendRequestFirebase;
window.rejectFriendRequestFirebase = rejectFriendRequestFirebase;
window.updateUserProfileFirebase = updateUserProfileFirebase;
window.updateUserPasswordFirebase = updateUserPasswordFirebase;
window.sendGameInvitationFirebase = sendGameInvitationFirebase;
window.transferCoinsFirebase = transferCoinsFirebase;
window.updateMiningBalanceFirebase = updateMiningBalanceFirebase;
window.setupBalanceListener = setupBalanceListener;
window.setupOnlinePresence = setupOnlinePresence;
window.setOffline = setOffline;
window.setupFriendOnlineListener = setupFriendOnlineListener;
window.sendTypingIndicator = sendTypingIndicator;
window.clearTypingIndicator = clearTypingIndicator;
window.setupTypingListener = setupTypingListener;
window.removeTypingListener = removeTypingListener;
window.setupAllListenersOnLogin = setupAllListenersOnLogin;
window.removeAllListeners = removeAllListeners;
window.getFirebaseStatus = getFirebaseStatus;
window.saveUserFeatureStateFirebase = saveUserFeatureStateFirebase;
window.loadUserFeatureStateFirebase = loadUserFeatureStateFirebase;
window.adjustUserBalanceFirebase = adjustUserBalanceFirebase;
window.isAdminUserFirebase = isAdminUserFirebase;
// RPS Online
window.sendRpsInvitationFirebase = sendRpsInvitationFirebase;
window.acceptRpsInvitationFirebase = acceptRpsInvitationFirebase;
window.rejectRpsInvitationFirebase = rejectRpsInvitationFirebase;
window.submitRpsChoiceFirebase = submitRpsChoiceFirebase;
window.resolveRpsMatchFirebase = resolveRpsMatchFirebase;
window.setupRpsMatchListener = setupRpsMatchListener;
window.setupRpsMatchIdListener = setupRpsMatchIdListener;
window.setupRpsOutgoingInviteListener = setupRpsOutgoingInviteListener;

console.log('✅ firebase-sync.js завантажено');
