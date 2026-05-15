// ============================================================
// RIVION — main.js (v2.1 — Cheksizlik muammolari to'liq tuzatildi)
// Muallif: Sarvarbek Rahmonjonov
// ============================================================

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { auth, db, onAuthStateChanged } from './firebase-config.js';
import {
    collection, addDoc, setDoc, getDoc, doc, deleteDoc,
    query, where, limit, orderBy, onSnapshot, getDocs,
    serverTimestamp, updateDoc, arrayUnion, arrayRemove,
    increment, writeBatch
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { updateProfile, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// ============================================================
// 🔧 FIX #1 — GLOBAL IMAGE ERROR (Cheksiz loop oldini olish)
// Muammo: onerror handler o'zi ham error bersa loop yuzaga keladi
// Yechim: onerror null qilishdan oldin yagona fallback ishlatish
// ============================================================
const DEFAULT_AVATAR_BASE = 'https://ui-avatars.com/api/?background=1a1a35&color=4f8fff&size=100&bold=true&name=';

function getFallbackAvatar(name) {
    return `${DEFAULT_AVATAR_BASE}${encodeURIComponent(name || 'User')}`;
}

// Global img error handler — faqat bir marta ishga tushadi
document.addEventListener('error', function(e) {
    if (e.target.tagName !== 'IMG') return;
    // FIX: data-fallback-set atributi orqali ikkinchi marta loop bo'lmaydi
    if (e.target.getAttribute('data-fallback-set') === 'true') return;
    e.target.setAttribute('data-fallback-set', 'true');
    e.target.onerror = null;
    e.target.src = getFallbackAvatar(e.target.getAttribute('data-name') || 'User');
}, true);

// ============================================================
// 🔧 FIX #2 — setSafeImage (Loop-xavfsiz versiya)
// Muammo: onerror ichida onerror o'rnatilishi rekursiyaga olib keladi
// Yechim: bir marta fallback, keyin null qilish
// ============================================================
function setSafeImage(imgEl, photoURL, displayName) {
    if (!imgEl) return;
    // Har safar data-fallback-set ni tozalash — yangi url uchun
    imgEl.removeAttribute('data-fallback-set');
    imgEl.setAttribute('data-name', displayName || 'User');

    const fallback = getFallbackAvatar(displayName);
    imgEl.onerror = function() {
        this.onerror = null; // Loop to'xtatish
        this.setAttribute('data-fallback-set', 'true');
        this.src = fallback;
    };

    const isValid = photoURL &&
        typeof photoURL === 'string' &&
        photoURL.trim() !== '' &&
        photoURL !== 'null' &&
        photoURL !== 'undefined';

    imgEl.src = isValid ? photoURL : fallback;
}

// ============================================================
// 🔧 FIX #3 — LISTENER MANAGEMENT (Stack bo'lishni oldini olish)
// Muammo: onSnapshot har chaqirilganda yangi listener qo'shiladi
// Yechim: markazlashtirilgan unsubscribe boshqaruvi
// ============================================================
const listeners = {
    posts: null,
    recentChats: null,
    myPosts: null,
    discovery: null,
    notifications: null,
    unreadBadge: null,

    // Listener o'rnatish — avvalgisini tozalash bilan
    set(key, unsubFn) {
        if (this[key]) {
            try { this[key](); } catch(e) { /* silent */ }
        }
        this[key] = unsubFn;
    },

    // Barcha listenerlarni tozalash
    clearAll() {
        ['posts','recentChats','myPosts','discovery','notifications','unreadBadge'].forEach(k => {
            if (this[k]) {
                try { this[k](); } catch(e) { /* silent */ }
                this[k] = null;
            }
        });
    }
};

// ============================================================
// GLOBAL O'ZGARUVCHILAR
// ============================================================
let currentUser = null;
let currentUserData = null;
window.selectedUserId = null;
window.selectedUserName = null;
window.selectedUserPhoto = null;
let currentChatUnsubscribe = null;
let isSendingMessage = false;

// ============================================================
// YORDAMCHI FUNKSIYALAR
// ============================================================
function getChatId(uid1, uid2) {
    return uid1 < uid2 ? `${uid1}_${uid2}` : `${uid2}_${uid1}`;
}

function formatTime(timestamp) {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp.seconds * 1000);
    return `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function formatTimeAgo(date) {
    if (!date) return '';
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 60) return 'hozir';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m avval`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}s avval`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}k avval`;
    return date.toLocaleDateString('uz-UZ');
}

function calculateAge(birthDateString) {
    if (!birthDateString) return '';
    const today = new Date();
    const birth = new Date(birthDateString);
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    return age;
}

// ============================================================
// 🔧 FIX #4 — TOAST (Cheksiz toast loop oldini olish)
// Muammo: showToast bir vaqtda ko'p marta chaqirilsa to'lib ketadi
// Yechim: maksimal 5 ta toast, throttle
// ============================================================
const toastQueue = new Set();

