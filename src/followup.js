// 维修回访业务规则：纯函数，不依赖 DOM 与本地存储，可单独复用/测试。

export const FOLLOWUP_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

// 不满意时必须选择的返工原因
export const REWORK_REASONS = [
  { value: "recurrence", label: "问题复现，未彻底修好" },
  { value: "material", label: "配件或材料再次故障" },
  { value: "cost", label: "维修费用有争议" },
  { value: "service", label: "师傅服务不到位" },
  { value: "other", label: "其他返工原因" }
];

// 完工即排七天后回访。
// 同一事项上一轮回访未完成前，不允许重复排期（直接返回既有排期）。
export function scheduleFollowUp(repair, now = Date.now()) {
  if (isFollowUpPending(repair.followUp)) return repair.followUp;

  // 返工后重新完工：历轮费用、照片等记录保留
  const history = Array.isArray(repair.followUp?.history) ? repair.followUp.history : [];

  repair.followUp = {
    scheduledAt: now,
    dueAt: now + FOLLOWUP_DAYS * DAY_MS,
    delayUsed: false,
    delayReason: "",
    delayedAt: null,
    completedAt: null,
    result: null, // "satisfied" | "rework"
    reworkReason: "",
    history
  };
  return repair.followUp;
}

// 每项（本轮）回访只能延期一次，且必须写原因；延期后顺延七天。
export function postponeFollowUp(followUp, reason, now = Date.now()) {
  if (!isFollowUpPending(followUp)) {
    throw new Error("该回访已完成，不能再延期");
  }
  if (followUp.delayUsed) {
    throw new Error("每项回访只能延期一次");
  }
  const trimmed = String(reason ?? "").trim();
  if (!trimmed) {
    throw new Error("延期必须填写原因");
  }
  followUp.delayUsed = true;
  followUp.delayReason = trimmed;
  followUp.delayedAt = now;
  followUp.dueAt += FOLLOWUP_DAYS * DAY_MS;
}

// 登记回访结果：满意结案；不满意必须选返工原因并退回处理中。
export function resolveFollowUp(repair, satisfied, reworkReason, now = Date.now()) {
  const followUp = repair.followUp;
  if (!isFollowUpPending(followUp)) {
    throw new Error("该事项没有待完成的回访");
  }

  // 先做全部校验，再修改状态，避免被拒绝的提交污染数据
  let reasonValue = "";
  if (!satisfied) {
    reasonValue = String(reworkReason ?? "").trim();
    if (!REWORK_REASONS.some((item) => item.value === reasonValue)) {
      throw new Error("回访不满意时，必须选择返工原因");
    }
  }

  followUp.completedAt = now;

  if (satisfied) {
    followUp.result = "satisfied";
    repair.status = "closed";
    return;
  }

  followUp.result = "rework";
  followUp.reworkReason = reasonValue;

  // 原费用和照片留在历史里，再退回处理中
  followUp.history.push({
    completedAt: followUp.scheduledAt,
    recordedAt: now,
    cost: Number(repair.cost || 0),
    photo: repair.photo || "",
    reworkReason: reasonValue
  });
  repair.status = "doing";
}

export function isFollowUpPending(followUp) {
  return Boolean(followUp) && followUp.completedAt === null;
}

export function isFollowUpOverdue(followUp, now = Date.now()) {
  return isFollowUpPending(followUp) && followUp.dueAt < now;
}

export function getOverdueRepairs(repairs, now = Date.now()) {
  return repairs.filter((repair) => isFollowUpOverdue(repair.followUp, now));
}

export function reworkReasonLabel(value) {
  return REWORK_REASONS.find((item) => item.value === value)?.label ?? String(value ?? "");
}

export function formatDate(timestamp) {
  return new Date(timestamp).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
}
