// Firebase modullarini import qilamiz
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js"; // Firestore moduli qo'shildi

// Sizning maxsus Firebase konfiguratsiyangiz
const firebaseConfig = {
  apiKey: "AIzaSyBJ-6bHgAlk_Kp-ip878l6hT3GaJOpkFBg",
  authDomain: "rivion-web.firebaseapp.com",
  projectId: "rivion-web",
  storageBucket: "rivion-web.firebasestorage.app",
  messagingSenderId: "952673848095",
  appId: "1:952673848095:web:856f262070f81720837e2a",
  measurementId: "G-EMZNS9H62S"
};

// Firebase-ni ishga tushirish
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app); // Ma'lumotlar bazasi (Firestore) ishga tushirildi
const googleProvider = new GoogleAuthProvider();

// Boshqa fayllarda (masalan main.js da) ishlatish uchun eksport qilamiz
export { auth, db, googleProvider, signInWithPopup, signOut, onAuthStateChanged };