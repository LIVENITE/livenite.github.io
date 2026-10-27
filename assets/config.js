// Site settings. Fill in firebaseConfig from the Firebase console (see SETUP.md, step B2).
// These Firebase values are designed to be public; the database rules are what protect the data.
export const firebaseConfig = {
  apiKey: "AIzaSyB84nC1bZng8iULNXHomTMbpcPNUCLdDqA",
  authDomain: "livenite-50c69.firebaseapp.com",
  projectId: "livenite-50c69",
  appId: "1:182422657948:web:9df6a9d2710fd4c4614659"
};

// Which game record the pages show. A second game later gets its own id.
export const GAME_ID = "5050";

// Text at the top of the 50/50 board and its TV screen.
export const SITE = {
  title: "50/50 RAFFLE",
  subtitle: "Tickets on sale now"
};

// Where activities happen. Managers pick from this list; edit names here.
export const VENUES = [
  { id: "lobby", name: "Grand Lobby", blurb: "Welcome desk, photo wall and 50/50 tickets." },
  { id: "stage", name: "Main Stage", blurb: "Big-screen games and the night's headliners." },
  { id: "lounge", name: "Starlight Lounge", blurb: "Low lights, live mics and a buzzer for every table." },
  { id: "deck", name: "Lido Deck", blurb: "Open air, string lights and late snacks." }
];

// Kinds of activity. A "draw" activity sets the 50/50 countdown.
// Keep these ids in step with the list in firestore.rules.
export const TYPES = { game: "Game", music: "Music", social: "Social", challenge: "Challenge", draw: "Draw" };

// Show "Prize may be out of date" when the last update is older than this.
export const STALE_MS = 45 * 60 * 1000;
