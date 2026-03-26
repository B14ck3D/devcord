/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_CHAT_WS_URL?: string;
  readonly VITE_DEV_HTTPS?: string;
  readonly VITE_PREVIEW_HTTPS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
