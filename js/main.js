// prettier-ignore
import { auth, db, signInWithEmailAndPassword, updateProfile, doc, setDoc, initAuthListener } from "./init-firebase.js";
import { elements } from "./dom.js";
import * as UI from "./ui.js";
// prettier-ignore
import { state, migrateToMultiExercise, EXERCISE_LIB, deleteSet, loadData, saveData, addSetToDate, getDateKey, exportData } from "./store.js";

/*************************************************
 * 2. initApp (The Entry Point)
 *************************************************/
async function initApp() {
    if (document.visibilityState === "hidden") return;

    if (!state.appInitialized) {
        console.log("App initialization triggered...");
        // --- Group A: Fast/Required immediately ---
        setupEventListeners();
        initPWAUtils();
        // DRAW 1: Show the skeleton/local data ASAP
        UI.refreshStateAndUI();
        // --- Group B: Heavy/Background tasks ---
        setTimeout(() => {
            // Only run migration if the structure looks 'flat' (legacy)
            migrateToMultiExercise();
            UI.buildExerciseToggles();
            UI.buildExerciseMenu();
            initAuthListener();
            state.appInitialized = true;
        }, 0);
        return;
    }
    // --- 2. Wake-up Refresh ---
    console.log("App wake-up refresh triggered...");
    UI.refreshStateAndUI();
}

/*************************************************
 * 3. EVENT LISTENERS SETUP
 *************************************************/
