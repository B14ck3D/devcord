/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_WS_URL?: string;
  readonly VITE_CHAT_WS_URL?: string;
  readonly VITE_DEV_HTTPS?: string;
  readonly VITE_PREVIEW_HTTPS?: string;
  /** Pełny origin z proxy /voice (gdy front bez wspólnego nginx z signaling) */
  readonly VITE_VOICE_HTTP_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
