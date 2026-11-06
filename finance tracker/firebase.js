import { initializeApp } from
    "https://www.gstatic.com/firebasejs/12.5.0/firebase-app.js";
import { getAuth } from
    "https://www.gstatic.com/firebasejs/12.5.0/firebase-auth.js";
import { getFirestore } from
    "https://www.gstatic.com/firebasejs/12.5.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyAQQJy_KSyZoy0ghlbMrasP1yThh667QaM",
    authDomain: "vinance-d84aa.firebaseapp.com",
    projectId: "vinance-d84aa",
    storageBucket: "vinance-d84aa.firebasestorage.app",
    messagingSenderId: "827781544222",
    appId: "1:827781544222:web:a6ab2fef9df0bb824d310f"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Every subcollection under users/{uid}. "Delete account" wipes these,
// so add new collection names here in later rounds.
export const USER_COLLECTIONS = [
    "transactions", "accounts", "categories", "budgets",
    "transfers", "recurring", "goals"
];