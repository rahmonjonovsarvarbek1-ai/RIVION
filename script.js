import { auth, db } from './firebase-config.js'; 
// 1. Firebase Auth modullari
import { 
    signInWithPopup, 
    GoogleAuthProvider, 
    OAuthProvider,            // APPLE UCHUN QO'SHILDI
    onAuthStateChanged,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    setPersistence,           
    browserLocalPersistence   
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// 2. Firebase Firestore modullari
import { 
    doc, 
    setDoc, 
    getDoc, 
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// --- ELEMENTLARNI TANLAB OLISH ---
const mainAuthBtn = document.getElementById('mainAuthBtn');
const toggleAuth = document.getElementById('toggleAuth');
const googleBtn = document.getElementById('googleBtn');
const appleBtn = document.getElementById('appleBtn'); // APPLE TUGMASI
const authName = document.getElementById('authName');
const authEmail = document.getElementById('authEmail');
const authPassword = document.getElementById('authPassword');
const modalTitle = document.getElementById('modalTitle');
const modalSub = document.getElementById('modalSub');
const toggleText = document.getElementById('toggleText');
const navLoginBtn = document.querySelector('.btn-login') || document.querySelector('.logo'); 

let isLoginMode = true;

// --- REJIMNI ALMASHTIRISH (LOGIN <-> SIGN UP) ---
if (toggleAuth) {
    toggleAuth.onclick = (e) => {
        e.preventDefault();
        isLoginMode = !isLoginMode;
        modalTitle.innerText = isLoginMode ? "Kirish" : "Ro'yxatdan o'tish";
        modalSub.innerText = isLoginMode ? "Davom etish uchun ma'lumotlarni kiriting." : "Do'stlaringiz bilan muloqot uchun ro'yxatdan o'ting.";
        authName.style.display = isLoginMode ? 'none' : 'block'; 
        mainAuthBtn.innerText = isLoginMode ? 'Kirish' : 'Ro\'yxatdan o\'tish';
        toggleText.innerText = isLoginMode ? "Hisobingiz yo'qmi?" : "Hisobingiz bormi?";
        toggleAuth.innerText = isLoginMode ? "Ro'yxatdan o'tish" : "Kirish";
    };
}

// --- FIREBASE AUTH LOGIKASI ---

// A. Google Login
if (googleBtn) {
    googleBtn.onclick = async () => {
        const provider = new GoogleAuthProvider();
        try {
            googleBtn.innerText = "Ulanmoqda...";
            const result = await signInWithPopup(auth, provider);
            await saveUserToFirestore(result.user);
            window.location.href = 'main.html';
        } catch (error) {
            console.error("Google Error:", error);
            googleBtn.innerHTML = `<img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="G"> Google orqali davom etish`;
        }
    };
}

// B. Apple Login (YANGI QO'SHILDI)
if (appleBtn) {
    appleBtn.onclick = async () => {
        const provider = new OAuthProvider('apple.com');
        provider.addScope('email');
        provider.addScope('name');

        try {
            appleBtn.innerText = "Ulanmoqda...";
            const result = await signInWithPopup(auth, provider);
            await saveUserToFirestore(result.user);
            window.location.href = 'main.html';
        } catch (error) {
            console.error("Apple Error:", error);
            alert("Apple orqali kirish tez kunda qoshiladi, hozircha icloudingiz orqali kirishingiz mumkin!: ");
            appleBtn.innerHTML = `
                <svg viewBox="0 0 384 512" width="18" height="18" xmlns="http://www.w3.org/2000/svg">
                    <path fill="currentColor" d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 21.8-88.5 21.8-11.4 0-51.1-20.8-83.6-20.1-42.9.6-82.7 24.5-104.6 62.7-45.3 79-11.6 190.3 33.4 254.4 21.3 30.7 48.2 65.2 81.3 64 31.3-1.1 43.1-20.5 81.8-20.5 38.2 0 49.3 20.5 82.3 19.9 33.6-.6 56.7-31.2 77.3-60.8 24.7-35.5 34.9-69.4 35.1-71.1-1-.2-67.2-25.3-67.4-101zM233 105c15.8-19.1 26.1-45.7 23.2-72.3-22.9 1.1-50.3 15.5-67 35.8-15.1 18-28.2 45.2-24.6 71.9 25.1 2.1 50.8-15 68.4-35.4z"/>
                </svg> Apple orqali davom etish`;
        }
    };
}

// C. Firestore-ga saqlash funksiyasi (Kod takrorlanmasligi uchun)
async function saveUserToFirestore(user) {
    await setDoc(doc(db, "users", user.uid), {
        uid: user.uid,
        displayName: user.displayName || "RIVION User",
        email: user.email,
        photoURL: user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName || 'U')}`,
        lastSeen: serverTimestamp()
    }, { merge: true });
}

// D. Email va Parol orqali Auth
if (mainAuthBtn) {
    mainAuthBtn.onclick = async () => {
        const email = authEmail.value.trim();
        const password = authPassword.value;
        const name = authName.value.trim();

        if (!email || !password) return alert("Barcha maydonlarni to'ldiring!");

        try {
            if (isLoginMode) {
                await setPersistence(auth, browserLocalPersistence);
                await signInWithEmailAndPassword(auth, email, password);
                window.location.href = 'main.html';
            } else {
                if (!name) return alert("Iltimos, ismingizni kiriting!");
                const userCredential = await createUserWithEmailAndPassword(auth, email, password);
                const user = userCredential.user;
                const avatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random&color=fff`;

                await setDoc(doc(db, "users", user.uid), {
                    uid: user.uid,
                    displayName: name,
                    email: email,
                    photoURL: avatar,
                    createdAt: serverTimestamp()
                });
                window.location.href = 'main.html';
            }
        } catch (error) {
            handleAuthError(error);
        }
    };
}

function handleAuthError(error) {
    if (error.code === 'auth/email-already-in-use') alert("Bu email band.");
    else if (error.code === 'auth/invalid-credential') alert("Email yoki parol noto'g'ri.");
    else alert("Xatolik: " + error.message);
}

// --- FOYDALANUVCHI HOLATINI KUZATISH ---
onAuthStateChanged(auth, (user) => {
     if (user && navLoginBtn) {
        const photo = user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName || 'U')}`;
         navLoginBtn.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                <img src="${photo}" style="width: 30px; height: 30px; border-radius: 50%; border: 1px solid #333;">
                <span style="font-size: 0.9rem; font-weight: 500;">${(user.displayName || 'User').split(' ')[0]}</span>
            </div>`;
    }
});

// Global funksiyalar
window.closeModal = () => {
    const modal = document.getElementById('connection-modal');
    if (modal) modal.style.display = 'none';
};