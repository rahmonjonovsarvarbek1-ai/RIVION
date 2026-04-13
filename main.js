// 1. Supabase-ni import qilish
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

// 2. Firebase Auth modullari
import { 
    getAuth, 
    onAuthStateChanged, 
    signOut,
    updateProfile 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// 3. Firestore modullari - Barcha kerakli funksiyalar shu yerda
import { 
    collection, 
    addDoc, 
    setDoc, 
    getDoc, 
    doc, 
    deleteDoc, 
    query, 
    where, 
    limit, 
    orderBy, 
    onSnapshot, 
    getDocs, 
    serverTimestamp,
    updateDoc,
    arrayUnion,
    arrayRemove,
    increment,
    writeBatch 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// 4. O'zingizning konfiguratsiyangiz
import { auth, db, supabase } from './firebase-config.js'; 

// --- YANGI FUNKSIYALAR ---

window.openUserProfile = async (uid) => {
    if (!uid) return;

    const home = document.getElementById('search-section'); // Qidiruvdan kirayotganimiz uchun
    const profile = document.getElementById('profile-page');

    if (home) home.style.display = 'none';
    if (profile) profile.style.display = 'block';

    try {
        const userRef = doc(db, "users", uid);
        
        onSnapshot(userRef, (docSnap) => {
            if (docSnap.exists()) {
                const userData = docSnap.data();
                
                // 1. Ma'lumotlarni to'ldirish
                document.getElementById('profile-name').innerText = userData.displayName || "Ismsiz";
                document.getElementById('profile-bio').innerText = userData.bio || "Bio ma'lumoti yo'q";
                // Profil rasmi va bannerini ham yangilashni unutmang
                if(userData.photoURL) document.getElementById('profile-avatar').src = userData.photoURL;

                // 2. Raqamlar (Followers/Following)
                document.getElementById('followers-count').innerText = userData.followers?.length || 0;
                document.getElementById('following-count').innerText = userData.following?.length || 0;

                // 3. TUGMALAR MANTIQI
                const actionContainer = document.getElementById('profile-action-container'); 
                if (!actionContainer) return;

                if (uid === auth.currentUser?.uid) {
                    // BU MENING PROFILIM
                    actionContainer.innerHTML = `
                        <button class="edit-profile-btn" onclick="openEditModal()">
                            Profilni mukammallashtirish
                        </button>
                    `;
                } else {
                    // BU BOSHQA FOYDALANUVCHI PROFILI
                    const isFollowing = userData.followers?.includes(auth.currentUser.uid);
                    
                    actionContainer.innerHTML = `
                        <div style="display: flex; gap: 10px; width: 100%;">
                            <button class="follow-btn-profile" onclick="window.followUser('${uid}')" 
                                    style="flex: 1; background: ${isFollowing ? '#333' : '#007bff'}">
                                ${isFollowing ? "Obunadan chiqish" : "Obuna bo'lish"}
                            </button>
                            <button class="chat-btn-profile" onclick="window.goToChat('${uid}')" 
                                    style="flex: 1; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); color: white;">
                                Chatga o'tish
                            </button>
                        </div>
                    `;
                }
            }
        });
    } catch (error) {
        console.error("Profil yuklashda xato:", error);
    }
};

window.followUser = async (targetUserId) => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
        alert("Avval tizimga kiring!");
        return;
    }

    const currentUserId = currentUser.uid;
    const targetUserRef = doc(db, "users", targetUserId);
    const currentUserRef = doc(db, "users", currentUserId);

    try {
        // 1. Sizning "following" ro'yxatingizga uni qo'shish
        await updateDoc(currentUserRef, {
            following: arrayUnion(targetUserId)
        });

        // 2. Uning "followers" ro'yxatiga sizni qo'shish
        await updateDoc(targetUserRef, {
            followers: arrayUnion(currentUserId)
        });

        // --- YANGI QISM: BILDIRISHNOMA YUBORISH ---
        // 'notifications' kolleksiyasiga yangi xabar qo'shamiz
        const notificationRef = collection(db, "notifications");
        await addDoc(notificationRef, {
            toUid: targetUserId,          // Kimga ketyapti (obuna bo'lingan odam)
            fromUid: currentUserId,       // Kimdan ketyapti (Siz)
            fromName: currentUser.displayName || "Foydalanuvchi", 
            type: "follow",               // Turini 'follow' deb belgilaymiz
            message: "sizga obuna bo'ldi", 
            read: false,                  // Hali o'qilmagan
            timestamp: serverTimestamp()  // Firebase server vaqti
        });
        // ------------------------------------------

        console.log("Muvaffaqiyatli obuna bo'lindi va bildirishnoma yuborildi!");
    } catch (error) {
        console.error("Obuna bo'lishda xato:", error);
    }
};

let currentUser = null; 
let selectedUserId = null; // Bu o'zgaruvchi xabar kimga ketishini saqlaydi

// --- ELEMENTLARNI TANLAB OLISH ---
const burgerBtn = document.getElementById('burgerBtn');
const sideDrawer = document.getElementById('sideDrawer');
const closeDrawer = document.getElementById('closeDrawer');
// ... qolgan elementlar ...

// --- 1. SIDEBAR (DRAWER) LOGIKASI ---
burgerBtn.addEventListener('click', () => sideDrawer.classList.add('open'));
closeDrawer.addEventListener('click', () => sideDrawer.classList.remove('open'));
window.addEventListener('click', (e) => {
    if (e.target === sideDrawer) sideDrawer.classList.remove('open');
});

// --- 2. DARK / LIGHT MODE ---
themeToggle.addEventListener('click', () => {
    document.body.classList.toggle('light-mode');
    const isLight = document.body.classList.contains('light-mode');
    themeToggle.innerHTML = isLight ? "☀️ Rejim: Yorqin" : "🌓 Rejim: Qora";
    localStorage.setItem('theme', isLight ? 'light' : 'dark');
});


onAuthStateChanged(auth, async (user) => {
    if (user && user.uid) { 
        currentUser = user; 
        
        try {
            const userRef = doc(db, "users", user.uid);
            const userSnap = await getDoc(userRef);

            // 1. Boshlang'ich qiymat (Googledan zaxira sifatida)
            let finalPhoto = user.photoURL;
            let finalName = user.displayName;

            if (userSnap.exists()) {
                const userData = userSnap.data();

                // 🔥 ASOSIY YECHIM: Firestore ma'lumotlarini mutlaq ustun qo'yamiz.
                // Agar Firestore-da rasm bo'lsa, Googlenikini umuman ishlatmaymiz.
                finalPhoto = userData.photoURL || user.photoURL || 'assets/default-avatar.png';
                finalName = userData.displayName || user.displayName;

                // 🛑 DIQQAT: updateProfile(...) funksiyasi olib tashlandi!
                // Aynan shu funksiya rasmning 5-10 minutda qaytib qolishiga sabab bo'layotgan edi.

                // 3. Umumiy UI elementlarni yangilash
                const avatarIds = ['userAvatar', 'drawerAvatar', 'inputAvatar', 'user-profile-img'];
                avatarIds.forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.src = finalPhoto;
                });

                if (document.getElementById('userNameDisplay')) {
                    document.getElementById('userNameDisplay').innerText = finalName;
                }

                // 4. Profil sahifasidagi ma'lumotlar
                if (document.getElementById('user-profile-name')) {
                    const genderIcon = userData.gender === 'male' ? '<i class="fas fa-mars" style="color: #1d9bf0; margin-left: 5px;"></i>' : 
                                     userData.gender === 'female' ? '<i class="fas fa-venus" style="color: #f91880; margin-left: 5px;"></i>' : '';
                    
                    document.getElementById('user-profile-name').innerHTML = `${finalName} ${genderIcon}`;
                    document.getElementById('user-profile-handle').innerText = userData.username ? `@${userData.username}` : "@username";
                    document.getElementById('user-profile-bio').innerText = userData.bio || "Hali ma'lumot kiritilmagan";
                    document.getElementById('user-display-age').innerText = userData.age ? `${userData.age} yosh` : "-- yosh";
                    document.getElementById('user-display-city').innerText = userData.city || "Shahar kiritilmagan";
                    document.getElementById('user-display-study').innerText = userData.study || "O'qish yoki Ish joyi";
                }

                // Professional Grid qismlari
                if (document.getElementById('user-display-goals')) document.getElementById('user-display-goals').innerText = userData.goals || "Katta maqsadlar sari yo'lda...";
                if (document.getElementById('user-display-interests')) document.getElementById('user-display-interests').innerText = userData.interests || "Coding, Design, Art";
                if (document.getElementById('user-display-travel')) document.getElementById('user-display-travel').innerText = userData.travel || "Yangi ufqlarni zabt etishni yoqtiradi";

                // 5. Drawer Name va Username
                const drawerName = document.getElementById('drawerName');
                if (drawerName) {
                    const verified = userData.isVerified === true ? `<svg viewBox="0 0 24 24" style="width: 18px; fill: #1d9bf0; margin-left: 5px; vertical-align: middle;"><path d="M22.5 12.5c0-1.58-.88-2.95-2.18-3.66.25-.9.4-1.84.4-2.84 0-3.04-2.46-5.5-5.5-5.5-1 0-1.94.27-2.74.75C11.77 1.03 10.4 0 9.5 0 6.46 0 4 2.46 4 5.5c0 1 .27 1.94.75 2.74C3.53 9.03 2.5 10.4 2.5 12.5c0 1.58.88 2.95 2.18 3.66-.25.9-.4 1.84-.4 2.84 0 3.04 2.46 5.5 5.5 5.5 1 0 1.94-.27 2.74-.75 1.22 1.22 2.58 2.25 3.5 2.25 3.04 0 5.5-2.46 5.5-5.5 0-1-.27-1.94-.75-2.74 1.22-.72 2.18-2.08 2.18-3.66zm-5 0l-5 5-2.5-2.5 1.41-1.41L11.5 13.59l3.59-3.59L17.5 12.5z"/></svg>` : '';
                    drawerName.innerHTML = `
                        <div style="display: flex; flex-direction: column;">
                            <span style="font-weight: bold;">${finalName} ${verified}</span>
                            <span style="font-size: 12px; color: #1d9bf0;">@${userData.username || 'username'}</span>
                        </div>
                    `;
                }

                if (typeof updateUserUI === 'function') {
                    updateUserUI({ ...user, photoURL: finalPhoto, displayName: finalName });
                }

            } else {
                // Yangi foydalanuvchi bazasini yaratish
                await setDoc(userRef, {
                    uid: user.uid,
                    displayName: user.displayName,
                    photoURL: user.photoURL,
                    email: user.email,
                    createdAt: serverTimestamp(),
                    username: "", 
                    age: "", city: "", study: "", bio: "", goals: "", interests: "", travel: "",
                    gender: "male"
                });
                showSection('profile');
                if (typeof openMyProfileModal === 'function') openMyProfileModal();
            }
        } catch (error) {
            console.error("Profil yuklashda xato:", error);
        }

    } else {
        currentUser = null;
        if (window.location.pathname.includes('main.html')) {
            window.location.href = 'index.html';
        }
    }
});
 
/// 1. Global o'zgaruvchi (fayl tepasida bir marta bo'lishi shart!)
// let selectedUserId = null; 

// 2. Funksiyani window-ga bog'lab e'lon qilish
window.openChat = (uid, name, photo) => {
    console.log("--- DEBUG BOSHLANDI ---");
    console.log("Kelgan UID:", uid);
    
    // MAJBURAN GLOBALGA YORDAM BERAMIZ
    window.selectedUserId = uid; 
    selectedUserId = uid; 

    console.log("Yangilangan selectedUserId:", selectedUserId);
    console.log("--- DEBUG TUGADI ---");

    // UI qismlari
    const noChat = document.getElementById('no-chat-selected');
    const activeChat = document.getElementById('active-chat-container');
    if (noChat) noChat.style.display = 'none';
    if (activeChat) activeChat.style.display = 'flex';

    document.getElementById('main-chat-user-name').innerText = name;
    document.getElementById('main-chat-user-img').src = photo || 'assets/default-avatar.png';
};

window.closeChat = () => {
    const container = document.getElementById('active-chat-container');
    if (container) {
        container.style.display = 'none';
        container.classList.remove('mobile-active'); // Mobil rejimni yopish
    }
};

// Orqaga qaytish tugmasi uchun
window.closeChat = () => {
    document.getElementById('active-chat-container').style.display = 'none';
    document.getElementById('no-chat-selected').style.display = 'flex';
};


function updateUserUI(user) {
    const nameDisplays = ['userNameDisplay', 'drawerName'];
    const avatarDisplays = ['userAvatar', 'drawerAvatar', 'inputAvatar'];

    nameDisplays.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerText = user.displayName;
    });

    avatarDisplays.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.src = user.photoURL || 'https://via.placeholder.com/40';
    });
}

// --- 4. POSTLAR BILAN ISHLASH (FIRESTORE REAL-TIME) ---

// A. Post yuborish
postBtn.addEventListener('click', async () => {
    const text = postText.value.trim();
    const user = auth.currentUser; // Foydalanuvchini olish

    if (!text || !user) return alert("Oldin nimadir yozing!");

    try {
        postBtn.disabled = true;
        postBtn.innerText = "⏳"; // Yuklanish belgisi

        // 1. MAJBURIY: Firestore'dan foydalanuvchining YANGI profil rasmini olamiz
        const userDoc = await getDoc(doc(db, "users", user.uid));
        let finalPhoto = user.photoURL; // Agar bazada bo'lmasa, authdagini oladi

        if (userDoc.exists()) {
            const userData = userDoc.data();
            // Agar siz yangi rasm yuklagan bo'lsangiz, o'sha olinadi
            finalPhoto = userData.photoURL || user.photoURL;
        }

        // 2. Postni bazaga yozish (finalPhoto bilan)
        await addDoc(collection(db, "posts"), {
            authorName: user.displayName,
            authorPhoto: finalPhoto, // <--- GOOGLE RASMI EMAS, YANGI RASM!
            content: text,
            createdAt: serverTimestamp(),
            uid: user.uid,
            likes: []
        });

        postText.value = ""; 
        console.log("Post muvaffaqiyatli yangi rasm bilan chiqdi! ✅");

    } catch (error) {
        console.error("Xato:", error);
        alert("Xatolik yuz berdi!");
    } finally {
        postBtn.disabled = false;
        postBtn.innerText = "Ulashish";
    }
});

