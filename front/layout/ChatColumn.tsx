import React from 'react';

export function ChatColumn({ children }: { children: React.ReactNode }) {
  return (
    <main
      className="flex flex-col flex-1 min-w-0 overflow-hidden"
      style={{ background: 'var(--md-sys-color-surface-container-low)' }}
    >
      {children}
    </main>
  );
}
