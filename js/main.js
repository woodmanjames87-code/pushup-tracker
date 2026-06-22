// prettier-ignore
import { auth, getDb, signInWithEmailAndPassword, updateProfile, doc, setDoc, initAuthListener, reconcileData } from "./init-firebase.js";
import { elements } from "./dom.js";
import * as UI from "./ui.js";
import * as Store from "./store.js";
/*************************************************
 * 2. initApp (The Entry Point)
 *************************************************/
async function initApp() {
    if (document.visibilityState === "hidden") return;

    if (!Store.state.appInitialized) {
        console.log("App initialization triggered...");
        const initStartTime = Date.now(); // ⏱️ Start the entry clock
        // --- Group A: Fast/Required immediately ---
        setupEventListeners();
        initPWAUtils();
        // DRAW 1: Show the skeleton/local data ASAP
        UI.refreshStateAndUI();
        // --- Group B: Heavy/Background tasks ---
        setTimeout(() => {
            // Only run migration if the structure looks 'flat' (legacy)
            Store.migrateToMultiExercise();
            UI.buildExerciseToggles();
            UI.buildExerciseMenu();
            initAuthListener();
            Store.state.appInitialized = true;

            // 🎯 Lift the curtain now that Group B UI renders and Firebase listeners are bound!
            finishAppInitialization(initStartTime);
        }, 0);
        UI.triggerFeatureAnnouncement(
            "v5.0.4.2",
            "⏱\n New Built in Stopwatch for Planks! \n \n Dont forget to check out previously added features:",
            [
                "⚡ <strong>Quick Log:</strong> Log sets for any exercise from the Overview Page.",
                "🔄 <strong>Smart Tap:</strong> Click on an exercise to jump straight to its details.",
                "⚙️ <strong>Exercise Controls:</strong> Hide exercises you don't track via Settings.",
                "🌟 <strong>Leaderboard Filters:</strong> More ways to compare your progress with the community.",
            ],
        );
        return;
    }
    // --- 2. Wake-up Refresh ---
    console.log("App wake-up refresh triggered...");
    UI.refreshStateAndUI();
}

function finishAppInitialization(startTime) {
    const initScreen = document.getElementById("app-init-screen");
    const appWrapper = document.getElementById("app-wrapper"); // 🎯 Grab the master wrapper

    if (!initScreen) return;

    const MIN_DISPLAY_TIME = 250; // Our fine-tuned snappy 250ms hold
    const elapsedTime = Date.now() - startTime;
    const remainingHoldTime = Math.max(0, MIN_DISPLAY_TIME - elapsedTime);

    setTimeout(() => {
        // 1. Drop the curtain
        initScreen.classList.add("fade-out");

        // 2. Unveil the fully loaded app shell underneath
        if (appWrapper) {
            appWrapper.classList.add("visible");
        }

        // Clean up the DOM completely once the CSS transition ends
        setTimeout(() => initScreen.remove(), 300);
    }, remainingHoldTime);
}
/*************************************************
 * 3. EVENT LISTENERS SETUP
 *************************************************/
function setupEventListeners() {
    setupOverviewListeners();
    setupModalListeners();
    setupNavigationListeners();
    setupGlobalMenuListeners();
    setup30DayTrendToggle();
    setupLeaderboardListeners();
    setupSettingsAccordionListeners();
    setupSettingsListeners();
    setupPullToRefresh();
}

function setupOverviewListeners() {
    const overviewContent = document.getElementById("overview-content");

    if (overviewContent) {
        overviewContent.addEventListener("click", (e) => {
            const logBtn = e.target.closest(".btn-log-quick");

            // 1. Log Button Logic
            if (logBtn) {
                const card = logBtn.closest(".overview-card");
                const exId = card?.dataset.exercise;
                if (exId && typeof UI.openLogModal === "function") {
                    UI.openLogModal(exId);
                }
                return;
            }

            // 2. Card Body Click Logic (Navigate to Tracker)
            const card = e.target.closest(".overview-card");
            if (card) {
                const clickedExId = card.dataset.exercise;

                if (clickedExId) {
                    if (typeof UI.setActiveExercise === "function") {
                        UI.setActiveExercise(clickedExId);
                    }

                    // Smoothly slide over to the tracker screen now that the UI has updated
                    if (typeof UI.showPage === "function") {
                        UI.showPage("tracker");
                    }
                }
            }
        });
    }
}

