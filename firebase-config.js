// firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
    getFirestore, 
    collection, 
    addDoc, 
    updateDoc, 
    doc, 
    query, 
    where, 
    orderBy, 
    onSnapshot, 
    serverTimestamp,
    limit 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
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

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

const supabaseUrl = 'https://bcgwrbfsfrcxiyhpajve.supabase.co';
const supabaseKey = 'sb_publishable_yu9Pqq7bNOJhWt7nV8ITfQ_uqNK1n-a'; 
const supabase = createClient(supabaseUrl, supabaseKey);

// Barcha kerakli modullarni markaziy tarzda eksport qilamiz
export { 
    auth, db, googleProvider, signInWithPopup, signOut, onAuthStateChanged, 
    supabase, collection, addDoc, updateDoc, doc, query, where, orderBy, 
    onSnapshot, serverTimestamp, limit 
};