function showToast(message, type = 'info') {
    // Bir xil xabar uchun dublikat oldini olish
    if (toastQueue.has(message)) return;
    toastQueue.add(message);

    const container = document.getElementById('toastContainer');
    if (!container) return;

    // Maksimal 5 ta toast
    const existing = container.querySelectorAll('.toast');
    if (existing.length >= 5) {
        existing[0].remove();
    }

    const icons = { success: 'fa-check-circle', error: 'fa-times-circle', info: 'fa-info-circle', warning: 'fa-exclamation-circle' };
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <i class="fas ${icons[type] || icons.info} toast-icon"></i>
        <span>${message}</span>
        <button class="toast-close" onclick="this.parentElement.remove()">×</button>`;

    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('removing');
        setTimeout(() => { toast.remove(); toastQueue.delete(message); }, 300);
    }, 3000);
}

// ============================================================
// BO'LIM NAVIGATSIYASI
// ============================================================
window.showSection = function(sectionId) {
    document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
    const target = document.getElementById(`${sectionId}-section`);
    if (target) target.classList.add('active');

    document.querySelectorAll('.side-menu li, .m-nav-item').forEach(i => {
        i.classList.toggle('active', i.getAttribute('data-section') === sectionId);
    });

    // Maxsus yuklamalar — faqat bir marta
    const loaders = {
        chat:          () => loadRecentChats(),
        notifications: () => window.loadNotifications?.(),
        explore:       () => loadAllUsers(),
        reels:         () => loadReels(),
        meetings:      () => loadDiscoveryFeed(),
        profile:       () => window.updateProfileDisplay?.(),
        bookmarks:     () => loadBookmarks(),
    };
    loaders[sectionId]?.();
};

// ============================================================
// DRAWER (Yon menyu)
// ============================================================
const burgerBtn = document.getElementById('burgerBtn');
const sideDrawerEl = document.getElementById('sideDrawer');
const closeDrawerBtn = document.getElementById('closeDrawer');
const drawerOverlay = document.getElementById('drawerOverlay');

function openDrawer() {
    sideDrawerEl?.classList.add('open');
    drawerOverlay?.classList.add('visible');
    burgerBtn?.setAttribute('aria-expanded', 'true');
}

function closeDrawer() {
    sideDrawerEl?.classList.remove('open');
    drawerOverlay?.classList.remove('visible');
    burgerBtn?.setAttribute('aria-expanded', 'false');
}

window.closeDrawer = closeDrawer;
burgerBtn?.addEventListener('click', openDrawer);
closeDrawerBtn?.addEventListener('click', closeDrawer);
drawerOverlay?.addEventListener('click', closeDrawer);

// Navigatsiya
document.querySelectorAll('.side-menu li[data-section], .m-nav-item[data-section]').forEach(item => {
    item.addEventListener('click', () => {
        const section = item.getAttribute('data-section');
        if (section) { window.showSection(section); closeDrawer(); }
    });
});

// ============================================================
// THEME TOGGLE
// ============================================================
const themeToggle = document.getElementById('themeToggle');

function applyTheme(theme) {
    const isLight = theme === 'light';
    document.documentElement.setAttribute('data-theme', theme);
    document.body.classList.toggle('dark-mode', !isLight);
    document.body.classList.toggle('light-mode', isLight);
    const icon = document.getElementById('themeIcon');
    const label = document.getElementById('themeLabel');
    if (icon) icon.className = isLight ? 'fas fa-sun' : 'fas fa-moon';
    if (label) label.textContent = isLight ? 'Rejim: Yorqin' : 'Rejim: Qora';
}

themeToggle?.addEventListener('click', () => {
    const newTheme = document.body.classList.contains('light-mode') ? 'dark' : 'light';
    applyTheme(newTheme);
    localStorage.setItem('rivion_theme', newTheme);
});

applyTheme(localStorage.getItem('rivion_theme') || 'dark');

// ============================================================
// GLOBAL SEARCH (⌘K)
// ============================================================
const globalSearchInput = document.getElementById('globalSearchInput');

// 🔧 FIX: debounce — har keystroke'da query o'rniga 400ms kutish
let searchDebounceTimer = null;
globalSearchInput?.addEventListener('input', (e) => {
    clearTimeout(searchDebounceTimer);
    const val = e.target.value.trim();
    if (val.length < 2) return;
    searchDebounceTimer = setTimeout(() => {
        window.showSection('explore');
        const exploreSearch = document.getElementById('exploreSearch');
        if (exploreSearch) { exploreSearch.value = val; searchExplore(val); }
    }, 400);
});

document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        globalSearchInput?.focus();
    }
});

// ============================================================
// AUTH
// ============================================================
onAuthStateChanged(auth, async (user) => {
    if (user?.uid) {
        // 🔧 FIX: Avvalgi listenerlarni tozalamasdan qayta o'rnatmaslik
        if (currentUser?.uid === user.uid) return;

        currentUser = user;

        try {
            const userRef = doc(db, 'users', user.uid);
            const userSnap = await getDoc(userRef);

            if (userSnap.exists()) {
                const userData = userSnap.data();
                currentUserData = userData;

                const finalPhoto = userData.photoURL || getFallbackAvatar(userData.displayName);
                const finalName = userData.displayName || user.displayName || 'Foydalanuvchi';

                updateAllAvatars(finalPhoto, finalName);
                updateAllNames(finalName, userData.username);
                renderProfileSection(userData, user);
                setupUnreadBadge();
                loadRecentChats();
                loadAllUsers();

                // Drawer
                setSafeImage(document.getElementById('drawerAvatar'), finalPhoto, finalName);
                const dn = document.getElementById('drawerName');
                const dh = document.getElementById('drawerHandle');
                if (dn) dn.textContent = finalName;
                if (dh) dh.textContent = userData.username ? `@${userData.username}` : '@username';

            } else {
                // Yangi foydalanuvchi
                await setDoc(userRef, {
                    uid: user.uid,
                    displayName: user.displayName || 'Yangi Foydalanuvchi',
                    photoURL: user.photoURL || '',
                    email: user.email,
                    createdAt: serverTimestamp(),
                    username: '', age: '', city: '', study: '', bio: '',
                    goals: '', interests: '', travel: '', gender: 'male',
                    followers: [], following: []
                });
                window.showSection('profile');
                window.openMyProfileModal?.();
            }
        } catch (error) {
            console.error('Profil yuklashda xato:', error);
        }
    } else {
        currentUser = null;
        listeners.clearAll();
        const path = window.location.pathname;
        if (path.includes('main.html') || path === '/') {
            window.location.href = 'index.html';
        }
    }
});

function updateAllAvatars(photoURL, name) {
    ['userAvatar', 'drawerAvatar', 'inputAvatar', 'user-profile-img',
     'storyMyAvatar', 'mobileProfileAvatar'].forEach(id => {
        const el = document.getElementById(id);
        if (el) setSafeImage(el, photoURL, name);
    });
}

function updateAllNames(name, username) {
    const el = document.getElementById('userNameDisplay');
    if (el) el.textContent = name || 'Foydalanuvchi';
}

function renderProfileSection(userData, user) {
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

    const genderIcon =
        userData.gender === 'male'   ? '♂' :
        userData.gender === 'female' ? '♀' : '';

    const nameEl = document.getElementById('user-profile-name');
    if (nameEl) nameEl.textContent = `${userData.displayName || user.displayName || 'Foydalanuvchi'} ${genderIcon}`;

    set('user-profile-handle',   userData.username ? `@${userData.username}` : '@username');
    set('user-profile-bio',      userData.bio      || 'Hali bio kiritilmagan...');
    set('user-display-age',      userData.age      ? `${userData.age} yosh` : '-- yosh');
    set('user-display-city',     userData.city     || 'Shahar');
    set('user-display-study',    userData.study    || "Ish/O'qish");
    set('user-display-goals',    userData.goals    || "Katta maqsadlar sari yo'lda...");
    set('user-display-interests',userData.interests|| 'Coding, Design, Art');
    set('user-display-travel',   userData.travel   || 'Yangi ufqlarni zabt etishni yoqtiradi');

    // Chips
    if (userData.age)   document.getElementById('profileAgeChip')?.style.setProperty('display', 'inline-flex');
    if (userData.city)  document.getElementById('profileCityChip')?.style.setProperty('display', 'inline-flex');
    if (userData.study) document.getElementById('profileStudyChip')?.style.setProperty('display', 'inline-flex');

    // Badges
    if (userData.isVerified) document.getElementById('verifiedBadge')?.style.setProperty('display', 'inline-flex');
    if (userData.isPremium)  document.getElementById('premiumBadge')?.style.setProperty('display', 'inline-flex');

    // Stats
    set('followers-count', userData.followers?.length || 0);
    set('following-count', userData.following?.length || 0);

    // Post count
    getDocs(query(collection(db, 'posts'), where('uid', '==', user.uid))).then(snap => {
        const c1 = document.getElementById('profilePostCount');
        const c2 = document.getElementById('post-count');
        if (c1) { const s = c1.querySelector('strong'); if (s) s.textContent = snap.size; }
        if (c2) c2.textContent = snap.size;
    });

    loadMyPosts(user.uid);

    // Cover agar saqlangan bo'lsa
    if (userData.coverURL) {
        const cover = document.getElementById('profileCover');
        if (cover) cover.style.backgroundImage = `url(${userData.coverURL})`;
    }
}

// ============================================================
// 🔧 FIX #5 — UNREAD BADGE (Dublikat listener bo'lmaslik)
// ============================================================
function setupUnreadBadge() {
    if (!currentUser) return;

    const q = query(
        collection(db, 'notifications'),
        where('toUid', '==', currentUser.uid),
        where('isRead', '==', false)
    );

    listeners.set('unreadBadge', onSnapshot(q, snap => {
        const count = snap.size;
        const show = count > 0;
        const dot      = document.getElementById('navNotifDot');
        const mobDot   = document.getElementById('notification-badge');
        const sideBadge = document.getElementById('sidebarNotifBadge');

        if (dot)       dot.style.display       = show ? 'block' : 'none';
        if (mobDot)    mobDot.style.display     = show ? 'block' : 'none';
        if (sideBadge) {
            sideBadge.textContent    = show ? count : '';
            sideBadge.style.display  = show ? 'inline-flex' : 'none';
        }
    }));
}

// Chiqish
document.getElementById('logoutBtnDrawer')?.addEventListener('click', () => {
    if (!confirm("Chiqmoqchimisiz?")) return;
    listeners.clearAll();
    signOut(auth).then(() => { window.location.href = 'index.html'; }).catch(console.error);
});

// ============================================================
// POST COMPOSER
// ============================================================
const postText  = document.getElementById('postText');
const postBtn   = document.getElementById('postBtn');
const imageInput = document.getElementById('imageInput');

postText?.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = `${this.scrollHeight}px`;
    if (postBtn) postBtn.disabled = this.value.trim().length === 0;
});

imageInput?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    // 🔧 FIX: FileReader loop oldini olish — faqat bir marta onload
    const reader = new FileReader();
    reader.onload = (ev) => {
        const area = document.getElementById('mediaPreviewArea');
        const img  = document.getElementById('mediaPreviewImg');
        if (img)  { img.src = ev.target.result; img.style.display = 'block'; }
        if (area) area.style.display = 'block';
    };
    reader.onerror = () => showToast("Rasmni o'qishda xatolik!", 'error');
    reader.readAsDataURL(file);
});

window.removePostMedia = function() {
    const area = document.getElementById('mediaPreviewArea');
    const img  = document.getElementById('mediaPreviewImg');
    if (area) area.style.display = 'none';
    if (img)  { img.src = ''; img.style.display = 'none'; }
    if (imageInput) imageInput.value = '';
};

window.openEmojiPicker = function() {
    const picker = document.getElementById('emojiPickerPopup');
    if (picker) picker.style.display = picker.style.display === 'none' ? 'block' : 'none';
};

window.selectFeeling = function(feeling) {
    const tag = document.getElementById('postFeelingTag');
    const row = document.getElementById('postContextRow');
    if (tag) { tag.textContent = feeling; tag.style.display = 'inline-flex'; }
    if (row) row.style.display = 'flex';
    const p = document.getElementById('emojiPickerPopup');
    if (p) p.style.display = 'none';
};

window.openLocationPicker = function() {
    const location = prompt('Joylashuvingizni kiriting:');
    if (!location) return;
    const tag = document.getElementById('postLocationTag');
    const row = document.getElementById('postContextRow');
    if (tag) { tag.textContent = `📍 ${location}`; tag.style.display = 'inline-flex'; }
    if (row) row.style.display = 'flex';
};

window.openPollCreator  = function() { const p = document.getElementById('pollCreator'); if (p) p.style.display = p.style.display === 'none' ? 'block' : 'none'; };
window.closePollCreator = function() { const p = document.getElementById('pollCreator'); if (p) p.style.display = 'none'; };

// 🔧 FIX: Post yuborish — dublikat click oldini olish
let isPosting = false;

postBtn?.addEventListener('click', async () => {
    if (isPosting) return;
    const text = postText?.value.trim();
    if (!text || !currentUser) return;

    isPosting = true;
    postBtn.disabled = true;
    postBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

    try {
        const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
        const ud = userDoc.exists() ? userDoc.data() : {};
        const finalPhoto = ud.photoURL || getFallbackAvatar(currentUser.displayName);
        const finalName  = ud.displayName || currentUser.displayName || 'Foydalanuvchi';

        const previewImg = document.getElementById('mediaPreviewImg');
        const imageData  = (previewImg?.src && previewImg.style.display !== 'none') ? previewImg.src : null;
        const privacy    = document.getElementById('postPrivacy')?.value || 'public';

        await addDoc(collection(db, 'posts'), {
            authorName:  finalName,
            authorPhoto: finalPhoto,
            uid:         currentUser.uid,
            content:     text,
            mediaURL:    imageData,
            privacy,
            likes:       [],
            commentsCount: 0,
            createdAt:   serverTimestamp()
        });

        postText.value = '';
        postText.style.height = 'auto';
        window.removePostMedia();
        ['postContextRow','postLocationTag','postFeelingTag'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });
        showToast('Post muvaffaqiyatli ulashildi! 🎉', 'success');

    } catch (error) {
        console.error('Post yuborishda xato:', error);
        showToast('Xatolik yuz berdi!', 'error');
    } finally {
        isPosting = false;
        postBtn.disabled = false;
        postBtn.innerHTML = '<i class="fas fa-paper-plane"></i><span>Ulashish</span>';
    }
});

// ============================================================
// FEED TABS
// ============================================================
let currentFeed = 'forYou';

document.querySelectorAll('.feed-tab[data-feed]').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.feed-tab[data-feed]').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        currentFeed = tab.getAttribute('data-feed');
        loadPosts(currentFeed);
    });
});

// ============================================================
// 🔧 FIX #6 — POSTLARNI YUKLASH (Listener stack muammosi)
// Muammo: har tab bosishda yangi onSnapshot qo'shiladi
// Yechim: listeners.set orqali avvalgisini o'chirish
// ============================================================
function loadPosts(feedType = 'forYou') {
    const postsList = document.getElementById('postsList');
    if (!postsList) return;

    postsList.innerHTML = `<div class="empty-state"><div class="loading-spinner"></div></div>`;

    const q = query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(30));

    listeners.set('posts', onSnapshot(q, (snapshot) => {
        if (snapshot.empty) {
            postsList.innerHTML = `<div class="empty-state"><div class="empty-icon"><i class="fas fa-wind"></i></div><p>Hali postlar yo'q</p></div>`;
            return;
        }
        postsList.innerHTML = '';
        snapshot.forEach(postDoc => {
            postsList.appendChild(createPostCard(postDoc.data(), postDoc.id));
        });
    }, (error) => {
        console.error('Posts listener xatosi:', error);
        postsList.innerHTML = `<div class="empty-state"><div class="empty-icon"><i class="fas fa-exclamation-circle"></i></div><p>Yuklab bo'lmadi</p></div>`;
    }));
}

