const SUPABASE_URL = "https://crigkewtzvslkpmsufxk.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNyaWdrZXd0enZzbGtwbXN1ZnhrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0MDc5OTQsImV4cCI6MjA5Mzk4Mzk5NH0.G13M84Qz7mjLXuCtdCHe07BpP7feeBwVD4c2K4czot4";

const state = {
  rows: [],
  filteredRows: [],
  machines: [],
  repeats: [],
  pmSuggestions: [],
  rcaHints: [],
  charts: {},
  supabase: null
};

const els = {};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  cacheElements();
  bindEvents();
  setDefaultDates(30);
  refreshIcons();

  if (!validateSupabaseConfig()) {
    setStatus("ยังไม่ได้ตั้งค่า Supabase", "error");
    toast("กรุณาใส่ SUPABASE_URL และ SUPABASE_ANON_KEY ใน ai-maintenance.js", "error");
    clearAllData();
    return;
  }

  state.supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  await loadAndAnalyze();
}

function cacheElements() {
  Object.assign(els, {
    statusDot: document.getElementById("statusDot"),
    systemStatus: document.getElementById("systemStatus"),

    fromDate: document.getElementById("fromDate"),
    toDate: document.getElementById("toDate"),
    shiftFilter: document.getElementById("shiftFilter"),
    machineFilter: document.getElementById("machineFilter"),

    analyzeBtn: document.getElementById("analyzeBtn"),
    refreshBtn: document.getElementById("refreshBtn"),
    last7Btn: document.getElementById("last7Btn"),
    last30Btn: document.getElementById("last30Btn"),
    thisMonthBtn: document.getElementById("thisMonthBtn"),

    highRiskCount: document.getElementById("highRiskCount"),
    repeatProblemCount: document.getElementById("repeatProblemCount"),
    pmSuggestCount: document.getElementById("pmSuggestCount"),
    confidenceScore: document.getElementById("confidenceScore"),

    riskFocusTitle: document.getElementById("riskFocusTitle"),
    riskFocusDesc: document.getElementById("riskFocusDesc"),
    repeatFocusTitle: document.getElementById("repeatFocusTitle"),
    repeatFocusDesc: document.getElementById("repeatFocusDesc"),
    pmFocusTitle: document.getElementById("pmFocusTitle"),
    pmFocusDesc: document.getElementById("pmFocusDesc"),

    machineRiskCards: document.getElementById("machineRiskCards"),
    repeatProblemList: document.getElementById("repeatProblemList"),
    pmRecommendationList: document.getElementById("pmRecommendationList"),
    rcaHintList: document.getElementById("rcaHintList"),

    aiReportText: document.getElementById("aiReportText"),
    copyReportBtn: document.getElementById("copyReportBtn"),

    toast: document.getElementById("toast")
  });
}

function bindEvents() {
  els.analyzeBtn?.addEventListener("click", loadAndAnalyze);
  els.refreshBtn?.addEventListener("click", loadAndAnalyze);

  els.shiftFilter?.addEventListener("change", applyFiltersAndAnalyze);
  els.machineFilter?.addEventListener("change", applyFiltersAndAnalyze);

  els.last7Btn?.addEventListener("click", () => {
    setDefaultDates(7);
    loadAndAnalyze();
  });

  els.last30Btn?.addEventListener("click", () => {
    setDefaultDates(30);
    loadAndAnalyze();
  });

  els.thisMonthBtn?.addEventListener("click", () => {
    const today = new Date();
    const first = new Date(today.getFullYear(), today.getMonth(), 1);
    els.fromDate.value = formatDateInput(first);
    els.toDate.value = formatDateInput(today);
    loadAndAnalyze();
  });

  els.copyReportBtn?.addEventListener("click", copyReport);

  window.addEventListener("resize", debounce(() => {
    Object.values(state.charts).forEach(chart => {
      if (chart && typeof chart.resize === "function") chart.resize();
    });
  }, 200));
}

function validateSupabaseConfig() {
  const invalidUrl =
    !SUPABASE_URL ||
    SUPABASE_URL.includes("ใส่_") ||
    !SUPABASE_URL.startsWith("https://") ||
    !SUPABASE_URL.includes(".supabase.co");

  const invalidKey =
    !SUPABASE_ANON_KEY ||
    SUPABASE_ANON_KEY.includes("ใส่_") ||
    SUPABASE_ANON_KEY.length < 50;

  return !(invalidUrl || invalidKey);
}

function setDefaultDates(daysBack = 30) {
  const today = new Date();
  const from = new Date();
  from.setDate(today.getDate() - daysBack + 1);

  els.fromDate.value = formatDateInput(from);
  els.toDate.value = formatDateInput(today);
}

async function loadAndAnalyze() {
  try {
    if (!validateSupabaseConfig()) {
      throw new Error("ยังไม่ได้ใส่ SUPABASE_URL หรือ SUPABASE_ANON_KEY จริง");
    }

    if (!state.supabase) {
      state.supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }

    setStatus("กำลังโหลดข้อมูล...", "warning");

    let { data, error } = await state.supabase
      .from("repair_logs")
      .select("*")
      .gte("repair_date", els.fromDate.value)
      .lte("repair_date", els.toDate.value)
      .order("repair_date", { ascending: false })
      .order("created_at", { ascending: false });

    // fallback: บางฐานอาจไม่มี created_at หรือ order ซ้อนแล้ว error
    if (error) {
      const msg = String(error.message || error.details || error.hint || "").toLowerCase();
      if (msg.includes("created_at") || msg.includes("order")) {
        const retry = await state.supabase
          .from("repair_logs")
          .select("*")
          .gte("repair_date", els.fromDate.value)
          .lte("repair_date", els.toDate.value)
          .order("repair_date", { ascending: false });
        data = retry.data;
        error = retry.error;
      }
    }

    if (error) throw error;

    state.rows = Array.isArray(data) ? data : [];
    populateMachineFilter(state.rows);
    applyFiltersAndAnalyze();

    setStatus("พร้อมใช้งาน", "success");
    toast(`โหลดข้อมูลสำเร็จ ${state.rows.length} รายการ`, "success");
  } catch (err) {
    console.error("Supabase Load Error:", err);

    const msg =
      err?.message ||
      err?.hint ||
      err?.details ||
      JSON.stringify(err) ||
      "Unknown error";

    setStatus("โหลดข้อมูลไม่สำเร็จ", "error");
    toast(`โหลดข้อมูลไม่สำเร็จ: ${msg}`, "error");
    clearAllData();
  }
}

