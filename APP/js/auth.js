// Tracker Wydatków - Authentication Functions

// --- Logika Uwierzytelniania ---
function setupAuthEventListeners() {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        authErrorDiv.classList.add('hidden');

        const submitButton = loginForm.querySelector('button[type="submit"]');
        const buttonText = submitButton.querySelector('.button-text');
        const buttonSpinner = submitButton.querySelector('.button-spinner');

        submitButton.disabled = true;
        buttonText.classList.add('invisible');
        buttonSpinner.classList.remove('hidden');

        try {
            await auth.signInWithEmailAndPassword(loginEmail.value, loginPassword.value);
            // Reszta logiki (przełączenie widoku) jest obsługiwana przez onAuthStateChanged
        } catch (error) {
            let message = 'Wystąpił błąd logowania.';
            if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
                message = 'Nieprawidłowy email lub hasło.';
            }
            authErrorDiv.textContent = message;
            authErrorDiv.classList.remove('hidden');
        } finally {
            submitButton.disabled = false;
            buttonText.classList.remove('invisible');
            buttonSpinner.classList.add('hidden');
        }
    });

    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        authErrorDiv.classList.add('hidden');
        try {
            // Rejestracja w Firebase Auth
            const cred = await auth.createUserWithEmailAndPassword(registerEmail.value, registerPassword.value);
            
            // Utwórz profil użytkownika w Firestore (frontend-only, opcja 1)
            try {
                // Wstępne kategorie przypisywane do użytkownika (edytowalne)
                const INITIAL_CATEGORIES = ['spożywcze', 'chemia', 'transport', 'rozrywka', 'zdrowie', 'ubrania', 'dom', 'rachunki', 'inne'];
                await db.collection('users').doc(cred.user.uid).set({
                    uid: cred.user.uid,
                    email: cred.user.email,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    customCategories: INITIAL_CATEGORIES
                }, { merge: true });
            } catch (profileErr) {
                console.error('Nie udało się utworzyć profilu użytkownika w Firestore:', profileErr);
            }
            
            // onAuthStateChanged automatycznie przełączy na aplikację
        } catch (error) {
            let message = 'Wystąpił błąd rejestracji.';
            if (error.code === 'auth/email-already-in-use') {
                message = 'Ten adres email jest już używany.';
            } else if (error.code === 'auth/weak-password') {
                message = 'Hasło jest za słabe. Użyj co najmniej 6 znaków.';
            } else if (error.code === 'auth/invalid-email') {
                message = 'Nieprawidłowy adres email.';
            }
            authErrorDiv.textContent = message;
            authErrorDiv.classList.remove('hidden');
        }
    });

    switchAuthLink.addEventListener('click', (e) => {
        e.preventDefault();
        const isLogin = !loginForm.classList.contains('hidden');
        switchAuthForm(isLogin ? 'register' : 'login');
    });

    logoutBtn.addEventListener('click', logout);
}

function switchAuthForm(form) {
    if (form === 'login') {
        loginForm.classList.remove('hidden');
        registerForm.classList.add('hidden');
        authTitle.textContent = 'Zaloguj się do swojego konta';
        switchAuthLink.textContent = 'Nie masz konta? Zarejestruj się';
    } else {
        loginForm.classList.add('hidden');
        registerForm.classList.remove('hidden');
        authTitle.textContent = 'Stwórz nowe konto';
        switchAuthLink.textContent = 'Masz już konto? Zaloguj się';
    }
}

function logout() {
    auth.signOut(); // Wylogowanie z Firebase
    // onAuthStateChanged zajmie się resztą (ukryciem app-section itp.)
}