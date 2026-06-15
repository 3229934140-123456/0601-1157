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

function bindEvents() {
  document.getElementById('openSidebar').addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.sidePanel.open({ tabId: tabs[0].id }).catch(() => {
          chrome.tabs.sendMessage(tabs[0].id, { action: 'toggleSidebar' });
        });
        window.close();
      }
    });
  });
  
  document.getElementById('openHistory').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('history.html') });
    window.close();
  });
  
  document.getElementById('openScripts').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('sidebar.html') });
    window.close();
  });
  
  document.getElementById('openSettings').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
    window.close();
  });
}
