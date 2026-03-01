/*************************************************
 * 1. GLOBAL STATE & DOM REFERENCES
 *************************************************/
window.currentExercise = "pushups";
window.selectedEditDate = "";
window.appInitialized = false;

// DOM References for the "Conductor"
let floatingLogBtn, logModal, modalInput, cancelBtn, okBtn;

function initDOMReferences() {
    floatingLogBtn = document.getElementById("floating-log-btn");
    logModal = document.getElementById("log-modal");
    modalInput = document.getElementById("modal-input");
    cancelBtn = document.getElementById("modal-cancel");
    okBtn = document.getElementById("modal-ok");
}

const lbFilterContainer = document.getElementById("leaderboard-filter");
const goalModeToggle = document.getElementById("goal-mode-toggle");
const manualGoalInput = document.getElementById("manual-goal-input");
const datePicker = document.getElementById("edit-date-picker");
const themeContainer = document.getElementById("theme-selector");
const addPastBtn = document.getElementById("btn-add-past");
const editDatePicker = document.getElementById("edit-date-picker");
const updateNameBtn = document.getElementById("btn-update-username");

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

    if (window.loadCurrentUsername) {
        window.loadCurrentUsername();
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
    initDOMReferences(); // Ensure we have the elements

    // --- 1. OPENING THE MODAL ---
    if (floatingLogBtn) {
        floatingLogBtn.onclick = () => {
            if (logModal) {
                // Always reset to the user's current LOCAL date when logging from the main screen
                if (window.getDateKey) {
                    window.selectedEditDate = window.getDateKey();
                }

                logModal.style.display = "flex";
                if (modalInput) {
                    modalInput.value = "";
                    modalInput.focus();
                }
            }
        };
    }

    // --- 2. SUBMITTING THE DATA (Form + Enter Key) ---
    const logForm = document.getElementById("log-form");
    if (logForm) {
        logForm.onsubmit = (e) => {
            e.preventDefault(); // Prevent page reload

            const reps = parseInt(modalInput.value);
            if (reps > 0 && window.addSetToDate) {
                // (adds a fallback to Today just in case):
                const targetDate = window.selectedEditDate || window.getDateKey();
                window.addSetToDate(targetDate, reps);

                // UI Cleanup
                logModal.style.display = "none";
                modalInput.value = "";

                // Refresh visuals
                if (window.updateDisplay) window.updateDisplay();
                if (window.renderEditList) window.renderEditList();

                // Smooth scroll to top to see progress update
                setTimeout(() => {
                    window.scrollTo({ top: 0, behavior: "smooth" });
                }, 100);
            }
        };
    }

    // --- 3. CANCEL & OUTSIDE CLICK ---
    if (cancelBtn) {
        cancelBtn.onclick = () => {
            logModal.style.display = "none";
        };
    }
    window.addEventListener("click", (e) => {
        if (e.target === logModal) logModal.style.display = "none";
    });
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
                    if (card) {
                        card.classList.replace("expanded", "collapsed");
                    }
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

    // --- Leaderboard Filter Toggle ---
    if (lbFilterContainer) {
        const filterButtons = lbFilterContainer.querySelectorAll(".seg-btn");

        filterButtons.forEach((btn) => {
            btn.addEventListener("click", () => {
                // 1. Visual Active Toggle
                filterButtons.forEach((b) => b.classList.remove("active"));
                btn.classList.add("active");

                // 2. Show Loader immediately so user knows it's working
                const lbList = document.getElementById("lb-list");
                if (lbList) lbList.innerHTML = '<div class="loader"></div>';

                // 3. Update Label instantly
                const rangeText = document.getElementById("lb-date-range-text");
                if (rangeText) {
                    const label = btn.innerText;
                    rangeText.innerText = label === "Daily" ? "Today & Yesterday" : `This ${label}`;
                }

                // 4. Trigger Fetch with the specific filter
                const filterValue = btn.getAttribute("data-filter");
                if (window.fetchLeaderboard) {
                    window.fetchLeaderboard(filterValue);
                }
            });
        });
    }

    // --- Update Leaderboard Display Name ---
    if (updateNameBtn) {
        updateNameBtn.onclick = async () => {
            const nameInput = document.getElementById("username-input");
            const newName = nameInput.value.trim();
            const user = window.auth?.currentUser;

            // Validation
            if (!user) {
                alert("Please log in to change your name.");
                return;
            }
            if (newName.length < 2) {
                alert("Name is too short!");
                return;
            }

            // UI State: Loading
            updateNameBtn.innerText = "Saving...";
            updateNameBtn.disabled = true;

            try {
                // Get Firebase tools from the global window object (defined in init-firebase.js)
                const { doc, setDoc, updateProfile } = window.firebaseMethods;
                const userRef = doc(window.db, "users", user.uid);

                // 1. Update Firestore (Source of truth for Leaderboard)
                await setDoc(userRef, { username: newName }, { merge: true });

                // 2. Update Local Storage via the Store
                const data = window.loadData();
                if (!data.settings) data.settings = {};
                data.settings.username = newName;
                window.saveData(data);

                // 3. Update Firebase Auth Profile
                if (updateProfile) {
                    await updateProfile(user, { displayName: newName });
                }

                alert("Username updated!");
            } catch (err) {
                console.error("Update failed:", err);
                alert("Failed to update name.");
            } finally {
                updateNameBtn.innerText = "Update";
                updateNameBtn.disabled = false;
            }
        };
    }

    // --- Date Picker ---
    if (datePicker) {
        datePicker.addEventListener("change", (e) => {
            window.selectedEditDate = e.target.value;
            if (window.renderEditList) window.renderEditList();
        });
    }

    // --- Goal Mode Toggle ---
    if (goalModeToggle) {
        goalModeToggle.addEventListener("change", (e) => {
            // 1. Get current data
            const data = window.loadData ? window.loadData() : JSON.parse(localStorage.getItem("workout-data") || "{}");
            if (!data.settings) data.settings = {};

            // 2. Update the setting (Toggle ON = Auto, OFF = Manual)
            data.settings.goalMode = e.target.checked ? "auto" : "manual";

            // 3. Save it
            if (window.saveData) {
                window.saveData(data);
            } else {
                localStorage.setItem("workout-data", JSON.stringify(data));
            }

            // 4. Update the UI visibility immediately
            if (window.updateGoalUI) window.updateGoalUI();
            if (window.updateDisplay) window.updateDisplay();
        });
    }

    if (manualGoalInput) {
        manualGoalInput.addEventListener("change", (e) => {
            const data = window.loadData();
            if (!data.settings) data.settings = {};
            data.settings.manualGoal = parseInt(e.target.value) || 60;
            window.saveData(data);
            window.updateDisplay();
        });
    }

    // --- Theme / Display Mode Selector ---
    if (themeContainer) {
        const themeButtons = themeContainer.querySelectorAll(".seg-btn");

        themeButtons.forEach((btn) => {
            btn.addEventListener("click", () => {
                const selectedTheme = btn.getAttribute("data-theme");

                // 1. Call the Painter to change the actual CSS colors
                if (window.setTheme) {
                    window.setTheme(selectedTheme);
                }

                // 2. Update visual button states
                themeButtons.forEach((b) => b.classList.remove("active"));
                btn.classList.add("active");
            });
        });
    }

    // --- Add Set to Past Date (Settings Page) ---
    const addPastBtn = document.getElementById("btn-add-past");

    if (addPastBtn) {
        console.log("Found Add Past Button - Attaching Listener"); // Debug log
        addPastBtn.onclick = () => {
            const editDatePicker = document.getElementById("edit-date-picker");
            const logModal = document.getElementById("log-modal");
            const modalInput = document.getElementById("modal-input");

            // 1. Get the date (Local time check)
            const selectedDate =
                editDatePicker && editDatePicker.value
                    ? editDatePicker.value
                    : window.getDateKey
                      ? window.getDateKey()
                      : new Date().toISOString().split("T")[0];

            // 2. Set the global state for the OK button
            window.selectedEditDate = selectedDate;

            // 3. Open the modal
            if (logModal) {
                logModal.style.display = "flex";
                if (modalInput) {
                    modalInput.value = "";
                    setTimeout(() => modalInput.focus(), 50);
                }
            }
        };
    } else {
        console.warn("Could not find button with ID: btn-add-past");
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
        navigator.serviceWorker
            .register("./sw.js")
            .then(() => console.log("DailyGrind: Offline Mode Active"))
            .catch((err) => console.log("SW Registration Failed", err));
    }

    const versionEl = document.getElementById("app-version");
    const updateBtn = document.getElementById("btn-update-app");

    if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
        // Get Version
        const msgChan = new MessageChannel();
        msgChan.port1.onmessage = (e) => {
            if (e.data.version && versionEl) versionEl.innerText = `Version ${e.data.version}`;
        };
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
        } catch (err) {
            console.log("Share failed, falling back.");
        }
    }
    // Fallback Download
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = fileName;
    a.click();
};
// Clear local data
window.handleClearData = () => {
    if (confirm("⚠️ Are you sure? This will delete all local data and cannot be undone (unless synced to cloud).")) {
        localStorage.removeItem("workout-data");
        location.reload(); // Refresh to reset state
    }
};
// Import data
window.handleImport = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const importedData = JSON.parse(e.target.result);
            // Basic validation to ensure it's a DailyGrind file
            if (typeof importedData === "object") {
                localStorage.setItem("workout-data", JSON.stringify(importedData));
                alert("Import successful!");
                location.reload();
            }
        } catch (err) {
            alert("Error: Invalid backup file.");
        }
    };
    reader.readAsText(file);
};

function setupPullToRefresh() {
    let startY = 0;
    let isPulling = false;
    const ptr = document.getElementById("pull-to-refresh");

    if (!ptr) return; // Guard clause

    window.addEventListener(
        "touchstart",
        (e) => {
            if (window.scrollY === 0) {
                startY = e.touches[0].pageY;
                isPulling = true;
            }
        },
        { passive: true },
    );

    window.addEventListener(
        "touchmove",
        (e) => {
            if (!isPulling) return;
            const diff = e.touches[0].pageY - startY;
            if (diff > 0) {
                const y = Math.pow(diff, 0.85);
                ptr.style.transform = `translateY(${y}px)`;
            }
        },
        { passive: true },
    );

    window.addEventListener("touchend", (e) => {
        if (!isPulling) return;
        const diff = e.changedTouches[0].pageY - startY;

        if (diff > 70) {
            ptr.style.transform = "translateY(60px)";

            // --- Save current page state ---
            const pages = document.querySelectorAll(".page");
            let activePageId = "tracker-page";
            pages.forEach((page) => {
                if (page.style.display !== "none") activePageId = page.id;
            });
            window.location.hash = activePageId;

            location.reload();
        } else {
            ptr.style.transform = "translateY(0)";
        }
        isPulling = false;
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
