// core/auth.js — Logika uwierzytelniania
//
// Logowanie, rejestracja, wylogowanie, przełączanie formularzy.

import { auth, db } from './config.js';

// =====================================================================
// ELEMENTY DOM
// =====================================================================

const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const loginEmail = document.getElementById('login-email');
const loginPassword = document.getElementById('login-password');
const registerEmail = document.getElementById('register-email');
const registerPassword = document.getElementById('register-password');
const authTitle = document.getElementById('auth-title');
const switchAuthLink = document.getElementById('switch-auth-link');
const authErrorDiv = document.getElementById('auth-error');

// =====================================================================
// LOGOWANIE
// =====================================================================

async function handleLogin() {
    const email = loginEmail.value;
    const password = loginPassword.value;
    const btn = loginForm.querySelector('button[type="submit"]');
    const btnText = btn.querySelector('.button-text');
    const spinner = btn.querySelector('.button-spinner');

    btn.disabled = true;
    if (btnText) btnText.classList.add('invisible');
    if (spinner) spinner.classList.remove('hidden');
    authErrorDiv.classList.add('hidden');

    try {
        await auth.signInWithEmailAndPassword(email, password);
    } catch (error) {
        authErrorDiv.textContent = 'Błąd logowania: ' + error.message;
        authErrorDiv.classList.remove('hidden');
    } finally {
        btn.disabled = false;
        if (btnText) btnText.classList.remove('invisible');
        if (spinner) spinner.classList.add('hidden');
    }
}

// =====================================================================
// REJESTRACJA
// =====================================================================

async function handleRegister() {
    const email = registerEmail.value;
    const password = registerPassword.value;
    const btn = registerForm.querySelector('button[type="submit"]');
    const btnText = btn.querySelector('.button-text');
    const spinner = btn.querySelector('.button-spinner');

    btn.disabled = true;
    if (btnText) btnText.classList.add('invisible');
    if (spinner) spinner.classList.remove('hidden');
    authErrorDiv.classList.add('hidden');

    try {
        await auth.createUserWithEmailAndPassword(email, password);
    } catch (error) {
        authErrorDiv.textContent = 'Błąd rejestracji: ' + error.message;
        authErrorDiv.classList.remove('hidden');
    } finally {
        btn.disabled = false;
        if (btnText) btnText.classList.remove('invisible');
        if (spinner) spinner.classList.add('hidden');
    }
}

// =====================================================================
// PRZEŁĄCZANIE FORMULARZY
// =====================================================================

function switchAuthForm() {
    const isLogin = authTitle.textContent.includes('Zaloguj');
    authTitle.textContent = isLogin ? 'Zarejestruj się' : 'Zaloguj się do swojego konta';
    loginForm.classList.toggle('hidden');
    registerForm.classList.toggle('hidden');
    switchAuthLink.textContent = isLogin ? 'Masz już konto? Zaloguj się' : 'Nie masz konta? Zarejestruj się';
    authErrorDiv.classList.add('hidden');
}

// =====================================================================
// WYLOGOWANIE
// =====================================================================

export function logout() {
    auth.signOut();
}

// =====================================================================
// INICJALIZACJA EVENT LISTENERÓW AUTH
// =====================================================================

export function setupAuthEventListeners() {
    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        handleLogin();
    });
    registerForm.addEventListener('submit', (e) => {
        e.preventDefault();
        handleRegister();
    });
    switchAuthLink.addEventListener('click', (e) => {
        e.preventDefault();
        switchAuthForm();
    });
}
