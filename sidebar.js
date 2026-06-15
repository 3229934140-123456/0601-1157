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
  editingScriptId: null,
  currentReplyId: null,
  qualityRecords: [],
  filteredQualityRecords: [],
  qualityFilters: {
    time: 'all',
    scenario: 'all',
    risk: 'all',
    score: 'all'
  },
  currentTrendType: 'shop',
  qualityDetail: null
};

const API_PRESETS = {
  openai: {
    endpoint: 'https://api.openai.com/v1/chat/completions',
    models: ['gpt-3.5-turbo', 'gpt-4', 'gpt-4-turbo'],
    label: 'OpenAI'
  },
  azure: {
    endpoint: 'https://YOUR_RESOURCE.openai.azure.com/openai/deployments/YOUR_DEPLOYMENT/chat/completions?api-version=2024-02-15-preview',
    models: ['gpt-3.5-turbo', 'gpt-4', 'gpt-4-turbo'],
    label: 'Azure OpenAI'
  },
  qwen: {
    endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    models: ['qwen-plus', 'qwen-max', 'qwen-turbo'],
    label: '通义千问'
  },
  doubao: {
    endpoint: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
    models: ['doubao-pro-32k', 'doubao-pro-256k', 'doubao-lite-32k'],
    label: '豆包'
  },
  deepseek: {
    endpoint: 'https://api.deepseek.com/chat/completions',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    label: 'DeepSeek'
  },
  custom: {
    endpoint: '',
    models: [],
    label: '自定义'
  }
};

document.addEventListener('DOMContentLoaded', init);

async function init() {
  await loadSettings();
  await loadScripts();
  await loadQualityRecords();
  applyUIVisibilitySettings();
  bindTabEvents();
  bindToneEvents();
  bindGenerateEvents();
  bindCopySendEvents();
  bindScriptEvents();
  bindSettingsEvents();
  bindQualityEvents();
  bindModalEvents();
  bindSuggestionEvents();
  bindApiPresetEvents();
  bindFilterEvents();
  loadShopSelector();
  updateQualityStats();
  loadTrendChart();
  loadScriptsList();
  listenConversationUpdates();
  handleHashNavigation();
}

function handleHashNavigation() {
  let targetTab = '';
  const hash = window.location.hash.replace('#', '');
  if (hash === 'settings' || hash === 'scripts' || hash === 'quality' || hash === 'generate') {
    targetTab = hash;
  }
  window.location.hash = '';

  if (!targetTab) {
    chrome.storage.local.get(['_navTarget'], (result) => {
      if (result._navTarget) {
        targetTab = result._navTarget;
        chrome.storage.local.remove(['_navTarget']);
        doNavigate(targetTab);
      }
    });
  } else {
    doNavigate(targetTab);
  }
}

function doNavigate(tab) {
  setTimeout(() => {
    switchTab(tab);
    if (tab === 'settings') {
      populateSettingsForm();
    }
    if (tab === 'quality') {
      loadQualityRecords();
      updateQualityStats();
      loadTrendChart();
    }
  }, 100);
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
        if (!state.settings.enableFallback) {
          state.settings.enableFallback = true;
        }
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

async function loadQualityRecords() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: 'getQualityRecords' }, (response) => {
      if (response.success) {
        state.qualityRecords = response.data;
        applyQualityFilters();
      }
      resolve();
    });
  });
}

