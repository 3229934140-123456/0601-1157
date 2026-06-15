let floatingBtn = null;
let sidePanelOpen = false;

function init() {
  createFloatingButton();
  injectStyles();
  observeChatArea();
}

function createFloatingButton() {
  if (floatingBtn) return;
  
  floatingBtn = document.createElement('div');
  floatingBtn.id = 'ai-cs-assistant-btn';
  floatingBtn.innerHTML = `
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
    </svg>
    <span class="tooltip">AI 智能助手</span>
  `;
  
  floatingBtn.addEventListener('click', toggleSidePanel);
  document.body.appendChild(floatingBtn);
}

function injectStyles() {
  const style = document.createElement('style');
  style.textContent = `
    #ai-cs-assistant-btn {
      position: fixed;
      right: 20px;
      bottom: 120px;
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      z-index: 2147483646;
      box-shadow: 0 4px 20px rgba(102, 126, 234, 0.4);
      transition: all 0.3s ease;
    }
    #ai-cs-assistant-btn:hover {
      transform: scale(1.1);
      box-shadow: 0 6px 25px rgba(102, 126, 234, 0.5);
    }
    #ai-cs-assistant-btn .tooltip {
      position: absolute;
      right: 70px;
      background: #333;
      color: white;
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 13px;
      white-space: nowrap;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.3s;
    }
    #ai-cs-assistant-btn:hover .tooltip {
      opacity: 1;
    }
    #ai-cs-assistant-panel {
      position: fixed;
      right: 0;
      top: 0;
      width: 420px;
      height: 100vh;
      background: white;
      z-index: 2147483647;
      box-shadow: -4px 0 20px rgba(0, 0, 0, 0.1);
      transform: translateX(100%);
      transition: transform 0.3s ease;
      display: flex;
      flex-direction: column;
    }
    #ai-cs-assistant-panel.open {
      transform: translateX(0);
    }
    #ai-cs-assistant-panel iframe {
      width: 100%;
      height: 100%;
      border: none;
    }
    .ai-cs-highlight-risk {
      background: rgba(255, 59, 48, 0.15) !important;
      border-left: 3px solid #ff3b30 !important;
    }
    .ai-cs-highlight-warning {
      background: rgba(255, 149, 0, 0.15) !important;
      border-left: 3px solid #ff9500 !important;
    }
    .ai-cs-suggestion-badge {
      display: inline-block;
      padding: 2px 8px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      font-size: 11px;
      border-radius: 10px;
      margin-left: 8px;
      cursor: pointer;
    }
  `;
  document.head.appendChild(style);
}

function toggleSidePanel() {
  let panel = document.getElementById('ai-cs-assistant-panel');
  
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'ai-cs-assistant-panel';
    panel.innerHTML = `<iframe src="${chrome.runtime.getURL('sidebar.html')}"></iframe>`;
    document.body.appendChild(panel);
  }
  
  sidePanelOpen = !sidePanelOpen;
  panel.classList.toggle('open', sidePanelOpen);
  
  if (sidePanelOpen) {
    setTimeout(() => extractConversation(), 500);
  }
}

function observeChatArea() {
  const chatSelectors = [
    '[class*="chat"]',
    '[class*="message"]',
    '[class*="conversation"]',
    '[class*="dialog"]'
  ];
  
  let targetNode = null;
  for (const selector of chatSelectors) {
    const nodes = document.querySelectorAll(selector);
    if (nodes.length > 0) {
      targetNode = nodes[nodes.length - 1];
      break;
    }
  }
  
  if (!targetNode) {
    targetNode = document.body;
  }
  
  const observer = new MutationObserver((mutations) => {
    if (sidePanelOpen) {
      debounceExtract();
    }
  });
  
  observer.observe(targetNode, {
    childList: true,
    subtree: true,
    characterData: true
  });
}

let extractTimer = null;
function debounceExtract() {
  if (extractTimer) clearTimeout(extractTimer);
  extractTimer = setTimeout(extractConversation, 800);
}

