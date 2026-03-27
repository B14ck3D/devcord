import React from 'react';
import { Plus, Terminal } from 'lucide-react';
import { Tooltip } from '../components/ui/Tooltip';

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
  isAction,
}: {
  active: boolean;
  title: string;
  unread?: boolean;
  onClick: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  children: React.ReactNode;
  isAction?: boolean;
}) {
  return (
    <Tooltip label={title}>
      <div className="relative flex items-center group/server mb-2 cursor-pointer">
      {/* Selection pill */}
      <div
        className="absolute -left-3 rounded-r-full bg-white transition-all duration-300 ease-out"
        style={{
          width: 4,
          height: active ? 40 : unread ? 8 : 0,
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
          transition-all duration-300 cursor-pointer
          overflow-hidden flex-shrink-0
          ${active
            ? 'rounded-[16px] bg-[#5865F2] text-white shadow-lg shadow-[#5865F2]/25'
            : isAction
              ? 'rounded-[24px] hover:rounded-[16px] bg-[#313338] text-emerald-500 hover:bg-emerald-500 hover:text-white'
              : 'rounded-[24px] hover:rounded-[16px] bg-[#313338] text-zinc-300 hover:bg-[#5865F2] hover:text-white'
          }
        `}
        aria-label={title}
      >
        {children}
      </button>
      </div>
    </Tooltip>
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
      className="flex flex-col items-center py-3 overflow-y-auto overflow-x-hidden"
      style={{ width: 72, flexShrink: 0, background: '#1e1f22' }}
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
        className="w-8 h-[2px] bg-[#35363c] rounded-full flex-shrink-0 my-2"
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
      <ServerButton active={false} title="Dodaj serwer" onClick={onAddServer} isAction>
        <Plus size={22} />
      </ServerButton>
    </nav>
  );
}
