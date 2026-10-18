// Default state: All filters start OFF on every page load/refresh.
let state = {
  extensionEnabled: true,
  hidePerfect: false,
  hideUngraded: false,
  hideGraded: false,
  hideTotals: false,
  dimMode: false,
  calcTotals: false
};

const ALLOWED_STATE_KEYS = [
  'extensionEnabled',
  'hidePerfect',
  'hideUngraded',
  'hideGraded',
  'hideTotals',
  'dimMode',
  'calcTotals'
];

let isTotalsDisabledByProf = false;
let courseId = 'default';
let customWeights = {};
let customDrops = {};
let targetGradeValue = 90;
let lastScoreSignature = '';

function initGradeFocus() {
  const gradesTable = document.querySelector('#grades_summary');
  if (!gradesTable || document.getElementById('cgf-control-bar')) return;

  const match = window.location.pathname.match(/\/courses\/(\d+)/);
  if (match) courseId = match[1];

  loadValidatedSettings();
  detectDisabledTotals();
  loadCanvasDefaultWeights();

  injectStyles();
  injectControlBar(gradesTable);
  setupWhatIfListeners(gradesTable);
  refreshAll();
}

function loadValidatedSettings() {
  customWeights = {};
  customDrops = {};
  try {
    const rawWeights = localStorage.getItem(`cgf_weights_${courseId}`);
    if (rawWeights) {
      const parsed = JSON.parse(rawWeights);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        Object.keys(parsed).forEach(key => {
          const val = Number(parsed[key]);
          if (typeof key === 'string' && key.length <= 120 && Number.isFinite(val) && val >= 0 && val <= 1000) {
            customWeights[key] = val;
          }
        });
      }
    }
  } catch (e) {
    customWeights = {};
  }

  try {
    const rawDrops = localStorage.getItem(`cgf_drops_${courseId}`);
    if (rawDrops) {
      const parsed = JSON.parse(rawDrops);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        Object.keys(parsed).forEach(key => {
          const val = parseInt(parsed[key], 10);
          if (typeof key === 'string' && key.length <= 120 && Number.isFinite(val) && val >= 0 && val <= 100) {
            customDrops[key] = val;
          }
        });
      }
    }
  } catch (e) {
    customDrops = {};
  }

  try {
    const rawTarget = localStorage.getItem(`cgf_target_${courseId}`);
    if (rawTarget !== null) {
      const val = parseFloat(rawTarget);
      if (Number.isFinite(val) && val >= 0 && val <= 200) {
        targetGradeValue = val;
      }
    }
  } catch (e) {}
}

function saveValidatedSettings() {
  try {
    localStorage.setItem(`cgf_weights_${courseId}`, JSON.stringify(customWeights));
    localStorage.setItem(`cgf_drops_${courseId}`, JSON.stringify(customDrops));
    localStorage.setItem(`cgf_target_${courseId}`, String(targetGradeValue));
  } catch (e) {}
}

// Automatically load Canvas sidebar weights if user hasn't typed custom ones yet
function loadCanvasDefaultWeights() {
  const weightRows = document.querySelectorAll('aside table.summary tbody tr, #assignments-not-weighted tbody tr');
  weightRows.forEach(tr => {
    const th = tr.querySelector('th');
    const td = tr.querySelector('td');
    if (th && td) {
      const groupName = th.textContent.trim();
      const weightVal = parseFloat(td.textContent.replace('%', '').trim());
      if (groupName && groupName.toLowerCase() !== 'total' && !isNaN(weightVal)) {
        if (customWeights[groupName] === undefined) {
          customWeights[groupName] = weightVal;
        }
      }
    }
  });
}

function detectDisabledTotals() {
  const rightSide = document.getElementById('student-grades-right-content') || document.body;
  const rightSideText = rightSide ? rightSide.innerText || '' : '';
  const hasDisabledText = rightSideText.includes('Calculation of totals has been disabled');
  const hasMutedIcons = document.querySelectorAll(
    '#grades_summary tr.group_total i.icon-eye-off, #grades_summary tr.group_total .icon-off'
  ).length > 0;

  isTotalsDisabledByProf = hasDisabledText || hasMutedIcons;
}

function isSummaryRow(row) {
  if (
    row.classList.contains('group_total') ||
    row.classList.contains('final_grade') ||
    row.classList.contains('hard_coded') ||
    row.id === 'cgf-custom-final-row'
  ) {
    return true;
  }
  const hasAssignmentLink = !!row.querySelector('th.title a');
  return !hasAssignmentLink;
}

function getAssignmentRows() {
  const allRows = Array.from(document.querySelectorAll('#grades_summary tr.student_assignment'));
  return allRows.filter(row => !isSummaryRow(row));
}

function getSummaryRows() {
  const allRows = Array.from(
    document.querySelectorAll(
      '#grades_summary tr.student_assignment, #grades_summary tr.group_total, #grades_summary tr.final_grade, #cgf-custom-final-row'
    )
  );
  return Array.from(new Set(allRows)).filter(row => isSummaryRow(row));
}

