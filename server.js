import http from "node:http";
import * as store from "./store.js";
import * as correction from "./correction.js";
import { correctionRoutes } from "./correctionApi.js";
import { page } from "./page.js";

const port = Number(process.env.PORT || 3024);

const loadDb = store.loadDb;
const saveDb = store.saveDb;
async function body(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
}
function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data, null, 2));
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const db = await loadDb();

    if (req.method === "GET" && url.pathname === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(page);
    }

    // 纠错入口层（提交、核对通过/驳回、纠错单列表）
    if (await correctionRoutes(req, res, url, db, body)) {
      // GET 不改动数据；POST 已在判定层落内存，统一持久化
      if (req.method === "POST") await saveDb(db);
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/pigeons") {
      return sendJson(res, 200, store.listPigeons(db));
    }

    if (req.method === "POST" && url.pathname === "/api/pigeons") {
      const input = await body(req);
      if (store.findPigeonByCurrentRing(db, input.ringNo)) return sendJson(res, 409, { error: "ring_exists" });
      const pigeon = store.insertPigeon(db, { ...input, vaccines: [], transfers: [], races: [] });
      await saveDb(db);
      return sendJson(res, 201, pigeon);
    }

    const relationMatch = url.pathname.match(/^\/api\/pigeons\/(.+)\/relation$/);
    if (relationMatch && req.method === "GET") {
      // 原环或新环都能查到同一份血统
      const data = correction.resolveRelation(db, decodeURIComponent(relationMatch[1]));
      return data ? sendJson(res, 200, data) : sendJson(res, 404, { error: "pigeon_not_found" });
    }

    const actionMatch = url.pathname.match(/^\/api\/pigeons\/(.+)\/(transfers|races|vaccines)$/);
    if (actionMatch && req.method === "POST") {
      // 换号后旧环仍可定位到同一份档案，疫苗/转让/成绩继续追加保留
      const pigeon = store.findPigeonByAnyRing(db, decodeURIComponent(actionMatch[1]));
      if (!pigeon) return sendJson(res, 404, { error: "pigeon_not_found" });
      const input = await body(req);
      if (actionMatch[2] === "transfers") {
        pigeon.transfers.push({ date: input.date || new Date().toISOString().slice(0, 10), from: pigeon.owner, to: input.to });
        pigeon.owner = input.to;
      }
      if (actionMatch[2] === "races") pigeon.races.push({ date: input.date || new Date().toISOString().slice(0, 10), event: input.event, distance: Number(input.distance || 0), returnTime: input.returnTime || "", rank: Number(input.rank || 0) });
      if (actionMatch[2] === "vaccines") pigeon.vaccines.push({ date: input.date || new Date().toISOString().slice(0, 10), name: input.name });
      await saveDb(db);
      return sendJson(res, 200, pigeon);
    }

    sendJson(res, 404, { error: "not_found" });
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
});

server.listen(port, () => console.log(`Racing pigeon registry app listening on http://localhost:${port}`));
