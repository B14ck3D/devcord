import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = {
  children: ReactNode;
};

type State = {
  hasError: boolean;
  message: string;
};

export class ErrorBoundary extends Component<Props, State> {
  state: State = {
    hasError: false,
    message: '',
  };

  static getDerivedStateFromError(error: unknown): State {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : 'Unknown runtime error',
    };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    if (typeof console !== 'undefined') {
      console.error('[devcord-ui] uncaught render error', error, info.componentStack);
    }
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0f25] p-6 text-white">
        <div className="w-full max-w-xl rounded-xl border border-red-500/30 bg-red-500/10 p-5">
          <h1 className="text-base font-bold text-red-300">Aplikacja napotkała krytyczny błąd</h1>
          <p className="mt-2 text-sm text-zinc-200">
            Odśwież stronę. Jeśli błąd wraca, sprawdź logi konsoli i zgłoś problem.
          </p>
          <pre className="mt-3 overflow-auto rounded-lg bg-black/35 p-3 text-xs text-red-200">
            {this.state.message}
          </pre>
        </div>
      </div>
    );
  }
}
