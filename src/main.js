import "./styles.css";
import { loadState, saveState, ensureVisitScheduled } from "./visit/storage.js";
import { isOverdue, visitStats } from "./visit/rules.js";
import { bindVisitEvents, renderVisitSection } from "./visit/ui.js";

const statuses = {
  all: "全部",
  todo: "待处理",
  doing: "处理中",
  done: "已完成",
  closed: "已结案"
};

// “逾期未回访”是列表中的独立筛选，不是事项状态。
const filters = {
  ...statuses,
  overdue: "逾期未回访"
};

const priorities = {
  high: "高优先级",
  medium: "中优先级",
  low: "低优先级"
};

let state = loadState();
const app = document.querySelector("#app");

function render() {
  const repairs = filteredRepairs();
  const unfinished = state.repairs.filter((repair) => repair.status === "todo" || repair.status === "doing");
  const totalCost = unfinished.reduce((total, repair) => total + Number(repair.cost || 0), 0);
  const doing = state.repairs.filter((repair) => repair.status === "doing").length;
  const stats = visitStats(state.repairs);

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
          <div class="stat"><span>预计费用</span><strong>¥${totalCost}</strong></div>
          <div class="stat ${stats.overdue > 0 ? "danger" : ""}"><span>逾期未回访</span><strong>${stats.overdue}</strong></div>
        </section>
      </header>

      <section class="layout">
        <aside class="panel">
          <h2>新增维修事项</h2>
          <form class="form" id="repair-form">
            <label>位置<input name="location" required placeholder="例如卫生间"></label>
            <label>问题描述<textarea name="title" required placeholder="例如门锁松动"></textarea></label>
            <label>优先级<select name="priority">${renderPriorityOptions("medium")}</select></label>
            <label>预计费用<input name="cost" type="number" min="0" step="1" value="0"></label>
            <label>处理状态<select name="status">${renderStatusOptions("todo")}</select></label>
            <label>照片链接<input name="photo" type="url" placeholder="可选，粘贴图片地址"></label>
            <label>备注<textarea name="note" placeholder="师傅电话、材料或注意事项"></textarea></label>
            <button class="primary" type="submit">保存事项</button>
            <p class="form-hint">选择“已完成”保存后，将自动安排 7 天后回访。</p>
          </form>
        </aside>

        <section>
          <div class="toolbar">
            ${Object.entries(filters).map(([value, label]) =>
              value === "overdue"
                ? `<button class="seg ${state.filter === value ? "active" : ""}" data-filter="${value}">${label} ${stats.overdue > 0 ? `<b>${stats.overdue}</b>` : ""}</button>`
                : `<button class="seg ${state.filter === value ? "active" : ""}" data-filter="${value}">${label}</button>`
            ).join("")}
          </div>
          <div class="repairs">
            ${repairs.length ? repairs.map(renderRepair).join("") : `<div class="empty">当前筛选下没有维修事项</div>`}
          </div>
        </section>
      </section>
    </main>
  `;

  bindEvents();
}

function renderRepair(repair) {
  return `
    <article class="repair${isOverdue(repair) ? " is-overdue" : ""}">
      <div class="photo">${repair.photo ? `<img src="${escapeHtml(repair.photo)}" alt="${escapeHtml(repair.location)}维修照片">` : "未添加照片"}</div>
      <div class="content">
        <div class="row">
          <h3>${escapeHtml(repair.location)}</h3>
          <span class="priority ${repair.priority}">${priorities[repair.priority]}</span>
          <span class="status ${repair.status}">${statuses[repair.status] || repair.status}</span>
          ${isOverdue(repair) ? `<span class="status overdue">逾期未回访</span>` : ""}
        </div>
        <p>${escapeHtml(repair.title)}</p>
        <div class="row">
          <span class="chip">预计 ¥${Number(repair.cost || 0)}</span>
          <span class="chip">${escapeHtml(repair.note || "暂无备注")}</span>
        </div>
        ${renderVisitSection(repair)}
        <div class="actions">
          <select data-status="${repair.id}">${renderStatusOptions(repair.status)}</select>
          <button class="ghost" data-delete="${repair.id}">删除</button>
        </div>
      </div>
    </article>
  `;
}

// 已结案只能由“回访满意”产生，列表中保留展示但不允许手动切回。
function renderStatusOptions(selected) {
  return Object.entries(statuses)
    .filter(([value]) => value !== "all")
    .map(([value, label]) => {
      const disabled = value === "closed" && selected !== "closed" ? "disabled" : "";
      return `<option value="${value}" ${selected === value ? "selected" : ""} ${disabled}>${label}</option>`;
    })
    .join("");
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
      visit: null,
      history: []
    };
    state.repairs.unshift(repair);
    // 新建即完工：立即排七天后回访（ensureVisitScheduled 内部会保存）。
    if (repair.status === "done") {
      ensureVisitScheduled(state, repair.id);
    } else {
      saveState(state);
    }
    render();
  });

  document.querySelectorAll("[data-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.filter = button.dataset.filter;
      saveState(state);
      render();
    });
  });

  document.querySelectorAll("[data-status]").forEach((select) => {
    select.addEventListener("change", () => {
      const repair = state.repairs.find((item) => item.id === select.dataset.status);
      repair.status = select.value;
      // 切到已完成即排回访；已有待回访排期时不会重复安排。
      if (select.value === "done") {
        ensureVisitScheduled(state, repair.id);
      } else {
        saveState(state);
      }
      render();
    });
  });

  document.querySelectorAll("[data-delete]").forEach((button) => {
    button.addEventListener("click", () => {
      state.repairs = state.repairs.filter((repair) => repair.id !== button.dataset.delete);
      saveState(state);
      render();
    });
  });
}

function filteredRepairs() {
  if (state.filter === "all") return state.repairs;
  if (state.filter === "overdue") return state.repairs.filter((repair) => isOverdue(repair));
  if (state.filter === "done") return state.repairs.filter((repair) => repair.status === "done" || repair.status === "closed");
  return state.repairs.filter((repair) => repair.status === state.filter);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
}

bindVisitEvents({ state, rerender: render });
render();
