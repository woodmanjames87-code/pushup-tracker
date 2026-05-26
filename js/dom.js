// 1. Private helper for the podium/accordion sub-elements
const cacheSubElements = (selectors, subSelectors) => {
    const items = document.querySelectorAll(selectors);
    items.forEach((item) => {
        Object.entries(subSelectors).forEach(([key, query]) => {
            item[key] = item.querySelector(query);
        });
    });
    return items;
};

export const elements = {
    // Navigation
    navButtons: document.querySelectorAll(".nav-item"),
    ptr: document.getElementById("pull-to-refresh"),
    logBtnSpan: document.getElementById("log-btn-exercise-name"),
    activeExerciseName: document.getElementById("active-exercise-name"),

    //Menu Elements
    menu: {
        btn: document.getElementById("exercise-menu-btn"),
        items: document.getElementById("menu-items"),
    },

    // Modal Elements
    modal: {
        container: document.getElementById("log-modal"),
        title: document.getElementById("modal-title"),
        prompt: document.getElementById("modal-prompt"),
        input: document.getElementById("modal-input"),
        cancelBtn: document.getElementById("modal-cancel"),
        form: document.getElementById("log-form"),
        floatingLogBtn: document.getElementById("floating-log-btn"),
    },

    // Notifications & Banners
    toastContainer: document.getElementById("toast-container"),
    installBanner: {
        container: document.getElementById("install-banner"),
        nowBtn: document.getElementById("btn-install-now"),
        closeBtn: document.getElementById("btn-install-close"),
        text: document.getElementById("install-text"),
    },

    // Leaderboard
    leaderboard: {
        modeSelector: document.getElementById("lb-mode-selector"),
        filterContainer: document.getElementById("leaderboard-filter"),
        filterButtons: document.getElementById("leaderboard-filter")?.querySelectorAll(".seg-btn") || [],
        matrixFilterContainer: document.getElementById("matrix-filter"),
        matrixFilterButtons: document.getElementById("matrix-filter")?.querySelectorAll(".seg-btn") || [],
        matrixViewContainer: document.getElementById("leaderboard-matrix-view"),
        singleViewContainer: document.getElementById("single-leaderboard-view"),
        list: document.getElementById("lb-list"),
        rangeText: document.getElementById("lb-date-range-text"),
        podiumOverlay: document.getElementById("mini-podium-overlay"),
        podiumTitle: document.getElementById("podium-title"),
        podiumSlots: cacheSubElements(".rank-1, .rank-2, .rank-3", {
            _name: ".p-name",
            _score: ".p-score",
        }),
    },

    // Settings
    settings: {
        accordionHeaders: document.querySelectorAll(".accordion-header"),
        accordionItems: cacheSubElements(".accordion-item", { _card: ".widget-card" }),
        nameInput: document.getElementById("username-input"),
        updateNameBtn: document.getElementById("btn-update-username"),
        onTrackInput: document.getElementById("on-track-input"),
        onTrackHint: document.getElementById("on-track-display-hint"),
        onTrackMinusBtn: document.getElementById("btn-ontrack-minus"),
        onTrackPlusBtn: document.getElementById("btn-ontrack-plus"),
        improveDisplay: document.getElementById("improve-display"),
        editSetsList: document.getElementById("edit-sets-list"),
        displayDateLabel: document.getElementById("display-date-label"),
        goalModeToggle: document.getElementById("goal-mode-toggle"),
        manualGoalContainer: document.getElementById("manual-goal-container"),
        manualGoalInput: document.getElementById("manual-goal-input"),
        thresholdModeToggle: document.getElementById("threshold-mode-toggle"),
        customThresholdContainer: document.getElementById("custom-threshold-container"),
        addPastBtn: document.getElementById("btn-add-past"),
        editDatePicker: document.getElementById("edit-date-picker"),
        versionEl: document.getElementById("app-version"),
        updateAppBtn: document.getElementById("btn-update-app"),
        importBtn: document.getElementById("import-btn"),
        importInput: document.getElementById("import-input"),
        themeButtons: document.getElementById("theme-selector")?.querySelectorAll(".seg-btn") || [],
        exerciseCheckboxList: document.getElementById("exercise-checkbox-list"),
        exportDataBtn: document.getElementById("export-data-btn"),
    },

    // Visualization & Bars
    ui: {
        authBtn: document.getElementById("auth-button"),
        greenBar: document.getElementById("progress-bar-green"),
        blueBar: document.getElementById("progress-bar-blue"),
        trendFill: document.getElementById("trend-fill"),
        trendLabel: document.getElementById("trend-label"),
        barChart: document.getElementById("bar-chart"),
        barLabels: document.getElementById("bar-labels"),
        restStreakTag: document.getElementById("rest-streak-tag"),
        milestoneFill: document.getElementById("milestone-fill"),
        pillElite: document.getElementById("pill-elite"),
        pillSolid: document.getElementById("pill-solid"),
        pillLight: document.getElementById("pill-light"),
        monthlyChart: document.getElementById("monthly-chart"),
        goalDescriptions: document.querySelectorAll(".goal-description"),
        thresholdDescriptions: document.querySelectorAll(".threshold-description"),
        unitLabels: document.querySelectorAll(".unit-label"),
        bgPrimary: document.getElementById("bg-primary"),
        bgSecondary: document.getElementById("bg-secondary"),
        trendCard30: document.getElementById("trend-card-30"),
        trendSummaryView: document.querySelector(".trend-summary-view"),
        trendChartView: document.querySelector(".trend-chart-view"),
    },

    // The Auto-Generated Stat Map
    stats: (() => {
        const statMap = {};
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
            statMap[id] = el;
        });
        return statMap;
    })(),
};

console.log("🎯 DOM elements module loaded");
