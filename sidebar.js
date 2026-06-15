const state = {
  settings: null,
  scripts: [],
  currentTone: 'professional',
  currentTab: 'generate',
  currentCategory: 'all',
  currentScriptSearch: '',
  conversationMessages: [],
  analysis: null,
  generatedReply: null,
  editingScriptId: null
};

document.addEventListener('DOMContentLoaded', init);

async function init() {
  await loadSettings();
  await loadScripts();
  bindTabEvents();
  bindToneEvents();
  bindGenerateEvents();
  bindCopySendEvents();
  bindScriptEvents();
  bindSettingsEvents();
  bindQualityEvents();
  bindModalEvents();
  bindSuggestionEvents();
  loadShopSelector();
  updateQualityStats();
  loadScriptsList();
  listenConversationUpdates();
}

function listenConversationUpdates() {
  window.addEventListener('message', (event) => {
    if (event.data.type === 'CONVERSATION_UPDATE') {
      state.conversationMessages = event.data.data;
      autoAnalyzeConversation();
    }
  });
}

async function loadSettings() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: 'getSettings' }, (response) => {
      if (response.success) {
        state.settings = response.data;
      }
      resolve();
    });
  });
}

async function loadScripts() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: 'getScripts' }, (response) => {
      if (response.success) {
        state.scripts = response.data;
      }
      resolve();
    });
  });
}

function loadShopSelector() {
  const select = document.getElementById('shopSelect');
  if (!state.settings) return;
  
  select.innerHTML = state.settings.shops.map(shop => 
    `<option value="${shop.id}">${shop.name}</option>`
  ).join('');
  
  select.value = state.settings.currentShop;
  
  select.addEventListener('change', (e) => {
    state.settings.currentShop = e.target.value;
    chrome.runtime.sendMessage({
      action: 'saveSettings',
      data: state.settings
    });
  });
}

function bindTabEvents() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      switchTab(tab);
    });
  });
  
  document.getElementById('btnSettings').addEventListener('click', () => {
    switchTab('settings');
    populateSettingsForm();
  });
  
  document.getElementById('btnHistory').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('history.html') });
  });
}

function switchTab(tab) {
  state.currentTab = tab;
  
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.toggle('active', content.id === `tab-${tab}`);
    content.style.display = content.id === `tab-${tab}` ? 'block' : 'none';
  });
  
  if (tab === 'quality') {
    loadQualityRecords();
  }
}

function bindToneEvents() {
  document.querySelectorAll('.tone-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.currentTone = btn.dataset.tone;
      document.querySelectorAll('.tone-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.tone === state.currentTone);
      });
    });
  });
}

function bindGenerateEvents() {
  document.getElementById('btnRefresh').addEventListener('click', refreshConversation);
  
  document.getElementById('btnGenerate').addEventListener('click', generateReply);
  
  document.getElementById('btnExtractIssues').addEventListener('click', extractIssues);
  
  document.getElementById('btnRewrite').addEventListener('click', rewriteTone);
  
  document.getElementById('btnFavorite').addEventListener('click', favoriteCurrentReply);
  
  document.getElementById('replyContent').addEventListener('input', (e) => {
    document.getElementById('charCount').textContent = e.target.value.length;
  });
}

async function refreshConversation() {
  window.parent.postMessage({ type: 'REFRESH_CONVERSATION' }, '*');
  showToast('正在读取对话...', 'success');
  
  setTimeout(async () => {
    if (state.conversationMessages.length > 0) {
      await analyzeConversation(state.conversationMessages);
    } else {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, { action: 'getConversation' }, async (response) => {
            if (response && response.success && response.data.length > 0) {
              state.conversationMessages = response.data;
              await analyzeConversation(response.data);
            } else {
              showToast('未检测到对话内容', 'error');
            }
          });
        }
      });
    }
  }, 300);
}

function autoAnalyzeConversation() {
  if (state.conversationMessages.length > 0) {
    analyzeConversation(state.conversationMessages);
  }
}

async function analyzeConversation(messages) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({
      action: 'analyzeConversation',
      data: { messages }
    }, (response) => {
      if (response.success) {
        state.analysis = response.data;
        renderAnalysis(response.data);
      }
      resolve();
    });
  });
}

