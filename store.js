// 存储层：负责棚册 JSON 的读写与基础查询，不做任何纠错业务判定。
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const dbPath = join(__dirname, "data", "pigeons.json");

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
  // 兼容旧棚册：补齐纠错功能引入的字段
  if (!Array.isArray(db.pigeons)) db.pigeons = [];
  if (!Array.isArray(db.corrections)) db.corrections = [];
  for (const pigeon of db.pigeons) {
    for (const key of ["vaccines", "transfers", "races", "ringChanges"]) {
      if (!Array.isArray(pigeon[key])) pigeon[key] = [];
    }
  }
  return db;
}

export async function saveDb(db) {
  await mkdir(dirname(dbPath), { recursive: true });
  await writeFile(dbPath, JSON.stringify(db, null, 2));
}

export function listPigeons(db) {
  return db.pigeons;
}

export function listCorrections(db) {
  return db.corrections;
}

// 只按当前足环号查找
export function findPigeonByRing(db, ringNo) {
  return db.pigeons.find(pigeon => pigeon.ringNo === ringNo) || null;
}

// 按当前环或历史旧环查找，同一份档案只能命中一羽
export function findPigeonByAnyRing(db, ringNo) {
  const current = findPigeonByRing(db, ringNo);
  if (current) return current;
  return db.pigeons.find(pigeon =>
    pigeon.ringChanges.some(change => change.from === ringNo)
  ) || null;
}

// 该环号是否已是某羽鸽只的旧环（已退役，不得再次启用）
export function isRingRetired(db, ringNo) {
  return db.pigeons.some(pigeon =>
    pigeon.ringChanges.some(change => change.from === ringNo)
  );
}
