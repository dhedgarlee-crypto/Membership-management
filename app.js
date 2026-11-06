(() => {
  "use strict";

  const STORAGE_KEY = "membership-benefits:v1";
  const PERIOD_LABEL = { monthly: "매월", quarterly: "분기", yearly: "연간", always: "상시" };
  const COLORS = ["#c9a54a", "#1f3a5f", "#1c1c1e", "#3b5bdb", "#9bc31c", "#e8344e", "#da291c", "#3617ce", "#0ca678", "#f08c00", "#868e96", "#d6336c"];

  // ---------- 저장소 ----------
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return normalize(JSON.parse(raw));
    } catch (e) { console.warn("load failed", e); }
    return normalize(clone(window.SEED_DATA));
  }
  function normalize(s) {
    s.items ||= []; s.benefits ||= []; s.logs ||= []; s.spend ||= {}; s.dismissed ||= {};
    s.transactions ||= [];
    s.settings ||= {};
    if (!("applePayItemId" in s.settings)) s.settings.applePayItemId = window.SEED_DATA.settings.applePayItemId;
    const seedB = Object.fromEntries(window.SEED_DATA.benefits.map(b => [b.id, b]));
    s.items.forEach(i => { i.tiers ||= []; });
    s.benefits.forEach(b => {
      b.tierLimits ||= [];
      // 이전 버전 데이터: 예시 혜택에 가맹점 키워드·적립률 채우기
      if (!b.merchants) b.merchants = seedB[b.id]?.merchants ? [...seedB[b.id].merchants] : [];
      if (b.pointPer1000 === undefined) b.pointPer1000 = seedB[b.id]?.pointPer1000 ?? null;
    });
    return s;
  }
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch (e) { toast("저장 실패: 저장 공간을 확인하세요"); }
  }

  let state = load();
  const today = new Date();
  let view = { tab: "month", ym: ymOf(today) };

  // ---------- 날짜/금액 유틸 ----------
  function pad(n) { return String(n).padStart(2, "0"); }
  function ymOf(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; }
  function dateStr(d) { return `${ymOf(d)}-${pad(d.getDate())}`; }
  function parseYm(ym) { const [y, m] = ym.split("-").map(Number); return { y, m }; }
  function addMonths(ym, n) { const { y, m } = parseYm(ym); return ymOf(new Date(y, m - 1 + n, 1)); }
  function lastDay(ym) { const { y, m } = parseYm(ym); return new Date(y, m, 0).getDate(); }
  function periodKey(period, ymOrDate) {
    const { y, m } = parseYm(ymOrDate.slice(0, 7));
    if (period === "yearly") return `${y}`;
    if (period === "quarterly") return `${y}-Q${Math.ceil(m / 3)}`;
    return `${y}-${pad(m)}`; // monthly, always
  }
  function periodEndsIn(period, ym) {
    const { m } = parseYm(ym);
    if (period === "monthly") return true;
    if (period === "quarterly") return m % 3 === 0;
    if (period === "yearly") return m === 12;
    return false;
  }
  function won(n) { return `${Math.round(n || 0).toLocaleString("ko-KR")}원`; }
  function compactWon(n) {
    if (n >= 10000) { const v = n / 10000; return `${Number.isInteger(v) ? v : v.toFixed(1)}만`; }
    return n.toLocaleString("ko-KR");
  }
  function uid() { return (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random())).slice(0, 12); }
  function esc(s) { return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
  function num(v) { const n = Number(String(v ?? "").replace(/[^\d.-]/g, "")); return Number.isFinite(n) ? n : 0; }
  function numOrNull(v) { return String(v ?? "").trim() === "" ? null : num(v); }

  // ---------- 계산 ----------
  const itemById = id => state.items.find(i => i.id === id);
  const benefitsOf = itemId => state.benefits.filter(b => b.itemId === itemId);
  function manualSpend(ym, itemId) { const v = state.spend[ym]?.[itemId]; return v === undefined || v === null ? null : v; }
  function txOf(ym, itemId) { return state.transactions.filter(t => t.date.startsWith(ym) && (!itemId || t.itemId === itemId)); }
  function autoSpend(ym, itemId) { return txOf(ym, itemId).filter(t => !t.foreign).reduce((s, t) => s + t.amount, 0); }
  // 실적 = 자동 기록(원화) + 직접 입력분. 둘 다 없으면 null(미입력)
  function getSpend(ym, itemId) {
    const manual = manualSpend(ym, itemId);
    const hasTx = txOf(ym, itemId).some(t => !t.foreign);
    if (manual === null && !hasTx) return null;
    return (manual || 0) + autoSpend(ym, itemId);
  }

  // ---------- 가맹점 → 혜택 매칭 ----------
  function matchesBenefit(b, tx) {
    if (!b.merchants?.length) return false;
    const m = (tx.merchant || "").toUpperCase().replace(/\s+/g, "");
    return b.merchants.some(k => k === "@해외" ? tx.foreign : k && m.includes(k.toUpperCase().replace(/\s+/g, "")));
  }
  function matchedBenefits(tx) { return state.benefits.filter(b => matchesBenefit(b, tx)); }

  // 카드별 예상 포인트: 기본적립(키워드 없음)은 전체, 특별적립(키워드 있음)은 매칭된 결제만
  function pointEstimate(item, ym) {
    const rules = benefitsOf(item.id).filter(b => b.pointPer1000);
    if (!rules.length) return null;
    const txs = txOf(ym, item.id).filter(t => !t.foreign);
    const total = getSpend(ym, item.id) || 0;
    let points = 0, specialAmount = 0, specialMissed = false;
    const prev = getSpend(addMonths(ym, -1), item.id);
    for (const b of rules) {
      const eligible = !b.minSpend || (prev !== null && prev >= b.minSpend);
      if (!b.merchants.length) { points += Math.floor(total / 1000) * b.pointPer1000; continue; }
      const amt = txs.filter(t => matchesBenefit(b, t)).reduce((s, t) => s + t.amount, 0);
      specialAmount += amt;
      if (eligible) points += Math.floor(amt / 1000) * b.pointPer1000; else if (amt) specialMissed = true;
    }
    return { points, specialAmount, specialMissed };
  }
  function specialTxInfo(item, ym) {
    const special = benefitsOf(item.id).filter(b => b.merchants.length && b.period === "always");
    if (!special.length) return null;
    const txs = txOf(ym, item.id);
    const hits = txs.filter(t => special.some(b => matchesBenefit(b, t)));
    return { count: hits.length, amount: hits.filter(t => !t.foreign).reduce((s, t) => s + t.amount, 0), foreign: hits.filter(t => t.foreign).length };
  }

  // ---------- 결제 내역 가져오기 ----------
  // 한 줄에 한 건: 날짜|금액|가맹점|카드  (단축어가 만드는 형식, 순서는 유연하게 처리)
  function parseAmount(str) {
    const s = String(str || "").trim();
    const foreign = /[$€£¥]|USD|EUR|JPY|CNY|GBP|THB|VND|TWD|HKD|SGD/i.test(s) && !/[₩원]|KRW/i.test(s);
    const n = Number(s.replace(/[^\d.]/g, ""));
    return { amount: Number.isFinite(n) ? (foreign ? n : Math.round(n)) : 0, foreign, raw: s };
  }
  function parseDate(str) {
    const s = String(str || "");
    let m = s.match(/(\d{4})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})/);
    const t = s.match(/(\d{1,2}):(\d{2})/);
    if (!m) return null;
    let h = t ? Number(t[1]) : 0;
    if (t && /오후|PM/i.test(s) && h < 12) h += 12;
    if (t && /오전|AM/i.test(s) && h === 12) h = 0;
    return { date: `${m[1]}-${pad(m[2])}-${pad(m[3])}`, time: t ? `${pad(h)}:${t[2]}` : "" };
  }
  function cardFor(name) {
    const n = String(name || "").toUpperCase().replace(/\s+/g, "");
    if (n) {
      const hit = state.items.find(i => i.type === "card" && (n.includes(i.name.toUpperCase().replace(/\s+/g, "")) || (i.issuer && n.includes(i.issuer.replace(/카드$/, "").toUpperCase()))));
      if (hit) return hit.id;
    }
    return state.settings.applePayItemId || state.items.find(i => i.type === "card")?.id;
  }
  function parseTransactions(text) {
    const out = [];
    for (const rawLine of String(text || "").split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line) continue;
      const parts = line.split("|").map(x => x.trim());
      if (parts.length < 2) continue;
      // 날짜·금액이 든 칸을 찾아서 나머지를 가맹점/카드로
      let dIdx = parts.findIndex(p => parseDate(p));
      let aIdx = parts.findIndex((p, i) => i !== dIdx && /\d/.test(p) && /[₩원$€£¥]|KRW|USD|^[\d,.\s]+$/i.test(p));
      if (aIdx < 0) continue;
      const rest = parts.filter((_, i) => i !== dIdx && i !== aIdx);
      const d = dIdx >= 0 ? parseDate(parts[dIdx]) : { date: dateStr(new Date()), time: "" };
      const a = parseAmount(parts[aIdx]);
      if (!a.amount) continue;
      out.push({ date: d.date, time: d.time, amount: a.amount, foreign: a.foreign, amountRaw: a.raw, merchant: rest[0] || "", card: rest[1] || "" });
    }
    return out;
  }
  function txKey(t) { return `${t.date} ${t.time}|${t.amountRaw || t.amount}|${t.merchant}`; }
  function importTransactions(text) {
    const parsed = parseTransactions(text);
    const existing = new Set(state.transactions.map(txKey));
    const added = [];
    for (const p of parsed) {
      if (existing.has(txKey(p))) continue;
      const tx = { id: uid(), itemId: cardFor(p.card), date: p.date, time: p.time, amount: p.amount, foreign: p.foreign, amountRaw: p.amountRaw, merchant: p.merchant, source: "applepay" };
      state.transactions.push(tx); existing.add(txKey(tx)); added.push(tx);
    }
    save();
    return { added, dup: parsed.length - added.length, total: parsed.length };
  }

  function tierFor(item, spend) {
    if (spend === null) return null;
    let hit = null;
    for (const t of [...item.tiers].sort((a, b) => a.min - b.min)) if (spend >= t.min) hit = t;
    return hit;
  }

  function benefitStatus(b, ym) {
    const item = itemById(b.itemId);
    const key = periodKey(b.period, ym);
    const logs = state.logs.filter(l => l.benefitId === b.id && periodKey(b.period, l.date) === key);
    const count = logs.length;
    const saved = logs.reduce((s, l) => s + (l.saved || 0), 0);
    const prevSpend = getSpend(addMonths(ym, -1), b.itemId);

    let eligible = true;          // true | false | null(미입력)
    if (b.minSpend) eligible = prevSpend === null ? null : prevSpend >= b.minSpend;

    let amountLimit = b.limitAmount || null;
    let amountLimitRange = null;
    if (b.tierLimits.length) {
      const sorted = [...b.tierLimits].sort((a, c) => a.min - c.min);
      if (prevSpend === null) amountLimitRange = [sorted[0].amount, sorted[sorted.length - 1].amount];
      else { amountLimit = 0; for (const t of sorted) if (prevSpend >= t.min) amountLimit = t.amount; }
    }

    let done = false;
    if (b.period !== "always") {
      if (b.limitCount) done = count >= b.limitCount;
      else if (amountLimit) done = saved >= amountLimit;
    }
    const used = count > 0;
    return { item, logs, count, saved, prevSpend, eligible, amountLimit, amountLimitRange, done, used, key };
  }

  function monthLogs(ym) { return state.logs.filter(l => l.date.startsWith(ym)); }
  function savedIn(prefix, itemId) {
    return state.logs.filter(l => l.date.startsWith(prefix) && (!itemId || benefitById(l.benefitId)?.itemId === itemId))
      .reduce((s, l) => s + (l.saved || 0), 0);
  }
  const benefitById = id => state.benefits.find(b => b.id === id);

  // ---------- 렌더링 ----------
  const $app = document.getElementById("app");
  const $month = document.getElementById("month-label");

  function render() {
    const { y, m } = parseYm(view.ym);
    $month.textContent = `${y}년 ${m}월`;
    document.querySelectorAll(".tabbar button").forEach(b => b.classList.toggle("on", b.dataset.tab === view.tab));
    document.getElementById("month-nav").style.visibility = view.tab === "manage" ? "hidden" : "visible";
    if (view.tab === "month") $app.innerHTML = renderMonth();
    else if (view.tab === "history") $app.innerHTML = renderHistory();
    else $app.innerHTML = renderManage();
  }

  function renderMonth() {
    const ym = view.ym;
    const { y, m } = parseYm(ym);
    const trackable = state.benefits.filter(b => b.period !== "always");
    const statuses = trackable.map(b => ({ b, s: benefitStatus(b, ym) }));
    const usable = statuses.filter(x => x.s.eligible !== false);
    const usedCount = usable.filter(x => x.s.used).length;
    const expiring = usable.filter(x => !x.s.done && periodEndsIn(x.b.period, ym));
    const monthSaved = savedIn(ym);
    const yearSaved = savedIn(String(y));
    const totalFee = state.items.reduce((s, i) => s + (i.annualFee || 0), 0);

    let html = `<section class="summary">
      <div class="stat"><div class="k">이번 달 아낀 금액</div><div class="v">${won(monthSaved)}</div><div class="s">${monthLogs(ym).length}건 기록</div></div>
      <div class="stat"><div class="k">혜택 사용</div><div class="v">${usedCount}<span style="font-size:15px;color:var(--text-3)"> / ${usable.length}</span></div><div class="s">사용 가능한 혜택 기준</div></div>
      <div class="stat"><div class="k">이번 달 놓치면 소멸</div><div class="v" style="color:${expiring.length ? "var(--warn)" : "inherit"}">${expiring.length}개</div><div class="s">${m}월 말 기준</div></div>
      <div class="stat"><div class="k">${y}년 연회비 회수</div><div class="v">${totalFee ? Math.round((yearSaved / totalFee) * 100) + "%" : "–"}</div><div class="s">${won(yearSaved)} / ${totalFee ? won(totalFee) : "연회비 미입력"}</div></div>
    </section>`;

    // 알림
    const alerts = [];
    if (state.items.some(i => i.verify) && !state.dismissed.verifyBanner) {
      alerts.push(`<div class="alert info"><span>ℹ️</span><span><b>"확인 필요"</b> 표시된 혜택은 기사 기준 예시예요. <b>관리</b> 탭에서 실제 조건으로 고쳐 주세요.</span><button class="x" data-action="dismiss" data-key="verifyBanner" aria-label="닫기">✕</button></div>`);
    }
    state.items.filter(i => i.feeMonth === m).forEach(i => {
      alerts.push(`<div class="alert"><span>💳</span><span><b>${esc(i.name)}</b> 연회비 ${i.annualFee ? won(i.annualFee) + " " : ""}청구 예정 달이에요.</span></div>`);
    });
    // 연간 혜택 미사용 (10월부터 알림)
    if (m >= 10) {
      state.benefits.filter(b => b.period === "yearly" && (b.limitCount || b.limitAmount)).forEach(b => {
        const s = benefitStatus(b, ym);
        if (s.done || s.eligible === false) return;
        const left = b.limitCount ? `${b.limitCount - s.count}회` : won(b.limitAmount - s.saved);
        alerts.push(`<div class="alert"><span>⏰</span><span><b>${esc(s.item.name)} ${esc(b.name)}</b> ${left} 남음 · 올해 ${12 - m === 0 ? "이번 달" : `${12 - m + 1}개월`} 안에 사용하세요.</span></div>`);
      });
    }
    if (ym === ymOf(today)) {
      const daysLeft = lastDay(ym) - today.getDate();
      state.items.filter(i => i.type === "card" && i.tiers.length).forEach(i => {
        const sp = getSpend(ym, i.id);
        if (sp === null) return;
        const next = [...i.tiers].sort((a, b) => a.min - b.min).find(t => sp < t.min);
        if (next && next.min - sp <= Math.max(300000, next.min * 0.3)) {
          alerts.push(`<div class="alert"><span>📈</span><span><b>${esc(i.name)}</b> 다음 달 "${esc(next.label)}"까지 <b>${won(next.min - sp)}</b> 남았어요 (D-${daysLeft}).</span></div>`);
        }
      });
    }
    if (alerts.length) html += `<div class="alerts">${alerts.join("")}</div>`;

    // 카드/멤버십별
    const cards = state.items.filter(i => i.type === "card");
    const members = state.items.filter(i => i.type !== "card");
    if (cards.length) html += `<div class="section-title"><span>카드</span></div><div class="grid">${cards.map(i => renderItemMonth(i, ym)).join("")}</div>`;
    if (members.length) html += `<div class="section-title"><span>멤버십</span></div><div class="grid">${members.map(i => renderItemMonth(i, ym)).join("")}</div>`;
    if (!state.items.length) html += `<div class="empty">관리 탭에서 카드나 멤버십을 추가해 주세요.</div>`;
    return html;
  }

  function chip(item) {
    if (item.type === "card") return `<div class="chip-card" style="background:linear-gradient(135deg, ${esc(item.color)}, ${esc(item.color)}cc)"></div>`;
    return `<div class="chip-member" style="background:${esc(item.color)}">${esc(item.name.trim().charAt(0))}</div>`;
  }

  function renderItemMonth(item, ym) {
    const saved = savedIn(ym, item.id);
    const list = benefitsOf(item.id)
      .map(b => ({ b, s: benefitStatus(b, ym) }))
      .sort((a, c) => rank(a) - rank(c));

    let spendHtml = "";
    if (item.type === "card") {
      const sp = getSpend(ym, item.id);
      const prev = getSpend(addMonths(ym, -1), item.id);
      const prevTier = tierFor(item, prev);
      const curTier = tierFor(item, sp);
      const maxTier = Math.max(...item.tiers.map(t => t.min), 0);
      const scale = Math.max(maxTier * 1.15, sp || 0, 1);
      const ticks = item.tiers.map(t => `<div class="tick" style="left:${(t.min / scale) * 100}%"></div>`).join("");
      const labels = item.tiers.map(t => `<span class="${sp !== null && sp >= t.min ? "hit" : ""}" style="left:${Math.min((t.min / scale) * 100, 92)}%">${compactWon(t.min)}</span>`).join("");
      const txs = txOf(ym, item.id);
      const manual = manualSpend(ym, item.id);
      const auto = autoSpend(ym, item.id);
      const isPay = state.settings.applePayItemId === item.id;
      const est = pointEstimate(item, ym);
      const sp_ = specialTxInfo(item, ym);
      const inputHtml = `<input class="spend-input" inputmode="numeric" placeholder="입력" data-action="spend" data-item="${item.id}" value="${manual === null ? "" : manual.toLocaleString("ko-KR")}">`;
      const autoHtml = txs.length || isPay ? `<div class="pay-box">
          <div class="pay-row"><span>Apple Pay 자동</span><b>${won(auto)}</b><span class="muted">${txs.length}건${txs.some(t => t.foreign) ? ` (해외 ${txs.filter(t => t.foreign).length}건 별도)` : ""}</span></div>
          ${sp_ ? `<div class="pay-row"><span>특별적립 대상</span><b>${won(sp_.amount)}</b><span class="muted">${sp_.count}건${sp_.foreign ? ` · 해외 ${sp_.foreign}` : ""}</span></div>` : ""}
          ${est ? `<div class="pay-row"><span>예상 적립</span><b>${est.points.toLocaleString("ko-KR")} P</b><span class="muted">${est.specialMissed ? "전월 실적 미달로 특별적립 제외" : "기록 기준 추정"}</span></div>` : ""}
          <button class="small-link" data-action="import-tx">결제 가져오기 ›</button>
        </div>` : "";
      spendHtml = `<div class="spend">
        ${txs.length || isPay
          ? `<div class="spend-row"><span>이번 달 이용금액</span><b class="spend-total">${sp === null ? "–" : won(sp)}</b></div>
             <div class="spend-row" style="margin-top:6px"><span class="muted">+ 직접 추가 (실물카드 결제 등)</span>${inputHtml}</div>`
          : `<div class="spend-row"><span>이번 달 이용금액</span>${inputHtml}</div>`}
        ${item.tiers.length ? `<div class="bar"><div class="fill" style="width:${Math.min(((sp || 0) / scale) * 100, 100)}%"></div>${ticks}</div><div class="tier-labels">${labels}</div>` : ""}
        <div class="spend-note">전월 ${prev === null ? "미입력" : won(prev)}${item.tiers.length ? ` → 이번 달 <b>${prevTier ? esc(prevTier.label) : prev === null ? "?" : "실적 미달"}</b> · 다음 달 ${curTier ? esc(curTier.label) : "미달"}` : ""}</div>
        ${autoHtml}
      </div>`;
    }

    return `<article class="item">
      <div class="item-head">${chip(item)}
        <div><div class="item-name">${esc(item.name)}</div><div class="item-sub">${esc(item.issuer || "")}${item.verify ? ` · <span class="tag warn">확인 필요</span>` : ""}</div></div>
        <div class="right">이번 달<b>${won(saved)}</b></div>
      </div>
      ${spendHtml}
      <div class="benefits">${list.map(x => renderBenefitRow(x.b, x.s)).join("") || `<div class="empty">등록된 혜택이 없어요</div>`}</div>
    </article>`;
  }

  function rank({ b, s }) {
    if (b.period === "always") return 3;
    if (s.eligible === false) return 4;
    if (s.done) return 2;
    return 1;
  }

  function renderBenefitRow(b, s) {
    const tags = [`<span class="tag">${PERIOD_LABEL[b.period]}</span>`];
    if (b.minSpend) {
      if (s.eligible === true) tags.push(`<span class="tag good">전월 ${compactWon(b.minSpend)}↑ 충족</span>`);
      else if (s.eligible === false) tags.push(`<span class="tag bad">전월 ${compactWon(b.minSpend)} 미달</span>`);
      else tags.push(`<span class="tag warn">전월 ${compactWon(b.minSpend)}↑ 필요</span>`);
    }
    if (b.period !== "always") {
      if (b.limitCount) tags.push(`<span class="tag accent">${s.count}/${b.limitCount}회</span>`);
      if (s.amountLimit) tags.push(`<span class="tag accent">${won(s.saved)} / ${won(s.amountLimit)}</span>`);
      else if (s.amountLimitRange) tags.push(`<span class="tag accent">한도 ${compactWon(s.amountLimitRange[0])}~${compactWon(s.amountLimitRange[1])}</span>`);
      if (!s.done && b.period !== "monthly" && periodEndsIn(b.period, view.ym)) tags.push(`<span class="tag warn">이번 달 소멸</span>`);
    } else if (s.saved) {
      tags.push(`<span class="tag good">${won(s.saved)}</span>`);
    }
    if (b.verify) tags.push(`<span class="tag warn">확인 필요</span>`);

    let progress = "";
    if (s.amountLimit && b.period !== "always") progress = `<div class="progress-mini"><div style="width:${Math.min((s.saved / s.amountLimit) * 100, 100)}%"></div></div>`;

    let btnLabel = "사용";
    if (b.period === "always") btnLabel = s.count ? `+기록 ${s.count}` : "+기록";
    else if (s.done) btnLabel = "완료 ✓";
    else if (b.limitCount && b.limitCount > 1) btnLabel = `사용 ${s.count}/${b.limitCount}`;
    else if (s.used) btnLabel = `+사용`;

    const cls = ["benefit", s.done ? "done" : "", b.period === "always" ? "always" : ""].join(" ");
    return `<div class="${cls}">
      <div class="main"><div class="name">${esc(b.name)}</div>${b.desc ? `<div class="desc">${esc(b.desc)}</div>` : ""}<div class="meta">${tags.join("")}</div>${progress}</div>
      <button class="use-btn ${s.done ? "done" : ""}" data-action="use" data-benefit="${b.id}">${btnLabel}</button>
    </div>`;
  }

  function renderHistory() {
    const ym = view.ym;
    const { y, m } = parseYm(ym);
    const months = Array.from({ length: 6 }, (_, i) => addMonths(ym, i - 5));
    const values = months.map(mm => savedIn(mm));
    const max = Math.max(...values, 1);
    const chart = months.map((mm, i) => `<div class="col ${mm === ym ? "cur" : ""}">
      <div class="n">${values[i] ? compactWon(values[i]) : ""}</div>
      <div class="b" style="height:${(values[i] / max) * 100}%"></div>
      <div class="m">${parseYm(mm).m}월</div></div>`).join("");

    const roi = state.items.map(i => {
      const s = savedIn(String(y), i.id);
      const pct = i.annualFee ? Math.min((s / i.annualFee) * 100, 100) : null;
      return `<div class="roi-row"><div class="nm">${esc(i.name)}</div>
        <div class="val">${won(s)}${i.annualFee ? ` / 연회비 ${won(i.annualFee)}` : ""}</div>
        ${pct !== null ? `<div class="bar"><div class="fill" style="width:${pct}%;background:${pct >= 100 ? "var(--good)" : "var(--accent)"}"></div></div>` : ""}</div>`;
    }).join("");

    const logs = monthLogs(ym).sort((a, b) => b.date.localeCompare(a.date));
    const logHtml = logs.length ? logs.map(l => {
      const b = benefitById(l.benefitId); const it = b && itemById(b.itemId);
      return `<div class="log-row"><div class="d">${Number(l.date.slice(5, 7))}/${Number(l.date.slice(8))}</div>
        <div class="t">${esc(b ? b.name : "(삭제된 혜택)")}<small>${esc(it ? it.name : "")}${l.memo ? " · " + esc(l.memo) : ""}</small></div>
        <div class="a">${l.saved ? won(l.saved) : ""}</div>
        <button class="icon-btn" data-action="del-log" data-log="${l.id}" aria-label="삭제">🗑</button></div>`;
    }).join("") : `<div class="empty">${m}월 사용 기록이 없어요</div>`;

    const txs = txOf(ym).sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
    const txHtml = txs.length ? txs.map(t => {
      const it = itemById(t.itemId);
      const mb = matchedBenefits(t);
      return `<div class="log-row"><div class="d">${Number(t.date.slice(5, 7))}/${Number(t.date.slice(8))}</div>
        <div class="t">${esc(t.merchant || "(가맹점 없음)")}<small>${esc(it ? it.name : "")}${t.time ? " · " + t.time : ""}${mb.length ? " · " + mb.map(b => `<span class="tag accent">${esc(b.name)}</span>`).join(" ") : ""}</small></div>
        <div class="a" style="color:var(--text)">${t.foreign ? esc(t.amountRaw) : won(t.amount)}</div>
        <button class="icon-btn" data-action="del-tx" data-tx="${t.id}" aria-label="삭제">🗑</button></div>`;
    }).join("") : `<div class="empty">${m}월 결제 내역이 없어요<br><small>Apple Pay 단축어를 설정하면 자동으로 쌓여요</small></div>`;

    return `<div class="btn-row" style="margin-bottom:6px"><button class="btn primary" data-action="import-tx">결제 가져오기</button></div>
      <div class="section-title" style="margin-top:14px"><span>최근 6개월 아낀 금액</span></div>
      <div class="panel"><div class="chart">${chart}</div></div>
      <div class="section-title"><span>${y}년 누적 · 연회비 대비</span></div>
      <div class="panel">${roi || `<div class="empty">항목이 없어요</div>`}</div>
      <div class="section-title"><span>${m}월 사용 기록</span></div>
      <div class="panel">${logHtml}</div>
      <div class="section-title"><span>${m}월 결제 내역 (${txs.length}건)</span></div>
      <div class="panel">${txHtml}</div>`;
  }

  function renderManage() {
    const items = state.items.map(i => {
      const bs = benefitsOf(i.id);
      return `<article class="item manage-item">
        <div class="item-head" data-action="edit-item" data-item="${i.id}">${chip(i)}
          <div><div class="item-name">${esc(i.name)}</div><div class="item-sub">${esc(i.issuer || "")} · ${i.type === "card" ? "카드" : "멤버십"}${i.annualFee ? " · 연회비 " + won(i.annualFee) : ""}</div></div>
          <div class="right">편집 ›</div></div>
        ${bs.map(b => `<button class="row-btn" data-action="edit-benefit" data-benefit="${b.id}">
          <span>${esc(b.name)}${b.verify ? ` <span class="tag warn">확인 필요</span>` : ""}</span>
          <span class="sub">${PERIOD_LABEL[b.period]}${b.limitCount ? ` ${b.limitCount}회` : ""}${b.limitAmount ? ` ${compactWon(b.limitAmount)}` : ""} ›</span></button>`).join("")}
        <button class="row-btn add" data-action="new-benefit" data-item="${i.id}">＋ 혜택 추가</button>
      </article>`;
    }).join("");

    return `<div class="btn-row" style="margin-bottom:14px">
        <button class="btn primary" data-action="new-item" data-type="card">＋ 카드</button>
        <button class="btn primary" data-action="new-item" data-type="membership">＋ 멤버십</button></div>
      <div class="grid">${items}</div>
      <div class="section-title"><span>Apple Pay 자동 기록</span></div>
      <div class="panel">
        <label class="field"><span>Apple Pay에 등록된 카드 (카드 이름을 못 읽을 때 기본값)</span>
          <select id="applepay-card">${state.items.filter(i => i.type === "card").map(i => `<option value="${i.id}" ${state.settings.applePayItemId === i.id ? "selected" : ""}>${esc(i.issuer || "")} ${esc(i.name)}</option>`).join("")}</select></label>
        <div class="btn-row">
          <button class="btn" data-action="guide">단축어 설정 방법</button>
          <button class="btn" data-action="import-tx">결제 가져오기</button>
        </div>
      </div>
      <div class="section-title"><span>백업</span></div>
      <div class="panel">
        <p class="hint" style="margin:0 0 10px;font-size:13px;color:var(--text-2)">데이터는 이 기기의 브라우저에만 저장돼요. 휴대폰과 아이패드 사이에 옮기거나 백업하려면 내보내기를 이용하세요.</p>
        <div class="btn-row">
          <button class="btn" data-action="export">내보내기</button>
          <button class="btn" data-action="import">가져오기</button>
        </div>
        <div style="margin-top:8px"><button class="btn danger block" data-action="reset">처음 상태로 초기화</button></div>
      </div>`;
  }

  // ---------- 시트(모달) ----------
  let sheetEl = null;
  function openSheet(html, onMount) {
    closeSheet();
    sheetEl = document.createElement("div");
    sheetEl.className = "sheet-backdrop";
    sheetEl.innerHTML = `<div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div>${html}</div>`;
    sheetEl.addEventListener("click", e => { if (e.target === sheetEl) closeSheet(); });
    document.body.appendChild(sheetEl);
    document.body.style.overflow = "hidden";
    onMount && onMount(sheetEl.querySelector(".sheet"));
  }
  function closeSheet() { if (sheetEl) { sheetEl.remove(); sheetEl = null; document.body.style.overflow = ""; } }

  function defaultDate(ym) {
    if (ym === ymOf(today)) return dateStr(today);
    return ym < ymOf(today) ? `${ym}-${pad(lastDay(ym))}` : `${ym}-01`;
  }

  function openUseSheet(benefitId, prefill = {}, ym = view.ym) {
    const b = benefitById(benefitId); const item = itemById(b.itemId);
    const s = benefitStatus(b, ym);
    const periodText = b.period === "yearly" ? `${s.key}년` : b.period === "quarterly" ? s.key.replace("-Q", "년 ") + "분기" : `${parseYm(ym).m}월`;
    const existing = s.logs.sort((a, c) => c.date.localeCompare(a.date)).map(l => `<div class="log-row"><div class="d">${Number(l.date.slice(5, 7))}/${Number(l.date.slice(8))}</div>
      <div class="t">${l.memo ? esc(l.memo) : "사용"}</div><div class="a">${l.saved ? won(l.saved) : ""}</div>
      <button class="icon-btn" data-action="del-log" data-log="${l.id}" aria-label="삭제">🗑</button></div>`).join("");

    let remainHint = "";
    if (s.amountLimit) remainHint = `남은 한도 ${won(Math.max(s.amountLimit - s.saved, 0))}`;
    else if (b.limitCount) remainHint = `남은 횟수 ${Math.max(b.limitCount - s.count, 0)}회`;

    openSheet(`<h2>${esc(b.name)}</h2>
      <p class="hint">${esc(item.name)} · ${PERIOD_LABEL[b.period]}${b.period !== "always" ? ` · ${periodText}` : ""}${remainHint ? " · " + remainHint : ""}</p>
      <form id="use-form">
        <div class="field-row">
          <label class="field"><span>날짜</span><input type="date" name="date" value="${prefill.date || defaultDate(ym)}" required></label>
          <label class="field"><span>아낀 금액 (선택)</span><input name="saved" inputmode="numeric" placeholder="0"></label>
        </div>
        <div class="quick-amounts">${[1000, 3000, 5000, 10000, 30000].map(v => `<button type="button" data-q="${v}">+${compactWon(v)}</button>`).join("")}${s.amountLimit && s.amountLimit > s.saved ? `<button type="button" data-set="${s.amountLimit - s.saved}">남은 한도 전부</button>` : ""}</div>
        <label class="field" style="margin-top:12px"><span>메모 (선택)</span><input name="memo" value="${esc(prefill.memo || "")}" placeholder="예: 스타벅스, 인천공항 T2"></label>
        <button class="btn primary block" type="submit">기록하기</button>
      </form>
      ${existing ? `<div class="section-title"><span>이번 기간 기록</span></div><div>${existing}</div>` : ""}`, root => {
      const form = root.querySelector("#use-form");
      const savedInput = form.elements.saved;
      root.querySelectorAll("[data-q]").forEach(btn => btn.addEventListener("click", () => {
        savedInput.value = (num(savedInput.value) + Number(btn.dataset.q)).toLocaleString("ko-KR");
      }));
      root.querySelectorAll("[data-set]").forEach(btn => btn.addEventListener("click", () => {
        savedInput.value = Number(btn.dataset.set).toLocaleString("ko-KR");
      }));
      form.addEventListener("submit", e => {
        e.preventDefault();
        const fd = new FormData(form);
        state.logs.push({ id: uid(), benefitId: b.id, date: fd.get("date"), saved: num(fd.get("saved")), memo: String(fd.get("memo") || "").trim() });
        save(); closeSheet(); render(); toast("기록했어요");
        prefill.after && prefill.after();
      });
    });
  }

  // ---------- 결제 가져오기 화면 ----------
  function openImportSheet() {
    openSheet(`<h2>결제 가져오기</h2>
      <p class="hint">단축어가 iCloud Drive에 쌓아 둔 <b>혜택캘린더-결제.txt</b> 파일을 고르세요. 이미 가져온 결제는 자동으로 건너뛰어요.</p>
      <div class="btn-row" style="margin-bottom:10px">
        <button class="btn primary" id="pick-file">파일 선택</button>
        <button class="btn" id="paste-clip">클립보드 붙여넣기</button>
      </div>
      <label class="field"><span>또는 직접 붙여넣기 (한 줄에 한 건: 날짜|금액|가맹점|카드)</span>
        <textarea id="tx-text" placeholder="2026-11-06 12:30|₩12,000|올리브영 강남점|현대카드"></textarea></label>
      <button class="btn block" id="import-text">가져오기</button>
      <p class="hint" style="margin-top:12px">아직 단축어를 만들지 않았다면 <button class="small-link" data-action="guide">설정 방법 보기</button></p>`, root => {
      const run = text => { const r = importTransactions(text); closeSheet(); render(); openImportResult(r); };
      root.querySelector("#pick-file").addEventListener("click", () => {
        const input = document.createElement("input");
        input.type = "file"; input.accept = ".txt,text/plain";
        input.onchange = async () => { const f = input.files[0]; if (f) run(await f.text()); };
        input.click();
      });
      root.querySelector("#paste-clip").addEventListener("click", async () => {
        try { run(await navigator.clipboard.readText()); }
        catch (e) { toast("클립보드를 읽지 못했어요. 아래 칸에 붙여넣어 주세요"); }
      });
      root.querySelector("#import-text").addEventListener("click", () => run(root.querySelector("#tx-text").value));
    });
  }

  function openImportResult(r) {
    if (!r.total) { toast("읽을 수 있는 결제가 없어요"); return; }
    // 가져온 결제 중 혜택과 연결되는 것 → 바로 사용 기록할 수 있게
    const rows = r.added.map(t => {
      const ym = t.date.slice(0, 7);
      const acts = matchedBenefits(t).filter(b => b.period !== "always").map(b => {
        const s = benefitStatus(b, ym);
        if (s.done || s.eligible === false) return "";
        return `<button class="use-btn" style="margin:4px 4px 0 0" data-use-from-tx="${b.id}" data-tx="${t.id}">${esc(itemById(b.itemId)?.name || "")} ${esc(b.name)} 썼어요</button>`;
      }).join("");
      const special = matchedBenefits(t).filter(b => b.period === "always").map(b => `<span class="tag good">${esc(b.name)}</span>`).join(" ");
      return `<div class="log-row" style="flex-wrap:wrap"><div class="d">${Number(t.date.slice(5, 7))}/${Number(t.date.slice(8))}</div>
        <div class="t">${esc(t.merchant || "(가맹점 없음)")}<small>${esc(itemById(t.itemId)?.name || "")} ${special}</small>${acts ? `<div>${acts}</div>` : ""}</div>
        <div class="a" style="color:var(--text)">${t.foreign ? esc(t.amountRaw) : won(t.amount)}</div></div>`;
    }).join("");
    openSheet(`<h2>새 결제 ${r.added.length}건</h2>
      <p class="hint">${r.dup ? `이미 있던 ${r.dup}건은 건너뛰었어요. ` : ""}실적에 자동 반영됐어요. 혜택을 쓴 결제는 버튼을 눌러 기록하세요.</p>
      <div>${rows || `<div class="empty">새로 추가된 결제가 없어요</div>`}</div>
      <button class="btn primary block" style="margin-top:12px" data-close>확인</button>`, root => {
      root.querySelector("[data-close]").addEventListener("click", closeSheet);
      root.querySelectorAll("[data-use-from-tx]").forEach(btn => btn.addEventListener("click", () => {
        const t = state.transactions.find(x => x.id === btn.dataset.tx);
        openUseSheet(btn.dataset.useFromTx, { date: t.date, memo: t.merchant, after: () => openImportResult({ ...r }) }, t.date.slice(0, 7));
      }));
    });
  }

  function openGuideSheet() {
    const appUrl = location.href.split("#")[0];
    openSheet(`<h2>Apple Pay 단축어 설정</h2>
      <p class="hint">Apple Pay로 결제할 때마다 iCloud Drive 파일에 한 줄씩 쌓이고, 앱에서 그 파일을 가져오는 방식이에요. iOS 17 이상이 필요하고, 메뉴 이름은 iOS 버전에 따라 조금 다를 수 있어요.</p>
      <ol class="guide">
        <li><b>단축어</b> 앱 → 아래 <b>자동화</b> 탭 → <b>＋</b> → <b>지갑</b>(또는 <b>거래</b>) 선택</li>
        <li>카드: <b>현대카드 아멕스 골드</b> 선택, 범주는 전체 → <b>즉시 실행</b> 선택 → 다음</li>
        <li><b>새로운 빈 자동화</b> → 동작 추가:
          <ul>
            <li><b>텍스트</b> 동작 → 아래처럼 변수를 넣기 (파란 변수 버튼으로 삽입)<br>
              <code>현재 날짜|금액|가맹점|카드 또는 패스</code><br>
              <small>현재 날짜를 눌러 형식을 <b>사용자 설정 → yyyy-MM-dd HH:mm</b>으로 바꾸세요. 칸 사이는 세로줄 <b>|</b> 입니다.</small></li>
            <li><b>텍스트 파일에 추가</b> 동작 → 파일 경로 <code>혜택캘린더-결제.txt</code> (iCloud Drive › Shortcuts 폴더), <b>새로운 줄 만들기</b> 켜기</li>
            <li>(선택) <b>알림 보기</b> → "금액 기록됨" 같은 문구</li>
          </ul></li>
        <li>완료. 이제 Apple Pay로 결제하면 자동으로 기록돼요.</li>
        <li>앱에서 <b>결제 가져오기 → 파일 선택</b> → iCloud Drive › Shortcuts › <b>혜택캘린더-결제.txt</b>. 이미 가져온 결제는 중복되지 않으니 파일은 지우지 않아도 돼요.</li>
      </ol>
      <div class="alert info" style="margin:10px 0"><span>💡</span><span>처음엔 소액 결제 1건으로 테스트해서 금액·가맹점이 제대로 들어오는지 확인해 보세요. 잘 안 되면 파일 내용을 <b>직접 붙여넣기</b> 칸에 넣어 확인할 수 있어요.</span></div>
      <p class="hint">Safari로 쓰는 경우엔 파일 대신 단축어 끝에 <b>URL 열기</b>로 <code>${esc(appUrl)}#import=</code> 뒤에 <b>URL 인코딩</b>한 텍스트를 붙여 바로 보낼 수도 있어요. (홈 화면 앱과 Safari는 저장 공간이 달라요)</p>
      <button class="btn primary block" data-close>닫기</button>`, root => root.querySelector("[data-close]").addEventListener("click", closeSheet));
  }

  function openItemSheet(itemId, type) {
    const isNew = !itemId;
    const it = isNew ? { id: uid(), type, name: "", issuer: "", color: COLORS[state.items.length % COLORS.length], annualFee: 0, feeMonth: null, tiers: [], note: "", verify: false } : clone(itemById(itemId));
    const tiersRow = t => `<div class="tier"><input name="tmin" inputmode="numeric" placeholder="실적 (원)" value="${t ? t.min.toLocaleString("ko-KR") : ""}"><input name="tlabel" placeholder="구간 이름" value="${t ? esc(t.label) : ""}"><button type="button" class="icon-btn" data-del-tier>✕</button></div>`;

    openSheet(`<h2>${isNew ? (type === "card" ? "카드 추가" : "멤버십 추가") : "편집"}</h2>
      <form id="item-form">
        <label class="field"><span>이름</span><input name="name" value="${esc(it.name)}" required placeholder="${it.type === "card" ? "예: 아멕스 골드 Edition2" : "예: 올리브영"}"></label>
        <label class="field"><span>${it.type === "card" ? "카드사" : "운영사"}</span><input name="issuer" value="${esc(it.issuer)}"></label>
        <div class="field-row">
          <label class="field"><span>연회비/구독료 (연)</span><input name="annualFee" inputmode="numeric" value="${it.annualFee ? it.annualFee.toLocaleString("ko-KR") : ""}" placeholder="0"></label>
          <label class="field"><span>연회비 청구 월</span><select name="feeMonth"><option value="">없음</option>${Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}" ${it.feeMonth === i + 1 ? "selected" : ""}>${i + 1}월</option>`).join("")}</select></label>
        </div>
        ${it.type === "card" ? `<div class="field tiers-edit"><span>전월 실적 구간</span><div id="tiers">${it.tiers.map(tiersRow).join("")}</div><button type="button" class="small-link" id="add-tier">＋ 구간 추가</button></div>` : ""}
        <div class="field"><span>색상</span><div class="colors">${COLORS.map(c => `<button type="button" data-color="${c}" class="${c === it.color ? "on" : ""}" style="background:${c}" aria-label="${c}"></button>`).join("")}</div></div>
        <label class="field"><span>메모</span><textarea name="note">${esc(it.note)}</textarea></label>
        <label class="check"><input type="checkbox" name="verify" ${it.verify ? "checked" : ""}> 혜택 내용 확인 필요</label>
        <button class="btn primary block" type="submit">저장</button>
        ${isNew ? "" : `<button class="btn danger block" type="button" id="del-item" style="margin-top:8px">삭제 (혜택·기록 포함)</button>`}
      </form>`, root => {
      const form = root.querySelector("#item-form");
      let color = it.color;
      root.querySelectorAll("[data-color]").forEach(btn => btn.addEventListener("click", () => {
        color = btn.dataset.color; root.querySelectorAll("[data-color]").forEach(x => x.classList.toggle("on", x === btn));
      }));
      const tiersEl = root.querySelector("#tiers");
      root.querySelector("#add-tier")?.addEventListener("click", () => tiersEl.insertAdjacentHTML("beforeend", tiersRow(null)));
      tiersEl?.addEventListener("click", e => { if (e.target.closest("[data-del-tier]")) e.target.closest(".tier").remove(); });
      root.querySelector("#del-item")?.addEventListener("click", () => {
        if (!confirm(`"${it.name}"과 관련 혜택·기록을 모두 삭제할까요?`)) return;
        const bIds = new Set(benefitsOf(it.id).map(b => b.id));
        state.items = state.items.filter(x => x.id !== it.id);
        state.benefits = state.benefits.filter(b => b.itemId !== it.id);
        state.logs = state.logs.filter(l => !bIds.has(l.benefitId));
        save(); closeSheet(); render();
      });
      form.addEventListener("submit", e => {
        e.preventDefault();
        const f = form.elements;
        it.name = f.name.value.trim(); it.issuer = f.issuer.value.trim();
        it.annualFee = num(f.annualFee.value); it.feeMonth = f.feeMonth.value ? Number(f.feeMonth.value) : null;
        it.note = f.note.value.trim(); it.verify = f.verify.checked; it.color = color;
        if (tiersEl) {
          it.tiers = [...tiersEl.querySelectorAll(".tier")].map(r => ({ min: num(r.querySelector("[name=tmin]").value), label: r.querySelector("[name=tlabel]").value.trim() }))
            .filter(t => t.min > 0).map(t => ({ ...t, label: t.label || compactWon(t.min) + "↑" })).sort((a, b) => a.min - b.min);
        }
        if (isNew) state.items.push(it); else state.items[state.items.findIndex(x => x.id === it.id)] = it;
        save(); closeSheet(); render(); toast("저장했어요");
      });
    });
  }

  function openBenefitSheet(benefitId, itemId) {
    const isNew = !benefitId;
    const b = isNew ? { id: uid(), itemId, name: "", desc: "", period: "monthly", limitCount: 1, limitAmount: null, tierLimits: [], minSpend: null, merchants: [], pointPer1000: null, verify: false } : clone(benefitById(benefitId));
    const item = itemById(b.itemId);
    const tlRow = t => `<div class="tier"><input name="tlmin" inputmode="numeric" placeholder="전월 실적 (원)" value="${t ? t.min.toLocaleString("ko-KR") : ""}"><input name="tlamt" inputmode="numeric" placeholder="한도 (원)" value="${t ? t.amount.toLocaleString("ko-KR") : ""}"><button type="button" class="icon-btn" data-del-tier>✕</button></div>`;

    openSheet(`<h2>${isNew ? "혜택 추가" : "혜택 편집"}</h2><p class="hint">${esc(item.name)}</p>
      <form id="benefit-form">
        <label class="field"><span>혜택 이름</span><input name="name" value="${esc(b.name)}" required placeholder="예: 공항 라운지"></label>
        <label class="field"><span>설명</span><input name="desc" value="${esc(b.desc)}" placeholder="예: 전 세계 공항 라운지 무료"></label>
        <div class="field-row">
          <label class="field"><span>주기</span><select name="period">${Object.entries(PERIOD_LABEL).map(([k, v]) => `<option value="${k}" ${b.period === k ? "selected" : ""}>${v}</option>`).join("")}</select></label>
          <label class="field"><span>전월 실적 조건 (원)</span><input name="minSpend" inputmode="numeric" value="${b.minSpend ? b.minSpend.toLocaleString("ko-KR") : ""}" placeholder="없음"></label>
        </div>
        <div class="field-row">
          <label class="field"><span>횟수 한도</span><input name="limitCount" inputmode="numeric" value="${b.limitCount ?? ""}" placeholder="없음"></label>
          <label class="field"><span>금액 한도 (원)</span><input name="limitAmount" inputmode="numeric" value="${b.limitAmount ? b.limitAmount.toLocaleString("ko-KR") : ""}" placeholder="없음"></label>
        </div>
        <label class="field"><span>연결할 가맹점 키워드 (쉼표로 구분, "@해외" = 해외 결제)</span><input name="merchants" value="${esc((b.merchants || []).join(", "))}" placeholder="예: 올리브영, OLIVE YOUNG"></label>
        <label class="field"><span>1,000원당 적립 포인트 (선택, 예상 적립 계산용)</span><input name="pointPer1000" inputmode="decimal" value="${b.pointPer1000 ?? ""}" placeholder="없음"></label>
        <div class="field tiers-edit"><span>실적 구간별 금액 한도 (선택, 금액 한도 대신 사용)</span><div id="tl">${b.tierLimits.map(tlRow).join("")}</div><button type="button" class="small-link" id="add-tl">＋ 구간 추가</button></div>
        <label class="check"><input type="checkbox" name="verify" ${b.verify ? "checked" : ""}> 확인 필요</label>
        <button class="btn primary block" type="submit">저장</button>
        ${isNew ? "" : `<button class="btn danger block" type="button" id="del-benefit" style="margin-top:8px">삭제</button>`}
      </form>`, root => {
      const form = root.querySelector("#benefit-form");
      const tl = root.querySelector("#tl");
      root.querySelector("#add-tl").addEventListener("click", () => tl.insertAdjacentHTML("beforeend", tlRow(null)));
      tl.addEventListener("click", e => { if (e.target.closest("[data-del-tier]")) e.target.closest(".tier").remove(); });
      root.querySelector("#del-benefit")?.addEventListener("click", () => {
        if (!confirm(`"${b.name}" 혜택과 사용 기록을 삭제할까요?`)) return;
        state.benefits = state.benefits.filter(x => x.id !== b.id);
        state.logs = state.logs.filter(l => l.benefitId !== b.id);
        save(); closeSheet(); render();
      });
      form.addEventListener("submit", e => {
        e.preventDefault();
        const f = form.elements;
        b.name = f.name.value.trim(); b.desc = f.desc.value.trim(); b.period = f.period.value;
        b.minSpend = numOrNull(f.minSpend.value) || null;
        b.limitCount = numOrNull(f.limitCount.value) || null;
        b.limitAmount = numOrNull(f.limitAmount.value) || null;
        b.tierLimits = [...tl.querySelectorAll(".tier")].map(r => ({ min: num(r.querySelector("[name=tlmin]").value), amount: num(r.querySelector("[name=tlamt]").value) }))
          .filter(t => t.amount > 0).sort((x, y) => x.min - y.min);
        b.merchants = f.merchants.value.split(",").map(x => x.trim()).filter(Boolean);
        b.pointPer1000 = numOrNull(f.pointPer1000.value);
        b.verify = f.verify.checked;
        if (isNew) state.benefits.push(b); else state.benefits[state.benefits.findIndex(x => x.id === b.id)] = b;
        save(); closeSheet(); render(); toast("저장했어요");
      });
    });
  }

  // ---------- 백업 ----------
  async function exportData() {
    const name = `benefits-backup-${dateStr(new Date())}.json`;
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const file = new File([blob], name, { type: "application/json" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: "혜택 백업" }); return; } catch (e) { if (e.name === "AbortError") return; }
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  function importData() {
    const input = document.createElement("input");
    input.type = "file"; input.accept = "application/json,.json";
    input.onchange = async () => {
      const file = input.files[0]; if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        if (!Array.isArray(data.items) || !Array.isArray(data.benefits)) throw new Error("형식 오류");
        if (!confirm("현재 데이터를 백업 파일로 덮어쓸까요?")) return;
        state = normalize(data); save(); render(); toast("가져왔어요");
      } catch (e) { alert("백업 파일을 읽을 수 없어요: " + e.message); }
    };
    input.click();
  }

  // ---------- 이벤트 ----------
  let toastTimer;
  function toast(msg) {
    document.querySelector(".toast")?.remove();
    const t = document.createElement("div"); t.className = "toast"; t.textContent = msg;
    document.body.appendChild(t); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.remove(), 1600);
  }

  document.addEventListener("click", e => {
    const el = e.target.closest("[data-action],[data-tab]");
    if (!el) return;
    if (el.dataset.tab) { view.tab = el.dataset.tab; closeSheet(); render(); window.scrollTo(0, 0); return; }
    const a = el.dataset.action;
    if (a === "prev") { view.ym = addMonths(view.ym, -1); render(); }
    else if (a === "next") { view.ym = addMonths(view.ym, 1); render(); }
    else if (a === "today") { view.ym = ymOf(today); render(); }
    else if (a === "use") openUseSheet(el.dataset.benefit);
    else if (a === "del-log") {
      if (!confirm("이 기록을 삭제할까요?")) return;
      state.logs = state.logs.filter(l => l.id !== el.dataset.log); save();
      const wasSheet = !!sheetEl; closeSheet(); render(); if (!wasSheet) toast("삭제했어요");
    }
    else if (a === "dismiss") { state.dismissed[el.dataset.key] = true; save(); render(); }
    else if (a === "edit-item") openItemSheet(el.dataset.item);
    else if (a === "new-item") openItemSheet(null, el.dataset.type);
    else if (a === "edit-benefit") openBenefitSheet(el.dataset.benefit);
    else if (a === "new-benefit") openBenefitSheet(null, el.dataset.item);
    else if (a === "import-tx") openImportSheet();
    else if (a === "guide") openGuideSheet();
    else if (a === "del-tx") {
      if (!confirm("이 결제 내역을 삭제할까요? (실적에서도 빠져요)")) return;
      state.transactions = state.transactions.filter(t => t.id !== el.dataset.tx); save(); render(); toast("삭제했어요");
    }
    else if (a === "export") exportData();
    else if (a === "import") importData();
    else if (a === "reset") {
      if (!confirm("모든 기록을 지우고 초기 예시 데이터로 되돌릴까요?\n(먼저 내보내기로 백업하는 걸 권장해요)")) return;
      state = normalize(clone(window.SEED_DATA)); save(); render(); toast("초기화했어요");
    }
  });

  // 실적 입력: 입력 중 천 단위 콤마, 포커스 해제 시 저장
  document.addEventListener("input", e => {
    if (e.target.dataset.action !== "spend") return;
    const n = num(e.target.value);
    e.target.value = e.target.value.trim() === "" ? "" : n.toLocaleString("ko-KR");
  });
  document.addEventListener("change", e => {
    if (e.target.id === "applepay-card") { state.settings.applePayItemId = e.target.value; save(); toast("저장했어요"); return; }
    if (e.target.dataset.action !== "spend") return;
    const { item } = e.target.dataset;
    const raw = e.target.value.trim();
    state.spend[view.ym] ||= {};
    if (raw === "") delete state.spend[view.ym][item]; else state.spend[view.ym][item] = num(raw);
    save(); render();
  });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") closeSheet();
    if (e.key === "Enter" && e.target.dataset?.action === "spend") e.target.blur();
  });

  // 단축어에서 URL로 바로 보내는 경우: ...#import=<URL 인코딩된 텍스트>
  function importFromHash() {
    if (!location.hash.startsWith("#import=")) return;
    let text = location.hash.slice(8);
    try { text = decodeURIComponent(text.replace(/\+/g, " ")); } catch (e) {}
    history.replaceState(null, "", location.pathname + location.search);
    const r = importTransactions(text);
    render(); openImportResult(r);
  }
  window.addEventListener("hashchange", importFromHash);

  render();
  importFromHash();

  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
})();
