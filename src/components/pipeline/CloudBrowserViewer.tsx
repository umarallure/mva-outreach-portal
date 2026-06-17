"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Globe,
  Loader2,
  MonitorPlay,
  RotateCcw,
  RotateCw,
} from "lucide-react";
import { CloudBrowserClient, type ScreencastStatus } from "@/lib/cdp-screencast";

// Printable single chars are typed; these named keys are forwarded as key actions.
const FORWARDED_KEYS = new Set([
  "Enter",
  "Backspace",
  "Tab",
  "Delete",
  "ArrowLeft",
  "ArrowUp",
  "ArrowRight",
  "ArrowDown",
  "Escape",
  "Home",
  "End",
]);

export type CloudBrowserViewerHandle = {
  navigate: (url: string) => void;
  reload: () => void;
};

type Props = {
  sessionId: string;
  /** When the session first goes live, navigate the cloud tab here (e.g. the account's FlowChat pipeline). */
  autoOpenUrl?: string;
  onStatusChange?: (status: ScreencastStatus) => void;
};

type TicketResponse = {
  ticket?: string;
  gatewayUrl?: string;
  error?: string;
};

const MAX_AUTO_RETRIES = 3;

function gatewayWsUrl(gatewayUrl: string, ticket: string) {
  const base = gatewayUrl.replace(/\/+$/, "");
  return `${base}/cdp?ticket=${encodeURIComponent(ticket)}`;
}

