import "./styles.css";
import { loadState, saveState } from "./storage.js";
import {
  FOLLOWUP_DAYS,
  REWORK_REASONS,
  scheduleFollowUp,
  postponeFollowUp,
  resolveFollowUp,
  isFollowUpPending,
  isFollowUpOverdue,
  getOverdueRepairs,
  reworkReasonLabel,
  formatDate
} from "./followup.js";

const statuses = {
  all: "全部",
  todo: "待处理",
  doing: "处理中",
  done: "已完工",
  closed: "已结案"
};

const priorities = {
  high: "高优先级",
  medium: "中优先级",
  low: "低优先级"
};

let state = loadState();

// 旧数据迁移：已完工却没有回访记录的事项，按完工即排七天后回访补排一次
state.repairs.forEach((repair) => {
  if (repair.status === "done" && !repair.followUp) {
    scheduleFollowUp(repair);
  }
});
saveState(state);

const app = document.querySelector("#app");

function render() {
  const repairs = filteredRepairs();
  const overdue = getOverdueRepairs(state.repairs);
  const unfinished = state.repairs.filter((repair) => repair.status !== "done" && repair.status !== "closed");
  const totalCost = unfinished.reduce((total, repair) => total + Number(repair.cost || 0), 0);
  const doing = state.repairs.filter((repair) => repair.status === "doing").length;

  app.innerHTML = `
    <main class="shell">
      <header class="header">
        <div>
          <p class="eyebrow">本地家庭维护台</p>
          <h1>家庭维修事项</h1>
        </div>
        <section class="stats">
          <div class="stat"><span>未完成</span><strong>${unfinished.length}</strong></div>
          <div class="stat"><span>处理中</span><strong>${doing}</strong></div>
          <div class="stat ${overdue.length ? "alarm" : ""}"><span>逾期未回访</span><strong>${overdue.length}</strong></div>
          <div class="stat"><span>预计费用</span><strong>¥${totalCost}</strong></div>
        </section>
      </header>

      ${overdue.length ? renderOverdueSection(overdue) : ""}

      <section class="layout">
        <aside class="panel">
          <h2>新增维修事项</h2>
          <form class="form" id="repair-form">
            <label>位置<input name="location" required placeholder="例如卫生间"></label>
            <label>问题描述<textarea name="title" required placeholder="例如门锁松动"></textarea></label>
            <label>优先级<select name="priority">${renderPriorityOptions("medium")}</select></label>
            <label>预计费用<input name="cost" type="number" min="0" step="1" value="0"></label>
            <label>处理状态<select name="status">${renderStatusOptions("todo", false)}</select></label>
            <label>照片链接<input name="photo" type="url" placeholder="可选，粘贴图片地址"></label>
            <label>备注<textarea name="note" placeholder="师傅电话、材料或注意事项"></textarea></label>
            <button class="primary" type="submit">保存事项</button>
          </form>
        </aside>

        <section>
          <div class="toolbar">
            ${Object.entries(statuses).map(([value, label]) => `<button class="seg ${state.filter === value ? "active" : ""}" data-filter="${value}">${label}</button>`).join("")}
          </div>
          <div class="repairs">
            ${repairs.length ? repairs.map((repair) => renderRepair(repair, "card")).join("") : `<div class="empty">当前状态下没有维修事项</div>`}
          </div>
        </section>
      </section>
    </main>
  `;

  bindEvents();
}

function renderOverdueSection(overdue) {
  return `
    <section class="overdue-panel">
      <h2>逾期未回访（${overdue.length}）</h2>
      <p class="overdue-hint">以下事项已超过计划回访日，补回访后将立即从此处消失。</p>
      <div class="overdue-list">
        ${overdue.map((repair) => renderOverdueItem(repair)).join("")}
      </div>
    </section>
  `;
}

function renderOverdueItem(repair) {
  const days = Math.floor((Date.now() - repair.followUp.dueAt) / (24 * 60 * 60 * 1000));
  return `
    <article class="overdue-item">
      <div class="overdue-info">
        <strong>${escapeHtml(repair.location)} · ${escapeHtml(repair.title)}</strong>
        <span class="chip">应于 ${formatDate(repair.followUp.dueAt)} 回访，已逾期 ${days} 天</span>
      </div>
      ${renderFollowUpForm(repair, `overdue-${repair.id}`)}
    </article>
  `;
}

