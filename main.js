// ============================================================
// RIVION — main.js (v2.1 — Cheksizlik muammolari to'liq tuzatildi)
// Muallif: Sarvarbek Rahmonjonov
// ============================================================

// 1. Supabase modulini import qilish (Siz yozgan usul)
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { auth, db, onAuthStateChanged } from './firebase-config.js';
import {
    collection, addDoc, setDoc, getDoc, doc, deleteDoc,
    query, where, limit, orderBy, onSnapshot, getDocs,
    serverTimestamp, updateDoc, arrayUnion, arrayRemove,
    increment, writeBatch
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { updateProfile, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// NAMOUNA (Bunday holatda qolib ketgan bo'lsa xato beradi):
// const supabaseUrl = 'https://your-project-id.supabase.co';

// TO'G'RI VARIANT (Sizning Supabase loyihangiz ma'lumotlari bo'lishi shart):
const supabaseUrl = 'https://bcgwrbfsfrcxiyhpajve.supabase.co'; 
const supabaseKey = 'sb_publishable_yu9Pqq7bNOJhWt7nV8ITfQ_uqNK1n-a'; // API Keys bo'limidagi default anon keyingiz

// Supabase mijozini yaratish va global qilish
const supabase = createClient(supabaseUrl, supabaseKey);
// Global obyektlar
window.db = db;
window.supabase = supabase;
window.auth = auth;
window.openComments = function() { /* kodlar */ };
window.shareReelBtn = function() { /* kodlar */ };
window.deleteReel = function(docId) { /* kodlar */ };
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
    card.className = 'post-card';
    card.dataset.postId = postId;

    card.innerHTML = `
        <div class="post-header">
            <div class="post-author-info">
                <img src="${authorPhoto}" data-name="${authorName}" class="post-avatar" onclick="viewUserProfile('${authorId}')" alt="Avatar">
                <div class="post-meta">
                    <span class="post-author-name" onclick="viewUserProfile('${authorId}')">${authorName}</span>
                    <span class="post-time">${time}</span>
                </div>
            </div>
            
            <div class="post-header-actions">
                ${!isMyPost ? `<button class="btn-follow" onclick="followUser('${authorId}')">Obuna</button>` : ''}
                ${isMyPost  ? `
                <button class="btn-icon-only text-muted" onclick="deletePost('${postId}')" title="O'chirish">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="action-icon"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </button>` : ''}
            </div>
        </div>

        <div class="post-body">
            <p class="post-text">${escapeHTML(data.content || '')}</p>
            ${data.mediaURL ? `<img src="${data.mediaURL}" data-name="Post" class="post-media" onclick="openImageLightbox(this.src)" alt="Post media">` : ''}
        </div>

        <div class="post-actions">
            <button class="btn-action ${isLiked ? 'liked' : ''}" onclick="toggleLike('${postId}',${isLiked},'${authorId}')" id="like-btn-${postId}">
                <svg viewBox="0 0 24 24" fill="${isLiked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="action-icon">
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                </svg>
                <span id="likes-count-${postId}">${likesCount}</span>
            </button>
            
            <button class="btn-action" onclick="toggleCommentBox('${postId}')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="action-icon">
                    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path>
                </svg>
                <span id="comments-count-${postId}">${commentsCount}</span>
            </button>
            
            <button class="btn-action btn-bookmark" onclick="bookmarkPost('${postId}')" id="bookmark-btn-${postId}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="action-icon">
                    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
                </svg>
            </button>
        </div>

        <div id="comment-box-${postId}" class="post-comment-section" style="display:none;">
            <div id="comments-display-${postId}" class="comments-list"></div>
            <div class="comment-input-wrapper">
                <input type="text" id="comment-input-${postId}" class="comment-input" placeholder="Fikr yozing...">
                <button class="btn-send-comment" onclick="sendComment('${postId}','${authorId}')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="action-icon">
                        <line x1="22" y1="2" x2="11" y2="13"></line>
                        <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                    </svg>
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
 
// Global kesh (barcha yuklangan videolarni xotirada saqlash uchun)
window.allReelsCache = [];

// Yordamchi funksiya: Supabase havolasini CORS xatolaridan tozalash
function getCleanVideoURL(url) {
    if (!url) return '';
    // Agar havola Supabase'ga tegishli bo'lsa va unda '/public/' bo'lmasa, uni to'g'rilaymiz
    if (url.includes('supabase.co') && !url.includes('/object/public/')) {
        return url.replace('/storage/v1/object/', '/storage/v1/object/public/');
    }
    return url;
}

// ==========================================
// 1. REELS GRIDNI BAZADAN YUKLASH
// ==========================================
window.loadReels = async function() {
    const grid = document.getElementById('reels-grid');
    if (!grid) return;
    
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:32px;"><div class="loading-spinner" style="margin:auto;"></div></div>`;

    try {
        // Firebase Firestore'dan ma'lumot olish
        const q = query(collection(db, 'reels'), orderBy('createdAt', 'desc'), limit(20));
        const snap = await getDocs(q);
        grid.innerHTML = '';

        if (snap.empty) {
            grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><p>Hali Reels yo'q</p></div>`;
            return;
        }

        window.allReelsCache = []; // Keshni tozalaymiz

        snap.forEach(docSnap => {
            const data = docSnap.data();
            if (!data.videoURL) return;

            // Havolani xavfsiz va toza holatga keltiramiz
            const cleanURL = getCleanVideoURL(data.videoURL);

            // ID ni ob'ekt ichiga majburiy joylaymiz va toza URL bilan yangilaymiz
            const reelData = { id: docSnap.id, ...data, videoURL: cleanURL };
            window.allReelsCache.push(reelData);

            // Grid elementini yaratish
            const el = document.createElement('div');
            el.className = 'reel-thumb';
            el.innerHTML = `
                <video src="${cleanURL}" muted loop playsinline style="width:100%;height:100%;object-fit:cover;"></video>
                <div class="reel-overlay">
                    <span><i class="fas fa-heart"></i> ${data.likes?.length || 0}</span>
                </div>`;
            
            // Grid element bosilganda to'g'ridan-to'g'ri keshlangan ob'ekt va ID ketadi
            el.onclick = () => window.viewFullReel(reelData, reelData.id);

            // Kichik videolarni avtomatik ijro etish (Grid ichida)
            const video = el.querySelector('video');
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
        grid.innerHTML = `<p style="color:red;text-align:center;grid-column:1/-1;">Yuklab bo'lmadi</p>`;
    }
};

// ==========================================
// 2. MODAL ICHIGA BARCHA VIDEOLARNI CHIZISH
// ==========================================
window.openReelsFeed = (allReelsData, startDocId = null) => {
    const container = document.getElementById('reels-snap-container');
    if (!container) return;

    container.innerHTML = ''; // Konteynerni tozalash

    if (!allReelsData || allReelsData.length === 0) {
        container.innerHTML = `<p style="color:white;text-align:center;padding:20px;">Videolar topilmadi.</p>`;
        return;
    }

    // Tizimga kirgan foydalanuvchini aniqlaymiz
    const currentUser = auth.currentUser;
    const currentUserId = currentUser ? currentUser.uid : null;

    // 1. Videolarni DOM ga chizamiz
    allReelsData.forEach((data) => {
        const docId = data.id;
        if (!docId) return; // ID bo'lmasa o'tkazib yuboriladi

        // Havolani bu yerda ham tekshirib tozalaymiz
        const cleanURL = getCleanVideoURL(data.videoURL);

        // --- LIKE HOLATINI TEKSHIRISH ---
        const hasLiked = currentUserId && data.likes && data.likes.includes(currentUserId);
        const heartClass = hasLiked ? 'fas fa-heart' : 'far fa-heart';
        const heartColor = hasLiked ? '#ff4d4d' : 'white';

        // --- XAVFSIZLIK: Faqat video egasiga o'chirish tugmasini ko'rsatish ---
        const isOwner = currentUserId && data.userId === currentUserId;
        const deleteButtonHtml = isOwner ? `
            <button class="action-btn delete-btn" onclick="deleteReel('${docId}')">
                <i class="fas fa-trash"></i>
            </button>
        ` : '';

        const reelItem = document.createElement('div');
        reelItem.className = 'snap-reel-item';
        reelItem.setAttribute('id', `reel-item-${docId}`);
        
        reelItem.innerHTML = `
            <video src="${cleanURL}" loop playsinline disablepictureinpicture class="reel-video-element" style="width:100%;height:100%;object-fit:cover;"></video>
            
            <div class="insta-sidebar">
                <button class="action-btn" onclick="likeReel('${docId}', '${data.userId || ''}')">
                    <i class="${heartClass}" id="like-heart-${docId}" style="color: ${heartColor};"></i>
                    <span>${data.likes?.length || 0}</span>
                </button>
                <button class="action-btn" onclick="openComments('${docId}')">
                    <i class="fas fa-comment"></i>
                </button>
                <button class="action-btn" onclick="shareReelBtn('${docId}')">
                    <i class="fas fa-paper-plane"></i>
                </button>
                <button class="action-btn"><i class="fas fa-ellipsis-h"></i></button>
                
                ${deleteButtonHtml}
            </div>

            <div class="insta-bottom-info">
                <div class="reel-user-info">
                    <img src="${data.userAvatar || 'profil-rasm.jpg'}" class="reel-avatar" alt="User">
                    <span class="reel-username">@${data.userName || 'foydalanuvchi'}</span>
                    <button class="reel-follow-btn">Follow</button>
                </div>
                <div class="reel-caption">
                    ${data.caption || 'Tavsif mavjud emas.'}
                </div>
            </div>
        `;
        container.appendChild(reelItem);
    });

    // ========================================================
    // 2. AVTOMATIK PLAY/PAUSE MEXANIZMI
    // ========================================================
    const allVideos = container.querySelectorAll('.reel-video-element');
    
    const reelObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            const video = entry.target;
            
            if (entry.isIntersecting || entry.intersectionRatio > 0.5) {
                allVideos.forEach(v => {
                    if (v !== video) {
                        v.pause();
                        v.currentTime = 0; 
                    }
                });
                video.play().catch(err => console.log("Avto-pley bloklandi:", err));
            } else {
                video.pause();
            }
        });
    }, {
        threshold: [0.2, 0.5, 0.8]
    });

    allVideos.forEach(v => reelObserver.observe(v));
};

