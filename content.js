// Default state: Always starts OFF on every page load/refresh
let state = {
  hidePerfect: false,   // Hides >= 100%, EX, and 0/0
  hideUngraded: false,  // Hides - / 100 (ungraded/future)
  hideGraded: false,    // Hides all graded (To-Do mode)
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
      gap: 10px;
    }
    .cgf-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: #ffffff;
      border: 1px solid #c7cdd1;
      border-radius: 20px;
      padding: 5px 12px;
      font-size: 13px;
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
      margin-left: 6px;
      padding: 1px 6px;
      font-size: 11px;
      font-weight: 600;
      color: #0066cc;
      background: #e6f2ff;
      border: 1px solid #99ccff;
      border-radius: 4px;
      cursor: pointer;
      vertical-align: middle;
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
      <label class="cgf-pill" id="pill-dimMode" title="Fade filtered rows to 15% opacity instead of removing them">
        <input type="checkbox" id="cb-dimMode"> Dim Instead of Hide
      </label>
      <button class="cgf-btn" id="cgf-reset-whatif" title="Revert any tested What-If scores back to official grades">
        ↺ Reset What-Ifs
      </button>
    </div>
  `;

  gradesTable.parentNode.insertBefore(bar, gradesTable);

  // Wire up checkbox events
  ['hidePerfect', 'hideUngraded', 'hideGraded', 'dimMode'].forEach(key => {
    const cb = document.getElementById(`cb-${key}`);
    cb.addEventListener('change', (e) => {
      state[key] = e.target.checked;
      // Make hideUngraded and hideGraded mutually exclusive so you don't accidentally hide everything
      if (key === 'hideUngraded' && state.hideUngraded && state.hideGraded) {
        state.hideGraded = false;
      } else if (key === 'hideGraded' && state.hideGraded && state.hideUngraded) {
        state.hideUngraded = false;
      }
      syncUI();
      applyFilters();
    });
  });

  // Wire up Reset What-If button
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
  ['hidePerfect', 'hideUngraded', 'hideGraded', 'dimMode'].forEach(key => {
    const cb = document.getElementById(`cb-${key}`);
    const pill = document.getElementById(`pill-${key}`);
    if (cb && pill) {
      cb.checked = state[key];
      pill.classList.toggle('active', state[key]);
    }
  });
}

// 3. Parse every assignment row to determine its exact status & score
function parseAssignmentRow(row) {
  const statusEl = row.querySelector('.submission_status');
  const origPointsEl = row.querySelector('.original_points');
  const origScoreEl = row.querySelector('.original_score');
  const gradeEl = row.querySelector('.grade');
  const contextEl = row.querySelector('.context');

  const statusText = statusEl ? statusEl.textContent.trim().toLowerCase() : '';
  const pointsPossible = origPointsEl ? parseFloat(origPointsEl.textContent.trim()) : NaN;
  const rawScore = origScoreEl ? parseFloat(origScoreEl.textContent.trim()) : NaN;

  // Detect visible grade text (in case of EX or What-If edits)
  let visibleGradeText = '';
  if (gradeEl) {
    const clone = gradeEl.cloneNode(true);
    clone.querySelectorAll('.tooltip_wrap, .screenreader-only').forEach(el => el.remove());
    visibleGradeText = clone.textContent.trim().toUpperCase();
  }

  const isExempt = statusText === 'excused' || visibleGradeText === 'EX' || visibleGradeText.includes('EXEMPT');
  const isZeroPoints = (pointsPossible === 0);
  const isGraded = !isNaN(rawScore) && statusText !== 'unsubmitted' && visibleGradeText !== '-';
  const isUngraded = !isExempt && !isZeroPoints && (isNaN(rawScore) || visibleGradeText === '-' || visibleGradeText === '');

  // Perfect or Extra Credit (>= 100%), OR Exempt, OR 0/0 assignment
  const isPerfectOrExempt = isExempt || isZeroPoints || (isGraded && pointsPossible > 0 && rawScore >= pointsPossible);
  const isImperfectGraded = isGraded && pointsPossible > 0 && rawScore < pointsPossible && !isExempt;

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
  const weightRows = document.querySelectorAll('#assignments-not-weighted tbody tr, aside table.summary tbody tr');
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

  // Sum total graded points per category so we know each assignment's share of its category
  const rows = Array.from(document.querySelectorAll('tr.student_assignment'));
  const categoryGradedPoints = {};

  const parsedRows = rows.map(row => {
    const data = parseAssignmentRow(row);
    if (data.isGraded && !data.isExempt && data.pointsPossible > 0 && data.category) {
      categoryGradedPoints[data.category] = (categoryGradedPoints[data.category] || 0) + data.pointsPossible;
    }
    return { row, data };
  });

  // Add impact badges and quick What-If buttons to imperfect assignments
  parsedRows.forEach(({ row, data }) => {
    if (!data.isImperfectGraded) return;

    const pointsLost = data.pointsPossible - data.rawScore;
    const titleCell = row.querySelector('th.title');
    const scoreHolder = row.querySelector('.score_holder');

    // A) Inject True Course Grade Impact Badge
    const groupWeight = weights[data.category];
    const totalGroupPts = categoryGradedPoints[data.category];

    if (titleCell && !titleCell.querySelector('.cgf-impact-badge')) {
      const badge = document.createElement('div');
      badge.className = 'cgf-impact-badge';

      if (groupWeight && totalGroupPts > 0) {
        // Formula: (Points Lost / Total Graded Points in Category) * Category Weight %
        const courseImpact = (pointsLost / totalGroupPts) * groupWeight;
        badge.textContent = `📉 -${courseImpact.toFixed(2)}% overall grade impact (${pointsLost} pts lost)`;
      } else {
        badge.textContent = `📉 -${pointsLost} pts lost`;
      }
      titleCell.appendChild(badge);
    }

    // B) Inject One-Click "Test 100%" What-If Button
    if (scoreHolder && !scoreHolder.querySelector('.cgf-whatif-btn')) {
      const btn = document.createElement('button');
      btn.className = 'cgf-whatif-btn';
      btn.type = 'button';
      btn.title = `Test What-If Score: ${data.pointsPossible}/${data.pointsPossible}`;
      btn.textContent = `✨ Test ${data.pointsPossible}/${data.pointsPossible}`;

      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const gradeSpan = row.querySelector('.grade');
        if (gradeSpan) {
          gradeSpan.click(); // Opens Canvas's native What-If input box
          setTimeout(() => {
            const input = row.querySelector('input.what_if_score, .score_holder input[type="text"]');
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

// 5. Hide or Dim Rows Based on Active Toggles (Leaves Category Totals Untouched!)
function applyFilters() {
  const rows = document.querySelectorAll('tr.student_assignment');
  let visibleCount = 0;
  let totalCount = rows.length;

  rows.forEach(row => {
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

    // Reset classes first
    row.classList.remove('cgf-hidden-row', 'cgf-dimmed-row');

    // Also find associated sub-rows (like open score details box plots, comments, or rubrics)
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

  const statsEl = document.getElementById('cgf-stats');
  if (statsEl) {
    statsEl.textContent = `(Showing ${visibleCount} of ${totalCount} assignments)`;
  }
}

// 6. Listen for messages from the Chrome Toolbar Popup (Option B + Option A stay in sync)
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

// Run when page loads
initGradeFocus();
