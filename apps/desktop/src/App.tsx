import { APP_NAME } from "@catwa/shared/constants/app";
import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  BrowserRouter,
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate
} from "react-router-dom";
import { AuthPanel } from "./components/AuthPanel";
import { DesktopUpdateManager } from "./components/desktop/DesktopUpdateManager";
import { ChatWorkspace } from "./components/ChatWorkspace";
import { LinkGuardProvider } from "./components/ui/LinkGuardProvider";
import { ToastViewport } from "./components/ui/ToastViewport";
import { WebLanding } from "./components/WebLanding";
import { type FriendsHomeTab } from "./components/workspace/FriendsHome";
import { type SettingsSectionId } from "./components/workspace/SettingsModal";
import { WindowTitleBar } from "./components/workspace/WindowTitleBar";
import { env } from "./lib/env";
import { isTauriDesktop } from "./lib/runtime";
import {
  normalizeProtectedPath,
  parseWorkspaceRoute,
  toMePath,
  toPathnameSearch,
  type ParsedWorkspaceRoute
} from "./lib/workspaceRouting";
import { useChatStore } from "./store/chatStore";

type ProtectedRedirectState = {
  from?: string;
};

type WorkspaceRoute =
  | { kind: "friends"; tab: FriendsHomeTab }
  | { kind: "dm"; dmId: string }
  | { kind: "server"; serverId: string; channelId: string | null }
  | { kind: "settings"; section: SettingsSectionId; from: string | null };
const DESKTOP_LAST_WORKSPACE_KEY = "catwa.desktop.lastWorkspacePath";
function isStandalonePWA(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return iosStandalone || window.matchMedia("(display-mode: standalone)").matches;
}

function BootingScreen() {
  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-[#11131f] text-slate-200">
      <img alt="Catwa" className="h-24 w-24 rounded-3xl object-contain" src="/logo.png" />
    </main>
  );
}