function clearAllData() {
  state.rows = [];
  state.filteredRows = [];
  state.machines = [];
  state.repeats = [];
  state.pmSuggestions = [];
  state.rcaHints = [];
  Object.keys(state.charts).forEach(destroyChart);
  renderAll();
}

function populateMachineFilter(rows) {
  const current = els.machineFilter.value;

  const machines = [...new Set(
    rows.map(row => clean(row.machine_name)).filter(Boolean)
  )].sort((a, b) => a.localeCompare(b, "th"));

  els.machineFilter.innerHTML =
    `<option value="">ทั้งหมด</option>` +
    machines.map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("");

  if (machines.includes(current)) els.machineFilter.value = current;
}

function applyFiltersAndAnalyze() {
  const shift = els.shiftFilter.value;
  const machine = els.machineFilter.value;

  state.filteredRows = state.rows.filter(row => {
    if (shift && clean(row.shift) !== shift) return false;
    if (machine && clean(row.machine_name) !== machine) return false;
    return true;
  });

  runAiEngine();
  renderAll();
}

function runAiEngine() {
  const rows = state.filteredRows;

  state.machines = analyzeMachineRisk(rows);
  state.repeats = analyzeRepeatProblems(rows);
  state.pmSuggestions = createPmSuggestions(rows, state.machines, state.repeats);
  state.rcaHints = createRcaHints(rows, state.repeats);
}

/* ================= AI Engine ================= */

function analyzeMachineRisk(rows) {
  const grouped = {};
  const referenceDate = getReferenceDate();

  rows.forEach(row => {
    const key = `${row.machine_name || "-"}|${row.machine_no || "-"}`;

    if (!grouped[key]) {
      grouped[key] = {
        machine_name: row.machine_name || "-",
        machine_no: row.machine_no || "-",
        production_line: row.production_line || "-",
        rows: []
      };
    }

    grouped[key].rows.push(row);
  });

  const totalDowntimeAll = sumBy(rows, row => num(row.loss_time_min));
  const avgDowntimePerMachine = Object.keys(grouped).length
    ? totalDowntimeAll / Object.keys(grouped).length
    : 0;

  return Object.values(grouped).map(item => {
    const machineRows = item.rows;
    const failureCount = machineRows.length;
    const downtime = sumBy(machineRows, row => num(row.loss_time_min));
    const avgMttr = failureCount ? downtime / failureCount : 0;

    const repeatProblem = topCount(machineRows, row => row.problem_name || "-");
    const repeatArea = topCount(machineRows, row => row.area_point_name || "-");

    const followUpCount = machineRows.filter(row => isFollowUp(row.repair_result)).length;
    const severeCount = machineRows.filter(row => String(row.severity || "").includes("รุนแรง")).length;
    const highDowntimeCount = machineRows.filter(row => num(row.loss_time_min) >= 60).length;

    const sortedDates = getSortedRepairDates(machineRows);
    const lastDate = sortedDates.length ? sortedDates[sortedDates.length - 1] : null;
    const daysSinceLast = lastDate ? daysBetween(lastDate, referenceDate) : 999;

    const recent30Count = countRowsInRange(machineRows, referenceDate, 0, 30);
    const previous30Count = countRowsInRange(machineRows, referenceDate, 31, 60);

    const trendRatio = previous30Count > 0
      ? recent30Count / previous30Count
      : recent30Count > 0 ? 2 : 0;

    const trendLabel = getTrendLabel(trendRatio);
    const intervalStats = calculateFailureIntervalStats(sortedDates);
    const category = classifyCategory(machineRows);

    const prediction = predictNextFailure({
      intervalStats,
      daysSinceLast,
      trendRatio,
      repeatProblemCount: repeatProblem.count,
      repeatAreaCount: repeatArea.count,
      followUpCount,
      severeCount,
      highDowntimeCount,
      avgMttr,
      lastDate,
      referenceDate,
      failureCount
    });

    let score = 0;
    const reasons = [];

    score += prediction.probability30 * 0.38;

    if (failureCount > 0) {
      score += Math.min(18, failureCount * 3);
      reasons.push(`มีประวัติเสีย ${failureCount} ครั้ง`);
    }

    if (downtime > 0) {
      score += Math.min(14, downtime / 35);
      reasons.push(`Downtime รวม ${formatNumber(downtime)} นาที`);
    }

    if (downtime > avgDowntimePerMachine && downtime > 0) {
      score += 6;
      reasons.push(`Downtime สูงกว่าค่าเฉลี่ยของเครื่องอื่น`);
    }

    if (repeatProblem.count >= 2) {
      score += Math.min(12, repeatProblem.count * 4);
      reasons.push(`อาการซ้ำ: ${repeatProblem.name} (${repeatProblem.count} ครั้ง)`);
    }

    if (repeatArea.count >= 2) {
      score += Math.min(10, repeatArea.count * 3);
      reasons.push(`จุดเสียซ้ำ: ${repeatArea.name} (${repeatArea.count} ครั้ง)`);
    }

    if (followUpCount > 0) {
      score += Math.min(12, followUpCount * 6);
      reasons.push(`มีงานที่ต้องติดตาม/แก้ไขชั่วคราว ${followUpCount} รายการ`);
    }

    if (severeCount > 0) {
      score += Math.min(10, severeCount * 5);
      reasons.push(`มีงานระดับรุนแรง ${severeCount} รายการ`);
    }

    if (highDowntimeCount > 0) {
      score += Math.min(10, highDowntimeCount * 5);
      reasons.push(`มีงาน Downtime ≥ 60 นาที ${highDowntimeCount} รายการ`);
    }

    if (avgMttr >= 37) {
      score += 6;
      reasons.push(`MTTR เฉลี่ยสูง ${formatNumber(avgMttr, 1)} นาที/ครั้ง`);
    }

    if (trendRatio >= 1.5) {
      score += 8;
      reasons.push(`แนวโน้มเสียเพิ่มขึ้นเมื่อเทียบกับช่วงก่อนหน้า`);
    }

    if (prediction.isOverdue) {
      score += 8;
      reasons.push(`เลยรอบเสี่ยงตาม Pattern การเสียเดิมแล้ว`);
    }

    score = clamp(Math.round(score), 0, 100);

    return {
      ...item,
      failureCount,
      downtime,
      avgMttr,
      repeatProblem,
      repeatArea,
      followUpCount,
      severeCount,
      highDowntimeCount,
      lastDate: lastDate ? formatDateInput(lastDate) : "-",
      daysSinceLast,
      recent30Count,
      previous30Count,
      trendRatio,
      trendLabel,
      intervalStats,
      category,
      prediction,
      riskScore: score,
      riskLevel: getPredictiveRiskLevel(score, prediction.probability30),
      riskClass: getPredictiveRiskClass(score, prediction.probability30),
      reasons,
      suggestion: createPredictiveSuggestion({
        category,
        problem: repeatProblem.name,
        area: repeatArea.name,
        score,
        prediction,
        trendLabel
      })
    };
  }).sort((a, b) => {
    if (b.prediction.probability30 !== a.prediction.probability30) {
      return b.prediction.probability30 - a.prediction.probability30;
    }

    return b.riskScore - a.riskScore;
  });
}