// B. Postlarni real-vaqtda yuklash (onSnapshot)
const q = query(collection(db, "posts"), orderBy("createdAt", "desc"));
onSnapshot(q, (snapshot) => {
    postsList.innerHTML = ""; 

    if (snapshot.empty) {
        postsList.innerHTML = `<p style="text-align:center; color:var(--text-secondary); margin-top:20px;">Hozircha xabarlar yo'q...</p>`;
        return;
    }

    snapshot.forEach((postDoc) => {
        const data = postDoc.data();
        const postId = postDoc.id;
        const authorId = data.authorId || data.userId || data.uid || postDoc.data().authorId; 

        const time = data.createdAt ? new Date(data.createdAt.seconds * 1000).toLocaleString() : "Hozirgina";
        const isLiked = data.likes?.includes(auth.currentUser?.uid);
            
        postsList.innerHTML += `
            <div class="post-card horizontal-post">
                <img src="${data.authorPhoto || 'https://via.placeholder.com/40'}" 
                     class="post-avatar-large" 
                     onclick="window.openUserProfile('${authorId}')" 
                     style="cursor:pointer;">
                
                <div class="post-content-area">
                    <div class="post-header-mini" style="display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <span class="post-author" 
                                  onclick="window.openUserProfile('${authorId}')" 
                                  style="cursor:pointer; font-weight:bold;">
                                  ${data.authorName}
                            </span>
                            <span class="post-time" style="display: block; font-size: 11px;">${time}</span>
                        </div>
                        
                        ${authorId !== auth.currentUser?.uid ? `
                            <button onclick="window.followUser('${authorId}')" 
                                    style="background: #0084ff; color: white; border: none; padding: 4px 10px; border-radius: 12px; font-size: 12px; cursor: pointer;">
                                Obuna
                            </button>
                        ` : ''}
                    </div>
                    
                    <div class="post-body-mini" style="margin-top: 8px;">
                        <p>${data.content}</p>
                    </div>
                    
                    <div class="post-footer-mini" style="margin-top: 10px; display: flex; gap: 15px;">
                        <button onclick="toggleLike('${postId}', ${isLiked}, '${data.uid}', '${data.text?.replace(/'/g, "\\'") || ''}')" 
                          class="mini-action-btn ${isLiked ? 'active-like' : ''}">
                          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="${isLiked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                          <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>
                          </svg>
                          <span>${data.likes?.length || 0}</span>
                        </button>
                        
                        <button class="mini-action-btn" onclick="toggleCommentBox('${postId}')">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>
                            <span>${data.commentsCount || (data.comments ? data.comments.length : 0)}</span>
                        </button>
                    </div>

                    <div id="comment-box-${postId}" class="comment-section-mini" style="display: none; border-top: 1px solid #222; margin-top: 10px; padding-top: 10px;">
                        <div id="comments-display-${postId}" style="max-height: 150px; overflow-y: auto; margin-bottom: 10px;"></div>
                        <div class="comment-input-wrapper" style="display: flex; gap: 8px; background: #1a1a1a; padding: 5px 12px; border-radius: 20px;">
                            <input type="text" id="comment-input-${postId}" placeholder="Fikr qoldiring..." 
                                   style="flex: 1; background: none; border: none; color: white; outline: none; font-size: 0.85rem;">
                            <button onclick="sendComment('${postId}')" style="background: none; border: none; cursor: pointer; color: #0084ff; display: flex; align-items: center;">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    });
});

window.toggleLike = async (postId, currentlyLiked, authorId, postText) => {
    const user = auth.currentUser;
    if (!user) {
        console.warn("Xato: Foydalanuvchi tizimga kirmagan"); 
        return;
    }

    const postRef = doc(db, "posts", postId);
    
    try {
        if (currentlyLiked) {
            // LIKENI OLIB TASHLASH
            await updateDoc(postRef, { 
                likes: arrayRemove(user.uid) 
            });
            console.log("Like olib tashlandi");
        } else {
            // LIKE QO'SHISH
            await updateDoc(postRef, { 
                likes: arrayUnion(user.uid) 
            });

            // --- BILDIRISHNOMA LOGIKASI ---
            console.log("Tekshirilmoqda:", { 
                kelganAuthorId: authorId, 
                sizningId: user.uid 
            });

            // authorId "undefined" yoki bo'sh emasligini tekshiramiz
            if (authorId && authorId !== "undefined" && authorId !== user.uid) {
                await window.sendNotification(authorId, "like", postText || "Sizning postingiz");
                console.log("Bildirishnoma muvaffaqiyatli yuborildi ✅");
            } else {
                // Nega yuborilmaganini aniqlash uchun:
                if (!authorId || authorId === "undefined") {
                    console.error("XATO: authorId kelmadi! HTML qismida authorId o'rniga postData.uid bering.");
                } else if (authorId === user.uid) {
                    console.log("O'z postingizga like bosdingiz, bildirishnoma yuborilmadi.");
                }
            }
        }
    } catch (err) {
        console.error("Firestore bilan ishlashda xato:", err);
    }
};

window.addComment = async (postId, authorId, postText) => {
    const user = auth.currentUser;
    if (!user) {
        console.warn("Foydalanuvchi tizimga kirmagan");
        return;
    }

    const input = document.getElementById(`comment-input-${postId}`);
    if (!input) {
        console.error(`Xato: input topilmadi (comment-input-${postId})`);
        return;
    }
   
    const text = input.value.trim();
    if (text === "") return;

    try {
        // 1. Izohni Firestore-ga saqlash
        const commentRef = collection(db, "posts", postId, "comments");
        await addDoc(commentRef, {
            text: text,
            uid: user.uid,
            name: user.displayName || "Foydalanuvchi",
            img: user.photoURL || "",
            time: serverTimestamp()
        });

        // 2. BILDIRISHNOMA YUBORISH
        console.log("Izoh yuborilmoqda. Tekshiruv:", { authorId, currentUserId: user.uid });

        // authorId mavjudligi va o'zi emasligini tekshirish
        if (authorId && authorId !== "undefined" && authorId !== user.uid) {
            // window.sendNotification orqali chaqirish ishonchliroq
            await window.sendNotification(authorId, "comment", text);
            console.log("Bildirishnoma yuborildi ✅");
        } else {
            if (!authorId || authorId === "undefined") {
                console.error("XATO: authorId kelmadi! Izoh yozildi, lekin bildirishnoma ketmadi.");
            } else if (authorId === user.uid) {
                console.log("O'z postingizga izoh yozdingiz.");
            }
        }

        input.value = ""; // Inputni tozalash
    } catch (err) {
        console.error("Izoh yuborishda umumiy xato:", err);
    }
};


window.loadComments = (postId) => {
    const display = document.getElementById(`comments-display-${postId}`);
    
    // 1. Element borligini tekshirish (Xatoni oldini oladi)
    if (!display) {
        return; 
    }

    const q = query(collection(db, "posts", postId, "comments"), orderBy("createdAt", "asc"));

    onSnapshot(q, (snapshot) => {
        display.innerHTML = ""; 
        
        snapshot.forEach((doc) => {
            const c = doc.data();
            
            // 2. Rasm xatosini (404) oldini olish
            const userImg = (c.userPhoto && c.userPhoto !== 'undefined') 
                ? c.userPhoto 
                : `https://ui-avatars.com/api/?background=random&color=fff&name=${c.userName}`;

            display.innerHTML += `
                <div class="single-comment" style="display: flex; gap: 8px; margin-bottom: 8px; align-items: flex-start;">
                    <img src="${userImg}" style="width: 28px; height: 28px; border-radius: 50%; object-fit: cover;">
                    <div style="background: #1e1e1e; padding: 6px 14px; border-radius: 16px; font-size: 0.85rem; max-width: 85%;">
                        <b style="color: #1d9bf0; display: block; font-size: 0.75rem; margin-bottom: 2px;">${c.userName}</b>
                        <span style="color: #eee; word-break: break-word;">${c.text}</span>
                    </div>
                </div>`;
        });
    }, (error) => {
        console.error("Kommentlarni yuklashda xato:", error);
    });
};

// --- 5. NAVIGATSIYA LOGIKASI ---
const navItems = document.querySelectorAll('.m-nav-item, .side-menu li');

navItems.forEach(item => {
    item.addEventListener('click', () => {
        const target = item.getAttribute('data-section');
        
        // 1. Aktivlikni o'zgartirish
        navItems.forEach(i => i.classList.remove('active'));
        item.classList.add('active');

        // 2. Bo'limni ko'rsatish
        document.querySelectorAll('.content-section').forEach(section => {
            section.classList.remove('active');
            if (section.id === `${target}-section`) {
                section.classList.add('active');
            }
        });

        // 3. Drawer'ni yopish (mobil bo'lsa)
        sideDrawer.classList.remove('open');
    });
});

// --- 6. CHIQUVCHI LOGIKASI ---
document.getElementById('logoutBtnDrawer').addEventListener('click', () => {
    if (confirm("Chiqmoqchimisiz?")) {
        signOut(auth).then(() => window.location.href = 'index.html');
    }
});

// Comment bo'limini ko'rsatish/yashirish
window.toggleCommentBox = (postId) => {
    const box = document.getElementById(`comment-box-${postId}`);
    if (box.style.display === "none") {
        box.style.display = "block";
        loadComments(postId); // Commentlarni yuklash funksiyasini chaqirish
    } else {
        box.style.display = "none";
    }
};

window.sendComment = async (postId) => {
    const input = document.getElementById(`comment-input-${postId}`);
    const text = input.value.trim();
    const user = auth.currentUser; // Foydalanuvchini olish
    
    if (!text || !user) return;

    try {
        // 1. Auth-dan emas, Firestore'dan foydalanuvchining yangi ma'lumotlarini olamiz
        const userDoc = await getDoc(doc(db, "users", user.uid));
        let finalPhoto = user.photoURL; // Default rasm

        if (userDoc.exists()) {
            // Agar Firestore'da yangi rasm bo'lsa, o'shani ishlatamiz
            finalPhoto = userDoc.data().photoURL || user.photoURL;
        }

        const postRef = doc(db, "posts", postId);
        const newComment = {
            userId: user.uid,
            userName: user.displayName || "User",
            userPhoto: finalPhoto, // <--- MANA SHU YERDA YANGI RASM KETADI!
            text: text,
            createdAt: new Date()
        };

        await updateDoc(postRef, {
            comments: arrayUnion(newComment),
            commentsCount: increment(1)
        });

        input.value = ""; 
        console.log("Izoh yangi rasm bilan saqlandi! ✅");
    } catch (e) {
        console.error("Xabar yuborishda xato:", e);
    }
};

window.sendComment = async (postId) => {
    // 1. Avval elementni o'zini olyapmizmi yoki yo'q, tekshiramiz
    const commentInput = document.getElementById(`comment-input-${postId}`);
    
    if (!commentInput) {
        console.error(`Xato: comment-input-${postId} topilmadi!`);
        alert("Xatolik: Input topilmadi. Sahifani yangilab ko'ring.");
        return;
    }

    const text = commentInput.value.trim();

    // 2. Foydalanuvchi tizimga kirganini tekshirish
    if (!auth.currentUser) {
        alert("Fikr qoldirish uchun tizimga kiring!");
        return;
    }

    if (text === "") return;

    try {
        const commentRef = collection(db, "posts", postId, "comments");
        await addDoc(commentRef, {
            text: text,
            uid: auth.currentUser.uid,
            userName: auth.currentUser.displayName || "Foydalanuvchi",
            userPhoto: auth.currentUser.photoURL || "https://via.placeholder.com/30",
            createdAt: serverTimestamp()
        });

        commentInput.value = ""; // Muvaffaqiyatli yuborilgach tozalash
    } catch (error) {
        console.error("Fikr yuborishda xatolik:", error);
    }
    // Comment yozilgan joyda (try-catch ichida):
    await sendNotification(data.authorId, "comment", data.content); 
    // data.authorId - post muallifining ID-si
};

window.sendComment = async (postId, postAuthorId) => {
    const input = document.getElementById(`comment-input-${postId}`);
    if (!input) return;

    const text = input.value.trim();
    if (!text || !auth.currentUser) return;

    try {
        // 1. Kommentni qo'shish
        const commentRef = collection(db, "posts", postId, "comments");
        await addDoc(commentRef, {
            text: text,
            uid: auth.currentUser.uid,
            userName: auth.currentUser.displayName || "Foydalanuvchi",
            userPhoto: auth.currentUser.photoURL || "",
            createdAt: serverTimestamp()
        });

        // 2. Hisoblagichni yangilash (Endi increment xato bermaydi)
        const postRef = doc(db, "posts", postId);
        await updateDoc(postRef, {
            commentsCount: increment(1) 
        });

        input.value = ""; 
    } catch (e) { 
        console.error("Xato:", e); 
    }
};

// 1. Profilni yuklash
window.uploadDiscoveryProfile = async () => {
    const bioField = document.getElementById('discoveryBio');
    const bio = bioField.value.trim();
    const user = auth.currentUser;

    if (!user) {
        alert("Avval tizimga kiring!");
        return;
    }

    if (!bio) {
        alert("Iltimos, o'zingiz haqingizda ma'lumot yozing!");
        return;
    }

    try {
        // "discovery" kolleksiyasiga foydalanuvchi IDsi bilan saqlaymiz
        await setDoc(doc(db, "discovery", user.uid), {
            uid: user.uid,
            userName: user.displayName || "Foydalanuvchi",
            userPhoto: user.photoURL || 'https://via.placeholder.com/60',
            bio: bio,
            createdAt: serverTimestamp()
        });

        bioField.value = ""; // Textareani tozalash
        alert("Profilingiz networking bo'limiga muvaffaqiyatli qo'shildi!");
    } catch (err) {
        console.error("Xatolik:", err);
        alert("Xatolik yuz berdi: " + err.message);
    }
};

// 2. Qiziqish bildirish (Notification yuborish)
window.sendInterest = async (targetUid, targetName) => {
    const user = auth.currentUser;
    if (!user) return;

    try {
        await addDoc(collection(db, "notifications"), {
            toUid: targetUid,
            fromUid: user.uid,
            fromName: user.displayName,
            fromPhoto: user.photoURL,
            type: "interest",
            status: "pending", // Kutilmoqda
            message: "siz bilan tanishishga qiziqish bildirdi",
            createdAt: serverTimestamp()
        });
        alert(targetName + "ga so'rov yuborildi!");
    } catch (err) {
        console.error(err);
    }
};

window.loadNotifications = () => {
    const notifContainer = document.getElementById('notifications-list'); 
    if (!notifContainer) return;

    // Faqat o'zingizga tegishli bildirishnomalarni va vaqt bo'yicha saralab olish
    const q = query(
        collection(db, "notifications"),
        where("toUid", "==", auth.currentUser.uid),
        orderBy("createdAt", "desc")
    );
    
    onSnapshot(q, (snapshot) => {
        notifContainer.innerHTML = "";
        
        snapshot.forEach((doc) => {
            const notif = doc.data();
            const notifId = doc.id;
            let notifHTML = "";

            // 1. Tanishish so'rovi (Interest)
            if (notif.type === "interest" && notif.status === "pending") {
                notifHTML = `
                    <div class="notification-item">
                        <img src="${notif.fromPhoto || 'default.png'}" class="notif-avatar">
                        <div class="notif-text">
                            <p><strong>${notif.fromName}</strong> siz bilan tanishmoqchi</p>
                            <div class="notif-actions">
                                <button onclick="acceptInterest('${notifId}', '${notif.fromUid}')" class="agree-btn">Qabul qilish ✅</button>
                                <button class="ignore-btn">Rad etish</button>
                            </div>
                        </div>
                    </div>`;
            } 
            // 2. Like va Comment bildirishnomalari
            else if (notif.type === "like" || notif.type === "comment") {
                const actionText = notif.type === "like" ? "postingizga like bosdi" : "izoh qoldirdi";
                notifHTML = `
                    <div class="notification-item">
                        <img src="${notif.fromPhoto || 'default.png'}" class="notif-avatar">
                        <div class="notif-text">
                            <p><strong>${notif.fromName}</strong> ${actionText}</p>
                            <span class="notif-preview">"${notif.postText || ''}"</span>
                        </div>
                    </div>`;
            }

            notifContainer.innerHTML += notifHTML;
        });
    });
};
window.acceptInterest = async (notifId, peerUid) => {
    try {
        // 1. Statusni yangilash
        const notifRef = doc(db, "notifications", notifId);
        await updateDoc(notifRef, { status: "accepted" });
        
        // 2. Chatga yo'l ochish yoki do'stlikni tasdiqlash (logika sizga bog'liq)
        alert("Tabriklaymiz! Endi yozishishingiz mumkin.");
    } catch (error) {
        console.error("Xatolik yuz berdi:", error);
    }
};

const discoveryFeed = document.getElementById('discovery-feed');

// E'lonlarni real-time kuzatish
onSnapshot(query(collection(db, "discovery"), orderBy("createdAt", "desc")), (snapshot) => {
    discoveryFeed.innerHTML = "";
    snapshot.forEach((doc) => {
        const data = doc.data();
        
        // O'zimizning kartochkamizda "Qiziqish" tugmasi chiqmasligi kerak
        const isMe = auth.currentUser?.uid === data.uid;

        discoveryFeed.innerHTML += `
            <div class="discovery-card">
                <div class="user-info-box">
                    <img src="${data.userPhoto}" class="discovery-avatar">
                    <div class="user-details">
                        <span class="user-name">${data.userName}</span>
                    </div>
                </div>
                <p class="discovery-bio">${data.bio}</p>
                ${!isMe ? `
                    <button onclick="sendInterest('${data.uid}', '${data.userName}')" class="interest-btn">
                         Qiziqish bildirish
                    </button>
                ` : '<span class="my-badge">Sizning profilingiz</span>'}
            </div>
        `;
    });
});

// Modal boshqaruvi
window.openDiscoveryModal = () => document.getElementById('discoveryModal').style.display = 'block';
window.closeDiscoveryModal = () => document.getElementById('discoveryModal').style.display = 'none';

window.nextStep = (step) => {
    document.getElementById('step1').style.display = step === 1 ? 'flex' : 'none';
    document.getElementById('step2').style.display = step === 2 ? 'flex' : 'none';
};

window.previewDiscoveryImage = (event) => {
    const reader = new FileReader();
    reader.onload = () => document.getElementById('discoveryPreview').src = reader.result;
    reader.readAsDataURL(event.target.files[0]);
};

// Qiziqish bildirish (Notificationga yozish)
window.sendInterest = async (targetUid, targetName) => {
    const user = auth.currentUser;
    if (!user) return alert("Tizimga kiring!");

    try {
        await addDoc(collection(db, "notifications"), {
            toUid: targetUid,
            fromUid: user.uid,
            fromName: user.displayName || "Yashirin foydalanuvchi",
            fromPhoto: user.photoURL || 'https://via.placeholder.com/40',
            type: "interest",
            status: "pending",
            createdAt: serverTimestamp()
        });
        alert(targetName + "ga qiziqish bildirildi! Bildirishnomalarni tekshiring.");
    } catch (err) {
        console.error(err);
    }
};

onSnapshot(query(collection(db, "discovery"), orderBy("createdAt", "desc")), (snapshot) => {
    const feed = document.getElementById('discovery-feed');
    feed.className = "discovery-list"; 
    feed.innerHTML = "";
    
    snapshot.forEach((doc) => {
        const data = doc.data();
        
        // Hozirgi foydalanuvchi o'ziga o'zi obuna bo'la olmaydi
        const isOwnPost = auth.currentUser && auth.currentUser.uid === data.uid;
        const followBtnHtml = isOwnPost ? '' : `
            <button onclick="followUser('${data.uid}')" class="network-follow-btn">
                Obuna bo'lish
            </button>
        `;

        feed.innerHTML += `
            <div class="network-post">
                <div class="post-user-info">
                    <img src="${data.userPhoto}" style="width:20px; height:20px; border-radius:50%;">
                    <span>${data.userName}</span>
                </div>
                
                <img src="${data.postImage}" class="post-main-img">
                
                <div class="post-details">
                    <p class="post-caption">${data.bio}</p>
                    
                    <div class="post-actions-group">
                        <button onclick="sendInterest('${data.uid}', '${data.userName}')" class="network-action-btn">
                             Qiziqish bildirish
                        </button>
                        ${followBtnHtml}
                    </div>
                </div>
            </div>
        `;
    });
});

