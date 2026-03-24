import { useEffect, useState } from "react";
import { type AppPreferences, loadAppPreferences, UI_PREFERENCES_EVENT } from "./uiPreferences";

export function useAppPreferences(): AppPreferences {
  const [preferences, setPreferences] = useState<AppPreferences>(() => loadAppPreferences());

  useEffect(() => {
    const sync = () => {
      setPreferences(loadAppPreferences());
    };

    const onPreferencesEvent = () => {
      sync();
    };

    const onStorage = (event: StorageEvent) => {
      if (!event.key || event.key.startsWith("catwa.uiPreferences")) {
        sync();
      }
    };

    window.addEventListener(UI_PREFERENCES_EVENT, onPreferencesEvent as EventListener);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(UI_PREFERENCES_EVENT, onPreferencesEvent as EventListener);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return preferences;
}
