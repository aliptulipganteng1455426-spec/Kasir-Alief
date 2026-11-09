const STORAGE_KEY = "toko-anjar-kasir-v1";
const LEGACY_PRODUCTS_KEY = "toko-anjar-custom-products";
const TUTORIAL_SEEN_KEY = "toko-anjar-tutorial-seen-v1";
const LEGACY_MIGRATION_DISMISSED_KEY = "toko-anjar-legacy-migration-dismissed-v1";
const firebaseConfig = {
    apiKey: "AIzaSyBy6tJ1TuAefIfIj6c87vH0UlmBTaPOaak",
    authDomain: "kasir-pintar-3ec67.firebaseapp.com",
    projectId: "kasir-pintar-3ec67",
    storageBucket: "kasir-pintar-3ec67.firebasestorage.app",
    messagingSenderId: "1073604352938",
    appId: "1:1073604352938:web:0223724debd6fc67cae9d3",
    measurementId: "G-NHM06SY5MQ"
};
const currency = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
const localDateTime = () => {
    const date = new Date();
    date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
    return date.toISOString().slice(0, 16);
};
const today = () => localDateTime().slice(0, 10);
const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function createDefaultState() {
    return {
        settings: { businessName: "Toko Anjar", owner: "Alip", phone: "", email: "", address: "", currency: "IDR", qrisImage: "" },
        categories: ["Sembako", "Minuman", "Camilan", "Kebutuhan rumah"].map((name) => ({ id: makeId(), name, type: "Barang" })),
        products: [],
        customers: [],
        suppliers: [],
        debts: [],
        purchases: [],
        stocktakes: [],
        transactions: [],
        finance: [],
        promotions: [],
        staff: [],
        shifts: [],
        ppobTransactions: []
    };
}

let state = createDefaultState();
let activePage = "dashboard";
let modalFormContext = null;
let cart = new Map();
let lastAddedProductId = "";
let salePaymentMethod = "Tunai";
let saleCashReceived = "";
let saleQrisConfirmationToken = "";
let saleQrisBasketToken = "";
let saleCustomerValue = "";
let salePromotionValue = "";
let activeProductGroup = "";
let storageError = "";
let toastTimer;
let productSortOrder = "asc";
let productSearchQuery = "";
let activeStorageKey = STORAGE_KEY;
let firebaseAuth = null;
let firestore = null;
let firebaseUser = null;
let accountStateLoaded = false;
let cloudSyncTimer;
let cloudSaveQueue = Promise.resolve();

const pageContent = document.getElementById("pageContent");
const modalRoot = document.getElementById("modalRoot");
const sideNav = document.getElementById("sideNav");
const toast = document.getElementById("toast");
const tutorialRoot = document.getElementById("tutorialRoot");
const appShell = document.getElementById("appShell");
const authScreen = document.getElementById("authScreen");
const authStatus = document.getElementById("authStatus");

const TUTORIAL_STEPS = [
    {
        icon: "⌂",
        title: "Mulai dari dashboard",
        description: "Dashboard menampilkan ringkasan penjualan hari ini, jumlah produk, stok menipis, dan kasbon yang belum lunas.",
        tip: "Gunakan menu di sisi kiri untuk berpindah ke bagian aplikasi lainnya."
    },
    {
        icon: "▦",
        title: "Atur produk dan persediaan",
        description: "Buka Barang / jasa untuk menambah produk beserta harga dan stok. Kategori membantu merapikan daftar, sedangkan Manajemen stok dan Stok opname digunakan untuk memperbarui persediaan.",
        tip: "Isi harga dan jumlah stok dengan teliti agar transaksi dan laporan lebih akurat."
    },
    {
        icon: "▣",
        title: "Catat transaksi penjualan",
        description: "Buka Transaksi penjualan, pilih produk, atur jumlah, pilih pelanggan atau promosi bila diperlukan, lalu tentukan metode pembayaran.",
        tip: "Untuk QRIS statis, pastikan pembayaran masuk di aplikasi merchant sebelum menyelesaikan transaksi."
    },
    {
        icon: "▤",
        title: "Pantau hasil dan cadangkan data",
        description: "Laporan berisi riwayat transaksi dan menyediakan unduhan CSV. Di Pengaturan aplikasi, Anda dapat mengatur profil usaha serta mengunduh atau memulihkan cadangan data.",
        tip: "Data tersimpan di browser pada perangkat ini. Unduh cadangan secara berkala."
    }
];

let tutorialStep = 0;
let tutorialReturnFocus = null;

const NAV_ITEMS = [
    { id: "dashboard", label: "Dashboard", icon: "⌂", group: "UTAMA" },
    { id: "sales", label: "Transaksi penjualan", icon: "▣", group: "TRANSAKSI" },
    { id: "kasbon", label: "Kasbon pelanggan", icon: "◷", group: "TRANSAKSI" },
    { id: "ppob", label: "PPOB", icon: "▤", group: "TRANSAKSI" },
    { id: "products", label: "Barang / jasa", icon: "▦", group: "MANAJEMEN" },
    { id: "categories", label: "Kategori barang", icon: "▧", group: "MANAJEMEN" },
    { id: "item-groups", label: "Pemilah barang", icon: "▤", group: "MANAJEMEN" },
    { id: "inventory", label: "Manajemen stok", icon: "▥", group: "MANAJEMEN" },
    { id: "customers", label: "Pelanggan", icon: "♙", group: "MANAJEMEN" },
    { id: "purchases", label: "Pembelian barang", icon: "⇩", group: "MANAJEMEN" },
    { id: "stocktake", label: "Stok opname", icon: "☷", group: "MANAJEMEN" },
    { id: "suppliers", label: "Pemasok", icon: "♧", group: "MANAJEMEN" },
    { id: "debts", label: "Hutang & piutang", icon: "⇄", group: "KEUANGAN" },
    { id: "marketing", label: "Pemasaran", icon: "％", group: "KEUANGAN" },
    { id: "finance", label: "Keuangan", icon: "◈", group: "KEUANGAN" },
    { id: "reports", label: "Laporan", icon: "▤", group: "LAINNYA" },
    { id: "staff", label: "Manajemen staf", icon: "♧", group: "LAINNYA" },
    { id: "shifts", label: "Shift", icon: "◷", group: "LAINNYA" },
    { id: "settings", label: "Pengaturan aplikasi", icon: "⚙", group: "LAINNYA" }
];

const TITLES = Object.fromEntries(NAV_ITEMS.map((item) => [item.id, item.label]));

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[character]);
}

function safeJSON(value) {
    try { return JSON.parse(value); } catch { return null; }
}

function normalizedState(parsed) {
    const keys = ["categories", "products", "customers", "suppliers", "debts", "purchases", "stocktakes", "transactions", "finance", "promotions", "staff", "shifts", "ppobTransactions"];
    if (!parsed || typeof parsed !== "object" || !keys.every((key) => Array.isArray(parsed[key])) || !parsed.settings || typeof parsed.settings !== "object") return null;
    const defaults = createDefaultState();
    return {
        ...defaults,
        ...parsed,
        settings: { ...defaults.settings, ...parsed.settings },
        products: parsed.products.map((product) => ({ ...product, barcode: String(product.barcode || "") }))
    };
}

function loadState(storageKey = activeStorageKey) {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
        const parsed = normalizedState(safeJSON(saved));
        if (!parsed) throw new Error("Data lokal tersimpan tidak valid. Buat cadangan sebelum melanjutkan.");
        state = parsed;
        return;
    }

    const initial = createDefaultState();
    const legacy = safeJSON(localStorage.getItem(LEGACY_PRODUCTS_KEY) || "[]");
    if (Array.isArray(legacy)) {
        for (const product of legacy) {
            if (product && typeof product.name === "string" && Number.isSafeInteger(product.price) && product.price > 0) {
                initial.products.push({
                    id: `legacy-${product.id || makeId()}`,
                    name: product.name.slice(0, 60),
                    type: "Barang",
                    category: initial.categories.some((item) => item.name === product.category) ? product.category : "Sembako",
                    barcode: "",
                    trackStock: true,
                    showStock: true,
                    stock: 0,
                    cost: 0,
                    price: product.price,
                    weight: "",
                    unit: "pcs",
                    discount: 0,
                    shelf: "",
                    description: product.detail || "",
                    image: ""
                });
            }
        }
    }
    state = initial;
    try {
        localStorage.setItem(storageKey, JSON.stringify(state));
    } catch {
        storageError = "Penyimpanan browser tidak tersedia. Perubahan data belum dapat disimpan.";
    }
}

function accountDataReference(user = firebaseUser) {
    return firestore.collection("users").doc(user.uid).collection("appData").doc("main");
}

async function writeCloudState(snapshot = state, user = firebaseUser) {
    if (!user || !firestore) return false;
    const payloadSize = new TextEncoder().encode(JSON.stringify(snapshot)).length;
    if (payloadSize > 900000) {
        showToast("Data terlalu besar untuk sinkronisasi Firestore. Unduh cadangan dan kurangi gambar berukuran besar.", true);
        return false;
    }
    const reference = accountDataReference(user);
    cloudSaveQueue = cloudSaveQueue.catch(() => {}).then(() => reference.set({
        state: snapshot,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }));
    try {
        await cloudSaveQueue;
        return true;
    } catch (error) {
        showToast("Sinkronisasi gagal. Periksa koneksi, Firestore, dan aturan akses database.", true);
        console.error("Firebase sync failed:", error);
        return false;
    }
}

function queueCloudSync(snapshot) {
    if (!firebaseUser) return;
    window.clearTimeout(cloudSyncTimer);
    const copy = structuredClone(snapshot);
    cloudSyncTimer = window.setTimeout(() => { void writeCloudState(copy); }, 700);
}

async function openAccount(user) {
    firebaseUser = user;
    accountStateLoaded = false;
    appShell.hidden = true;
    authScreen.hidden = false;
    document.getElementById("authRecovery").hidden = true;
    authStatus.textContent = "Memuat data akun...";
    activeStorageKey = `${STORAGE_KEY}:${user.uid}`;
    storageError = "";

    try {
        const snapshot = await accountDataReference(user).get();
        if (firebaseAuth.currentUser?.uid !== user.uid) return;

        if (snapshot.exists) {
            const remoteState = normalizedState(snapshot.data()?.state);
            if (!remoteState) throw new Error("Data akun di Firestore memiliki format yang tidak valid.");
            state = remoteState;
            localStorage.setItem(activeStorageKey, JSON.stringify(state));
        } else {
            const savedAccountData = localStorage.getItem(activeStorageKey);
            if (savedAccountData) {
                const accountState = normalizedState(safeJSON(savedAccountData));
                if (!accountState) throw new Error("Data lokal akun ini tidak valid. Buat cadangan sebelum melanjutkan.");
                state = accountState;
            } else {
                const hasLegacyData = Boolean(localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_PRODUCTS_KEY));
                const shouldMigrate = hasLegacyData && localStorage.getItem(LEGACY_MIGRATION_DISMISSED_KEY) !== "true"
                    && window.confirm(`Pindahkan data kasir lama di browser ini ke akun ${user.email || "ini"}? Data hanya akan disalin ke akun yang sedang masuk.`);
                if (shouldMigrate) {
                    loadState(STORAGE_KEY);
                    if (storageError) throw new Error(storageError);
                } else {
                    if (hasLegacyData) localStorage.setItem(LEGACY_MIGRATION_DISMISSED_KEY, "true");
                    loadState(activeStorageKey);
                    if (storageError) throw new Error(storageError);
                }
            }
            localStorage.setItem(activeStorageKey, JSON.stringify(state));
            const saved = await writeCloudState(state, user);
            if (!saved) throw new Error("Data lokal tetap ada, tetapi belum berhasil disimpan ke Firestore.");
        }

        if (firebaseAuth.currentUser?.uid !== user.uid) return;
        authScreen.hidden = true;
        appShell.hidden = false;
        accountStateLoaded = true;
        renderApp();
        showTutorialOnFirstVisit();
    } catch (error) {
        const errorMessage = String(error.message || "");
        if (error.code === "unavailable" || /client is offline/i.test(errorMessage)) {
            authStatus.textContent = "Firestore tidak dapat dijangkau. Periksa koneksi internet dan pastikan database Firestore sudah dibuat, lalu pilih Coba lagi.";
        } else if (error.code === "permission-denied") {
            authStatus.textContent = "Akses Firestore ditolak. Pastikan firestore.rules sudah dipublikasikan dan mengizinkan UID akun yang sedang masuk.";
        } else if (error.code === "not-found") {
            authStatus.textContent = "Database Firestore belum ditemukan. Buat database Cloud Firestore di Firebase Console, lalu pilih Coba lagi.";
        } else {
            authStatus.textContent = `${errorMessage || "Data akun gagal dimuat."} Periksa konfigurasi Firestore, lalu pilih Coba lagi.`;
        }
        document.getElementById("authRecovery").hidden = false;
        console.error("Firebase account setup failed:", error);
    }
}