window.uploadDiscoveryPost = async () => {
    const bio = document.getElementById('discoveryBio').value;
    const fileInput = document.getElementById('discoveryFile');
    const user = auth.currentUser;
    const btn = document.getElementById('publishBtn');

    if (!user || !bio || !fileInput.files[0]) {
        alert("Rasm va tavsif majburiy!");
        return;
    }

    btn.disabled = true;
    btn.innerText = "Yuklanmoqda...";
 
    const reader = new FileReader();
    reader.readAsDataURL(fileInput.files[0]);
    reader.onload = async () => {
        try {
            await addDoc(collection(db, "discovery"), {
                uid: user.uid, // Profil rasmini yangilashda aynan shu ID kerak bo'ladi
                userName: user.displayName,
                // Har doim eng yangi rasmni olish uchun bu yerda hozirgi URLni saqlaymiz
                userPhoto: user.photoURL || 'assets/default-avatar.png', 
                postImage: reader.result, 
                bio: bio,
                createdAt: serverTimestamp()
            });
            
            closeDiscoveryModal();
            btn.disabled = false;
            btn.innerText = "E'lonni joylash";
            alert("Muvaffaqiyatli joylandi!");
        } catch (err) {
            console.error(err);
            btn.disabled = false;
            btn.innerText = "E'lonni joylash";
        }
    };
};

onSnapshot(query(collection(db, "discovery"), orderBy("createdAt", "desc")), (snapshot) => {
    const feed = document.getElementById('discovery-feed');
    feed.className = "discovery-list"; 
    feed.innerHTML = "";
    
    snapshot.forEach((doc) => {
        const data = doc.data();
        
        // Hozirgi foydalanuvchi o'ziga o'zi obuna bo'la olmaydi
        const isOwnPost = auth.currentUser && auth.currentUser.uid === data.uid;
        const followBtnHtml = isOwnPost ? '' : `
            <button onclick="followUser('${data.uid}')" class="network-follow-btn">
                Obuna bo'lish
            </button>
        `;

        feed.innerHTML += `
            <div class="network-post">
                <div class="post-user-info">
                    <img src="${data.userPhoto}" style="width:20px; height:20px; border-radius:50%;">
                    <span>${data.userName}</span>
                </div>
                
                <img src="${data.postImage}" class="post-main-img">
                
                <div class="post-details">
                    <p class="post-caption">${data.bio}</p>
                    
                    <div class="post-actions-group">
                        <button onclick="sendInterest('${data.uid}', '${data.userName}')" class="network-action-btn">
                             Qiziqish bildirish
                        </button>
                        ${followBtnHtml}
                    </div>
                </div>
            </div>
        `;
    });
});

// Bildirishnomalarni real-time kuzatish
const notifList = document.getElementById('notifications-list');

onSnapshot(query(collection(db, "notifications"), orderBy("createdAt", "desc")), (snapshot) => {
    const user = auth.currentUser;
    if (!user) return;

    // Faqat joriy foydalanuvchiga tegishli bildirishnomalar
    const myNotifs = snapshot.docs.filter(doc => doc.data().toUid === user.uid);

    if (myNotifs.length === 0) {
        notifList.innerHTML = '<p class="empty-msg">Yangi bildirishnomalar mavjud emas.</p>';
        return;
    }

    notifList.innerHTML = ""; // Tozalash

    myNotifs.forEach((doc) => {
        const notif = doc.data();
        const notifId = doc.id;
        let contentHTML = ""; // Har xil turdagi xabarlar uchun matn

        // 1-HOLAT: TANISHISH (INTEREST)
        if (notif.type === "interest") {
            contentHTML = `
                <div class="notif-info">
                    <p><strong>${notif.fromName}</strong> siz bilan tanishmoqchi.</p>
                    <span class="notif-time">${notif.createdAt?.toDate().toLocaleTimeString() || 'Hozir'}</span>
                </div>
            </div>
            ${notif.status === 'pending' ? `
                <div class="notif-actions">
                    <button onclick="acceptInterest('${notifId}', '${notif.fromUid}')" class="agree-btn">Do'st bo'lasizmi? ✅</button>
                </div>
            ` : `<span class="status-tag">Do'stlar qatoriga qo'shildi</span>`}`;
        } 
        
        // 2-HOLAT: LIKE YOKI COMMENT
        else if (notif.type === "like" || notif.type === "comment") {
            const message = notif.type === "like" ? "postingizga like bosdi" : "izoh qoldirdi";
            contentHTML = `
                <div class="notif-info">
                    <p><strong>${notif.fromName}</strong> ${message}.</p>
                    <p class="notif-preview">${notif.postText || ""}</p>
                    <span class="notif-time">${notif.createdAt?.toDate().toLocaleTimeString() || 'Hozir'}</span>
                </div>
            </div>`;
        }

        // Yakuniy HTMLni yig'ish
        const fullHTML = `
            <div class="notification-item ${notif.type}">
                <div class="notif-user">
                    <img src="${notif.fromPhoto || 'default-avatar.png'}" class="notif-avatar">
                    ${contentHTML}
            </div>
        `;
        notifList.innerHTML += fullHTML;
    });
});

// Funksiyadan tashqarida bitta o'zgaruvchi ochamiz
let isSendingMessage = false;

// Fayl tepasida import qilishni unutmang: 
// import { increment } from "firebase/firestore";

window.sendMainChatMessage = async function() {
    const input = document.getElementById('mainChatInput');
    const message = input.value.trim();
    
    if (!message || !currentUser || !window.selectedUserId || isSendingMessage) return;

    try {
        isSendingMessage = true; 
        const chatId = getChatId(currentUser.uid, window.selectedUserId);
        input.value = ""; 

        const myName = currentUser.displayName || "Foydalanuvchi";
        const myPhoto = currentUser.photoURL || `https://ui-avatars.com/api/?name=${myName}`;
        
        const peerName = window.selectedUserName || "Suhbatdosh";
        const peerPhoto = window.selectedUserPhoto || `https://ui-avatars.com/api/?name=${peerName}`;

        const messagesRef = collection(db, "chats", chatId, "messages");
        await addDoc(messagesRef, {
            text: message,
            senderId: currentUser.uid, 
            timestamp: serverTimestamp()
        });

        const chatRef = doc(db, "chats", chatId);
        await setDoc(chatRef, {
            participants: [currentUser.uid, window.selectedUserId],
            lastMessage: message,
            lastTimestamp: serverTimestamp(),
            // Qabul qiluvchi uchun o'qilmagan xabarlar sonini 1 taga oshiramiz
            unreadCount: {
                [window.selectedUserId]: increment(1)
            },
            usersInfo: {
                [currentUser.uid]: { name: myName, photo: myPhoto },
                [window.selectedUserId]: { name: peerName, photo: peerPhoto }
            }
        }, { merge: true });

        console.log("Xabar yuborildi va Inbox yangilandi!");

    } catch (error) {
        console.error("Yuborishda xato:", error);
        input.value = message;
        alert("Xabar yuborilmadi.");
    } finally {
        isSendingMessage = false;
    }
};

// 2. Chat ID yaratish (O'zgarishsiz qoladi)
function getChatId(uid1, uid2) {
    return uid1 < uid2 ? `${uid1}_${uid2}` : `${uid2}_${uid1}`;
}

// 3. Enter hodisasi (O'zgarishsiz qoladi)
document.getElementById('mainChatInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendMainChatMessage();
    }
});

let currentChatUnsubscribe = null; // Eski listenerni to'xtatish uchun

window.openChat = (peerUid, peerName, peerPhoto) => {
    console.log("Chat ochilmoqda:", peerName);
    
    // --- BU YERDA GLOBAL O'ZGARUVCHILARNI SAQLAYMIZ ---
    window.selectedUserId = peerUid; 
    window.selectedUserName = peerName;   // <--- Ismni saqlash
    window.selectedUserPhoto = peerPhoto; // <--- Rasmni saqlash

    const display = document.getElementById('main-chat-messages');
    const chatName = document.getElementById('main-chat-user-name');
    const chatImg = document.getElementById('main-chat-user-img');
    const chatWindow = document.getElementById('active-chat-container');

     if (chatName) chatName.innerText = peerName;
    if (chatImg) chatImg.src = peerPhoto || 'assets/default-avatar.png';

    // --- MOBIL UCHUN OYNANI OCHISH ---
    if (chatWindow && window.innerWidth <= 768) {
        chatWindow.classList.add('mobile-active');
        document.body.style.overflow = 'hidden'; 
    }

    if (currentChatUnsubscribe) currentChatUnsubscribe();

    const chatId = getChatId(currentUser.uid, peerUid);
    const q = query(collection(db, "chats", chatId, "messages"), orderBy("timestamp", "asc"));
    
    currentChatUnsubscribe = onSnapshot(q, (snapshot) => {
        if (!display) return;
        display.innerHTML = ""; 
        
        snapshot.forEach(doc => {
            const msg = doc.data();
            const isMe = msg.senderId === currentUser.uid;
            const msgDiv = document.createElement('div');
            msgDiv.className = `message ${isMe ? 'sent' : 'received'}`;
            msgDiv.innerHTML = `<div class="bubble">${msg.text || "..."}</div>`;
            display.appendChild(msgDiv);
        });
        display.scrollTop = display.scrollHeight; 
    });
};

// Orqaga qaytish tugmasi uchun funksiya
window.closeChat = () => {
    const chatWindow = document.getElementById('active-chat-container');
    if (chatWindow) {
        chatWindow.classList.remove('mobile-active');
        document.body.style.overflow = 'auto'; // Skrollni qaytarish
    }
};
// --- ORQAGA QAYTISH FUNKSIYASI ---
window.closeChat = () => {
    const chatWindow = document.getElementById('active-chat-container');
    if (chatWindow) {
        chatWindow.classList.remove('mobile-active');
        document.body.style.overflow = 'auto'; // Skrollni qaytarish
    }
};


function loadInbox() {
    const user = auth.currentUser;
    if (!user) return;

    // "chats" kolleksiyasidan joriy foydalanuvchi ishtirok etgan xonalarni olish
    const q = query(collection(db, "chats"), where("participants", "array-contains", user.uid));

    onSnapshot(q, (snapshot) => {
        const inbox = document.getElementById('inbox-list');
        if (!inbox) return; 
        
        inbox.innerHTML = "";
        
        if (snapshot.empty) {
            inbox.innerHTML = `<div class="chat-placeholder-mini"><p>Suhbatlar yo'q</p></div>`;
            return;
        }

        snapshot.forEach(doc => {
            const chatData = doc.data();
            
            if (chatData.usersInfo) {
                // Suhbatdoshni (peer) topish: UID siznikiga teng bo'lmagan foydalanuvchi
                const peerInfo = chatData.usersInfo.find(u => u.uid !== user.uid);

                if (peerInfo) {
                    // DIQQAT: onclick ichida openChat funksiyasiga peerInfo.uid ni birinchi bo'lib uzatamiz
                    // Bu 'Kimga: null' xatosini butkul yo'qotadi
                    inbox.innerHTML += `
                        <div class="inbox-item" onclick="openChat('${peerInfo.uid}', '${peerInfo.name}', '${peerInfo.photo}')">
                            <img src="${peerInfo.photo || 'https://via.placeholder.com/40'}" 
                                 class="nav-avatar" 
                                 onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(peerInfo.name)}&background=random&color=fff'">
                            <div class="inbox-meta">
                                <strong>${peerInfo.name}</strong>
                                <p style="font-size: 0.7rem; color: gray;">Suhbatni ko'rish</p>
                            </div>
                        </div>
                    `;
                }
            }
        });
    }, (error) => {
        console.error("Inbox yuklashda xato yuz berdi:", error);
    });
}

window.openFullChat = (roomId, name, photo) => {
    const wrapper = document.getElementById('chatWrapper');
    const noChat = document.getElementById('no-chat-selected');
    const activeChat = document.getElementById('active-chat-container');
    const messagesDisplay = document.getElementById('main-chat-messages');

    if (!wrapper || !activeChat) {
        console.error("Xato: Chat elementlari topilmadi!");
        return;
    }

    // 1. Mobile-da sidebar-ni yopib, chatni ko'rsatish
    wrapper.classList.add('is-chat-open');

    // 2. UI-ni tayyorlash
    noChat.style.display = 'none';
    activeChat.style.display = 'flex';

    // 3. Ma'lumotlarni to'ldirish (Rasm bo'lmasa default rasmni qo'yish)
    document.getElementById('main-chat-user-name').innerText = name || "Foydalanuvchi";
    document.getElementById('main-chat-user-img').src = photo || 'assets/default-avatar.png';

    // 4. MUHIM: Yangi chat ochilganda eski xabarlarni tozalab tashlash
    // Aks holda yangi xabarlar yuklanguncha eski odamning xabarlari ko'rinib turadi
    if (messagesDisplay) {
        messagesDisplay.innerHTML = '<div class="chat-loader">Yuklanmoqda...</div>';
    }

    // 5. Global o'zgaruvchini yangilash (Xabar yuborishda kerak bo'ladi)
    window.selectedUserId = roomId; 

    // 6. Xabarlarni yuklash
    if (typeof loadMessages === 'function') {
        loadMessages(roomId);
    } else {
        console.warn("loadMessages funksiyasi topilmadi!");
    }
};



let selectedUser = null; // Profil ochilganda foydalanuvchi ma'lumotlarini saqlash

window.searchUsers = async (val) => {
    const resultsContainer = document.getElementById('search-results');
    const input = val.toLowerCase().trim(); // Kichik harfga o'girish (ixtiyoriy)
    
    if (input.length < 2) {
        resultsContainer.innerHTML = "Kamida 2 ta harf kiriting...";
        return;
    }

    // Firebase'dan qidirish
    const q = query(collection(db, "users"), 
                where("displayName", ">=", val), 
                where("displayName", "<=", val + '\uf8ff'),
                limit(5));

    try {
        const querySnapshot = await getDocs(q);
        resultsContainer.innerHTML = "";

        if (querySnapshot.empty) {
            resultsContainer.innerHTML = "<p style='padding:10px; color:gray;'>Hech kim topilmadi</p>";
            return;
        }

        querySnapshot.forEach((doc) => {
            const user = doc.data();
            
            // --- MUHIM: UNDEFINED XATOSINI OLDINI OLISH ---
            const userPhoto = user.photoURL || 'default-avatar.png'; // Agar rasm bo'lmasa, zaxira rasm
            const userName = user.displayName || 'Noma\'lum foydalanuvchi';
            const userTag = user.username || 'user';

            resultsContainer.innerHTML += `
                <div class="inbox-item" onclick="viewUserProfile('${doc.id}', '${userName}', '${userPhoto}', '${userTag}')">
                    <img src="${userPhoto}" class="nav-avatar" onerror="this.src='default-avatar.png'">
                    <div>
                        <strong>${userName}</strong>
                        <p style="font-size: 0.8rem; color: gray;">@${userTag}</p>
                    </div>
                </div>
            `;
        });
    } catch (error) {
        console.error("Qidiruvda xato:", error);
    }
};
 
window.viewUserProfile = async (userId) => {
    // 1. O'zining profili bo'lsa, to'g'ridan-to'g'ri bo'limga o'tish
    if (auth.currentUser && userId === auth.currentUser.uid) {
        showSection('profile');
        return;
    }

    // Modalni topish
    const modal = document.getElementById('user-profile-modal');
    if (!modal) return;

    try {
        // 2. Bazadan foydalanuvchi ma'lumotlarini olish
        const userSnap = await getDoc(doc(db, "users", userId));
        
        if (userSnap.exists()) {
            const data = userSnap.data();

            // 3. Modal elementlarini to'ldirish (undefined bo'lmasligi uchun default qiymatlar bilan)
            document.getElementById('p-modal-name').innerText = data.displayName || "Ismsiz";
            document.getElementById('p-modal-username').innerText = "@" + (data.username || "foydalanuvchi");
            document.getElementById('p-modal-img').src = data.photoURL || 'assets/default-avatar.png';

            // 4. Tugmalarni yangilash
            const actionsBox = document.querySelector('.profile-actions-box');
            if (actionsBox) {
                actionsBox.innerHTML = `
                    <button onclick="handleChatFromProfile('${userId}')" class="btn-chat">
                        <i class="fas fa-comment"></i> Chatga o'tish
                    </button>
                    <button onclick="handleFriendRequest('${userId}')" class="btn-friend">
                        <i class="fas fa-user-plus"></i> Do'st bo'lish
                    </button>
                    <button onclick="window.openUserProfile('${userId}')" class="btn-full-profile">
                        To'liq profil
                    </button>
                `;
            }

            // Modalni ko'rsatish
            modal.style.display = 'block';
        }
    } catch (error) {
        console.error("Profilni yuklashda xatolik:", error);
    }
};

