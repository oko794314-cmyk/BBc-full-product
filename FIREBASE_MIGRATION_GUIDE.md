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

Додайте ці правила в Firebase Console → Realtime Database → Rules:

```json
{
  "rules": {
    "users": {
      ".read": "auth != null",
      ".write": "auth != null",
      "$uid": {
        ".validate": "newData.hasChildren(['password', 'balance', 'avatar'])",
        "password": {".validate": "newData.isString()"},
        "balance": {".validate": "newData.isNumber()"},
        "friends": {".validate": "newData.isArray()"},
        "friendRequests": {".validate": "newData.isArray()"}
      }
    },
    "transactions": {
      ".read": "true",
      ".write": "true"
    }
  }
}
```

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
