import { auth, googleProvider, signInWithPopup, onAuthStateChanged } from './firebase-config.js';

// --- 1. ELEMENTLARNI TANLAB OLISH ---
const modal = document.getElementById('authModal');
const openBtnHero = document.getElementById('openModalHero');
const openBtnNav = document.getElementById('openModalNav');
const closeBtn = document.querySelector('.close-modal');
const googleBtn = document.querySelector('.provider-btn.google');
const navLoginBtn = document.querySelector('.btn-login');

// --- 2. MODAL OYNASI LOGIKASI ---

// Modalni ochish funksiyasi
const openModal = () => {
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden'; // Orqa fonni qotirib qo'yadi
};

// Modalni yopish funksiyasi
const closeModal = () => {
    modal.style.display = 'none';
    document.body.style.overflow = 'auto';
};

// Tugmalarga hodisalarni biriktirish
if(openBtnHero) openBtnHero.onclick = openModal;
if(openBtnNav) openBtnNav.onclick = openModal;
if(closeBtn) closeBtn.onclick = closeModal;

// Modal tashqarisiga bosilganda yopish
window.onclick = (event) => {
    if (event.target == modal) {
        closeModal();
    }
};

// --- 3. FIREBASE AUTH (GOOGLE LOGIN) ---

// Google tugmasi bosilganda
googleBtn.onclick = async () => {
    try {
        googleBtn.innerText = "Ulanmoqda...";
        const result = await signInWithPopup(auth, googleProvider);
        const user = result.user;
        
        console.log("Muvaffaqiyatli kirildi:", user.displayName);
        closeModal(); // Modalni yopish (har ehtimolga qarshi)

        // --- ASOSIY QISMI: Yangi sahifaga o'tkazish ---
        window.location.href = 'main.html'; 

    } catch (error) {
        console.error("Xatolik:", error.message);
        alert("Kirishda xatolik yuz berdi. Firebase Console-da Google Auth yoqilganini tekshiring.");
        // Xatolik bo'lsa tugmani eski holiga qaytaramiz
        googleBtn.innerHTML = `<img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="G"> Google orqali davom etish`;
    }
};

// --- 4. FOYDALANUVCHI HOLATINI KUZATISH ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        // Foydalanuvchi tizimga kirgan bo'lsa, navigatsiyadagi tugmani o'zgartiramiz
        navLoginBtn.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px; cursor: pointer;">
                <img src="${user.photoURL}" style="width: 25px; height: 25px; border-radius: 50%; border: 1px solid white;">
                <span style="font-size: 0.85rem;">${user.displayName.split(' ')[0]}</span>
            </div>
        `;
        
        // Hero qismidagi tugmani o'zgartirish
        if(openBtnHero) {
            openBtnHero.innerText = "Hamjamiyatga o'tish";
            openBtnHero.onclick = () => {
                alert("Tez kunda hamjamiyat xonalari ishga tushadi!");
            };
        }
    } else {
        // Foydalanuvchi chiqib ketgan bo'lsa
        navLoginBtn.innerText = "Kirish";
        navLoginBtn.onclick = openModal;
    }
});