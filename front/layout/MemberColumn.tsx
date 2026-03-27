import React from 'react';

export function MemberColumn({ children }: { children: React.ReactNode }) {
  return (
    <aside
      className="flex flex-col overflow-hidden rounded-md3-lg flex-shrink-0"
      style={{
        width: 248,
        background: 'var(--md-sys-color-surface-container-low)',
        color: 'var(--md-sys-color-on-surface)',
      }}
    >
      {children}
    </aside>
  );
}
