
/*************************************************
 * Theme Management for Light/Auto/Dark Modes
 *************************************************/
document.addEventListener('DOMContentLoaded', () => {
    const themeContainer = document.querySelector('#theme-selector');
    
    // Safety check: only run if the theme selector exists on this page
    if (!themeContainer) return;

    const themeButtons = themeContainer.querySelectorAll('.seg-btn');
    const htmlElement = document.documentElement; // <-- Define this!

    function setTheme(theme) {
        // 1. Determine actual appearance
        let appearance = theme;
        if (theme === 'auto') {
            appearance = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
        }

        // 2. Apply to HTML tag
        htmlElement.setAttribute('data-theme', appearance);
        
        // 3. Save preference
        localStorage.setItem('user-theme', theme);

        // 4. Update UI Button States (Scoped to themeButtons)
        themeButtons.forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-theme') === theme);
        });
    }

    // Event Listeners for theme buttons
    themeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const selectedTheme = btn.getAttribute('data-theme');
            setTheme(selectedTheme);
        });
    });

    // Initialize on Load
    const savedTheme = localStorage.getItem('user-theme') || 'auto';
    setTheme(savedTheme);

    // Watch for system theme changes
    window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
        if (localStorage.getItem('user-theme') === 'auto') {
            setTheme('auto');
        }
    });
});

/*************************************************
 * Install Prompt Handling for Android and iOS
 *************************************************/
let deferredPrompt;

// 1. Listen for the Android/Chrome Install Prompt
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    showUnifiedInstallBanner('android');
});

// 2. Check for iOS (Safari)
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
const isStandalone = window.matchMedia('(display-mode: standalone)').matches;

if (isIOS && !isStandalone) {
    showUnifiedInstallBanner('ios');
}

function showUnifiedInstallBanner(platform) {
    const banner = document.getElementById('install-banner');
    
    // Check if they closed it today already
    const lastClosed = localStorage.getItem('installBannerClosed');
    if (lastClosed === new Date().toLocaleDateString()) {
        return; // Don't show it
    }

    const text = document.getElementById('install-text');
    const btn = document.getElementById('btn-install-now');

    banner.classList.remove('hidden');

    if (platform === 'ios') {
        text.innerText = "Install for the full experience!";
        btn.innerText = "How to Install";
    } else {
        text.innerText = "Install the app for easy access!";
        btn.innerText = "Install Now";
    }
};

// 3. Handle the click for both platforms
document.getElementById('btn-install-now').onclick = async () => {
    if (deferredPrompt) {
        // Android Path
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
            document.getElementById('install-banner').classList.add('hidden');
        }
        deferredPrompt = null;
    } else if (isIOS) {
        // iOS Path: Show instructions instead of a prompt
        alert("To install on iPhone:\n1. Tap the 'Share' button (square with arrow)\n2. Scroll down and tap 'Add to Home Screen' (+ icon)");
    }
};

// 4. Handle the "Close" button
document.getElementById('btn-install-close').onclick = () => {
    const banner = document.getElementById('install-banner');
    banner.classList.add('hidden');
    
    // Optional: Save to local storage so it doesn't bother them again today
    localStorage.setItem('installBannerClosed', new Date().toLocaleDateString());
};