/*************************************************
 * 1. GLOBAL STATE & DOM REFERENCES
 *************************************************/
window.selectedEditDate = "";
window.appInitialized = false;

// DOM References (Initialized in initApp)
function initDOMReferences() {
    window.navButtons = document.querySelectorAll(".nav-item");
    // Modal Elements
    window.floatingLogBtn = document.getElementById("floating-log-btn");
    window.logModal = document.getElementById("log-modal");
    window.modalTitle = document.getElementById("modal-title");
    window.modalPrompt = document.getElementById("modal-prompt");
    window.modalInput = document.getElementById("modal-input");
    window.modalCancelBtn = document.getElementById("modal-cancel");
    window.logForm = document.getElementById("log-form");
    window.toastContainer = document.getElementById("toast-container");
    // Install Banner Elements
    window.installBanner = document.getElementById("install-banner");
    window.installNowBtn = document.getElementById("btn-install-now");
    window.installCloseBtn = document.getElementById("btn-install-close");
    window.installText = document.getElementById("install-text");
    // Leaderboard Elements
    window.lbFilterContainer = document.getElementById("leaderboard-filter");
    if (window.lbFilterContainer) {
        window.lbFilterButtons = window.lbFilterContainer.querySelectorAll(".seg-btn");
    }
    window.lbList = document.getElementById("lb-list");
    window.lbRangeText = document.getElementById("lb-date-range-text");
    window.podiumOverlay = document.getElementById("mini-podium-overlay");
    window.podiumTitle = document.getElementById("podium-title");
    window.podiumSlots = [
        document.querySelector(".rank-1"),
        document.querySelector(".rank-2"),
        document.querySelector(".rank-3"),
    ];
    window.podiumSlots.forEach((slot) => {
        if (slot) {
            slot._name = slot.querySelector(".p-name");
            slot._score = slot.querySelector(".p-score");
        }
    });
    // Settings Page Elements
    window.accordionHeaders = document.querySelectorAll(".accordion-header");
    window.accordionItems = document.querySelectorAll(".accordion-item");
    window.accordionItems.forEach((item) => {
        item._card = item.querySelector(".widget-card");
    });
    window.nameInput = document.getElementById("username-input");
    window.updateNameBtn = document.getElementById("btn-update-username");
    window.onTrackInput = document.getElementById("on-track-input");
    window.onTrackHint = document.getElementById("on-track-display-hint");
    window.ontrackMinusBtn = document.getElementById("btn-ontrack-minus");
    window.ontrackPlusBtn = document.getElementById("btn-ontrack-plus");
    window.improveDisplay = document.getElementById("improve-display");
    window.editSetsList = document.getElementById("edit-sets-list");
    window.displayDateLabel = document.getElementById("display-date-label");
    window.goalModeToggle = document.getElementById("goal-mode-toggle");
    window.manualGoalContainer = document.getElementById("manual-goal-container");
    window.manualGoalInput = document.getElementById("manual-goal-input");
    window.thresholdModeToggle = document.getElementById("threshold-mode-toggle");
    window.customThresholdContainer = document.getElementById("custom-threshold-container");
    window.addPastBtn = document.getElementById("btn-add-past");
    window.editDatePicker = document.getElementById("edit-date-picker");
    window.versionEl = document.getElementById("app-version");
    window.updateAppBtn = document.getElementById("btn-update-app");
    window.importInput = document.getElementById("import-input");
    window.themeContainer = document.getElementById("theme-selector");
    if (window.themeContainer) {
        window.themeButtons = window.themeContainer.querySelectorAll(".seg-btn");
    }
    // UI.js Elements
    window.authBtn = document.getElementById("auth-button");
    window.ptr = document.getElementById("pull-to-refresh");
    window.greenBar = document.getElementById("progress-bar-green");
    window.blueBar = document.getElementById("progress-bar-blue");
    window.trendFill = document.getElementById("trend-fill");
    window.trendLabel = document.getElementById("trend-label");
    window.barChart = document.getElementById("bar-chart");
    window.barLabels = document.getElementById("bar-labels");
    window.restStreakTag = document.getElementById("rest-streak-tag");
    window.milestoneFill = document.getElementById("milestone-fill");
    window.pillElite = document.getElementById("pill-elite");
    window.pillSolid = document.getElementById("pill-solid");
    window.pillLight = document.getElementById("pill-light");
    window.monthlyChart = document.getElementById("monthly-chart");
    window.goalDescriptions = document.querySelectorAll(".goal-description");
    window.thresholdDescriptions = document.querySelectorAll(".threshold-description");
    window.unitLabels = document.querySelectorAll(".unit-label"); // For any text that says 'reps'
    // The "Stat Map" for updateDisplay
    window.uiStats = {};
    const statIds = [
        "today-val",
        "yest-val",
        "goal-text",
        "streak-val",
        "rest-val",
        "rest-streak-val",
        "total-30-val",
        "active-30-val",
        "avg-30",
        "thirty-goal-val",
        "thirty-improv-val",
        "axis-max-l",
        "axis-max-r",
        "axis-mid-l",
        "axis-mid-r",
        "weekly-title",
        "legacy-projected",
        "legacy-since",
        "legacy-active-days",
        "stat-all-time",
        "stat-pb",
        "stat-ytd",
        "stat-century",
        "stat-avg",
        "label-next-milestone",
    ];
    statIds.forEach((id) => {
        const el = document.getElementById(id);
        if (!el) console.warn(`⚠️ Missing DOM element: #${id}`);
        window.uiStats[id] = el;
    });
    console.log("🎯 DOM references and Stat Map initialized");
}

