/*************************************************
 * 1. GLOBAL STATE & DOM REFERENCES
 *************************************************/
window.currentExercise = "pushups";
window.selectedEditDate = ""; 
window.appInitialized = false;

// DOM References for the "Conductor"
const logForm = document.getElementById("log-form");
const logInput = document.getElementById("log-input");
const logModal = document.getElementById("log-modal");
const modalInput = document.getElementById("modal-input");
const datePicker = document.getElementById("edit-date-picker");

/*************************************************
 * 2. initApp (The Entry Point)
 *************************************************/
async function initApp() {
    if (document.visibilityState === "hidden") return;

    // Set initial date if not set
    if (!window.selectedEditDate && window.getDateKey) {
        window.selectedEditDate = window.getDateKey();
        if (datePicker) datePicker.value = window.selectedEditDate;
    }

    // Theme & Initial Navigation
    const savedTheme = localStorage.getItem("user-theme") || "auto";
    if (window.setTheme) window.setTheme(savedTheme);

    const hash = window.location.hash.substring(1);
    window.showPage(hash ? hash.replace("-page", "") : "tracker");

    // Only run one-time setups once
    if (!window.appInitialized) {
        setupEventListeners();
        initPWAUtils(); // Version checking & Service Worker
        window.appInitialized = true;
    }
    
    if (window.updateDisplay) window.updateDisplay();
}

// Lifecycle Listeners
window.addEventListener("DOMContentLoaded", initApp);
document.addEventListener("visibilitychange", initApp);
window.addEventListener("focus", initApp);
window.addEventListener("hashchange", () => {
    const pageId = window.location.hash.substring(1).replace("-page", "");
    if (pageId) window.showPage(pageId);
});

/*************************************************
 * 3. EVENT LISTENERS SETUP
 *************************************************/
function setupEventListeners() {
    // --- Logging & Forms ---
    if (logForm) {
        logForm.onsubmit = (e) => {
            e.preventDefault();
            const reps = parseInt(modalInput ? modalInput.value : logInput.value);
            if (reps > 0 && window.addSetToDate) {
                window.addSetToDate(window.selectedEditDate, reps);
                if (modalInput) modalInput.value = "";
                if (logInput) logInput.value = "";
                if (logModal) logModal.style.display = "none";
                window.updateDisplay();
            }
        };
    }

    // --- Navigation ---
    document.querySelectorAll(".nav-item").forEach((btn, idx) => {
        btn.addEventListener("click", () => {
            const pages = ["tracker", "leaderboard", "settings"];
            window.showPage(pages[idx]);
        });
    });

    // --- Settings / Accordion Logic ---
    document.querySelectorAll(".accordion-header").forEach((header) => {
        header.addEventListener("click", () => {
            const currentItem = header.parentElement;
            const currentCard = currentItem.querySelector(".widget-card");
            const isAlreadyOpen = currentItem.classList.contains("active");

            // Close others
            document.querySelectorAll(".accordion-item").forEach((item) => {
                if (item !== currentItem) {
                    item.classList.remove("active");
                    const card = item.querySelector(".widget-card");
                    if (card) { card.classList.replace("expanded", "collapsed"); }
                }
            });

            // Toggle Clicked
            currentItem.classList.toggle("active", !isAlreadyOpen);
            if (currentCard) {
                currentCard.classList.toggle("expanded", !isAlreadyOpen);
                currentCard.classList.toggle("collapsed", isAlreadyOpen);
            }
        });
    });

    // --- Date Picker ---
    if (datePicker) {
        datePicker.addEventListener("change", (e) => {
            window.selectedEditDate = e.target.value;
            if (window.renderEditList) window.renderEditList();
        });
    }

    // --- Pull to Refresh (Leaderboard) ---
    setupPullToRefresh();
}

/*************************************************
 * 4. PWA & SERVICE WORKER UTILS
 *************************************************/
async function initPWAUtils() {
    // Register Service Worker
    if ("serviceWorker" in navigator) {
        navigator.serviceWorker.register("./sw.js")
            .then(() => console.log("DailyGrind: Offline Mode Active"))
            .catch((err) => console.log("SW Registration Failed", err));
    }

    const versionEl = document.getElementById("app-version");
    const updateBtn = document.getElementById("btn-update-app");

    if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
        // Get Version
        const msgChan = new MessageChannel();
        msgChan.port1.onmessage = (e) => { if (e.data.version && versionEl) versionEl.innerText = `Version ${e.data.version}`; };
        navigator.serviceWorker.controller.postMessage({ type: "GET_VERSION" }, [msgChan.port2]);

        // Update App Logic
        if (updateBtn) {
            updateBtn.onclick = async () => {
                updateBtn.innerText = "Checking...";
                const reg = await navigator.serviceWorker.getRegistration();
                if (reg) {
                    reg.onupdatefound = () => {
                        const newWorker = reg.installing;
                        newWorker.onstatechange = () => {
                            if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
                                newWorker.postMessage({ type: "SKIP_WAITING" });
                            }
                        };
                    };
                    await reg.update();
                    if (reg.waiting) reg.waiting.postMessage({ type: "SKIP_WAITING" });
                }
            };
        }
    }
}

// Logic to handle PWA Install Prompt
let deferredPrompt;
window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (window.showUnifiedInstallBanner) window.showUnifiedInstallBanner("android");
});

/*************************************************
 * 5. DATA MANAGEMENT (Import/Export/Clear)
 *************************************************/
// These reference the logic in store.js or local UI
window.handleExport = async () => {
    const data = localStorage.getItem("workout-data") || "{}";
    const blob = new Blob([data], { type: "application/json" });
    const fileName = `dailygrind-backup-${new Date().toISOString().slice(0, 10)}.json`;
    
    if (navigator.share) {
        const file = new File([blob], fileName, { type: "application/json" });
        try {
            await navigator.share({ files: [file], title: "DailyGrind Backup" });
            return;
        } catch (err) { console.log("Share failed, falling back."); }
    }
    // Fallback Download
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = fileName;
    a.click();
};

function setupPullToRefresh() {
    let startY = 0;
    const ptr = document.getElementById("pull-to-refresh");
    window.addEventListener("touchstart", (e) => { if (window.scrollY === 0) startY = e.touches[0].pageY; }, { passive: true });
    window.addEventListener("touchmove", (e) => {
        const diff = e.touches[0].pageY - startY;
        if (diff > 0 && ptr && window.scrollY === 0) ptr.style.transform = `translateY(${Math.pow(diff, 0.85)}px)`;
    }, { passive: true });
    window.addEventListener("touchend", (e) => {
        const diff = e.changedTouches[0].pageY - startY;
        if (diff > 70 && ptr) { location.reload(); } 
        else if (ptr) { ptr.style.transform = "translateY(0)"; }
    });
}



// Watch for system theme changes if set to auto
window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => {
    if (localStorage.getItem("user-theme") === "auto") {
        window.setTheme("auto");
    }
});



const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
const isStandalone = window.matchMedia("(display-mode: standalone)").matches;
if (isIOS && !isStandalone) {
    window.showUnifiedInstallBanner("ios");
}