// ============================================================
// 3. AVTOMATIK UPLOAD MANTIQI (YANGI QO'SHILDI)
// ============================================================
document.addEventListener('click', async (e) => {
    // Agar sening skrinshotingdagi "Ulashish" tugmasi bosilsa
    if (e.target && e.target.tagName === 'BUTTON' && e.target.innerText.includes('Ulashish')) {
        
        const ulashishBtn = e.target;
        
        // Modal ichidagi elementlarni avtomatik qidirib topamiz
        const fileInput = document.querySelector('input[type="file"]') || document.getElementById('reel-video-input');
        const captionInput = document.querySelector('.modal-body textarea') || document.querySelector('textarea');
        
        // Skrinshotingdagi "0% yuklandi..." yozuvini yangilash uchun div
        const progressDiv = document.querySelector('.modal-body div[style*="padding"]') || 
                            Array.from(document.querySelectorAll('div')).find(el => el.innerText.includes('yuklandi'));

        if (!fileInput || fileInput.files.length === 0) {
            alert("Iltimos, avval video faylni yuklang yoki tanlang!");
            return;
        }

        const file = fileInput.files[0];
        const caption = captionInput ? captionInput.value : '';

        try {
            // Tugmani bloklaymiz va foydalanuvchiga jarayonni ko'rsatamiz
            ulashishBtn.disabled = true;
            if (progressDiv) progressDiv.innerText = "Supabase'ga yuklanyapti...";

            // 1. Unikal fayl nomi yaratish
            const fileExt = file.name.split('.').pop();
            const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 7)}.${fileExt}`;

            // 2. Supabase Storage 'videos' bucket-iga faylni yuklash
            const { data: uploadData, error: uploadError } = await supabase
                .storage
                .from('videos')
                .upload(fileName, file, {
                    cacheControl: '3600',
                    upsert: false
                });

            if (uploadError) throw uploadError;

            // 3. Supabase'dan toza, ochiq (Public) URL manzilini olish
            const { data: urlData } = supabase
                .storage
                .from('videos')
                .getPublicUrl(fileName);

            const cleanVideoURL = urlData.publicUrl;

            // 4. Firestore-ga yangi post ma'lumotlarini toza link bilan yozish
            const currentUser = auth.currentUser;
            
            await addDoc(collection(db, 'reels'), {
                userId: currentUser ? currentUser.uid : 'anonim_user',
                userName: currentUser ? (currentUser.displayName || currentUser.email.split('@')[0]) : 'foydalanuvchi',
                userAvatar: currentUser ? (currentUser.photoURL || 'profil-rasm.jpg') : 'profil-rasm.jpg',
                videoURL: cleanVideoURL, // <-- Mana shu yerga Supabase linki ketadi!
                caption: caption,
                likes: [],
                createdAt: serverTimestamp() // Firebase Timestamp
            });

            if (progressDiv) progressDiv.innerText = "100% yuklandi!";
            alert("Reel muvaffaqiyatli ulashildi!");

            // Modal oynasini yopish (X tugmasini avtomatik bosish orqali)
            const closeBtn = document.querySelector('button[class*="close"]') || document.querySelector('.modal-header button');
            if (closeBtn) closeBtn.click();

            // Gridni yangitdan yuklash
            if (typeof window.loadReels === 'function') {
                window.loadReels();
            }

        } catch (err) {
            console.error("Yuklashda xatolik:", err);
            alert("Yuklab bo'lmadi: " + err.message);
            if (progressDiv) progressDiv.innerText = "Yuklashda xato bo'ldi!";
        } finally {
            ulashishBtn.disabled = false;
        }
    }
});


window.likeReel = async function(docId) {
    try {
        // 1. Tizimga kirgan foydalanuvchini tekshiramiz
        const user = auth.currentUser; 
        if (!user) {
            alert("Like bosish uchun avval tizimga kiring!");
            return;
        }

        const userId = user.uid; // Foydalanuvchi ID-si
        const reelRef = doc(db, 'reels', docId); // Firestore-dagi hujjat manzili

        // 2. DOM elementlarini topamiz (yurakcha va soni turgan joy)
        const heartIcon = document.getElementById(`like-heart-${docId}`);
        const countSpan = heartIcon?.nextElementSibling; // <i id="like-heart..."></i> dan keyingi <span>

        if (!heartIcon) return;

        // 3. UI-ni darhol o'zgartiramiz (Foydalanuvchiga qotishlarsiz tez ishlagandek ko'rinishi uchun)
        let currentLikesCount = parseInt(countSpan.innerText) || 0;
        
        // Agar foydalanuvchi allaqachon like bosgan bo'lsa (yurakcha qizil bo'lsa)
        if (heartIcon.classList.contains('fas') && heartIcon.style.color === 'rgb(255, 77, 77)') {
            // Likenining qizilligini olib tashlaymiz
            heartIcon.className = 'far fa-heart'; // Ichini bo'sh qilamiz
            heartIcon.style.color = 'white';
            if (currentLikesCount > 0) countSpan.innerText = currentLikesCount - 1;

            // Firebase-dan foydalanuvchi ID-sini o'chiramiz
            await updateDoc(reelRef, {
                likes: arrayRemove(userId)
            });
            console.log("Like olib tashlandi!");

        } else {
            // Agar birinchi marta bosayotgan bo'lsa (yurakchani qizil qilamiz)
            heartIcon.className = 'fas fa-heart'; // Ichini to'ldiramiz
            heartIcon.style.color = '#ff4d4d'; // Qizil rang
            countSpan.innerText = currentLikesCount + 1;

            // Firebase-ga foydalanuvchi ID-sini qo'shamiz
            await updateDoc(reelRef, {
                likes: arrayUnion(userId)
            });
            console.log("Like muvaffaqiyatli qo'shildi!");
        }

    } catch (error) {
        console.error("Like bosishda xatolik yuz berdi:", error);
        alert("Like amali bajarilmadi, internetni tekshiring!");
    }
};


window.deleteReel = async function(docId) {
    try {
        const user = auth.currentUser;
        if (!user) {
            alert("Videoni o'chirish uchun tizimga kiring!");
            return;
        }

        // 1. Foydalanuvchidan o'chirishni tasdiqlashini so'raymiz (Adashib bosib yuborgan bo'lsa)
        const confirmDelete = confirm("Haqiqatan ham ushbu videoni butunlay o'chirib tashlamoqchimisiz?");
        if (!confirmDelete) return;

        // 2. Firestore-dan videoning ma'lumotlarini tekshirish uchun olamiz
        const reelRef = doc(db, 'reels', docId);
        const reelSnap = await getDoc(reelRef);

        if (!reelSnap.exists()) {
            alert("Video topilmadi yoki allaqachon o'chirilgan.");
            return;
        }

        const reelData = reelSnap.data();

        // 3. Xavfsizlik tekshiruvi: Haqiqatan ham joriy foydalanuvchi video egasimi?
        if (reelData.userId !== user.uid) {
            alert("Siz faqat o'zingiz yuklagan videolarni o'chira olasiz!");
            return;
        }

        // 4. Firestore (baza)dan hujjatni butunlay o'chiramiz
        await deleteDoc(reelRef);
        console.log("Firestore-dan video o'chirildi.");

        // 5. UI-ni yangilash: O'chirilgan videoni ekrandan silliq yo'qotamiz
        const reelDOMElement = document.getElementById(`reel-item-${docId}`);
        if (reelDOMElement) {
            // Animatsiya bilan yo'qolishi uchun chiroyli effekt beramiz
            reelDOMElement.style.transition = "all 0.4s ease";
            reelDOMElement.style.opacity = "0";
            reelDOMElement.style.transform = "scale(0.9)";
            
            setTimeout(() => {
                reelDOMElement.remove(); // DOM'dan (ekrandan) butunlay o'chirish
                
                // Agar o'chirilgan video oxirgisi bo'lsa va konteyner bo'shab qolsa
                const container = document.getElementById('reels-snap-container');
                if (container && container.children.length === 0) {
                    container.innerHTML = `<p style="color:white;text-align:center;padding:20px;">Videolar topilmadi.</p>`;
                }
            }, 400);
        }

        alert("Video muvaffaqiyatli o'chirildi!");

    } catch (error) {
        console.error("Videoni o'chirishda xatolik:", error);
        alert("O'chirish imkoni bo'lmadi. Internetni tekshirib qayta urinib ko'ring.");
    }
};



// ==========================================
// 3. REELNI TO‘LIQ EKRANDA OCHISH VA SCROLL QILISH
// ==========================================
window.viewFullReel = function(data, docId) {
    const viewer = document.getElementById('video-viewer-modal');
    if (!viewer) return;

    // 1. Modalni ochamiz
    viewer.style.display = 'flex';

    // 2. Videolarni modal konteyneriga chizib olamiz
    window.openReelsFeed(window.allReelsCache, docId);

    // 3. ID bo'yicha elementni topish va scroll qilish (Kutish funksiyasi bilan)
    const targetId = `reel-item-${docId}`;
    
    let attempts = 0;
    const scrollInterval = setInterval(() => {
        const targetReel = document.getElementById(targetId);
        attempts++;

        if (targetReel) {
            clearInterval(scrollInterval);
            // Element topildi, scroll qilamiz
            targetReel.scrollIntoView({ behavior: 'instant', block: 'start' });
            
            // Scroll qilingan videoni darhol ijro etish
            const video = targetReel.querySelector('.reel-video-element');
            if (video) video.play().catch(e => console.log("Avtoreplay taqiqlandi:", e));
            
        } else if (attempts >= 10) {
            clearInterval(scrollInterval);
            console.error("Xatolik: HTML elementi baribir topilmadi ->", targetId);
        }
    }, 50); // Har 50ms da tekshiradi (Jami 0.5 soniya imkoniyat)
};

// ==========================================
// 4. MODALNI YOPISH
// ==========================================
window.closeVideoViewer = function() {
     const viewer = document.getElementById('video-viewer-modal');
    if (viewer) viewer.style.display = 'none';

    // Modal ichidagi barcha videolarni to'xtatish
    const playingVideos = document.querySelectorAll('.reel-video-element');
    playingVideos.forEach(v => v.pause());
};

// ==========================================
// 5. YANGI REEL MODAL NAZORATI
// ==========================================
window.openAddReelModal  = () => { 
    const m = document.getElementById('add-reel-modal'); 
    if (m) m.style.display = 'flex'; 
};

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

    // 1. Yangi inputlardan qiymatlarni olamiz va bo'sh joylarni qirqamiz (trim)
    const name         = document.getElementById('disc-name')?.value.trim();
    const nickname     = document.getElementById('disc-nickname')?.value.trim();
    const age          = document.getElementById('disc-age')?.value.trim();
    const relationship = document.getElementById('disc-relationship')?.value;
    const location     = document.getElementById('disc-location')?.value.trim();
    const bio          = document.getElementById('discoveryBio')?.value.trim();

    // 2. Majburiy maydonlarni tekshiramiz (Ism, Nikname va Tavsif bo'sh bo'lmasligi kerak)
    if (!currentUser) return showToast('Tizimga kirishingiz kerak!', 'error');
    if (!name || !nickname || !bio) {
        return showToast('Iltimos, ism, nikname va tavsifni to\'ldiring!', 'error');
    }

    isUploadingDiscovery = true;
    const publishBtn = document.getElementById('publishBtn');
    if (publishBtn) { publishBtn.disabled = true; publishBtn.textContent = 'Yuklanmoqda...'; }

    try {
        const fileInput   = document.getElementById('discoveryFile');
        const selectedTag = document.querySelector('.disc-tag.active')?.getAttribute('data-tag') || 'other';
        let postImage = null;

        // Rasm yuklangan bo'lsa uni o'qiymiz
        if (fileInput?.files[0]) {
            postImage = await new Promise((res, rej) => {
                const r = new FileReader();
                r.onload  = (e) => res(e.target.result);
                r.onerror = () => rej(new Error("Fayl o'qilmadi"));
                r.readAsDataURL(fileInput.files[0]);
            });
        }

        // 3. Firebase Firestore'ga barcha yangi ma'lumotlarni yuboramiz
        await addDoc(collection(db, 'discovery'), {
            uid:          currentUser.uid,
            userPhoto:    currentUser.photoURL || '',
            
            // Foydalanuvchi o'zi kiritgan yangi maxsus ma'lumotlar
            name,
            nickname,
            age:          age ? parseInt(age) : 19, // Yoshi kiritilmagan bo'lsa default 19
            relationship: relationship || "Yolg'iz",
            location:     location || "Andijon",
            bio, 
            postImage,
            category:     selectedTag,
            createdAt:    serverTimestamp()
        });

        // Formani tozalash (Keyingi safar ochilganda bo'sh bo'lishi uchun)
        if(document.getElementById('disc-name')) document.getElementById('disc-name').value = '';
        if(document.getElementById('disc-nickname')) document.getElementById('disc-nickname').value = '';
        if(document.getElementById('disc-age')) document.getElementById('disc-age').value = '';
        if(document.getElementById('disc-location')) document.getElementById('disc-location').value = '';
        if(document.getElementById('discoveryBio')) document.getElementById('discoveryBio').value = '';
        if(document.getElementById('discoveryFile')) document.getElementById('discoveryFile').value = '';
        
        const preview = document.getElementById('discoveryPreview');
        if (preview) { preview.src = ''; preview.style.display = 'none'; }
        const placeholder = document.getElementById('uploadPlaceholder');
        if (placeholder) placeholder.style.display = 'block';

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
// 🔧 TO'LIQ TUZATILISH — loadDiscoveryFeed + O'CHIRISH TUGMASI
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

            // 1. Ism va Nickname moslashuvchanligi (Eski va yangi ma'lumotlar uchun)
            const displayName = data.name || data.userName || 'Foydalanuvchi';
            const nickname    = data.nickname || 'user';
            const age         = data.age || 19;
            const relationship= data.relationship || "Yolg'iz";
            const location    = data.location || "Andijon";
            
            // 2. Avatar fallback tizimi (Ism o'zgarganiga qarab avtomatik generatsiya bo'ladi)
            const photo = data.userPhoto || getFallbackAvatar(displayName);

            const div = document.createElement('div');
            div.className = 'discovery-card'; 

            div.innerHTML = `
                <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 14px; padding-bottom: 8px; border-bottom: 1px solid var(--border-strong);">
                    <img src="${photo}" alt="${escapeHTML(displayName)}"
                         style="width: 42px; height: 42px; border-radius: 50%; object-fit: cover; border: 2px solid var(--accent);">
                    <div style="display: flex; flex-direction: column; gap: 2px;">
                        <strong style="font-size: 0.95rem; color: var(--text-primary); font-weight: 600;">
                            ${escapeHTML(displayName)}
                        </strong>
                        <span style="font-size: 0.75rem; color: var(--text-muted);">
                            @${escapeHTML(nickname)} • E'lon joyladi
                        </span>
                    </div>
                </div>

                ${data.postImage ? `<img src="${data.postImage}" class="disc-card-image" alt="Post Image">` : ''}
                
                <div class="disc-info-badge-grid">
                    <div class="disc-badge">
                        <i class="fas fa-user"></i> 
                        <strong>${escapeHTML(displayName)}</strong>
                    </div>
                    <div class="disc-badge">
                        <i class="fas fa-at"></i> 
                        <span>@${escapeHTML(nickname)}</span>
                    </div>
                    <div class="disc-badge">
                        <i class="fas fa-birthday-cake"></i> 
                        <span>${age} yosh</span>
                    </div>
                    <div class="disc-badge">
                        <i class="fas fa-heart"></i> 
                        <span>${escapeHTML(relationship)}</span>
                    </div>
                    <div class="disc-badge" style="grid-column: span 2;">
                        <i class="fas fa-map-marker-alt"></i> 
                        <span>${escapeHTML(location)}</span>
                    </div>
                </div>
                
                <p class="disc-bio-text" style="color: var(--text-secondary); font-size: 0.88rem; line-height: 1.4; margin: 12px 0;">
                    ${escapeHTML(data.bio || '')}
                </p>

                <div style="margin-bottom: 12px;">
                    ${data.category ? `<span style="font-size:0.72rem; background:var(--bg-input); border:1px solid var(--border); color:var(--text-secondary); padding:4px 10px; border-radius:20px;">✨ ${escapeHTML(data.category)}</span>` : ''}
                </div>

                <div class="disc-card-actions">
                    ${!isMe ? `
                        <button onclick="sendInterest('${data.uid}','${escapeHTML(displayName)}')" class="btn-interest">
                            <i class="fas fa-fire"></i> Qiziqish bildirish
                        </button>
                        <button onclick="followUser('${data.uid}')" class="btn-secondary" style="padding: 10px 14px; border-radius: var(--radius);">
                            Obuna
                        </button>
                    ` : `
                        <div style="display: flex; width: 100%; gap: 10px; align-items: center;">
                            <div style="flex: 1; text-align:center; padding: 10px; background:var(--bg-input); border-radius:var(--radius); font-size:0.78rem; color:var(--text-muted); font-weight:500;">
                                ✨ Sizning e'loningiz
                            </div>
                            <button onclick="deleteDiscoveryPost('${docSnap.id}')" class="btn-delete-discovery" title="E'lonni o'chirish">
                                <i class="fas fa-trash-alt"></i>
                            </button>
                        </div>
                    `}
                </div>
            `;
            feed.appendChild(div);
        });
    }));
}

// Funksiyani window.deleteDiscoveryPost qilib biriktiramiz:
window.deleteDiscoveryPost = async function(postId) {
    const confirmDelete = confirm("Haqiqatan ham ushbu e'lonni o'chirib tashlamoqchimisiz?");
    if (!confirmDelete) return;

    try {
        await deleteDoc(doc(db, 'discovery', postId));
        alert("E'lon muvaffaqiyatli o'chirildi!");
    } catch (error) {
        console.error("O'chirishda xatolik:", error);
        alert("Xatolik yuz berdi. Qaytadan urinib ko'ring.");
    }
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
// MY POSTS (Profile Tabs Connected)
// ============================================================
function loadMyPosts(uid, activeTab = 'thoughts') {
    const grid = document.getElementById('my-posts-list');
    if (!grid || !uid) return;

    // Har safar tab almashganda grid tozalanishi va klasslar moslashishi uchun
    grid.innerHTML = '';
    
    // Agar "media" yoki "reels" tab bo'lsa grid uslubini qo'shish, aks holda olib tashlash (SMS uchun)
    if (activeTab === 'media' || activeTab === 'reels') {
        grid.classList.add('media-grid');
    } else {
        grid.classList.remove('media-grid');
    }

    const q = query(collection(db, 'posts'), where('uid', '==', uid), orderBy('createdAt', 'desc'), limit(30));

    // snapshotni o'rnatish — sizning obyekt ichidagi .set() metodidan foydalanamiz
    // Bu metod o'zi avtomatik ravishda eski 'myPosts' bo'lsa o'chirib yuboradi!
    const unsubscribe = onSnapshot(q, snap => {
        grid.innerHTML = '';
        
        const filteredDocs = snap.docs.filter(docSnap => {
    const data = docSnap.data();
    const hasImg = !!data.mediaURL; // Rasm bor-yo'qligi
    
    // Video yoki Reels ekanligini aniqlash (agar bazada videoURL bo'lsa yoki mediaURL ichida mp4 bo'lsa)
    const hasVideo = !!data.videoURL || (data.mediaURL && data.mediaURL.includes('.mp4')); 

    if (activeTab === 'media') {
        // Faqat rasmlar (videolarsiz)
        return hasImg && !hasVideo; 
    } 
    else if (activeTab === 'thoughts') {
        // Faqat matnli fikrlar (na rasm, na video bor)
        return !hasImg && !hasVideo; 
    } 
    else if (activeTab === 'reels') {
        // Faqat video kontentlar
        return hasVideo; 
    } 
    else if (activeTab === 'tagged') {
        // Belgilanganlar (boshqa foydalanuvchilar sizni tag qilgan postlar)
        // Agar bazada 'taggedUsers' massivi bo'lsa, o'sha orqali tekshiriladi
        return data.taggedUsers && data.taggedUsers.includes(uid);
    }
    
    return false; // Agar hech biriga tushmasa, adashib sharhlar chiqib ketmaydi
});

        // Agar tanlangan tabda ma'lumot yo'q bo'lsa
        if (filteredDocs.length === 0) {
            grid.innerHTML = `
                <div class="empty-state-minimal">
                    <i class="${activeTab === 'media' ? 'fas fa-camera-retro' : 'fas fa-pen-nib'}"></i>
                    <p>${activeTab === 'media' ? 'Hali rasmlar joylanmagan' : 'Hali fikrlar yozilmagan'}</p>
                </div>`;
            return;
        }

        // Elementlarni ekranga chiqarish
        filteredDocs.forEach(docSnap => {
            const data = docSnap.data();
            const el = document.createElement('div');

            if (activeTab === 'media') {
                // Media (Kvadrat rasm)
                el.className = 'media-post-item';
                el.innerHTML = `<img src="${data.mediaURL}" alt="Rivion Media" onclick="openPostModal('${docSnap.id}')">`;
            } else {
                // Fikrlar (SMS bubble)
                el.className = 'thought-bubble';
                el.innerHTML = escapeHTML(data.content || '');
                el.onclick = () => typeof openPostModal === 'function' && openPostModal(docSnap.id);
            }

            grid.appendChild(el);
        });
    });

    // Loyihangizdagi tayyor set() metodini chaqiramiz
    listeners.set('myPosts', unsubscribe);
}

document.querySelectorAll('.rivion-tabs button').forEach(tab => {
    tab.addEventListener('click', () => {
        // 1. Aktiv klassni almashtirish
        document.querySelectorAll('.rivion-tabs button').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        // 2. Qaysi tab bosilganini aniqlash (thoughts, media, reels, tagged)
        const currentTab = tab.getAttribute('data-ptab');
        const grid = document.getElementById('my-posts-list');
        
        if (!grid) return;

        // 3. Grid klasslarini boshqarish (Dizayn o'zgarishi uchun)
        if (currentTab === 'media' || currentTab === 'reels') {
            grid.classList.add('media-grid');
        } else {
            grid.classList.remove('media-grid');
        }

        // 4. Firestore'dan ma'lumotlarni qayta filtrlash uchun loadMyPosts funksiyasini chaqiramiz
        // (Agarda joriy foydalanuvchi IDsi aniq bo'lsa)
        if (typeof currentProfileUid !== 'undefined' && currentProfileUid) {
            loadMyPosts(currentProfileUid, currentTab);
        } else if (auth.currentUser) {
            loadMyPosts(auth.currentUser.uid, currentTab);
        }
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

// Global oynada ochish funksiyasi
window.openQuickCreate = function() {
    const sheet = document.getElementById('quick-create-sheet');
    if (!sheet) return;
    
    sheet.style.display = 'flex';
    setTimeout(() => {
        sheet.classList.add('active');
    }, 10);
};

// Global oynada yopish funksiyasi (X bosilganda)
window.closeQuickCreate = function() {
    const sheet = document.getElementById('quick-create-sheet');
    if (!sheet) return;
    
    sheet.classList.remove('active');
    setTimeout(() => {
        sheet.style.display = 'none';
    }, 350); // CSS transition vaqtiga mos
};

// E'lonlar modalini ochish funksiyasi xavfsiz holatda
window.openDiscoveryModal = function() {
    const modal = document.getElementById('discoveryModal');
    if (modal) {
        modal.style.display = 'flex';
        modal.classList.add('active');
    }
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
    initCommunityTabs(); // 🔥 [QO'SHILDI] Tablarni ishga tushirish
    window.showSection('home');
});




let currentOpenPostId = null; // Hozir ochilgan post ID-sini saqlash uchun

// 1. MODALNI OCHISH VA MA'LUMOTLARNI YUKLASH
async function openPostModal(postId) {
    currentOpenPostId = postId;
    const modal = document.getElementById('post-detail-modal');
    if (!modal) return;

    modal.style.display = 'flex';

    // Elementlarni tozalab turish (Yuklanayotgan paytda eski post ko'rinmasligi uchun)
    document.getElementById('modal-post-media-container').innerHTML = 'Yuklanmoqda...';
    document.getElementById('modal-post-comments-container').innerHTML = '';
    document.getElementById('modal-likes-count').innerText = '0 like';

    try {
        // Firestore'dan joriy postni bir marta o'qish
        const postDoc = await getDoc(doc(db, 'posts', postId));
        if (!postDoc.exists()) return;
        const postData = postDoc.data();

        // Rasm yoki matnni modal oynaning chap/tepa tomoniga joylash
        if (postData.mediaURL) {
            document.getElementById('modal-post-media-container').innerHTML = `
                <img src="${postData.mediaURL}" alt="Post media">`;
        } else {
            document.getElementById('modal-post-media-container').innerHTML = `
                <div style="padding:24px; font-size:16px; text-align:center;">${escapeHTML(postData.content || '')}</div>`;
        }

        // Muallif ma'lumotlari (Ism)
        document.getElementById('modal-post-author-info').innerHTML = `
            <strong>${escapeHTML(postData.displayName || 'Foydalanuvchi')}</strong>`;

        // Likelar sonini ko'rsatish va yurakchani tekshirish
        const likes = postData.likes || [];
        document.getElementById('modal-likes-count').innerText = `${likes.length} like`;
        
        const heartBtn = document.getElementById('modal-like-button');
        if (auth.currentUser && likes.includes(auth.currentUser.uid)) {
            heartBtn.innerHTML = '<i class="fas fa-heart"></i>'; // Qizil yurak
        } else {
            heartBtn.innerHTML = '<i class="far fa-heart"></i>'; // Bo'sh yurak
        }

        // POST SHARHLARINI REAL-VAQTLI YUKLASH (Subcollection or Array)
        // Agar sizda sharhlar post hujjatining ichida 'comments' array bo'lsa:
        loadModalComments(postData.comments || []);

    } catch (error) {
        console.error("Modal yuklashda xato:", error);
    }
}


// Funksiyani global qilib ochish, shunda HTML onclick uni topa oladi
window.openPostModal = openPostModal;
window.closePostModal = closePostModal;
window.toggleLikePost = toggleLikePost;
window.submitModalComment = submitModalComment;


// 2. SHARHLARNI EKRANGA CHIQARISH
function loadModalComments(commentsArray) {
    const container = document.getElementById('modal-post-comments-container');
    container.innerHTML = '';

    if (commentsArray.length === 0) {
        container.innerHTML = '<p style="color:gray; font-size:13px;">Hali sharhlar yo\'q...</p>';
        return;
    }

    commentsArray.forEach(comment => {
        const item = document.createElement('div');
        item.className = 'modal-comment-item';
        item.innerHTML = `<strong>${escapeHTML(comment.authorName || 'Anonim')}:</strong> <span>${escapeHTML(comment.text)}</span>`;
        container.appendChild(item);
    });
}

// 3. LIKE BOSISH MANTIQLARI
async function toggleLikePost() {
    if (!auth.currentUser || !currentOpenPostId) return;
    const uid = auth.currentUser.uid;
    const postRef = doc(db, 'posts', currentOpenPostId);

    try {
        const postDoc = await getDoc(postRef);
        let likes = postDoc.data().likes || [];

        if (likes.includes(uid)) {
            // Likeni qaytarib olish
            likes = likes.filter(id => id !== uid);
        } else {
            // Like qo'shish
            likes.push(uid);
        }

        await updateDoc(postRef, { likes: likes });
        
        // Modalni qayta yangilab qo'yish
        document.getElementById('modal-likes-count').innerText = `${likes.length} like`;
        document.getElementById('modal-like-button').innerHTML = likes.includes(uid) 
            ? '<i class="fas fa-heart"></i>' 
            : '<i class="far fa-heart"></i>';

    } catch (e) {
        console.error("Like bosishda xato:", e);
    }
}

// 4. YANGI SHARH YOZIB QOLDIRISH
async function submitModalComment() {
    const input = document.getElementById('modal-comment-input');
    if (!input || !input.value.trim() || !currentOpenPostId || !auth.currentUser) return;

    const postRef = doc(db, 'posts', currentOpenPostId);
    const newComment = {
        uid: auth.currentUser.uid,
        authorName: auth.currentUser.displayName || 'Foydalanuvchi',
        text: input.value.trim(),
        createdAt: new Date().toISOString()
    };

    try {
        // Firestore-da arrayUnion orqali sharhlar ro'yxatiga yangisini qo'shish
        await updateDoc(postRef, {
            comments: arrayUnion(newComment)
        });

        input.value = ''; // Inputni tozalash
        
        // Yangi qo'shilgan sharhni ko'rish uchun postni qayta o'qiymiz
        const updatedDoc = await getDoc(postRef);
        loadModalComments(updatedDoc.data().comments || []);

    } catch (e) {
        console.error("Sharh yuborishda xato:", e);
    }
}

// 5. MODALNI YOPISH
function closePostModal() {
    const modal = document.getElementById('post-detail-modal');
    if (modal) modal.style.display = 'none';
    currentOpenPostId = null;
}


// ============================================================
// 🎛️ HAMJAMIYAT (COMMUNITY) TABS CONTROLLER
// ============================================================
function initCommunityTabs() {
    document.querySelectorAll('.feed-tabs .feed-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            // 1. Aktiv klassni yangilash
            document.querySelectorAll('.feed-tabs .feed-tab').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');

            // 2. Qaysi tab bosilganini aniqlash
            const targetTab = e.target.getAttribute('data-comm');
            switchTabContent(targetTab);
        });
    });
}

// ============================================================
// 🎛️ TO'G'RILANGAN SWITCH TAB CONTENT (XATOSIZ VARIANT)
// ============================================================
function switchTabContent(tabName) {
    const feed = document.getElementById('discovery-feed');
    if (!feed) return;

    // 🔥 Xavfsiz tekshiruv: listeners qanday turda bo'lishidan qat'iy nazar xato bermaydi
    if (typeof listeners !== 'undefined') {
        if (typeof listeners.has === 'function' && listeners.has('discovery')) {
            listeners.get('discovery')();
            listeners.delete('discovery');
        } else if (listeners['discovery'] && typeof listeners['discovery'] === 'function') {
            // Agar listeners oddiy obyekt bo'lsa:
            listeners['discovery']();
            delete listeners['discovery'];
        }
    }

    // Ekran tozalanadi
    feed.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-muted);"><i class="fas fa-spinner fa-spin"></i> Yuklanmoqda...</div>';

    // Tanlangan bo'limga qarab tegishli funksiyani ishga tushiramiz
    if (tabName === 'discovery') {
        loadDiscoveryFeed(); 
    } else if (tabName === 'groups') {
        loadGroupsFeed();
    } else if (tabName === 'events') {
        loadEventsFeed();
    }
}

// ============================================================
// 👥 GURUHLAR BO'LIMI (YANGI O'ZGACHA DIZAYN)
// ============================================================
function loadGroupsFeed() {
    const feed = document.getElementById('discovery-feed');
    if (!feed) return;

    const q = query(collection(db, 'groups'), orderBy('createdAt', 'desc'), limit(20));

    const unsubscribe = onSnapshot(q, snap => {
        feed.innerHTML = '';
        
        if (snap.empty) {
            feed.innerHTML = `
                <div style="text-align:center; padding:50px 20px; color:var(--text-muted);">
                    <i class="fas fa-users" style="font-size:3rem; margin-bottom:12px; color: var(--border-strong);"></i>
                    <p style="font-size: 0.95rem;">Hozircha guruhlar yo'q.<br>Birinchilardan bo'lib o'z guruhingizni yarating!</p>
                </div>`;
            return;
        }

        snap.forEach(docSnap => {
            const data = docSnap.data();
            const isOwner = currentUser?.uid === data.creatorId; // Guruh egasini tekshirish
            const membersCount = data.membersCount || 1;

            // Tasodifiy gradient fonlar (agar maxsus rasm bo'lmasa ishlatish uchun)
            const bannerStyle = data.bannerImage 
                ? `background: url('${data.bannerImage}') center/cover;` 
                : `background: linear-gradient(135deg, var(--accent) 0%, #4f46e5 100%);`;

            const div = document.createElement('div');
            div.className = 'group-card'; 

            div.innerHTML = `
                <div class="group-banner" style="${bannerStyle}"></div>

                <div class="group-content">
                    <div class="group-avatar">
                        ${data.groupLogo ? `<img src="${data.groupLogo}" style="width:100%; height:100%; object-fit:cover; border-radius:9px;">` : `👥`}
                    </div>

                    <div class="group-title-row">
                        <h3 class="group-name">${escapeHTML(data.groupName || 'Nomisiz guruh')}</h3>
                        <span class="group-badge">${escapeHTML(data.category || 'Umumiy')}</span>
                    </div>

                    <div class="group-meta">
                        <span><i class="fas fa-users"></i> ${membersCount} ta a'zo</span>
                        <span><i class="fas fa-globe"></i> ${data.type === 'private' ? 'Yopiq guruh' : 'Ochiq guruh'}</span>
                    </div>
                    
                    <p class="group-desc">
                        ${escapeHTML(data.description || 'Guruh qoidalari va maqsadi haqida ma\'lumot berilmagan.')}
                    </p>

                    <div class="group-members-preview">
                        <div class="member-mini-avatar" style="background: #ef4444;"></div>
                        <div class="member-mini-avatar" style="background: #10b981;"></div>
                        <div class="member-mini-avatar" style="background: #3b82f6;"></div>
                        <span style="font-size: 0.75rem; color: var(--text-muted); margin-left: 6px;">+ qo'shilishdi</span>
                    </div>

                    <div style="display: flex; gap: 8px; align-items: center;">
                        ${!isOwner ? `
                            <button onclick="joinGroup('${docSnap.id}')" class="btn-interest" style="width: 100%; margin: 0; justify-content: center;">
                                <i class="fas fa-user-plus"></i> Guruhga a'zo bo'lish
                            </button>
                        ` : `
                            <div style="flex: 1; text-align:center; padding: 10px; background: var(--bg-input); border-radius: var(--radius); font-size: 0.78rem; color: var(--text-muted); font-weight: 500;">
                                👑 Siz asoschisiz
                            </div>
                            <button onclick="deleteGroup('${docSnap.id}')" class="btn-delete-discovery" style="padding: 10px 14px;" title="Guruhni o'chirish">
                                <i class="fas fa-trash-alt"></i>
                            </button>
                        `}
                    </div>
                </div>
            `;
            feed.appendChild(div);
        });
    }, error => {
        console.error("Guruhlarni yuklashda xatolik:", error);
    });

    if (typeof listeners !== 'undefined') {
        if (typeof listeners.set === 'function') listeners.set('discovery', unsubscribe);
        else listeners['discovery'] = unsubscribe;
    }
}

