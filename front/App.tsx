import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useVoiceRoom } from './useVoiceRoom';
import { 
  Send, Search, Plus, ArrowUpRight, Hash, Volume2, 
  Phone, Video, Users, UserPlus, Settings, Mic, 
  Headphones, MessageSquare, Compass, Shield,
  Crown, Terminal, Sparkles, Code, Coffee, Radio, Zap,
  ChevronsUpDown, Check, Maximize2, Minimize2, Bookmark,
  ListTodo, Bold, Italic, Code as CodeIcon, Link, FileText, Image as ImageIcon,
  Command as CmdIcon, User, Moon, LogOut, 
  X, MicOff, PhoneOff, Palette, BellRing, MessageSquareShare,
  UploadCloud, Copy, Smile, Rocket, MonitorPlay, Fingerprint, Award,
  MoreVertical, Sliders, ShieldAlert, Activity, Edit3, Pin, HelpCircle,
  Layout, LayoutGrid, Maximize, Share2, Layers, Play, Pause, Disc, TerminalSquare, Cpu,
  FastForward, Rewind, Server, ChevronDown, Bell, ArrowLeft, MousePointer2, Hand, Type, Square, Circle,
  Calendar, CheckSquare, BarChart2, Clock, TrendingUp, Target, GitBranch, Github, CheckCircle2, Paperclip, Trello,
  FolderArchive, FileVideo, FileCode, MoreHorizontal, PhoneCall, Trash2, BellOff, UserCog, Link2, Reply,
  Lock, ShieldCheck, EyeOff, SlidersHorizontal, AlertTriangle, Monitor, Smartphone, Type as TypeIcon
} from 'lucide-react';

// --- MOCK HOOK (dla podglądu na żywo) ---
function useVoiceRoom({ enabled, roomId, userId, micDeviceId }: any) {
  return {
    phase: enabled ? 'connected' : 'idle',
    error: null,
    participants: [],
    localMuted: false,
    setLocalMuted: () => {},
  };
}

// --- ROZBUDOWANE MOCK DATA ---
const mockServers = [
  { id: 's1', name: 'Flux^ Main', icon: Zap, active: true, color: '#00ffcc', glow: '0 0 15px rgba(0,255,204,0.4)' },
  { id: 's2', name: 'Projekt Alfa', icon: Code, hasNotification: true, color: '#ff0055', glow: '0 0 15px rgba(255,0,85,0.4)' },
  { id: 's3', name: 'Strefa Designu', icon: Palette, hasNotification: false, color: '#b266ff', glow: '0 0 15px rgba(178,102,255,0.4)' },
];

const mockChannels = [
  { id: 'c1', name: 'Główny Flux', type: 'text', unread: true, color: '#00ffcc', icon: Hash, aiSummary: "Trwa dyskusja o nowym UI" },
  { id: 'c2', name: 'Ogłoszenia Systemowe', type: 'text', color: '#ff0055', icon: Shield, aiSummary: "Nowy update v2.0" },
  { id: 'c3', name: 'Flux Devs', type: 'text', color: '#b266ff', icon: Coffee, aiSummary: "Debugowanie Sandboxa" },
  { id: 'v1', name: 'Strefa Głosowa', type: 'voice', color: '#a1a1aa', icon: Radio },
  { id: 'v2', name: 'Focus Mode', type: 'voice', color: '#ff9900', icon: Headphones },
];

const mockRoles = [
  { id: 'r1', name: 'Zarząd', color: '#ff0055', icon: Crown },
  { id: 'r2', name: 'Lead Developer', color: '#00ffcc', icon: Terminal },
  { id: 'r3', name: 'Design', color: '#b266ff', icon: Sparkles },
  { id: 'r4', name: 'Użytkownicy', color: '#a1a1aa', icon: Users },
];

const mockUsers = [
  { id: 'u1', name: 'Admin', roleId: 'r1', status: 'dnd' as const, bio: 'Zarządzanie infrastrukturą węzłów.' },
  { id: 'u2', name: 'Kamil_Dev', roleId: 'r2', status: 'online' as const, bio: 'Piszę w Pythonie i wdrażam innowacje.' },
  { id: 'u3', name: 'Anna_UX', roleId: 'r3', status: 'idle' as const, bio: 'Tworzę portale do innych wymiarów (UI/UX).' },
  { id: 'u4', name: 'Piotr', roleId: 'r4', status: 'offline' as const, bio: 'Nowy użytkownik systemu.' },
];

const mockNotifications = [
  { id: 1, text: "Flux-AI zoptymalizował Twój ostatni skrypt.", time: "2 min temu", icon: Sparkles, color: "#b266ff", unread: true },
  { id: 2, text: "Admin wspomniał o Tobie w #Główny Flux", time: "1 godz temu", icon: BellRing, color: "#ff0055", unread: true },
  { id: 3, text: "Węzeł 'Projekt Alfa' został zaktualizowany.", time: "Wczoraj", icon: Server, color: "#00ffcc", unread: false },
];

const MIC_STORAGE_KEY = 'flux_mic_device';
const SESSION_KEY = 'flux_guest_id';