function injectStyles() {
  if (document.getElementById('cgf-styles')) return;
  const style = document.createElement('style');
  style.id = 'cgf-styles';
  style.textContent = `
    #cgf-control-bar {
      background: #f5f7fa;
      border: 1px solid #c7cdd1;
      border-left: 5px solid #001e44;
      border-radius: 6px;
      padding: 12px 16px;
      margin-bottom: 16px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      font-family: inherit;
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    }
    .cgf-top-row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .cgf-title {
      font-weight: 700;
      color: #001e44;
      font-size: 14px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .cgf-controls {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
    }
    .cgf-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: #ffffff;
      border: 1px solid #c7cdd1;
      border-radius: 20px;
      padding: 5px 12px;
      font-size: 12.5px;
      cursor: pointer;
      user-select: none;
      transition: all 0.15s ease;
      color: #2d3b45;
      margin: 0;
    }
    .cgf-pill:hover {
      border-color: #001e44;
      background: #f0f4f8;
    }
    .cgf-pill input {
      margin: 0;
      cursor: pointer;
    }
    .cgf-pill.active {
      background: #001e44;
      color: #ffffff;
      border-color: #001e44;
      font-weight: 600;
    }
    .cgf-btn {
      background: #ffffff;
      border: 1px solid #c7cdd1;
      border-radius: 4px;
      padding: 5px 10px;
      font-size: 12px;
      cursor: pointer;
      color: #2d3b45;
      font-weight: 600;
      transition: all 0.15s;
    }
    .cgf-btn:hover {
      background: #e8ecef;
    }
    .cgf-impact-badge {
      display: inline-block;
      background: #fbe9e7;
      color: #c62828;
      border: 1px solid #ef9a9a;
      border-radius: 4px;
      padding: 2px 6px;
      font-size: 11px;
      font-weight: 700;
      margin-top: 4px;
    }
    .cgf-dropped-badge {
      display: inline-block;
      background: #e5e7eb;
      color: #374151;
      border: 1px solid #9ca3af;
      border-radius: 4px;
      padding: 2px 6px;
      font-size: 11px;
      font-weight: 600;
      margin-top: 4px;
    }
    .cgf-hidden-row {
      display: none !important;
    }
    .cgf-dimmed-row {
      opacity: 0.15 !important;
      transition: opacity 0.2s ease;
    }
    .cgf-dimmed-row:hover {
      opacity: 0.85 !important;
    }
    .cgf-stats {
      font-size: 12px;
      color: #556572;
      font-weight: 600;
    }
    #cgf-weights-panel {
      border-top: 1px solid #dce1e5;
      padding-top: 10px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .cgf-weights-header {
      font-size: 12px;
      font-weight: 700;
      color: #001e44;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 8px;
    }
    .cgf-weights-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      align-items: center;
    }
    .cgf-weight-item {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: #fff;
      border: 1px solid #c7cdd1;
      border-radius: 6px;
      padding: 6px 10px;
      font-size: 12px;
      font-weight: 600;
      color: #2d3b45;
    }
    .cgf-weight-input {
      width: 52px;
      padding: 2px 5px;
      border: 1px solid #99a3ad;
      border-radius: 4px;
      font-size: 12px;
      text-align: right;
      font-weight: 700;
      color: #001e44;
    }
    .cgf-drop-input {
      width: 42px;
      padding: 2px 5px;
      border: 1px solid #99a3ad;
      border-radius: 4px;
      font-size: 12px;
      text-align: right;
      font-weight: 700;
      color: #001e44;
    }
    .cgf-sep {
      color: #c7cdd1;
      margin: 0 2px;
    }
    .cgf-sub-label {
      font-size: 11px;
      color: #556572;
      font-weight: 500;
    }
    .cgf-weight-note {
      font-size: 11.5px;
      color: #556572;
    }
    .cgf-weight-over100 {
      color: #b45309;
      font-weight: 700;
      background: #fef3c7;
      border: 1px solid #f59e0b;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11.5px;
    }
    .cgf-calc-total-val {
      font-weight: 700;
      color: #001e44;
    }
    .cgf-inline-weight-tag {
      display: inline-block;
      margin-left: 8px;
      font-size: 11px;
      font-weight: 600;
      color: #0052a3;
      background: #e6f2ff;
      border: 1px solid #b3d7ff;
      padding: 1px 6px;
      border-radius: 10px;
    }
    #cgf-custom-final-row th, #cgf-custom-final-row td {
      border-top: 2px solid #2d3b45 !important;
      font-weight: 700 !important;
      font-size: 15px !important;
      background: #f0f4f8 !important;
      color: #001e44 !important;
      padding: 12px 8px !important;
    }
    .cgf-minmax-row {
      font-size: 12px;
      font-weight: 600;
      color: #4b5563;
      margin-top: 4px;
      display: flex;
      flex-wrap: wrap;
      gap: 16px;
    }
    .cgf-target-row {
      font-size: 12px;
      font-weight: 600;
      color: #1e3a8a;
      margin-top: 6px;
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .cgf-target-input {
      width: 54px;
      padding: 2px 6px;
      border: 1px solid #99a3ad;
      border-radius: 4px;
      font-size: 12px;
      text-align: right;
      font-weight: 700;
      color: #001e44;
    }
  `;
  document.head.appendChild(style);
}