function setupModalListeners() {
    // 🎯 THE PRO CLEANUP: Destructure everything we need straight out of elements.modal
    const { 
        form, 
        input, 
        cancelBtn, 
        container, 
        timerToggle, 
        timerModeSwitch 
    } = elements.modal;

    // --- 1. OPENING THE MODAL ---
    elements.floatingLogBtn.onclick = () => {
        Store.prepareModalState();
        UI.openLogModal(Store.state.currentExercise);
    };

    // --- 2. SUBMITTING THE DATA ---
    form.onsubmit = (e) => {
        e.preventDefault();
        const reps = parseInt(input.value);

        if (reps > 0) {
            const shortcutContext = container.dataset.activeContext;
            Store.handleModalSubmission(reps, shortcutContext);

            UI.triggerHaptic("success");
            UI.closeLogModal();
            UI.refreshActivePage();

            scrollTo({ top: 0, behavior: "smooth" });
        }
    };

    // --- 3. CANCEL BUTTON (The Dismissal & Stopwatch Cleanup) ---
    if (cancelBtn) {
        cancelBtn.onclick = () => {
            UI.closeLogModal();
        };
    }

    // --- 4. INTERACTIVE STOPWATCH CONTROLS ---
    if (timerToggle) {
        timerToggle.addEventListener("click", UI.toggleModalTimer);
    }

    if (timerModeSwitch) {
        timerModeSwitch.addEventListener("click", () => {
            if (!Store.state.isManualTimerMode) {
                timerModeSwitch.innerText = "⏱";
                UI.setTimerUIMode(true);
            } else {
                timerModeSwitch.innerText = "⌨";
                UI.setTimerUIMode(false);
            }
        });
    }

    // --- 5. OUTSIDE CLICK (The "Quick Exit") ---
    addEventListener("click", (e) => {
        if (e.target === container && UI.closeLogModal) {
            UI.closeLogModal();
        }
    });
}

function setupNavigationListeners() {
    // --- GLOBAL NAV BUTTONS TRIGGER ---
    elements.navButtons.forEach((btn) => {
        const targetPage = btn.getAttribute("data-target");

        if (targetPage) {
            btn.onclick = () => UI.showPage(targetPage);
        }
    });
}

function setupGlobalMenuListeners() {
    const { btn, items } = elements.menu;

    // 🛡️ Guard Clause: If the menu elements don't exist in the current DOM,
    // exit immediately and safely without crashing the app boot sequence.
    if (!btn || !items) return;

    // 1. Toggle Menu Visibility
    btn.addEventListener("click", (e) => {
        e.stopPropagation();
        items.classList.toggle("show");
    });

    // 2. Global "Click Outside" Dismissal
    document.addEventListener("click", (e) => {
        // If the menu is currently shown and the user clicked outside of it, hide it
        if (items.classList.contains("show") && !items.contains(e.target) && !btn.contains(e.target)) {
            items.classList.remove("show");
        }
    });
}

function setup30DayTrendToggle() {
    if (elements.ui.trendCard30) {
        elements.ui.trendCard30.addEventListener("click", function () {
            // 1. Toggle the master state class on the card container itself
            const isShowingChart = this.classList.toggle("showing-chart");

            // 2. Find the live views directly inside the clicked card right now
            const summaryView = this.querySelector(".trend-summary-view");
            const chartView = this.querySelector(".trend-chart-view");

            // 3. Switch their displays explicitly
            if (isShowingChart) {
                if (summaryView) summaryView.style.display = "none";
                if (chartView) chartView.style.display = "block";

                // Recompute dynamic stats and fire up Chart.js
                const stats = Store.computeStats(Store.state.currentExercise);
                UI.renderTrendLineChart(stats?.chart30Labels || [], stats?.chart30Values || [], stats?.dailyGoal);
            } else {
                if (summaryView) summaryView.style.display = "block";
                if (chartView) chartView.style.display = "none";
            }
        });
    }
}

