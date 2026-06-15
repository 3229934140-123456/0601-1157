const state = {
  history: [],
  filtered: [],
  currentPage: 1,
  pageSize: 20,
  searchQuery: '',
  scenarioFilter: 'all',
  adoptFilter: 'all',
  shopFilter: 'all',
  toneFilter: 'all',
  adoptedIds: [],
  shops: [],
  currentTrendType: 'shop'
};

const TONE_LABELS = { professional: '专业', friendly: '亲切', humorous: '幽默', concise: '简洁', enthusiastic: '热情' };
const SCENARIO_LABELS = { pre_sales: '售前', after_sales: '售后', unknown: '其他' };

document.addEventListener('DOMContentLoaded', () => {
  loadData();
  bindEvents();
  bindTrendTabEvents();
});

function loadData() {
  Promise.all([
    new Promise(resolve => chrome.runtime.sendMessage({ action: 'getHistory' }, res => resolve(res))),
    new Promise(resolve => chrome.storage.local.get(['adoptedReplies'], res => resolve(res.adoptedReplies || []))),
    new Promise(resolve => chrome.runtime.sendMessage({ action: 'getSettings' }, res => resolve(res)))
  ]).then(([historyRes, adoptedIds, settingsRes]) => {
    if (historyRes.success) {
      state.history = historyRes.data;
    }
    state.adoptedIds = adoptedIds || [];
    if (settingsRes && settingsRes.success) {
      state.shops = settingsRes.data?.shops || [];
    }

    state.history.forEach(h => {
      if (h.replyId && state.adoptedIds.includes(h.replyId)) {
        h.adopted = true;
        h.status = 'adopted';
      }
    });

    populateShopFilter();
    applyFilters();
    renderStats();
    renderTrendChart();
    renderHistoryList();
    renderPagination();
  });
}

function populateShopFilter() {
  const select = document.getElementById('shopFilter');
  if (!select) return;
  select.innerHTML = '<option value="all">全部店铺</option>' + 
    state.shops.map(shop => `<option value="${shop.id}">${shop.name}</option>`).join('');
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

  const shopFilter = document.getElementById('shopFilter');
  if (shopFilter) {
    shopFilter.addEventListener('change', (e) => {
      state.shopFilter = e.target.value;
      state.currentPage = 1;
      applyFilters();
      renderHistoryList();
      renderPagination();
    });
  }

  const toneFilter = document.getElementById('toneFilter');
  if (toneFilter) {
    toneFilter.addEventListener('change', (e) => {
      state.toneFilter = e.target.value;
      state.currentPage = 1;
      applyFilters();
      renderHistoryList();
      renderPagination();
    });
  }

  document.getElementById('clearHistory').addEventListener('click', () => {
    if (confirm('确定要清空所有历史记录吗？此操作不可恢复。')) {
      chrome.runtime.sendMessage({ action: 'clearHistory' }, () => {
        state.history = [];
        state.filtered = [];
        state.adoptedIds = [];
        renderStats();
        renderTrendChart();
        renderHistoryList();
        renderPagination();
      });
    }
  });
}

function bindTrendTabEvents() {
  document.querySelectorAll('.trend-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      state.currentTrendType = btn.dataset.trend;
      document.querySelectorAll('.trend-tab').forEach(b => {
        b.classList.toggle('active', b.dataset.trend === state.currentTrendType);
      });
      renderTrendChart();
    });
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

    if (state.shopFilter !== 'all' && item.shopId !== state.shopFilter) {
      return false;
    }

    if (state.toneFilter !== 'all' && item.tone !== state.toneFilter) {
      return false;
    }

    const isAdopted = item.adopted || (item.replyId && state.adoptedIds.includes(item.replyId));
    if (state.adoptFilter === 'adopted' && !isAdopted) return false;
    if (state.adoptFilter === 'pending' && isAdopted) return false;

    return true;
  });
}

function renderStats() {
  chrome.runtime.sendMessage({ action: 'getAdoptionRate' }, (response) => {
    if (response && response.success) {
      document.getElementById('statTotal').textContent = response.data.total;
      document.getElementById('statAdopted').textContent = response.data.adopted;
      document.getElementById('statRejected').textContent = response.data.pending || 0;
      document.getElementById('statRate').textContent = response.data.rate + '%';
    } else {
      const uniqueReplies = [...new Set(state.history.filter(h => h.replyId).map(h => h.replyId))];
      const total = uniqueReplies.length;
      const adopted = state.adoptedIds.filter(id => uniqueReplies.includes(id)).length;
      const pending = total - adopted;
      const rate = total > 0 ? Math.round((adopted / total) * 100) : 0;

      document.getElementById('statTotal').textContent = total;
      document.getElementById('statAdopted').textContent = adopted;
      document.getElementById('statRejected').textContent = pending;
      document.getElementById('statRate').textContent = rate + '%';
    }
  });
}