window.handleChatFromProfile = async (userId, userName, userPhoto) => {
    if (!userId) return;

     const home = document.getElementById('home-section');
    const chatSection = document.getElementById('chat-section');
    const chatWindow = document.getElementById('active-chat-window'); // Chat oynasini olamiz

     if (home && chatSection) {
        home.style.setProperty('display', 'none', 'important');
        chatSection.style.setProperty('display', 'flex', 'important');

        // MOBIL UCHUN: Chat oynasini sidebar ustiga chiqarish
        if (window.innerWidth <= 768 && chatWindow) {
            chatWindow.classList.add('active'); // CSS-dagi fixed pozitsiyani yoqadi
            chatWindow.style.display = 'flex';
        }

        if (typeof openFullChat === 'function') {
            openFullChat(userId, userName, userPhoto);
        } else {
            console.error("Xato: openFullChat funksiyasi topilmadi!");
         }
    }
};


// 2. Do'stlik so'rovi
window.handleFriendRequest = async (userId) => {
    const btn = document.getElementById('friendBtn');
    btn.disabled = true;
    btn.innerText = "Yuborildi...";
    
    // Firebase mantiqi shu yerda bo'ladi (addDoc)
    console.log("Do'stlik so'rovi yuborildi:", userId);
};

// 3. Modalni yopish
window.closeProfileModal = () => {
    document.getElementById('user-profile-modal').style.display = 'none';
};

window.closeProfileModal = () => {
    document.getElementById('user-profile-modal').style.display = 'none';
};

// Funksiyani window obyektiga ulaymiz (HTML ko'rishi uchun)
window.openMyProfileSettings = async () => {
    console.log("Sozlamalar tugmasi bosildi!");
    
    try {
        const user = auth.currentUser;
        if (!user) return;

        // Mana shu yerda getDoc ishlaydi
        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef); 

        if (userSnap.exists()) {
            const userData = userSnap.data();
            document.getElementById('edit-username').value = userData.username || "";
            document.getElementById('edit-display-name').value = userData.displayName || user.displayName || "";
            document.getElementById('edit-bio').value = userData.bio || "";
        }

        document.getElementById('my-profile-edit-modal').style.display = 'block';
    } catch (error) {
        console.error("Sozlamalarni ochishda xatolik:", error);
    }
};

// Modalni yopish funksiyasi
window.closeMyProfileModal = () => {
    const modal = document.getElementById('my-profile-edit-modal');
    if (modal) modal.style.display = 'none';
};

// 2. Username bandligini tekshirish (Real-time)
window.checkUsernameAvailability = async (username) => {
    const status = document.getElementById('username-status');
    const saveBtn = document.getElementById('saveProfileBtn');
    
    if (username.length < 3) {
        status.innerText = "Username juda qisqa";
        status.style.color = "orange";
        return;
    }

    const q = query(collection(db, "users"), where("username", "==", username.toLowerCase()));
    const snapshot = await getDocs(q);

    if (!snapshot.empty && snapshot.docs[0].id !== auth.currentUser.uid) {
        status.innerText = "Bu username allaqachon band!";
        status.style.color = "#ff4b4b";
        saveBtn.disabled = true;
        saveBtn.style.opacity = "0.5";
    } else {
        status.innerText = "Username bo'sh";
        status.style.color = "#00ba7c";
        saveBtn.disabled = false;
        saveBtn.style.opacity = "1";
    }
};

// 3. O'zgarishlarni saqlash
window.saveProfileChanges = async () => {
    const user = auth.currentUser;
    const newUsername = document.getElementById('edit-username').value.toLowerCase().trim();
    const newName = document.getElementById('edit-display-name').value.trim();
    const newBio = document.getElementById('edit-bio').value.trim();

    try {
        await updateDoc(doc(db, "users", user.uid), {
            username: newUsername,
            displayName: newName,
            bio: newBio
        });
        
        alert("Profil muvaffaqiyatli yangilandi!");
        location.reload(); // Sahifani yangilash
    } catch (err) {
        console.error("Xatolik:", err);
    }
};

window.closeMyProfileModal = () => {
    document.getElementById('my-profile-edit-modal').style.display = 'none';
};

window.searchUsers = async (val) => {
    const resultsContainer = document.getElementById('search-results');
    const input = val.toLowerCase().trim();
    
    if (input.length < 1) {
        resultsContainer.innerHTML = "";
        return;
    }

    // Ham ism, ham username bo'yicha qidirish (Parallel so'rov)
    const qName = query(collection(db, "users"), where("displayName", ">=", val), where("displayName", "<=", val + '\uf8ff'), limit(5));
    const qUsername = query(collection(db, "users"), where("username", ">=", input), where("username", "<=", input + '\uf8ff'), limit(5));

    const [snapName, snapUser] = await Promise.all([getDocs(qName), getDocs(qUsername)]);
    
    // Natijalarni birlashtirish
    resultsContainer.innerHTML = "";
    const combinedDocs = [...snapName.docs, ...snapUser.docs];
    const uniqueIds = new Set();

    combinedDocs.forEach(doc => {
        if (!uniqueIds.has(doc.id)) {
            uniqueIds.add(doc.id);
            const user = doc.data();
            resultsContainer.innerHTML += `
                <div class="inbox-item" onclick="viewUserProfile('${doc.id}', '${user.displayName}', '${user.photoURL}', '${user.username || 'user'}')">
                    <img src="${user.photoURL}" class="nav-avatar">
                    <div>
                        <strong>${user.displayName}</strong>
                        <p style="font-size: 0.8rem; color: gray;">@${user.username || 'user'}</p>
                    </div>
                </div>
            `;
        }
    });
};

window.saveProfileChanges = async () => {
    const user = auth.currentUser;
    if (!user) {
        alert("Foydalanuvchi aniqlanmadi!");
        return;
    }

    // --- YOSHNI HISOBLASH FUNKSIYASI ---
    const calculateAge = (birthDateString) => {
        if (!birthDateString) return "";
        const today = new Date();
        const birthDate = new Date(birthDateString);
        let age = today.getFullYear() - birthDate.getFullYear();
        const monthDiff = today.getMonth() - birthDate.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
            age--;
        }
        return age;
    };

    const saveBtn = document.getElementById('saveProfileBtn');
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerText = "Saqlanmoqda...";
    }

    try {
        const userRef = doc(db, "users", user.uid);
        
        const getSafeValue = (id) => {
            const el = document.getElementById(id);
            if (!el) {
                console.warn(`Ogohlantirish: '${id}' topilmadi!`);
                return "";
            }
            return el.value.trim();
        };

        const newPhotoURL = window.currentUploadedPhotoURL || user.photoURL;
        const birthdateValue = getSafeValue('edit-birthdate'); // "2000-03-13" kabi formatda keladi

        const updatedData = {
            username: getSafeValue('edit-username').toLowerCase(),
            displayName: getSafeValue('edit-display-name'),
            birthdate: birthdateValue, 
            age: calculateAge(birthdateValue), // 🔥 YOSHNI SANADAN HISOBLAB SAQLAYMIZ
            gender: getSafeValue('edit-gender'),
            city: getSafeValue('edit-city'),
            study: getSafeValue('edit-study'),
            bio: getSafeValue('edit-bio'),
            goals: getSafeValue('edit-goals'),
            interests: getSafeValue('edit-interests'),
            travel: getSafeValue('edit-travel'),
            photoURL: newPhotoURL,
            lastUpdate: serverTimestamp()
        };

        // Auth profilini yangilash
        await updateProfile(user, {
            displayName: updatedData.displayName,
            photoURL: newPhotoURL
        });

        // Firestore-ga saqlash
        await setDoc(userRef, updatedData, { merge: true });

        if (typeof window.updateAllUserDataUI === 'function') {
            window.updateAllUserDataUI(newPhotoURL, updatedData.displayName);
        }
        
        alert("Profil muvaffaqiyatli yangilandi!");
        if (typeof closeMyProfileModal === 'function') closeMyProfileModal();
        
        location.reload(); 
        
    } catch (error) {
        console.error("Saqlashda xatolik:", error);
        alert("Xatolik: " + error.message);
    } finally {
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerText = "Dunyoni yangilash";
        }
    }
};

window.checkUsernameAvailability = async (username) => {
    const statusEl = document.getElementById('username-status');
    if (!statusEl) return;

    if (username.length < 3) {
        statusEl.innerText = "Username juda qisqa";
        statusEl.style.color = "orange";
        return;
    }

    try {
        const q = query(collection(db, "users"), where("username", "==", username.toLowerCase()));
        const querySnapshot = await getDocs(q);
        
        if (!querySnapshot.empty) {
            // Agar username boshqa birovga tegishli bo'lsa
            const isMine = querySnapshot.docs.some(doc => doc.id === auth.currentUser.uid);
            if (isMine) {
                statusEl.innerText = "Bu sizning joriy username'ingiz";
                statusEl.style.color = "lightgreen";
            } else {
                statusEl.innerText = "Bu username band";
                statusEl.style.color = "red";
            }
        } else {
            statusEl.innerText = "Username bo'sh";
            statusEl.style.color = "lightgreen";
        }
    } catch (error) {
        console.error("Username tekshirishda xato:", error);
    }
};

window.buyPremium = async () => {
    const user = auth.currentUser;
    if (!user) return;

    if (confirm("Premium obunani 1 oyga faollashtirmoqchimisiz?")) {
        try {
            const userRef = doc(db, "users", user.uid);
            await updateDoc(userRef, {
                isVerified: true,
                premiumSince: serverTimestamp()
            });
            alert("Tabriklaymiz! Endi siz Verified foydalanuvchisiz.");
            location.reload(); // UI yangilanishi uchun
        } catch (error) {
            console.error("Xatolik:", error);
        }
    }
};

// 1. Chatga o'tish funksiyasi
window.openDirectMessage = (userId) => {
    console.log("Chat ochilmoqda:", userId);
    // Chat sahifasiga yo'naltirish
    window.location.href = `main.html?uid=${userId}`;
};

window.handleFriendRequest = async (requestId, action) => {
    try {
        const requestRef = doc(db, "friendRequests", requestId);
        
        // updateDoc o'rniga setDoc ishlatamiz (merge: true bilan)
        if (action === 'accept') {
            await setDoc(requestRef, { status: 'accepted' }, { merge: true });
            alert("Do'stlik qabul qilindi!");
        } else {
            await setDoc(requestRef, { status: 'rejected' }, { merge: true });
        }
    } catch (error) {
        console.error("Xato: Firebase-da hujjat topilmadi yoki ruxsat yo'q", error);
    }
};

let currentActiveChatId = null; // Kim bilan gaplashayotganimizni saqlaydi



window.selectUserForChat = async function(userId, userName, userPhoto) {
    if (!userId || userId === "null" || userId === undefined) return;

    // 1. GLOBAL O'ZGARUVCHILARNI YANGILASH
    window.selectedUserId = userId; 
    window.selectedUserName = userName || "Foydalanuvchi";
    window.selectedUserPhoto = (userPhoto && userPhoto !== "null") ? userPhoto : `https://ui-avatars.com/api/?name=${userName}`;

     const chatWindow = document.getElementById('active-chat-window');
     if (chatWindow) {
        chatWindow.classList.add('active');
        chatWindow.style.display = "flex"; 
    }

    // 2. HEADER YANGILASH
    document.getElementById('main-chat-user-name').innerText = window.selectedUserName;
    document.getElementById('main-chat-user-img').src = window.selectedUserPhoto;

    // 3. XABARLARNI YUKLASH
    if (typeof loadMainMessages === 'function') {
         loadMainMessages(userId);
    }

    // --- 4. YANGI QISM: O'QILMAGAN XABARLARNI NOLGA TUSHIRISH ---
    try {
        const chatId = getChatId(currentUser.uid, userId);
        const chatRef = doc(db, "chats", chatId);
        
        // updateDoc orqali aynan sizning unreadCount hisoblagichingizni 0 qilamiz
        await updateDoc(chatRef, {
            [`unreadCount.${currentUser.uid}`]: 0
        });
        
        console.log("Xabarlar o'qildi, 'New' belgisi o'chirildi.");
    } catch (error) {
        // Agar bazada hali unreadCount maydoni yaratilmagan bo'lsa, xato bermasligi uchun
        console.log("UnreadCount yangilanishi shart emas yoki xato:", error);
    }
};
 

 
// 3. Xabarlarni Real-time yuklash (Professional onSnapshot)
function loadMainMessages(targetUserId) {
    const currentUid = auth.currentUser.uid;
    // Chat ID yaratish (har doim bir xil tartibda: kichik_id + katta_id)
    const combinedId = currentUid < targetUserId ? `${currentUid}_${targetUserId}` : `${targetUserId}_${currentUid}`;

    const q = query(
        collection(db, "chats", combinedId, "messages"),
        orderBy("timestamp", "asc")
    );

    onSnapshot(q, (snapshot) => {
        const messageContainer = document.getElementById('main-chat-messages');
        messageContainer.innerHTML = '';

        snapshot.forEach((doc) => {
            const data = doc.data();
            const isMe = data.senderId === currentUid;
            
            const msgDiv = document.createElement('div');
            msgDiv.className = `message-wrapper ${isMe ? 'me' : 'them'}`;
            msgDiv.innerHTML = `
                <div class="message-bubble">
                    <p>${data.text}</p>
                    <span class="msg-time">${formatTime(data.timestamp)}</span>
                </div>
            `;
            messageContainer.appendChild(msgDiv);
        });
        
        // Avtomatik pastga tushirish (Scroll to bottom)
        messageContainer.scrollTop = messageContainer.scrollHeight;
    });
}



// "Enter" tugmasini bosganda ham yuboradigan qilish
document.getElementById('mainChatInput')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendMainChatMessage();
    }
});

// Vaqtni chiroyli formatlash
function formatTime(timestamp) {
    if (!timestamp) return "";
    const date = timestamp.toDate();
    return date.getHours() + ":" + String(date.getMinutes()).padStart(2, '0');
}