function applyUIVisibilitySettings() {
  const showEmotion = state.settings?.showEmotion !== false;
  const showQuality = state.settings?.showQuality !== false;

  const emotionTag = document.querySelector('.tag-emotion');
  const analysisTags = document.getElementById('analysisTags');
  if (!showEmotion && analysisTags) {
    const allTags = analysisTags.querySelectorAll('.tag');
    allTags.forEach(tag => {
      if (tag.classList.contains('tag-emotion')) {
        tag.style.display = 'none';
      }
    });
  }

  const qualityTabBtn = document.querySelector('.tab-btn[data-tab="quality"]');
  if (qualityTabBtn) {
    qualityTabBtn.style.display = showQuality ? '' : 'none';
  }

  const qualitySettingsCard = document.getElementById('qualitySettings');
  if (qualitySettingsCard) {
    qualitySettingsCard.style.display = showQuality ? '' : 'none';
  }

  if (!showQuality && state.currentTab === 'quality') {
    switchTab('generate');
    showToast('质检面板已关闭，已返回智能生成页', 'success');
  }
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
  const showQuality = state.settings?.showQuality !== false;
  if (tab === 'quality' && !showQuality) {
    showToast('请先在设置中开启「显示质检面板」', 'error');
    return;
  }

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
    updateQualityStats();
    loadTrendChart();
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
  
  const showEmotion = state.settings?.showEmotion !== false;

  let tagsHtml = `
    <span class="tag tag-scenario ${analysis.scenario}">${scenarioLabel}</span>
  `;
  if (showEmotion) {
    tagsHtml += `<span class="tag tag-emotion ${analysis.emotion}">${emotionLabels[analysis.emotion]}</span>`;
  }
  tagsHtml += `<span class="tag tag-risk ${analysis.riskLevel}">${riskLabels[analysis.riskLevel]}</span>`;

  tagsContainer.innerHTML = tagsHtml;
  
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
      customerIssue,
      enableFallback: state.settings?.enableFallback !== false
    }
  }, (response) => {
    btn.disabled = false;
    btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg> AI 生成回复';
    
    if (response.success) {
      state.generatedReply = response.data;
      const replyText = filterSensitiveWords(response.data.primary);
      document.getElementById('replyContent').value = replyText;
      document.getElementById('charCount').textContent = replyText.length;

      const metaInfo = document.getElementById('apiMetaInfo') || createApiMetaInfo();
      if (response.meta) {
        if (response.meta.usedApi) {
          metaInfo.innerHTML = `<span style="color:#10b981">✓ 已调用 AI 接口 (${response.meta.model || '自定义模型'})</span>`;
        } else if (response.meta.fallback) {
          const reason = response.meta.reason || '使用本地模板';
          const apiError = response.meta.apiError ? `：${response.meta.apiError}` : '';
          const fallbackEnabled = state.settings?.enableFallback !== false;
          const fallbackHint = !fallbackEnabled ? '<br><span style="font-size:11px;color:#ef4444;margin-top:4px;display:block;">提示：您可以在设置中开启「自动使用本地模板」选项</span>' : '';
          metaInfo.innerHTML = `<span style="color:#f59e0b">⚠ ${reason}${apiError}</span>${fallbackHint}`;
        }
      } else {
        metaInfo.innerHTML = '';
      }
      
      if (response.data.alternatives && response.data.alternatives.length > 0) {
        renderAlternatives(response.data.alternatives);
      }
      
      if (response.data.extractedIssues && response.data.extractedIssues.length > 0) {
        renderExtractedIssues(response.data.extractedIssues);
      }
      
      addHistory(replyText, false, state.currentTone, (record) => {
        state.currentReplyId = record.replyId;
      });
      updateQualityStats();
      loadTrendChart();
      showToast('回复生成成功（待采纳）', 'success');
    } else {
      const metaInfo = document.getElementById('apiMetaInfo') || createApiMetaInfo();
      const errMsg = response.error || '未知错误';
      const fallbackEnabled = state.settings?.enableFallback !== false;
      const fallbackHint = !fallbackEnabled 
        ? `<br><span style="font-size:11px;color:#9ca3af;margin-top:4px;display:block;">提示：可在设置中开启「自动使用本地模板」作为备用</span>`
        : '';
      metaInfo.innerHTML = `<span style="color:#ef4444">✗ 生成失败：${errMsg}</span>${fallbackHint}`;
      showToast('生成失败: ' + errMsg, 'error');
    }
  });
}

function createApiMetaInfo() {
  const container = document.querySelector('.reply-section');
  const info = document.createElement('div');
  info.id = 'apiMetaInfo';
  info.style.cssText = 'font-size:12px;margin-bottom:8px;padding:6px 10px;background:#f8fafc;border-radius:6px;line-height:1.5;';
  const btn = document.getElementById('btnGenerate');
  btn.parentNode.insertBefore(info, btn.parentNode.firstChild);
  return info;
}