// 🗑️ Guruhni o'chirish funksiyasi
window.deleteGroup = async function(groupId) {
    if (!confirm("Haqiqatan ham ushbu guruhni butunlay o'chirib tashlamoqchimisiz?")) return;
    try {
        await deleteDoc(doc(db, 'groups', groupId));
        alert("Guruh muvaffaqiyatli o'chirildi!");
    } catch (error) {
        console.error(error);
        alert("Xatolik yuz berdi.");
    }
};


// ============================================================
// 📅 TADBIRLAR BO'LIMI (LOAD EVENTS)
// ============================================================
function loadEventsFeed() {
    const feed = document.getElementById('discovery-feed');
    if (!feed) return;

    const q = query(collection(db, 'events'), orderBy('createdAt', 'desc'), limit(20));

    listeners.set('discovery', onSnapshot(q, snap => {
        feed.innerHTML = '';

        if (snap.empty) {
            feed.innerHTML = `
                <div style="text-align:center; padding:40px 20px; color:var(--text-muted);">
                    <i class="fas fa-calendar-alt" style="font-size:2.5rem; margin-bottom:10px;"></i>
                    <p>Yaqin orada hech qanday tadbir rejalashtirilmagan.</p>
                </div>`;
            return;
        }

        snap.forEach(docSnap => {
            const data = docSnap.data();
            const div = document.createElement('div');
            div.className = 'discovery-card';

            div.innerHTML = `
                <div style="margin-bottom: 10px;">
                    <span style="font-size: 0.7rem; background: #f59e0b; color: white; padding: 3px 8px; border-radius: 4px; font-weight: bold; text-transform: uppercase;">
                        📅 TADBIY / UCHRASHUV
                    </span>
                    <h3 style="font-size: 1.1rem; color: var(--text-primary); margin: 6px 0 4px 0;">${escapeHTML(data.title || 'Mavzusiz tadbir')}</h3>
                </div>

                <div style="display:flex; flex-direction:column; gap: 6px; background: var(--bg-input); padding: 10px; border-radius: var(--radius); margin: 10px 0; font-size: 0.82rem; color: var(--text-secondary);">
                    <div><i class="fas fa-clock" style="color:var(--accent); width:20px;"></i> <b>Vaqti:</b> ${escapeHTML(data.date || 'Belgilanmagan')}</div>
                    <div><i class="fas fa-map-marker-alt" style="color:#ef4444; width:20px;"></i> <b>Joylashuv:</b> ${escapeHTML(data.location || 'Onlayn')}</div>
                </div>

                <p style="font-size: 0.88rem; color: var(--text-secondary); margin: 10px 0;">
                    ${escapeHTML(data.description || 'Tadbir tafsilotlari mavjud emas.')}
                </p>

                <div class="disc-card-actions" style="margin-top:15px;">
                    <button onclick="acceptEvent('${docSnap.id}')" class="btn-interest" style="width:100%; background: #10b981;">
                        <i class="fas fa-check"></i> Boraman / Qatnashaman
                    </button>
                </div>
            `;
            feed.appendChild(div);
        });
    }, error => {
        console.error("Tadbirlarni yuklashda xatolik:", error);
    }));
}

