/* ==========================================================================
   UI v2 — Yapılandırma Kalıcılık Servisi (localStorage + /api/v2/config)
   ========================================================================== */

const STORAGE_KEY = 'thm_uiv2_state_v3';

export function loadLocalConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function fetchServerConfig() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    const res = await fetch('/api/v2/config', { cache: 'no-store', signal: controller.signal });
    clearTimeout(timeoutId);
    if (!res.ok) return null;
    const data = await res.json();
    if (data && Array.isArray(data.widgets) && data.widgets.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      return data;
    }
    return null;
  } catch {
    return null;
  }
}

let saveTimer = null;

export function saveConfig(configObj) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(configObj));
  } catch { /* ignore */ }

  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      await fetch('/api/v2/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(configObj),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
    } catch { /* ignore network errors */ }
  }, 250);
}

