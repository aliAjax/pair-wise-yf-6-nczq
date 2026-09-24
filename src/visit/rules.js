// 维修回访规则：纯业务逻辑，不依赖 DOM 与 localStorage。

export const VISIT_DELAY_DAYS = 7; // 完工后第几天回访
export const POSTPONE_DAYS = 7; // 单次延期天数

export const reworkReasons = {
  unresolved: "原问题未解决",
  recurrence: "短期内再次出现",
  quality: "施工质量问题",
  material: "材料配件问题",
  newIssue: "发现新问题"
};

function toDate(input) {
  if (input instanceof Date) return new Date(input.getFullYear(), input.getMonth(), input.getDate());
  const [year, month, day] = String(input).split("-").map(Number);
  return new Date(year, month - 1, day);
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function toISO(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function todayISO(now = new Date()) {
  return toISO(toDate(now));
}

export function formatDate(iso) {
  return iso ? iso.replaceAll("-", "/") : "";
}

// 完工即排七天后回访；同一事项未回访前不得重复排期。
export function scheduleVisit(repair, now = new Date()) {
  if (repair.visit && repair.visit.status === "pending") return repair;
  const due = addDays(toDate(now), VISIT_DELAY_DAYS);
  return {
    ...repair,
    visit: {
      status: "pending",
      dueAt: toISO(due),
      completedAt: "",
      satisfied: null,
      reworkReason: "",
      postponements: []
    }
  };
}

// 每项只能延期一次，且必须填写原因。
export function canPostpone(repair) {
  return Boolean(repair.visit && repair.visit.status === "pending" && repair.visit.postponements.length === 0);
}

export function postponeVisit(repair, reason, now = new Date()) {
  if (!canPostpone(repair)) return repair;
  const text = String(reason || "").trim();
  if (!text) return repair;
  const from = repair.visit.dueAt;
  const due = addDays(toDate(now), POSTPONE_DAYS);
  return {
    ...repair,
    visit: {
      ...repair.visit,
      dueAt: toISO(due),
      postponements: [{ from, to: toISO(due), reason: text, at: now.toISOString() }]
    }
  };
}

// 逾期：计划日期早于今天且仍未回访。
export function isOverdue(repair, now = new Date()) {
  return Boolean(
    repair.visit &&
      repair.visit.status === "pending" &&
      repair.visit.dueAt < todayISO(now)
  );
}

export function pendingVisit(repair) {
  return repair.visit && repair.visit.status === "pending" ? repair.visit : null;
}

// 满意即结案；不满意必须选返工原因并退回处理中，原费用和照片留在历史里。
export function completeVisit(repair, payload = {}, now = new Date()) {
  if (!repair.visit || repair.visit.status !== "pending") return repair;
  const satisfied = Boolean(payload.satisfied);
  if (!satisfied && !reworkReasons[payload.reworkReason]) return repair;

  const result = {
    ...repair,
    visit: {
      ...repair.visit,
      status: satisfied ? "satisfied" : "unsatisfied",
      completedAt: now.toISOString(),
      satisfied,
      reworkReason: satisfied ? "" : payload.reworkReason
    }
  };

  if (satisfied) {
    result.status = "closed";
    return result;
  }

  const snapshot = {
    cost: Number(repair.cost || 0),
    photo: repair.photo || "",
    reason: payload.reworkReason,
    returnedAt: now.toISOString()
  };
  result.status = "doing";
  result.history = [snapshot, ...(repair.history || [])];
  return result;
}

export function visitStats(repairs, now = new Date()) {
  let pending = 0;
  let overdue = 0;
  for (const repair of repairs) {
    if (pendingVisit(repair)) {
      pending += 1;
      if (isOverdue(repair, now)) overdue += 1;
    }
  }
  return { pending, overdue };
}