function DesktopRoot() {
  const appStatus = useChatStore((state) => state.appStatus);
  const wsConnected = useChatStore((state) => state.wsConnected);
  const selectedServerId = useChatStore((state) => state.selectedServerId);
  const selectedChannelId = useChatStore((state) => state.selectedChannelId);
  const selectedDMId = useChatStore((state) => state.selectedDMId);
  const servers = useChatStore((state) => state.servers);
  const dms = useChatStore((state) => state.dms);
  const loadingServers = useChatStore((state) => state.loadingServers);
  const loadingChannels = useChatStore((state) => state.loadingChannels);
  const loadingDMs = useChatStore((state) => state.loadingDMs);
  const selectServer = useChatStore((state) => state.selectServer);
  const selectChannel = useChatStore((state) => state.selectChannel);
  const selectDM = useChatStore((state) => state.selectDM);
  const clearSelectedDM = useChatStore((state) => state.clearSelectedDM);
  const desktopRestoreDoneRef = useRef(false);

  useEffect(() => {
    if (appStatus !== "authenticated") {
      desktopRestoreDoneRef.current = false;
      return;
    }

    const path = selectedServerId
      ? toPathnameSearch({
          kind: "server",
          serverId: selectedServerId,
          channelId: selectedChannelId
        })
      : selectedDMId
        ? toPathnameSearch({
            kind: "dm",
            dmId: selectedDMId
          })
        : "/channels/@me";

    window.localStorage.setItem(DESKTOP_LAST_WORKSPACE_KEY, path);
  }, [appStatus, selectedChannelId, selectedDMId, selectedServerId]);

  useEffect(() => {
    if (appStatus !== "authenticated" || desktopRestoreDoneRef.current) {
      return;
    }

    const normalizedPath = normalizeProtectedPath(window.localStorage.getItem(DESKTOP_LAST_WORKSPACE_KEY));
    if (!normalizedPath) {
      desktopRestoreDoneRef.current = true;
      return;
    }

    let parsedRoute: ParsedWorkspaceRoute | null = null;
    try {
      const parsedURL = new URL(normalizedPath, "http://catwa.local");
      parsedRoute = parseWorkspaceRoute(parsedURL.pathname, parsedURL.search);
    } catch {
      parsedRoute = null;
    }

    if (!parsedRoute || parsedRoute.kind === "settings") {
      desktopRestoreDoneRef.current = true;
      return;
    }

    const restore = async () => {
      if (parsedRoute?.kind === "friends") {
        if (selectedServerId !== null) {
          await selectServer(null);
        } else if (selectedDMId !== null) {
          clearSelectedDM();
        }
        desktopRestoreDoneRef.current = true;
        return;
      }

      if (parsedRoute?.kind === "dm") {
        if (loadingDMs) {
          return;
        }

        if (dms.some((item) => item.conversationId === parsedRoute.dmId)) {
          if (selectedServerId !== null || selectedDMId !== parsedRoute.dmId) {
            await selectDM(parsedRoute.dmId);
          }
        }

        desktopRestoreDoneRef.current = true;
        return;
      }

      if (loadingServers) {
        return;
      }

      if (!servers.some((item) => item.id === parsedRoute.serverId)) {
        desktopRestoreDoneRef.current = true;
        return;
      }

      if (selectedServerId !== parsedRoute.serverId) {
        await selectServer(parsedRoute.serverId);
      }

      if (parsedRoute.channelId) {
        const latest = useChatStore.getState();
        const channels = latest.channelsByServer[parsedRoute.serverId] ?? [];
        if (channels.length === 0) {
          if (latest.loadingChannels || loadingChannels) {
            return;
          }
          desktopRestoreDoneRef.current = true;
          return;
        }

        if (channels.some((item) => item.id === parsedRoute.channelId) && latest.selectedChannelId !== parsedRoute.channelId) {
          await latest.selectChannel(parsedRoute.channelId);
        }
      }

      desktopRestoreDoneRef.current = true;
    };

    void restore();
  }, [
    appStatus,
    clearSelectedDM,
    dms,
    loadingChannels,
    loadingDMs,
    loadingServers,
    selectChannel,
    selectDM,
    selectServer,
    selectedDMId,
    selectedServerId,
    servers
  ]);

  if (appStatus === "booting") {
    return (
      <main className="flex min-h-[100dvh] flex-col overflow-hidden bg-slate-950 text-slate-200">
        <WindowTitleBar context="friends" subtitle="Oturum" title={APP_NAME} wsConnected={wsConnected} />
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <p className="text-sm">Oturum kontrol ediliyor...</p>
        </div>
      </main>
    );
  }

  if (appStatus === "unauthenticated") {
    return (
      <main className="flex min-h-[100dvh] flex-col overflow-hidden bg-slate-950 text-slate-100">
        <WindowTitleBar context="friends" subtitle="Giriş" title={APP_NAME} wsConnected={wsConnected} />
        <div className="min-h-0 flex-1">
          <AuthPanel appName={APP_NAME} />
        </div>
      </main>
    );
  }

  return <ChatWorkspace appName={APP_NAME} />;
}

function UnauthenticatedOnly({ children }: { children: JSX.Element }) {
  const appStatus = useChatStore((state) => state.appStatus);
  const location = useLocation();

  if (appStatus === "booting") {
    return <BootingScreen />;
  }
  if (appStatus === "authenticated") {
    const target = normalizeProtectedPath((location.state as ProtectedRedirectState | null)?.from) ?? "/channels/@me";
    return <Navigate replace to={target} />;
  }
  return children;
}

function AuthenticatedOnly({ children }: { children: JSX.Element }) {
  const appStatus = useChatStore((state) => state.appStatus);
  const location = useLocation();

  if (appStatus === "booting") {
    return <BootingScreen />;
  }
  if (appStatus !== "authenticated") {
    const from = `${location.pathname}${location.search}`;
    return <Navigate replace state={{ from }} to="/login" />;
  }
  return children;
}