function createPostCard(data, postId) {
    const authorId      = data.uid || data.authorId;
    const time          = data.createdAt ? formatTimeAgo(data.createdAt.toDate()) : 'Hozirgina';
    const isLiked       = data.likes?.includes(currentUser?.uid);
    const likesCount    = data.likes?.length || 0;
    const commentsCount = data.commentsCount || 0;
    const isMyPost      = currentUser && authorId === currentUser.uid;
    const authorName    = data.authorName || 'Foydalanuvchi';
    const authorPhoto   = data.authorPhoto || getFallbackAvatar(authorName);

    const card = document.createElement('div');
    card.className = 'post-card glass-card';
    card.dataset.postId = postId;

    card.innerHTML = `
        <div class="post-header">
            <div style="display:flex;align-items:center;gap:10px;">
                <img src="${authorPhoto}"
                     data-name="${authorName}"
                     style="width:40px;height:40px;border-radius:50%;object-fit:cover;cursor:pointer;flex-shrink:0;"
                     onclick="viewUserProfile('${authorId}')">
                <div>
                    <span style="font-weight:600;cursor:pointer;font-size:0.9rem;"
                          onclick="viewUserProfile('${authorId}')">${authorName}</span>
                    <span style="display:block;font-size:0.75rem;color:var(--text-muted);">${time}</span>
                </div>
            </div>
            <div style="display:flex;align-items:center;gap:8px;">
                ${!isMyPost ? `<button onclick="followUser('${authorId}')"
                    style="background:var(--accent-dim);border:1px solid rgba(79,143,255,0.3);color:var(--accent);
                    padding:5px 12px;border-radius:20px;font-size:0.78rem;cursor:pointer;">Obuna</button>` : ''}
                ${isMyPost  ? `<button onclick="deletePost('${postId}')"
                    style="background:none;border:none;color:var(--text-muted);cursor:pointer;padding:6px;">
                    <i class="fas fa-trash-alt"></i></button>` : ''}
            </div>
        </div>

        <div style="padding:10px 0;">
            <p style="margin:0;line-height:1.6;font-size:0.93rem;">${escapeHTML(data.content || '')}</p>
            ${data.mediaURL ? `<img src="${data.mediaURL}" data-name="Post"
                style="width:100%;border-radius:12px;margin-top:10px;max-height:400px;object-fit:cover;cursor:pointer;"
                onclick="openImageLightbox(this.src)">` : ''}
        </div>

        <div style="display:flex;gap:4px;padding-top:10px;border-top:1px solid var(--border);">
            <button onclick="toggleLike('${postId}',${isLiked},'${authorId}')"
                style="display:flex;align-items:center;gap:6px;background:none;border:none;
                cursor:pointer;color:${isLiked ? 'var(--danger)' : 'var(--text-muted)'};font-size:0.88rem;padding:6px 10px;border-radius:8px;"
                id="like-btn-${postId}">
                <i class="${isLiked ? 'fas' : 'far'} fa-heart"></i>
                <span id="likes-count-${postId}">${likesCount}</span>
            </button>
            <button onclick="toggleCommentBox('${postId}')"
                style="display:flex;align-items:center;gap:6px;background:none;border:none;
                cursor:pointer;color:var(--text-muted);font-size:0.88rem;padding:6px 10px;border-radius:8px;">
                <i class="far fa-comment"></i>
                <span id="comments-count-${postId}">${commentsCount}</span>
            </button>
            <button onclick="bookmarkPost('${postId}')"
                style="display:flex;align-items:center;gap:6px;background:none;border:none;
                cursor:pointer;color:var(--text-muted);font-size:0.88rem;padding:6px 10px;border-radius:8px;margin-left:auto;"
                id="bookmark-btn-${postId}">
                <i class="far fa-bookmark"></i>
            </button>
        </div>

        <div id="comment-box-${postId}" style="display:none;margin-top:10px;padding-top:10px;border-top:1px solid var(--border);">
            <div id="comments-display-${postId}" style="max-height:200px;overflow-y:auto;margin-bottom:10px;"></div>
            <div style="display:flex;gap:8px;background:var(--bg-input);padding:6px 12px;border-radius:20px;border:1px solid var(--border);">
                <input type="text" id="comment-input-${postId}" placeholder="Fikr yozing..."
                    style="flex:1;background:none;border:none;color:inherit;outline:none;font-size:0.87rem;">
                <button onclick="sendComment('${postId}','${authorId}')"
                    style="background:none;border:none;cursor:pointer;color:var(--accent);">
                    <i class="fas fa-paper-plane"></i>
                </button>
            </div>
        </div>`;

    return card;
}

// XSS oldini olish
function escapeHTML(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Lightbox
window.openImageLightbox = function(src) {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position:fixed;inset:0;background:rgba(0,0,0,0.92);z-index:9999;
        display:flex;align-items:center;justify-content:center;cursor:zoom-out;`;
    overlay.innerHTML = `<img src="${src}" style="max-width:90vw;max-height:90vh;border-radius:12px;object-fit:contain;">`;
    overlay.onclick = () => overlay.remove();
    document.body.appendChild(overlay);
};

// ============================================================
// LIKE
// ============================================================
// 🔧 FIX: like spam oldini olish — cooldown
const likeThrottle = new Set();

window.toggleLike = async (postId, currentlyLiked, authorId) => {
    if (!currentUser) return showToast('Avval tizimga kiring!', 'error');
    if (likeThrottle.has(postId)) return;

    likeThrottle.add(postId);
    setTimeout(() => likeThrottle.delete(postId), 1000);

    const postRef = doc(db, 'posts', postId);
    try {
        if (currentlyLiked) {
            await updateDoc(postRef, { likes: arrayRemove(currentUser.uid) });
        } else {
            await updateDoc(postRef, { likes: arrayUnion(currentUser.uid) });
            if (authorId && authorId !== 'undefined' && authorId !== currentUser.uid) {
                await window.sendNotification(authorId, 'like', '');
            }
        }
    } catch (err) {
        console.error('Like xatosi:', err);
    }
};

// ============================================================
// COMMENTS
// ============================================================
// 🔧 FIX: comment listener — har ochilganda yangi listener o'rnatmaslik
const commentListeners = {};

window.toggleCommentBox = (postId) => {
    const box = document.getElementById(`comment-box-${postId}`);
    if (!box) return;
    const isOpen = box.style.display !== 'none';
    box.style.display = isOpen ? 'none' : 'block';
    if (!isOpen && !commentListeners[postId]) {
        loadComments(postId);
    }
};

window.loadComments = function loadComments(postId) {
    // Avvalgi listener bor bo'lsa yangi o'rnatma
    if (commentListeners[postId]) return;

    const display = document.getElementById(`comments-display-${postId}`);
    if (!display) return;

    const q = query(collection(db, 'posts', postId, 'comments'), orderBy('createdAt', 'asc'));
    commentListeners[postId] = onSnapshot(q, (snapshot) => {
        display.innerHTML = '';
        snapshot.forEach(docSnap => {
            const c = docSnap.data();
            const img = c.userPhoto || getFallbackAvatar(c.userName);
            const div = document.createElement('div');
            div.style.cssText = 'display:flex;gap:8px;margin-bottom:8px;align-items:flex-start;';
            div.innerHTML = `
                <img src="${img}" data-name="${c.userName || 'U'}"
                    style="width:28px;height:28px;border-radius:50%;object-fit:cover;flex-shrink:0;">
                <div style="background:var(--bg-hover);padding:6px 14px;border-radius:16px;font-size:0.85rem;max-width:85%;">
                    <b style="color:var(--accent);display:block;font-size:0.75rem;margin-bottom:2px;">${escapeHTML(c.userName || 'User')}</b>
                    <span>${escapeHTML(c.text || '')}</span>
                </div>`;
            display.appendChild(div);
        });
        display.scrollTop = display.scrollHeight;
    });
};

window.sendComment = async (postId, authorId) => {
    const input = document.getElementById(`comment-input-${postId}`);
    if (!input) return;
    const text = input.value.trim();
    if (!text || !currentUser) return;
    input.value = '';

    try {
        const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
        const finalPhoto = userDoc.exists() ? (userDoc.data().photoURL || '') : '';

        await addDoc(collection(db, 'posts', postId, 'comments'), {
            text,
            uid: currentUser.uid,
            userName:  currentUser.displayName || 'Foydalanuvchi',
            userPhoto: finalPhoto,
            createdAt: serverTimestamp()
        });
        await updateDoc(doc(db, 'posts', postId), { commentsCount: increment(1) });

        if (authorId && authorId !== 'undefined' && authorId !== currentUser.uid) {
            await window.sendNotification(authorId, 'comment', text);
        }
    } catch (e) {
        console.error('Izoh yuborishda xato:', e);
    }
};

// ============================================================
// POST O'CHIRISH / BOOKMARK
// ============================================================
window.deletePost = async (postId) => {
    if (!confirm("Bu postni o'chirishni xohlaysizmi?")) return;
    try {
        await deleteDoc(doc(db, 'posts', postId));
        showToast("Post o'chirildi", 'success');
    } catch (e) { console.error(e); }
};

window.bookmarkPost = async (postId) => {
    if (!currentUser) return showToast('Avval tizimga kiring!', 'error');
    try {
        const postSnap = await getDoc(doc(db, 'posts', postId));
        if (!postSnap.exists()) return;
        await setDoc(doc(db, 'users', currentUser.uid, 'bookmarks', postId), {
            ...postSnap.data(),
            savedAt: serverTimestamp()
        });
        const btn = document.getElementById(`bookmark-btn-${postId}`);
        if (btn) btn.innerHTML = '<i class="fas fa-bookmark" style="color:var(--accent);"></i>';
        showToast('Saqlandi! 🔖', 'success');
    } catch (e) { console.error(e); }
};

// ============================================================
// BILDIRISHNOMALAR
// ============================================================
window.sendNotification = async function(targetUserId, type, postText = '') {
    if (!targetUserId || targetUserId === 'undefined' || targetUserId === currentUser?.uid) return;
    try {
        await addDoc(collection(db, 'notifications'), {
            toUid:     targetUserId,
            fromUid:   currentUser.uid,
            fromName:  currentUser.displayName || 'Foydalanuvchi',
            fromPhoto: currentUser.photoURL    || '',
            type, postText,
            isRead:    false,
            createdAt: serverTimestamp()
        });
    } catch (e) { console.error('Bildirishnoma xatosi:', e); }
};

window.loadNotifications = function() {
    if (!currentUser) return;
    const notifList = document.getElementById('notifications-list');
    if (!notifList) return;

    const q = query(
        collection(db, 'notifications'),
        where('toUid', '==', currentUser.uid),
        orderBy('createdAt', 'desc'),
        limit(30)
    );

    listeners.set('notifications', onSnapshot(q, (snapshot) => {
        notifList.innerHTML = '';
        if (snapshot.empty) {
            notifList.innerHTML = `<div class="empty-state"><div class="empty-icon"><i class="fas fa-bell-slash"></i></div><p>Yangi bildirishnomalar yo'q</p></div>`;
            return;
        }
        snapshot.forEach(docSnap => {
            const n = docSnap.data();
            const typeMap = { like: 'postingizga like bosdi', comment: 'izoh qoldirdi', follow: 'sizga obuna bo\'ldi', interest: 'qiziqish bildirdi' };
            const typeText = typeMap[n.type] || 'bildirishnoma';
            const img = n.fromPhoto || getFallbackAvatar(n.fromName);

            const item = document.createElement('div');
            item.className = `notif-item ${!n.isRead ? 'unread' : ''}`;
            item.innerHTML = `
                <div class="notif-avatar">
                    <img src="${img}" data-name="${n.fromName || 'U'}"
                         style="width:42px;height:42px;border-radius:50%;object-fit:cover;">
                </div>
                <div class="notif-text">
                    <strong>${escapeHTML(n.fromName || 'Kimdir')}</strong> ${typeText}
                    ${n.postText ? `<br><small>"${escapeHTML(n.postText.substring(0, 60))}"</small>` : ''}
                </div>
                <span class="notif-time">${n.createdAt ? formatTimeAgo(n.createdAt.toDate()) : 'hozir'}</span>`;
            notifList.appendChild(item);
        });
    }));

    // O'qilmagan — batch update
    markNotifsRead();
};