function analyzeRepeatProblems(rows) {
  const grouped = {};

  rows.forEach(row => {
    const key = `${row.machine_name || "-"}|${row.machine_no || "-"}|${row.area_point_name || "-"}|${row.problem_name || "-"}`;

    if (!grouped[key]) {
      grouped[key] = {
        machine_name: row.machine_name || "-",
        machine_no: row.machine_no || "-",
        area_point_name: row.area_point_name || "-",
        problem_name: row.problem_name || "-",
        rows: []
      };
    }

    grouped[key].rows.push(row);
  });

  return Object.values(grouped)
    .filter(item => item.rows.length >= 2)
    .map(item => {
      const downtime = sumBy(item.rows, row => num(row.loss_time_min));
      const category = classifyCategory(item.rows);

      return {
        ...item,
        count: item.rows.length,
        downtime,
        category,
        lastDate: item.rows.map(row => row.repair_date).sort().reverse()[0],
        rca: createRcaSuggestion(category, item.problem_name, item.area_point_name)
      };
    })
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return b.downtime - a.downtime;
    });
}

function createPmSuggestions(rows, machines, repeats) {
  const suggestions = [];

  machines
    .filter(machine => machine.riskScore >= 40 || machine.prediction.probability30 >= 45)
    .slice(0, 8)
    .forEach(machine => {
      suggestions.push({
        title: `${machine.machine_name} | ${machine.machine_no}`,
        level: machine.riskScore >= 70 || machine.prediction.probability30 >= 70 ? "danger" : "warning",
        detail: machine.suggestion,
        reason: `Risk ${machine.riskScore}, Probability 30 วัน ${machine.prediction.probability30}%, Downtime ${formatNumber(machine.downtime)} นาที, เสีย ${machine.failureCount} ครั้ง`
      });
    });

  repeats.slice(0, 8).forEach(item => {
    suggestions.push({
      title: `${item.machine_name} | ${item.machine_no} | ${item.area_point_name}`,
      level: item.count >= 3 ? "danger" : "warning",
      detail: `เพิ่ม PM ตรวจสอบ "${item.problem_name}" และจุด "${item.area_point_name}"`,
      reason: `พบซ้ำ ${item.count} ครั้ง, Downtime รวม ${formatNumber(item.downtime)} นาที`
    });
  });

  return uniqueBy(suggestions, item => item.title + item.detail).slice(0, 12);
}

function createRcaHints(rows, repeats) {
  return repeats.slice(0, 10).map(item => ({
    title: `${item.machine_name} | ${item.machine_no}`,
    level: item.count >= 3 ? "danger" : "warning",
    detail: item.rca,
    reason: `อาการ "${item.problem_name}" ที่จุด "${item.area_point_name}" เกิดซ้ำ ${item.count} ครั้ง`
  }));
}

/* ================= Predictive Engine ================= */

function getReferenceDate() {
  return els.toDate?.value
    ? new Date(`${els.toDate.value}T00:00:00`)
    : new Date();
}

function parseRepairDate(value) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getSortedRepairDates(rows) {
  return rows
    .map(row => parseRepairDate(row.repair_date))
    .filter(Boolean)
    .sort((a, b) => a - b);
}

function daysBetween(startDate, endDate) {
  const ms = endDate - startDate;
  return Math.max(0, Math.round(ms / (1000 * 60 * 60 * 24)));
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + Math.round(days));
  return result;
}

function countRowsInRange(rows, referenceDate, minDaysAgo, maxDaysAgo) {
  return rows.filter(row => {
    const date = parseRepairDate(row.repair_date);
    if (!date) return false;

    const diff = daysBetween(date, referenceDate);
    return diff >= minDaysAgo && diff <= maxDaysAgo;
  }).length;
}

function calculateFailureIntervalStats(sortedDates) {
  if (!sortedDates.length) {
    return {
      intervals: [],
      avgGapDays: 999,
      weightedGapDays: 999
    };
  }

  if (sortedDates.length === 1) {
    return {
      intervals: [],
      avgGapDays: 30,
      weightedGapDays: 30
    };
  }

  const intervals = [];

  for (let i = 1; i < sortedDates.length; i++) {
    const gap = Math.max(0.5, daysBetween(sortedDates[i - 1], sortedDates[i]));
    intervals.push(gap);
  }

  return {
    intervals,
    avgGapDays: average(intervals),
    weightedGapDays: weightedAverageRecent(intervals)
  };
}

