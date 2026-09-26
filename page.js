// 页面层：登记站单页（档案创建、血统查询、档案纠错提交与核对）。
export const page = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>赛鸽血统环号登记站</title>
  <style>
    :root { --bg:#eff2f5; --panel:#fff; --ink:#1f2833; --muted:#697786; --line:#d3dce4; --accent:#315f83; --red:#9b3f35; --green:#3a6b4f; --amber:#8a6d1f; }
    * { box-sizing:border-box; } body { margin:0; background:var(--bg); color:var(--ink); font-family:Arial,"PingFang SC",sans-serif; }
    header { padding:22px 28px; background:#fff; border-bottom:1px solid var(--line); display:flex; justify-content:space-between; gap:16px; align-items:center; }
    h1 { margin:0; font-size:26px; } h2 { margin:0 0 12px; font-size:18px; } h3 { margin:0; }
    main { display:grid; grid-template-columns:380px 1fr; gap:22px; padding:22px 28px; }
    form,.panel,.card { background:#fff; border:1px solid var(--line); border-radius:8px; padding:16px; }
    form + form { margin-top:16px; }
    label { display:block; margin:10px 0 5px; color:var(--muted); font-size:13px; } input,textarea,select { width:100%; border:1px solid var(--line); border-radius:6px; padding:9px; font:inherit; }
    button { border:0; border-radius:6px; background:var(--accent); color:#fff; padding:10px 13px; font-weight:700; cursor:pointer; }
    button.ghost { background:#eef3f7; color:var(--accent); border:1px solid var(--line); }
    button.danger { background:var(--red); }
    .toolbar { display:grid; grid-template-columns:1fr auto; gap:10px; margin-bottom:14px; } .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); gap:12px; }
    .card { display:grid; gap:8px; } .meta { color:var(--muted); font-size:13px; } .pill { display:inline-block; border:1px solid var(--line); border-radius:999px; padding:3px 8px; font-size:12px; }
    .section { margin-top:14px; } .relation { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin-bottom:14px; } .small { background:#f8fafb; border:1px solid var(--line); border-radius:8px; padding:10px; }
    .status { display:inline-block; border-radius:999px; padding:3px 10px; font-size:12px; font-weight:700; }
    .status.pending { background:#fdf6e3; color:var(--amber); border:1px solid #e6d9a8; }
    .status.applied { background:#eef7f1; color:var(--green); border:1px solid #bfe0cc; }
    .status.rejected { background:#f9eeee; color:var(--red); border:1px solid #e3c2bd; }
    .req { border:1px solid var(--line); border-radius:8px; padding:12px; margin-bottom:10px; display:grid; gap:6px; background:#fcfdfe; }
    .req .row { display:flex; justify-content:space-between; gap:10px; align-items:center; flex-wrap:wrap; }
    .actions { display:flex; gap:8px; }
    .toast { margin-bottom:10px; padding:10px 12px; border-radius:6px; font-size:13px; display:none; }
    .toast.ok { display:block; background:#eef7f1; color:var(--green); border:1px solid #bfe0cc; }
    .toast.err { display:block; background:#f9eeee; color:var(--red); border:1px solid #e3c2bd; }
    .history { background:#f6f8fa; border:1px dashed var(--line); border-radius:6px; padding:8px 10px; font-size:13px; margin-top:8px; }
    @media (max-width:900px){ header{display:block;padding:18px 16px;} main{grid-template-columns:1fr;padding:16px;} .relation{grid-template-columns:1fr;} }
  </style>
</head>
<body>
  <header><div><h1>赛鸽血统环号登记站</h1><div class="meta">档案、血统纠错、转让和归巢成绩</div></div><button id="reload">刷新</button></header>
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
      <form id="correctionForm">
        <h2>档案纠错（换号）</h2>
        <div class="meta">提交原环、新环、原因与来源说明；核对通过后才换号，旧环保留变更记录，父母子代引用一并指向新环，疫苗、转让、成绩继续保留。</div>
        <label>原足环号（录错的环号）</label><input name="oldRing" required>
        <label>新足环号（正确环号）</label><input name="newRing" required>
        <label>纠错原因</label><input name="reason" placeholder="如：报到时环号抄录错误" required>
        <label>来源说明</label><textarea name="sourceNote" rows="2" placeholder="如：验环照片/鸽主签字确认单编号" required></textarea>
        <button>提交纠错申请</button>
      </form>
    </div>
    <section>
      <div class="toast" id="toast"></div>
      <div class="toolbar"><input id="search" placeholder="输入原环号或新环号查询同一份血统"><button id="searchBtn">查询</button></div>
      <div class="panel" id="detail"></div>
      <div class="section panel">
        <h2>纠错单核对</h2>
        <div id="corrections" class="meta">加载中…</div>
      </div>
      <div class="section grid" id="cards"></div>
    </section>
  </main>
  <script>
    const form = document.querySelector("#form");
    const correctionForm = document.querySelector("#correctionForm");
    const cards = document.querySelector("#cards");
    const detail = document.querySelector("#detail");
    const correctionsBox = document.querySelector("#corrections");
    const search = document.querySelector("#search");
    const toast = document.querySelector("#toast");
    let pigeons = [];

    const ERROR_TEXT = {
      old_ring_required: "请填写原足环号",
      new_ring_required: "请填写新足环号",
      rings_must_differ: "原环与新环不能相同",
      reason_required: "请填写纠错原因",
      source_note_required: "请填写来源说明",
      old_ring_not_found: "原环号档案不存在",
      new_ring_occupied: "新环已被别的鸽只占用，拒绝提交，两边档案和履历均未改动",
      correction_already_pending: "同一环号纠错已在待核对队列中",
      correction_not_found: "纠错单不存在",
      correction_not_pending: "该纠错单已核对，不能重复操作",
      ring_exists: "足环号已存在",
      pigeon_not_found: "未找到该鸽只"
    };
    const esc = value => String(value ?? "").replace(/[&<>"']/g, ch => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[ch]));
    function showToast(ok, message) {
      toast.className = "toast " + (ok ? "ok" : "err");
      toast.textContent = message;
      clearTimeout(showToast.timer);
      showToast.timer = setTimeout(() => { toast.className = "toast"; }, 4500);
    }
    async function api(path, options) {
      const res = await fetch(path, options && options.body ? { ...options, headers: { "Content-Type": "application/json" } } : options);
      const data = await res.json();
      if (!res.ok) throw new Error(ERROR_TEXT[data.error] || data.error || "请求失败");
      return data;
    }

    function renderCards() {
      cards.innerHTML = pigeons.map(p => '<article class="card"><h3>'+esc(p.ringNo)+'</h3><span class="pill">'+esc(p.owner)+'</span><div class="meta">'+esc(p.color)+' · '+esc(p.loft)+'</div><div>父：'+esc(p.fatherRing || "未登记")+'</div><div>母：'+esc(p.motherRing || "未登记")+'</div>'
        + ((p.ringHistory||[]).length ? '<div class="meta">曾用环：'+p.ringHistory.map(h => esc(h.from)).join("、")+'</div>' : '')
        + '<label>录入转让</label><input data-to="'+esc(p.ringNo)+'" placeholder="新归属人"><button data-transfer="'+esc(p.ringNo)+'">保存转让</button>'
        + '<label>归巢成绩</label><input data-race="'+esc(p.ringNo)+'" placeholder="赛事/距离/名次，如200公里/200/6"><button data-score="'+esc(p.ringNo)+'">保存成绩</button>'
        + '</article>').join("");
      document.querySelectorAll("[data-transfer]").forEach(btn => btn.onclick = async () => {
        const ringNo = btn.dataset.transfer;
        const to = document.querySelector('[data-to="'+CSS.escape(ringNo)+'"]').value;
        try { await api('/api/pigeons/'+encodeURIComponent(ringNo)+'/transfers', { method:'POST', body: JSON.stringify({ to }) }); await load(); }
        catch (e) { showToast(false, e.message); }
      });
      document.querySelectorAll("[data-score]").forEach(btn => btn.onclick = async () => {
        const ringNo = btn.dataset.score;
        const raw = document.querySelector('[data-race="'+CSS.escape(ringNo)+'"]').value.split("/");
        try {
          await api('/api/pigeons/'+encodeURIComponent(ringNo)+'/races', { method:'POST', body: JSON.stringify({ event: raw[0] || "未命名赛事", distance: Number(raw[1] || 0), rank: Number(raw[2] || 0) }) });
          await load();
        } catch (e) { showToast(false, e.message); }
      });
    }

    function renderRelation(data) {
      if (!data) { detail.innerHTML = '<h2>血统查询</h2><p class="meta">请输入原环号或新环号，查看父母、子代、变更记录、转让和成绩。</p>'; return; }
      const p = data.pigeon;
      const history = (p.ringHistory || []).map(h =>
        '<div class="history">环号变更：'+esc(h.from)+' → '+esc(h.to)+'（'+esc(h.date)+'）<br>原因：'+esc(h.reason)+'<br>来源：'+esc(h.sourceNote)+'</div>'
      ).join("");
      detail.innerHTML = '<h2>'+esc(p.ringNo)+' 血统档案'+(data.matchedBy === "history" ? ' <span class="pill">按旧环查到同一档案</span>' : '')+'</h2>'
        + '<div class="relation"><div class="small"><b>父鸽</b><br>'+esc(data.father?.ringNo || p.fatherRing || "未登记")+'</div>'
        + '<div class="small"><b>本鸽</b><br>'+esc(p.owner)+' · '+esc(p.color)+'</div>'
        + '<div class="small"><b>母鸽</b><br>'+esc(data.mother?.ringNo || p.motherRing || "未登记")+'</div></div>'
        + '<div><b>子代</b> '+esc(data.children.map(c => c.ringNo).join("、") || "暂无")+'</div>'
        + '<div class="meta">疫苗：'+esc(p.vaccines.map(v => v.date+" "+v.name).join(" / ") || "暂无")+'</div>'
        + '<div class="meta">转让：'+esc(p.transfers.map(t => t.from+"→"+t.to).join(" / ") || "暂无")+'</div>'
        + '<div class="meta">归巢：'+esc(p.races.map(r => r.event+" 第"+r.rank+"名").join(" / ") || "暂无")+'</div>'
        + history;
    }

    async function review(id, action) {
      const reviewer = document.querySelector('[data-reviewer="'+CSS.escape(id)+'"]').value;
      const reviewNote = document.querySelector('[data-note="'+CSS.escape(id)+'"]').value;
      try {
        await api('/api/corrections/'+encodeURIComponent(id)+'/'+action, { method:'POST', body: JSON.stringify({ reviewer, reviewNote }) });
        showToast(true, action === "approve" ? "核对通过，已换号并保留旧环变更记录" : "已驳回，两边档案和履历均未改动");
        await load();
        renderRelation(await api('/api/pigeons/'+encodeURIComponent(search.value)+'/relation').catch(() => null));
      } catch (e) { showToast(false, e.message); }
    }

    async function renderCorrections() {
      const list = await api("/api/corrections");
      if (!list.length) { correctionsBox.className = "meta"; correctionsBox.textContent = "暂无纠错单"; return; }
      correctionsBox.className = "";
      correctionsBox.innerHTML = list.map(r =>
        '<div class="req"><div class="row"><b>'+esc(r.oldRing)+' → '+esc(r.newRing)+'</b><span class="status '+r.status+'">'+({pending:"待核对",applied:"已换号",rejected:"已驳回"}[r.status])+'</span></div>'
        + '<div class="meta">提交：'+esc(r.submittedAt)+'　原因：'+esc(r.reason)+'<br>来源说明：'+esc(r.sourceNote)+(r.reviewer ? '<br>核对人：'+esc(r.reviewer)+'　'+esc(r.reviewNote || "") : '')+'</div>'
        + (r.status === "pending" ? '<label>核对人</label><input data-reviewer="'+esc(r.id)+'" placeholder="核对人姓名"><label>核对备注（可选）</label><input data-note="'+esc(r.id)+'" placeholder="如：与验环照片一致"><div class="actions"><button data-approve="'+esc(r.id)+'">核对通过并换号</button><button class="danger" data-reject="'+esc(r.id)+'">驳回</button></div>' : '')
        + '</div>'
      ).join("");
      document.querySelectorAll("[data-approve]").forEach(btn => btn.onclick = () => review(btn.dataset.approve, "approve"));
      document.querySelectorAll("[data-reject]").forEach(btn => btn.onclick = () => review(btn.dataset.reject, "reject"));
    }

    async function load() {
      pigeons = await api("/api/pigeons");
      renderCards();
      await renderCorrections();
    }
    document.querySelector("#searchBtn").onclick = async () => {
      if (!search.value.trim()) return renderRelation(null);
      try { renderRelation(await api('/api/pigeons/'+encodeURIComponent(search.value.trim())+'/relation')); }
      catch (e) { renderRelation(null); showToast(false, e.message); }
    };
    document.querySelector("#reload").onclick = load;
    form.onsubmit = async event => {
      event.preventDefault();
      try {
        await api("/api/pigeons", { method:"POST", body: JSON.stringify(Object.fromEntries(new FormData(form).entries())) });
        form.reset(); await load(); showToast(true, "档案已创建");
      } catch (e) { showToast(false, e.message); }
    };
    correctionForm.onsubmit = async event => {
      event.preventDefault();
      try {
        await api("/api/corrections", { method:"POST", body: JSON.stringify(Object.fromEntries(new FormData(correctionForm).entries())) });
        correctionForm.reset(); await load(); showToast(true, "纠错申请已提交，等待核对");
      } catch (e) { showToast(false, e.message); }
    };
    load();
  </script>
</body>
</html>`;
