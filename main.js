// main.js - RIVION Full Logic
import { auth, db, onAuthStateChanged, signOut } from './firebase-config.js';
import { 
    collection, 
    addDoc, 
    setDoc, 
    getDoc, 
    doc, 
    query, 
    where,       // <--- BUNI QO'SHDIK (Qidiruv uchun shart)
    limit,       // <--- BUNI QO'SHDIK (Natijalarni cheklash uchun)
    orderBy, 
    onSnapshot, 
    getDocs, 
    serverTimestamp,
    updateDoc,
    arrayUnion,
    arrayRemove
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// --- ELEMENTLARNI TANLAB OLISH ---
const burgerBtn = document.getElementById('burgerBtn');
const sideDrawer = document.getElementById('sideDrawer');
const closeDrawer = document.getElementById('closeDrawer');
const themeToggle = document.getElementById('themeToggle');
const postBtn = document.getElementById('postBtn');
const postText = document.getElementById('postText');
const postsList = document.getElementById('postsList');

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
    if (user) {
        updateUserUI(user); 

        try {
            const userRef = doc(db, "users", user.uid);
            const userSnap = await getDoc(userRef);

            if (userSnap.exists()) {
                const userData = userSnap.data();
                const drawerName = document.getElementById('drawerName');
                
                if (drawerName) {
                    // 1. Ism va Verified belgisini tayyorlaymiz
                    // style ichiga display: inline-flex qo'shdik, bu masofani to'g'rilaydi
                    const verifiedTag = userData.isVerified === true 
                        ? `<svg viewBox="0 0 24 24" style="width: 18px; height: 18px; min-width: 18px; flex-shrink: 0; fill: #1d9bf0; margin-left: 5px; vertical-align: middle;"><path d="M22.5 12.5c0-1.58-.88-2.95-2.18-3.66.25-.9.4-1.84.4-2.84 0-3.04-2.46-5.5-5.5-5.5-1 0-1.94.27-2.74.75C11.77 1.03 10.4 0 9.5 0 6.46 0 4 2.46 4 5.5c0 1 .27 1.94.75 2.74C3.53 9.03 2.5 10.4 2.5 12.5c0 1.58.88 2.95 2.18 3.66-.25.9-.4 1.84-.4 2.84 0 3.04 2.46 5.5 5.5 5.5 1 0 1.94-.27 2.74-.75 1.22 1.22 2.58 2.25 3.5 2.25 3.04 0 5.5-2.46 5.5-5.5 0-1-.27-1.94-.75-2.74 1.22-.72 2.18-2.08 2.18-3.66zm-5 0l-5 5-2.5-2.5 1.41-1.41L11.5 13.59l3.59-3.59L17.5 12.5z"/></svg>` 
                        : '';

                    // DrawerName konteynerini tozalab, ism va belgini yopishtirib joylaymiz
                    drawerName.style.display = "block";
                    drawerName.innerHTML = `
                        <div style="display: inline-flex; align-items: center; max-width: 100%; margin-bottom: 4px;">
                            <span style="font-weight: bold; font-size: 16px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                ${user.displayName || "Foydalanuvchi"}
                            </span>
                            ${verifiedTag}
                        </div>
                    `;

                    // 2. Qo'shimcha ma'lumotlar bloki (Joylashuv, yosh, o'qish)
                    let oldExtra = document.getElementById('drawer-extra-info');
                    if (oldExtra) oldExtra.remove();

                    const extraInfo = document.createElement('div');
                    extraInfo.id = 'drawer-extra-info';
                    extraInfo.style.cssText = "font-size: 12px; color: #888; font-weight: normal; line-height: 1.6; margin-top: 2px;";
                    
                    extraInfo.innerHTML = `
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <i class="fas fa-map-marker-alt" style="color: #1d9bf0; width: 14px; text-align: center;"></i> 
                            <span>${userData.city || 'Andijon, Uzbekistan'}</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <i class="fas fa-birthday-cake" style="color: #1d9bf0; width: 14px; text-align: center;"></i> 
                            <span>${userData.age || '19'} yosh</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <i class="fas fa-university" style="color: #1d9bf0; width: 14px; text-align: center;"></i> 
                            <span>${userData.study || 'TATU'}</span>
                        </div>
                    `;
                    
                    drawerName.appendChild(extraInfo);
                }
            }
        } catch (error) {
            console.error("Profil yuklashda xato:", error);
        }
    } else {
        window.location.href = 'index.html';
    }
});

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
        postsList.innerHTML = `<p style="text-align:center; color:var(--text-secondary); margin-top:20px;">Hozircha postlar yo'q...</p>`;
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
                    <span>${data.comments?.length || 0}</span>
                </button>
            </div>
        </div>
    </div>