export const CloudBrowserViewer = forwardRef<CloudBrowserViewerHandle, Props>(
  function CloudBrowserViewer({ sessionId, autoOpenUrl, onStatusChange }, ref) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const clientRef = useRef<CloudBrowserClient | null>(null);
    const retriesRef = useRef(0);
    const lastMoveRef = useRef(0);
    const mountedRef = useRef(true);
    const autoOpenedRef = useRef(false);

    const [status, setStatus] = useState<ScreencastStatus>("connecting");
    const [errorDetail, setErrorDetail] = useState<string | null>(null);
    const [currentUrl, setCurrentUrl] = useState("");
    const [addrFocused, setAddrFocused] = useState(false);
    const [addrDraft, setAddrDraft] = useState("");

    useImperativeHandle(ref, () => ({
      navigate: (url: string) => clientRef.current?.navigate(url),
      reload: () => clientRef.current?.reload(),
    }));

    const teardown = useCallback(() => {
      clientRef.current?.dispose();
      clientRef.current = null;
    }, []);

    const connect = useCallback(async () => {
      teardown();
      setErrorDetail(null);
      setStatus("connecting");

      let payload: TicketResponse;
      try {
        const res = await fetch(`/api/gologin/sessions/${sessionId}/viewer-ticket`, {
          method: "POST",
        });
        payload = (await res.json()) as TicketResponse;
        if (!res.ok || !payload.ticket || !payload.gatewayUrl) {
          throw new Error(payload.error ?? "Unable to authorize the live browser.");
        }
      } catch (error) {
        if (!mountedRef.current) return;
        setStatus("error");
        setErrorDetail(error instanceof Error ? error.message : "Unable to authorize the live browser.");
        return;
      }

      if (!mountedRef.current) return;

      const client = new CloudBrowserClient({
        url: gatewayWsUrl(payload.gatewayUrl, payload.ticket),
        onFrame: (img) => {
          const canvas = canvasRef.current;
          if (!canvas) return;
          if (canvas.width !== img.naturalWidth) canvas.width = img.naturalWidth;
          if (canvas.height !== img.naturalHeight) canvas.height = img.naturalHeight;
          canvas.getContext("2d")?.drawImage(img, 0, 0);
        },
        onStatus: (next, detail) => {
          if (!mountedRef.current) return;
          setStatus(next);
          if (detail) setErrorDetail(detail);
          if (next === "streaming") {
            retriesRef.current = 0;
            // On the first successful stream of this session, open the account's pipeline.
            // Persists across reconnects (ref survives), resets when the session remounts.
            if (autoOpenUrl && !autoOpenedRef.current) {
              autoOpenedRef.current = true;
              client.navigate(autoOpenUrl);
            }
          }
          if ((next === "closed" || next === "error") && retriesRef.current < MAX_AUTO_RETRIES) {
            retriesRef.current += 1;
            setStatus("reconnecting");
            window.setTimeout(() => {
              if (mountedRef.current) void connect();
            }, 1500 * retriesRef.current);
          }
        },
        onUrl: (url) => {
          if (mountedRef.current) setCurrentUrl(url);
        },
      });
      clientRef.current = client;
      client.connect();
    }, [sessionId, teardown, autoOpenUrl]);

    useEffect(() => {
      mountedRef.current = true;
      void connect();
      return () => {
        mountedRef.current = false;
        teardown();
      };
    }, [connect, teardown]);

    useEffect(() => {
      onStatusChange?.(status);
    }, [status, onStatusChange]);

    // Non-passive wheel listener so we can preventDefault and forward scrolling.
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const onWheel = (e: WheelEvent) => {
        e.preventDefault();
        const now = performance.now();
        if (now - lastMoveRef.current < 40) return; // throttle scroll round-trips
        lastMoveRef.current = now;
        const { nx, ny } = normalized(canvas, e.clientX, e.clientY);
        clientRef.current?.scroll(nx, ny, e.deltaX, e.deltaY);
      };
      canvas.addEventListener("wheel", onWheel, { passive: false });
      return () => canvas.removeEventListener("wheel", onWheel);
    }, [status]);

    const onClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
      canvasRef.current?.focus();
      const { nx, ny } = normalized(e.currentTarget, e.clientX, e.clientY);
      clientRef.current?.click(nx, ny, 0, e.detail || 1);
    };

    const onDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
      const { nx, ny } = normalized(e.currentTarget, e.clientX, e.clientY);
      clientRef.current?.dblclick(nx, ny);
    };

    const onContextMenu = (e: React.MouseEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      const { nx, ny } = normalized(e.currentTarget, e.clientX, e.clientY);
      clientRef.current?.click(nx, ny, 2, 1);
    };

    const onKeyDown = (e: React.KeyboardEvent<HTMLCanvasElement>) => {
      // Let the browser handle paste (Ctrl/Cmd+V) via the paste event.
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") return;
      e.preventDefault();
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
        clientRef.current?.typeText(e.key);
      } else if (FORWARDED_KEYS.has(e.key)) {
        clientRef.current?.specialKey(e.key);
      }
    };

    const onPaste = (e: React.ClipboardEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      const text = e.clipboardData.getData("text");
      if (text) clientRef.current?.typeText(text);
    };

    const isLoading =
      status === "connecting" || status === "attaching" || status === "reconnecting";
    const connected = status === "streaming";

    const submitAddress = () => {
      const url = normalizeUrl(addrFocused ? addrDraft : currentUrl);
      if (url) clientRef.current?.navigate(url);
      setAddrFocused(false);
    };

    const toolBtn =
      "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[var(--dash-text-muted)] transition hover:bg-white/[0.06] hover:text-[var(--dash-text)] disabled:cursor-not-allowed disabled:opacity-40";

    return (
      <div className="flex h-full min-h-[680px] w-full flex-col bg-black/40">
        {/* Browser chrome */}
        <div className="flex items-center gap-1.5 border-b border-[var(--dash-border)] bg-[var(--dash-surface)] px-2.5 py-2">
          <button
            className={toolBtn}
            disabled={!connected}
            onClick={() => clientRef.current?.goBack()}
            title="Back"
            type="button"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <button
            className={toolBtn}
            disabled={!connected}
            onClick={() => clientRef.current?.goForward()}
            title="Forward"
            type="button"
          >
            <ArrowRight className="h-4 w-4" />
          </button>
          <button
            className={toolBtn}
            disabled={!connected}
            onClick={() => clientRef.current?.reload()}
            title="Reload"
            type="button"
          >
            <RotateCw className="h-4 w-4" />
          </button>

          <form
            className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-[var(--dash-border)] bg-black/20 px-2.5 py-1.5 focus-within:border-[#AE4010]/40"
            onSubmit={(e) => {
              e.preventDefault();
              submitAddress();
            }}
          >
            <Globe className="h-3.5 w-3.5 shrink-0 text-[var(--dash-text-muted)]" />
            <input
              className="min-w-0 flex-1 bg-transparent text-xs text-[var(--dash-text)] outline-none placeholder:text-[var(--dash-text-muted)]"
              disabled={!connected}
              onBlur={() => setAddrFocused(false)}
              onChange={(e) => setAddrDraft(e.target.value)}
              onFocus={(e) => {
                setAddrDraft(currentUrl);
                setAddrFocused(true);
                e.currentTarget.select();
              }}
              placeholder="Enter a URL and press Enter…"
              spellCheck={false}
              value={addrFocused ? addrDraft : currentUrl}
            />
          </form>

          <span
            className={`flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${
              connected
                ? "border border-emerald-400/20 bg-emerald-500/10 text-emerald-200"
                : "border border-[var(--dash-border)] text-[var(--dash-text-muted)]"
            }`}
          >
            <MonitorPlay className="h-3 w-3" />
            {connected ? "Live" : "Offline"}
          </span>
        </div>

        {/* Viewport */}
        <div className="relative flex flex-1 items-center justify-center p-2">
          <canvas
            ref={canvasRef}
            tabIndex={0}
            onClick={onClick}
            onDoubleClick={onDoubleClick}
            onContextMenu={onContextMenu}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            className={`max-h-full max-w-full rounded-md outline-none ring-1 ring-[var(--dash-border)] ${
              connected ? "cursor-pointer opacity-100" : "cursor-default opacity-40"
            }`}
          />

          {isLoading ? (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="flex items-center gap-2 rounded-lg border border-[var(--dash-border)] bg-[var(--dash-surface)] px-4 py-2 text-sm text-[var(--dash-text-muted)] backdrop-blur-[var(--dash-blur)]">
                <Loader2 className="h-4 w-4 animate-spin text-[#AE4010]" />
                {status === "connecting" && "Connecting to cloud browser…"}
                {status === "attaching" && "Attaching to the live session…"}
                {status === "reconnecting" && "Reconnecting…"}
              </div>
            </div>
          ) : null}

          {status === "error" ? (
            <div className="absolute inset-0 flex items-center justify-center p-8">
              <div className="max-w-md text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-red-500/10">
                  <AlertTriangle className="h-6 w-6 text-red-300" />
                </div>
                <h3 className="mt-4 text-lg font-semibold text-[var(--dash-text)]">
                  Live view disconnected
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--dash-text-muted)]">
                  {errorDetail ?? "The cloud browser connection was interrupted."}
                </p>
                <button
                  className="mt-5 inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-[var(--dash-border)] px-3 text-xs font-medium text-[var(--dash-text-muted)] transition hover:border-[#AE4010]/40 hover:bg-[#AE4010]/10 hover:text-[var(--dash-text)]"
                  onClick={() => {
                    retriesRef.current = 0;
                    void connect();
                  }}
                  type="button"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Reconnect
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    );
  },
);

function normalizeUrl(input: string) {
  const value = input.trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  if (/^[\w-]+(\.[\w-]+)+(\/.*)?$/.test(value) || value.startsWith("localhost")) {
    return `https://${value}`;
  }
  return `https://www.google.com/search?q=${encodeURIComponent(value)}`;
}

function normalized(canvas: HTMLCanvasElement, clientX: number, clientY: number) {
  const rect = canvas.getBoundingClientRect();
  const nx = rect.width > 0 ? (clientX - rect.left) / rect.width : 0;
  const ny = rect.height > 0 ? (clientY - rect.top) / rect.height : 0;
  return { nx: Math.max(0, Math.min(1, nx)), ny: Math.max(0, Math.min(1, ny)) };
}