function weightedAverageRecent(values) {
  if (!values.length) return 999;

  let weightSum = 0;
  let valueSum = 0;

  values.forEach((value, index) => {
    const weight = index + 1;
    weightSum += weight;
    valueSum += value * weight;
  });

  return valueSum / weightSum;
}

function predictNextFailure(params) {
  const {
    intervalStats,
    daysSinceLast,
    trendRatio,
    repeatProblemCount,
    repeatAreaCount,
    followUpCount,
    severeCount,
    highDowntimeCount,
    avgMttr,
    lastDate,
    referenceDate,
    failureCount
  } = params;

  let expectedGap = intervalStats.weightedGapDays || intervalStats.avgGapDays || 30;
  if (!Number.isFinite(expectedGap) || expectedGap <= 0) expectedGap = 30;

  let adjustment = 1;

  if (trendRatio >= 2) adjustment *= 0.65;
  else if (trendRatio >= 1.5) adjustment *= 0.75;
  else if (trendRatio >= 1.15) adjustment *= 0.88;
  else if (trendRatio < 0.75 && trendRatio > 0) adjustment *= 1.15;

  if (repeatProblemCount >= 3) adjustment *= 0.78;
  else if (repeatProblemCount >= 2) adjustment *= 0.88;

  if (repeatAreaCount >= 3) adjustment *= 0.82;
  else if (repeatAreaCount >= 2) adjustment *= 0.9;

  if (followUpCount > 0) adjustment *= 0.82;
  if (severeCount > 0) adjustment *= 0.88;
  if (highDowntimeCount > 0) adjustment *= 0.9;
  if (avgMttr >= 60) adjustment *= 0.86;
  else if (avgMttr >= 37) adjustment *= 0.93;

  const predictedGapDays = Math.max(1, expectedGap * adjustment);
  const overdueRatio = predictedGapDays > 0 ? daysSinceLast / predictedGapDays : 0;
  const isOverdue = overdueRatio >= 1;

  const probability7 = calculateFailureProbability(7, predictedGapDays, overdueRatio, trendRatio, failureCount);
  const probability14 = calculateFailureProbability(14, predictedGapDays, overdueRatio, trendRatio, failureCount);
  const probability30 = calculateFailureProbability(30, predictedGapDays, overdueRatio, trendRatio, failureCount);

  const predictedDate = lastDate ? addDays(lastDate, predictedGapDays) : null;
  const daysToPredicted = predictedDate
    ? Math.round((predictedDate - referenceDate) / (1000 * 60 * 60 * 24))
    : null;

  const predictionConfidence = calculatePredictionConfidence({
    failureCount,
    intervalCount: intervalStats.intervals.length,
    trendRatio,
    predictedGapDays
  });

  return {
    expectedGapDays: expectedGap,
    predictedGapDays,
    predictedDate: predictedDate ? formatDateInput(predictedDate) : "-",
    daysToPredicted,
    isOverdue,
    overdueRatio,
    probability7,
    probability14,
    probability30,
    predictionConfidence,
    forecastLabel: createForecastLabel(daysToPredicted)
  };
}

function calculateFailureProbability(horizonDays, predictedGapDays, overdueRatio, trendRatio, failureCount) {
  if (!failureCount) return 0;

  const base = 1 - Math.exp(-horizonDays / Math.max(1, predictedGapDays));
  let factor = 1;

  if (overdueRatio >= 1.5) factor *= 1.45;
  else if (overdueRatio >= 1) factor *= 1.25;
  else if (overdueRatio >= 0.75) factor *= 1.1;

  if (trendRatio >= 2) factor *= 1.25;
  else if (trendRatio >= 1.5) factor *= 1.15;
  else if (trendRatio < 0.75 && trendRatio > 0) factor *= 0.9;

  if (failureCount < 3) factor *= 0.78;

  return clamp(Math.round(base * factor * 100), 0, 98);
}

function calculatePredictionConfidence({ failureCount, intervalCount, trendRatio, predictedGapDays }) {
  let confidence = 25;

  confidence += Math.min(35, failureCount * 5);
  confidence += Math.min(25, intervalCount * 7);

  if (trendRatio > 0) confidence += 8;
  if (predictedGapDays < 999) confidence += 7;

  if (failureCount < 3) confidence -= 15;
  if (intervalCount < 2) confidence -= 10;

  return clamp(Math.round(confidence), 20, 95);
}

function getTrendLabel(trendRatio) {
  if (trendRatio >= 2) return "เพิ่มขึ้นแรง";
  if (trendRatio >= 1.5) return "เพิ่มขึ้น";
  if (trendRatio >= 1.15) return "เริ่มเพิ่มขึ้น";
  if (trendRatio > 0 && trendRatio < 0.75) return "ลดลง";
  if (trendRatio === 0) return "ยังไม่มีแนวโน้ม";
  return "ทรงตัว";
}

function createForecastLabel(daysToPredicted) {
  if (daysToPredicted === null) return "ข้อมูลยังไม่พอสำหรับคาดการณ์";
  if (daysToPredicted < 0) return `เลยรอบเสี่ยงมาแล้ว ${Math.abs(daysToPredicted)} วัน`;
  if (daysToPredicted === 0) return "อยู่ในรอบเสี่ยงวันนี้";
  if (daysToPredicted <= 7) return `มีโอกาสเข้าสู่รอบเสี่ยงใน ${daysToPredicted} วัน`;
  if (daysToPredicted <= 30) return `คาดว่าเข้าสู่รอบเสี่ยงใน ${daysToPredicted} วัน`;
  return `คาดว่าเสี่ยงในระยะถัดไปประมาณ ${daysToPredicted} วัน`;
}