function renderAnalysis(analysis) {
  const tagsContainer = document.getElementById('analysisTags');
  const summaryEl = document.getElementById('analysisSummary');
  const orderInfo = document.getElementById('orderInfo');
  const orderIdEl = document.getElementById('orderId');
  
  const scenarioLabel = analysis.scenario === 'after_sales' ? '售后场景' : '售前场景';
  const emotionLabels = { happy: '😊 情绪满意', angry: '😠 情绪激动', neutral: '😐 情绪平稳' };
  const riskLabels = { high: '🔴 高风险', medium: '🟡 中风险', low: '🟢 低风险' };
  
  tagsContainer.innerHTML = `
    <span class="tag tag-scenario ${analysis.scenario}">${scenarioLabel}</span>
    <span class="tag tag-emotion ${analysis.emotion}">${emotionLabels[analysis.emotion]}</span>
    <span class="tag tag-risk ${analysis.riskLevel}">${riskLabels[analysis.riskLevel]}</span>
  `;
  
  summaryEl.textContent = analysis.summary;
  
  if (analysis.orderId) {
    orderInfo.style.display = 'flex';
    orderIdEl.textContent = analysis.orderId;
  } else {
    orderInfo.style.display = 'none';
  }
  
  if (analysis.riskLevel === 'high') {
    showToast('⚠️ 检测到高风险投诉，请谨慎处理', 'error');
  }
}

async function generateReply() {
  if (state.conversationMessages.length === 0) {
    showToast('请先刷新读取对话内容', 'error');
    return;
  }
  
  const btn = document.getElementById('btnGenerate');
  btn.disabled = true;
  btn.innerHTML = '<svg width="16" height="16" class="spinning" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> 生成中...';
  
  const context = state.conversationMessages.map(m => m.content).join('\n');
  const customerIssue = state.analysis?.issues?.join(',') || '';
  
  chrome.runtime.sendMessage({
    action: 'generateReply',
    data: {
      context,
      tone: state.currentTone,
      scenario: state.analysis?.scenario || 'pre_sales',
      customerIssue
    }
  }, (response) => {
    btn.disabled = false;
    btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg> AI 生成回复';
    
    if (response.success) {
      state.generatedReply = response.data;
      const replyText = filterSensitiveWords(response.data.primary);
      document.getElementById('replyContent').value = replyText;
      document.getElementById('charCount').textContent = replyText.length;
      
      if (response.data.alternatives && response.data.alternatives.length > 0) {
        renderAlternatives(response.data.alternatives);
      }
      
      if (response.data.extractedIssues && response.data.extractedIssues.length > 0) {
        renderExtractedIssues(response.data.extractedIssues);
      }
      
      addHistory(replyText, true);
      showToast('回复生成成功', 'success');
    } else {
      showToast('生成失败: ' + (response.error || '未知错误'), 'error');
    }
  });
}

function renderAlternatives(alternatives) {
  const section = document.getElementById('alternativesSection');
  const list = document.getElementById('alternativesList');
  
  section.style.display = 'block';
  list.innerHTML = alternatives.map(alt => `
    <div class="alternative-item" data-content="${encodeURIComponent(alt.content)}">
      <div class="alternative-tone">${alt.label}</div>
      <div class="alternative-content">${alt.content.slice(0, 80)}...</div>
    </div>
  `).join('');
  
  list.querySelectorAll('.alternative-item').forEach(item => {
    item.addEventListener('click', () => {
      const content = decodeURIComponent(item.dataset.content);
      document.getElementById('replyContent').value = filterSensitiveWords(content);
      document.getElementById('charCount').textContent = content.length;
    });
  });
}

function renderExtractedIssues(issues) {
  const section = document.getElementById('extractedIssues');
  const list = document.getElementById('issuesList');
  
  section.style.display = 'block';
  list.innerHTML = issues.map(issue => 
    `<span class="issue-tag">${issue}</span>`
  ).join('');
}

function extractIssues() {
  if (state.generatedReply?.extractedIssues) {
    renderExtractedIssues(state.generatedReply.extractedIssues);
  } else if (state.analysis?.issues) {
    renderExtractedIssues(state.analysis.issues);
  } else {
    showToast('请先生成回复或刷新对话', 'error');
  }
}

function rewriteTone() {
  const content = document.getElementById('replyContent').value;
  if (!content) {
    showToast('请先生成回复', 'error');
    return;
  }
  
  const rewritten = rewriteHarshTone(content);
  document.getElementById('replyContent').value = rewritten;
  document.getElementById('charCount').textContent = rewritten.length;
  showToast('措辞已软化', 'success');
}

