(function (root) {
  'use strict';

  const Config = (root.HaikuChat && root.HaikuChat.Config) ||
    (typeof require === 'function' ? require('./config.js') : null);

  const KEYS = {
    CONVERSATIONS: 'haiku55_conversations_v1',
    ACTIVE_CHAT_ID: 'haiku55_active_chat_v1',
    SETTINGS: 'haiku55_settings_v1',
    API_KEYS: 'haiku55_api_keys_v1'
  };

  const memoryFallback = new Map();

  function safeGetStorage(type) {
    try {
      const store = type === 'session' ? root.sessionStorage : root.localStorage;
      if (!store) return null;
      const probe = '__haiku_probe__';
      store.setItem(probe, '1');
      store.removeItem(probe);
      return store;
    } catch (_) {
      return null;
    }
  }

  function readRaw(key, preferSession) {
    const store = safeGetStorage(preferSession ? 'session' : 'local');
    if (store) {
      try {
        return store.getItem(key);
      } catch (_) {
        return memoryFallback.get(key) || null;
      }
    }
    return memoryFallback.get(key) || null;
  }

  function writeRaw(key, value, preferSession) {
    const store = safeGetStorage(preferSession ? 'session' : 'local');
    if (store) {
      try {
        store.setItem(key, value);
        return true;
      } catch (_) {
        memoryFallback.set(key, value);
        return false;
      }
    }
    memoryFallback.set(key, value);
    return false;
  }

  function removeRaw(key, preferSession) {
    const store = safeGetStorage(preferSession ? 'session' : 'local');
    if (store) {
      try {
        store.removeItem(key);
      } catch (_) {}
    }
    memoryFallback.delete(key);
  }

  function uid(prefix) {
    const rand = Math.random().toString(36).slice(2, 9);
    return (prefix || 'id') + '_' + Date.now().toString(36) + '_' + rand;
  }

  function loadSettings() {
    const defaults = Config ? Object.assign({}, Config.DEFAULT_SETTINGS) : {};
    const raw = readRaw(KEYS.SETTINGS, false);
    if (!raw) return defaults;
    try {
      const parsed = JSON.parse(raw);
      return Object.assign({}, defaults, parsed || {});
    } catch (_) {
      return defaults;
    }
  }

  function saveSettings(settings) {
    const clean = Object.assign({}, Config ? Config.DEFAULT_SETTINGS : {}, settings || {});
    writeRaw(KEYS.SETTINGS, JSON.stringify(clean), false);
    return clean;
  }

  function loadApiKeys(ephemeral) {
    const rawSession = readRaw(KEYS.API_KEYS, true);
    const rawLocal = readRaw(KEYS.API_KEYS, false);
    const raw = ephemeral ? (rawSession || rawLocal) : (rawLocal || rawSession);
    if (!raw) return { anthropic: '', openrouter: '' };
    try {
      const parsed = JSON.parse(raw);
      return {
        anthropic: typeof parsed.anthropic === 'string' ? parsed.anthropic : '',
        openrouter: typeof parsed.openrouter === 'string' ? parsed.openrouter : ''
      };
    } catch (_) {
      return { anthropic: '', openrouter: '' };
    }
  }

  function saveApiKeys(keys, ephemeral) {
    const payload = JSON.stringify({
      anthropic: (keys && keys.anthropic ? String(keys.anthropic).trim() : ''),
      openrouter: (keys && keys.openrouter ? String(keys.openrouter).trim() : '')
    });
    if (ephemeral) {
      removeRaw(KEYS.API_KEYS, false);
      writeRaw(KEYS.API_KEYS, payload, true);
    } else {
      removeRaw(KEYS.API_KEYS, true);
      writeRaw(KEYS.API_KEYS, payload, false);
    }
  }

  function createEmptyConversation(overrides) {
    const now = Date.now();
    return Object.assign(
      {
        id: uid('chat'),
        title: 'New conversation',
        pinned: false,
        createdAt: now,
        updatedAt: now,
        model: 'claude-haiku-5-5',
        messages: []
      },
      overrides || {}
    );
  }

  function loadConversations() {
    const raw = readRaw(KEYS.CONVERSATIONS, false);
    if (!raw) return [];
    try {
      const list = JSON.parse(raw);
      if (!Array.isArray(list)) return [];
      return list.filter(function (c) {
        return c && typeof c.id === 'string' && Array.isArray(c.messages);
      });
    } catch (_) {
      return [];
    }
  }

  function saveConversations(conversations) {
    if (!Array.isArray(conversations)) return false;
    // If quota is tight (e.g. many large image attachments), gracefully trim older attachment dataUrls if needed
    const serialized = JSON.stringify(conversations);
    const ok = writeRaw(KEYS.CONVERSATIONS, serialized, false);
    if (!ok && serialized.length > 3500000) {
      const slimmed = conversations.map(function (c, idx) {
        if (idx < 3) return c;
        return Object.assign({}, c, {
          messages: c.messages.map(function (m) {
            if (!m.attachments || !m.attachments.length) return m;
            return Object.assign({}, m, {
              attachments: m.attachments.map(function (att) {
                if (att.kind === 'image' && att.dataUrl && att.dataUrl.length > 60000) {
                  return Object.assign({}, att, { dataUrl: '', strippedForQuota: true });
                }
                return att;
              })
            });
          })
        });
      });
      return writeRaw(KEYS.CONVERSATIONS, JSON.stringify(slimmed), false);
    }
    return ok;
  }

  function loadActiveChatId() {
    return readRaw(KEYS.ACTIVE_CHAT_ID, false) || '';
  }

  function saveActiveChatId(id) {
    if (!id) {
      removeRaw(KEYS.ACTIVE_CHAT_ID, false);
    } else {
      writeRaw(KEYS.ACTIVE_CHAT_ID, String(id), false);
    }
  }

  function deriveTitleFromText(text) {
    if (!text) return 'New conversation';
    const cleaned = String(text)
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/[#>*_`~\[\]()]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!cleaned) return 'Image / File Analysis';
    if (cleaned.length <= 46) return cleaned;
    return cleaned.slice(0, 45).replace(/\s+\S*$/, '') + '…';
  }

  function conversationToMarkdown(conversation) {
    if (!conversation) return '';
    const lines = [
      '# ' + (conversation.title || 'Conversation'),
      '',
      '- **Model:** `' + (conversation.model || 'claude-haiku-5-5') + '`',
      '- **Exported:** ' + new Date().toISOString(),
      '',
      '---',
      ''
    ];
    (conversation.messages || []).forEach(function (msg) {
      const speaker = msg.role === 'user' ? '## You' : '## Claude Haiku 5.5';
      lines.push(speaker);
      lines.push('');
      if (msg.thinking && msg.thinking.trim()) {
        lines.push('<details><summary>Thought process</summary>');
        lines.push('');
        lines.push(msg.thinking.trim());
        lines.push('');
        lines.push('</details>');
        lines.push('');
      }
      if (Array.isArray(msg.attachments) && msg.attachments.length) {
        const names = msg.attachments.map(function (a) { return '`' + (a.name || 'attachment') + '`'; }).join(', ');
        lines.push('_Attachments: ' + names + '_');
        lines.push('');
      }
      lines.push(msg.content || '');
      lines.push('');
      lines.push('---');
      lines.push('');
    });
    return lines.join('\n');
  }

  function exportWorkspacePayload(conversations, settings) {
    // Deliberately excludes API keys so backups are safe to share or commit
    const safeSettings = Object.assign({}, settings || {});
    return JSON.stringify(
      {
        app: 'open-source-chatbot-fixed',
        model: 'claude-haiku-5-5',
        version: 1,
        exportedAt: new Date().toISOString(),
        settings: safeSettings,
        conversations: Array.isArray(conversations) ? conversations : []
      },
      null,
      2
    );
  }

  function parseImportedWorkspace(jsonText) {
    const parsed = JSON.parse(jsonText);
    if (Array.isArray(parsed)) {
      return { conversations: sanitizeConversationArray(parsed), settings: null };
    }
    if (parsed && Array.isArray(parsed.conversations)) {
      return {
        conversations: sanitizeConversationArray(parsed.conversations),
        settings: parsed.settings && typeof parsed.settings === 'object' ? parsed.settings : null
      };
    }
    if (parsed && parsed.id && Array.isArray(parsed.messages)) {
      return {
        conversations: sanitizeConversationArray([parsed]),
        settings: null
      };
    }
    throw new Error('Unrecognized backup format. Expected a conversation or workspace JSON export.');
  }

  function sanitizeConversationArray(arr) {
    return arr
      .filter(function (item) {
        return item && typeof item === 'object' && Array.isArray(item.messages);
      })
      .map(function (item) {
        return {
          id: typeof item.id === 'string' && item.id ? item.id : uid('chat'),
          title: typeof item.title === 'string' && item.title ? item.title.slice(0, 120) : 'Imported chat',
          pinned: Boolean(item.pinned),
          createdAt: Number(item.createdAt) || Date.now(),
          updatedAt: Number(item.updatedAt) || Date.now(),
          model: typeof item.model === 'string' && item.model ? item.model : 'claude-haiku-5-5',
          messages: item.messages
            .filter(function (m) {
              return m && (m.role === 'user' || m.role === 'assistant');
            })
            .map(function (m) {
              return {
                id: typeof m.id === 'string' && m.id ? m.id : uid('msg'),
                role: m.role,
                content: typeof m.content === 'string' ? m.content : '',
                thinking: typeof m.thinking === 'string' ? m.thinking : '',
                thinkingMs: Number(m.thinkingMs) || 0,
                attachments: Array.isArray(m.attachments) ? m.attachments : [],
                createdAt: Number(m.createdAt) || Date.now(),
                model: typeof m.model === 'string' ? m.model : 'claude-haiku-5-5',
                provider: typeof m.provider === 'string' ? m.provider : ''
              };
            })
        };
      });
  }

  const Storage = {
    uid: uid,
    loadSettings: loadSettings,
    saveSettings: saveSettings,
    loadApiKeys: loadApiKeys,
    saveApiKeys: saveApiKeys,
    createEmptyConversation: createEmptyConversation,
    loadConversations: loadConversations,
    saveConversations: saveConversations,
    loadActiveChatId: loadActiveChatId,
    saveActiveChatId: saveActiveChatId,
    deriveTitleFromText: deriveTitleFromText,
    conversationToMarkdown: conversationToMarkdown,
    exportWorkspacePayload: exportWorkspacePayload,
    parseImportedWorkspace: parseImportedWorkspace
  };

  root.HaikuChat = root.HaikuChat || {};
  root.HaikuChat.Storage = Storage;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Storage;
  }
})(typeof window !== 'undefined' ? window : globalThis);
