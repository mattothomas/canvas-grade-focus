// Default state: Always starts OFF on every page load/refresh
let state = {
  hidePerfect: false,   // Hides >= 100%, EX, and 0/0 assignments
  hideUngraded: false,  // Hides - / 100 (ungraded/future) assignments
  hideGraded: false,    // Hides all graded assignments (To-Do mode)
  hideTotals: false,    // Separate toggle for the Category & Final Totals at the bottom
  dimMode: false        // False = completely hide row, True = fade to 15% opacity
};

function initGradeFocus() {
  const gradesTable = document.querySelector('#grades_summary');
  if (!gradesTable || document.getElementById('cgf-control-bar')) return;

  injectStyles();
  injectControlBar(gradesTable);
  calculateAndInjectBadges();
  applyFilters();
}

// Helper: Check if a row is one of the bottom Category Totals or Final Grade rows
function isSummaryRow(row) {
  if (
    row.classList.contains('group_total') ||
    row.classList.contains('final_grade') ||
    row.classList.contains('hard_coded')
  ) {
    return true;
  }
  // Fallback check: real assignments always have an <a href="..."> link in th.title or an id starting with submission_
  const hasAssignmentLink = !!row.querySelector('th.title a');
  return !hasAssignmentLink;
}

// Get only actual assignment rows (excludes Exam 1, Exam 2, Quizzes, Total summary rows at bottom)
function getAssignmentRows() {
  const allRows = Array.from(document.querySelectorAll('#grades_summary tr.student_assignment'));
  return allRows.filter(row => !isSummaryRow(row));
}

// Get only the bottom summary/total rows
function getSummaryRows() {
  const allRows = Array.from(document.querySelectorAll('#grades_summary tr.student_assignment, #grades_summary tr.group_total, #grades_summary tr.final_grade'));
  return Array.from(new Set(allRows)).filter(row => isSummaryRow(row));
}

// 1. Inject CSS for clean UI, badges, and hiding/dimming rows
function injectStyles() {
  const style = document.createElement('style');
  style.id = 'cgf-styles';
  style.textContent = `
    #cgf-control-bar {
      background: #f5f7fa;
      border: 1px solid #c7cdd1;
      border-left: 5px solid #001e44; /* Penn State Navy */
      border-radius: 6px;
      padding: 12px 16px;
      margin-bottom: 16px;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      font-family: inherit;
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
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
  `;
  document.head.appendChild(style);
}

// 2. Inject the In-Page Control Bar right above your Grades table
function injectControlBar(gradesTable) {
  const bar = document.createElement('div');
  bar.id = 'cgf-control-bar';
  bar.innerHTML = `
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
      <button class="cgf-btn" id="cgf-reset-whatif" title="Revert any tested What-If scores back to official grades">
        ↺ Reset What-Ifs
      </button>
    </div>
  `;

  gradesTable.parentNode.insertBefore(bar, gradesTable);

  const keys = ['hidePerfect', 'hideUngraded', 'hideGraded', 'hideTotals', 'dimMode'];
  keys.forEach(key => {
    const cb = document.getElementById(`cb-${key}`);
    cb.addEventListener('change', (e) => {
      state[key] = e.target.checked;
      if (key === 'hideUngraded' && state.hideUngraded && state.hideGraded) {
        state.hideGraded = false;
      } else if (key === 'hideGraded' && state.hideGraded && state.hideUngraded) {
        state.hideUngraded = false;
      }
      syncUI();
      applyFilters();
    });
  });

  document.getElementById('cgf-reset-whatif').addEventListener('click', () => {
    const revertLinks = document.querySelectorAll('a.revert_score_link');
    if (revertLinks.length > 0) {
      revertLinks.forEach(link => link.click());
    } else {
      window.location.reload();
    }
  });
}

function syncUI() {
  ['hidePerfect', 'hideUngraded', 'hideGraded', 'hideTotals', 'dimMode'].forEach(key => {
    const cb = document.getElementById(`cb-${key}`);
    const pill = document.getElementById(`pill-${key}`);
    if (cb && pill) {
      cb.checked = state[key];
      pill.classList.toggle('active', state[key]);
    }
  });
}

