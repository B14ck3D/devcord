import React from 'react';

export function ChannelSidebar({
  onContextMenu,
  children,
}: {
  onContextMenu: (e: React.MouseEvent) => void;
  children: React.ReactNode;
}) {
  return (
    <aside
      onContextMenu={onContextMenu}
      className="flex flex-col overflow-hidden rounded-tl-md3-lg rounded-bl-md3-lg flex-shrink-0"
      style={{
        width: 'var(--layout-width-channel-sidebar)',
        background: 'var(--md-sys-color-surface-container-low)',
        color: 'var(--md-sys-color-on-surface)',
      }}
    >
      {children}
    </aside>
  );
}