function injectControlBar(gradesTable) {
  const bar = document.createElement('div');
  bar.id = 'cgf-control-bar';

  bar.innerHTML = `
    <div class="cgf-top-row">
      <div class="cgf-title">
        <span>Grade Focus</span>
        <span id="cgf-stats" class="cgf-stats"></span>
      </div>
      <div class="cgf-controls">
        <label class="cgf-pill" id="pill-hidePerfect" title="Hides 100%+, Exempt (EX), and 0/0 rows">
          <input type="checkbox" id="cb-hidePerfect"> Hide 100% / EX / 0-pt
        </label>
        <label class="cgf-pill" id="pill-hideUngraded" title="Hides upcoming or ungraded (- / 100) rows">
          <input type="checkbox" id="cb-hideUngraded"> Hide Ungraded (-/100)
        </label>
        <label class="cgf-pill" id="pill-hideGraded" title="To-Do Mode: Shows ONLY ungraded assignments">
          <input type="checkbox" id="cb-hideGraded"> To-Do Only (Hide Graded)
        </label>
        <label class="cgf-pill" id="pill-hideTotals" title="Separately hide or show the category and final grade totals at the bottom">
          <input type="checkbox" id="cb-hideTotals"> Hide Bottom Totals
        </label>
        <label class="cgf-pill" id="pill-dimMode" title="Fade filtered rows to 15% opacity instead of removing them">
          <input type="checkbox" id="cb-dimMode"> Dim Instead of Hide
        </label>
        <button class="cgf-btn" id="cgf-reset-whatif" title="Revert any tested What-If scores back to official grades">
          Reset What-Ifs
        </button>
      </div>
    </div>
    <div id="cgf-weights-panel">
      <div class="cgf-weights-header">
        <span>Category Weights % & Auto-Drop Lowest Scores (Auto-saved for this class):</span>
        <span id="cgf-weights-sum-status" class="cgf-weight-note"></span>
      </div>
      <div class="cgf-weights-grid" id="cgf-weights-grid"></div>
    </div>
  `;

  gradesTable.parentNode.insertBefore(bar, gradesTable);

  const keys = ['hidePerfect', 'hideUngraded', 'hideGraded', 'hideTotals', 'dimMode'];
  keys.forEach(key => {
    const cb = document.getElementById(`cb-${key}`);
    if (!cb) return;
    cb.addEventListener('change', (e) => {
      state[key] = e.target.checked;
      if (key === 'hideUngraded' && state.hideUngraded && state.hideGraded) {
        state.hideGraded = false;
      } else if (key === 'hideGraded' && state.hideGraded && state.hideUngraded) {
        state.hideUngraded = false;
      }
      refreshAll();
    });
  });

  document.getElementById('cgf-reset-whatif').addEventListener('click', () => {
    const revertLinks = document.querySelectorAll('a.revert_score_link, a.revert_score');
    if (revertLinks.length > 0) {
      revertLinks.forEach(link => link.click());
      setTimeout(refreshAll, 150);
      setTimeout(refreshAll, 400);
    } else {
      const showSavedBtn = document.querySelector('#revert-all-to-actual-score');
      if (showSavedBtn) {
        showSavedBtn.click();
        setTimeout(refreshAll, 200);
      }
    }
  });

  buildWeightsEditor();
}

function buildWeightsEditor() {
  const grid = document.getElementById('cgf-weights-grid');
  if (!grid) return;

  const categories = getCourseCategories();
  grid.textContent = '';

  categories.forEach(cat => {
    const savedWeight = customWeights[cat] !== undefined ? String(customWeights[cat]) : '';
    const savedDrop = customDrops[cat] !== undefined ? String(customDrops[cat]) : '';

    const item = document.createElement('div');
    item.className = 'cgf-weight-item';

    const nameSpan = document.createElement('span');
    nameSpan.textContent = `${cat}:`;

    const weightInput = document.createElement('input');
    weightInput.type = 'number';
    weightInput.step = 'any';
    weightInput.min = '0';
    weightInput.max = '1000';
    weightInput.placeholder = '0';
    weightInput.className = 'cgf-weight-input';
    weightInput.title = `Weight percentage for ${cat}`;
    weightInput.value = savedWeight;

    const pctSpan = document.createElement('span');
    pctSpan.textContent = '%';

    const sep = document.createElement('span');
    sep.className = 'cgf-sep';
    sep.textContent = '|';

    const dropLabel = document.createElement('span');
    dropLabel.className = 'cgf-sub-label';
    dropLabel.textContent = 'Drop lowest:';

    const dropInput = document.createElement('input');
    dropInput.type = 'number';
    dropInput.step = '1';
    dropInput.min = '0';
    dropInput.max = '99';
    dropInput.placeholder = '0';
    dropInput.className = 'cgf-drop-input';
    dropInput.title = `Number of lowest graded assignments to auto-drop in ${cat}`;
    dropInput.value = savedDrop;

    weightInput.addEventListener('input', (e) => {
      const rawText = e.target.value.trim();
      const val = parseFloat(rawText);
      if (rawText === '' || !Number.isFinite(val) || val < 0) {
        delete customWeights[cat];
      } else {
        customWeights[cat] = Math.min(val, 1000);
      }
      saveValidatedSettings();
      updateCalculatedTotals();
      calculateAndInjectBadges();
    });

    dropInput.addEventListener('input', (e) => {
      const rawText = e.target.value.trim();
      const val = parseInt(rawText, 10);
      if (rawText === '' || !Number.isFinite(val) || val <= 0) {
        delete customDrops[cat];
      } else {
        customDrops[cat] = Math.min(val, 99);
      }
      saveValidatedSettings();
      updateCalculatedTotals();
      calculateAndInjectBadges();
    });

    item.appendChild(nameSpan);
    item.appendChild(weightInput);
    item.appendChild(pctSpan);
    item.appendChild(sep);
    item.appendChild(dropLabel);
    item.appendChild(dropInput);
    grid.appendChild(item);
  });
}