function signInWithProvider(providerName) {
    if (!firebaseAuth) {
        authStatus.textContent = "Firebase belum siap. Periksa koneksi internet dan konfigurasi SDK.";
        return;
    }
    const provider = providerName === "google"
        ? new firebase.auth.GoogleAuthProvider()
        : new firebase.auth.FacebookAuthProvider();
    if (providerName === "google") provider.setCustomParameters({ prompt: "select_account" });
    firebaseAuth.signInWithPopup(provider).catch((error) => {
        const providerLabel = providerName === "google" ? "Google" : "Facebook";
        authStatus.textContent = error.code === "auth/configuration-not-found"
            ? "Konfigurasi Firebase Authentication belum ditemukan. Pastikan Authentication sudah dimulai dan apiKey serta projectId cocok dengan project ini."
            : error.code === "auth/unauthorized-domain"
            ? `Domain ${window.location.hostname} belum diizinkan. Tambahkan ${window.location.hostname} di Firebase Authentication > Settings > Authorized domains, atau buka website melalui localhost.`
            : error.code === "auth/operation-not-allowed"
                ? `Login ${providerLabel} belum diaktifkan di Firebase Authentication.`
                : error.code === "auth/popup-blocked"
                    ? "Popup login diblokir browser. Izinkan popup lalu coba lagi."
                    : `Login ${providerLabel} gagal. Periksa koneksi dan pengaturan provider Firebase.`;
        console.error("Firebase sign-in failed:", error);
    });
}

async function signOutCurrentUser() {
    window.clearTimeout(cloudSyncTimer);
    if (firebaseUser && accountStateLoaded) await writeCloudState(state);
    await firebaseAuth.signOut();
}

function initializeFirebase() {
    appShell.hidden = true;
    authScreen.hidden = false;
    if (window.location.protocol === "file:") {
        authStatus.textContent = "Login Google tidak bisa digunakan dari file lokal. Buka aplikasi melalui localhost atau HTTPS, lalu coba lagi.";
        return;
    }
    if (typeof firebase === "undefined") {
        authStatus.textContent = "Firebase SDK tidak dapat dimuat. Buka website dengan koneksi internet dan melalui localhost atau HTTPS.";
        return;
    }
    try {
        if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
        firebaseAuth = firebase.auth();
        firestore = firebase.firestore();
        document.getElementById("googleSignIn").disabled = false;
        document.getElementById("facebookSignIn").disabled = false;
        authStatus.textContent = "";
        firebaseAuth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch((error) => console.error("Auth persistence error:", error));
        firebaseAuth.onAuthStateChanged((user) => {
            if (user) void openAccount(user);
            else {
                firebaseUser = null;
                accountStateLoaded = false;
                activeStorageKey = STORAGE_KEY;
                state = createDefaultState();
                appShell.hidden = true;
                authScreen.hidden = false;
                document.getElementById("authRecovery").hidden = true;
                authStatus.textContent = "";
            }
        }, (error) => {
            authScreen.hidden = false;
            authStatus.textContent = "Tidak dapat memeriksa sesi akun. Muat ulang halaman dan coba lagi.";
            console.error("Firebase auth state error:", error);
        });
    } catch (error) {
        authScreen.hidden = false;
        authStatus.textContent = "Konfigurasi Firebase belum dapat digunakan. Periksa pengaturan aplikasi Web di Firebase Console.";
        console.error("Firebase initialization failed:", error);
    }
}

function saveState(mutator, successMessage, afterCommit = null) {
    if (storageError) {
        showToast(storageError, true);
        return false;
    }

    const draft = structuredClone(state);
    mutator(draft);
    try {
        localStorage.setItem(activeStorageKey, JSON.stringify(draft));
    } catch {
        showToast("Data belum tersimpan. Ruang penyimpanan browser mungkin penuh.", true);
        return false;
    }
    state = draft;
    queueCloudSync(draft);
    if (afterCommit) afterCommit();
    if (successMessage) showToast(successMessage);
    renderApp();
    return true;
}

function showToast(message, isError = false) {
    toast.textContent = message;
    toast.classList.toggle("error", isError);
    toast.classList.add("visible");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove("visible"), 3500);
}

function renderTutorialStep() {
    const step = TUTORIAL_STEPS[tutorialStep];
    document.getElementById("tutorialProgress").innerHTML = TUTORIAL_STEPS.map((_, index) =>
        `<span class="tutorial-progress-dot ${index === tutorialStep ? "active" : ""}" aria-label="Langkah ${index + 1}" ${index === tutorialStep ? 'aria-current="step"' : ""}></span>`
    ).join("");
    document.getElementById("tutorialIcon").textContent = step.icon;
    document.getElementById("tutorialTitle").textContent = step.title;
    document.getElementById("tutorialDescription").textContent = step.description;
    document.getElementById("tutorialTip").textContent = step.tip;

    const previousButton = document.getElementById("tutorialPrevious");
    const nextButton = document.getElementById("tutorialNext");
    previousButton.disabled = tutorialStep === 0;
    nextButton.textContent = tutorialStep === TUTORIAL_STEPS.length - 1 ? "Selesai" : "Lanjut";
}

function openTutorial() {
    tutorialReturnFocus = document.activeElement;
    tutorialStep = 0;
    renderTutorialStep();
    tutorialRoot.hidden = false;
    tutorialRoot.setAttribute("aria-hidden", "false");
    document.body.classList.add("tutorial-open");
    document.getElementById("tutorialNext").focus();
}

function closeTutorial() {
    tutorialRoot.hidden = true;
    tutorialRoot.setAttribute("aria-hidden", "true");
    document.body.classList.remove("tutorial-open");
    try {
        localStorage.setItem(TUTORIAL_SEEN_KEY, "true");
    } catch {
        showToast("Panduan ditutup, tetapi preferensi belum dapat disimpan di browser ini.", true);
    }
    if (tutorialReturnFocus instanceof HTMLElement) tutorialReturnFocus.focus();
}

function showTutorialOnFirstVisit() {
    try {
        if (localStorage.getItem(TUTORIAL_SEEN_KEY) !== "true") openTutorial();
    } catch {
        openTutorial();
    }
}

function formatDate(value) {
    if (!value) return "—";
    const date = new Date(`${value.slice(0, 10)}T00:00:00`);
    return Number.isNaN(date.getTime()) ? escapeHTML(value) : new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric" }).format(date);
}

