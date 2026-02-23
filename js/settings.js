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