function getCourseCategories() {
  const cats = new Set();
  getAssignmentRows().forEach(row => {
    const contextEl = row.querySelector('.context');
    if (contextEl && contextEl.textContent.trim()) {
      cats.add(contextEl.textContent.trim());
    }
  });
  document.querySelectorAll('#grades_summary tr.group_total th.title').forEach(th => {
    const row = th.closest('tr');
    const savedCat = row && row.dataset.cgfCatName ? row.dataset.cgfCatName : th.textContent.trim();
    if (savedCat) cats.add(savedCat);
  });
  return Array.from(cats);
}

function getCurrentScoreSignature() {
  return getAssignmentRows()
    .map(row => {
      const data = parseAssignmentRow(row);
      return `${row.id}:${data.rawScore}/${data.pointsPossible}:${data.isUngraded}`;
    })
    .join('|');
}

function setupWhatIfListeners(gradesTable) {
  const onlyGradedCheckbox = document.getElementById('only_consider_graded_assignments');
  if (onlyGradedCheckbox) {
    onlyGradedCheckbox.addEventListener('change', () => {
      setTimeout(refreshAll, 60);
    });
  }

  const checkForScoreChanges = () => {
    if (!state.extensionEnabled) return;
    const currentSig = getCurrentScoreSignature();
    if (currentSig !== lastScoreSignature) {
      lastScoreSignature = currentSig;
      updateCalculatedTotals();
      calculateAndInjectBadges();
      applyFilters();
    }
  };

  gradesTable.addEventListener('change', () => setTimeout(checkForScoreChanges, 50));
  gradesTable.addEventListener('focusout', () => setTimeout(checkForScoreChanges, 80));
  gradesTable.addEventListener('keyup', (e) => {
    if (e.key === 'Enter' || e.key === 'Escape') {
      setTimeout(checkForScoreChanges, 80);
    }
  });
  gradesTable.addEventListener('click', (e) => {
    if (e.target.closest('a.revert_score_link, a.revert_score')) {
      setTimeout(checkForScoreChanges, 100);
    }
  });
}

function parseAssignmentRow(row) {
  const statusEl = row.querySelector('.submission_status');
  const gradeEl = row.querySelector('.grade');
  const tooltipEl = row.querySelector('.score_holder .tooltip');
  const contextEl = row.querySelector('.context');

  const statusText = statusEl ? statusEl.textContent.trim().toLowerCase() : '';

  let visibleGradeText = '';
  if (gradeEl) {
    const clone = gradeEl.cloneNode(true);
    clone.querySelectorAll('.tooltip_wrap, .screenreader-only').forEach(el => el.remove());
    visibleGradeText = clone.textContent.trim().toUpperCase();
  }

  let pointsPossible = NaN;
  if (tooltipEl) {
    const match = tooltipEl.textContent.match(/\/\s*([0-9]+(?:\.[0-9]+)?)/);
    if (match) {
      pointsPossible = parseFloat(match[1]);
    }
  }

  let rawScore = parseFloat(visibleGradeText);
  if (isNaN(rawScore) && visibleGradeText !== '-') {
    const whatIfEl = row.querySelector('.student_entered_score');
    const whatIfText = whatIfEl ? whatIfEl.textContent.trim() : '';
    if (whatIfText !== '' && !isNaN(parseFloat(whatIfText))) {
      rawScore = parseFloat(whatIfText);
    } else {
      const origScoreEl = row.querySelector('.original_score');
      const origScoreText = origScoreEl ? origScoreEl.textContent.trim() : '';
      if (origScoreText !== '') {
        rawScore = parseFloat(origScoreText);
      }
    }
  }

  const isExempt =
    statusText === 'excused' ||
    visibleGradeText === 'EX' ||
    visibleGradeText.includes('EXEMPT');

  const isZeroPoints = (pointsPossible === 0);

  const isUngraded =
    !isExempt &&
    (visibleGradeText === '-' || visibleGradeText === '' || isNaN(rawScore));

  const isGraded = !isExempt && !isUngraded && !isNaN(rawScore);

  const isPerfectOrExempt =
    isExempt ||
    isZeroPoints ||
    (isGraded && pointsPossible > 0 && rawScore >= pointsPossible);

  const isImperfectGraded =
    isGraded &&
    pointsPossible > 0 &&
    rawScore < pointsPossible;

  const category = contextEl ? contextEl.textContent.trim() : '';

  return {
    isExempt,
    isZeroPoints,
    isGraded,
    isUngraded,
    isPerfectOrExempt,
    isImperfectGraded,
    rawScore,
    pointsPossible,
    category
  };
}

function getDroppedRowsSet(onlyGraded) {
  const droppedRows = new Set();
  const byCat = {};

  getAssignmentRows().forEach(row => {
    const data = parseAssignmentRow(row);
    if (!data.category || data.isExempt || !(data.pointsPossible > 0)) return;

    const eligible = data.isGraded || (!onlyGraded && data.isUngraded);
    if (!eligible) return;

    const earned = data.isGraded ? data.rawScore : 0;
    const ratio = earned / data.pointsPossible;

    if (!byCat[data.category]) byCat[data.category] = [];
    byCat[data.category].push({
      row,
      earned,
      possible: data.pointsPossible,
      ratio
    });
  });

  Object.keys(byCat).forEach(cat => {
    const dropCount = customDrops[cat] || 0;
    if (dropCount <= 0) return;

    const list = byCat[cat];
    list.sort((a, b) => {
      if (Math.abs(a.ratio - b.ratio) > 1e-9) return a.ratio - b.ratio;
      return (b.possible - b.earned) - (a.possible - a.earned);
    });

    const actualDrops = Math.min(dropCount, list.length);
    for (let i = 0; i < actualDrops; i++) {
      droppedRows.add(list[i].row);
    }
  });

  return droppedRows;
}