function formatDateTime(value) {
    if (!value) return "—";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? escapeHTML(value) : new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function sum(items, field) {
    return items.reduce((total, item) => total + Number(item[field] || 0), 0);
}

function getProduct(id, data = state) {
    return data.products.find((product) => String(product.id) === String(id));
}

function getCustomerOptions() {
    return state.customers.map((item) => ({ value: item.name, label: item.name }));
}

function getSupplierOptions() {
    return state.suppliers.map((item) => ({ value: item.name, label: item.name }));
}

function getProductOptions() {
    return state.products.map((item) => ({ value: item.id, label: item.name }));
}

function getStaffOptions() {
    return state.staff.map((item) => ({ value: item.name, label: item.name }));
}

function renderNavigation() {
    let group = "";
    sideNav.innerHTML = NAV_ITEMS.map((item) => {
        const header = item.group !== group ? `<div class="nav-group-label">${item.group}</div>` : "";
        group = item.group;
        return `${header}<button class="nav-item ${activePage === item.id ? "active" : ""}" type="button" data-page="${item.id}" aria-current="${activePage === item.id ? "page" : "false"}"><span class="nav-icon" aria-hidden="true">${item.icon}</span><span>${item.label}</span>${item.id === "inventory" ? `<span class="nav-count">${state.products.filter((product) => product.trackStock && product.stock <= 5).length}</span>` : ""}</button>`;
    }).join("");
}

function pageHeader(title, description, action = "") {
    return `<div class="page-heading"><div><p class="eyebrow">${escapeHTML(state.settings.businessName)}</p><h1>${title}</h1><p>${description}</p></div>${action}</div>`;
}

function button(label, action, className = "button button-primary", extra = "") {
    return `<button type="button" class="${className}" data-action="${escapeHTML(action)}" ${extra}>${label}</button>`;
}

function statCard(label, value, icon, note = "") {
    return `<article class="stat-card"><span class="stat-icon">${icon}</span><div><p>${label}</p><strong>${value}</strong><small>${note}</small></div></article>`;
}

function renderDashboard() {
    const salesToday = state.transactions.filter((item) => item.date?.slice(0, 10) === today());
    const paidSales = salesToday.filter((item) => item.status !== "Belum lunas");
    const revenue = sum(paidSales, "total");
    const lowStock = state.products.filter((product) => product.trackStock && product.stock <= 5);
    const unpaidDebts = state.debts.filter((item) => item.status !== "Lunas");
    const recent = [...state.transactions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);

    pageContent.innerHTML = `
        ${pageHeader("Dashboard", "Ringkasan usaha hari ini. Semua nominal ditampilkan dalam Rupiah.", button('<span aria-hidden="true">＋</span> Transaksi baru', "go-sales"))}
        <div class="welcome-banner"><div><span class="welcome-icon">✦</span><div><strong>Selamat datang, ${escapeHTML(state.settings.owner || "Pemilik")}!</strong><p>Semoga operasional ${escapeHTML(state.settings.businessName)} berjalan lancar hari ini.</p></div></div><span class="banner-date">${formatDate(today())}</span></div>
        <section class="stats-grid">
            ${statCard("Penjualan hari ini", currency.format(revenue), "↗", `${salesToday.length} transaksi`)}
            ${statCard("Produk terdaftar", state.products.length, "▦", `${state.categories.length} kategori`)}
            ${statCard("Stok menipis", lowStock.length, "!", "Perlu diperiksa")}
            ${statCard("Kasbon belum lunas", currency.format(sum(unpaidDebts.filter((item) => item.type === "Piutang"), "amount")), "◷", `${unpaidDebts.filter((item) => item.type === "Piutang").length} pelanggan`)}
        </section>
        <div class="dashboard-grid">
            <section class="panel"><div class="panel-heading"><div><h2>Transaksi terbaru</h2><p>Aktivitas penjualan terkini</p></div>${button("Lihat laporan →", "go-reports", "button button-quiet")}</div>${recent.length ? renderTable([{ key: "id", label: "No. transaksi", format: (row) => escapeHTML(String(row.id).slice(-8)) }, { key: "date", label: "Waktu", format: (row) => formatDateTime(row.date) }, { key: "customer", label: "Pelanggan" }, { key: "total", label: "Total", format: (row) => currency.format(row.total) }], recent) : emptyState("Belum ada transaksi", "Transaksi yang selesai akan tampil di sini.")}</section>
            <section class="panel"><div class="panel-heading"><div><h2>Perlu perhatian</h2><p>Stok dan tagihan yang perlu dipantau</p></div></div>
                ${lowStock.length ? `<div class="attention-list">${lowStock.slice(0, 5).map((product) => `<div class="attention-row"><span class="attention-icon">▦</span><span><strong>${escapeHTML(product.name)}</strong><small>Stok tersisa ${product.stock} ${escapeHTML(product.unit || "pcs")}</small></span>${button("Atur", "go-inventory", "button button-small")}</div>`).join("")}</div>` : `<div class="calm-state"><span>✓</span><p>Stok aman. Tidak ada barang yang menipis.</p></div>`}
                <div class="panel-divider"></div><div class="mini-summary"><span>Hutang belum lunas</span><strong>${currency.format(sum(unpaidDebts.filter((item) => item.type === "Hutang"), "amount"))}</strong></div><div class="mini-summary"><span>Piutang belum lunas</span><strong>${currency.format(sum(unpaidDebts.filter((item) => item.type === "Piutang"), "amount"))}</strong></div>
            </section>
        </div>
        <section class="panel quick-actions"><div class="panel-heading"><div><h2>Akses cepat</h2><p>Pilih aktivitas yang ingin dilakukan</p></div></div><div class="shortcut-grid">${[
            ["sales", "▣", "Transaksi penjualan"], ["add:product", "▦", "Tambah barang / jasa"], ["inventory", "▥", "Atur stok"], ["customers", "♙", "Tambah pelanggan"], ["purchases", "⇩", "Catat pembelian"], ["finance", "◈", "Catat keuangan"]
        ].map(([target, icon, label]) => `<button class="shortcut" type="button" ${target.includes(":") ? `data-action="${target}"` : `data-page="${target}"`}><span>${icon}</span><strong>${label}</strong><b>→</b></button>`).join("")}</div></section>`;
}

function emptyState(title, description) {
    return `<div class="empty-state"><span aria-hidden="true">▤</span><strong>${title}</strong><p>${description}</p></div>`;
}

function renderTable(columns, rows, actions = null) {
    if (!rows.length) return emptyState("Belum ada data", "Tambahkan data baru untuk mulai mengelola bagian ini.");
    return `<div class="table-wrap"><table><thead><tr>${columns.map((column) => `<th>${column.label}</th>`).join("")}${actions ? "<th>Aksi</th>" : ""}</tr></thead><tbody>${rows.map((row) => `<tr>${columns.map((column) => `<td>${column.format ? column.format(row) : escapeHTML(row[column.key] || "—")}</td>`).join("")}${actions ? `<td><div class="row-actions">${actions(row)}</div></td>` : ""}</tr>`).join("")}</tbody></table></div>`;
}

function field(name, label, type = "text", options = {}) {
    return { name, label, type, ...options };
}

function formFields(entity) {
    const categories = state.categories.map((item) => item.name);
    const products = getProductOptions();
    const suppliers = getSupplierOptions();
    const customers = getCustomerOptions();
    const staff = getStaffOptions();
    const date = today();
    const common = {
        product: [field("name", "Nama produk", "text", { required: true }), field("barcode", "Barcode", "text", { placeholder: "Scan atau masukkan kode barcode" }), field("group", "Kelompok barang", "text", { placeholder: "Contoh: Tepung" }), field("type", "Jenis", "select", { options: ["Barang", "Jasa"] }), field("category", "Kategori", "select", { options: categories, required: true }), field("trackStock", "Gunakan stok", "checkbox", { value: true }), field("showStock", "Tampilkan stok", "checkbox", { value: true, className: "stock-field" }), field("stock", "Stok awal", "number", { value: 0, min: 0, className: "stock-field" }), field("cost", "Harga dasar", "number", { value: 0, min: 0, required: true }), field("price", "Harga jual", "number", { value: 0, min: 0, required: true }), field("weight", "Berat / isi", "text", { placeholder: "Contoh: 1" }), field("unit", "Satuan", "select", { options: ["pcs", "gram", "kg", "ml", "liter", "pack", "dus"] }), field("discount", "Diskon produk (%)", "number", { value: 0, min: 0, max: 100 }), field("shelf", "Letak rak", "text", { placeholder: "Contoh: Rak A-2" }), field("description", "Keterangan", "textarea", { full: true }), field("imageFile", "Foto produk", "file", { accept: "image/*", full: true })],
        category: [field("name", "Nama kategori", "text", { required: true }), field("type", "Jenis kategori", "select", { options: ["Barang", "Jasa"] })],
        customer: [field("name", "Nama pelanggan", "text", { required: true }), field("phone", "Nomor telepon", "tel"), field("email", "Email", "email"), field("address", "Alamat", "textarea", { full: true })],
        supplier: [field("name", "Nama pemasok", "text", { required: true }), field("phone", "Nomor telepon", "tel"), field("email", "Email", "email"), field("address", "Alamat", "textarea", { full: true }), field("note", "Catatan", "textarea", { full: true })],
        purchase: [field("supplier", "Pemasok", "select", { options: suppliers, placeholder: "Pilih pemasok", required: true }), field("productId", "Barang", "select", { options: products, placeholder: "Pilih barang", required: true }), field("quantity", "Jumlah", "number", { min: 1, value: 1, required: true }), field("cost", "Harga beli per satuan", "number", { min: 0, required: true }), field("date", "Tanggal pembelian", "date", { value: date }), field("paymentStatus", "Status pembayaran", "select", { options: ["Lunas", "Belum lunas"] }), field("note", "Catatan", "textarea", { full: true })],
        stocktake: [field("productId", "Barang", "select", { options: products, placeholder: "Pilih barang", required: true }), field("actual", "Jumlah fisik hasil hitung", "number", { min: 0, required: true }), field("note", "Catatan opname", "textarea", { full: true })],
        debt: [field("type", "Jenis catatan", "select", { options: ["Piutang", "Hutang"], required: true }), field("party", "Nama pelanggan / pemasok", "text", { required: true }), field("amount", "Jumlah (Rupiah)", "number", { min: 1, required: true }), field("dueDate", "Tanggal jatuh tempo", "date", { value: date }), field("note", "Keterangan", "textarea", { full: true })],
        promotion: [field("name", "Nama promosi", "text", { required: true }), field("discount", "Diskon (%)", "number", { min: 1, max: 100, required: true }), field("startDate", "Mulai", "date", { value: date, required: true }), field("endDate", "Berakhir", "date", { value: date, required: true }), field("description", "Keterangan / syarat", "textarea", { full: true })],
        finance: [field("type", "Arus", "select", { options: ["Pemasukan", "Pengeluaran"] }), field("category", "Kategori", "text", { required: true, placeholder: "Contoh: Operasional" }), field("amount", "Jumlah (Rupiah)", "number", { min: 1, required: true }), field("date", "Tanggal", "date", { value: date, required: true }), field("note", "Catatan", "textarea", { full: true })],
        staff: [field("name", "Nama staf", "text", { required: true }), field("role", "Jabatan", "text", { required: true }), field("phone", "Nomor telepon", "tel"), field("status", "Status", "select", { options: ["Aktif", "Nonaktif"] })],
        shift: [field("staff", "Nama staf", "select", { options: staff, placeholder: "Pilih staf", required: true }), field("start", "Waktu mulai", "datetime-local", { value: localDateTime(), required: true }), field("note", "Catatan", "text")]
    };
    return common[entity] || [];
}

function renderField(input, value) {
    const id = `field-${input.name}`;
    const required = input.required ? "required" : "";
    const min = input.min !== undefined ? `min="${input.min}"` : "";
    const max = input.max !== undefined ? `max="${input.max}"` : "";
    const full = input.full ? " full-field" : "";
    const conditionClass = input.className ? ` ${input.className}` : "";
    let control = "";
    if (input.type === "select") {
        const options = (input.options || []).map((option) => {
            const optionValue = typeof option === "string" ? option : option.value;
            const label = typeof option === "string" ? option : option.label;
            return `<option value="${escapeHTML(optionValue)}" ${String(value ?? "") === String(optionValue) ? "selected" : ""}>${escapeHTML(label)}</option>`;
        }).join("");
        control = `<select id="${id}" name="${input.name}" ${required}><option value="">${escapeHTML(input.placeholder || "Pilih...")}</option>${options}</select>`;
    } else if (input.type === "checkbox") {
        control = `<input id="${id}" name="${input.name}" type="checkbox" ${value ?? input.value ? "checked" : ""} ${input.dataAttrs || ""}>`;
        return `<label class="form-check${conditionClass}" for="${id}">${control}<span>${escapeHTML(input.label)}</span></label>`;
    } else if (input.type === "textarea") {
        control = `<textarea id="${id}" name="${input.name}" rows="3" ${required}>${escapeHTML(value || "")}</textarea>`;
    } else {
        const fieldValue = input.type === "file" ? "" : (value ?? input.value ?? "");
        control = `<input id="${id}" name="${input.name}" type="${input.type}" value="${escapeHTML(fieldValue)}" placeholder="${escapeHTML(input.placeholder || "")}" ${required} ${min} ${max} ${input.step ? `step="${input.step}"` : ""} ${input.accept ? `accept="${input.accept}"` : ""}>`;
    }
    return `<label class="form-field${full}${conditionClass}" for="${id}"><span>${escapeHTML(input.label)}</span>${control}</label>`;
}

function safeImageSource(value) {
    return typeof value === "string" && /^data:image\/(?:jpeg|png|webp|gif);base64,/i.test(value) ? value : "";
}

function openForm(entity, id = "", initialValues = {}) {
    const existing = id ? findEntity(entity, id) : null;
    modalFormContext = { entity, id, preset: activePage };
    if (entity === "debt" && activePage === "kasbon") modalFormContext.defaultType = "Piutang";
    const fields = formFields(entity);
    const values = { ...(existing || {}), ...initialValues };
    if (entity === "product" && activePage === "item-groups" && activeProductGroup !== "Belum dikelompokkan") {
        values.group = activeProductGroup;
    }
    if (!existing && entity === "debt" && modalFormContext.defaultType) values.type = "Piutang";
    if (!existing && entity === "product") {
        values.trackStock = true;
        values.showStock = true;
        values.type = "Barang";
        values.category = state.categories[0]?.name || "";
        values.unit = "pcs";
    }
    const title = existing ? `Ubah ${entity === "product" ? "barang / jasa" : TITLES[activePage]?.toLowerCase() || entity}` : `Tambah ${entity === "product" ? "barang / jasa" : TITLES[activePage]?.toLowerCase() || entity}`;
    modalRoot.innerHTML = `<button class="modal-backdrop" type="button" data-close-modal aria-label="Tutup formulir"></button><section class="form-modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle"><header class="modal-header"><div><p class="eyebrow">${escapeHTML(state.settings.businessName)}</p><h2 id="modalTitle">${escapeHTML(title)}</h2></div><button class="icon-button" type="button" data-close-modal aria-label="Tutup">×</button></header><form id="entityForm" class="entity-form" data-entity="${escapeHTML(entity)}">${fields.map((item) => renderField(item, values[item.name])).join("")}${entity === "product" && safeImageSource(values.image) ? `<div class="image-preview full-field"><img src="${escapeHTML(safeImageSource(values.image))}" alt="Foto produk saat ini"><span>Foto saat ini. Pilih foto baru untuk menggantinya.</span></div>` : ""}<p class="form-error" id="formError" role="alert"></p><footer class="form-actions"><button class="button button-outline" type="button" data-close-modal>Batal</button><button class="button button-primary" type="submit">Simpan</button></footer></form></section>`;
    modalRoot.hidden = false;
    document.body.classList.add("modal-open");
    const stockToggle = modalRoot.querySelector('[name="trackStock"]');
    if (stockToggle) {
        const updateStockFields = () => modalRoot.querySelectorAll(".stock-field").forEach((element) => { element.hidden = !stockToggle.checked; });
        stockToggle.addEventListener("change", updateStockFields);
        updateStockFields();
    }
    modalRoot.querySelector("input:not([type=checkbox]), select")?.focus();
}

function closeModal() {
    modalRoot.hidden = true;
    modalRoot.innerHTML = "";
    modalFormContext = null;
    document.body.classList.remove("modal-open");
}

function openBarcodeAssignment(barcode) {
    modalRoot.innerHTML = `<button class="modal-backdrop" type="button" data-close-modal aria-label="Tutup formulir"></button><section class="form-modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle"><header class="modal-header"><div><p class="eyebrow">${escapeHTML(state.settings.businessName)}</p><h2 id="modalTitle">Barcode belum terdaftar</h2></div><button class="icon-button" type="button" data-close-modal aria-label="Tutup">×</button></header><form id="barcodeAssignForm" class="entity-form"><p>Barcode <strong>${escapeHTML(barcode)}</strong> belum terdaftar. Masukkan nama barang untuk membuat barang baru.</p><label class="form-field"><span>Nama barang</span><input name="productName" type="text" required autocomplete="off"></label><p class="settings-copy">Selanjutnya, lengkapi kategori dan harga barang sebelum menyimpan.</p><p class="form-error" id="formError" role="alert"></p><input type="hidden" name="barcode" value="${escapeHTML(barcode)}"><footer class="form-actions"><button class="button button-outline" type="button" data-close-modal>Batal</button><button class="button button-primary" type="submit">Lanjutkan</button></footer></form></section>`;
    modalRoot.hidden = false;
    document.body.classList.add("modal-open");
    modalRoot.querySelector('input[name="productName"]')?.focus();
}

function submitBarcodeAssignment(form) {
    const productName = form.elements.namedItem("productName").value.trim();
    const barcode = form.elements.namedItem("barcode").value.trim();
    if (!productName || !barcode) {
        document.getElementById("formError").textContent = "Masukkan nama barang yang valid.";
        return;
    }
    closeModal();
    openForm("product", "", { name: productName, barcode });
}

function findEntity(entity, id) {
    const collection = collectionFor(entity);
    return collection?.find((item) => String(item.id) === String(id)) || null;
}

function collectionFor(entity) {
    return ({
        product: state.products, category: state.categories, customer: state.customers,
        supplier: state.suppliers, debt: state.debts, purchase: state.purchases,
        stocktake: state.stocktakes, promotion: state.promotions, finance: state.finance,
        staff: state.staff, shift: state.shifts
    })[entity];
}

function getModuleConfig(page) {
    const config = {
        products: {
            entity: "product", title: "Barang / jasa",
            description: "Kelola katalog, harga, stok, diskon, foto, dan lokasi rak.",
            add: "Tambah barang / jasa",
            columns: [
                { label: "Nama barang", format: (row) => `<div class="product-cell">${safeImageSource(row.image) ? `<img src="${escapeHTML(safeImageSource(row.image))}" alt="">` : `<span class="table-product-icon">▦</span>`}<span><strong>${escapeHTML(row.name)}</strong><small>${escapeHTML(row.type)} · ${escapeHTML(row.category)}</small></span></div>` },
                { label: "Barcode", format: (row) => escapeHTML(row.barcode || "—") },
                { label: "Harga dasar", format: (row) => currency.format(row.cost) },
                { label: "Harga jual", format: (row) => currency.format(row.price) },
                { label: "Stok", format: (row) => row.trackStock ? `${row.stock} ${escapeHTML(row.unit || "pcs")}` : "Tidak dilacak" },
                { label: "Letak rak", key: "shelf" }
            ],
            actions: (row) => `${button("Edit", `edit:product:${row.id}`, "button button-small")}${button("Hapus", `delete:product:${row.id}`, "button button-small button-danger")}`
        },
        inventory: { entity: "product", title: "Manajemen stok", description: "Cari barang, periksa jumlah stok, dan sesuaikan persediaan.", add: "", columns: [] },
        categories: { entity: "category", title: "Kategori barang / jasa", description: "Buat kategori supaya katalog barang dan jasa lebih mudah diatur.", add: "Tambah kategori", columns: [{ label: "Nama kategori", key: "name" }, { label: "Jenis", key: "type" }, { label: "Jumlah produk", format: (row) => state.products.filter((product) => product.category === row.name).length }], actions: (row) => button("Hapus", `delete:category:${row.id}`, "button button-small button-danger") },
        customers: { entity: "customer", title: "Pelanggan", description: "Simpan informasi pelanggan untuk transaksi dan pencatatan kasbon.", add: "Tambah pelanggan", columns: [{ label: "Nama pelanggan", key: "name" }, { label: "Nomor telepon", key: "phone" }, { label: "Email", key: "email" }, { label: "Alamat", key: "address" }], actions: (row) => `${button("Edit", `edit:customer:${row.id}`, "button button-small")}${button("Hapus", `delete:customer:${row.id}`, "button button-small button-danger")}` },
        suppliers: { entity: "supplier", title: "Pemasok", description: "Simpan kontak pemasok untuk memudahkan pembelian barang.", add: "Tambah pemasok", columns: [{ label: "Nama pemasok", key: "name" }, { label: "Nomor telepon", key: "phone" }, { label: "Email", key: "email" }, { label: "Alamat", key: "address" }], actions: (row) => `${button("Edit", `edit:supplier:${row.id}`, "button button-small")}${button("Hapus", `delete:supplier:${row.id}`, "button button-small button-danger")}` },
        purchases: { entity: "purchase", title: "Pembelian barang", description: "Catat barang masuk dan pembayaran kepada pemasok.", add: "Catat pembelian", columns: [{ label: "Tanggal", format: (row) => formatDate(row.date) }, { label: "Pemasok", key: "supplier" }, { label: "Barang", key: "productName" }, { label: "Jumlah", format: (row) => `${row.quantity} ${escapeHTML(row.unit || "pcs")}` }, { label: "Total", format: (row) => currency.format(row.total) }, { label: "Pembayaran", format: (row) => statusBadge(row.paymentStatus) }] },
        stocktake: { entity: "stocktake", title: "Stok opname", description: "Catat hasil hitung fisik dan sesuaikan jumlah stok sistem.", add: "Catat stok opname", columns: [{ label: "Tanggal", format: (row) => formatDate(row.date) }, { label: "Barang", key: "productName" }, { label: "Stok sistem", key: "systemStock" }, { label: "Stok fisik", key: "actual" }, { label: "Selisih", format: (row) => signedNumber(row.difference) }, { label: "Catatan", key: "note" }] },
        debts: { entity: "debt", title: "Hutang & piutang", description: "Pantau tagihan kepada pemasok dan piutang pelanggan.", add: "Tambah catatan", columns: [{ label: "Jenis", format: (row) => escapeHTML(row.type) }, { label: "Pelanggan / pemasok", key: "party" }, { label: "Jumlah", format: (row) => currency.format(row.amount) }, { label: "Jatuh tempo", format: (row) => formatDate(row.dueDate) }, { label: "Status", format: (row) => statusBadge(row.status) }], actions: (row) => row.status !== "Lunas" ? button("Tandai lunas", `paid:debt:${row.id}`, "button button-small button-primary") : "—" },
        marketing: { entity: "promotion", title: "Pemasaran & promosi", description: "Kelola diskon dan penawaran khusus untuk pelanggan.", add: "Buat promosi", columns: [{ label: "Nama promosi", key: "name" }, { label: "Diskon", format: (row) => `${row.discount}%` }, { label: "Periode", format: (row) => `${formatDate(row.startDate)} – ${formatDate(row.endDate)}` }, { label: "Status", format: (row) => statusBadge(row.status) }], actions: (row) => `${button("Edit", `edit:promotion:${row.id}`, "button button-small")}${button("Hapus", `delete:promotion:${row.id}`, "button button-small button-danger")}` },
        finance: { entity: "finance", title: "Keuangan", description: "Catat pemasukan dan pengeluaran usaha atau pribadi.", add: "Catat keuangan", columns: [{ label: "Tanggal", format: (row) => formatDate(row.date) }, { label: "Arus", format: (row) => escapeHTML(row.type) }, { label: "Kategori", key: "category" }, { label: "Catatan", key: "note" }, { label: "Jumlah", format: (row) => `<span class="${row.type === "Pemasukan" ? "positive" : "negative"}">${currency.format(row.amount)}</span>` }] },
        staff: { entity: "staff", title: "Manajemen staf", description: "Kelola data dan status staf yang bertugas di toko.", add: "Tambah staf", columns: [{ label: "Nama", key: "name" }, { label: "Jabatan", key: "role" }, { label: "Telepon", key: "phone" }, { label: "Status", format: (row) => statusBadge(row.status) }], actions: (row) => `${button("Edit", `edit:staff:${row.id}`, "button button-small")}${button("Hapus", `delete:staff:${row.id}`, "button button-small button-danger")}` },
        shifts: { entity: "shift", title: "Shift", description: "Pantau jam kerja staf dan status shift.", add: "Mulai shift", columns: [{ label: "Staf", key: "staff" }, { label: "Mulai", format: (row) => formatDateTime(row.start) }, { label: "Selesai", format: (row) => row.end ? formatDateTime(row.end) : "—" }, { label: "Durasi", format: (row) => row.end ? duration(row.start, row.end) : "Berjalan" }, { label: "Status", format: (row) => statusBadge(row.status) }], actions: (row) => row.status === "Berjalan" ? button("Akhiri shift", `end-shift:shift:${row.id}`, "button button-small") : "—" }
    };
    return config[page];
}

function statusBadge(status) {
    const style = status === "Lunas" || status === "Aktif" || status === "Berjalan" ? "success" : status === "Belum lunas" || status === "Menipis" ? "warning" : "neutral";
    return `<span class="status-badge ${style}">${escapeHTML(status || "—")}</span>`;
}

function signedNumber(number) {
    return `<span class="${number >= 0 ? "positive" : "negative"}">${number > 0 ? "+" : ""}${number}</span>`;
}

function duration(start, end) {
    const hours = Math.max(0, Math.round((new Date(end) - new Date(start)) / 3600000 * 10) / 10);
    return `${hours} jam`;
}

function renderModule(page) {
    const config = getModuleConfig(page);
    if (!config) return;
    let rows = state[({
        product: "products", category: "categories", customer: "customers", supplier: "suppliers",
        purchase: "purchases", stocktake: "stocktakes", debt: "debts", promotion: "promotions",
        finance: "finance", staff: "staff", shift: "shifts"
    })[config.entity]].slice().reverse();
    if (page === "products") {
        rows.sort((a, b) => productSortOrder === "asc"
            ? a.name.localeCompare(b.name, "id", { sensitivity: "base" })
            : b.name.localeCompare(a.name, "id", { sensitivity: "base" }));
        if (productSearchQuery) {
            rows = rows.filter((product) => `${product.name} ${product.group || ""} ${product.category}`.toLocaleLowerCase("id").includes(productSearchQuery));
        }
    }
    const action = config.add ? button(`<span aria-hidden="true">＋</span> ${config.add}`, `add:${config.entity}`, "button button-primary") : "";
    const search = `<label class="list-search"><span aria-hidden="true">⌕</span><input type="search" data-table-search value="${page === "products" ? escapeHTML(productSearchQuery) : ""}" placeholder="Cari ${escapeHTML(config.title.toLowerCase())}..." aria-label="Cari ${escapeHTML(config.title.toLowerCase())}"></label>`;
    const sortControl = page === "products"
        ? `<label class="sort-control"><span>Urutkan</span><select id="productSortOrder" aria-label="Urutkan barang"><option value="asc" ${productSortOrder === "asc" ? "selected" : ""}>Nama A–Z</option><option value="desc" ${productSortOrder === "desc" ? "selected" : ""}>Nama Z–A</option></select></label>`
        : "";
    const extra = page === "inventory"
        ? `<div class="inventory-summary">${statCard("Jumlah produk", state.products.length, "▦", "Barang dan jasa")}${statCard("Stok menipis", state.products.filter((product) => product.trackStock && product.stock <= 5).length, "!", "Stok ≤ 5 unit")}</div>`
        : page === "finance"
            ? `<div class="finance-summary">${statCard("Total pemasukan", currency.format(sum(state.finance.filter((item) => item.type === "Pemasukan"), "amount")), "↗", "Semua catatan")}${statCard("Total pengeluaran", currency.format(sum(state.finance.filter((item) => item.type === "Pengeluaran"), "amount")), "↘", "Semua catatan")}${statCard("Selisih", currency.format(sum(state.finance.filter((item) => item.type === "Pemasukan"), "amount") - sum(state.finance.filter((item) => item.type === "Pengeluaran"), "amount")), "◈", "Pemasukan dikurangi pengeluaran")}</div>`
            : "";
    const inventoryRows = page === "inventory" ? state.products.filter((product) => product.trackStock).slice().reverse() : rows;
    const displayRows = page === "marketing" ? rows.map((row) => ({
        ...row,
        status: row.endDate < today() ? "Berakhir" : row.startDate > today() ? "Terjadwal" : "Aktif"
    })) : rows;
    const columns = page === "inventory" ? [
        { label: "Nama barang", format: (row) => `<strong>${escapeHTML(row.name)}</strong><small class="cell-subtitle">${escapeHTML(row.category)}</small>` },
        { label: "Stok tersedia", format: (row) => `<strong class="${row.stock <= 5 ? "negative" : ""}">${row.stock} ${escapeHTML(row.unit || "pcs")}</strong>` },
        { label: "Harga jual", format: (row) => currency.format(row.price) },
        { label: "Letak rak", key: "shelf" }
    ] : config.columns;
    const actions = page === "inventory"
        ? (row) => `${button("−", `stock-down:product:${row.id}`, "button button-square")}${button("+", `stock-up:product:${row.id}`, "button button-square")}${button("Lihat / edit", `edit:product:${row.id}`, "button button-small")}`
        : config.actions;
    pageContent.innerHTML = `${pageHeader(config.title, config.description, action)}${extra}<section class="panel list-panel"><div class="panel-heading"><div><h2>Daftar ${escapeHTML(config.title.toLowerCase())}</h2><p>${rows.length} data tersimpan</p></div><div class="list-controls">${sortControl}${search}</div></div><div id="moduleTable">${renderTable(columns, page === "inventory" ? inventoryRows : displayRows, actions)}</div></section>`;
}

function renderItemGroups() {
    const groups = new Map();
    state.products.forEach((product) => {
        const name = product.group?.trim() || "Belum dikelompokkan";
        if (!groups.has(name)) groups.set(name, []);
        groups.get(name).push(product);
    });

    if (activeProductGroup) {
        const products = groups.get(activeProductGroup) || [];
        if (!products.length) {
            activeProductGroup = "";
            renderItemGroups();
            return;
        }
        const columns = [
            { label: "Nama jenis", format: (row) => `<strong>${escapeHTML(row.name)}</strong><small class="cell-subtitle">${escapeHTML(row.type)} · ${escapeHTML(row.category)}</small>` },
            { label: "Harga jual", format: (row) => currency.format(row.price) },
            { label: "Stok", format: (row) => row.trackStock ? `${row.stock} ${escapeHTML(row.unit || "pcs")}` : "Tidak dilacak" },
            { label: "Letak rak", key: "shelf" }
        ];
        pageContent.innerHTML = `${pageHeader("Pemilah barang", "Daftar jenis dalam kelompok barang yang dipilih.", `<div class="heading-actions">${button("← Semua kelompok", "group-back", "button button-outline")}${button("＋ Tambah jenis", "add:product", "button button-primary")}</div>`)}
            <section class="panel list-panel"><div class="panel-heading"><div><p class="eyebrow">Kelompok barang</p><h2>${escapeHTML(activeProductGroup)}</h2><p>${products.length} jenis</p></div></div>${renderTable(columns, products, (product) => `${button("Edit", `edit:product:${product.id}`, "button button-small")}${button("−", `stock-down:product:${product.id}`, "button button-square")}${button("+", `stock-up:product:${product.id}`, "button button-square")}`)}</section>`;
        return;
    }

    const sortedGroups = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, "id", { sensitivity: "base" }));
    pageContent.innerHTML = `${pageHeader("Pemilah barang", "Kelompokkan barang sejenis, lalu buka kelompok untuk melihat semua jenisnya.", button("＋ Tambah barang / jasa", "add:product", "button button-primary"))}
        <div class="notice notice-info"><strong>Contoh penggunaan</strong><span>Isi “Tepung” pada kolom Kelompok barang untuk semua produk tepung. Klik kelompok Tepung di bawah untuk melihat jenis-jenisnya.</span></div>
        <section class="group-grid">${sortedGroups.length ? sortedGroups.map(([name, products]) => {
            const tracked = products.filter((product) => product.trackStock);
            return `<button type="button" class="group-card" data-open-group="${escapeHTML(name)}"><span class="group-card-icon">▦</span><span class="group-card-copy"><strong>${escapeHTML(name)}</strong><small>${products.length} jenis · ${tracked.length ? `${tracked.reduce((total, product) => total + product.stock, 0)} unit stok` : "tanpa pelacakan stok"}</small></span><span class="group-card-arrow">→</span></button>`;
        }).join("") : emptyState("Belum ada barang", "Tambahkan barang untuk mulai membuat kelompok.")}</section>`;
}

