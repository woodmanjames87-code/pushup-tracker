/*************************************************
 * 1. GLOBAL STATE & DOM REFERENCES
 *************************************************/
window.currentExercise = "pushups";
window.selectedEditDate = "";
window.appInitialized = false;

// DOM References for the "Conductor"
let floatingLogBtn, logModal, modalInput, cancelBtn, okBtn, logForm;

function initDOMReferences() {
    floatingLogBtn = document.getElementById("floating-log-btn");
    logModal = document.getElementById("log-modal");
    modalInput = document.getElementById("modal-input");
    cancelBtn = document.getElementById("modal-cancel");
    okBtn = document.getElementById("modal-ok");
    logForm = document.getElementById("log-form");
}

const lbFilterContainer = document.getElementById("leaderboard-filter");
const goalModeToggle = document.getElementById("goal-mode-toggle");
const manualGoalInput = document.getElementById("manual-goal-input");
const datePicker = document.getElementById("edit-date-picker");
const themeContainer = document.getElementById("theme-selector");
const addPastBtn = document.getElementById("btn-add-past");
const editDatePicker = document.getElementById("edit-date-picker");
const updateNameBtn = document.getElementById("btn-update-username");
const installBanner = document.getElementById("install-banner");
const installNowBtn = document.getElementById("btn-install-now");
const installCloseBtn = document.getElementById("btn-install-close");

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
            // 1. Check the Store (Logic)
            if (window.getDateKey) {
                window.selectedEditDate = window.getDateKey();
            }
            // 2. Check the UI (Visuals)
            if (window.openLogModal) {
                window.openLogModal();
            }
        };
    }

    // --- 2. SUBMITTING THE DATA ---
    if (logForm) {
        logForm.onsubmit = (e) => {
            e.preventDefault();
            const reps = parseInt(modalInput.value);

            // Ensure we have the logic function before proceeding
            if (reps > 0 && window.addSetToDate) {
                // 1. Resolve the Date (Logic)
                // Use selected date if it exists, otherwise ask the Store for Today
                let targetDate = window.selectedEditDate;
                if (!targetDate && window.getDateKey) {
                    targetDate = window.getDateKey();
                }

                // 2. Perform the Save
                if (window.addSetToDate) {
                    window.addSetToDate(targetDate, reps);

                    // Trigger the physical feedback
                    if (window.triggerHaptic) window.triggerHaptic("success");
                }

                // 3. Update the Visuals (UI)
                if (window.closeLogModal) window.closeLogModal();
                if (window.updateDisplay) window.updateDisplay();
                if (window.renderEditList) window.renderEditList();
                if (window.fetchLeaderboard) window.fetchLeaderboard();

                window.scrollTo({ top: 0, behavior: "smooth" });
            }
        };
    }
    // --- 3. CANCEL BUTTON (The Dismissal) ---
    if (cancelBtn) {
        cancelBtn.onclick = () => {
            if (window.closeLogModal) {
                window.closeLogModal();
            }
        };
    }

    // --- 4. OUTSIDE CLICK (The "Quick Exit") ---
    // This closes the modal if the user clicks the dark overlay area
    window.addEventListener("click", (e) => {
        const logModal = document.getElementById("log-modal");
        if (e.target === logModal && window.closeLogModal) {
            window.closeLogModal();
        }
    });

    // NOTE: The "OK" button doesn't need a listener!
    // Because it's type="submit", the logForm.onsubmit handles it.

    // --- NAV BUTTONS TRIGGER ---
    const navButtons = document.querySelectorAll(".nav-item");
    if (navButtons.length >= 3) {
        navButtons[0].onclick = () => showPage("tracker");
        navButtons[1].onclick = () => showPage("leaderboard");
        navButtons[2].onclick = () => showPage("settings");
    }

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
            const data = window.loadData
                ? window.loadData()
                : JSON.parse(localStorage.getItem(window.STORAGE_KEY) || "{}");
            if (!data.settings) data.settings = {};

            // 2. Update the setting (Toggle ON = Auto, OFF = Manual)
            data.settings.goalMode = e.target.checked ? "auto" : "manual";

            // 3. Save it
            if (window.saveData) {
                window.saveData(data);
            } else {
                localStorage.setItem(window.STORAGE_KEY, JSON.stringify(data));
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
 *  PWA & SERVICE WORKER UTILS
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
                updateBtn.disabled = true;

                const reg = await navigator.serviceWorker.getRegistration();

                if (reg) {
                    // Listen for the new worker state
                    reg.onupdatefound = () => {
                        const newWorker = reg.installing;
                        newWorker.onstatechange = () => {
                            if (newWorker.state === "installed") {
                                updateBtn.innerText = "Update Found! Reloading...";
                                newWorker.postMessage({ type: "SKIP_WAITING" });
                            }
                        };
                    };

                    // Force a check against the server
                    await reg.update();

                    // If there was ALREADY a worker waiting (common!)
                    if (reg.waiting) {
                        updateBtn.innerText = "Updating...";
                        reg.waiting.postMessage({ type: "SKIP_WAITING" });
                    } else {
                        // If no update was found after 2 seconds, reset button
                        setTimeout(() => {
                            if (updateBtn.innerText === "Checking...") {
                                updateBtn.innerText = "App is up to date!";
                                updateBtn.disabled = false;
                                setTimeout(() => (updateBtn.innerText = "Check for Updates"), 5000);
                            }
                        }, 2000);
                    }
                }
            };
        }
    }

    // --- Install Banner Logic (The Conductor) ---
    let deferredPrompt;

    // 1. When the browser says "I'm ready to install"
    window.addEventListener("beforeinstallprompt", (e) => {
        e.preventDefault();
        deferredPrompt = e;
        if (window.showUnifiedInstallBanner) window.showUnifiedInstallBanner("android");
    });

    // 2. Initial check for iOS (Since there is no event for iOS)
    const isStandalone = window.navigator.standalone || window.matchMedia("(display-mode: standalone)").matches;
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

    if (!isStandalone && isIOS) {
        if (window.showUnifiedInstallBanner) window.showUnifiedInstallBanner("ios");
    }

    // 3. Button Click Listeners
    const installBtn = document.getElementById("btn-install-now");
    const closeBtn = document.getElementById("btn-install-close");

    if (installBtn) {
        installBtn.onclick = async () => {
            if (deferredPrompt) {
                deferredPrompt.prompt();
                await deferredPrompt.userChoice;
                deferredPrompt = null;
                document.getElementById("install-banner")?.classList.add("hidden");
            }
        };
    }

    if (closeBtn) {
        closeBtn.onclick = () => {
            document.getElementById("install-banner")?.classList.add("hidden");
            // Save to localStorage so it stays hidden today
            localStorage.setItem("installBannerClosed", new Date().toLocaleDateString());
        };
    }
}

/*************************************************
 * PULL TO REFRESH
 *************************************************/
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
