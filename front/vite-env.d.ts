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

type DevcordShortcutAction = 'toggle-mute' | 'toggle-deafen';

type DevcordDesktopSourceInfo = {
  id: string;
  name: string;
  displayId: string;
  thumbnailDataUrl: string;
  appIconDataUrl: string;
};

interface Window {
  devcordDesktop?: {
    isElectron: boolean;
    listScreenSources: () => Promise<DevcordDesktopSourceInfo[]>;
    getAppVersion: () => Promise<string>;
    onShortcutAction: (
      listener: (payload: { action: DevcordShortcutAction }) => void,
    ) => () => void;
    onUpdaterStatus: (listener: (payload: unknown) => void) => () => void;
  };
}