function rewriteHarshTone(text) {
  const replacements = [
    { from: /你必须/g, to: '建议您' },
    { from: /你应该/g, to: '您可以' },
    { from: /不行/g, to: '非常抱歉，暂时无法' },
    { from: /不可能/g, to: '确实比较困难' },
    { from: /我不管/g, to: '我理解您的心情' },
    { from: /随便你/g, to: '您可以根据需要选择' },
    { from: /不关我事/g, to: '让我帮您转接相关同事' },
    { from: /你不懂/g, to: '可能您不太了解' },
    { from: /别问我/g, to: '我帮您查询一下' }
  ];
  
  let result = text;
  replacements.forEach(r => {
    result = result.replace(r.from, r.to);
  });
  
  return result;
}

function favoriteCurrentReply() {
  const content = document.getElementById('replyContent').value;
  if (!content) {
    showToast('请先生成回复', 'error');
    return;
  }
  
  state.editingScriptId = null;
  document.getElementById('modalTitle').textContent = '收藏到话术库';
  document.getElementById('scriptTitle').value = '快捷回复 ' + new Date().toLocaleString();
  document.getElementById('scriptCategory').value = '其他';
  document.getElementById('scriptTags').value = '快捷回复';
  document.getElementById('scriptContent').value = content;
  openModal('modalOverlay');
}

function filterSensitiveWords(text) {
  if (!state.settings?.enableSensitiveFilter) return text;
  
  const words = state.settings?.sensitiveWords || [];
  let result = text;
  
  words.forEach(word => {
    const regex = new RegExp(word, 'g');
    result = result.replace(regex, '***');
  });
  
  return result;
}

function bindCopySendEvents() {
  document.getElementById('btnCopy').addEventListener('click', () => {
    const text = document.getElementById('replyContent').value;
    if (!text) {
      showToast('没有可复制的内容', 'error');
      return;
    }
    
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => {
        showToast('已复制到剪贴板', 'success');
      }).catch(() => {
        fallbackCopy(text);
      });
    } else {
      fallbackCopy(text);
    }
    
    window.parent.postMessage({ type: 'COPY_TO_INPUT', text }, '*');
  });
  
  document.getElementById('btnSend').addEventListener('click', () => {
    const text = document.getElementById('replyContent').value;
    if (!text) {
      showToast('没有可发送的内容', 'error');
      return;
    }
    
    window.parent.postMessage({ type: 'SEND_MESSAGE', text }, '*');
    addHistory(text, true);
    showToast('已发送到聊天框', 'success');
  });
}

function fallbackCopy(text) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
  showToast('已复制到剪贴板', 'success');
}

function bindSuggestionEvents() {
  document.querySelectorAll('.suggestion-card').forEach(card => {
    card.addEventListener('click', () => {
      const type = card.dataset.type;
      const content = getSuggestionContent(type);
      const current = document.getElementById('replyContent').value;
      const newContent = current ? current + '\n\n' + content : content;
      document.getElementById('replyContent').value = newContent;
      document.getElementById('charCount').textContent = newContent.length;
      showToast('已插入内容', 'success');
    });
  });
}

function getSuggestionContent(type) {
  const shop = state.settings?.shops?.find(s => s.id === state.settings.currentShop) || {};
  const rules = shop.rules || {};
  
  const contents = {
    promotion: '🎁 目前店铺优惠活动：\n1. 满299减30，满599减80\n2. 新用户首单立减20元\n3. 下单即送精美礼品一份\n现在下单非常划算哦！',
    return: '↩️ 退换货政策：' + (rules.returnPolicy || '7天无理由退换货，商品需保持原包装、吊牌完好，不影响二次销售。'),
    params: '📋 商品参数：\n【颜色】多色可选\n【尺码】S-XXL\n【材质】优质面料\n【售后】全国联保1年',
    shipping: '🚚 发货说明：' + (rules.shippingPolicy || '下单后48小时内发货，默认快递为顺丰/圆通，偏远地区可能延迟1-2天。')
  };
  
  return contents[type] || '';
}

function bindScriptEvents() {
  document.getElementById('btnAddScript').addEventListener('click', () => {
    state.editingScriptId = null;
    document.getElementById('modalTitle').textContent = '新增话术';
    document.getElementById('scriptTitle').value = '';
    document.getElementById('scriptCategory').value = '接待';
    document.getElementById('scriptTags').value = '';
    document.getElementById('scriptContent').value = '';
    openModal('modalOverlay');
  });
  
  document.getElementById('scriptSearch').addEventListener('input', (e) => {
    state.currentScriptSearch = e.target.value.toLowerCase();
    loadScriptsList();
  });
  
  document.querySelectorAll('.category-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.currentCategory = btn.dataset.category;
      document.querySelectorAll('.category-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.category === state.currentCategory);
      });
      loadScriptsList();
    });
  });
}

