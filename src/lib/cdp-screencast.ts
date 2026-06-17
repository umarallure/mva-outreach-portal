/**
 * Browser-side controller for an embedded GoLogin cloud browser.
 *
 * Speaks Chrome DevTools Protocol over the gateway WebSocket (which relays to
 * `wss://cloudbrowser.gologin.com/connect`). It attaches to a page target, streams
 * `Page.screencastFrame` JPEG frames, and forwards mouse/keyboard/scroll input via
 * the `Input` domain — i.e. a self-built, interactive live view (the same technique
 * Browserbase/Steel use, since GoLogin's own viewer page can't be iframed).
 *
 * No secrets here: the GoLogin token lives only on the gateway. This client only
 * holds a short-lived signed ticket in the WebSocket URL.
 */

export type ScreencastStatus =
  | "connecting"
  | "attaching"
  | "streaming"
  | "reconnecting"
  | "closed"
  | "error";

export type FrameMetadata = {
  deviceWidth: number;
  deviceHeight: number;
  pageScaleFactor: number;
  offsetTop: number;
  scrollOffsetX: number;
  scrollOffsetY: number;
};

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void };

type CloudBrowserClientOptions = {
  url: string;
  onFrame: (image: HTMLImageElement, metadata: FrameMetadata) => void;
  onStatus: (status: ScreencastStatus, detail?: string) => void;
  onUrl?: (url: string) => void;
  quality?: number;
  maxWidth?: number;
  maxHeight?: number;
};

export class CloudBrowserClient {
  private ws: WebSocket | null = null;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private sessionId: string | null = null;
  private lastMetadata: FrameMetadata | null = null;
  private lastUrl = "";
  private disposed = false;

  private readonly opts: CloudBrowserClientOptions & {
    quality: number;
    maxWidth: number;
    maxHeight: number;
  };

  constructor(options: CloudBrowserClientOptions) {
    this.opts = {
      quality: 70,
      maxWidth: 1600,
      maxHeight: 1000,
      ...options,
    };
  }

  get metadata(): FrameMetadata | null {
    return this.lastMetadata;
  }

  connect() {
    if (this.disposed) return;
    this.opts.onStatus("connecting");
    const ws = new WebSocket(this.opts.url);
    this.ws = ws;

    ws.onopen = () => void this.handshake().catch((e) => this.fail(e));
    ws.onmessage = (ev) => this.onMessage(ev.data as string);
    ws.onerror = () => this.opts.onStatus("error", "WebSocket error");
    ws.onclose = () => {
      this.sessionId = null;
      if (!this.disposed) this.opts.onStatus("closed");
    };
  }

  dispose() {
    this.disposed = true;
    try {
      if (this.sessionId) this.send("Page.stopScreencast", {}, this.sessionId).catch(() => {});
    } catch {
      /* ignore */
    }
    this.pending.forEach((p) => p.reject(new Error("disposed")));
    this.pending.clear();
    try {
      this.ws?.close();
    } catch {
      /* ignore */
    }
    this.ws = null;
  }