function calculateGradeForScenario(scenarioType, onlyGraded, droppedRows) {
  const catTotals = {};
  getCourseCategories().forEach(cat => {
    catTotals[cat] = { earned: 0, possible: 0 };
  });

  getAssignmentRows().forEach(row => {
    const data = parseAssignmentRow(row);
    if (!data.category || data.isExempt) return;
    if (!catTotals[data.category]) {
      catTotals[data.category] = { earned: 0, possible: 0 };
    }

    if (droppedRows.has(row)) return;

    if (data.isGraded && !isNaN(data.pointsPossible)) {
      catTotals[data.category].earned += data.rawScore;
      catTotals[data.category].possible += data.pointsPossible;
    } else if (data.isUngraded && !isNaN(data.pointsPossible)) {
      if (scenarioType === 'current') {
        if (!onlyGraded) {
          catTotals[data.category].possible += data.pointsPossible;
        }
      } else if (scenarioType === 'max') {
        catTotals[data.category].earned += data.pointsPossible;
        catTotals[data.category].possible += data.pointsPossible;
      } else if (scenarioType === 'min') {
        catTotals[data.category].possible += data.pointsPossible;
      }
    }
  });

  let totalWeightEntered = 0;
  Object.values(customWeights).forEach(w => {
    if (Number.isFinite(w) && w > 0) totalWeightEntered += w;
  });

  let finalPercentage = null;
  let totalEarnedAll = 0;
  let totalPossibleAll = 0;

  Object.values(catTotals).forEach(st => {
    totalEarnedAll += st.earned;
    totalPossibleAll += st.possible;
  });

  if (totalWeightEntered > 0) {
    let weightedEarned = 0;
    let activeWeightDenominator = 0;

    Object.keys(catTotals).forEach(cat => {
      const w = customWeights[cat] || 0;
      const st = catTotals[cat];
      if (w > 0 && st && st.possible > 0) {
        const catRatio = st.earned / st.possible;
        weightedEarned += catRatio * w;
        activeWeightDenominator += w;
      }
    });

    if (activeWeightDenominator > 0) {
      const baseDenominator = totalWeightEntered > 100
        ? Math.min(100, activeWeightDenominator)
        : activeWeightDenominator;
      finalPercentage = (weightedEarned / baseDenominator) * 100;
    }
  } else {
    if (totalPossibleAll > 0) {
      finalPercentage = (totalEarnedAll / totalPossibleAll) * 100;
    }
  }

  return { finalPercentage, totalEarnedAll, totalPossibleAll, catTotals };
}

