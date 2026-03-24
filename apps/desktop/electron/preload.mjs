import { contextBridge, ipcRenderer } from "electron";

const bridge = {
  isDesktopRuntime: true,
  getAppVersion: () => ipcRenderer.invoke("catwa:get-app-version"),
  windowMinimize: () => ipcRenderer.invoke("catwa:window-minimize"),
  windowToggleMaximize: () => ipcRenderer.invoke("catwa:window-toggle-maximize"),
  windowClose: () => ipcRenderer.invoke("catwa:window-close"),
  windowFocus: () => ipcRenderer.invoke("catwa:window-focus"),
  setBadgeCount: (count) => ipcRenderer.invoke("catwa:set-badge-count", count),
  requestUserAttention: () => ipcRenderer.invoke("catwa:request-user-attention"),
  openExternalUrl: (url) => ipcRenderer.invoke("catwa:open-external-url", url),
  secureStoreGet: (key) => ipcRenderer.invoke("catwa:secure-store-get", key),
  secureStoreSet: (key, value) => ipcRenderer.invoke("catwa:secure-store-set", key, value),
  secureStoreDelete: (key) => ipcRenderer.invoke("catwa:secure-store-delete", key),
  readStartupConfiguration: () => ipcRenderer.invoke("catwa:startup-read"),
  configureStartup: (enabled, startMinimized) => ipcRenderer.invoke("catwa:startup-configure", enabled, startMinimized),
  listScreenShareSources: () => ipcRenderer.invoke("catwa:screen-share-list-sources"),
  nativeFetch: (request) => ipcRenderer.invoke("catwa:native-fetch", request),
  isUpdaterSupported: () => ipcRenderer.invoke("catwa:updater-is-supported"),
  checkForUpdates: (headers) => ipcRenderer.invoke("catwa:updater-check", headers ?? {}),
  downloadUpdate: () => ipcRenderer.invoke("catwa:updater-download"),
  installUpdateAndRelaunch: () => ipcRenderer.invoke("catwa:updater-install-and-relaunch")
};

contextBridge.exposeInMainWorld("__CATWA_ELECTRON__", bridge);