  // ---- CDP transport ----------------------------------------------------------
  private send(method: string, params: Record<string, unknown> = {}, sessionId?: string) {
    return new Promise<unknown>((resolve, reject) => {
      const ws = this.ws;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        reject(new Error("socket not open"));
        return;
      }
      const id = this.nextId++;
      const message: Record<string, unknown> = { id, method, params };
      if (sessionId) message.sessionId = sessionId;
      this.pending.set(id, { resolve, reject });
      ws.send(JSON.stringify(message));
    });
  }

  /** Fire-and-forget — used for high-frequency input where we don't await a reply. */
  private post(method: string, params: Record<string, unknown> = {}, sessionId?: string) {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const message: Record<string, unknown> = { id: this.nextId++, method, params };
    if (sessionId) message.sessionId = sessionId;
    ws.send(JSON.stringify(message));
  }

  private onMessage(raw: string) {
    let msg: {
      id?: number;
      method?: string;
      params?: Record<string, unknown>;
      result?: unknown;
      error?: { message?: string };
      sessionId?: string;
    };
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    if (typeof msg.id === "number" && this.pending.has(msg.id)) {
      const p = this.pending.get(msg.id)!;
      this.pending.delete(msg.id);
      if (msg.error) p.reject(new Error(msg.error.message ?? "CDP error"));
      else p.resolve(msg.result);
      return;
    }

    if (msg.method === "Page.screencastFrame") {
      this.handleFrame(msg.params as { data: string; sessionId: number; metadata: FrameMetadata });
      return;
    }

    if (msg.method === "Page.frameNavigated") {
      const frame = (msg.params as { frame?: { parentId?: string; url?: string } })?.frame;
      if (frame && !frame.parentId && frame.url) this.emitUrl(frame.url);
      return;
    }

    if (msg.method === "Page.navigatedWithinDocument") {
      const url = (msg.params as { url?: string })?.url;
      if (url) this.emitUrl(url);
    }
  }

  private emitUrl(url: string) {
    if (!url || url === this.lastUrl) return;
    this.lastUrl = url;
    this.opts.onUrl?.(url);
  }

  // ---- Screencast handshake ---------------------------------------------------
  private async handshake() {
    this.opts.onStatus("attaching");
    const { targetInfos } = (await this.send("Target.getTargets")) as {
      targetInfos: Array<{ targetId: string; type: string; url: string }>;
    };

    const pages = targetInfos.filter((t) => t.type === "page" && !t.url.startsWith("devtools://"));
    // Prefer a real, navigated tab over a blank one.
    const target =
      pages.find((t) => t.url && t.url !== "about:blank" && !t.url.startsWith("chrome://")) ??
      pages[0];

    if (!target) throw new Error("No page target available in the cloud browser.");

    const { sessionId } = (await this.send("Target.attachToTarget", {
      targetId: target.targetId,
      flatten: true,
    })) as { sessionId: string };
    this.sessionId = sessionId;

    await this.send("Page.enable", {}, sessionId);
    await this.send("Runtime.enable", {}, sessionId).catch(() => {});
    await this.send("Page.bringToFront", {}, sessionId).catch(() => {});
    await this.injectInputShim();
    await this.startScreencast();
    this.opts.onStatus("streaming");

    if (target.url) this.emitUrl(target.url);
    // frameNavigated won't fire for the already-loaded page, so read the URL directly.
    this.send("Runtime.evaluate", { expression: "location.href", returnByValue: true }, sessionId)
      .then((r) => {
        const u = (r as { result?: { value?: string } })?.result?.value;
        if (u) this.emitUrl(u);
      })
      .catch(() => {});
  }

  private async startScreencast() {
    if (!this.sessionId) return;
    await this.send(
      "Page.startScreencast",
      {
        format: "jpeg",
        quality: this.opts.quality,
        maxWidth: this.opts.maxWidth,
        maxHeight: this.opts.maxHeight,
        everyNthFrame: 1,
      },
      this.sessionId,
    );
  }

  private handleFrame(params: { data: string; sessionId: number; metadata: FrameMetadata }) {
    if (!this.sessionId) return;
    // Ack immediately so the stream keeps flowing (ack uses the FRAME's numeric sessionId).
    this.post("Page.screencastFrameAck", { sessionId: params.sessionId }, this.sessionId);
    this.lastMetadata = params.metadata;

    const img = new Image();
    img.onload = () => this.opts.onFrame(img, params.metadata);
    img.src = `data:image/jpeg;base64,${params.data}`;
  }

  private fail(error: unknown) {
    this.opts.onStatus("error", error instanceof Error ? error.message : "Connection failed");
  }

  // ---- Input forwarding (via injected JS) ------------------------------------
  // GoLogin's cloud browser ignores CDP Input events (verified), so we synthesize
  // DOM events inside the page through an injected shim (window.__portalInput),
  // dispatched via Runtime.evaluate — which GoLogin does honor.

  /** Translate a pointer at normalized [0..1] panel coords into viewport CSS px. */
  private toViewport(nx: number, ny: number) {
    const md = this.lastMetadata;
    const w = md?.deviceWidth ?? this.opts.maxWidth;
    const h = md?.deviceHeight ?? this.opts.maxHeight;
    return {
      x: Math.round(Math.max(0, Math.min(w, nx * w))),
      y: Math.round(Math.max(0, Math.min(h, ny * h))),
    };
  }

  private postEval(expression: string) {
    if (!this.sessionId) return;
    this.post("Runtime.evaluate", { expression }, this.sessionId);
  }

  private async injectInputShim() {
    if (!this.sessionId) return;
    // Reinstall on every new document (full navigations) and once for the current page.
    await this.send(
      "Page.addScriptToEvaluateOnNewDocument",
      { source: INPUT_SHIM },
      this.sessionId,
    ).catch(() => {});
    await this.send("Runtime.evaluate", { expression: INPUT_SHIM }, this.sessionId).catch(
      () => {},
    );
  }

  click(nx: number, ny: number, button = 0, detail = 1) {
    const { x, y } = this.toViewport(nx, ny);
    this.postEval(`window.__portalInput&&__portalInput.click(${x},${y},${button},${detail})`);
  }

  dblclick(nx: number, ny: number) {
    const { x, y } = this.toViewport(nx, ny);
    this.postEval(`window.__portalInput&&__portalInput.dblclick(${x},${y})`);
  }

  scroll(nx: number, ny: number, dx: number, dy: number) {
    const { x, y } = this.toViewport(nx, ny);
    this.postEval(
      `window.__portalInput&&__portalInput.scroll(${x},${y},${Math.round(dx)},${Math.round(dy)})`,
    );
  }

  typeText(text: string) {
    if (!text) return;
    this.postEval(`window.__portalInput&&__portalInput.type(${JSON.stringify(text)})`);
  }

  specialKey(key: string) {
    this.postEval(`window.__portalInput&&__portalInput.key(${JSON.stringify(key)})`);
  }

  navigate(url: string) {
    if (!this.sessionId || !url) return;
    this.post("Page.navigate", { url }, this.sessionId);
  }

  goBack() {
    this.postEval("history.back()");
  }

  goForward() {
    this.postEval("history.forward()");
  }

  reload() {
    if (!this.sessionId) return;
    this.post("Page.reload", {}, this.sessionId);
  }
}