function setupEventListeners() {
    // --- 1. OPENING THE MODAL ---
    elements.modal.floatingLogBtn.onclick = () => {
        // 1. Check the Store (Logic)
        if (getDateKey) {
            state.selectedEditDate = getDateKey();
        }
        // 2. Check the UI (Visuals)
        UI.openLogModal();
    };

    // --- 2. SUBMITTING THE DATA ---
    elements.modal.form.onsubmit = (e) => {
        e.preventDefault();
        const reps = parseInt(elements.modal.input.value);

        // Ensure we have the logic function before proceeding
        if (reps > 0 && addSetToDate) {
            // 1. Resolve the Date (Logic)
            // Use selected date if it exists, otherwise ask the Store for Today
            let targetDate = state.selectedEditDate;
            if (!targetDate && getDateKey) {
                targetDate = getDateKey();
            }

            // 2. Perform the Save
            if (addSetToDate) {
                addSetToDate(targetDate, reps);

                // Trigger the physical feedback
                UI.triggerHaptic("success");
            }

            // 3. Update the Visuals (UI)
            UI.closeLogModal();
            UI.updateTrackerDisplay();

            const pageId = location.hash.substring(1).replace("-page", "");

            if (pageId === "settings") {
                UI.renderEditList();
            }
            if (pageId === "leaderboard" && UI.fetchLeaderboard) {
                UI.fetchLeaderboard();
            }

            scrollTo({ top: 0, behavior: "smooth" });
        }
    };

    // --- 3. CANCEL BUTTON (The Dismissal) ---
    if (elements.modal.cancelBtn) {
        elements.modal.cancelBtn.onclick = () => {
            UI.closeLogModal();
        };
    }

    // --- 4. OUTSIDE CLICK (The "Quick Exit") ---
    // This closes the modal if the user clicks the dark overlay area
    addEventListener("click", (e) => {
        if (e.target === elements.modal.container && UI.closeLogModal) {
            UI.closeLogModal();
        }
    });

    // NOTE: The "OK" button doesn't need a listener!
    // Because it's type="submit", the logForm.onsubmit handles it.

    // --- NAV BUTTONS TRIGGER ---
    if (elements.navButtons.length >= 4) {
        elements.navButtons[0].onclick = () => UI.showPage("overview");
        elements.navButtons[1].onclick = () => UI.showPage("tracker");
        elements.navButtons[2].onclick = () => UI.showPage("leaderboard");
        elements.navButtons[3].onclick = () => UI.showPage("settings");
    }

    //  Global Menu Toggle
    elements.menu.btn.addEventListener("click", (e) => {
        e.stopPropagation();
        elements.menu.items.classList.toggle("show");
    });

    // Close menu if user clicks anywhere else on the screen
    document.addEventListener("click", (e) => {
        const menu = elements.menu.items;
        const btn = elements.menu.btn;

        if (!menu.contains(e.target) && !btn.contains(e.target)) {
            menu.classList.remove("show");
        }
    });

    // --- Settings / Accordion Logic ---
    elements.settings.accordionHeaders.forEach((header) => {
        header.addEventListener("click", () => {
            const currentItem = header.parentElement;
            const isAlreadyOpen = currentItem.classList.contains("active");

            // Close others
            elements.settings.accordionItems.forEach((item) => {
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
    elements.leaderboard.filterButtons.forEach((btn) => {
        btn.addEventListener("click", () => {
            // 1. Visual Active Toggle
            elements.leaderboard.filterButtons.forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");

            // 2. Show Loader immediately so user knows it's working
            if (elements.leaderboard.list) elements.leaderboard.list.innerHTML = '<div class="loader"></div>';

            // 3. Update Label instantly
            if (elements.leaderboard.rangeText) {
                const label = btn.innerText;
                elements.leaderboard.rangeText.innerText = label === "Daily" ? "Today & Yesterday" : `This ${label}`;
            }

            // 4. Trigger Fetch with the specific filter
            const filterValue = btn.getAttribute("data-filter");
            if (UI.fetchLeaderboard) {
                UI.fetchLeaderboard(filterValue);
            }
        });
    });

    // --- Update Display Name ---
    elements.settings.updateNameBtn.onclick = async () => {
        const newName = elements.settings.nameInput.value.trim();
        const user = auth?.currentUser;

        // Validation
        if (!user) {
            UI.triggerHaptic?.("warning");
            UI.showToast("Please log in to change your name.");
            return;
        }
        if (newName.length < 2) {
            UI.triggerHaptic?.("warning");
            UI.showToast("Name is too short!");
            return;
        }

        // UI State: Loading
        elements.settings.updateNameBtn.innerText = "Saving...";
        elements.settings.updateNameBtn.disabled = true;

        try {
            const userRef = doc(db, "users", user.uid);

            // 1. Update Firestore (Source of truth for Leaderboard)
            await setDoc(userRef, { username: newName }, { merge: true });

            // 2. Update Local Storage via the Store
            const data = loadData();
            if (!data.settings) data.settings = {};
            data.settings.username = newName;
            saveData(data);

            // 3. Update Firebase Auth Profile
            if (updateProfile) {
                await updateProfile(user, { displayName: newName });
            }

            UI.triggerHaptic?.("success");
            UI.showToast("Username updated!");
        } catch (err) {
            console.error("Update failed:", err);
            UI.triggerHaptic?.("warning");
            UI.showToast("Failed to update name.");
        } finally {
            elements.settings.updateNameBtn.innerText = "Update";
            elements.settings.updateNameBtn.disabled = false;
        }
    };

    // --- Date Picker ---
    elements.settings.editDatePicker.addEventListener("change", (e) => {
        state.selectedEditDate = e.target.value;
        UI.renderEditList();
    });

    // --- Goal Mode Toggle (Exercise Specific) ---
    elements.settings.goalModeToggle.addEventListener("change", (e) => {
        const data = loadData();
        const exId = state.currentExercise; // The active exercise

        if (!data.settings) data.settings = {};
        if (!data.settings.goals) data.settings.goals = {};
        if (!data.settings.goals[exId]) data.settings.goals[exId] = {};

        // Update the specific exercise setting
        data.settings.goals[exId].goalMode = e.target.checked ? "auto" : "manual";

        saveData(data);

        // Update UI visibility and stats
        UI.renderExerciseSettings();
    });

    // --- Manual Goal Input (Exercise Specific) ---
    elements.settings.manualGoalInput.addEventListener("change", (e) => {
        const exId = state.currentExercise;
        let val = parseInt(e.target.value);

        // If they leave it blank or type gibberish, then we fall back to minGoal
        if (isNaN(val)) {
            const config = EXERCISE_LIB[exId] || { minGoal: 1 };
            val = config.minGoal;
            e.target.value = val;
        }

        const data = loadData();
        if (!data.settings.goals) data.settings.goals = {};
        if (!data.settings.goals[exId]) data.settings.goals[exId] = {};

        data.settings.goals[exId].manualGoal = val;

        saveData(data);
    });

    // --- Threshold Mode (Exercise specific Setting) ---
    elements.settings.thresholdModeToggle?.addEventListener("change", (e) => {
        // 1. Get a fresh copy of data
        const data = loadData();
        const exId = state.currentExercise;
        if (!data.settings) data.settings = {};
        if (!data.settings.goals) data.settings.goals = {};
        if (!data.settings.goals[exId]) data.settings.goals[exId] = {};

        data.settings.goals[exId].thresholdMode = e.target.checked ? "recommended" : "custom";

        // 5. Save
        saveData(data);

        // 6. Conditional Render
        // Only re-render if the function exists AND we need to update
        // other fields (like hiding/showing the custom input box)
        if (typeof UI.renderExerciseSettings === "function") {
            UI.renderExerciseSettings();
        }
    });

    // Plus and Minus Button Listeners for On Track Days
    elements.settings.onTrackMinusBtn.addEventListener("click", () => {
        UI.adjustOnTrack(-1);
    });

    elements.settings.onTrackPlusBtn.addEventListener("click", () => {
        UI.adjustOnTrack(1);
    });

    // --- Theme / Display Mode Selector ---
    elements.settings.themeButtons.forEach((btn) => {
        btn.addEventListener("click", () => {
            const selectedTheme = btn.getAttribute("data-theme");

            // 1. Call the Painter to change the actual CSS colors
            UI.setTheme(selectedTheme);

            // 2. Update visual button states
            elements.settings.themeButtons.forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");
        });
    });

    // --- Add Set to Past Date (Settings Page) ---
    elements.settings.addPastBtn.onclick = () => {
        // 1. Get the date (Local time check)
        const selectedDate =
            elements.settings.editDatePicker && elements.settings.editDatePicker.value
                ? elements.settings.editDatePicker.value
                : getDateKey
                  ? getDateKey()
                  : new Date().toISOString().split("T")[0];

        // 2. Set the global state for the OK button
        state.selectedEditDate = selectedDate;

        // 3. Open the modal
        elements.modal.container.style.display = "flex";
        elements.modal.input.value = "";
        setTimeout(() => elements.modal.input.focus(), 50);
    };

    // --- Delete Set buttons ---
    elements.settings.editSetsList.addEventListener("click", (e) => {
        // Check if the clicked element (or its parent) is a delete button
        const deleteBtn = e.target.closest(".btn-delete");

        if (deleteBtn) {
            const index = parseInt(deleteBtn.dataset.index);

            // 1. Perform the data deletion
            const success = deleteSet(index);

            // 2. Refresh the UI if successful
            if (success) {
                UI.renderEditList();
            }
        }
    });
    // Listen for file selection
    elements.settings.importInput.onchange = function (e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function (e) {
            const content = e.target.result;
            smartImport(content);
        };
        reader.readAsText(file);
    };

    // Update the "Improve" hint when the user changes the number
    elements.settings.onTrackInput?.addEventListener("input", (e) => {
        const val = parseInt(e.target.value);
        elements.settings.improveDisplay.innerText = val + 1;
    });

    // --- Pull to Refresh (Leaderboard) ---
    setupPullToRefresh();

    // --- Export Data Button ---
    elements.settings.exportDataBtn.onclick = () => {
        exportData();
    };
}
function setupPullToRefresh() {
    let startY = 0;
    let isPulling = false;

    if (!elements.ptr) return;

    addEventListener(
        "touchstart",
        (e) => {
            if (scrollY === 0) {
                startY = e.touches[0].pageY;
                isPulling = true;
            }
        },
        { passive: true },
    );

    addEventListener(
        "touchmove",
        (e) => {
            if (!isPulling) return;
            const diff = e.touches[0].pageY - startY;
            if (diff > 0) {
                const y = Math.pow(diff, 0.85);
                elements.ptr.style.transform = `translateY(${y}px)`;
            }
        },
        { passive: true },
    );

    addEventListener("touchend", async (e) => {
        if (!isPulling) return;
        const diff = e.changedTouches[0].pageY - startY;

        if (diff > 70) {
            elements.ptr.style.transform = "translateY(60px)";
            elements.ptr.classList.add("refreshing"); // 🔄 Optional: add a spin animation in CSS

            // 🚀 SMART SYNC
            await reconcileData();

            // 🏆 REFRESH LEADERBOARD (if visible)
            const pageId = location.hash.substring(1).replace("-page", "");
            if (pageId === "leaderboard" && UI.fetchLeaderboard) {
                await UI.fetchLeaderboard();
            }

            // Snap back
            setTimeout(() => {
                elements.ptr.style.transform = "translateY(0)";
                elements.ptr.classList.remove("refreshing");
            }, 300);
        } else {
            elements.ptr.style.transform = "translateY(0)";
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
        location.reload();
    });

    if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
        // Get Version
        const msgChan = new MessageChannel();
        msgChan.port1.onmessage = (e) => {
            if (e.data.version && elements.settings.versionEl)
                elements.settings.versionEl.innerText = `Version ${e.data.version}`;
        };
        navigator.serviceWorker.controller.postMessage({ type: "GET_VERSION" }, [msgChan.port2]);

        // Update App Logic
        elements.settings.updateAppBtn.onclick = async () => {
            elements.settings.updateAppBtn.innerText = "Checking...";
            elements.settings.updateAppBtn.disabled = true;

            const reg = await navigator.serviceWorker.getRegistration();

            if (reg) {
                // Listen for the new worker state
                reg.onupdatefound = () => {
                    const newWorker = reg.installing;
                    newWorker.onstatechange = () => {
                        if (newWorker.state === "installed") {
                            elements.settings.updateAppBtn.innerText = "Update Found! Reloading...";
                            newWorker.postMessage({ type: "SKIP_WAITING" });
                        }
                    };
                };

                // Force a check against the server
                await reg.update();

                // If there was ALREADY a worker waiting (common!)
                if (reg.waiting) {
                    elements.settings.updateAppBtn.innerText = "Updating...";
                    reg.waiting.postMessage({ type: "SKIP_WAITING" });
                } else {
                    // If no update was found after 2 seconds, reset button
                    setTimeout(() => {
                        if (elements.settings.updateAppBtn.innerText === "Checking...") {
                            elements.settings.updateAppBtn.innerText = "App is up to date!";
                            elements.settings.updateAppBtn.disabled = false;
                            setTimeout(() => (elements.settings.updateAppBtn.innerText = "Check for Updates"), 5000);
                        }
                    }, 2000);
                }
            }
        };
    }

    // --- Install Banner Logic (The Conductor) ---
    let deferredPrompt;

    // 1. When the browser says "I'm ready to install"
    addEventListener("beforeinstallprompt", (e) => {
        e.preventDefault();
        deferredPrompt = e;
        UI.showUnifiedInstallBanner();
    });

    // 2. Initial check for iOS (Since there is no event for iOS)
    const isStandalone = navigator.standalone || matchMedia("(display-mode: standalone)").matches;
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !("MSStream" in window);

    if (!isStandalone && isIOS) {
        if (UI.showUnifiedInstallBanner) UI.showUnifiedInstallBanner("ios");
    }

    // 3. Button Click Listeners
    elements.installBanner.nowBtn.onclick = async () => {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            await deferredPrompt.userChoice;
            deferredPrompt = null;
            elements.installBanner.container?.classList.add("hidden");
        }
    };

    elements.installBanner.closeBtn.onclick = () => {
        elements.installBanner.container?.classList.add("hidden");
        // Save to localStorage so it stays hidden today
        localStorage.setItem("installBannerClosed", new Date().toLocaleDateString());
    };
}

// --- THE IGNITION & OBSERVERS ---
addEventListener("DOMContentLoaded", initApp);
document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") initApp();
});
addEventListener("focus", initApp);
addEventListener("hashchange", () => {
    const pageId = location.hash.substring(1).replace("-page", "");
    if (pageId && typeof UI.showPage === "function") {
        UI.showPage(pageId);
    }
});
matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => {
    if ((localStorage.getItem("user-theme") || "auto") === "auto") {
        UI.setTheme?.("auto");
    }
});

/*************************************************
 *  ADMIN LISTENER AND LOG IN
 *************************************************/
// Secret tap counter
let versionTaps = 0;
elements.settings.versionEl.addEventListener("click", () => {
    versionTaps++;
    if (versionTaps === 5) {
        // Triple tap or 5 taps to trigger
        initDebugMenu();
        const pass = prompt("Enter Tester Password:");
        if (pass === "Tester123!@#") {
            // Use a specific string or handle via Firebase
            loginAsTester();
        }
        versionTaps = 0;
    }
    // Reset taps after 2 seconds of inactivity
    setTimeout(() => {
        versionTaps = 0;
    }, 2000);
});

function initDebugMenu() {
    const debugMenu = document.getElementById("debug-menu");
    const debugUid = document.getElementById("debug-uid");
    const user = auth?.currentUser;

    debugMenu.classList.toggle("hidden");
    debugUid.innerText = user?.uid || "Not Authenticated";
}

function loginAsTester() {
    signInWithEmailAndPassword(auth, "tester@dailygrind.app", "Tester123!@#")
        .then(() => console.log("Logged into Test Environment"))
        .catch((err) => alert("Auth Failed: " + err.message));
}