// Qidiruv natijalari yoki profil uchun rasm yuklash kodi
const setSafeImage = (imgElement, photoURL, displayName) => {
    if (!imgElement) return;

    // Internetdagi har doim ishlaydigan zaxira rasm
    const backupAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName || 'U')}&background=random`;

    // Agar photoURL haqiqatda mavjud bo'lsa va "undefined" bo'lmasa ishlatsin
    if (photoURL && photoURL !== "undefined" && photoURL !== null) {
        imgElement.src = photoURL;
    } else {
        imgElement.src = backupAvatar;
    }

    // AGAR rasm baribir yuklanmasa (masalan, link singan bo'lsa)
    imgElement.onerror = function() {
        this.onerror = null; // Cheksiz xatoni (loop) to'xtatish uchun shart!
        this.src = backupAvatar;
        console.warn("Rasm yuklanmadi, zaxira rasm qo'yildi.");
    };
};

window.openChat = (peerUid, peerName, peerPhoto) => {
    console.log("Chat ochilmoqda:", peerName);

    // --- MANA BU 3 TA QATORNI TO'G'RI YOZIB OLING (GLOBAL O'ZGARUVCHILAR) ---
    window.selectedUserId = peerUid; 
    window.selectedUserName = peerName;   // <--- Ismni saqlash (MUHIM!)
    window.selectedUserPhoto = peerPhoto; // <--- Rasmni saqlash (MUHIM!)

    const display = document.getElementById('main-chat-messages');
    const chatName = document.getElementById('main-chat-user-name');
    const chatImg = document.getElementById('main-chat-user-img');
    const chatWindow = document.getElementById('active-chat-container');

    if (display) display.innerHTML = ""; 
    if (chatName) chatName.innerText = peerName;
    if (chatImg) chatImg.src = peerPhoto || 'assets/default-avatar.png';
 
    if (chatWindow && window.innerWidth <= 768) {
        chatWindow.classList.add('mobile-active');
        document.body.style.overflow = 'hidden'; 
    }

    if (currentChatUnsubscribe) currentChatUnsubscribe();

    const chatId = getChatId(currentUser.uid, peerUid);
    const q = query(collection(db, "chats", chatId, "messages"), orderBy("timestamp", "asc"));
    
    currentChatUnsubscribe = onSnapshot(q, (snapshot) => {
        if (!display) return;
        display.innerHTML = ""; 
         snapshot.forEach(doc => {
            const msg = doc.data();
            const isMe = msg.senderId === currentUser.uid;
            const msgDiv = document.createElement('div');
            msgDiv.className = `message ${isMe ? 'sent' : 'received'}`;
            msgDiv.innerHTML = `<div class="bubble">${msg.text || "..."}</div>`;
            display.appendChild(msgDiv);
        });
        display.scrollTop = display.scrollHeight; 
    });
};

// Orqaga qaytish tugmasi uchun funksiya
window.closeChat = () => {
    const chatWindow = document.getElementById('active-chat-container');
    if (chatWindow) {
        chatWindow.classList.remove('mobile-active');
        document.body.style.overflow = 'auto'; // Skrollni qaytarish
    }
};

// Chatdan chiqish (Orqaga tugmasi uchun)
function closeChat() {
    const messageWindow = document.querySelector('.message-window');
    messageWindow.classList.remove('active');
}

function addToSidebar(uid, name, photo) {
    const list = document.getElementById('contactsList');
    
    // Agar bu odam ro'yxatda allaqachon bo'lsa, qayta qo'shmaymiz
    if (document.getElementById(`contact-${uid}`)) return;

    const html = `
        <div class="contact-item" id="contact-${uid}" onclick="openChat('${uid}', '${name}', '${photo}')">
            <img src="${photo || 'default-avatar.png'}" class="contact-avatar">
            <div class="contact-info">
                <span class="contact-name">${name}</span>
                <small>Yangi xabar...</small>
            </div>
        </div>
    `;
    list.insertAdjacentHTML('afterbegin', html); // Eng tepaga qo'shadi
}

// Search-da foydalanuvchi bosilganda
function onUserClick(uid, name, photo) {
    // 1. Chat bo'limiga o'tkazish (Navigatsiyani bosgan bilan bir xil)
    showSection('chat-section'); 
    
    // 2. Chat oynasini o'sha foydalanuvchi bilan ochish
    openChat(uid, name, photo);
}

// Navigatsiyadagi 'Chat' bosilganda suhbatlar ro'yxatini yuklash
async function loadMyChats() {
    const list = document.getElementById('contactsList');
    // Firestore-dan faqat joriy foydalanuvchi qatnashgan chatlarni olish
    const q = query(collection(db, "chats"), where("participants", "array-contains", auth.currentUser.uid));
    
    onSnapshot(q, (snapshot) => {
        list.innerHTML = ""; // Tozalash
        snapshot.forEach(doc => {
            const chatData = doc.data();
            // Bu yerda chatdagi ikkinchi odam ma'lumotlarini chiqaramiz
            renderContactItem(chatData);
        });
    });
}

document.getElementById('searchContact').addEventListener('input', async (e) => {
    const term = e.target.value.trim();
    const list = document.getElementById('contactsList');
    const recentList = document.getElementById('recent-chats-list'); // Inbox ro'yxati
    
    if (term.length > 0) {
        // Qidiruv boshlanganda Inboxni yashiramiz
        if (recentList) recentList.style.display = 'none';
        list.style.display = 'block';

        const q = query(collection(db, "users"), 
            where("displayName", ">=", term),
            where("displayName", "<=", term + "\uf8ff")
        );
        
        const snap = await getDocs(q);
        list.innerHTML = ""; 
        
        snap.forEach(doc => {
            const user = doc.data();
            const userId = doc.id;

            const contactItem = document.createElement('div');
            contactItem.className = 'contact-item'; 
            contactItem.innerHTML = `
                <div class="avatar-wrapper">
                    <img src="${user.photoURL || 'assets/default-avatar.png'}" alt="">
                </div>
                <div class="contact-info">
                    <h4>${user.displayName}</h4>
                    <p>${user.bio || 'Suhbatni boshlash...'}</p>
                </div>
            `;

            contactItem.addEventListener('click', () => {
                if (typeof window.selectUserForChat === 'function') {
                    // Tanlanganda qidiruvni tozalash
                    e.target.value = "";
                    list.style.display = 'none';
                    if (recentList) recentList.style.display = 'block';
                    
                    // Chat oynasini ochish
                    window.selectUserForChat(userId, user.displayName, user.photoURL);
                }
            });

            list.appendChild(contactItem);
        });
    } else {
        // Qidiruv bo'sh bo'lsa, hammasini joyiga qaytaramiz
        list.innerHTML = "";
        list.style.display = 'none';
        if (recentList) {
            recentList.style.display = 'block';
            loadRecentChats(); // Inboxni qayta yuklash
        }
    }
});

// 2. Kontaktni ekranga chiqarish
function renderContact(user) {
    const html = `
        <div class="contact-item" onclick="openChat('${user.uid}', '${user.displayName}', '${user.photoURL}')" style="cursor: pointer;">
            <img src="${user.photoURL || 'assets/default-avatar.png'}" class="contact-avatar">
            <div class="contact-info">
                <span class="contact-name">${user.displayName}</span>
                <p class="last-msg">Suhbatni boshlash...</p>
            </div>
        </div>`;
    document.getElementById('contactsList').insertAdjacentHTML('beforeend', html);
}

// 3. Chatni ochish
window.startChat = (uid, name, photo) => {
    const myUid = auth.currentUser.uid;
    currentChatId = myUid < uid ? `${myUid}_${uid}` : `${uid}_${myUid}`;

    // UI yangilash
    document.getElementById('no-chat-selected').style.display = 'none';
    document.getElementById('active-chat-container').style.display = 'block';
    document.getElementById('main-chat-user-name').innerText = name;
    document.getElementById('main-chat-user-img').src = photo || 'default-pfp.png';

    // Xabarlarni yuklash
    loadMessages(currentChatId);
};

function loadMessages(targetUserId) {
    selectedUserId = targetUserId;
    const chatId = getChatId(currentUser.uid, targetUserId);
    const messagesArea = document.getElementById('main-chat-messages');

    const q = query(
        collection(db, "chats", chatId, "messages"),
        orderBy("timestamp", "asc")
    );

    // Xabarlarni real-time kuzatish
    onSnapshot(q, (snapshot) => {
        messagesArea.innerHTML = "";
        snapshot.forEach((doc) => {
            const data = doc.data();
            const isMe = data.senderId === currentUser.uid;
            
            messagesArea.innerHTML += `
                <div class="message ${isMe ? 'my-message' : 'other-message'}">
                    <div class="message-text">${data.text}</div>
                </div>
            `;
        });
        // Har doim eng pastki xabarga tushirish
        messagesArea.scrollTop = messagesArea.scrollHeight;
    });
}



window.loadMainChatMessages = (uid) => {
    const chatBox = document.getElementById('main-chat-messages'); // HTML dagi ID
    if (!chatBox) return;

    // Firebase dan xabarlarni olish
    const q = query(
        collection(db, "chats"), 
        orderBy("timestamp", "asc")
    );

    onSnapshot(q, (snapshot) => {
        chatBox.innerHTML = "";
        snapshot.forEach((doc) => {
            const data = doc.data();
            
            // MUHIM: data.message emas, data.text bo'lishi shart!
            const text = data.text || "";
            
            // Xabar kimdan kelganini tekshirish
            const isMe = data.senderId === auth.currentUser.uid;

            chatBox.innerHTML += `
                <div class="message ${isMe ? 'sent' : 'received'}">
                    <div class="bubble">
                        ${text} 
                    </div>
                </div>
            `;
        });
        // Oxirgi xabarga tushirish
        chatBox.scrollTop = chatBox.scrollHeight;
    });
};

window.sendNotification = async function(targetUserId, type, postText = "") {
    // 1. Eng muhim tekshiruv: targetUserId borligini va u o'zingiz emasligingizni tekshirish
    if (!targetUserId || targetUserId === "undefined" || targetUserId === auth.currentUser.uid) {
        console.warn("Bildirishnoma yuborilmadi: targetUserId xato yoki o'zingizniki.", { targetUserId });
        return;
    }

    try {
        const notifRef = collection(db, "notifications");
        await addDoc(notifRef, {
            toUid: targetUserId,
            fromUid: auth.currentUser.uid,
            fromName: auth.currentUser.displayName || "Foydalanuvchi",
            fromPhoto: auth.currentUser.photoURL || "",
            type: type, // "like", "comment", "interest"
            postText: postText,
            isRead: false,
            createdAt: serverTimestamp()
        });
        console.log(`%c ${type} bildirishnomasi muvaffaqiyatli yuborildi! ✅`, "color: green; font-weight: bold;");
    } catch (e) {
        console.error("Firestore bildirishnoma xatosi:", e);
    }
};

// --- BILDIRISHNOMALARNI TO'LIQ VA TO'G'RI VARIANTI ---
onAuthStateChanged(auth, (user) => {
    if (user && user.uid) {
        // 1. Elementni qidirish
        const notifyList = document.getElementById("notifications-list");

        // 2. Query'ni FAQAT shu blok ichida e'lon qilamiz
        const qNotify = query(
            collection(db, "notifications"), 
            where("toUid", "==", user.uid), 
            orderBy("createdAt", "desc"),
            limit(20)
        );

        // 3. onSnapshot'ni ham FAQAT shu blok ichida chaqiramiz
        onSnapshot(qNotify, (snapshot) => {
            if (!notifyList) return;
            notifyList.innerHTML = "";
            
            if (snapshot.empty) {
                notifyList.innerHTML = '<p style="text-align:center; color:#888; padding:20px; font-size:13px;">Hozircha bildirishnomalar yo\'q.</p>';
                return;
            }

            snapshot.forEach((doc) => {
                const n = doc.data();
                const typeText = n.type === "like" ? "postingizga like bosdi" : "izoh qoldirdi";
                
                // Rasm xatosini (404) yo'qotish uchun tekshiruv
                const userImg = (n.fromPhoto && n.fromPhoto !== 'undefined' && n.fromPhoto !== "") 
                    ? n.fromPhoto 
                    : `https://ui-avatars.com/api/?name=${n.fromName || 'User'}&background=random`;

                notifyList.innerHTML += `
                    <div style="display: flex; gap: 10px; padding: 12px; border-bottom: 1px solid #1a1a1a; align-items: center;">
                        <img src="${userImg}" style="width: 35px; height: 35px; border-radius: 50%; object-fit: cover;">
                        <div>
                            <p style="margin:0; font-size: 13px; color: white;"><b>${n.fromName}</b> ${typeText}</p>
                            <small style="color: #555;">${n.createdAt ? new Date(n.createdAt.seconds * 1000).toLocaleTimeString() : 'Hozirgina'}</small>
                        </div>
                    </div>`;
            });
        }, (err) => {
            console.error("Bildirishnomalarni yuklashda Firebase xatosi:", err);
        });

    } else {
        // Foydalanuvchi chiqib ketgan bo'lsa ro'yxatni tozalash
        const notifyList = document.getElementById("notifications-list");
        if (notifyList) notifyList.innerHTML = "";
    }
});

// --- 3. FOYDALANUVCHI HOLATINI TEKSHIRISH ---
onAuthStateChanged(auth, async (user) => {
    if (user && user.uid) { 
        updateUserUI(user); 

        // 1. PROFILNI YUKLASH
        try {
            const userRef = doc(db, "users", user.uid);
            const userSnap = await getDoc(userRef);
            if (userSnap.exists()) {
                // ... (Sizning profil render kodingiz)
            }
        } catch (error) {
            console.error("Profil yuklashda xato (Internetni tekshiring):", error);
        }

        // --- 2. BILDIRISHNOMALAR (XAVFSIZ MANTIQ) ---
        const badge = document.getElementById("notification-badge");
        const notifyList = document.getElementById("notifications-list");
        const alertsBtn = document.querySelector('[data-section="notifications"]');

        // Faqat user.uid aniq bo'lgandagina query yaratamiz
        const qBadge = query(
            collection(db, "notifications"),
            where("toUid", "==", user.uid),
            where("isRead", "==", false)
        );

        const qNotify = query(
            collection(db, "notifications"), 
            where("toUid", "==", user.uid), 
            orderBy("createdAt", "desc"),
            limit(20)
        );

        // Qizil nuqta (badge) uchun snapshot
        if (badge) {
            onSnapshot(qBadge, (snapshot) => {
                badge.style.display = snapshot.empty ? "none" : "block";
            }, (err) => console.warn("Badge snapshot error:", err));
        }

        // Ro'yxatni chiqarish uchun snapshot
        if (notifyList) {
            onSnapshot(qNotify, (snapshot) => {
                notifyList.innerHTML = "";
                if (snapshot.empty) {
                    notifyList.innerHTML = '<p style="text-align:center; color:#555; padding:20px;">Bildirishnomalar yo\'q.</p>';
                    return;
                }
                snapshot.forEach((doc) => {
                    const n = doc.data();
                    const text = n.type === "like" ? "postingizga like bosdi" : "izoh qoldirdi";
                    const userImg = (n.fromPhoto && n.fromPhoto !== "") ? n.fromPhoto : `https://ui-avatars.com/api/?name=${n.fromName}`;
                    
                    notifyList.innerHTML += `
                        <div style="display: flex; gap: 10px; padding: 12px; border-bottom: 1px solid #1a1a1a; align-items: center;">
                            <img src="${userImg}" style="width: 35px; height: 35px; border-radius: 50%; object-fit: cover;">
                            <div>
                                <p style="margin:0; font-size: 13px; color: white;"><b>${n.fromName}</b> ${text}</p>
                            </div>
                        </div>`;
                });
            }, (err) => console.warn("Notify snapshot error:", err));
        }

        // 3. Tugmaga event ulash (Xatoni yo'qotish uchun xavfsiz tekshiruv)
        if (alertsBtn) {
            alertsBtn.onclick = async () => {
                const unreadSnap = await getDocs(qBadge);
                const batch = writeBatch(db);
                unreadSnap.forEach(d => batch.update(d.ref, { isRead: true }));
                await batch.commit();
            };
        }

    } else {
        // Foydalanuvchi chiqib ketgan bo'lsa login sahifasiga
        if (window.location.pathname.includes('main.html')) {
            window.location.href = 'index.html';
        }
    }
});

// Buni main.js ga qo'shing
function closeReelsViewer() {
    const viewer = document.getElementById('reels-viewer');
    viewer.style.display = 'none';
    // Videolarni to'xtatish
    const videos = viewer.querySelectorAll('video');
    videos.forEach(v => v.pause());
}

window.closeReelsViewer = closeReelsViewer;

// 1. Video faylni tanlashni eshitish
let selectedReelFile = null;

function handleReelFile(event) {
    const file = event.target.files[0];
    if (file) {
        const preview = document.getElementById('reel-preview');
        const container = document.getElementById('video-preview-container');
        const placeholder = document.getElementById('upload-placeholder');
        
        preview.src = URL.createObjectURL(file);
        placeholder.style.display = 'none';
        container.style.display = 'block';
        preview.play(); // Videoni ko'rsatish
    }
}

async function shareReel() {
    const fileInput = document.getElementById('reel-file-input');
    const captionInput = document.getElementById('reel-caption');
    const progressContainer = document.getElementById('upload-progress-container');
    const progressFill = document.getElementById('upload-progress-fill');
    const progressText = document.getElementById('progress-text');
    const shareBtn = document.getElementById('share-btn');

    const file = fileInput.files[0];
    if (!file) {
        alert("Iltimos, avval video tanlang!");
        return;
    }

    try {
        // UI holatini o'zgartirish
        shareBtn.disabled = true;
        progressContainer.style.display = 'block';
        console.log("Yuklash boshlandi...");

        const fileName = `reels/${Date.now()}_${file.name}`;

        // 1. Supabase-ga yuklash (Progress bilan)
        const { data, error: uploadError } = await supabase.storage
            .from('videos')
            .upload(fileName, file, {
                cacheControl: '3600',
                upsert: false
            });

        if (uploadError) throw uploadError;

        // Progressni 50% ga suramiz (yuklandi)
        progressFill.style.width = '50%';
        progressText.innerText = 'Baza bilan boglanmoqda...';

        // 2. Public Linkni olish
        const { data: publicUrlData } = supabase.storage
            .from('videos')
            .getPublicUrl(fileName);

        const videoURL = publicUrlData.publicUrl;
        console.log("Video linki olindi:", videoURL);

        // 3. Firestore-ga yozish
        // DIQQAT: Bazadagi maydon nomini 'videoURL' qilib yozing
        await addDoc(collection(db, "reels"), {
            videoURL: videoURL, 
            caption: captionInput.value || "",
            createdAt: serverTimestamp(),
            userId: auth.currentUser ? auth.currentUser.uid : "anonim"
        });

        // Yakunlash
        progressFill.style.width = '100%';
        progressText.innerText = 'Tayyor!';
        
        setTimeout(() => {
            alert("Video muvaffaqiyatli joylandi!");
            closeAddReelModal();
            location.reload(); 
        }, 500);

    } catch (error) {
        console.error("Xatolik yuz berdi:", error);
        alert("Xato: " + error.message);
        shareBtn.disabled = false;
        progressContainer.style.display = 'none';
    }
}

// Funksiyalarni global oynaga ulaymiz (HTML-dan chaqira olish uchun)
window.shareReel = shareReel;
window.handleReelFile = function(event) {
    const file = event.target.files[0];
    const preview = document.getElementById('reel-preview');
    const container = document.getElementById('video-preview-container');
    const placeholder = document.getElementById('upload-placeholder');
    const fileNameDisplay = document.getElementById('file-name-display');

    if (file) {
        preview.src = URL.createObjectURL(file);
        placeholder.style.display = 'none';
        container.style.display = 'block';
        if(fileNameDisplay) fileNameDisplay.innerText = file.name;
        preview.play();
    }
};

window.openAddReelModal = function() {
    const modal = document.getElementById('add-reel-modal');
    if (modal) {
        modal.style.display = 'flex';
    }
};
// 1. Funksiyani yaratamiz
function closeAddReelModal() {
    const modal = document.getElementById('add-reel-modal');
    if (modal) {
        modal.style.display = 'none';
        
        // Modal yopilganda ichidagi preview-ni ham tozalash (professional bo'lishi uchun)
        const preview = document.getElementById('reel-preview');
        const container = document.getElementById('video-preview-container');
        const placeholder = document.getElementById('upload-placeholder');
        
        if (preview) preview.src = "";
        if (container) container.style.display = 'none';
        if (placeholder) placeholder.style.display = 'block';
    }
}

// 2. Endi uni window-ga bog'laymiz (Xato yo'qoladi)
window.closeAddReelModal = closeAddReelModal;
window.handleReelFile = handleReelFile;
window.shareReel = shareReel;


