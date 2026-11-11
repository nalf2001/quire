// Preferences are kept in localStorage, which can throw: site data blocked in the browser edition, or no room
// left. A preference then reads as unset, or isn't remembered, instead of taking the reader down with it.

export function readSetting(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

/** Returns whether the value was saved. */
export function writeSetting(key: string, value: string): boolean {
  try { localStorage.setItem(key, value); return true; } catch { return false; }
}

// "Don't keep documents" mode: nothing about an opened document is written to this device (Recent copies,
// annotations, chats, version history, reading position). It applies to what is saved from now on.
const PRIVATE_KEY = "folio:no-store";
const privateListeners = new Set<() => void>();

export function isPrivateMode() { return memoryPrivate ?? readSetting(PRIVATE_KEY) === "1"; }

export function setPrivateMode(on: boolean) {
  // If the preference can't be saved, keep it for this session so nothing is written meanwhile.
  if (!writeSetting(PRIVATE_KEY, on ? "1" : "0")) memoryPrivate = on;
  privateListeners.forEach(listener => listener());
}
let memoryPrivate: boolean | null = null;

export function subscribePrivateMode(listener: () => void) {
  privateListeners.add(listener);
  return () => { privateListeners.delete(listener); };
}