async function markNotifsRead() {
    if (!currentUser) return;
    try {
        const snap = await getDocs(query(
            collection(db, 'notifications'),
            where('toUid', '==', currentUser.uid),
            where('isRead', '==', false)
        ));
        if (snap.empty) return;
        const batch = writeBatch(db);
        snap.forEach(d => batch.update(d.ref, { isRead: true }));
        await batch.commit();
    } catch (e) { console.error(e); }
}

window.markAllNotifRead = async () => {
    await markNotifsRead();
    showToast("Barchasi o'qildi deb belgilandi", 'success');
};

document.querySelectorAll('.notif-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.notif-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
    });
});

// ============================================================
// CHAT
// ============================================================
window.backToInbox = function() {
    const cw = document.getElementById('active-chat-window');
    const iv = document.getElementById('chat-inbox-view');
    if (cw) { cw.style.display = 'none'; cw.classList.remove('active'); }
    if (iv) { iv.style.display = 'flex'; iv.classList.add('active'); }
    // Chat listenerini to'xtatish
    if (currentChatUnsubscribe) { currentChatUnsubscribe(); currentChatUnsubscribe = null; }
};

window.openNewChat = function() {
    const term = prompt('Foydalanuvchi nomi:');
    if (!term) return;
    const input = document.getElementById('searchContact');
    if (input) { input.value = term; input.dispatchEvent(new Event('input')); }
};

window.selectUserForChat = async function(userId, userName, userPhoto) {
    if (!userId || userId === 'null' || userId === 'undefined') return;

    // Ismni tekshirish: agar userName bo'sh bo'lsa, eski saqlangan ismni yoki 'Foydalanuvchi'ni oladi
    const finalName = userName && userName !== 'undefined' ? userName : 'Foydalanuvchi';
    
    window.selectedUserId   = userId;
    window.selectedUserName = finalName;
    window.selectedUserPhoto = (userPhoto && userPhoto !== 'null' && userPhoto !== 'undefined')
        ? userPhoto
        : getFallbackAvatar(finalName);

    // Interfeysni yangilash
    const cw = document.getElementById('active-chat-window');
    const iv = document.getElementById('chat-inbox-view');
    if (cw) { cw.style.display = 'flex'; cw.classList.add('active'); }
    if (iv) iv.style.display = 'none';

    const nameEl = document.getElementById('main-chat-user-name');
    const imgEl  = document.getElementById('main-chat-user-img');
    
    if (nameEl) nameEl.textContent = finalName; // Ismni darhol chiqarish
    if (imgEl)  setSafeImage(imgEl, window.selectedUserPhoto, finalName);

    const statusEl = document.getElementById('chatStatusText');
    if (statusEl) statusEl.textContent = 'online';

    // Firestore statusini yangilash (boyagi ishlaydigan qism)
    try {
        const chatId = [currentUser.uid, userId].sort().join('_');
        const chatRef = doc(db, 'chats', chatId);
        await updateDoc(chatRef, {
            [`unreadCount.${currentUser.uid}`]: 0
        });
    } catch (error) {
        console.error("Status update error:", error);
    }

    loadMainMessages(userId);
};

function loadMainMessages(targetUserId) {
    // 🔧 FIX: Avvalgi chat listenerini o'chirish
    if (currentChatUnsubscribe) { currentChatUnsubscribe(); currentChatUnsubscribe = null; }

    const display = document.getElementById('main-chat-messages');
    if (!display || !currentUser) return;

    const chatId = getChatId(currentUser.uid, targetUserId);
    const q = query(collection(db, 'chats', chatId, 'messages'), orderBy('timestamp', 'asc'));

    currentChatUnsubscribe = onSnapshot(q, (snapshot) => {
        display.innerHTML = '';
        snapshot.forEach(docSnap => {
            const msg = docSnap.data();
            const isMe = msg.senderId === currentUser.uid;
            const div = document.createElement('div');
            div.style.cssText = `display:flex;justify-content:${isMe ? 'flex-end' : 'flex-start'};margin:4px 0;`;
            div.innerHTML = `
                <div style="max-width:70%;padding:10px 14px;word-break:break-word;font-size:0.88rem;
                    border-radius:${isMe ? '18px 18px 4px 18px' : '18px 18px 18px 4px'};
                    background:${isMe ? 'var(--grad-accent)' : 'var(--bg-hover)'};
                    color:${isMe ? '#fff' : 'var(--text-primary)'};box-shadow:var(--shadow-sm);">
                    <p style="margin:0;">${escapeHTML(msg.text || '')}</p>
                    <span style="font-size:0.68rem;opacity:0.6;display:block;text-align:right;margin-top:3px;">${formatTime(msg.timestamp)}</span>
                </div>`;
            display.appendChild(div);
        });
        display.scrollTop = display.scrollHeight;
    });
}

window.sendMainChatMessage = async function() {
    const input = document.getElementById('mainChatInput');
    const message = input?.value.trim();
    if (!message || !currentUser || !window.selectedUserId || isSendingMessage) return;

    isSendingMessage = true;
    input.value = '';

    try {
        const chatId = getChatId(currentUser.uid, window.selectedUserId);
        const myName   = currentUser.displayName || 'Foydalanuvchi';
        const peerName = window.selectedUserName || 'Suhbatdosh';

        await addDoc(collection(db, 'chats', chatId, 'messages'), {
            text:      message,
            senderId:  currentUser.uid,
            timestamp: serverTimestamp()
        });
        await setDoc(doc(db, 'chats', chatId), {
            participants:  [currentUser.uid, window.selectedUserId],
            lastMessage:   message,
            lastTimestamp: serverTimestamp(),
            unreadCount:   { [window.selectedUserId]: increment(1) },
            usersInfo: {
                [currentUser.uid]:        { name: myName,   photo: currentUser.photoURL || '' },
                [window.selectedUserId]:  { name: peerName, photo: window.selectedUserPhoto || '' }
            }
        }, { merge: true });

    } catch (error) {
        console.error('Xabar yuborishda xato:', error);
        if (input) input.value = message;
        showToast('Xabar yuborilmadi', 'error');
    } finally {
        isSendingMessage = false;
    }
};

document.getElementById('mainChatInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); window.sendMainChatMessage(); }
});

// ============================================================
// 🔧 FIX #7 — loadRecentChats (Listener stack)
// ============================================================
function loadRecentChats() {
    if (!currentUser) return;
    const list = document.getElementById('recent-chats-list');
    if (!list) return;

    const q = query(
        collection(db, 'chats'),
        where('participants', 'array-contains', currentUser.uid),
        orderBy('lastTimestamp', 'desc')
    );

    listeners.set('recentChats', onSnapshot(q, (snapshot) => {
        list.innerHTML = '';
        if (snapshot.empty) {
            list.innerHTML = `<p style="text-align:center;color:var(--text-muted);padding:24px;font-size:0.85rem;">Hali suhbatlar yo'q</p>`;
            return;
        }
        snapshot.forEach(docSnap => {
            const chat = docSnap.data();
            const otherUid = chat.participants?.find(id => id !== currentUser.uid);
            if (!otherUid) return;
            const info    = chat.usersInfo?.[otherUid];
            const uName   = info?.name  || 'Suhbatdosh';
            const uPhoto  = info?.photo || getFallbackAvatar(uName);
            const unread  = chat.unreadCount?.[currentUser.uid] || 0;

            const item = document.createElement('div');
            item.className = `chat-item ${unread > 0 ? 'unread' : ''}`;
            item.innerHTML = `
                <div class="chat-item-avatar">
                    <img src="${uPhoto}" data-name="${uName}"
                         style="width:46px;height:46px;border-radius:50%;object-fit:cover;">
                    <span class="chat-item-online"></span>
                </div>
                <div class="chat-item-info">
                    <div class="chat-item-name">${escapeHTML(uName)}
                        ${unread > 0 ? `<span class="chat-unread-dot">${unread}</span>` : ''}
                    </div>
                    <div class="chat-item-preview">${escapeHTML(chat.lastMessage || '...')}</div>
                </div>`;
            item.onclick = () => window.selectUserForChat(otherUid, uName, uPhoto);
            list.appendChild(item);
        });
    }));

    loadOnlineFriends();
}

// 🔧 FIX: loadOnlineFriends — bir marta ishga tushadi
let onlineFriendsLoaded = false;
function loadOnlineFriends() {
    if (!currentUser || onlineFriendsLoaded) return;
    onlineFriendsLoaded = true;

    const scroll = document.getElementById('onlineFriendsScroll');
    if (!scroll) return;

    getDocs(query(collection(db, 'users'), limit(12))).then(snap => {
        scroll.innerHTML = '';
        snap.forEach(docSnap => {
            if (docSnap.id === currentUser.uid) return;
            const u = docSnap.data();
            const div = document.createElement('div');
            div.className = 'online-friend-item';
            div.innerHTML = `
                <div class="online-f-avatar">
                    <img src="${u.photoURL || getFallbackAvatar(u.displayName)}" data-name="${u.displayName || 'User'}"
                         style="width:44px;height:44px;border-radius:50%;object-fit:cover;">
                    <span class="online-f-dot"></span>
                </div>
                <span>${(u.displayName || 'User').split(' ')[0]}</span>`;
            div.onclick = () => window.selectUserForChat(docSnap.id, u.displayName, u.photoURL);
            scroll.appendChild(div);
        });
    }).catch(console.error);
}

