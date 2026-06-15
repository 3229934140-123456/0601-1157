const DEFAULT_SETTINGS = {
  apiKey: '',
  apiEndpoint: 'https://api.openai.com/v1/chat/completions',
  model: 'gpt-3.5-turbo',
  currentShop: 'default',
  shops: [{
    id: 'default',
    name: '默认店铺',
    rules: {
      tone: 'professional',
      enableSensitiveFilter: true,
      enableRiskDetection: true,
      returnPolicy: '7天无理由退换货，商品需保持原包装、吊牌完好，不影响二次销售。',
      shippingPolicy: '下单后48小时内发货，默认快递为顺丰/圆通，偏远地区可能延迟1-2天。',
      warrantyPolicy: '商品享受全国联保，质保期1年，具体以商品详情页为准。'
    }
  }],
  toneOptions: ['professional', 'friendly', 'humorous', 'concise', 'enthusiastic'],
  sensitiveWords: ['保证', '一定', '绝对', '100%', '永久', '终身', '最便宜', '最低价', '第一', '唯一'],
  autoCollect: false,
  showEmotion: true,
  showQuality: true
};

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['settings', 'scripts', 'history', 'qualityRecords', 'adoptedReplies'], (data) => {
    if (!data.settings) {
      chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
    }
    if (!data.scripts) {
      chrome.storage.local.set({ scripts: getDefaultScripts() });
    }
    if (!data.history) {
      chrome.storage.local.set({ history: [] });
    }
    if (!data.qualityRecords) {
      chrome.storage.local.set({ qualityRecords: [] });
    }
    if (!data.adoptedReplies) {
      chrome.storage.local.set({ adoptedReplies: [] });
    }
  });

  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error(error));
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.action) {
    case 'getSettings':
      chrome.storage.local.get(['settings'], (data) => {
        sendResponse({ success: true, data: data.settings || DEFAULT_SETTINGS });
      });
      return true;

    case 'saveSettings':
      chrome.storage.local.get(['settings'], (data) => {
        const settings = { ...(data.settings || DEFAULT_SETTINGS), ...request.data };
        chrome.storage.local.set({ settings }, () => {
          sendResponse({ success: true, data: settings });
        });
      });
      return true;

    case 'getScripts':
      chrome.storage.local.get(['scripts'], (data) => {
        sendResponse({ success: true, data: data.scripts || [] });
      });
      return true;

    case 'saveScript':
      chrome.storage.local.get(['scripts'], (data) => {
        const scripts = data.scripts || [];
        if (request.data.id) {
          const idx = scripts.findIndex(s => s.id === request.data.id);
          if (idx >= 0) scripts[idx] = request.data;
        } else {
          request.data.id = Date.now().toString();
          request.data.createdAt = Date.now();
          scripts.push(request.data);
        }
        chrome.storage.local.set({ scripts }, () => {
          sendResponse({ success: true, data: request.data });
        });
      });
      return true;

    case 'deleteScript':
      chrome.storage.local.get(['scripts'], (data) => {
        const scripts = (data.scripts || []).filter(s => s.id !== request.id);
        chrome.storage.local.set({ scripts }, () => {
          sendResponse({ success: true });
        });
      });
      return true;

    case 'addHistory':
      handleAddHistory(request.data, sendResponse);
      return true;

    case 'markReplyAdopted':
      handleMarkReplyAdopted(request.replyId, sendResponse);
      return true;

    case 'getHistory':
      chrome.storage.local.get(['history'], (data) => {
        sendResponse({ success: true, data: data.history || [] });
      });
      return true;

    case 'clearHistory':
      chrome.storage.local.set({ history: [], adoptedReplies: [] }, () => {
        sendResponse({ success: true });
      });
      return true;

    case 'addQualityRecord':
      chrome.storage.local.get(['qualityRecords'], (data) => {
        const records = data.qualityRecords || [];
        request.data.id = Date.now().toString();
        request.data.createdAt = Date.now();
        records.unshift(request.data);
        if (records.length > 1000) records.length = 1000;
        chrome.storage.local.set({ qualityRecords }, () => {
          sendResponse({ success: true, data: request.data });
        });
      });
      return true;

    case 'getQualityRecords':
      chrome.storage.local.get(['qualityRecords'], (data) => {
        sendResponse({ success: true, data: data.qualityRecords || [] });
      });
      return true;

    case 'exportQualityRecords':
      chrome.storage.local.get(['qualityRecords'], (data) => {
        const records = (request.data && request.data.length > 0) ? request.data : (data.qualityRecords || []);
        const csv = convertToCSV(records);
        const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        chrome.downloads.download({
          url: url,
          filename: `质检记录_${new Date().toISOString().slice(0, 10)}.csv`,
          saveAs: true
        }, () => {
          URL.revokeObjectURL(url);
          sendResponse({ success: true });
        });
      });
      return true;

    case 'getAdoptionRate':
      calculateAdoptionRate(sendResponse);
      return true;

    case 'generateReply':
      handleGenerateReply(request.data, sendResponse);
      return true;

    case 'analyzeConversation':
      handleAnalyzeConversation(request.data, sendResponse);
      return true;

    default:
      sendResponse({ success: false, error: 'Unknown action' });
  }
});

