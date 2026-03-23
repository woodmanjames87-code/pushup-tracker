The "DailyGrind" Integrity Checklist

BACKUP DATA FIRST!

Test 1: The "New Device" Pull
Goal: Ensure a fresh login doesn't wipe the cloud.

    Action:
        1. Sign out.
        2. Run clearAllData() (The "Dumb" button).
        3. Log in.

    Pass Criteria: History instantly repopulates; Console shows "Empty local detected. Performing mandatory cloud pull."

Test 2: The "Saturday Night" Boundary
Goal: Ensure sets logged late Saturday stay in the correct week.

    Action:
        1. Set your system clock to Saturday, 11:30 PM MDT.
        2. Log a set.
        3. Check the "Weekly" chart.

    Pass Criteria: The set appears in the current week, not the "Next" week. (This confirms your year-W-week logic is ignoring the UTC Sunday jump).

Test 3: The "Zombie Sync" Loop
Goal: Ensure the app isn't hammering Firebase.

    Action:
        1. Open the Console.
        2. Switch tabs to another app for 5 seconds, then switch back to DailyGrind.
        3. Repeat this 3 times quickly.

    Pass Criteria: You should see ☁️ Background sync check complete. once, followed by ⏭️ Skipping redundant background sync (throttled). for the subsequent tabs switches.

Test 4: The "Offline-to-Online" Merge
Goal: Ensure sets logged while signed out aren't lost upon login.

    Action:
        1. Sign out.
        2. Log a "Test Set" of 99 reps.
        3. Sign in.

    Pass Criteria: Your cloud history pulls down AND your 99-rep test set is still there (merged).
