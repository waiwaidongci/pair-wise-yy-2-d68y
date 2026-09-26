// 存储层：足环档案与纠错单的 JSON 持久化及基础读写。
// 只负责数据落地，不做业务判定，也不感知 HTTP。
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = join(__dirname, "data", "pigeons.json");

const seed = {
  pigeons: [
    { ringNo: "CHN-2026-001", owner: "北岸棚", fatherRing: "CHN-2022-188", motherRing: "CHN-2023-512", color: "灰", loft: "北岸A棚", vaccines: [{ date: "2026-04-01", name: "新城疫" }], transfers: [{ date: "2026-04-15", from: "育种棚", to: "北岸棚" }], races: [{ date: "2026-06-01", event: "120公里训放", distance: 120, returnTime: "10:42", rank: 18 }] },
    { ringNo: "CHN-2022-188", owner: "育种棚", fatherRing: "", motherRing: "", color: "雨点", loft: "种鸽棚", vaccines: [], transfers: [], races: [] },
    { ringNo: "CHN-2023-512", owner: "育种棚", fatherRing: "", motherRing: "", color: "红轮", loft: "种鸽棚", vaccines: [], transfers: [], races: [] }
  ],
  corrections: []
};

export async function loadDb() {
  if (!existsSync(dbPath)) {
    await mkdir(dirname(dbPath), { recursive: true });
    await writeFile(dbPath, JSON.stringify(seed, null, 2));
  }
  const db = JSON.parse(await readFile(dbPath, "utf8"));
  // 兼容旧棚册数据：补齐纠错单集合
  if (!Array.isArray(db.corrections)) db.corrections = [];
  return db;
}

export async function saveDb(db) {
  await writeFile(dbPath, JSON.stringify(db, null, 2));
}

// ---------- 鸽只档案 ----------

export function listPigeons(db) {
  return db.pigeons;
}

// 只认当前足环号
export function findPigeonByCurrentRing(db, ringNo) {
  return db.pigeons.find(item => item.ringNo === ringNo) || null;
}

// 当前足环号或历史变更记录中的旧环，都能定位到同一份档案
export function findPigeonByAnyRing(db, ringNo) {
  const current = findPigeonByCurrentRing(db, ringNo);
  if (current) return current;
  return db.pigeons.find(item =>
    Array.isArray(item.ringHistory) &&
    item.ringHistory.some(change => change.from === ringNo || change.to === ringNo)
  ) || null;
}

export function insertPigeon(db, pigeon) {
  db.pigeons.unshift(pigeon);
  return pigeon;
}

// ---------- 纠错单 ----------

export function listCorrections(db) {
  return db.corrections;
}

export function getCorrection(db, id) {
  return db.corrections.find(item => item.id === id) || null;
}

export function insertCorrection(db, request) {
  db.corrections.unshift(request);
  return request;
}

export function updateCorrection(db, id, patch) {
  const request = getCorrection(db, id);
  if (!request) return null;
  Object.assign(request, patch);
  return request;
}

// ---------- 换号落库 ----------
// 由判定层核对通过后调用：改本鸽足环、改写所有父母引用、追加旧环变更记录。
// 疫苗、转让、成绩等履历原样保留，不在此处改动。
export function applyRingRenumber(db, pigeon, { newRing, record }) {
  const oldRing = pigeon.ringNo;
  for (const other of db.pigeons) {
    if (other.fatherRing === oldRing) other.fatherRing = newRing;
    if (other.motherRing === oldRing) other.motherRing = newRing;
  }
  pigeon.ringNo = newRing;
  if (!Array.isArray(pigeon.ringHistory)) pigeon.ringHistory = [];
  pigeon.ringHistory.push(record);
  return pigeon;
}