function loadScriptsList() {
  const list = document.getElementById('scriptsList');
  
  let filtered = [...state.scripts];
  
  if (state.currentScriptSearch) {
    filtered = filtered.filter(s => 
      s.title.toLowerCase().includes(state.currentScriptSearch) ||
      s.content.toLowerCase().includes(state.currentScriptSearch) ||
      (s.tags && s.tags.some(t => t.toLowerCase().includes(state.currentScriptSearch)))
    );
  }
  
  if (state.currentCategory === 'favorite') {
    filtered = filtered.filter(s => s.favorite);
  } else if (state.currentCategory !== 'all') {
    filtered = filtered.filter(s => s.category === state.currentCategory);
  }
  
  if (filtered.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
        </svg>
        <p>暂无话术</p>
      </div>
    `;
    return;
  }
  
  list.innerHTML = filtered.map(script => `
    <div class="script-item" data-id="${script.id}">
      <div class="script-header">
        <span class="script-title">${script.title}</span>
        <div class="script-actions">
          <button class="script-action-btn favorite ${script.favorite ? 'active' : ''}" data-action="favorite" title="收藏">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="${script.favorite ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
            </svg>
          </button>
          <button class="script-action-btn" data-action="edit" title="编辑">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 20h9"/>
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
            </svg>
          </button>
          <button class="script-action-btn" data-action="delete" title="删除">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
        </div>
      </div>
      <span class="script-category">${script.category}</span>
      <div class="script-content">${escapeHtml(script.content)}</div>
      ${script.tags && script.tags.length > 0 ? `
        <div class="script-tags">
          ${script.tags.map(tag => `<span class="script-tag">${tag}</span>`).join('')}
        </div>
      ` : ''}
      <div class="script-footer">
        <button class="ghost-btn" data-action="copy">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
          </svg>
          复制
        </button>
        <button class="ghost-btn" data-action="use">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="22" y1="2" x2="11" y2="13"/>
            <polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
          使用
        </button>
      </div>
    </div>
  `).join('');
  
  list.querySelectorAll('.script-item').forEach(item => {
    const id = item.dataset.id;
    const script = state.scripts.find(s => s.id === id);
    
    item.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        handleScriptAction(action, script);
      });
    });
  });
}

function handleScriptAction(action, script) {
  switch (action) {
    case 'favorite':
      script.favorite = !script.favorite;
      chrome.runtime.sendMessage({ action: 'saveScript', data: script }, async () => {
        await loadScripts();
        loadScriptsList();
        showToast(script.favorite ? '已收藏' : '已取消收藏', 'success');
      });
      break;
      
    case 'edit':
      state.editingScriptId = script.id;
      document.getElementById('modalTitle').textContent = '编辑话术';
      document.getElementById('scriptTitle').value = script.title;
      document.getElementById('scriptCategory').value = script.category;
      document.getElementById('scriptTags').value = script.tags ? script.tags.join(',') : '';
      document.getElementById('scriptContent').value = script.content;
      openModal('modalOverlay');
      break;
      
    case 'delete':
      if (confirm('确定删除这个话术吗？')) {
        chrome.runtime.sendMessage({ action: 'deleteScript', id: script.id }, async () => {
          await loadScripts();
          loadScriptsList();
          showToast('已删除', 'success');
        });
      }
      break;
      
    case 'copy':
      navigator.clipboard.writeText(script.content).then(() => {
        showToast('已复制', 'success');
      });
      break;
      
    case 'use':
      const current = document.getElementById('replyContent').value;
      const newContent = current ? current + '\n\n' + script.content : script.content;
      document.getElementById('replyContent').value = newContent;
      document.getElementById('charCount').textContent = newContent.length;
      switchTab('generate');
      showToast('已插入回复框', 'success');
      break;
  }
}

function bindSettingsEvents() {
  document.getElementById('btnSaveSettings').addEventListener('click', saveSettings);
  
  document.getElementById('btnAddShop').addEventListener('click', () => {
    const name = prompt('请输入店铺名称:');
    if (name) {
      const newShop = {
        id: Date.now().toString(),
        name,
        rules: {
          tone: 'professional',
          enableSensitiveFilter: true,
          enableRiskDetection: true,
          returnPolicy: '7天无理由退换货，商品需保持原包装、吊牌完好，不影响二次销售。',
          shippingPolicy: '下单后48小时内发货，默认快递为顺丰/圆通。',
          warrantyPolicy: '商品享受全国联保，质保期1年。'
        }
      };
      state.settings.shops.push(newShop);
      renderShopsList();
      loadShopSelector();
    }
  });
}

function populateSettingsForm() {
  if (!state.settings) return;
  
  document.getElementById('apiKey').value = state.settings.apiKey || '';
  document.getElementById('apiEndpoint').value = state.settings.apiEndpoint || '';
  document.getElementById('modelSelect').value = state.settings.model || 'gpt-3.5-turbo';
  document.getElementById('enableSensitiveFilter').checked = state.settings.enableSensitiveFilter !== false;
  document.getElementById('enableRiskDetection').checked = state.settings.enableRiskDetection !== false;
  document.getElementById('sensitiveWords').value = (state.settings.sensitiveWords || []).join(',');
  document.getElementById('showEmotion').checked = state.settings.showEmotion !== false;
  document.getElementById('showQuality').checked = state.settings.showQuality !== false;
  
  renderShopsList();
}

function renderShopsList() {
  const list = document.getElementById('shopsList');
  list.innerHTML = state.settings.shops.map(shop => `
    <div class="shop-item">
      <span class="shop-name">${shop.name}${shop.id === state.settings.currentShop ? ' (当前)' : ''}</span>
      <div class="shop-item-actions">
        <button class="ghost-btn" onclick="setCurrentShop('${shop.id}')">切换</button>
        ${shop.id !== 'default' ? `<button class="ghost-btn" onclick="deleteShop('${shop.id}')">删除</button>` : ''}
      </div>
    </div>
  `).join('');
}

window.setCurrentShop = function(id) {
  state.settings.currentShop = id;
  renderShopsList();
  loadShopSelector();
  showToast('已切换店铺', 'success');
};

window.deleteShop = function(id) {
  if (confirm('确定删除这个店铺吗？')) {
    state.settings.shops = state.settings.shops.filter(s => s.id !== id);
    if (state.settings.currentShop === id) {
      state.settings.currentShop = 'default';
    }
    renderShopsList();
    loadShopSelector();
    showToast('已删除', 'success');
  }
};

function saveSettings() {
  state.settings.apiKey = document.getElementById('apiKey').value;
  state.settings.apiEndpoint = document.getElementById('apiEndpoint').value;
  state.settings.model = document.getElementById('modelSelect').value;
  state.settings.enableSensitiveFilter = document.getElementById('enableSensitiveFilter').checked;
  state.settings.enableRiskDetection = document.getElementById('enableRiskDetection').checked;
  state.settings.sensitiveWords = document.getElementById('sensitiveWords').value.split(',').map(w => w.trim()).filter(w => w);
  state.settings.showEmotion = document.getElementById('showEmotion').checked;
  state.settings.showQuality = document.getElementById('showQuality').checked;
  
  chrome.runtime.sendMessage({
    action: 'saveSettings',
    data: state.settings
  }, () => {
    showToast('设置已保存', 'success');
  });
}

function bindQualityEvents() {
  document.getElementById('btnCompare').addEventListener('click', () => {
    const content = document.getElementById('replyContent').value;
    if (!content) {
      showToast('请先生成或输入回复内容', 'error');
      return;
    }
    document.getElementById('compareOriginal').value = content;
    document.getElementById('compareModified').value = '';
    document.getElementById('qualityScore').value = 85;
    document.getElementById('qualityNotes').value = '';
    openModal('compareModal');
  });
  
  document.getElementById('btnExportQuality').addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'getQualityRecords' }, (response) => {
      if (response.success && response.data.length > 0) {
        chrome.runtime.sendMessage({
          action: 'exportQualityRecords',
          data: response.data
        }, () => {
          showToast('导出成功', 'success');
        });
      } else {
        showToast('暂无质检记录', 'error');
      }
    });
  });
  
  document.getElementById('saveCompare').addEventListener('click', () => {
    const original = document.getElementById('compareOriginal').value;
    const modified = document.getElementById('compareModified').value;
    const score = parseInt(document.getElementById('qualityScore').value) || 0;
    const notes = document.getElementById('qualityNotes').value;
    
    if (!modified) {
      showToast('请输入修改后的内容', 'error');
      return;
    }
    
    const record = {
      originalReply: original,
      modifiedReply: modified,
      qualityScore: score,
      notes,
      scenario: state.analysis?.scenario,
      emotion: state.analysis?.emotion,
      riskLevel: state.analysis?.riskLevel,
      adopted: modified === original
    };
    
    chrome.runtime.sendMessage({ action: 'addQualityRecord', data: record }, async () => {
      closeModal('compareModal');
      await updateQualityStats();
      loadQualityRecords();
      showToast('质检记录已保存', 'success');
    });
  });
}

function updateQualityStats() {
  chrome.runtime.sendMessage({ action: 'getAdoptionRate' }, (response) => {
    if (response.success) {
      document.getElementById('statTotal').textContent = response.data.total;
      document.getElementById('statAdopted').textContent = response.data.adopted;
      document.getElementById('statRate').textContent = response.data.rate + '%';
    }
  });
}

function loadQualityRecords() {
  chrome.runtime.sendMessage({ action: 'getQualityRecords' }, (response) => {
    const list = document.getElementById('qualityList');
    
    if (!response.success || response.data.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
            <polyline points="10 9 9 9 8 9"/>
          </svg>
          <p>暂无质检记录</p>
        </div>
      `;
      return;
    }
    
    const scoreClass = (score) => score >= 80 ? 'high' : score >= 60 ? 'medium' : 'low';
    
    list.innerHTML = response.data.map(record => `
      <div class="quality-item">
        <div class="quality-header">
          <span class="quality-time">${new Date(record.createdAt).toLocaleString()}</span>
          <span class="quality-score ${scoreClass(record.qualityScore || 0)}">${record.qualityScore || 0}分</span>
        </div>
        <div class="quality-compare">
          <div>
            <div class="quality-col-label">AI 生成</div>
            <div class="quality-col-content">${escapeHtml(record.originalReply || '').slice(0, 100)}...</div>
          </div>
          <div>
            <div class="quality-col-label">人工修改</div>
            <div class="quality-col-content">${escapeHtml(record.modifiedReply || '').slice(0, 100)}...</div>
          </div>
        </div>
        ${record.notes ? `<div class="quality-notes">备注：${escapeHtml(record.notes)}</div>` : ''}
      </div>
    `).join('');
  });
}

