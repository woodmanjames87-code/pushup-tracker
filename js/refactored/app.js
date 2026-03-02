/*************************************************
 * DOM REFERENCES
 *************************************************/
const trackerPage = document.getElementById("tracker-page");
const settingsPage = document.getElementById("settings-page");
const leaderboardPage = document.getElementById("leaderboard-page");
const editSetsList = document.getElementById("edit-sets-list");



/*************************************************
 * INITIALIZATION
 *************************************************/
async function initPWAUtils() {
    const versionEl = document.getElementById("app-version");
    const updateBtn = document.getElementById("btn-update-app");

    if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
        // 1. Get Version from SW
        const msgChan = new MessageChannel();
        msgChan.port1.onmessage = (event) => {
            if (event.data.version) versionEl.innerText = `Version ${event.data.version}`;
        };
        navigator.serviceWorker.controller.postMessage({ type: "GET_VERSION" }, [msgChan.port2]);

        // 2. Force Update Logic
        updateBtn.onclick = async () => {
            updateBtn.innerText = "Checking...";

            const registration = await navigator.serviceWorker.getRegistration();

            if (registration) {
                // 1. Set up a listener for the NEW worker arriving
                registration.onupdatefound = () => {
                    const newWorker = registration.installing;
                    newWorker.onstatechange = () => {
                        if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
                            // New version found and fully downloaded!
                            newWorker.postMessage({ type: "SKIP_WAITING" });
                        }
                    };
                };

                // 2. Trigger the check
                await registration.update();

                // 3. Handle the case where the update was already downloaded but not active
                if (registration.waiting) {
                    registration.waiting.postMessage({ type: "SKIP_WAITING" });
                }

                // 4. Listen for the controller change to reload the page
                navigator.serviceWorker.addEventListener("controllerchange", () => {
                    window.location.reload();
                    alert("Updated to newest version!");
                });

                // 5. Provide feedback if nothing was found after a short delay
                setTimeout(() => {
                    if (!registration.waiting && !registration.installing) {
                        updateBtn.innerText = "App is up to date";
                        setTimeout(() => {
                            updateBtn.innerText = "Check for Updates";
                        }, 5000);
                    }
                }, 1000);
            }
        };
    }
}