function updateCalculatedTotals() {
  const weightsPanel = document.getElementById('cgf-weights-panel');
  if (!state.extensionEnabled) {
    if (weightsPanel) weightsPanel.style.display = 'none';
    restoreOriginalSummaryRows();
    return;
  }

  if (weightsPanel) weightsPanel.style.display = 'flex';

  const onlyGradedEl = document.getElementById('only_consider_graded_assignments');
  const onlyGraded = onlyGradedEl ? onlyGradedEl.checked : true;
  const droppedRows = getDroppedRowsSet(onlyGraded);

  const currentRes = calculateGradeForScenario('current', onlyGraded, droppedRows);
  const maxRes = calculateGradeForScenario('max', onlyGraded, droppedRows);
  const minRes = calculateGradeForScenario('min', onlyGraded, droppedRows);

  const catTotals = currentRes.catTotals;

  let totalWeightEntered = 0;
  Object.values(customWeights).forEach(w => {
    if (Number.isFinite(w) && w > 0) totalWeightEntered += w;
  });

  const sumStatusEl = document.getElementById('cgf-weights-sum-status');
  if (sumStatusEl) {
    if (totalWeightEntered === 0) {
      sumStatusEl.className = 'cgf-weight-note';
      sumStatusEl.textContent = 'Mode: Unweighted (Pure Total Points)';
    } else if (totalWeightEntered > 100) {
      sumStatusEl.className = 'cgf-weight-over100';
      sumStatusEl.textContent = `* Note: Total weights exceed 100% (${totalWeightEntered.toFixed(1)}%) — extra credit included`;
    } else if (totalWeightEntered < 100) {
      sumStatusEl.className = 'cgf-weight-note';
      sumStatusEl.textContent = `Total Weight Entered: ${totalWeightEntered.toFixed(1)}% (scaled to active categories)`;
    } else {
      sumStatusEl.className = 'cgf-weight-note';
      sumStatusEl.textContent = `Total Weight Entered: 100%`;
    }
  }

  const groupRows = document.querySelectorAll('#grades_summary tr.group_total');
  groupRows.forEach(row => {
    const titleTh = row.querySelector('th.title');
    if (!titleTh) return;

    if (!row.dataset.cgfOrigHtml) {
      row.dataset.cgfOrigHtml = row.innerHTML;
    }

    let catName = row.dataset.cgfCatName;
    if (!catName) {
      catName = titleTh.textContent.trim();
      row.dataset.cgfCatName = catName;
    }

    const stats = catTotals[catName] || { earned: 0, possible: 0 };
    const catWeight = customWeights[catName];
    const hasPct = stats.possible > 0;
    const catPct = hasPct ? (stats.earned / stats.possible) * 100 : null;

    titleTh.textContent = catName + ' ';
    if (catWeight !== undefined && catWeight > 0) {
      const weightTag = document.createElement('span');
      weightTag.className = 'cgf-inline-weight-tag';
      weightTag.textContent = `Weight: ${catWeight}%`;
      titleTh.appendChild(weightTag);
    }
    const dropCount = customDrops[catName] || 0;
    if (dropCount > 0) {
      const dropTag = document.createElement('span');
      dropTag.className = 'cgf-inline-weight-tag';
      dropTag.textContent = `Dropped: ${dropCount}`;
      titleTh.appendChild(dropTag);
    }

    const scoreTd = row.querySelector('td.assignment_score') || row.querySelectorAll('td')[3];
    const detailsTd = row.querySelector('td.details') || row.querySelectorAll('td')[4];

    if (scoreTd) {
      scoreTd.textContent = '';
      const holder = document.createElement('div');
      holder.className = 'score_holder';
      const gradeSpan = document.createElement('span');
      gradeSpan.className = 'grade cgf-calc-total-val';
      gradeSpan.textContent = hasPct ? `${catPct.toFixed(2)}%` : 'N/A';
      holder.appendChild(gradeSpan);
      scoreTd.appendChild(holder);
    }

    if (detailsTd) {
      detailsTd.textContent = '';
      const ptsSpan = document.createElement('span');
      ptsSpan.className = 'possible points_possible';
      ptsSpan.style.fontWeight = '600';
      ptsSpan.style.color = '#2d3b45';
      ptsSpan.textContent = `${stats.earned.toFixed(2)} / ${stats.possible.toFixed(2)}`;
      detailsTd.appendChild(ptsSpan);
    }
  });

  let finalRow = document.getElementById('cgf-custom-final-row');
  const tbody = document.querySelector('#grades_summary tbody') || document.querySelector('#grades_summary');
  if (!finalRow && tbody) {
    finalRow = document.createElement('tr');
    finalRow.id = 'cgf-custom-final-row';
    finalRow.className = 'student_assignment hard_coded final_grade';
    tbody.appendChild(finalRow);
  }

  if (finalRow) {
    finalRow.textContent = '';

    const th = document.createElement('th');
    th.className = 'title';
    th.scope = 'row';
    th.colSpan = 4;

    const mainTitle = document.createElement('span');
    mainTitle.textContent = 'Total ';
    th.appendChild(mainTitle);

    const modeSpan = document.createElement('span');
    modeSpan.style.fontSize = '12px';
    modeSpan.style.fontWeight = '600';
    modeSpan.style.color = '#556572';
    const modeText = totalWeightEntered > 0
      ? (onlyGraded ? 'Weighted — Graded Categories' : 'Weighted — All Categories (Ungraded = 0)')
      : (onlyGraded ? 'Unweighted Total Points — Graded Only' : 'Unweighted Total Points — All Assignments');
    modeSpan.textContent = `(${modeText})`;
    th.appendChild(modeSpan);

    if (totalWeightEntered > 100) {
      const overNote = document.createElement('div');
      overNote.style.fontSize = '11px';
      overNote.style.color = '#b45309';
      overNote.style.fontWeight = '600';
      overNote.style.marginTop = '2px';
      overNote.textContent = `* Note: Total weights exceed 100% (${totalWeightEntered.toFixed(1)}%) — extra credit included`;
      th.appendChild(overNote);
    }

    const minMaxDiv = document.createElement('div');
    minMaxDiv.className = 'cgf-minmax-row';
    const maxValStr = maxRes.finalPercentage !== null ? `${maxRes.finalPercentage.toFixed(2)}%` : 'N/A';
    const minValStr = minRes.finalPercentage !== null ? `${minRes.finalPercentage.toFixed(2)}%` : 'N/A';
    minMaxDiv.innerHTML = `<span>Max Possible Grade: <strong>${maxValStr}</strong> (assuming 100% on remaining)</span><span>Min Possible Grade: <strong>${minValStr}</strong> (assuming 0% on remaining)</span>`;
    th.appendChild(minMaxDiv);

    const targetDiv = document.createElement('div');
    targetDiv.className = 'cgf-target-row';

    const targetLabel = document.createElement('span');
    targetLabel.textContent = 'Target Final Grade:';

    const targetInput = document.createElement('input');
    targetInput.type = 'number';
    targetInput.step = 'any';
    targetInput.min = '0';
    targetInput.max = '200';
    targetInput.className = 'cgf-target-input';
    targetInput.value = targetGradeValue;

    const targetResultSpan = document.createElement('span');
    targetResultSpan.style.marginLeft = '6px';
    targetResultSpan.style.fontWeight = '600';

    if (totalWeightEntered > 0) {
      let currentWeightedBanked = 0;
      let remainingWeightTotal = 0;

      Object.keys(customWeights).forEach(cat => {
        const w = customWeights[cat] || 0;
        const st = catTotals[cat];
        if (w > 0 && st && st.possible > 0) {
          const catRatio = st.earned / st.possible;
          currentWeightedBanked += catRatio * w;
        }
        
        // FIXED: Only count category toward remaining weight if it has actual ungraded assignments left to take!
        const hasActiveUngraded = getAssignmentRows().some(r => {
          const d = parseAssignmentRow(r);
          return d.category === cat && d.isUngraded && !droppedRows.has(r);
        });

        if (w > 0 && hasActiveUngraded) {
          remainingWeightTotal += w;
        }
      });

      const neededWeightedPoints = targetGradeValue - currentWeightedBanked;
      if (maxRes.finalPercentage !== null && targetGradeValue > maxRes.finalPercentage) {
        targetResultSpan.style.color = '#b91c1c';
        targetResultSpan.textContent = `(Target is unreachable! Max possible grade is ${maxRes.finalPercentage.toFixed(2)}%)`;
      } else if (remainingWeightTotal <= 0) {
        targetResultSpan.style.color = '#047857';
        targetResultSpan.textContent = `(All graded/completed — final grade is locked at ${currentRes.finalPercentage.toFixed(2)}%)`;
      } else {
        const requiredRemainingPct = (neededWeightedPoints / remainingWeightTotal) * 100;
        targetResultSpan.style.color = '#1e3a8a';
        targetResultSpan.textContent = `-> You need an average of ${requiredRemainingPct.toFixed(2)}% across remaining ungraded categories (${remainingWeightTotal}% weight) to hit your target.`;
      }
    } else {
      targetResultSpan.textContent = `(Enter category weights above to use target calculator)`;
    }

    targetInput.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      if (Number.isFinite(val)) {
        targetGradeValue = val;
        saveValidatedSettings();
        updateCalculatedTotals();
      }
    });

    targetDiv.appendChild(targetLabel);
    targetDiv.appendChild(targetInput);
    targetDiv.appendChild(document.createTextNode('% '));
    targetDiv.appendChild(targetResultSpan);
    th.appendChild(targetDiv);

    const scoreTd = document.createElement('td');
    scoreTd.className = 'assignment_score';
    const gradeSpan = document.createElement('span');
    gradeSpan.className = 'grade';
    gradeSpan.textContent = currentRes.finalPercentage !== null ? `${currentRes.finalPercentage.toFixed(2)}%` : 'N/A';
    scoreTd.appendChild(gradeSpan);

    const detailsTd = document.createElement('td');
    detailsTd.className = 'details';
    detailsTd.colSpan = 2;
    const detailsSpan = document.createElement('span');
    detailsSpan.style.fontSize = '13px';
    detailsSpan.style.color = '#2d3b45';
    detailsSpan.textContent = `${currentRes.totalEarnedAll.toFixed(2)} / ${currentRes.totalPossibleAll.toFixed(2)} pts`;
    detailsTd.appendChild(detailsSpan);

    finalRow.appendChild(th);
    finalRow.appendChild(scoreTd);
    finalRow.appendChild(detailsTd);
  }
}

