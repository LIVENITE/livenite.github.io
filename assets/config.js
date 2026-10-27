// Site settings. Fill in firebaseConfig from the Firebase console (see SETUP.md, step B2).
// These Firebase values are designed to be public; the database rules are what protect the data.
export const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  appId: "YOUR_APP_ID"
};

// Which game record the pages show. A second game later gets its own id.
export const GAME_ID = "5050";

// Text at the top of the public page and the TV.
export const SITE = {
  title: "50/50 RAFFLE",
  subtitle: "Tickets on sale now"
};

// Show "Prize may be out of date" when the last update is older than this.
export const STALE_MS = 45 * 60 * 1000;
