(function (root) {
  'use strict';

  const Config = root.HaikuChat.Config;
  const Storage = root.HaikuChat.Storage;
  const Markdown = root.HaikuChat.Markdown;
  const Providers = root.HaikuChat.Providers;

  const state = {
    settings: Storage.loadSettings(),
    apiKeys: { pollinations: '', openrouter: '' },
    conversations: [],
    activeChatId: '',
    searchQuery: '',
    modelSearchQuery: '',
    modelFilter: 'all',
    stagedAttachments: [],
    editingMessageId: null,
    isStreaming: false,
    abortController: null,
    userScrolledUp: false,
    activeArtifactHtml: '',
    activeSpeechUtterance: null,
    recognition: null,
    isRecording: false,
    modalDraftProvider: 'pollinations'
  };

  const els = {};

  function cacheElements() {
    const ids = [
      'app-shell', 'sidebar', 'sidebar-backdrop', 'sidebar-close-btn', 'sidebar-open-btn',
      'new-chat-btn', 'chat-search-input', 'chat-search-clear', 'chat-list',
      'theme-toggle-btn', 'theme-label', 'open-data-btn', 'open-shortcuts-btn',
      'open-settings-btn', 'sidebar-settings-title', 'sidebar-settings-sub',
      'model-switcher-wrap', 'model-select-btn', 'active-model-label', 'active-model-tag',
      'model-dropdown', 'model-search-input', 'sync-models-btn', 'sync-models-icon',
      'model-filter-tabs', 'model-options-list',
      'persona-select-btn', 'active-persona-label', 'persona-dropdown',
      'context-meter', 'context-tokens-text', 'connection-pill-btn', 'connection-dot', 'connection-label',
      'export-md-btn', 'chat-viewport', 'welcome-screen', 'welcome-heading',
      'welcome-model-chips', 'welcome-connection-bar', 'starter-grid', 'messages-list', 'scroll-bottom-btn',
      'edit-banner', 'cancel-edit-btn', 'attachment-tray', 'composer-card', 'composer-input',
      'file-input', 'attach-btn', 'voice-btn', 'composer-model-btn', 'composer-model-label',
      'draft-counter', 'stop-btn', 'send-btn',
      'artifact-drawer', 'artifact-iframe', 'artifact-refresh-btn', 'artifact-newtab-btn', 'artifact-close-btn',
      'drop-overlay',
      'settings-modal', 'close-settings-btn', 'cancel-settings-btn', 'save-settings-btn',
      'provider-cards', 'pollinations-config-group', 'auto-fallback-checkbox', 'private-mode-checkbox',
      'pollinations-key-input', 'openrouter-key-group', 'openrouter-key-input', 'openrouter-endpoint-input',
      'ephemeral-keys-checkbox', 'settings-model-select', 'custom-model-input',
      'temperature-range', 'temperature-val', 'max-tokens-input',
      'settings-persona-select', 'custom-system-textarea', 'send-enter-checkbox',
      'export-json-btn', 'import-json-input', 'clear-all-chats-btn',
      'shortcuts-modal', 'close-shortcuts-btn', 'toast-container', 'meta-theme-color'
    ];
    ids.forEach(function (id) {
      els[id] = document.getElementById(id);
    });
  }

  /* ========================================================================
     Initialization
     ======================================================================== */

  function init() {
    cacheElements();
    state.apiKeys = Storage.loadApiKeys(state.settings.ephemeralKeys);
    captureByopHashToken();

    state.conversations = Storage.loadConversations();
    state.activeChatId = Storage.loadActiveChatId();

    if (!state.conversations.some(function (c) { return c.id === state.activeChatId; })) {
      state.activeChatId = state.conversations[0] ? state.conversations[0].id : '';
    }

    if (window.innerWidth <= 900) {
      els['app-shell'].classList.add('sidebar-collapsed');
    }

    applyTheme(state.settings.theme || 'dark');
    setGreetingHeading();
    renderStarterPrompts();
    renderModelOptionsList();
    renderPersonaDropdown();
    renderWelcomeModelChips();
    syncHeaderAndSidebarControls();
    renderChatList();
    renderActiveThread();
    initSpeechRecognition();
    bindEvents();
    updateSendButtonState();

    // Non-blocking live catalog sync from pollinations.ai
    syncModelsFromPollinations(false);
  }

  function captureByopHashToken() {
    if (typeof window === 'undefined' || !window.location || !window.location.hash) return;
    const match = window.location.hash.match(/api_key=(sk_[A-Za-z0-9_-]+)/);
    if (match && match[1]) {
      state.apiKeys.pollinations = match[1];
      Storage.saveApiKeys(state.apiKeys, true);
      if (window.history && window.history.replaceState) {
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      }
      setTimeout(function () {
        showToast('Connected Pollinations token for session.');
      }, 300);
    }
  }

  function setGreetingHeading() {
    const hour = new Date().getHours();
    let greeting = 'Free AI chat, zero keys required.';
    if (hour >= 5 && hour < 12) greeting = 'Good morning — pick a model & build.';
    else if (hour >= 12 && hour < 18) greeting = 'Good afternoon — switch models on the fly.';
    else if (hour >= 18 && hour < 23) greeting = 'Good evening — free AI chat, zero keys.';
    els['welcome-heading'].textContent = greeting;
  }

  function applyTheme(theme) {
    const clean = theme === 'light' ? 'light' : 'dark';
    state.settings.theme = clean;
    document.documentElement.setAttribute('data-theme', clean);
    if (els['theme-label']) {
      els['theme-label'].textContent = clean === 'dark' ? 'Dark' : 'Light';
    }
    if (els['meta-theme-color']) {
      els['meta-theme-color'].setAttribute('content', clean === 'dark' ? '#141210' : '#faf8f4');
    }
  }

  function showToast(message) {
    if (!els['toast-container']) return;
    const node = document.createElement('div');
    node.className = 'toast';
    node.textContent = message;
    els['toast-container'].appendChild(node);
    setTimeout(function () {
      node.style.opacity = '0';
      node.style.transition = 'opacity 0.2s ease';
      setTimeout(function () {
        if (node.parentNode) node.parentNode.removeChild(node);
      }, 220);
    }, 2800);
  }

  /* ========================================================================
     Active Conversation & Model Helpers
     ======================================================================== */

  function getEffectiveModelId() {
    return (state.settings.customModel || '').trim() || state.settings.model || 'openai-fast';
  }

  function selectActiveModel(modelId) {
    const clean = String(modelId || '').trim();
    if (!clean) return;
    const known = Config.getModels().some(function (m) {
      return m.id.toLowerCase() === clean.toLowerCase();
    });
    if (known) {
      state.settings.model = clean;
      state.settings.customModel = '';
    } else {
      state.settings.model = clean;
      state.settings.customModel = clean;
    }
    Storage.saveSettings(state.settings);
    renderModelOptionsList();
    renderWelcomeModelChips();
    syncHeaderAndSidebarControls();
    closeAllDropdowns();
    const meta = Config.getModelById(clean);
    showToast('Switched model to ' + meta.name);
  }

  async function syncModelsFromPollinations(showFeedback) {
    if (els['sync-models-btn']) els['sync-models-btn'].classList.add('is-syncing');
    try {
      const list = await Providers.fetchPollinationsModels(state.apiKeys.pollinations);
      renderModelOptionsList();
      renderWelcomeModelChips();
      if (showFeedback) {
        showToast('Synced ' + list.length + ' models from pollinations.ai');
      }
    } catch (_) {
      if (showFeedback) {
        showToast('Using built-in Pollinations model catalog.');
      }
    } finally {
      if (els['sync-models-btn']) els['sync-models-btn'].classList.remove('is-syncing');
    }
  }

  function getActiveConversation() {
    return state.conversations.find(function (c) { return c.id === state.activeChatId; }) || null;
  }

  function ensureActiveConversation() {
    let conv = getActiveConversation();
    if (!conv) {
      conv = Storage.createEmptyConversation({ model: getEffectiveModelId() });
      state.conversations.unshift(conv);
      state.activeChatId = conv.id;
      Storage.saveActiveChatId(conv.id);
      Storage.saveConversations(state.conversations);
    }
    return conv;
  }

  function getActiveSystemPrompt() {
    if (state.settings.personaId === 'custom') {
      return (state.settings.customSystemPrompt || '').trim();
    }
    const persona = Config.PERSONAS.find(function (p) { return p.id === state.settings.personaId; }) || Config.PERSONAS[0];
    if (state.settings.customSystemPrompt && state.settings.customSystemPrompt.trim()) {
      return state.settings.customSystemPrompt.trim();
    }
    return persona.prompt;
  }

  /* ========================================================================
     Model Switcher, Header & Sidebar Rendering
     ======================================================================== */

  function renderStarterPrompts() {
    els['starter-grid'].innerHTML = Config.STARTER_PROMPTS.map(function (item, idx) {
      return (
        '<button type="button" class="starter-card" data-starter-idx="' + idx + '">' +
        '<span class="starter-cat">' + Markdown.escapeHtml(item.category) + '</span>' +
        '<span class="starter-title">' + Markdown.escapeHtml(item.title) + '</span>' +
        '<span class="starter-sub">' + Markdown.escapeHtml(item.subtitle) + '</span>' +
        '</button>'
      );
    }).join('');
  }

  function renderWelcomeModelChips() {
    if (!els['welcome-model-chips']) return;
    const activeId = getEffectiveModelId().toLowerCase();
    const featured = Config.getModels().slice(0, 7);

    let html = featured.map(function (m) {
      const isAct = m.id.toLowerCase() === activeId ? ' is-active' : '';
      return (
        '<button type="button" class="model-chip-btn' + isAct + '" data-quick-model="' + Markdown.escapeHtml(m.id) + '">' +
        '<span>' + Markdown.escapeHtml(m.shortName || m.name) + '</span>' +
        '</button>'
      );
    }).join('');

    html += '<button type="button" class="model-chip-btn" data-open-switcher="true">+ All Models (' + Config.getModels().length + ')</button>';
    els['welcome-model-chips'].innerHTML = html;
  }

  function renderModelOptionsList() {
    if (!els['model-options-list']) return;
    const activeId = getEffectiveModelId().toLowerCase();
    const q = state.modelSearchQuery.trim().toLowerCase();
    const filter = state.modelFilter;
    const models = Config.getModels();

    const filtered = models.filter(function (m) {
      if (filter === 'free' && !m.keyless) return false;
      if (filter === 'coding' && !m.isCoding) return false;
      if (filter === 'reasoning' && !m.supportsReasoning) return false;
      if (!q) return true;
      return (
        m.id.toLowerCase().includes(q) ||
        (m.canonicalId && m.canonicalId.toLowerCase().includes(q)) ||
        m.name.toLowerCase().includes(q) ||
        (m.providerLabel && m.providerLabel.toLowerCase().includes(q)) ||
        (m.description && m.description.toLowerCase().includes(q))
      );
    });

    let html = filtered.map(function (m) {
      const selected = m.id.toLowerCase() === activeId ? ' is-selected' : '';
      return (
        '<button type="button" class="dropdown-option' + selected + '" data-select-model="' + Markdown.escapeHtml(m.id) + '" role="option">' +
        '<div class="dropdown-opt-top">' +
        '<span>' + Markdown.escapeHtml(m.name) + '</span>' +
        '<span class="dropdown-opt-badge">' + Markdown.escapeHtml(m.badge || m.providerLabel) + '</span>' +
        '</div>' +
        '<div class="dropdown-opt-desc">' +
        '<span class="model-id-pill">' + Markdown.escapeHtml(m.id) + '</span> ' +
        Markdown.escapeHtml(m.description || '') +
        '</div>' +
        '</button>'
      );
    }).join('');

    // Allow choosing any custom typed Pollinations model ID directly
    const rawTyped = state.modelSearchQuery.trim();
    if (rawTyped && !models.some(function (m) { return m.id.toLowerCase() === rawTyped.toLowerCase(); })) {
      html +=
        '<button type="button" class="dropdown-option" data-select-model="' + Markdown.escapeHtml(rawTyped) + '">' +
        '<div class="dropdown-opt-top"><span>Use custom ID: "' + Markdown.escapeHtml(rawTyped) + '"</span><span class="dropdown-opt-badge">CUSTOM</span></div>' +
        '<div class="dropdown-opt-desc">Send requests directly to Pollinations with model="' + Markdown.escapeHtml(rawTyped) + '"</div>' +
        '</button>';
    }

    if (!html) {
      html = '<div class="chat-empty-note">No matching models. Type any Pollinations model ID above to use it.</div>';
    }

    els['model-options-list'].innerHTML = html;
  }

  function renderPersonaDropdown() {
    els['persona-dropdown'].innerHTML = Config.PERSONAS.map(function (p) {
      const selected = p.id === state.settings.personaId ? ' is-selected' : '';
      return (
        '<button type="button" class="dropdown-option' + selected + '" data-select-persona="' + p.id + '" role="option">' +
        '<div class="dropdown-opt-top"><span>' + Markdown.escapeHtml(p.name) + '</span></div>' +
        '<div class="dropdown-opt-desc">' + Markdown.escapeHtml(p.prompt ? p.prompt.slice(0, 82) + '…' : 'Write your own system instructions in Settings') + '</div>' +
        '</button>'
      );
    }).join('');
  }

  function syncHeaderAndSidebarControls() {
    const activeId = getEffectiveModelId();
    const model = Config.getModelById(activeId);
    const persona = Config.PERSONAS.find(function (p) { return p.id === state.settings.personaId; }) || Config.PERSONAS[0];
    const provider = Config.getProviderById(state.settings.provider);

    els['active-model-label'].textContent = model.name;
    els['active-model-tag'].textContent = model.providerLabel || 'Pollinations';
    els['composer-model-label'].textContent = model.shortName || model.name;
    els['active-persona-label'].textContent = persona.name;
    els['sidebar-settings-sub'].textContent = (model.shortName || model.name) + ' · ' + persona.name;

    els['connection-dot'].className = 'status-dot';
    if (provider.id === 'demo') {
      els['connection-dot'].classList.add('status-demo');
      els['connection-label'].textContent = 'Offline Sandbox';
    } else if (provider.id === 'openrouter') {
      els['connection-dot'].classList.add('status-ready');
      els['connection-label'].textContent = 'Custom Gateway';
    } else {
      els['connection-dot'].classList.add('status-ready');
      const hasOptToken = Boolean(state.apiKeys.pollinations && state.apiKeys.pollinations.trim());
      els['connection-label'].textContent = hasOptToken ? 'Pollinations · Token' : 'Pollinations · No Key';
    }

    renderWelcomeConnectionBar(provider, model);
    updateContextMeter();
  }

  function renderWelcomeConnectionBar(provider, model) {
    if (!els['welcome-connection-bar']) return;
    if (provider.id === 'pollinations') {
      els['welcome-connection-bar'].innerHTML =
        '<span>Ready on <strong>pollinations.ai</strong> (no API key needed) · Active model: <code>' + Markdown.escapeHtml(model.id) + '</code></span>' +
        '<button type="button" class="inline-action-btn" data-open-switcher="true">Switch Model</button>' +
        '<button type="button" class="inline-action-btn" data-quick-action="switch-demo">Offline Sandbox</button>';
    } else if (provider.id === 'demo') {
      els['welcome-connection-bar'].innerHTML =
        '<span><strong>Offline Sandbox</strong> active — instant local simulation of streaming &amp; live HTML previews.</span>' +
        '<button type="button" class="inline-action-btn" data-quick-action="switch-pollinations">Switch to Live Pollinations.ai</button>';
    } else {
      els['welcome-connection-bar'].innerHTML =
        '<span>Using <strong>Custom OpenAI / OpenRouter Gateway</strong>.</span>' +
        '<button type="button" class="inline-action-btn" data-quick-action="open-keys">Configure</button>' +
        '<button type="button" class="inline-action-btn" data-quick-action="switch-pollinations">Use Pollinations Keyless</button>';
    }
  }

  function updateContextMeter() {
    const conv = getActiveConversation();
    if (!conv || !conv.messages.length) {
      els['context-tokens-text'].textContent = '0 tok';
      return;
    }
    let total = 0;
    conv.messages.forEach(function (m) {
      total += Config.estimateTokens((m.content || '') + (m.thinking || ''));
    });
    const tokLabel = total >= 1000 ? (total / 1000).toFixed(1) + 'k' : String(total);
    els['context-tokens-text'].textContent = '~' + tokLabel + ' tok';
  }

  function renderChatList() {
    const q = state.searchQuery.trim().toLowerCase();
    els['chat-search-clear'].classList.toggle('hidden', !q);

    const filtered = state.conversations.filter(function (c) {
      if (!q) return true;
      if ((c.title || '').toLowerCase().includes(q)) return true;
      return (c.messages || []).some(function (m) {
        return (m.content || '').toLowerCase().includes(q);
      });
    });

    if (!filtered.length) {
      els['chat-list'].innerHTML =
        '<div class="chat-empty-note">' +
        (q ? 'No matching conversations.' : 'Your conversations will appear here.') +
        '</div>';
      return;
    }

    const pinned = filtered.filter(function (c) { return c.pinned; });
    const recent = filtered.filter(function (c) { return !c.pinned; });

    let html = '';
    if (pinned.length) {
      html += '<div class="chat-group-label">Pinned</div>';
      pinned.forEach(function (c) { html += renderChatItemHtml(c); });
    }
    if (recent.length) {
      html += '<div class="chat-group-label">' + (pinned.length ? 'Recent' : 'Conversations') + '</div>';
      recent.forEach(function (c) { html += renderChatItemHtml(c); });
    }
    els['chat-list'].innerHTML = html;
  }

  function renderChatItemHtml(c) {
    const active = c.id === state.activeChatId ? ' is-active' : '';
    const pinTitle = c.pinned ? 'Unpin' : 'Pin';
    return (
      '<div class="chat-item' + active + '" data-chat-id="' + c.id + '" role="button" tabindex="0">' +
      '<span class="chat-item-title">' + Markdown.escapeHtml(c.title || 'New conversation') + '</span>' +
      '<div class="chat-item-actions">' +
      '<button type="button" class="chat-mini-btn" data-chat-action="pin" data-chat-id="' + c.id + '" title="' + pinTitle + '" aria-label="' + pinTitle + '">' +
      (c.pinned ? '★' : '☆') +
      '</button>' +
      '<button type="button" class="chat-mini-btn" data-chat-action="rename" data-chat-id="' + c.id + '" title="Rename" aria-label="Rename">✎</button>' +
      '<button type="button" class="chat-mini-btn danger" data-chat-action="delete" data-chat-id="' + c.id + '" title="Delete" aria-label="Delete">×</button>' +
      '</div>' +
      '</div>'
    );
  }

  /* ========================================================================
     Thread & Message Rendering
     ======================================================================== */

  function renderActiveThread() {
    const conv = getActiveConversation();
    if (!conv || !conv.messages.length) {
      els['welcome-screen'].classList.remove('hidden');
      els['messages-list'].classList.add('hidden');
      els['messages-list'].innerHTML = '';
      updateContextMeter();
      return;
    }

    els['welcome-screen'].classList.add('hidden');
    els['messages-list'].classList.remove('hidden');
    els['messages-list'].innerHTML = conv.messages.map(function (msg, idx) {
      const isLast = idx === conv.messages.length - 1;
      return buildMessageRowHtml(msg, isLast && state.isStreaming);
    }).join('');

    scrollToBottom();
    updateContextMeter();
  }

  function buildMessageRowHtml(msg, isActivelyStreaming) {
    if (msg.role === 'user') {
      let attHtml = '';
      if (Array.isArray(msg.attachments) && msg.attachments.length) {
        attHtml = '<div class="msg-attachments">' + msg.attachments.map(function (att) {
          if (att.kind === 'image' && att.dataUrl) {
            return '<img src="' + att.dataUrl + '" alt="' + Markdown.escapeHtml(att.name) + '" class="msg-att-thumb" />';
          }
          return '<span class="msg-att-file">📄 ' + Markdown.escapeHtml(att.name || 'file') + '</span>';
        }).join('') + '</div>';
      }

      return (
        '<article class="msg-row msg-user" id="msg-row-' + msg.id + '" data-msg-id="' + msg.id + '">' +
        attHtml +
        (msg.content ? '<div class="msg-user-bubble">' + Markdown.escapeHtml(msg.content) + '</div>' : '') +
        '<div class="msg-actions">' +
        '<button type="button" class="msg-action-btn" data-msg-action="edit" data-msg-id="' + msg.id + '">Edit</button>' +
        '<button type="button" class="msg-action-btn" data-msg-action="copy" data-msg-id="' + msg.id + '">Copy</button>' +
        '</div>' +
        '</article>'
      );
    }

    const modelLabel = Markdown.escapeHtml(msg.modelLabel || msg.model || 'Pollinations AI');
    const metaParts = [];
    if (msg.model && msg.modelLabel && msg.model !== msg.modelLabel) {
      metaParts.push(Markdown.escapeHtml(msg.model));
    }
    if (msg.speedTokSec) {
      metaParts.push(msg.speedTokSec + ' tok/s');
    }
    if (msg.fallbackFrom) {
      metaParts.push('keyless fallback from ' + Markdown.escapeHtml(msg.fallbackFrom));
    }
    const speedBadge = metaParts.length
      ? '<span class="msg-speed-badge">' + metaParts.join(' · ') + '</span>'
      : '';

    let thinkingHtml = '';
    if (msg.thinking && msg.thinking.trim()) {
      const isStillThinking = isActivelyStreaming && !msg.content;
      const secs = msg.thinkingMs ? (msg.thinkingMs / 1000).toFixed(1) + 's' : '';
      const summaryText = isStillThinking
        ? 'Reasoning…'
        : 'Thought process' + (secs ? ' · ' + secs : '');
      thinkingHtml =
        '<details class="thinking-box' + (isStillThinking ? ' is-thinking' : '') + '"' + (isStillThinking ? ' open' : '') + '>' +
        '<summary class="thinking-summary">' +
        (isStillThinking ? '<span class="thinking-pulse"></span>' : '<span class="thinking-chevron">▸</span>') +
        '<span>' + summaryText + '</span>' +
        '</summary>' +
        '<div class="thinking-content">' + Markdown.escapeHtml(msg.thinking) + '</div>' +
        '</details>';
    }

    let contentHtml = '';
    if (msg.content) {
      contentHtml =
        '<div class="msg-markdown' + (isActivelyStreaming ? ' is-streaming' : '') + '">' +
        Markdown.render(msg.content) +
        '</div>';
    } else if (isActivelyStreaming && !msg.thinking) {
      contentHtml = '<div class="typing-dots" aria-label="Generating response"><span></span><span></span><span></span></div>';
    }

    let errorHtml = '';
    if (msg.error) {
      errorHtml =
        '<div class="msg-error-card">' +
        '<div><strong>Notice:</strong> ' + Markdown.escapeHtml(msg.error) + '</div>' +
        '<div class="msg-error-actions">' +
        '<button type="button" class="inline-action-btn" data-msg-action="retry" data-msg-id="' + msg.id + '">Retry</button>' +
        '<button type="button" class="inline-action-btn" data-msg-action="retry-fast" data-msg-id="' + msg.id + '">Retry with GPT-5 Nano (Fast)</button>' +
        '<button type="button" class="inline-action-btn" data-msg-action="retry-demo" data-msg-id="' + msg.id + '">Try in Offline Sandbox</button>' +
        '</div>' +
        '</div>';
    }

    const actionsHtml = isActivelyStreaming
      ? ''
      : '<div class="msg-actions">' +
        '<button type="button" class="msg-action-btn" data-msg-action="copy" data-msg-id="' + msg.id + '">Copy</button>' +
        '<button type="button" class="msg-action-btn" data-msg-action="regenerate" data-msg-id="' + msg.id + '" title="Regenerate using currently selected model">Regenerate</button>' +
        '<button type="button" class="msg-action-btn" data-msg-action="speak" data-msg-id="' + msg.id + '">Read aloud</button>' +
        '</div>';

    return (
      '<article class="msg-row msg-assistant" id="msg-row-' + msg.id + '" data-msg-id="' + msg.id + '">' +
      '<div class="msg-assistant-wrap">' +
      '<div class="assistant-avatar' + (isActivelyStreaming ? ' is-streaming' : '') + '" aria-hidden="true">' +
      '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M12 2.5C12.9 8.8 15.2 11.1 21.5 12C15.2 12.9 12.9 15.2 12 21.5C11.1 15.2 8.8 12.9 2.5 12C8.8 11.1 11.1 8.8 12 2.5Z"/></svg>' +
      '</div>' +
      '<div class="msg-assistant-body">' +
      '<div class="msg-meta-header"><span class="msg-author-name">' + modelLabel + '</span>' + speedBadge + '</div>' +
      thinkingHtml +
      contentHtml +
      errorHtml +
      actionsHtml +
      '</div>' +
      '</div>' +
      '</article>'
    );
  }

  function updateSingleMessageDom(msg, isActivelyStreaming) {
    const existing = document.getElementById('msg-row-' + msg.id);
    if (!existing) {
      renderActiveThread();
      return;
    }
    const prevDetails = existing.querySelector('details.thinking-box');
    const wasOpen = prevDetails ? prevDetails.open : null;

    const wrapper = document.createElement('div');
    wrapper.innerHTML = buildMessageRowHtml(msg, isActivelyStreaming);
    const nextNode = wrapper.firstElementChild;

    if (wasOpen !== null && msg.content) {
      const nextDetails = nextNode.querySelector('details.thinking-box');
      if (nextDetails) nextDetails.open = wasOpen;
    }

    existing.replaceWith(nextNode);
  }

  /* ========================================================================
     Sending & 60fps Streaming Pipeline
     ======================================================================== */

  async function handleSendMessage(overridePrompt) {
    if (state.isStreaming) return;

    const text = typeof overridePrompt === 'string'
      ? overridePrompt.trim()
      : els['composer-input'].value.trim();

    if (!text && state.stagedAttachments.length === 0) return;

    const conv = ensureActiveConversation();

    if (state.editingMessageId) {
      const editIdx = conv.messages.findIndex(function (m) { return m.id === state.editingMessageId; });
      if (editIdx !== -1) {
        conv.messages = conv.messages.slice(0, editIdx);
      }
      exitEditMode();
    }

    const userMsg = {
      id: Storage.uid('msg'),
      role: 'user',
      content: text,
      attachments: state.stagedAttachments.slice(),
      createdAt: Date.now()
    };

    conv.messages.push(userMsg);
    if (conv.messages.length === 1 || conv.title === 'New conversation') {
      conv.title = Storage.deriveTitleFromText(text || (userMsg.attachments[0] && userMsg.attachments[0].name));
    }
    conv.updatedAt = Date.now();
    conv.model = getEffectiveModelId();

    els['composer-input'].value = '';
    autoResizeComposer();
    state.stagedAttachments = [];
    renderAttachmentTray();
    updateSendButtonState();

    promoteConversation(conv.id);
    Storage.saveConversations(state.conversations);
    renderChatList();

    await generateAssistantReply(conv);
  }

  async function generateAssistantReply(conv) {
    const chosenId = getEffectiveModelId();
    const modelObj = Config.getModelById(chosenId);
    const assistantMsg = {
      id: Storage.uid('msg'),
      role: 'assistant',
      content: '',
      thinking: '',
      thinkingMs: 0,
      model: chosenId,
      modelLabel: modelObj.name,
      provider: state.settings.provider,
      createdAt: Date.now(),
      error: ''
    };

    conv.messages.push(assistantMsg);
    state.isStreaming = true;
    state.userScrolledUp = false;
    state.abortController = new AbortController();

    toggleStreamingButtons(true);
    renderActiveThread();

    let rafPending = false;
    const tStart = performance.now();
    let tFirstToken = 0;
    let tThinkingStart = 0;

    function scheduleFrame() {
      if (rafPending) return;
      rafPending = true;
      requestAnimationFrame(function () {
        rafPending = false;
        updateSingleMessageDom(assistantMsg, state.isStreaming);
        if (!state.userScrolledUp) {
          scrollToBottom();
        }
      });
    }

    const historyForModel = conv.messages.slice(0, -1);

    try {
      const result = await Providers.streamChat({
        settings: state.settings,
        apiKeys: state.apiKeys,
        systemPrompt: getActiveSystemPrompt(),
        messages: historyForModel,
        signal: state.abortController.signal,
        onThinking: function (chunk) {
          if (!tThinkingStart) tThinkingStart = performance.now();
          assistantMsg.thinking += chunk;
          assistantMsg.thinkingMs = Math.round(performance.now() - tThinkingStart);
          scheduleFrame();
        },
        onToken: function (chunk) {
          if (!tFirstToken) {
            tFirstToken = performance.now();
            if (tThinkingStart && !assistantMsg.thinkingMs) {
              assistantMsg.thinkingMs = Math.round(tFirstToken - tThinkingStart);
            }
          }
          assistantMsg.content += chunk;
          scheduleFrame();
        }
      });

      if (result && result.model) {
        assistantMsg.model = result.model;
        const resolvedMeta = Config.getModelById(result.model.replace(' (sandbox)', ''));
        assistantMsg.modelLabel = resolvedMeta.name;
      }
      if (result && result.fallbackFrom) {
        assistantMsg.fallbackFrom = result.fallbackFrom;
      }

      const elapsedSec = Math.max(0.08, (performance.now() - (tFirstToken || tStart)) / 1000);
      const outTokens = (result && result.usage && result.usage.outputTokens) ||
        Config.estimateTokens(assistantMsg.content);
      if (outTokens > 6) {
        assistantMsg.speedTokSec = Math.round(outTokens / elapsedSec);
      }
    } catch (err) {
      if (err && err.name === 'AbortError') {
        if (!assistantMsg.content && !assistantMsg.thinking) {
          assistantMsg.content = '_Generation stopped._';
        }
      } else {
        assistantMsg.error = (err && err.message) ? err.message : 'Unexpected connection error.';
      }
    } finally {
      state.isStreaming = false;
      state.abortController = null;
      conv.updatedAt = Date.now();
      toggleStreamingButtons(false);
      updateSingleMessageDom(assistantMsg, false);
      Storage.saveConversations(state.conversations);
      updateContextMeter();
      if (!state.userScrolledUp) {
        scrollToBottom();
      }
    }
  }

  function promoteConversation(id) {
    const idx = state.conversations.findIndex(function (c) { return c.id === id; });
    if (idx > 0) {
      const item = state.conversations.splice(idx, 1)[0];
      state.conversations.unshift(item);
    }
  }

  function toggleStreamingButtons(streaming) {
    els['stop-btn'].classList.toggle('hidden', !streaming);
    els['send-btn'].classList.toggle('hidden', streaming);
  }

  function stopStreaming() {
    if (state.abortController) {
      state.abortController.abort();
    }
  }

  /* ========================================================================
     Attachments (Images + Text/Code Files)
     ======================================================================== */

  async function processFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;

    for (let i = 0; i < files.length; i++) {
      if (state.stagedAttachments.length >= 6) {
        showToast('Maximum 6 attachments per message.');
        break;
      }
      const file = files[i];
      if (file.type && file.type.startsWith('image/')) {
        try {
          const imgAtt = await compressAndReadImage(file);
          state.stagedAttachments.push(imgAtt);
        } catch (_) {
          showToast('Could not read image: ' + file.name);
        }
      } else {
        if (file.size > 300000) {
          showToast(file.name + ' is larger than 300 KB — truncated for browser context.');
        }
        try {
          const text = await readFileAsText(file);
          state.stagedAttachments.push({
            id: Storage.uid('att'),
            kind: 'file',
            name: file.name,
            mimeType: file.type || 'text/plain',
            textContent: text.slice(0, 300000)
          });
        } catch (_) {
          showToast('Could not read file: ' + file.name);
        }
      }
    }

    renderAttachmentTray();
    updateSendButtonState();
  }

  function readFileAsText(file) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result || '')); };
      reader.onerror = reject;
      reader.readAsText(file);
    });
  }

  function compressAndReadImage(file) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = function () {
        const rawDataUrl = String(reader.result || '');
        if (file.type === 'image/gif') {
          resolve({
            id: Storage.uid('att'),
            kind: 'image',
            name: file.name || 'image.gif',
            mimeType: 'image/gif',
            dataUrl: rawDataUrl
          });
          return;
        }

        const img = new Image();
        img.onerror = reject;
        img.onload = function () {
          const maxDim = 1280;
          let w = img.width;
          let h = img.height;
          if (w > maxDim || h > maxDim) {
            const scale = Math.min(maxDim / w, maxDim / h);
            w = Math.round(w * scale);
            h = Math.round(h * scale);
          }
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          const outMime = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
          const outDataUrl = canvas.toDataURL(outMime, 0.86);
          resolve({
            id: Storage.uid('att'),
            kind: 'image',
            name: file.name || 'pasted-image.jpg',
            mimeType: outMime,
            dataUrl: outDataUrl
          });
        };
        img.src = rawDataUrl;
      };
      reader.readAsDataURL(file);
    });
  }

  function renderAttachmentTray() {
    if (!state.stagedAttachments.length) {
      els['attachment-tray'].classList.add('hidden');
      els['attachment-tray'].innerHTML = '';
      return;
    }
    els['attachment-tray'].classList.remove('hidden');
    els['attachment-tray'].innerHTML = state.stagedAttachments.map(function (att) {
      const thumb = att.kind === 'image'
        ? '<img src="' + att.dataUrl + '" alt="" />'
        : '<span>📄</span>';
      return (
        '<div class="staged-att">' +
        thumb +
        '<span>' + Markdown.escapeHtml(att.name) + '</span>' +
        '<button type="button" class="staged-att-remove" data-remove-att="' + att.id + '" aria-label="Remove attachment">×</button>' +
        '</div>'
      );
    }).join('');
  }

  /* ========================================================================
     Live HTML / SVG Artifact Preview
     ======================================================================== */

  function openArtifactPreview(rawCode, lang) {
    let htmlDoc = rawCode;
    if (String(lang).toLowerCase() === 'svg' || /^\s*<svg[\s>]/i.test(rawCode)) {
      htmlDoc =
        '<!DOCTYPE html><html><head><meta charset="utf-8"><style>' +
        'body{margin:0;min-height:100vh;display:grid;place-items:center;background:#141210;color:#f4f0e8;font-family:system-ui,sans-serif;padding:20px;}' +
        'svg{max-width:100%;height:auto;}' +
        '</style></head><body>' + rawCode + '</body></html>';
    }
    state.activeArtifactHtml = htmlDoc;
    els['artifact-drawer'].classList.remove('hidden');
    els['artifact-iframe'].srcdoc = htmlDoc;
  }

  function closeArtifactPreview() {
    els['artifact-drawer'].classList.add('hidden');
    els['artifact-iframe'].srcdoc = '';
  }

  /* ========================================================================
     Voice Dictation & Speech Synthesis
     ======================================================================== */

  function initSpeechRecognition() {
    const SpeechRec = root.SpeechRecognition || root.webkitSpeechRecognition;
    if (!SpeechRec) return;

    els['voice-btn'].classList.remove('hidden');
    const rec = new SpeechRec();
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = navigator.language || 'en-US';

    let baseText = '';
    rec.onstart = function () {
      state.isRecording = true;
      baseText = els['composer-input'].value ? els['composer-input'].value + ' ' : '';
      els['voice-btn'].classList.add('is-recording');
    };
    rec.onresult = function (ev) {
      let transcript = '';
      for (let i = 0; i < ev.results.length; i++) {
        transcript += ev.results[i][0].transcript;
      }
      els['composer-input'].value = baseText + transcript;
      autoResizeComposer();
      updateSendButtonState();
    };
    rec.onend = function () {
      state.isRecording = false;
      els['voice-btn'].classList.remove('is-recording');
    };
    rec.onerror = function () {
      state.isRecording = false;
      els['voice-btn'].classList.remove('is-recording');
    };
    state.recognition = rec;
  }

  function speakText(markdownText) {
    if (!('speechSynthesis' in root)) {
      showToast('Speech synthesis is not supported in this browser.');
      return;
    }
    if (root.speechSynthesis.speaking) {
      root.speechSynthesis.cancel();
      if (state.activeSpeechUtterance) {
        state.activeSpeechUtterance = null;
        return;
      }
    }
    const plain = String(markdownText || '')
      .replace(/```[\s\S]*?```/g, ' Code block omitted. ')
      .replace(/[#>*_`~\[\]()]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!plain) return;
    const utter = new SpeechSynthesisUtterance(plain);
    state.activeSpeechUtterance = utter;
    utter.onend = function () { state.activeSpeechUtterance = null; };
    root.speechSynthesis.speak(utter);
  }

  /* ========================================================================
     Settings Modal Management
     ======================================================================== */

  function openSettingsModal(initialTab) {
    state.modalDraftProvider = state.settings.provider;

    els['auto-fallback-checkbox'].checked = state.settings.autoFallbackFree !== false;
    els['private-mode-checkbox'].checked = state.settings.privateMode !== false;
    els['pollinations-key-input'].value = state.apiKeys.pollinations || '';
    els['openrouter-key-input'].value = state.apiKeys.openrouter || '';
    els['openrouter-endpoint-input'].value = state.settings.openRouterEndpoint || 'https://openrouter.ai/api/v1/chat/completions';
    els['ephemeral-keys-checkbox'].checked = Boolean(state.settings.ephemeralKeys);

    const models = Config.getModels();
    els['settings-model-select'].innerHTML = models.map(function (m) {
      return '<option value="' + Markdown.escapeHtml(m.id) + '">' + Markdown.escapeHtml(m.name + ' (' + m.id + ')') + '</option>';
    }).join('');
    if (models.some(function (m) { return m.id === state.settings.model; })) {
      els['settings-model-select'].value = state.settings.model;
    }
    els['custom-model-input'].value = state.settings.customModel || '';

    els['temperature-range'].value = String(state.settings.temperature);
    els['temperature-val'].textContent = Number(state.settings.temperature).toFixed(2);
    els['max-tokens-input'].value = String(state.settings.maxTokens || 4096);

    els['settings-persona-select'].innerHTML = Config.PERSONAS.map(function (p) {
      return '<option value="' + p.id + '">' + Markdown.escapeHtml(p.name) + '</option>';
    }).join('');
    els['settings-persona-select'].value = state.settings.personaId;
    els['custom-system-textarea'].value = state.settings.customSystemPrompt || getActiveSystemPrompt();

    els['send-enter-checkbox'].checked = Boolean(state.settings.sendOnEnter);

    renderProviderCardsInModal();
    switchSettingsTab(initialTab || 'connection');
    els['settings-modal'].classList.remove('hidden');
  }

  function renderProviderCardsInModal() {
    els['provider-cards'].innerHTML = Config.PROVIDERS.map(function (p) {
      const sel = p.id === state.modalDraftProvider ? ' is-selected' : '';
      return (
        '<button type="button" class="provider-card' + sel + '" data-modal-provider="' + p.id + '">' +
        '<div class="provider-card-title">' + Markdown.escapeHtml(p.name) + '</div>' +
        '<div class="provider-card-desc">' + Markdown.escapeHtml(p.description) + '</div>' +
        '</button>'
      );
    }).join('');

    els['pollinations-config-group'].classList.toggle('hidden', state.modalDraftProvider !== 'pollinations');
    els['openrouter-key-group'].classList.toggle('hidden', state.modalDraftProvider !== 'openrouter');
  }

  function switchSettingsTab(tabName) {
    document.querySelectorAll('.modal-tab').forEach(function (btn) {
      const active = btn.getAttribute('data-tab') === tabName;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    ['connection', 'model', 'data'].forEach(function (name) {
      const pane = document.getElementById('tab-' + name);
      if (pane) pane.classList.toggle('hidden', name !== tabName);
    });
  }

  function saveSettingsFromModal() {
    state.settings.provider = state.modalDraftProvider;
    state.settings.autoFallbackFree = els['auto-fallback-checkbox'].checked;
    state.settings.privateMode = els['private-mode-checkbox'].checked;
    state.settings.openRouterEndpoint = els['openrouter-endpoint-input'].value.trim() || 'https://openrouter.ai/api/v1/chat/completions';
    state.settings.ephemeralKeys = els['ephemeral-keys-checkbox'].checked;

    state.settings.model = els['settings-model-select'].value || 'openai-fast';
    state.settings.customModel = els['custom-model-input'].value.trim();
    state.settings.temperature = Number(els['temperature-range'].value);
    state.settings.maxTokens = Math.min(32768, Math.max(256, Number(els['max-tokens-input'].value) || 4096));
    state.settings.personaId = els['settings-persona-select'].value || 'default';

    const selectedPersona = Config.PERSONAS.find(function (p) { return p.id === state.settings.personaId; });
    const typedPrompt = els['custom-system-textarea'].value.trim();
    if (selectedPersona && typedPrompt === selectedPersona.prompt) {
      state.settings.customSystemPrompt = '';
    } else {
      state.settings.customSystemPrompt = typedPrompt;
    }

    state.settings.sendOnEnter = els['send-enter-checkbox'].checked;

    state.apiKeys = {
      pollinations: els['pollinations-key-input'].value.trim(),
      openrouter: els['openrouter-key-input'].value.trim()
    };

    Storage.saveSettings(state.settings);
    Storage.saveApiKeys(state.apiKeys, state.settings.ephemeralKeys);

    renderModelOptionsList();
    renderPersonaDropdown();
    renderWelcomeModelChips();
    syncHeaderAndSidebarControls();
    els['settings-modal'].classList.add('hidden');
    showToast('Settings saved.');
  }

  /* ========================================================================
     UI Helpers (Model Switcher Toggle, Scroll, Composer, Downloads)
     ======================================================================== */

  function toggleModelSwitcher(forceOpen) {
    const isHidden = els['model-dropdown'].classList.contains('hidden');
    const shouldOpen = typeof forceOpen === 'boolean' ? forceOpen : isHidden;
    closeAllDropdowns();
    if (shouldOpen) {
      els['model-dropdown'].classList.remove('hidden');
      els['model-select-btn'].setAttribute('aria-expanded', 'true');
      renderModelOptionsList();
      setTimeout(function () {
        if (els['model-search-input']) els['model-search-input'].focus();
      }, 20);
    }
  }

  function closeAllDropdowns() {
    ['model-dropdown', 'persona-dropdown'].forEach(function (id) {
      if (els[id]) els[id].classList.add('hidden');
    });
    if (els['model-select-btn']) els['model-select-btn'].setAttribute('aria-expanded', 'false');
  }

  function scrollToBottom() {
    const vp = els['chat-viewport'];
    if (!vp) return;
    vp.scrollTop = vp.scrollHeight;
    els['scroll-bottom-btn'].classList.add('hidden');
  }

  function autoResizeComposer() {
    const ta = els['composer-input'];
    ta.style.height = 'auto';
    ta.style.height = Math.min(210, ta.scrollHeight) + 'px';
    const val = ta.value;
    if (val.length > 120) {
      els['draft-counter'].textContent = '~' + Config.estimateTokens(val) + ' tok';
    } else {
      els['draft-counter'].textContent = '';
    }
  }

  function updateSendButtonState() {
    const hasContent = els['composer-input'].value.trim().length > 0 || state.stagedAttachments.length > 0;
    els['send-btn'].disabled = !hasContent || state.isStreaming;
  }

  function enterEditMode(msg) {
    state.editingMessageId = msg.id;
    els['edit-banner'].classList.remove('hidden');
    els['composer-input'].value = msg.content || '';
    state.stagedAttachments = Array.isArray(msg.attachments) ? msg.attachments.slice() : [];
    renderAttachmentTray();
    autoResizeComposer();
    updateSendButtonState();
    els['composer-input'].focus();
  }

  function exitEditMode() {
    state.editingMessageId = null;
    els['edit-banner'].classList.add('hidden');
  }

  function triggerDownload(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType || 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function copyToClipboard(text, successMsg) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        if (successMsg) showToast(successMsg);
      });
      return;
    }
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    try { document.execCommand('copy'); } catch (_) {}
    document.body.removeChild(area);
    if (successMsg) showToast(successMsg);
  }

  function startNewChat() {
    if (state.isStreaming) stopStreaming();
    exitEditMode();
    const existingEmpty = state.conversations.find(function (c) { return c.messages.length === 0; });
    if (existingEmpty) {
      state.activeChatId = existingEmpty.id;
    } else {
      const fresh = Storage.createEmptyConversation({ model: getEffectiveModelId() });
      state.conversations.unshift(fresh);
      state.activeChatId = fresh.id;
      Storage.saveConversations(state.conversations);
    }
    Storage.saveActiveChatId(state.activeChatId);
    renderChatList();
    renderActiveThread();
    if (window.innerWidth <= 900) {
      els['app-shell'].classList.add('sidebar-collapsed');
    }
    els['composer-input'].focus();
  }

  /* ========================================================================
     Event Listeners
     ======================================================================== */

  function bindEvents() {
    els['sidebar-close-btn'].addEventListener('click', function () {
      els['app-shell'].classList.add('sidebar-collapsed');
    });
    els['sidebar-open-btn'].addEventListener('click', function () {
      els['app-shell'].classList.remove('sidebar-collapsed');
    });
    els['sidebar-backdrop'].addEventListener('click', function () {
      els['app-shell'].classList.add('sidebar-collapsed');
    });

    els['new-chat-btn'].addEventListener('click', startNewChat);
    els['chat-search-input'].addEventListener('input', function (e) {
      state.searchQuery = e.target.value;
      renderChatList();
    });
    els['chat-search-clear'].addEventListener('click', function () {
      state.searchQuery = '';
      els['chat-search-input'].value = '';
      renderChatList();
    });

    els['chat-list'].addEventListener('click', function (e) {
      const actionBtn = e.target.closest('[data-chat-action]');
      if (actionBtn) {
        e.stopPropagation();
        const action = actionBtn.getAttribute('data-chat-action');
        const id = actionBtn.getAttribute('data-chat-id');
        const target = state.conversations.find(function (c) { return c.id === id; });
        if (!target) return;

        if (action === 'pin') {
          target.pinned = !target.pinned;
          Storage.saveConversations(state.conversations);
          renderChatList();
        } else if (action === 'rename') {
          const nextTitle = window.prompt('Rename conversation:', target.title || '');
          if (nextTitle && nextTitle.trim()) {
            target.title = nextTitle.trim().slice(0, 100);
            Storage.saveConversations(state.conversations);
            renderChatList();
          }
        } else if (action === 'delete') {
          state.conversations = state.conversations.filter(function (c) { return c.id !== id; });
          if (state.activeChatId === id) {
            state.activeChatId = state.conversations[0] ? state.conversations[0].id : '';
            Storage.saveActiveChatId(state.activeChatId);
            renderActiveThread();
          }
          Storage.saveConversations(state.conversations);
          renderChatList();
          showToast('Conversation deleted.');
        }
        return;
      }

      const row = e.target.closest('[data-chat-id]');
      if (row) {
        const chatId = row.getAttribute('data-chat-id');
        if (state.isStreaming) stopStreaming();
        state.activeChatId = chatId;
        Storage.saveActiveChatId(chatId);
        exitEditMode();
        renderChatList();
        renderActiveThread();
        if (window.innerWidth <= 900) {
          els['app-shell'].classList.add('sidebar-collapsed');
        }
      }
    });

    // Theme, Shortcuts & Settings modals
    els['theme-toggle-btn'].addEventListener('click', function () {
      const next = state.settings.theme === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      Storage.saveSettings(state.settings);
    });
    els['open-settings-btn'].addEventListener('click', function () { openSettingsModal('connection'); });
    els['connection-pill-btn'].addEventListener('click', function () { openSettingsModal('connection'); });
    els['open-data-btn'].addEventListener('click', function () { openSettingsModal('data'); });
    els['close-settings-btn'].addEventListener('click', function () { els['settings-modal'].classList.add('hidden'); });
    els['cancel-settings-btn'].addEventListener('click', function () { els['settings-modal'].classList.add('hidden'); });
    els['save-settings-btn'].addEventListener('click', saveSettingsFromModal);

    els['open-shortcuts-btn'].addEventListener('click', function () {
      els['shortcuts-modal'].classList.remove('hidden');
    });
    els['close-shortcuts-btn'].addEventListener('click', function () {
      els['shortcuts-modal'].classList.add('hidden');
    });

    document.querySelectorAll('.modal-tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        switchSettingsTab(tab.getAttribute('data-tab'));
      });
    });

    els['provider-cards'].addEventListener('click', function (e) {
      const card = e.target.closest('[data-modal-provider]');
      if (!card) return;
      state.modalDraftProvider = card.getAttribute('data-modal-provider');
      renderProviderCardsInModal();
    });

    document.querySelectorAll('.toggle-secret-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const input = document.getElementById(btn.getAttribute('data-target'));
        if (!input) return;
        const isPw = input.type === 'password';
        input.type = isPw ? 'text' : 'password';
        btn.textContent = isPw ? 'Hide' : 'Show';
      });
    });

    els['temperature-range'].addEventListener('input', function (e) {
      els['temperature-val'].textContent = Number(e.target.value).toFixed(2);
    });

    els['settings-persona-select'].addEventListener('change', function (e) {
      const persona = Config.PERSONAS.find(function (p) { return p.id === e.target.value; });
      if (persona && persona.prompt) {
        els['custom-system-textarea'].value = persona.prompt;
      }
    });

    // Export / Import / Clear
    els['export-md-btn'].addEventListener('click', function () {
      const conv = getActiveConversation();
      if (!conv || !conv.messages.length) {
        showToast('Nothing to export in this chat yet.');
        return;
      }
      const slug = (conv.title || 'chat').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'chat';
      triggerDownload(slug + '.md', Storage.conversationToMarkdown(conv), 'text/markdown;charset=utf-8');
      showToast('Exported Markdown.');
    });

    els['export-json-btn'].addEventListener('click', function () {
      const json = Storage.exportWorkspacePayload(state.conversations, state.settings);
      triggerDownload('pollichat-workspace-backup.json', json, 'application/json;charset=utf-8');
      showToast('Workspace JSON backup downloaded.');
    });

    els['import-json-input'].addEventListener('change', async function (e) {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      try {
        const text = await readFileAsText(file);
        const imported = Storage.parseImportedWorkspace(text);
        const existingIds = new Set(state.conversations.map(function (c) { return c.id; }));
        imported.conversations.forEach(function (c) {
          if (existingIds.has(c.id)) c.id = Storage.uid('chat');
          state.conversations.unshift(c);
        });
        if (state.conversations[0]) {
          state.activeChatId = state.conversations[0].id;
          Storage.saveActiveChatId(state.activeChatId);
        }
        Storage.saveConversations(state.conversations);
        renderChatList();
        renderActiveThread();
        showToast('Imported ' + imported.conversations.length + ' conversation(s).');
      } catch (err) {
        showToast(err.message || 'Invalid JSON backup file.');
      }
      e.target.value = '';
    });

    els['clear-all-chats-btn'].addEventListener('click', function () {
      if (!window.confirm('Delete all local conversations in this browser? This cannot be undone.')) return;
      state.conversations = [];
      state.activeChatId = '';
      Storage.saveConversations([]);
      Storage.saveActiveChatId('');
      renderChatList();
      renderActiveThread();
      els['settings-modal'].classList.add('hidden');
      showToast('All local chats cleared.');
    });

    // Searchable Multi-Model Switcher Events
    els['model-select-btn'].addEventListener('click', function (e) {
      e.stopPropagation();
      toggleModelSwitcher();
    });

    els['composer-model-btn'].addEventListener('click', function (e) {
      e.stopPropagation();
      toggleModelSwitcher(true);
    });

    els['model-dropdown'].addEventListener('click', function (e) {
      e.stopPropagation();
      const opt = e.target.closest('[data-select-model]');
      if (opt) {
        selectActiveModel(opt.getAttribute('data-select-model'));
      }
    });

    els['model-search-input'].addEventListener('input', function (e) {
      state.modelSearchQuery = e.target.value;
      renderModelOptionsList();
    });

    els['model-search-input'].addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        const firstOpt = els['model-options-list'].querySelector('[data-select-model]');
        if (firstOpt) {
          e.preventDefault();
          selectActiveModel(firstOpt.getAttribute('data-select-model'));
        }
      }
    });

    els['model-filter-tabs'].addEventListener('click', function (e) {
      const btn = e.target.closest('[data-model-filter]');
      if (!btn) return;
      state.modelFilter = btn.getAttribute('data-model-filter');
      els['model-filter-tabs'].querySelectorAll('.model-filter-pill').forEach(function (p) {
        p.classList.toggle('is-active', p === btn);
      });
      renderModelOptionsList();
    });

    els['sync-models-btn'].addEventListener('click', function () {
      syncModelsFromPollinations(true);
    });

    // Persona dropdown
    els['persona-select-btn'].addEventListener('click', function (e) {
      e.stopPropagation();
      const hidden = els['persona-dropdown'].classList.contains('hidden');
      closeAllDropdowns();
      els['persona-dropdown'].classList.toggle('hidden', !hidden);
    });

    els['persona-dropdown'].addEventListener('click', function (e) {
      const opt = e.target.closest('[data-select-persona]');
      if (!opt) return;
      const pid = opt.getAttribute('data-select-persona');
      state.settings.personaId = pid;
      if (pid !== 'custom') state.settings.customSystemPrompt = '';
      Storage.saveSettings(state.settings);
      renderPersonaDropdown();
      syncHeaderAndSidebarControls();
      closeAllDropdowns();
      if (pid === 'custom') openSettingsModal('model');
    });

    // Global clicks (welcome chips, quick switches, outside dropdown close)
    document.addEventListener('click', function (e) {
      if (!e.target.closest('.dropdown-wrap')) closeAllDropdowns();

      const quickModel = e.target.closest('[data-quick-model]');
      if (quickModel) {
        selectActiveModel(quickModel.getAttribute('data-quick-model'));
        return;
      }

      const openSw = e.target.closest('[data-open-switcher]');
      if (openSw) {
        e.stopPropagation();
        toggleModelSwitcher(true);
        return;
      }

      const quick = e.target.closest('[data-quick-action]');
      if (quick) {
        const act = quick.getAttribute('data-quick-action');
        if (act === 'open-keys') {
          openSettingsModal('connection');
        } else if (act === 'switch-demo') {
          state.settings.provider = 'demo';
          Storage.saveSettings(state.settings);
          syncHeaderAndSidebarControls();
          showToast('Switched to Offline Sandbox.');
        } else if (act === 'switch-pollinations') {
          state.settings.provider = 'pollinations';
          Storage.saveSettings(state.settings);
          syncHeaderAndSidebarControls();
          showToast('Switched to live Pollinations.ai (no key needed).');
        }
      }
    });

    // Starter prompt cards
    els['starter-grid'].addEventListener('click', function (e) {
      const card = e.target.closest('[data-starter-idx]');
      if (!card) return;
      const item = Config.STARTER_PROMPTS[Number(card.getAttribute('data-starter-idx'))];
      if (item) handleSendMessage(item.prompt);
    });

    // Delegated actions inside messages
    els['messages-list'].addEventListener('click', function (e) {
      const copyCodeBtn = e.target.closest('[data-copy-code]');
      if (copyCodeBtn) {
        const raw = decodeURIComponent(copyCodeBtn.getAttribute('data-copy-code') || '');
        copyToClipboard(raw, 'Code copied to clipboard.');
        const label = copyCodeBtn.querySelector('span');
        if (label) {
          const orig = label.textContent;
          label.textContent = 'Copied!';
          setTimeout(function () { label.textContent = orig; }, 1400);
        }
        return;
      }

      const previewBtn = e.target.closest('[data-preview-code]');
      if (previewBtn) {
        const rawCode = decodeURIComponent(previewBtn.getAttribute('data-preview-code') || '');
        const lang = previewBtn.getAttribute('data-preview-lang') || 'html';
        openArtifactPreview(rawCode, lang);
        return;
      }

      const msgActionBtn = e.target.closest('[data-msg-action]');
      if (msgActionBtn) {
        const action = msgActionBtn.getAttribute('data-msg-action');
        const msgId = msgActionBtn.getAttribute('data-msg-id');
        const conv = getActiveConversation();
        if (!conv) return;
        const msgIdx = conv.messages.findIndex(function (m) { return m.id === msgId; });
        const msg = conv.messages[msgIdx];
        if (!msg) return;

        if (action === 'copy') {
          copyToClipboard(msg.content || '', 'Message copied.');
        } else if (action === 'edit' && msg.role === 'user') {
          enterEditMode(msg);
        } else if (action === 'speak') {
          speakText(msg.content || '');
        } else if ((action === 'regenerate' || action === 'retry' || action === 'retry-fast' || action === 'retry-demo') && !state.isStreaming) {
          if (action === 'retry-fast') {
            state.settings.provider = 'pollinations';
            state.settings.model = 'openai-fast';
            state.settings.customModel = '';
            Storage.saveSettings(state.settings);
            renderModelOptionsList();
            renderWelcomeModelChips();
            syncHeaderAndSidebarControls();
          } else if (action === 'retry-demo') {
            state.settings.provider = 'demo';
            Storage.saveSettings(state.settings);
            syncHeaderAndSidebarControls();
          }
          conv.messages = conv.messages.slice(0, msgIdx);
          Storage.saveConversations(state.conversations);
          generateAssistantReply(conv);
        }
      }
    });

    // Artifact preview controls
    els['artifact-close-btn'].addEventListener('click', closeArtifactPreview);
    els['artifact-refresh-btn'].addEventListener('click', function () {
      if (state.activeArtifactHtml) {
        els['artifact-iframe'].srcdoc = '';
        requestAnimationFrame(function () {
          els['artifact-iframe'].srcdoc = state.activeArtifactHtml;
        });
      }
    });
    els['artifact-newtab-btn'].addEventListener('click', function () {
      if (!state.activeArtifactHtml) return;
      const blob = new Blob([state.activeArtifactHtml], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener');
    });

    // Scroll lock & Jump to bottom
    els['chat-viewport'].addEventListener('scroll', function () {
      const vp = els['chat-viewport'];
      const dist = vp.scrollHeight - vp.scrollTop - vp.clientHeight;
      state.userScrolledUp = dist > 95;
      const hasMessages = Boolean(getActiveConversation() && getActiveConversation().messages.length);
      els['scroll-bottom-btn'].classList.toggle('hidden', !hasMessages || !state.userScrolledUp);
    });

    els['scroll-bottom-btn'].addEventListener('click', function () {
      state.userScrolledUp = false;
      els['chat-viewport'].scrollTo({ top: els['chat-viewport'].scrollHeight, behavior: 'smooth' });
      els['scroll-bottom-btn'].classList.add('hidden');
    });

    // Composer events
    els['composer-input'].addEventListener('input', function () {
      autoResizeComposer();
      updateSendButtonState();
    });

    els['composer-input'].addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && state.settings.sendOnEnter) {
        e.preventDefault();
        handleSendMessage();
      }
    });

    els['composer-input'].addEventListener('paste', function (e) {
      const items = e.clipboardData && e.clipboardData.items;
      if (!items) return;
      const pastedFiles = [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].kind === 'file') {
          const f = items[i].getAsFile();
          if (f) pastedFiles.push(f);
        }
      }
      if (pastedFiles.length) {
        processFiles(pastedFiles);
      }
    });

    els['send-btn'].addEventListener('click', function () { handleSendMessage(); });
    els['stop-btn'].addEventListener('click', stopStreaming);
    els['cancel-edit-btn'].addEventListener('click', exitEditMode);

    els['attach-btn'].addEventListener('click', function () { els['file-input'].click(); });
    els['file-input'].addEventListener('change', function (e) {
      processFiles(e.target.files);
      e.target.value = '';
    });

    els['attachment-tray'].addEventListener('click', function (e) {
      const rem = e.target.closest('[data-remove-att]');
      if (!rem) return;
      const id = rem.getAttribute('data-remove-att');
      state.stagedAttachments = state.stagedAttachments.filter(function (a) { return a.id !== id; });
      renderAttachmentTray();
      updateSendButtonState();
    });

    els['voice-btn'].addEventListener('click', function () {
      if (!state.recognition) return;
      if (state.isRecording) state.recognition.stop();
      else state.recognition.start();
    });

    // Drag & Drop files
    let dragDepth = 0;
    window.addEventListener('dragenter', function (e) {
      if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files')) {
        dragDepth++;
        els['drop-overlay'].classList.remove('hidden');
      }
    });
    window.addEventListener('dragleave', function () {
      dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0) els['drop-overlay'].classList.add('hidden');
    });
    window.addEventListener('dragover', function (e) { e.preventDefault(); });
    window.addEventListener('drop', function (e) {
      e.preventDefault();
      dragDepth = 0;
      els['drop-overlay'].classList.add('hidden');
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
        processFiles(e.dataTransfer.files);
      }
    });

    // Global Keyboard Shortcuts
    window.addEventListener('keydown', function (e) {
      const mod = e.metaKey || e.ctrlKey;
      const activeTag = document.activeElement && document.activeElement.tagName;
      const inInput = activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT';

      if (mod && e.key.toLowerCase() === 'm') {
        e.preventDefault();
        toggleModelSwitcher();
      } else if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        startNewChat();
      } else if (mod && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        els['app-shell'].classList.toggle('sidebar-collapsed');
      } else if (mod && e.key === ',') {
        e.preventDefault();
        openSettingsModal('connection');
      } else if (e.key === 'Escape') {
        if (state.isStreaming) {
          stopStreaming();
        } else if (!els['settings-modal'].classList.contains('hidden')) {
          els['settings-modal'].classList.add('hidden');
        } else if (!els['shortcuts-modal'].classList.contains('hidden')) {
          els['shortcuts-modal'].classList.add('hidden');
        } else {
          closeAllDropdowns();
        }
      } else if (!inInput && !mod && e.key === '/') {
        e.preventDefault();
        els['composer-input'].focus();
      } else if (!inInput && !mod && e.key === '?') {
        e.preventDefault();
        els['shortcuts-modal'].classList.toggle('hidden');
      }
    });

    ['settings-modal', 'shortcuts-modal'].forEach(function (id) {
      els[id].addEventListener('click', function (e) {
        if (e.target === els[id]) els[id].classList.add('hidden');
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(typeof window !== 'undefined' ? window : globalThis);
