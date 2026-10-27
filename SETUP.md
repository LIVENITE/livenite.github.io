# LIVENITE: setup guide

This guide takes you from these files to three live web pages, with no command line. Budget about 30–45 minutes the first time.

| Page | Address (once live) | Who uses it |
|---|---|---|
| Home: tonight's itinerary | `https://livenite.github.io/` | Anyone, on phones and tablets |
| 50/50 board | `https://livenite.github.io/5050/` | Anyone who wants the live prize |
| 50/50 TV screen | `https://livenite.github.io/5050/tv/` | The TV at the venue (the old `/tv/` address forwards here) |
| Managers | `https://livenite.github.io/manage/` | Managers, on their phones: 50/50 prize and activities |

**Two services, two jobs.** GitHub Pages holds the pages (the shop window). Firebase holds the prize number and the manager logins (the whiteboard and the keys).

> Menu names below are from Firebase's and GitHub's sites as of October 2026. If a button is worded slightly differently, look for the closest match.

---

## Part A: GitHub Pages (the pages)

A1. These files live in the **public** GitHub repository `LIVENITE/livenite.github.io` (public is required for free GitHub Pages). Nothing private is in these files: never add passwords or manager emails to them.

A2. In that repository on github.com, click **Settings** (top bar) → **Pages** (left menu).

A3. Under **Build and deployment** → **Source**, choose **Deploy from a branch**. Under **Branch**, pick `main` and folder `/ (root)`, then **Save**.

A4. Wait 1–2 minutes and refresh. The page shows "Your site is live at …". Open it: you should see the board with the message "This board isn't connected yet." That's expected until Part B is done.

---

## Part B: Firebase (the prize number and logins)

B1. **Create the project.** Go to https://console.firebase.google.com/ and sign in with a Google account. Click **Create a project** (or **Add project**), type a name (for example `live-prize-board`), continue. Google Analytics is optional; you can turn it off.

B2. **Connect the pages to the project.**
1. On the project's home page, click the **web** icon (it looks like `</>`) to "Add an app". Give it a nickname such as `Prize board`. Do **not** tick "Also set up Firebase Hosting".
2. Firebase shows a block of code containing `const firebaseConfig = { apiKey: "…", authDomain: "…", projectId: "…", … }`.
3. On GitHub, open `assets/config.js` in your repository and click the **pencil** icon (Edit).
4. Replace the four `YOUR_…` values with the matching values from Firebase: `apiKey`, `authDomain`, `projectId`, `appId`. Keep the quote marks.
5. Click **Commit changes**. These values are designed to be public; the database rules (B4) are what protect your data.

B3. **Create the database.**
1. Left menu: **Build** → **Firestore Database** → **Create database**.
2. If asked for an edition, choose **Standard** (the free allowances quoted to you are for Standard).
3. Location: choose **Toronto (northamerica-northeast2)** or **Montréal (northamerica-northeast1)** to keep the data in Canada. **This cannot be changed later.**
4. Choose **Start in production mode**, then **Create**.

B4. **Paste the access rules.** In Firestore Database, open the **Rules** tab. Delete everything in the box, paste the whole contents of `firestore.rules` from this folder, then click **Publish**.

B5. **Turn on email logins.** Left menu: **Build** → **Authentication** → **Get started**. On the **Sign-in method** tab, click **Email/Password**, switch on the first toggle (Email/Password), leave "Email link" off, **Save**.

B6. **Add each manager.** Do this for every manager:
1. **Authentication** → **Users** tab → **Add user**. Enter their email and a starting password (at least 6 characters; longer is better). Click **Add user**.
2. In the user list, find their row and copy the **User UID** (a long code like `aB3dE…`). There's usually a copy icon when you hover over it.
3. Go to **Firestore Database** → **Data** tab. The first time, click **Start collection** and type the Collection ID `managers`. After that, open `managers` and click **Add document**.
4. For **Document ID**, paste the User UID from step 2. Add one field: Field `name`, Type `string`, Value the manager's name. **Save**.
5. Send the manager the **manager page address**, their email and starting password, through a private channel (not a group chat).

Only people with a `managers` entry can change the prize. Anyone else who logs in sees "this account isn't on the managers list."

