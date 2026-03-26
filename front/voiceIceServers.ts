/** STUN/TURN dla mesha WebRTC — VITE_ICE_SERVERS_JSON ma pierwszeństwo (tablica RTCIceServer). */
export function buildRtcIceServers(): RTCIceServer[] {
  const raw = (import.meta.env.VITE_ICE_SERVERS_JSON as string | undefined)?.trim();
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed as RTCIceServer[];
      }
    } catch {
      /* ignore */
    }
  }
  const turnUrls = (import.meta.env.VITE_TURN_URLS as string | undefined)?.trim();
  if (turnUrls) {
    const username = (import.meta.env.VITE_TURN_USERNAME as string | undefined) ?? '';
    const credential = (import.meta.env.VITE_TURN_CREDENTIAL as string | undefined) ?? '';
    const list = turnUrls
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((urls) => ({ urls, username, credential }));
    return [{ urls: 'stun:stun.l.google.com:19302' }, ...list];
  }
  return [{ urls: 'stun:stun.l.google.com:19302' }];
}
