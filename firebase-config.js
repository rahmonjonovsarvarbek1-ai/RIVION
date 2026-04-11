// 1. Firebase modullari
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// 2. Supabase kutubxonasini import qilish (CDN orqali)
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

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
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

// 3. Supabase-ni ishga tushirish
// Project Settings -> API bo'limidan olgan ANON KEY-ni shu yerga qo'ying
const supabaseUrl = 'https://bcgwrbfsfrcxiyhpajve.supabase.co';
const supabaseKey = 'sb_publishable_yu9Pqq7bNOJhWt7nV8ITfQ_uqNK1n-a'; 
const supabase = createClient(supabaseUrl, supabaseKey);

// Boshqa fayllarda ishlatish uchun eksport qilamiz
export { auth, db, googleProvider, signInWithPopup, signOut, onAuthStateChanged, supabase };