function WebAuthPage({ mode }: { mode: "login" | "register" }) {
  const navigate = useNavigate();
  const location = useLocation();
  const clearError = useChatStore((state) => state.clearError);
  const setAuthMode = useChatStore((state) => state.setAuthMode);

  useEffect(() => {
    clearError();
    setAuthMode(mode);
  }, [clearError, mode, setAuthMode]);

  return (
    <main className="min-h-[100dvh] bg-slate-950 text-slate-100">
      <header className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6 sm:py-6">
        <Link className="text-lg font-semibold text-white transition hover:text-cyan-200" to="/">
          {APP_NAME}
        </Link>
        <div className="flex flex-wrap items-center justify-end gap-2 text-sm">
          <span className="text-slate-400">{mode === "login" ? "Hesabın yok mu?" : "Hesabın var mı?"}</span>
          <button
            className="rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-1.5 text-slate-200 transition hover:border-slate-500"
            onClick={() =>
              navigate(mode === "login" ? "/register" : "/login", {
                state: location.state
              })
            }
            type="button"
          >
            {mode === "login" ? "Kayıt ol" : "Giriş yap"}
          </button>
        </div>
      </header>

      <div className="flex min-h-[calc(100dvh-84px)] items-center justify-center px-4 pb-8 sm:min-h-[calc(100dvh-88px)]">
        <AuthPanel
          appName={APP_NAME}
          onModeChange={(nextMode) => {
            navigate(nextMode === "login" ? "/login" : "/register", {
              state: location.state
            });
          }}
          variant="card"
        />
      </div>
    </main>
  );
}

