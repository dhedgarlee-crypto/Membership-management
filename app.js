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
    s.items.forEach(i => { i.tiers ||= []; });
    s.benefits.forEach(b => { b.tierLimits ||= []; });
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
  function getSpend(ym, itemId) { const v = state.spend[ym]?.[itemId]; return v === undefined || v === null ? null : v; }

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
      spendHtml = `<div class="spend">
        <div class="spend-row"><span>이번 달 이용금액</span>
          <input class="spend-input" inputmode="numeric" placeholder="입력" data-action="spend" data-item="${item.id}" value="${sp === null ? "" : sp.toLocaleString("ko-KR")}"></div>
        ${item.tiers.length ? `<div class="bar"><div class="fill" style="width:${Math.min(((sp || 0) / scale) * 100, 100)}%"></div>${ticks}</div><div class="tier-labels">${labels}</div>` : ""}
        <div class="spend-note">전월 ${prev === null ? "미입력" : won(prev)}${item.tiers.length ? ` → 이번 달 <b>${prevTier ? esc(prevTier.label) : prev === null ? "?" : "실적 미달"}</b> · 다음 달 ${curTier ? esc(curTier.label) : "미달"}` : ""}</div>
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

    return `<div class="section-title" style="margin-top:4px"><span>최근 6개월 아낀 금액</span></div>
      <div class="panel"><div class="chart">${chart}</div></div>
      <div class="section-title"><span>${y}년 누적 · 연회비 대비</span></div>
      <div class="panel">${roi || `<div class="empty">항목이 없어요</div>`}</div>
      <div class="section-title"><span>${m}월 사용 기록</span></div>
      <div class="panel">${logHtml}</div>`;
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

  function openUseSheet(benefitId) {
    const b = benefitById(benefitId); const item = itemById(b.itemId);
    const s = benefitStatus(b, view.ym);
    const periodText = b.period === "yearly" ? `${s.key}년` : b.period === "quarterly" ? s.key.replace("-Q", "년 ") + "분기" : `${parseYm(view.ym).m}월`;
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
          <label class="field"><span>날짜</span><input type="date" name="date" value="${defaultDate(view.ym)}" required></label>
          <label class="field"><span>아낀 금액 (선택)</span><input name="saved" inputmode="numeric" placeholder="0"></label>
        </div>
        <div class="quick-amounts">${[1000, 3000, 5000, 10000, 30000].map(v => `<button type="button" data-q="${v}">+${compactWon(v)}</button>`).join("")}${s.amountLimit && s.amountLimit > s.saved ? `<button type="button" data-set="${s.amountLimit - s.saved}">남은 한도 전부</button>` : ""}</div>
        <label class="field" style="margin-top:12px"><span>메모 (선택)</span><input name="memo" placeholder="예: 스타벅스, 인천공항 T2"></label>
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
      });
    });
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
    const b = isNew ? { id: uid(), itemId, name: "", desc: "", period: "monthly", limitCount: 1, limitAmount: null, tierLimits: [], minSpend: null, verify: false } : clone(benefitById(benefitId));
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

  render();

  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
})();