// Chat search — debounce
let chatSearchTimer = null;
document.getElementById('searchContact')?.addEventListener('input', (e) => {
    clearTimeout(chatSearchTimer);
    const term = e.target.value.trim();
    const contactsList = document.getElementById('contactsList');
    const recentList   = document.getElementById('recent-chats-list');

    if (!term) {
        if (contactsList) { contactsList.innerHTML = ''; contactsList.style.display = 'none'; }
        if (recentList) recentList.style.display = 'block';
        return;
    }

    chatSearchTimer = setTimeout(async () => {
        if (recentList) recentList.style.display = 'none';
        if (contactsList) contactsList.style.display = 'block';

        try {
            const snap = await getDocs(query(collection(db, 'users'),
                where('displayName', '>=', term),
                where('displayName', '<=', term + '\uf8ff'),
                limit(15)));

            if (!contactsList) return;
            contactsList.innerHTML = '';
            snap.forEach(docSnap => {
                if (docSnap.id === currentUser?.uid) return;
                const u = docSnap.data();
                const item = document.createElement('div');
                item.className = 'chat-item';
                item.innerHTML = `
                    <div class="chat-item-avatar">
                        <img src="${u.photoURL || getFallbackAvatar(u.displayName)}" data-name="${u.displayName}"
                             style="width:46px;height:46px;border-radius:50%;object-fit:cover;">
                    </div>
                    <div class="chat-item-info">
                        <div class="chat-item-name">${escapeHTML(u.displayName || 'User')}</div>
                        <div class="chat-item-preview">${escapeHTML(u.bio || 'Suhbatni boshlash...')}</div>
                    </div>`;
                item.onclick = () => {
                    e.target.value = '';
                    if (contactsList) contactsList.style.display = 'none';
                    if (recentList) recentList.style.display = 'block';
                    window.selectUserForChat(docSnap.id, u.displayName, u.photoURL);
                };
                contactsList.appendChild(item);
            });
        } catch (err) { console.error(err); }
    }, 400);
});

// ============================================================
// EXPLORE
// ============================================================
let exploreSearchTimer = null;

window.searchExplore = function(val) {
    clearTimeout(exploreSearchTimer);
    const grid = document.getElementById('all-users-grid');
    if (!grid) return;
    if (!val) { loadAllUsers(); return; }

    exploreSearchTimer = setTimeout(async () => {
        try {
            const [snap1, snap2] = await Promise.all([
                getDocs(query(collection(db, 'users'), where('displayName', '>=', val), where('displayName', '<=', val + '\uf8ff'), limit(10))),
                getDocs(query(collection(db, 'users'), where('username', '>=', val.toLowerCase()), where('username', '<=', val.toLowerCase() + '\uf8ff'), limit(10)))
            ]);
            const seen = new Set();
            grid.innerHTML = '';
            [...snap1.docs, ...snap2.docs].forEach(d => {
                if (seen.has(d.id) || d.id === currentUser?.uid) return;
                seen.add(d.id);
                grid.appendChild(createUserCard(d.id, d.data()));
            });
        } catch (e) { console.error(e); }
    }, 400);
};

function loadAllUsers() {
    const grid = document.getElementById('all-users-grid');
    if (!grid) return;
    grid.innerHTML = `<div style="grid-column:1/-1;"><div class="suggest-skeleton"></div><div class="suggest-skeleton"></div></div>`;

    getDocs(query(collection(db, 'users'), limit(20))).then(snap => {
        grid.innerHTML = '';
        snap.forEach(docSnap => {
            if (docSnap.id === currentUser?.uid) return;
            grid.appendChild(createUserCard(docSnap.id, docSnap.data()));
        });
    }).catch(console.error);
}

function createUserCard(userId, userData) {
    const photo = userData.photoURL || getFallbackAvatar(userData.displayName);
    const card = document.createElement('div');
    card.className = 'user-card glass-card';
    card.innerHTML = `
        <img src="${photo}" data-name="${userData.displayName || 'User'}"
             style="width:56px;height:56px;border-radius:50%;object-fit:cover;margin-bottom:8px;">
        <div style="font-weight:600;font-size:0.87rem;margin-bottom:2px;">${escapeHTML(userData.displayName || 'Foydalanuvchi')}</div>
        <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:10px;">@${escapeHTML(userData.username || 'user')}</div>
        <div style="display:flex;gap:6px;">
            <button onclick="viewUserProfile('${userId}')"
                style="background:var(--bg-hover);border:1px solid var(--border);color:inherit;padding:6px 12px;border-radius:20px;font-size:0.78rem;cursor:pointer;">Ko'rish</button>
            <button onclick="followUser('${userId}')"
                style="background:var(--accent);border:none;color:#fff;padding:6px 12px;border-radius:20px;font-size:0.78rem;cursor:pointer;">Obuna</button>
        </div>`;
    return card;
}

document.querySelectorAll('.filter-chips .chip').forEach(chip => {
    chip.addEventListener('click', () => {
        document.querySelectorAll('.filter-chips .chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        const f = chip.getAttribute('data-filter');
        if (f === 'all' || f === 'people') loadAllUsers();
    });
});

function loadTrending() {
    const list = document.getElementById('trendingList');
    if (!list) return;
    const trends = [
        { tag: 'rivion', count: '2.4K', hot: true },
        { tag: 'uzbektech', count: '1.8K' },
        { tag: 'coding', count: '956' },
        { tag: 'startup', count: '743' },
        { tag: 'design', count: '612' }
    ];
    list.innerHTML = '';
    trends.forEach((t, i) => {
        const item = document.createElement('div');
        item.className = 'trending-item';
        item.onclick = () => window.searchByTag(t.tag);
        item.innerHTML = `
            <span style="width:22px;height:22px;background:var(--bg-hover);border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:0.75rem;font-weight:700;flex-shrink:0;">${i + 1}</span>
            <div style="flex:1;">
                <strong style="font-size:0.9rem;">#${t.tag}</strong>
                <p style="margin:0;font-size:0.76rem;color:var(--text-muted);">${t.count} post</p>
            </div>
            ${t.hot ? '<i class="fas fa-fire" style="color:#ff6b35;font-size:0.85rem;"></i>' : ''}`;
        list.appendChild(item);
    });
}

window.searchByTag = function(tag) {
    window.showSection('explore');
    const input = document.getElementById('exploreSearch');
    if (input) { input.value = `#${tag}`; }
};
window.loadMoreTrending = loadTrending;

// ============================================================
// USER PROFILE MODAL
// ============================================================
window.viewUserProfile = async (userId) => {
    if (!userId || userId === 'undefined') return;
    if (currentUser && userId === currentUser.uid) { window.showSection('profile'); return; }

    const modal = document.getElementById('user-profile-modal');
    if (!modal) return;

    try {
        const snap = await getDoc(doc(db, 'users', userId));
        if (!snap.exists()) return;
        const data = snap.data();

        document.getElementById('p-modal-name').textContent     = data.displayName || 'Ismsiz';
        document.getElementById('p-modal-username').textContent = `@${data.username || 'foydalanuvchi'}`;
        document.getElementById('p-modal-bio').textContent      = data.bio || '';
        document.getElementById('p-modal-followers').textContent = data.followers?.length || 0;
        document.getElementById('p-modal-following').textContent = data.following?.length || 0;
        setSafeImage(document.getElementById('p-modal-img'), data.photoURL, data.displayName);

        const isFollowing = data.followers?.includes(currentUser?.uid);
        const followBtn = document.getElementById('p-modal-follow-btn');
        const msgBtn    = document.getElementById('p-modal-msg-btn');

        if (followBtn) {
            followBtn.innerHTML = isFollowing
                ? '<i class="fas fa-user-check"></i> Obuna bo\'ldingiz'
                : '<i class="fas fa-user-plus"></i> Obuna bo\'lish';
            followBtn.style.background = isFollowing ? 'var(--bg-hover)' : '';
            followBtn.onclick = () => window.followUser(userId);
        }
        if (msgBtn) {
            msgBtn.onclick = () => {
                window.closeProfileModal();
                window.showSection('chat');
                window.selectUserForChat(userId, data.displayName, data.photoURL);
            };
        }
        modal.style.display = 'flex';
    } catch (err) { console.error('Profil modali xatosi:', err); }
};

window.closeProfileModal = () => {
    const modal = document.getElementById('user-profile-modal');
    if (modal) modal.style.display = 'none';
};

// ============================================================
// FOLLOW / UNFOLLOW
// ============================================================
const followThrottle = new Set();

window.followUser = async (targetUserId) => {
    if (!targetUserId || targetUserId === 'undefined') return;
    if (!currentUser) return showToast('Avval tizimga kiring!', 'error');
    if (currentUser.uid === targetUserId) return showToast("O'zingizga obuna bo'la olmaysiz!", 'info');
    if (followThrottle.has(targetUserId)) return;

    followThrottle.add(targetUserId);
    setTimeout(() => followThrottle.delete(targetUserId), 2000);

    try {
        const targetRef  = doc(db, 'users', targetUserId);
        const currentRef = doc(db, 'users', currentUser.uid);
        const targetSnap = await getDoc(targetRef);
        const isFollowing = targetSnap.data()?.followers?.includes(currentUser.uid);

        if (isFollowing) {
            await updateDoc(currentRef, { following: arrayRemove(targetUserId) });
            await updateDoc(targetRef,  { followers: arrayRemove(currentUser.uid) });
            showToast('Obunadan chiqildi', 'info');
        } else {
            await updateDoc(currentRef, { following: arrayUnion(targetUserId) });
            await updateDoc(targetRef,  { followers: arrayUnion(currentUser.uid) });
            await window.sendNotification(targetUserId, 'follow', '');
            showToast("Obuna bo'ldingiz! 🎉", 'success');
        }
    } catch (err) { console.error('Follow xatosi:', err); }
};

window.showConnections = async (type) => {
    const modal = document.getElementById('connection-modal');
    const listContainer = document.getElementById('users-list');
    const title = document.getElementById('modal-title');
    if (!modal || !listContainer) return;

    if (title) title.textContent = type === 'followers' ? 'Obunachilar' : 'Obunalar';
    listContainer.innerHTML = '<p style="text-align:center;padding:20px;color:var(--text-muted);">Yuklanmoqda...</p>';
    modal.style.display = 'flex';

    try {
        const snap = await getDoc(doc(db, 'users', currentUser.uid));
        const ids = snap.data()?.[type] || [];
        listContainer.innerHTML = '';

        if (!ids.length) {
            listContainer.innerHTML = `<p style="text-align:center;padding:20px;color:var(--text-muted);">Hozircha hech kim yo'q.</p>`;
            return;
        }

        for (const id of ids.slice(0, 50)) { // Max 50
            const uSnap = await getDoc(doc(db, 'users', id));
            if (!uSnap.exists()) continue;
            const u = uSnap.data();
            const item = document.createElement('div');
            item.className = 'user-modal-item';
            item.innerHTML = `
                <img src="${u.photoURL || getFallbackAvatar(u.displayName)}" data-name="${u.displayName}"
                     style="width:40px;height:40px;border-radius:50%;object-fit:cover;">
                <div class="user-modal-info">
                    <strong>${escapeHTML(u.displayName || 'User')}</strong>
                    <span>@${escapeHTML(u.username || 'user')}</span>
                </div>
                ${type === 'following' ? `<button onclick="followUser('${id}')"
                    style="background:var(--bg-hover);border:1px solid var(--border);color:inherit;padding:6px 12px;border-radius:20px;font-size:0.78rem;cursor:pointer;">Bekor</button>` : ''}`;
            item.onclick = () => viewUserProfile(id);
            listContainer.appendChild(item);
        }
    } catch (e) { console.error(e); }
};

// ============================================================
// PROFIL TAHRIRLASH
// ============================================================
window.openMyProfileModal = async () => {
    const modal = document.getElementById('my-profile-edit-modal');
    if (!modal) return;
    modal.style.display = 'flex';
    if (!currentUser) return;

    try {
        const snap = await getDoc(doc(db, 'users', currentUser.uid));
        if (!snap.exists()) return;
        const d = snap.data();
        const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
        ['username','display-name','birthdate','gender','city','website','study','bio','goals','interests','travel','github','telegram'].forEach(k => {
            const key = k === 'display-name' ? 'displayName' : k === 'display-name' ? 'displayName' : k;
            setVal(`edit-${k}`, d[key === 'display-name' ? 'displayName' : key] || d[k]);
        });
        setVal('edit-gender', d.gender || 'male');
        setVal('edit-display-name', d.displayName);
        // Char count
        const bioEl = document.getElementById('edit-bio');
        const countEl = document.getElementById('bioCharCount');
        if (bioEl && countEl) countEl.textContent = bioEl.value.length;
    } catch (e) { console.error(e); }
};

window.closeMyProfileModal = () => {
    const modal = document.getElementById('my-profile-edit-modal');
    if (modal) modal.style.display = 'none';
};

window.openMyProfileSettings = window.openMyProfileModal;

document.getElementById('edit-bio')?.addEventListener('input', function() {
    const c = document.getElementById('bioCharCount');
    if (c) c.textContent = this.value.length;
});

let usernameCheckTimer = null;
window.checkUsernameAvailability = (username) => {
    clearTimeout(usernameCheckTimer);
    const status  = document.getElementById('username-status');
    const saveBtn = document.getElementById('saveProfileBtn');
    if (!status) return;

    if (username.length < 3) {
        status.textContent = 'Juda qisqa'; status.style.color = 'var(--warning)';
        return;
    }

    usernameCheckTimer = setTimeout(async () => {
        try {
            const q = query(collection(db, 'users'), where('username', '==', username.toLowerCase()));
            const snap = await getDocs(q);
            const isMine = snap.docs.some(d => d.id === currentUser?.uid);
            if (!snap.empty && !isMine) {
                status.textContent = '✗ Band'; status.style.color = 'var(--danger)';
                if (saveBtn) saveBtn.disabled = true;
            } else {
                status.textContent = isMine ? '↩ Joriy' : '✓ Bo\'sh';
                status.style.color = 'var(--success)';
                if (saveBtn) saveBtn.disabled = false;
            }
        } catch (e) { console.error(e); }
    }, 500);
};

// ============================================================
// 🔧 FIX #8 — saveProfileChanges (location.reload() loop)
// Muammo: reload → onAuthStateChanged → loadRecentChats va boshqa
//         listener stack → ko'p marta ishga tushish
// Yechim: reload o'rniga UI ni to'g'ridan-to'g'ri yangilash
// ============================================================
window.saveProfileChanges = async () => {
    if (!currentUser) return;
    const saveBtn = document.getElementById('saveProfileBtn');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; }

    try {
        const getVal = (id) => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
        const birthdate = getVal('edit-birthdate');
        const photoURL  = currentUser.photoURL || '';

        const data = {
            username:    getVal('edit-username').toLowerCase(),
            displayName: getVal('edit-display-name'),
            birthdate,
            age:         calculateAge(birthdate),
            gender:      getVal('edit-gender'),
            city:        getVal('edit-city'),
            website:     getVal('edit-website'),
            study:       getVal('edit-study'),
            bio:         getVal('edit-bio'),
            goals:       getVal('edit-goals'),
            interests:   getVal('edit-interests'),
            travel:      getVal('edit-travel'),
            github:      getVal('edit-github'),
            telegram:    getVal('edit-telegram'),
            photoURL,
            lastUpdate:  serverTimestamp()
        };

        await setDoc(doc(db, 'users', currentUser.uid), data, { merge: true });
        await updateProfile(currentUser, { displayName: data.displayName });

        // 🔧 UI to'g'ridan-to'g'ri yangilash — reload yo'q
        currentUserData = { ...currentUserData, ...data };
        updateAllNames(data.displayName, data.username);
        renderProfileSection(currentUserData, currentUser);

        // Drawer yangilash
        const dn = document.getElementById('drawerName');
        const dh = document.getElementById('drawerHandle');
        if (dn) dn.textContent = data.displayName;
        if (dh) dh.textContent = data.username ? `@${data.username}` : '@username';

        showToast('Profil muvaffaqiyatli yangilandi! ✅', 'success');
        window.closeMyProfileModal();

    } catch (error) {
        console.error('Saqlashda xatolik:', error);
        showToast('Xatolik: ' + error.message, 'error');
    } finally {
        if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = '<i class="fas fa-check"></i> Saqlash'; }
    }
};