function restoreOriginalSummaryRows() {
  document.querySelectorAll('#grades_summary tr.group_total').forEach(row => {
    if (row.dataset.cgfOrigHtml) {
      row.innerHTML = row.dataset.cgfOrigHtml;
    }
  });
  const customFinal = document.getElementById('cgf-custom-final-row');
  if (customFinal) customFinal.remove();
}

function calculateAndInjectBadges() {
  document.querySelectorAll('.cgf-impact-badge, .cgf-dropped-badge, .cgf-whatif-btn').forEach(el => el.remove());

  if (!state.extensionEnabled) return;

  const onlyGradedEl = document.getElementById('only_consider_graded_assignments');
  const onlyGraded = onlyGradedEl ? onlyGradedEl.checked : true;
  const droppedRows = getDroppedRowsSet(onlyGraded);

  const weights = {};
  const weightRows = document.querySelectorAll('aside table.summary tbody tr, #assignments-not-weighted tbody tr');
  weightRows.forEach(tr => {
    const th = tr.querySelector('th');
    const td = tr.querySelector('td');
    if (th && td) {
      const groupName = th.textContent.trim();
      const weightVal = parseFloat(td.textContent.replace('%', '').trim());
      if (groupName && groupName.toLowerCase() !== 'total' && !isNaN(weightVal)) {
        weights[groupName] = weightVal;
      }
    }
  });

  Object.keys(customWeights).forEach(cat => {
    if (customWeights[cat] > 0) {
      weights[cat] = customWeights[cat];
    }
  });

  const assignmentRows = getAssignmentRows();
  const categoryGradedPoints = {};
  let totalAllGradedPoints = 0;

  const parsedRows = assignmentRows.map(row => {
    const data = parseAssignmentRow(row);
    const isDropped = droppedRows.has(row);
    if (!isDropped && data.isGraded && !data.isExempt && data.pointsPossible > 0) {
      totalAllGradedPoints += data.pointsPossible;
      if (data.category) {
        categoryGradedPoints[data.category] = (categoryGradedPoints[data.category] || 0) + data.pointsPossible;
      }
    }
    return { row, data, isDropped };
  });

  let totalWeightConfigured = 0;
  let activeWeightDenominator = 0;
  Object.keys(weights).forEach(cat => {
    const w = weights[cat] || 0;
    if (w > 0) {
      totalWeightConfigured += w;
      if ((categoryGradedPoints[cat] || 0) > 0) {
        activeWeightDenominator += w;
      }
    }
  });

  const scaleDenominator = onlyGraded
    ? (totalWeightConfigured > 100 ? Math.min(100, activeWeightDenominator) : activeWeightDenominator)
    : (totalWeightConfigured > 0 ? Math.min(100, totalWeightConfigured) : 100);

  parsedRows.forEach(({ row, data, isDropped }) => {
    const titleCell = row.querySelector('th.title');
    if (!titleCell) return;

    if (isDropped) {
      const dropBadge = document.createElement('div');
      dropBadge.className = 'cgf-dropped-badge';
      dropBadge.textContent = 'Dropped lowest score (excluded from total)';
      titleCell.appendChild(dropBadge);
      return;
    }

    if (!data.isImperfectGraded) return;

    const pointsLost = +(data.pointsPossible - data.rawScore).toFixed(2);
    const groupWeight = weights[data.category];
    const totalGroupPts = categoryGradedPoints[data.category];

    const badge = document.createElement('div');
    badge.className = 'cgf-impact-badge';

    if (groupWeight && totalGroupPts > 0 && scaleDenominator > 0) {
      const rawSyllabusImpact = (pointsLost / totalGroupPts) * groupWeight;
      const currentGradeImpact = (rawSyllabusImpact / scaleDenominator) * 100;
      badge.textContent = `-${currentGradeImpact.toFixed(2)}% overall grade impact (-${pointsLost} pts)`;
    } else if (Object.keys(weights).length === 0 && totalAllGradedPoints > 0) {
      const unweightedImpact = (pointsLost / totalAllGradedPoints) * 100;
      badge.textContent = `-${unweightedImpact.toFixed(2)}% overall grade impact (-${pointsLost} pts)`;
    } else {
      badge.textContent = `-${pointsLost} pts lost`;
    }
    titleCell.appendChild(badge);
  });
}