// Global namunaviy funksiyalar (Window obyektiga)
window.joinGroup = function(groupId) {
    alert("Siz guruhga muvaffaqiyatli a'zo bo'ldingiz!");
};

window.acceptEvent = function(eventId) {
    alert("Tadbir ro'yxatiga qo'shildingiz!");
};

const textarea = document.getElementById('postText');
const postButton = document.getElementById('postBtn');

if (textarea) {
    textarea.addEventListener('input', function() {
        // Balandlikni matnga moslab o'stiramiz
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight) + 'px';
        
        // Bo'sh bo'lsa tugmani o'chirish, matn bo'lsa yoqish
        if (this.value.trim().length > 0) {
            postButton.removeAttribute('disabled');
        } else {
            postButton.setAttribute('disabled', 'true');
        }
    });
}

function openCommunityModal() {
    // Modal oynani ochish kodi (masalan, uni blokini ko'rsatish)
    document.getElementById('communityModal').style.display = 'block'; 
}

// Tanlangan video faylini saqlash uchun global o'zgaruvchi
let selectedReelFile = null;

// ========================================================
// 1. FAYL TANLANGANDA PREVIEW KO'RSATISH VA FAYLNI SAQLASH
// ========================================================
window.handleReelFile = function(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Maksimal o'lcham 100MB (HTML dagi shartga ko'ra)
    if (file.size > 100 * 1024 * 1024) {
        alert("Video o'lchami 100MB dan oshmasligi kerak!");
        return;
    }

    selectedReelFile = file;

    // HTML elementlarni topamiz
    const placeholder = document.getElementById('upload-placeholder');
    const previewContainer = document.getElementById('video-preview-container');
    const videoPreview = document.getElementById('reel-preview');

    // Tanlangan videoni ekranda ko'rsatish (Preview)
    if (placeholder && previewContainer && videoPreview) {
        const fileURL = URL.createObjectURL(file);
        videoPreview.src = fileURL;
        
        placeholder.style.display = 'none';       // Yuklash so'rovini yashirish
        previewContainer.style.display = 'block'; // Videoni o'zini ko'rsatish
        videoPreview.play().catch(e => console.log("Preview pley bo'lmadi:", e));
    }

    console.log("Video muvaffaqiyatli tanlandi:", file.name);
};

