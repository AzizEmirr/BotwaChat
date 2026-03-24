import { FormEvent, useEffect, useRef, useState } from "react";
import appLogo from "../assets/app-logo.png";
import { env } from "../lib/env";
import { isDesktopRuntime } from "../lib/runtime";
import { useChatStore } from "../store/chatStore";

type AuthPanelProps = {
  appName: string;
  variant?: "full" | "card";
  onModeChange?: (mode: "login" | "register") => void;
};

type TurnstileWidgetID = string | number;

type TurnstileRenderOptions = {
  sitekey: string;
  theme?: "light" | "dark" | "auto";
  callback?: (token: string) => void;
  "error-callback"?: () => void;
  "expired-callback"?: () => void;
  "timeout-callback"?: () => void;
};

type TurnstileAPI = {
  render: (container: HTMLElement, options: TurnstileRenderOptions) => TurnstileWidgetID;
  reset: (widgetID?: TurnstileWidgetID) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileAPI;
  }
}

const TURNSTILE_SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const TURNSTILE_SCRIPT_FALLBACK_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js";
const TURNSTILE_READY_TIMEOUT_MS = 15000;
const TURNSTILE_EXISTING_SCRIPT_TIMEOUT_MS = 12000;
let turnstileScriptLoader: Promise<void> | null = null;

function waitForTurnstileAPI(timeoutMs = TURNSTILE_READY_TIMEOUT_MS): Promise<void> {
  if (typeof window !== "undefined" && window.turnstile) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    const startedAt = Date.now();
    const checkReady = () => {
      if (typeof window !== "undefined" && window.turnstile) {
        resolve();
        return;
      }
      if (Date.now() - startedAt >= timeoutMs) {
        reject(new Error("turnstile api unavailable"));
        return;
      }
      window.setTimeout(checkReady, 120);
    };
    checkReady();
  });
}

function removeTurnstileScripts() {
  for (const script of document.querySelectorAll<HTMLScriptElement>('script[src*="challenges.cloudflare.com/turnstile/v0/api.js"]')) {
    script.remove();
  }
}

function injectTurnstileScript(source: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${source}"]`);
    if (existing) {
      if (window.turnstile) {
        resolve();
        return;
      }
      const existingState = existing.dataset.turnstileState;
      if (existingState === "error") {
        reject(new Error("turnstile script failed"));
        return;
      }
      if (existingState === "loaded") {
        waitForTurnstileAPI().then(resolve).catch(reject);
        return;
      }
      if ((existing as HTMLScriptElement & { readyState?: string }).readyState === "complete") {
        waitForTurnstileAPI().then(resolve).catch(reject);
        return;
      }
      const timeoutID = window.setTimeout(() => {
        reject(new Error("turnstile script timeout"));
      }, TURNSTILE_EXISTING_SCRIPT_TIMEOUT_MS);
      existing.addEventListener(
        "load",
        () => {
          existing.dataset.turnstileState = "loaded";
          window.clearTimeout(timeoutID);
          waitForTurnstileAPI().then(resolve).catch(reject);
        },
        { once: true }
      );
      existing.addEventListener(
        "error",
        () => {
          existing.dataset.turnstileState = "error";
          window.clearTimeout(timeoutID);
          reject(new Error("turnstile script failed"));
        },
        { once: true }
      );
      return;
    }

    const script = document.createElement("script");
    script.src = source;
    script.async = true;
    script.defer = true;
    script.dataset.turnstileState = "pending";
    script.onload = () => {
      script.dataset.turnstileState = "loaded";
      waitForTurnstileAPI().then(resolve).catch(reject);
    };
    script.onerror = () => {
      script.dataset.turnstileState = "error";
      reject(new Error("turnstile script failed"));
    };
    document.head.appendChild(script);
  });
}

function loadTurnstileScript(forceReload = false): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("window unavailable"));
  }
  if (window.turnstile) {
    return Promise.resolve();
  }
  if (forceReload) {
    turnstileScriptLoader = null;
    removeTurnstileScripts();
  }
  if (turnstileScriptLoader) {
    return turnstileScriptLoader;
  }

  turnstileScriptLoader = (async () => {
    const sources = [TURNSTILE_SCRIPT_SRC, TURNSTILE_SCRIPT_FALLBACK_SRC];
    let lastError: unknown = null;
    for (const source of sources) {
      try {
        await injectTurnstileScript(source);
        return;
      } catch (error) {
        lastError = error;
        removeTurnstileScripts();
      }
    }
    throw lastError ?? new Error("turnstile script failed");
  })().catch((error) => {
    turnstileScriptLoader = null;
    throw error;
  });

  return turnstileScriptLoader;
}

