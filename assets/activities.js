// Tonight's activities, read live from the database, plus the sample night managers can load.
import { collection, onSnapshot, query, orderBy } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { db } from "./firebase-init.js";
import { VENUES } from "./config.js";
import { MIN, toMillis } from "./format.js";

export function venueOf(a) {
  return VENUES.find((v) => v.id === a.venue) || { id: a.venue, name: a.venue, blurb: "" };
}

export function endOf(a) {
  return a.start + a.length * MIN;
}

// "done", "live" or "upcoming"
export function stateOf(a, now) {
  if (now >= endOf(a)) return "done";
  if (now >= a.start) return "live";
  return "upcoming";
}

// The 50/50 draw is the first activity of type "draw" that hasn't finished (or the last one if all have).
export function drawOf(acts, now) {
  const draws = acts.filter((a) => a.type === "draw");
  return draws.find((a) => endOf(a) > now) || draws[draws.length - 1] || null;
}

function toActivity(snap) {
  const d = snap.data({ serverTimestamps: "estimate" });
  return {
    id: snap.id,
    title: d.title || "",
    type: d.type || "game",
    venue: d.venue || "",
    start: toMillis(d.start),
    length: d.length || 30,
    blurb: d.blurb || "",
    host: d.host || ""
  };
}

// Calls onChange(list sorted by start time) now and whenever a manager saves. Returns a stop function.
export function watchActivities(onChange, onError) {
  return onSnapshot(query(collection(db, "activities"), orderBy("start")),
    (snap) => onChange(snap.docs.map(toActivity).filter((a) => a.start)),
    onError);
}

// A sample night timed around now, so something is live straight away.
// "at" is minutes after the first activity.
export function sampleNight(now) {
  const base = Math.round((now - 172 * MIN) / (5 * MIN)) * (5 * MIN);
  return [
    { at: 0, length: 45, title: "Welcome Mixer", type: "social", venue: "lobby", host: "The LIVENITE crew", blurb: "Grab your wristband, meet the hosts and pick up 50/50 tickets before the pot starts climbing." },
    { at: 45, length: 60, title: "Neon Bingo", type: "game", venue: "stage", host: "DJ Marla & the Ball Machine", blurb: "Glow daubers, three fast rounds, then a blackout game for the big prize basket." },
    { at: 60, length: 60, title: "Shuffleboard Showdown", type: "challenge", venue: "deck", host: "Captain Rob", blurb: "Pairs play quick-fire rounds under the string lights. Winners advance to the late-night final." },
    { at: 110, length: 45, title: "Name That Tune", type: "music", venue: "lounge", host: "Priya on the keys", blurb: "Three notes, four teams, one buzzer. A decades round, a movie round, then sudden death." },
    { at: 165, length: 45, title: "Minute to Win It", type: "challenge", venue: "stage", host: "DJ Marla", blurb: "Stack the cups, flip the bottle, move the cookie with your face. Sixty seconds per challenge." },
    { at: 175, length: 45, title: "Lounge Pub Quiz", type: "game", venue: "lounge", host: "Quizmaster Jo", blurb: "Five rounds of general knowledge with a picture round you'll argue about all week." },
    { at: 215, length: 10, title: "50/50 Draw", type: "draw", venue: "stage", host: "The whole crowd", blurb: "The winning ticket is pulled live on the big screen. Half the pot goes home with one lucky guest." },
    { at: 230, length: 60, title: "Glow Karaoke", type: "music", venue: "lounge", host: "Priya & the house band", blurb: "Pick a song, grab a glow mic, own the room. Duets strongly encouraged." },
    { at: 245, length: 60, title: "Midnight Snack Bar", type: "social", venue: "deck", host: "The galley team", blurb: "Sliders, fries and hot chocolate under the lights. Fuel up for the last dance." },
    { at: 290, length: 70, title: "Last Call Dance Party", type: "music", venue: "stage", host: "DJ Marla", blurb: "Requests open, lights down, everybody up. The night ends on the dance floor." }
  ].map(({ at, ...a }) => ({ ...a, start: base + at * MIN }));
}