function renderKasbon() {
    const rows = state.debts.filter((item) => item.type === "Piutang").slice().reverse();
    const open = rows.filter((item) => item.status !== "Lunas");
    pageContent.innerHTML = `${pageHeader("Kasbon pelanggan", "Catat kasbon pelanggan beserta jumlah dan tanggal jatuh tempo.", button('<span aria-hidden="true">＋</span> Catat kasbon', "add:debt", "button button-primary"))}
        <section class="stats-grid compact-stats">${statCard("Belum lunas", currency.format(sum(open, "amount")), "◷", `${open.length} catatan`)}${statCard("Sudah lunas", rows.filter((item) => item.status === "Lunas").length, "✓", "Catatan kasbon")}</section>
        <section class="panel list-panel"><div class="panel-heading"><div><h2>Daftar kasbon</h2><p>Kasbon pelanggan yang perlu ditagih</p></div></div>${renderTable([{ label: "Pelanggan", key: "party" }, { label: "Tanggal dibuat", format: (row) => formatDate(row.date) }, { label: "Jatuh tempo", format: (row) => formatDate(row.dueDate) }, { label: "Jumlah", format: (row) => currency.format(row.amount) }, { label: "Status", format: (row) => statusBadge(row.status) }], rows, (row) => row.status !== "Lunas" ? button("Tandai lunas", `paid:debt:${row.id}`, "button button-small button-primary") : "—")}</section>`;
}