// 3. Accurately parse earned score AND possible points from Canvas's HTML
function parseAssignmentRow(row) {
  const statusEl = row.querySelector('.submission_status');
  const gradeEl = row.querySelector('.grade');
  const tooltipEl = row.querySelector('.score_holder .tooltip');
  const contextEl = row.querySelector('.context');

  const statusText = statusEl ? statusEl.textContent.trim().toLowerCase() : '';

  // 1) Extract visible grade text (e.g. "96", "64", "10", "EX", "-")
  let visibleGradeText = '';
  if (gradeEl) {
    const clone = gradeEl.cloneNode(true);
    clone.querySelectorAll('.tooltip_wrap, .screenreader-only').forEach(el => el.remove());
    visibleGradeText = clone.textContent.trim().toUpperCase();
  }

  // 2) Extract possible points from the "/ 100" span right inside .tooltip
  let pointsPossible = NaN;
  if (tooltipEl) {
    // Match "/ 100" or "/ 10.0" at the end of the score cell
    const match = tooltipEl.textContent.match(/\/\s*([0-9]+(?:\.[0-9]+)?)/);
    if (match) {
      pointsPossible = parseFloat(match[1]);
    }
  }

  // 3) Extract earned score (prefer visible grade number, fallback to .original_score)
  let rawScore = parseFloat(visibleGradeText);
  if (isNaN(rawScore)) {
    const origScoreEl = row.querySelector('.original_score');
    const origScoreText = origScoreEl ? origScoreEl.textContent.trim() : '';
    if (origScoreText !== '') {
      rawScore = parseFloat(origScoreText);
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

  // Perfect or Extra Credit (>= 100%), OR Exempt (EX), OR 0/0 assignment
  const isPerfectOrExempt =
    isExempt ||
    isZeroPoints ||
    (isGraded && pointsPossible > 0 && rawScore >= pointsPossible);

  // Imperfect graded assignment (e.g. 96/100 or 64/100)
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

// 4. Calculate True Final Grade Impact & Inject "Test 100%" Buttons
function calculateAndInjectBadges() {
  // Parse category weights from the right-hand sidebar table
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

  const assignmentRows = getAssignmentRows();
  const categoryGradedPoints = {};

  const parsedRows = assignmentRows.map(row => {
    const data = parseAssignmentRow(row);
    if (data.isGraded && !data.isExempt && data.pointsPossible > 0 && data.category) {
      categoryGradedPoints[data.category] = (categoryGradedPoints[data.category] || 0) + data.pointsPossible;
    }
    return { row, data };
  });

  parsedRows.forEach(({ row, data }) => {
    if (!data.isImperfectGraded) return;

    const pointsLost = +(data.pointsPossible - data.rawScore).toFixed(2);
    const titleCell = row.querySelector('th.title');
    const scoreHolder = row.querySelector('.score_holder');

    // A) Inject True Course Grade Impact Badge under the assignment title
    const groupWeight = weights[data.category];
    const totalGroupPts = categoryGradedPoints[data.category];

    if (titleCell && !titleCell.querySelector('.cgf-impact-badge')) {
      const badge = document.createElement('div');
      badge.className = 'cgf-impact-badge';

      if (groupWeight && totalGroupPts > 0) {
        const courseImpact = (pointsLost / totalGroupPts) * groupWeight;
        badge.textContent = `📉 -${courseImpact.toFixed(2)}% overall grade impact (-${pointsLost} pts)`;
      } else {
        badge.textContent = `📉 -${pointsLost} pts lost`;
      }
      titleCell.appendChild(badge);
    }

    // B) Inject One-Click "Test 100%" What-If Button under the score
    if (scoreHolder && !scoreHolder.querySelector('.cgf-whatif-btn')) {
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
            }
          }, 60);
        }
      });

      scoreHolder.appendChild(btn);
    }
  });
}

// 5. Hide or Dim Rows Based on Active Toggles
function applyFilters() {
  const assignmentRows = getAssignmentRows();
  const summaryRows = getSummaryRows();

  let visibleCount = 0;
  const totalCount = assignmentRows.length;

  // Filter individual assignments
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

    if (shouldFilter) {
      if (state.dimMode) {
        row.classList.add('cgf-dimmed-row');
      } else {
        row.classList.add('cgf-hidden-row');
        subRows.forEach(sub => sub.classList.add('cgf-hidden-row'));
      }
    } else {
      visibleCount++;
      subRows.forEach(sub => sub.classList.remove('cgf-hidden-row'));
    }
  });

  // Separately filter the bottom Category & Final Totals ONLY if "Hide Bottom Totals" is checked
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

// 6. Sync with Chrome Toolbar Popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'GET_STATE') {
    sendResponse({ state });
  } else if (msg.type === 'SET_STATE') {
    state = { ...state, ...msg.state };
    syncUI();
    applyFilters();
    sendResponse({ state });
  }
});

initGradeFocus();
