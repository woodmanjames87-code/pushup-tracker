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
const minusBtn = document.getElementById("btn-ontrack-minus");
const plusBtn = document.getElementById("btn-ontrack-plus");

/*************************************************
 * 2. initApp (The Entry Point)
 *************************************************/
async function initApp() {
    if (document.visibilityState === "hidden") return;

    // 1. Set initial date if not set
    if (!window.selectedEditDate && window.getDateKey) {
        window.selectedEditDate = window.getDateKey();
        if (datePicker) datePicker.value = window.selectedEditDate;
    }

    // 2. Theme & Initial Navigation
    const savedTheme = localStorage.getItem("user-theme") || "auto";
    if (window.setTheme) window.setTheme(savedTheme);

    const hash = window.location.hash.substring(1);
    window.showPage(hash ? hash.replace("-page", "") : "tracker");

    // 3. Only run one-time setups once
    if (!window.appInitialized) {
        setupEventListeners();
        initPWAUtils(); // Version checking & Service Worker
        window.appInitialized = true;
    }

    // 4. Immediate UI Refresh (Local Data)
    if (window.loadCurrentUsername) window.loadCurrentUsername();
    if (window.updateDisplay) window.updateDisplay();
    if (window.updateGoalUI) window.updateGoalUI();

    // 5. 🚀 Background Reconciliation (Silent)
    // Runs every time the app is focused or loaded
    if (window.auth?.currentUser && window.reconcileData) {
        window
            .reconcileData()
            .then(() => {
                console.log("☁️ Background sync check complete.");

                // Re-render display in case new sets were pulled from cloud
                if (window.updateDisplay) window.updateDisplay();

                // If user is currently looking at the leaderboard, refresh it silently
                const pageId = window.location.hash.substring(1).replace("-page", "");
                if (pageId === "leaderboard" && window.fetchLeaderboard) {
                    window.fetchLeaderboard();
                }
            })
            .catch((err) => console.error("Sync Error:", err));
    }
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

    // --- Save Goal Settings Toggle ---
    // Toggle logic
    document.getElementById("threshold-mode-toggle")?.addEventListener("change", (e) => {
        const data = window.loadData();
        if (!data.settings) data.settings = {};
        data.settings.thresholdMode = e.target.checked ? "recommended" : "custom";
        localStorage.setItem(window.STORAGE_KEY, JSON.stringify(data));

        window.updateGoalUI();
        window.updateDisplay(); // Refresh dashboard stats immediately
    });

    window.adjustOnTrack = function (change) {
        const input = document.getElementById("on-track-input");
        const stepper = input?.closest(".number-stepper"); // Get the container for the animation

        let currentVal = parseInt(input.value) || 4;
        let newVal = currentVal + change;

        // 1. SUCCESS: Within boundaries (1-6)
        if (newVal >= 1 && newVal <= 6) {
            input.value = newVal; // Immediate UI update

            if (window.triggerHaptic) window.triggerHaptic("success");

            // Update the textual hints instantly
            const improveDisplay = document.getElementById("improve-display");
            const onTrackHint = document.getElementById("on-track-display-hint");
            if (improveDisplay) improveDisplay.innerText = newVal + 1;
            if (onTrackHint) onTrackHint.innerText = newVal;

            // Debounce the heavy save/re-render
            window.debounceSave(() => {
                const data = window.loadData();
                if (!data.settings) data.settings = {};
                if (!data.settings.goals) data.settings.goals = {};

                data.settings.goals.onTrackDays = newVal;
                localStorage.setItem(window.STORAGE_KEY, JSON.stringify(data));

                window.updateGoalUI();
                window.updateDisplay();
            }, 600);
        } else {
            // 2. WARNING: Hit the limit (0 or 7)
            if (window.triggerHaptic) window.triggerHaptic("warning");

            // RE-ADD THE SHAKE HERE
            if (stepper) {
                stepper.classList.add("limit-shake");
                // Remove the class after the animation (0.2s * 2 cycles = 400ms approx)
                setTimeout(() => stepper.classList.remove("limit-shake"), 400);
            }
        }
    };

    // Plus and Minus Button Listeners for On Track Days
    const minusBtn = document.getElementById("btn-ontrack-minus");
    const plusBtn = document.getElementById("btn-ontrack-plus");

    if (minusBtn) {
        minusBtn.addEventListener("click", () => {
            window.adjustOnTrack(-1);
        });
    }

    if (plusBtn) {
        plusBtn.addEventListener("click", () => {
            window.adjustOnTrack(1);
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
 * LEADERBOARD LOGIC
 *************************************************/
window.fetchLeaderboard = async function (passedFilter = null) {
    // Hide the staggered podium by default (will be shown if data exists)
    const podiumOverlay = document.getElementById("mini-podium-overlay");
    if (podiumOverlay) podiumOverlay.hidden = true;

    const lbList = document.getElementById("lb-list");
    const rangeText = document.getElementById("lb-date-range-text");
    if (!lbList) return;

    // 1. Determine Filter
    const filterContainer = document.getElementById("leaderboard-filter");
    const activeBtn = filterContainer ? filterContainer.querySelector(".seg-btn.active") : null;
    const filter = passedFilter || (activeBtn ? activeBtn.getAttribute("data-filter") : "stats.daily");

    // 2. Safety Guard
    if (!window.firebaseMethods || !window.db) {
        lbList.innerHTML = "<p style='text-align:center; opacity:0.5;'>Connecting to cloud...</p>";
        return;
    }

    const { collection, query, where, orderBy, limit, getDocs } = window.firebaseMethods;
    const now = new Date();
    const exerciseId = window.currentExercise || "pushups"; // 🚀 Added context
    let displayLabel = "";

    // 3. Set Display Label (No changes here)
    if (filter === "stats.daily") displayLabel = "Today & Yesterday";
    else if (filter === "stats.week") {
        const sun = new Date(now);
        sun.setDate(now.getDate() - now.getDay());
        displayLabel = `Week of ${sun.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
    } else if (filter === "stats.month") {
        displayLabel = now.toLocaleDateString(undefined, { month: "long", year: "numeric" });
    } else if (filter === "stats.year") {
        displayLabel = now.getFullYear();
    }
    if (rangeText) rangeText.innerText = displayLabel;

    try {
        lbList.innerHTML = '<div class="loader"></div>';
        let leaderboardData = [];

        // 4. Fetch Logic
        if (filter === "stats.daily") {
            if (window.drawPodium) window.drawPodium(null);
            // --- KEEPING YOUR ORIGINAL DAILY LOGIC (Users Collection) ---
            const usersRef = collection(window.db, "users");
            const qToday = query(usersRef, where("stats.todayId", "==", window.getTodayId()), limit(30));
            const qYest = query(usersRef, where("stats.todayId", "==", window.getYesterdayId()), limit(30));

            const [snapToday, snapYest] = await Promise.all([getDocs(qToday), getDocs(qYest)]);
            const userMap = new Map();

            snapYest.forEach((doc) => {
                const s = doc.data().stats;
                userMap.set(doc.id, {
                    uid: doc.id,
                    username: doc.data().username || "Anonymous",
                    todayScore: 0,
                    yesterdayScore: s.today || 0,
                });
            });

            snapToday.forEach((doc) => {
                const s = doc.data().stats;
                if (userMap.has(doc.id)) {
                    userMap.get(doc.id).todayScore = s.today;
                } else {
                    userMap.set(doc.id, {
                        uid: doc.id,
                        username: doc.data().username || "Anonymous",
                        todayScore: s.today,
                        yesterdayScore: s.yest || 0,
                    });
                }
            });

            leaderboardData = Array.from(userMap.values());
            leaderboardData.sort((a, b) => b.todayScore - a.todayScore || b.yesterdayScore - a.yesterdayScore);
        } else {
            // --- 🚀 NEW HISTORICAL LOGIC (Standings Collection) ---
            const fieldName = filter.split(".")[1]; // "week", "month", or "year"
            const now = new Date();

            let idValue;
            if (fieldName === "week") idValue = getWeekId(now);
            else if (fieldName === "month") idValue = getMonthId(now);
            else idValue = getYearId(now);

            // NOW you can call these
            // ... inside the else (Historical Logic) block ...
            const typeKey = fieldName === "week" ? "weekly" : fieldName === "month" ? "monthly" : "yearly";

            // 1. Fetch the data using your existing function
            const podiumData = await fetchPreviousPodium(typeKey, idValue);

            // 2. Call the DRAW function (make sure this matches the name in your JS)
            if (window.drawPodium) {
                window.drawPodium(podiumData, filter);
            }

            // Query the 'standings' collection instead of 'users'
            const standingsRef = collection(window.db, "standings");
            const q = query(
                standingsRef,
                where("periodId", "==", idValue),
                where("exerciseId", "==", exerciseId), // 🚀 Exercise-aware!
                orderBy("score", "desc"),
                limit(20),
            );

            const querySnapshot = await getDocs(q);

            querySnapshot.forEach((doc) => {
                const d = doc.data();
                leaderboardData.push({
                    uid: doc.id.split("_").pop(), // Extract UID from end of doc ID
                    username: d.username || "Anonymous",
                    score: d.score || 0,
                });
            });
        }

        // 5. Render (No changes here)
        lbList.innerHTML = "";
        if (leaderboardData.length === 0) {
            lbList.innerHTML = `<p class='h3' style="text-align:center; opacity:0.5; margin-top:40px;">No ranks yet.</p>`;
            return;
        }

        leaderboardData.forEach((user, index) => {
            const isMe = user.uid === window.auth?.currentUser?.uid;
            const displayScore = filter === "stats.daily" ? user.todayScore : user.score;

            const row = `
                <div class="lb-row ${isMe ? "is-me" : ""}">
                    <span class="lb-rank">${index + 1}</span>
                    <span class="lb-name">${user.username}</span>
                    <div style="text-align:right">
                        <span class="lb-score">${displayScore.toLocaleString()}</span>
                        ${filter === "stats.daily" ? `<span style="font-size:0.75rem; opacity:0.6; display:block;">Yest: ${user.yesterdayScore}</span>` : ""}
                    </div>
                </div>
            `;
            lbList.insertAdjacentHTML("beforeend", row);
        });
    } catch (err) {
        console.error("Leaderboard failed:", err);
        lbList.innerHTML = `<p style="text-align:center; opacity:0.5; margin-top:40px;">Failed to load leaderboard.</p>`;
    }
};

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

// Watch for system theme changes if set to auto
window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => {
    if (localStorage.getItem("user-theme") === "auto") {
        window.setTheme("auto");
    }
});

// Save On Track Goal Settings (Exposed to window for inline onclick)
window.saveGoalSettings = function (btn) {
    const input = document.getElementById("on-track-input");
    const newOnTrack = parseInt(input.value);

    const data = window.loadData();
    if (!data.settings) data.settings = {};
    if (!data.settings.goals) data.settings.goals = {};

    data.settings.goals.onTrackDays = newOnTrack;

    localStorage.setItem(window.STORAGE_KEY, JSON.stringify(data));

    // 🛡️ Success Feedback
    if (window.triggerHaptic) window.triggerHaptic("success");

    // Sync to cloud since goals changed
    if (window.auth.currentUser) {
        window.syncLocalToCloud(window.auth.currentUser.uid);
    }

    // Visual feedback on the button itself
    if (btn) {
        const originalText = btn.innerText;
        btn.innerText = "Saved! ✓";
        // Using inline style to override the class temporarily
        btn.style.backgroundColor = "#34c759";
        btn.style.borderColor = "#34c759";
        btn.disabled = true; // Prevent double-clicks during sync
        btn.style.opacity = "1";

        setTimeout(() => {
            btn.innerText = originalText;
            btn.style.backgroundColor = "";
            btn.style.borderColor = "";
            btn.disabled = false;
        }, 2000);
    }

    if (window.updateGoalUI) window.updateGoalUI();
};

window.getDisplayUsername = function (extraData = {}) {
    const localData = window.loadData();
    const nameInput = document.getElementById("username-input");

    return (
        extraData.username ||
        (nameInput && nameInput.value ? nameInput.value : null) ||
        localData.settings?.username ||
        window.auth?.currentUser?.displayName ||
        "Anonymous"
    );
};

let isReconciling = false;

window.reconcileData = async function reconcileData() {
    if (isReconciling) return;
    isReconciling = true;
    window.isReconciling = true;

    const user = window.auth?.currentUser;
    if (!user || !window.firebaseMethods) return;

    const { doc, getDoc } = window.firebaseMethods;
    const userRef = doc(window.db, "users", user.uid);
    const exerciseId = window.currentExercise || "pushups";

    try {
        const snap = await getDoc(userRef);
        if (!snap.exists()) {
            window.isReconciling = false; // Release lock
            await window.syncLocalToCloud(user.uid);
            return;
        }

        const cloudData = snap.data();
        const cloudWorkouts = cloudData.workouts || {};
        const localData = JSON.parse(localStorage.getItem(window.STORAGE_KEY)) || {};

        const sortedDates = Object.keys(cloudWorkouts).sort((a, b) => b.localeCompare(a));
        let localUpdated = false;

        for (const dateKey of sortedDates) {
            const cloudSets = cloudWorkouts[dateKey]?.[exerciseId] || [];
            const localSets = localData[dateKey]?.[exerciseId] || [];

            const isMatch =
                cloudSets.length === localSets.length && cloudSets.every((val, index) => val === localSets[index]);

            if (isMatch) break;

            if (cloudSets.length > localSets.length) {
                if (!localData[dateKey]) localData[dateKey] = {};
                localData[dateKey][exerciseId] = cloudSets;
                localUpdated = true;
            }
        }

        if (localUpdated) {
            console.log(`✅ Synced ${exerciseId} from cloud.`);
            localStorage.setItem(window.STORAGE_KEY, JSON.stringify(localData));
            if (window.updateDisplay) window.updateDisplay();
        }

        // --- 🚀 THE FIX IS HERE ---
        // Release the lock NOW so the following sync call is allowed to run
        window.isReconciling = false;

        // 3. Update Standings/Stats (This call will now pass the 'if' check in syncLocalToCloud)
        await window.syncLocalToCloud(user.uid);
    } catch (err) {
        console.error("Reconciliation failed:", err);
        window.isReconciling = false; // Always release on error to prevent locking the app
    }
};