function setupLeaderboardListeners() {
    const lb = elements.leaderboard;
    if (!lb) return; // Guard clause

    // --- 1. SINGLE-MODE LEADERBOARD FILTERS (Refactored to Event Delegation) ---
    lb.filterContainer?.addEventListener("click", (e) => {
        const btn = e.target.closest(".seg-btn");
        if (!btn) return;

        // Visual Active Toggle across siblings
        lb.filterButtons.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");

        // Show Loader immediately
        if (lb.list) lb.list.innerHTML = '<div class="loader"></div>';

        // Update Range Text Label instantly
        if (lb.rangeText) {
            const label = btn.innerText;
            lb.rangeText.innerText = label === "Daily" ? "Today & Yesterday" : `This ${label}`;
        }

        // Trigger Fetch with the specific filter
        const filterValue = btn.getAttribute("data-filter");
        
        // 🌟 SAVE STATE: Remember the last selected single filter
        localStorage.setItem("dg_lb_filter", filterValue);

        if (typeof UI.fetchLeaderboard === "function") {
            UI.fetchLeaderboard(filterValue);
        }
    });

    // --- 2. MASTER MODE SELECTOR ---
    lb.modeSelector?.addEventListener("click", (e) => {
        const btn = e.target.closest(".seg-btn");
        if (!btn || btn.classList.contains("active")) return;

        lb.modeSelector.querySelectorAll(".seg-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");

        const activeMode = btn.getAttribute("data-mode");

        // 🌟 SAVE STATE: Remember whether the user prefers Single or Matrix mode
        localStorage.setItem("dg_lb_mode", activeMode);

        if (activeMode === "matrix") {
            UI.hidePodiumOverlay();

            lb.filterContainer.style.display = "none";
            lb.matrixFilterContainer.style.display = "flex";

            if (lb.singleViewContainer) lb.singleViewContainer.hidden = true;
            if (lb.matrixViewContainer) lb.matrixViewContainer.hidden = false;

            lb.matrixFilterButtons[0]?.click();
        } else {
            lb.matrixFilterContainer.style.display = "none";
            lb.filterContainer.style.display = "flex";

            if (lb.matrixViewContainer) lb.matrixViewContainer.hidden = true;
            if (lb.singleViewContainer) lb.singleViewContainer.hidden = false;

            lb.filterButtons[0]?.click();
        }
    });

    // --- 3. STANDALONE MATRIX SUB-FILTER LISTENER ---
    lb.matrixFilterContainer?.addEventListener("click", (e) => {
        const btn = e.target.closest(".seg-btn");
        if (!btn) return;

        lb.matrixFilterButtons.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");

        const timeframe = btn.getAttribute("data-matrix-filter");

        // 🌟 SAVE STATE: Remember the last selected matrix sub-filter
        localStorage.setItem("dg_lb_filter", timeframe);

        if (lb.rangeText) {
            if (timeframe === "weekly") {
                lb.rangeText.innerText = "Current Week - All Movements";
            } else if (timeframe === "monthly") {
                lb.rangeText.innerText = "Current Month - All Movements";
            } else {
                lb.rangeText.innerText = "Year To Date - All Movements";
            }
        }

        if (typeof UI.fetchAndRenderMatrix === "function") {
            UI.fetchAndRenderMatrix(timeframe);
        }
    });
}

