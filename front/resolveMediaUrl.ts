/** Pełny URL do avatara / banera gdy API zwraca ścieżkę względną (unika 404 na froncie). */
export function resolveMediaUrl(apiBase: string, url: string | undefined | null): string | undefined {
  const u = url?.trim();
  if (!u) return undefined;
  if (/^(https?:|data:|blob:)/i.test(u)) return u;
  try {
    const base = apiBase.replace(/\/$/, '');
    const origin = new URL(base, typeof window !== 'undefined' ? window.location.origin : 'http://localhost').origin;
    if (u.startsWith('/')) return `${origin}${u}`;
    return `${origin}/${u}`;
  } catch {
    return u;
  }
}