function renderPPOB() {
    pageContent.innerHTML = `${pageHeader("PPOB", "Catat layanan pulsa dan pembayaran digital dalam pembukuan toko.", "")}
        <div class="notice notice-info"><strong>Mode pencatatan</strong><span>Transaksi PPOB di sini hanya dicatat sebagai demo, belum terhubung ke bank, loket pembayaran, atau penyedia pulsa.</span></div>
        <section class="panel ppob-panel"><div class="panel-heading"><div><h2>Catat transaksi PPOB</h2><p>Pastikan nomor pelanggan dan nominal sudah benar.</p></div></div>
            <form class="inline-form" id="ppobForm">
                ${renderField(field("service", "Jenis layanan", "select", { options: ["Pulsa", "Paket data", "Token listrik", "Tagihan listrik", "PDAM", "Lainnya"], required: true }))}
                ${renderField(field("customerNumber", "Nomor pelanggan / telepon", "text", { required: true, placeholder: "Masukkan nomor tujuan" }))}
                ${renderField(field("amount", "Nominal (Rupiah)", "number", { min: 1, required: true }))}
                ${renderField(field("sellingPrice", "Harga jual ke pelanggan", "number", { min: 1, required: true }))}
                <button class="button button-primary" type="submit">Simpan catatan transaksi</button>
            </form>
        </section>
        <section class="panel list-panel"><div class="panel-heading"><div><h2>Riwayat PPOB</h2><p>${state.ppobTransactions.length} catatan</p></div></div>${renderTable([{ label: "Waktu", format: (row) => formatDateTime(row.date) }, { label: "Layanan", key: "service" }, { label: "Nomor tujuan", key: "customerNumber" }, { label: "Nominal", format: (row) => currency.format(row.amount) }, { label: "Harga jual", format: (row) => currency.format(row.sellingPrice) }, { label: "Status", format: (row) => statusBadge(row.status) }], state.ppobTransactions.slice().reverse())}</section>`;
}

function currentPromotions() {
    return state.promotions.filter((item) => item.startDate <= today() && item.endDate >= today());
}

function cartTotals(promotionId = "") {
    const lines = [...cart.entries()].map(([id, quantity]) => {
        const product = getProduct(id);
        const price = Math.round(product.price * (1 - (Number(product.discount) || 0) / 100));
        return { product, quantity, price, total: price * quantity };
    });
    const subtotal = sum(lines, "total");
    const promotion = currentPromotions().find((item) => String(item.id) === String(promotionId));
    const discount = promotion ? Math.round(subtotal * promotion.discount / 100) : 0;
    return { lines, subtotal, discount, total: Math.max(0, subtotal - discount), promotion };
}

function cashDigits(value) {
    return String(value || "").replace(/\D/g, "");
}

