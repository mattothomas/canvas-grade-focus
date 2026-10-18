const keys = ['extensionEnabled', 'calcTotals', 'hidePerfect', 'hideUngraded', 'hideGraded', 'hideTotals', 'dimMode'];

chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const activeTab = tabs[0];
  if (!activeTab || !activeTab.url.includes('psu.instructure.com/courses/')) {
    document.getElementById('status-note').textContent = 'Open a PSU Canvas Grades page to use!';
    return;
  }

  chrome.tabs.sendMessage(activeTab.id, { type: 'GET_STATE' }, (res) => {
    if (chrome.runtime.lastError || !res) return;
    syncPopupUI(res.state, res.isTotalsDisabledByProf);
  });

  keys.forEach(key => {
    const el = document.getElementById(`pop-${key}`);
    if (!el) return;
    el.addEventListener('change', (e) => {
      const update = { [key]: e.target.checked };
      if (key === 'hideUngraded' && e.target.checked) update.hideGraded = false;
      if (key === 'hideGraded' && e.target.checked) update.hideUngraded = false;

      chrome.tabs.sendMessage(activeTab.id, { type: 'SET_STATE', state: update }, (res) => {
        if (res && res.state) syncPopupUI(res.state, res.isTotalsDisabledByProf);
      });
    });
  });
});

function syncPopupUI(state, isTotalsDisabledByProf) {
  keys.forEach(key => {
    const el = document.getElementById(`pop-${key}`);
    if (el) el.checked = !!state[key];
  });

  // Only show the "Calculate Disabled Totals" toggle if the professor disabled totals in this class
  const calcRow = document.getElementById('row-calcTotals');
  if (calcRow) {
    calcRow.style.display = isTotalsDisabledByProf ? 'flex' : 'none';
  }

  // Dim sub-toggles if master switch is turned off
  const subToggles = document.getElementById('sub-toggles');
  if (subToggles) {
    subToggles.classList.toggle('disabled-group', !state.extensionEnabled);
  }
}