function getPredictiveRiskLevel(score, probability30) {
  if (score >= 75 || probability30 >= 70) return "เสี่ยงสูง";
  if (score >= 45 || probability30 >= 45) return "เฝ้าระวัง";
  return "ปกติ";
}

function getPredictiveRiskClass(score, probability30) {
  if (score >= 75 || probability30 >= 70) return "high";
  if (score >= 45 || probability30 >= 45) return "watch";
  return "normal";
}

function createPredictiveSuggestion({ category, problem, area, score, prediction, trendLabel }) {
  const probability = prediction.probability30;
  const forecast = prediction.forecastLabel;

  let priority = "ติดตามตามรอบ PM ปกติ";

  if (score >= 75 || probability >= 70) {
    priority = "ควรตรวจสอบเชิงป้องกันเร่งด่วน";
  } else if (score >= 45 || probability >= 45) {
    priority = "ควรวางแผนตรวจสอบในรอบ PM ถัดไป";
  }

  let action = "";

  if (category.includes("Air")) {
    action = `ตรวจสอบกระบอกลม, Speed Control, สายลม, ข้อต่อลม และชุด Clamp โดยเน้นจุด ${area}`;
  } else if (category.includes("Heater")) {
    action = `ตรวจสอบ Heater, Terminal, สายไฟ, SSR/Relay และอุณหภูมิทำงาน โดยเน้นจุด ${area}`;
  } else if (category.includes("Sensor")) {
    action = `ตรวจสอบ Sensor, Limit Switch, Connector, สายสัญญาณ, Inverter/Drive และจุด Alarm ที่เกี่ยวข้อง`;
  } else if (category.includes("Cooling")) {
    action = `ตรวจสอบ Chiller, Y-Strainer, Hose, จุดรั่วซึม และการไหลเวียนของน้ำ`;
  } else if (category.includes("Mechanical")) {
    action = `ตรวจสอบ Bearing, Roller, Chain, Belt, จุดยึด, รางเลื่อน และชิ้นส่วนสึกหรอ`;
  } else if (category.includes("Hydraulic")) {
    action = `ตรวจสอบระดับน้ำมัน, ซีล, โอริง, ปั๊ม และจุดรั่วซึม`;
  } else if (category.includes("Vacuum")) {
    action = `ตรวจสอบ Vacuum Pump, Filter, Oil, Hose, Seal และจุดรั่วในระบบ Vacuum`;
  } else {
    action = `ตรวจสอบปัญหา ${problem} ที่จุด ${area} และติดตาม Pattern การเสียซ้ำ`;
  }

  return `${priority}: ${action} | Forecast: ${forecast} | แนวโน้ม: ${trendLabel}`;
}

/* ================= Render ================= */

function renderAll() {
  renderKpis();
  renderFocusCards();
  renderMachineRiskCards();
  renderRepeatProblems();
  renderPmSuggestions();
  renderRcaHints();
  renderCharts();
  renderReport();
  refreshIcons();
}

function renderKpis() {
  const highRisk = state.machines.filter(item => item.riskScore >= 75 || item.prediction.probability30 >= 70).length;
  const repeats = state.repeats.length;
  const pmCount = state.pmSuggestions.length;
  const confidence = calculateConfidence(state.filteredRows.length);

  els.highRiskCount.textContent = formatNumber(highRisk);
  els.repeatProblemCount.textContent = formatNumber(repeats);
  els.pmSuggestCount.textContent = formatNumber(pmCount);
  els.confidenceScore.textContent = `${confidence}%`;
}

function renderFocusCards() {
  const topMachine = state.machines[0];
  const topRepeat = state.repeats[0];
  const topPm = state.pmSuggestions[0];

  els.riskFocusTitle.textContent = topMachine
    ? `${topMachine.machine_name} | ${topMachine.machine_no}`
    : "-";

  els.riskFocusDesc.textContent = topMachine
    ? `Risk ${topMachine.riskScore}, โอกาสเสียใน 30 วัน ${topMachine.prediction.probability30}%, ${topMachine.prediction.forecastLabel}`
    : "ยังไม่มีข้อมูลเครื่องจักรเสี่ยง";

  els.repeatFocusTitle.textContent = topRepeat
    ? `${topRepeat.machine_name} | ${topRepeat.machine_no} | ${topRepeat.area_point_name}`
    : "-";

  els.repeatFocusDesc.textContent = topRepeat
    ? `อาการ "${topRepeat.problem_name}" พบซ้ำ ${topRepeat.count} ครั้ง, Downtime รวม ${formatNumber(topRepeat.downtime)} นาที`
    : "ยังไม่พบปัญหาซ้ำชัดเจน";

  els.pmFocusTitle.textContent = topPm ? topPm.title : "-";
  els.pmFocusDesc.textContent = topPm
    ? `${topPm.detail} (${topPm.reason})`
    : "ยังไม่มีหัวข้อ PM ที่ AI แนะนำ";
}

function renderMachineRiskCards() {
  const data = state.machines.slice(0, 9);

  if (!data.length) {
    els.machineRiskCards.innerHTML = `<div class="empty">ไม่มีข้อมูลสำหรับวิเคราะห์</div>`;
    return;
  }

  els.machineRiskCards.innerHTML = data.map(item => `
    <div class="risk-card ${item.riskClass}">
      <div class="risk-top">
        <div>
          <div class="risk-machine">${escapeHtml(item.machine_name)} | ${escapeHtml(item.machine_no)}</div>
          <div class="risk-sub">${escapeHtml(item.production_line)} · Last: ${escapeHtml(item.lastDate || "-")}</div>
        </div>
        <div class="risk-score ${item.riskClass}">${item.riskScore}</div>
      </div>

      <div class="risk-level ${item.riskClass}">${item.riskLevel}</div>

      <div class="prediction-box">
        <div><strong>Forecast:</strong> ${escapeHtml(item.prediction.forecastLabel)}</div>
        <div><strong>คาดการณ์วันที่เสี่ยง:</strong> ${escapeHtml(item.prediction.predictedDate)}</div>
        <div><strong>โอกาสเสียใน 7 วัน:</strong> ${item.prediction.probability7}%</div>
        <div><strong>โอกาสเสียใน 14 วัน:</strong> ${item.prediction.probability14}%</div>
        <div><strong>โอกาสเสียใน 30 วัน:</strong> ${item.prediction.probability30}%</div>
        <div><strong>Prediction Confidence:</strong> ${item.prediction.predictionConfidence}%</div>
      </div>

      <div class="risk-desc">
        ปัญหาหลัก: ${escapeHtml(item.repeatProblem.name)} / จุดเสียหลัก: ${escapeHtml(item.repeatArea.name)}
      </div>

      <div class="reason-list">
        ${item.reasons.slice(0, 5).map(reason => `<div>• ${escapeHtml(reason)}</div>`).join("")}
      </div>

      <div class="risk-desc">
        <strong>AI Suggest:</strong><br>
        ${escapeHtml(item.suggestion)}
      </div>
    </div>
  `).join("");
}