/**
 * Injected into the cloud page. Synthesizes trusted-enough DOM events for clicks,
 * scrolling and typing. Works because target apps (FlowChat, LinkedIn) are SPAs
 * that respond to dispatched DOM events via delegated listeners.
 */
const INPUT_SHIM = `(() => {
  if (window.__portalInput) return;
  var fireMouse = function (el, type, init) {
    el.dispatchEvent(new MouseEvent(type, Object.assign({ bubbles: true, cancelable: true, view: window }, init)));
  };
  var firePointer = function (el, type, init) {
    try { el.dispatchEvent(new PointerEvent(type, Object.assign({ bubbles: true, cancelable: true, view: window, pointerId: 1, isPrimary: true }, init))); } catch (e) {}
  };
  var nativeSetValue = function (el, value) {
    var proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    var setter = Object.getOwnPropertyDescriptor(proto, 'value');
    if (setter && setter.set) setter.set.call(el, value); else el.value = value;
  };
  var findScrollable = function (el) {
    while (el && el !== document.body && el !== document.documentElement) {
      var s = getComputedStyle(el);
      if (/(auto|scroll|overlay)/.test(s.overflowY) && el.scrollHeight > el.clientHeight) return el;
      el = el.parentElement;
    }
    return document.scrollingElement || document.documentElement;
  };
  window.__portalInput = {
    click: function (x, y, button, detail) {
      var el = document.elementFromPoint(x, y);
      if (!el) return;
      var init = { clientX: x, clientY: y, button: button || 0, detail: detail || 1, buttons: button === 2 ? 2 : 1 };
      firePointer(el, 'pointerdown', init);
      fireMouse(el, 'mousedown', init);
      if (el.focus) { try { el.focus(); } catch (e) {} }
      firePointer(el, 'pointerup', init);
      fireMouse(el, 'mouseup', init);
      if (button === 2) { fireMouse(el, 'contextmenu', init); return; }
      fireMouse(el, 'click', init);
      // Plain anchors that have no JS handler won't navigate from an untrusted click;
      // follow them explicitly. SPA links (handled in JS) navigate via the click above,
      // so only follow same-tab anchors whose default wasn't already taken over.
      var a = el.closest ? el.closest('a[href]') : null;
      if (a && a.href && a.target !== '_blank' && (a.getAttribute('href') || '')[0] !== '#') {
        var before = location.href;
        setTimeout(function () {
          if (location.href === before) { try { location.href = a.href; } catch (e) {} }
        }, 250);
      }
    },
    dblclick: function (x, y) {
      var el = document.elementFromPoint(x, y);
      if (el) fireMouse(el, 'dblclick', { clientX: x, clientY: y, detail: 2 });
    },
    scroll: function (x, y, dx, dy) {
      var el = findScrollable(document.elementFromPoint(x, y) || document.body);
      if (el.scrollBy) el.scrollBy(dx, dy); else { el.scrollTop += dy; el.scrollLeft += dx; }
    },
    type: function (text) {
      var el = document.activeElement;
      if (!el) return;
      if (el.isContentEditable) { try { document.execCommand('insertText', false, text); return; } catch (e) {} }
      if ('value' in el) {
        var s = el.selectionStart == null ? el.value.length : el.selectionStart;
        var e2 = el.selectionEnd == null ? el.value.length : el.selectionEnd;
        nativeSetValue(el, el.value.slice(0, s) + text + el.value.slice(e2));
        var pos = s + text.length;
        try { el.setSelectionRange(pos, pos); } catch (e) {}
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
    },
    key: function (key) {
      var el = document.activeElement || document.body;
      var map = { Enter: 13, Backspace: 8, Tab: 9, Delete: 46, ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, Escape: 27, Home: 36, End: 35 };
      var code = map[key] || 0;
      var opts = { key: key, keyCode: code, which: code, bubbles: true, cancelable: true };
      el.dispatchEvent(new KeyboardEvent('keydown', opts));
      if (key === 'Backspace') {
        if ('value' in el) {
          var s = el.selectionStart == null ? el.value.length : el.selectionStart;
          var e2 = el.selectionEnd == null ? s : el.selectionEnd;
          if (s === e2 && s > 0) { nativeSetValue(el, el.value.slice(0, s - 1) + el.value.slice(e2)); try { el.setSelectionRange(s - 1, s - 1); } catch (e) {} }
          else { nativeSetValue(el, el.value.slice(0, s) + el.value.slice(e2)); try { el.setSelectionRange(s, s); } catch (e) {} }
          el.dispatchEvent(new Event('input', { bubbles: true }));
        } else if (el.isContentEditable) { try { document.execCommand('delete', false); } catch (e) {} }
      } else if (key === 'Enter' && el.isContentEditable) {
        try { document.execCommand('insertLineBreak'); } catch (e) {}
      }
      el.dispatchEvent(new KeyboardEvent('keyup', opts));
    }
  };
})();`;