// Video yuklash uchun yangi funksiya
async function uploadVideoToSupabase(file) {
    console.log("Yuklash boshlandi (Supabase)...");
    const fileName = `reels/${Date.now()}_${file.name}`;

    // Supabase-ga yuklash
    const { data, error } = await supabase.storage
        .from('videos') // Supabase bucket nomi
        .upload(fileName, file);

    if (error) {
        console.error("Supabase xatosi:", error.message);
        alert("Xato: " + error.message);
        return null;
    }

    // Tayyor linkni olish
    const { data: publicData } = supabase.storage
        .from('videos')
        .getPublicUrl(fileName);

    console.log("Yuklash tugadi! Link:", publicData.publicUrl);
    return publicData.publicUrl;
}

// 1. Videolarni Firestore-dan o'qib, Instagram uslubida chiqarish
async function loadReels() {
    const reelsGrid = document.getElementById('reels-grid');
    if (!reelsGrid) return;
    reelsGrid.innerHTML = ''; 

    try {
        const querySnapshot = await getDocs(collection(db, "reels"));
        
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            const docId = doc.id;
            const fileName = data.videoURL ? data.videoURL.split('/').pop() : "";
            
            // Vaqtni hisoblash (masalan: "2 kun oldin")
            const timeAgo = data.createdAt ? formatTimeAgo(data.createdAt.toDate()) : "Hozirgincha";

            if (data.videoURL) {
                const reelElement = document.createElement('div');
                reelElement.className = 'reels-grid-item';
                
                reelElement.innerHTML = `
                    <div class="video-wrapper">
                        <video 
                            src="${data.videoURL}" 
                            muted 
                            loop 
                            playsinline 
                            onclick="viewFullReel('${data.videoURL}', '${docId}', '${fileName}', '${data.userName || 'Foydalanuvchi'}', '${timeAgo}')">
                        </video>
                        <div class="reel-mini-stats">
                            <span>❤️ ${data.likes?.length || 0}</span>
                        </div>
                    </div>
                `;
                reelsGrid.appendChild(reelElement);
            }
        });
    } catch (error) {
        console.error("Yuklashda xato:", error);
    }
}

window.viewFullReel = function(url, docId, fileName, userName, time, likesCount = 0) {
    const viewer = document.getElementById('video-viewer-modal');
    const video = document.getElementById('full-screen-video');
    const sidebar = document.getElementById('viewer-sidebar-actions');
    const info = document.getElementById('viewer-bottom-info');

    if (viewer && video) {
        video.src = url;
        viewer.style.display = 'flex';
        
        // 1. Ma'lumotlar qatlami (Pastki qism)
        if (info) {
            info.innerHTML = `
                <div class="insta-user-details">
                    <img src="assets/default-avatar.png" class="mini-avatar" onerror="this.src='https://cdn-icons-png.flaticon.com/512/149/149071.png'">
                    <strong>${userName || 'Foydalanuvchi'}</strong> • <span>${time || 'Hozir'}</span>
                </div>
                <p class="insta-caption">${fileName ? fileName.substring(0, 20) : 'Video'}...</p>
            `;
        }

        // 2. Amallar qatlami (O'ng yon tomon) - Yangilangan versiya
if (sidebar) {
    sidebar.innerHTML = `
        <div class="insta-action" onclick="event.stopPropagation(); likeReel('${docId}')">
            <i class="fas fa-heart" id="like-heart-${docId}"></i>
            <span id="like-count-${docId}">${likesCount}</span>
        </div>
        <div class="insta-action" onclick="event.stopPropagation(); deleteReel('${docId}', '${fileName}')">
            <i class="fas fa-trash"></i>
            <span>O'chirish</span>
        </div>
    `;
}
    }
};

// 3. Like bosish va Bildirishnoma (Notification) yuborish
window.likeReel = async function(docId, authorName) {
    const user = auth.currentUser;
    if (!user) return alert("Avval tizimga kiring!");

    try {
        const reelRef = doc(db, "reels", docId);
        await updateDoc(reelRef, {
            likes: arrayUnion(user.uid)
        });

        // ❤️ Yurakni qizil qilish
        document.getElementById(`like-heart-${docId}`).style.color = "red";

        // 🔔 Alerts bo'limi uchun bildirishnoma yaratish
        await addDoc(collection(db, "notifications"), {
            recipientName: authorName,
            senderName: user.displayName || "Yangi foydalanuvchi",
            type: "like",
            message: "videongizga like bosdi",
            timestamp: serverTimestamp(),
            isRead: false
        });
    } catch (err) {
        console.error("Like xatosi:", err);
    }
};

// 4. O'chirish menyusi (3 nuqta bosilganda)
window.showMoreOptions = function(docId, fileName) {
    if(confirm("Ushbu videoni o'chirishni xohlaysizmi?")) {
        deleteReel(docId, fileName);
    }
};

// Vaqtni formatlash yordamchi funksiyasi
function formatTimeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    if (seconds < 60) return "hozir";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m avval`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}soat avval`;
    return date.toLocaleDateString();
}

window.viewFullReel = function(url, docId, fileName, userName, time, likesCount = 0) {
    const viewer = document.getElementById('video-viewer-modal');
    const video = document.getElementById('full-screen-video');
    const sidebar = document.getElementById('viewer-sidebar-actions');
    const info = document.getElementById('viewer-bottom-info');

    if (viewer && video) {
        video.src = url;
        viewer.style.display = 'flex';
        
        // Pastki ma'lumotlar (Username va Vaqt)
        if (info) {
            info.innerHTML = `
                <div class="insta-user-details">
                    <strong>${userName || 'Foydalanuvchi'}</strong>
                    <span>• ${time || 'Hozir'}</span>
                </div>
            `;
        }

        // O'ng tomondagi Instagram uslubidagi tugmalar
        if (sidebar) {
            sidebar.innerHTML = `
                <div class="insta-action" onclick="event.stopPropagation(); likeReel('${docId}', '${userName}')">
                    <i class="fas fa-heart" id="like-heart-${docId}"></i>
                    <span>${likesCount}</span> 
                </div>
                <div class="insta-action" onclick="event.stopPropagation(); showMoreOptions('${docId}', '${fileName}')">
                    <i class="fas fa-ellipsis-v"></i>
                    <span>Menu</span>
                </div>
            `;
        }
    }
};

window.togglePlayPause = function() {
    const video = document.getElementById('full-screen-video');
    if (video) {
        if (video.paused) {
            video.play();
        } else {
            video.pause();
        }
    }
};

// Modalni yopish funksiyasi
window.closeVideoViewer = function() {
    const viewer = document.getElementById('video-viewer-modal');
    const video = document.getElementById('full-screen-video');

    if (viewer) viewer.style.display = 'none';

    if (video) {
        video.pause();
        video.src = ""; // Xotirani bo'shatish
        video.load();
    }
};

// Qo'shimcha: "Esc" tugmasini bosganda ham yopiladigan qilish
document.addEventListener('keydown', (e) => {
    if (e.key === "Escape") {
        closeVideoViewer();
    }
});

// 2. Videoni o'chirish (Supabase Storage + Firestore)
window.deleteReel = async function(docId, fileName) {
    if (!confirm("Ushbu videoni butunlay o'chirmoqchimisiz?")) return;

    try {
        // Supabase-dan o'chirish
        const { error } = await supabase.storage
            .from('videos')
            .remove([`reels/${fileName}`]);

        if (error) throw error;

        // Firestore-dan o'chirish
        await deleteDoc(doc(db, "reels", docId));
        
        alert("O'chirildi!");
        loadReels(); // Ro'yxatni yangilash
    } catch (err) {
        console.error("O'chirishda xatolik:", err);
    }
};

// 3. Like bosish funksiyasi
window.likeReel = async function(docId) {
    try {
        const reelRef = doc(db, "reels", docId);
        await updateDoc(reelRef, {
            likes: increment(1)
        });
        loadReels(); // Sonini yangilash
    } catch (err) {
        console.error("Like bosishda xato:", err);
    }
};

// Sahifa yuklanganda videolarni avtomatik yuklash
window.onload = () => {
    loadReels();
};

// Global qilish (HTML-dan chaqirish uchun)
window.loadReels = loadReels;

// Funksiyani global qilish
window.loadReels = loadReels;

async function handleVideoUpload(file) {
    const fileName = `${Date.now()}_${file.name}`;
    
    // Supabase orqali yuklash
    const { data, error } = await supabase.storage
        .from('videos') // Supabase'da ochgan bucket nomi
        .upload(fileName, file);

    if (error) {
        console.error("Yuklashda xato:", error.message);
        return;
    }

    // Ochiq linkni olish
    const { data: publicData } = supabase.storage
        .from('videos')
        .getPublicUrl(fileName);

    return publicData.publicUrl;
}

// Videolarni (Reels) qidirish yoki ko'rsatish funksiyasi
async function loadAllReels() {
    const reelsContainer = document.getElementById('search-results'); // Videolar chiqadigan joy
    const q = query(collection(db, "reels"), orderBy("createdAt", "desc"));

    try {
        const querySnapshot = await getDocs(q);
        // Agar natija bo'lsa, videolarni ko'rsatish kodini yozasiz
        querySnapshot.forEach((doc) => {
            const reel = doc.data();
            console.log("Video topildi:", reel.videoURL);
            
            // Bu yerda videoni HTML-ga qo'shish kodi bo'ladi
            reelsContainer.innerHTML += `
                <div class="video-card">
                    <video src="${reel.videoURL}" controls width="200"></video>
                    <p>${reel.caption}</p>
                </div>
            `;
        });
    } catch (error) {
        console.error("Videolarni yuklashda xato:", error);
    }
}

// Barcha videolarni (reels) yuklash funksiyasi
async function loadExploreReels() {
    const exploreContainer = document.getElementById('explore-reels-container'); // Videolar chiqadigan blok ID-si
    if (!exploreContainer) return;

    try {
        // "reels" kolleksiyasidan barcha videolarni vaqt bo'yicha olish
        const q = query(collection(db, "reels"), orderBy("createdAt", "desc"));
        const querySnapshot = await getDocs(q);
        
        exploreContainer.innerHTML = ""; // Oldingi narsalarni tozalash

        querySnapshot.forEach((doc) => {
            const data = doc.data();
            
            // Instagram kabi "grid" (setka) ko'rinishida chiqarish
            exploreContainer.innerHTML += `
                <div class="explore-item" onclick="openFullVideo('${data.videoURL}')">
                    <video src="${data.videoURL}" muted loop></video>
                    <div class="overlay">
                        <span>❤️ 0</span>
                    </div>
                </div>
            `;
        });
    } catch (error) {
        console.error("Videolarni yuklashda xato:", error);
    }
}

// Search bo'limidagi grid-ga barcha videolarni yuklash
async function loadSearchReels() {
    const reelsGrid = document.getElementById('reels-grid');
    if (!reelsGrid) return;

    // Firestore'dan videolarni "reels" kolleksiyasidan olamiz
    const q = query(collection(db, "reels"), orderBy("createdAt", "desc"));
    
    // Doimiy kuzatuv (Real-time) - yangi video tushsa darrov ko'rinadi
    onSnapshot(q, (snapshot) => {
        reelsGrid.innerHTML = ""; // Tozalash
        
        snapshot.forEach((doc) => {
            const data = doc.data();
            // Grid elementini yaratish
            reelsGrid.innerHTML += `
                <div class="grid-item" style="position: relative; aspect-ratio: 9/16; background: #000; overflow: hidden; cursor: pointer;" 
                     onclick="openReelsViewer('${doc.id}')">
                    <video src="${data.videoURL}" style="width: 100%; height: 100%; object-fit: cover;"></video>
                    <div style="position: absolute; bottom: 5px; left: 5px; color: white; font-size: 10px;">
                        <i class="fas fa-play"></i>
                    </div>
                </div>
            `;
        });
    });
}

// 1. Reels Viewer - To'liq ekran ko'rish (Grid'dan ochilganda)
window.viewFullReel = function(url, docId, fileName, userName, time, likesCount = 0) {
    const viewer = document.getElementById('video-viewer-modal');
    const video = document.getElementById('full-screen-video');
    const sidebar = document.getElementById('viewer-sidebar-actions');
    const info = document.getElementById('viewer-bottom-info');

    if (viewer && video) {
        video.src = url;
        viewer.style.display = 'flex';
        
        // Pastki ma'lumotlar
        info.innerHTML = `
            <div style="text-shadow: 0 0 5px #000;">
                <strong>${userName || 'Foydalanuvchi'}</strong><br>
                <small>${time || 'Hozir'}</small>
            </div>
        `;

        // Sidebar: Like va O'chirish (Trash icon)
        sidebar.innerHTML = `
            <div class="insta-action" onclick="event.stopPropagation(); likeReel('${docId}')">
                <i class="fas fa-heart"></i>
                <span class="action-count">${likesCount}</span>
            </div>
            <div class="insta-action" onclick="event.stopPropagation(); deleteReel('${docId}', '${fileName}')">
                <i class="fas fa-trash"></i>
                <small>O'chirish</small> 
            </div>
        `;
        video.play().catch(e => console.log("Video autoplay xatosi:", e));
    }
};

// 2. Videodan chiqish
window.closeVideoViewer = function() {
    const viewer = document.getElementById('video-viewer-modal');
    const video = document.getElementById('full-screen-video');

    if (viewer) viewer.style.display = 'none';

    if (video) {
        video.pause();
        video.src = ""; 
        video.load();
    }
};

// 3. Videoni o'chirish (Supabase + Firestore)
window.deleteReel = async function(docId, fileName) {
    if (!confirm("Haqiqatdan ham ushbu videoni butunlay o'chirmoqchimisiz?")) return;

    try {
        // 1. Supabase Storage'dan o'chirish
        const { error: storageError } = await supabase.storage
            .from('videos')
            .remove([`reels/${fileName}`]);

        if (storageError) {
            console.error("Storage xatosi:", storageError);
            alert("Faylni xotiradan o'chirishda muammo bo'ldi.");
            return;
        }

        // 2. Firestore'dan o'chirish
        await deleteDoc(doc(db, "reels", docId));

        alert("Video muvaffaqiyatli o'chirildi!");
        closeVideoViewer(); // Oynani yopish
        if (typeof loadReels === "function") loadReels(); // Ro'yxatni yangilash
    } catch (error) {
        console.error("O'chirishda xatolik:", error);
        alert("Xatolik yuz berdi!");
    }
};

// 4. Like bosish (Firestore ArrayUnion)
window.likeReel = async function(docId) {
    if (!auth.currentUser) {
        alert("Avval tizimga kiring!");
        return;
    }
    const reelRef = doc(db, "reels", docId);
    try {
        await updateDoc(reelRef, {
            likes: arrayUnion(auth.currentUser.uid)
        });
        console.log("Like bosildi!");
    } catch (e) {
        console.error("Like bosishda xato:", e);
    }
};

// 5. Modal boshqaruvlari (Add Reel)
window.openAddReelModal = () => {
    const modal = document.getElementById('add-reel-modal');
    if (modal) modal.style.display = 'flex';
};

window.closeAddReelModal = () => {
    const modal = document.getElementById('add-reel-modal');
    if (modal) modal.style.display = 'none';
};

// 6. Preview (Yuklashdan oldin ko'rish)
window.handleReelFile = function(event) {
    const file = event.target.files[0];
    const preview = document.getElementById('reel-preview');
    const container = document.getElementById('video-preview-container');
    const placeholder = document.getElementById('upload-placeholder');

    if (file) {
        preview.src = URL.createObjectURL(file);
        if (placeholder) placeholder.style.display = 'none';
        if (container) container.style.display = 'block';
        preview.play();
    }
};

// Esc tugmasi bilan yopish
document.addEventListener('keydown', (e) => {
    if (e.key === "Escape") {
        closeVideoViewer();
        closeAddReelModal();
    }
});

// Tugmani ID orqali ushlab olamiz va unga "click" hodisasini beramiz
const sendBtn = document.getElementById('sendBtn');
if (sendBtn) {
    sendBtn.addEventListener('click', (e) => {
        e.preventDefault(); // Sahifa yangilanib ketmasligi uchun
        console.log("EventListener orqali tugma bosildi!");
        sendMainChatMessage();
    });
}

window.openUserProfile = async (uid) => {
    if (!uid || uid === "undefined") return;

    // Sahifa ichidagi bo'limlarni topamiz
    const homeSection = document.getElementById('home-page'); 
    const profileSection = document.getElementById('profile-page'); 

    // Bo'limlarni almashtiramiz (Yangi sahifaga o'tilmaydi!)
    if (homeSection) homeSection.style.display = 'none';
    if (profileSection) {
        profileSection.style.display = 'block';
        
        // Bazadan o'sha foydalanuvchi ma'lumotlarini yuklash
        const userDoc = await getDoc(doc(db, "users", uid));
        if (userDoc.exists()) {
            const userData = userDoc.data();
            document.getElementById('profile-name').innerText = userData.displayName || "Ismsiz";
            // Boshqa elementlarni ham shu yerda yangilang...
        }
    }
};

// Xabarlar render bo'lib bo'lgandan keyin
const chatContainer = document.getElementById('main-chat-messages');
chatContainer.scrollTo({
    top: chatContainer.scrollHeight,
    behavior: 'smooth' // Yumshoq tushish
});

