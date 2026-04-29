// core/config.js — Konfiguracja Firebase i stałe aplikacji

const firebaseConfig = {
    apiKey: "AIzaSyCLwUZBI4N31kz4UKWmOyqNvszzygKFvWE",
    authDomain: "trackerwydatkowapp.firebaseapp.com",
    projectId: "trackerwydatkowapp",
    storageBucket: "trackerwydatkowapp.firebasestorage.app",
    messagingSenderId: "985262621512",
    appId: "1:985262621512:web:87348caca12ca4c453297d",
    measurementId: "G-SSDG9QGDL4"
};

// Firebase compat SDK ładowany z CDN jako <script> — inicjalizujemy tu
firebase.initializeApp(firebaseConfig);

export const auth = firebase.auth();
export const db = firebase.firestore();

// Stałe środowiskowe
export const IS_DEVELOPMENT = false;
export const API_BASE_URL = '';