function renderRepeatProblems() {
  if (!state.repeats.length) {
    els.repeatProblemList.innerHTML = `<div class="empty">ยังไม่พบปัญหาซ้ำในช่วงวันที่เลือก</div>`;
    return;
  }

  els.repeatProblemList.innerHTML = state.repeats.slice(0, 10).map(item => `
    <div class="analysis-item ${item.count >= 3 ? "danger" : "warning"}">
      <h3>${escapeHtml(item.machine_name)} | ${escapeHtml(item.machine_no)} | ${escapeHtml(item.area_point_name)}</h3>
      <p>
        พบอาการ "${escapeHtml(item.problem_name)}" ซ้ำ ${item.count} ครั้ง,
        Downtime รวม ${formatNumber(item.downtime)} นาที,
        กลุ่มปัญหา: ${escapeHtml(item.category)}
      </p>
    </div>
  `).join("");
}

function renderPmSuggestions() {
  if (!state.pmSuggestions.length) {
    els.pmRecommendationList.innerHTML = `<div class="empty">ยังไม่มีหัวข้อ PM ที่ต้องเพิ่มเป็นพิเศษ</div>`;
    return;
  }

  els.pmRecommendationList.innerHTML = state.pmSuggestions.map(item => `
    <div class="pm-item ${item.level}">
      <h3>${escapeHtml(item.title)}</h3>
      <p>${escapeHtml(item.detail)}</p>
      <p><strong>เหตุผล:</strong> ${escapeHtml(item.reason)}</p>
    </div>
  `).join("");
}

function renderRcaHints() {
  if (!state.rcaHints.length) {
    els.rcaHintList.innerHTML = `<div class="empty">ยังไม่มีปัญหาซ้ำที่ต้องทำ RCA ชัดเจน</div>`;
    return;
  }

  els.rcaHintList.innerHTML = state.rcaHints.map(item => `
    <div class="analysis-item ${item.level}">
      <h3>${escapeHtml(item.title)}</h3>
      <p>${escapeHtml(item.reason)}</p>
      <p><strong>RCA Hint:</strong> ${escapeHtml(item.detail)}</p>
    </div>
  `).join("");
}

function renderCharts() {
  renderRiskChart();
  renderCategoryChart();
}

function renderRiskChart() {
  const top = state.machines.slice(0, 10);

  createBarChart(
    "riskChart",
    top.map(item => `${item.machine_name} | ${item.machine_no}`),
    top.map(item => item.riskScore),
    "Risk Score",
    "#ef4444"
  );
}

function renderCategoryChart() {
  const grouped = groupCount(state.filteredRows, row => classifyCategory([row]));
  const sorted = sortEntries(grouped);

  createDoughnutChart(
    "categoryChart",
    sorted.map(item => item[0]),
    sorted.map(item => item[1])
  );
}