function handleAddHistory(data, sendResponse) {
  chrome.storage.local.get(['history'], (result) => {
    const history = result.history || [];
    const record = {
      ...data,
      id: Date.now().toString(),
      createdAt: Date.now(),
      status: data.adopted ? 'adopted' : 'pending'
    };

    if (!record.replyId) {
      record.replyId = 'reply_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    }

    history.unshift(record);
    if (history.length > 500) history.length = 500;

    chrome.storage.local.set({ history }, () => {
      sendResponse({ success: true, data: record });
    });
  });
}

function handleMarkReplyAdopted(replyId, sendResponse) {
  chrome.storage.local.get(['history', 'adoptedReplies'], (result) => {
    const history = result.history || [];
    const adoptedReplies = result.adoptedReplies || [];

    let alreadyAdopted = adoptedReplies.includes(replyId);

    if (!alreadyAdopted && replyId) {
      adoptedReplies.push(replyId);
    }

    let updated = false;
    for (let i = 0; i < history.length; i++) {
      if (history[i].replyId === replyId && history[i].status !== 'adopted') {
        history[i].status = 'adopted';
        history[i].adopted = true;
        history[i].adoptedAt = Date.now();
        updated = true;
        break;
      }
    }

    chrome.storage.local.set({ history, adoptedReplies }, () => {
      calculateAdoptionRate((rateRes) => {
        sendResponse({
          success: true,
          alreadyAdopted,
          updated,
          stats: rateRes.data
        });
      });
    });
  });
}

function calculateAdoptionRate(sendResponse) {
  chrome.storage.local.get(['history', 'adoptedReplies'], (result) => {
    const history = result.history || [];
    const adoptedReplies = result.adoptedReplies || [];

    const validReplies = history.filter(h => h.replyId);
    const uniqueIds = [...new Set(validReplies.map(h => h.replyId))];
    const total = uniqueIds.length;
    const adopted = adoptedReplies.filter(id => uniqueIds.includes(id)).length;
    const rate = total > 0 ? Math.round((adopted / total) * 100) : 0;
    const pending = total - adopted;

    sendResponse({
      success: true,
      data: { adopted, total, rate, pending }
    });
  });
}

async function handleGenerateReply(data, sendResponse) {
  chrome.storage.local.get(['settings'], async (result) => {
    const settings = result.settings || DEFAULT_SETTINGS;
    const enableFallback = data.enableFallback !== false;
    let usedApi = false;
    let apiError = null;

    if (settings.apiKey && settings.apiEndpoint && settings.model) {
      try {
        const apiReply = await callRealApi(data, settings);
        usedApi = true;
        const alternatives = generateAlternatives(apiReply.primary, data.tone);
        sendResponse({
          success: true,
          data: {
            primary: apiReply.primary,
            alternatives,
            rewritten: rewriteHarshTone(apiReply.primary),
            extractedIssues: extractIssues(data.context),
            suggestions: generateSuggestions(data.scenario, settings)
          },
          meta: { usedApi: true, model: settings.model }
        });
        return;
      } catch (err) {
        apiError = err.message || 'API请求失败';
        console.warn('API调用失败:', err);
        if (!enableFallback) {
          sendResponse({
            success: false,
            error: apiError,
            meta: { usedApi: false, apiError, fallbackDisabled: true }
          });
          return;
        }
      }
    } else {
      const missing = [];
      if (!settings.apiKey) missing.push('API Key');
      if (!settings.apiEndpoint) missing.push('API 地址');
      if (!settings.model) missing.push('模型');
      apiError = '缺少配置：' + missing.join('、');
      
      if (!enableFallback) {
        sendResponse({
          success: false,
          error: apiError,
          meta: { usedApi: false, apiError, fallbackDisabled: true }
        });
        return;
      }
    }

    try {
      const reply = await mockGenerateReply(data, settings);
      sendResponse({
        success: true,
        data: reply,
        meta: {
          usedApi: false,
          fallback: true,
          apiError,
          reason: !settings.apiKey ? '未配置API Key' : apiError || '使用本地模板'
        }
      });
    } catch (error) {
      sendResponse({
        success: false,
        error: `生成失败: ${error.message}`,
        meta: { usedApi: false, apiError }
      });
    }
  });
}

async function callRealApi(data, settings) {
  const toneLabels = {
    professional: '专业正式',
    friendly: '亲切友好',
    humorous: '幽默轻松',
    concise: '简洁明了',
    enthusiastic: '热情洋溢'
  };
  const scenarioLabels = {
    pre_sales: '售前咨询场景',
    after_sales: '售后服务场景'
  };

  const shop = settings.shops.find(s => s.id === settings.currentShop) || settings.shops[0];

  const systemPrompt = `你是一位专业的电商客服助理。请根据以下要求生成回复：

【基本规则】
- 当前场景：${scenarioLabels[data.scenario] || '售前咨询'}
- 语气风格：${toneLabels[data.tone] || '专业正式'}
- 店铺退换货政策：${shop.rules.returnPolicy}
- 店铺发货政策：${shop.rules.shippingPolicy}
- 店铺质保政策：${shop.rules.warrantyPolicy}

【敏感词要求】
回复中不要使用以下绝对化承诺词汇：保证、一定、绝对、100%、永久、终身、最便宜、最低价、第一、唯一

【回复要求】
1. 针对客户的具体问题直接回复，不要套话空话
2. 如果是售后场景，先表达歉意和同理心
3. 适当使用表情符号增加亲切感，但不要过多
4. 如有需要，可以主动询问订单号或其他信息
5. 回复结构清晰，重点信息使用换行或编号突出
`;

  const userPrompt = `【客户对话历史】
${data.context || '暂无对话记录'}

【已识别的客户问题】
${data.customerIssue || '待识别'}

请生成一条合适的客服回复：`;

  const requestBody = {
    model: settings.model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    temperature: data.tone === 'humorous' ? 0.8 : 0.7,
    max_tokens: 800
  };

  const response = await fetch(settings.apiEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${settings.apiKey}`
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    let errText = `HTTP ${response.status}`;
    try {
      const errData = await response.json();
      if (errData.error?.message) errText += ': ' + errData.error.message;
    } catch (_) { /* ignore */ }
    throw new Error(errText);
  }

  const json = await response.json();
  const content = json?.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('API返回内容为空');
  }

  return { primary: content.trim() };
}

function handleAnalyzeConversation(data, sendResponse) {
  try {
    const analysis = mockAnalyzeConversation(data.messages);
    sendResponse({ success: true, data: analysis });
  } catch (error) {
    sendResponse({ success: false, error: error.message });
  }
}

function mockGenerateReply(data, settings) {
  return new Promise((resolve) => {
    setTimeout(() => {
      const { context, tone, scenario, customerIssue } = data;
      const shop = settings.shops.find(s => s.id === settings.currentShop) || settings.shops[0];

      let reply = '';
      const greeting = getGreeting(tone);

      if (scenario === 'after_sales') {
        if (customerIssue?.includes('退换') || customerIssue?.includes('退货')) {
          reply = `${greeting}非常抱歉给您带来了不便！关于退换货问题，我们的政策如下：${shop.rules.returnPolicy}\n\n请问您方便告知一下订单号和具体原因吗？我这边马上为您处理。`;
        } else if (customerIssue?.includes('质量') || customerIssue?.includes('坏')) {
          reply = `${greeting}非常抱歉商品出现了质量问题！请您提供一下订单号和问题照片，我这边会为您安排退换货或维修处理，所有费用由我们承担。`;
        } else if (customerIssue?.includes('物流') || customerIssue?.includes('快递')) {
          reply = `${greeting}感谢您的耐心等待！让我帮您查询一下物流情况。请问您的订单号是多少呢？我这边马上为您跟进。`;
        } else {
          reply = `${greeting}非常抱歉给您带来了困扰！请问您具体遇到了什么问题呢？我会尽力帮您解决。`;
        }
      } else {
        if (customerIssue?.includes('价格') || customerIssue?.includes('优惠') || customerIssue?.includes('便宜')) {
          reply = `${greeting}感谢您的咨询！目前我们正在进行优惠活动：\n1. 满299减30，满599减80\n2. 新用户首单立减20元\n3. 下单即送精美礼品一份\n\n现在下单非常划算哦！`;
        } else if (customerIssue?.includes('发货') || customerIssue?.includes('物流')) {
          reply = `${greeting}感谢您的关注！${shop.rules.shippingPolicy}\n\n如果您急需的话，我们可以为您安排加急发货哦。`;
        } else if (customerIssue?.includes('参数') || customerIssue?.includes('规格') || customerIssue?.includes('尺寸')) {
          reply = `${greeting}好的，为您介绍一下商品参数：\n【颜色】黑色/白色/灰色\n【尺码】S/M/L/XL\n【材质】优质面料，舒适透气\n【包装】原装正品，含防伪标签\n\n请问您还想了解哪方面呢？`;
        } else if (customerIssue?.includes('保修') || customerIssue?.includes('售后')) {
          reply = `${greeting}请放心购买！${shop.rules.warrantyPolicy}\n\n如有任何问题，随时联系我们客服处理。`;
        } else {
          reply = `${greeting}感谢您的咨询！请问有什么可以帮您的呢？我很乐意为您解答~`;
        }
      }

      const alternatives = generateAlternatives(reply, tone);
      resolve({
        primary: reply,
        alternatives,
        rewritten: rewriteHarshTone(reply),
        extractedIssues: extractIssues(context),
        suggestions: generateSuggestions(scenario, shop)
      });
    }, 500);
  });
}

function mockAnalyzeConversation(messages) {
  const text = messages.map(m => m.content).join(' ');

  let scenario = 'pre_sales';
  let emotion = 'neutral';
  let riskLevel = 'low';
  let orderId = null;
  let issues = [];

  const afterSalesKeywords = ['退货', '换货', '退款', '质量', '坏了', '投诉', '差评', '维权', '虚假', '欺骗'];
  const emotionKeywords = {
    angry: ['气死', '垃圾', '差评', '投诉', '再也不买', '骗子', '差劲', '垃圾'],
    happy: ['谢谢', '很好', '满意', '不错', '喜欢', '棒'],
    neutral: ['好的', '嗯', '哦', '知道']
  };
  const riskKeywords = ['12315', '工商局', '媒体', '曝光', '律师', '起诉', '举报'];
  const orderIdRegex = /[A-Za-z0-9]{10,20}/g;

  if (afterSalesKeywords.some(k => text.includes(k))) {
    scenario = 'after_sales';
  }

  if (emotionKeywords.angry.some(k => text.includes(k))) {
    emotion = 'angry';
  } else if (emotionKeywords.happy.some(k => text.includes(k))) {
    emotion = 'happy';
  }

  if (riskKeywords.some(k => text.includes(k))) {
    riskLevel = 'high';
  } else if (emotion === 'angry') {
    riskLevel = 'medium';
  }

  const matches = text.match(orderIdRegex);
  if (matches && matches.length > 0) {
    orderId = matches[0];
  }

  issues = extractIssues(text);

  return {
    scenario,
    emotion,
    riskLevel,
    orderId,
    issues,
    summary: generateSummary(messages, scenario, emotion)
  };
}

function extractIssues(text) {
  const issues = [];
  const issuePatterns = [
    { pattern: /价格|多少钱|优惠|便宜|折扣|划算/g, label: '价格咨询' },
    { pattern: /发货|物流|快递|多久|时间|到货/g, label: '物流配送' },
    { pattern: /退货|换货|退款|退换/g, label: '退换货' },
    { pattern: /质量|坏了|破损|瑕疵|问题/g, label: '质量问题' },
    { pattern: /尺寸|大小|规格|参数|颜色|型号/g, label: '商品参数' },
    { pattern: /保修|售后|质保|维修/g, label: '售后服务' },
    { pattern: /正品|真假|仿冒|假货/g, label: '正品保证' },
    { pattern: /发票|开票|税点/g, label: '发票问题' }
  ];

  issuePatterns.forEach(ip => {
    if (ip.pattern.test(text)) {
      issues.push(ip.label);
    }
  });

  return issues.length > 0 ? issues : ['其他咨询'];
}

function generateAlternatives(primary, tone) {
  const alternatives = [];
  const tones = [
    { key: 'friendly', label: '亲切友好' },
    { key: 'professional', label: '专业正式' },
    { key: 'concise', label: '简洁高效' },
    { key: 'enthusiastic', label: '热情洋溢' }
  ];

  tones.forEach(t => {
    if (t.key !== tone) {
      const greeting = getGreeting(t.key);
      let altContent = primary;
      const firstPeriod = primary.search(/[，。！\n]/);
      if (firstPeriod > 0 && firstPeriod < 15) {
        altContent = greeting + primary.slice(firstPeriod + 1);
      }
      alternatives.push({
        tone: t.key,
        label: t.label,
        content: altContent
      });
    }
  });

  return alternatives;
}

function rewriteHarshTone(text) {
  const harshReplacements = [
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
  harshReplacements.forEach(r => {
    result = result.replace(r.from, r.to);
  });

  return result;
}

function generateSuggestions(scenario, shop) {
  if (scenario === 'after_sales') {
    return [
      { type: 'return', title: '退换货指引', content: shop.rules.returnPolicy },
      { type: 'apology', title: '致歉话术', content: '再次为给您带来的不便表示诚挚的歉意，我们一定会尽力为您解决问题。' }
    ];
  }
  return [
    { type: 'promotion', title: '优惠说明', content: '目前店铺活动：满299减30，满599减80，新用户首单立减20元！' },
    { type: 'params', title: '商品参数', content: '【颜色】多色可选 【尺码】S-XXL 【材质】优质面料 【售后】全国联保1年' }
  ];
}

function getGreeting(tone) {
  const greetings = {
    professional: '您好，',
    friendly: '亲亲您好呀~',
    humorous: 'Hi~ 欢迎光临！',
    concise: '您好，',
    enthusiastic: '亲爱的顾客您好！非常高兴为您服务！'
  };
  return greetings[tone] || greetings.professional;
}

function generateSummary(messages, scenario, emotion) {
  const scenarioText = scenario === 'after_sales' ? '售后场景' : '售前场景';
  const emotionText = { angry: '客户情绪激动', happy: '客户情绪满意', neutral: '客户情绪平稳' }[emotion];
  const lastMessage = messages.length > 0 ? messages[messages.length - 1].content.slice(0, 50) : '';
  return `${scenarioText}，${emotionText}。客户最后说："${lastMessage}..."`;
}

function convertToCSV(records) {
  if (records.length === 0) return '';

  const headers = ['ID', '时间', '场景', '情绪', '风险等级', '原始回复', '修改后回复', '是否采纳', '质检得分', '备注'];
  const rows = records.map(r => [
    r.id,
    new Date(r.createdAt).toLocaleString(),
    r.scenario || '',
    r.emotion || '',
    r.riskLevel || '',
    `"${(r.originalReply || '').replace(/"/g, '""')}"`,
    `"${(r.modifiedReply || '').replace(/"/g, '""')}"`,
    r.adopted ? '是' : '否',
    r.qualityScore || '',
    `"${(r.notes || '').replace(/"/g, '""')}"`
  ]);

  return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
}

