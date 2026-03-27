import React from 'react';
import { Plus, Terminal } from 'lucide-react';

export type ServerRailServer = {
  id: string;
  name: string;
  color?: string;
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  iconUrl?: string;
  unread?: boolean;
};

type ServerRailProps = {
  activeServerId: string;
  personalActive: boolean;
  onSelectPersonal: () => void;
  onSelectServer: (id: string) => void;
  onAddServer: () => void;
  servers: ServerRailServer[];
  onContextMenuServer?: (e: React.MouseEvent, server: ServerRailServer) => void;
};

function ServerButton({
  active,
  title,
  unread,
  onClick,
  onContextMenu,
  children,
}: {
  active: boolean;
  title: string;
  unread?: boolean;
  onClick: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex items-center group/server" title={title}>
      {/* Selection pill */}
      <div
        className="absolute left-0 rounded-r-full bg-on-surface transition-all duration-200"
        style={{
          width: 4,
          height: active ? 36 : unread ? 8 : 0,
          top: '50%',
          transform: 'translateY(-50%)',
          opacity: active || unread ? 1 : 0,
        }}
      />
      <button
        type="button"
        onClick={onClick}
        onContextMenu={onContextMenu}
        className={`
          relative mx-auto w-12 h-12 flex items-center justify-center
          transition-all duration-200 cursor-pointer
          overflow-hidden flex-shrink-0
          ${active
            ? 'rounded-md3-md bg-primary-container text-on-primary-container'
            : 'rounded-md3-xl hover:rounded-md3-md bg-surf-ch text-on-surface hover:bg-primary-container hover:text-on-primary-container'
          }
        `}
        aria-label={title}
      >
        {children}
      </button>
    </div>
  );
}

export function ServerRail({
  activeServerId,
  personalActive,
  onSelectPersonal,
  onSelectServer,
  onAddServer,
  servers,
  onContextMenuServer,
}: ServerRailProps) {
  return (
    <nav
      className="flex flex-col items-center gap-2 py-3 overflow-y-auto overflow-x-hidden"
      style={{ width: 68, flexShrink: 0, background: '#191919' }}
    >
      {/* Personal / Home */}
      <ServerButton
        active={personalActive}
        title="Terminal osobisty"
        onClick={onSelectPersonal}
      >
        <Terminal size={22} />
      </ServerButton>

      {/* Divider */}
      <div
        className="w-8 h-px bg-outline-variant rounded-full flex-shrink-0"
        style={{ margin: '2px auto' }}
      />

      {/* Servers */}
      {servers.map((s) => (
        <ServerButton
          key={s.id}
          active={!personalActive && activeServerId === s.id}
          title={s.name}
          unread={s.unread}
          onClick={() => onSelectServer(s.id)}
          onContextMenu={onContextMenuServer ? (e) => { e.preventDefault(); onContextMenuServer(e, s); } : undefined}
        >
          {s.iconUrl ? (
            <img src={s.iconUrl} alt={s.name} className="w-full h-full object-cover" />
          ) : s.icon ? (
            <s.icon size={22} />
          ) : (
            <span className="text-sm font-bold leading-none select-none">
              {s.name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()}
            </span>
          )}
        </ServerButton>
      ))}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Add server */}
      <ServerButton active={false} title="Dodaj serwer" onClick={onAddServer}>
        <Plus size={22} />
      </ServerButton>
    </nav>
  );
}