B7. **If a login fails with "This web address isn't approved in Firebase"**: Authentication → **Settings** tab → **Authorized domains** → **Add domain** → type `livenite.github.io` → **Add**.

---

## Part B8: Activities (after updating the site)

The **Activities** tab on the manager page needs the latest `firestore.rules`. Whenever `firestore.rules` changes, paste the whole file again: Firestore Database → **Rules** → select all, paste, **Publish**. Until you do, saving an activity fails with "permission-denied".

- **Load sample night** adds 10 example activities timed around right now, so you can see live, next and finished states. **Clear all** removes every activity (tap twice).
- **Add activity**: name, type, where, start date and time, length, host and a short teaser. Changes show on every screen within a few seconds.
- An activity with type **Draw** sets the 50/50 draw time and countdown on the home page, the 50/50 board, the TV and the floating badge.
- Venue names live in `assets/config.js` (`VENUES`). Edit them there on GitHub and commit.

---

## Part C: First test (about 10 minutes)

1. Open the **manager page** on your phone and log in as a manager.
2. Enter a prize (for example `100`), a ticket price and a draw time. Tap **Update prize**. You should see "Saved."
3. Open the **public page** on another phone and the **TV page** on a computer or TV. Both should show the new prize.
4. Change the prize again on the manager page. The other screens should change within a few seconds **without reloading**.
5. Under **Recent updates** on the manager page, both changes should be listed with your email.
6. Before the event, repeat with 5–10 phones **on the venue's Wi-Fi**, since that's the most likely bottleneck.

The first save creates the prize record; until then the pages show "Waiting for the first update."

---

## Part D: Before the first live event

D1. **Upgrade to the Blaze plan** (pay-as-you-go) so a busy night can't shut the database off for the rest of the month. In the Firebase console, look for **Upgrade** next to the plan name ("Spark") at the bottom of the left menu, or under **Usage and billing**. This needs a credit card.

D2. **Set a budget alert** while upgrading (Firebase offers it during the upgrade; otherwise in Google Cloud console → **Billing** → **Budgets & alerts**). Suggested: $10 CAD with alerts at 50%, 90% and 100%. **A budget only sends emails; it does not stop spending.**

D3. **After the first busy night**, check **Firestore Database** → **Usage** to see how many reads you used.

---

## Part E: During the month

- **Lost or shared phone:** Authentication → Users → find the person → menu (⋮) → **Disable account**. Also delete their document in Firestore → `managers`. They're locked out immediately.
- **Change the heading text** ("50/50 RAFFLE", "Tickets on sale now"): edit `SITE` in `assets/config.js` on GitHub and commit. Pages update within a couple of minutes.
- **Prize shows "may be out of date":** nobody has updated it for 45 minutes. Any update clears it.
- **Backup plan:** if the internet or Firebase is down, screens keep the last number. Keep a whiteboard handy.

---

## Part F: When the month is over

1. GitHub repository → **Settings** → **Pages** → **Unpublish site** (or set Source to **None**).
2. Firebase console → ⚙ **Project settings** → scroll down → **Delete project**. This removes the data and logins. Download anything you need first (the **Recent updates** history is in Firestore → `games` → `5050` → `history`).
3. If you upgraded to Blaze, check your Google Cloud billing account shows no further charges.

---

## What's in this folder

| File | What it does |
|---|---|
| `index.html` | Home: tonight's itinerary, activity pages, floating 50/50 badge |
| `5050/index.html`, `5050/tv/index.html` | 50/50 board for phones, and for the TV (no buttons, cursor hidden) |
| `tv/index.html` | Forwards the old TV address to `5050/tv/` |
| `manage/index.html` | Manager login, 50/50 prize and Activities tabs |
| `assets/config.js` | **The only file you edit**: Firebase settings, venue names, 50/50 heading text |
| `assets/home.js`, `assets/board.js`, `assets/manage.js` | Each page's behaviour; live connections pause when a phone is locked to save reads |
| `assets/activities.js` | Reading activities and the sample night |
| `assets/theme.css`, `assets/ui.js`, `assets/firebase-init.js`, `assets/format.js` | Shared look and plumbing |
| `firestore.rules` | Who may read and write (paste into Firebase, step B4) |