function renderAlternatives(alternatives) {
  const section = document.getElementById('alternativesSection');
  const list = document.getElementById('alternativesList');
  
  section.style.display = 'block';
  list.innerHTML = alternatives.map(alt => `
    <div class="alternative-item" data-content="${encodeURIComponent(alt.content)}" data-tone="${alt.tone}">
      <div class="alternative-tone">${alt.label}</div>
      <div class="alternative-content">${alt.content.slice(0, 80)}...</div>
    </div>
  `).join('');
  
  list.querySelectorAll('.alternative-item').forEach(item => {
    item.addEventListener('click', () => {
      const content = decodeURIComponent(item.dataset.content);
      const tone = item.dataset.tone;
      document.getElementById('replyContent').value = filterSensitiveWords(content);
      document.getElementById('charCount').textContent = content.length;
      if (tone) {
        state.currentTone = tone;
        document.querySelectorAll('.tone-btn').forEach(b => {
          b.classList.toggle('active', b.dataset.tone === tone);
        });
      }
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
    
    markCurrentReplyAdopted();
    window.parent.postMessage({ type: 'COPY_TO_INPUT', text }, '*');
    updateQualityStats();
    loadTrendChart();
  });
  
  document.getElementById('btnSend').addEventListener('click', () => {
    const text = document.getElementById('replyContent').value;
    if (!text) {
      showToast('没有可发送的内容', 'error');
      return;
    }
    
    window.parent.postMessage({ type: 'SEND_MESSAGE', text }, '*');
    markCurrentReplyAdopted();
    updateQualityStats();
    loadTrendChart();
    showToast('已发送到聊天框', 'success');
  });
}

function markCurrentReplyAdopted() {
  if (state.currentReplyId) {
    chrome.runtime.sendMessage({
      action: 'markReplyAdopted',
      replyId: state.currentReplyId
    }, (response) => {
      if (response && response.success) {
        if (response.alreadyAdopted) {
        } else if (response.updated) {
          showToast('已采纳（采纳率已更新）', 'success');
        }
        if (response.stats) {
          document.getElementById('statTotal').textContent = response.stats.total;
          document.getElementById('statAdopted').textContent = response.stats.adopted;
          document.getElementById('statPending').textContent = response.stats.pending || 0;
          document.getElementById('statRate').textContent = response.stats.rate + '%';
        }
      }
    });
  }
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

  document.getElementById('btnTestApi').addEventListener('click', testApiConnection);
}

function bindApiPresetEvents() {
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const preset = btn.dataset.preset;
      const config = API_PRESETS[preset];
      
      document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      document.getElementById('apiEndpoint').value = config.endpoint;
      
      const modelSelect = document.getElementById('modelSelect');
      const currentModels = Array.from(modelSelect.options).map(o => o.value);
      
      config.models.forEach(model => {
        if (!currentModels.includes(model)) {
          const option = document.createElement('option');
          option.value = model;
          option.textContent = model;
          modelSelect.appendChild(option);
        }
      });
      
      if (config.models.length > 0 && !config.models.includes(modelSelect.value)) {
        modelSelect.value = config.models[0];
      }
      
      showToast(`已切换到 ${config.label} 预设`, 'success');
    });
  });
}

