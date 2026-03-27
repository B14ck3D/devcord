/// <reference types="vite/client" />

type InstallState =
  | 'idle'
  | 'checking'
  | 'downloading'
  | 'extracting'
  | 'creating_shortcuts'
  | 'launching'
  | 'done'
  | 'error';

type InstallEvent = {
  state: InstallState;
  message: string;
  progress?: number;
  detail?: string;
};

interface Window {
  bootstrapper?: {
    startInstall: () => Promise<{ ok: boolean; error?: string }>;
    onStatus: (listener: (event: InstallEvent) => void) => () => void;
  };
}