function renderReport() {
  const highRisk = state.machines.filter(item => item.riskScore >= 75 || item.prediction.probability30 >= 70);
  const watchRisk = state.machines.filter(item => {
    const isHigh = item.riskScore >= 75 || item.prediction.probability30 >= 70;
    const isWatch = item.riskScore >= 45 || item.prediction.probability30 >= 45;
    return !isHigh && isWatch;
  });

  const topMachine = state.machines[0];
  const topRepeat = state.repeats[0];
  const confidence = calculateConfidence(state.filteredRows.length);

  let text = "";

  text += `AI Predictive Maintenance Summary\n`;
  text += `ช่วงวันที่: ${formatDateDisplay(els.fromDate.value)} - ${formatDateDisplay(els.toDate.value)}\n`;
  text += `จำนวนข้อมูลที่นำมาวิเคราะห์: ${state.filteredRows.length} รายการ\n`;
  text += `Overall Confidence Score: ${confidence}%\n\n`;

  text += `1. สรุปภาพรวมการคาดการณ์\n`;
  text += `จากข้อมูลประวัติซ่อมในช่วงที่เลือก AI พบเครื่องจักรเสี่ยงสูง ${highRisk.length} เครื่อง และเครื่องที่ต้องเฝ้าระวัง ${watchRisk.length} เครื่อง `;
  text += `โดยพิจารณาจากความถี่เสีย, ระยะห่างระหว่างการเสีย, Downtime, ปัญหาซ้ำ, งานติดตาม และแนวโน้มล่าสุด\n\n`;

  text += `2. เครื่องจักรที่ควรโฟกัสก่อน\n`;
  if (topMachine) {
    text += `ควรโฟกัสเครื่อง ${topMachine.machine_name} | ${topMachine.machine_no} ก่อน\n`;
    text += `Risk Score: ${topMachine.riskScore} (${topMachine.riskLevel})\n`;
    text += `โอกาสเสียภายใน 7 วัน: ${topMachine.prediction.probability7}%\n`;
    text += `โอกาสเสียภายใน 14 วัน: ${topMachine.prediction.probability14}%\n`;
    text += `โอกาสเสียภายใน 30 วัน: ${topMachine.prediction.probability30}%\n`;
    text += `คาดการณ์รอบเสี่ยง: ${topMachine.prediction.forecastLabel}\n`;
    text += `วันที่คาดว่าเข้าโซนเสี่ยง: ${topMachine.prediction.predictedDate}\n`;
    text += `Prediction Confidence: ${topMachine.prediction.predictionConfidence}%\n`;
    text += `เหตุผลหลัก: ${topMachine.reasons.slice(0, 5).join(", ")}\n`;
    text += `ข้อเสนอแนะ: ${topMachine.suggestion}\n\n`;
  } else {
    text += `ยังไม่พบเครื่องจักรที่มีความเสี่ยงจากข้อมูลในช่วงนี้\n\n`;
  }

  text += `3. เครื่องจักรเสี่ยงสูงที่ควรตรวจเชิงป้องกัน\n`;
  if (highRisk.length) {
    highRisk.slice(0, 5).forEach((item, index) => {
      text += `${index + 1}) ${item.machine_name} | ${item.machine_no}\n`;
      text += `   - Risk: ${item.riskScore}, Probability 30 วัน: ${item.prediction.probability30}%\n`;
      text += `   - Forecast: ${item.prediction.forecastLabel}\n`;
      text += `   - Main Issue: ${item.repeatProblem.name} / ${item.repeatArea.name}\n`;
      text += `   - Suggestion: ${item.suggestion}\n`;
    });
  } else {
    text += `ยังไม่พบเครื่องที่อยู่ในระดับเสี่ยงสูง แต่ควรติดตามกลุ่มเฝ้าระวังต่อเนื่อง\n`;
  }

  text += `\n4. ปัญหาซ้ำที่ควรทำ RCA\n`;
  if (topRepeat) {
    text += `พบปัญหาซ้ำที่ ${topRepeat.machine_name} | ${topRepeat.machine_no} จุด ${topRepeat.area_point_name}\n`;
    text += `อาการ: ${topRepeat.problem_name} พบซ้ำ ${topRepeat.count} ครั้ง Downtime รวม ${formatNumber(topRepeat.downtime)} นาที\n`;
    text += `RCA Hint: ${topRepeat.rca}\n\n`;
  } else {
    text += `ยังไม่พบปัญหาซ้ำชัดเจน แต่ควรติดตามข้อมูลต่อเนื่อง\n\n`;
  }

  text += `5. PM Recommendation\n`;
  if (state.pmSuggestions.length) {
    state.pmSuggestions.slice(0, 6).forEach((item, index) => {
      text += `${index + 1}) ${item.title}\n`;
      text += `   - ${item.detail}\n`;
      text += `   - เหตุผล: ${item.reason}\n`;
    });
  } else {
    text += `ยังไม่มีหัวข้อ PM เพิ่มเติมที่ชัดเจนจากข้อมูลช่วงนี้\n`;
  }

  text += `\n6. ข้อเสนอแนะสำหรับหัวหน้า Maintenance\n`;
  text += `ควรใช้ผล Predictive AI นี้เพื่อจัดลำดับเครื่องจักรที่ต้องตรวจสอบก่อน โดยให้ความสำคัญกับเครื่องที่มี Probability 30 วันสูง, Risk Score สูง, ปัญหาเดิมซ้ำ และ Downtime สูง `;
  text += `หากเครื่องใดเข้าโซนเสี่ยงภายใน 7-14 วัน ควรวางแผนตรวจสอบก่อนเกิด Breakdown จริง และนำหัวข้อที่พบซ้ำไปเพิ่มในแผน PM/RCA รอบถัดไป`;

  els.aiReportText.value = text;
}

/* ================= AI Rules ================= */

function classifyCategory(rows) {
  const text = rows.map(row => [
    row.machine_name,
    row.machine_no,
    row.area_point_name,
    row.problem_name,
    row.cause_name,
    row.action_name,
    row.remark,
    row.breakdown_type
  ].join(" ")).join(" ").toLowerCase();

  const rules = [
    { name: "Air / Pneumatic / Clamp", keywords: ["ลม", "รั่ว", "แคลมป์", "clamp", "air", "กระบอกลม", "speed control"] },
    { name: "Heater / Temperature", keywords: ["heater", "ฮีต", "ฮีท", "อุณหภูมิ", "หลอด", "ssr"] },
    { name: "Sensor / Electrical / Control", keywords: ["sensor", "เซนเซอร์", "ไฟ", "ไฟฟ้า", "alarm", "control", "limit", "inverter", "drive"] },
    { name: "Cooling / Water", keywords: ["น้ำ", "chiller", "หล่อเย็น", "สายยาง", "รั่ว", "วาย", "strainer"] },
    { name: "Mechanical / Wear", keywords: ["สึก", "หลวม", "แตก", "หัก", "bearing", "roller", "โรลเลอร์", "โซ่", "สายพาน", "ติดขัด"] },
    { name: "Hydraulic / Oil", keywords: ["ไฮดรอลิค", "น้ำมัน", "ปั๊ม", "ซีล", "โอริง", "รั่วซึม"] },
    { name: "Vacuum System", keywords: ["vacuum", "แวคคัม", "ปั้ม vacuum", "vacuum pump", "ดูด"] }
  ];

  let best = { name: "General Maintenance", score: 0 };

  rules.forEach(rule => {
    const score = rule.keywords.reduce((count, keyword) => {
      return count + (text.includes(keyword.toLowerCase()) ? 1 : 0);
    }, 0);

    if (score > best.score) best = { name: rule.name, score };
  });

  return best.name;
}