function formatCashAmount(value) {
    return cashDigits(value).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function setCashInput(input, value) {
    const digits = cashDigits(value);
    saleCashReceived = digits;
    input.value = formatCashAmount(digits);
}

function updateCashSummary() {
    const input = document.getElementById("saleCashReceived");
    const summary = document.getElementById("cashSummary");
    const amount = document.getElementById("cashSummaryAmount");
    const label = document.getElementById("cashSummaryLabel");
    if (!input || !summary || !amount || !label) return;

    saleCashReceived = cashDigits(input.value);
    const total = Number(summary.dataset.total || 0);
    const received = Number(saleCashReceived || 0);
    const isPaid = received >= total;
    label.textContent = isPaid ? "Kembalian" : "Uang kurang";
    amount.textContent = currency.format(isPaid ? received - total : total - received);
    summary.classList.toggle("is-paid", isPaid);
    const confirmButton = document.querySelector('[data-action="complete-sale"]');
    if (confirmButton) confirmButton.disabled = !cart.size || (salePaymentMethod === "Tunai" && !isPaid);
}

function animateProductToCart(sourceElement) {
    const targetElement = document.querySelector("[data-scroll-cart]");
    if (!sourceElement || !targetElement) return;

    const source = sourceElement.getBoundingClientRect();
    const target = targetElement.getBoundingClientRect();
    const flyer = document.createElement("span");
    flyer.className = "cart-flyer";
    flyer.textContent = "▦";
    flyer.style.left = `${source.left + source.width / 2 - 18}px`;
    flyer.style.top = `${source.top + source.height / 2 - 18}px`;
    document.body.append(flyer);
    requestAnimationFrame(() => {
        flyer.style.transform = `translate(${target.left + target.width / 2 - source.left - source.width / 2}px, ${target.top + target.height / 2 - source.top - source.height / 2}px) scale(0.35)`;
        flyer.style.opacity = "0";
    });
    window.setTimeout(() => flyer.remove(), 520);
}

function addProductToCart(product, fromScanner = false) {
    if (!product) return false;
    const quantity = cart.get(product.id) || 0;
    if (product.trackStock && quantity >= product.stock) {
        showToast("Jumlah melebihi stok yang tersedia.", true);
        return false;
    }
    if (fromScanner) {
        const search = document.getElementById("saleSearch");
        if (search) search.value = "";
    }
    lastAddedProductId = product.id;
    cart.set(product.id, quantity + 1);
    renderSales();
    document.getElementById("saleSearch")?.focus({ preventScroll: true });
    return true;
}

function renderSales() {
    const focusScanner = !pageContent.contains(document.activeElement);
    saleCustomerValue = document.getElementById("saleCustomer")?.value ?? saleCustomerValue;
    salePaymentMethod = document.getElementById("salePayment")?.value || salePaymentMethod;
    const cashInput = document.getElementById("saleCashReceived");
    if (cashInput) saleCashReceived = cashDigits(cashInput.value);
    salePromotionValue = document.getElementById("salePromotion")?.value ?? salePromotionValue;
    const qrisConfirmation = document.getElementById("saleQrisConfirmed");
    if (qrisConfirmation?.checked) saleQrisConfirmationToken = qrisConfirmation.dataset.qrisToken;
    const activePromos = currentPromotions();
    const query = document.getElementById("saleSearch")?.value?.toLocaleLowerCase("id") || "";
    const available = state.products.filter((product) => `${product.name} ${product.category} ${product.barcode || ""}`.toLocaleLowerCase("id").includes(query));
    const promotionId = salePromotionValue;
    const { lines, subtotal, discount, total } = cartTotals(promotionId);
    const itemCount = lines.reduce((count, item) => count + item.quantity, 0);
    const cashReceived = Number(saleCashReceived || 0);
    const isCashPaid = cashReceived >= total;
    const qrisImage = safeImageSource(state.settings.qrisImage);
    const qrisToken = JSON.stringify({ promotionId, total, lines: lines.map(({ product, quantity, price }) => [product.id, quantity, price]) });
    if (saleQrisBasketToken && saleQrisBasketToken !== qrisToken) saleQrisConfirmationToken = "";
    saleQrisBasketToken = qrisToken;
    const qrisConfirmed = saleQrisConfirmationToken === qrisToken;
    const canConfirm = Boolean(lines.length) && (salePaymentMethod === "Tunai" ? isCashPaid : salePaymentMethod === "QRIS statis" ? Boolean(qrisImage && qrisConfirmed) : true);
    pageContent.innerHTML = `${pageHeader("Transaksi penjualan", "Pilih barang, atur jumlah, lalu simpan transaksi dan metode pembayarannya.", "")}
        <div class="sales-layout"><section class="panel sale-products"><div class="panel-heading"><div><h2>Pilih barang / jasa</h2><p>${state.products.length} produk terdaftar</p></div><label class="list-search"><span aria-hidden="true">▦</span><input id="saleSearch" type="search" value="${escapeHTML(query)}" placeholder="Cari produk atau scan barcode..." aria-label="Cari produk atau scan barcode"></label></div>
            <button type="button" class="sale-cart-shortcut ${itemCount ? "has-items" : ""}" data-scroll-cart aria-label="Lihat keranjang, ${itemCount} barang, total ${currency.format(total)}"><span class="cart-shortcut-icon" aria-hidden="true">▣<b>${itemCount}</b></span><span class="cart-shortcut-copy"><small>Keranjang belanja</small><strong>${itemCount} barang dipilih · ${currency.format(total)}</strong></span><span class="cart-shortcut-arrow" aria-hidden="true">↓</span></button>
            <div class="sale-product-grid">${available.length ? available.map((product) => `<button type="button" class="sale-product ${product.trackStock && product.stock <= 0 ? "disabled" : ""} ${String(lastAddedProductId) === String(product.id) ? "sale-product-picked" : ""}" data-sale-add="${escapeHTML(product.id)}" ${product.trackStock && product.stock <= 0 ? "disabled" : ""}><span class="sale-product-icon">${safeImageSource(product.image) ? `<img src="${escapeHTML(safeImageSource(product.image))}" alt="">` : "▦"}</span><strong>${escapeHTML(product.name)}</strong><small>${currency.format(product.price)}</small>${product.trackStock && product.showStock ? `<small class="sale-stock">Stok ${product.stock}</small>` : ""}</button>`).join("") : emptyState("Produk tidak ditemukan", "Coba kata kunci yang berbeda.")}</div>
        </section><section class="panel sale-cart ${itemCount ? "has-items" : ""}" id="saleCart"><div class="panel-heading"><div><h2>Keranjang belanja</h2><p>${itemCount} barang dipilih</p></div><span class="sale-cart-check" aria-hidden="true">${itemCount ? "✓" : "0"}</span></div>
            <label class="form-field"><span>Pelanggan</span><select id="saleCustomer"><option value="" ${saleCustomerValue ? "" : "selected"}>Pelanggan umum</option>${getCustomerOptions().map((option) => `<option value="${escapeHTML(option.value)}" ${saleCustomerValue === option.value ? "selected" : ""}>${escapeHTML(option.label)}</option>`).join("")}</select></label>
            ${lines.length ? `<div class="sale-cart-items">${lines.map(({ product, quantity, price }) => `<div class="sale-line"><span><strong>${escapeHTML(product.name)}</strong><small>${currency.format(price)} / unit</small></span><div class="quantity-control"><button type="button" data-sale-qty="${escapeHTML(product.id)}" data-change="-1" aria-label="Kurangi">−</button><span>${quantity}</span><button type="button" data-sale-qty="${escapeHTML(product.id)}" data-change="1" aria-label="Tambah">+</button></div><strong>${currency.format(price * quantity)}</strong></div>`).join("")}</div>` : emptyState("Transaksi masih kosong", "Pilih produk untuk mulai menghitung total.")}
            <label class="form-field"><span>Promosi aktif</span><select id="salePromotion"><option value="" ${promotionId ? "" : "selected"}>Tanpa promosi</option>${activePromos.map((item) => `<option value="${escapeHTML(item.id)}" ${String(item.id) === promotionId ? "selected" : ""}>${escapeHTML(item.name)} (${item.discount}%)</option>`).join("")}</select></label>
            <div class="sale-totals"><div><span>Subtotal</span><strong>${currency.format(subtotal)}</strong></div><div><span>Diskon promosi</span><strong>− ${currency.format(discount)}</strong></div><div class="grand-total"><span>Total</span><strong>${currency.format(total)}</strong></div></div>
            <label class="form-field"><span>Metode pembayaran</span><select id="salePayment"><option ${salePaymentMethod === "Tunai" ? "selected" : ""}>Tunai</option><option ${salePaymentMethod === "Transfer" ? "selected" : ""}>Transfer</option><option ${salePaymentMethod === "QRIS statis" ? "selected" : ""}>QRIS statis</option><option ${salePaymentMethod === "Kartu / QRIS" ? "selected" : ""}>Kartu / QRIS</option><option ${salePaymentMethod === "Kasbon" ? "selected" : ""}>Kasbon</option></select></label>
            ${salePaymentMethod === "Tunai" ? `<section class="cash-checkout" aria-labelledby="cashCheckoutTitle"><div class="cash-checkout-heading"><div><h3 id="cashCheckoutTitle">Pembayaran tunai</h3><p>Masukkan uang yang diterima</p></div><strong>${currency.format(total)}</strong></div>
                <label class="form-field cash-input-field"><span>Uang diterima (Rp)</span><input id="saleCashReceived" type="text" inputmode="numeric" autocomplete="off" placeholder="0" value="${escapeHTML(formatCashAmount(saleCashReceived))}" aria-label="Jumlah uang yang diterima"></label>
                <div class="cash-shortcuts"><button type="button" data-cash-exact>Uang pas</button><button type="button" data-cash-add="10000">+10 rb</button><button type="button" data-cash-add="20000">+20 rb</button><button type="button" data-cash-add="50000">+50 rb</button><button type="button" data-cash-add="100000">+100 rb</button></div>
                <div class="cash-keypad" role="group" aria-label="Kalkulator uang diterima">${["7", "8", "9", "4", "5", "6", "1", "2", "3", "clear", "0", "backspace"].map((key) => `<button type="button" data-cash-key="${key}" aria-label="${key === "clear" ? "Hapus semua" : key === "backspace" ? "Hapus satu angka" : key}">${key === "clear" ? "C" : key === "backspace" ? "⌫" : key}</button>`).join("")}</div>
                <div class="change-summary ${isCashPaid ? "is-paid" : ""}" id="cashSummary" data-total="${total}"><span id="cashSummaryLabel">${isCashPaid ? "Kembalian" : "Uang kurang"}</span><strong id="cashSummaryAmount">${currency.format(isCashPaid ? cashReceived - total : total - cashReceived)}</strong></div>
            </section>` : ""}
            ${salePaymentMethod === "QRIS statis" ? `<section class="qris-checkout" aria-labelledby="qrisCheckoutTitle"><div class="cash-checkout-heading"><div><h3 id="qrisCheckoutTitle">Pembayaran QRIS statis</h3><p>Tagihan pelanggan</p></div><strong>${currency.format(total)}</strong></div>
                ${qrisImage ? `<img class="qris-checkout-image" src="${escapeHTML(qrisImage)}" alt="QRIS resmi merchant">` : `<div class="notice notice-info"><strong>QRIS belum diatur.</strong><span>Tambahkan gambar QRIS resmi di Pengaturan aplikasi sebelum menerima pembayaran QRIS.</span></div>`}
                <p class="qris-manual-note">Minta pelanggan memasukkan nominal tagihan di atas, lalu periksa dana masuk di aplikasi merchant. Pembayaran tidak diverifikasi otomatis.</p>
                ${qrisImage ? `<label class="form-check qris-confirm-check"><input id="saleQrisConfirmed" type="checkbox" data-qris-token="${escapeHTML(qrisToken)}" ${qrisConfirmed ? "checked" : ""}><span>Saya sudah memastikan pembayaran berhasil di aplikasi merchant</span></label>` : ""}
            </section>` : ""}
            <button type="button" class="button button-primary button-wide sale-confirm-button" data-action="complete-sale" ${canConfirm ? "" : "disabled"}><span aria-hidden="true">✓</span> Konfirmasi transaksi</button>
        </section></div>`;
    lastAddedProductId = "";
    updateCashSummary();
    if (focusScanner) document.getElementById("saleSearch")?.focus({ preventScroll: true });
}

function renderReports() {
    const transactions = state.transactions.slice().sort((a, b) => b.date.localeCompare(a.date));
    const total = sum(transactions.filter((item) => item.status !== "Belum lunas"), "total");
    const countItems = transactions.reduce((count, item) => count + (item.items || []).reduce((items, line) => items + line.quantity, 0), 0);
    pageContent.innerHTML = `${pageHeader("Laporan", "Ringkasan transaksi dan aktivitas usaha yang tercatat.", button("↓ Unduh CSV", "export-report", "button button-outline"))}
        <section class="stats-grid compact-stats">${statCard("Total transaksi", transactions.length, "▣", "Semua catatan")}${statCard("Omzet tercatat", currency.format(total), "↗", "Transaksi lunas")}${statCard("Barang terjual", countItems, "▦", "Akumulasi kuantitas")}</section>
        <section class="panel list-panel"><div class="panel-heading"><div><h2>Riwayat transaksi</h2><p>Penjualan dan PPOB</p></div></div>${renderTable([{ label: "No. transaksi", format: (row) => escapeHTML(String(row.id).slice(-8)) }, { label: "Waktu", format: (row) => formatDateTime(row.date) }, { label: "Jenis", key: "type" }, { label: "Pelanggan", key: "customer" }, { label: "Metode", key: "payment" }, { label: "Jumlah", format: (row) => currency.format(row.total) }, { label: "Status", format: (row) => statusBadge(row.status) }], transactions)}</section>`;
}

function renderSettings() {
    const accountName = firebaseUser?.displayName || state.settings.owner || "Pengguna";
    const providerNames = [...new Set((firebaseUser?.providerData || []).map((provider) => ({
        "google.com": "Google",
        "facebook.com": "Facebook",
        "password": "Email dan kata sandi"
    })[provider.providerId] || "Akun tertaut"))];
    const accountProvider = providerNames.join(" / ") || "Akun tertaut";

    pageContent.innerHTML = `${pageHeader("Pengaturan aplikasi", "Atur profil usaha dan kelola cadangan data aplikasi.", "")}
        <div class="settings-grid"><section class="panel settings-panel"><div class="panel-heading"><div><h2>Profil usaha</h2><p>Informasi yang tampil di aplikasi kasir.</p></div></div>
            <form id="settingsForm" class="settings-form">
                ${renderField(field("businessName", "Nama usaha", "text", { required: true }), state.settings.businessName)}
                ${renderField(field("owner", "Nama pemilik / pengguna", "text", { required: true }), state.settings.owner)}
                ${renderField(field("phone", "Nomor telepon", "tel"), state.settings.phone)}
                ${renderField(field("email", "Email", "email"), state.settings.email)}
                ${renderField(field("address", "Alamat usaha", "textarea", { full: true }), state.settings.address)}
                ${renderField(field("currency", "Mata uang", "select", { options: ["IDR"] }), "IDR")}
                <button class="button button-primary" type="submit">Simpan profil</button>
            </form>
        </section><section class="panel settings-panel qris-settings-panel"><div class="panel-heading"><div><h2>QRIS statis</h2><p>Atur gambar QRIS resmi dari akun merchant Anda.</p></div></div>
            <p class="settings-copy">Unggah gambar QRIS yang diterbitkan bank atau penyedia pembayaran. Saat checkout, kasir tetap harus memeriksa pembayaran di aplikasi merchant.</p>
            ${safeImageSource(state.settings.qrisImage) ? `<div class="qris-settings-preview"><img src="${escapeHTML(safeImageSource(state.settings.qrisImage))}" alt="QRIS merchant tersimpan"><span>QRIS merchant saat ini</span></div>` : `<div class="notice notice-info"><strong>Belum diatur</strong><span>Siapkan gambar QRIS resmi merchant untuk menerima pembayaran QRIS statis.</span></div>`}
            <form id="qrisSettingsForm" class="settings-form qris-settings-form">
                <label class="form-field full-field" for="qrisImageFile"><span>Gambar QRIS resmi</span><input id="qrisImageFile" name="qrisImageFile" type="file" accept="image/png,image/jpeg,image/webp"></label>
                <button class="button button-primary" type="submit">${safeImageSource(state.settings.qrisImage) ? "Ganti QRIS" : "Simpan QRIS"}</button>
                ${safeImageSource(state.settings.qrisImage) ? `<button class="button button-outline" type="button" data-action="remove-qris-image">Hapus QRIS</button>` : ""}
            </form>
        </section><section class="panel settings-panel"><div class="panel-heading"><div><h2>Cadangan data</h2><p>Unduh salinan untuk memindahkan atau menyimpan data aplikasi.</p></div></div>
            <p class="settings-copy">Produk, pelanggan, transaksi, dan catatan lain tersimpan di browser pada perangkat ini. Buat cadangan secara berkala.</p>
            <div class="backup-actions"><button class="button button-primary" type="button" data-action="backup-export">Unduh cadangan</button><label class="button button-outline file-button">Pulihkan cadangan<input id="backupImport" type="file" accept="application/json,.json"></label></div>
            <div class="notice notice-info"><strong>Catatan integrasi</strong><span>QRIS statis hanya dicatat setelah kasir memverifikasi dana di aplikasi merchant; belum ada verifikasi otomatis. Pembayaran kartu dan PPOB masih demo.</span></div>
        </section><section class="panel settings-panel account-settings-panel"><div class="panel-heading"><div><h2>Akun aktif</h2><p>Profil login dan pergantian akun.</p></div></div>
            <div class="account-profile"><span class="account-avatar">${escapeHTML(accountName.trim().charAt(0).toLocaleUpperCase("id") || "A")}</span><div><strong>${escapeHTML(accountName)}</strong><small>${escapeHTML(firebaseUser?.email || "Email akun tidak tersedia")}</small><small>Masuk dengan ${escapeHTML(accountProvider)}</small></div></div>
            <p class="settings-copy">Data kasir setiap akun disimpan terpisah. Ganti akun untuk masuk menggunakan profil Google atau Facebook lain.</p>
            <button class="button button-outline" type="button" data-action="switch-account">Ganti akun</button>
        </section></div>`;
}

function renderPage() {
    if (activePage === "dashboard") renderDashboard();
    else if (activePage === "item-groups") renderItemGroups();
    else if (activePage === "inventory") renderModule("inventory");
    else if (activePage === "kasbon") renderKasbon();
    else if (activePage === "ppob") renderPPOB();
    else if (activePage === "sales") renderSales();
    else if (activePage === "reports") renderReports();
    else if (activePage === "settings") renderSettings();
    else renderModule(activePage);
}

function renderApp() {
    renderNavigation();
    renderPage();
    document.getElementById("sidebarBusinessName").textContent = state.settings.businessName;
    document.getElementById("topBusinessName").textContent = state.settings.businessName;
    document.getElementById("profileName").textContent = state.settings.owner || "Pemilik";
    document.querySelector(".profile-avatar").textContent = (state.settings.owner || "A").trim().charAt(0).toLocaleUpperCase("id");
    document.getElementById("accountLabel").textContent = firebaseUser?.email || "";
    document.getElementById("signOutButton").hidden = !firebaseUser;
    document.getElementById("todayLabel").textContent = new Intl.DateTimeFormat("id-ID", { weekday: "short", day: "numeric", month: "short" }).format(new Date());
    document.getElementById("pageBreadcrumb").textContent = TITLES[activePage] || "Dashboard";
    const warning = document.getElementById("storageWarning");
    warning.hidden = !storageError;
    warning.textContent = storageError;
}

function goToPage(page) {
    if (!TITLES[page]) return;
    if (page !== "sales") saleQrisConfirmationToken = "";
    if (activePage === "item-groups" && page !== "item-groups") activeProductGroup = "";
    activePage = page;
    document.getElementById("sidebar").classList.remove("mobile-open");
    renderApp();
    window.scrollTo({ top: 0, behavior: "smooth" });
}

async function readProductImage(file) {
    if (!file) return "";
    if (!file.type.startsWith("image/")) throw new Error("Pilih file gambar yang valid.");
    if (file.size > 8 * 1024 * 1024) throw new Error("Ukuran gambar maksimal 8 MB.");
    const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("Foto tidak dapat dibaca."));
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(file);
    });
    const image = await new Promise((resolve, reject) => {
        const element = new Image();
        element.onerror = () => reject(new Error("File gambar tidak dapat dibuka."));
        element.onload = () => resolve(element);
        element.src = dataUrl;
    });
    const scale = Math.min(1, 600 / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.78);
}

