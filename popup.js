document.addEventListener('DOMContentLoaded', () => {
  loadStats();
  bindEvents();
});

function loadStats() {
  chrome.runtime.sendMessage({ action: 'getAdoptionRate' }, (response) => {
    if (response.success) {
      document.getElementById('popupTotal').textContent = response.data.total;
      document.getElementById('popupAdopted').textContent = response.data.adopted;
      document.getElementById('popupRate').textContent = response.data.rate + '%';
    }
  });
}

function openSidebarWithTab(tabName) {
  chrome.storage.local.set({ _navTarget: tabName }, () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const openPromise = tabs[0]
        ? chrome.sidePanel.open({ tabId: tabs[0].id }).catch(() => Promise.resolve())
        : Promise.resolve();

      openPromise.then(() => {
        chrome.tabs.create({ url: chrome.runtime.getURL('sidebar.html#' + tabName) });
        window.close();
      });
    });
  });
}

function bindEvents() {
  document.getElementById('openSidebar').addEventListener('click', () => {
    openSidebarWithTab('generate');
  });

  document.getElementById('openHistory').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('history.html') });
    window.close();
  });

  document.getElementById('openScripts').addEventListener('click', () => {
    openSidebarWithTab('scripts');
  });

  document.getElementById('openSettings').addEventListener('click', (e) => {
    e.preventDefault();
    openSidebarWithTab('settings');
  });
}