/*************************************************
 * 2. initApp (The Entry Point)
 *************************************************/
async function initApp() {
    if (document.visibilityState === "hidden") return;

    // --- 1. STRUCTURAL SETUP (Run ONLY Once) ---
    if (!window.appInitialized) {
        initDOMReferences();
        setupEventListeners();
        initPWAUtils();
        window.migrateToMultiExercise();

        // This starts the Auth listener, which will eventually trigger the UI Refresh
        if (window.initAuthListener) window.initAuthListener();

        window.appInitialized = true;
        // We STOP here on the first run. Let the Auth Listener trigger the first UI draw.
        return;
    }
    // --- 2. UI & DATA REFRESH (Runs on every Focus/Auth Change/Visibility) ---
    // This part only runs after appInitialized is true
    refreshStateAndUI();
}

let lastInitTime = 0;

window.refreshStateAndUI = function () {
    const now = Date.now();
    const isQuickRefresh = now - lastInitTime < 10000;

    // --- 2. INITIAL STATE (Logic & UI) ---
    if (!window.selectedEditDate && window.getDateKey) {
        window.selectedEditDate = window.getDateKey();
        if (window.editDatePicker) {
            editDatePicker.value = window.selectedEditDate;
        }
    }

    // --- 3. THEME & NAVIGATION ---
    const savedTheme = localStorage.getItem("user-theme") || "auto";
    if (window.setTheme) window.setTheme(savedTheme);

    const hash = window.location.hash.substring(1);
    window.showPage(hash ? hash.replace("-page", "") : "tracker");

    // Ensure this runs BEFORE window.renderExerciseSwitcher()
    const savedExercise = localStorage.getItem("lastExercise");

    // Check if the saved ID actually exists in our library, otherwise default to 'pushups'
    window.currentExercise =
        savedExercise && window.EXERCISE_LIB[savedExercise] ? savedExercise : Object.keys(window.EXERCISE_LIB)[0];

    // --- 4. DATA REFRESH (Local) ---
    if (window.loadCurrentUsername) window.loadCurrentUsername();
    if (window.updateDisplay) window.updateDisplay();
    if (window.renderExerciseSettings) window.renderExerciseSettings();
    if (window.renderExerciseSwitcher) window.renderExerciseSwitcher();
    if (window.renderEnabledSelector) window.renderEnabledSelector();

    // --- 5. CLOUD SYNC (Background) ---
    if (!isQuickRefresh && window.auth?.currentUser && window.reconcileData) {
        lastInitTime = now;
        window
            .reconcileData()
            .then(() => {
                console.log("☁️ Background sync complete.");
                // Silent Leaderboard refresh if active
                const pageId = window.location.hash.substring(1).replace("-page", "");
                if (pageId === "leaderboard" && window.fetchLeaderboard) {
                    window.fetchLeaderboard();
                }
            })
            .catch((err) => console.error("Sync Error:", err));
    }
};

