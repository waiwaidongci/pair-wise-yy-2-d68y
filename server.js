// 入口层：HTTP 路由与页面渲染。存储规则见 store.js，纠错判定见 correction.js。
import http from "node:http";
import {
  loadDb,
  saveDb,
  listPigeons,
  listCorrections,
  findPigeonByAnyRing,
  findPigeonByRing
} from "./store.js";
import { submitCorrection, reviewCorrection } from "./correction.js";

const port = Number(process.env.PORT || 3024);

async function body(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
}
function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data, null, 2));
}

// 按当前环或旧环查同一份血统：父母、子代引用换号后都指向新环
function relation(db, ringNo) {
  const pigeon = findPigeonByAnyRing(db, ringNo);
  if (!pigeon) return null;
  const current = pigeon.ringNo;
  const father = db.pigeons.find(item => item.ringNo === pigeon.fatherRing) || null;
  const mother = db.pigeons.find(item => item.ringNo === pigeon.motherRing) || null;
  const children = db.pigeons.filter(item => item.fatherRing === current || item.motherRing === current);
  return { pigeon, queriedRing: ringNo, father, mother, children };
}

const page = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>赛鸽血统环号登记站</title>
  <style>
    :root { --bg:#eff2f5; --panel:#fff; --ink:#1f2833; --muted:#697786; --line:#d3dce4; --accent:#315f83; --red:#9b3f35; --green:#356b4c; --amber:#8a6d1f; }
    * { box-sizing:border-box; } body { margin:0; background:var(--bg); color:var(--ink); font-family:Arial,"PingFang SC",sans-serif; }
    header { padding:22px 28px; background:#fff; border-bottom:1px solid var(--line); display:flex; justify-content:space-between; gap:16px; align-items:center; }
    h1 { margin:0; font-size:26px; } main { display:grid; grid-template-columns:380px 1fr; gap:22px; padding:22px 28px; }
    form,.panel,.card,.stat { background:#fff; border:1px solid var(--line); border-radius:8px; padding:16px; }
    form + form { margin-top:16px; } h2 { margin:0 0 12px; font-size:18px; }
    label { display:block; margin:10px 0 5px; color:var(--muted); font-size:13px; }
    input,select,textarea { width:100%; border:1px solid var(--line); border-radius:6px; padding:9px; font:inherit; }
    textarea { resize:vertical; min-height:56px; }
    button { border:0; border-radius:6px; background:var(--accent); color:#fff; padding:10px 13px; font-weight:700; cursor:pointer; }
    button.danger { background:var(--red); } button.ok { background:var(--green); } button.ghost { background:#e7edf2; color:var(--ink); }
    .toolbar { display:grid; grid-template-columns:1fr auto; gap:10px; margin-bottom:14px; } .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); gap:12px; }
    .card { display:grid; gap:8px; } .meta { color:var(--muted); font-size:13px; } .pill { display:inline-block; border:1px solid var(--line); border-radius:999px; padding:3px 8px; font-size:12px; }
    .section { margin-top:14px; } .relation { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin-bottom:14px; } .small { background:#f8fafb; border:1px solid var(--line); border-radius:8px; padding:10px; }
    .corr { border:1px solid var(--line); border-radius:8px; padding:12px; margin-bottom:10px; background:#fbfcfd; display:grid; gap:6px; }
    .corr .row { display:flex; justify-content:space-between; gap:10px; align-items:center; flex-wrap:wrap; }
    .tag { font-size:12px; border-radius:999px; padding:3px 10px; font-weight:700; }
    .tag.pending { background:#f6eccf; color:var(--amber); } .tag.approved { background:#d9ebe0; color:var(--green); } .tag.rejected { background:#f1d9d6; color:var(--red); }
    .corr .actions { display:flex; gap:8px; } .corr .actions input { padding:7px 9px; }
    .msg { min-height:20px; font-size:13px; margin-top:8px; } .msg.err { color:var(--red); } .msg.ok { color:var(--green); }
    .ringflow { font-weight:700; } .ringflow .old { color:var(--red); text-decoration:line-through; } .ringflow .new { color:var(--green); }
    @media (max-width:900px){ header{display:block;padding:18px 16px;} main{grid-template-columns:1fr;padding:16px;} .relation{grid-template-columns:1fr;} }
  </style>
</head>
<body>
  <header><div><h1>赛鸽血统环号登记站</h1><div class="meta">档案、血统、转让、归巢成绩与环号纠错</div></div><button id="reload">刷新</button></header>
  <main>
    <div>
      <form id="form">
        <h2>创建鸽只档案</h2>
        <label>足环号</label><input name="ringNo" required>
        <label>鸽主</label><input name="owner" required>
        <label>父鸽足环号</label><input name="fatherRing">
        <label>母鸽足环号</label><input name="motherRing">
        <label>羽色</label><input name="color" required>
        <label>出生棚号</label><input name="loft" required>
        <button>保存档案</button>
      </form>
      <form id="corrForm">
        <h2>档案纠错申请</h2>
        <div class="meta">原环录错时申请换号，提交后需核对才生效，旧环保留变更记录。</div>
        <label>原足环号 *</label><input name="oldRing" required placeholder="在册的当前环号">
        <label>新足环号 *</label><input name="newRing" required placeholder="未被别的鸽只占用">
        <label>纠错原因 *</label><textarea name="reason" required placeholder="如：棚册录入时错把 091 录成 061"></textarea>
        <label>来源说明 *</label><textarea name="source" required placeholder="如：原足环证、售鸽单据、鸽主书面确认"></textarea>
        <button>提交纠错申请</button>
        <div class="msg" id="corrMsg"></div>
      </form>
    </div>
    <section>
      <div class="toolbar"><input id="search" placeholder="输入原环或新环查询同一份血统"><button id="searchBtn">查询</button></div>
      <div class="panel" id="detail"></div>
      <div class="section panel">
        <h2>纠错核对</h2>
        <div id="corrections" class="meta">加载中…</div>
      </div>
      <h2 class="section">在册鸽只</h2>
      <div class="grid" id="cards"></div>
    </section>
  </main>
  <script>
    const form = document.querySelector("#form");
    const corrForm = document.querySelector("#corrForm");
    const corrMsg = document.querySelector("#corrMsg");
    const cards = document.querySelector("#cards");
    const detail = document.querySelector("#detail");
    const correctionsBox = document.querySelector("#corrections");
    const search = document.querySelector("#search");
    let pigeons = [];
    let corrections = [];
    async function api(path, options) {
      const res = await fetch(path, options && options.body ? { ...options, headers:{ "Content-Type":"application/json" } } : options);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "请求失败");
      return data;
    }
    function esc(value) {
      return String(value == null ? "" : value).replace(/[&<>"']/g, ch => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[ch]));
    }
    function day(value) { return value ? esc(String(value).slice(0, 10)) : ""; }
    function statusTag(status) {
      const text = { pending: "待核对", approved: "已核准换号", rejected: "已驳回" }[status] || status;
      return '<span class="tag ' + status + '">' + text + '</span>';
    }
    function renderCards() {
      cards.innerHTML = pigeons.map(p => {
        const oldRings = (p.ringChanges || []).map(c => c.from);
        return '<article class="card"><h3>' + esc(p.ringNo) + '</h3>'
          + (oldRings.length ? '<div class="meta">旧环：' + oldRings.map(esc).join("、") + '</div>' : '')
          + '<span class="pill">' + esc(p.owner) + '</span><div class="meta">' + esc(p.color) + ' · ' + esc(p.loft) + '</div>'
          + '<div>父：' + esc(p.fatherRing || "未登记") + '</div><div>母：' + esc(p.motherRing || "未登记") + '</div>'
          + '<label>录入转让</label><input data-to="' + esc(p.ringNo) + '" placeholder="新归属人"><button data-transfer="' + esc(p.ringNo) + '">保存转让</button>'
          + '<label>归巢成绩</label><input data-race="' + esc(p.ringNo) + '" placeholder="赛事/距离/名次，如200公里/200/6"><button data-score="' + esc(p.ringNo) + '">保存成绩</button></article>';
      }).join("");
      document.querySelectorAll("[data-transfer]").forEach(btn => btn.onclick = async () => {
        const ringNo = btn.dataset.transfer; const to = document.querySelector('[data-to="'+ringNo+'"]').value;
        await api('/api/pigeons/'+encodeURIComponent(ringNo)+'/transfers', { method:'POST', body: JSON.stringify({ to }) }); await load();
      });
      document.querySelectorAll("[data-score]").forEach(btn => btn.onclick = async () => {
        const ringNo = btn.dataset.score; const raw = document.querySelector('[data-race="'+ringNo+'"]').value.split("/");
        await api('/api/pigeons/'+encodeURIComponent(ringNo)+'/races', { method:'POST', body: JSON.stringify({ event: raw[0] || "未命名赛事", distance: Number(raw[1] || 0), rank: Number(raw[2] || 0) }) }); await load();
      });
    }
    function renderCorrections() {
      if (!corrections.length) { correctionsBox.innerHTML = '<p class="meta">暂无纠错申请。</p>'; return; }
      correctionsBox.innerHTML = corrections.map(c => {
        let html = '<div class="corr"><div class="row"><span class="ringflow"><span class="old">' + esc(c.oldRing) + '</span> → <span class="new">' + esc(c.newRing) + '</span></span>' + statusTag(c.status) + '</div>'
          + '<div class="meta">原因：' + esc(c.reason) + '</div><div class="meta">来源：' + esc(c.source) + '</div>'
          + '<div class="meta">提交：' + day(c.submittedAt) + (c.reviewedAt ? '　核对：' + day(c.reviewedAt) : '') + '</div>';
        if (c.status === "pending") {
          html += '<div class="actions"><input data-note="' + esc(c.id) + '" placeholder="核对备注（可选）"><button class="ok" data-approve="' + esc(c.id) + '">核准换号</button><button class="danger" data-reject="' + esc(c.id) + '">驳回</button></div>';
        } else {
          html += '<div class="meta">核对说明：' + esc(c.reviewNote || "") + '</div>';
          if (c.status === "approved" && c.result && c.result.updatedReferences && c.result.updatedReferences.length) {
            html += '<div class="meta">已同步子代引用：' + c.result.updatedReferences.map(r => esc(r.ringNo)).join("、") + '</div>';
          }
        }
        return html + '</div>';
      }).join("");
      document.querySelectorAll("[data-approve]").forEach(btn => btn.onclick = () => review(btn.dataset.approve, true, btn));
      document.querySelectorAll("[data-reject]").forEach(btn => btn.onclick = () => review(btn.dataset.reject, false, btn));
    }
    async function review(id, approved, btn) {
      const note = document.querySelector('[data-note="'+id+'"]').value;
      btn.disabled = true;
      try {
        await api('/api/corrections/'+encodeURIComponent(id)+'/review', { method:'POST', body: JSON.stringify({ approved, note }) });
        await load();
      } catch (error) { alert(error.message); btn.disabled = false; }
    }
    function renderRelation(data) {
      if (!data) { detail.innerHTML = '<h2>血统查询</h2><p class="meta">请输入原环或新环查看父母、子代、转让和成绩。</p>'; return; }
      const p = data.pigeon;
      const aliasNote = data.queriedRing && data.queriedRing !== p.ringNo
        ? '<div class="meta">查询环号 ' + esc(data.queriedRing) + ' 为旧环，当前环号 ' + esc(p.ringNo) + '，同一份血统。</div>' : '';
      const changes = (p.ringChanges || []).map(c =>
        '<div><span class="old">' + esc(c.from) + '</span> → <span class="new">' + esc(c.to) + '</span> <span class="meta">' + day(c.date) + ' ' + esc(c.reason) + '（来源：' + esc(c.source) + '）</span></div>'
      ).join("") || '<div class="meta">无环号变更</div>';
      detail.innerHTML = '<h2>' + esc(p.ringNo) + ' 血统档案</h2>' + aliasNote
        + '<div class="relation"><div class="small"><b>父鸽</b><br>' + esc(data.father?.ringNo || p.fatherRing || "未登记") + '</div><div class="small"><b>本鸽</b><br>' + esc(p.owner) + ' · ' + esc(p.color) + '</div><div class="small"><b>母鸽</b><br>' + esc(data.mother?.ringNo || p.motherRing || "未登记") + '</div></div>'
        + '<div><b>子代</b> ' + esc(data.children.map(c => c.ringNo).join("、") || "暂无") + '</div>'
        + '<div class="section"><b>环号变更记录</b>' + changes + '</div>'
        + '<div class="meta section">疫苗：' + esc(p.vaccines.map(v => v.name + "(" + day(v.date) + ")").join(" / ") || "暂无") + '</div>'
        + '<div class="meta">转让：' + esc(p.transfers.map(t => t.from+"→"+t.to).join(" / ") || "暂无") + '</div>'
        + '<div class="meta">归巢：' + esc(p.races.map(r => r.event+" 第"+r.rank+"名").join(" / ") || "暂无") + '</div>';
    }
    async function load(){
      pigeons = await api("/api/pigeons");
      corrections = await api("/api/corrections");
      renderCards(); renderCorrections(); renderRelation(null);
    }
    document.querySelector("#searchBtn").onclick = async () => {
      try { renderRelation(await api('/api/pigeons/'+encodeURIComponent(search.value.trim())+'/relation')); }
      catch (error) { detail.innerHTML = '<h2>血统查询</h2><p class="meta">' + esc(error.message) + '</p>'; }
    };
    document.querySelector("#reload").onclick = load;
    form.onsubmit = async event => {
      event.preventDefault();
      await api("/api/pigeons", { method:"POST", body: JSON.stringify(Object.fromEntries(new FormData(form).entries())) });
      form.reset(); await load();
    };
    corrForm.onsubmit = async event => {
      event.preventDefault();
      corrMsg.className = "msg"; corrMsg.textContent = "";
      try {
        await api("/api/corrections", { method:"POST", body: JSON.stringify(Object.fromEntries(new FormData(corrForm).entries())) });
        corrForm.reset(); corrMsg.className = "msg ok"; corrMsg.textContent = "纠错申请已提交，等待核对。";
        await load();
      } catch (error) { corrMsg.className = "msg err"; corrMsg.textContent = error.message; }
    };
    load();
  </script>
</body>
</html>`;

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const db = await loadDb();
    if (req.method === "GET" && url.pathname === "/") {
      res.writeHead(200, { "Content-Type":"text/html; charset=utf-8" });
      return res.end(page);
    }
    if (req.method === "GET" && url.pathname === "/api/pigeons") return sendJson(res, 200, listPigeons(db));
    if (req.method === "GET" && url.pathname === "/api/corrections") return sendJson(res, 200, listCorrections(db));

    if (req.method === "POST" && url.pathname === "/api/pigeons") {
      const input = await body(req);
      const ringNo = String(input.ringNo || "").trim();
      if (!ringNo) return sendJson(res, 400, { error: "ring_no_required" });
      if (findPigeonByAnyRing(db, ringNo)) return sendJson(res, 409, { error: "ring_exists" });
      const pigeon = {
        ringNo,
        owner: input.owner,
        fatherRing: input.fatherRing || "",
        motherRing: input.motherRing || "",
        color: input.color,
        loft: input.loft,
        vaccines: [], transfers: [], races: [], ringChanges: []
      };
      db.pigeons.unshift(pigeon);
      await saveDb(db);
      return sendJson(res, 201, pigeon);
    }

    if (req.method === "POST" && url.pathname === "/api/corrections") {
      const result = await submitCorrection(db, await body(req));
      return result.error
        ? sendJson(res, 409, { error: result.error, code: result.code })
        : sendJson(res, 201, result.correction);
    }

    const reviewMatch = url.pathname.match(/^\/api\/corrections\/(.+)\/review$/);
    if (reviewMatch && req.method === "POST") {
      const input = await body(req);
      const result = await reviewCorrection(db, decodeURIComponent(reviewMatch[1]), input.approved !== false, input.note || "");
      return result.error
        ? sendJson(res, 409, { error: result.error, code: result.code })
        : sendJson(res, 200, result);
    }

    const relationMatch = url.pathname.match(/^\/api\/pigeons\/(.+)\/relation$/);
    if (relationMatch && req.method === "GET") {
      const data = relation(db, decodeURIComponent(relationMatch[1]));
      return data ? sendJson(res, 200, data) : sendJson(res, 404, { error: "pigeon_not_found" });
    }

    const actionMatch = url.pathname.match(/^\/api\/pigeons\/(.+)\/(transfers|races|vaccines)$/);
    if (actionMatch && req.method === "POST") {
      const pigeon = findPigeonByAnyRing(db, decodeURIComponent(actionMatch[1]));
      if (!pigeon) return sendJson(res, 404, { error: "pigeon_not_found" });
      const input = await body(req);
      if (actionMatch[2] === "transfers") {
        const transfer = { date: input.date || new Date().toISOString().slice(0, 10), from: pigeon.owner, to: input.to };
        pigeon.owner = input.to;
        pigeon.transfers.push(transfer);
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