window.closeChat = () => {
    const chatContainer = document.getElementById('active-chat-container');
    if (chatContainer) {
        chatContainer.classList.remove('mobile-active');
    }
    // Listeneryni to'xtatish (ixtiyoriy, xotirani tejash uchun)
    if (currentChatUnsubscribe) currentChatUnsubscribe();
};

// Profil ma'lumotlarini Firestore'dan o'qib, ekranga chiqarish
window.updateProfileDisplay = async () => {
    const user = auth.currentUser;
    if (!user) return;

    try {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists()) {
            const data = userDoc.data();
            
            // HTML elementlarini yangilash (IDlar to'g'ri ekanligini tekshiring)
            if(document.getElementById('user-profile-name')) 
                document.getElementById('user-profile-name').innerText = data.displayName || user.displayName || "Foydalanuvchi";
            
            if(document.getElementById('user-profile-handle')) 
                document.getElementById('user-profile-handle').innerText = data.username ? `@${data.username}` : "@username";
            
            if(document.getElementById('user-profile-bio')) 
                document.getElementById('user-profile-bio').innerText = data.bio || "Hali ma'lumot kiritilmagan";
            
            if(document.getElementById('user-display-age')) 
                document.getElementById('user-display-age').innerText = data.age ? `${data.age} yosh` : "—";
            
            if(document.getElementById('user-display-city')) 
                document.getElementById('user-display-city').innerText = data.city || "—";
            
            if(document.getElementById('user-display-study')) 
                document.getElementById('user-display-study').innerText = data.study || "—";
            
            if(document.getElementById('user-profile-img'))
                document.getElementById('user-profile-img').src = data.photoURL || user.photoURL || 'assets/default-avatar.png';
        }
    } catch (error) {
        console.error("Ma'lumotni yuklashda xato:", error);
    }
};

// main.js yoki script.js faylida
window.openMyProfileModal = () => {
    const modal = document.getElementById('my-profile-edit-modal');
    if (modal) {
        modal.style.display = 'flex';
        // Qolgan to'ldirish kodlari...
    } else {
        console.error("Modal topilmadi!");
    }
};

const profileUpload = document.getElementById('profile-upload');

if (profileUpload) {
    profileUpload.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            const base64Image = event.target.result;

            try {
                const user = auth.currentUser;
                if (!user) return;

                // Firestore-ga saqlash
                const userRef = doc(db, "users", user.uid);
                await updateDoc(userRef, { photoURL: base64Image });

                // Hamma joyda rasm o'zgarishi uchun chaqiramiz
                window.updateAllUserDataUI(base64Image, user.displayName);

                alert("RIVION profilingiz muvaffaqiyatli yangilandi!");
            } catch (error) {
                console.error("Xato:", error);
            }
        };
        reader.readAsDataURL(file);
    });
}

// Saytdagi barcha profil rasmlarini bir vaqtda yangilash funksiyasi
window.refreshAllProfileImages = (newPhotoURL) => {
    // 1. Profil sahifasidagi asosiy rasm
    const mainProfileImg = document.getElementById('user-profile-img');
    if (mainProfileImg) mainProfileImg.src = newPhotoURL;

    // 2. Headerdagi (tepadagi) rasm
    // HTML-da bu rasmga id="header-user-img" bering
    const headerImg = document.getElementById('header-user-img');
    if (headerImg) headerImg.src = newPhotoURL;

    // 3. Drawer (yon menyu) ichidagi rasm
    // HTML-da bu rasmga id="drawer-user-img" bering
    const drawerImg = document.getElementById('drawer-user-img');
    if (drawerImg) drawerImg.src = newPhotoURL;

    // 4. Postlardagi rasmlar (Agar post muallifi siz bo'lsangiz)
    const allPostAvatars = document.querySelectorAll('.post-avatar'); // Klass nomi mosligini tekshiring
    allPostAvatars.forEach(img => {
        // Bu yerda faqat joriy foydalanuvchi postlarini yangilash logikasi bo'lishi mumkin
        // Lekin oddiyroq yo'li - sahifadagi barcha o'zingizga tegishli rasmlarni klass orqali yangilash
    });
};
// Saytdagi barcha rasm va ismlarni bir vaqtda yangilash
window.updateAllUserDataUI = (photoURL, name) => {
    console.log("RIVION UI yangilanmoqda...");

    // 1. Profil sahifasi (Asosiy qism)
    const profileImg = document.getElementById('user-profile-img');
    const profileName = document.getElementById('user-profile-name');
    if (profileImg) profileImg.src = photoURL;
    if (profileName) profileName.innerText = name;

    // 2. Header (Yuqori navigatsiya menyusi)
    const headerAvatar = document.getElementById('userAvatar');
    const headerName = document.getElementById('userNameDisplay');
    if (headerAvatar) headerAvatar.src = photoURL;
    if (headerName) headerName.innerText = name;

    // 3. Post yozish joyi (Siz aytgan "Nima yangiliklar?" qismi)
    // Bu qator `#inputAvatar` elementini darhol yangilaydi
    const inputAvatar = document.getElementById('inputAvatar');
    if (inputAvatar) {
        inputAvatar.src = photoURL;
    }

    // 4. Drawer (Mobil yoki yon menyu avatari)
    const drawerAvatar = document.getElementById('drawerAvatar');
    if (drawerAvatar) drawerAvatar.src = photoURL;

    // 5. POSTLAR RO'YXATIDAGI BARCHA RASMLAR
    // .mini-avatar va .post-author-img klassiga ega barcha rasmlarni topamiz
    const allPostAvatars = document.querySelectorAll('.post-author-img, .mini-avatar');
    allPostAvatars.forEach(img => {
        // Ekrandagi barcha postlaringizda yangi rasm aks etadi
        img.src = photoURL;
    });

    console.log("Barcha profil rasmlari va ismlar muvaffaqiyatli yangilandi!");
};


function calculateAge(birthDateString) {
    if (!birthDateString) return "--";
     
    const today = new Date();
    const birthDate = new Date(birthDateString); // Inputdan kelgan sana
    
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    
    // Agar tug'ilgan oy hali kelmagan bo'lsa yoki oy kelgan-u kun kelmagan bo'lsa, 1 yil ayiramiz
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
    }
    
    return age;
}

// 1. Modalni ochish funksiyasi
function openMyProfileModal() {
    const modal = document.getElementById('my-profile-edit-modal');
    if (modal) {
        modal.style.display = 'flex'; // yoki 'block'
        
        // Modal ochilganda mavjud ma'lumotlarni inputlarga to'ldirish (ixtiyoriy)
        if (currentUserData) {
            document.getElementById('edit-username').value = currentUserData.username || "";
            document.getElementById('edit-display-name').value = currentUserData.displayName || "";
            document.getElementById('edit-age').value = currentUserData.age || "";
            document.getElementById('edit-city').value = currentUserData.city || "";
            document.getElementById('edit-study').value = currentUserData.study || "";
            document.getElementById('edit-bio').value = currentUserData.bio || "";
            document.getElementById('edit-goals').value = currentUserData.goals || "";
            document.getElementById('edit-interests').value = currentUserData.interests || "";
            document.getElementById('edit-travel').value = currentUserData.travel || "";
            document.getElementById('edit-gender').value = currentUserData.gender || "male";
        }
    }
}

// 2. Modalni yopish funksiyasi
function closeMyProfileModal() {
    const modal = document.getElementById('my-profile-edit-modal');
    if (modal) modal.style.display = 'none';
}

async function saveProfileChanges() {
    try {
        console.log("Ma'lumotlarni saqlash boshlandi...");
        
        // Elementlarni olishda xatolik bermaslik uchun yordamchi funksiya
        const getVal = (id) => {
            const el = document.getElementById(id);
            if (!el) {
                console.warn(`Ogohlantirish: '${id}' topilmadi.`);
                return ""; 
            }
            return el.value;
        };

        const btn = document.getElementById('saveProfileBtn');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Yangilanmoqda...';
        }

        // HTML-dagi yangi ID-lar bo'yicha ma'lumotlarni yig'amiz
        const updatedData = {
            username: getVal('edit-username'),
            displayName: getVal('edit-display-name'),
            birthdate: getVal('edit-birthdate'), // 'edit-age' o'rniga
            gender: getVal('edit-gender'),
            city: getVal('edit-city'),
            study: getVal('edit-study'),
            bio: getVal('edit-bio'),
            goals: getVal('edit-goals'),
            interests: getVal('edit-interests'),
            travel: getVal('edit-travel'),
            lastUpdated: new Date()
        };

        if (!currentUser) throw new Error("Foydalanuvchi tizimga kirmagan!");

        // Firestore-ga saqlash
        const userRef = doc(db, "users", currentUser.uid);
        await updateDoc(userRef, updatedData);

        alert("Tabriklaymiz! Shaxsiy dunyongiz muvaffaqiyatli yangilandi.");
        location.reload(); 

    } catch (error) {
        console.error("Saqlashda xatolik:", error);
        alert("Xato yuz berdi: " + error.message);
    } finally {
        const btn = document.getElementById('saveProfileBtn');
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-check-circle"></i> Dunyoni yangilash';
        }
    }
}

async function saveWorldChanges() {
    try {
        // Elementlarni olish (xavfsiz usulda)
        const bioField = document.getElementById('edit-bio');
        const goalsField = document.getElementById('edit-goals');
        const interestsField = document.getElementById('edit-interests');
        const travelField = document.getElementById('edit-travel');

        // Agar birortasi topilmasa, konsolda xabar beradi
        if (!bioField || !goalsField || !interestsField || !travelField) {
            console.error("Xato: Ayrim inputlar topilmadi! ID-larni tekshiring.");
            alert("Tizimda xatolik: Ayrim maydonlar topilmadi.");
            return;
        }

        const btn = document.getElementById('updateWorldBtn');
        if (btn) {
            btn.disabled = true;
            btn.innerText = "Yangilanmoqda...";
        }

        const updatedData = {
            bio: bioField.value,
            goals: goalsField.value,
            interests: interestsField.value,
            travel: travelField.value,
            lastUpdated: new Date()
        };

        // Firestore-ga saqlash
        const userRef = doc(db, "users", currentUser.uid);
        await updateDoc(userRef, updatedData);

        alert("Dunyoqarash muvaffaqiyatli yangilandi!");
        
        // Modalni yopish (agar funksiyangiz bo'lsa)
        if (typeof closeWorldModal === 'function') closeWorldModal();
        
        // Sahifani yangilash
        location.reload();

    } catch (error) {
        console.error("Xatolik yuz berdi:", error);
        alert("Xatolik: " + error.message);
    } finally {
        const btn = document.getElementById('updateWorldBtn');
        if (btn) {
            btn.disabled = false;
            btn.innerText = "Dunyoni yangilash";
        }
    }
}

// Postni render qilish mantiqi (taxminan shunday)
function createPostElement(postData) {
    // Post egasining joriy ma'lumotlarini olish (agar bu siz bo'lsangiz)
    let userPhoto = postData.authorPhotoURL || 'default-avatar.png';
    
    // Agar post sizniki bo'lsa, har doim auth dagi joriy rasmni ko'rsatish
    if (currentUser && postData.authorId === currentUser.uid) {
        userPhoto = currentUser.photoURL || userPhoto;
    }

    const postHTML = `
        <div class="post-card">
            <div class="post-header">
                <img src="${userPhoto}" class="post-author-img">
                <div class="post-meta">
                    <strong>${postData.authorName}</strong>
                    <span>${postData.timestamp}</span>
                </div>
            </div>
            <div class="post-body">
                ${postData.text}
            </div>
        </div>
    `;
    return postHTML;
}
 
 window.renderPost = function(postData) {
    // 1. Ma'lumotlarni olish
    let finalPhoto = postData.authorPhotoURL || 'default-avatar.png';
    const authorName = postData.authorName || 'Foydalanuvchi';
    const authorUsername = postData.authorUsername || 'username';
    const authorId = postData.authorId;

    // 2. O'zimizning rasmimizni yangilash
    if (auth.currentUser && authorId === auth.currentUser.uid) {
        finalPhoto = auth.currentUser.photoURL || finalPhoto;
    }

    // 3. DIQQAT: Agar bosilganda kirmasa, konsolda mana bu xabarni ko'rasiz
    if (!authorId) {
        console.warn("XATO: Postda authorId mavjud emas!", postData);
    }

    return `
        <div class="post-card">
            <div class="post-header">
                <img src="${finalPhoto}" 
                     class="post-author-img" 
                     style="cursor: pointer; position: relative; z-index: 5;" 
                     onclick="viewUserProfile('${authorId}', '${authorName.replace(/'/g, "\\'")}', '${finalPhoto}', '${authorUsername}')">
                <div class="post-info">
                    <strong style="cursor: pointer;" 
                            onclick="viewUserProfile('${authorId}', '${authorName.replace(/'/g, "\\'")}', '${finalPhoto}', '${authorUsername}')">
                        ${authorName}
                    </strong>
                    <span>${postData.date || 'hozir'}</span>
                </div>
            </div>
            <div class="post-content" style="margin-top: 10px;">${postData.text || ''}</div>
        </div>
    `;
}

window.followUser = async (targetUserId) => {
    // 1. ID tekshirish
    if (!targetUserId || targetUserId === "undefined") {
        console.error("Xato: Foydalanuvchi ID-si topilmadi!");
        return;
    }

    const currentUserId = auth.currentUser?.uid;
    if (!currentUserId) {
        alert("Avval tizimga kiring!");
        return;
    }

    if (currentUserId === targetUserId) {
        alert("O'zingizga obuna bo'la olmaysiz!");
        return;
    }

    try {
        const targetUserRef = doc(db, "users", targetUserId);
        const currentUserRef = doc(db, "users", currentUserId);

        // 2. Bazada obunani yangilash
        await updateDoc(currentUserRef, {
            following: arrayUnion(targetUserId)
        });

        await updateDoc(targetUserRef, {
            followers: arrayUnion(currentUserId)
        });

        // 3. BILDIRISHNOMA YUBORISH (Yangi qism)
        const notificationRef = collection(db, "notifications");
        await addDoc(notificationRef, {
            toUid: targetUserId,             // Kimga boradi (obuna bo'lingan odam)
            fromUid: currentUserId,          // Kimdan bordi (siz)
            fromName: auth.currentUser.displayName || "Yangi foydalanuvchi",
            type: "follow",                  // Bildirishnoma turi
            timestamp: serverTimestamp(),    // Yuborilgan vaqti
            read: false                      // O'qilmagan holatda
        });

        alert("Muvaffaqiyatli obuna bo'ldingiz!");
    } catch (error) {
        console.error("Obuna bo'lishda xato:", error);
        alert("Foydalanuvchi ma'lumotlari bazada topilmadi.");
    }
};




async function loadProfile() {
    const urlParams = new URLSearchParams(window.location.search);
    const targetUserId = urlParams.get('id') || auth.currentUser?.uid;

    if (!targetUserId) return;

    try {
        const userDoc = await getDoc(doc(db, "users", targetUserId));
        if (userDoc.exists()) {
            const data = userDoc.data();

            // Elementlar borligini tekshirib, keyin yozamiz (Xatoni oldini oladi)
            const nameEl = document.getElementById('profile-name');
            const actionBtn = document.getElementById('action-button');

            if (nameEl) nameEl.innerText = data.displayName || "Ismsiz foydalanuvchi";
            
            if (actionBtn) {
                if (targetUserId === auth.currentUser.uid) {
                    actionBtn.innerText = "Profilni mukammallashtirish";
                } else {
                    actionBtn.innerText = "Obuna bo'lish";
                    actionBtn.onclick = () => window.followUser(targetUserId);
                }
            }
        }
    } catch (e) {
        console.error("Profilni yuklashda xato:", e);
    }
}



window.loadNotifications = async () => {
    const currentUserId = auth.currentUser?.uid;
    if (!currentUserId) return;

    // 1. O'qilmagan xabarlarni "o'qilgan" (read: true) qilish
    // Bu qizil nuqtani yo'qotish uchun kerak
    const unreadQuery = query(
        collection(db, "notifications"), 
        where("toUid", "==", currentUserId),
        where("read", "==", false)
    );

    try {
        const unreadDocs = await getDocs(unreadQuery);
        if (!unreadDocs.empty) {
            const batch = writeBatch(db);
            unreadDocs.forEach((docSnap) => {
                batch.update(docSnap.ref, { read: true });
            });
            await batch.commit();
        }
    } catch (err) {
        console.error("Xabarlarni yangilashda xato:", err);
    }

    // 2. Bildirishnomalarni ekranga chiqarish (Real-vaqtda)
    const q = query(
        collection(db, "notifications"), 
        where("toUid", "==", currentUserId),
        orderBy("timestamp", "desc")
    );

    onSnapshot(q, (snapshot) => {
        const alertsList = document.getElementById('notifications-list'); 
        if (!alertsList) return;
        
        alertsList.innerHTML = ""; 

        if (snapshot.empty) {
            alertsList.innerHTML = '<p class="empty-msg">Yangi bildirishnomalar mavjud emas.</p>';
            return;
        }

        snapshot.forEach((doc) => {
            const notif = doc.data();
            const div = document.createElement('div');
            div.style = "display: flex; justify-content: space-between; align-items: center; padding: 12px; border-bottom: 1px solid #333; transition: 0.3s;";
            
            div.innerHTML = `
                <p style="margin: 0; color: white; font-size: 14px;">
                    <strong>${notif.fromName}</strong> sizga obuna bo'ldi
                </p>
                <button onclick="window.followUser('${notif.fromUid}')" 
                        style="background: #0084ff; color: white; border: none; padding: 6px 12px; border-radius: 8px; cursor: pointer; font-size: 12px; font-weight: bold;">
                    Qaytarish
                </button>
            `;
            alertsList.appendChild(div);
        });
    });
};

