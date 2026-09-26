// 纠错判定层：档案纠错申请的提交校验、核对裁决与换号落库规则。
// 规则：
//   1. 提交需带原环、新环、原因、来源说明；原环必须在册。
//   2. 新环已被别的鸽只占用（当前环或旧环）时拒绝提交，已有待核申请占用新环同样拒绝。
//   3. 申请提交后不直接换号，必须核对（review）后才执行。
//   4. 核对通过时：父母/子代引用一并改指新环；旧环保留变更记录；疫苗、转让、成绩原样保留。
//   5. 核对驳回或待核期间，两边档案和履历都不能被改动。
import {
  findPigeonByRing,
  findPigeonByAnyRing,
  isRingRetired,
  listCorrections,
  saveDb
} from "./store.js";

const today = () => new Date().toISOString().slice(0, 10);
const now = () => new Date().toISOString();
const newCorrectionId = () =>
  "CORR-" + Date.now().toString(36).toUpperCase() + "-" + Math.random().toString(36).slice(2, 6).toUpperCase();

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

// 提交前判定：返回 { error, code } 或 null 表示可提交
export function validateSubmission(db, input) {
  const oldRing = clean(input.oldRing);
  const newRing = clean(input.newRing);
  const reason = clean(input.reason);
  const source = clean(input.source);

  if (!oldRing || !newRing || !reason || !source) {
    return { error: "申请需填写原环、新环、原因和来源说明", code: "missing_fields" };
  }
  if (oldRing === newRing) {
    return { error: "新环号与原环号相同，无需纠错", code: "same_ring" };
  }
  const pigeon = findPigeonByAnyRing(db, oldRing);
  if (!pigeon) {
    return { error: "原环号在棚册中查不到档案", code: "old_ring_not_found" };
  }
  // 提交时原环若已是旧环，指向的是同一羽，当前环就是它的新环，纠错应按当前环申请
  if (pigeon.ringNo !== oldRing) {
    return { error: "原环号已办理过换号，请按当前环号申请", code: "ring_already_changed" };
  }

  const occupant = findPigeonByRing(db, newRing);
  if (occupant && occupant.ringNo !== oldRing) {
    // 新环已被别的鸽只占用：拒绝提交，两边档案和履历不能改
    return { error: "新环号已被别的鸽只占用，不能换号", code: "new_ring_occupied" };
  }
  if (isRingRetired(db, newRing)) {
    return { error: "新环号是其它鸽只的旧环，已退役不得使用", code: "new_ring_retired" };
  }

  const corrections = listCorrections(db);
  const pending = corrections.filter(item => item.status === "pending");
  if (pending.some(item => item.oldRing === oldRing)) {
    return { error: "该鸽只有一条待核纠错申请，请先核对", code: "pending_exists" };
  }
  if (pending.some(item => item.newRing === newRing)) {
    return { error: "新环号已被另一条待核申请预留", code: "new_ring_reserved" };
  }
  return null;
}

// 入口调用：校验通过才落一条待核申请，不动任何鸽只档案
export async function submitCorrection(db, input) {
  const problem = validateSubmission(db, input);
  if (problem) return problem;

  const correction = {
    id: newCorrectionId(),
    oldRing: clean(input.oldRing),
    newRing: clean(input.newRing),
    reason: clean(input.reason),
    source: clean(input.source),
    status: "pending",
    submittedAt: now(),
    reviewedAt: "",
    reviewNote: "",
    result: null
  };
  db.corrections.unshift(correction);
  await saveDb(db);
  return { correction };
}

function getPendingCorrection(db, id) {
  const correction = db.corrections.find(item => item.id === id);
  if (!correction) return { error: "纠错申请不存在", code: "correction_not_found" };
  if (correction.status !== "pending") return { error: "该申请已核对，不能重复操作", code: "already_reviewed" };
  return null;
}

// 核对通过（approved=true 换号；false 驳回，两边档案履历一律不动）
export async function reviewCorrection(db, id, approved, note) {
  const problem = getPendingCorrection(db, id);
  if (problem) return problem;

  const correction = db.corrections.find(item => item.id === id);
  const pigeon = findPigeonByRing(db, correction.oldRing);
  if (!pigeon) {
    return { error: "原档案已不在棚册中，无法核对", code: "old_ring_not_found" };
  }

  // 驳回：只记录裁决，档案与履历完全不碰
  if (!approved) {
    correction.status = "rejected";
    correction.reviewedAt = now();
    correction.reviewNote = clean(note) || "核对未通过";
    correction.result = { changed: false };
    await saveDb(db);
    return { correction };
  }

  // 核准换号前再核对一次：新环这期间不能被别的鸽只占走
  const occupant = findPigeonByRing(db, correction.newRing);
  if (occupant && occupant.ringNo !== correction.oldRing) {
    return { error: "新环号已被别的鸽只占用，已中止换号", code: "new_ring_occupied" };
  }
  if (isRingRetired(db, correction.newRing)) {
    return { error: "新环号是其它鸽只的旧环，已中止换号", code: "new_ring_retired" };
  }

  const oldRing = correction.oldRing;
  const newRing = correction.newRing;
  const change = {
    from: oldRing,
    to: newRing,
    date: today(),
    reason: correction.reason,
    source: correction.source,
    correctionId: correction.id
  };

  // 1) 本鸽换号，旧环保留在变更记录里；疫苗、转让、成绩数组原样保留
  pigeon.ringNo = newRing;
  pigeon.ringChanges.push(change);

  // 2) 父母引用：本鸽自身的父母环不动（父母没换号）；
  //    子代引用：所有把本鸽记为父母的档案，一并改指新环
  const updatedReferences = [];
  for (const other of db.pigeons) {
    if (other === pigeon) continue;
    if (other.fatherRing === oldRing) {
      other.fatherRing = newRing;
      updatedReferences.push({ ringNo: other.ringNo, field: "fatherRing" });
    }
    if (other.motherRing === oldRing) {
      other.motherRing = newRing;
      updatedReferences.push({ ringNo: other.ringNo, field: "motherRing" });
    }
  }

  correction.status = "approved";
  correction.reviewedAt = now();
  correction.reviewNote = clean(note) || "核对无误，已换号";
  correction.result = {
    changed: true,
    changedAt: change.date,
    updatedReferences
  };

  await saveDb(db);
  return { correction, pigeon, updatedReferences };
}
