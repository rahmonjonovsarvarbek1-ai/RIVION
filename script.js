/* ═══════════════════════════════════════════════
   RIVION — script.js
   Firebase Auth + Firestore + UI logic
═══════════════════════════════════════════════ */

'use strict';

// ─── 1. Firebase Imports ────────────────────
import { auth, db } from './firebase-config.js';

import {
    signInWithPopup,
    GoogleAuthProvider,
    OAuthProvider,
    onAuthStateChanged,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    setPersistence,
    browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

import {
    doc,
    setDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";


// ─── 2. DOM Elements ────────────────────────
const tabs          = document.querySelectorAll('.tab');
const tabIndicator  = document.getElementById('tabIndicator');
const forms         = document.querySelectorAll('.auth-form');
const switchBtns    = document.querySelectorAll('.switch-tab');

const loginEmail    = document.getElementById('loginEmail');
const loginPassword = document.getElementById('loginPassword');
const loginBtn      = document.getElementById('loginBtn');

const regFirstName  = document.getElementById('regFirstName');
const regLastName   = document.getElementById('regLastName');
const regUsername   = document.getElementById('regUsername');
const regEmail      = document.getElementById('regEmail');
const regPassword   = document.getElementById('regPassword');
const registerBtn   = document.getElementById('registerBtn');
const agreeTerms    = document.getElementById('agreeTerms');

const usernameCheck  = document.getElementById('usernameCheck');
const strengthFill   = document.getElementById('strengthFill');
const strengthLabel  = document.getElementById('strengthLabel');
const toast          = document.getElementById('toast');

const googleLoginBtn = document.getElementById('googleLoginBtn');
const appleLoginBtn  = document.getElementById('appleLoginBtn');


// ─── 3. Tab Switching ───────────────────────
function switchTab(targetTab) {
    tabs.forEach(tab => {
        const active = tab.dataset.tab === targetTab;
        tab.classList.toggle('active', active);
        tab.setAttribute('aria-selected', String(active));
    });
    forms.forEach(form => {
        form.classList.toggle('active', form.id === `form-${targetTab}`);
    });
    tabIndicator.classList.toggle('right', targetTab === 'register');
}

tabs.forEach(tab => tab.addEventListener('click', () => switchTab(tab.dataset.tab)));
switchBtns.forEach(btn => btn.addEventListener('click', () => switchTab(btn.dataset.target)));


// ─── 4. Toast ───────────────────────────────
let toastTimer = null;

function showToast(message, type = 'info', duration = 3500) {
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.className = `toast ${type} show`;
    toastTimer = setTimeout(() => toast.classList.remove('show'), duration);
}


// ─── 5. Input State Helpers ─────────────────
function setInputState(input, state) {
    input.classList.remove('valid', 'error');
    if (state) input.classList.add(state);
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function isValidUsername(username) {
    return /^[a-zA-Z0-9_]{3,20}$/.test(username.trim());
}


// ─── 6. Password Strength ───────────────────
function checkPasswordStrength(password) {
    let score = 0;
    if (password.length >= 8)            score++;
    if (password.length >= 12)           score++;
    if (/[A-Z]/.test(password))          score++;
    if (/[0-9]/.test(password))          score++;
    if (/[^A-Za-z0-9]/.test(password))  score++;

    const levels = [
        { label: '',             color: 'transparent', width: '0%'   },
        { label: 'Juda zaif',    color: '#ef4444',     width: '20%'  },
        { label: 'Zaif',         color: '#f97316',     width: '40%'  },
        { label: "O'rtacha",     color: '#f59e0b',     width: '60%'  },
        { label: 'Kuchli',       color: '#22c55e',     width: '80%'  },
        { label: 'Juda kuchli',  color: '#10b981',     width: '100%' },
    ];

    const level = levels[Math.min(score, 5)];
    strengthFill.style.width      = level.width;
    strengthFill.style.background = level.color;
    strengthLabel.textContent     = level.label;
    strengthLabel.style.color     = level.color;

    return score;
}

regPassword?.addEventListener('input', () => {
    checkPasswordStrength(regPassword.value);
    setInputState(regPassword,
        regPassword.value.length === 0 ? '' :
        regPassword.value.length >= 8  ? 'valid' : 'error'
    );
});


// ─── 7. Username Availability Check ─────────
// Haqiqiy loyihada bu yerda Firestore query yoki API bo'ladi
const takenUsernames = ['admin', 'rivion', 'test', 'user', 'moderator'];
let usernameTimer = null;

regUsername?.addEventListener('input', () => {
    const val = regUsername.value.trim();
    usernameCheck.textContent = '';
    setInputState(regUsername, '');
    if (!val) return;

    clearTimeout(usernameTimer);
    usernameCheck.textContent = '⏳';

    usernameTimer = setTimeout(() => {
        if (!isValidUsername(val)) {
            usernameCheck.textContent = '✗';
            usernameCheck.style.color = 'var(--error)';
            setInputState(regUsername, 'error');
            return;
        }
        if (takenUsernames.includes(val.toLowerCase())) {
            usernameCheck.textContent = '✗';
            usernameCheck.style.color = 'var(--error)';
            setInputState(regUsername, 'error');
            showToast(`@${val} band, boshqa nom tanlang`, 'error');
        } else {
            usernameCheck.textContent = '✓';
            usernameCheck.style.color = 'var(--success)';
            setInputState(regUsername, 'valid');
        }
    }, 600);
});


// ─── 8. Email Validation ────────────────────
[loginEmail, regEmail].forEach(input => {
    if (!input) return;
    input.addEventListener('blur', () => {
        if (!input.value) return setInputState(input, '');
        setInputState(input, isValidEmail(input.value) ? 'valid' : 'error');
    });
    input.addEventListener('input', () => {
        if (input.classList.contains('error') && isValidEmail(input.value)) {
            setInputState(input, 'valid');
        }
    });
});


// ─── 9. Toggle Password Visibility ──────────
document.querySelectorAll('.toggle-pass').forEach(btn => {
    btn.addEventListener('click', () => {
        const input = document.getElementById(btn.dataset.target);
        const show  = input.type === 'password';
        input.type  = show ? 'text' : 'password';

        btn.querySelector('svg').innerHTML = show
            ? `<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>`
            : `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>`;
    });
});


// ─── 10. Loading State ───────────────────────
function setLoading(btn, isLoading) {
    btn.disabled = isLoading;
    btn.classList.toggle('loading', isLoading);
}


// ─── 11. Firebase Error Handler ─────────────
function handleFirebaseError(error) {
    const messages = {
        'auth/email-already-in-use':    'Bu email allaqachon band.',
        'auth/invalid-credential':      "Email yoki parol noto'g'ri.",
        'auth/user-not-found':          'Foydalanuvchi topilmadi.',
        'auth/wrong-password':          "Parol noto'g'ri.",
        'auth/weak-password':           "Parol juda oddiy, kamida 6 ta belgi kiriting.",
        'auth/invalid-email':           "Email manzili noto'g'ri formatda.",
        'auth/too-many-requests':       "Juda ko'p urinish. Keyinroq qayta urinib ko'ring.",
        'auth/network-request-failed':  "Internet aloqasi yo'q.",
        'auth/popup-closed-by-user':    "Kirish oynasi yopildi.",
        'auth/cancelled-popup-request': '',   // jimgina yutib yuborish
    };

    const msg = messages[error.code];
    if (msg === undefined) showToast("Xatolik: " + error.message, 'error');
    else if (msg !== '')   showToast(msg, 'error');
    console.error('[RIVION Firebase]', error.code, error.message);
}


// ─── 12. Save User to Firestore ─────────────
async function saveUserToFirestore(user, extraData = {}) {
    const avatar = user.photoURL
        || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName || 'U')}&background=random&color=fff`;

    await setDoc(doc(db, "users", user.uid), {
        uid:         user.uid,
        displayName: user.displayName || extraData.displayName || 'RIVION User',
        email:       user.email,
        photoURL:    avatar,
        lastSeen:    serverTimestamp(),
        ...extraData
    }, { merge: true });
}

// Redirect helper
function redirectToMain(delay = 800) {
    setTimeout(() => window.location.href = 'main.html', delay);
}


// ─── 13. Google Login ───────────────────────
googleLoginBtn?.addEventListener('click', async () => {
    const provider = new GoogleAuthProvider();
    setLoading(googleLoginBtn, true);
    try {
        const result = await signInWithPopup(auth, provider);
        await saveUserToFirestore(result.user);
        showToast("Google orqali kirildi! 🎉", 'success');
        redirectToMain();
    } catch (error) {
        handleFirebaseError(error);
    } finally {
        setLoading(googleLoginBtn, false);
    }
});


// ─── 14. Apple Login ────────────────────────
appleLoginBtn?.addEventListener('click', async () => {
    const provider = new OAuthProvider('apple.com');
    provider.addScope('email');
    provider.addScope('name');
    setLoading(appleLoginBtn, true);
    try {
        const result = await signInWithPopup(auth, provider);
        await saveUserToFirestore(result.user);
        showToast("Apple orqali kirildi! 🎉", 'success');
        redirectToMain();
    } catch (error) {
        handleFirebaseError(error);
    } finally {
        setLoading(appleLoginBtn, false);
    }
});


// ─── 15. Email Login ────────────────────────
loginBtn?.addEventListener('click', async () => {
    const email    = loginEmail.value.trim();
    const password = loginPassword.value;

    let hasError = false;
    if (!email || !isValidEmail(email))   { setInputState(loginEmail,    'error'); hasError = true; }
    if (!password || password.length < 6) { setInputState(loginPassword, 'error'); hasError = true; }
    if (hasError) {
        showToast("Iltimos, maydonlarni to'g'ri to'ldiring", 'error');
        return;
    }

    setLoading(loginBtn, true);
    try {
        await setPersistence(auth, browserLocalPersistence);
        await signInWithEmailAndPassword(auth, email, password);
        showToast("Muvaffaqiyatli kirildi! 🎉", 'success');
        redirectToMain();
    } catch (error) {
        handleFirebaseError(error);
    } finally {
        setLoading(loginBtn, false);
    }
});


// ─── 16. Email Register ─────────────────────
registerBtn?.addEventListener('click', async () => {
    const firstName = regFirstName.value.trim();
    const lastName  = regLastName.value.trim();
    const username  = regUsername.value.trim();
    const email     = regEmail.value.trim();
    const password  = regPassword.value;
    const agreed    = agreeTerms.checked;

    let hasError = false;
    if (!firstName)                            { setInputState(regFirstName, 'error'); hasError = true; }
    if (!lastName)                             { setInputState(regLastName,  'error'); hasError = true; }
    if (!username || !isValidUsername(username)) { setInputState(regUsername,'error'); hasError = true; }
    if (!email || !isValidEmail(email))        { setInputState(regEmail,     'error'); hasError = true; }
    if (!password || password.length < 8)      { setInputState(regPassword,  'error'); hasError = true; }

    if (!agreed) {
        showToast("Foydalanish shartlariga rozilik bildiring", 'error');
        return;
    }
    if (hasError) {
        showToast("Iltimos, barcha maydonlarni to'ldiring", 'error');
        return;
    }
    if (takenUsernames.includes(username.toLowerCase())) {
        setInputState(regUsername, 'error');
        showToast(`@${username} band, boshqa nom tanlang`, 'error');
        return;
    }

    setLoading(registerBtn, true);
    try {
        const credential  = await createUserWithEmailAndPassword(auth, email, password);
        const user        = credential.user;
        const displayName = `${firstName} ${lastName}`;
        const avatar      = `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=random&color=fff`;

        await setDoc(doc(db, "users", user.uid), {
            uid:         user.uid,
            displayName: displayName,
            firstName:   firstName,
            lastName:    lastName,
            username:    username.toLowerCase(),
            email:       email,
            photoURL:    avatar,
            createdAt:   serverTimestamp(),
            lastSeen:    serverTimestamp()
        });

        showToast("Hisob yaratildi! Xush kelibsiz 🎉", 'success');
        redirectToMain();
    } catch (error) {
        handleFirebaseError(error);
    } finally {
        setLoading(registerBtn, false);
    }
});


// ─── 17. Auth State Observer ────────────────
onAuthStateChanged(auth, (user) => {
    if (user) {
        // Agar foydalanuvchi sessiyasi mavjud bo'lsa — to'g'ridan-to'g'ri yo'naltirish
        // window.location.href = 'main.html';
        console.log('[RIVION] Aktiv sessiya:', user.displayName || user.email);
    }
});


// ─── 18. Enter Key Navigation ───────────────
loginEmail?.addEventListener('keydown',    e => { if (e.key === 'Enter') loginPassword?.focus(); });
loginPassword?.addEventListener('keydown', e => { if (e.key === 'Enter') loginBtn?.click(); });

regFirstName?.addEventListener('keydown',  e => { if (e.key === 'Enter') regLastName?.focus(); });
regLastName?.addEventListener('keydown',   e => { if (e.key === 'Enter') regUsername?.focus(); });
regUsername?.addEventListener('keydown',   e => { if (e.key === 'Enter') regEmail?.focus(); });
regEmail?.addEventListener('keydown',      e => { if (e.key === 'Enter') regPassword?.focus(); });
regPassword?.addEventListener('keydown',   e => { if (e.key === 'Enter') registerBtn?.click(); });


// ─── 19. Clear Error on Type ────────────────
document.querySelectorAll('.auth-input').forEach(input => {
    input.addEventListener('input', () => {
        if (input.classList.contains('error') && input.value.length > 0) {
            setInputState(input, '');
        }
    });
});


// ─── 20. Animated Stats Counter ─────────────
function animateCount(el, target, suffix = '', duration = 1800) {
    if (!el) return;
    let start = 0;
    const step = Math.ceil(target / (duration / 16));
    const timer = setInterval(() => {
        start = Math.min(start + step, target);
        el.textContent = start.toLocaleString('uz-UZ') + suffix;
        if (start >= target) clearInterval(timer);
    }, 16);
}

const statsRow = document.querySelector('.stats-row');
if (statsRow) {
    const observer = new IntersectionObserver(entries => {
        if (entries[0].isIntersecting) {
            animateCount(document.getElementById('stat-users'),     124000, '+');
            animateCount(document.getElementById('stat-posts'),       8500, '+');
            animateCount(document.getElementById('stat-countries'),     42, '');
            observer.disconnect();
        }
    }, { threshold: 0.3 });
    observer.observe(statsRow);
}