function createRcaSuggestion(category, problem, area) {
  if (category.includes("Air")) {
    return `ตรวจสอบลมรั่ว, แรงดันตก, Speed Control, กระบอกลม, Sensor ตำแหน่ง และจังหวะการทำงานของชุด Clamp`;
  }

  if (category.includes("Heater")) {
    return `ตรวจสอบ Heater, Terminal, SSR/Relay, สายไฟ, จุดต่อหลวม และอุณหภูมิจริงเทียบกับค่าที่ตั้งไว้`;
  }

  if (category.includes("Sensor")) {
    return `ตรวจสอบ Sensor สกปรก, ระยะจับสัญญาณ, Connector, สายสัญญาณ, Inverter/Drive Alarm และ Control Logic`;
  }

  if (category.includes("Cooling")) {
    return `ตรวจสอบการไหลเวียนน้ำ, Y-Strainer, Chiller, Hose, จุดรั่ว และตะกรันในระบบ`;
  }

  if (category.includes("Mechanical")) {
    return `ตรวจสอบ Bearing/Roller/Chain/Belt, จุดยึดหลวม, รางเลื่อนฝืด, Alignment และชิ้นส่วนสึกหรอ`;
  }

  if (category.includes("Hydraulic")) {
    return `ตรวจสอบน้ำมันพร่อง, ซีล/โอริง, ปั๊มแรงดันตก, วาล์วค้าง และสิ่งสกปรกในระบบไฮดรอลิค`;
  }

  if (category.includes("Vacuum")) {
    return `ตรวจสอบ Vacuum Pump, Oil/Filter, Hose รั่ว, Seal เสื่อม, Vacuum Pad และแรงดูดจริง`;
  }

  return `ทำ 5 Why จากอาการ "${problem}" ที่จุด "${area}" โดยตรวจจากสภาพหน้างาน ประวัติซ่อมเดิม อะไหล่ที่เปลี่ยน และเงื่อนไขการเดินเครื่อง`;
}

/* ================= Chart ================= */

function createBarChart(canvasId, labels, values, label, color) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || !window.Chart) return;

  destroyChart(canvasId);

  state.charts[canvasId] = new Chart(canvas, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label,
        data: values,
        backgroundColor: `${color}aa`,
        borderColor: color,
        borderWidth: 1
      }]
    },
    options: chartOptions()
  });
}

function createDoughnutChart(canvasId, labels, values) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || !window.Chart) return;

  destroyChart(canvasId);

  state.charts[canvasId] = new Chart(canvas, {
    type: "doughnut",
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: [
          "#2563eb",
          "#ef4444",
          "#f59e0b",
          "#10b981",
          "#7c3aed",
          "#475569",
          "#14b8a6"
        ],
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "62%",
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            font: { family: "Kanit", size: 12, weight: "500" }
          }
        }
      }
    }
  });
}

function chartOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: {
          font: { family: "Kanit", size: 12, weight: "500" }
        }
      }
    },
    scales: {
      x: {
        ticks: {
          font: { family: "Kanit", size: 11 },
          maxRotation: 25,
          callback: function(value) {
            const label = this.getLabelForValue(value);
            return shorten(label, 20);
          }
        },
        grid: { color: "rgba(148, 163, 184, 0.20)" }
      },
      y: {
        beginAtZero: true,
        ticks: { font: { family: "Kanit", size: 11 } },
        grid: { color: "rgba(148, 163, 184, 0.22)" }
      }
    }
  };
}

function destroyChart(id) {
  if (state.charts[id]) {
    state.charts[id].destroy();
    delete state.charts[id];
  }
}

/* ================= Helpers ================= */

function isFollowUp(value) {
  return ["ใช้งานได้ชั่วคราว", "ต้องติดตามต่อ", "รอซ่อมเพิ่มเติม"].includes(value);
}

function calculateConfidence(count) {
  if (count >= 80) return 95;
  if (count >= 50) return 88;
  if (count >= 30) return 78;
  if (count >= 15) return 65;
  if (count >= 5) return 48;
  if (count > 0) return 30;
  return 0;
}

function topCount(rows, keyFn) {
  const grouped = groupCount(rows, keyFn);
  const top = sortEntries(grouped)[0];

  return {
    name: top ? top[0] : "-",
    count: top ? top[1] : 0
  };
}

function groupCount(rows, keyFn) {
  return rows.reduce((acc, row) => {
    const key = keyFn(row);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function sortEntries(obj) {
  return Object.entries(obj).sort((a, b) => b[1] - a[1]);
}

function sumBy(rows, fn) {
  return rows.reduce((sum, row) => sum + fn(row), 0);
}

function average(values) {
  const filtered = values.filter(value => Number.isFinite(value));
  return filtered.length ? filtered.reduce((a, b) => a + b, 0) / filtered.length : 0;
}

function uniqueBy(items, keyFn) {
  const map = new Map();

  items.forEach(item => {
    const key = keyFn(item);
    if (!map.has(key)) map.set(key, item);
  });

  return Array.from(map.values());
}

function num(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function clean(value) {
  return String(value ?? "").trim();
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function formatDateInput(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDateDisplay(value) {
  if (!value) return "-";

  const date = new Date(`${value}T00:00:00`);

  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

function formatNumber(value, digits = 0) {
  return Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

function shorten(text, max = 18) {
  const value = String(text || "");
  return value.length > max ? value.slice(0, max) + "..." : value;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setStatus(text, type) {
  if (els.systemStatus) els.systemStatus.textContent = text;
  if (!els.statusDot) return;

  if (type === "success") els.statusDot.style.background = "#10b981";
  else if (type === "error") els.statusDot.style.background = "#ef4444";
  else els.statusDot.style.background = "#f59e0b";
}

function toast(message, type = "success") {
  if (!els.toast) return;
  els.toast.className = `toast ${type}`;
  els.toast.textContent = message;

  setTimeout(() => {
    els.toast.className = "toast hidden";
  }, 4200);
}

async function copyReport() {
  const text = els.aiReportText.value.trim();
  if (!text) return toast("ยังไม่มีข้อความให้ Copy", "warning");

  await navigator.clipboard.writeText(text);
  toast("Copy รายงาน AI แล้ว", "success");
}

function debounce(fn, delay = 200) {
  let timer;

  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

function refreshIcons() {
  if (window.lucide) lucide.createIcons();
}