function WebWorkspaceRoute() {
  const navigate = useNavigate();
  const location = useLocation();

  const selectedServerId = useChatStore((state) => state.selectedServerId);
  const selectedChannelId = useChatStore((state) => state.selectedChannelId);
  const selectedDMId = useChatStore((state) => state.selectedDMId);
  const servers = useChatStore((state) => state.servers);
  const dms = useChatStore((state) => state.dms);
  const channelsByServer = useChatStore((state) => state.channelsByServer);
  const loadingServers = useChatStore((state) => state.loadingServers);
  const loadingChannels = useChatStore((state) => state.loadingChannels);
  const loadingDMs = useChatStore((state) => state.loadingDMs);
  const selectServer = useChatStore((state) => state.selectServer);
  const selectChannel = useChatStore((state) => state.selectChannel);
  const selectDM = useChatStore((state) => state.selectDM);
  const clearSelectedDM = useChatStore((state) => state.clearSelectedDM);

  const syncingFromRouteRef = useRef(false);
  const syncRunIdRef = useRef(0);
  const appliedRouteKeyRef = useRef<string | null>(null);
  const pendingRouteKeyRef = useRef<string | null>(null);
  const lastFriendsTabRef = useRef<FriendsHomeTab>("all");
  const routeKey = `${location.pathname}${location.search}`;

  const route = useMemo<WorkspaceRoute | null>(() => {
    const parsed = parseWorkspaceRoute(location.pathname, location.search);
    if (!parsed) {
      return null;
    }

    if (parsed.kind !== "settings") {
      return parsed;
    }

    const from = normalizeProtectedPath((location.state as ProtectedRedirectState | null)?.from);
    return {
      ...parsed,
      from: from && !from.startsWith("/settings/") ? from : null
    };
  }, [location.pathname, location.search, location.state]);

  useEffect(() => {
    if (location.pathname !== "/channels/@me" || !location.search) {
      return;
    }

    navigate("/channels/@me", {
      replace: true,
      state: location.state
    });
  }, [location.pathname, location.search, location.state, navigate]);

  useEffect(() => {
    if (!route || route.kind !== "friends") {
      return;
    }
    lastFriendsTabRef.current = route.tab;
  }, [route]);

  const deriveWorkspacePath = useCallback(
    (fallbackFriendsTab?: FriendsHomeTab) => {
      if (selectedServerId) {
        return toPathnameSearch({
          kind: "server",
          serverId: selectedServerId,
          channelId: selectedChannelId
        });
      }

      if (selectedDMId) {
        return toPathnameSearch({
          kind: "dm",
          dmId: selectedDMId
        });
      }

      return toMePath(fallbackFriendsTab ?? lastFriendsTabRef.current);
    },
    [selectedChannelId, selectedDMId, selectedServerId]
  );

  useEffect(() => {
    if (route) {
      return;
    }

    if (location.pathname.startsWith("/settings/")) {
      navigate("/settings/appearance", { replace: true });
      return;
    }

    navigate("/channels/@me", { replace: true });
  }, [location.pathname, navigate, route]);

  useEffect(() => {
    if (!route || route.kind === "settings") {
      syncingFromRouteRef.current = false;
      return;
    }

    const routeAlreadyApplied =
      appliedRouteKeyRef.current === routeKey && pendingRouteKeyRef.current !== routeKey;
    if (routeAlreadyApplied) {
      syncingFromRouteRef.current = false;
      return;
    }

    const runId = ++syncRunIdRef.current;
    syncingFromRouteRef.current = true;

    const sync = async () => {
      let pending = false;
      try {
        if (route.kind === "friends") {
          const state = useChatStore.getState();
          if (state.selectedServerId !== null) {
            await state.selectServer(null);
          } else if (state.selectedDMId !== null) {
            state.clearSelectedDM();
          }
          return;
        }

        if (route.kind === "dm") {
          const state = useChatStore.getState();
          const dmExists = state.dms.some((item) => item.conversationId === route.dmId);

          if (!dmExists) {
            if (state.loadingDMs || state.loadingServers) {
              pending = true;
              return;
            }
            navigate(toMePath(lastFriendsTabRef.current), { replace: true });
            return;
          }

          if (state.selectedServerId !== null || state.selectedDMId !== route.dmId) {
            await state.selectDM(route.dmId);
          }
          return;
        }

        const state = useChatStore.getState();
        const serverExists = state.servers.some((item) => item.id === route.serverId);
        if (!serverExists) {
          if (state.loadingServers) {
            pending = true;
            return;
          }

          navigate(toMePath(lastFriendsTabRef.current), { replace: true });
          return;
        }

        if (state.selectedServerId !== route.serverId) {
          await state.selectServer(route.serverId);
        }

        if (!route.channelId) {
          return;
        }

        const latest = useChatStore.getState();
        const channels = latest.channelsByServer[route.serverId] ?? [];
        if (channels.length === 0) {
          if (latest.loadingChannels) {
            pending = true;
            return;
          }

          navigate(
            toPathnameSearch({
              kind: "server",
              serverId: route.serverId,
              channelId: null
            }),
            { replace: true }
          );
          return;
        }

        const channelExists = channels.some((item) => item.id === route.channelId);
        if (!channelExists) {
          navigate(
            toPathnameSearch({
              kind: "server",
              serverId: route.serverId,
              channelId: channels[0].id
            }),
            { replace: true }
          );
          return;
        }

        if (latest.selectedChannelId !== route.channelId) {
          await latest.selectChannel(route.channelId);
        }
      } finally {
        if (syncRunIdRef.current !== runId) {
          return;
        }

        if (pending) {
          pendingRouteKeyRef.current = routeKey;
          syncingFromRouteRef.current = true;
          return;
        }

        appliedRouteKeyRef.current = routeKey;
        pendingRouteKeyRef.current = null;
        syncingFromRouteRef.current = false;
      }
    };

    void sync();
  }, [channelsByServer, dms, loadingChannels, loadingDMs, loadingServers, navigate, route, routeKey, servers]);

  useEffect(() => {
    if (!route || route.kind === "settings") {
      return;
    }
    if (syncingFromRouteRef.current) {
      return;
    }

    const currentPath = `${location.pathname}${location.search}`;
    const desiredPath = deriveWorkspacePath(route.kind === "friends" ? route.tab : lastFriendsTabRef.current);
    if (currentPath === desiredPath) {
      return;
    }

    navigate(desiredPath);
  }, [
    deriveWorkspacePath,
    loadingChannels,
    loadingDMs,
    loadingServers,
    location.pathname,
    location.search,
    navigate,
    route,
    selectedChannelId,
    selectedDMId,
    selectedServerId,
    servers,
    dms,
    channelsByServer
  ]);

  const handleFriendsTabChange = useCallback(
    (tab: FriendsHomeTab) => {
      lastFriendsTabRef.current = tab;
      const nextPath = toMePath(tab);
      const currentPath = `${location.pathname}${location.search}`;
      if (nextPath === currentPath) {
        return;
      }
      navigate(nextPath);
    },
    [location.pathname, location.search, navigate]
  );

  const handleRequestOpenSettings = useCallback(
    (section: SettingsSectionId) => {
      const from =
        route?.kind === "settings"
          ? route.from ?? deriveWorkspacePath()
          : normalizeProtectedPath(`${location.pathname}${location.search}`) ?? deriveWorkspacePath();

      navigate(`/settings/${section}`, {
        replace: route?.kind === "settings",
        state: { from }
      });
    },
    [deriveWorkspacePath, location.pathname, location.search, navigate, route]
  );

  const handleRequestCloseSettings = useCallback(() => {
    if (route?.kind !== "settings") {
      return;
    }

    const target = route.from ?? deriveWorkspacePath();
    navigate(target, { replace: true });
  }, [deriveWorkspacePath, navigate, route]);

  if (!route) {
    return <BootingScreen />;
  }

  return (
    <ChatWorkspace
      appName={APP_NAME}
      forcedSettingsSection={route.kind === "settings" ? route.section : null}
      onRequestCloseSettings={handleRequestCloseSettings}
      onRequestOpenSettings={handleRequestOpenSettings}
    />
  );
}