export function AuthPanel({ appName, variant = "full", onModeChange }: AuthPanelProps) {
  const authMode = useChatStore((state) => state.authMode);
  const authLoading = useChatStore((state) => state.authLoading);
  const error = useChatStore((state) => state.error);
  const setAuthMode = useChatStore((state) => state.setAuthMode);
  const login = useChatStore((state) => state.login);
  const register = useChatStore((state) => state.register);
  const clearError = useChatStore((state) => state.clearError);

  const [emailOrUsername, setEmailOrUsername] = useState("");
  const [password, setPassword] = useState("");
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerUsername, setRegisterUsername] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileError, setTurnstileError] = useState<string | null>(null);
  const [turnstileReady, setTurnstileReady] = useState(false);
  const [turnstileRetryNonce, setTurnstileRetryNonce] = useState(0);

  const turnstileEnabled = env.turnstileSiteKey.length > 0 && !isDesktopRuntime();
  const turnstileContainerRef = useRef<HTMLDivElement | null>(null);
  const turnstileWidgetIDRef = useRef<TurnstileWidgetID | null>(null);

  useEffect(() => {
    if (!turnstileEnabled) {
      return;
    }

    let mounted = true;
    setTurnstileReady(false);
    setTurnstileError(null);
    turnstileWidgetIDRef.current = null;
    turnstileContainerRef.current?.replaceChildren();

    loadTurnstileScript(turnstileRetryNonce > 0)
      .then(() => {
        if (!mounted || !turnstileContainerRef.current || !window.turnstile) {
          return;
        }

        if (turnstileWidgetIDRef.current === null) {
          turnstileWidgetIDRef.current = window.turnstile.render(turnstileContainerRef.current, {
            sitekey: env.turnstileSiteKey,
            theme: "dark",
            callback: (token) => {
              setTurnstileToken(token);
              setTurnstileError(null);
            },
            "expired-callback": () => {
              setTurnstileToken("");
            },
            "timeout-callback": () => {
              setTurnstileToken("");
            },
            "error-callback": () => {
              setTurnstileToken("");
              setTurnstileError("Güvenlik doğrulaması başarısız oldu. Sayfayı yenileyip tekrar dene.");
            }
          });
        }

        setTurnstileReady(true);
      })
      .catch(() => {
        if (mounted) {
          setTurnstileError("Güvenlik doğrulaması yüklenemedi.");
        }
      });

    return () => {
      mounted = false;
    };
  }, [turnstileEnabled, turnstileRetryNonce]);

  useEffect(() => {
    if (!turnstileEnabled) {
      return;
    }

    setTurnstileToken("");
    setTurnstileError(null);
    if (window.turnstile && turnstileWidgetIDRef.current !== null) {
      window.turnstile.reset(turnstileWidgetIDRef.current);
    }
  }, [authMode, turnstileEnabled]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalizedTurnstileToken = turnstileToken.trim();
    if (turnstileEnabled && !normalizedTurnstileToken) {
      setTurnstileError("Lütfen güvenlik doğrulamasını tamamla.");
      return;
    }

    setTurnstileError(null);
    if (authMode === "login") {
      await login(emailOrUsername.trim(), password, normalizedTurnstileToken || undefined);
      if (turnstileEnabled && window.turnstile && turnstileWidgetIDRef.current !== null) {
        window.turnstile.reset(turnstileWidgetIDRef.current);
        setTurnstileToken("");
      }
      return;
    }

    await register(registerEmail.trim(), registerUsername.trim(), registerPassword, normalizedTurnstileToken || undefined);
    if (turnstileEnabled && window.turnstile && turnstileWidgetIDRef.current !== null) {
      window.turnstile.reset(turnstileWidgetIDRef.current);
      setTurnstileToken("");
    }
  };

  const cardClassName =
    variant === "card"
      ? "w-full max-w-[min(100%,28rem)] rounded-3xl border border-[var(--catwa-border)] bg-[color:color-mix(in_srgb,var(--catwa-panel)_86%,black_14%)] p-4 shadow-[0_28px_70px_-34px_rgba(2,6,23,0.88)] backdrop-blur-xl sm:p-6"
      : "w-full max-w-[min(100%,28rem)] rounded-3xl border border-[var(--catwa-border)] bg-[color:color-mix(in_srgb,var(--catwa-panel)_84%,black_16%)] p-4 shadow-[0_28px_70px_-34px_rgba(2,6,23,0.88)] backdrop-blur-xl sm:p-6";

  const panel = (
    <section className={cardClassName}>
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full border border-cyan-400/45 bg-cyan-500/5">
          <img
            alt={`${appName} logo`}
            className="h-10 w-10 object-contain brightness-125 contrast-110 saturate-125 mix-blend-screen"
            src={appLogo}
          />
        </div>
        <div>
          <h1 className="text-xl font-semibold">{appName}</h1>
          <p className="mt-1 text-sm text-slate-400">Gerçek zamanlı DM ve kanal sohbeti</p>
        </div>
      </div>

      <div className="mb-5 grid grid-cols-2 overflow-hidden rounded-xl border border-[var(--catwa-border)]">
        <button
          className={`px-3 py-2 text-sm transition ${
            authMode === "login"
              ? "bg-[var(--catwa-accent-soft)] text-white shadow-[inset_0_0_0_1px_rgba(var(--catwa-accent-rgb),0.3)]"
              : "bg-slate-900 text-slate-300 hover:bg-slate-800"
          }`}
          onClick={() => {
            clearError();
            setAuthMode("login");
            onModeChange?.("login");
          }}
          type="button"
        >
          Giriş
        </button>
        <button
          className={`px-3 py-2 text-sm transition ${
            authMode === "register"
              ? "bg-[var(--catwa-accent-soft)] text-white shadow-[inset_0_0_0_1px_rgba(var(--catwa-accent-rgb),0.3)]"
              : "bg-slate-900 text-slate-300 hover:bg-slate-800"
          }`}
          onClick={() => {
            clearError();
            setAuthMode("register");
            onModeChange?.("register");
          }}
          type="button"
        >
          Kayıt
        </button>
      </div>

      <form className="space-y-4" onSubmit={handleSubmit}>
        {authMode === "login" ? (
          <>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-300">E-posta veya kullanıcı adı</span>
              <input
                autoComplete="username"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none transition focus:border-cyan-500/70"
                onChange={(event) => setEmailOrUsername(event.target.value)}
                required
                value={emailOrUsername}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-300">Şifre</span>
              <input
                autoComplete="current-password"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none transition focus:border-cyan-500/70"
                onChange={(event) => setPassword(event.target.value)}
                required
                type="password"
                value={password}
              />
            </label>
          </>
        ) : (
          <>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-300">E-posta</span>
              <input
                autoComplete="email"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none transition focus:border-cyan-500/70"
                onChange={(event) => setRegisterEmail(event.target.value)}
                required
                type="email"
                value={registerEmail}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-300">Kullanıcı adı</span>
              <input
                autoComplete="username"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none transition focus:border-cyan-500/70"
                onChange={(event) => setRegisterUsername(event.target.value)}
                required
                value={registerUsername}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-300">Şifre</span>
              <input
                autoComplete="new-password"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none transition focus:border-cyan-500/70"
                onChange={(event) => setRegisterPassword(event.target.value)}
                required
                type="password"
                value={registerPassword}
              />
            </label>
          </>
        )}

        {turnstileEnabled && (
          <div className="space-y-2">
            <div className="overflow-x-auto rounded-lg border border-slate-700 bg-slate-950/70 p-2">
              <div className="mx-auto min-h-[70px] min-w-[300px]" ref={turnstileContainerRef} />
            </div>
            {!turnstileReady && (
              <p className="text-xs text-slate-400">Güvenlik doğrulaması yükleniyor...</p>
            )}
            {turnstileError && <p className="text-xs text-rose-300">{turnstileError}</p>}
            {turnstileError && (
              <button
                className="rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs text-slate-200 transition hover:bg-slate-800"
                onClick={() => setTurnstileRetryNonce((value) => value + 1)}
                type="button"
              >
                Güvenlik Doğrulamasını Tekrar Dene
              </button>
            )}
          </div>
        )}

        {error && <p className="rounded-md border border-rose-900 bg-rose-950/40 px-3 py-2 text-sm text-rose-200">{error}</p>}

        <button
          className="w-full rounded-xl border border-[var(--catwa-accent-strong)] bg-[var(--catwa-accent-soft)] px-3 py-2 text-sm font-medium text-cyan-100 shadow-[0_18px_30px_-24px_rgba(var(--catwa-accent-rgb),0.95)] transition hover:-translate-y-[1px] hover:bg-[var(--catwa-accent-strong)] disabled:cursor-not-allowed disabled:opacity-50"
          disabled={authLoading}
          type="submit"
        >
          {authLoading ? "İşleniyor..." : authMode === "login" ? "Giriş Yap" : "Hesap Oluştur"}
        </button>
      </form>

      <div className="mt-5 rounded-lg border border-slate-800 bg-slate-950/80 p-3 text-xs text-slate-400">
        <p className="font-medium text-slate-300">İlk kullanım</p>
        <p className="mt-1">Yeni hesap oluşturmak için “Kayıt” sekmesini kullan.</p>
      </div>
    </section>
  );

  if (variant === "card") {
    return panel;
  }

  return (
    <main className="flex min-h-full items-center justify-center bg-[radial-gradient(900px_420px_at_80%_12%,rgba(34,211,238,0.14),transparent_62%),radial-gradient(740px_380px_at_10%_0%,rgba(99,102,241,0.2),transparent_58%),#050a16] px-4 text-slate-100">
      {panel}
    </main>
  );
}