function testApiConnection() {
  const apiKey = document.getElementById('apiKey').value.trim();
  const apiEndpoint = document.getElementById('apiEndpoint').value.trim();
  const model = document.getElementById('modelSelect').value;
  const resultEl = document.getElementById('apiTestResult');

  if (!apiKey) {
    showApiResult(resultEl, false, '缺少 API Key', '请先在上方输入您的 API Key');
    return;
  }
  if (!apiEndpoint) {
    showApiResult(resultEl, false, '缺少 API 地址', '请先填写或选择 API 接口地址');
    return;
  }
  if (!model) {
    showApiResult(resultEl, false, '缺少模型名称', '请选择要使用的模型');
    return;
  }

  const btn = document.getElementById('btnTestApi');
  const originalText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<svg width="14" height="14" class="spinning" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> 测试中...';

  fetch(apiEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model,
      messages: [{ role: 'user', content: 'Hello, this is a connection test.' }],
      max_tokens: 5
    })
  }).then(async (response) => {
    if (!response.ok) {
      let errDetail = `HTTP ${response.status}`;
      try {
        const errData = await response.json();
        if (errData.error?.message) {
          errDetail += '：' + errData.error.message;
        }
      } catch (_) {}
      throw new Error(errDetail);
    }
    return response.json();
  }).then((data) => {
    const modelName = data.model || model;
    showApiResult(resultEl, true, '连接成功！', `API 返回正常，模型：${modelName}`);
  }).catch((error) => {
    let reason = error.message || '网络错误';
    let suggestion = '';
    
    if (reason.includes('401') || reason.includes('403') || reason.includes('Unauthorized') || reason.includes('authentication')) {
      suggestion = '请检查 API Key 是否正确';
    } else if (reason.includes('404') || reason.includes('not found')) {
      suggestion = '请检查 API 地址是否正确';
    } else if (reason.includes('model') || reason.includes('not exist') || reason.includes('available')) {
      suggestion = '请检查所选模型是否可用';
    } else if (reason.includes('quota') || reason.includes('insufficient') || reason.includes('balance')) {
      suggestion = 'API 配额不足，请检查账户余额';
    } else if (reason.includes('network') || reason.includes('fetch') || reason.includes('timeout')) {
      suggestion = '请检查网络连接，或尝试使用代理';
    }
    
    showApiResult(resultEl, false, '连接失败：' + reason, suggestion);
  }).finally(() => {
    btn.disabled = false;
    btn.innerHTML = originalText;
  });
}

function showApiResult(el, success, title, detail) {
  el.style.display = 'block';
  el.className = 'test-result ' + (success ? 'success' : 'error');
  el.innerHTML = `
    <div class="test-title">${success ? '✓ ' : '✗ '}${title}</div>
    ${detail ? `<div class="test-detail">${detail}</div>` : ''}
  `;
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
  document.getElementById('enableFallback').checked = state.settings.enableFallback !== false;
  document.getElementById('apiTestResult').style.display = 'none';
  
  document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
  
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
  const oldShowEmotion = state.settings.showEmotion;
  const oldShowQuality = state.settings.showQuality;

  state.settings.apiKey = document.getElementById('apiKey').value;
  state.settings.apiEndpoint = document.getElementById('apiEndpoint').value;
  state.settings.model = document.getElementById('modelSelect').value;
  state.settings.enableSensitiveFilter = document.getElementById('enableSensitiveFilter').checked;
  state.settings.enableRiskDetection = document.getElementById('enableRiskDetection').checked;
  state.settings.sensitiveWords = document.getElementById('sensitiveWords').value.split(',').map(w => w.trim()).filter(w => w);
  state.settings.showEmotion = document.getElementById('showEmotion').checked;
  state.settings.showQuality = document.getElementById('showQuality').checked;
  state.settings.enableFallback = document.getElementById('enableFallback').checked;
  
  chrome.runtime.sendMessage({
    action: 'saveSettings',
    data: state.settings
  }, () => {
    const emotionChanged = oldShowEmotion !== state.settings.showEmotion;
    const qualityChanged = oldShowQuality !== state.settings.showQuality;

    if (emotionChanged && state.analysis) {
      renderAnalysis(state.analysis);
    }
    if (qualityChanged) {
      applyUIVisibilitySettings();
    }

    showToast('设置已保存，已立即生效', 'success');
  });
}

function bindFilterEvents() {
  ['filterTime', 'filterScenario', 'filterRisk', 'filterScore'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('change', () => {
        state.qualityFilters.time = document.getElementById('filterTime').value;
        state.qualityFilters.scenario = document.getElementById('filterScenario').value;
        state.qualityFilters.risk = document.getElementById('filterRisk').value;
        state.qualityFilters.score = document.getElementById('filterScore').value;
        applyQualityFilters();
        loadQualityRecordsList();
      });
    }
  });

  document.getElementById('btnResetFilter').addEventListener('click', () => {
    state.qualityFilters = { time: 'all', scenario: 'all', risk: 'all', score: 'all' };
    document.getElementById('filterTime').value = 'all';
    document.getElementById('filterScenario').value = 'all';
    document.getElementById('filterRisk').value = 'all';
    document.getElementById('filterScore').value = 'all';
    applyQualityFilters();
    loadQualityRecordsList();
    showToast('已重置筛选条件', 'success');
  });

  document.querySelectorAll('.trend-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      state.currentTrendType = btn.dataset.trend;
      document.querySelectorAll('.trend-tab').forEach(b => {
        b.classList.toggle('active', b.dataset.trend === state.currentTrendType);
      });
      loadTrendChart();
    });
  });
}

