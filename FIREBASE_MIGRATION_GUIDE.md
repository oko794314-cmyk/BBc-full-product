# 🔥 Firebase Migration Guide - bb-coin-aae0a

## 📋 Оглядання

Цей проект переходить з **JSONBin** на **Firebase Realtime Database** для проекту **bb-coin-aae0a**.

### ✅ Переваги Firebase
- ⚡ Real-time синхронізація (мілісекунди)
- 🔄 Автоматичні слухачі для змін
- 💾 Надійне збереження даних
- 🌍 Глобальна інфраструктура
- 🔐 Безпека та аутентифікація

---

## 🚀 Швидкий старт

### 1️⃣ Отримайте Firebase ключи

```
1. Перейдіть https://console.firebase.google.com
2. Виберіть проект: bb-coin-aae0a
3. Project Settings → Service Accounts
4. Copy config JSON
```

### 2️⃣ Оновіть `firebase-config.js`

```javascript
const firebaseConfig = {
    apiKey: "AIzaSy...",
    authDomain: "bb-coin-aae0a.firebaseapp.com",
    databaseURL: "https://bb-coin-aae0a-default-rtdb.firebaseio.com",
    projectId: "bb-coin-aae0a",
    storageBucket: "bb-coin-aae0a.appspot.com",
    messagingSenderId: "...",
    appId: "..."
};
```

### 3️⃣ Використовуйте новий HTML файл

```html
<!-- Замість index-online-improved.html -->
<script src="index-firebase.html"></script>
```

---

## 📁 Структура файлів

| Файл | Описання |
|------|---------|
| `firebase-config.js` | Конфіг Firebase проекту |
| `firebase-sync-v2.js` | API для синхронізації |
| `index-firebase.html` | Новий інтерфейс з Firebase |
| `firebase-sync.js` | Старий варіант (не використовується) |

---

## 🔧 Функції Firebase Sync V2

### Збереження користувача
```javascript
await saveUserToFirebaseV2(username, userData);
```

### Завантаження користувача
```javascript
const user = await loadUserFromFirebaseV2(username);
```

### Відправка запиту на дружбу
```javascript
await sendFriendRequestFirebaseV2(fromUser, toUser);
```

### Передача монет
```javascript
await transferCoinsFirebaseV2(fromUser, toUser, amount);
```

### Оновлення балансу при майнингу
```javascript
await updateMiningBalanceFirebaseV2(username, newBalance);
```

---

## 🗄️ Структура Firebase Database

```
bb-coin-aae0a-default-rtdb/
├── users/
│   ├── username1/
│   │   ├── password: "hash"
│   │   ├── balance: 100.5
│   │   ├── avatar: "url"
│   │   ├── friends: []
│   │   ├── friendRequests: []
│   │   └── mining: false
│   └── username2/
│       └── ...
└── transactions/
    ├── txn1/
    │   ├── from: "user1"
    │   ├── to: "user2"
    │   ├── amount: 50
    │   └── timestamp: 1234567890
    └── txn2/
        └── ...
```

---

## 🔐 Security Rules

> ⚠️ **Важливо:** Цей проект використовує **власну авторизацію** (username/password у базі даних),
> а не Firebase Authentication. Тому правила з `auth != null` **не спрацюють** —
> всі запити будуть відхилені, бо Firebase не знає про вашу сесію.
> Правила нижче забезпечують валідацію структури даних замість аутентифікації.

Додайте ці правила в Firebase Console → Realtime Database → Rules.
Файл правил також збережено у `database.rules.json` в корені проекту.

