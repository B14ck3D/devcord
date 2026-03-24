import React, { useState, useRef, useEffect } from 'react';
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
  UploadCloud, Copy, Smile, MonitorUp
} from 'lucide-react';

// --- ROZBUDOWANE MOCK DATA ---
const mockServers = [
  { id: 's1', name: 'Flux_', icon: Zap, active: true, color: '#00eeff', glow: '0 0 15px rgba(0,238,255,0.4)' },
  { id: 's2', name: 'Projekt Alfa', icon: Code, hasNotification: true, color: '#00ffcc', glow: '0 0 15px rgba(0,255,204,0.4)' },
];

const mockChannels = [
  { id: 'c1', name: 'Ogólny Dyskusyjny', type: 'text', unread: true, color: '#00eeff', icon: Hash },
  { id: 'c2', name: 'Ważne Komunikaty', type: 'text', color: '#ff0055', icon: Shield },
  { id: 'c3', name: 'Dev Talk & Kawa', type: 'text', color: '#b266ff', icon: Coffee },
  { id: 'v1', name: 'Lobby Główne', type: 'voice', color: '#a1a1aa', icon: Radio },
  { id: 'v2', name: 'Deep Work (Cisza)', type: 'voice', color: '#ff9900', icon: Headphones },
];

const mockRoles = [
  { id: 'r1', name: 'Zarząd Flux_', color: '#00eeff', bg: 'rgba(0, 238, 255, 0.08)', border: 'rgba(0, 238, 255, 0.25)', icon: Crown, glow: '0 0 12px rgba(0,238,255,0.4)' },
  { id: 'r2', name: 'Lead Developer', color: '#00ffcc', bg: 'rgba(0, 255, 204, 0.08)', border: 'rgba(0, 255, 204, 0.25)', icon: Terminal, glow: '0 0 12px rgba(0,255,204,0.4)' },
  { id: 'r3', name: 'Design', color: '#b266ff', bg: 'rgba(178, 102, 255, 0.08)', border: 'rgba(178, 102, 255, 0.25)', icon: Sparkles, glow: '0 0 12px rgba(178,102,255,0.4)' },
  { id: 'r4', name: 'Użytkownicy', color: '#a1a1aa', bg: 'rgba(161, 161, 170, 0.05)', border: 'rgba(161, 161, 170, 0.1)', icon: Users, glow: 'none' },
];

const mockUsers = [
  { id: 'u1', name: 'Admin', roleId: 'r1', status: 'online' as const },
  { id: 'u2', name: 'Kamil_Dev', roleId: 'r2', status: 'online' as const },
  { id: 'u3', name: 'Anna_UX', roleId: 'r3', status: 'idle' as const },
  { id: 'u4', name: 'Piotr', roleId: 'r4', status: 'offline' as const },
];

type ChatRow = {
  id: string | number;
  userId: string;
  time: string;
  content: string;
  isMe?: boolean;
  reactions?: { emoji: string; count: number; userReacted: boolean }[];
};

function guestSessionId(): string {
  const k = 'flux_guest_id';
  let id = sessionStorage.getItem(k);
  if (!id) {
    id = 'g_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    sessionStorage.setItem(k, id);
  }
  return id;
}

// --- MOCK DLA UDOSTĘPNIANIA EKRANU W IFRAME ---
// Ponieważ środowisko iframe blokuje rzeczywiste getDisplayMedia, używamy Canvasa jako fallbacku.
const createMockScreenStream = (): MediaStream => {
  const canvas = document.createElement('canvas');
  canvas.width = 1280;
  canvas.height = 720;
  const ctx = canvas.getContext('2d');
  let animationId: number;
  
  let x = 0;
  let dx = 4;

  const draw = () => {
    if (!ctx) return;
    // Tło
    ctx.fillStyle = '#0a0a0c';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Tekst
    ctx.fillStyle = '#00eeff';
    ctx.font = 'bold 48px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('SYMULACJA EKRANU FLUX_', canvas.width / 2, canvas.height / 2 - 30);
    
    ctx.fillStyle = '#ff0055';
    ctx.font = '24px sans-serif';
    ctx.fillText('Prawdziwe API zostało zablokowane przez uprawnienia środowiska testowego.', canvas.width / 2, canvas.height / 2 + 30);
    
    // Animowany pasek (aby pokazać, że stream to wideo)
    ctx.fillStyle = '#00ffcc';
    ctx.fillRect(x, canvas.height - 40, 300, 10);
    x += dx;
    if (x > canvas.width - 300 || x < 0) dx = -dx;
    
    animationId = requestAnimationFrame(draw);
  };
  draw();
  
  // Pobieramy strumień z canvasa (30 FPS)
  const stream = canvas.captureStream(30);
  
  // Zapewniamy wyłączenie animacji przy zatrzymaniu streamu
  const track = stream.getVideoTracks()[0];
  const originalStop = track.stop.bind(track);
  track.stop = () => {
    cancelAnimationFrame(animationId);
    originalStop();
  };
  
  return stream;
};

// --- KOMPONENT WIDEO ---
const VideoPlayer = ({ stream, isLocal, className }: { stream: MediaStream | null, isLocal?: boolean, className?: string }) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  if (!stream) return null;

  return (
    <video 
      ref={videoRef} 
      autoPlay 
      playsInline 
      muted={isLocal} 
      className={`object-cover ${className}`} 
    />
  );
};

