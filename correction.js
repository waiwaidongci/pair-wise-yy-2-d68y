// 纠错判定层：足环纠错的规则与流程，不读写文件、不感知 HTTP。
// 流程：提交纠错单(pending) → 人工核对通过才换号(applied)，或驳回(rejected)。
// 规则：新环被别的鸽只当前占用时拒绝提交；核对时再次占用则拒绝换号；
//       换号不删旧环，旧环保留在变更记录里，履历(疫苗/转让/成绩)原样保留。
import * as store from "./store.js";

const today = () => new Date().toISOString().slice(0, 10);

export class CorrectionError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

// 纠错单当前指向的鸽只（可能尚未换号，也可能换号后档案已被后续操作引用）
export function currentPigeon(db, request) {
  return store.findPigeonByAnyRing(db, request.oldRing) ||
    store.findPigeonByAnyRing(db, request.newRing);
}

// 提交前/换号前的占用判定：新环是否被“别的鸽只”的当前足环号占用
function checkRings(db, oldRing, newRing) {
  if (!oldRing || !String(oldRing).trim()) throw new CorrectionError("old_ring_required");
  if (!newRing || !String(newRing).trim()) throw new CorrectionError("new_ring_required");
  if (oldRing.trim() === newRing.trim()) throw new CorrectionError("rings_must_differ");

  const pigeon = store.findPigeonByCurrentRing(db, oldRing.trim());
  if (!pigeon) throw new CorrectionError("old_ring_not_found");

  const occupied = store.findPigeonByCurrentRing(db, newRing.trim());
  if (occupied) {
    // 新环已被别的鸽只占用：拒绝，两边档案和履历都不能改
    throw new CorrectionError("new_ring_occupied");
  }
  return pigeon;
}

// 提交纠错申请：只登记单据，不换号、不改任何档案
export function submitCorrection(db, input) {
  const oldRing = String(input.oldRing || "").trim();
  const newRing = String(input.newRing || "").trim();
  const reason = String(input.reason || "").trim();
  const sourceNote = String(input.sourceNote || "").trim();
  if (!reason) throw new CorrectionError("reason_required");
  if (!sourceNote) throw new CorrectionError("source_note_required");

  checkRings(db, oldRing, newRing);

  // 同一对环号已有待核对申请，避免重复提交
  const duplicate = store.listCorrections(db).find(item =>
    item.status === "pending" && item.oldRing === oldRing && item.newRing === newRing
  );
  if (duplicate) throw new CorrectionError("correction_already_pending");

  const request = {
    id: "R" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    oldRing,
    newRing,
    reason,
    sourceNote,
    status: "pending",
    submittedAt: today(),
    reviewedAt: "",
    reviewer: "",
    reviewNote: ""
  };
  store.insertCorrection(db, request);
  return request;
}

// 人工核对通过：再次确认占用情况后才换号
export function approveCorrection(db, id, input = {}) {
  const request = store.getCorrection(db, id);
  if (!request) throw new CorrectionError("correction_not_found");
  if (request.status !== "pending") throw new CorrectionError("correction_not_pending");

  const pigeon = store.findPigeonByCurrentRing(db, request.oldRing);
  if (!pigeon) {
    // 原环档案已不在（被并入或删改），不能换号，履历不动
    throw new CorrectionError("old_ring_not_found");
  }
  const occupied = store.findPigeonByCurrentRing(db, request.newRing);
  if (occupied && occupied !== pigeon) throw new CorrectionError("new_ring_occupied");

  store.applyRingRenumber(db, pigeon, {
    newRing: request.newRing,
    record: {
      from: request.oldRing,
      to: request.newRing,
      date: today(),
      reason: request.reason,
      sourceNote: request.sourceNote,
      correctionId: request.id
    }
  });

  store.updateCorrection(db, id, {
    status: "applied",
    reviewedAt: today(),
    reviewer: String(input.reviewer || "").trim(),
    reviewNote: String(input.reviewNote || "").trim()
  });
  return { request: store.getCorrection(db, id), pigeon };
}

// 人工核对驳回：不换号，只记录结论，两边档案和履历都不改
export function rejectCorrection(db, id, input = {}) {
  const request = store.getCorrection(db, id);
  if (!request) throw new CorrectionError("correction_not_found");
  if (request.status !== "pending") throw new CorrectionError("correction_not_pending");

  store.updateCorrection(db, id, {
    status: "rejected",
    reviewedAt: today(),
    reviewer: String(input.reviewer || "").trim(),
    reviewNote: String(input.reviewNote || "").trim()
  });
  return store.getCorrection(db, id);
}

// 血统查询：按原环或新环都能定位到同一份档案，父母/子代引用换号后一起指向新环
export function resolveRelation(db, ringNo) {
  const pigeon = store.findPigeonByAnyRing(db, ringNo);
  if (!pigeon) return null;
  const father = store.findPigeonByCurrentRing(db, pigeon.fatherRing) || null;
  const mother = store.findPigeonByCurrentRing(db, pigeon.motherRing) || null;
  const children = store.listPigeons(db).filter(item =>
    item.fatherRing === pigeon.ringNo || item.motherRing === pigeon.ringNo
  );
  const matchedBy = pigeon.ringNo === ringNo ? "current" : "history";
  return { pigeon, father, mother, children, matchedBy };
}

// 暴露给入口层，供疫苗/转让/成绩等既有接口按“原环或新环”定位档案
export { store };