function WebRouterRoot() {
  const appStatus = useChatStore((state) => state.appStatus);
  const pwaStandalone = useMemo(() => isStandalonePWA(), []);

  if (appStatus === "booting") {
    return <BootingScreen />;
  }

  return (
    <Routes>
      <Route
        element={
          pwaStandalone ? (
            <Navigate replace to="/channels/@me" />
          ) : (
            <WebLanding
              appName={APP_NAME}
              downloadUrl={env.downloads.stable}
              windowsSupport={env.windowsSupport}
            />
          )
        }
        path="/"
      />
      <Route
        element={
          <UnauthenticatedOnly>
            <WebAuthPage mode="login" />
          </UnauthenticatedOnly>
        }
        path="/login"
      />
      <Route
        element={
          <UnauthenticatedOnly>
            <WebAuthPage mode="register" />
          </UnauthenticatedOnly>
        }
        path="/register"
      />
      <Route
        element={
          <AuthenticatedOnly>
            <WebWorkspaceRoute />
          </AuthenticatedOnly>
        }
        path="/channels/*"
      />
      <Route
        element={
          <AuthenticatedOnly>
            <WebWorkspaceRoute />
          </AuthenticatedOnly>
        }
        path="/settings/:section"
      />
      <Route element={<Navigate replace to="/settings/appearance" />} path="/settings" />
      <Route element={<Navigate replace to="/" />} path="*" />
    </Routes>
  );
}

function WebAppWithLinkGuard() {
  const navigate = useNavigate();
  return (
    <LinkGuardProvider navigateInternal={(path) => navigate(path)}>
      <WebRouterRoot />
    </LinkGuardProvider>
  );
}

function App() {
  const desktop = isTauriDesktop();
  const initialize = useChatStore((state) => state.initialize);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  useEffect(() => {
    const disableNativeContextMenu = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('[data-allow-native-context-menu="true"]')) {
        return;
      }
      event.preventDefault();
    };

    document.addEventListener("contextmenu", disableNativeContextMenu);
    return () => {
      document.removeEventListener("contextmenu", disableNativeContextMenu);
    };
  }, []);

  if (desktop) {
    return (
      <>
        <LinkGuardProvider>
          <DesktopRoot />
        </LinkGuardProvider>
        <DesktopUpdateManager />
        <ToastViewport />
      </>
    );
  }

  return (
    <>
      <BrowserRouter>
        <WebAppWithLinkGuard />
      </BrowserRouter>
      <ToastViewport />
    </>
  );
}

export default App;
