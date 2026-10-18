const keys = ['hidePerfect', 'hideUngraded', 'hideGraded', 'hideTotals', 'dimMode'];

chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const activeTab = tabs[0];
  if (!activeTab || !activeTab.url.includes('psu.instructure.com/courses/')) {
    document.getElementById('status-note').textContent = 'Open a PSU Canvas Grades page to use!';
    return;
  }

  chrome.tabs.sendMessage(activeTab.id, { type: 'GET_STATE' }, (res) => {
    if (chrome.runtime.lastError || !res) return;
    syncPopupUI(res.state);
  });

  keys.forEach(key => {
    document.getElementById(`pop-${key}`).addEventListener('change', (e) => {
      const update = { [key]: e.target.checked };
      if (key === 'hideUngraded' && e.target.checked) update.hideGraded = false;
      if (key === 'hideGraded' && e.target.checked) update.hideUngraded = false;

      chrome.tabs.sendMessage(activeTab.id, { type: 'SET_STATE', state: update }, (res) => {
        if (res && res.state) syncPopupUI(res.state);
      });
    });
  });
});

function syncPopupUI(state) {
  keys.forEach(key => {
    const el = document.getElementById(`pop-${key}`);
    if (el) el.checked = !!state[key];
  });
}
