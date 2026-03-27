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
      className="flex flex-col overflow-hidden rounded-tl-2xl rounded-bl-2xl flex-shrink-0 bg-[#2b2d31] text-[#dbdee1]"
      style={{
        width: 'var(--layout-width-channel-sidebar)',
      }}
    >
      {children}
    </aside>
  );
}
