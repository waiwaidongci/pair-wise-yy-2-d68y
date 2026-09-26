// 入口层：足环纠错相关 HTTP 路由。只做请求解析、调用判定层、输出结果。
// 判定规则见 correction.js，数据落地见 store.js。
// 约定：路由命中并处理（含校验失败的响应）后返回 true，由 server 统一落库；
//       未命中返回 false，交回 server 继续匹配其它路由。
import * as correction from "./correction.js";

const ERROR_STATUS = {
  old_ring_required: 400,
  new_ring_required: 400,
  rings_must_differ: 400,
  reason_required: 400,
  source_note_required: 400,
  old_ring_not_found: 404,
  new_ring_occupied: 409,
  correction_already_pending: 409,
  correction_not_found: 404,
  correction_not_pending: 409
};

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data, null, 2));
}

function fail(res, error) {
  const code = error.code || "internal_error";
  sendJson(res, ERROR_STATUS[code] || 500, { error: code });
}

// 查询纠错单列表（附带每张单当前指向的足环号，方便页面核对）
function withCurrentRing(db, request) {
  const pigeon = correction.currentPigeon(db, request);
  return { ...request, currentRing: pigeon ? pigeon.ringNo : "" };
}

export async function correctionRoutes(req, res, url, db, body) {
  if (req.method === "GET" && url.pathname === "/api/corrections") {
    const list = correction.store.listCorrections(db).map(item => withCurrentRing(db, item));
    sendJson(res, 200, list);
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/corrections") {
    try {
      const request = correction.submitCorrection(db, await body(req));
      sendJson(res, 201, withCurrentRing(db, request));
    } catch (error) {
      fail(res, error);
    }
    return true;
  }

  const reviewMatch = url.pathname.match(/^\/api\/corrections\/(.+)\/(approve|reject)$/);
  if (reviewMatch && req.method === "POST") {
    try {
      const id = decodeURIComponent(reviewMatch[1]);
      const input = await body(req);
      if (reviewMatch[2] === "approve") {
        const result = correction.approveCorrection(db, id, input);
        sendJson(res, 200, { ...withCurrentRing(db, result.request), pigeon: result.pigeon });
      } else {
        sendJson(res, 200, withCurrentRing(db, correction.rejectCorrection(db, id, input)));
      }
    } catch (error) {
      fail(res, error);
    }
    return true;
  }

  return false;
}
