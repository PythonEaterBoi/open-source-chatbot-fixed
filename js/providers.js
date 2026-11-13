(function (root) {
  'use strict';

  const Config = (root.HaikuChat && root.HaikuChat.Config) ||
    (typeof require === 'function' ? require('./config.js') : null);

  function buildMessageTextWithFiles(msg) {
    let text = String(msg.content || '');
    const fileBlocks = [];
    if (Array.isArray(msg.attachments)) {
      msg.attachments.forEach(function (att) {
        if (att.kind === 'file' && att.textContent) {
          fileBlocks.push('<attached_file name="' + att.name + '">\n' + att.textContent + '\n</attached_file>');
        }
      });
    }
    if (fileBlocks.length) {
      text = fileBlocks.join('\n\n') + (text ? '\n\n' + text : '');
    }
    return text;
  }

  function buildOpenAiMessages(history, systemPrompt, allowVision) {
    const messages = [];
    if (systemPrompt && systemPrompt.trim()) {
      messages.push({ role: 'system', content: systemPrompt.trim() });
    }

    (history || []).forEach(function (msg) {
      if (msg.role !== 'user' && msg.role !== 'assistant') return;
      const textBody = buildMessageTextWithFiles(msg).trim();
      const images = allowVision
        ? (msg.attachments || []).filter(function (a) { return a.kind === 'image' && a.dataUrl; })
        : [];

      if (msg.role === 'user' && images.length > 0) {
        const parts = images.map(function (img) {
          return { type: 'image_url', image_url: { url: img.dataUrl } };
        });
        parts.push({ type: 'text', text: textBody || 'Describe and analyze this image.' });
        messages.push({ role: 'user', content: parts });
      } else if (textBody) {
        messages.push({ role: msg.role, content: textBody });
      }
    });

    return messages;
  }

  /**
   * Routes inline <think>...</think> blocks emitted by reasoning models
   * (such as DeepSeek, Qwen, GLM, GPT-OSS) into the collapsible reasoning panel.
   */
  function createThinkTagRouter(onThinking, onToken) {
    let inThink = false;
    let carry = '';
    let startedContent = false;

    function processChunk(rawChunk) {
      if (!rawChunk) return;
      carry += rawChunk;

      while (carry.length > 0) {
        if (!inThink) {
          // Only look for opening <think> near the beginning before normal text starts, or anywhere
          const openIdx = carry.indexOf('<think>');
          if (openIdx !== -1) {
            const before = carry.slice(0, openIdx);
            if (before) {
              if (before.trim()) startedContent = true;
              onToken(before);
            }
            carry = carry.slice(openIdx + 7);
            inThink = true;
            continue;
          }
          // Hold back possible partial "<think" prefix at tail
          const partialMatch = carry.match(/<(?:t(?:h(?:i(?:n(?:k)?)?)?)?)?$/);
          if (partialMatch && !startedContent && carry.length < 16) {
            break;
          }
          if (partialMatch && partialMatch.index > 0) {
            const safe = carry.slice(0, partialMatch.index);
            if (safe.trim()) startedContent = true;
            onToken(safe);
            carry = carry.slice(partialMatch.index);
            break;
          }
          if (carry.trim()) startedContent = true;
          onToken(carry);
          carry = '';
        } else {
          const closeIdx = carry.indexOf('</think>');
          if (closeIdx !== -1) {
            const thought = carry.slice(0, closeIdx);
            if (thought) onThinking(thought);
            carry = carry.slice(closeIdx + 8).replace(/^\s*\n/, '');
            inThink = false;
            continue;
          }
          const partialClose = carry.match(/<(?:\/(?:t(?:h(?:i(?:n(?:k)?)?)?)?)?)?$/);
          if (partialClose && partialClose.index > 0) {
            onThinking(carry.slice(0, partialClose.index));
            carry = carry.slice(partialClose.index);
            break;
          } else if (partialClose && partialClose.index === 0) {
            break;
          }
          onThinking(carry);
          carry = '';
        }
      }
    }

    function flush() {
      if (!carry) return;
      if (inThink) onThinking(carry);
      else onToken(carry);
      carry = '';
    }

    return { push: processChunk, flush: flush };
  }

  function parseSseLines(buffer, onEvent) {
    const normalized = buffer.replace(/\r\n/g, '\n');
    const blocks = normalized.split('\n\n');
    const remainder = blocks.pop() || '';

    blocks.forEach(function (block) {
      if (!block.trim()) return;
      let eventType = 'message';
      const dataLines = [];
      block.split('\n').forEach(function (line) {
        if (line.startsWith('event:')) {
          eventType = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          dataLines.push(line.slice(5).trimStart());
        }
      });
      if (dataLines.length) {
        onEvent(eventType, dataLines.join('\n'));
      }
    });

    return remainder;
  }

  async function consumeFlexibleResponse(res, opts) {
    const contentType = String((res.headers && res.headers.get('content-type')) || '').toLowerCase();
    const router = createThinkTagRouter(opts.onThinking, opts.onToken);
    const usage = { inputTokens: 0, outputTokens: 0 };

    if (contentType.includes('text/event-stream')) {
      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const step = await reader.read();
        if (step.done) break;
        buffer += decoder.decode(step.value, { stream: true });
        buffer = parseSseLines(buffer, function (_, dataStr) {
          if (!dataStr || dataStr === '[DONE]') return;
          let payload;
          try {
            payload = JSON.parse(dataStr);
          } catch (_) {
            return;
          }
          if (payload.error) {
            throw new Error(payload.error.message || JSON.stringify(payload.error));
          }
          const choice = payload.choices && payload.choices[0];
          if (choice) {
            const delta = choice.delta || choice.message || {};
            const reasoning = delta.reasoning_content || delta.reasoning;
            if (reasoning) opts.onThinking(reasoning);
            if (typeof delta.content === 'string' && delta.content) {
              router.push(delta.content);
            }
          }
          if (payload.usage) {
            usage.inputTokens = Number(payload.usage.prompt_tokens) || usage.inputTokens;
            usage.outputTokens = Number(payload.usage.completion_tokens) || usage.outputTokens;
          }
        });
      }
      // Flush any final non-empty SSE line without trailing \n\n
      if (buffer.trim()) {
        parseSseLines(buffer + '\n\n', function (_, dataStr) {
          if (!dataStr || dataStr === '[DONE]') return;
          try {
            const payload = JSON.parse(dataStr);
            const choice = payload.choices && payload.choices[0];
            const delta = choice && (choice.delta || choice.message);
            if (delta && delta.content) router.push(delta.content);
          } catch (_) {}
        });
      }
      router.flush();
      return usage;
    }

    if (contentType.includes('application/json')) {
      const data = await res.json();
      if (data && data.error) {
        throw new Error(data.error.message || String(data.error));
      }
      const msg = (data && data.choices && data.choices[0] && (data.choices[0].message || data.choices[0])) || data || {};
      const reasoning = msg.reasoning_content || msg.reasoning || '';
      const content = typeof msg.content === 'string'
        ? msg.content
        : (typeof msg.text === 'string' ? msg.text : (typeof data === 'string' ? data : ''));

      if (reasoning) opts.onThinking(reasoning);
      await emitSmoothChunks(content, router, opts.signal);
      router.flush();

      if (data && data.usage) {
        usage.inputTokens = Number(data.usage.prompt_tokens) || 0;
        usage.outputTokens = Number(data.usage.completion_tokens) || 0;
      }
      return usage;
    }

    // Plain-text body stream (e.g. POST https://text.pollinations.ai/)
    if (res.body && typeof res.body.getReader === 'function') {
      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      while (true) {
        const step = await reader.read();
        if (step.done) break;
        const textChunk = decoder.decode(step.value, { stream: true });
        if (textChunk) router.push(textChunk);
      }
      router.flush();
      return usage;
    }

    const fullText = await res.text();
    await emitSmoothChunks(fullText, router, opts.signal);
    router.flush();
    return usage;
  }

  async function emitSmoothChunks(text, router, signal) {
    if (!text) return;
    const chunks = String(text).match(/[\s\S]{1,18}/g) || [text];
    for (let i = 0; i < chunks.length; i++) {
      if (signal && signal.aborted) {
        const abortErr = new Error('Generation stopped');
        abortErr.name = 'AbortError';
        throw abortErr;
      }
      router.push(chunks[i]);
      if (chunks.length > 1 && i % 2 === 0) {
        await sleepWithAbort(8, signal);
      }
    }
  }

  async function readErrorMessage(res) {
    let detail = '';
    try {
      const text = await res.text();
      try {
        const parsed = JSON.parse(text);
        detail = (parsed && parsed.error && (parsed.error.message || parsed.error)) ||
          (parsed && parsed.message) ||
          text;
      } catch (_) {
        detail = text;
      }
    } catch (_) {
      detail = res.statusText || '';
    }
    return String(detail || ('HTTP ' + res.status)).slice(0, 280);
  }

  /**
   * Primary Pollinations.ai Engine — Works WITHOUT any API key out of the box!
   * Also supports optional Pollinations token if the user connects one for Pollen-only models.
   */
  async function streamPollinations(opts) {
    const settings = opts.settings || {};
    const optionalToken = (opts.apiKeys && opts.apiKeys.pollinations || '').trim();
    const requestedModel = (settings.customModel || '').trim() || settings.model || 'openai-fast';
    const modelMeta = Config.getModelById(requestedModel);

    const hasImages = (opts.messages || []).some(function (m) {
      return Array.isArray(m.attachments) && m.attachments.some(function (a) { return a.kind === 'image'; });
    });

    const messagesWithVision = buildOpenAiMessages(opts.messages, opts.systemPrompt, true);
    const messagesTextOnly = buildOpenAiMessages(opts.messages, opts.systemPrompt, false);

    // Path A: User provided an optional Pollinations sk_ token -> call unified gen.pollinations.ai
    if (optionalToken) {
      const genRes = await fetch('https://gen.pollinations.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + optionalToken
        },
        body: JSON.stringify({
          model: modelMeta.canonicalId || requestedModel,
          messages: messagesWithVision,
          stream: true,
          temperature: typeof settings.temperature === 'number' ? settings.temperature : 0.7,
          max_tokens: Number(settings.maxTokens) || 4096
        }),
        signal: opts.signal
      });

      if (!genRes.ok) {
        const msg = await readErrorMessage(genRes);
        throw new Error('Pollinations API (' + genRes.status + '): ' + msg);
      }

      const usage = await consumeFlexibleResponse(genRes, opts);
      return { usage: usage, model: requestedModel };
    }

    // Path B (DEFAULT — 100% KEYLESS POLLINATIONS.AI): No Authorization header sent!
    const endpoint = (settings.pollinationsEndpoint || 'https://text.pollinations.ai/openai').trim();

    async function tryKeylessOpenAi(targetModel, msgs, useStream) {
      const body = {
        model: targetModel,
        messages: msgs,
        stream: useStream,
        temperature: typeof settings.temperature === 'number' ? settings.temperature : 0.7,
        private: settings.privateMode !== false
      };
      return fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: opts.signal
      });
    }

    // 1. Try chosen model on https://text.pollinations.ai/openai (keyless)
    let res = await tryKeylessOpenAi(requestedModel, messagesWithVision, true);

    // If image blocks caused 402/400 on anonymous tier, retry text-only automatically
    if (!res.ok && hasImages && (res.status === 400 || res.status === 402 || res.status === 413)) {
      res = await tryKeylessOpenAi(requestedModel, messagesTextOnly, true);
    }

    // 2. Try Pollinations Classic root POST endpoint (https://text.pollinations.ai/) if /openai returned 400/404
    if (!res.ok && (res.status === 400 || res.status === 404)) {
      res = await fetch('https://text.pollinations.ai/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: messagesTextOnly,
          model: requestedModel,
          seed: Math.floor(Math.random() * 999999),
          private: settings.privateMode !== false
        }),
        signal: opts.signal
      });
    }

    // 3. Smart keyless fallback: if selected model requires Pollen (401/402/403/404), auto-fallback to keyless 'openai-fast'
    if (
      !res.ok &&
      settings.autoFallbackFree !== false &&
      requestedModel !== 'openai-fast' &&
      (res.status === 401 || res.status === 402 || res.status === 403 || res.status === 404)
    ) {
      const fallbackRes = await tryKeylessOpenAi('openai-fast', messagesTextOnly, true);
      if (fallbackRes.ok) {
        const fbUsage = await consumeFlexibleResponse(fallbackRes, opts);
        return {
          usage: fbUsage,
          model: 'openai-fast',
          fallbackFrom: requestedModel
        };
      }
    }

    if (!res.ok) {
      const errDetail = await readErrorMessage(res);
      if (res.status === 429) {
        throw new Error('Pollinations keyless rate limit reached (anonymous requests have a short per-IP cooldown). Wait a few seconds and click Retry.');
      }
      throw new Error('Pollinations (' + res.status + ' on "' + requestedModel + '"): ' + errDetail);
    }

    const usage = await consumeFlexibleResponse(res, opts);
    return { usage: usage, model: requestedModel };
  }

  /**
   * Fetches live model catalogs from Pollinations.ai (no API key required)
   * and merges them into Config's model switcher list.
   */
  async function fetchPollinationsModels(optionalToken) {
    const headers = {};
    if (optionalToken && optionalToken.trim()) {
      headers['Authorization'] = 'Bearer ' + optionalToken.trim();
    }

    const urls = [
      'https://text.pollinations.ai/models',
      'https://gen.pollinations.ai/text/models'
    ];

    const settled = await Promise.allSettled(
      urls.map(function (url) {
        return fetch(url, { method: 'GET', headers: headers }).then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.json();
        });
      })
    );

    const combined = [];
    settled.forEach(function (item) {
      if (item.status !== 'fulfilled' || !item.value) return;
      const val = item.value;
      if (Array.isArray(val)) {
        val.forEach(function (entry) { combined.push(entry); });
      } else if (val && Array.isArray(val.data)) {
        val.data.forEach(function (entry) { combined.push(entry); });
      }
    });

    if (combined.length > 0 && Config && typeof Config.mergeDiscoveredModels === 'function') {
      return Config.mergeDiscoveredModels(combined);
    }
    return Config ? Config.getModels() : [];
  }

  async function streamOpenRouter(opts) {
    const settings = opts.settings || {};
    const apiKey = (opts.apiKeys && opts.apiKeys.openrouter || '').trim();
    const endpoint = (settings.openRouterEndpoint || 'https://openrouter.ai/api/v1/chat/completions').trim();
    const modelId = (settings.customModel || '').trim() || settings.model || 'openai/gpt-4o-mini';

    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) {
      headers['Authorization'] = 'Bearer ' + apiKey;
    }

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({
        model: modelId,
        stream: true,
        max_tokens: Number(settings.maxTokens) || 4096,
        temperature: typeof settings.temperature === 'number' ? settings.temperature : 0.7,
        messages: buildOpenAiMessages(opts.messages, opts.systemPrompt, true)
      }),
      signal: opts.signal
    });

    if (!res.ok) {
      const detail = await readErrorMessage(res);
      throw new Error('Gateway Error (' + res.status + '): ' + detail);
    }

    const usage = await consumeFlexibleResponse(res, opts);
    return { usage: usage, model: modelId };
  }

  function buildDemoReply(messages, activeModelId) {
    const lastUser = (messages || []).slice().reverse().find(function (m) { return m.role === 'user'; });
    const prompt = lastUser ? String(lastUser.content || '') : '';
    const lower = prompt.toLowerCase();
    const attachments = (lastUser && lastUser.attachments) || [];
    const modelObj = Config.getModelById(activeModelId || 'openai-fast');

    if (attachments.length > 0) {
      const names = attachments.map(function (a) { return a.name + ' (' + a.kind + ')'; }).join(', ');
      return {
        thinking: 'Inspecting ' + attachments.length + ' attached item(s): ' + names + '.',
        answer: '### Attachment Ready (`' + modelObj.name + '` · Sandbox)\n\nReceived **' + attachments.length + '** attachment(s): `' + names + '`.\n\nSwitch the connection mode back to **Pollinations.ai (No API Key)** in the top bar for live inference!'
      };
    }

    if (/pomodoro|timer|html|preview/i.test(lower)) {
      return {
        thinking: 'Designing a self-contained single-file HTML/CSS/JS Pomodoro timer with Web Audio chime synthesis and circular SVG progress.',
        answer: 'Here is a complete single-file **Pomodoro Focus Timer** with Web Audio synthesis. Click **Run Preview** on the code card to launch it live:\n\n```html\n<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="UTF-8" />\n<style>\n  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #141210; color: #f5f1ea; font-family: system-ui, sans-serif; }\n  .card { background: #1e1b18; border: 1px solid #332d27; border-radius: 24px; padding: 32px 36px; text-align: center; width: 300px; box-shadow: 0 20px 50px rgba(0,0,0,.45); }\n  .ring-wrap { position: relative; width: 190px; height: 190px; margin: 12px auto 20px; }\n  svg { transform: rotate(-90deg); width: 190px; height: 190px; }\n  .track { fill: none; stroke: #2c2722; stroke-width: 8; }\n  .prog { fill: none; stroke: #e59a3c; stroke-width: 8; stroke-linecap: round; stroke-dasharray: 534; stroke-dashoffset: 0; transition: stroke-dashoffset .4s linear; }\n  .time { position: absolute; inset: 0; display: grid; place-items: center; font-size: 2.4rem; font-weight: 700; font-variant-numeric: tabular-nums; }\n  .btns { display: flex; gap: 10px; justify-content: center; }\n  button { background: #e59a3c; color: #141210; border: 0; border-radius: 999px; padding: 10px 20px; font-weight: 700; cursor: pointer; }\n  button.sec { background: #2c2722; color: #d6cfc5; font-weight: 600; }\n</style>\n</head>\n<body>\n  <div class="card">\n    <div style="font-size:.8rem;letter-spacing:.1em;text-transform:uppercase;color:#a39c91">PolliFocus · 25m</div>\n    <div class="ring-wrap">\n      <svg><circle class="track" cx="95" cy="95" r="85"/><circle id="bar" class="prog" cx="95" cy="95" r="85"/></svg>\n      <div id="clock" class="time">25:00</div>\n    </div>\n    <div class="btns">\n      <button id="toggle">Start</button>\n      <button id="reset" class="sec">Reset</button>\n    </div>\n  </div>\n<script>\n  let total = 25 * 60, left = total, timer = null;\n  const clock = document.getElementById("clock"), bar = document.getElementById("bar"), toggle = document.getElementById("toggle");\n  function chime() {\n    const ctx = new (window.AudioContext || window.webkitAudioContext)();\n    const osc = ctx.createOscillator(), gain = ctx.createGain();\n    osc.type = "sine"; osc.frequency.setValueAtTime(528, ctx.currentTime);\n    gain.gain.setValueAtTime(0.15, ctx.currentTime);\n    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.9);\n    osc.connect(gain); gain.connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + 0.9);\n  }\n  function render() {\n    const m = String(Math.floor(left / 60)).padStart(2, "0"), s = String(left % 60)).padStart(2, "0");\n    clock.textContent = m + ":" + s;\n    bar.style.strokeDashoffset = String(534 * (1 - left / total));\n  }\n  toggle.onclick = () => {\n    chime();\n    if (timer) { clearInterval(timer); timer = null; toggle.textContent = "Resume"; return; }\n    toggle.textContent = "Pause";\n    timer = setInterval(() => { if (--left <= 0) { clearInterval(timer); timer = null; chime(); left = total; toggle.textContent = "Start"; } render(); }, 1000);\n  };\n  document.getElementById("reset").onclick = () => { clearInterval(timer); timer = null; left = total; toggle.textContent = "Start"; render(); };\n</script>\n</body>\n</html>\n```'
      };
    }

    if (/webhook|typescript|retry|backoff/i.test(lower)) {
      return {
        thinking: 'Designing TypeScript webhook dispatcher with exponential backoff, full jitter, and idempotency keys.',
        answer: '### Resilient Webhook Dispatcher (`TypeScript`)\n\n```typescript\nexport interface WebhookJob {\n  id: string;\n  url: string;\n  payload: unknown;\n}\n\nexport async function deliverWithJitter(job: WebhookJob, maxAttempts = 5): Promise<void> {\n  for (let attempt = 0; attempt < maxAttempts; attempt++) {\n    const res = await fetch(job.url, {\n      method: "POST",\n      headers: { "Content-Type": "application/json", "Idempotency-Key": job.id },\n      body: JSON.stringify(job.payload),\n    });\n    if (res.ok) return;\n    if (res.status >= 400 && res.status < 500 && res.status !== 429) {\n      throw new Error(`Permanent 4xx rejection: ${res.status}`);\n    }\n    const cap = Math.min(30_000, 400 * Math.pow(2, attempt));\n    await new Promise((r) => setTimeout(r, Math.floor(Math.random() * cap)));\n  }\n}\n```'
      };
    }

    return {
      thinking: 'Simulating response for model "' + modelObj.name + '" in offline sandbox mode.',
      answer: '### ' + modelObj.name + ' · Offline Sandbox\n\nYou asked:\n> ' + (prompt || 'Hello!') + '\n\nSwitch back to **Pollinations.ai (No API Key)** in the top bar anytime to stream live responses from `' + modelObj.id + '`!'
    };
  }

  function sleepWithAbort(ms, signal) {
    return new Promise(function (resolve, reject) {
      if (signal && signal.aborted) {
        const err = new Error('Generation stopped');
        err.name = 'AbortError';
        reject(err);
        return;
      }
      const timer = setTimeout(resolve, ms);
      if (signal) {
        signal.addEventListener(
          'abort',
          function () {
            clearTimeout(timer);
            const err = new Error('Generation stopped');
            err.name = 'AbortError';
            reject(err);
          },
          { once: true }
        );
      }
    });
  }

  async function streamDemo(opts) {
    const modelId = (opts.settings && opts.settings.model) || 'openai-fast';
    const reply = buildDemoReply(opts.messages, modelId);

    if (reply.thinking) {
      const thinkTokens = reply.thinking.match(/\S+\s*/g) || [reply.thinking];
      for (let i = 0; i < thinkTokens.length; i++) {
        await sleepWithAbort(15, opts.signal);
        opts.onThinking(thinkTokens[i]);
      }
    }

    const chunks = reply.answer.match(/[\s\S]{1,6}/g) || [reply.answer];
    for (let j = 0; j < chunks.length; j++) {
      await sleepWithAbort(10, opts.signal);
      opts.onToken(chunks[j]);
    }

    return {
      usage: {
        inputTokens: Config.estimateTokens(JSON.stringify(opts.messages || [])),
        outputTokens: Config.estimateTokens(reply.thinking + reply.answer)
      },
      model: modelId + ' (sandbox)'
    };
  }

  async function streamChat(opts) {
    const provider = (opts.settings && opts.settings.provider) || 'pollinations';
    if (provider === 'openrouter') {
      return streamOpenRouter(opts);
    }
    if (provider === 'demo') {
      return streamDemo(opts);
    }
    return streamPollinations(opts);
  }

  const Providers = {
    streamChat: streamChat,
    fetchPollinationsModels: fetchPollinationsModels,
    createThinkTagRouter: createThinkTagRouter,
    parseSseLines: parseSseLines,
    buildOpenAiMessages: buildOpenAiMessages,
    buildDemoReply: buildDemoReply
  };

  root.HaikuChat = root.HaikuChat || {};
  root.HaikuChat.Providers = Providers;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Providers;
  }
})(typeof window !== 'undefined' ? window : globalThis);