function renderTrendChart() {
  const chartEl = document.getElementById('trendChart');
  if (!chartEl) return;

  const validRecords = state.history.filter(h => h.replyId);
  
  let groups = {};
  const type = state.currentTrendType;
  
  if (type === 'shop') {
    state.shops.forEach(shop => {
      groups[shop.id] = { label: shop.name, total: 0, adopted: 0 };
    });
    validRecords.forEach(r => {
      const shopId = r.shopId || 'default';
      if (!groups[shopId]) groups[shopId] = { label: '其他店铺', total: 0, adopted: 0 };
      groups[shopId].total++;
      if (state.adoptedIds.includes(r.replyId)) groups[shopId].adopted++;
    });
  } else if (type === 'scenario') {
    groups = {
      pre_sales: { label: '售前', total: 0, adopted: 0 },
      after_sales: { label: '售后', total: 0, adopted: 0 },
      unknown: { label: '其他', total: 0, adopted: 0 }
    };
    validRecords.forEach(r => {
      const scenario = r.scenario || 'unknown';
      if (!groups[scenario]) groups[scenario] = { label: scenario, total: 0, adopted: 0 };
      groups[scenario].total++;
      if (state.adoptedIds.includes(r.replyId)) groups[scenario].adopted++;
    });
  } else if (type === 'tone') {
    Object.keys(TONE_LABELS).forEach(tone => {
      groups[tone] = { label: TONE_LABELS[tone], total: 0, adopted: 0 };
    });
    validRecords.forEach(r => {
      const tone = r.tone || 'professional';
      if (!groups[tone]) groups[tone] = { label: tone, total: 0, adopted: 0 };
      groups[tone].total++;
      if (state.adoptedIds.includes(r.replyId)) groups[tone].adopted++;
    });
  }

  const chartEntries = Object.entries(groups).filter(([_, g]) => g.total > 0);
  
  if (chartEntries.length === 0) {
    chartEl.innerHTML = `
      <div style="text-align:center;padding:30px;color:#9ca3af;font-size:13px;">
        暂无统计数据，生成回复后将显示趋势
      </div>
    `;
    return;
  }

  const maxTotal = Math.max(...chartEntries.map(([_, g]) => g.total), 1);
  chartEl.innerHTML = chartEntries.map(([key, group]) => {
    const rate = group.total > 0 ? Math.round((group.adopted / group.total) * 100) : 0;
    const width = Math.round((group.total / maxTotal) * 100);
    return `
      <div class="trend-item">
        <div class="trend-label">${group.label}</div>
        <div class="trend-bar-wrap">
          <div class="trend-bar" style="width: ${width}%">
            <span class="trend-bar-value">${rate}%</span>
          </div>
        </div>
        <div class="trend-stats">
          <span class="trend-count">${group.adopted}/${group.total}</span>
        </div>
      </div>
    `;
  }).join('');
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

  const scenarioLabel = { pre_sales: '售前', after_sales: '售后' };
  const emotionLabel = { happy: '😊 满意', angry: '😠 激动', neutral: '😐 平稳' };
  const toneLabel = TONE_LABELS;
  const shopMap = {};
  state.shops.forEach(s => shopMap[s.id] = s.name);

  list.innerHTML = pageData.map(item => {
    const isAdopted = item.adopted || (item.replyId && state.adoptedIds.includes(item.replyId));
    const statusTag = isAdopted
      ? '<span class="tag tag-adopted">✓ 已采纳</span>'
      : '<span class="tag tag-pending" style="background:#fef3c7;color:#92400e;">⏳ 待确认</span>';

    return `
    <div class="history-item" data-id="${item.id}">
      <div class="history-header">
        <div class="history-meta">
          <span class="history-time">${new Date(item.createdAt).toLocaleString()}</span>
          ${item.scenario ? `<span class="tag tag-scenario ${item.scenario}">${scenarioLabel[item.scenario] || item.scenario}</span>` : ''}
          ${item.tone ? `<span class="tag" style="background:#f0f9ff;color:#0369a1;">${toneLabel[item.tone] || item.tone}</span>` : ''}
          ${item.shopId && shopMap[item.shopId] ? `<span class="tag" style="background:#fdf4ff;color:#7e22ce;">${shopMap[item.shopId]}</span>` : ''}
          ${item.emotion ? `<span class="tag tag-emotion ${item.emotion}">${emotionLabel[item.emotion] || item.emotion}</span>` : ''}
          ${statusTag}
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
  `;}).join('');
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
      if (item.replyId) {
        chrome.runtime.sendMessage({ action: 'markReplyAdopted', replyId: item.replyId }, (res) => {
          if (res && res.success && !res.alreadyAdopted && res.updated) {
            if (!state.adoptedIds.includes(item.replyId)) {
              state.adoptedIds.push(item.replyId);
            }
            item.adopted = true;
            item.status = 'adopted';
            renderStats();
            renderTrendChart();
            renderHistoryList();
          }
        });
      }
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
