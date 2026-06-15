const state = {
  history: [],
  filtered: [],
  currentPage: 1,
  pageSize: 20,
  searchQuery: '',
  scenarioFilter: 'all',
  adoptFilter: 'all'
};

document.addEventListener('DOMContentLoaded', () => {
  loadHistory();
  bindEvents();
});

function loadHistory() {
  chrome.runtime.sendMessage({ action: 'getHistory' }, (response) => {
    if (response.success) {
      state.history = response.data;
      applyFilters();
      renderStats();
      renderHistoryList();
      renderPagination();
    }
  });
}

function bindEvents() {
  document.getElementById('searchInput').addEventListener('input', (e) => {
    state.searchQuery = e.target.value.toLowerCase();
    state.currentPage = 1;
    applyFilters();
    renderHistoryList();
    renderPagination();
  });
  
  document.getElementById('scenarioFilter').addEventListener('change', (e) => {
    state.scenarioFilter = e.target.value;
    state.currentPage = 1;
    applyFilters();
    renderHistoryList();
    renderPagination();
  });
  
  document.getElementById('adoptFilter').addEventListener('change', (e) => {
    state.adoptFilter = e.target.value;
    state.currentPage = 1;
    applyFilters();
    renderHistoryList();
    renderPagination();
  });
  
  document.getElementById('clearHistory').addEventListener('click', () => {
    if (confirm('确定要清空所有历史记录吗？此操作不可恢复。')) {
      chrome.runtime.sendMessage({ action: 'clearHistory' }, () => {
        state.history = [];
        state.filtered = [];
        renderStats();
        renderHistoryList();
        renderPagination();
      });
    }
  });
}

function applyFilters() {
  state.filtered = state.history.filter(item => {
    if (state.searchQuery && !item.content.toLowerCase().includes(state.searchQuery)) {
      return false;
    }
    
    if (state.scenarioFilter !== 'all' && item.scenario !== state.scenarioFilter) {
      return false;
    }
    
    if (state.adoptFilter === 'adopted' && !item.adopted) return false;
    if (state.adoptFilter === 'rejected' && item.adopted) return false;
    
    return true;
  });
}

function renderStats() {
  const total = state.history.length;
  const adopted = state.history.filter(h => h.adopted).length;
  const rejected = total - adopted;
  const rate = total > 0 ? Math.round((adopted / total) * 100) : 0;
  
  document.getElementById('statTotal').textContent = total;
  document.getElementById('statAdopted').textContent = adopted;
  document.getElementById('statRejected').textContent = rejected;
  document.getElementById('statRate').textContent = rate + '%';
}

function renderHistoryList() {
  const list = document.getElementById('historyList');
  const start = (state.currentPage - 1) * state.pageSize;
  const end = start + state.pageSize;
  const pageData = state.filtered.slice(start, end);
  
  if (pageData.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="12" cy="12" r="10"/>
          <path d="M12 6v6l4 2"/>
        </svg>
        <h3>暂无记录</h3>
        <p>生成的回复会在这里显示</p>
      </div>
    `;
    return;
  }
  
  const scenarioLabels = { pre_sales: '售前', after_sales: '售后' };
  const emotionLabels = { happy: '😊 满意', angry: '😠 激动', neutral: '😐 平稳' };
  
  list.innerHTML = pageData.map(item => `
    <div class="history-item" data-id="${item.id}">
      <div class="history-header">
        <div class="history-meta">
          <span class="history-time">${new Date(item.createdAt).toLocaleString()}</span>
          ${item.scenario ? `<span class="tag tag-scenario ${item.scenario}">${scenarioLabels[item.scenario] || item.scenario}</span>` : ''}
          ${item.emotion ? `<span class="tag tag-emotion ${item.emotion}">${emotionLabels[item.emotion] || item.emotion}</span>` : ''}
          <span class="tag tag-adopted">${item.adopted ? '✓ 已采纳' : '✗ 未采纳'}</span>
        </div>
      </div>
      <div class="history-content">${escapeHtml(item.content)}</div>
      <div class="history-actions">
        <button class="mini-btn" onclick="copyContent('${item.id}')">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
          </svg>
          复制
        </button>
        <button class="mini-btn primary" onclick="saveToScripts('${item.id}')">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
          </svg>
          收藏
        </button>
      </div>
    </div>
  `).join('');
}

function renderPagination() {
  const pagination = document.getElementById('pagination');
  const totalPages = Math.ceil(state.filtered.length / state.pageSize);
  
  if (totalPages <= 1) {
    pagination.innerHTML = '';
    return;
  }
  
  let html = `
    <button class="page-btn" ${state.currentPage === 1 ? 'disabled' : ''} onclick="goToPage(${state.currentPage - 1})">
      ‹
    </button>
  `;
  
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= state.currentPage - 1 && i <= state.currentPage + 1)) {
      html += `<button class="page-btn ${i === state.currentPage ? 'active' : ''}" onclick="goToPage(${i})">${i}</button>`;
    } else if (i === state.currentPage - 2 || i === state.currentPage + 2) {
      html += `<span style="padding: 0 4px; color: #9ca3af;">...</span>`;
    }
  }
  
  html += `
    <button class="page-btn" ${state.currentPage === totalPages ? 'disabled' : ''} onclick="goToPage(${state.currentPage + 1})">
      ›
    </button>
  `;
  
  pagination.innerHTML = html;
}

window.goToPage = function(page) {
  state.currentPage = page;
  renderHistoryList();
  renderPagination();
};

window.copyContent = function(id) {
  const item = state.history.find(h => h.id === id);
  if (item) {
    navigator.clipboard.writeText(item.content).then(() => {
      showToast('已复制');
    });
  }
};

window.saveToScripts = function(id) {
  const item = state.history.find(h => h.id === id);
  if (!item) return;
  
  const script = {
    title: '历史回复 ' + new Date(item.createdAt).toLocaleString(),
    category: '其他',
    tags: ['历史记录'],
    content: item.content,
    favorite: false
  };
  
  chrome.runtime.sendMessage({ action: 'saveScript', data: script }, () => {
    showToast('已收藏到话术库');
  });
};

function showToast(message) {
  const toast = document.createElement('div');
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    padding: 10px 20px;
    background: #111827;
    color: white;
    border-radius: 8px;
    font-size: 14px;
    z-index: 9999;
    animation: fadeIn 0.3s ease;
  `;
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, 2000);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
