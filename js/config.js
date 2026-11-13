(function (root) {
  'use strict';

  const MODELS = [
    {
      id: 'claude-haiku-5-5',
      puterId: 'claude-haiku-5-5',
      openRouterId: 'anthropic/claude-haiku-5.5',
      name: 'Claude Haiku 5.5',
      shortName: 'Haiku 5.5',
      family: 'Claude 5.5',
      releaseDate: '2026-10-07',
      badge: 'Default · Ultra-Fast',
      description: 'Anthropic’s high-velocity model with 1M context, 128K output, vision, and adaptive thinking.',
      contextWindow: 1000000,
      maxOutput: 128000,
      defaultMaxTokens: 8192,
      supportsThinking: true,
      supportsVision: true,
      pricing: {
        inputUnder100k: 0.10,
        outputUnder100k: 0.50,
        inputOver100k: 0.50,
        outputOver100k: 2.50,
        cachedInput: 0.01
      }
    },
    {
      id: 'claude-sonnet-5-5',
      puterId: 'claude-sonnet-5-5',
      openRouterId: 'anthropic/claude-sonnet-5.5',
      name: 'Claude Sonnet 5.5',
      shortName: 'Sonnet 5.5',
      family: 'Claude 5.5',
      releaseDate: '2026-09-29',
      badge: 'Balanced Reasoning',
      description: 'Balanced frontier coding and deep multi-step analysis.',
      contextWindow: 1000000,
      maxOutput: 128000,
      defaultMaxTokens: 8192,
      supportsThinking: true,
      supportsVision: true,
      pricing: {
        inputUnder100k: 3.00,
        outputUnder100k: 15.00,
        inputOver100k: 6.00,
        outputOver100k: 22.50,
        cachedInput: 0.30
      }
    },
    {
      id: 'claude-opus-5-5',
      puterId: 'claude-opus-5-5',
      openRouterId: 'anthropic/claude-opus-5.5',
      name: 'Claude Opus 5.5',
      shortName: 'Opus 5.5',
      family: 'Claude 5.5',
      releaseDate: '2026-09-22',
      badge: 'Flagship Intelligence',
      description: 'Maximum reasoning depth for complex research and architecture.',
      contextWindow: 1000000,
      maxOutput: 128000,
      defaultMaxTokens: 8192,
      supportsThinking: true,
      supportsVision: true,
      pricing: {
        inputUnder100k: 15.00,
        outputUnder100k: 75.00,
        inputOver100k: 30.00,
        outputOver100k: 112.50,
        cachedInput: 1.50
      }
    }
  ];

  const PROVIDERS = [
    {
      id: 'puter',
      name: 'Puter Cloud (Free · Zero Key)',
      shortName: 'Puter Cloud',
      requiresKey: false,
      description: 'Runs directly in the browser on GitHub Pages via Puter.js v2 — no API key or backend server required.'
    },
    {
      id: 'anthropic',
      name: 'Anthropic API (Direct Browser CORS)',
      shortName: 'Anthropic API',
      requiresKey: true,
      keyPlaceholder: 'sk-ant-api03-...',
      defaultEndpoint: 'https://api.anthropic.com/v1/messages',
      description: 'Connects directly to api.anthropic.com using your own API key with full Adaptive Thinking, Effort levels, Vision, and Prompt Caching.'
    },
    {
      id: 'openrouter',
      name: 'OpenRouter / OpenAI-Compatible',
      shortName: 'OpenRouter',
      requiresKey: true,
      keyPlaceholder: 'sk-or-v1-...',
      defaultEndpoint: 'https://openrouter.ai/api/v1/chat/completions',
      description: 'Connects to OpenRouter or any CORS-enabled OpenAI-compatible gateway (/v1/chat/completions).'
    },
    {
      id: 'demo',
      name: 'Interactive Sandbox (Offline Preview)',
      shortName: 'Demo Sandbox',
      requiresKey: false,
      description: 'Local simulated streaming engine for testing UI, code blocks, live HTML previews, and adaptive thinking offline.'
    }
  ];

  const EFFORT_LEVELS = [
    { id: 'off', label: 'Instant', detail: 'Thinking disabled · lowest latency & token cost' },
    { id: 'low', label: 'Low', detail: 'Quick sanity check before replying' },
    { id: 'medium', label: 'Medium', detail: 'Claude Haiku 5.5 default adaptive thinking' },
    { id: 'high', label: 'High', detail: 'Deeper multi-step reasoning for hard tasks' },
    { id: 'max', label: 'Max', detail: 'Extended reasoning budget for complex puzzles & code' }
  ];

  const PERSONAS = [
    {
      id: 'default',
      name: 'Balanced Assistant',
      icon: 'spark',
      prompt: 'You are Claude Haiku 5.5, a fast, thoughtful, and accurate AI assistant created by Anthropic. Communicate clearly, use clean Markdown formatting when helpful, and tailor depth to the user’s request.'
    },
    {
      id: 'architect',
      name: 'Code & UI Architect',
      icon: 'code',
      prompt: 'You are a principal software engineer powered by Claude Haiku 5.5. Write clean, modern, bug-free, accessible code. When asked for web UI components or mini-apps, provide complete self-contained ```html blocks so the user can launch them immediately in the built-in Live Preview.'
    },
    {
      id: 'concise',
      name: 'Ultra-Concise',
      icon: 'bolt',
      prompt: 'You are Claude Haiku 5.5 in high-speed concise mode. Answer directly and accurately with zero filler, preamble, or repetition. Prefer tight bullet points and minimal code snippets.'
    },
    {
      id: 'analyst',
      name: 'Systems & Data Analyst',
      icon: 'table',
      prompt: 'You are an analytical specialist powered by Claude Haiku 5.5. Break ambiguous problems into structured frameworks, Markdown tables, explicit trade-offs, quantitative estimates, and edge cases.'
    },
    {
      id: 'writer',
      name: 'Editorial Partner',
      icon: 'pen',
      prompt: 'You are a sharp editorial collaborator powered by Claude Haiku 5.5. Focus on rhythm, clarity, vivid phrasing, strong structure, and faithful preservation of the author’s voice.'
    },
    {
      id: 'custom',
      name: 'Custom Instructions',
      icon: 'sliders',
      prompt: ''
    }
  ];

  const STARTER_PROMPTS = [
    {
      category: 'Live Artifact',
      title: 'Interactive Pomodoro & Synth',
      subtitle: 'Generates a playable single-file HTML app with live preview',
      prompt: 'Create a sleek, tactile single-file HTML/CSS/JS Pomodoro focus timer with Web Audio ambient rain/chime synthesis, task tracking, and smooth circular SVG progress so I can open it in Live Preview.'
    },
    {
      category: 'Engineering',
      title: 'Resilient Webhook Pipeline',
      subtitle: 'TypeScript retry queue with jitter & circuit breaker',
      prompt: 'Design a clean, production-grade TypeScript webhook delivery engine featuring exponential backoff with full jitter, idempotency keys, concurrency limits, and dead-letter queue routing.'
    },
    {
      category: 'Adaptive Thinking',
      title: 'Logic & Probability Puzzle',
      subtitle: 'Watch Haiku 5.5 reason step-by-step before answering',
      prompt: 'You have 12 identical-looking coins, one of which is counterfeit and Either heavier OR lighter than the rest. Using a balance scale at most 3 times, give a complete decision tree to find the coin and determine whether it is heavier or lighter.'
    },
    {
      category: 'Comparison',
      title: 'Realtime Web Protocols',
      subtitle: 'Structured trade-off matrix for modern web apps',
      prompt: 'Compare Server-Sent Events (SSE), WebSockets, and WebTransport in 2026. Include a detailed Markdown table covering latency, HTTP/3 multiplexing, corporate firewalls, reconnection, and ideal architectures.'
    }
  ];

  const DEFAULT_SETTINGS = {
    provider: 'puter',
    model: 'claude-haiku-5-5',
    customModel: '',
    effort: 'medium',
    temperature: 0.7,
    maxTokens: 8192,
    promptCaching: true,
    personaId: 'default',
    customSystemPrompt: '',
    theme: 'dark',
    ephemeralKeys: false,
    streamSmooth: true,
    sendOnEnter: true,
    anthropicEndpoint: 'https://api.anthropic.com/v1/messages',
    openRouterEndpoint: 'https://openrouter.ai/api/v1/chat/completions'
  };

  function getModelById(modelId) {
    return MODELS.find(function (m) { return m.id === modelId; }) || MODELS[0];
  }

  function getProviderById(providerId) {
    return PROVIDERS.find(function (p) { return p.id === providerId; }) || PROVIDERS[0];
  }

  function estimateTokens(text) {
    if (!text) return 0;
    // Haiku 5.5 tokenizer averages ~3.3 chars/token on mixed English & code
    return Math.max(1, Math.ceil(String(text).length / 3.3));
  }

  function estimateConversationCost(inputTokens, outputTokens, modelId) {
    const model = getModelById(modelId);
    const p = model.pricing;
    const over100k = inputTokens > 100000;
    const inRate = over100k ? p.inputOver100k : p.inputUnder100k;
    const outRate = over100k ? p.outputOver100k : p.outputUnder100k;
    return (inputTokens / 1000000) * inRate + (outputTokens / 1000000) * outRate;
  }

  const Config = {
    APP_NAME: 'Haiku 5.5',
    APP_VERSION: '2.0.0',
    MODELS: MODELS,
    PROVIDERS: PROVIDERS,
    EFFORT_LEVELS: EFFORT_LEVELS,
    PERSONAS: PERSONAS,
    STARTER_PROMPTS: STARTER_PROMPTS,
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    getModelById: getModelById,
    getProviderById: getProviderById,
    estimateTokens: estimateTokens,
    estimateConversationCost: estimateConversationCost
  };

  root.HaikuChat = root.HaikuChat || {};
  root.HaikuChat.Config = Config;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Config;
  }
})(typeof window !== 'undefined' ? window : globalThis);
