import React from 'react';

export function MemberColumn({ children }: { children: React.ReactNode }) {
  return (
    <aside
      className="flex flex-col overflow-hidden rounded-r-2xl flex-shrink-0 bg-[#2b2d31] text-[#dbdee1] border-l border-[#1e1f22]"
      style={{
        width: 248,
      }}
    >
      {children}
    </aside>
  );
}