`;
    });
});

// C. Like bosish funksiyasi (Global window obyektiga ulaymiz)
window.toggleLike = async (postId, currentlyLiked) => {
    const user = auth.currentUser;
    if (!user) return;

    const postRef = doc(db, "posts", postId);
    try {
        if (currentlyLiked) {
            await updateDoc(postRef, { likes: arrayRemove(user.uid) });
        } else {
            await updateDoc(postRef, { likes: arrayUnion(user.uid) });
        }
    } catch (err) {
        console.error("Like xatosi:", err);
    }
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

// Izoh qutisini ochish/yopish
function toggleCommentBox(id) {
    const box = document.getElementById(id); // ID to'g'ri kelayotganiga ishonch hosil qiling
    
    if (box) {
        if (box.style.display === "none" || box.style.display === "") {
            box.style.display = "block";
        } else {
            box.style.display = "none";
        }
    } else {
        console.error("Xato: 'box' topilmadi! ID ni tekshiring.");
    }
}

// Izoh yuborish
window.sendComment = async (postId) => {
    const input = document.getElementById(`input-${postId}`);
    const text = input.value.trim();
    const user = auth.currentUser;

    if (!text || !user) return;

    const postRef = doc(db, "posts", postId);
    try {
        await updateDoc(postRef, {
            comments: arrayUnion({
                uid: user.uid,
                userName: user.displayName,
                text: text,
                createdAt: new Date().toISOString()
            })
        });
        input.value = ""; // Inputni tozalash
    } catch (err) {
        console.error("Izoh qoldirishda xato:", err);
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

// 2. Chatni ochish va xabarlarni yuklash
window.openChat = (peerUid, peerName, peerPhoto) => {
    const user = auth.currentUser;
    currentPeerUid = peerUid;
    currentChatId = getChatId(user.uid, peerUid);

    // UI ni yangilash
    document.getElementById('chat-welcome').style.display = 'none';
    document.getElementById('active-chat').style.display = 'flex';
    document.getElementById('chat-user-name').innerText = peerName;
    document.getElementById('chat-user-img').src = peerPhoto;

    // Xabarlarni real-time eshitish
    const q = query(collection(db, "chats", currentChatId, "messages"), orderBy("timestamp", "asc"));
    onSnapshot(q, (snapshot) => {
        const display = document.getElementById('messages-display');
        display.innerHTML = "";
        snapshot.forEach(doc => {
            const msg = doc.data();
            const isMe = msg.senderId === user.uid;
            display.innerHTML += `
                <div class="msg ${isMe ? 'sent' : 'received'}">
                    ${msg.text}
                </div>
            `;
        });
        display.scrollTop = display.scrollHeight; // Avtomatik pastga tushish
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

// Telefonda orqaga qaytish
window.backToInbox = () => {
    const wrapper = document.getElementById('chatWrapper');
    wrapper.classList.remove('is-chat-open');
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

async function selectUserForChat(userId) {
    if (!userId) return;
    currentActiveChatId = userId;

    const noChatState = document.getElementById('no-chat-selected');
    const activeChatContainer = document.getElementById('active-chat-container');
    const userNameEl = document.getElementById('main-chat-user-name');
    const userImgEl = document.getElementById('main-chat-user-img');

    if (noChatState) noChatState.style.display = 'none';
    if (activeChatContainer) activeChatContainer.style.display = 'flex';

    try {
        const userDoc = await getDoc(doc(db, "users", userId));
        if (userDoc.exists()) {
            const userData = userDoc.data();
            if (userNameEl) userNameEl.innerText = userData.displayName || "RIVION User";

            if (userImgEl) {
                // Rasm manzilini tekshirish
                const photo = (userData.photoURL && userData.photoURL !== "undefined") 
                              ? userData.photoURL 
                              : 'https://ui-avatars.com/api/?name=' + (userData.displayName || 'U');
                
                userImgEl.src = photo;
                
                // Cheksiz loopni to'xtatuvchi xavfsiz onerror
                userImgEl.onerror = function() { 
                    this.onerror = null; 
                    this.src = 'https://ui-avatars.com/api/?background=random&name=R';
                };
            }
        }
    } catch (error) {
        console.error("User yuklashda xato:", error);
    }
    loadMainMessages(userId);
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

// 4. Xabar yuborish funksiyasi
window.sendMainChatMessage = async () => {
    const input = document.getElementById('mainChatInput');
    const text = input.value.trim();
    
    if (!text || !currentActiveChatId) return;

    const currentUid = auth.currentUser.uid;
    const combinedId = currentUid < currentActiveChatId ? `${currentUid}_${currentActiveChatId}` : `${currentActiveChatId}_${currentUid}`;

    input.value = ''; // Inputni darhol tozalash

    try {
        await addDoc(collection(db, "chats", combinedId, "messages"), {
            senderId: currentUid,
            text: text,
            timestamp: serverTimestamp()
        });
        
        // Chat ro'yxatini yangilash (oxirgi xabar vaqti uchun)
        await setDoc(doc(db, "chats", combinedId), {
            lastMessage: text,
            lastUpdate: serverTimestamp(),
            users: [currentUid, currentActiveChatId]
        }, { merge: true });

    } catch (e) {
        console.error("Yuborishda xato:", e);
    }
};

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