// ========================================================
// 2. VIDEONI PROGRESS BAR BILAN SUPABASE-GA YUKLASH (FIXED)
// ========================================================
window.shareReel = async function() {
    try {
        const user = auth.currentUser;
        if (!user) {
            alert("Video yuklash uchun tizimga kiring!");
            return;
        }

        // 1. INPUT ELEMENTINI VA FAYLNI MAJBURIY QIDIRIB TOPAMIZ
        const fileInput = document.getElementById('reel-video-input') || 
                          document.querySelector('input[type="file"]') || 
                          document.querySelector('.modal-body input[type="file"]');
        
        // Birinchi navbatda input ichidagi faylni tekshiramiz, agar u bo'sh bo'lsa global o'zgaruvchini olamiz
        let fileToUpload = null;
        if (fileInput && fileInput.files && fileInput.files.length > 0) {
            fileToUpload = fileInput.files[0];
        } else if (typeof selectedReelFile !== 'undefined' && selectedReelFile) {
            fileToUpload = selectedReelFile;
        }

        // Agar hech qayerdan fayl topilmasa
        if (!fileToUpload) {
            alert("Iltimos, avval video fayl tanlang yoki qaytadan yuklang!");
            return;
        }

        const progressContainer = document.getElementById('upload-progress-container');
        const progressFill = document.getElementById('upload-progress-fill');
        const progressText = document.getElementById('progress-text');

        // Progress barlarni ishga tushiramiz
        if (progressContainer) progressContainer.style.display = 'block';
        if (progressFill) progressFill.style.width = '10%';
        if (progressText) progressText.innerText = "Yuklash boshlanmoqda...";

        // 2. UNIKAL FAYL NOMI YARATISH
        const fileExt = fileToUpload.name ? fileToUpload.name.split('.').pop() : 'mp4';
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 7)}.${fileExt}`;

        if (progressFill) progressFill.style.width = '30%';
        if (progressText) progressText.innerText = "Supabase'ga yuklanyapti...";

        // 3. SUPABASE STORAGE'GA TO'G'RIDAN-TO'G'RI YUKLASH
        const { data: uploadData, error: uploadError } = await supabase
            .storage
            .from('videos') // Sening Supabase panelingdagi bucket nomi
            .upload(fileName, fileToUpload, {
                cacheControl: '3600',
                upsert: false
            });

        if (uploadError) throw uploadError;

        if (progressFill) progressFill.style.width = '70%';
        if (progressText) progressText.innerText = "Havola olinmoqda...";

        // 4. SUPABASE'DAN OCHIQ (PUBLIC) URL MANZILINI OLISH
        const { data: urlData } = supabase
            .storage
            .from('videos')
            .getPublicUrl(fileName);

        const cleanVideoURL = urlData.publicUrl;

        if (progressFill) progressFill.style.width = '90%';
        if (progressText) progressText.innerText = "Firestore'ga yozilmoqda...";

        // 5. FIRESTORE-GA YANGI REEL MA'LUMOTLARINI YOZISH
        const captionInput = document.getElementById('reel-caption') || document.querySelector('.modal-body textarea');
        const captionText = captionInput ? captionInput.value : "";

        await addDoc(collection(db, "reels"), {
            userId: user.uid,
            userName: user.displayName || user.email.split('@')[0] || "Foydalanuvchi",
            userAvatar: user.photoURL || "profil-rasm.jpg",
            videoURL: cleanVideoURL, // Muammosiz, CORS xatosiz ishlaydigan Supabase linki
            caption: captionText,
            likes: [],
            createdAt: serverTimestamp()
        });

        // 6. PROCESS YAKUNLANDI
        if (progressFill) progressFill.style.width = '100%';
        if (progressText) progressText.innerText = "100% yuklandi!";
        
        alert("Video muvaffaqiyatli yuklandi va ulashildi!");

        // Tozalash va modalni yopish
        if (typeof selectedReelFile !== 'undefined') selectedReelFile = null;
        if (fileInput) fileInput.value = ''; // Inputni tozalash
        if (captionInput) captionInput.value = '';
        
        if (progressContainer) progressContainer.style.display = 'none';
        
        if (typeof closeAddReelModal === 'function') {
            closeAddReelModal();
        } else {
            location.reload();
        }

    } catch (error) {
        console.error("shareReel ichida xatolik:", error);
        alert("Videoni yuklashda xato bo'ldi: " + error.message);
        
        const progressContainer = document.getElementById('upload-progress-container');
        if (progressContainer) progressContainer.style.display = 'none';
    }
};

// --- Karakter sanagich ---
document.addEventListener('DOMContentLoaded', () => {
    const captionArea = document.getElementById('reel-caption') || document.querySelector('.modal-body textarea');
    const charCount = document.getElementById('reelCaptionCount');
    if (captionArea && charCount) {
        captionArea.addEventListener('input', (e) => {
            charCount.innerText = e.target.value.length;
        });
    }
});