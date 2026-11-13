(function (root) {
  'use strict';

  /**
   * Curated Pollinations.ai model catalog available immediately on load,
   * dynamically enriched at runtime from Pollinations' public /models endpoints.
   */
  const BUILTIN_MODELS = [
    {
      id: 'openai-fast',
      canonicalId: 'openai/gpt-5-nano',
      name: 'GPT-5 Nano (Fast)',
      shortName: 'GPT-5 Nano',
      providerLabel: 'OpenAI',
      badge: 'Keyless · Fastest',
      category: 'free',
      keyless: true,
      supportsVision: true,
      supportsReasoning: true,
      isCoding: false,
      contextWindow: 400000,
      description: 'Default ultra-fast keyless model on Pollinations.ai — instant responses with zero API key.'
    },
    {
      id: 'openai',
      canonicalId: 'openai/gpt-5.4-nano',
      name: 'GPT-5.4 Nano',
      shortName: 'GPT-5.4 Nano',
      providerLabel: 'OpenAI',
      badge: 'Keyless · Balanced',
      category: 'free',
      keyless: true,
      supportsVision: true,
      supportsReasoning: true,
      isCoding: true,
      contextWindow: 400000,
      description: 'Balanced everyday chat, coding, and multimodal image understanding without an API key.'
    },
    {
      id: 'gpt-oss',
      canonicalId: 'openai/gpt-oss-20b',
      name: 'GPT-OSS 20B',
      shortName: 'GPT-OSS 20B',
      providerLabel: 'OpenAI OSS',
      badge: 'Keyless · Open Weights',
      category: 'reasoning',
      keyless: true,
      supportsVision: false,
      supportsReasoning: true,
      isCoding: true,
      contextWindow: 128000,
      description: 'Open-weights reasoning model hosted on Pollinations for step-by-step logic and code.'
    },
    {
      id: 'deepseek',
      canonicalId: 'deepseek/deepseek-v4-flash',
      name: 'DeepSeek V4 Flash',
      shortName: 'DeepSeek V4',
      providerLabel: 'DeepSeek',
      badge: 'Reasoning & Math',
      category: 'reasoning',
      keyless: true,
      supportsVision: false,
      supportsReasoning: true,
      isCoding: true,
      contextWindow: 128000,
      description: 'Strong analytical reasoning, algorithms, and structured technical explanations.'
    },
    {
      id: 'qwen-coder',
      canonicalId: 'qwen/qwen3-coder-30b-a3b-instruct',
      name: 'Qwen3 Coder 30B',
      shortName: 'Qwen3 Coder',
      providerLabel: 'Qwen',
      badge: 'Code Specialist',
      category: 'coding',
      keyless: true,
      supportsVision: false,
      supportsReasoning: false,
      isCoding: true,
      contextWindow: 128000,
      description: 'Tuned for clean full-stack code generation, debugging, refactoring, and HTML previews.'
    },
    {
      id: 'mistral',
      canonicalId: 'mistralai/mistral-large-3',
      name: 'Mistral Large 3',
      shortName: 'Mistral Large',
      providerLabel: 'Mistral',
      badge: 'Keyless · Writing',
      category: 'free',
      keyless: true,
      supportsVision: false,
      supportsReasoning: false,
      isCoding: true,
      contextWindow: 128000,
      description: 'Crisp multilingual prose, summarization, creative writing, and general assistance.'
    },
    {
      id: 'llama',
      canonicalId: 'meta/llama-3.3-70b-instruct',
      name: 'Llama 3.3 70B',
      shortName: 'Llama 3.3 70B',
      providerLabel: 'Meta',
      badge: 'Keyless · Open Source',
      category: 'free',
      keyless: true,
      supportsVision: false,
      supportsReasoning: false,
      isCoding: true,
      contextWindow: 128000,
      description: 'Reliable 70B open-weights instruction model for general chat and brainstorming.'
    },
    {
      id: 'kimi-k3',
      canonicalId: 'moonshotai/kimi-k3',
      name: 'Kimi K3',
      shortName: 'Kimi K3',
      providerLabel: 'Moonshot',
      badge: 'Long Context',
      category: 'reasoning',
      keyless: true,
      supportsVision: false,
      supportsReasoning: true,
      isCoding: true,
      contextWindow: 256000,
      description: 'Long-document synthesis, deep research breakdowns, and clean code architecture.'
    },
    {
      id: 'glm-5.3',
      canonicalId: 'z-ai/glm-5.3',
      name: 'GLM-5.3',
      shortName: 'GLM-5.3',
      providerLabel: 'Z.ai',
      badge: 'Fast Bilingual',
      category: 'free',
      keyless: true,
      supportsVision: false,
      supportsReasoning: true,
      isCoding: true,
      contextWindow: 128000,
      description: 'High-efficiency reasoning and coding model available on Pollinations.'
    },
    {
      id: 'grok-4.3',
      canonicalId: 'x-ai/grok-4.3',
      name: 'Grok 4.3',
      shortName: 'Grok 4.3',
      providerLabel: 'xAI',
      badge: 'Reasoning',
      category: 'reasoning',
      keyless: true,
      supportsVision: false,
      supportsReasoning: true,
      isCoding: true,
      contextWindow: 128000,
      description: 'Direct, incisive reasoning and technical Q&A.'
    },
    {
      id: 'anthropic/claude-haiku-5.5',
      canonicalId: 'anthropic/claude-haiku-5.5',
      name: 'Claude Haiku 5.5',
      shortName: 'Haiku 5.5',
      providerLabel: 'Anthropic',
      badge: 'Pollen / Token',
      category: 'pollen',
      keyless: false,
      supportsVision: true,
      supportsReasoning: true,
      isCoding: true,
      contextWindow: 1000000,
      description: 'Anthropic’s ultra-fast 1M-context model (uses Pollinations token or auto-falls back when keyless).'
    },
    {
      id: 'gemini',
      canonicalId: 'google/gemini-3.7-flash',
      name: 'Gemini 3.7 Flash',
      shortName: 'Gemini Flash',
      providerLabel: 'Google',
      badge: 'Multimodal',
      category: 'pollen',
      keyless: false,
      supportsVision: true,
      supportsReasoning: true,
      isCoding: true,
      contextWindow: 1000000,
      description: 'High-speed multimodal understanding and long-context synthesis via Pollinations.'
    }
  ];

  let runtimeModels = BUILTIN_MODELS.slice();

  function getModels() {
    return runtimeModels;
  }

  function mergeDiscoveredModels(rawEntries) {
    if (!Array.isArray(rawEntries) || !rawEntries.length) return runtimeModels;

    const byKey = new Map();
    runtimeModels.forEach(function (m) {
      byKey.set(m.id.toLowerCase(), m);
      if (m.canonicalId) byKey.set(m.canonicalId.toLowerCase(), m);
    });

    rawEntries.forEach(function (entry) {
      if (!entry || typeof entry !== 'object') return;
      const rawId = String(entry.name || entry.id || '').trim();
      if (!rawId) return;

      // Skip pure audio/image/embedding-only models when building chat switcher
      const outMods = entry.output_modalities || entry.outputModalities;
      if (Array.isArray(outMods) && outMods.length && !outMods.includes('text')) {
        return;
      }
      if (entry.audio === true && !rawId.includes('gpt') && !outMods) {
        return;
      }

      const key = rawId.toLowerCase();
      const paidOnly = Boolean(entry.paid_only || entry.paidOnly);
      const inMods = entry.input_modalities || entry.inputModalities || [];
      const hasVision = Boolean(entry.vision || (Array.isArray(inMods) && inMods.includes('image')));
      const hasReasoning = Boolean(entry.reasoning);
      const isCode = /coder|codex|code/i.test(rawId) || /coder|code/i.test(entry.description || '');

      if (byKey.has(key)) {
        const existing = byKey.get(key);
        if (typeof entry.paid_only === 'boolean' || typeof entry.paidOnly === 'boolean') {
          existing.keyless = !paidOnly;
        }
        if (entry.description && (!existing.description || existing.isDiscovered)) {
          existing.description = String(entry.description);
        }
        return;
      }

      const providerGuess = rawId.includes('/') ? rawId.split('/')[0] : (entry.provider || 'Pollinations');
      const prettyProvider = providerGuess.charAt(0).toUpperCase() + providerGuess.slice(1);
      const title = String(entry.title || entry.description || rawId).split(' — ')[0].slice(0, 48);

      const added = {
        id: rawId,
        canonicalId: rawId,
        name: entry.title ? String(entry.title) : rawId,
        shortName: title.length <= 22 ? title : rawId.split('/').pop(),
        providerLabel: prettyProvider,
        badge: paidOnly ? 'Pollen' : 'Live · Free',
        category: paidOnly ? 'pollen' : ( isCode ? 'coding' : (hasReasoning ? 'reasoning' : 'free') ),
        keyless: !paidOnly,
        supportsVision: hasVision,
        supportsReasoning: hasReasoning,
        isCoding: isCode,
        contextWindow: Number(entry.context_length || entry.contextLength) || 128000,
        description: String(entry.description || ('Live Pollinations text model (' + rawId + ')')),
        isDiscovered: true
      };

      runtimeModels.push(added);
      byKey.set(key, added);
    });

    return runtimeModels;
  }

  function getModelById(modelId) {
    if (!modelId) return runtimeModels[0];
    const lower = String(modelId).toLowerCase();
    const found = runtimeModels.find(function (m) {
      return m.id.toLowerCase() === lower || (m.canonicalId && m.canonicalId.toLowerCase() === lower);
    });
    if (found) return found;

    // Support arbitrary custom Pollinations model IDs seamlessly
    const short = String(modelId).split('/').pop() || modelId;
    return {
      id: modelId,
      canonicalId: modelId,
      name: modelId,
      shortName: short,
      providerLabel: 'Custom',
      badge: 'Custom ID',
      category: 'custom',
      keyless: true,
      supportsVision: true,
      supportsReasoning: true,
      isCoding: true,
      contextWindow: 128000,
      description: 'Custom Pollinations model identifier.'
    };
  }

  const PROVIDERS = [
    {
      id: 'pollinations',
      name: 'Pollinations.ai (No API Key Required)',
      shortName: 'Pollinations.ai',
      requiresKey: false,
      defaultEndpoint: 'https://text.pollinations.ai/openai',
      description: 'Default zero-signup, zero-key browser AI powered by pollinations.ai with instant multi-model switching.'
    },
    {
      id: 'openrouter',
      name: 'Custom OpenAI / OpenRouter Endpoint',
      shortName: 'Custom Gateway',
      requiresKey: true,
      keyPlaceholder: 'sk-...',
      defaultEndpoint: 'https://openrouter.ai/api/v1/chat/completions',
      description: 'Optional: point to OpenRouter, local Ollama, or any OpenAI-compatible /v1/chat/completions server.'
    },
    {
      id: 'demo',
      name: 'Offline Sandbox Preview',
      shortName: 'Offline Sandbox',
      requiresKey: false,
      description: 'Simulated local streaming engine for testing UI, code highlighting, and live HTML previews offline.'
    }
  ];

  const PERSONAS = [
    {
      id: 'default',
      name: 'Balanced Assistant',
      prompt: 'You are a fast, thoughtful, and accurate AI assistant. Communicate clearly, use clean Markdown formatting when helpful, and adapt depth to the user’s request.'
    },
    {
      id: 'architect',
      name: 'Code & UI Architect',
      prompt: 'You are a principal full-stack engineer. Write clean, modern, bug-free, accessible code. When asked for web UI components, games, or mini-apps, provide complete self-contained ```html blocks so the user can launch them immediately in the built-in Live Preview.'
    },
    {
      id: 'concise',
      name: 'Ultra-Concise',
      prompt: 'Answer directly and accurately with zero filler, preamble, or repetition. Prefer tight bullet points and minimal code snippets.'
    },
    {
      id: 'analyst',
      name: 'Systems & Data Analyst',
      prompt: 'Break complex problems into structured frameworks, Markdown tables, explicit trade-offs, quantitative estimates, and edge cases.'
    },
    {
      id: 'writer',
      name: 'Creative & Editorial',
      prompt: 'Collaborate on sharp, vivid writing with strong structure, natural rhythm, and clear tone.'
    },
    {
      id: 'custom',
      name: 'Custom Instructions',
      prompt: ''
    }
  ];

  const STARTER_PROMPTS = [
    {
      category: 'Live HTML Artifact',
      title: 'Interactive Pomodoro & Synth',
      subtitle: 'Generates a playable single-file app with instant Live Preview',
      prompt: 'Create a sleek, tactile single-file HTML/CSS/JS Pomodoro focus timer with Web Audio chime synthesis, task tracking, and smooth circular SVG progress so I can run it in Live Preview.'
    },
    {
      category: 'Code Engineering',
      title: 'Resilient Webhook Queue',
      subtitle: 'TypeScript retry dispatcher with exponential backoff & jitter',
      prompt: 'Design a clean, production-grade TypeScript webhook delivery engine featuring exponential backoff with full jitter, idempotency keys, concurrency limits, and dead-letter routing.'
    },
    {
      category: 'Reasoning Puzzle',
      title: '12-Coin Balance Decision Tree',
      subtitle: 'Step-by-step logic across 3 weighings',
      prompt: 'You have 12 identical-looking coins, one of which is counterfeit and either heavier OR lighter than the rest. Using a balance scale at most 3 times, give a clear decision tree to find the coin and whether it is heavier or lighter.'
    },
    {
      category: 'Architecture Matrix',
      title: 'SSE vs WebSockets vs WebTransport',
      subtitle: 'Markdown comparison table for modern web apps',
      prompt: 'Compare Server-Sent Events (SSE), WebSockets, and WebTransport. Include a detailed Markdown table covering latency, HTTP/3 multiplexing, corporate firewalls, reconnection, and ideal use cases.'
    }
  ];

  const DEFAULT_SETTINGS = {
    provider: 'pollinations',
    model: 'openai-fast',
    customModel: '',
    autoFallbackFree: true,
    privateMode: true,
    temperature: 0.7,
    maxTokens: 4096,
    personaId: 'default',
    customSystemPrompt: '',
    theme: 'dark',
    ephemeralKeys: false,
    sendOnEnter: true,
    pollinationsEndpoint: 'https://text.pollinations.ai/openai',
    openRouterEndpoint: 'https://openrouter.ai/api/v1/chat/completions'
  };

  function getProviderById(providerId) {
    return PROVIDERS.find(function (p) { return p.id === providerId; }) || PROVIDERS[0];
  }

  function estimateTokens(text) {
    if (!text) return 0;
    return Math.max(1, Math.ceil(String(text).length / 3.6));
  }

  const Config = {
    APP_NAME: 'PolliChat',
    APP_VERSION: '3.0.0',
    BUILTIN_MODELS: BUILTIN_MODELS,
    getModels: getModels,
    mergeDiscoveredModels: mergeDiscoveredModels,
    getModelById: getModelById,
    PROVIDERS: PROVIDERS,
    PERSONAS: PERSONAS,
    STARTER_PROMPTS: STARTER_PROMPTS,
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    getProviderById: getProviderById,
    estimateTokens: estimateTokens
  };

  root.HaikuChat = root.HaikuChat || {};
  root.HaikuChat.Config = Config;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Config;
  }
})(typeof window !== 'undefined' ? window : globalThis);
