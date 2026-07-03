// Firebase Configuration for bb-coin-8ec70
const firebaseConfig = {
    apiKey: "AIzaSyBjtWU290YeG8HNo0E2ckWAqKTJdy4hIm8",
    authDomain: "bb-coin-8ec70.firebaseapp.com",
    databaseURL: "https://bb-coin-8ec70-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "bb-coin-8ec70",
    storageBucket: "bb-coin-8ec70.firebasestorage.app",
    messagingSenderId: "414654294612",
    appId: "1:414654294612:web:b060f5f3312548dde15bc1",
    measurementId: "G-Y61TD7LQBT"
};

if (typeof firebase !== 'undefined' && firebase.apps.length === 0) {
    firebase.initializeApp(firebaseConfig);
    console.log('✅ Firebase initialized for bb-coin-8ec70');
}