// Design preview: stands in for Firebase so the live site's own code runs in a private page.
// Data lives only in this page. Nothing is sent anywhere, and a reload starts again from the snapshot.
var SNAP = __SNAPSHOT__;
var GAME_ID = "5050";
var SERVER_TIME = { __serverTime: true };

function Timestamp(ms) { this.ms = ms; }
Timestamp.prototype.toMillis = function () { return this.ms; };
Timestamp.fromMillis = function (ms) { return new Timestamp(ms); };
function serverTimestamp() { return SERVER_TIME; }
var DELETE_FIELD = { __delete: true };
function deleteField() { return DELETE_FIELD; }

var store = {};
function clone(v) {
  if (v instanceof Timestamp) return new Timestamp(v.ms);
  if (Array.isArray(v)) return v.map(clone);
  if (v && typeof v === "object") { var o = {}; Object.keys(v).forEach(function (k) { o[k] = clone(v[k]); }); return o; }
  return v;
}
Object.keys(SNAP.docs).forEach(function (path) {
  var d = clone(SNAP.docs[path]);
  SNAP.timeFields.forEach(function (k) { if (typeof d[k] === "string") d[k] = new Timestamp(Date.parse(d[k])); });
  store[path] = d;
});

var app = {}, db = {}, configured = true;
var autoId = 0;
function newId() { autoId++; return "d" + Date.now().toString(36) + autoId; }
// doc(collectionRef) with no id is how a batch asks for a new record; it gets its id when saved.
function doc(first) {
  if (arguments.length === 1 && first && first.kind === "coll") { var nid = newId(); return { kind: "doc", path: first.path + "/" + nid, id: nid }; }
  var path = Array.prototype.slice.call(arguments, 1).join("/");
  return { kind: "doc", path: path, id: path.split("/").pop() };
}
function collection() { return { kind: "coll", path: Array.prototype.slice.call(arguments, 1).join("/") }; }
function orderBy(field) { return { orderBy: field }; }
function query(coll, ob) { return { kind: "coll", path: coll.path, orderBy: ob && ob.orderBy }; }
function pathOf(ref) { return ref.kind === "new" ? ref.path + "/" + newId() : ref.path; }

function docSnap(path) {
  var d = store[path];
  return { id: path.split("/").pop(), exists: function () { return !!d; }, data: function () { return d ? clone(d) : undefined; } };
}
function ms(v) { return v && v.toMillis ? v.toMillis() : v; }
function collSnap(ref) {
  var prefix = ref.path + "/";
  var docs = Object.keys(store).filter(function (p) { return p.indexOf(prefix) === 0 && p.slice(prefix.length).indexOf("/") < 0; }).map(docSnap);
  if (ref.orderBy) docs.sort(function (a, b) { var x = ms(a.data()[ref.orderBy]), y = ms(b.data()[ref.orderBy]); return x < y ? -1 : x > y ? 1 : 0; });
  return { docs: docs, size: docs.length };
}
var listeners = [];
function notify() { listeners.forEach(function (l) { l.fire(); }); }
function onSnapshot(ref, next) {
  var l = { fire: function () { next(ref.kind === "coll" ? collSnap(ref) : docSnap(ref.path)); } };
  listeners.push(l);
  setTimeout(l.fire, 0);
  return function () { listeners = listeners.filter(function (x) { return x !== l; }); };
}
function stamp(data) {
  var o = {};
  Object.keys(data).forEach(function (k) { o[k] = data[k] === SERVER_TIME ? new Timestamp(Date.now()) : data[k] === DELETE_FIELD ? DELETE_FIELD : clone(data[k]); });
  return o;
}
function merge(target, data) { Object.keys(data).forEach(function (k) { if (data[k] === DELETE_FIELD) delete target[k]; else target[k] = data[k]; }); return target; }
function write(fn) { fn(); setTimeout(notify, 0); return Promise.resolve(); }
function getDoc(ref) {
  // In the preview you are always an admin.
  if (ref.path.indexOf("managers/") === 0) return Promise.resolve({ id: "designer", exists: function () { return true; }, data: function () { return {}; } });
  return Promise.resolve(docSnap(ref.path));
}
function setDoc(ref, data) { return write(function () { store[pathOf(ref)] = stamp(data); }); }
function updateDoc(ref, data) {
  if (!store[ref.path]) return Promise.reject({ code: "not-found" });
  return write(function () { merge(store[ref.path], stamp(data)); });
}
// Reads then writes as one step, like Firestore's transactions.
function runTransaction(_db, fn) {
  var ops = [];
  var t = {
    get: function (ref) { return Promise.resolve(docSnap(ref.path)); },
    update: function (ref, data) { ops.push(function () { merge(store[ref.path], stamp(data)); }); return t; },
    set: function (ref, data) { ops.push(function () { store[ref.path] = stamp(data); }); return t; }
  };
  return Promise.resolve(fn(t)).then(function (r) { return write(function () { ops.forEach(function (f) { f(); }); }).then(function () { return r; }); });
}
function addDoc(coll, data) { var path = coll.path + "/" + newId(); return write(function () { store[path] = stamp(data); }); }
function deleteDoc(ref) { return write(function () { delete store[ref.path]; }); }
function writeBatch() {
  var ops = [];
  return {
    set: function (ref, data) { ops.push(function () { store[pathOf(ref)] = stamp(data); }); },
    update: function (ref, data) { ops.push(function () { merge(store[ref.path], stamp(data)); }); },
    delete: function (ref) { ops.push(function () { delete store[ref.path]; }); },
    commit: function () { return write(function () { ops.forEach(function (f) { f(); }); }); }
  };
}

var designer = { uid: "designer", email: "admin@preview" };
function getAuth() { return {}; }
function onAuthStateChanged(_auth, cb) { setTimeout(function () { cb(designer); }, 0); }
function signInWithEmailAndPassword() { return Promise.resolve(); }
function signOut() { return Promise.resolve(); }