function guestSessionId(): string {
  let id = sessionStorage.getItem(SESSION_KEY);
  if (!id) {
    id = 'fx_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    sessionStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

type PollOption = { id: string; text: string; votes: number; myVote?: boolean };
type GithubData = { repo: string; prName: string; prNumber: number; status: 'merged' | 'open' | 'closed' };
type TicketData = { id: string; title: string; priority: 'high' | 'medium' | 'low'; status: 'in_progress' | 'done' | 'todo' };

type ChatRow = {
  id: string | number;
  userId: string;
  time: string;
  content: string;
  type?: 'text' | 'voice' | 'code' | 'poll' | 'system' | 'github' | 'ticket';
  isMe?: boolean;
  reactions?: { emoji: string; count: number; active?: boolean }[];
  voiceDuration?: string;
  codeLang?: string;
  pollOptions?: PollOption[];
  totalVotes?: number;
  githubData?: GithubData;
  ticketData?: TicketData;
};

type ContextMenuData = {
  x: number;
  y: number;
  type: 'server' | 'channel' | 'user' | 'message';
  targetId: string | number;
} | null;

// --- CUSTOMOWE KOMPONENTY UI ---

const CustomToggle = ({ active, onClick, accentColor }: { active: boolean, onClick: () => void, accentColor: string }) => (
  <button 
    onClick={onClick}
    className={`w-12 h-6 rounded-full relative transition-colors duration-300 border ${active ? 'border-transparent' : 'border-white/[0.1] bg-black/50'}`}
    style={{ backgroundColor: active ? `${accentColor}30` : undefined, borderColor: active ? accentColor : undefined }}
  >
    <div 
      className={`absolute top-0.5 w-5 h-5 rounded-full transition-all duration-300 shadow-md ${active ? 'left-6 bg-white' : 'left-0.5 bg-zinc-500'}`} 
      style={active ? { boxShadow: `0 0 10px ${accentColor}` } : {}}
    />
  </button>
);

const CustomSlider = ({ value, min, max, onChange, accentColor, step = 1 }: { value: number, min: number, max: number, onChange: (v: number) => void, accentColor: string, step?: number }) => {
  const percentage = ((value - min) / (max - min)) * 100;
  return (
    <div className="relative w-full h-8 flex items-center group cursor-pointer">
      <input 
        type="range" min={min} max={max} step={step} value={value} 
        onChange={(e) => onChange(Number(e.target.value))} 
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20" 
      />
      <div className="w-full h-2 bg-black border border-white/[0.1] rounded-full overflow-hidden relative z-0">
        <div className="absolute top-0 left-0 h-full transition-all duration-100 ease-out" style={{ width: `${percentage}%`, backgroundColor: accentColor }} />
      </div>
      <div 
        className="absolute h-5 w-5 bg-white rounded-full border-2 border-black z-10 transition-transform group-hover:scale-110 pointer-events-none" 
        style={{ left: `calc(${percentage}% - 10px)`, boxShadow: `0 0 15px ${accentColor}80` }} 
      />
    </div>
  );
};

const CustomSelect = ({ value, options, onChange, accentColor, icon: Icon }: any) => {
  const [isOpen, setIsOpen] = useState(false);
  const selectedOption = options.find((o: any) => o.value === value) || options[0];

  return (
    <div className="relative w-full">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between bg-black/40 border ${isOpen ? 'border-white/[0.3]' : 'border-white/[0.08]'} hover:border-white/[0.2] rounded-xl px-4 py-3 text-sm text-white outline-none transition-all`}
        style={isOpen ? { borderColor: accentColor, boxShadow: `0 0 15px ${accentColor}20` } : {}}
      >
        <div className="flex items-center gap-3">
          {Icon && <Icon size={16} className="text-zinc-400" />}
          <span className="font-medium">{selectedOption?.label}</span>
        </div>
        <ChevronDown size={16} className={`text-zinc-500 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} style={isOpen ? { color: accentColor } : {}} />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute top-full left-0 right-0 mt-2 bg-[#111]/95 backdrop-blur-2xl border border-white/[0.1] rounded-xl shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2">
            <div className="max-h-60 overflow-y-auto custom-scrollbar p-1.5">
              {options.map((opt: any) => (
                <button
                  key={opt.value}
                  onClick={() => { onChange(opt.value); setIsOpen(false); }}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm transition-all ${value === opt.value ? 'bg-white/[0.05] text-white font-bold' : 'text-zinc-400 hover:bg-white/[0.02] hover:text-white'}`}
                >
                  <span>{opt.label}</span>
                  {value === opt.value && <Check size={14} style={{ color: accentColor }} />}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};


export default function App() {
  const [activeServer, setActiveServer] = useState('home');
  const [isWorkspaceDropdownOpen, setIsWorkspaceDropdownOpen] = useState(false);
  const [activeChannel, setActiveChannel] = useState('c1');
  const [inputValue, setInputValue] = useState('');
  
  // Stany UX
  const [isZenMode, setIsZenMode] = useState(false);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [mainView, setMainView] = useState<'chat' | 'canvas' | 'grid'>('chat');
  const [rightPanelTab, setRightPanelTab] = useState<'users' | 'files' | 'ai'>('users');
  
  // Zaawansowane funkcje
  const [isAIPromptOpen, setIsAIPromptOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isCmdPaletteOpen, setIsCmdPaletteOpen] = useState(false);
  const [executedCodeBlocks, setExecutedCodeBlocks] = useState<Record<string, boolean>>({});
  
  // Menu Kontekstowe (Prawy Klik)
  const [contextMenu, setContextMenu] = useState<ContextMenuData>(null);
  
  // Funkcje: Powiadomienia, Wątki, Status, Profile i DM
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [activeThreadMsg, setActiveThreadMsg] = useState<ChatRow | null>(null);
  const [myStatus, setMyStatus] = useState<'online' | 'dnd' | 'idle' | 'offline'>('online');
  const [isStatusMenuOpen, setIsStatusMenuOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [activeDMUserId, setActiveDMUserId] = useState<string | null>(null);
  
  // Ustawienia Pełnoekranowe i Motywy
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsContext, setSettingsContext] = useState<'user' | 'server' | 'channel'>('user');
  const [settingsTab, setSettingsTab] = useState<string>('profile');
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(true);
  
  // --- ROZBUDOWANY STAN USTAWIEŃ ---
  const [accentColor, setAccentColor] = useState('#00ffcc');
  const [appSettings, setAppSettings] = useState({
    noiseCancel: true,
    echoCancel: true,
    pushNotifs: true,
    soundNotifs: false,
    aiDataShare: false,
    dmScanLevel: 'safe',
    fontSize: 15,
    uiDensity: 'cozy',
    micVol: 75,
    outVol: 100,
    micDevice: 'mic-1',
    outDevice: 'out-1',
    camDevice: 'cam-1',
  });
  
  const [activeVoiceChannel, setActiveVoiceChannel] = useState<string | null>(null);
  const guestIdRef = useRef(guestSessionId());
  
  const ticks = '`' + '`' + '`';
  const codeContent = `${ticks}python\nimport flux_api\n\ndef init_core():\n    print("Zainicjowano system Flux^ pomyślnie!")\n    return {"status": 200, "module": "core"}\n\ninit_core()\n${ticks}`;
  
  const [messagesByChannel, setMessagesByChannel] = useState<Record<string, ChatRow[]>>({
    'c1': [
      { id: 0, userId: 'system', time: '09:59', content: 'Węzeł Flux^ Main został zaktualizowany do v3.0', type: 'system' },
      { id: 1, userId: 'u1', time: '10:00', content: 'Witaj w nowym interfejsie Flux^! Mamy nowe customowe slidery i przełączniki w ustawieniach!', reactions: [{ emoji: '⚙️', count: 4, active: true }], type: 'text' },
      { id: 2, userId: 'u2', time: '10:05', content: 'Wrzuciłem właśnie poprawki do naszego serwera WebRTC. Zerknijcie:', type: 'text' },
      { id: 25, userId: 'u2', time: '10:05', content: 'GitHub Pull Request', type: 'github', githubData: { repo: 'flux-network/core-webrtc', prName: 'fix: Optymalizacja przepustowości w Live Grid', prNumber: 142, status: 'merged' } },
      { id: 3, userId: 'u2', time: '10:06', content: codeContent, type: 'code' },
    ],
    'dm-u2': [
      { id: 101, userId: 'u2', time: '09:00', content: 'Cześć! Masz chwilę na przejrzenie pull requesta z Sandboxem?', type: 'text' },
      { id: 102, userId: guestIdRef.current, time: '09:15', content: 'Pewnie, zaraz rzucę okiem. Wygląda obłędnie 🚀', type: 'text', isMe: true }
    ]
  });
  
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const activeServerData = useMemo(() => {
    if (activeServer === 'home') return { id: 'home', name: 'Terminal Osobisty', color: '#b266ff', icon: Target };
    return mockServers.find(s => s.id === activeServer) || mockServers[0];
  }, [activeServer]);

  useEffect(() => { 
    if (mainView === 'chat') messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); 
  }, [messagesByChannel, activeChannel, activeDMUserId, mainView, activeServer]);

  useEffect(() => {
    if (!activeVoiceChannel && mainView === 'grid') setMainView('chat');
  }, [activeVoiceChannel, mainView]);

  useEffect(() => {
    const handleGlobalClick = () => { if (contextMenu) setContextMenu(null); };
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { 
        e.preventDefault(); setIsCmdPaletteOpen(prev => !prev); 
      }
      if (e.key === 'Escape') { 
        setIsCmdPaletteOpen(false); setIsSettingsOpen(false); setIsNotificationsOpen(false);
        setIsStatusMenuOpen(false); setSelectedUserId(null); setContextMenu(null);
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    window.addEventListener('click', handleGlobalClick);
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown);
      window.removeEventListener('click', handleGlobalClick);
    };
  }, [contextMenu]);

  const handleContextMenu = (e: React.MouseEvent, type: ContextMenuData['type'], targetId: string | number) => {
    e.preventDefault(); e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, type, targetId });
  };

  const handleSettingChange = (key: keyof typeof appSettings, value: any) => {
    setAppSettings(prev => ({ ...prev, [key]: value }));
  };

  const handleSendMessage = () => {
    if (!inputValue.trim() && !isAIPromptOpen) return;
    const contentToSend = isAIPromptOpen ? `**Flux-AI:** ${inputValue.trim()}... (Generowanie)` : inputValue.trim();
    const currentChatId = activeServer === 'home' && activeDMUserId ? `dm-${activeDMUserId}` : activeChannel;
    
    setMessagesByChannel((prev) => ({
      ...prev,
      [currentChatId]: [...(prev[currentChatId] ?? []), { 
        id: `local-${Date.now()}`, userId: guestIdRef.current, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), 
        content: contentToSend, type: 'text', isMe: true 
      }],
    }));
    
    setInputValue('');
    setIsAIPromptOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => { 
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } 
  };

  const getUser = (id: string) => mockUsers.find((x) => x.id === id) || { id, name: id === guestIdRef.current ? 'Ty' : `User_${id.slice(-4)}`, roleId: 'r4', status: 'online' as const, bio: 'Użytkownik gość.' };
  const getRole = (roleId: string) => mockRoles.find((r) => r.id === roleId) ?? mockRoles[3];

  const getStatusClasses = (status: string) => {
    switch (status) {
      case 'online': return 'bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.6)]';
      case 'dnd': return 'bg-red-500 shadow-[0_0_5px_rgba(239,68,68,0.6)]';
      case 'idle': return 'bg-amber-500 shadow-[0_0_5px_rgba(245,158,11,0.6)]';
      case 'offline': default: return 'bg-zinc-500';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'online': return 'Dostępny';
      case 'dnd': return 'Nie przeszkadzać';
      case 'idle': return 'Zaraz wracam';
      case 'offline': return 'Niedostępny';
      default: return 'Nieznany';
    }
  };

  const groupedUsers = useMemo(() => {
    const onlineByRole = mockRoles.map(role => ({ role, users: mockUsers.filter(u => u.roleId === role.id && u.status !== 'offline') })).filter(group => group.users.length > 0);
    const offlineUsers = mockUsers.filter(u => u.status === 'offline');
    return { onlineByRole, offlineUsers };
  }, []);

  const renderMessageContent = (msg: ChatRow) => {
    if (msg.type === 'system') {
      return (
        <div className="flex items-center justify-center my-4 opacity-70">
           <div className="bg-white/[0.03] border border-white/[0.05] rounded-full px-4 py-1.5 flex items-center gap-2">
             <Server size={12} style={{ color: accentColor }} />
             <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">{msg.content}</span>
             <span className="text-[10px] text-zinc-600 ml-2">{msg.time}</span>
           </div>
        </div>
      );
    }
    if (msg.type === 'github' && msg.githubData) {
      return (
        <div className="mt-2 bg-[#080808] border border-white/[0.08] rounded-2xl p-4 w-full max-w-md shadow-lg hover:border-white/[0.15] transition-colors cursor-pointer group">
          <div className="flex items-start justify-between mb-3">
             <div className="flex items-center gap-2 text-zinc-400">
               <Github size={16} className="text-white" />
               <span className="text-xs font-medium">{msg.githubData.repo}</span>
             </div>
             <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full flex items-center gap-1 ${msg.githubData.status === 'merged' ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'}`}>
               <GitBranch size={10} /> {msg.githubData.status}
             </span>
          </div>
          <h4 className="text-[15px] font-bold text-white leading-snug group-hover:text-blue-400 transition-colors mb-1">
            {msg.githubData.prName} <span className="text-zinc-500 font-normal">#{msg.githubData.prNumber}</span>
          </h4>
        </div>
      );
    }
    if (msg.type === 'code') {
      const codeBlockRegex = new RegExp(`(${ticks}[\\s\\S]*?${ticks})`, 'g');
      const parts = msg.content.split(codeBlockRegex);
      return parts.map((part, i) => {
        if (part.startsWith(ticks) && part.endsWith(ticks)) {
          const rawCode = part.slice(3, -3);
          const [lang, ...codeLines] = rawCode.split('\n');
          const codeId = `${msg.id}-code-${i}`;
          const isExecuted = executedCodeBlocks[codeId];

          return (
            <div key={i} className="my-3 rounded-2xl bg-[#080808] border border-white/[0.1] overflow-hidden shadow-xl group/code relative w-full max-w-2xl">
              <div className="flex items-center justify-between px-4 py-2.5 bg-[#111] border-b border-white/[0.05]">
                <div className="flex items-center gap-2">
                  <CodeIcon size={14} className="text-[#b266ff]" />
                  <span className="text-[11px] uppercase tracking-[0.2em] text-[#b266ff] font-bold">{lang.trim() || 'FLUX_CODE'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setExecutedCodeBlocks(p => ({ ...p, [codeId]: !p[codeId] }))}
                    className="flex items-center gap-1.5 px-3 py-1 bg-white/[0.05] hover:bg-white/[0.1] text-white rounded-lg text-[11px] uppercase tracking-widest font-bold transition-colors"
                  >
                    <TerminalSquare size={14} /> {isExecuted ? 'Zamknij Sandbox' : 'Uruchom'}
                  </button>
                  <button className="flex items-center gap-1.5 p-1.5 text-zinc-500 hover:bg-white/[0.1] hover:text-white rounded-lg transition-colors" title="Kopiuj">
                    <Copy size={14} />
                  </button>
                </div>
              </div>
              <pre className="p-4 font-mono overflow-x-auto leading-relaxed custom-scrollbar bg-[#080808]" style={{ fontSize: `${appSettings.fontSize - 2}px`, color: '#d4d4d8' }}><code>{codeLines.join('\n')}</code></pre>
              
              {isExecuted && (
                <div className="border-t border-white/[0.05] bg-black p-4 font-mono text-xs animate-in slide-in-from-top-2 duration-300">
                  <div className="flex items-center gap-2 mb-2">
                    <Cpu size={14} className="text-zinc-500" />
                    <span className="text-zinc-500">Uruchamianie w kontenerze v8-sandbox...</span>
                  </div>
                  <div className="whitespace-pre-wrap" style={{ color: accentColor }}>
                    {`> python script.py\nZainicjowano system Flux^ pomyślnie!\n\nProces zakończony (Exit code 0)`}
                  </div>
                </div>
              )}
            </div>
          );
        }
        return <span key={i} className="whitespace-pre-wrap break-words" style={{ fontSize: `${appSettings.fontSize}px` }}>{part}</span>;
      });
    }
    
    return <span className="whitespace-pre-wrap break-words" style={{ fontSize: `${appSettings.fontSize}px` }}>{msg.content}</span>;
  };

  const SettingsSidebarItem = ({ id, icon: Icon, label, colorClass = "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.05]" }: any) => {
    const isActive = settingsTab === id;
    return (
      <button 
        onClick={() => setSettingsTab(id)}
        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all ${isActive ? 'bg-white/[0.1] text-white' : colorClass}`}
      >
        <Icon size={18} className={isActive ? 'text-white' : ''} />
        <span>{label}</span>
      </button>
    );
  };

  const contextMenuPos = useMemo(() => {
    if (!contextMenu) return { top: 0, left: 0 };
    return {
      top: Math.min(contextMenu.y, typeof window !== 'undefined' ? window.innerHeight - 300 : contextMenu.y),
      left: Math.min(contextMenu.x, typeof window !== 'undefined' ? window.innerWidth - 220 : contextMenu.x),
    };
  }, [contextMenu]);

  const isDMView = activeServer === 'home' && activeDMUserId !== null;
  const currentChatId = isDMView ? `dm-${activeDMUserId}` : activeChannel;
  const currentMessages = messagesByChannel[currentChatId] || [];
  const inputPlaceholder = isDMView ? `Napisz do @${getUser(activeDMUserId).name}... (wpisz '/' by użyć komend)` : `Napisz na #${mockChannels.find(c => c.id === activeChannel)?.name}... (wpisz '/' by użyć komend)`;

  return (
    <div className="flex h-screen w-full bg-[#000000] text-zinc-200 font-sans overflow-hidden selection:bg-white/10 selection:text-white relative p-2 md:p-3 gap-3">
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; height: 4px; display: none; }
        .custom-scrollbar:hover::-webkit-scrollbar { display: block; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }
        .flux-gradient-text { background: linear-gradient(135deg, ${accentColor} 0%, #b266ff 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
        @keyframes audioWave { 0% { height: 4px; } 50% { height: 16px; } 100% { height: 4px; } }
        .wave-bar { animation: audioWave 1s ease-in-out infinite; }
        .wave-bar:nth-child(2) { animation-delay: 0.2s; }
        .wave-bar:nth-child(3) { animation-delay: 0.4s; }
        .dot-pattern { background-image: radial-gradient(rgba(255, 255, 255, 0.1) 1px, transparent 1px); background-size: 24px 24px; }
        @keyframes pulse-fast { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        .animate-pulse-fast { animation: pulse-fast 1s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
      `}</style>

      {/* --- MENU KONTEKSTOWE --- */}
      {contextMenu && (
        <div className="fixed z-[500] bg-[#111]/95 backdrop-blur-2xl border border-white/[0.1] rounded-xl shadow-[0_10px_40px_rgba(0,0,0,0.8)] py-2 w-56 flex flex-col animate-in fade-in zoom-in-95 duration-100" style={{ top: contextMenuPos.top, left: contextMenuPos.left }} onClick={(e) => e.stopPropagation()}>
          {contextMenu.type === 'server' && (
            <>
              <div className="px-3 pb-2 pt-1 mb-1 border-b border-white/[0.05]"><span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Węzeł: {mockServers.find(s => s.id === contextMenu.targetId)?.name}</span></div>
              <button onClick={() => { setSettingsContext('server'); setSettingsTab('server-overview'); setIsSettingsOpen(true); setContextMenu(null); }} className="w-full flex items-center gap-3 px-3 py-2 text-sm text-zinc-300 hover:text-white hover:bg-[#00ffcc]/10 hover:text-[#00ffcc] transition-colors group"><Settings size={14} className="text-zinc-500 group-hover:text-[#00ffcc]" /> Ustawienia Węzła</button>
              <button onClick={() => setContextMenu(null)} className="w-full flex items-center gap-3 px-3 py-2 text-sm text-zinc-300 hover:text-white hover:bg-white/[0.05] transition-colors group"><UserPlus size={14} className="text-zinc-500 group-hover:text-white" /> Zaproś ludzi</button>
              <button onClick={() => setContextMenu(null)} className="w-full flex items-center gap-3 px-3 py-2 text-sm text-zinc-300 hover:text-white hover:bg-white/[0.05] transition-colors group"><Plus size={14} className="text-zinc-500 group-hover:text-white" /> Utwórz kanał</button>
              <div className="h-px bg-white/[0.05] my-1 mx-2" />
              <button onClick={() => setContextMenu(null)} className="w-full flex items-center gap-3 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors group"><LogOut size={14} className="text-red-500/70 group-hover:text-red-400" /> Opuść węzeł</button>
            </>
          )}
          {contextMenu.type === 'channel' && (
            <>
              <div className="px-3 pb-2 pt-1 mb-1 border-b border-white/[0.05]"><span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Kanał: {mockChannels.find(c => c.id === contextMenu.targetId)?.name}</span></div>
              <button onClick={() => setContextMenu(null)} className="w-full flex items-center gap-3 px-3 py-2 text-sm text-zinc-300 hover:text-white hover:bg-white/[0.05] transition-colors group"><Check size={14} className="text-zinc-500 group-hover:text-white" /> Oznacz przeczytane</button>
              <button onClick={() => setContextMenu(null)} className="w-full flex items-center gap-3 px-3 py-2 text-sm text-zinc-300 hover:text-white hover:bg-white/[0.05] transition-colors group"><BellOff size={14} className="text-zinc-500 group-hover:text-white" /> Wycisz kanał</button>
              <div className="h-px bg-white/[0.05] my-1 mx-2" />
              <button onClick={() => { setSettingsContext('channel'); setSettingsTab('channel-overview'); setIsSettingsOpen(true); setContextMenu(null); }} className="w-full flex items-center gap-3 px-3 py-2 text-sm text-zinc-300 hover:text-white hover:bg-white/[0.05] transition-colors group"><Settings size={14} className="text-zinc-500 group-hover:text-white" /> Edytuj kanał</button>
              <button onClick={() => setContextMenu(null)} className="w-full flex items-center gap-3 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors group"><Trash2 size={14} className="text-red-500/70 group-hover:text-red-400" /> Usuń kanał</button>
            </>
          )}
          {contextMenu.type === 'user' && (
            <>
              <div className="px-3 pb-2 pt-1 mb-1 border-b border-white/[0.05]"><span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Użytkownik: {getUser(contextMenu.targetId as string).name}</span></div>
              <button onClick={() => { setSelectedUserId(contextMenu.targetId as string); setContextMenu(null); }} className="w-full flex items-center gap-3 px-3 py-2 text-sm text-zinc-300 hover:text-white hover:bg-white/[0.05] transition-colors group"><UserCog size={14} className="text-zinc-500 group-hover:text-white" /> Karta Identyfikacyjna</button>
              <button onClick={() => { setActiveServer('home'); setActiveDMUserId(contextMenu.targetId as string); setContextMenu(null); }} className="w-full flex items-center gap-3 px-3 py-2 text-sm text-zinc-300 hover:text-white hover:bg-white/[0.05] transition-colors group"><MessageSquare size={14} className="text-zinc-500 group-hover:text-white" /> Napisz wiadomość</button>
              <button onClick={() => setContextMenu(null)} className="w-full flex items-center gap-3 px-3 py-2 text-sm text-zinc-300 hover:text-white hover:bg-white/[0.05] transition-colors group"><PhoneCall size={14} className="text-zinc-500 group-hover:text-white" /> Zadzwoń</button>
              <div className="h-px bg-white/[0.05] my-1 mx-2" />
              <button onClick={() => setContextMenu(null)} className="w-full flex items-center gap-3 px-3 py-2 text-sm text-zinc-300 hover:text-white hover:bg-white/[0.05] transition-colors group"><Shield size={14} className="text-zinc-500 group-hover:text-white" /> Zarządzaj Rangą</button>
              <button onClick={() => setContextMenu(null)} className="w-full flex items-center gap-3 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors group"><LogOut size={14} className="text-red-500/70 group-hover:text-red-400" /> Wyrzuć z Węzła</button>
            </>
          )}
          {contextMenu.type === 'message' && (
            <>
              <button onClick={() => { 
                const msg = currentMessages.find(m => m.id === contextMenu.targetId);
                if (msg) { setActiveThreadMsg(msg); setIsRightPanelOpen(true); }
                setContextMenu(null); 
              }} className="w-full flex items-center gap-3 px-3 py-2 text-sm text-zinc-300 hover:text-white hover:bg-white/[0.05] transition-colors group"><Reply size={14} className="text-zinc-500 group-hover:text-white" /> Odpowiedz w Wątku</button>
              <button onClick={() => setContextMenu(null)} className="w-full flex items-center gap-3 px-3 py-2 text-sm text-zinc-300 hover:text-white hover:bg-white/[0.05] transition-colors group"><Smile size={14} className="text-zinc-500 group-hover:text-white" /> Dodaj Reakcję</button>
              <button onClick={() => setContextMenu(null)} className="w-full flex items-center gap-3 px-3 py-2 text-sm text-zinc-300 hover:text-white hover:bg-white/[0.05] transition-colors group"><Copy size={14} className="text-zinc-500 group-hover:text-white" /> Kopiuj Treść</button>
              <button onClick={() => setContextMenu(null)} className="w-full flex items-center gap-3 px-3 py-2 text-sm text-zinc-300 hover:text-white hover:bg-white/[0.05] transition-colors group"><Link2 size={14} className="text-zinc-500 group-hover:text-white" /> Kopiuj ID Wiadomości</button>
              <div className="h-px bg-white/[0.05] my-1 mx-2" />
              <button onClick={() => setContextMenu(null)} className="w-full flex items-center gap-3 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors group"><Trash2 size={14} className="text-red-500/70 group-hover:text-red-400" /> Usuń Wiadomość</button>
            </>
          )}
        </div>
      )}

      {/* --- KARTA IDENTYFIKACYJNA (POPOUT) --- */}
      {selectedUserId && (
        <div className="fixed inset-0 z-[250] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSelectedUserId(null)} />
          <div className="relative w-full max-w-sm bg-[#111]/90 backdrop-blur-2xl border rounded-3xl shadow-[0_0_50px_rgba(0,0,0,0.8)] overflow-hidden animate-in zoom-in-95 duration-200" style={{ borderColor: `${getRole(getUser(selectedUserId).roleId).color}40` }}>
            <div className="h-24 w-full relative" style={{ backgroundColor: `${getRole(getUser(selectedUserId).roleId).color}20` }}>
               <div className="absolute inset-0 bg-gradient-to-t from-[#111]/90 to-transparent" />
            </div>
            <div className="px-6 pb-6 relative -mt-12">
               <div className="flex justify-between items-end mb-4">
                 <div className="relative">
                   <div className="w-20 h-20 rounded-2xl bg-black border-[3px] border-[#111] flex items-center justify-center text-3xl font-black shadow-xl" style={{ color: getRole(getUser(selectedUserId).roleId).color }}>
                     {getUser(selectedUserId).name.charAt(0)}
                   </div>
                   <div className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-[3px] border-[#111] ${getStatusClasses(getUser(selectedUserId).status)}`} />
                 </div>
                 <div className="flex gap-2 mb-1">
                   <button className="w-10 h-10 rounded-full bg-white/[0.05] hover:bg-white/[0.1] flex items-center justify-center text-white transition-colors" title="Zadzwoń"><PhoneCall size={16} /></button>
                   <button onClick={() => { setActiveServer('home'); setActiveDMUserId(selectedUserId); setSelectedUserId(null); }} className="w-full px-4 rounded-full bg-white/[0.05] hover:bg-white/[0.1] flex items-center justify-center gap-2 text-white font-bold text-xs transition-colors" title="Napisz Wiadomość"><MessageSquare size={14} /> Napisz</button>
                 </div>
               </div>
               <div>
                 <h2 className="text-xl font-bold text-white flex items-center gap-2">{getUser(selectedUserId).name}</h2>
                 <p className="text-xs text-zinc-400 mt-1">{getUser(selectedUserId).bio}</p>
               </div>
               <div className="mt-6 space-y-4">
                 <div className="flex flex-col gap-1">
                   <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Ranga Systemowa</span>
                   <div className="flex items-center gap-2 text-sm font-medium" style={{ color: getRole(getUser(selectedUserId).roleId).color }}>
                     {React.createElement(getRole(getUser(selectedUserId).roleId).icon, { size: 16 })}
                     {getRole(getUser(selectedUserId).roleId).name}
                   </div>
                 </div>
                 <div className="flex flex-col gap-1">
                   <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Lokalny Czas</span>
                   <div className="flex items-center gap-2 text-sm font-medium text-zinc-300">
                     <Clock size={16} className="text-zinc-500" />
                     {new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} (CET)
                   </div>
                 </div>
               </div>
            </div>
          </div>
        </div>
      )}

      {/* --- LEWITUJĄCY DOK SERWERÓW --- */}
      {!isZenMode && (
        <nav className="w-[76px] rounded-[32px] bg-[#0a0a0c]/80 backdrop-blur-2xl border border-white/[0.05] shadow-[0_0_50px_rgba(0,0,0,0.5)] flex flex-col items-center py-4 gap-3 z-40 relative">
          <button onContextMenu={(e) => handleContextMenu(e, 'server', 'home')} onClick={() => { setActiveServer('home'); setActiveDMUserId(null); }} className={`relative w-[52px] h-[52px] rounded-2xl flex items-center justify-center transition-all duration-300 group overflow-hidden ${activeServer === 'home' ? 'bg-[#b266ff]/20 border border-[#b266ff]/50 shadow-[0_0_20px_rgba(178,102,255,0.3)]' : 'bg-white/[0.02] border border-transparent hover:bg-white/[0.05]'}`}>
             {activeServer === 'home' && <div className="absolute inset-0 bg-[#b266ff]/10 animate-pulse" />}
             <Target size={24} className={activeServer === 'home' ? 'text-[#b266ff]' : 'text-zinc-500 group-hover:text-white transition-colors'} />
          </button>
          <div className="w-8 h-[2px] bg-white/[0.05] rounded-full my-1" />
          <div className="flex-1 w-full flex flex-col items-center gap-3 overflow-y-auto custom-scrollbar px-2">
            {mockServers.map(server => {
              const isActive = activeServer === server.id;
              return (
                <button 
                  key={server.id} 
                  onClick={() => setActiveServer(server.id)} 
                  onContextMenu={(e) => handleContextMenu(e, 'server', server.id)}
                  className={`relative w-[52px] h-[52px] rounded-2xl flex items-center justify-center transition-all duration-300 group ${isActive ? 'bg-[#111] border shadow-lg' : 'bg-[#111]/50 border border-transparent hover:bg-[#111] hover:border-white/[0.1]'}`} 
                  style={{ borderColor: isActive ? `${server.color}50` : undefined, boxShadow: isActive ? server.glow : undefined }}
                >
                  {isActive && <div className="absolute -left-0.5 top-1/2 -translate-y-1/2 w-1.5 h-6 rounded-r-md" style={{ backgroundColor: server.color, boxShadow: `0 0 10px ${server.color}` }} />}
                  <server.icon size={22} style={{ color: isActive ? server.color : '#666' }} className="transition-colors duration-300" />
                  {server.hasNotification && !isActive && <div className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-red-500 rounded-full border-2 border-[#0a0a0c] shadow-[0_0_8px_rgba(239,68,68,0.5)]" />}
                </button>
              );
            })}
            <button className="relative w-[52px] h-[52px] rounded-2xl bg-white/[0.02] border border-white/[0.05] text-zinc-400 flex items-center justify-center transition-all duration-300 hover:bg-white/[0.1] hover:text-white mt-2 group">
              <Plus size={24} className="group-hover:scale-110 transition-transform" />
            </button>
          </div>
        </nav>
      )}

      {/* --- GŁÓWNA APLIKACJA --- */}
      <div className={`flex-1 flex rounded-[32px] overflow-hidden bg-[#050505] border border-white/[0.05] shadow-[0_0_80px_rgba(0,0,0,0.8)] relative transition-all duration-500 ${isSettingsOpen || selectedUserId ? 'scale-[0.98] opacity-50 blur-sm pointer-events-none' : 'scale-100 opacity-100'}`}>
        
        {/* --- LEWY PANEL --- */}
        {!isZenMode && (
          <aside className="w-[280px] flex flex-col shrink-0 z-30 bg-[#080808]/50 border-r border-white/[0.04]">
            <div className="p-3 mb-2 relative">
              <div className="absolute inset-0 opacity-20 blur-xl rounded-2xl" style={{ backgroundColor: activeServerData.color }} />
              <button 
                onClick={() => activeServer !== 'home' && setIsWorkspaceDropdownOpen(!isWorkspaceDropdownOpen)} 
                onContextMenu={(e) => activeServer !== 'home' && handleContextMenu(e, 'server', activeServerData.id)}
                className={`relative w-full p-3 rounded-[20px] bg-black/60 border border-white/[0.08] backdrop-blur-md flex items-center gap-3 overflow-hidden group transition-all ${activeServer !== 'home' ? 'hover:border-white/[0.15] cursor-pointer' : 'cursor-default'}`} style={activeServer !== 'home' ? { borderColor: `${activeServerData.color}30` } : undefined}
              >
                 <activeServerData.icon size={80} className="absolute -right-4 -bottom-4 opacity-10 group-hover:opacity-20 transition-opacity" style={{ color: activeServerData.color }} />
                 <div className="w-10 h-10 rounded-[14px] flex items-center justify-center border shadow-lg transition-transform group-hover:scale-105" style={{ backgroundColor: `${activeServerData.color}20`, borderColor: `${activeServerData.color}40`, color: activeServerData.color }}>
                   <activeServerData.icon size={20} />
                 </div>
                 <div className="flex flex-col items-start flex-1 min-w-0 z-10">
                   <span className="text-[15px] font-black text-white tracking-wide truncate w-full text-left">{activeServerData.name}</span>
                   <span className="text-[9px] font-bold uppercase tracking-widest mt-0.5" style={{ color: activeServerData.color }}>{activeServer === 'home' ? 'Prywatny Moduł' : 'Wirtualny Węzeł'}</span>
                 </div>
                 {activeServer !== 'home' && <ChevronDown size={16} className={`text-zinc-500 group-hover:text-white transition-all duration-300 z-10 ${isWorkspaceDropdownOpen ? 'rotate-180' : ''}`} />}
              </button>

              {isWorkspaceDropdownOpen && activeServer !== 'home' && (
                 <div className="absolute top-full left-3 right-3 mt-1 bg-[#111] border border-white/[0.08] rounded-xl shadow-2xl p-2 z-50 animate-in fade-in slide-in-from-top-2">
                   <button onClick={() => { setSettingsContext('server'); setSettingsTab('server-overview'); setIsSettingsOpen(true); setIsWorkspaceDropdownOpen(false); }} className="w-full flex items-center justify-between px-3 py-2.5 text-sm text-zinc-300 hover:text-white hover:bg-white/[0.05] rounded-lg group transition-all">
                     <span className="font-medium">Ustawienia Węzła</span><Settings size={16} className="text-zinc-500 group-hover:text-white transition-colors" />
                   </button>
                   <div className="h-px bg-white/[0.05] my-1 mx-2" />
                   <button onClick={() => setIsWorkspaceDropdownOpen(false)} className="w-full flex items-center justify-between px-3 py-2.5 text-sm text-red-400 hover:bg-red-500/10 rounded-lg transition-all">
                      <span className="font-medium">Odłącz z Węzła</span><LogOut size={16} />
                   </button>
                 </div>
               )}
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar px-3 flex flex-col gap-6">
              {activeServer === 'home' ? (
                <div>
                   <div className="flex items-center justify-between px-2 mb-2 mt-2">
                     <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 flex items-center gap-1.5">Wiadomości Bezpośrednie</span>
                     <button className="text-zinc-500 hover:text-[#b266ff] transition-colors"><Plus size={14}/></button>
                   </div>
                   <div className="flex flex-col gap-1">
                     <button 
                        onContextMenu={(e) => handleContextMenu(e, 'user', 'u2')} 
                        className={`flex-1 flex items-center gap-3 py-2 px-3 rounded-xl text-[14px] transition-all ${activeDMUserId === 'u2' ? 'bg-white/[0.06] text-white shadow-sm border border-white/[0.02]' : 'text-zinc-400 hover:bg-white/[0.02] hover:text-zinc-200 border border-transparent'}`} 
                        onClick={() => setActiveDMUserId('u2')}
                     >
                        <div className="relative" onClick={(e) => { e.stopPropagation(); setSelectedUserId('u2'); }}>
                          <div className="w-6 h-6 rounded-full bg-[#00ffcc] text-black font-bold flex items-center justify-center text-xs hover:scale-105 transition-transform">K</div>
                          <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-[#0a0a0c]`} />
                        </div>
                        <span className="truncate font-medium flex-1 text-left">Kamil_Dev</span>
                     </button>
                     <button 
                        onContextMenu={(e) => handleContextMenu(e, 'user', 'u1')} 
                        className={`flex-1 flex items-center gap-3 py-2 px-3 rounded-xl text-[14px] transition-all ${activeDMUserId === 'u1' ? 'bg-white/[0.06] text-white shadow-sm border border-white/[0.02]' : 'text-zinc-400 hover:bg-white/[0.02] hover:text-zinc-200 border border-transparent'}`} 
                        onClick={() => setActiveDMUserId('u1')}
                     >
                        <div className="relative" onClick={(e) => { e.stopPropagation(); setSelectedUserId('u1'); }}>
                          <div className="w-6 h-6 rounded-full bg-[#ff0055] text-white font-bold flex items-center justify-center text-xs hover:scale-105 transition-transform">A</div>
                          <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-[#0a0a0c]`} />
                        </div>
                        <span className="truncate font-medium flex-1 text-left">Admin</span>
                     </button>
                   </div>
                </div>
              ) : (
                <div>
                  <div className="flex items-center justify-between px-2 mb-2">
                     <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 flex items-center gap-1.5">Kanały Tekstowe</span>
                     <button className="text-zinc-500 hover:text-white transition-colors"><Plus size={14}/></button>
                  </div>
                  <div className="flex flex-col gap-1">
                    {mockChannels.filter(c => c.type === 'text').map(channel => (
                      <button 
                        key={channel.id} 
                        onClick={() => { setActiveChannel(channel.id); if (mainView === 'grid') setMainView('chat'); setActiveThreadMsg(null); }} 
                        onContextMenu={(e) => handleContextMenu(e, 'channel', channel.id)}
                        className={`flex-1 flex items-center gap-3 py-2 px-3 rounded-xl text-[14px] transition-all group ${activeChannel === channel.id ? 'bg-white/[0.06] text-white shadow-sm border border-white/[0.02]' : 'text-zinc-400 hover:bg-white/[0.02] hover:text-zinc-200 border border-transparent'}`}
                      >
                        <Hash size={16} className={activeChannel === channel.id ? 'text-white' : 'text-zinc-600 group-hover:text-zinc-400'} />
                        <span className="truncate font-medium">{channel.name}</span>
                        {channel.unread && activeChannel !== channel.id && <div className="w-1.5 h-1.5 rounded-full ml-auto shadow-md" style={{ backgroundColor: accentColor, boxShadow: `0 0 8px ${accentColor}` }} />}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center justify-between px-2 mt-6 mb-2">
                     <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 flex items-center gap-1.5">Kanały Głosowe</span>
                     <button className="text-zinc-500 hover:text-white transition-colors"><Plus size={14}/></button>
                  </div>
                  <div className="flex flex-col gap-1">
                    {mockChannels.filter(c => c.type === 'voice').map(channel => (
                      <button 
                        key={channel.id} 
                        onClick={() => { setActiveVoiceChannel(channel.id); setMainView('grid'); }} 
                        onContextMenu={(e) => handleContextMenu(e, 'channel', channel.id)}
                        className={`flex-1 flex items-center gap-3 py-2 px-3 rounded-xl text-[14px] transition-all border ${activeVoiceChannel === channel.id ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.1)]' : 'text-zinc-400 hover:bg-white/[0.02] hover:text-zinc-200 border-transparent'}`}
                      >
                          <Volume2 size={16} className={activeVoiceChannel === channel.id ? 'text-emerald-400 animate-pulse' : 'text-zinc-600'} />
                          <span className={`truncate font-medium ${activeVoiceChannel === channel.id ? 'text-emerald-400' : ''}`}>{channel.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {activeVoiceChannel && (
              <div className="mx-3 mb-3 bg-[#0a0a0c] border border-white/[0.08] rounded-[20px] p-3 flex flex-col gap-3 relative overflow-hidden shrink-0 shadow-2xl">
                 <div className="absolute top-0 left-0 w-full h-[2px] bg-emerald-500 shadow-[0_0_15px_#10b981]" />
                 <div className="flex flex-col gap-1">
                   <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest flex items-center gap-1.5"><Activity size={12} className="animate-pulse" /> Aktywna Sesja</span>
                   <span className="text-[13px] text-white truncate font-bold mt-0.5">{mockChannels.find(c => c.id === activeVoiceChannel)?.name}</span>
                 </div>
                 <div className="flex items-center gap-2">
                   <button className="flex-1 py-2 bg-white/[0.05] hover:bg-white/[0.1] rounded-xl text-zinc-300 flex justify-center transition-colors"><Mic size={16}/></button>
                   <button className="flex-1 py-2 bg-white/[0.05] hover:bg-white/[0.1] rounded-xl text-zinc-300 flex justify-center transition-colors"><Headphones size={16}/></button>
                 </div>
                 <button onClick={() => { setActiveVoiceChannel(null); setMainView('chat'); }} className="w-full py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 font-bold text-[11px] uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all flex items-center justify-center gap-2 group">
                   <PhoneOff size={14} className="group-hover:scale-110 transition-transform" /> Zakończ Sesję
                 </button>
              </div>
            )}

            {/* --- PASEK PROFILU --- */}
            <div className="relative">
              <div className="h-[64px] border-t border-white/[0.05] bg-[#0a0a0c] p-2 flex items-center px-3 hover:bg-white/[0.02] cursor-pointer transition-colors shrink-0 m-2 rounded-2xl mb-3" onClick={() => setIsStatusMenuOpen(!isStatusMenuOpen)}>
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="relative shrink-0">
                    <div className="w-9 h-9 rounded-xl text-black flex items-center justify-center font-bold text-[15px]" style={{ backgroundColor: accentColor }}>F</div>
                    <div className={`absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full border-[3px] border-[#0a0a0c] ${getStatusClasses(myStatus)}`} />
                  </div>
                  <div className="flex flex-col truncate">
                    <span className="text-[13px] font-bold text-white leading-tight truncate">Flux_User</span>
                    <span className={`text-[10px] font-bold uppercase tracking-widest mt-0.5 ${myStatus === 'online' ? 'text-emerald-500' : myStatus === 'dnd' ? 'text-red-500' : myStatus === 'idle' ? 'text-amber-500' : 'text-zinc-500'}`}>{getStatusText(myStatus)}</span>
                  </div>
                </div>
                <button onClick={(e) => { e.stopPropagation(); setSettingsContext('user'); setSettingsTab('profile'); setIsSettingsOpen(true); }} className="p-2 text-zinc-500 hover:text-white rounded-xl hover:bg-white/[0.05] transition-colors"><Settings size={16} /></button>
              </div>
            </div>
          </aside>
        )}

        {/* --- GŁÓWNA STREFA WIDOKOWA --- */}
        <main className="flex-1 flex flex-col relative bg-[#111] overflow-hidden">
          
          <header className="h-16 flex items-center justify-between px-6 border-b border-white/[0.04] bg-[#0a0a0c]/80 backdrop-blur-md shrink-0 z-10 shadow-sm relative">
            <div className="flex items-center gap-4">
              {activeServer === 'home' ? (
                !activeDMUserId ? (
                  <div className="flex items-center gap-3 text-sm font-medium">
                    <Target size={20} className="text-[#b266ff]" />
                    <span className="font-bold text-lg text-white tracking-tight">Przegląd Systemu</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 text-sm font-medium">
                    <div className="w-7 h-7 rounded-[10px] text-black font-bold flex items-center justify-center text-xs cursor-pointer hover:scale-105 transition-transform" style={{ backgroundColor: getRole(getUser(activeDMUserId).roleId).color }} onClick={() => setSelectedUserId(activeDMUserId)}>
                      {getUser(activeDMUserId).name.charAt(0)}
                    </div>
                    <span className="font-bold text-lg text-white tracking-tight hover:underline cursor-pointer" onClick={() => setSelectedUserId(activeDMUserId)}>
                      {getUser(activeDMUserId).name}
                    </span>
                  </div>
                )
              ) : (
                <>
                  <div className="flex items-center gap-3 text-sm font-medium">
                    <Hash size={20} className="text-zinc-400" />
                    <span className="font-bold text-lg text-white tracking-tight">
                      {mockChannels.find(c => c.id === activeChannel)?.name || 'Czat'}
                    </span>
                  </div>
                  <div className="w-px h-6 bg-white/[0.08] mx-2 hidden md:block" />
                  
                  <div className="hidden md:flex gap-1.5 p-1 bg-black/40 rounded-xl border border-white/[0.05]">
                    <button onClick={() => setMainView('chat')} className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-all ${mainView === 'chat' ? 'bg-white/[0.1] text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.05]'}`}>Czat</button>
                    <button onClick={() => setMainView('canvas')} className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-all ${mainView === 'canvas' ? 'bg-[#b266ff]/20 text-[#b266ff]' : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.05]'}`}>Canvas</button>
                    {activeVoiceChannel && (
                      <button onClick={() => setMainView('grid')} className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-all flex items-center gap-1.5 ${mainView === 'grid' ? 'bg-emerald-500/20 text-emerald-400' : 'text-emerald-500/70 hover:text-emerald-400 hover:bg-white/[0.05]'}`}>
                        <LayoutGrid size={14} className={mainView === 'grid' ? 'animate-pulse' : ''} /> Live
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
            
            <div className="flex items-center gap-2">
              <button onClick={() => { setIsRightPanelOpen(!isRightPanelOpen); setActiveThreadMsg(null); }} className={`p-2 rounded-xl transition-colors ${isRightPanelOpen && !activeThreadMsg ? 'bg-white/[0.1] text-white' : 'text-zinc-500 hover:text-white hover:bg-white/[0.05]'}`}>
                 {activeServer === 'home' && !activeDMUserId ? <Layout size={18} /> : <Layout size={18} />}
              </button>
            </div>
          </header>

          {/* === WIDOK: TERMINAL OSOBISTY (HOME DASHBOARD) LUB DM === */}
          {activeServer === 'home' ? (
            !activeDMUserId ? (
              <div className="flex-1 overflow-y-auto p-8 custom-scrollbar bg-[#0a0a0c] dot-pattern animate-in fade-in duration-500">
                 <div className="max-w-5xl mx-auto">
                    <div className="flex items-end justify-between mb-8">
                       <div>
                         <h1 className="text-4xl font-black text-white tracking-tighter mb-2">Witaj, Flux_User</h1>
                         <p className="text-zinc-400">Oto Twój osobisty terminal dowodzenia na dziś. Masz <span className="text-[#b266ff] font-bold">3 powiadomienia</span>.</p>
                       </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="md:col-span-2 bg-[#111]/80 backdrop-blur-md border border-white/[0.05] rounded-3xl p-6 relative overflow-hidden shadow-xl">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-[#b266ff]/10 rounded-full blur-[80px] -mr-20 -mt-20 pointer-events-none" />
                        <div className="flex items-center gap-3 mb-6 relative z-10">
                          <div className="w-10 h-10 rounded-xl bg-[#b266ff]/20 text-[#b266ff] flex items-center justify-center"><Sparkles size={20} /></div>
                          <div>
                            <h2 className="text-lg font-bold text-white">Daily Sync: Flux-AI</h2>
                            <p className="text-xs text-zinc-500 font-mono">Wygenerowano z węzła głównego</p>
                          </div>
                        </div>
                        <div className="space-y-4 relative z-10">
                          <p className="text-[15px] text-zinc-300 leading-relaxed">
                            Od Twojej ostatniej wizyty, zespół intensywnie pracował w węźle <span className="text-[#00ffcc] font-bold">#Projekt Alfa</span> nad autoryzacją WebRTC. 
                            Kamil_Dev udostępnił nowy kod Sandboxa (3 rewizje), który czeka na Twoje zatwierdzenie.
                          </p>
                        </div>
                      </div>
                    </div>
                 </div>
              </div>
            ) : (
              <>
                <div className="flex-1 overflow-y-auto px-6 pt-6 pb-40 custom-scrollbar relative">
                  <div className={`${isZenMode ? 'max-w-3xl' : 'max-w-4xl'} mx-auto w-full flex flex-col gap-5 ${appSettings.uiDensity === 'compact' ? 'gap-2' : ''}`}>
                    <div className="pb-8 border-b border-white/[0.05] mb-4 mt-6 flex flex-col items-center text-center">
                      <div className="w-24 h-24 rounded-[24px] bg-[#111] border border-white/[0.05] flex items-center justify-center mb-6 shadow-2xl" style={{ color: getRole(getUser(activeDMUserId).roleId).color }}>
                        <span className="text-4xl font-black">{getUser(activeDMUserId).name.charAt(0)}</span>
                      </div>
                      <h1 className="text-4xl font-black tracking-tight text-white mb-2">{getUser(activeDMUserId).name}</h1>
                      <p className="text-zinc-400 text-[15px]">Początek Twojej bezpiecznej, bezpośredniej konwersacji w systemie Flux^.</p>
                    </div>

                    {(messagesByChannel[`dm-${activeDMUserId}`] || []).map((msg) => (
                      <div key={msg.id} onContextMenu={(e) => handleContextMenu(e, 'message', msg.id)} className={`group relative flex gap-5 hover:bg-white/[0.02] -mx-4 px-4 ${appSettings.uiDensity === 'compact' ? 'py-1.5' : 'py-3'} rounded-2xl transition-all border border-transparent hover:border-white/[0.02]`}>
                        <div onClick={() => setSelectedUserId(msg.userId)} onContextMenu={(e) => handleContextMenu(e, 'user', msg.userId)} className={`rounded-[16px] bg-[#080808] border border-white/[0.05] flex items-center justify-center font-black text-white shrink-0 mt-0.5 cursor-pointer hover:scale-105 transition-transform shadow-lg ${appSettings.uiDensity === 'compact' ? 'w-10 h-10 text-base' : 'w-12 h-12 text-lg'}`} style={{ color: getRole(getUser(msg.userId).roleId).color }}>
                          {getUser(msg.userId).name.charAt(0)}
                        </div>
                        <div className={`flex flex-col flex-1 min-w-0 pb-1`}>
                          <div className="flex items-baseline gap-3 mb-1">
                            <span onClick={() => setSelectedUserId(msg.userId)} onContextMenu={(e) => handleContextMenu(e, 'user', msg.userId)} className="font-bold text-[16px] hover:underline cursor-pointer" style={{ color: getRole(getUser(msg.userId).roleId).color }}>{getUser(msg.userId).name}</span>
                            <span className="text-[11px] text-zinc-500 font-medium tracking-wide">{msg.time}</span>
                          </div>
                          {renderMessageContent(msg)}
                        </div>
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                </div>

                {/* --- CHAT INPUT --- */}
                <div className="absolute bottom-6 left-0 right-0 px-6 flex justify-center z-20">
                  <div className={`w-full ${isZenMode ? 'max-w-3xl' : 'max-w-4xl'} relative`}>
                    <div className={`bg-[#0a0a0c]/95 backdrop-blur-3xl border border-white/[0.08] rounded-[24px] p-2 transition-all duration-300 shadow-[0_10px_40px_rgba(0,0,0,0.5)] flex flex-col gap-1 ${isInputFocused ? 'border-white/[0.2] shadow-[0_0_30px_rgba(255,255,255,0.05)]' : ''}`}>
                      <div className={`flex items-end gap-2`}>
                        <button className="h-11 w-11 shrink-0 rounded-xl bg-white/[0.02] text-zinc-400 flex items-center justify-center hover:bg-white/[0.08] hover:text-white transition-colors mb-0.5"><Plus size={20} /></button>
                        <textarea ref={textareaRef} value={inputValue} onChange={(e) => setInputValue(e.target.value)} onKeyDown={handleKeyDown} onFocus={() => setIsInputFocused(true)} onBlur={() => setIsInputFocused(false)} placeholder={inputPlaceholder} className="flex-1 bg-transparent text-zinc-200 py-3.5 px-2 outline-none resize-none text-[15px] custom-scrollbar max-h-32 placeholder-zinc-600 font-medium" rows={1} />
                        <div className="flex items-center gap-1 mb-0.5 mr-0.5">
                          <button className="h-11 w-11 rounded-xl text-zinc-400 hover:text-white hover:bg-white/[0.05] flex items-center justify-center transition-colors"><Smile size={20}/></button>
                          {inputValue.trim() ? (
                             <button onClick={handleSendMessage} className="h-11 w-11 text-black rounded-xl flex items-center justify-center transition-colors hover:scale-105" style={{ backgroundColor: accentColor, boxShadow: `0 0 15px ${accentColor}50` }}><Send size={18}/></button>
                          ) : (
                             <button onClick={() => setIsAIPromptOpen(true)} className="h-11 w-11 text-[#b266ff] bg-[#b266ff]/10 hover:bg-[#b266ff]/20 rounded-xl flex items-center justify-center transition-colors"><Sparkles size={20}/></button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )
          ) : (
            mainView === 'chat' && (
              <>
                <div className="flex-1 overflow-y-auto px-6 pt-6 pb-40 custom-scrollbar relative">
                  <div className={`${isZenMode ? 'max-w-3xl' : 'max-w-4xl'} mx-auto w-full flex flex-col gap-5 ${appSettings.uiDensity === 'compact' ? 'gap-2' : ''}`}>
                    <div className="pb-8 border-b border-white/[0.05] mb-4 mt-6">
                      <div className="w-20 h-20 rounded-[24px] bg-[#00ffcc]/10 border border-[#00ffcc]/30 flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(0,255,204,0.2)]"><Hash size={40} className="text-[#00ffcc]" /></div>
                      <h1 className="text-4xl font-black tracking-tight text-white mb-3">Witaj na kanale {mockChannels.find(c => c.id === activeChannel)?.name}!</h1>
                      <p className="text-zinc-400 text-[15px]">To jest początek historii tego kanału tekstowego w systemie Flux^.</p>
                    </div>

                    {(messagesByChannel[activeChannel] || []).map((msg) => {
                      const isSystem = msg.type === 'system';
                      return (
                      <div key={msg.id} onContextMenu={(e) => handleContextMenu(e, 'message', msg.id)} className={`group relative flex gap-5 hover:bg-white/[0.02] ${isSystem ? 'px-4 py-1' : `-mx-4 px-4 ${appSettings.uiDensity === 'compact' ? 'py-1.5' : 'py-3'}`} rounded-2xl transition-all border border-transparent hover:border-white/[0.02] ${activeThreadMsg?.id === msg.id ? 'bg-white/[0.05] border-white/[0.1]' : ''}`}>
                        {!isSystem && (
                          <div onClick={() => setSelectedUserId(msg.userId)} onContextMenu={(e) => handleContextMenu(e, 'user', msg.userId)} className={`rounded-[16px] bg-[#080808] border border-white/[0.05] flex items-center justify-center font-black text-white shrink-0 mt-0.5 cursor-pointer hover:scale-105 transition-transform shadow-lg ${appSettings.uiDensity === 'compact' ? 'w-10 h-10 text-base' : 'w-12 h-12 text-lg'}`} style={{ color: getRole(getUser(msg.userId).roleId).color }}>
                            {getUser(msg.userId).name.charAt(0)}
                          </div>
                        )}
                        <div className={`flex flex-col flex-1 min-w-0 ${!isSystem ? 'pb-1' : ''}`}>
                          {!isSystem && (
                            <div className="flex items-baseline gap-3 mb-1">
                              <span onClick={() => setSelectedUserId(msg.userId)} onContextMenu={(e) => handleContextMenu(e, 'user', msg.userId)} className="font-bold text-[16px] hover:underline cursor-pointer" style={{ color: getRole(getUser(msg.userId).roleId).color }}>{getUser(msg.userId).name}</span>
                              <span className="text-[11px] text-zinc-500 font-medium tracking-wide">{msg.time}</span>
                            </div>
                          )}
                          {renderMessageContent(msg)}
                        </div>
                      </div>
                    )})}
                    <div ref={messagesEndRef} />
                  </div>
                </div>

                {/* --- CHAT INPUT --- */}
                <div className="absolute bottom-6 left-0 right-0 px-6 flex justify-center z-20">
                  <div className={`w-full ${isZenMode ? 'max-w-3xl' : 'max-w-4xl'} relative`}>
                    <div className={`bg-[#0a0a0c]/95 backdrop-blur-3xl border border-white/[0.08] rounded-[24px] p-2 transition-all duration-300 shadow-[0_10px_40px_rgba(0,0,0,0.5)] flex flex-col gap-1 ${isInputFocused ? 'border-white/[0.2] shadow-[0_0_30px_rgba(255,255,255,0.05)]' : ''}`}>
                      <div className={`flex items-end gap-2`}>
                        <button className="h-11 w-11 shrink-0 rounded-xl bg-white/[0.02] text-zinc-400 flex items-center justify-center hover:bg-white/[0.08] hover:text-white transition-colors mb-0.5"><Plus size={20} /></button>
                        <textarea ref={textareaRef} value={inputValue} onChange={(e) => setInputValue(e.target.value)} onKeyDown={handleKeyDown} onFocus={() => setIsInputFocused(true)} onBlur={() => setIsInputFocused(false)} placeholder={inputPlaceholder} className="flex-1 bg-transparent text-zinc-200 py-3.5 px-2 outline-none resize-none text-[15px] custom-scrollbar max-h-32 placeholder-zinc-600 font-medium" rows={1} />
                        <div className="flex items-center gap-1 mb-0.5 mr-0.5">
                          <button className="h-11 w-11 rounded-xl text-zinc-400 hover:text-white hover:bg-white/[0.05] flex items-center justify-center transition-colors"><Smile size={20}/></button>
                          {inputValue.trim() ? (
                             <button onClick={handleSendMessage} className="h-11 w-11 text-black rounded-xl flex items-center justify-center transition-colors hover:scale-105" style={{ backgroundColor: accentColor, boxShadow: `0 0 15px ${accentColor}50` }}><Send size={18}/></button>
                          ) : (
                             <button onClick={() => setIsAIPromptOpen(true)} className="h-11 w-11 text-[#b266ff] bg-[#b266ff]/10 hover:bg-[#b266ff]/20 rounded-xl flex items-center justify-center transition-colors"><Sparkles size={20}/></button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )
          )}
        </main>

        {/* --- PRAWY PANEL --- */}
        {!isZenMode && isRightPanelOpen && activeServer !== 'home' && (
          <aside className="w-[280px] flex flex-col shrink-0 z-10 bg-[#080808]/50 border-l border-white/[0.04] relative">
            <div className="flex-1 flex flex-col relative z-10 animate-in fade-in duration-300">
              <div className="p-4 border-b border-white/[0.04]">
                <div className="flex bg-black/60 border border-white/[0.05] rounded-xl p-1">
                   <button onClick={() => setRightPanelTab('users')} className={`flex-1 py-2 text-[11px] font-bold uppercase tracking-widest rounded-lg transition-all flex items-center justify-center gap-1.5 ${rightPanelTab === 'users' ? 'bg-white/[0.1] text-white shadow-sm' : 'text-zinc-500 hover:text-white'}`}><Users size={14} /></button>
                   <button onClick={() => setRightPanelTab('ai')} className={`flex-1 py-2 text-[11px] font-bold uppercase tracking-widest rounded-lg transition-all flex items-center justify-center gap-1.5 ${rightPanelTab === 'ai' ? 'bg-[#b266ff]/20 text-[#b266ff] shadow-sm' : 'text-zinc-500 hover:text-[#b266ff]'}`}><Sparkles size={14} /></button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-4">
                {rightPanelTab === 'users' && (
                  <div className="space-y-6">
                    {groupedUsers.onlineByRole.map((group) => (
                      <div key={group.role.id} className="flex flex-col gap-2">
                        <div className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-black border shadow-lg" style={{ borderColor: `${group.role.color}30`, boxShadow: `inset 3px 0 0 0 ${group.role.color}` }}>
                           <div className="flex items-center gap-2" style={{ color: group.role.color }}>
                             <group.role.icon size={14} />
                             <span className="text-[11px] font-bold uppercase tracking-widest">{group.role.name}</span>
                           </div>
                           <span className="w-5 h-5 rounded-full bg-black flex items-center justify-center text-[10px] font-bold border border-white/[0.1] text-zinc-300">{group.users.length}</span>
                        </div>
                        {group.users.map(user => {
                          return (
                            <div key={user.id} onClick={() => setSelectedUserId(user.id)} onContextMenu={(e) => handleContextMenu(e, 'user', user.id)} className="flex items-center gap-3 p-1 rounded-xl transition-colors cursor-pointer group hover:bg-white/[0.02]">
                              <div className="relative">
                                <div className="w-10 h-10 rounded-[14px] bg-black border border-white/[0.05] shadow-md flex items-center justify-center text-[15px] font-black transition-transform group-hover:scale-105" style={{ color: group.role.color }}>{user.name.charAt(0)}</div>
                                <div className={`absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full border-[3px] border-[#080808] ${getStatusClasses(user.status)}`} />
                              </div>
                              <div className="flex flex-col flex-1 min-w-0">
                                <span className="text-[15px] font-bold truncate leading-tight transition-all" style={{ color: group.role.color }}>{user.name}</span>
                                <span className="text-[10px] text-zinc-500 truncate group-hover:text-zinc-400 transition-colors">{getStatusText(user.status)}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </aside>
        )}
      </div>

      {/* --- PEŁNOEKRANOWE USTAWIENIA (ROZBUDOWANE UI) --- */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-[100] flex animate-in fade-in zoom-in-95 duration-200">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-xl" onClick={() => setIsSettingsOpen(false)} />
          
          <div className="w-[35%] md:w-[30%] lg:w-[25%] bg-[#080808] flex justify-end pr-4 py-16 relative z-10 border-r border-white/[0.05]">
             <nav className="w-56 flex flex-col gap-1">
                <div className="px-3 mb-2 mt-4"><h3 className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">Konto & Bezpieczeństwo</h3></div>
                  <SettingsSidebarItem id="profile" icon={User} label="Mój profil" />
                  <SettingsSidebarItem id="privacy" icon={ShieldCheck} label="Prywatność i Szyfrowanie" />
                  
                <div className="h-px bg-white/[0.05] my-4 mx-3" />
                <div className="px-3 mb-2"><h3 className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">System</h3></div>
                  <SettingsSidebarItem id="appearance" icon={Palette} label="Wygląd Systemu" />
                  <SettingsSidebarItem id="audio" icon={Volume2} label="Dźwięk i Wideo" />
                  
                <div className="h-px bg-white/[0.05] my-4 mx-3" />
                <div className="px-3 mb-2"><h3 className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">Subskrypcja</h3></div>
                  <button onClick={() => setSettingsTab('premium')} className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-bold transition-all relative overflow-hidden group ${settingsTab === 'premium' ? 'bg-[#00ffcc]/10 text-[#00ffcc]' : 'text-zinc-400 hover:text-white hover:bg-white/[0.05]'}`}>
                    <Sparkles size={18} className={settingsTab === 'premium' ? 'text-[#00ffcc]' : 'text-[#00ffcc]/70 group-hover:text-[#00ffcc] transition-colors'} />
                    <span>Flux^ Core</span>
                  </button>
                  
                  <div className="mt-auto pt-8">
                     <button onClick={() => setIsSettingsOpen(false)} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-red-400 hover:bg-red-500/10 transition-colors"><LogOut size={18} /><span>Zamknij Ustawienia</span></button>
                  </div>
             </nav>
          </div>
          
          <div className="flex-1 bg-[#050505] relative z-10 overflow-y-auto custom-scrollbar">
            <div className="sticky top-0 right-0 h-0 flex justify-end p-10 z-50">
               <button onClick={() => setIsSettingsOpen(false)} className="flex flex-col items-center group bg-[#050505]">
                 <div className="w-10 h-10 rounded-full border-2 border-zinc-700 flex items-center justify-center text-zinc-400 group-hover:bg-zinc-800 group-hover:text-white group-hover:border-zinc-500 transition-all"><X size={20} /></div>
                 <span className="text-[11px] mt-2 text-zinc-500 font-bold tracking-widest group-hover:text-zinc-400">ESC</span>
               </button>
            </div>
            
            <div className="max-w-3xl px-12 py-16">
                
                {/* --- ZAKŁADKA PROFIL --- */}
                {settingsTab === 'profile' && (
                  <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <h2 className="text-3xl font-black text-white mb-8 tracking-tight">Karta Identyfikacyjna</h2>
                    
                    <div className="bg-[#111]/80 backdrop-blur-md border border-white/[0.05] rounded-3xl overflow-hidden shadow-2xl mb-8 relative">
                      <div className="h-32 relative" style={{ background: `linear-gradient(to right, ${accentColor}30, #000000)` }}>
                        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-30" />
                        <button className="absolute top-4 right-4 bg-black/50 hover:bg-black/80 text-white text-xs font-bold px-3 py-1.5 rounded-lg border border-white/[0.1] backdrop-blur-md transition-colors flex items-center gap-2"><ImageIcon size={14} /> Edytuj Tło</button>
                      </div>
                      <div className="px-8 pb-8 relative">
                        <div className="w-24 h-24 rounded-2xl text-black text-4xl font-black flex items-center justify-center absolute -top-12 border-4 border-[#111] shadow-lg cursor-pointer group" style={{ backgroundColor: accentColor }}>
                          <span className="group-hover:opacity-0 transition-opacity">F</span>
                          <div className="absolute inset-0 bg-black/50 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white"><ImageIcon size={24}/></div>
                        </div>
                        <div className="pt-16 flex items-start justify-between">
                          <div>
                            <h3 className="text-2xl font-bold text-white flex items-center gap-3">Flux_User <span className="bg-[#b266ff]/20 text-[#b266ff] text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-md font-bold flex items-center gap-1"><Sparkles size={10} /> Core</span></h3>
                            <p className="text-sm text-zinc-400 mt-1">#0001</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="bg-[#111]/80 backdrop-blur-md border border-white/[0.05] rounded-3xl p-8 shadow-xl">
                       <h3 className="text-sm font-bold uppercase tracking-widest text-zinc-400 mb-6">Edycja Danych Profilowych</h3>
                       <div className="space-y-5">
                         <div>
                           <label className="block text-[11px] font-bold uppercase tracking-widest text-zinc-500 mb-2">Wyświetlana Nazwa</label>
                           <input type="text" defaultValue="Flux_User" className="w-full bg-black/40 border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-white/[0.2] transition-colors" />
                         </div>
                         <div>
                           <label className="block text-[11px] font-bold uppercase tracking-widest text-zinc-500 mb-2">Krótkie Bio</label>
                           <textarea rows={3} defaultValue="Główny inżynier systemowy." className="w-full bg-black/40 border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-white/[0.2] transition-colors resize-none" />
                         </div>
                       </div>
                       <div className="mt-8 pt-6 border-t border-white/[0.05] flex justify-end">
                         <button className="px-6 py-2.5 rounded-xl font-bold text-black transition-transform hover:scale-105" style={{ backgroundColor: accentColor, boxShadow: `0 0 15px ${accentColor}40` }}>Zapisz Zmiany</button>
                       </div>
                    </div>
                  </div>
                )}

                {/* --- ZAKŁADKA PRYWATNOŚĆ I BEZPIECZEŃSTWO --- */}
                {settingsTab === 'privacy' && (
                  <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <h2 className="text-3xl font-black text-white mb-8 tracking-tight flex items-center gap-3"><ShieldCheck size={28} style={{ color: accentColor }} /> Prywatność i Bezpieczeństwo</h2>
                    
                    <div className="space-y-6">
                      <div className="bg-[#111]/80 backdrop-blur-md border border-white/[0.05] rounded-3xl p-8 shadow-xl">
                        <h3 className="text-sm font-bold uppercase tracking-widest text-zinc-400 mb-6">Filtrowanie Bezpośrednich Wiadomości (DM)</h3>
                        <div className="space-y-3">
                          <div onClick={() => handleSettingChange('dmScanLevel', 'safe')} className={`p-4 rounded-2xl border cursor-pointer transition-colors ${appSettings.dmScanLevel === 'safe' ? 'bg-emerald-500/10 border-emerald-500/50' : 'bg-black/40 border-white/[0.05] hover:bg-black/60'}`}>
                            <div className="flex items-center justify-between mb-1">
                              <span className={`font-bold ${appSettings.dmScanLevel === 'safe' ? 'text-emerald-400' : 'text-white'}`}>Bezpieczny (Zalecane)</span>
                              {appSettings.dmScanLevel === 'safe' && <CheckCircle2 size={16} className="text-emerald-500" />}
                            </div>
                            <p className="text-xs text-zinc-400">Flux-AI analizuje linki i skanuje załączniki pod kątem złośliwego kodu przed ich wyświetleniem.</p>
                          </div>
                          <div onClick={() => handleSettingChange('dmScanLevel', 'medium')} className={`p-4 rounded-2xl border cursor-pointer transition-colors ${appSettings.dmScanLevel === 'medium' ? 'bg-amber-500/10 border-amber-500/50' : 'bg-black/40 border-white/[0.05] hover:bg-black/60'}`}>
                            <div className="flex items-center justify-between mb-1">
                              <span className={`font-bold ${appSettings.dmScanLevel === 'medium' ? 'text-amber-400' : 'text-white'}`}>Tylko od nieznajomych</span>
                              {appSettings.dmScanLevel === 'medium' && <CheckCircle2 size={16} className="text-amber-500" />}
                            </div>
                            <p className="text-xs text-zinc-400">Skanowane są tylko wiadomości od użytkowników poza Twoimi Węzłami Systemowymi.</p>
                          </div>
                        </div>
                      </div>

                      <div className="bg-[#111]/80 backdrop-blur-md border border-white/[0.05] rounded-3xl p-8 shadow-xl space-y-6">
                         <div className="flex items-center justify-between">
                           <div>
                             <h4 className="text-sm font-bold text-white flex items-center gap-2 mb-1"><Sparkles size={16} className="text-[#b266ff]" /> Model Trenowania AI</h4>
                             <p className="text-xs text-zinc-400 max-w-md">Pozwól na użycie zanonimizowanych logów w celu ulepszania Flux-AI.</p>
                           </div>
                           <CustomToggle active={appSettings.aiDataShare} onClick={() => handleSettingChange('aiDataShare', !appSettings.aiDataShare)} accentColor={accentColor} />
                         </div>
                      </div>

                      <div className="bg-[#111]/80 backdrop-blur-md border border-white/[0.05] rounded-3xl p-8 shadow-xl">
                        <h3 className="text-sm font-bold uppercase tracking-widest text-zinc-400 mb-6 flex items-center gap-2"><MonitorPlay size={16} /> Aktywne Sesje</h3>
                        <div className="space-y-3">
                          <div className="flex items-center justify-between bg-black/40 p-4 rounded-2xl border border-white/[0.05]">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-xl bg-white/[0.05] flex items-center justify-center text-white"><Monitor size={18} /></div>
                              <div><p className="text-sm font-bold text-white">Windows 11 • Flux App</p><p className="text-xs text-emerald-400">Obecna sesja (Warszawa, PL)</p></div>
                            </div>
                          </div>
                          <div className="flex items-center justify-between bg-black/40 p-4 rounded-2xl border border-white/[0.05]">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-xl bg-white/[0.05] flex items-center justify-center text-zinc-400"><Smartphone size={18} /></div>
                              <div><p className="text-sm font-bold text-zinc-300">iOS 17 • Safari</p><p className="text-xs text-zinc-500">Ostatnio wczoraj (Kraków, PL)</p></div>
                            </div>
                            <button className="px-3 py-1.5 rounded-lg text-xs font-bold text-red-400 hover:bg-red-500/10 transition-colors">Wyloguj</button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* --- ZAKŁADKA WYGLĄD --- */}
                {settingsTab === 'appearance' && (
                  <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <h2 className="text-3xl font-black text-white mb-8 tracking-tight flex items-center gap-3">
                      <Palette size={28} style={{ color: accentColor }} /> Wygląd Systemu
                    </h2>
                    
                    <div className="space-y-8">
                      {/* Kolor Wiodący */}
                      <div className="bg-[#111]/80 backdrop-blur-md border border-white/[0.05] rounded-3xl p-8 shadow-xl">
                        <h3 className="text-sm font-bold uppercase tracking-widest text-zinc-400 mb-4">Kolor Wiodący (Accent)</h3>
                        <p className="text-sm text-zinc-500 mb-6">Zmienia główny kolor akcentów interfejsu w całym systemie Flux^.</p>
                        
                        <div className="flex flex-wrap gap-4">
                           {['#00ffcc', '#ff0055', '#b266ff', '#ffb300', '#10b981', '#3b82f6'].map(color => (
                             <button key={color} onClick={() => setAccentColor(color)} className={`relative w-16 h-16 rounded-2xl flex items-center justify-center transition-all ${accentColor === color ? 'border-[3px] border-white scale-110' : 'border border-transparent hover:scale-105'}`} style={{ backgroundColor: color, boxShadow: accentColor === color ? `0 0 20px ${color}80` : undefined }}>
                               {accentColor === color && <Check size={24} className={color === '#00ffcc' || color === '#ffb300' ? 'text-black' : 'text-white'} />}
                             </button>
                           ))}
                        </div>
                      </div>

                      {/* Typografia */}
                      <div className="bg-[#111]/80 backdrop-blur-md border border-white/[0.05] rounded-3xl p-8 shadow-xl">
                        <h3 className="text-sm font-bold uppercase tracking-widest text-zinc-400 mb-4 flex items-center gap-2"><TypeIcon size={16} /> Typografia</h3>
                        <div className="flex items-center gap-4 mb-6">
                           <span className="text-xs font-bold text-zinc-500">Aa</span>
                           <CustomSlider min={12} max={20} value={appSettings.fontSize} onChange={(v) => handleSettingChange('fontSize', v)} accentColor={accentColor} />
                           <span className="text-lg font-bold text-zinc-500">Aa</span>
                        </div>
                        <div className="bg-black/40 border border-white/[0.05] p-4 rounded-xl">
                           <p style={{ fontSize: `${appSettings.fontSize}px` }} className="text-zinc-300">Niezbędne ulepszenia w systemie Flux^ sprawiają, że czytanie to czysta przyjemność. Obecny rozmiar: <span style={{ color: accentColor }} className="font-bold">{appSettings.fontSize}px</span>.</p>
                        </div>
                      </div>

                      {/* Zagęszczenie Interfejsu */}
                      <div className="bg-[#111]/80 backdrop-blur-md border border-white/[0.05] rounded-3xl p-8 shadow-xl">
                        <h3 className="text-sm font-bold uppercase tracking-widest text-zinc-400 mb-4 flex items-center gap-2"><LayoutGrid size={16} /> Zagęszczenie Wiadomości</h3>
                        <div className="grid grid-cols-2 gap-4">
                           <div onClick={() => handleSettingChange('uiDensity', 'cozy')} className={`p-4 rounded-2xl border cursor-pointer transition-colors flex items-center justify-between ${appSettings.uiDensity === 'cozy' ? 'bg-white/[0.05] border-white/[0.3]' : 'bg-black/40 border-white/[0.05] hover:bg-black/60'}`} style={appSettings.uiDensity === 'cozy' ? { borderColor: accentColor } : {}}>
                             <span className={`font-bold ${appSettings.uiDensity === 'cozy' ? 'text-white' : 'text-zinc-400'}`}>Standardowe (Cozy)</span>
                             {appSettings.uiDensity === 'cozy' && <div className="w-3 h-3 rounded-full" style={{ backgroundColor: accentColor, boxShadow: `0 0 10px ${accentColor}` }} />}
                           </div>
                           <div onClick={() => handleSettingChange('uiDensity', 'compact')} className={`p-4 rounded-2xl border cursor-pointer transition-colors flex items-center justify-between ${appSettings.uiDensity === 'compact' ? 'bg-white/[0.05] border-white/[0.3]' : 'bg-black/40 border-white/[0.05] hover:bg-black/60'}`} style={appSettings.uiDensity === 'compact' ? { borderColor: accentColor } : {}}>
                             <span className={`font-bold ${appSettings.uiDensity === 'compact' ? 'text-white' : 'text-zinc-400'}`}>Kompaktowe (Hacker)</span>
                             {appSettings.uiDensity === 'compact' && <div className="w-3 h-3 rounded-full" style={{ backgroundColor: accentColor, boxShadow: `0 0 10px ${accentColor}` }} />}
                           </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* --- ZAKŁADKA AUDIO & WIDEO --- */}
                {settingsTab === 'audio' && (
                  <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <h2 className="text-3xl font-black text-white mb-8 tracking-tight flex items-center gap-3"><Volume2 size={28} style={{ color: accentColor }} /> Dźwięk i Wideo</h2>
                    
                    <div className="space-y-6">
                      <div className="bg-[#111]/80 backdrop-blur-md border border-white/[0.05] rounded-3xl p-8 shadow-xl">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 mb-8">
                           <div>
                             <label className="block text-[11px] font-bold uppercase tracking-widest text-zinc-500 mb-3 flex items-center gap-2"><Mic size={14}/> Urządzenie Wejściowe</label>
                             <CustomSelect 
                               value={appSettings.micDevice} 
                               onChange={(v: string) => handleSettingChange('micDevice', v)} 
                               accentColor={accentColor}
                               options={[{ value: 'default', label: 'Domyślny mikrofon systemowy' }, { value: 'mic-1', label: 'Mikrofon strumieniowy (USB)' }]} 
                             />
                             <div className="mt-6">
                                <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-600 mb-3">Czułość mikrofonu ({appSettings.micVol}%)</label>
                                <CustomSlider min={0} max={100} value={appSettings.micVol} onChange={(v) => handleSettingChange('micVol', v)} accentColor={accentColor} />
                             </div>
                             <div className="mt-6 p-3 bg-black/40 rounded-xl border border-white/[0.05]">
                               <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2 block">Test wejścia</span>
                               <div className="h-2 w-full bg-white/[0.05] rounded-full overflow-hidden flex">
                                 {/* Mock animacji paska audio */}
                                 <div className="h-full w-2/3 bg-emerald-500 animate-pulse-fast" />
                               </div>
                             </div>
                           </div>

                           <div>
                             <label className="block text-[11px] font-bold uppercase tracking-widest text-zinc-500 mb-3 flex items-center gap-2"><Headphones size={14}/> Urządzenie Wyjściowe</label>
                             <CustomSelect 
                               value={appSettings.outDevice} 
                               onChange={(v: string) => handleSettingChange('outDevice', v)} 
                               accentColor={accentColor}
                               options={[{ value: 'out-1', label: 'Domyślne słuchawki systemowe' }, { value: 'out-2', label: 'Głośniki Monitora' }]} 
                             />
                             <div className="mt-6">
                                <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-600 mb-3">Głośność wyjścia ({appSettings.outVol}%)</label>
                                <CustomSlider min={0} max={100} value={appSettings.outVol} onChange={(v) => handleSettingChange('outVol', v)} accentColor={accentColor} />
                             </div>
                           </div>
                        </div>

                        <div className="pt-8 border-t border-white/[0.05] space-y-6">
                           <div className="flex items-center justify-between">
                             <div>
                               <h4 className="text-sm font-bold text-white flex items-center gap-2 mb-1"><Sparkles size={16} className="text-[#b266ff]" /> Redukcja Szumów Flux-AI</h4>
                               <p className="text-xs text-zinc-400 max-w-md">Najnowszy model sieci neuronowej filtruje stukanie klawiatury i wiatraki PC w czasie rzeczywistym.</p>
                             </div>
                             <CustomToggle active={appSettings.noiseCancel} onClick={() => handleSettingChange('noiseCancel', !appSettings.noiseCancel)} accentColor={accentColor} />
                           </div>
                           <div className="flex items-center justify-between">
                             <div>
                               <h4 className="text-sm font-bold text-white flex items-center gap-2 mb-1">Tłumienie Echa</h4>
                               <p className="text-xs text-zinc-400 max-w-md">Zapobiega zapętlaniu dźwięku z głośników z powrotem do mikrofonu.</p>
                             </div>
                             <CustomToggle active={appSettings.echoCancel} onClick={() => handleSettingChange('echoCancel', !appSettings.echoCancel)} accentColor={accentColor} />
                           </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}