function addHistory(content, adopted) {
  const record = {
    content,
    adopted,
    scenario: state.analysis?.scenario,
    emotion: state.analysis?.emotion
  };
  chrome.runtime.sendMessage({ action: 'addHistory', data: record }, () => {
    updateQualityStats();
  });
}

function bindModalEvents() {
  document.getElementById('closeModal').addEventListener('click', () => closeModal('modalOverlay'));
  document.getElementById('cancelScript').addEventListener('click', () => closeModal('modalOverlay'));
  document.getElementById('closeCompareModal').addEventListener('click', () => closeModal('compareModal'));
  document.getElementById('cancelCompare').addEventListener('click', () => closeModal('compareModal'));
  
  document.getElementById('saveScript').addEventListener('click', () => {
    const title = document.getElementById('scriptTitle').value.trim();
    const category = document.getElementById('scriptCategory').value;
    const tagsStr = document.getElementById('scriptTags').value.trim();
    const content = document.getElementById('scriptContent').value.trim();
    
    if (!title || !content) {
      showToast('请填写标题和内容', 'error');
      return;
    }
    
    const script = {
      id: state.editingScriptId,
      title,
      category,
      tags: tagsStr ? tagsStr.split(',').map(t => t.trim()).filter(t => t) : [],
      content,
      favorite: false
    };
    
    const existing = state.scripts.find(s => s.id === state.editingScriptId);
    if (existing) {
      script.favorite = existing.favorite;
      script.createdAt = existing.createdAt;
    }
    
    chrome.runtime.sendMessage({ action: 'saveScript', data: script }, async () => {
      await loadScripts();
      loadScriptsList();
      closeModal('modalOverlay');
      showToast('保存成功', 'success');
    });
  });
  
  document.getElementById('modalOverlay').addEventListener('click', (e) => {
    if (e.target.id === 'modalOverlay') closeModal('modalOverlay');
  });
  
  document.getElementById('compareModal').addEventListener('click', (e) => {
    if (e.target.id === 'compareModal') closeModal('compareModal');
  });
}

function openModal(id) {
  document.getElementById(id).style.display = 'flex';
}

function closeModal(id) {
  document.getElementById(id).style.display = 'none';
}

function showToast(message, type = '') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = 'toast show ' + type;
  setTimeout(() => {
    toast.className = 'toast';
  }, 2000);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