function applyQualityFilters() {
  const filters = state.qualityFilters;
  const now = Date.now();
  const todayStart = new Date().setHours(0, 0, 0, 0);
  const weekStart = now - 7 * 24 * 60 * 60 * 1000;
  const monthStart = now - 30 * 24 * 60 * 60 * 1000;

  state.filteredQualityRecords = state.qualityRecords.filter(record => {
    if (filters.time !== 'all') {
      if (filters.time === 'today' && record.createdAt < todayStart) return false;
      if (filters.time === 'week' && record.createdAt < weekStart) return false;
      if (filters.time === 'month' && record.createdAt < monthStart) return false;
    }

    if (filters.scenario !== 'all' && record.scenario !== filters.scenario) return false;

    if (filters.risk !== 'all' && record.riskLevel !== filters.risk) return false;

    if (filters.score !== 'all') {
      const [min, max] = filters.score.split('-').map(Number);
      const score = record.qualityScore || 0;
      if (score < min || score > max) return false;
    }

    return true;
  });

  const filterInfo = document.getElementById('filterInfo');
  const filteredCount = document.getElementById('filteredCount');
  const anyFilter = filters.time !== 'all' || filters.scenario !== 'all' || filters.risk !== 'all' || filters.score !== 'all';
  
  if (anyFilter) {
    filterInfo.style.display = 'flex';
    filteredCount.textContent = state.filteredQualityRecords.length;
  } else {
    filterInfo.style.display = 'none';
  }
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
    const recordsToExport = state.filteredQualityRecords && state.filteredQualityRecords.length > 0
      ? state.filteredQualityRecords
      : state.qualityRecords;
    
    if (recordsToExport.length === 0) {
      showToast('暂无记录可导出', 'error');
      return;
    }
    
    chrome.runtime.sendMessage({
      action: 'exportQualityRecords',
      data: recordsToExport
    }, () => {
      showToast(`已导出 ${recordsToExport.length} 条质检记录`, 'success');
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
      adopted: modified === original,
      replyId: state.currentReplyId,
      shopId: state.settings?.currentShop,
      tone: state.currentTone
    };
    
    chrome.runtime.sendMessage({ action: 'addQualityRecord', data: record }, async () => {
      closeModal('compareModal');
      await loadQualityRecords();
      await updateQualityStats();
      loadTrendChart();
      showToast('质检记录已保存，已更新到列表', 'success');
    });
  });

  document.getElementById('closeDetailModal').addEventListener('click', () => closeModal('qualityDetailModal'));
  document.getElementById('closeDetailBtn').addEventListener('click', () => closeModal('qualityDetailModal'));
  
  document.getElementById('copyOriginalBtn').addEventListener('click', () => {
    if (state.qualityDetail) {
      navigator.clipboard.writeText(state.qualityDetail.originalReply || '');
      showToast('已复制原文', 'success');
    }
  });
  
  document.getElementById('copyModifiedBtn').addEventListener('click', () => {
    if (state.qualityDetail) {
      navigator.clipboard.writeText(state.qualityDetail.modifiedReply || '');
      showToast('已复制修改版', 'success');
    }
  });

  document.getElementById('qualityDetailModal').addEventListener('click', (e) => {
    if (e.target.id === 'qualityDetailModal') closeModal('qualityDetailModal');
  });
}

function updateQualityStats() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: 'getAdoptionRate' }, (response) => {
      if (response.success) {
        document.getElementById('statTotal').textContent = response.data.total;
        document.getElementById('statAdopted').textContent = response.data.adopted;
        document.getElementById('statPending').textContent = response.data.pending || 0;
        document.getElementById('statRate').textContent = response.data.rate + '%';
      }
      resolve();
    });
  });
}

