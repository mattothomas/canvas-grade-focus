// Default state: All filters start OFF on every page load/refresh.
// extensionEnabled controls whether the Grade Focus toolbar/UI is visible on the page.
let state = {
  extensionEnabled: true, // Master switch in popup to turn the entire extension UI on/off
  hidePerfect: false,     // Hides >= 100%, EX, and 0/0 assignments
  hideUngraded: false,    // Hides - / 100 (ungraded/future) assignments
  hideGraded: false,      // Hides all graded assignments (To-Do mode)
  hideTotals: false,      // Separate toggle for the Category & Final Totals at the bottom
  dimMode: false,         // False = completely hide row, True = fade to 15% opacity
  calcTotals: false       // Appears & calculates totals when professor has disabled them
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
let customWeights = {}; // Validated & saved per-course in localStorage
let lastScoreSignature = '';

function initGradeFocus() {
  const gradesTable = document.querySelector('#grades_summary');
  if (!gradesTable || document.getElementById('cgf-control-bar')) return;

  // 1) Extract course ID from URL (e.g. 2476300) so weights save per class
  const match = window.location.pathname.match(/\/courses\/(\d+)/);
  if (match) courseId = match[1];

  // 2) Load & strictly validate saved custom weights for this specific course
  loadValidatedWeights();

  // 3) Detect if professor explicitly disabled total calculations
  detectDisabledTotals();

  // 4) Build UI & event listeners (no MutationObserver loop!)
  injectStyles();
  injectControlBar(gradesTable);
  setupWhatIfListeners(gradesTable);
  refreshAll();
}

function loadValidatedWeights() {
  customWeights = {};
  try {
    const raw = localStorage.getItem(`cgf_weights_${courseId}`);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      Object.keys(parsed).forEach(key => {
        const val = Number(parsed[key]);
        if (typeof key === 'string' && key.length <= 120 && Number.isFinite(val) && val >= 0 && val <= 1000) {
          customWeights[key] = val;
        }
      });
    }
  } catch (e) {
    customWeights = {};
  }
}