function renderRepair(repair, context) {
  return `
    <article class="repair">
      <div class="photo">${repair.photo ? `<img src="${escapeHtml(repair.photo)}" alt="${escapeHtml(repair.location)}维修照片">` : "未添加照片"}</div>
      <div class="content">
        <div class="row">
          <h3>${escapeHtml(repair.location)}</h3>
          <span class="priority ${repair.priority}">${priorities[repair.priority]}</span>
          <span class="status ${repair.status}">${statuses[repair.status]}</span>
        </div>
        <p>${escapeHtml(repair.title)}</p>
        <div class="row">
          <span class="chip">预计 ¥${Number(repair.cost || 0)}</span>
          <span class="chip">${escapeHtml(repair.note || "暂无备注")}</span>
        </div>
        <div class="actions">
          <select data-status="${repair.id}">${renderStatusOptions(repair.status, true)}</select>
          <button class="ghost" data-delete="${repair.id}">删除</button>
        </div>
        ${renderFollowUpBlock(repair, context)}
      </div>
    </article>
  `;
}

function renderFollowUpBlock(repair, context) {
  const followUp = repair.followUp;
  if (!followUp) return "";

  if (isFollowUpPending(followUp)) {
    const overdue = isFollowUpOverdue(followUp);
    return `
      <div class="followup pending ${overdue ? "overdue" : ""}">
        <div class="row">
          <span class="followup-badge ${overdue ? "bad" : "wait"}">${overdue ? "逾期未回访" : "待回访"}</span>
          <span class="chip">计划回访日：${formatDate(followUp.dueAt)}（完工后 ${FOLLOWUP_DAYS} 天）</span>
          ${followUp.delayUsed ? `<span class="chip warn">已延期一次：${escapeHtml(followUp.delayReason)}</span>` : ""}
        </div>
        ${renderFollowUpForm(repair, `${context}-${repair.id}`)}
      </div>
      ${renderHistory(followUp.history)}
    `;
  }

  if (followUp.result === "satisfied") {
    return `
      <div class="followup done">
        <div class="row">
          <span class="followup-badge ok">回访满意</span>
          <span class="chip">回访日期：${formatDate(followUp.completedAt)}</span>
        </div>
      </div>
      ${renderHistory(followUp.history)}
    `;
  }

  // 回访不满意、已退回处理中
  return `
    <div class="followup rework">
      <div class="row">
        <span class="followup-badge bad">回访不满意 · 已返工</span>
        <span class="chip">返工原因：${escapeHtml(reworkReasonLabel(followUp.reworkReason))}</span>
        <span class="chip">回访日期：${formatDate(followUp.completedAt)}</span>
      </div>
    </div>
    ${renderHistory(followUp.history)}
  `;
}

function renderFollowUpForm(repair, context) {
  const followUp = repair.followUp;
  return `
    <form class="followup-form" data-visit="${repair.id}" data-context="${context}">
      <label class="visit-option"><input type="radio" name="${context}-result" value="satisfied"> 满意，结案</label>
      <label class="visit-option">
        <input type="radio" name="${context}-result" value="rework"> 不满意，返工
      </label>
      <label class="rework-reason" data-rework-for="${context}" hidden>
        返工原因（必选）
        <select name="reworkReason">
          <option value="">请选择返工原因…</option>
          ${REWORK_REASONS.map((item) => `<option value="${item.value}">${item.label}</option>`).join("")}
        </select>
      </label>
      <div class="actions">
        <button class="primary small" type="submit">登记回访</button>
        ${
          followUp.delayUsed
            ? `<span class="chip warn">已延期一次，不能再延期</span>`
            : `<button type="button" class="ghost small" data-postpone="${repair.id}">延期回访（仅一次，需填原因）</button>`
        }
      </div>
    </form>
  `;
}

function renderHistory(history) {
  if (!history || !history.length) return "";
  return `
    <div class="history">
      <p class="history-title">返工历史（原费用与照片保留）</p>
      ${history
        .map(
          (item) => `
        <div class="history-item">
          ${item.photo ? `<img src="${escapeHtml(item.photo)}" alt="返工前照片">` : `<span class="history-photo">无照片</span>`}
          <div class="history-meta">
            <span class="chip">原费用 ¥${Number(item.cost || 0)}</span>
            <span class="chip">${escapeHtml(reworkReasonLabel(item.reworkReason))}</span>
            <span class="chip">登记于 ${formatDate(item.recordedAt)}</span>
          </div>
        </div>`
        )
        .join("")}
    </div>
  `;
}

