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
  electronAPI?: {
    minimizeWindow: () => Promise<{ ok: boolean }>;
    closeWindow: () => Promise<{ ok: boolean }>;
    onInstallProgress: (listener: (data: { progress: number; status: string; state?: InstallState; detail?: string }) => void) => () => void;
    onInstallError: (listener: (err: string) => void) => () => void;
    onInstallComplete: (listener: () => void) => () => void;
  };
  bootstrapper?: {
    startInstall: (payload?: { installRoot?: string; cleanInstallRoot?: boolean }) => Promise<{ ok: boolean; error?: string }>;
    pickInstallDir: () => Promise<{ ok: boolean; path?: string }>;
    getInstallationState: (payload?: { installRoot?: string }) => Promise<{
      installed: boolean;
      installRoot: string;
      appDir: string;
      exePath?: string;
    }>;
    uninstall: (payload?: { installRoot?: string }) => Promise<{ ok: boolean; error?: string }>;
    onStatus: (listener: (event: InstallEvent) => void) => () => void;
    onInstallProgress: (listener: (data: { progress: number; status: string; state?: InstallState; detail?: string }) => void) => () => void;
    onInstallError: (listener: (payload: string) => void) => () => void;
    onInstallComplete: (listener: () => void) => () => void;
    openLogFile: () => Promise<{ ok: boolean; error?: string; path?: string }>;
  };
}