function getDefaultScripts() {
  return [
    {
      id: '1',
      title: '欢迎语',
      category: '接待',
      content: '您好！欢迎光临本店，我是您的专属客服，很高兴为您服务！请问有什么可以帮您的呢？',
      tags: ['欢迎', '开场'],
      favorite: true,
      createdAt: Date.now()
    },
    {
      id: '2',
      title: '售后致歉',
      category: '售后',
      content: '非常抱歉给您带来了不好的体验！您的问题我们非常重视，请您稍等，我马上为您处理。',
      tags: ['致歉', '售后'],
      favorite: true,
      createdAt: Date.now()
    },
    {
      id: '3',
      title: '物流查询',
      category: '物流',
      content: '您好，请提供一下您的订单号，我这边马上为您查询物流信息~',
      tags: ['物流', '查询'],
      favorite: false,
      createdAt: Date.now()
    },
    {
      id: '4',
      title: '退换货说明',
      category: '售后',
      content: '您好，我们支持7天无理由退换货，商品需保持原包装、吊牌完好，不影响二次销售。请问您具体是什么问题呢？',
      tags: ['退换货', '售后'],
      favorite: true,
      createdAt: Date.now()
    },
    {
      id: '5',
      title: '结束语',
      category: '接待',
      content: '感谢您的咨询，祝您购物愉快！如果还有其他问题，随时欢迎联系我们~',
      tags: ['结束', '告别'],
      favorite: false,
      createdAt: Date.now()
    }
  ];
}
