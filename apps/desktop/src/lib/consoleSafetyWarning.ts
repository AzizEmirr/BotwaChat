type ConsoleWindow = Window & {
  __catwaConsoleSafetyWarningShown?: boolean;
};

function safeLog(method: "log" | "warn", ...args: unknown[]) {
  if (typeof console === "undefined" || typeof console[method] !== "function") {
    return;
  }
  console[method](...args);
}

export function showConsoleSafetyWarning() {
  if (typeof window === "undefined") {
    return;
  }

  const target = window as ConsoleWindow;
  if (target.__catwaConsoleSafetyWarningShown) {
    return;
  }
  target.__catwaConsoleSafetyWarningShown = true;

  safeLog(
    "log",
    "%cBekle!",
    "font-size:64px; font-weight:900; color:#5865f2; letter-spacing:1px; text-shadow:0 0 10px rgba(88,101,242,0.3);"
  );
  safeLog(
    "warn",
    "Burada birisi sana bir şeyi kopyala/yapıştır yapmanı söylediyse 11/10 ihtimalle dolandırılıyorsun."
  );
  safeLog(
    "warn",
    "%cBurada bir şeyi yapıştırmak saldırganlara Catwa hesabının erişimini verebilir.",
    "font-size:28px; font-weight:900; color:#ff2d2d;"
  );
  safeLog("warn", "Ne yaptığından tam olarak emin değilsen, bu pencereyi kapat ve güvende kal.");
}
