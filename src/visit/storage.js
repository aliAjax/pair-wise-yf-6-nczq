// 回访本地存储：负责 state 的读写、历史数据迁移，以及带保存的回访操作。
import { completeVisit, postponeVisit, scheduleVisit } from "./rules.js";

const STORAGE_KEY = "zfl-14-repairs";

function createDefaultState() {
  return {
    filter: "all",
    repairs: [
      {
        id: crypto.randomUUID(),
        location: "厨房",
        title: "水槽下方渗水",
        priority: "high",
        cost: 260,
        status: "todo",
        photo: "",
        note: "先检查软管接口",
        visit: null,
        history: []
      }
    ]
  };
}

// 老数据没有 visit / history 字段，补齐即可，不改动任何已有费用和照片。
function migrate(raw) {
  if (!raw || !Array.isArray(raw.repairs)) return createDefaultState();
  raw.repairs = raw.repairs.map((repair) => ({
    ...repair,
    visit: repair.visit || null,
    history: Array.isArray(repair.history) ? repair.history : []
  }));
  return raw;
}

export function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return createDefaultState();
  try {
    return migrate(JSON.parse(saved));
  } catch {
    return createDefaultState();
  }
}

export function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function findRepair(state, id) {
  return state.repairs.find((repair) => repair.id === id) || null;
}

// 状态变为已完成（含新建时直接选已完成）时调用，未回访前重复调用不会重复排期。
export function ensureVisitScheduled(state, id, now = new Date()) {
  const repair = findRepair(state, id);
  if (!repair) return null;
  const next = scheduleVisit(repair, now);
  if (next !== repair) Object.assign(repair, next);
  saveState(state);
  return repair;
}

// 延期一次，需要原因；不符合规则时返回错误信息。
export function postpone(state, id, reason, now = new Date()) {
  const repair = findRepair(state, id);
  if (!repair) return { ok: false, error: "事项不存在" };
  if (!repair.visit || repair.visit.status !== "pending") {
    return { ok: false, error: "该事项没有待回访的排期" };
  }
  if (repair.visit.postponements.length > 0) {
    return { ok: false, error: "每项回访只能延期一次" };
  }
  if (!String(reason || "").trim()) {
    return { ok: false, error: "延期必须填写原因" };
  }
  Object.assign(repair, postponeVisit(repair, reason, now));
  saveState(state);
  return { ok: true, repair };
}

// 登记回访结果：满意结案；不满意必须选择返工原因并退回处理中。
export function submitVisit(state, id, payload = {}, now = new Date()) {
  const repair = findRepair(state, id);
  if (!repair) return { ok: false, error: "事项不存在" };
  if (!repair.visit || repair.visit.status !== "pending") {
    return { ok: false, error: "该事项没有待回访的排期" };
  }
  const satisfied = payload.satisfied === true || payload.satisfied === "true";
  if (!satisfied && !payload.reworkReason) {
    return { ok: false, error: "不满意必须选择返工原因" };
  }
  Object.assign(repair, completeVisit(repair, { ...payload, satisfied }, now));
  saveState(state);
  return { ok: true, repair };
}