async function readQrisImage(file) {
    if (!file) return "";
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) throw new Error("Pilih gambar QRIS berformat PNG, JPG, atau WebP.");
    if (file.size > 5 * 1024 * 1024) throw new Error("Ukuran gambar QRIS maksimal 5 MB.");
    const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("Gambar QRIS tidak dapat dibaca."));
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(file);
    });
    const image = await new Promise((resolve, reject) => {
        const element = new Image();
        element.onerror = () => reject(new Error("File gambar QRIS tidak dapat dibuka."));
        element.onload = () => resolve(element);
        element.src = dataUrl;
    });
    const scale = Math.min(1, 640 / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Gambar QRIS tidak dapat diproses di browser ini.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const compressedImage = canvas.toDataURL("image/png");
    if (compressedImage.length > 450_000) throw new Error("Gambar QRIS terlalu besar setelah diproses. Gunakan gambar QR yang lebih sederhana atau beresolusi lebih kecil.");
    return compressedImage;
}

function readFormValues(form) {
    const values = {};
    for (const [key, value] of new FormData(form).entries()) {
        if (typeof value === "string") values[key] = value.trim();
    }
    for (const checkbox of form.querySelectorAll('input[type="checkbox"]')) values[checkbox.name] = checkbox.checked;
    for (const input of form.querySelectorAll('input[type="number"]')) values[input.name] = Number(input.value);
    return values;
}

async function submitEntityForm(form) {
    const context = modalFormContext;
    const values = readFormValues(form);
    const existing = context.id ? findEntity(context.entity, context.id) : null;
    if (context.entity === "product") {
        values.barcode = String(values.barcode || "").trim();
        const normalizedBarcode = values.barcode.toLocaleUpperCase("id");
        if (normalizedBarcode && state.products.some((product) => String(product.barcode || "").trim().toLocaleUpperCase("id") === normalizedBarcode && String(product.id) !== String(context.id))) {
            document.getElementById("formError").textContent = "Barcode ini sudah dipakai produk lain.";
            return;
        }
        const file = form.elements.namedItem("imageFile").files[0];
        if (file) {
            try { values.image = await readProductImage(file); } catch (error) {
                document.getElementById("formError").textContent = error.message;
                return;
            }
        } else values.image = existing?.image || "";
        values.stock = values.trackStock ? values.stock : 0;
        values.discount = Math.min(100, Math.max(0, values.discount || 0));
    }
    if (context.entity === "category" && state.categories.some((item) => item.name.toLocaleLowerCase("id") === values.name.toLocaleLowerCase("id") && String(item.id) !== String(context.id))) {
        document.getElementById("formError").textContent = "Kategori dengan nama tersebut sudah ada.";
        return;
    }
    if (context.entity === "promotion" && values.endDate < values.startDate) {
        document.getElementById("formError").textContent = "Tanggal berakhir tidak boleh sebelum tanggal mulai.";
        return;
    }

    const entity = context.entity;
    const id = context.id || makeId();
    const record = {
        ...(existing || {}),
        ...values,
        id,
        ...(entity === "product" ? { badge: existing?.badge || "Baru" } : {}),
        ...(entity === "category" ? {} : {}),
        ...(entity === "promotion" ? { status: values.endDate < today() ? "Berakhir" : values.startDate > today() ? "Terjadwal" : "Aktif" } : {}),
        ...(entity === "staff" ? { status: values.status || "Aktif" } : {}),
        ...(entity === "debt" ? { status: existing?.status || "Belum lunas", date: existing?.date || today() } : {}),
        ...(entity === "shift" ? { end: existing?.end || "", status: existing?.status || "Berjalan" } : {})
    };

    const message = existing ? "Perubahan berhasil disimpan." : "Data berhasil ditambahkan.";
    const saved = saveState((draft) => {
        const collection = ({
            product: draft.products, category: draft.categories, customer: draft.customers,
            supplier: draft.suppliers, debt: draft.debts, promotion: draft.promotions,
            finance: draft.finance, staff: draft.staff, shift: draft.shifts
        })[entity];
        if (existing) {
            const index = collection.findIndex((item) => String(item.id) === String(id));
            collection[index] = record;
            if (entity === "category" && existing.name !== values.name) draft.products.forEach((product) => {
                if (product.category === existing.name) product.category = values.name;
            });
        } else collection.push(record);
    }, message);
    if (saved) closeModal();
}

function deleteRecord(entity, id) {
    const item = findEntity(entity, id);
    if (!item) return;
    const name = item.name || item.party || item.id;
    if (!window.confirm(`Hapus "${name}"? Tindakan ini tidak dapat dibatalkan.`)) return;
    if (entity === "category" && state.products.some((product) => product.category === item.name)) {
        showToast("Kategori masih dipakai oleh produk. Ubah kategorinya terlebih dahulu.", true);
        return;
    }
    saveState((draft) => {
        const collection = ({
            product: draft.products, category: draft.categories, customer: draft.customers,
            supplier: draft.suppliers, promotion: draft.promotions, staff: draft.staff
        })[entity];
        const index = collection.findIndex((record) => String(record.id) === String(id));
        collection.splice(index, 1);
    }, "Data berhasil dihapus.", () => {
        if (entity === "product") cart.delete(id);
    });
}

function updateDebtStatus(id) {
    const debt = state.debts.find((item) => String(item.id) === String(id));
    if (!debt || debt.status === "Lunas") return;
    saveState((draft) => {
        const record = draft.debts.find((item) => String(item.id) === String(id));
        record.status = "Lunas";
        record.paidDate = today();
        if (record.transactionId) {
            const transaction = draft.transactions.find((item) => item.id === record.transactionId);
            if (transaction) transaction.status = "Lunas";
        }
        if (record.purchaseId) {
            const purchase = draft.purchases.find((item) => item.id === record.purchaseId);
            if (purchase) purchase.paymentStatus = "Lunas";
        }
        draft.finance.push({ id: makeId(), type: record.type === "Piutang" ? "Pemasukan" : "Pengeluaran", category: record.type === "Piutang" ? "Pelunasan piutang" : "Pelunasan hutang", amount: record.amount, date: today(), note: `${record.party} — pelunasan catatan` });
    }, "Catatan ditandai lunas dan arus keuangan diperbarui.");
}

function changeStock(id, difference) {
    const product = getProduct(id);
    if (!product || !product.trackStock) return;
    if (product.stock + difference < 0) {
        showToast("Stok tidak dapat kurang dari nol.", true);
        return;
    }
    saveState((draft) => {
        const item = getProduct(id, draft);
        item.stock += difference;
    }, "Stok berhasil diperbarui.");
}

function completeSale() {
    if (!cart.size) return;
    const customer = document.getElementById("saleCustomer").value || "Pelanggan umum";
    const payment = document.getElementById("salePayment").value;
    const promotionId = document.getElementById("salePromotion").value;
    const { lines, subtotal, discount, total, promotion } = cartTotals(promotionId);
    const cashReceived = payment === "Tunai" ? Number(cashDigits(document.getElementById("saleCashReceived")?.value) || 0) : 0;
    if (payment === "Tunai" && cashReceived < total) {
        showToast("Uang yang diterima belum cukup untuk menyelesaikan transaksi.", true);
        return;
    }
    if (payment === "QRIS statis") {
        const qrisImage = safeImageSource(state.settings.qrisImage);
        const confirmation = document.getElementById("saleQrisConfirmed");
        const expectedToken = JSON.stringify({ promotionId, total, lines: lines.map(({ product, quantity, price }) => [product.id, quantity, price]) });
        if (!qrisImage) {
            showToast("Atur gambar QRIS resmi merchant terlebih dahulu.", true);
            return;
        }
        if (!confirmation?.checked || confirmation.dataset.qrisToken !== expectedToken) {
            showToast("Pastikan pembayaran sudah masuk di aplikasi merchant sebelum menyelesaikan transaksi.", true);
            return;
        }
    }
    const shortage = lines.find(({ product, quantity }) => product.trackStock && product.stock < quantity);
    if (shortage) {
        showToast(`Stok ${shortage.product.name} tidak mencukupi.`, true);
        return;
    }
    const transaction = {
        id: `TRX-${Date.now()}`,
        date: new Date().toISOString(),
        type: "Penjualan",
        customer,
        payment,
        status: payment === "Kasbon" ? "Belum lunas" : "Lunas",
        subtotal,
        discount,
        cashReceived,
        change: payment === "Tunai" ? cashReceived - total : 0,
        promotion: promotion?.name || "",
        total,
        items: lines.map(({ product, quantity, price }) => ({ productId: product.id, name: product.name, quantity, price }))
    };
    const saved = saveState((draft) => {
        draft.transactions.push(transaction);
        lines.forEach(({ product, quantity }) => {
            const item = getProduct(product.id, draft);
            if (item.trackStock) item.stock -= quantity;
        });
        if (payment === "Kasbon") {
            draft.debts.push({ id: makeId(), type: "Piutang", party: customer, amount: total, date: today(), dueDate: today(), note: `Kasbon dari transaksi ${transaction.id}`, status: "Belum lunas", transactionId: transaction.id });
        } else {
            draft.finance.push({ id: makeId(), type: "Pemasukan", category: "Penjualan", amount: total, date: today(), note: `Transaksi ${transaction.id}` });
        }
    }, `Transaksi ${transaction.id} berhasil disimpan.`);
    if (saved) {
        cart.clear();
        salePaymentMethod = "Tunai";
        saleCashReceived = "";
        saleQrisConfirmationToken = "";
        saleQrisBasketToken = "";
        saleCustomerValue = "";
        salePromotionValue = "";
        goToPage("sales");
    }
}

function submitPurchase(form) {
    const values = readFormValues(form);
    const product = getProduct(values.productId);
    if (!product) {
        showToast("Pilih barang yang valid.", true);
        return;
    }
    const total = values.quantity * values.cost;
    const record = { id: `BELI-${Date.now()}`, date: values.date || today(), supplier: values.supplier, productId: product.id, productName: product.name, quantity: values.quantity, unit: product.unit, cost: values.cost, total, paymentStatus: values.paymentStatus || "Lunas", note: values.note || "" };
    saveState((draft) => {
        draft.purchases.push(record);
        const item = getProduct(product.id, draft);
        if (item.trackStock) item.stock += values.quantity;
        if (record.paymentStatus === "Lunas") {
            draft.finance.push({ id: makeId(), type: "Pengeluaran", category: "Pembelian stok", amount: total, date: record.date, note: `${record.productName} dari ${record.supplier}` });
        } else {
            draft.debts.push({ id: makeId(), type: "Hutang", party: record.supplier, amount: total, date: record.date, dueDate: record.date, note: `Pembelian ${record.productName}`, status: "Belum lunas", purchaseId: record.id });
        }
    }, "Pembelian dicatat dan stok diperbarui.");
    closeModal();
}

function submitStocktake(form) {
    const values = readFormValues(form);
    const product = getProduct(values.productId);
    if (!product || !product.trackStock) {
        showToast("Pilih barang yang menggunakan stok.", true);
        return;
    }
    const difference = values.actual - product.stock;
    saveState((draft) => {
        draft.stocktakes.push({ id: makeId(), date: today(), productId: product.id, productName: product.name, systemStock: product.stock, actual: values.actual, difference, note: values.note || "" });
        getProduct(product.id, draft).stock = values.actual;
    }, `Stok opname tersimpan. Selisih ${difference > 0 ? "+" : ""}${difference}.`);
    closeModal();
}

function submitPPOB(form) {
    const values = readFormValues(form);
    const entry = { id: `PPOB-${Date.now()}`, date: new Date().toISOString(), service: values.service, customerNumber: values.customerNumber, amount: values.amount, sellingPrice: values.sellingPrice, status: "Dicatat (demo)" };
    saveState((draft) => {
        draft.ppobTransactions.push(entry);
        draft.transactions.push({ id: entry.id, date: entry.date, type: "PPOB (demo)", customer: values.customerNumber, payment: "Tunai", status: "Lunas", subtotal: values.sellingPrice, discount: 0, total: values.sellingPrice, items: [] });
        draft.finance.push({ id: makeId(), type: "Pemasukan", category: "PPOB (demo)", amount: values.sellingPrice, date: today(), note: `${values.service} — ${values.customerNumber}` });
    }, "Catatan PPOB demo berhasil disimpan. Layanan belum diproses ke provider.");
    renderPage();
}

