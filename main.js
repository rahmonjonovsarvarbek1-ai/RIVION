// 1. Supabase-ni brauzer tushunadigan formatda import qilamiz
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

// 2. Firebase va o'zingizning konfiguratsiyangiz
import { auth, db, onAuthStateChanged, signOut, supabase } from './firebase-config.js'; 

// 3. Firestore modullari - deleteDoc qo'shildi!
import { 
    collection, 
    addDoc, 
    setDoc, 
    getDoc, 
    doc, 
    deleteDoc, // <--- Shuni qo'shing
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

// --- 3. FOYDALANUVCHI HOLATINI TEKSHIRISH ---
onAuthStateChanged(auth, async (user) => {
    if (user && user.uid) { 
        updateUserUI(user); 

        // 1. PROFIL MA'LUMOTLARINI YUKLASH
        try {
            const userRef = doc(db, "users", user.uid);
            const userSnap = await getDoc(userRef);

            if (userSnap.exists()) {
                const userData = userSnap.data();
                const drawerName = document.getElementById('drawerName');
                
                if (drawerName) {
                    const verifiedTag = userData.isVerified === true 
                        ? `<svg viewBox="0 0 24 24" style="width: 18px; height: 18px; fill: #1d9bf0; margin-left: 5px; vertical-align: middle;"><path d="M22.5 12.5c0-1.58-.88-2.95-2.18-3.66.25-.9.4-1.84.4-2.84 0-3.04-2.46-5.5-5.5-5.5-1 0-1.94.27-2.74.75C11.77 1.03 10.4 0 9.5 0 6.46 0 4 2.46 4 5.5c0 1 .27 1.94.75 2.74C3.53 9.03 2.5 10.4 2.5 12.5c0 1.58.88 2.95 2.18 3.66-.25.9-.4 1.84-.4 2.84 0 3.04 2.46 5.5 5.5 5.5 1 0 1.94-.27 2.74-.75 1.22 1.22 2.58 2.25 3.5 2.25 3.04 0 5.5-2.46 5.5-5.5 0-1-.27-1.94-.75-2.74 1.22-.72 2.18-2.08 2.18-3.66zm-5 0l-5 5-2.5-2.5 1.41-1.41L11.5 13.59l3.59-3.59L17.5 12.5z"/></svg>` 
                        : '';

                    drawerName.style.display = "block";
                    drawerName.innerHTML = `
                        <div style="display: inline-flex; align-items: center; max-width: 100%; margin-bottom: 4px;">
                            <span style="font-weight: bold; font-size: 16px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                ${user.displayName || "Foydalanuvchi"}
                            </span>
                            ${verifiedTag}
                        </div>
                    `;

                    let oldExtra = document.getElementById('drawer-extra-info');
                    if (oldExtra) oldExtra.remove();

                    const extraInfo = document.createElement('div');
                    extraInfo.id = 'drawer-extra-info';
                    extraInfo.style.cssText = "font-size: 12px; color: #888; margin-top: 2px;";
                    extraInfo.innerHTML = `
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <i class="fas fa-map-marker-alt" style="color: #1d9bf0; width: 14px;"></i> 
                            <span>${userData.city || 'Tashkent, Uzbekistan'}</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <i class="fas fa-birthday-cake" style="color: #1d9bf0; width: 14px;"></i> 
                            <span>${userData.age || '19'} yosh</span>
                        </div>
                    `;
                    drawerName.appendChild(extraInfo);
                }
            }
        } catch (error) {
            console.error("Profil yuklashda xato:", error);
        }

        // --- YANGI QISM: QIZIL NUQTA (BADGE) MANTIQI ---
        const badge = document.getElementById("notification-badge");
        if (badge) {
            // Faqat o'qilmagan bildirishnomalarni kuzatish
            const qBadge = query(
                collection(db, "notifications"),
                where("toUid", "==", user.uid),
                where("isRead", "==", false)
            );

            onSnapshot(qBadge, (snapshot) => {
                // Agar kamida bitta o'qilmagan xabar bo'lsa, nuqtani ko'rsatamiz
                badge.style.display = snapshot.empty ? "none" : "block";
            });
        }

        // --- 2. BILDIRISHNOMALARNI ESHITISH (XAVFSIZ VARIANT) ---
        const notifyList = document.getElementById("notifications-list");
        
        if (notifyList && user.uid) {
            try {
   
                const qNotify = query(
                    collection(db, "notifications"), 
                    where("toUid", "==", user.uid), 
                    orderBy("createdAt", "desc"),
                    limit(20)
                );

                onSnapshot(qNotify, (snapshot) => {
                    notifyList.innerHTML = "";
                    if (snapshot.empty) {
                        notifyList.innerHTML = '<p style="text-align:center; color:#555; padding:20px;">Hozircha bildirishnomalar yo\'q.</p>';
                        return;
                    }

                    snapshot.forEach((doc) => {
                        const n = doc.data();
                        const text = n.type === "like" ? "postingizga like bosdi" : "izoh qoldirdi";
                        
   
                        const userImg = (n.fromPhoto && n.fromPhoto !== 'undefined' && n.fromPhoto !== "") 
                            ? n.fromPhoto 
                            : `https://ui-avatars.com/api/?name=${n.fromName}&background=random`;
                        
                        notifyList.innerHTML += `
                            <div style="display: flex; gap: 10px; padding: 12px; border-bottom: 1px solid #1a1a1a; align-items: center;">
                                <img src="${userImg}" style="width: 35px; height: 35px; border-radius: 50%; object-fit: cover;">
                                <div>
                                    <p style="margin:0; font-size: 13px; color: white;"><b>${n.fromName}</b> ${text}</p>
                                    <small style="color: #555;">${n.createdAt ? new Date(n.createdAt.seconds * 1000).toLocaleTimeString() : 'Hozirgina'}</small>
                                </div>
                            </div>`;
                    });
                }, (err) => {
                    console.error("Bildirishnomalarni olishda xato:", err);
                });
            } catch (qErr) {
                console.error("Query yaratishda xato:", qErr);
            }
        }

    } else {
   
        if (window.location.pathname.includes('main.html')) {
            window.location.href = 'index.html';
        }
    }
});


window.openChat = (uid, name, photo) => {
    const container = document.getElementById('active-chat-container');
    const img = document.getElementById('main-chat-user-img');

    if (container) {
        container.style.display = 'flex';
        if (window.innerWidth <= 768) {
            container.classList.add('mobile-active');
        }
    }

    // Ismni yozish
    document.getElementById('main-chat-user-name').innerText = name;

    // Rasm xatosini tuzatish
    if (img) {
        // Agar photo haqiqatda mavjud bo'lsa uni qo'y, aks holda harf-avatar ishlat
        if (photo && photo !== 'undefined' && photo !== 'null') {
            img.src = photo;
        } else {
            // Rasm bo'lmasa ismidan rasm yasab beradigan servis
            img.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random&color=fff`;
        }
    }
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
    if (!text) return alert("Oldin nimadir yozing!");

    try {
        postBtn.disabled = true;
        await addDoc(collection(db, "posts"), {
            authorName: auth.currentUser.displayName,
            authorPhoto: auth.currentUser.photoURL,
            content: text,
            createdAt: serverTimestamp(),
            uid: auth.currentUser.uid,
            likes: [] // Like'lar ro'yxati (bo'sh massiv)
        });
        postText.value = ""; 
    } catch (error) {
        console.error("Xato:", error);
    } finally {
        postBtn.disabled = false;
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
        const time = data.createdAt ? new Date(data.createdAt.seconds * 1000).toLocaleString() : "Hozirgina";
        
        // Foydalanuvchi like bosganmi yoki yo'q?
        const isLiked = data.likes?.includes(auth.currentUser?.uid);

        postsList.innerHTML += `
            <div class="post-card horizontal-post">
                <img src="${data.authorPhoto || 'https://via.placeholder.com/40'}" class="post-avatar-large">
                
                <div class="post-content-area">
                    <div class="post-header-mini">
                        <span class="post-author">${data.authorName}</span>
                        <span class="post-time">${time}</span>
                    </div>
                    
                    <div class="post-body-mini">
                        <p>${data.content}</p>
                    </div>
                    
                    <div class="post-footer-mini">
                        <button onclick="toggleLike('${postId}', ${isLiked})" class="mini-action-btn ${isLiked ? 'active-like' : ''}">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="${isLiked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
                            <span>${data.likes?.length || 0}</span>
                        </button>
                        
                        <button class="mini-action-btn" onclick="toggleCommentBox('${postId}')">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>
                            <span>${data.commentsCount || (data.comments ? data.comments.length : 0)}</span>
                        </button>
                    </div>

                    <div id="comment-box-${postId}" class="comment-section-mini" style="display: none; border-top: 1px solid #222; margin-top: 10px; padding-top: 10px;">
                        <div id="comments-display-${postId}" style="max-height: 150px; overflow-y: auto; margin-bottom: 10px;">
                        </div>
                        
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
    if (!user) return;

    const postRef = doc(db, "posts", postId);
    try {
   
     if (currentlyLiked) {
            await updateDoc(postRef, { likes: arrayRemove(user.uid) });
        } else {
            // Like qo'shildi
            await updateDoc(postRef, { likes: arrayUnion(user.uid) });

            // BILDIRISHNOMA YUBORISH (Faqat boshqa odam bo'lsa)
            if (authorId && authorId !== user.uid) {
                await sendNotification(authorId, "like", postText || "Sizning postingiz");
            }
        }
    } catch (err) {
        console.error("Like xatosi:", err);
  
    }
};

window.addComment = async (postId, authorId, postText) => {
    const user = auth.currentUser;
    if (!user) return;

    const input = document.getElementById(`comment-input-${postId}`);
   
    const text = input.value.trim();
    if (text === "") return;

    try {
   
        const commentRef = collection(db, "posts", postId, "comments");
        await addDoc(commentRef, {
            text: text,
            uid: user.uid,
            name: user.displayName || "Foydalanuvchi",
            img: user.photoURL || "",
            time: serverTimestamp()
        });

        // BILDIRISHNOMA YUBORISH
        if (authorId && authorId !== user.uid) {
            await sendNotification(authorId, "comment", text);
        }

        input.value = "";
    } catch (err) {
        console.error("Izoh xatosi:", err);
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

// Funksiyani window obyektiga biriktiramiz
window.toggleCommentBox = (postId) => {
    const box = document.getElementById(`comment-box-${postId}`);
    
    if (box.style.display === "none") {
        box.style.display = "block";
        
        // Postni ekranning o'rtasiga silliq olib kelish
        box.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        // Kommentariyalarni yuklash
        if (window.loadComments) window.loadComments(postId);
    } else {
        box.style.display = "none";
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

// Bildirishnomalarni yuklash va ko'rsatish funksiyasi
window.loadNotifications = () => {
    const notifContainer = document.getElementById('notifications-list'); // HTMLdagi id ga qarang
    
    onSnapshot(collection(db, "notifications"), (snapshot) => {
        notifContainer.innerHTML = "";
        
        snapshot.forEach((doc) => {
            const notif = doc.data();
            const notifId = doc.id;

            // FAQAT funksiya ichida ishlatiladi:
            if (notif.type === "interest" && notif.status === "pending") {
                const notifHTML = `
                    <div class="notification-item">
                        <img src="${notif.fromPhoto}" class="notif-avatar">
                        <div class="notif-text">
                            <p><strong>${notif.fromName}</strong> siz bilan tanishishga qiziqish bildirdi</p>
                            <div class="notif-actions">
                                <button onclick="acceptInterest('${notifId}', '${notif.fromUid}')" class="agree-btn">Agree ✅</button>
                                <button class="ignore-btn">Rad etish</button>
                            </div>
                        </div>
                    </div>
                `;
                notifContainer.innerHTML += notifHTML;
            }
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
                        👋 Qiziqish bildirish
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

// Feedni chiqarish (Har doim o'zinikida ham tugma chiqishi uchun)
onSnapshot(query(collection(db, "discovery"), orderBy("createdAt", "desc")), (snapshot) => {
    const discoveryFeed = document.getElementById('discovery-feed');
    discoveryFeed.innerHTML = "";
    snapshot.forEach((doc) => {
        const data = doc.data();
        discoveryFeed.innerHTML += `
            <div class="discovery-card horizontal-post">
                <img src="${data.userPhoto}" class="discovery-avatar">
                <div class="post-content-area">
                    <span class="user-name">${data.userName}</span>
                    <p class="discovery-bio">${data.bio}</p>
                    <button onclick="sendInterest('${data.uid}', '${data.userName}')" class="interest-btn">
                        👋 Qiziqish bildirish
                    </button>
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

    // Rasmni o'qish (Base64 ko'rinishida saqlash - boshlanishiga)
    const reader = new FileReader();
    reader.readAsDataURL(fileInput.files[0]);
    reader.onload = async () => {
        try {
            await addDoc(collection(db, "discovery"), {
                uid: user.uid,
                userName: user.displayName,
                userPhoto: user.photoURL,
                postImage: reader.result, // Asosiy post rasmi
                bio: bio,
                createdAt: serverTimestamp()
            });
            
            closeDiscoveryModal();
            btn.disabled = false;
            btn.innerText = "E'lonni joylash";
        } catch (err) {
            console.error(err);
            btn.disabled = false;
        }
    };
};

onSnapshot(query(collection(db, "discovery"), orderBy("createdAt", "desc")), (snapshot) => {
    const feed = document.getElementById('discovery-feed');
    feed.className = "discovery-list"; // Grid klassini qo'shamiz
    feed.innerHTML = "";
    
    snapshot.forEach((doc) => {
        const data = doc.data();
        feed.innerHTML += `
            <div class="network-post">
                <div class="post-user-info">
                    <img src="${data.userPhoto}" style="width:20px; height:20px; border-radius:50%;">
                    <span>${data.userName}</span>
                </div>
                
                <img src="${data.postImage}" class="post-main-img">
                
                <div class="post-details">
                    <p class="post-caption">${data.bio}</p>
                    
                    <button onclick="sendInterest('${data.uid}', '${data.userName}')" class="network-action-btn">
                        👋 Qiziqish bildirish
                    </button>
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

    // Faqat joriy foydalanuvchiga tegishli bildirishnomalarni filtrlash
    const myNotifs = snapshot.docs.filter(doc => doc.data().toUid === user.uid);

    if (myNotifs.length === 0) {
        notifList.innerHTML = '<p class="empty-msg">Yangi bildirishnomalar mavjud emas.</p>';
        return;
    }

    notifList.innerHTML = ""; // Tozalash

    myNotifs.forEach((doc) => {
        const notif = doc.data();
        const notifId = doc.id;

        const notifHTML = `
            <div class="notification-item ${notif.status === 'accepted' ? 'accepted' : ''}">
                <div class="notif-user">
                    <img src="${notif.fromPhoto}" class="notif-avatar">
                    <div class="notif-info">
                        <p><strong>${notif.fromName}</strong> siz bilan tanishmoqchi.</p>
                        <span class="notif-time">${notif.createdAt?.toDate().toLocaleTimeString() || 'Hozir'}</span>
                    </div>
                </div>
                ${notif.status === 'pending' ? `
                    <div class="notif-actions">
                        <button onclick="acceptInterest('${notifId}', '${notif.fromUid}')" class="agree-btn">Do'st bo'lasizmi? ✅</button>
                    </div>
                ` : `<span class="status-tag">Do'stlar qatoriga qo'shildi</span>`}
            </div>
        `;
        notifList.innerHTML += notifHTML;
    });
});

let currentChatId = null;
let currentPeerUid = null;

// Chat xonasi ID sini yaratish (Har doim bir xil chiqishi uchun)
const getChatId = (uid1, uid2) => [uid1, uid2].sort().join('_');

// 1. Xabar yuborish
window.sendMessage = async () => {
    const text = document.getElementById('messageInput').value.trim();
    const user = auth.currentUser;
    if (!text || !currentChatId) return;

    try {
        await addDoc(collection(db, "chats", currentChatId, "messages"), {
            senderId: user.uid,
            text: text,
            timestamp: serverTimestamp()
        });
        document.getElementById('messageInput').value = "";
    } catch (err) { console.error(err); }
};

window.openChat = (peerUid, peerName, peerPhoto) => {
    // 1. Bo'limlarni ko'rsatish/yashirish
    document.getElementById('no-chat-selected').style.display = 'none';
    document.getElementById('active-chat-container').style.display = 'block';

    // 2. Foydalanuvchi ma'lumotlarini tepaga o'rnatish
    document.getElementById('main-chat-user-name').innerText = peerName;
    document.getElementById('main-chat-user-img').src = peerPhoto || 'default-avatar.png';

    // 3. Global o'zgaruvchilarni yangilash
    currentPeerUid = peerUid; 
    currentChatId = getChatId(auth.currentUser.uid, peerUid);

    // 4. Xabarlarni ko'rsatish (main-chat-messages diviga)
    const q = query(collection(db, "chats", currentChatId, "messages"), orderBy("timestamp", "asc"));
    onSnapshot(q, (snapshot) => {
        const display = document.getElementById('main-chat-messages');
        display.innerHTML = "";
        snapshot.forEach(doc => {
            const msg = doc.data();
            const isMe = msg.senderId === auth.currentUser.uid;
            display.innerHTML += `
                <div class="message ${isMe ? 'sent' : 'received'}">
                    <div class="bubble">${msg.text}</div>
                </div>`;
        });
        display.scrollTop = display.scrollHeight;
    });
};

// Suhbatdoshlar ro'yxatini (Inbox) yuklash
function loadInbox() {
    const user = auth.currentUser;
    if (!user) return;

    // "chats" kolleksiyasidan siz ishtirok etgan xonalarni qidirish
    const q = query(collection(db, "chats"), where("participants", "array-contains", user.uid));

    onSnapshot(q, (snapshot) => {
        const inbox = document.getElementById('inbox-list');
        if (!inbox) return; // Element mavjudligini tekshirish
        
        inbox.innerHTML = "";
        
        if (snapshot.empty) {
            // DIQQAT: Bu yerda o'zbekcha tutuq belgisi o'rniga &apos; ishlating yoki orqa qo'shtirnoq `
            inbox.innerHTML = `<div class="chat-placeholder-mini"><p>Suhbatlar yo'q</p></div>`;
            return;
        }

        snapshot.forEach(doc => {
            const chatData = doc.data();
            
            // usersInfo mavjudligini tekshirish (xato bermasligi uchun)
            if (chatData.usersInfo) {
                const peerInfo = chatData.usersInfo.find(u => u.uid !== user.uid);

                if (peerInfo) {
                    inbox.innerHTML += `
                        <div class="inbox-item" onclick="openFullChat('${doc.id}', '${peerInfo.name}', '${peerInfo.photo}')">
                            <img src="${peerInfo.photo}" class="nav-avatar">
                            <div class="inbox-meta">
                                <strong>${peerInfo.name}</strong>
                                <p style="font-size: 0.7rem; color: gray;">Suhbatni ko'rish</p>
                            </div>
                        </div>
                    `;
                }
            }
        });
    });
}

// Chatni ochish (Lichka bosilganda yoki Inbox'dan tanlanganda)
window.openFullChat = (roomId, name, photo) => {
    const wrapper = document.getElementById('chatWrapper');
    const noChat = document.getElementById('no-chat-selected');
    const activeChat = document.getElementById('active-chat-container');

    // Mobile'da sidebar-ni yopib, chatni ko'rsatish
    wrapper.classList.add('is-chat-open');

    // UI yangilash
    noChat.style.display = 'none';
    activeChat.style.display = 'flex';
    document.getElementById('main-chat-user-name').innerText = name;
    document.getElementById('main-chat-user-img').src = photo;

    // Firebase'dan xabarlarni yuklash (Avvalgi kodingiz kabi)
    loadMessages(roomId); 
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

// 2. Profilni Modalda ochish
window.viewUserProfile = (userId, name, photo, username) => {
    // Ma'lumotlarni to'ldirish
    document.getElementById('p-modal-name').innerText = name;
    document.getElementById('p-modal-username').innerText = "@" + username;
    document.getElementById('p-modal-img').src = photo || 'default-avatar.png';

    // TUGMALARNI JONLANTIRISH (Eng muhim joyi!)
    const actionsBox = document.querySelector('.profile-actions-box');
    actionsBox.innerHTML = `
        <button onclick="handleChatFromProfile('${userId}')" class="btn-chat">
            <i class="fas fa-comment"></i> Chatga o'tish
        </button>
        <button onclick="handleFriendRequest('${userId}')" class="btn-friend" id="friendBtn">
            <i class="fas fa-user-plus"></i> Do'st bo'lish
        </button>
        <button onclick="handleBlockUser('${userId}')" class="btn-block">
            <i class="fas fa-ban"></i> Bloklash
        </button>
    `;

    document.getElementById('user-profile-modal').style.display = 'block';
};

window.handleChatFromProfile = (userId) => {
    if (!userId) return;

    // Elementlar borligini tekshirib olamiz
    const home = document.getElementById('home-section');
    const chat = document.getElementById('chat-section');

    if (home && chat) {
        home.style.display = 'none';
        chat.style.display = 'block';
        console.log("Chat ochildi:", userId);
        // loadDirectChat(userId); // Bu funksiya bo'lsa chaqiring
    } else {
        // Agar bu xato chiqsa, demak HTML-da id'lar noto'g'ri qo'yilgan
        console.error("Xato: 'home-section' yoki 'chat-section' ID-li elementlar topilmadi!");
        alert("Xatolik: Sahifa tuzilishi noto'g'ri. Iltimos, HTML-ni tekshiring.");
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

    const saveBtn = document.getElementById('saveProfileBtn');
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerText = "Saqlanmoqda...";
    }

    try {
        const userRef = doc(db, "users", user.uid);
        
        // Ma'lumotlarni yig'ish
        const updatedData = {
            username: document.getElementById('edit-username').value.trim().toLowerCase(),
            displayName: document.getElementById('edit-display-name').value.trim(),
            age: document.getElementById('edit-age').value || "",
            city: document.getElementById('edit-city').value.trim() || "",
            study: document.getElementById('edit-study').value.trim() || "",
            bio: document.getElementById('edit-bio').value.trim() || "",
            lastUpdate: serverTimestamp()
        };

        // MUHIM: updateDoc o'rniga setDoc ishlatamiz (merge: true bilan)
        // Bu hujjat bo'lmasa yaratadi, bo'lsa faqat berilgan maydonlarni yangilaydi
        await setDoc(userRef, updatedData, { merge: true });
        
        alert("Profil muvaffaqiyatli saqlandi!");
        closeMyProfileModal();
        
    } catch (error) {
        console.error("Saqlashda xatolik:", error);
        alert("Xatolik: " + error.message);
    } finally {
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerText = "O'zgarishlarni saqlash";
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

// 1. Profil modalidan chatni ochish
window.handleChatFromProfile = async (userId) => {
    if (!userId) return;

    // UI-ni almashtirish
    const home = document.getElementById('home-section');
    const chat = document.getElementById('chat-section');
    const modal = document.getElementById('user-profile-modal');

    if (home && chat) {
        home.style.display = 'none';
        chat.style.display = 'block';
        if (modal) modal.style.display = 'none'; // Modalni yopish

        // Foydalanuvchini tanlash va yuklash
        selectUserForChat(userId);
    }
};

// 1. Chatga kirish
async function selectUserForChat(userId) {
    if (!userId) return;
    currentActiveChatId = userId;

    const chatWindow = document.getElementById('chatWindow');
    const sidebar = document.getElementById('chatSidebar');
    const noChat = document.getElementById('no-chat-selected');
    const activeContainer = document.getElementById('active-chat-container');

    if (window.innerWidth <= 768) {
        chatWindow.classList.add('active');
        sidebar.style.display = 'none';
    }

    noChat.style.display = 'none';
    activeContainer.style.display = 'flex';

    // Foydalanuvchi ma'lumotlarini yuklash (Firebase)
    // Bu yerda getDoc funksiyangizni ishlating...
    loadMainMessages(userId);
}

// 2. Orqaga qaytish (Instagram uslubida)
function backToSidebar() {
    const chatWindow = document.getElementById('chatWindow');
    const sidebar = document.getElementById('chatSidebar');

    chatWindow.classList.remove('active');
    if (window.innerWidth <= 768) {
        chatWindow.style.display = 'none';
        sidebar.style.display = 'flex';
    }
}



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

window.sendMainChatMessage = () => {
    const input = document.getElementById('mainChatInput');
    const message = input.value.trim();
    
    if (message !== "") {
        console.log("Xabar yuborilmoqda:", message);
        // Bu yerda Firebase'ga yuborish kodi bo'ladi
        input.value = ""; // Xabar ketgach inputni tozalash
    }
};

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

// Chat ro'yxatidagi biror kishini bosganda
function openChat() {
    if (window.innerWidth <= 768) {
        const messageWindow = document.querySelector('.message-window');
        messageWindow.classList.add('active'); // Oynani butun ekranga ochadi
    }
}

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

// 1. Kontaktlarni qidirish
document.getElementById('searchContact').addEventListener('input', async (e) => {
    const term = e.target.value.toLowerCase();
    const list = document.getElementById('contactsList');
    
    if (term.length > 0) {
        const q = query(collection(db, "users"), where("displayName", ">=", term));
        const snap = await getDocs(q);
        list.innerHTML = "";
        snap.forEach(doc => {
            const user = doc.data();
            renderContact(user);
        });
    } else {
        loadMyChats(); // Qidiruv bo'sh bo'lsa, eski chatlarni qaytarish
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

// 4. Xabarlarni real-time eshitish
function loadMessages(chatId) {
    const q = query(collection(db, "chats", chatId, "messages"), orderBy("timestamp", "asc"));
    onSnapshot(q, (snapshot) => {
        const box = document.getElementById('main-chat-messages');
        box.innerHTML = "";
        snapshot.forEach(doc => {
            const m = doc.data();
            const type = m.senderId === auth.currentUser.uid ? 'sent' : 'received';
            box.innerHTML += `<div class="message ${type}">${m.text}</div>`;
        });
        box.scrollTop = box.scrollHeight;
    });
}

// 5. Xabar yuborish
window.sendMainChatMessage = async () => {
    const input = document.getElementById('mainChatInput');
    if (input.value.trim() && currentChatId) {
        await addDoc(collection(db, "chats", currentChatId, "messages"), {
            text: input.value,
            senderId: auth.currentUser.uid,
            timestamp: serverTimestamp()
        });
        input.value = "";
    }
};

window.openChat = (uid, name, photo) => {
    console.log("Chat ochilmoqda:", name); // Konsolda tekshirish uchun

    // 1. Elementlarni o'zgaruvchiga olish
    const noChat = document.getElementById('no-chat-selected');
    const activeChat = document.getElementById('active-chat-container');
    const chatName = document.getElementById('main-chat-user-name');
    const chatImg = document.getElementById('main-chat-user-img');

    // 2. Bloklarni ko'rsatish va yashirish
    if (noChat) noChat.style.setProperty('display', 'none', 'important');
    if (activeChat) activeChat.style.setProperty('display', 'flex', 'important');

    // 3. Ma'lumotlarni yozish
    if (chatName) chatName.innerText = name;
    if (chatImg) chatImg.src = photo || 'assets/default-avatar.png';

    // 4. Mobil versiya uchun sidebar-ni yopish (agar kerak bo'lsa)
    if (window.innerWidth < 768) {
        const sidebar = document.getElementById('chatSidebar');
        if (sidebar) sidebar.style.display = 'none';
    }
};

// Bildirishnoma yuborish funksiyasi
async function sendNotification(targetUserId, type, postContent) {
    if (targetUserId === auth.currentUser.uid) return; // O'ziga o'zi bildirishnoma bormaydi

    try {
        await addDoc(collection(db, "notifications"), {
            toUid: targetUserId,      // Kimga borishi kerak
            fromUid: auth.currentUser.uid,
            fromName: auth.currentUser.displayName || "Foydalanuvchi",
            fromPhoto: auth.currentUser.photoURL || "",
            type: type,               // "like" yoki "comment"
            postText: postContent.substring(0, 30) + "...", // Postning qisqa matni
            isRead: false,            // Yangi bildirishnoma ekanligi
            createdAt: serverTimestamp()
        });
    } catch (e) {
        console.error("Notification xatosi:", e);
    }
}

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