function applyFilters() {
  const bar = document.getElementById('cgf-control-bar');
  const assignmentRows = getAssignmentRows();
  const summaryRows = getSummaryRows();

  if (!state.extensionEnabled) {
    if (bar) bar.style.display = 'none';
    assignmentRows.forEach(row => {
      row.classList.remove('cgf-hidden-row', 'cgf-dimmed-row');
      const submissionId = row.id ? row.id.replace('submission_', '') : null;
      if (submissionId) {
        document
          .querySelectorAll(`#grade_info_${submissionId}, #rubric_${submissionId}, #comments_thread_${submissionId}`)
          .forEach(sub => sub.classList.remove('cgf-hidden-row', 'cgf-dimmed-row'));
      }
    });
    summaryRows.forEach(r => r.classList.remove('cgf-hidden-row', 'cgf-dimmed-row'));
    restoreOriginalSummaryRows();
    return;
  }

  if (bar) bar.style.display = 'flex';

  let visibleCount = 0;
  const totalCount = assignmentRows.length;

  assignmentRows.forEach(row => {
    const data = parseAssignmentRow(row);
    let shouldFilter = false;

    if (state.hidePerfect && data.isPerfectOrExempt) {
      shouldFilter = true;
    }
    if (state.hideUngraded && data.isUngraded) {
      shouldFilter = true;
    }
    if (state.hideGraded && (data.isGraded || data.isExempt || data.isZeroPoints)) {
      shouldFilter = true;
    }

    row.classList.remove('cgf-hidden-row', 'cgf-dimmed-row');

    const submissionId = row.id ? row.id.replace('submission_', '') : null;
    const subRows = submissionId
      ? document.querySelectorAll(`#grade_info_${submissionId}, #rubric_${submissionId}, #comments_thread_${submissionId}`)
      : [];
    subRows.forEach(sub => sub.classList.remove('cgf-hidden-row', 'cgf-dimmed-row'));

    if (shouldFilter) {
      if (state.dimMode) {
        row.classList.add('cgf-dimmed-row');
        subRows.forEach(sub => sub.classList.add('cgf-dimmed-row'));
      } else {
        row.classList.add('cgf-hidden-row');
        subRows.forEach(sub => sub.classList.add('cgf-hidden-row'));
      }
    } else {
      visibleCount++;
    }
  });

  summaryRows.forEach(row => {
    row.classList.remove('cgf-hidden-row', 'cgf-dimmed-row');
    if (state.hideTotals) {
      if (state.dimMode) {
        row.classList.add('cgf-dimmed-row');
      } else {
        row.classList.add('cgf-hidden-row');
      }
    }
  });

  const statsEl = document.getElementById('cgf-stats');
  if (statsEl) {
    statsEl.textContent = `(Showing ${visibleCount} of ${totalCount} assignments)`;
  }
}

function syncUI() {
  ['hidePerfect', 'hideUngraded', 'hideGraded', 'hideTotals', 'dimMode'].forEach(key => {
    const cb = document.getElementById(`cb-${key}`);
    const pill = document.getElementById(`pill-${key}`);
    if (cb && pill) {
      cb.checked = !!state[key];
      pill.classList.toggle('active', !!state[key]);
    }
  });
}

function refreshAll() {
  lastScoreSignature = getCurrentScoreSignature();
  syncUI();
  updateCalculatedTotals();
  calculateAndInjectBadges();
  applyFilters();
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (sender && sender.id && sender.id !== chrome.runtime.id) return;
  if (!msg || typeof msg !== 'object') return;

  if (msg.type === 'GET_STATE') {
    sendResponse({ state, isTotalsDisabledByProf });
  } else if (msg.type === 'SET_STATE' && msg.state && typeof msg.state === 'object') {
    ALLOWED_STATE_KEYS.forEach(key => {
      if (Object.prototype.hasOwnProperty.call(msg.state, key)) {
        state[key] = Boolean(msg.state[key]);
      }
    });
    refreshAll();
    sendResponse({ state, isTotalsDisabledByProf });
  }
});

initGradeFocus();
