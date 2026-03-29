const DEFAULT_API_BASE = 'https://devcord.ndevelopment.org/api';

function normalize(url: string): string {
  return url.replace(/\/+$/, '');
}

export function resolveApiBaseUrl(raw: string | undefined): string {
  const input = (raw ?? '').trim();
  if (!input) return normalize(DEFAULT_API_BASE);

  const isAbsolute = /^https?:\/\//i.test(input);
  if (isAbsolute) return normalize(input);

  if (typeof window !== 'undefined' && window.location.protocol === 'file:') {
    // In packaged Electron (file://) relative /api is invalid.
    return normalize(DEFAULT_API_BASE);
  }

  if (input.startsWith('/')) {
    if (typeof window !== 'undefined' && /^https?:$/i.test(window.location.protocol)) {
      return normalize(`${window.location.origin}${input}`);
    }
    return normalize(DEFAULT_API_BASE);
  }

  return normalize(DEFAULT_API_BASE);
}