function submitSettings(form) {
    const values = readFormValues(form);
    saveState((draft) => { draft.settings = { ...draft.settings, ...values, currency: "IDR" }; }, "Profil usaha berhasil disimpan.");
}

async function submitQrisSettings(form) {
    const file = form.elements.namedItem("qrisImageFile").files[0];
    if (!file && !safeImageSource(state.settings.qrisImage)) {
        showToast("Pilih gambar QRIS resmi merchant terlebih dahulu.", true);
        return;
    }
    let qrisImage = safeImageSource(state.settings.qrisImage);
    if (file) {
        try {
            qrisImage = await readQrisImage(file);
        } catch (error) {
            showToast(error.message, true);
            return;
        }
    }
    saveState((draft) => { draft.settings.qrisImage = qrisImage; }, "QRIS merchant berhasil disimpan.");
}

function exportJsonBackup() {
    downloadFile(`${state.settings.businessName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-cadangan.json`, JSON.stringify(state, null, 2), "application/json");
    showToast("Cadangan data berhasil diunduh.");
}

function downloadFile(filename, content, type) {
    const link = document.createElement("a");
    const url = URL.createObjectURL(new Blob([content], { type }));
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
}

function exportReport() {
    const rows = [["ID Transaksi", "Tanggal", "Jenis", "Pelanggan", "Metode", "Subtotal", "Diskon", "Total", "Status"]];
    state.transactions.forEach((item) => rows.push([item.id, item.date, item.type, item.customer, item.payment, item.subtotal, item.discount, item.total, item.status]));
    const csv = rows.map((row) => row.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
    downloadFile("laporan-transaksi-toko-anjar.csv", `\uFEFF${csv}`, "text/csv;charset=utf-8");
    showToast("Laporan CSV berhasil diunduh.");
}

async function importBackup(file) {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
        showToast("Ukuran file cadangan maksimal 10 MB.", true);
        return;
    }
    const imported = safeJSON(await file.text());
    const keys = ["categories", "products", "customers", "suppliers", "debts", "purchases", "stocktakes", "transactions", "finance", "promotions", "staff", "shifts", "ppobTransactions"];
    if (!imported || typeof imported !== "object" || !keys.every((key) => Array.isArray(imported[key])) || !imported.settings || typeof imported.settings !== "object") {
        showToast("File cadangan tidak valid atau strukturnya tidak lengkap.", true);
        return;
    }
    if (!window.confirm("Pulihkan cadangan akan mengganti semua data saat ini. Pastikan Anda sudah mengunduh salinannya. Lanjutkan?")) return;
    try {
        localStorage.setItem(activeStorageKey, JSON.stringify(imported));
    } catch {
        showToast("Cadangan gagal dipulihkan karena ruang penyimpanan tidak cukup.", true);
        return;
    }
    storageError = "";
    state = { ...createDefaultState(), ...imported };
    queueCloudSync(state);
    renderApp();
    showToast("Cadangan berhasil dipulihkan.");
}

function handleAction(action) {
    const [verb, entity, id] = action.split(":");
    if (action === "remove-qris-image") {
        saveState((draft) => { draft.settings.qrisImage = ""; }, "QRIS merchant berhasil dihapus.");
        return;
    }
    if (action === "switch-account") {
        signOutCurrentUser().catch((error) => {
            showToast("Gagal menyimpan data sebelum berganti akun. Coba lagi.", true);
            console.error("Account switch failed:", error);
        });
        return;
    }
    if (verb === "group-back") {
        activeProductGroup = "";
        renderItemGroups();
        return;
    }
    if (verb === "go") {
        goToPage(entity);
        return;
    }
    if (verb === "add") {
        openForm(entity);
        return;
    }
    if (verb === "edit") {
        openForm(entity, id);
        return;
    }
    if (verb === "delete") {
        deleteRecord(entity, id);
        return;
    }
    if (verb === "paid") {
        updateDebtStatus(id);
        return;
    }
    if (verb === "stock-up") changeStock(id, 1);
    if (verb === "stock-down") changeStock(id, -1);
    if (verb === "end-shift") saveState((draft) => {
        const shift = draft.shifts.find((item) => String(item.id) === String(id));
        if (shift) {
            shift.end = new Date().toISOString();
            shift.status = "Selesai";
        }
    }, "Shift berhasil diakhiri.");
    if (verb === "complete-sale") completeSale();
    if (verb === "export-report") exportReport();
    if (verb === "backup-export") exportJsonBackup();
}

sideNav.addEventListener("click", (event) => {
    const target = event.target.closest("[data-page]");
    if (target) goToPage(target.dataset.page);
});

document.getElementById("mobileMenuButton").addEventListener("click", () => document.getElementById("sidebar").classList.toggle("mobile-open"));
document.getElementById("profileButton").addEventListener("click", () => goToPage("settings"));
document.getElementById("googleSignIn").addEventListener("click", () => signInWithProvider("google"));
document.getElementById("facebookSignIn").addEventListener("click", () => signInWithProvider("facebook"));
document.getElementById("authRetry").addEventListener("click", () => {
    if (firebaseAuth.currentUser) void openAccount(firebaseAuth.currentUser);
});
document.getElementById("authSignOut").addEventListener("click", () => {
    signOutCurrentUser().catch((error) => {
        authStatus.textContent = "Gagal keluar dari akun. Muat ulang halaman dan coba lagi.";
        console.error("Firebase sign-out failed:", error);
    });
});
document.getElementById("signOutButton").addEventListener("click", () => {
    signOutCurrentUser().catch((error) => {
        showToast("Gagal keluar dari akun. Coba lagi.", true);
        console.error("Firebase sign-out failed:", error);
    });
});
document.getElementById("helpButton").addEventListener("click", openTutorial);
document.getElementById("tutorialNext").addEventListener("click", () => {
    if (tutorialStep === TUTORIAL_STEPS.length - 1) {
        closeTutorial();
        return;
    }
    tutorialStep += 1;
    renderTutorialStep();
});
document.getElementById("tutorialPrevious").addEventListener("click", () => {
    if (tutorialStep === 0) return;
    tutorialStep -= 1;
    renderTutorialStep();
});
document.getElementById("tutorialSkip").addEventListener("click", closeTutorial);
tutorialRoot.addEventListener("click", (event) => {
    if (event.target.closest("[data-tutorial-close]")) closeTutorial();
});
document.querySelector(".brand").addEventListener("click", (event) => {
    event.preventDefault();
    goToPage("dashboard");
});

pageContent.addEventListener("click", (event) => {
    const cartShortcut = event.target.closest("[data-scroll-cart]");
    if (cartShortcut) {
        document.getElementById("saleCart")?.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
    }
    const cashInput = document.getElementById("saleCashReceived");
    const cashKey = event.target.closest("[data-cash-key]");
    const cashAdd = event.target.closest("[data-cash-add]");
    const cashExact = event.target.closest("[data-cash-exact]");
    if (cashInput && (cashKey || cashAdd || cashExact)) {
        const currentAmount = Number(cashDigits(cashInput.value) || 0);
        if (cashExact) setCashInput(cashInput, document.getElementById("cashSummary").dataset.total);
        else if (cashAdd) setCashInput(cashInput, String(currentAmount + Number(cashAdd.dataset.cashAdd)));
        else if (cashKey.dataset.cashKey === "clear") setCashInput(cashInput, "");
        else if (cashKey.dataset.cashKey === "backspace") setCashInput(cashInput, cashDigits(cashInput.value).slice(0, -1));
        else setCashInput(cashInput, `${cashDigits(cashInput.value)}${cashKey.dataset.cashKey}`);
        updateCashSummary();
        cashInput.focus({ preventScroll: true });
        return;
    }
    const groupCard = event.target.closest("[data-open-group]");
    if (groupCard) {
        activeProductGroup = groupCard.dataset.openGroup;
        renderItemGroups();
        return;
    }
    const pageLink = event.target.closest("[data-page]");
    if (pageLink) {
        goToPage(pageLink.dataset.page);
        return;
    }
    const action = event.target.closest("[data-action]");
    if (action) handleAction(action.dataset.action);

    const addToSale = event.target.closest("[data-sale-add]");
    if (addToSale) {
        animateProductToCart(addToSale);
        addProductToCart(getProduct(addToSale.dataset.saleAdd));
    }
    const quantityButton = event.target.closest("[data-sale-qty]");
    if (quantityButton) {
        const id = quantityButton.dataset.saleQty;
        const product = getProduct(id);
        const next = (cart.get(id) || 0) + Number(quantityButton.dataset.change);
        if (next <= 0) cart.delete(id);
        else if (product.trackStock && next > product.stock) showToast("Jumlah melebihi stok yang tersedia.", true);
        else cart.set(id, next);
        renderSales();
    }
});

pageContent.addEventListener("keydown", (event) => {
    if (event.target.id !== "saleSearch" || event.key !== "Enter") return;
    event.preventDefault();
    const barcode = event.target.value.trim().toLocaleUpperCase("id");
    if (!barcode) return;
    const product = state.products.find((item) => String(item.barcode || "").trim().toLocaleUpperCase("id") === barcode);
    if (!product) {
        openBarcodeAssignment(event.target.value.trim());
        return;
    }
    addProductToCart(product, true);
});

pageContent.addEventListener("input", (event) => {
    if (event.target.id === "saleCashReceived") {
        const input = event.target;
        const caret = input.selectionStart ?? input.value.length;
        const digitsBeforeCaret = cashDigits(input.value.slice(0, caret)).length;
        setCashInput(input, input.value);
        let nextCaret = 0;
        let digitsAtCaret = 0;
        while (nextCaret < input.value.length && digitsAtCaret < digitsBeforeCaret) {
            if (/\d/.test(input.value[nextCaret])) digitsAtCaret += 1;
            nextCaret += 1;
        }
        input.setSelectionRange(nextCaret, nextCaret);
        updateCashSummary();
        return;
    }
    if (event.target.id === "saleSearch") {
        const cursor = event.target.selectionStart;
        renderSales();
        const search = document.getElementById("saleSearch");
        search.focus();
        search.setSelectionRange(cursor, cursor);
    }
    if (event.target.matches("[data-table-search]") && activePage === "products") {
        const cursor = event.target.selectionStart;
        productSearchQuery = event.target.value.toLocaleLowerCase("id");
        renderModule("products");
        const searchInput = pageContent.querySelector("[data-table-search]");
        searchInput.focus();
        searchInput.setSelectionRange(cursor, cursor);
    } else if (event.target.matches("[data-table-search]")) {
        const query = event.target.value.toLocaleLowerCase("id");
        pageContent.querySelectorAll("#moduleTable tbody tr").forEach((row) => {
            row.hidden = !row.textContent.toLocaleLowerCase("id").includes(query);
        });
    }
    if (event.target.id === "salePromotion") renderSales();
});

pageContent.addEventListener("change", (event) => {
    if (event.target.id === "salePromotion") renderSales();
    if (event.target.id === "salePayment") {
        salePaymentMethod = event.target.value;
        saleQrisConfirmationToken = "";
        renderSales();
    }
    if (event.target.id === "saleQrisConfirmed") {
        saleQrisConfirmationToken = event.target.checked ? event.target.dataset.qrisToken : "";
        renderSales();
    }
    if (event.target.id === "saleCustomer") saleCustomerValue = event.target.value;
    if (event.target.id === "backupImport") importBackup(event.target.files[0]);
    if (event.target.id === "productSortOrder") {
        productSortOrder = event.target.value === "desc" ? "desc" : "asc";
        renderModule("products");
    }
});

pageContent.addEventListener("submit", (event) => {
    event.preventDefault();
    if (event.target.id === "settingsForm") submitSettings(event.target);
    else if (event.target.id === "qrisSettingsForm") submitQrisSettings(event.target);
    else if (event.target.id === "ppobForm") submitPPOB(event.target);
    else if (event.target.id === "entityForm") {
        if (modalFormContext.entity === "purchase") submitPurchase(event.target);
        else if (modalFormContext.entity === "stocktake") submitStocktake(event.target);
        else submitEntityForm(event.target);
    }
});

modalRoot.addEventListener("click", (event) => {
    if (event.target.closest("[data-close-modal]")) closeModal();
});
modalRoot.addEventListener("submit", (event) => {
    if (event.target.id === "barcodeAssignForm") {
        event.preventDefault();
        submitBarcodeAssignment(event.target);
        return;
    }
    if (event.target.id !== "entityForm") return;
    event.preventDefault();
    if (modalFormContext.entity === "purchase") submitPurchase(event.target);
    else if (modalFormContext.entity === "stocktake") submitStocktake(event.target);
    else submitEntityForm(event.target);
});

document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
        if (!tutorialRoot.hidden) closeTutorial();
        if (!modalRoot.hidden) closeModal();
        document.getElementById("sidebar").classList.remove("mobile-open");
    }
});

initializeFirebase();