window.updateAgeDisplay = function(birthdate) {
    if (!birthdate) return;
    const el = document.getElementById('user-display-age');
    if (el) el.textContent = `${calculateAge(birthdate)} yosh`;
};

// ============================================================
// PROFIL RASM YUKLASH
// ============================================================
document.getElementById('profile-upload')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file || !currentUser) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
        const base64 = ev.target.result;
        try {
            await updateDoc(doc(db, 'users', currentUser.uid), { photoURL: base64 });
            updateAllAvatars(base64, currentUser.displayName);
            showToast('Profil rasmi yangilandi! 📸', 'success');
        } catch (err) { console.error(err); showToast('Rasm yuklanmadi!', 'error'); }
    };
    reader.onerror = () => showToast("Rasmni o'qishda xatolik!", 'error');
    reader.readAsDataURL(file);
});

document.getElementById('cover-upload')?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
        const cover = document.getElementById('profileCover');
        if (cover) cover.style.backgroundImage = `url(${ev.target.result})`;
        try {
            await updateDoc(doc(db, 'users', currentUser.uid), { coverURL: ev.target.result });
        } catch (err) { console.error(err); }
    };
    reader.onerror = () => showToast('Muqova rasmi yuklanmadi!', 'error');
    reader.readAsDataURL(file);
});

window.updateProfileDisplay = async () => {
    if (!currentUser) return;
    try {
        const snap = await getDoc(doc(db, 'users', currentUser.uid));
        if (snap.exists()) renderProfileSection(snap.data(), currentUser);
    } catch (e) { console.error(e); }
};

// ============================================================
// PREMIUM
// ============================================================
window.buyPremium = async () => {
    if (!currentUser) return;
    if (!confirm('Premium obunani faollashtirmoqchimisiz? (Demo: bepul)')) return;
    try {
        await updateDoc(doc(db, 'users', currentUser.uid), {
            isVerified: true, isPremium: true, premiumSince: serverTimestamp()
        });
        document.getElementById('verifiedBadge')?.style.setProperty('display', 'inline-flex');
        document.getElementById('premiumBadge')?.style.setProperty('display', 'inline-flex');
        showToast('Tabriklaymiz! RIVION Premium faollashtirildi! 👑', 'success');
    } catch (err) { console.error(err); }
};

// ============================================================
// BOOKMARKS
// ============================================================
window.openBookmarks = () => window.showSection('bookmarks');

function loadBookmarks() {
    if (!currentUser) return;
    const list = document.getElementById('bookmarks-list');
    if (!list) return;
    list.innerHTML = `<div class="empty-state"><div class="loading-spinner"></div></div>`;

    const q = query(
        collection(db, 'users', currentUser.uid, 'bookmarks'),
        orderBy('savedAt', 'desc')
    );
    // Bookmarks uchun alohida listener yo'q — bir martalik getDocs
    getDocs(q).then(snap => {
        list.innerHTML = '';
        if (snap.empty) {
            list.innerHTML = `<div class="empty-state"><div class="empty-icon"><i class="fas fa-bookmark"></i></div><p>Saqlanganlar hali yo'q</p></div>`;
            return;
        }
        snap.forEach(d => list.appendChild(createPostCard(d.data(), d.id)));
    }).catch(console.error);
}

window.manageCollections = () => showToast("To'plamlarni boshqarish tez kunda! 📁", 'info');
window.addCollection = () => {
    const name = prompt("Yangi to'plam nomi:");
    if (name) showToast(`"${name}" to'plami yaratildi! ✅`, 'success');
};

document.querySelectorAll('.collection-chip[data-coll]').forEach(chip => {
    chip.addEventListener('click', () => {
        document.querySelectorAll('.collection-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
    });
});

window.openAnalytics = () => showToast('Tahlil bo\'limi tez kunda! 📊', 'info');

// ============================================================
// REELS
// ============================================================
async function loadReels() {
    const grid = document.getElementById('reels-grid');
    if (!grid) return;
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:32px;"><div class="loading-spinner" style="margin:auto;"></div></div>`;

    try {
        const snap = await getDocs(query(collection(db, 'reels'), orderBy('createdAt', 'desc'), limit(20)));
        grid.innerHTML = '';

        if (snap.empty) {
            grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><div class="empty-icon"><i class="fas fa-film"></i></div><p>Hali Reels yo'q</p></div>`;
            return;
        }

        snap.forEach(docSnap => {
            const data = docSnap.data();
            if (!data.videoURL) return;
            const timeAgo = data.createdAt ? formatTimeAgo(data.createdAt.toDate()) : 'Hozir';

            const el = document.createElement('div');
            el.className = 'reel-thumb';
            el.innerHTML = `
                <video src="${data.videoURL}" muted loop playsinline
                    style="width:100%;height:100%;object-fit:cover;"></video>
                <div class="reel-overlay">
                    <span><i class="fas fa-heart"></i> ${data.likes?.length || 0}</span>
                </div>`;
            el.onclick = () => viewFullReel(data, docSnap.id, timeAgo);

            const video = el.querySelector('video');
            // IntersectionObserver — scroll-based autoplay
            const observer = new IntersectionObserver(entries => {
                if (entries[0].isIntersecting) {
                    video.play().catch(() => {});
                } else {
                    video.pause();
                }
            }, { threshold: 0.5 });
            observer.observe(el);

            grid.appendChild(el);
        });
    } catch (err) {
        console.error('Reels yuklanmadi:', err);
        grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><div class="empty-icon"><i class="fas fa-exclamation-circle"></i></div><p>Yuklab bo'lmadi</p></div>`;
    }
}

window.loadReels = loadReels;

window.openAddReelModal  = () => { const m = document.getElementById('add-reel-modal'); if (m) m.style.display = 'flex'; };
window.closeAddReelModal = () => {
    const m = document.getElementById('add-reel-modal');
    if (!m) return;
    m.style.display = 'none';
    const prev = document.getElementById('reel-preview');
    const cont = document.getElementById('video-preview-container');
    const ph   = document.getElementById('upload-placeholder');
    if (prev) { prev.src = ''; prev.pause?.(); }
    if (cont) cont.style.display = 'none';
    if (ph)   ph.style.display   = 'flex';
};

window.handleReelFile = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const prev = document.getElementById('reel-preview');
    const cont = document.getElementById('video-preview-container');
    const ph   = document.getElementById('upload-placeholder');
    if (prev) prev.src = URL.createObjectURL(file);
    if (ph)   ph.style.display   = 'none';
    if (cont) cont.style.display = 'block';
    prev?.play().catch(() => {});
};