export default function App() {
  const [activeServer, setActiveServer] = useState('s1');
  const [isWorkspaceDropdownOpen, setIsWorkspaceDropdownOpen] = useState(false);
  const [activeChannel, setActiveChannel] = useState('c1');
  const [inputValue, setInputValue] = useState('');
  
  // Stany UX
  const [isZenMode, setIsZenMode] = useState(false);
  const [rightPanelTab, setRightPanelTab] = useState<'members' | 'files' | 'tasks' | null>('members');
  const [isInputFocused, setIsInputFocused] = useState(false);
  
  // Stany AI, Drag&Drop
  const [isAIPromptOpen, setIsAIPromptOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  
  // Stany Voice, Screen Share, Wątki, Ustawienia
  const [activeVoiceChannel, setActiveVoiceChannel] = useState<string | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [activeThread, setActiveThread] = useState<ChatRow | null>(null);
  const [threadInputValue, setThreadInputValue] = useState('');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'profile' | 'audio'>('profile');
  const [micDeviceId, setMicDeviceId] = useState(() => {
    try {
      return localStorage.getItem('flux_mic_device') ?? '';
    } catch {
      return '';
    }
  });
  const [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([]);
  const [isCmdPaletteOpen, setIsCmdPaletteOpen] = useState(false);
  const [cmdSearchQuery, setCmdSearchQuery] = useState('');
  
  const guestIdRef = useRef(guestSessionId());
  const wsRef = useRef<WebSocket | null>(null);
  const [messagesByChannel, setMessagesByChannel] = useState<Record<string, ChatRow[]>>({});
  const messages = messagesByChannel[activeChannel] ?? [];
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const myUserId = guestIdRef.current;

  const {
    phase: voicePhase,
    error: voiceError,
    participants: voiceParticipants,
    localMuted,
    setLocalMuted,
  } = useVoiceRoom({
    enabled: !!activeVoiceChannel,
    roomId: activeVoiceChannel,
    userId: myUserId,
    micDeviceId,
  });

  const refreshAudioDevices = async () => {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) return;
      const list = await navigator.mediaDevices.enumerateDevices();
      setAudioInputs(list.filter((d) => d.kind === 'audioinput'));
    } catch { /* ignore */ }
  };

  useEffect(() => { void refreshAudioDevices(); }, [isSettingsOpen, settingsTab]);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsCmdPaletteOpen(prev => !prev);
      }
      if (e.key === 'Escape') {
        setIsCmdPaletteOpen(false);
        setIsSettingsOpen(false);
        setIsAIPromptOpen(false);
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, activeChannel]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 150)}px`;
    }
  }, [inputValue, isAIPromptOpen]);

  const handleSendMessage = () => {
    if (!inputValue.trim() && !isAIPromptOpen) return;
    const contentToSend = isAIPromptOpen ? `**Flux AI:** ${inputValue.trim()}... (Generowanie)` : inputValue.trim();
    
    const timeString = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setMessagesByChannel((prev) => ({
      ...prev,
      [activeChannel]: [
        ...(prev[activeChannel] ?? []),
        { id: `local-${Date.now()}`, userId: guestIdRef.current, time: timeString, content: contentToSend, isMe: true },
      ],
    }));
    setInputValue('');
    setIsAIPromptOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleDragEnter = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); };
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); };
  const handleDrop = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); alert('System plików Flux_ przechwycił pliki!'); };

  const handleChannelClick = (channel: (typeof mockChannels)[number]) => {
    setActiveChannel(channel.id);
    setActiveThread(null);
    if (channel.type === 'voice') {
      setActiveVoiceChannel(channel.id);
    }
  };

  const disconnectVoice = () => {
    setActiveVoiceChannel(null);
    if (screenStream) {
      screenStream.getTracks().forEach(track => track.stop());
      setScreenStream(null);
    }
    const currentViewType = mockChannels.find(c => c.id === activeChannel)?.type;
    if (currentViewType === 'voice') {
      setActiveChannel('c1');
    }
  };

  const toggleScreenShare = async () => {
    if (screenStream) {
      screenStream.getTracks().forEach(track => track.stop());
      setScreenStream(null);
    } else {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ 
          video: { cursor: "always" } as any, 
          audio: false 
        });
        stream.getVideoTracks()[0].onended = () => {
          setScreenStream(null);
        };
        setScreenStream(stream);
      } catch (err) {
        console.warn("Zablokowano natywne getDisplayMedia. Używam symulacji streamu.", err);
        // Fallback dla środowiska iframe, jeśli wywołanie oryginalnego API zostanie odrzucone
        const mockStream = createMockScreenStream();
        mockStream.getVideoTracks()[0].onended = () => {
          setScreenStream(null);
        };
        setScreenStream(mockStream);
      }
    }
  };

  const openThread = (msg: ChatRow) => {
    setActiveThread(msg);
    setRightPanelTab(null);
  };

  const getUser = (id: string) => {
    const u = mockUsers.find((x) => x.id === id);
    if (u) return u;
    const me = id === guestIdRef.current;
    return { id, name: me ? 'Ty' : `Gość·${id.slice(-6)}`, roleId: 'r4', status: 'online' as const };
  };
  
  const getRole = (roleId: string) => mockRoles.find((r) => r.id === roleId) ?? mockRoles[3];

  const userIdsOnVoiceChannel = (channelId: string) => {
    if (activeVoiceChannel === channelId) return voiceParticipants;
    return [];
  };

  const renderMessageContent = (content: string) => {
    if (!content.includes('\u0060\u0060\u0060')) return <span className="whitespace-pre-wrap break-words">{content}</span>;
    
    const parts = content.split(/(\u0060\u0060\u0060[\s\S]*?\u0060\u0060\u0060)/g);
    return parts.map((part, i) => {
      if (part.startsWith('\u0060\u0060\u0060') && part.endsWith('\u0060\u0060\u0060')) {
        const rawCode = part.slice(3, -3);
        const firstNewLine = rawCode.indexOf('\n');
        const lang = firstNewLine !== -1 ? rawCode.slice(0, firstNewLine).trim() : '';
        const code = firstNewLine !== -1 ? rawCode.slice(firstNewLine + 1) : rawCode;

        return (
          <div key={i} className="my-3 rounded-xl bg-[#080808] border border-white/[0.1] overflow-hidden shadow-lg group/code">
            <div className="flex items-center justify-between px-4 py-2 bg-white/[0.03] border-b border-white/[0.05]">
              <span className="text-[10px] uppercase tracking-[0.2em] text-[#00eeff] font-bold">{lang || 'Code'}</span>
              <button className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-zinc-500 hover:text-white transition-colors">
                <Copy size={12} /> Kopiuj
              </button>
            </div>
            <pre className="p-4 text-[13px] text-zinc-300 font-mono overflow-x-auto leading-relaxed">
              <code>{code}</code>
            </pre>
          </div>
        );
      }
      return <span key={i} className="whitespace-pre-wrap break-words">{part}</span>;
    });
  };

  const currentChannelData = mockChannels.find(c => c.id === activeChannel) || mockChannels[0];
  const isMainViewVoice = currentChannelData.type === 'voice';

  return (
    <div 
      className="flex h-screen w-full bg-[#000000] p-2 md:p-4 text-zinc-200 font-sans overflow-hidden selection:bg-[#00eeff]/30 selection:text-white relative"
      onDragEnter={handleDragEnter} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
    >
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; height: 4px; display: none; }
        .custom-scrollbar:hover::-webkit-scrollbar { display: block; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }
        .user-row:hover, .channel-row:hover { background-color: var(--hover-bg) !important; border-color: var(--hover-border) !important; }
      `}</style>

      {isDragging && (
        <div className="absolute inset-0 z-[200] bg-black/60 backdrop-blur-md flex flex-col items-center justify-center pointer-events-none border-4 border-dashed border-[#00eeff]/50 rounded-[32px] m-4">
          <div className="w-32 h-32 rounded-full bg-[#00eeff]/10 flex items-center justify-center mb-6 animate-bounce shadow-[0_0_50px_rgba(0,238,255,0.3)]">
            <UploadCloud size={64} className="text-[#00eeff]" />
          </div>
          <h2 className="text-4xl font-bold text-white mb-2 tracking-tight shadow-black drop-shadow-lg">Upuść pliki tutaj</h2>
          <p className="text-[#00eeff] text-lg font-medium tracking-wide">Flux_ natychmiast je udostępni.</p>
        </div>
      )}

      <div className="flex h-full w-full bg-[#050505] rounded-[32px] border border-white/[0.08] shadow-[0_0_80px_rgba(255,255,255,0.03)] overflow-hidden relative transition-all duration-500">
        
        {!isZenMode && (
          <aside className="w-[280px] flex flex-col shrink-0 z-30 border-r border-white/[0.04] bg-[#080808] transition-all duration-500">
            <div className="relative px-4 pt-6 pb-2 z-50">
              {(() => {
                const activeServerData = mockServers.find(s => s.id === activeServer) || mockServers[0];
                return (
                  <>
                    <button
                      onClick={() => setIsWorkspaceDropdownOpen(!isWorkspaceDropdownOpen)}
                      className="w-full flex items-center gap-3 p-2.5 rounded-2xl border transition-all duration-300 group hover:brightness-125 bg-black/50 backdrop-blur-md"
                      style={{ borderColor: `${activeServerData.color}30`, boxShadow: isWorkspaceDropdownOpen ? activeServerData.glow : `0 0 15px ${activeServerData.color}10` }}
                    >
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center transition-all" style={{ backgroundColor: `${activeServerData.color}20`, color: activeServerData.color }}>
                        <activeServerData.icon size={20} />
                      </div>
                      <div className="flex flex-col items-start flex-1 min-w-0">
                        <span className="text-[15px] font-bold truncate w-full text-left tracking-wide" style={{ color: activeServerData.color, textShadow: `0 0 10px ${activeServerData.color}40` }}>{activeServerData.name}</span>
                        <span className="text-[10px] text-zinc-500 font-medium uppercase tracking-widest mt-0.5">Przestrzeń robocza</span>
                      </div>
                      <ChevronsUpDown size={16} className="text-zinc-600 group-hover:text-zinc-300 transition-colors mr-1" />
                    </button>

                    {isWorkspaceDropdownOpen && (
                      <div className="absolute top-[calc(100%-4px)] left-4 right-4 mt-2 bg-[#0c0c0e]/95 backdrop-blur-3xl border border-white/[0.1] rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.9)] p-2 flex flex-col gap-1 z-50">
                        {mockServers.map(server => (
                          <button key={server.id} onClick={() => { setActiveServer(server.id); setIsWorkspaceDropdownOpen(false); }} className="w-full flex items-center gap-3 p-2 rounded-xl transition-all duration-200 hover:bg-white/[0.05] group">
                            <div className="w-8 h-8 rounded-lg flex items-center justify-center transition-transform group-hover:scale-105" style={{ color: server.color, backgroundColor: `${server.color}15`, border: `1px solid ${server.color}30` }}>
                              <server.icon size={14} />
                            </div>
                            <span className="text-sm font-semibold tracking-wide" style={{ color: server.color }}>{server.name}</span>
                            {activeServer === server.id && <Check size={16} className="ml-auto" style={{ color: server.color }} />}
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                );
              })()}
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar py-2 px-4 flex flex-col gap-6">
              <div>
                <div className="mb-2 px-2 flex items-center justify-between text-zinc-600 group">
                  <span className="text-[10px] uppercase tracking-[0.2em] font-bold group-hover:text-zinc-400 transition-colors">Przestrzenie</span>
                  <Plus size={12} className="opacity-0 group-hover:opacity-100 cursor-pointer hover:text-white transition-all" />
                </div>
                <div className="flex flex-col gap-0.5">
                  {mockChannels.filter(c => c.type === 'text').map(channel => (
                    <button
                      key={channel.id}
                      onClick={() => handleChannelClick(channel)}
                      className="channel-row flex items-center gap-2.5 py-1.5 px-3 rounded-lg text-sm transition-all duration-200 group border border-transparent"
                      style={activeChannel === channel.id ? { backgroundColor: `${channel.color}15`, borderColor: `${channel.color}30` } : { '--hover-bg': `${channel.color}10`, '--hover-border': `${channel.color}20` }}
                    >
                      <channel.icon size={16} style={{ color: activeChannel === channel.id ? channel.color : undefined }} className={activeChannel !== channel.id ? "text-zinc-500 group-hover:brightness-150 transition-all" : ""} />
                      <span className={`truncate ${activeChannel === channel.id ? 'font-semibold' : 'text-zinc-400 group-hover:text-zinc-200'}`} style={activeChannel === channel.id ? { color: channel.color, textShadow: `0 0 10px ${channel.color}40` } : {}}>
                        {channel.name}
                      </span>
                      {channel.unread && activeChannel !== channel.id && <div className="ml-auto w-1.5 h-1.5 rounded-full" style={{ backgroundColor: channel.color, boxShadow: `0 0 8px ${channel.color}` }}></div>}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-2 px-2 flex items-center justify-between text-zinc-600 group">
                  <span className="text-[10px] uppercase tracking-[0.2em] font-bold group-hover:text-zinc-400 transition-colors">Głosowe</span>
                  <Plus size={12} className="opacity-0 group-hover:opacity-100 cursor-pointer hover:text-white transition-all" />
                </div>
                <div className="flex flex-col gap-1">
                  {mockChannels.filter(c => c.type === 'voice').map(channel => {
                    const isActiveVoice = activeVoiceChannel === channel.id;
                    const isViewed = activeChannel === channel.id;
                    const participantsOnChannel = userIdsOnVoiceChannel(channel.id);
                    
                    return (
                      <div key={channel.id} className="flex flex-col">
                        <button 
                          onClick={() => handleChannelClick(channel)}
                          className="channel-row flex items-center gap-2.5 py-1.5 px-3 rounded-lg text-sm transition-all duration-200 group border border-transparent" 
                          style={isViewed || isActiveVoice ? { backgroundColor: `${channel.color}15`, borderColor: `${channel.color}30` } : { '--hover-bg': `${channel.color}10`, '--hover-border': `${channel.color}20` }}
                        >
                          {isActiveVoice ? (
                            <div className="w-4 h-4 flex items-center justify-center relative">
                              <Volume2 size={16} style={{ color: channel.color }} className="animate-pulse" />
                            </div>
                          ) : (
                            <channel.icon size={16} style={{ color: isViewed ? channel.color : undefined }} className={!isViewed ? "text-zinc-500 group-hover:brightness-150 transition-all" : ""} />
                          )}
                          <span className={`truncate ${isViewed || isActiveVoice ? 'font-semibold' : 'text-zinc-400 group-hover:text-zinc-200'}`} style={isViewed || isActiveVoice ? { color: channel.color, textShadow: `0 0 10px ${channel.color}40` } : {}}>
                            {channel.name}
                          </span>
                        </button>
                        
                        {participantsOnChannel.length > 0 && (
                          <div className="ml-8 mt-1.5 mb-1 flex flex-col gap-1.5">
                            {participantsOnChannel.map((uid) => {
                              const u = getUser(uid);
                              const isMe = uid === guestIdRef.current;
                              return (
                                <div key={uid} className="flex items-center gap-2 text-xs text-zinc-400 py-1 px-2 rounded-md hover:bg-white/[0.05] cursor-pointer transition-colors border border-transparent hover:border-white/[0.05]">
                                  <div className="relative shrink-0">
                                    <div className="w-5 h-5 rounded-md bg-zinc-800 flex items-center justify-center text-[9px] font-bold text-white border border-white/[0.05]">
                                      {u.name.charAt(0)}
                                    </div>
                                    <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 border-2 rounded-full ${isMe && voicePhase === 'connected' ? 'bg-[#00eeff] border-[#080808]' : 'bg-emerald-500 border-[#080808]'}`} />
                                  </div>
                                  <span className={`truncate ${isMe ? 'text-[#00eeff] font-medium' : ''}`}>
                                    {u.name}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="h-16 border-t border-white/[0.04] bg-black/40 p-2 flex items-center z-50">
              <div className="flex items-center gap-2 flex-1 hover:bg-white/[0.05] p-1.5 rounded-lg cursor-pointer transition-colors">
                <div className="relative">
                  <div className="w-8 h-8 rounded-lg bg-white text-black flex items-center justify-center font-bold text-sm">F</div>
                  <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-white border-2 border-[#080808] rounded-full shadow-[0_0_10px_rgba(255,255,255,0.5)]"></div>
                </div>
                <div className="flex flex-col overflow-hidden">
                  <span className="text-xs font-bold text-white truncate leading-tight">Admin</span>
                  <span className="text-[10px] text-zinc-500 truncate leading-tight">Zarząd Flux_</span>
                </div>
              </div>
              <div className="flex items-center gap-0.5 text-zinc-500">
                <button onClick={() => setIsSettingsOpen(true)} className="p-1.5 hover:text-white hover:bg-white/[0.05] rounded-md transition-colors"><Settings size={16} /></button>
              </div>
            </div>
          </aside>
        )}

        <main className="flex-1 flex flex-col relative bg-[#0a0a0c] overflow-hidden z-0 border-l border-white/[0.02] transition-all duration-500">
          <header className="h-16 flex items-center justify-between px-6 border-b border-white/[0.04] bg-[#0a0a0c]/80 backdrop-blur-md shrink-0 z-10 transition-all">
            <div className="flex items-center gap-3 text-sm font-medium">
              <currentChannelData.icon size={20} style={{ color: currentChannelData.color }} />
              <span className="tracking-tight font-bold text-lg" style={{ color: currentChannelData.color, textShadow: `0 0 15px ${currentChannelData.color}40` }}>
                {currentChannelData.name}
              </span>
              <div className="w-[1px] h-4 bg-white/[0.1] mx-2 hidden md:block"></div>
              <span className="text-xs text-zinc-500 hidden md:block font-normal">
                {isMainViewVoice ? 'Aktywna komunikacja głosowa.' : 'System operacyjny Flux_.'}
              </span>
            </div>
            
            <div className="flex items-center gap-2 text-zinc-400">
              {!isMainViewVoice && !isZenMode && (
                <div className="flex items-center gap-1 border-r border-white/[0.1] pr-2 mr-2">
                  <button className="p-2 hover:text-white hover:bg-white/[0.05] rounded-lg transition-colors"><Phone size={18} /></button>
                  <button className="p-2 hover:text-white hover:bg-white/[0.05] rounded-lg transition-colors"><Video size={18} /></button>
                </div>
              )}

              <button 
                onClick={() => setIsZenMode(!isZenMode)}
                className={`p-2 rounded-lg transition-all duration-300 ${isZenMode ? 'bg-white text-black shadow-[0_0_15px_rgba(255,255,255,0.3)]' : 'hover:text-white hover:bg-white/[0.05]'}`}
                title={isZenMode ? "Wyłącz Tryb Skupienia" : "Włącz Tryb Skupienia"}
              >
                {isZenMode ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
              </button>

              {!isZenMode && (
                <button 
                  onClick={() => { setActiveThread(null); setRightPanelTab(rightPanelTab === 'members' ? null : 'members'); }} 
                  className={`p-2 rounded-lg transition-colors ${(rightPanelTab && !activeThread) ? 'bg-white/[0.1] text-white' : 'hover:text-white hover:bg-white/[0.05]'}`}
                >
                  <Users size={18} />
                </button>
              )}
            </div>
          </header>

          {isMainViewVoice ? (
            <div className="flex-1 flex flex-col bg-[#050505] relative overflow-hidden">
              {/* Delikatna, wibrująca poświata w tle */}
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(0,238,255,0.03)_0%,transparent_70%)] pointer-events-none"></div>
              
              <div className="flex-1 p-6 sm:p-10 flex flex-col overflow-auto custom-scrollbar relative z-10">
                {activeVoiceChannel === currentChannelData.id ? (
                  <div className="w-full max-w-7xl mx-auto flex flex-col pb-24">
                    {voicePhase === 'error' && voiceError && (
                      <div className="mb-6 rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                        {voiceError}
                      </div>
                    )}

                    {/* Holograficzny Ekran Główny (Udostępnianie) */}
                    {screenStream && (
                      <div className="w-full aspect-video rounded-3xl border border-[#00eeff]/20 bg-black/80 p-2 shadow-[0_0_80px_rgba(0,238,255,0.1)] relative mb-12 group transition-all duration-700">
                        {/* Narożniki technologiczne */}
                        <div className="absolute top-0 left-0 w-12 h-12 border-t-2 border-l-2 border-[#00eeff]/80 rounded-tl-3xl z-10 transition-all duration-500 group-hover:w-16 group-hover:h-16 shadow-[-5px_-5px_15px_rgba(0,238,255,0.2)]"></div>
                        <div className="absolute top-0 right-0 w-12 h-12 border-t-2 border-r-2 border-[#00eeff]/80 rounded-tr-3xl z-10 transition-all duration-500 group-hover:w-16 group-hover:h-16 shadow-[5px_-5px_15px_rgba(0,238,255,0.2)]"></div>
                        <div className="absolute bottom-0 left-0 w-12 h-12 border-b-2 border-l-2 border-[#00eeff]/80 rounded-bl-3xl z-10 transition-all duration-500 group-hover:w-16 group-hover:h-16 shadow-[-5px_5px_15px_rgba(0,238,255,0.2)]"></div>
                        <div className="absolute bottom-0 right-0 w-12 h-12 border-b-2 border-r-2 border-[#00eeff]/80 rounded-br-3xl z-10 transition-all duration-500 group-hover:w-16 group-hover:h-16 shadow-[5px_5px_15px_rgba(0,238,255,0.2)]"></div>

                        <div className="w-full h-full rounded-2xl overflow-hidden relative">
                          <VideoPlayer stream={screenStream} isLocal={true} className="w-full h-full object-contain bg-[#030303]" />
                          <div className="absolute top-4 left-4 px-3 py-1.5 bg-black/60 backdrop-blur-md rounded-lg text-[10px] uppercase tracking-widest font-black text-white border border-[#00eeff]/30 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-[#00eeff] animate-pulse shadow-[0_0_8px_#00eeff]"></span>
                            Strumień Ekranu
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Oddzielacz "Węzły Komunikacyjne" */}
                    <div className="flex items-center gap-3 mb-8 px-2">
                      <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/[0.1] to-transparent"></div>
                      <span className="text-[10px] uppercase tracking-[0.3em] font-bold text-zinc-500">
                        Węzły Komunikacyjne ({voiceParticipants.length})
                      </span>
                      <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/[0.1] to-transparent"></div>
                    </div>

                    {/* Karty użytkowników (Holograficzne Pille) */}
                    <div className="flex flex-wrap justify-center gap-6">
                      {voiceParticipants.map((uid) => {
                        const u = getUser(uid);
                        const isSelf = uid === guestIdRef.current;
                        // Dla potrzeb wizualizacji zakładamy, że jeśli jesteś odciszony to "mówisz"
                        const isSpeaking = isSelf && !localMuted; 
                        
                        return (
                          <div 
                            key={uid} 
                            className={`group flex items-center gap-4 p-2.5 pr-6 rounded-full bg-gradient-to-r from-black/90 to-[#0a0a0c] border backdrop-blur-xl transition-all duration-500 shadow-xl
                              ${isSpeaking ? 'border-[#00eeff]/50 shadow-[0_0_30px_rgba(0,238,255,0.15)] scale-105' : 'border-white/[0.05] hover:border-white/[0.15]'} 
                              ${screenStream ? 'w-64' : 'w-72 sm:w-80'}`}
                          >
                            <div className="relative shrink-0">
                              {/* Pulsacja podczas mówienia */}
                              <div className={`absolute inset-0 rounded-full blur-md transition-all duration-500 ${isSpeaking ? 'bg-[#00eeff] opacity-50 animate-pulse' : 'opacity-0'}`}></div>
                              
                              <div className={`w-14 h-14 relative z-10 rounded-full flex items-center justify-center text-xl font-black transition-colors duration-500 ${
                                isSpeaking ? 'bg-[#000] border-2 border-[#00eeff] text-[#00eeff]' : 'bg-[#151515] border border-white/[0.1] text-zinc-400'
                              }`}>
                                {u.name.charAt(0)}
                              </div>
                              
                              {/* Status dot */}
                              <div className={`absolute bottom-0 right-0 w-4 h-4 rounded-full border-2 border-[#050505] flex items-center justify-center z-20 ${
                                isSelf && localMuted ? 'bg-red-500' : 'bg-emerald-500'
                              }`}>
                                {isSelf && localMuted && <MicOff size={8} className="text-black" />}
                              </div>
                            </div>
                            
                            <div className="flex flex-col flex-1 min-w-0 justify-center">
                              <span className={`text-[15px] font-bold truncate transition-colors duration-300 ${isSpeaking ? 'text-[#00eeff] drop-shadow-[0_0_8px_rgba(0,238,255,0.4)]' : 'text-zinc-200'}`}>
                                {u.name}
                              </span>
                              <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-semibold flex items-center gap-1 mt-0.5">
                                {isSelf && localMuted ? 'Wyciszony' : 'Połączony'}
                              </span>
                            </div>

                            {/* Wizualizer audio */}
                            {isSpeaking && (
                              <div className="flex items-center gap-1 h-4 opacity-80 shrink-0">
                                <div className="w-1 bg-[#00eeff] rounded-full animate-pulse h-2" style={{ animationDuration: '0.5s' }}></div>
                                <div className="w-1 bg-[#00eeff] rounded-full animate-pulse h-4" style={{ animationDuration: '0.8s' }}></div>
                                <div className="w-1 bg-[#00eeff] rounded-full animate-pulse h-3" style={{ animationDuration: '0.6s' }}></div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center text-center p-8 max-w-md bg-black/40 backdrop-blur-md rounded-3xl border border-white/[0.05] m-auto shadow-2xl">
                    <div className="w-20 h-20 rounded-full bg-[#00eeff]/5 border border-[#00eeff]/20 flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(0,238,255,0.1)]">
                      <currentChannelData.icon size={40} style={{ color: currentChannelData.color }} className="opacity-80" />
                    </div>
                    <h2 className="text-2xl font-bold text-white mb-2">Prywatny węzeł głosowy</h2>
                    <p className="text-zinc-500 mb-8">Rozpocznij transmisję głosową lub wideo. Ruch danych w tym węźle jest w pełni szyfrowany.</p>
                    <button 
                      onClick={() => handleChannelClick(currentChannelData)}
                      className="px-8 py-3.5 rounded-full bg-[#00eeff] text-black font-bold text-sm shadow-[0_0_20px_rgba(0,238,255,0.4)] hover:shadow-[0_0_30px_rgba(0,238,255,0.6)] hover:scale-105 transition-all duration-300"
                    >
                      Nawiąż połączenie z węzłem
                    </button>
                  </div>
                )}
              </div>

              {/* ZAAWANSOWANY PŁYWAJĄCY PASEK STEROWANIA */}
              {activeVoiceChannel === currentChannelData.id && (
                <div className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-[#0a0a0c]/80 backdrop-blur-2xl border border-white/[0.1] rounded-full flex items-center p-2 shadow-[0_20px_60px_rgba(0,0,0,0.8)] z-30 gap-2">
                  <button
                    onClick={() => setLocalMuted(!localMuted)}
                    className={`w-14 h-14 rounded-full flex items-center justify-center transition-all duration-300 border ${localMuted ? 'bg-red-500/20 text-red-400 border-red-500/40 shadow-[0_0_15px_rgba(239,68,68,0.2)]' : 'bg-white/[0.05] text-zinc-200 border-white/[0.05] hover:bg-white/[0.1]'}`}
                    title={localMuted ? 'Włącz mikrofon' : 'Wycisz mikrofon'}
                  >
                    {localMuted ? <MicOff size={22} /> : <Mic size={22} />}
                  </button>
                  
                  <div className="w-px h-8 bg-white/[0.1] mx-1"></div>

                  <button
                    onClick={toggleScreenShare}
                    className={`px-6 h-14 rounded-full flex items-center gap-3 font-bold uppercase tracking-wider text-[11px] transition-all duration-300 border ${screenStream ? 'bg-[#00eeff] text-black border-[#00eeff] shadow-[0_0_20px_rgba(0,238,255,0.4)]' : 'bg-white/[0.05] text-zinc-200 border-white/[0.05] hover:bg-white/[0.1]'}`}
                  >
                    <MonitorUp size={20} />
                    {screenStream ? 'Zakończ transmisję' : 'Udostępnij ekran'}
                  </button>

                  <div className="w-px h-8 bg-white/[0.1] mx-1"></div>

                  <button
                    onClick={disconnectVoice}
                    className="w-14 h-14 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center transition-all duration-300 shadow-[0_0_20px_rgba(239,68,68,0.4)] hover:shadow-[0_0_30px_rgba(239,68,68,0.6)]"
                    title="Rozłącz"
                  >
                    <PhoneOff size={22} />
                  </button>
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="flex-1 overflow-y-auto px-6 pt-6 pb-44 custom-scrollbar flex flex-col relative transition-all duration-500">
                <div className={`${isZenMode ? 'max-w-3xl' : 'max-w-4xl'} mx-auto w-full flex flex-col gap-6 mt-auto transition-all duration-500`}>
                  
                  <div className="pb-6 border-b border-white/[0.05] mb-4 flex flex-col items-start mt-8">
                    <div className="w-16 h-16 rounded-3xl border flex items-center justify-center mb-6 shadow-lg" style={{ backgroundColor: `${currentChannelData.color}10`, borderColor: `${currentChannelData.color}30`, boxShadow: `0 0 30px ${currentChannelData.color}20` }}>
                      <currentChannelData.icon size={32} style={{ color: currentChannelData.color }} />
                    </div>
                    <h1 className="text-3xl font-bold tracking-tighter mb-2" style={{ color: currentChannelData.color, textShadow: `0 0 20px ${currentChannelData.color}40` }}>
                      Witaj na {currentChannelData.name}!
                    </h1>
                    <p className="text-zinc-500 text-sm">Prywatna instancja Flux_. Tutaj pomysły płyną szybciej.</p>
                  </div>

                  {messages.map((msg, idx, arr) => {
                    const showHeader = idx === 0 || arr[idx - 1].userId !== msg.userId;
                    const user = getUser(msg.userId);
                    const role = getRole(user.roleId);
                    
                    return (
                      <div key={msg.id} className={`group flex gap-4 hover:bg-white/[0.02] -mx-4 px-4 py-3 rounded-xl transition-colors relative ${activeThread?.id === msg.id ? 'bg-white/[0.04] border border-white/[0.05]' : 'border border-transparent'}`}>
                        <div className="w-10 shrink-0 flex justify-center mt-1">
                          {showHeader ? (
                            <div className="w-10 h-10 rounded-xl bg-black border border-white/[0.08] flex items-center justify-center font-bold text-sm text-zinc-300 shadow-inner overflow-hidden cursor-pointer hover:opacity-80 transition-opacity">
                              {user.name.charAt(0)}
                            </div>
                          ) : (
                            <div className="w-10 text-[9px] text-zinc-600 opacity-0 group-hover:opacity-100 text-center leading-[24px]">{msg.time}</div>
                          )}
                        </div>

                        <div className="flex-1 flex flex-col min-w-0">
                          {showHeader && (
                            <div className="flex items-baseline gap-2 mb-1.5">
                              <span className="font-semibold text-[14px] cursor-pointer hover:underline tracking-wide" style={{ color: role.color, textShadow: role.glow !== 'none' ? `0 0 15px ${role.color}60` : 'none' }}>
                                {user.name}
                              </span>
                              {role.id !== 'r4' && (
                                <div className="flex items-center gap-1.5 px-1.5 py-[2px] rounded text-[9px] font-bold uppercase tracking-wider border shadow-sm backdrop-blur-sm" style={{ backgroundColor: role.bg, borderColor: role.border, color: role.color, boxShadow: role.glow !== 'none' ? `0 0 8px ${role.bg}` : 'none' }}>
                                  <role.icon size={10} strokeWidth={2.5} />
                                  <span>{role.name}</span>
                                </div>
                              )}
                              <span className="text-[10px] text-zinc-600 font-medium ml-1">{msg.time}</span>
                            </div>
                          )}
                          
                          <div className="text-[15px] text-zinc-300 leading-relaxed">
                            {renderMessageContent(msg.content)}
                          </div>

                          {msg.reactions && msg.reactions.length > 0 && (
                            <div className="flex items-center gap-1.5 mt-3">
                              {msg.reactions.map((r, i) => (
                                <button key={i} className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium border transition-colors ${r.userReacted ? 'bg-[#00eeff]/10 border-[#00eeff]/30 text-[#00eeff] shadow-[0_0_10px_rgba(0,238,255,0.1)]' : 'bg-white/[0.02] border-white/[0.05] text-zinc-400 hover:bg-white/[0.05]'}`}>
                                  <span>{r.emoji}</span>
                                  <span>{r.count}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="absolute right-4 top-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 bg-black/80 backdrop-blur-md border border-white/[0.1] rounded-lg p-1 shadow-xl">
                          <button className="p-1.5 text-zinc-400 hover:text-white hover:bg-white/[0.1] rounded-md transition-all" title="Dodaj Reakcję"><Smile size={14} /></button>
                          <button className="p-1.5 text-zinc-400 hover:text-[#00eeff] hover:bg-[#00eeff] hover:bg-opacity-20 rounded-md transition-all" title="Utwórz zadanie"><ListTodo size={14} /></button>
                          <div className="w-[1px] h-3 bg-white/[0.1] mx-1"></div>
                          <button onClick={() => openThread(msg)} className="p-1.5 text-zinc-400 hover:text-white hover:bg-white/[0.1] rounded-md transition-all" title="Otwórz wątek (Odpowiedz)"><MessageSquareShare size={14} /></button>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} className="h-4" />
                </div>
              </div>

              <div className="absolute bottom-6 left-0 right-0 px-6 flex justify-center pointer-events-none z-20">
                <div className={`w-full ${isZenMode ? 'max-w-3xl' : 'max-w-4xl'} pointer-events-auto transition-all duration-500`}>
                  <div className={`bg-[#111111]/95 backdrop-blur-3xl border ${isInputFocused || isAIPromptOpen ? 'border-white/[0.2] bg-[#151515]' : 'border-white/[0.1]'} rounded-3xl p-1.5 shadow-[0_20px_60px_-15px_rgba(0,0,0,1)] flex flex-col transition-all overflow-hidden`}>
                    
                    {isAIPromptOpen && (
                      <div className="px-4 py-3 bg-[#00eeff]/5 border-b border-[#00eeff]/20 flex items-center gap-3 animate-in slide-in-from-top-2 fade-in duration-200">
                        <Sparkles size={18} className="text-[#00eeff] animate-pulse" />
                        <input
                          type="text"
                          autoFocus
                          value={inputValue}
                          onChange={(e) => setInputValue(e.target.value)}
                          onKeyDown={handleKeyDown}
                          placeholder="Poproś Flux AI o pomoc lub kod..."
                          className="flex-1 bg-transparent text-sm font-medium text-white outline-none placeholder-[#00eeff]/50"
                        />
                        <button onClick={() => setIsAIPromptOpen(false)} className="text-[#00eeff]/50 hover:text-[#00eeff] transition-colors"><X size={16}/></button>
                      </div>
                    )}

                    {!isAIPromptOpen && (
                      <div className={`flex items-center gap-1 px-3 overflow-hidden transition-all duration-300 ${isInputFocused || inputValue.length > 0 ? 'h-8 opacity-100 pt-1 border-b border-white/[0.05] mb-1' : 'h-0 opacity-0'}`}>
                        <button className="p-1 text-zinc-500 hover:text-white rounded transition-colors"><Bold size={14} /></button>
                        <button className="p-1 text-zinc-500 hover:text-white rounded transition-colors"><Italic size={14} /></button>
                        <div className="w-[1px] h-3 bg-white/[0.1] mx-1"></div>
                        <button className="p-1 text-zinc-500 hover:text-[#00eeff] rounded transition-colors" title="Dodaj blok kodu"><CodeIcon size={14} /></button>
                        <button className="p-1 text-zinc-500 hover:text-white rounded transition-colors"><Link size={14} /></button>
                        <div className="ml-auto flex items-center">
                          <button 
                            onClick={() => setIsAIPromptOpen(true)}
                            className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[#00eeff]/10 text-[#00eeff] hover:bg-[#00eeff]/20 text-[10px] font-bold uppercase tracking-widest transition-colors"
                          >
                            <Sparkles size={10} /> FLUX AI
                          </button>
                        </div>
                      </div>
                    )}

                    <div className={`flex items-end w-full ${isAIPromptOpen ? 'hidden' : ''}`}>
                      <button className="h-10 w-10 shrink-0 m-1 rounded-2xl bg-white/[0.05] hover:bg-white/[0.1] flex items-center justify-center text-zinc-400 transition-colors">
                        <Plus size={18} />
                      </button>
                      
                      <textarea 
                        ref={textareaRef}
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={handleKeyDown}
                        onFocus={() => setIsInputFocused(true)}
                        onBlur={() => setIsInputFocused(false)}
                        placeholder={isZenMode ? "Zanurz się w strumieniu..." : `Napisz wiadomość na Flux_...`}
                        className="flex-1 bg-transparent text-zinc-100 placeholder-zinc-600 px-3 py-3.5 outline-none resize-none text-[15px] tracking-tight leading-relaxed custom-scrollbar"
                        rows={1}
                      />
                      
                      <button 
                        onClick={handleSendMessage}
                        className={`h-10 w-10 shrink-0 m-1 rounded-2xl flex items-center justify-center transition-all duration-300 
                          ${inputValue.trim() ? 'bg-white text-black shadow-[0_0_20px_rgba(255,255,255,0.2)] scale-100' : 'bg-transparent text-zinc-600 scale-90'}`}
                        disabled={!inputValue.trim()}
                      >
                        <ArrowUpRight size={18} className={inputValue.trim() ? "translate-x-[1px] -translate-y-[1px]" : ""} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {activeVoiceChannel && activeVoiceChannel !== activeChannel && (
            <div className="absolute bottom-32 right-8 w-80 max-w-[calc(100vw-2rem)] bg-[#111111]/95 backdrop-blur-3xl border border-white/[0.1] rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.8)] z-40 overflow-hidden animate-in slide-in-from-bottom-6 fade-in duration-300">
              {(() => {
                const voiceChan = mockChannels.find((c) => c.id === activeVoiceChannel);
                if (!voiceChan) return null;
                const dotClass = voicePhase === 'connected' ? 'bg-emerald-500 shadow-[0_0_8px_#10b981]' : voicePhase === 'error' ? 'bg-red-500' : 'bg-amber-400 animate-pulse';
                
                return (
                  <>
                    <div className="px-4 py-3 border-b border-white/[0.05] flex items-center justify-between bg-white/[0.02] gap-2 cursor-pointer hover:bg-white/[0.05] transition-colors" onClick={() => setActiveChannel(voiceChan.id)}>
                      <div className="flex items-center gap-2 min-w-0">
                        <div className={`w-2 h-2 rounded-full shrink-0 ${dotClass}`} />
                        <span className="text-xs font-semibold tracking-wide truncate" style={{ color: voiceChan.color }}>{voiceChan.name}</span>
                      </div>
                      <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest shrink-0">Wróć</span>
                    </div>
                    <div className="px-4 py-3 bg-black/40 flex items-center justify-center gap-3">
                      <button
                        onClick={() => setLocalMuted((m) => !m)}
                        className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors border ${localMuted ? 'bg-red-500/15 text-red-400 border-red-500/35' : 'bg-white/[0.05] text-zinc-200 border-white/[0.08] hover:bg-white/[0.1]'}`}
                      >
                        {localMuted ? <MicOff size={16} /> : <Mic size={16} />}
                      </button>
                      <button
                        onClick={disconnectVoice}
                        className="w-10 h-10 rounded-full bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/30 flex items-center justify-center transition-colors shadow-[0_0_15px_rgba(239,68,68,0.2)]"
                      >
                        <PhoneOff size={16} />
                      </button>
                    </div>
                  </>
                );
              })()}
            </div>
          )}
        </main>

        {!isZenMode && (rightPanelTab || activeThread) && (
          <aside className="w-[320px] bg-[#080808]/80 backdrop-blur-xl border-l border-white/[0.04] flex flex-col shrink-0 z-20 transition-all duration-300 shadow-2xl">
            
            {activeThread ? (
              <>
                <div className="h-16 border-b border-white/[0.04] flex items-center justify-between px-5 bg-black/20">
                  <div className="flex items-center gap-2">
                    <MessageSquareShare size={16} className="text-[#00eeff]" />
                    <span className="text-sm font-semibold tracking-wide text-white">Wątek Flux</span>
                  </div>
                  <button onClick={() => setActiveThread(null)} className="p-1.5 text-zinc-500 hover:text-white hover:bg-white/[0.1] rounded-lg transition-colors"><X size={16} /></button>
                </div>
                
                <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col relative">
                  <div className="p-5 border-b border-white/[0.02] bg-white/[0.01]">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-6 h-6 rounded-md bg-black border border-white/[0.1] flex items-center justify-center text-[10px] font-bold text-zinc-300">{getUser(activeThread.userId).name.charAt(0)}</div>
                      <span className="text-xs font-semibold text-white">{getUser(activeThread.userId).name}</span>
                      <span className="text-[10px] text-zinc-600">{activeThread.time}</span>
                    </div>
                    <div className="text-[13px] text-zinc-300 leading-relaxed">{renderMessageContent(activeThread.content)}</div>
                  </div>
                </div>

                <div className="p-4 bg-black/40 border-t border-white/[0.04]">
                  <div className="bg-[#111] border border-white/[0.1] rounded-2xl p-1 flex items-end transition-all focus-within:border-[#00eeff]/50">
                    <textarea 
                      value={threadInputValue}
                      onChange={(e) => setThreadInputValue(e.target.value)}
                      placeholder="Odpowiedz w wątku..." 
                      className="flex-1 bg-transparent text-zinc-200 placeholder-zinc-600 px-3 py-2.5 outline-none resize-none text-[13px] tracking-tight custom-scrollbar"
                      rows={1}
                    />
                    <button className={`h-8 w-8 shrink-0 m-1 rounded-xl flex items-center justify-center transition-all ${threadInputValue.trim() ? 'bg-[#00eeff] text-black shadow-[0_0_10px_rgba(0,238,255,0.3)]' : 'bg-transparent text-zinc-600'}`}>
                      <Send size={14} className={threadInputValue.trim() ? "translate-x-[1px] -translate-y-[1px]" : ""} />
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="h-16 border-b border-white/[0.04] flex items-end px-4 gap-4 bg-black/20">
                  <button onClick={() => setRightPanelTab('members')} className={`pb-3 text-sm font-medium transition-colors relative ${rightPanelTab === 'members' ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'}`}>Członkowie{rightPanelTab === 'members' && <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-white rounded-t-full shadow-[0_0_10px_rgba(255,255,255,0.5)]"></div>}</button>
                  <button onClick={() => setRightPanelTab('files')} className={`pb-3 text-sm font-medium transition-colors relative ${rightPanelTab === 'files' ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'}`}>Pliki{rightPanelTab === 'files' && <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-white rounded-t-full shadow-[0_0_10px_rgba(255,255,255,0.5)]"></div>}</button>
                  <button onClick={() => setRightPanelTab('tasks')} className={`pb-3 text-sm font-medium transition-colors relative ${rightPanelTab === 'tasks' ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'}`}>Zadania{rightPanelTab === 'tasks' && <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-white rounded-t-full shadow-[0_0_10px_rgba(255,255,255,0.5)]"></div>}</button>
                </div>
                
                <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-6">
                  {rightPanelTab === 'members' && mockRoles.map(role => {
                    const usersInRole = mockUsers.filter(u => u.roleId === role.id && u.status !== 'offline');
                    if (usersInRole.length === 0) return null;
                    return (
                      <div key={role.id}>
                        <div className="mb-2 mt-6 first:mt-0 flex items-center justify-between px-2.5 py-1.5 rounded-lg border relative overflow-hidden backdrop-blur-md" style={{ backgroundColor: role.bg, borderColor: role.border }}>
                          <div className="absolute left-0 top-0 bottom-0 w-[2px]" style={{ backgroundColor: role.color, boxShadow: role.glow }} />
                          <div className="flex items-center gap-2">
                            <role.icon size={12} style={{ color: role.color }} strokeWidth={2.5} />
                            <span className="text-[9px] uppercase tracking-[0.2em] font-bold" style={{ color: role.color, textShadow: role.glow !== 'none' ? `0 0 10px ${role.color}80` : 'none' }}>{role.name}</span>
                          </div>
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-black/60 border flex items-center justify-center min-w-[20px]" style={{ color: role.color, borderColor: role.border }}>{usersInRole.length}</span>
                        </div>
                        <div className="flex flex-col gap-0.5 mt-1.5">
                          {usersInRole.map(user => (
                            <div key={user.id} className="user-row flex items-center gap-3 px-2 py-1.5 rounded-lg cursor-pointer transition-all duration-300 border border-transparent" style={{ '--hover-bg': role.bg, '--hover-border': role.border }}>
                              <div className="relative">
                                <div className="w-8 h-8 rounded-xl bg-black border border-white/[0.08] flex items-center justify-center text-xs font-bold transition-all duration-300" style={{ color: role.color }}>{user.name.charAt(0)}</div>
                                <div className={`absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-[#0a0a0c] ${user.status === 'online' ? 'bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]' : 'bg-zinc-500'}`}></div>
                              </div>
                              <div className="flex flex-col">
                                <span className="text-[13px] font-semibold truncate transition-all tracking-wide" style={{ color: role.color, textShadow: role.glow !== 'none' ? `0 0 12px ${role.color}40` : 'none' }}>{user.name}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}

                  {rightPanelTab === 'files' && (
                    <div className="space-y-2">
                      <div className="p-3 rounded-xl border border-white/[0.05] bg-white/[0.02] flex items-center gap-3 hover:bg-white/[0.05] cursor-pointer transition-colors">
                        <div className="p-2 rounded-lg bg-[#b266ff]/20 text-[#b266ff]"><ImageIcon size={16} /></div>
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-white">design_v3.fig</span>
                          <span className="text-[10px] text-zinc-500">Wysłane przez Anna_UX</span>
                        </div>
                      </div>
                      <div className="p-3 rounded-xl border border-white/[0.05] bg-white/[0.02] flex items-center gap-3 hover:bg-white/[0.05] cursor-pointer transition-colors">
                        <div className="p-2 rounded-lg bg-[#00ffcc]/20 text-[#00ffcc]"><FileText size={16} /></div>
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-white">api_docs.md</span>
                          <span className="text-[10px] text-zinc-500">Wysłane przez Kamil_Dev</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {rightPanelTab === 'tasks' && (
                    <div className="space-y-2">
                      <div className="p-3 rounded-xl border border-white/[0.05] bg-white/[0.02] hover:border-[#00eeff]/50 transition-colors group cursor-pointer">
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5 w-4 h-4 rounded-full border-2 border-zinc-600 group-hover:border-[#00eeff] transition-colors"></div>
                          <div className="flex flex-col">
                            <span className="text-sm font-medium text-white leading-tight mb-1">Przepiąć bazę danych na produkcję</span>
                            <div className="flex items-center gap-2 text-[10px] text-zinc-500">
                              <span className="px-1.5 py-0.5 rounded bg-[#00eeff]/10 text-[#00eeff]">Z wiadomości</span>
                              <span>od Kamil_Dev</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </aside>
        )}
      </div>

      {isCmdPaletteOpen && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] px-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity" onClick={() => setIsCmdPaletteOpen(false)} />
          <div className="relative w-full max-w-2xl bg-[#0c0c0e]/95 backdrop-blur-3xl border border-white/[0.1] rounded-2xl shadow-[0_0_80px_rgba(0,0,0,0.8)] overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center px-4 py-4 border-b border-white/[0.05]">
              <Search size={20} className="text-zinc-500 mr-3" />
              <input autoFocus type="text" placeholder="Szukaj zagadnień, kanałów Flux_..." value={cmdSearchQuery} onChange={(e) => setCmdSearchQuery(e.target.value)} className="flex-1 bg-transparent text-xl font-medium text-white outline-none placeholder-zinc-600" />
            </div>
            <div className="flex-1 overflow-y-auto max-h-[50vh] p-2">
              <div className="mb-4">
                <div className="px-3 py-1.5 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Szybka Nawigacja</div>
                <button onClick={() => { setActiveChannel('c1'); setIsCmdPaletteOpen(false); }} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/[0.05] group transition-colors">
                  <div className="w-8 h-8 rounded-lg bg-[#00eeff]/10 border border-[#00eeff]/30 flex items-center justify-center text-[#00eeff]"><Hash size={14} /></div>
                  <span className="text-sm font-medium text-zinc-300 group-hover:text-white transition-colors">Skocz do: Ogólny Dyskusyjny</span>
                </button>
              </div>
              <div>
                <div className="px-3 py-1.5 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Akcje</div>
                <button onClick={() => { setIsSettingsOpen(true); setIsCmdPaletteOpen(false); }} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/[0.05] group transition-colors">
                  <div className="w-8 h-8 rounded-lg bg-white/[0.05] border border-white/[0.1] flex items-center justify-center text-zinc-400"><Settings size={14} /></div>
                  <span className="text-sm font-medium text-zinc-300 group-hover:text-white transition-colors">Otwórz ustawienia Flux_</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {isSettingsOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md transition-opacity" onClick={() => setIsSettingsOpen(false)} />
          <div className="relative w-full max-w-5xl h-[80vh] bg-[#080808]/95 backdrop-blur-3xl border border-white/[0.1] rounded-3xl shadow-[0_0_100px_rgba(0,0,0,1)] flex overflow-hidden animate-in zoom-in-95 fade-in duration-300">
            <div className="absolute top-6 right-6 z-50">
                <button onClick={() => setIsSettingsOpen(false)} className="p-2 rounded-full bg-white/[0.05] hover:bg-white/[0.1] text-zinc-400 hover:text-white transition-colors border border-white/[0.05]"><X size={18} /></button>
            </div>
            <div className="w-64 bg-black/40 border-r border-white/[0.05] flex flex-col py-6">
              <div className="px-6 mb-6"><span className="text-xs font-bold uppercase tracking-widest text-zinc-500">Ustawienia</span></div>
              <div className="flex flex-col px-3 gap-1">
                <button onClick={() => setSettingsTab('profile')} className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${settingsTab === 'profile' ? 'bg-white/[0.08] text-white' : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'}`}><User size={16} /> Twój Profil</button>
                <button onClick={() => setSettingsTab('audio')} className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${settingsTab === 'audio' ? 'bg-white/[0.08] text-white' : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'}`}><Mic size={16} /> Dźwięk i mikrofon</button>
              </div>
            </div>
            <div className="flex-1 p-10 max-w-2xl overflow-y-auto custom-scrollbar">
                {settingsTab === 'profile' && (
                  <div>
                    <h2 className="text-3xl font-bold text-white mb-8">Twój Profil</h2>
                    <div className="flex items-center gap-6 mb-10">
                      <div className="w-24 h-24 rounded-3xl bg-black border border-white/[0.1] flex items-center justify-center text-4xl font-bold text-white shadow-2xl relative">F<div className="absolute -bottom-2 -right-2 w-6 h-6 bg-green-500 rounded-full border-4 border-[#0a0a0c]"></div></div>
                      <div className="flex flex-col">
                        <span className="text-xl font-bold text-white mb-1">Admin</span>
                        <div className="flex items-center gap-2 text-sm text-[#00eeff] font-semibold bg-[#00eeff]/10 px-3 py-1 rounded-lg border border-[#00eeff]/30"><Crown size={14} /> Zarząd Flux_</div>
                      </div>
                    </div>
                  </div>
                )}
                {settingsTab === 'audio' && (
                  <div>
                    <h2 className="text-3xl font-bold text-white mb-2">Dźwięk i mikrofon</h2>
                    <p className="text-sm text-zinc-500 mb-8">
                      Wybierz wejście używane na kanałach głosowych Flux_.
                    </p>
                    <div className="flex flex-wrap gap-2 mb-4">
                      <button
                        type="button"
                        onClick={() => void refreshAudioDevices()}
                        className="px-4 py-2 rounded-xl bg-white/[0.08] text-sm text-white hover:bg-white/[0.12] border border-white/[0.08]"
                      >
                        Odśwież listę urządzeń
                      </button>
                    </div>
                    <label className="block text-xs font-bold uppercase tracking-widest text-zinc-500 mb-2">Mikrofon</label>
                    <select
                      value={micDeviceId || 'default'}
                      onChange={(e) => {
                        const v = e.target.value === 'default' ? '' : e.target.value;
                        setMicDeviceId(v);
                        if (v) localStorage.setItem('flux_mic_device', v);
                        else localStorage.removeItem('flux_mic_device');
                      }}
                      className="w-full max-w-md bg-[#111] border border-white/[0.1] rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-[#00eeff]/50"
                    >
                      <option value="default">Domyślny systemowy</option>
                      {audioInputs.map((d) => (
                        <option key={d.deviceId} value={d.deviceId}>
                          {d.label || `Mikrofon ${d.deviceId.slice(0, 8)}…`}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}