function setupSettingsAccordionListeners() {
    const container = document.getElementById("settings-page");
    if (!container) return;

    container.addEventListener("click", (e) => {
        const header = e.target.closest(".accordion-header");
        if (!header) return;

        const currentItem = header.parentElement;
        if (!currentItem) return;

        const isAlreadyOpen = currentItem.classList.contains("active");
        const allItems = container.querySelectorAll(".accordion-item");

        // Close others
        allItems.forEach((item) => {
            if (item !== currentItem) {
                item.classList.remove("active");
                if (item._card) {
                    // 🎯 FIXED: Non-clicked cards should slide shut into "collapsed"
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
}

function setupSettingsListeners() {
    const settingsPage = document.getElementById("settings-page");
    const { settings } = elements;
    if (!settingsPage || !settings) return; // Defensive guard clause

    // --- 1. PROFILE & DISPLAY NAME UPDATES ---
    settings.updateNameBtn.onclick = async () => {
        const newName = settings.nameInput.value.trim();
        const user = auth?.currentUser;

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

        settings.updateNameBtn.innerText = "Saving...";
        settings.updateNameBtn.disabled = true;

        try {
            const userRef = doc(getDb(), "users", user.uid);
            await setDoc(userRef, { username: newName }, { merge: true });

            const data = Store.loadData();
            if (!data.settings) data.settings = {};
            data.settings.username = newName;
            Store.saveData(data);

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
            settings.updateNameBtn.innerText = "Update";
            settings.updateNameBtn.disabled = false;
        }
    };

    // --- 2. THEME SELECTOR BUTTONS ---
    settings.themeButtons.forEach((btn) => {
        btn.addEventListener("click", () => {
            const selectedTheme = btn.getAttribute("data-theme");
            UI.setTheme(selectedTheme);
            settings.themeButtons.forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");
        });
    });

    // --- 3. EXERCISE GOALS & CUSTOM THRESHOLDS ---
    settings.goalModeToggle.addEventListener("change", (e) => {
        const data = Store.loadData();
        const exId = Store.state.currentExercise;

        if (!data.settings) data.settings = {};
        if (!data.settings.goals) data.settings.goals = {};
        if (!data.settings.goals[exId]) data.settings.goals[exId] = {};

        data.settings.goals[exId].goalMode = e.target.checked ? "auto" : "manual";
        Store.saveData(data);
        UI.renderExerciseSettings();
    });

    settings.manualGoalInput.addEventListener("change", (e) => {
        const exId = Store.state.currentExercise;
        let val = parseInt(e.target.value);

        if (isNaN(val)) {
            const config = EXERCISE_LIB[exId] || { minGoal: 1 };
            val = config.minGoal;
            e.target.value = val;
        }

        const data = Store.loadData();
        if (!data.settings.goals) data.settings.goals = {};
        if (!data.settings.goals[exId]) data.settings.goals[exId] = {};

        data.settings.goals[exId].manualGoal = val;
        Store.saveData(data);
    });

    settings.thresholdModeToggle?.addEventListener("change", (e) => {
        const data = Store.loadData();
        const exId = Store.state.currentExercise;
        if (!data.settings) data.settings = {};
        if (!data.settings.goals) data.settings.goals = {};
        if (!data.settings.goals[exId]) data.settings.goals[exId] = {};

        data.settings.goals[exId].thresholdMode = e.target.checked ? "recommended" : "custom";
        Store.saveData(data);

        if (typeof UI.renderExerciseSettings === "function") {
            UI.renderExerciseSettings();
        }
    });

    // --- 4. STEP INCREMENTS FOR ON-TRACK METRICS ---
    settings.onTrackMinusBtn.addEventListener("click", () => UI.adjustOnTrack(-1));
    settings.onTrackPlusBtn.addEventListener("click", () => UI.adjustOnTrack(1));

    settings.onTrackInput?.addEventListener("input", (e) => {
        const val = parseInt(e.target.value);
        if (settings.improveDisplay) settings.improveDisplay.innerText = val + 1;
    });

    // --- 5. LOGGING PAST WORKOUTS & SET DELETIONS ---
    settings.editDatePicker.addEventListener("change", (e) => {
        Store.state.selectedEditDate = e.target.value;
        UI.renderEditList();
    });

    settings.addPastBtn.onclick = () => {
        const selectedDate =
            settings.editDatePicker?.value ||
            (typeof Store.getDateKey === "function" ? Store.getDateKey() : new Date().toISOString().split("T")[0]);

        Store.state.selectedEditDate = selectedDate;
        if (typeof UI.openLogModal === "function") {
            UI.openLogModal(Store.state.currentExercise);
        }
    };

    // Delete Set buttons (Event Delegation)
    settings.editSetsList.addEventListener("click", (e) => {
        const deleteBtn = e.target.closest(".btn-delete");
        if (deleteBtn) {
            const index = parseInt(deleteBtn.dataset.index);
            if (Store.deleteSet(index)) {
                UI.renderEditList();
            }
        }
    });

    // --- 6. DATA BACKUP LOGIC (JSON BACKUPS) ---
    elements.settings.importBtn.onclick = function () {
        elements.settings.importInput.click();
    };
    settings.importInput.onchange = function (e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function (evt) {
            Store.smartImport(evt.target.result); // ⚠️ Capital "Store"
        };
        reader.readAsText(file);
    };

    settings.exportDataBtn.onclick = () => {
        Store.exportData();
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

            // 🏆 REFRESH Active Page)
            UI.refreshActivePage();

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
            .then(() => console.log("DailyGrind: Offline Mode Available"))
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
    setupInstallBannerListeners();
}

function setupInstallBannerListeners() {
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
