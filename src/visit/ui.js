// 回访页面接入：负责渲染回访区块并通过事件委托接入页面，状态操作走 storage。
import {
  canPostpone,
  formatDate,
  isOverdue,
  pendingVisit,
  reworkReasons
} from "./rules.js";
import { postpone, submitVisit } from "./storage.js";

// 当前展开的操作面板：repairId -> "visit"（登记回访）| "postpone"（延期）
const openPanels = {};
let context = null;
let bound = false;

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
}

function renderReworkOptions() {
  return Object.entries(reworkReasons)
    .map(([value, label]) => `<option value="${value}">${label}</option>`)
    .join("");
}

function renderVisitButtons(repair) {
  const postponable = canPostpone(repair);
  return `
    <div class="visit-actions">
      <button type="button" class="ghost" data-visit-form="${repair.id}">登记回访</button>
      <button type="button" class="btn-secondary" data-visit-postpone="${repair.id}" ${postponable ? "" : "disabled"}>
        ${postponable ? "延期（仅可一次）" : "已延期，不能再次延期"}
      </button>
    </div>`;
}

function renderVisitForm(repair) {
  return `
    <form class="visit-form" data-visit-submit="${repair.id}">
      <span class="visit-label">回访结果</span>
      <label class="inline"><input type="radio" name="visitsatisfied" value="true"> 满意，结案</label>
      <label class="inline"><input type="radio" name="visitsatisfied" value="false"> 不满意，退回处理中</label>
      <div class="rework-box" data-rework-box hidden>
        <select name="reworkReason">
          <option value="">请选择返工原因</option>
          ${renderReworkOptions()}
        </select>
      </div>
      <div class="visit-actions">
        <button type="submit" class="primary small">提交回访</button>
        <button type="button" class="btn-secondary" data-visit-cancel="${repair.id}">取消</button>
      </div>
      <p class="visit-error" data-visit-error></p>
    </form>`;
}

function renderPostponeForm(repair) {
  return `
    <form class="visit-form" data-visit-postpone-submit="${repair.id}">
      <textarea name="reason" rows="2" placeholder="请填写延期原因（每项仅可延期一次，延期 7 天）"></textarea>
      <div class="visit-actions">
        <button type="submit" class="primary small">确认延期 7 天</button>
        <button type="button" class="btn-secondary" data-visit-cancel="${repair.id}">取消</button>
      </div>
      <p class="visit-error" data-visit-error></p>
    </form>`;
}

function renderPendingVisit(repair) {
  const visit = pendingVisit(repair);
  const overdue = isOverdue(repair);
  const postponement = visit.postponements[0];
  const panel = openPanels[repair.id];

  return `
    <div class="visit-card${overdue ? " overdue" : ""}">
      <div class="visit-head">
        <span class="visit-tag">${overdue ? "逾期未回访" : "待回访"}</span>
        <span class="chip">计划回访 ${formatDate(visit.dueAt)}</span>
      </div>
      ${
        postponement
          ? `<p class="postpone-info">已由 ${formatDate(postponement.from)} 延期至 ${formatDate(postponement.to)}，原因：${escapeHtml(postponement.reason)}</p>`
          : ""
      }
      ${panel === "visit" ? renderVisitForm(repair) : panel === "postpone" ? renderPostponeForm(repair) : renderVisitButtons(repair)}
    </div>`;
}

function renderHistory(repair) {
  if (!repair.history || repair.history.length === 0) return "";
  return `
    <div class="history">
      <h4>历史记录</h4>
      ${repair.history
        .map(
          (item) => `
        <div class="history-item">
          <div class="history-photo">${item.photo ? `<img src="${escapeHtml(item.photo)}" alt="返工前照片">` : "无照片"}</div>
          <div>
            <span class="chip danger">回访不满意 · 退回返工</span>
            <p>返工原因：${escapeHtml(reworkReasons[item.reason] || item.reason)}</p>
            <p class="muted">返工前费用 ¥${Number(item.cost || 0)} · ${formatDate(String(item.returnedAt).slice(0, 10))}</p>
          </div>
        </div>`
        )
        .join("")}
    </div>`;
}

// 卡片内的回访区块：待回访卡片 / 已结案提示 + 历史记录。
export function renderVisitSection(repair) {
  const parts = [];
  if (pendingVisit(repair)) {
    parts.push(renderPendingVisit(repair));
  } else if (repair.visit) {
    const satisfied = repair.visit.satisfied !== false;
    const at = formatDate(String(repair.visit.completedAt || "").slice(0, 10));
    parts.push(
      `<div class="visit-done">${satisfied ? `回访满意，已结案（${at}）` : `回访不满意，已退回处理中（${at}）`}</div>`
    );
  }
  parts.push(renderHistory(repair));
  return parts.join("");
}

function showError(form, message) {
  const slot = form.querySelector("[data-visit-error]");
  if (slot) slot.textContent = message;
}

export function bindVisitEvents({ state, rerender }) {
  context = { state, rerender };
  if (bound) return;
  bound = true;

  document.addEventListener("click", (event) => {
    const openButton = event.target.closest("[data-visit-form]");
    const postponeButton = event.target.closest("[data-visit-postpone]:not([disabled])");
    const cancelButton = event.target.closest("[data-visit-cancel]");

    if (openButton) {
      openPanels[openButton.dataset.visitForm] = "visit";
      context.rerender();
    } else if (postponeButton) {
      openPanels[postponeButton.dataset.visitPostpone] = "postpone";
      context.rerender();
    } else if (cancelButton) {
      delete openPanels[cancelButton.dataset.visitCancel];
      context.rerender();
    }
  });

  // 选“不满意”时才出现返工原因下拉。
  document.addEventListener("change", (event) => {
    if (event.target.name !== "visitsatisfied") return;
    const form = event.target.closest("[data-visit-submit]");
    const box = form.querySelector("[data-rework-box]");
    box.hidden = event.target.value !== "false";
  });

  document.addEventListener("submit", (event) => {
    const visitForm = event.target.closest("[data-visit-submit]");
    const postponeForm = event.target.closest("[data-visit-postpone-submit]");
    if (!visitForm && !postponeForm) return;
    event.preventDefault();

    if (visitForm) {
      const data = new FormData(visitForm);
      const result = submitVisit(context.state, visitForm.dataset.visitSubmit, {
        satisfied: data.get("visitsatisfied"),
        reworkReason: String(data.get("reworkReason") || "")
      });
      if (!result.ok) {
        showError(visitForm, result.error);
        return;
      }
      delete openPanels[visitForm.dataset.visitSubmit];
    } else {
      const data = new FormData(postponeForm);
      const result = postpone(context.state, postponeForm.dataset.visitPostponeSubmit, String(data.get("reason") || ""));
      if (!result.ok) {
        showError(postponeForm, result.error);
        return;
      }
      delete openPanels[postponeForm.dataset.visitPostponeSubmit];
    }

    // 提交成功后立即重绘：逾期项补完回访会马上从逾期列表/统计中消失。
    context.rerender();
  });
}
