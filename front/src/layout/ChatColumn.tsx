import React from 'react';

export function ChatColumn({ children }: { children: React.ReactNode }) {
  return (
    <main
      className="flex flex-col flex-1 min-w-0 overflow-hidden relative bg-[#313338] z-10 shadow-[-4px_0_24px_rgba(0,0,0,0.2)]"
    >
      {children}
    </main>
  );
}