function saveValidatedWeights() {
  try {
    localStorage.setItem(`cgf_weights_${courseId}`, JSON.stringify(customWeights));
  } catch (e) {}
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

// Helper: Check if a row is one of the bottom Category Totals or Final Grade rows
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

// 1. Inject CSS
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
    .cgf-pill.cgf-calc-pill {
      border-color: #0066cc;
      color: #004080;
      background: #eef6ff;
    }
    .cgf-pill.cgf-calc-pill.active {
      background: #0052a3;
      color: #ffffff;
      border-color: #0052a3;
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
    .cgf-whatif-btn {
      display: inline-block;
      margin-top: 4px;
      padding: 2px 6px;
      font-size: 11px;
      font-weight: 600;
      color: #0066cc;
      background: #e6f2ff;
      border: 1px solid #99ccff;
      border-radius: 4px;
      cursor: pointer;
    }
    .cgf-whatif-btn:hover {
      background: #cce5ff;
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
    /* Custom Weight Calculator Panel */
    #cgf-weights-panel {
      border-top: 1px solid #dce1e5;
      padding-top: 10px;
      display: none;
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
      padding: 4px 10px;
      font-size: 12px;
      font-weight: 600;
      color: #2d3b45;
    }
    .cgf-weight-input {
      width: 58px;
      padding: 2px 6px;
      border: 1px solid #99a3ad;
      border-radius: 4px;
      font-size: 12px;
      text-align: right;
      font-weight: 700;
      color: #001e44;
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
  `;
  document.head.appendChild(style);
}

// 2. Inject the In-Page Control Bar
function injectControlBar(gradesTable) {
  const bar = document.createElement('div');
  bar.id = 'cgf-control-bar';

  const calcPillHTML = isTotalsDisabledByProf
    ? `<label class="cgf-pill cgf-calc-pill" id="pill-calcTotals" title="Professor disabled grade totals. Click to calculate category & final totals!">
         <input type="checkbox" id="cb-calcTotals"> 🧮 Calculate Disabled Totals
       </label>`
    : '';

  bar.innerHTML = `
    <div class="cgf-top-row">
      <div class="cgf-title">
        <span>🎯 Grade Focus</span>
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
        <label class="cgf-pill" id="pill-hideTotals" title="Separately hide or show the category & final grade totals at the bottom">
          <input type="checkbox" id="cb-hideTotals"> Hide Bottom Totals
        </label>
        <label class="cgf-pill" id="pill-dimMode" title="Fade filtered rows to 15% opacity instead of removing them">
          <input type="checkbox" id="cb-dimMode"> Dim Instead of Hide
        </label>
        ${calcPillHTML}
        <button class="cgf-btn" id="cgf-reset-whatif" title="Revert any tested What-If scores back to official grades">
          ↺ Reset What-Ifs
        </button>
      </div>
    </div>
    <div id="cgf-weights-panel">
      <div class="cgf-weights-header">
        <span>⚖️ Category Weights % (Auto-saved for this class — leave all at 0% for unweighted total points):</span>
        <span id="cgf-weights-sum-status" class="cgf-weight-note"></span>
      </div>
      <div class="cgf-weights-grid" id="cgf-weights-grid"></div>
    </div>
  `;

  gradesTable.parentNode.insertBefore(bar, gradesTable);

  const keys = ['hidePerfect', 'hideUngraded', 'hideGraded', 'hideTotals', 'dimMode', 'calcTotals'];
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
      // Also check Canvas's "Revert to Actual Score" button if present
      const showSavedBtn = document.querySelector('#revert-all-to-actual-score');
      if (showSavedBtn) {
        showSavedBtn.click();
        setTimeout(refreshAll, 200);
      }
    }
  });

  buildWeightsEditor();
}

// Safely build inputs for each category using DOM APIs (no unsafe innerHTML with category names)
function buildWeightsEditor() {
  const grid = document.getElementById('cgf-weights-grid');
  if (!grid) return;

  const categories = getCourseCategories();
  grid.textContent = '';

  categories.forEach(cat => {
    const savedVal = customWeights[cat] !== undefined ? String(customWeights[cat]) : '';

    const item = document.createElement('label');
    item.className = 'cgf-weight-item';

    const nameSpan = document.createElement('span');
    nameSpan.textContent = `${cat}:`;

    const input = document.createElement('input');
    input.type = 'number';
    input.step = 'any';
    input.min = '0';
    input.max = '1000';
    input.placeholder = '0';
    input.className = 'cgf-weight-input';
    input.dataset.category = cat;
    input.value = savedVal;

    const pctSpan = document.createElement('span');
    pctSpan.textContent = '%';

    input.addEventListener('input', (e) => {
      const rawText = e.target.value.trim();
      const val = parseFloat(rawText);
      if (rawText === '' || !Number.isFinite(val) || val < 0) {
        delete customWeights[cat];
      } else {
        customWeights[cat] = Math.min(val, 1000);
      }
      saveValidatedWeights();
      updateDisabledTotalsCalculation();
      calculateAndInjectBadges();
    });

    item.appendChild(nameSpan);
    item.appendChild(input);
    item.appendChild(pctSpan);
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

// Compute a lightweight signature of all assignment scores so we only recalculate when a score actually changes
function getCurrentScoreSignature() {
  return getAssignmentRows()
    .map(row => {
      const data = parseAssignmentRow(row);
      return `${row.id}:${data.rawScore}/${data.pointsPossible}:${data.isUngraded}`;
    })
    .join('|');
}

// Safe, event-driven listeners for What-If edits (Zero MutationObserver feedback loops!)
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
      updateDisabledTotalsCalculation();
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

// 3. Parse every assignment row (supports live What-If scores!)
function parseAssignmentRow(row) {
  const statusEl = row.querySelector('.submission_status');
  const gradeEl = row.querySelector('.grade');
  const tooltipEl = row.querySelector('.score_holder .tooltip');
  const contextEl = row.querySelector('.context');

  const statusText = statusEl ? statusEl.textContent.trim().toLowerCase() : '';

  // 1) Extract visible grade text (e.g. "0", "50", "44", "EX", "-")
  let visibleGradeText = '';
  if (gradeEl) {
    const clone = gradeEl.cloneNode(true);
    clone.querySelectorAll('.tooltip_wrap, .screenreader-only').forEach(el => el.remove());
    visibleGradeText = clone.textContent.trim().toUpperCase();
  }

  // 2) Extract possible points from "/ 50" or "/ 100"
  let pointsPossible = NaN;
  if (tooltipEl) {
    const match = tooltipEl.textContent.match(/\/\s*([0-9]+(?:\.[0-9]+)?)/);
    if (match) {
      pointsPossible = parseFloat(match[1]);
    }
  }

  // 3) Extract current active score (visible What-If score takes priority over original_score)
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

// 4. Calculate & Render Bottom Category Totals + Final Grade when Professor Disabled Them
function updateDisabledTotalsCalculation() {
  const weightsPanel = document.getElementById('cgf-weights-panel');
  if (!state.extensionEnabled || !isTotalsDisabledByProf || !state.calcTotals) {
    if (weightsPanel) weightsPanel.style.display = 'none';
    restoreOriginalSummaryRows();
    return;
  }

  if (weightsPanel) weightsPanel.style.display = 'flex';

  const onlyGradedEl = document.getElementById('only_consider_graded_assignments');
  const onlyGraded = onlyGradedEl ? onlyGradedEl.checked : true;

  const catTotals = {};
  getCourseCategories().forEach(cat => {
    catTotals[cat] = { earned: 0, possible: 0 };
  });

  // Sum up earned & possible points per category
  getAssignmentRows().forEach(row => {
    const data = parseAssignmentRow(row);
    if (!data.category || data.isExempt) return;
    if (!catTotals[data.category]) {
      catTotals[data.category] = { earned: 0, possible: 0 };
    }

    if (data.isGraded && !isNaN(data.pointsPossible)) {
      catTotals[data.category].earned += data.rawScore;
      catTotals[data.category].possible += data.pointsPossible;
    } else if (!onlyGraded && data.isUngraded && !isNaN(data.pointsPossible)) {
      catTotals[data.category].possible += data.pointsPossible;
    }
  });

  // Sum custom weights
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
      sumStatusEl.textContent = `* Note: Total weights exceed 100% (${totalWeightEntered.toFixed(1)}%) — extra credit included!`;
    } else if (totalWeightEntered < 100) {
      sumStatusEl.className = 'cgf-weight-note';
      sumStatusEl.textContent = `Total Weight Entered: ${totalWeightEntered.toFixed(1)}% (scaled to active categories)`;
    } else {
      sumStatusEl.className = 'cgf-weight-note';
      sumStatusEl.textContent = `Total Weight Entered: 100%`;
    }
  }

  // Safely update each bottom Category Row using DOM APIs
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

    // Safely set title + weight tag
    titleTh.textContent = catName + ' ';
    if (catWeight !== undefined && catWeight > 0) {
      const weightTag = document.createElement('span');
      weightTag.className = 'cgf-inline-weight-tag';
      weightTag.textContent = `Weight: ${catWeight}%`;
      titleTh.appendChild(weightTag);
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

  // Calculate Overall Course Grade
  let finalPercentage = null;
  let unscaledWeightedPct = null;
  let activeWeightDenominator = 0;
  let totalEarnedAll = 0;
  let totalPossibleAll = 0;

  Object.values(catTotals).forEach(st => {
    totalEarnedAll += st.earned;
    totalPossibleAll += st.possible;
  });

  if (totalWeightEntered > 0) {
    let weightedEarned = 0;

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
      // If total weights > 100 (extra credit), divide by 100 (or active base if < 100) so extra credit boosts grade above 100%
      const baseDenominator = totalWeightEntered > 100
        ? Math.min(100, activeWeightDenominator)
        : activeWeightDenominator;
      finalPercentage = (weightedEarned / baseDenominator) * 100;
      unscaledWeightedPct = weightedEarned; // Raw banked percentage points out of syllabus weights
    }
  } else {
    if (totalPossibleAll > 0) {
      finalPercentage = (totalEarnedAll / totalPossibleAll) * 100;
    }
  }

  // Inject or update the Final Total Row at the very bottom of the table
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
    } else if (totalWeightEntered > 0 && activeWeightDenominator > 0 && activeWeightDenominator < 100 && unscaledWeightedPct !== null) {
      const partialNote = document.createElement('div');
      partialNote.style.fontSize = '11px';
      partialNote.style.color = '#556572';
      partialNote.style.fontWeight = '600';
      partialNote.style.marginTop = '2px';
      partialNote.textContent = `Scaled from ${activeWeightDenominator.toFixed(1)}% active weight (${unscaledWeightedPct.toFixed(2)}% raw banked syllabus points)`;
      th.appendChild(partialNote);
    }

    const scoreTd = document.createElement('td');
    scoreTd.className = 'assignment_score';
    const gradeSpan = document.createElement('span');
    gradeSpan.className = 'grade';
    gradeSpan.textContent = finalPercentage !== null ? `${finalPercentage.toFixed(2)}%` : 'N/A';
    scoreTd.appendChild(gradeSpan);

    const detailsTd = document.createElement('td');
    detailsTd.className = 'details';
    detailsTd.colSpan = 2;
    const detailsSpan = document.createElement('span');
    detailsSpan.style.fontSize = '13px';
    detailsSpan.style.color = '#2d3b45';
    detailsSpan.textContent = totalWeightEntered > 0
      ? `${totalEarnedAll.toFixed(2)} / ${totalPossibleAll.toFixed(2)} raw pts`
      : `${totalEarnedAll.toFixed(2)} / ${totalPossibleAll.toFixed(2)} pts`;
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

// 5. Calculate True Final Grade Impact & Inject "Test 100%" Buttons
function calculateAndInjectBadges() {
  document.querySelectorAll('.cgf-impact-badge').forEach(el => el.remove());

  if (!state.extensionEnabled) {
    document.querySelectorAll('.cgf-whatif-btn').forEach(el => el.remove());
    return;
  }

  // 1) Gather weights from Canvas sidebar OR from user's custom weights
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

  if (isTotalsDisabledByProf && state.calcTotals) {
    Object.keys(customWeights).forEach(cat => {
      if (customWeights[cat] > 0) {
        weights[cat] = customWeights[cat];
      }
    });
  }

  const assignmentRows = getAssignmentRows();
  const categoryGradedPoints = {};
  let totalAllGradedPoints = 0;

  const parsedRows = assignmentRows.map(row => {
    const data = parseAssignmentRow(row);
    if (data.isGraded && !data.isExempt && data.pointsPossible > 0) {
      totalAllGradedPoints += data.pointsPossible;
      if (data.category) {
        categoryGradedPoints[data.category] = (categoryGradedPoints[data.category] || 0) + data.pointsPossible;
      }
    }
    return { row, data };
  });

  parsedRows.forEach(({ row, data }) => {
    const titleCell = row.querySelector('th.title');
    const scoreHolder = row.querySelector('.score_holder');

    if (data.isImperfectGraded && scoreHolder && !scoreHolder.querySelector('.cgf-whatif-btn')) {
      const btn = document.createElement('button');
      btn.className = 'cgf-whatif-btn';
      btn.type = 'button';
      btn.title = `Click to test ${data.pointsPossible}/${data.pointsPossible} What-If score`;
      btn.textContent = `✨ Test ${data.pointsPossible}/${data.pointsPossible}`;

      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const gradeSpan = row.querySelector('.grade');
        if (gradeSpan) {
          gradeSpan.click();
          setTimeout(() => {
            const input = row.querySelector('input#student_entered_score, .score_holder input[type="text"]');
            if (input) {
              input.value = data.pointsPossible;
              input.dispatchEvent(new Event('input', { bubbles: true }));
              input.dispatchEvent(new Event('change', { bubbles: true }));
              input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
              input.blur();
              setTimeout(refreshAll, 80);
            }
          }, 60);
        }
      });

      scoreHolder.appendChild(btn);
    }

    if (!data.isImperfectGraded) return;

    const pointsLost = +(data.pointsPossible - data.rawScore).toFixed(2);
    const groupWeight = weights[data.category];
    const totalGroupPts = categoryGradedPoints[data.category];

    if (titleCell) {
      const badge = document.createElement('div');
      badge.className = 'cgf-impact-badge';

      if (groupWeight && totalGroupPts > 0) {
        const courseImpact = (pointsLost / totalGroupPts) * groupWeight;
        badge.textContent = `📉 -${courseImpact.toFixed(2)}% overall grade impact (-${pointsLost} pts)`;
      } else if (Object.keys(weights).length === 0 && totalAllGradedPoints > 0 && state.calcTotals) {
        const unweightedImpact = (pointsLost / totalAllGradedPoints) * 100;
        badge.textContent = `📉 -${unweightedImpact.toFixed(2)}% unweighted impact (-${pointsLost} pts)`;
      } else {
        badge.textContent = `📉 -${pointsLost} pts lost`;
      }
      titleCell.appendChild(badge);
    }
  });
}

// 6. Hide or Dim Rows Based on Active Toggles (Properly handles detail sub-rows in both modes!)
function applyFilters() {
  const bar = document.getElementById('cgf-control-bar');
  const assignmentRows = getAssignmentRows();
  const summaryRows = getSummaryRows();

  // If master extension toggle is OFF, restore everything to untouched Canvas
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
  ['hidePerfect', 'hideUngraded', 'hideGraded', 'hideTotals', 'dimMode', 'calcTotals'].forEach(key => {
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
  updateDisabledTotalsCalculation();
  calculateAndInjectBadges();
  applyFilters();
}

// 7. Validated Sync with Chrome Toolbar Popup
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