/*************************************************
 * 3. EVENT LISTENERS SETUP
 *************************************************/
function setupEventListeners() {
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
    if (modalCancelBtn) {
        modalCancelBtn.onclick = () => {
            if (window.closeLogModal) {
                window.closeLogModal();
            }
        };
    }

    // --- 4. OUTSIDE CLICK (The "Quick Exit") ---
    // This closes the modal if the user clicks the dark overlay area
    window.addEventListener("click", (e) => {
        if (e.target === logModal && window.closeLogModal) {
            window.closeLogModal();
        }
    });

    // NOTE: The "OK" button doesn't need a listener!
    // Because it's type="submit", the logForm.onsubmit handles it.

    // --- NAV BUTTONS TRIGGER ---
    if (navButtons.length >= 3) {
        navButtons[0].onclick = () => showPage("tracker");
        navButtons[1].onclick = () => showPage("leaderboard");
        navButtons[2].onclick = () => showPage("settings");
    }

    // --- Settings / Accordion Logic ---
    window.accordionHeaders.forEach((header) => {
        header.addEventListener("click", () => {
            const currentItem = header.parentElement;
            const isAlreadyOpen = currentItem.classList.contains("active");

            // Close others
            window.accordionItems.forEach((item) => {
                if (item !== currentItem) {
                    item.classList.remove("active");
                    // 🚀 Instant access via the shortcut
                    if (item._card) {
                        item._card.classList.replace("expanded", "collapsed");
                    }
                }
            });

            // Toggle the clicked one
            if (!isAlreadyOpen) {
                currentItem.classList.add("active");
                if (currentItem._card) currentItem._card.classList.replace("collapsed", "expanded");
            } else {
                currentItem.classList.remove("active");
                if (currentItem._card) currentItem._card.classList.replace("expanded", "collapsed");
            }
        });
    });

    // --- Leaderboard Filter Toggle ---
    window.lbFilterButtons.forEach((btn) => {
        btn.addEventListener("click", () => {
            // 1. Visual Active Toggle
            window.lbFilterButtons.forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");

            // 2. Show Loader immediately so user knows it's working
            if (lbList) lbList.innerHTML = '<div class="loader"></div>';

            // 3. Update Label instantly
            if (lbRangeText) {
                const label = btn.innerText;
                lbRangeText.innerText = label === "Daily" ? "Today & Yesterday" : `This ${label}`;
            }

            // 4. Trigger Fetch with the specific filter
            const filterValue = btn.getAttribute("data-filter");
            if (window.fetchLeaderboard) {
                window.fetchLeaderboard(filterValue);
            }
        });
    });

    // --- Update Display Name ---
    if (updateNameBtn) {
        updateNameBtn.onclick = async () => {
            const newName = nameInput.value.trim();
            const user = window.auth?.currentUser;

            // Validation
            if (!user) {
                window.triggerHaptic?.("warning");
                window.showToast("Please log in to change your name.");
                return;
            }
            if (newName.length < 2) {
                window.triggerHaptic?.("warning");
                window.showToast("Name is too short!");
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

                window.triggerHaptic?.("success");
                window.showToast("Username updated!");
            } catch (err) {
                console.error("Update failed:", err);
                window.triggerHaptic?.("warning");
                window.showToast("Failed to update name.");
            } finally {
                updateNameBtn.innerText = "Update";
                updateNameBtn.disabled = false;
            }
        };
    }

    // --- Date Picker ---
    if (editDatePicker) {
        editDatePicker.addEventListener("change", (e) => {
            window.selectedEditDate = e.target.value;
            if (window.renderEditList) window.renderEditList();
        });
    }

    // --- Goal Mode Toggle (Exercise Specific) ---
    if (goalModeToggle) {
        goalModeToggle.addEventListener("change", (e) => {
            const data = window.loadData();
            const exId = window.currentExercise; // The active exercise

            if (!data.settings) data.settings = {};
            if (!data.settings.goals) data.settings.goals = {};
            if (!data.settings.goals[exId]) data.settings.goals[exId] = {};

            // Update the specific exercise setting
            data.settings.goals[exId].goalMode = e.target.checked ? "auto" : "manual";

            window.saveData(data);

            // Update UI visibility and stats
            if (window.renderExerciseSettings) window.renderExerciseSettings();
        });
    }

    // --- Manual Goal Input (Exercise Specific) ---
    if (manualGoalInput) {
        manualGoalInput.addEventListener("change", (e) => {
            const exId = window.currentExercise;
            let val = parseInt(e.target.value);

            // If they leave it blank or type gibberish, then we fall back to minGoal
            if (isNaN(val)) {
                const config = window.EXERCISE_LIB[exId] || { minGoal: 1 };
                val = config.minGoal;
                e.target.value = val;
            }

            const data = window.loadData();
            if (!data.settings.goals) data.settings.goals = {};
            if (!data.settings.goals[exId]) data.settings.goals[exId] = {};

            data.settings.goals[exId].manualGoal = val;

            window.saveData(data);
        });
    }

    // --- Threshold Mode (Global Setting) ---
    // Note: Keeping this global as requested, but updating display
    thresholdModeToggle?.addEventListener("change", (e) => {
        const data = window.loadData();
        if (!data.settings) data.settings = {};

        data.settings.thresholdMode = e.target.checked ? "recommended" : "custom";

        window.saveData(data);
        if (window.renderExerciseSettings) window.renderExerciseSettings();
    });

    // --- Custom Threshold Stepper (Exercise Specific) ---
    window.adjustOnTrack = function (change) {
        const stepper = onTrackInput?.closest(".number-stepper");
        let currentVal = parseInt(onTrackInput.value) || 4;
        let newVal = currentVal + change;

        if (newVal >= 1 && newVal <= 6) {
            onTrackInput.value = newVal;
            if (window.triggerHaptic) window.triggerHaptic("success");

            // UI Hints
            if (improveDisplay) improveDisplay.innerText = newVal + 1;
            if (onTrackHint) onTrackHint.innerText = newVal;

            window.debounceSave(() => {
                const data = window.loadData();
                const exId = window.currentExercise;

                if (!data.settings.goals) data.settings.goals = {};
                if (!data.settings.goals[exId]) data.settings.goals[exId] = {};

                data.settings.goals[exId].onTrackDays = newVal;

                window.saveData(data);
                if (window.updateDisplay) window.updateDisplay();
            }, 600);
        } else {
            if (window.triggerHaptic) window.triggerHaptic("warning");
            if (stepper) {
                stepper.classList.add("limit-shake");
                setTimeout(() => stepper.classList.remove("limit-shake"), 400);
            }
        }
    };

    // Plus and Minus Button Listeners for On Track Days
    if (ontrackMinusBtn) {
        ontrackMinusBtn.addEventListener("click", () => {
            window.adjustOnTrack(-1);
        });
    }

    if (ontrackPlusBtn) {
        ontrackPlusBtn.addEventListener("click", () => {
            window.adjustOnTrack(1);
        });
    }

    // --- Theme / Display Mode Selector ---
    window.themeButtons.forEach((btn) => {
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

    // --- Add Set to Past Date (Settings Page) ---
    if (addPastBtn) {
        addPastBtn.onclick = () => {
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

    // Listen for file selection
    if (window.importInput) {
        importInput.onchange = function (e) {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = function (e) {
                const content = e.target.result;
                smartImport(content);
            };
            reader.readAsText(file);
        };
    }

    // Update the "Improve" hint when the user changes the number
    onTrackInput?.addEventListener("input", (e) => {
        const val = parseInt(e.target.value);
        if (improveDisplay) improveDisplay.innerText = val + 1;
    });

    // --- Pull to Refresh (Leaderboard) ---
    setupPullToRefresh();
}
function setupPullToRefresh() {
    let startY = 0;
    let isPulling = false;

    if (!ptr) return;

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

    window.addEventListener("touchend", async (e) => {
        if (!isPulling) return;
        const diff = e.changedTouches[0].pageY - startY;

        if (diff > 70) {
            ptr.style.transform = "translateY(60px)";
            ptr.classList.add("refreshing"); // 🔄 Optional: add a spin animation in CSS

            // 🚀 SMART SYNC
            await reconcileData();

            // 🏆 REFRESH LEADERBOARD (if visible)
            const pageId = window.location.hash.substring(1).replace("-page", "");
            if (pageId === "leaderboard" && window.fetchLeaderboard) {
                await window.fetchLeaderboard();
            }

            // Snap back
            setTimeout(() => {
                ptr.style.transform = "translateY(0)";
                ptr.classList.remove("refreshing");
            }, 300);
        } else {
            ptr.style.transform = "translateY(0)";
        }
        isPulling = false;
    });
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

    navigator.serviceWorker.addEventListener("controllerchange", () => {
        // This fires when the new Service Worker successfully skips waiting and becomes active
        window.location.reload();
    });

    if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
        // Get Version
        const msgChan = new MessageChannel();
        msgChan.port1.onmessage = (e) => {
            if (e.data.version && versionEl) versionEl.innerText = `Version ${e.data.version}`;
        };
        navigator.serviceWorker.controller.postMessage({ type: "GET_VERSION" }, [msgChan.port2]);

        // Update App Logic
        if (updateAppBtn) {
            updateAppBtn.onclick = async () => {
                updateAppBtn.innerText = "Checking...";
                updateAppBtn.disabled = true;

                const reg = await navigator.serviceWorker.getRegistration();

                if (reg) {
                    // Listen for the new worker state
                    reg.onupdatefound = () => {
                        const newWorker = reg.installing;
                        newWorker.onstatechange = () => {
                            if (newWorker.state === "installed") {
                                updateAppBtn.innerText = "Update Found! Reloading...";
                                newWorker.postMessage({ type: "SKIP_WAITING" });
                            }
                        };
                    };

                    // Force a check against the server
                    await reg.update();

                    // If there was ALREADY a worker waiting (common!)
                    if (reg.waiting) {
                        updateAppBtn.innerText = "Updating...";
                        reg.waiting.postMessage({ type: "SKIP_WAITING" });
                    } else {
                        // If no update was found after 2 seconds, reset button
                        setTimeout(() => {
                            if (updateAppBtn.innerText === "Checking...") {
                                updateAppBtn.innerText = "App is up to date!";
                                updateAppBtn.disabled = false;
                                setTimeout(() => (updateAppBtn.innerText = "Check for Updates"), 5000);
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
    if (installNowBtn) {
        installNowBtn.onclick = async () => {
            if (deferredPrompt) {
                deferredPrompt.prompt();
                await deferredPrompt.userChoice;
                deferredPrompt = null;
                installBanner?.classList.add("hidden");
            }
        };
    }

    if (installCloseBtn) {
        installCloseBtn.onclick = () => {
            installBanner?.classList.add("hidden");
            // Save to localStorage so it stays hidden today
            localStorage.setItem("installBannerClosed", new Date().toLocaleDateString());
        };
    }
}

// --- THE IGNITION & OBSERVERS ---
window.addEventListener("DOMContentLoaded", initApp);
document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") initApp();
});
window.addEventListener("focus", initApp);
window.addEventListener("hashchange", () => {
    const pageId = window.location.hash.substring(1).replace("-page", "");
    if (pageId && typeof window.showPage === "function") {
        window.showPage(pageId);
    }
});
window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => {
    if ((localStorage.getItem("user-theme") || "auto") === "auto") {
        window.setTheme?.("auto");
    }
});

/*************************************************
 *  ADMIN LISTENER AND LOG IN
 *************************************************/
// Secret tap counter
let versionTaps = 0;

const versionEl = document.getElementById("app-version");
versionEl.addEventListener("click", () => {
    versionTaps++;
    if (versionTaps === 5) {
        // Triple tap or 5 taps to trigger
        window.initDebugMenu();
        const pass = prompt("Enter Tester Password:");
        if (pass === "Tester123!@#") {
            // Use a specific string or handle via Firebase
            window.loginAsTester();
        }
        versionTaps = 0;
    }
    // Reset taps after 2 seconds of inactivity
    setTimeout(() => {
        versionTaps = 0;
    }, 2000);
});

window.loginAsTester = function () {
    const { signInWithEmailAndPassword } = window.firebaseMethods;
    signInWithEmailAndPassword(window.auth, "tester@dailygrind.app", "Tester123!@#")
        .then(() => console.log("Logged into Test Environment"))
        .catch((err) => alert("Auth Failed: " + err.message));
};
