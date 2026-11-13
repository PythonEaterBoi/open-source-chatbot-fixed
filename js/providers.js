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

  function normalizeAnthropicMessages(history) {
    const raw = [];
    (history || []).forEach(function (msg) {
      if (msg.role !== 'user' && msg.role !== 'assistant') return;
      const blocks = [];

      if (msg.role === 'user' && Array.isArray(msg.attachments)) {
        msg.attachments.forEach(function (att) {
          if (att.kind === 'image' && att.base64 && att.mimeType) {
            blocks.push({
              type: 'image',
              source: {
                type: 'base64',
                media_type: att.mimeType,
                data: att.base64
              }
            });
          }
        });
      }

      const textBody = buildMessageTextWithFiles(msg).trim();
      if (textBody) {
        blocks.push({ type: 'text', text: textBody });
      } else if (blocks.length > 0 && msg.role === 'user') {
        blocks.push({ type: 'text', text: 'Please analyze the attached image.' });
      }

      if (!blocks.length) return;

      // Merge consecutive same-role messages to satisfy Anthropic alternating turn rule
      if (raw.length > 0 && raw[raw.length - 1].role === msg.role) {
        raw[raw.length - 1].content = raw[raw.length - 1].content.concat(blocks);
      } else {
        raw.push({ role: msg.role, content: blocks });
      }
    });

    // Ensure first message is user
    while (raw.length > 0 && raw[0].role !== 'user') {
      raw.shift();
    }

    return raw;
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

  async function streamAnthropic(opts) {
    const settings = opts.settings;
    const apiKey = (opts.apiKeys && opts.apiKeys.anthropic || '').trim();
    if (!apiKey) {
      const err = new Error('Anthropic API key is missing. Add your sk-ant-… key in Connection Settings, or switch to Puter Cloud (Zero Key).');
      err.code = 'MISSING_KEY';
      throw err;
    }

    const endpoint = (settings.anthropicEndpoint || 'https://api.anthropic.com/v1/messages').trim();
    const modelId = (settings.customModel || '').trim() || settings.model || 'claude-haiku-5-5';
    const modelMeta = Config.getModelById(modelId);
    const messages = normalizeAnthropicMessages(opts.messages);

    const effort = settings.effort || 'medium';
    const useThinking = modelMeta.supportsThinking && effort !== 'off';
    const requestedMax = Number(settings.maxTokens) || 8192;
    const maxTokens = useThinking ? Math.max(4096, requestedMax) : requestedMax;

    const body = {
      model: modelId,
      max_tokens: maxTokens,
      stream: true,
      messages: messages
    };

    if (opts.systemPrompt && opts.systemPrompt.trim()) {
      const sysBlock = { type: 'text', text: opts.systemPrompt.trim() };
      if (settings.promptCaching) {
        sysBlock.cache_control = { type: 'ephemeral' };
      }
      body.system = [sysBlock];
    }

    if (useThinking) {
      body.thinking = { type: 'adaptive' };
      if (effort !== 'max') {
        body.output_config = { effort: effort };
      } else {
        body.output_config = { effort: 'high' };
      }
    } else {
      if (modelMeta.supportsThinking) {
        body.thinking = { type: 'disabled' };
      }
      if (typeof settings.temperature === 'number') {
        body.temperature = settings.temperature;
      }
    }

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify(body),
      signal: opts.signal
    });

    if (!res.ok) {
      let detail = '';
      try {
        const errJson = await res.json();
        detail = (errJson && errJson.error && errJson.error.message) || JSON.stringify(errJson);
      } catch (_) {
        detail = await res.text();
      }
      throw new Error('Anthropic API Error (' + res.status + '): ' + (detail || res.statusText));
    }

    if (!res.body) {
      throw new Error('Streaming response body unavailable in this browser.');
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    const usage = { inputTokens: 0, outputTokens: 0 };

    while (true) {
      const step = await reader.read();
      if (step.done) break;
      buffer += decoder.decode(step.value, { stream: true });
      buffer = parseSseLines(buffer, function (eventType, dataStr) {
        if (!dataStr || dataStr === '[DONE]') return;
        let payload;
        try {
          payload = JSON.parse(dataStr);
        } catch (_) {
          return;
        }

        if (eventType === 'error' || payload.type === 'error') {
          const msg = (payload.error && payload.error.message) || 'Stream error from Anthropic API';
          throw new Error(msg);
        }

        if (payload.type === 'message_start' && payload.message && payload.message.usage) {
          usage.inputTokens = Number(payload.message.usage.input_tokens) || 0;
        } else if (payload.type === 'content_block_delta' && payload.delta) {
          if (payload.delta.type === 'thinking_delta' && payload.delta.thinking) {
            opts.onThinking(payload.delta.thinking);
          } else if (payload.delta.type === 'text_delta' && payload.delta.text) {
            opts.onToken(payload.delta.text);
          }
        } else if (payload.type === 'message_delta' && payload.usage) {
          usage.outputTokens = Number(payload.usage.output_tokens) || usage.outputTokens;
        }
      });
    }

    return { usage: usage, model: modelId };
  }

  function ensurePuterLoaded(timeoutMs) {
    if (root.puter && root.puter.ai && typeof root.puter.ai.chat === 'function') {
      return Promise.resolve(root.puter);
    }
    if (typeof document === 'undefined') {
      return Promise.reject(new Error('Puter.js requires a browser environment.'));
    }

    return new Promise(function (resolve, reject) {
      let settled = false;
      const deadline = setTimeout(function () {
        if (!settled) {
          settled = true;
          reject(new Error('Could not reach Puter Cloud (js.puter.com). Check your internet connection, add an Anthropic API key, or switch to Interactive Sandbox mode.'));
        }
      }, timeoutMs || 7000);

      function checkReady() {
        if (root.puter && root.puter.ai && typeof root.puter.ai.chat === 'function') {
          if (!settled) {
            settled = true;
            clearTimeout(deadline);
            resolve(root.puter);
          }
          return true;
        }
        return false;
      }

      let existing = document.querySelector('script[data-puter-sdk]');
      if (!existing) {
        existing = document.createElement('script');
        existing.src = 'https://js.puter.com/v2/';
        existing.async = true;
        existing.setAttribute('data-puter-sdk', 'true');
        existing.onload = function () { checkReady(); };
        existing.onerror = function () {
          if (!settled) {
            settled = true;
            clearTimeout(deadline);
            reject(new Error('Puter.js script could not load (blocked by network or ad-blocker). Switch to Anthropic API or Interactive Sandbox in Settings.'));
          }
        };
        document.head.appendChild(existing);
      }

      const poll = setInterval(function () {
        if (checkReady() || settled) {
          clearInterval(poll);
        }
      }, 120);
    });
  }

  async function streamPuter(opts) {
    const puter = await ensurePuterLoaded(7000);
    const settings = opts.settings;
    const modelObj = Config.getModelById(settings.model || 'claude-haiku-5-5');
    const modelId = (settings.customModel || '').trim() || modelObj.puterId || 'claude-haiku-5-5';

    const messages = [];
    if (opts.systemPrompt && opts.systemPrompt.trim()) {
      messages.push({ role: 'system', content: opts.systemPrompt.trim() });
    }

    (opts.messages || []).forEach(function (msg) {
      if (msg.role !== 'user' && msg.role !== 'assistant') return;
      const textBody = buildMessageTextWithFiles(msg).trim();
      const images = (msg.attachments || []).filter(function (a) {
        return a.kind === 'image' && a.dataUrl;
      });

      if (msg.role === 'user' && images.length > 0) {
        const contentArr = [];
        images.forEach(function (img) {
          contentArr.push({ type: 'image_url', image_url: { url: img.dataUrl } });
        });
        contentArr.push({ type: 'text', text: textBody || 'Analyze this image.' });
        messages.push({ role: 'user', content: contentArr });
      } else if (textBody) {
        messages.push({ role: msg.role, content: textBody });
      }
    });

    const chatOptions = {
      model: modelId,
      stream: true
    };
    if (typeof settings.temperature === 'number') {
      chatOptions.temperature = settings.temperature;
    }
    if (settings.maxTokens) {
      chatOptions.max_tokens = Number(settings.maxTokens);
    }

    const response = await puter.ai.chat(messages, chatOptions);

    if (response && typeof response[Symbol.asyncIterator] === 'function') {
      for await (const part of response) {
        if (opts.signal && opts.signal.aborted) {
          const abortErr = new Error('Generation stopped');
          abortErr.name = 'AbortError';
          throw abortErr;
        }
        if (!part) continue;
        if (typeof part === 'string') {
          opts.onToken(part);
          continue;
        }
        if (part.type === 'error') {
          throw new Error(part.message || 'Puter AI stream returned an error.');
        }
        if (part.reasoning || part.thinking) {
          opts.onThinking(part.reasoning || part.thinking);
        } else if (part.type === 'thinking' && part.text) {
          opts.onThinking(part.text);
        } else if (typeof part.text === 'string' && part.text.length > 0) {
          opts.onToken(part.text);
        }
      }
    } else if (response) {
      // Non-streaming fallback if returned by SDK
      const content =
        (response.message && Array.isArray(response.message.content) && response.message.content[0] && response.message.content[0].text) ||
        (response.message && typeof response.message.content === 'string' && response.message.content) ||
        (typeof response === 'string' ? response : '');
      if (content) opts.onToken(content);
    }

    return { usage: null, model: modelId };
  }

  async function streamOpenRouter(opts) {
    const settings = opts.settings;
    const apiKey = (opts.apiKeys && opts.apiKeys.openrouter || '').trim();
    if (!apiKey) {
      const err = new Error('OpenRouter / Gateway API key is missing. Add your key in Connection Settings, or switch to Puter Cloud.');
      err.code = 'MISSING_KEY';
      throw err;
    }

    const endpoint = (settings.openRouterEndpoint || 'https://openrouter.ai/api/v1/chat/completions').trim();
    const isOpenRouterHost = /openrouter\.ai/i.test(endpoint);
    const modelObj = Config.getModelById(settings.model || 'claude-haiku-5-5');
    const modelId = (settings.customModel || '').trim() ||
      (isOpenRouterHost ? modelObj.openRouterId : modelObj.id);

    const messages = [];
    if (opts.systemPrompt && opts.systemPrompt.trim()) {
      messages.push({ role: 'system', content: opts.systemPrompt.trim() });
    }

    (opts.messages || []).forEach(function (msg) {
      if (msg.role !== 'user' && msg.role !== 'assistant') return;
      const textBody = buildMessageTextWithFiles(msg).trim();
      const images = (msg.attachments || []).filter(function (a) {
        return a.kind === 'image' && a.dataUrl;
      });
      if (msg.role === 'user' && images.length > 0) {
        const parts = images.map(function (img) {
          return { type: 'image_url', image_url: { url: img.dataUrl } };
        });
        parts.push({ type: 'text', text: textBody || 'Analyze this image.' });
        messages.push({ role: 'user', content: parts });
      } else if (textBody) {
        messages.push({ role: msg.role, content: textBody });
      }
    });

    const body = {
      model: modelId,
      stream: true,
      max_tokens: Number(settings.maxTokens) || 8192,
      temperature: typeof settings.temperature === 'number' ? settings.temperature : 0.7,
      messages: messages
    };

    if (isOpenRouterHost && settings.effort && settings.effort !== 'off') {
      body.reasoning = {
        effort: settings.effort === 'max' ? 'high' : settings.effort
      };
    }

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + apiKey
    };

    if (isOpenRouterHost && typeof location !== 'undefined') {
      headers['HTTP-Referer'] = location.origin || 'https://github.com';
      headers['X-Title'] = 'Haiku 5.5 Open Source Chatbot';
    }

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(body),
      signal: opts.signal
    });

    if (!res.ok) {
      let detail = '';
      try {
        const errJson = await res.json();
        detail = (errJson && errJson.error && errJson.error.message) || JSON.stringify(errJson);
      } catch (_) {
        detail = await res.text();
      }
      throw new Error('Gateway API Error (' + res.status + '): ' + (detail || res.statusText));
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    const usage = { inputTokens: 0, outputTokens: 0 };

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
          throw new Error(payload.error.message || 'Stream error from gateway');
        }
        const choice = payload.choices && payload.choices[0];
        if (choice && choice.delta) {
          const reasoning = choice.delta.reasoning || choice.delta.reasoning_content;
          if (reasoning) opts.onThinking(reasoning);
          if (choice.delta.content) opts.onToken(choice.delta.content);
        }
        if (payload.usage) {
          usage.inputTokens = Number(payload.usage.prompt_tokens) || usage.inputTokens;
          usage.outputTokens = Number(payload.usage.completion_tokens) || usage.outputTokens;
        }
      });
    }

    return { usage: usage, model: modelId };
  }

  function buildDemoReply(messages, effort) {
    const lastUser = (messages || []).slice().reverse().find(function (m) { return m.role === 'user'; });
    const prompt = lastUser ? String(lastUser.content || '') : '';
    const lower = prompt.toLowerCase();
    const attachments = (lastUser && lastUser.attachments) || [];

    let thinking = '';
    let answer = '';

    if (attachments.length > 0) {
      const names = attachments.map(function (a) { return a.name + ' (' + a.kind + ')'; }).join(', ');
      thinking = 'Inspecting ' + attachments.length + ' attached item(s): ' + names + '.\nChecking structure, metadata, and user instructions to provide a concise breakdown.';
      answer = '### Attachment Inspection (Sandbox Preview)\n\nI received **' + attachments.length + '** attachment(s): `' + names + '`.\n\n' +
        (attachments[0].kind === 'file' && attachments[0].textContent
          ? 'Here is a quick summary of `' + attachments[0].name + '`:\n- **Characters:** ' + attachments[0].textContent.length.toLocaleString() + '\n- **Lines:** ' + attachments[0].textContent.split('\n').length + '\n\nSwitch the connection pill in the header to **Puter Cloud** or **Anthropic API (`claude-haiku-5-5`)** to run live multimodal inference on your attachments!'
          : 'Your image is staged and ready for multimodal vision analysis (`image/base64` block). Connect **Puter Cloud** or **Anthropic API (`claude-haiku-5-5`)** in the top bar to analyze visual details live!');
    } else if (/pomodoro|timer|html|preview/i.test(lower)) {
      thinking = 'User wants a single-file interactive Pomodoro timer with Web Audio synthesis and SVG circular progress.\nDesigning self-contained HTML/CSS/JS with zero external dependencies so the built-in "Run Preview" sandbox renders it cleanly.';
      answer = 'Here is a self-contained **Pomodoro Focus Timer** with a circular SVG ring and Web Audio chime synthesis. Click **Run Preview** on the code header to try it right inside the app:\n\n```html\n<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="UTF-8" />\n<style>\n  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #141210; color: #f5f1ea; font-family: system-ui, sans-serif; }\n  .card { background: #1e1b18; border: 1px solid #332d27; border-radius: 24px; padding: 32px 36px; text-align: center; width: 300px; box-shadow: 0 20px 50px rgba(0,0,0,.45); }\n  .ring-wrap { position: relative; width: 190px; height: 190px; margin: 12px auto 20px; }\n  svg { transform: rotate(-90deg); width: 190px; height: 190px; }\n  .track { fill: none; stroke: #2c2722; stroke-width: 8; }\n  .prog { fill: none; stroke: #d97757; stroke-width: 8; stroke-linecap: round; stroke-dasharray: 534; stroke-dashoffset: 0; transition: stroke-dashoffset .4s linear; }\n  .time { position: absolute; inset: 0; display: grid; place-items: center; font-size: 2.4rem; font-weight: 700; font-variant-numeric: tabular-nums; }\n  .btns { display: flex; gap: 10px; justify-content: center; }\n  button { background: #d97757; color: #fff; border: 0; border-radius: 999px; padding: 10px 20px; font-weight: 600; cursor: pointer; }\n  button.sec { background: #2c2722; color: #d6cfc5; }\n</style>\n</head>\n<body>\n  <div class="card">\n    <div style="font-size:.8rem;letter-spacing:.1em;text-transform:uppercase;color:#a39c91">Deep Focus · 25m</div>\n    <div class="ring-wrap">\n      <svg><circle class="track" cx="95" cy="95" r="85"/><circle id="bar" class="prog" cx="95" cy="95" r="85"/></svg>\n      <div id="clock" class="time">25:00</div>\n    </div>\n    <div class="btns">\n      <button id="toggle">Start</button>\n      <button id="reset" class="sec">Reset</button>\n    </div>\n  </div>\n<script>\n  let total = 25 * 60, left = total, timer = null;\n  const clock = document.getElementById("clock"), bar = document.getElementById("bar"), toggle = document.getElementById("toggle");\n  function chime() {\n    const ctx = new (window.AudioContext || window.webkitAudioContext)();\n    const osc = ctx.createOscillator(), gain = ctx.createGain();\n    osc.type = "sine"; osc.frequency.setValueAtTime(528, ctx.currentTime);\n    gain.gain.setValueAtTime(0.15, ctx.currentTime);\n    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.9);\n    osc.connect(gain); gain.connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + 0.9);\n  }\n  function render() {\n    const m = String(Math.floor(left / 60)).padStart(2, "0"), s = String(left % 60).padStart(2, "0");\n    clock.textContent = m + ":" + s;\n    bar.style.strokeDashoffset = String(534 * (1 - left / total));\n  }\n  toggle.onclick = () => {\n    chime();\n    if (timer) { clearInterval(timer); timer = null; toggle.textContent = "Resume"; return; }\n    toggle.textContent = "Pause";\n    timer = setInterval(() => { if (--left <= 0) { clearInterval(timer); timer = null; chime(); left = total; toggle.textContent = "Start"; } render(); }, 1000);\n  };\n  document.getElementById("reset").onclick = () => { clearInterval(timer); timer = null; left = total; toggle.textContent = "Start"; render(); };\n</script>\n</body>\n</html>\n```\n\n> **Tip:** You are currently in **Interactive Sandbox** mode. Switch to **Puter Cloud (Zero Key)** or **Anthropic API** in the top bar anytime for live `claude-haiku-5-5` responses.';
    } else if (/webhook|typescript|retry|backoff/i.test(lower)) {
      thinking = 'Structuring an idiomatic TypeScript webhook dispatcher:\n1. Full jitter backoff: random(0, min(cap, base * 2^attempt)) to avoid thundering herds.\n2. Idempotency-Key header preserved across retries.\n3. Dead-letter sink after maxAttempts.';
      answer = '### Resilient Webhook Dispatcher (`TypeScript`)\n\nFull jitter prevents synchronized retry storms when a downstream receiver recovers:\n\n```typescript\nexport interface WebhookJob {\n  id: string;\n  url: string;\n  payload: unknown;\n  attempt?: number;\n}\n\nexport class WebhookDispatcher {\n  constructor(\n    private readonly maxAttempts = 5,\n    private readonly baseDelayMs = 400,\n    private readonly maxDelayMs = 30_000,\n    private readonly onDeadLetter: (job: WebhookJob, err: unknown) => Promise<void>\n  ) {}\n\n  private backoffWithFullJitter(attempt: number): number {\n    const exp = Math.min(this.maxDelayMs, this.baseDelayMs * Math.pow(2, attempt));\n    return Math.floor(Math.random() * exp);\n  }\n\n  async deliver(job: WebhookJob): Promise<void> {\n    for (let attempt = 0; attempt < this.maxAttempts; attempt++) {\n      try {\n        const res = await fetch(job.url, {\n          method: "POST",\n          headers: {\n            "Content-Type": "application/json",\n            "Idempotency-Key": job.id,\n          },\n          body: JSON.stringify(job.payload),\n        });\n        if (res.ok) return;\n        if (res.status >= 400 && res.status < 500 && res.status !== 429) {\n          throw new Error(`Permanent 4xx rejection: ${res.status}`);\n        }\n      } catch (err) {\n        if (attempt === this.maxAttempts - 1) {\n          await this.onDeadLetter({ ...job, attempt: attempt + 1 }, err);\n          return;\n        }\n      }\n      await new Promise((r) => setTimeout(r, this.backoffWithFullJitter(attempt)));\n    }\n  }\n}\n```\n\n- **4xx Short-Circuiting:** Non-429 client errors skip pointless retries and route cleanly to the dead-letter handler.\n- **Idempotency:** Preserving `Idempotency-Key: job.id` guarantees at-most-once side effects on compliant receivers.';
    } else if (/sse|websocket|webtransport|protocol|table/i.test(lower)) {
      thinking = 'Comparing SSE, WebSockets, and WebTransport across transport layer, directionality, head-of-line blocking, proxy friendliness, and AI token streaming fit.';
      answer = '### Realtime Web Protocols Comparison (2026)\n\n| Dimension | Server-Sent Events (SSE) | WebSockets | WebTransport |\n| :--- | :--- | :--- | :--- |\n| **Transport** | HTTP/1.1, HTTP/2, HTTP/3 | TCP Upgrade (`ws://` / `wss://`) | HTTP/3 over QUIC (UDP) |\n| **Directionality** | Server → Client (`fetch` POST + stream) | Full-duplex bidirectional | Full-duplex streams + unreliable datagrams |\n| **Head-of-Line Blocking** | Per-stream on H2; none on H3 | Yes (single TCP stream) | None across streams or datagrams |\n| **Corporate Firewalls** | Excellent (standard HTTPS) | Good (occasionally inspected/dropped) | Moderate (UDP/443 blocked on strict networks) |\n| **Auto-Reconnection** | Built into `EventSource` (`Last-Event-ID`) | Manual backoff required | Manual session recovery |\n| **Best Fit** | **LLM token streaming (`claude-haiku-5-5`)**, live feeds | Collaborative whiteboards, chat rooms | Cloud gaming, low-latency media, telemetry |\n\nFor **Claude Haiku 5.5** chatbots, **HTTPS `fetch` + SSE** is ideal because it works natively with standard CORS headers, auth headers, and zero WebSocket state.';
    } else if (/coin|scale|12|switch|bulb/i.test(lower)) {
      thinking = 'Information theory check: 12 coins × 2 states (heavier/lighter) = 24 possibilities.\n3 weighings on a ternary balance yield 3^3 = 27 outcomes (left heavy, right heavy, balanced) — sufficient!\nPartition into three groups of 4: A={1,2,3,4}, B={5,6,7,8}, C={9,10,11,12}.';
      answer = '### 12-Coin Balance Solution in 3 Weighings\n\nBecause each weighing has **3 outcomes** (Left heavy, Right heavy, Balanced), 3 weighings distinguish up to $3^3 = 27$ states—enough to cover all $12 \\times 2 = 24$ `(coin, heavier/lighter)` possibilities.\n\n1. **Weighing 1:** Compare `{1, 2, 3, 4}` vs `{5, 6, 7, 8}`.\n   - **If Balanced:** Counterfeit is in `{9, 10, 11, 12}`, and `{1..8}` are known good (`G`).\n     - **Weighing 2:** Compare `{9, 10, 11}` vs `{G, G, G}`.\n       - *Balanced* → `12` is odd; weigh `12` vs `G` in **Weighing 3** to learn heavier/lighter.\n       - *9,10,11 heavier (or lighter)* → Now you know the direction! Compare `9` vs `10` in **Weighing 3** (`11` if balanced).\n   - **If Unbalanced** (say `{1, 2, 3, 4}` goes **down**, so `1..4` are *potentially heavy* `H` and `5..8` are *potentially light* `L`):\n     - **Weighing 2:** Rotate mixed suspects: `{1H, 2H, 5L}` vs `{3H, 6L, G}` (leaving `4H, 7L, 8L` aside).\n       - *Balanced* → Suspect is in `{4H, 7L, 8L}`; compare `7L` vs `8L` in **Weighing 3**!\n       - *Left goes down* → Either `1H` or `2H` is heavy, or `6L` is light; compare `1H` vs `2H` in **Weighing 3**!\n       - *Right goes down* → Either `3H` is heavy or `5L` is light; compare `3H` vs `G` in **Weighing 3**!';
    } else {
      thinking = 'Running in Interactive Sandbox preview mode.\nFormulating a clear, helpful response to: "' + prompt.slice(0, 90) + '" while explaining how to switch to live Claude Haiku 5.5 inference.';
      answer = '### Claude Haiku 5.5 · Sandbox Preview\n\nYou asked:\n> ' + (prompt || 'Hello!') + '\n\nRight now the interface is running in **Interactive Sandbox** mode so you can test streaming typography, code highlighting, keyboard shortcuts, and conversation persistence completely offline.\n\nTo chat with **live Claude Haiku 5.5 (`claude-haiku-5-5`)** on GitHub Pages or locally:\n1. **Zero-Key Option:** Click the connection pill at the top and choose **Puter Cloud (Free · Zero Key)**.\n2. **Direct API Option:** Choose **Anthropic API**, paste your `sk-ant-...` key (stored exclusively in your browser), and enjoy native `claude-haiku-5-5` streaming with **1M context** and **Adaptive Thinking**!';
    }

    if (effort === 'off') {
      thinking = '';
    }

    return { thinking: thinking, answer: answer };
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
    const effort = (opts.settings && opts.settings.effort) || 'medium';
    const reply = buildDemoReply(opts.messages, effort);

    if (reply.thinking) {
      const thinkTokens = reply.thinking.match(/\S+\s*/g) || [reply.thinking];
      for (let i = 0; i < thinkTokens.length; i++) {
        await sleepWithAbort(16, opts.signal);
        opts.onThinking(thinkTokens[i]);
      }
    }

    const words = reply.answer.match(/[\s\S]{1,5}/g) || [reply.answer];
    for (let j = 0; j < words.length; j++) {
      await sleepWithAbort(10, opts.signal);
      opts.onToken(words[j]);
    }

    return {
      usage: {
        inputTokens: Config.estimateTokens(JSON.stringify(opts.messages || [])),
        outputTokens: Config.estimateTokens(reply.thinking + reply.answer)
      },
      model: 'claude-haiku-5-5 (sandbox)'
    };
  }

  async function streamChat(opts) {
    const provider = (opts.settings && opts.settings.provider) || 'puter';
    if (provider === 'anthropic') {
      return streamAnthropic(opts);
    }
    if (provider === 'openrouter') {
      return streamOpenRouter(opts);
    }
    if (provider === 'demo') {
      return streamDemo(opts);
    }
    return streamPuter(opts);
  }

  const Providers = {
    streamChat: streamChat,
    normalizeAnthropicMessages: normalizeAnthropicMessages,
    parseSseLines: parseSseLines,
    buildDemoReply: buildDemoReply
  };

  root.HaikuChat = root.HaikuChat || {};
  root.HaikuChat.Providers = Providers;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Providers;
  }
})(typeof window !== 'undefined' ? window : globalThis);