// Menyuni almashtirish funksiyangizda
function showNotifications() {
    // Bo'limlarni ko'rsatish/yashirish kodlari...
    window.loadNotifications(); // Bildirishnomalarni yuklashni boshlash
}

const currentUserId = auth.currentUser?.uid;

if (currentUserId) {
    // Faqat sizga tegishli va hali o'qilmagan xabarlarni filtrlaymiz
    const q = query(
        collection(db, "notifications"), 
        where("toUid", "==", currentUserId),
        where("read", "==", false)
    );

    onSnapshot(q, (snapshot) => {
        const badge = document.getElementById('notification-badge');
        if (badge) {
            // Agar o'qilmagan xabarlar bo'lsa (snapshot bo'sh bo'lmasa) ko'rsatamiz
            if (!snapshot.empty) {
                badge.style.display = 'block';
            } else {
                badge.style.display = 'none';
            }
        }
    });
}

const loadUserProfile = (uid) => {
    // Firestore-dagi 'users' kolleksiyasidan hujjatni kuzatish
    onSnapshot(doc(db, "users", uid), (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            console.log("Ma'lumotlar keldi:", data);

            // HTML elementlarini yangilash
            // ID-lar sizning HTML kodingizdagidek bo'lishi shart
            const followersEl = document.getElementById('followers-count');
            const followingEl = document.getElementById('following-count');
            const postsEl = document.getElementById('post-count');

            if (followersEl) followersEl.innerText = data.followers?.length || 0;
            if (followingEl) followingEl.innerText = data.following?.length || 0;
            if (postsEl) postsEl.innerText = data.postCount || 0;
            
            // Ismni ham bazadan chiqarish
            const nameEl = document.getElementById('profile-name');
            if (nameEl) nameEl.innerText = data.displayName || "Foydalanuvchi";
        } else {
            console.log("Xato: Firestore-da bu UID uchun hujjat topilmadi!");
        }
    });
};

// Foydalanuvchi login bo'lganda funksiyani chaqiramiz
onAuthStateChanged(auth, (user) => {
    if (user) {
        loadUserProfile(user.uid);
    }
});

// Ro'yxatni ko'rsatish funksiyasini shu ko'rinishda yangilang
window.showConnections = async (type) => {
    const modal = document.getElementById('connection-modal');
    const listContainer = document.getElementById('users-list');
    const title = document.getElementById('modal-title');
    
    title.innerText = type === 'followers' ? 'Obunachilar' : 'Obunalar';
    listContainer.innerHTML = '<div style="color: #888; text-align: center; padding: 20px;">Yuklanmoqda...</div>';
    modal.style.display = 'block';

    const userSnap = await getDoc(doc(db, "users", auth.currentUser.uid));
    const ids = userSnap.data()[type] || [];

    if (ids.length === 0) {
        listContainer.innerHTML = '<div style="color: #888; text-align: center; padding: 20px;">Hozircha hech kim yo\'q.</div>';
        return;
    }

    listContainer.innerHTML = ''; // Tozalash
    
    for (const id of ids) {
        const uSnap = await getDoc(doc(db, "users", id));
        if (uSnap.exists()) {
            const userData = uSnap.data();
            // Yangilangan HTML strukturasi:
            listContainer.innerHTML += `
                <div class="user-item">
                    <div class="user-info-side">
                        <i class="fas fa-user-circle"></i>
                        <span class="user-name-text">${userData.displayName || 'Foydalanuvchi'}</span>
                    </div>
                    ${type === 'following' ? 
                        `<button class="unfollow-btn" onclick="unfollowUser('${id}')">O'chirish</button>` 
                        : ''}
                </div>
            `;
        }
    }
};
// Obunani bekor qilish (Unfollow)
window.unfollowUser = async (targetUserId) => {
    if(!confirm("Obunani bekor qilmoqchimisiz?")) return;
    
    const currentUserRef = doc(db, "users", auth.currentUser.uid);
    const targetUserRef = doc(db, "users", targetUserId);

    try {
        await updateDoc(currentUserRef, { following: arrayRemove(targetUserId) });
        await updateDoc(targetUserRef, { followers: arrayRemove(auth.currentUser.uid) });
        
        alert("Obuna bekor qilindi!");
        location.reload(); // Sahifani yangilash
    } catch (e) {
        console.error("Xato:", e);
    }
};



function listenAlerts() {
    const alertsContainer = document.getElementById('alerts-list'); // HTML-dagi id
    const q = query(
        collection(db, "notifications"),
        where("to", "==", auth.currentUser.uid),
        orderBy("timestamp", "desc")
    );

    onSnapshot(q, (snapshot) => {
        alertsContainer.innerHTML = ''; // Tozalash
        snapshot.forEach((doc) => {
            const data = doc.data();
            alertsContainer.innerHTML += `
                <div class="alert-item ${data.read ? '' : 'unread'}">
                    <img src="user-icon.png" class="user-avatar">
                    <div class="alert-info">
                        <strong>${data.fromName}</strong> 
                        ${getMessageByType(data.type)}
                        <span class="alert-time">yozildi</span>
                    </div>
                </div>
            `;
        });
    });
}

function getMessageByType(type) {
    if(type === 'like') return "rasmingizga like bosdi";
    if(type === 'comment') return "izoh qoldirdi";
    if(type === 'follow') return "sizga obuna bo'ldi";
    return "yangi bildirishnoma";
}

// Bildirishnomalarni tinglashni boshlash
if (auth.currentUser) {
    const q = query(
        collection(db, "notifications"),
        where("toUid", "==", auth.currentUser.uid),
        orderBy("createdAt", "desc")
    );

    onSnapshot(q, (snapshot) => {
        const alertsList = document.getElementById('alerts-list'); // ID to'g'riligini tekshiring
        if (!alertsList) return;

        alertsList.innerHTML = "";
        snapshot.forEach((doc) => {
            const data = doc.data();
            alertsList.innerHTML += `
                <div class="alert-item">
                    <img src="${data.fromPhoto || 'default.png'}" style="width:40px; border-radius:50%">
                    <p><strong>${data.fromName}</strong> ${data.type === 'like' ? 'like bosdi' : 'izoh qoldirdi'}</p>
                </div>
            `;
        });
    });
}

// --- 1. RASMNI SAQLASH VA SINXRONIZATSIYA QILISH ---
window.handleProfilePhotoChange = async (event) => {
    const file = event.target.files[0];
    const user = auth.currentUser;
    if (!file || !user) return;

    try {
        console.log("Rasm yuklanmoqda...");
        
        // Storage'ga yuklash
        const storageRef = ref(storage, `profiles/${user.uid}`);
        await uploadBytes(storageRef, file);
        const newUrl = await getDownloadURL(storageRef);

        // Firestore 'users' kolleksiyasini yangilash
        await updateDoc(doc(db, "users", user.uid), { photoURL: newUrl });
        
        // Auth profildagi rasmni yangilash
        await updateProfile(user, { photoURL: newUrl });

        console.log("Profil yangilandi, endi postlarni sinxronlash boshlandi...");

        // --- MUHIM: BARCHA POSTLARDAGI RASMNI YANGILASH ---
        const batch = writeBatch(db);
        
        // a) Foydalanuvchining hamma postlarini topish
        const postsRef = collection(db, "posts");
        const qPosts = query(postsRef, where("authorId", "==", user.uid));
        const postDocs = await getDocs(qPosts);
        
        postDocs.forEach((post) => {
            // Post ichidagi 'authorPhoto'ni yangilang
            batch.update(post.ref, { authorPhoto: newUrl });
        });

        // b) Bildirishnomalardagi (Notifications) rasmni yangilash
        const notifsRef = collection(db, "notifications");
        const qNotifs = query(notifsRef, where("fromUid", "==", user.uid));
        const notifDocs = await getDocs(qNotifs);
        
        notifDocs.forEach((notif) => {
            batch.update(notif.ref, { fromPhoto: newUrl });
        });

        await batch.commit();
        console.log("Hamma joyda rasm yangilandi! ✅");
        
        // Ekranni yangilash
        window.updateProfileDisplay();
        alert("Profil rasmi va barcha postlaringiz yangilandi!");

    } catch (error) {
        console.error("Xato yuz berdi:", error);
    }
};

// --- PROFIL RASMINI O'ZGARTIRISH FUNKSIYASI ---
async function uploadProfileImage(file) {
    const user = auth.currentUser;
    const storageRef = ref(storage, `users/${user.uid}/profile.jpg`);
    
    // 1. Rasmni Storage'ga yuklash
    await uploadBytes(storageRef, file);
    
    // 2. Yangi rasmning URL manzilini olish
    const newUrl = await getDownloadURL(storageRef);

    // 3. Auth profildagi rasmni yangilash
    await updateProfile(user, { photoURL: newUrl });

    // 4. Firestore 'users' kolleksiyasini yangilash
    await updateDoc(doc(db, "users", user.uid), { photoURL: newUrl });

    // 🚀 --- MANA SHU YERGA SIZ SO'RAGAN KODNI QO'YASIZ --- 🚀
    const discoveryRef = collection(db, "discovery");
    const q = query(discoveryRef, where("uid", "==", user.uid));
    const querySnapshot = await getDocs(q);

    const batch = writeBatch(db);
    querySnapshot.forEach((doc) => {
        batch.update(doc.ref, { userPhoto: newUrl }); // Discovery'dagi rasmlarni yangilash
    });
    
    // Agar postlaringiz 'posts' kolleksiyasida bo'lsa, buni ham qo'shing:
    const postsRef = collection(db, "posts");
    const qPosts = query(postsRef, where("authorId", "==", user.uid));
    const postsSnapshot = await getDocs(qPosts);
    postsSnapshot.forEach((doc) => {
        batch.update(doc.ref, { authorPhoto: newUrl }); // Postlardagi rasmlarni yangilash
    });

    await batch.commit(); 
    console.log("Hamma joyda rasm yangilandi!");
    
    location.reload(); // O'zgarishlar ko'rinishi uchun sahifani yangilash
 }

 window.openUserChat = function(uid, name, photo) {
    // 1. Ma'lumotlarni to'ldirish
    document.getElementById('main-chat-user-name').innerText = name;
    document.getElementById('main-chat-user-img').src = photo || 'assets/default-avatar.png';
    
    // 2. Oynalarni almashtirish (Slide effekti)
    const inbox = document.getElementById('chat-inbox-view');
    const conversation = document.getElementById('chat-conversation-view');
    
    inbox.classList.add('is-hidden');
    conversation.classList.add('is-open');
    
    // 3. Xabarlarni yuklashni boshlash
    if(typeof startRivionChat === 'function') {
        startRivionChat(uid);
    }
};




// Inbox ro'yxatini yuklash
function loadMyInbox() {
    const list = document.getElementById('contactsList');
    
    // Faqat siz qatnashgan chatlarni filtrlab olamiz
    const q = query(
        collection(db, "chats"), 
        where("users", "array-contains", currentUser.uid),
        orderBy("lastTimestamp", "desc") // Oxirgi xabar kelganlar tepaga chiqadi
    );

    onSnapshot(q, (snapshot) => {
        list.innerHTML = ""; // Ro'yxatni yangilash
        snapshot.forEach((doc) => {
            const chatData = doc.data();
            // Chatdagi ikkinchi odamning ID-sini topish
            const otherUserId = chatData.users.find(id => id !== currentUser.uid);
            
            // O'sha odamning ism-rasmini olish (users kolleksiyasidan)
            renderInboxItem(otherUserId, chatData.lastMessage);
        });
    });
}



// Bu funksiyani o'chirib turing, u xatolikka sabab bo'lyapti
/* function openChat() {
    const chatWindow = document.getElementById('active-chat-window');
    if (window.innerWidth <= 768) {
        chatWindow.classList.add('active');
    }
}
*/



// BU QATORNI O'CHIRING (agar bo'lsa):
// selectUserForChat(firstUser.id, ...);


// main.js faylining eng oxiriga yoki boshiga, boshqa funksiyalardan tashqariga qo'ying
window.backToInbox = function() {
    console.log("Tugma bosildi!");
    const chatWindow = document.getElementById('active-chat-window');
    const inboxView = document.getElementById('chat-inbox-view');

    if (chatWindow && inboxView) {
        chatWindow.classList.remove('active');
        chatWindow.style.display = 'none';
        inboxView.style.display = 'block';
    } else {
        console.log("Xato: Elementlar topilmadi");
    }
};


function loadRecentChats() {
    const list = document.getElementById('recent-chats-list');
    if (!currentUser || !list) return;

    const q = query(
        collection(db, "chats"),
        where("participants", "array-contains", currentUser.uid),
        orderBy("lastTimestamp", "desc")
    );

    onSnapshot(q, (snapshot) => {
        list.innerHTML = "";
        
        if (snapshot.empty) {
            list.innerHTML = `<p style="color: #ccc; text-align: center; padding: 20px;">Hali xabarlar yo'q</p>`;
            return;
        }

        snapshot.forEach((doc) => {
            const chat = doc.data();
            const otherUserId = chat.participants ? chat.participants.find(id => id !== currentUser.uid) : null;
            
            if (!otherUserId) return;

            const info = (chat.usersInfo && chat.usersInfo[otherUserId]) ? chat.usersInfo[otherUserId] : null;
            const displayName = info ? (info.name || "Suhbatdosh") : "Suhbatdosh";
            const displayPhoto = info && info.photo ? info.photo : `https://ui-avatars.com/api/?name=${displayName}&background=random`;

            // YANGI XABARLARNI TEKSHIRISH
            const unreadCount = (chat.unreadCount && chat.unreadCount[currentUser.uid]) ? chat.unreadCount[currentUser.uid] : 0;
            const hasUnread = unreadCount > 0;

            const item = document.createElement('div');
            // Agar yangi xabar bo'lsa, 'unread-chat' klassini qo'shamiz
            item.className = `contact-item ${hasUnread ? 'unread-chat' : ''}`; 
            
            item.innerHTML = `
                <div class="avatar-wrapper">
                    <img src="${displayPhoto}" onerror="this.src='https://ui-avatars.com/api/?name=U'">
                    ${hasUnread ? `<span class="unread-badge">${unreadCount}</span>` : ''}
                </div>
                <div class="contact-info">
                    <div class="contact-header">
                        <h4>${displayName}</h4>
                        ${hasUnread ? `<span class="new-label">New</span>` : ''}
                    </div>
                    <p style="${hasUnread ? 'font-weight: bold; color: #fff;' : ''}">
                        ${chat.lastMessage || '...'}
                    </p>
                </div>
            `;

            item.onclick = () => {
                // Chat ochilganda unreadCount-ni nolga tushirish (SelectUser funksiyasida qilinadi)
                if (typeof window.selectUserForChat === 'function') {
                    window.selectUserForChat(otherUserId, displayName, displayPhoto);
                }
            };

            list.appendChild(item);
        });
    }, (error) => {
        console.error("Inbox yuklashda xato:", error);
    });
}

window.showSection = function(sectionId) {
    // 1. Hamma bo'limlarni yashirish
    const sections = document.querySelectorAll('.app-section'); // HTML-da bo'limlaringiz klassi 'app-section' ekanligini tekshiring
    sections.forEach(s => s.style.display = 'none');

    // 2. Tanlangan bo'limni ko'rsatish
    const target = document.getElementById(sectionId);
    if (target) {
        target.style.display = 'block';
    }

    // 3. AGAR CHAT OCHILSA - INBOXNI YUKLASH
    if (sectionId === 'chat') {
        console.log("Chat bo'limi ochildi, ro'yxat yangilanmoqda...");
        loadRecentChats(); // Mana shu yerda biz yozgan Inbox funksiyasi chaqiriladi
    }
}

function loadAllUsers() {
    const usersGrid = document.getElementById('all-users-grid');
    
    // Foydalanuvchilar ro'yxatini olish (masalan, birinchi 20 tasini)
    const q = query(collection(db, "users"), limit(20));

    onSnapshot(q, (snapshot) => {
        usersGrid.innerHTML = "";
        snapshot.forEach((doc) => {
            const userData = doc.data();
            
            // O'zimizni ro'yxatda ko'rsatmaslik uchun
            if(auth.currentUser && doc.id === auth.currentUser.uid) return;

            usersGrid.innerHTML += `
                <div class="user-discover-card">
                    <img src="${userData.photoURL || 'assets/default-avatar.png'}" class="discover-avatar">
                    <span class="discover-name">${userData.displayName}</span>
                    
                    <div class="discover-actions">
                        <button class="view-prof-btn" onclick="viewUserProfile('${doc.id}')">Profilni ko'rish</button>
                        <button class="follow-btn-main" onclick="followUser('${doc.id}')">Obuna bo'lish</button>
                    </div>
                </div>
            `;
        });
    });
}

// Sahifa yuklanganda ishga tushirish
loadAllUsers();