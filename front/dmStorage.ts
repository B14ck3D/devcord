export type DmRow = {
  id: string;
  userId: string;
  time: string;
  content: string;
};

const KEY = 'devcord_dm_v1';

export function loadDmStore(): Record<string, DmRow[]> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const p = JSON.parse(raw) as Record<string, DmRow[]>;
    return p && typeof p === 'object' ? p : {};
  } catch {
    return {};
  }
}

export function saveDmStore(store: Record<string, DmRow[]>) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* ignore */
  }
}

/** Klucz konwersacji dla pary użytkowników (deterministyczny). */
export function dmThreadKey(myId: string, peerId: string): string {
  return [myId, peerId].sort().join(':');
}
