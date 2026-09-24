// 本地存储：仅负责 localStorage 读写、初始数据与字段兼容，不含回访业务逻辑。

const STORAGE_KEY = "zfl-14-repairs";

function seedState() {
  const day = 24 * 60 * 60 * 1000;
  const now = Date.now();

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
        followUp: null
      },
      {
        id: crypto.randomUUID(),
        location: "卫生间",
        title: "浴霸开关接触不良",
        priority: "medium",
        cost: 180,
        status: "done",
        photo: "",
        note: "已更换开关，待回访",
        // 示例：已到回访日，方便看到逾期单列效果
        followUp: {
          scheduledAt: now - 9 * day,
          dueAt: now - 2 * day,
          delayUsed: false,
          delayReason: "",
          delayedAt: null,
          completedAt: null,
          result: null,
          reworkReason: "",
          history: []
        }
      },
      {
        id: crypto.randomUUID(),
        location: "主卧",
        title: "窗户合页异响",
        priority: "low",
        cost: 120,
        status: "closed",
        photo: "",
        note: "回访满意，已结案",
        followUp: {
          scheduledAt: now - 20 * day,
          dueAt: now - 13 * day,
          delayUsed: false,
          delayReason: "",
          delayedAt: null,
          completedAt: now - 13 * day,
          result: "satisfied",
          reworkReason: "",
          history: []
        }
      }
    ]
  };
}

// 兼容旧版本数据：补齐 followUp、history 字段
function normalize(raw) {
  if (!raw || !Array.isArray(raw.repairs)) return seedState();
  if (typeof raw.filter !== "string") raw.filter = "all";
  raw.repairs.forEach((repair) => {
    if (!repair.followUp) repair.followUp = null;
    if (repair.followUp && !Array.isArray(repair.followUp.history)) {
      repair.followUp.history = [];
    }
  });
  return raw;
}

export function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return seedState();
  try {
    return normalize(JSON.parse(saved));
  } catch {
    return seedState();
  }
}

export function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