function loadTrendChart() {
  Promise.all([
    new Promise(resolve => chrome.runtime.sendMessage({ action: 'getHistory' }, res => resolve(res.data || []))),
    new Promise(resolve => chrome.storage.local.get(['adoptedReplies'], res => resolve(res.adoptedReplies || [])))
  ]).then(([history, adoptedIds]) => {
    const validRecords = history.filter(h => h.replyId);
    
    let groups = {};
    const type = state.currentTrendType;
    
    if (type === 'shop') {
      state.settings?.shops?.forEach(shop => {
        groups[shop.id] = { label: shop.name, total: 0, adopted: 0 };
      });
      validRecords.forEach(r => {
        const shopId = r.shopId || state.settings?.currentShop || 'default';
        if (!groups[shopId]) groups[shopId] = { label: '其他店铺', total: 0, adopted: 0 };
        groups[shopId].total++;
        if (adoptedIds.includes(r.replyId)) groups[shopId].adopted++;
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
        if (adoptedIds.includes(r.replyId)) groups[scenario].adopted++;
      });
    } else if (type === 'tone') {
      const toneLabels = { professional: '专业', friendly: '亲切', humorous: '幽默', concise: '简洁', enthusiastic: '热情' };
      Object.keys(toneLabels).forEach(tone => {
        groups[tone] = { label: toneLabels[tone], total: 0, adopted: 0 };
      });
      validRecords.forEach(r => {
        const tone = r.tone || 'professional';
        if (!groups[tone]) groups[tone] = { label: tone, total: 0, adopted: 0 };
        groups[tone].total++;
        if (adoptedIds.includes(r.replyId)) groups[tone].adopted++;
      });
    }

    const chartEl = document.getElementById('trendChart');
    const chartEntries = Object.entries(groups).filter(([_, g]) => g.total > 0);
    
    if (chartEntries.length === 0) {
      chartEl.innerHTML = `
        <div style="text-align:center;padding:20px;color:#9ca3af;font-size:12px;">
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
  });
}

function loadQualityRecordsList() {
  const list = document.getElementById('qualityList');
  const records = state.filteredQualityRecords && state.filteredQualityRecords.length > 0
    ? state.filteredQualityRecords
    : state.qualityRecords;

  if (records.length === 0) {
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
  const scenarioLabel = { pre_sales: '售前', after_sales: '售后' };
  const riskLabel = { high: '🔴 高风险', medium: '🟡 中风险', low: '🟢 低风险' };

  list.innerHTML = records.map(record => `
    <div class="quality-item" data-id="${record.id}" onclick="showQualityDetail('${record.id}')">
      <div class="quality-header">
        <span class="quality-time">${new Date(record.createdAt).toLocaleString()}</span>
        ${record.scenario ? `<span class="tag tag-scenario ${record.scenario}">${scenarioLabel[record.scenario] || record.scenario}</span>` : ''}
        ${record.riskLevel ? `<span class="tag tag-risk ${record.riskLevel}">${riskLabel[record.riskLevel]}</span>` : ''}
        <span class="quality-score ${scoreClass(record.qualityScore || 0)}">${record.qualityScore || 0}分</span>
      </div>
      <div class="quality-compare">
        <div>
          <div class="quality-col-label">AI 生成</div>
          <div class="quality-col-content">${escapeHtml(record.originalReply || '').slice(0, 100)}${(record.originalReply || '').length > 100 ? '...' : ''}</div>
        </div>
        <div>
          <div class="quality-col-label">人工修改</div>
          <div class="quality-col-content">${escapeHtml(record.modifiedReply || '').slice(0, 100)}${(record.modifiedReply || '').length > 100 ? '...' : ''}</div>
        </div>
      </div>
      ${record.notes ? `<div class="quality-notes">备注：${escapeHtml(record.notes)}</div>` : ''}
    </div>
  `).join('');
}

window.showQualityDetail = function(id) {
  const record = state.qualityRecords.find(r => r.id === id);
  if (!record) return;

  state.qualityDetail = record;

  document.getElementById('detailTitle').textContent = '质检记录详情 - ' + new Date(record.createdAt).toLocaleString();

  const scenarioLabel = { pre_sales: '售前', after_sales: '售后' };
  const riskLabel = { high: '🔴 高风险', medium: '🟡 中风险', low: '🟢 低风险' };
  const emotionLabel = { happy: '😊 满意', angry: '😠 激动', neutral: '😐 平稳' };
  const scoreClass = record.qualityScore >= 80 ? 'high' : record.qualityScore >= 60 ? 'medium' : 'low';

  let metaHtml = '';
  if (record.scenario) metaHtml += `<span class="meta-tag" style="background:#eff6ff;color:#1d4ed8;">${scenarioLabel[record.scenario]}</span>`;
  if (record.riskLevel) metaHtml += `<span class="meta-tag" style="background:${record.riskLevel === 'high' ? '#fee2e2;color:#dc2626' : record.riskLevel === 'medium' ? '#fef3c7;color:#d97706' : '#d1fae5;color:#059669'};">${riskLabel[record.riskLevel]}</span>`;
  if (record.emotion) metaHtml += `<span class="meta-tag" style="background:#faf5ff;color:#7c3aed;">${emotionLabel[record.emotion] || record.emotion}</span>`;
  metaHtml += `<span class="meta-tag" style="background:${scoreClass === 'high' ? '#d1fae5;color:#059669' : scoreClass === 'medium' ? '#fef3c7;color:#d97706' : '#fee2e2;color:#dc2626'};">质检评分 ${record.qualityScore || 0} 分</span>`;
  metaHtml += `<span class="meta-time">${new Date(record.createdAt).toLocaleString()}</span>`;
  document.getElementById('detailMeta').innerHTML = metaHtml;

  document.getElementById('detailOriginal').textContent = record.originalReply || '（无内容）';
  document.getElementById('detailModified').textContent = record.modifiedReply || '（无内容）';

  const diffHtml = computeDiff(record.originalReply || '', record.modifiedReply || '');
  document.getElementById('detailDiff').innerHTML = diffHtml;

  const notesSection = document.getElementById('detailNotesSection');
  if (record.notes) {
    notesSection.style.display = 'block';
    document.getElementById('detailNotes').textContent = record.notes;
  } else {
    notesSection.style.display = 'none';
  }

  openModal('qualityDetailModal');
};

function computeDiff(oldText, newText) {
  const oldWords = oldText.split(/(\s+|[，。！？、；：""''（）【】\[\]\(\)\n])/).filter(w => w);
  const newWords = newText.split(/(\s+|[，。！？、；：""''（）【】\[\]\(\)\n])/).filter(w => w);

  const oldSet = new Set(oldWords);
  const newSet = new Set(newWords);

  let html = '';
  
  newWords.forEach(word => {
    if (oldSet.has(word)) {
      html += `<span class="diff-same">${escapeHtml(word)}</span>`;
    } else {
      html += `<span class="diff-word added">${escapeHtml(word)}</span>`;
    }
  });

  const removedWords = oldWords.filter(w => !newSet.has(w));
  if (removedWords.length > 0) {
    html += `<div style="margin-top:10px;padding-top:10px;border-top:1px dashed #e5e7eb;"><div style="font-size:11px;color:#9ca3af;margin-bottom:6px;">已删除内容：</div>`;
    removedWords.forEach(word => {
      html += `<span class="diff-word removed">${escapeHtml(word)}</span>`;
    });
    html += `</div>`;
  }

  return html || '<span style="color:#9ca3af;">两段内容完全一致</span>';
}

function addHistory(content, adopted, tone, callback) {
  const record = {
    content,
    adopted,
    scenario: state.analysis?.scenario,
    emotion: state.analysis?.emotion,
    shopId: state.settings?.currentShop,
    tone: tone || state.currentTone
  };
  chrome.runtime.sendMessage({ action: 'addHistory', data: record }, (res) => {
    if (res && res.success && callback) {
      callback(res.data);
    }
    updateQualityStats();
    loadTrendChart();
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
  }, 2500);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