function extractConversation() {
  const messages = [];
  
  const selectors = [
    '[class*="message-item"]',
    '[class*="chat-item"]',
    '[class*="bubble"]',
    '[class*="msg-item"]',
    '[data-role="message"]'
  ];
  
  let elements = [];
  for (const selector of selectors) {
    const found = document.querySelectorAll(selector);
    if (found.length > elements.length) {
      elements = Array.from(found);
    }
  }
  
  if (elements.length === 0) {
    elements = Array.from(document.querySelectorAll('div, p, span')).filter(el => {
      const text = el.textContent.trim();
      return text.length > 5 && text.length < 500 && el.children.length < 3;
    }).slice(-20);
  }
  
  elements.forEach((el, index) => {
    const text = el.textContent.trim();
    if (!text || text.length < 2) return;
    
    const isCustomer = checkIsCustomer(el, index);
    messages.push({
      id: `msg_${index}`,
      role: isCustomer ? 'customer' : 'service',
      content: text.slice(0, 1000),
      timestamp: Date.now() - (elements.length - index) * 60000
    });
  });
  
  if (messages.length > 0) {
    const iframe = document.querySelector('#ai-cs-assistant-panel iframe');
    if (iframe && iframe.contentWindow) {
      iframe.contentWindow.postMessage({
        type: 'CONVERSATION_UPDATE',
        data: messages
      }, '*');
    }
  }
}

function checkIsCustomer(element, index) {
  const classList = element.className || '';
  const customerPatterns = [/customer|client|user|buyer|left|receive|incoming/i];
  const servicePatterns = [/service|seller|shop|staff|right|send|outgoing|me/i];
  
  if (customerPatterns.some(p => p.test(classList))) return true;
  if (servicePatterns.some(p => p.test(classList))) return false;
  
  const style = window.getComputedStyle(element);
  const align = style.textAlign || style.getPropertyValue('text-align');
  if (align === 'left' || align === 'start') return true;
  if (align === 'right' || align === 'end') return false;
  
  return index % 2 === 0;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.action) {
    case 'getConversation':
      sendResponse({ success: true, data: extractConversationSync() });
      break;
      
    case 'copyToInput':
      copyToChatInput(request.text);
      sendResponse({ success: true });
      break;
      
    case 'sendMessage':
      sendToChat(request.text);
      sendResponse({ success: true });
      break;
  }
});

function extractConversationSync() {
  const messages = [];
  const elements = document.querySelectorAll('[class*="message"], [class*="chat-item"], [class*="bubble"]');
  
  elements.forEach((el, index) => {
    const text = el.textContent.trim();
    if (!text || text.length < 2) return;
    
    const isCustomer = checkIsCustomer(el, index);
    messages.push({
      id: `msg_${index}`,
      role: isCustomer ? 'customer' : 'service',
      content: text.slice(0, 1000),
      timestamp: Date.now()
    });
  });
  
  return messages;
}

function copyToChatInput(text) {
  const inputSelectors = [
    'textarea[class*="input"]',
    'textarea[class*="chat"]',
    'textarea[class*="editor"]',
    'div[contenteditable="true"]',
    'input[class*="chat"]',
    'input[class*="message"]'
  ];
  
  let inputEl = null;
  for (const selector of inputSelectors) {
    const el = document.querySelector(selector);
    if (el) {
      inputEl = el;
      break;
    }
  }
  
  if (!inputEl) return false;
  
  if (inputEl.isContentEditable || inputEl.tagName === 'DIV') {
    inputEl.innerHTML = text.replace(/\n/g, '<br>');
  } else {
    inputEl.value = text;
  }
  
  inputEl.dispatchEvent(new Event('input', { bubbles: true }));
  inputEl.dispatchEvent(new Event('change', { bubbles: true }));
  inputEl.focus();
  
  return true;
}

function sendToChat(text) {
  if (!copyToChatInput(text)) return false;
  
  const sendSelectors = [
    'button[class*="send"]',
    'button[class*="submit"]',
    '[class*="send-btn"]',
    '[class*="btn-send"]'
  ];
  
  let sendBtn = null;
  for (const selector of sendSelectors) {
    const el = document.querySelector(selector);
    if (el) {
      sendBtn = el;
      break;
    }
  }
  
  if (sendBtn) {
    setTimeout(() => sendBtn.click(), 100);
    return true;
  }
  
  return false;
}

window.addEventListener('message', (event) => {
  if (event.data.type === 'COPY_TO_INPUT') {
    copyToChatInput(event.data.text);
  } else if (event.data.type === 'SEND_MESSAGE') {
    sendToChat(event.data.text);
  } else if (event.data.type === 'REFRESH_CONVERSATION') {
    extractConversation();
  }
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