document.getElementById('reel-caption')?.addEventListener('input', function() {
    const c = document.getElementById('reelCaptionCount');
    if (c) c.textContent = this.value.length;
});

let isUploadingReel = false;

window.shareReel = async () => {
    if (isUploadingReel) return;
    const fileInput = document.getElementById('reel-file-input');
    const file = fileInput?.files[0];
    if (!file) return showToast('Video tanlang!', 'error');
    if (!currentUser) return showToast('Avval tizimga kiring!', 'error');

    isUploadingReel = true;
    const shareBtn = document.getElementById('share-btn');
    const progCont = document.getElementById('upload-progress-container');
    const progFill = document.getElementById('upload-progress-fill');
    const progText = document.getElementById('progress-text');

    if (shareBtn) shareBtn.disabled = true;
    if (progCont) progCont.style.display = 'block';
    if (progText) progText.textContent = 'Video yuklanmoqda...';
    if (progFill) progFill.style.width = '10%';

    try {
        const fileName = `reels/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

        // Supabase yo'q bo'lsa skip
        if (typeof supabase === 'undefined') throw new Error('Supabase ulanmagan');

        const { data, error: upErr } = await supabase.storage.from('videos').upload(fileName, file, { cacheControl: '3600', upsert: false });
        if (upErr) throw upErr;

        if (progFill) progFill.style.width = '70%';

        const { data: urlData } = supabase.storage.from('videos').getPublicUrl(fileName);
        if (progFill) progFill.style.width = '85%';

        const finalName  = currentUser.displayName || 'Foydalanuvchi';
        const finalPhoto = currentUser.photoURL    || getFallbackAvatar(finalName);
        const caption    = document.getElementById('reel-caption')?.value || '';

        await addDoc(collection(db, 'reels'), {
            videoURL:  urlData.publicUrl,
            caption,
            createdAt: serverTimestamp(),
            userId:    currentUser.uid,
            userName:  finalName,
            userPhoto: finalPhoto,
            likes:     []
        });

        if (progFill) progFill.style.width = '100%';
        if (progText) progText.textContent = 'Tayyor!';

        setTimeout(() => {
            window.closeAddReelModal();
            loadReels();
            showToast('Reel muvaffaqiyatli ulashildi! 🎬', 'success');
        }, 500);

    } catch (err) {
        console.error('Reel yuklashda xato:', err);
        showToast('Xato: ' + err.message, 'error');
        if (progCont) progCont.style.display = 'none';
    } finally {
        isUploadingReel = false;
        if (shareBtn) shareBtn.disabled = false;
    }
};

function viewFullReel(data, docId, timeAgo) {
    const viewer  = document.getElementById('video-viewer-modal');
    const video   = document.getElementById('full-screen-video');
    const sidebar = document.getElementById('viewer-sidebar-actions');
    const info    = document.getElementById('viewer-bottom-info');
    if (!viewer || !video) return;

    video.src = data.videoURL;
    viewer.style.display = 'flex';
    video.play().catch(() => {});

    if (info) {
        info.innerHTML = `
            <div style="color:#fff;">
                <strong style="display:block;">${escapeHTML(data.userName || 'Foydalanuvchi')}</strong>
                <span style="font-size:0.78rem;opacity:0.7;">${timeAgo}</span>
                ${data.caption ? `<p style="margin:4px 0 0;font-size:0.85rem;">${escapeHTML(data.caption)}</p>` : ''}
            </div>`;
    }
    if (sidebar) {
        sidebar.innerHTML = `
            <div class="insta-sidebar-btn" onclick="likeReel('${docId}')">
                <i class="fas fa-heart" id="like-heart-${docId}"></i>
                <span>${data.likes?.length || 0}</span>
            </div>
            <div class="insta-sidebar-btn" onclick="togglePlayPause()">
                <i class="fas fa-pause" id="reelPlayIcon"></i>
            </div>`;
    }
}

window.togglePlayPause = () => {
    const video = document.getElementById('full-screen-video');
    const icon  = document.getElementById('reelPlayIcon');
    if (!video) return;
    if (video.paused) {
        video.play();
        if (icon) icon.className = 'fas fa-pause';
    } else {
        video.pause();
        if (icon) icon.className = 'fas fa-play';
    }
};

window.closeVideoViewer = () => {
    const viewer = document.getElementById('video-viewer-modal');
    const video  = document.getElementById('full-screen-video');
    if (viewer) viewer.style.display = 'none';
    if (video) { video.pause(); video.src = ''; video.load(); }
};

window.likeReel = async (docId) => {
    if (!currentUser) return showToast('Avval tizimga kiring!', 'error');
    try {
        await updateDoc(doc(db, 'reels', docId), { likes: arrayUnion(currentUser.uid) });
        const h = document.getElementById(`like-heart-${docId}`);
        if (h) h.style.color = 'var(--danger)';
    } catch (e) { console.error(e); }
};

document.getElementById('full-screen-video')?.addEventListener('timeupdate', function() {
    const fill = document.getElementById('videoProgressFill');
    if (fill && this.duration) fill.style.width = `${(this.currentTime / this.duration) * 100}%`;
});

// ============================================================
// STORIES
// ============================================================
window.openAddStory  = () => { const m = document.getElementById('add-story-modal'); if (m) m.style.display = 'flex'; };
window.closeAddStory = () => { const m = document.getElementById('add-story-modal'); if (m) m.style.display = 'none'; };

document.querySelectorAll('.story-type').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.story-type').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const type = btn.getAttribute('data-type');
        const photoArea = document.getElementById('storyPhotoArea');
        const textArea  = document.getElementById('storyTextArea');
        if (photoArea) photoArea.style.display = type === 'text' ? 'none' : 'block';
        if (textArea)  textArea.style.display  = type === 'text' ? 'block' : 'none';
    });
});

document.getElementById('storyFileInput')?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
        const wrap = document.getElementById('storyPreviewWrap');
        if (wrap) {
            wrap.style.display = 'block';
            wrap.innerHTML = `<img src="${ev.target.result}" style="width:100%;border-radius:12px;max-height:300px;object-fit:cover;">`;
        }
    };
    reader.readAsDataURL(file);
});

window.publishStory = async () => {
    if (!currentUser) return;
    try {
        const textContent = document.getElementById('storyTextContent')?.value;
        const previewImg  = document.querySelector('#storyPreviewWrap img');
        await addDoc(collection(db, 'stories'), {
            uid:       currentUser.uid,
            userName:  currentUser.displayName || 'Foydalanuvchi',
            userPhoto: currentUser.photoURL    || '',
            imageURL:  previewImg?.src || null,
            text:      textContent    || null,
            createdAt: serverTimestamp(),
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
        });
        window.closeAddStory();
        showToast('Story ulashildi! 🌟', 'success');
        loadStories();
    } catch (e) { console.error(e); }
};

function loadStories() {
    const scroll = document.querySelector('#storiesContainer .stories-scroll');
    if (!scroll) return;

     scroll.querySelectorAll('.story-item:not(.add-story)').forEach(el => el.remove());

    // 24 soat oldingi vaqtni hisoblaymiz
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Bazadan faqat oxirgi 24 soatda yaratilgan storylarni so'raymiz (where qo'shildi)
    const q = query(
        collection(db, 'stories'), 
        where('createdAt', '>=', twentyFourHoursAgo), // FAQAT 24 SOATLIKLAR
        orderBy('createdAt', 'desc'), 
        limit(20)
    );

    getDocs(q).then(snap => {
        snap.forEach(docSnap => {
            const data = docSnap.data();
            const item = document.createElement('div');
            item.className = 'story-item';
            const img = data.userPhoto || getFallbackAvatar(data.userName);
            item.innerHTML = `
                <div class="story-avatar-wrap">
                    <img src="${img}" data-name="${data.userName || 'Story'}"
                         style="width:56px;height:56px;border-radius:50%;object-fit:cover;border:2.5px solid var(--accent);">
                </div>
                <span>${escapeHTML((data.userName || 'Story').split(' ')[0])}</span>`;
            item.onclick = () => openStoryViewer(data);
            scroll.appendChild(item);
        });
    }).catch(console.error);
}

function openStoryViewer(story) {
    const modal = document.getElementById('story-viewer-modal');
    if (!modal) return;
    setSafeImage(document.getElementById('storyViewerAvatar'), story.userPhoto, story.userName);
    const nameEl = document.getElementById('storyViewerName');
    const timeEl = document.getElementById('storyViewerTime');
    if (nameEl) nameEl.textContent = story.userName || 'Foydalanuvchi';
    if (timeEl) timeEl.textContent = story.createdAt ? formatTimeAgo(story.createdAt.toDate()) : '';

    const content = document.getElementById('storyViewerContent');
    if (content) {
        content.innerHTML = story.imageURL
            ? `<img src="${story.imageURL}" style="width:100%;height:100%;object-fit:cover;">`
            : `<div style="display:flex;align-items:center;justify-content:center;height:100%;font-size:1.4rem;padding:24px;text-align:center;color:#fff;">${escapeHTML(story.text || '')}</div>`;
    }
    modal.style.display = 'flex';
}

window.closeStoryViewer = () => { const m = document.getElementById('story-viewer-modal'); if (m) m.style.display = 'none'; };
window.prevStory = () => {};
window.nextStory = () => {};
window.sendStoryReply = () => {
    const input = document.getElementById('storyReplyInput');
    if (!input?.value.trim()) return;
    showToast('Javob yuborildi!', 'success');
    input.value = '';
};

// ============================================================
// HAMJAMIYAT (DISCOVERY)
// ============================================================
window.openDiscoveryModal  = () => { const m = document.getElementById('discoveryModal'); if (m) m.style.display = 'flex'; };
window.closeDiscoveryModal = () => { const m = document.getElementById('discoveryModal'); if (m) m.style.display = 'none'; };

window.previewDiscoveryImage = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
        const prev = document.getElementById('discoveryPreview');
        const ph   = document.getElementById('uploadPlaceholder');
        if (prev) { prev.src = ev.target.result; prev.style.display = 'block'; }
        if (ph)   ph.style.display = 'none';
    };
    reader.readAsDataURL(file);
};

document.querySelectorAll('.disc-tag').forEach(tag => {
    tag.addEventListener('click', () => {
        document.querySelectorAll('.disc-tag').forEach(t => t.classList.remove('active'));
        tag.classList.add('active');
    });
});

let isUploadingDiscovery = false;

window.uploadDiscoveryPost = async () => {
    if (isUploadingDiscovery) return;
    const bio = document.getElementById('discoveryBio')?.value.trim();
    if (!currentUser || !bio) return showToast('Tavsif yozing!', 'error');

    isUploadingDiscovery = true;
    const publishBtn = document.getElementById('publishBtn');
    if (publishBtn) { publishBtn.disabled = true; publishBtn.textContent = 'Yuklanmoqda...'; }

    try {
        const fileInput   = document.getElementById('discoveryFile');
        const selectedTag = document.querySelector('.disc-tag.active')?.getAttribute('data-tag') || 'other';
        let postImage = null;

        if (fileInput?.files[0]) {
            postImage = await new Promise((res, rej) => {
                const r = new FileReader();
                r.onload  = (e) => res(e.target.result);
                r.onerror = () => rej(new Error("Fayl o'qilmadi"));
                r.readAsDataURL(fileInput.files[0]);
            });
        }

        await addDoc(collection(db, 'discovery'), {
            uid:       currentUser.uid,
            userName:  currentUser.displayName || 'Foydalanuvchi',
            userPhoto: currentUser.photoURL    || '',
            bio, postImage,
            category:  selectedTag,
            createdAt: serverTimestamp()
        });

        window.closeDiscoveryModal();
        showToast("E'lon joylashtirildi! 🚀", 'success');
    } catch (err) {
        console.error(err);
        showToast('Xatolik: ' + err.message, 'error');
    } finally {
        isUploadingDiscovery = false;
        if (publishBtn) { publishBtn.disabled = false; publishBtn.innerHTML = '<i class="fas fa-rocket"></i> E\'lonlash'; }
    }
};

// ============================================================
// 🔧 FIX #9 — loadDiscoveryFeed (Listener stack)
// ============================================================
function loadDiscoveryFeed() {
    const feed = document.getElementById('discovery-feed');
    if (!feed) return;

    const q = query(collection(db, 'discovery'), orderBy('createdAt', 'desc'), limit(20));

    listeners.set('discovery', onSnapshot(q, snap => {
        feed.innerHTML = '';
        snap.forEach(docSnap => {
            const data = docSnap.data();
            const isMe  = currentUser?.uid === data.uid;
            const photo = data.userPhoto || getFallbackAvatar(data.userName);

            const div = document.createElement('div');
            div.className = 'discovery-card glass-card';
            div.style.cssText = 'padding:16px;margin-bottom:12px;';
            div.innerHTML = `
                <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
                    <img src="${photo}" data-name="${data.userName}"
                         style="width:40px;height:40px;border-radius:50%;object-fit:cover;">
                    <div>
                        <strong>${escapeHTML(data.userName || 'User')}</strong>
                        ${data.category ? `<span style="font-size:0.75rem;background:var(--accent-dim);color:var(--accent);padding:2px 8px;border-radius:10px;margin-left:6px;">${data.category}</span>` : ''}
                    </div>
                </div>
                ${data.postImage ? `<img src="${data.postImage}" data-name="Post" style="width:100%;border-radius:12px;margin-bottom:10px;max-height:300px;object-fit:cover;">` : ''}
                <p style="margin:0 0 12px;font-size:0.9rem;">${escapeHTML(data.bio || '')}</p>
                <div style="display:flex;gap:8px;">
                    ${!isMe ? `<button onclick="sendInterest('${data.uid}','${escapeHTML(data.userName)}')"
                        style="flex:1;background:var(--accent);border:none;color:#fff;padding:9px;border-radius:10px;cursor:pointer;font-size:0.85rem;">
                        Qiziqish bildirish</button>` : `<span style="font-size:0.78rem;color:var(--text-muted);">Sizning e'loningiz</span>`}
                    ${!isMe ? `<button onclick="followUser('${data.uid}')"
                        style="background:var(--bg-hover);border:1px solid var(--border);color:inherit;padding:9px 14px;border-radius:10px;cursor:pointer;font-size:0.85rem;">
                        Obuna</button>` : ''}
                </div>`;
            feed.appendChild(div);
        });
    }));
}

document.querySelectorAll('.feed-tab[data-comm]').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.feed-tab[data-comm]').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
    });
});

window.sendInterest = async (targetUid, targetName) => {
    if (!currentUser) return showToast('Avval tizimga kiring!', 'error');
    try {
        await addDoc(collection(db, 'notifications'), {
            toUid:     targetUid,
            fromUid:   currentUser.uid,
            fromName:  currentUser.displayName || 'Foydalanuvchi',
            fromPhoto: currentUser.photoURL    || '',
            type:      'interest',
            status:    'pending',
            createdAt: serverTimestamp()
        });
        showToast(`${targetName}ga qiziqish bildirildi! 👋`, 'success');
    } catch (e) { console.error(e); }
};

// ============================================================
// MY POSTS (Profile grid)
// ============================================================
function loadMyPosts(uid) {
    const grid = document.getElementById('my-posts-list');
    if (!grid || !uid) return;

    const q = query(collection(db, 'posts'), where('uid', '==', uid), orderBy('createdAt', 'desc'), limit(30));

    listeners.set('myPosts', onSnapshot(q, snap => {
        grid.innerHTML = '';
        if (snap.empty) {
            grid.innerHTML = `<div class="empty-state"><div class="empty-icon"><i class="fas fa-camera-retro"></i></div><p>Hali post joylangmagan</p><button class="btn-primary small" onclick="showSection('home')"><i class="fas fa-plus"></i> Birinchi postni joylashtiring</button></div>`;
            return;
        }
        snap.forEach(docSnap => {
            const data = docSnap.data();
            const el = document.createElement('div');
            el.className = 'post-thumb';
            el.style.cssText = 'aspect-ratio:1;background:var(--bg-hover);border-radius:8px;overflow:hidden;cursor:pointer;position:relative;';
            el.innerHTML = data.mediaURL
                ? `<img src="${data.mediaURL}" data-name="Post" style="width:100%;height:100%;object-fit:cover;">`
                : `<div style="display:flex;align-items:center;justify-content:center;height:100%;padding:8px;font-size:0.78rem;color:var(--text-secondary);text-align:center;line-height:1.4;">${escapeHTML(data.content?.substring(0, 80) || '')}</div>`;
            grid.appendChild(el);
        });
    }));
}

document.querySelectorAll('.profile-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        // 1. Aktiv klassni almashtirish
        document.querySelectorAll('.profile-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        // 2. Filtrlash mantiqi
        const type = tab.getAttribute('data-ptab');
        const thumbs = document.querySelectorAll('.post-thumb');

        thumbs.forEach(thumb => {
            const hasImg = thumb.querySelector('img') !== null;
            const hasVideo = thumb.querySelector('video') !== null;

            switch(type) {
                case 'media':
                    thumb.style.display = (hasImg || hasVideo) ? 'block' : 'none';
                    break;
                case 'thoughts':
                    thumb.style.display = (!hasImg && !hasVideo) ? 'block' : 'none';
                    break;
                case 'reels':
                    thumb.style.display = hasVideo ? 'block' : 'none';
                    break;
                default:
                    thumb.style.display = 'block';
            }
        });
    });
});

// ============================================================
// MODALS: QIZIQISHLAR, INFO, QUICK CREATE
// ============================================================
window.openInterests  = () => { const m = document.getElementById('interests-modal'); if (m) { m.style.display = 'flex'; document.body.style.overflow = 'hidden'; } };
window.closeInterests = () => { const m = document.getElementById('interests-modal'); if (m) { m.style.display = 'none'; document.body.style.overflow = ''; } };

document.querySelectorAll('.interest-tag').forEach(tag => {
    tag.addEventListener('click', () => tag.classList.toggle('active'));
});

window.openInfo  = () => { const m = document.getElementById('info-modal'); if (m) { m.style.display = 'flex'; document.body.style.overflow = 'hidden'; } };
window.closeInfo = () => { const m = document.getElementById('info-modal'); if (m) { m.style.display = 'none'; document.body.style.overflow = ''; } };

window.openQuickCreate  = () => {
    const s = document.getElementById('quick-create-sheet');
    const o = document.getElementById('bottomSheetOverlay');
    if (s) s.style.display = 'flex';
    if (o) { o.style.display = 'block'; o.classList.add('visible'); }
};
window.closeQuickCreate = () => {
    const s = document.getElementById('quick-create-sheet');
    const o = document.getElementById('bottomSheetOverlay');
    if (s) s.style.display = 'none';
    if (o) { o.style.display = 'none'; o.classList.remove('visible'); }
};

window.addHighlight = () => showToast('Highlight qo\'shish tez kunda! ✨', 'info');

window.shareProfile = () => {
    const url = window.location.href;
    if (navigator.share) {
        navigator.share({ title: 'RIVION Profil', url });
    } else {
        navigator.clipboard?.writeText(url)
            .then(() => showToast('Profil linki nusxalandi! 📋', 'success'))
            .catch(() => showToast('Nusxalashda xatolik', 'error'));
    }
};

window.openReelsSection = () => window.showSection('reels');

// Stub funksiyalar
window.openChatAttach  = () => showToast('Fayl yuklash tez kunda! 📎', 'info');
window.openChatCamera  = () => showToast('Kamera tez kunda! 📷', 'info');
window.toggleChatEmoji = () => showToast('Emoji tez kunda! 😊', 'info');
window.startVoiceCall  = () => showToast("Ovozli qo'ng'iroq tez kunda! 📞", 'info');
window.startVideoCall  = () => showToast("Video qo'ng'iroq tez kunda! 📹", 'info');
window.openChatInfo    = () => showToast("Chat ma'lumotlari tez kunda! ℹ️", 'info');

// ============================================================
// ESC KEYBOARD SHORTCUT
// ============================================================
document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    window.closeVideoViewer?.();
    window.closeAddReelModal?.();
    window.closeMyProfileModal?.();
    window.closeProfileModal?.();
    window.closeInfo?.();
    window.closeInterests?.();
    window.closeAddStory?.();
    window.closeDiscoveryModal?.();
    window.closeQuickCreate?.();
    closeDrawer();
});

// Modal overlay click to close
document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.style.display = 'none';
    });
});

// ============================================================
// DOMContentLoaded — Sahifa yuklanganda
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    loadPosts('forYou');
    loadTrending();
    loadStories();
    window.showSection('home');
});