function renderStatusOptions(selected, withClosed) {
  const options = Object.entries(statuses)
    .filter(([value]) => value !== "all" && (withClosed || value !== "closed"))
    .map(([value, label]) => `<option value="${value}" ${selected === value ? "selected" : ""}>${label}</option>`)
    .join("");
  // 结案只能由“回访满意”触发，下拉里仅作提示
  const closedHint = withClosed && selected !== "closed" ? `<option value="closed" disabled>已结案（回访满意自动结案）</option>` : "";
  return options + closedHint;
}

function renderPriorityOptions(selected) {
  return Object.entries(priorities)
    .map(([value, label]) => `<option value="${value}" ${selected === value ? "selected" : ""}>${label}</option>`)
    .join("");
}

function bindEvents() {
  document.querySelector("#repair-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.target));
    const repair = {
      id: crypto.randomUUID(),
      location: data.location.trim(),
      title: data.title.trim(),
      priority: data.priority,
      cost: Number(data.cost || 0),
      status: data.status,
      photo: data.photo.trim(),
      note: data.note.trim(),
      followUp: null
    };
    // 直接登记为已完工时，立即排七天后回访
    if (repair.status === "done") scheduleFollowUp(repair);
    state.repairs.unshift(repair);
    persist();
  });

  document.querySelectorAll("[data-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.filter = button.dataset.filter;
      persist();
    });
  });

  document.querySelectorAll("[data-status]").forEach((select) => {
    select.addEventListener("change", () => {
      const repair = state.repairs.find((item) => item.id === select.dataset.status);
      const next = select.value;
      // 存在待完成回访时不能重新标记完工（同一事项未回访前不得重复排期）
      if (next === "done" && isFollowUpPending(repair.followUp)) {
        alert("该事项回访尚未完成，不能重复标记完工。请先登记回访结果。");
        persist();
        return;
      }
      repair.status = next;
      // 完工即排回访；已有待完成回访时 scheduleFollowUp 不会重复排期
      if (next === "done") scheduleFollowUp(repair);
      persist();
    });
  });

  document.querySelectorAll("[data-delete]").forEach((button) => {
    button.addEventListener("click", () => {
      state.repairs = state.repairs.filter((repair) => repair.id !== button.dataset.delete);
      persist();
    });
  });

  document.querySelectorAll(".followup-form").forEach((form) => {
    const context = form.dataset.context;
    form.querySelectorAll(`input[name="${context}-result"]`).forEach((radio) => {
      radio.addEventListener("change", () => {
        const reasonRow = form.querySelector(`[data-rework-for="${context}"]`);
        reasonRow.hidden = form.querySelector(`input[name="${context}-result"]:checked`)?.value !== "rework";
      });
    });

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const repair = state.repairs.find((item) => item.id === form.dataset.visit);
      const choice = form.querySelector(`input[name="${context}-result"]:checked`);
      if (!choice) {
        alert("请选择回访结果：满意或不满意。");
        return;
      }
      const satisfied = choice.value === "satisfied";
      const reason = form.querySelector('[name="reworkReason"]').value;
      try {
        resolveFollowUp(repair, satisfied, reason);
      } catch (error) {
        alert(error.message);
        return;
      }
      persist();
    });
  });

  document.querySelectorAll("[data-postpone]").forEach((button) => {
    button.addEventListener("click", () => {
      const repair = state.repairs.find((item) => item.id === button.dataset.postpone);
      const reason = window.prompt("请填写延期原因（每项回访只能延期一次，顺延七天）：");
      if (reason === null) return;
      try {
        postponeFollowUp(repair.followUp, reason);
      } catch (error) {
        alert(error.message);
        return;
      }
      persist();
    });
  });
}

function persist() {
  saveState(state);
  render();
}

function filteredRepairs() {
  if (state.filter === "all") return state.repairs;
  return state.repairs.filter((repair) => repair.status === state.filter);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
}

render();
