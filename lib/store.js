import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { config } from './config.js';

const DIETS = ['vegetarian', 'vegan', 'gluten_free'];
const COLORS = ['#e4572e', '#29335c', '#f3a712', '#669bbc', '#a8c686', '#9b5de5', '#00bbf9', '#f15bb5'];
const WEEK = 7 * 864e5;

const toDateStr = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function mondayUTC(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const t = Date.UTC(y, m - 1, d);
  return t - ((new Date(t).getUTCDay() + 6) % 7) * 864e5;
}

function seed() {
  const mk = (name, color, prefs) => ({ id: randomUUID(), name, color, prefs: { likes: [], dislikes: [], diet: [], priceMin: 1, priceMax: 3, maxMiles: 10, minRating: 0, ...prefs } });
  return {
    members: [
      mk('Parent 1', COLORS[0], { likes: ['italian', 'sushi'], dislikes: [] }),
      mk('Parent 2', COLORS[1], { likes: ['thai', 'mediterranean'], diet: ['vegetarian'] }),
      mk('Kid', COLORS[2], { likes: ['pizza', 'burgers', 'tacos'], dislikes: ['seafood'] }),
    ],
    rotation: { anchor: toDateStr(new Date()), offset: 0 },
    history: [],
  };
}

let db = null;
let writing = Promise.resolve();

export async function load() {
  if (db) return db;
  try {
    db = JSON.parse(await readFile(config.dataFile, 'utf8'));
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
    db = seed();
    await save();
  }
  return db;
}

async function save() {
  const snapshot = JSON.stringify(db, null, 2);
  writing = writing.then(async () => {
    await mkdir(dirname(config.dataFile), { recursive: true });
    const tmp = `${config.dataFile}.tmp`;
    await writeFile(tmp, snapshot);
    await rename(tmp, config.dataFile);
  });
  return writing;
}

export function chooserIndex(d, date = new Date()) {
  const n = d.members.length;
  if (!n) return -1;
  const weeks = Math.round((mondayUTC(toDateStr(date)) - mondayUTC(d.rotation.anchor)) / WEEK);
  return (((weeks + d.rotation.offset) % n) + n) % n;
}

export function view(d, date = new Date()) {
  const idx = chooserIndex(d, date);
  return { ...d, chooserId: idx >= 0 ? d.members[idx].id : null, weekOf: new Date(mondayUTC(toDateStr(date))).toISOString().slice(0, 10) };
}

const strList = (v, max = 30) => (Array.isArray(v) ? v : []).map((s) => String(s).trim().toLowerCase().slice(0, 40)).filter(Boolean).slice(0, max);
const clamp = (v, lo, hi, dflt) => (Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Number(v))) : dflt);

function sanitizeMember(m, i) {
  const p = m?.prefs || {};
  const priceMin = Math.round(clamp(p.priceMin, 1, 4, 1));
  return {
    id: typeof m?.id === 'string' && m.id.length <= 64 ? m.id : randomUUID(),
    name: String(m?.name || '').trim().slice(0, 40) || 'Someone',
    color: /^#[0-9a-f]{6}$/i.test(m?.color) ? m.color : COLORS[i % COLORS.length],
    prefs: {
      likes: strList(p.likes),
      dislikes: strList(p.dislikes),
      diet: strList(p.diet).filter((x) => DIETS.includes(x)),
      priceMin,
      priceMax: Math.max(priceMin, Math.round(clamp(p.priceMax, 1, 4, 4))),
      maxMiles: clamp(p.maxMiles, 1, 50, 10),
      minRating: clamp(p.minRating, 0, 5, 0),
    },
  };
}

export async function setMembers(members) {
  await load();
  if (!Array.isArray(members)) throw Object.assign(new Error('members must be an array'), { status: 400 });
  // Keep the same person choosing this week when the list is reordered or edited.
  const current = db.members[chooserIndex(db)]?.id;
  db.members = members.slice(0, 20).map(sanitizeMember);
  if (current) setChooserInternal(current);
  await save();
  return view(db);
}

function setChooserInternal(memberId) {
  const target = db.members.findIndex((m) => m.id === memberId);
  const cur = chooserIndex(db);
  if (target >= 0 && cur >= 0) db.rotation.offset += target - cur;
}

export async function setChooser(memberId) {
  await load();
  setChooserInternal(memberId);
  await save();
  return view(db);
}

export async function advance(by = 1) {
  await load();
  db.rotation.offset += Math.max(-20, Math.min(20, Math.trunc(by) || 1));
  await save();
  return view(db);
}

export async function addHistory(entry) {
  await load();
  db.history.unshift({
    date: new Date().toISOString(),
    memberId: String(entry.memberId || '').slice(0, 64) || null,
    restaurantId: String(entry.restaurantId || '').slice(0, 600),
    name: String(entry.name || '').slice(0, 120),
    cuisine: String(entry.cuisine || '').slice(0, 80),
  });
  db.history = db.history.slice(0, 200);
  await save();
  return view(db);
}

export async function removeHistory(index) {
  await load();
  db.history.splice(Number(index), 1);
  await save();
  return view(db);
}