```json
{
  "rules": {
    "users": {
      ".read": true,
      "$username": {
        ".write": true,
        ".validate": "newData.hasChildren(['password', 'balance'])",
        "password": {
          ".validate": "newData.isString() && newData.val().length >= 1"
        },
        "balance": {
          ".validate": "newData.isNumber() && newData.val() >= 0"
        },
        "avatar": {
          ".validate": "!newData.exists() || newData.isString()"
        },
        "friends": {
          ".validate": "!newData.exists() || newData.hasChildren()",
          "$index": {
            ".validate": "newData.isString() && newData.val().length >= 1"
          }
        },
        "friendRequests": {
          ".validate": "!newData.exists() || newData.hasChildren()",
          "$index": {
            ".validate": "newData.isString() && newData.val().length >= 1"
          }
        },
        "mining": {
          ".validate": "!newData.exists() || newData.isBoolean()"
        },
        "miningStartTime": {
          ".validate": "!newData.exists() || newData.isNumber()"
        },
        "updatedAt": {
          ".validate": "!newData.exists() || newData.isNumber()"
        },
        "balanceUpdatedAt": {
          ".validate": "!newData.exists() || newData.isNumber()"
        },
        "miningUpdatedAt": {
          ".validate": "!newData.exists() || newData.isNumber()"
        },
        "$other": {
          ".validate": false
        }
      }
    },
    "transactions": {
      ".read": true,
      ".write": true,
      "$txId": {
        ".validate": "newData.hasChildren(['from', 'to', 'amount', 'timestamp'])",
        "from": {
          ".validate": "newData.isString() && newData.val().length >= 1"
        },
        "to": {
          ".validate": "newData.isString() && newData.val().length >= 1"
        },
        "amount": {
          ".validate": "newData.isNumber() && newData.val() > 0"
        },
        "fee": {
          ".validate": "!newData.exists() || (newData.isNumber() && newData.val() >= 0)"
        },
        "totalAmount": {
          ".validate": "!newData.exists() || (newData.isNumber() && newData.val() > 0)"
        },
        "timestamp": {
          ".validate": "newData.isNumber()"
        },
        "$other": {
          ".validate": false
        }
      }
    }
  }
}
```

### 📋 Що захищають ці правила

| Правило | Що робить |
|---------|-----------|
| `users/.read: true` | Будь-хто може читати список користувачів (потрібно для входу та пошуку друзів) |
| `users/$username/.write: true` | Будь-хто може писати в запис користувача (немає Firebase Auth) |
| `.validate` на полях | Захист від некоректних даних: баланс не може бути від'ємним, пароль не може бути порожнім тощо |
| `$other: {".validate": false}` | Забороняє запис невідомих полів у профіль |
| `transactions` | Відкрито для читання/запису з валідацією обов'язкових полів |

### 🔒 Підвищення безпеки (для майбутнього)

Щоб краще захистити гру в майбутньому, розгляньте:
1. **Перейти на Firebase Authentication** — тоді можна буде перевіряти `auth.uid == $username`
2. **Перенести критичну логіку на backend** (наприклад, переказ монет та нарахування балансу при майнингу)

---

## 📊 Міграція даних з JSONBin

### 1. Експортувати з JSONBin
```bash
curl -X GET https://api.jsonbin.io/v3/b/YOUR_BIN_ID \
  -H "X-Master-Key: YOUR_KEY"
```

### 2. Імпортувати в Firebase
```javascript
async function migrateDataFromJsonBin(jsonbinData) {
    const db = firebase.database();
    
    for (const [username, userData] of Object.entries(jsonbinData)) {
        await db.ref(`users/${username}`).set(userData);
    }
    
    console.log('✅ Міграція завершена');
}
```

---

## 🔄 Real-time синхронізація

### Налаштування слухачів при вході
```javascript
setupAllListenersOnLoginV2(currentUser);
```

### Видалення слухачів при виході
```javascript
removeAllListenersV2();
```

---

## 🐛 Розв'язування проблем

### Проблема: Firebase не ініціалізується
**Рішення:** Перевірте, чи Firebase SDK завантажено та ключи правильні

```javascript
// Перевірка
console.log(firebase.apps.length > 0);
```

### Проблема: Помилка "Access Denied"
**Рішення:** Оновіть Security Rules в Firebase Console

### Проблема: Дані не синхронізуються
**Рішення:** Перевірте реальну базу даних URL
```
https://bb-coin-aae0a-default-rtdb.firebaseio.com
```

---

## 📞 Контакти

- **Firebase Проект:** bb-coin-aae0a
- **Database URL:** https://bb-coin-aae0a-default-rtdb.firebaseio.com
- **Документація:** https://firebase.google.com/docs/database

---

## ✨ Новинки версії 3.1

- 🔥 Firebase Realtime Database
- ⚡ Real-time синхронізація
- 📱 Оптимізований для мобільних
- 🎯 Real-time статус підключення
- 🧪 Батч-оновлення для оптимізації

---

## 📝 Чек-лист переходу

- [ ] Отримано Firebase ключи
- [ ] Оновлено `firebase-config.js`
- [ ] Тестовано локально
- [ ] Розгорнуто на сервер
- [ ] Міговані дані з JSONBin
- [ ] Налаштовані Security Rules
- [ ] Все працює! ✅
