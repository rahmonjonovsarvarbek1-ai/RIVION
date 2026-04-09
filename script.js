import { auth, db } from './firebase-config.js'; 
// 1. Firebase Auth modullari (Sessiya va Login uchun)
import { 
    signInWithPopup, 
    GoogleAuthProvider, 
    onAuthStateChanged,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    setPersistence,           // Sessiyani yoqish uchun
    browserLocalPersistence   // Brauzerda saqlash uchun
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// 2. Firebase Firestore modullari (Bazaga ma'lumot yozish uchun)
// BU YERGA setDoc QO'SHILDI - endi "setDoc is not defined" xatosi chiqmaydi
import { 
    doc, 
    setDoc, 
    getDoc, 
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Login funksiyangizni ichini quyidagicha o'zgartiring:
async function loginUser(email, password) {
    try {
        // Avval sessiyani brauzerda saqlashni buyuramiz
        await setPersistence(auth, browserLocalPersistence);
        
        // Keyin login qilamiz
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        
        console.log("Muvaffaqiyatli kirdingiz:", user.uid);
        window.location.href = 'main.html'; // Asosiy sahifaga o'tish
    } catch (error) {
        console.error("Login xatosi:", error.message);
        alert("Email yoki parol xato!");
    }
}
// --- 1. ELEMENTLARNI TANLAB OLISH ---
const mainAuthBtn = document.getElementById('mainAuthBtn');
const toggleAuth = document.getElementById('toggleAuth');
const googleBtn = document.getElementById('googleBtn');
const authName = document.getElementById('authName');
const authEmail = document.getElementById('authEmail');
const authPassword = document.getElementById('authPassword');
const modalTitle = document.getElementById('modalTitle');
const modalSub = document.getElementById('modalSub');
const toggleText = document.getElementById('toggleText');

// Navbatdagi login tugmasi (Header qismida bo'lsa)
const navLoginBtn = document.querySelector('.btn-login') || document.querySelector('.logo'); 

let isLoginMode = true;

// --- 2. REJIMNI ALMASHTIRISH (LOGIN <-> SIGN UP) ---
if (toggleAuth) {
    toggleAuth.onclick = (e) => {
        e.preventDefault();
        isLoginMode = !isLoginMode;

        // Instagram uslubidagi o'zgarishlar
        modalTitle.innerText = isLoginMode ? "Kirish" : "Ro'yxatdan o'tish";
        modalSub.innerText = isLoginMode ? "Davom etish uchun ma'lumotlarni kiriting." : "Do'stlaringiz bilan muloqot uchun ro'yxatdan o'ting.";
        authName.style.display = isLoginMode ? 'none' : 'block'; 
        mainAuthBtn.innerText = isLoginMode ? 'Kirish' : 'Ro\'yxatdan o\'tish';
        toggleText.innerText = isLoginMode ? "Hisobingiz yo'qmi?" : "Hisobingiz bormi?";
        toggleAuth.innerText = isLoginMode ? "Ro'yxatdan o'tish" : "Kirish";
    };
}

// --- 3. FIREBASE AUTH LOGIKASI ---

// A. Google Login
if (googleBtn) {
    googleBtn.onclick = async () => {
        const provider = new GoogleAuthProvider();
        try {
            googleBtn.innerText = "Ulanmoqda...";
            const result = await signInWithPopup(auth, provider);
            const user = result.user;

            // Foydalanuvchi ma'lumotlarini Firestore'da saqlash
            await setDoc(doc(db, "users", user.uid), {
                uid: user.uid,
                displayName: user.displayName,
                email: user.email,
                photoURL: user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName || 'U')}`,
                lastSeen: serverTimestamp()
            }, { merge: true });

            window.location.href = 'main.html';
        } catch (error) {
            console.error("Google Error:", error);
            googleBtn.innerHTML = `<img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="G"> Google orqali davom etish`;
        }
    };
}

// B. Email va Parol orqali Auth
if (mainAuthBtn) {
    mainAuthBtn.onclick = async () => {
        const email = authEmail.value.trim();
        const password = authPassword.value;
        const name = authName.value.trim();

        if (!email || !password) return alert("Barcha maydonlarni to'ldiring!");

        try {
            if (isLoginMode) {
                // Tizimga kirish
                await signInWithEmailAndPassword(auth, email, password);
                window.location.href = 'main.html';
            } else {
                // Ro'yxatdan o'tish
                if (!name) return alert("Iltimos, ismingizni kiriting!");
                
                const userCredential = await createUserWithEmailAndPassword(auth, email, password);
                const user = userCredential.user;

                // Profil rasmi uchun default avatar (Undefined xatosini oldini oladi)
                const avatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random&color=fff`;

                await setDoc(doc(db, "users", user.uid), {
                    uid: user.uid,
                    displayName: name,
                    email: email,
                    photoURL: avatar,
                    createdAt: serverTimestamp()
                });

                alert("Muvaffaqiyatli ro'yxatdan o'tdingiz!");
                window.location.href = 'main.html';
            }
        } catch (error) {
            // Xatoliklarni chiroyli tushuntirish
            if (error.code === 'auth/email-already-in-use') {
                alert("Bu email band. Iltimos, Kirish bo'limidan foydalaning.");
            } else if (error.code === 'auth/invalid-credential') {
                alert("Email yoki parol noto'g'ri.");
            } else {
                alert("Xatolik: " + error.message);
            }
        }
    };
}

// --- 4. FOYDALANUVCHI HOLATINI KUZATISH ---
onAuthStateChanged(auth, (user) => {
    if (user && navLoginBtn) {
        // Foydalanuvchi rasmini tekshirish
        const photo = user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName || 'U')}`;
        
        // Navigatordagi tugmani profil ko'rinishiga o'tkazish
        navLoginBtn.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                <img src="${photo}" style="width: 30px; height: 30px; border-radius: 50%; border: 1px solid #333;">
                <span style="font-size: 0.9rem; font-weight: 500;">${(user.displayName || 'User').split(' ')[0]}</span>
            </div>
  
            `;
    }
});