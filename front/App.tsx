import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useVoiceRoom } from './useVoiceRoom';
import { 
  Send, Search, Plus, ArrowUpRight, Hash, Volume2, VolumeX,
  Phone, Video, Users, UserPlus, Settings, Mic, 
  Headphones, MessageSquare, Compass, Shield,
  Crown, Terminal, Sparkles, Code, Coffee, Radio, Zap,
  ChevronsUpDown, Check, Maximize2, Minimize2, Bookmark,
  ListTodo, Bold, Italic, Code as CodeIcon, Link, FileText, Image as ImageIcon,
  Command as CmdIcon, User, Moon, LogOut, 
  X, MicOff, PhoneOff, Palette, BellRing, MessageSquareShare,
  UploadCloud, Copy, Smile, MonitorUp, Trash2, Edit2, MoreVertical, CheckSquare, Square, Download, FileAudio, FileArchive, Eye, UserCheck, UserMinus, BellOff, LogIn, Server, Link2, CopyPlus, ChevronDown, FolderPlus, Pin
} from 'lucide-react';

// ============================================================================
// --- 1. KONFIGURACJA API (GOTOWE DO PODPIĘCIA) ---
// ============================================================================

// Dodaj VITE_API_URL do pliku .env, np: VITE_API_URL=http://localhost:3000/api
// Jeśli zmienna jest pusta, aplikacja działa w trybie "Mock" (lokalnie).
const API_BASE_URL = ''; 

const apiClient = async (endpoint: string, method: string = 'GET', body?: any) => {
  if (!API_BASE_URL) {
    // TRYB MOCK: Zwraca null po małym opóźnieniu symulującym sieć
    return new Promise((resolve) => setTimeout(() => resolve(null), 100));
  }

  // TRYB PRODUKCYJNY: Prawdziwe zapytanie HTTP
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  const token = localStorage.getItem('flux_token');
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) throw new Error(`Błąd API: ${response.status}`);
  return response.json();
};

// ============================================================================
// --- TYPY DANYCH BAZY DANYCH ---
// ============================================================================
type UserInfo = { id: string; name: string; roleId: string; status: 'online' | 'idle' | 'dnd' | 'offline' };
type Category = { id: string; name: string; isExpanded: boolean; serverId: string };
type Channel = { id: string; name: string; type: 'text' | 'voice'; color: string; icon: React.ElementType; unread?: boolean; categoryId?: string; serverId: string };
type ChatRow = { id: string; userId: string; time: string; content: string; isMe?: boolean; isEdited?: boolean; reactions?: { emoji: string; count: number; userReacted: boolean }[] };
type TaskItem = { id: string; title: string; assigneeId: string; completed: boolean; sourceMsgId?: string };
type FileItem = { id: string; name: string; size: string; type: 'image' | 'doc' | 'audio' | 'archive'; uploaderId: string; date: string };
type ContextMenuType = 'channel'|'category'|'user'|'file'|'task'|'server'|'message'|'workspace'|'filesArea'|'tasksArea'|'chatArea'|'membersArea';

// --- MOCK DATA INICJALIZACYJNE ---
const initialServers = [
  { id: 's1', name: 'Flux_', icon: Zap, active: true, color: '#00eeff', glow: '0 0 15px rgba(0,238,255,0.4)' },
  { id: 's2', name: 'Projekt Alfa', icon: Code, hasNotification: true, color: '#00ffcc', glow: '0 0 15px rgba(0,255,204,0.4)' },
];
const initialCategories: Category[] = [
  { id: 'cat1', name: 'Przestrzenie', isExpanded: true, serverId: 's1' },
  { id: 'cat2', name: 'Głosowe', isExpanded: true, serverId: 's1' },
  { id: 'cat3', name: 'Zespołowe', isExpanded: true, serverId: 's2' },
];
const initialChannels: Channel[] = [
  { id: 'c1', name: 'Ogólny Dyskusyjny', type: 'text', unread: true, color: '#00eeff', icon: Hash, categoryId: 'cat1', serverId: 's1' },
  { id: 'c2', name: 'Ważne Komunikaty', type: 'text', color: '#ff0055', icon: Shield, categoryId: 'cat1', serverId: 's1' },
  { id: 'c3', name: 'Dev Talk & Kawa', type: 'text', color: '#b266ff', icon: Coffee, categoryId: 'cat1', serverId: 's1' },
  { id: 'v1', name: 'Lobby Główne', type: 'voice', color: '#a1a1aa', icon: Radio, categoryId: 'cat2', serverId: 's1' },
  { id: 'v2', name: 'Deep Work (Cisza)', type: 'voice', color: '#ff9900', icon: Headphones, categoryId: 'cat2', serverId: 's1' },
  { id: 'c4', name: 'Planowanie Sprintu', type: 'text', color: '#00ffcc', icon: Hash, categoryId: 'cat3', serverId: 's2' },
];
const mockRoles = [
  { id: 'r1', name: 'Zarząd Flux_', color: '#00eeff', bg: 'rgba(0, 238, 255, 0.08)', border: 'rgba(0, 238, 255, 0.25)', icon: Crown, glow: '0 0 12px rgba(0,238,255,0.4)' },
  { id: 'r2', name: 'Lead Developer', color: '#00ffcc', bg: 'rgba(0, 255, 204, 0.08)', border: 'rgba(0, 255, 204, 0.25)', icon: Terminal, glow: '0 0 12px rgba(0,255,204,0.4)' },
  { id: 'r3', name: 'Design', color: '#b266ff', bg: 'rgba(178, 102, 255, 0.08)', border: 'rgba(178, 102, 255, 0.25)', icon: Sparkles, glow: '0 0 12px rgba(178,102,255,0.4)' },
  { id: 'r4', name: 'Użytkownicy', color: '#a1a1aa', bg: 'rgba(161, 161, 170, 0.05)', border: 'rgba(161, 161, 170, 0.1)', icon: Users, glow: 'none' },
];
const mockUsers: UserInfo[] = [
  { id: 'u1', name: 'Admin', roleId: 'r1', status: 'online' },
  { id: 'u2', name: 'Kamil_Dev', roleId: 'r2', status: 'idle' },
  { id: 'u3', name: 'Anna_UX', roleId: 'r3', status: 'dnd' },
  { id: 'u4', name: 'Piotr', roleId: 'r4', status: 'offline' },
];
const initialTasks: TaskItem[] = [
  { id: 't1', title: 'Przepiąć bazę danych na produkcję', assigneeId: 'u2', completed: false, sourceMsgId: 'm1' },
  { id: 't2', title: 'Przygotować assety do v2', assigneeId: 'u3', completed: true },
];
const initialFiles: FileItem[] = [
  { id: 'f1', name: 'design_v3_final.fig', size: '12.4 MB', type: 'image', uploaderId: 'u3', date: 'Dzisiaj, 14:30' },
  { id: 'f2', name: 'api_documentation.md', size: '45 KB', type: 'doc', uploaderId: 'u2', date: 'Wczoraj, 09:15' },
  { id: 'f3', name: 'weekly_sync.mp3', size: '28.1 MB', type: 'audio', uploaderId: 'u1', date: 'Poniedziałek' },
];

function guestSessionId(): string {
  const k = 'flux_guest_id';
  let id = sessionStorage.getItem(k);
  // Unikalny ID gościa (stary błąd: wszyscy dostawali 'u1' → konflikt w pokoju WebRTC)
  if (!id || id === 'u1') {
    id = 'g_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    sessionStorage.setItem(k, id);
  }
  return id;
}

const createMockScreenStream = (): MediaStream => {
  const canvas = document.createElement('canvas');
  canvas.width = 1280; canvas.height = 720;
  const ctx = canvas.getContext('2d');
  let animationId: number;
  let x = 0; let dx = 4;

  const draw = () => {
    if (!ctx) return;
    ctx.fillStyle = '#0a0a0c'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#00eeff'; ctx.font = 'bold 48px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('SYMULACJA EKRANU FLUX_', canvas.width / 2, canvas.height / 2 - 30);
    ctx.fillStyle = '#ff0055'; ctx.font = '24px sans-serif';
    ctx.fillText('Prawdziwe API zablokowane przez uprawnienia iframe.', canvas.width / 2, canvas.height / 2 + 30);
    ctx.fillStyle = '#00ffcc'; ctx.fillRect(x, canvas.height - 40, 300, 10);
    x += dx; if (x > canvas.width - 300 || x < 0) dx = -dx;
    animationId = requestAnimationFrame(draw);
  };
  draw();
  const stream = canvas.captureStream(30);
  const track = stream.getVideoTracks()[0];
  const originalStop = track.stop.bind(track);
  track.stop = () => { cancelAnimationFrame(animationId); originalStop(); };
  return stream;
};

const VideoPlayer = ({ stream, isLocal, className }: { stream: MediaStream | null, isLocal?: boolean, className?: string }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => { if (videoRef.current && stream) videoRef.current.srcObject = stream; }, [stream]);
  if (!stream) return null;
  return <video ref={videoRef} autoPlay playsInline muted={isLocal} className={`object-cover ${className}`} />;
};

// ============================================================================
// --- GŁÓWNY KOMPONENT APLIKACJI ---
// ============================================================================
export default function App() {
  // Stany Danych
  const [servers, setServers] = useState(initialServers);
  const [categories, setCategories] = useState<Category[]>(initialCategories);
  const [channels, setChannels] = useState<Channel[]>(initialChannels);
  const [tasks, setTasks] = useState<TaskItem[]>(initialTasks);
  const [files, setFiles] = useState<FileItem[]>(initialFiles);
  const [messagesByChannel, setMessagesByChannel] = useState<Record<string, ChatRow[]>>({
    'c1': [
      { id: 'm1', userId: 'u2', time: '10:00', content: 'Siema, widzieliście nowe makiety od Ani?' },
      { id: 'm2', userId: 'u3', time: '10:05', content: 'Wrzuciłam je do zakładki pliki 🚀', reactions: [{ emoji: '🔥', count: 2, userReacted: true }] }
    ]
  });

  // Stany Nawigacji
  const [activeServer, setActiveServer] = useState('s1');
  const [isWorkspaceDropdownOpen, setIsWorkspaceDropdownOpen] = useState(false);
  const [activeChannel, setActiveChannel] = useState('c1');
  const [rightPanelTab, setRightPanelTab] = useState<'members' | 'files' | 'tasks' | null>('members');
  const [isZenMode, setIsZenMode] = useState(false);
  
  // Stany Inputu i Czatu
  const [inputValue, setInputValue] = useState('');
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [activeThread, setActiveThread] = useState<ChatRow | null>(null);
  const [threadInputValue, setThreadInputValue] = useState('');
  const [isAILoading, setIsAILoading] = useState(false);
  
  // Stany Modali i UI
  const [isAIPromptOpen, setIsAIPromptOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isCmdPaletteOpen, setIsCmdPaletteOpen] = useState(false);
  const [cmdSearchQuery, setCmdSearchQuery] = useState('');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'profile' | 'audio'>('profile');
  const [localUserName, setLocalUserName] = useState('Admin');
  
  // Modale (Kanały/Serwery/Kategorie/Zadania)
  const [createServerModal, setCreateServerModal] = useState<'create' | 'join' | null>(null);
  const [newServerName, setNewServerName] = useState('');
  const [joinServerCode, setJoinServerCode] = useState('');

  const [createCategoryModal, setCreateCategoryModal] = useState(false);
  const [editCategoryModal, setEditCategoryModal] = useState<Category | null>(null);
  const [categoryNameInput, setCategoryNameInput] = useState('');

  const [createChannelModal, setCreateChannelModal] = useState<{ categoryId?: string } | null>(null);
  const [newChannelType, setNewChannelType] = useState<'text' | 'voice'>('text');
  const [newChannelName, setNewChannelName] = useState('');

  const [createTaskModal, setCreateTaskModal] = useState<{ isOpen: boolean, sourceMsg?: ChatRow }>({ isOpen: false });
  const [newTaskTitle, setNewTaskTitle] = useState('');

  // Stan Menu Kontekstowego
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, type: ContextMenuType, data: any } | null>(null);

  // Stany Głosowe
  const [activeVoiceChannel, setActiveVoiceChannel] = useState<string | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [micDeviceId, setMicDeviceId] = useState(() => {
    try {
      return localStorage.getItem('flux_mic_device') ?? '';
    } catch {
      return '';
    }
  });
  const [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([]);

  // Referencje
  const guestIdRef = useRef(guestSessionId());
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Filtrowanie pod aktywny serwer
  const currentServerCategories = useMemo(() => categories.filter(c => c.serverId === activeServer), [categories, activeServer]);
  const currentServerChannels = useMemo(() => channels.filter(c => c.serverId === activeServer), [channels, activeServer]);

  useEffect(() => {
    if (currentServerChannels.length > 0 && !currentServerChannels.find(c => c.id === activeChannel)) {
      const firstTextChannel = currentServerChannels.find(c => c.type === 'text') || currentServerChannels[0];
      setActiveChannel(firstTextChannel.id);
    }
  }, [activeServer, currentServerChannels, activeChannel]);

  // Pobranie danych inicjalizacyjnych z API (Gdy podłączone)
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        if (!API_BASE_URL) return; // Jeśli brak URL, zostawiamy Mock Data
        const [apiServers, apiCategories, apiChannels] = await Promise.all([
          apiClient('/servers'),
          apiClient('/categories'),
          apiClient('/channels')
        ]);
        if (apiServers) setServers(apiServers);
        if (apiCategories) setCategories(apiCategories);
        if (apiChannels) setChannels(apiChannels);
      } catch (err) {
        console.error("Błąd ładowania inicjalnego API", err);
      }
    };
    fetchInitialData();
  }, []);

  const messages = messagesByChannel[activeChannel] ?? [];
  const myUserId = guestIdRef.current;
  
  const {
    phase: voicePhase,
    error: voiceError,
    participants: voiceParticipants,
    localMuted,
    setLocalMuted,
    speakingPeers,
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
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setIsCmdPaletteOpen(prev => !prev); }
      if (e.key === 'Escape') {
        setIsCmdPaletteOpen(false); setIsSettingsOpen(false); setIsAIPromptOpen(false); 
        setCreateChannelModal(null); setCreateTaskModal({ isOpen: false }); setContextMenu(null);
        setCreateServerModal(null); setCreateCategoryModal(false); setEditCategoryModal(null);
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  useEffect(() => {
    const closeMenu = () => setContextMenu(null);
    window.addEventListener('click', closeMenu);
    return () => window.removeEventListener('click', closeMenu);
  }, []);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, activeChannel, isAILoading]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 150)}px`;
    }
  }, [inputValue, isAIPromptOpen]);

  // ============================================================================
  // --- AKCJE API I BIZNESOWE ---
  // ============================================================================
  
  const handleContextMenu = (e: React.MouseEvent, type: ContextMenuType, data: any) => {
    e.preventDefault(); e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, type, data });
  };

  // --- SERWERY ---
  const handleCreateServer = async () => {
    if (!newServerName.trim()) return;
    try {
      const payload = { name: newServerName.trim(), icon: 'Zap', active: true, color: '#00eeff', glow: '0 0 15px rgba(0,238,255,0.4)' };
      const res = await apiClient('/servers', 'POST', payload);
      
      const newSrvId = res?.id || `s_${Date.now()}`;
      const defaultCatId = `cat_${Date.now()}`;
      const defaultChanId = `c_${Date.now()}`;

      setServers([...servers, { ...payload, id: newSrvId, icon: Zap }]);
      setCategories([...categories, { id: defaultCatId, name: 'Ogólne', isExpanded: true, serverId: newSrvId }]);
      setChannels([...channels, { id: defaultChanId, name: 'powitania', type: 'text', color: '#00eeff', icon: Hash, categoryId: defaultCatId, serverId: newSrvId }]);
      
      setCreateServerModal(null); setNewServerName(''); 
      setActiveServer(newSrvId); setActiveChannel(defaultChanId);
    } catch (e) { console.error(e); }
  };

  const handleJoinServer = async () => {
    if (!joinServerCode.trim()) return;
    try {
      const res = await apiClient('/servers/join', 'POST', { code: joinServerCode });
      const newSrvId = res?.id || `s_${Date.now()}`;
      const newSrv = { id: newSrvId, name: res?.name || `Serwer: ${joinServerCode.replace('https://flux.app/join/', '')}`, icon: Compass, active: true, color: '#b266ff', glow: '0 0 15px rgba(178,102,255,0.4)' };
      
      setServers([...servers, newSrv]);
      setCategories([...categories, { id: `cat_${Date.now()}`, name: 'Nowe Połączenie', isExpanded: true, serverId: newSrvId }]);
      setChannels([...channels, { id: `c_${Date.now()}`, name: 'witaj', type: 'text', color: '#b266ff', icon: Hash, serverId: newSrvId }]);
      
      setCreateServerModal(null); setJoinServerCode(''); setActiveServer(newSrvId);
    } catch (e) { console.error(e); }
  };

  const leaveServer = async (id: string) => {
    try {
      await apiClient(`/servers/${id}/leave`, 'POST');
      const updated = servers.filter(s => s.id !== id);
      setServers(updated);
      if (activeServer === id && updated.length > 0) setActiveServer(updated[0].id);
      setContextMenu(null);
    } catch(e) { console.error(e); }
  };

  // --- KATEGORIE ---
  const handleCreateCategory = async () => {
    if (!categoryNameInput.trim()) return;
    try {
      const payload = { name: categoryNameInput.trim(), serverId: activeServer };
      const res = await apiClient('/categories', 'POST', payload);
      
      const newCat: Category = { id: res?.id || `cat_${Date.now()}`, name: categoryNameInput.trim(), isExpanded: true, serverId: activeServer };
      setCategories([...categories, newCat]);
      setCreateCategoryModal(false); setCategoryNameInput('');
    } catch(e) { console.error(e); }
  };

  const handleEditCategory = async () => {
    if (!categoryNameInput.trim() || !editCategoryModal) return;
    try {
      await apiClient(`/categories/${editCategoryModal.id}`, 'PUT', { name: categoryNameInput.trim() });
      setCategories(categories.map(c => c.id === editCategoryModal.id ? { ...c, name: categoryNameInput.trim() } : c));
      setEditCategoryModal(null); setCategoryNameInput('');
    } catch(e) { console.error(e); }
  };

  const deleteCategory = async (catId: string) => {
    try {
      await apiClient(`/categories/${catId}`, 'DELETE');
      setCategories(categories.filter(c => c.id !== catId));
      setChannels(channels.map(c => c.categoryId === catId ? { ...c, categoryId: undefined } : c));
      setContextMenu(null);
    } catch(e) { console.error(e); }
  };
  const toggleCategory = (id: string) => setCategories(categories.map(c => c.id === id ? { ...c, isExpanded: !c.isExpanded } : c));

  // --- KANAŁY ---
  const handleCreateChannel = async () => {
    if (!newChannelName.trim()) return;
    try {
      const payload = { name: newChannelName.trim(), type: newChannelType, categoryId: createChannelModal?.categoryId, serverId: activeServer };
      const res = await apiClient('/channels', 'POST', payload);
      
      const newChan: Channel = {
        id: res?.id || `c_${Date.now()}`, name: newChannelName.trim(), type: newChannelType, color: newChannelType === 'text' ? '#00eeff' : '#b266ff', icon: newChannelType === 'text' ? Hash : Radio, categoryId: createChannelModal?.categoryId, serverId: activeServer
      };
      setChannels([...channels, newChan]);
      setCreateChannelModal(null); setNewChannelName(''); setActiveChannel(newChan.id);
    } catch(e) { console.error(e); }
  };

  const deleteChannel = async (id: string) => {
    try {
      await apiClient(`/channels/${id}`, 'DELETE');
      setChannels(channels.filter(c => c.id !== id));
      if (activeChannel === id) setActiveChannel(currentServerChannels.find(c => c.type === 'text')?.id || 'c1');
      setContextMenu(null);
    } catch(e) { console.error(e); }
  };

  const handleChannelClick = (channel: Channel) => {
    setActiveChannel(channel.id); setActiveThread(null);
    if (channel.type === 'voice') setActiveVoiceChannel(channel.id);
  };

  // --- WIADOMOŚCI ---
  const handleSendMessage = async () => {
    if (!inputValue.trim() && !isAIPromptOpen) return;
    const isAI = isAIPromptOpen; const content = inputValue.trim();
    const timeString = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const msgId = `m_${Date.now()}`;

    if (isAI) {
      setIsAILoading(true); setInputValue(''); setIsAIPromptOpen(false);
      setTimeout(() => {
        setIsAILoading(false);
        setMessagesByChannel((prev) => ({
          ...prev, [activeChannel]: [...(prev[activeChannel] ?? []), { 
            id: `ai_${Date.now()}`, userId: 'flux_ai', time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), 
            content: `**Flux AI:** Przeanalizowałem Twoje zapytanie: "${content}". Gotowe rozwiązanie:\n\n\`\`\`javascript\nconst fluxNode = new FluxNode();\nfluxNode.connect();\n\`\`\``, 
            isMe: false 
          }],
        }));
      }, 1500);
      return;
    }

    try {
      // Optymistyczny update (UI uaktualnia się bez czekania)
      setMessagesByChannel((prev) => ({ ...prev, [activeChannel]: [...(prev[activeChannel] ?? []), { id: msgId, userId: myUserId, time: timeString, content: content, isMe: true }] }));
      setInputValue('');
      
      // Zapis w tle
      await apiClient(`/channels/${activeChannel}/messages`, 'POST', { content });
    } catch(e) { console.error(e); }
  };

  const deleteMessage = async (msgId: string) => {
    try {
      await apiClient(`/messages/${msgId}`, 'DELETE');
      setMessagesByChannel(prev => ({ ...prev, [activeChannel]: prev[activeChannel].filter(m => m.id !== msgId) }));
      if (activeThread?.id === msgId) setActiveThread(null);
      setContextMenu(null);
    } catch(e) { console.error(e); }
  };

  // --- ZADANIA ---
  const handleCreateTask = async () => {
    if (!newTaskTitle.trim()) return;
    try {
      const payload = { title: newTaskTitle.trim(), assigneeId: myUserId, sourceMsgId: createTaskModal.sourceMsg?.id, serverId: activeServer };
      const res = await apiClient('/tasks', 'POST', payload);
      
      const newTask: TaskItem = { id: res?.id || `t_${Date.now()}`, title: newTaskTitle.trim(), assigneeId: myUserId, completed: false, sourceMsgId: createTaskModal.sourceMsg?.id };
      setTasks([newTask, ...tasks]); setCreateTaskModal({ isOpen: false }); setNewTaskTitle(''); setRightPanelTab('tasks');
    } catch(e) { console.error(e); }
  };

  const toggleTask = async (taskId: string) => {
    try {
      const task = tasks.find(t => t.id === taskId);
      await apiClient(`/tasks/${taskId}`, 'PUT', { completed: !task?.completed });
      setTasks(tasks.map(t => t.id === taskId ? { ...t, completed: !t.completed } : t));
    } catch(e) { console.error(e); }
  };

  const deleteTask = async (id: string) => {
    try {
      await apiClient(`/tasks/${id}`, 'DELETE');
      setTasks(tasks.filter(t => t.id !== id)); setContextMenu(null);
    } catch(e) { console.error(e); }
  };

  // --- PLIKI ---
  const handleAttachClick = async () => {
    try {
      const newFile: FileItem = { id: `f_${Date.now()}`, name: 'wspolny_zrzut.png', size: '2.1 MB', type: 'image', uploaderId: myUserId, date: 'Przed chwilą' };
      setFiles([newFile, ...files]); setRightPanelTab('files');
      setMessagesByChannel((prev) => ({
        ...prev, [activeChannel]: [...(prev[activeChannel] ?? []), { id: `m_${Date.now()}`, userId: myUserId, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), content: 'Wrzuciłem nowy plik do zakładki pliki: **wspolny_zrzut.png** 🚀', isMe: true }],
      }));
    } catch(e) { console.error(e); }
  };

  const deleteFile = async (id: string) => {
    try {
      await apiClient(`/files/${id}`, 'DELETE');
      setFiles(files.filter(f => f.id !== id)); setContextMenu(null);
    } catch(e) { console.error(e); }
  };

  // --- Voice & Screen ---
  const disconnectVoice = () => {
    setActiveVoiceChannel(null);
    if (screenStream) { screenStream.getTracks().forEach(track => track.stop()); setScreenStream(null); }
    const currentViewType = currentServerChannels.find(c => c.id === activeChannel)?.type;
    if (currentViewType === 'voice') setActiveChannel(currentServerChannels.find(c => c.type === 'text')?.id || currentServerChannels[0]?.id || '');
  };
  const toggleScreenShare = async () => {
    if (screenStream) { screenStream.getTracks().forEach(track => track.stop()); setScreenStream(null); } 
    else {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: { cursor: "always" } as any, audio: false });
        stream.getVideoTracks()[0].onended = () => setScreenStream(null);
        setScreenStream(stream);
      } catch (err) {
        const mockStream = createMockScreenStream();
        mockStream.getVideoTracks()[0].onended = () => setScreenStream(null);
        setScreenStream(mockStream);
      }
    }
  };

  // --- Narzędzia ---
  const copyToClipboard = (text: string) => {
    const dummy = document.createElement('textarea'); document.body.appendChild(dummy); dummy.value = text; dummy.select(); document.execCommand('copy'); document.body.removeChild(dummy); setContextMenu(null);
  };
  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } };
  const handleDragEnter = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); };
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); };
  const handleDrop = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); handleAttachClick(); };
  const openThread = (msg: ChatRow) => { setActiveThread(msg); setRightPanelTab(null); };

  // --- Getters ---
  const getUser = (id: string): UserInfo => {
    if (id === 'flux_ai') return { id: 'flux_ai', name: 'Flux AI', roleId: 'r1', status: 'online' };
    if (id === myUserId) return { id, name: localUserName, roleId: 'r1', status: 'online' };
    const u = mockUsers.find((x) => x.id === id); if (u) return u;
    return { id, name: `Gość·${id.slice(-6)}`, roleId: 'r4', status: 'online' };
  };
  const getRole = (roleId: string) => mockRoles.find((r) => r.id === roleId) ?? mockRoles[3];
  const userIdsOnVoiceChannel = (channelId: string) => activeVoiceChannel === channelId ? voiceParticipants : [];
  const getFileIcon = (type: FileItem['type']) => {
    switch(type) { case 'image': return <ImageIcon size={16} />; case 'doc': return <FileText size={16} />; case 'audio': return <FileAudio size={16} />; case 'archive': return <FileArchive size={16} />; }
  };

  const renderMessageContent = (content: string) => {
    if (!content.includes('\u0060\u0060\u0060')) return <span className="whitespace-pre-wrap break-words">{content}</span>;
    const parts = content.split(/(\u0060\u0060\u0060[\s\S]*?\u0060\u0060\u0060)/g);
    return parts.map((part, i) => {
      if (part.startsWith('\u0060\u0060\u0060') && part.endsWith('\u0060\u0060\u0060')) {
        const rawCode = part.slice(3, -3); const firstNewLine = rawCode.indexOf('\n');
        const lang = firstNewLine !== -1 ? rawCode.slice(0, firstNewLine).trim() : '';
        const code = firstNewLine !== -1 ? rawCode.slice(firstNewLine + 1) : rawCode;
        return (
          <div key={i} className="my-3 rounded-xl bg-[#080808] border border-white/[0.1] overflow-hidden shadow-lg group/code">
            <div className="flex items-center justify-between px-4 py-2 bg-white/[0.03] border-b border-white/[0.05]">
              <span className="text-[10px] uppercase tracking-[0.2em] text-[#00eeff] font-bold">{lang || 'Code'}</span>
              <button onClick={() => copyToClipboard(code)} className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-zinc-500 hover:text-white transition-colors"><Copy size={12} /> Kopiuj</button>
            </div>
            <pre className="p-4 text-[13px] text-zinc-300 font-mono overflow-x-auto leading-relaxed"><code>{code}</code></pre>
          </div>
        );
      }
      return <span key={i} className="whitespace-pre-wrap break-words">{part}</span>;
    });
  };

  const currentChannelData = currentServerChannels.find(c => c.id === activeChannel) || currentServerChannels[0];
  const isMainViewVoice = currentChannelData?.type === 'voice';
  const uncategorizedChannels = currentServerChannels.filter(c => !c.categoryId);

  return (
    <div className="flex h-screen w-full bg-[#000000] p-2 md:p-4 text-zinc-200 font-sans overflow-hidden selection:bg-[#00eeff]/30 selection:text-white relative"
      onDragEnter={handleDragEnter} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop} 
      onContextMenu={(e) => handleContextMenu(e, 'general', null)}
    >
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; height: 4px; display: none; }
        .custom-scrollbar:hover::-webkit-scrollbar { display: block; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }
        .user-row:hover, .channel-row:hover { background-color: var(--hover-bg) !important; border-color: var(--hover-border) !important; }
        .loader-dot { animation: loader 1.4s infinite ease-in-out both; }
        .loader-dot:nth-child(1) { animation-delay: -0.32s; }
        .loader-dot:nth-child(2) { animation-delay: -0.16s; }
        @keyframes loader { 0%, 80%, 100% { transform: scale(0); } 40% { transform: scale(1); } }
      `}</style>

      {/* --- MENU KONTEKSTOWE --- */}
      {contextMenu && (
        <div
          className="fixed z-[300] w-64 bg-[#0c0c0e]/95 backdrop-blur-3xl border border-white/[0.1] rounded-xl shadow-[0_20px_60px_rgba(0,0,0,0.9)] overflow-hidden flex flex-col p-1.5 animate-in fade-in zoom-in-95 duration-100"
          style={{
            top: Math.min(contextMenu.y, window.innerHeight - 350),
            left: Math.min(contextMenu.x, window.innerWidth - 256)
          }}
        >
          {contextMenu.type === 'workspace' && (
            <>
              <div className="px-3 py-2 text-xs font-bold text-zinc-500 uppercase tracking-widest border-b border-white/[0.05] mb-1 truncate">Przestrzeń robocza</div>
              <button onClick={() => { setCreateCategoryModal(true); setContextMenu(null); }} className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-300 hover:text-[#00eeff] hover:bg-[#00eeff]/10 rounded-lg transition-colors w-full text-left"><FolderPlus size={14}/> Utwórz kategorię</button>
              <button onClick={() => { setCreateChannelModal({}); setNewChannelType('text'); setContextMenu(null); }} className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-300 hover:text-[#00eeff] hover:bg-[#00eeff]/10 rounded-lg transition-colors w-full text-left"><Hash size={14}/> Utwórz kanał tekstowy</button>
              <button onClick={() => { setCreateChannelModal({}); setNewChannelType('voice'); setContextMenu(null); }} className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-300 hover:text-[#00eeff] hover:bg-[#00eeff]/10 rounded-lg transition-colors w-full text-left"><Volume2 size={14}/> Utwórz kanał głosowy</button>
              <div className="h-px bg-white/[0.05] my-1"></div>
              <div className="px-3 py-2 text-xs font-bold text-zinc-500 uppercase tracking-widest border-b border-white/[0.05] mb-1 truncate">Zarządzaj serwerami</div>
              <button onClick={() => { setCreateServerModal('create'); setContextMenu(null); }} className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-300 hover:text-[#00eeff] hover:bg-[#00eeff]/10 rounded-lg transition-colors w-full text-left"><Plus size={14}/> Utwórz nowy serwer</button>
              <button onClick={() => { setCreateServerModal('join'); setContextMenu(null); }} className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-300 hover:text-[#00eeff] hover:bg-[#00eeff]/10 rounded-lg transition-colors w-full text-left"><LogIn size={14}/> Dołącz do serwera</button>
              <div className="h-px bg-white/[0.05] my-1"></div>
              <button onClick={() => { setIsSettingsOpen(true); setContextMenu(null); }} className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-300 hover:text-white hover:bg-white/[0.05] rounded-lg transition-colors w-full text-left"><Settings size={14}/> Ustawienia aplikacji</button>
            </>
          )}
          {contextMenu.type === 'membersArea' && (
            <>
              <div className="px-3 py-2 text-xs font-bold text-zinc-500 uppercase tracking-widest border-b border-white/[0.05] mb-1 truncate">Opcje członków</div>
              <button className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-300 hover:text-[#00eeff] hover:bg-[#00eeff]/10 rounded-lg transition-colors w-full text-left"><UserPlus size={14}/> Zaproś użytkowników</button>
              <button className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-300 hover:text-[#00eeff] hover:bg-[#00eeff]/10 rounded-lg transition-colors w-full text-left"><Settings size={14}/> Zarządzaj rolami</button>
            </>
          )}
          {contextMenu.type === 'filesArea' && (
            <>
              <div className="px-3 py-2 text-xs font-bold text-zinc-500 uppercase tracking-widest border-b border-white/[0.05] mb-1 truncate">Opcje plików</div>
              <button onClick={() => { handleAttachClick(); setContextMenu(null); }} className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-300 hover:text-[#00eeff] hover:bg-[#00eeff]/10 rounded-lg transition-colors w-full text-left"><UploadCloud size={14}/> Prześlij nowy plik</button>
            </>
          )}
          {contextMenu.type === 'tasksArea' && (
            <>
              <div className="px-3 py-2 text-xs font-bold text-zinc-500 uppercase tracking-widest border-b border-white/[0.05] mb-1 truncate">Opcje zadań</div>
              <button onClick={() => { setCreateTaskModal({ isOpen: true }); setContextMenu(null); }} className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-300 hover:text-[#00eeff] hover:bg-[#00eeff]/10 rounded-lg transition-colors w-full text-left"><Plus size={14}/> Utwórz nowe zadanie</button>
            </>
          )}
          {contextMenu.type === 'chatArea' && (
            <>
              <div className="px-3 py-2 text-xs font-bold text-zinc-500 uppercase tracking-widest border-b border-white/[0.05] mb-1 truncate">Opcje kanału</div>
              <button className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-300 hover:text-white hover:bg-white/[0.05] rounded-lg transition-colors w-full text-left"><Check size={14}/> Oznacz jako przeczytane</button>
              <button className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-300 hover:text-white hover:bg-white/[0.05] rounded-lg transition-colors w-full text-left"><Pin size={14}/> Pokaż przypięte wiadomości</button>
              <button className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-300 hover:text-white hover:bg-white/[0.05] rounded-lg transition-colors w-full text-left"><BellOff size={14}/> Wycisz kanał</button>
            </>
          )}
          {contextMenu.type === 'server' && (
            <>
              <div className="px-3 py-2 text-xs font-bold text-zinc-500 uppercase tracking-widest border-b border-white/[0.05] mb-1 truncate">{contextMenu.data.name}</div>
              <button onClick={() => copyToClipboard(`https://flux.app/join/${contextMenu.data.id}`)} className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-300 hover:text-white hover:bg-white/[0.05] rounded-lg transition-colors w-full text-left"><Link2 size={14}/> Kopiuj zaproszenie</button>
              <button onClick={() => { setIsSettingsOpen(true); setContextMenu(null); }} className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-300 hover:text-white hover:bg-white/[0.05] rounded-lg transition-colors w-full text-left"><Settings size={14}/> Ustawienia serwera</button>
              <div className="h-px bg-white/[0.05] my-1"></div>
              <button onClick={() => leaveServer(contextMenu.data.id)} className="flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors w-full text-left"><LogOut size={14}/> Opuść serwer</button>
            </>
          )}
          {contextMenu.type === 'category' && (
            <>
              <div className="px-3 py-2 text-xs font-bold text-zinc-500 uppercase tracking-widest border-b border-white/[0.05] mb-1 truncate">{contextMenu.data.name}</div>
              <button onClick={() => { setCreateChannelModal({ categoryId: contextMenu.data.id }); setNewChannelType('text'); setContextMenu(null); }} className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-300 hover:text-[#00eeff] hover:bg-[#00eeff]/10 rounded-lg transition-colors w-full text-left"><Hash size={14}/> Dodaj kanał tekstowy</button>
              <button onClick={() => { setCreateChannelModal({ categoryId: contextMenu.data.id }); setNewChannelType('voice'); setContextMenu(null); }} className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-300 hover:text-[#00eeff] hover:bg-[#00eeff]/10 rounded-lg transition-colors w-full text-left"><Volume2 size={14}/> Dodaj kanał głosowy</button>
              <button onClick={() => { setEditCategoryModal(contextMenu.data); setCategoryNameInput(contextMenu.data.name); setContextMenu(null); }} className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-300 hover:text-white hover:bg-white/[0.05] rounded-lg transition-colors w-full text-left"><Edit2 size={14}/> Edytuj kategorię</button>
              <div className="h-px bg-white/[0.05] my-1"></div>
              <button onClick={() => deleteCategory(contextMenu.data.id)} className="flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors w-full text-left"><Trash2 size={14}/> Usuń kategorię</button>
            </>
          )}
          {contextMenu.type === 'message' && (
            <>
              <div className="px-3 py-2 text-xs font-bold text-zinc-500 uppercase tracking-widest border-b border-white/[0.05] mb-1 truncate">Wiadomość</div>
              <button onClick={() => copyToClipboard(contextMenu.data.content)} className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-300 hover:text-white hover:bg-white/[0.05] rounded-lg transition-colors w-full text-left"><Copy size={14}/> Kopiuj tekst</button>
              <button onClick={() => { setCreateTaskModal({ isOpen: true, sourceMsg: contextMenu.data }); setContextMenu(null); }} className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-300 hover:text-[#00eeff] hover:bg-[#00eeff]/10 rounded-lg transition-colors w-full text-left"><ListTodo size={14}/> Utwórz zadanie</button>
              <button onClick={() => { openThread(contextMenu.data); setContextMenu(null); }} className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-300 hover:text-white hover:bg-white/[0.05] rounded-lg transition-colors w-full text-left"><MessageSquareShare size={14}/> Otwórz wątek</button>
              {contextMenu.data.isMe && (
                <>
                  <div className="h-px bg-white/[0.05] my-1"></div>
                  <button className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-300 hover:text-white hover:bg-white/[0.05] rounded-lg transition-colors w-full text-left"><Edit2 size={14}/> Edytuj</button>
                  <button onClick={() => deleteMessage(contextMenu.data.id)} className="flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors w-full text-left"><Trash2 size={14}/> Usuń</button>
                </>
              )}
            </>
          )}
          {contextMenu.type === 'channel' && (
            <>
              <div className="px-3 py-2 text-xs font-bold text-zinc-500 uppercase tracking-widest border-b border-white/[0.05] mb-1 truncate">{contextMenu.data.name}</div>
              <button className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-300 hover:text-white hover:bg-white/[0.05] rounded-lg transition-colors w-full text-left"><Edit2 size={14}/> Edytuj kanał</button>
              <button className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-300 hover:text-white hover:bg-white/[0.05] rounded-lg transition-colors w-full text-left"><BellOff size={14}/> Wycisz</button>
              <div className="h-px bg-white/[0.05] my-1"></div>
              <button onClick={() => deleteChannel(contextMenu.data.id)} className="flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors w-full text-left"><Trash2 size={14}/> Usuń kanał</button>
            </>
          )}
          {contextMenu.type === 'user' && (
            <>
              <div className="px-3 py-2 text-xs font-bold text-zinc-500 uppercase tracking-widest border-b border-white/[0.05] mb-1 truncate">{contextMenu.data.name}</div>
              <button className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-300 hover:text-white hover:bg-white/[0.05] rounded-lg transition-colors w-full text-left"><Eye size={14}/> Pokaż profil</button>
              <button className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-300 hover:text-white hover:bg-white/[0.05] rounded-lg transition-colors w-full text-left"><MessageSquare size={14}/> Wyślij wiadomość</button>
              <button className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-300 hover:text-white hover:bg-white/[0.05] rounded-lg transition-colors w-full text-left"><UserCheck size={14}/> Zmień rolę</button>
              <div className="h-px bg-white/[0.05] my-1"></div>
              <button className="flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors w-full text-left"><UserMinus size={14}/> Wyrzuć z Flux_</button>
            </>
          )}
          {contextMenu.type === 'file' && (
            <>
              <div className="px-3 py-2 text-xs font-bold text-zinc-500 uppercase tracking-widest border-b border-white/[0.05] mb-1 truncate">{contextMenu.data.name}</div>
              <button className="flex items-center gap-2 px-3 py-2 text-sm text-[#00eeff] hover:text-[#00eeff] hover:bg-[#00eeff]/10 rounded-lg transition-colors w-full text-left"><Download size={14}/> Pobierz plik</button>
              <button onClick={() => copyToClipboard(`https://flux.app/files/${contextMenu.data.id}`)} className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-300 hover:text-white hover:bg-white/[0.05] rounded-lg transition-colors w-full text-left"><Link size={14}/> Kopiuj link</button>
              <div className="h-px bg-white/[0.05] my-1"></div>
              <button onClick={() => deleteFile(contextMenu.data.id)} className="flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors w-full text-left"><Trash2 size={14}/> Usuń plik</button>
            </>
          )}
          {contextMenu.type === 'task' && (
            <>
              <div className="px-3 py-2 text-xs font-bold text-zinc-500 uppercase tracking-widest border-b border-white/[0.05] mb-1 truncate">Opcje Zadania</div>
              <button onClick={() => { toggleTask(contextMenu.data.id); setContextMenu(null); }} className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-300 hover:text-white hover:bg-white/[0.05] rounded-lg transition-colors w-full text-left"><CheckSquare size={14}/> {contextMenu.data.completed ? 'Cofnij ukończenie' : 'Ukończ zadanie'}</button>
              <button className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-300 hover:text-white hover:bg-white/[0.05] rounded-lg transition-colors w-full text-left"><Edit2 size={14}/> Edytuj</button>
              <div className="h-px bg-white/[0.05] my-1"></div>
              <button onClick={() => deleteTask(contextMenu.data.id)} className="flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors w-full text-left"><Trash2 size={14}/> Usuń zadanie</button>
            </>
          )}
        </div>
      )}

      {/* --- MODALE TWORZENIA/EDYCJI --- */}
      {createServerModal && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200" onClick={(e) => e.stopPropagation()}>
          <div className="w-full max-w-md bg-[#0c0c0e] border border-white/[0.1] rounded-3xl shadow-[0_0_80px_rgba(0,0,0,1)] p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-white">{createServerModal === 'create' ? 'Utwórz nowy serwer' : 'Dołącz do serwera'}</h3>
              <button onClick={() => setCreateServerModal(null)} className="text-zinc-500 hover:text-white"><X size={20}/></button>
            </div>
            <div className="mb-6">
              <label className="block text-xs font-bold uppercase tracking-widest text-zinc-500 mb-2">{createServerModal === 'create' ? 'Nazwa serwera' : 'Kod zaproszenia (np. flux.app/join/xyz)'}</label>
              <div className="relative flex items-center bg-[#151515] border border-white/[0.1] rounded-xl focus-within:border-[#00eeff]/50 transition-colors px-3">
                {createServerModal === 'create' ? <Server size={16} className="text-zinc-500"/> : <Link2 size={16} className="text-zinc-500"/>}
                <input 
                  autoFocus 
                  value={createServerModal === 'create' ? newServerName : joinServerCode} 
                  onChange={e => createServerModal === 'create' ? setNewServerName(e.target.value) : setJoinServerCode(e.target.value)} 
                  onKeyDown={e => {if(e.key==='Enter') createServerModal === 'create' ? handleCreateServer() : handleJoinServer()}} 
                  placeholder={createServerModal === 'create' ? 'Mój super serwer' : 'https://flux.app/...'} 
                  className="w-full bg-transparent outline-none py-3 px-3 text-sm text-white placeholder-zinc-600" 
                />
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setCreateServerModal(null)} className="px-5 py-2.5 rounded-xl text-sm font-medium text-zinc-400 hover:bg-white/[0.05] transition-colors">Anuluj</button>
              <button 
                onClick={createServerModal === 'create' ? handleCreateServer : handleJoinServer} 
                disabled={createServerModal === 'create' ? !newServerName.trim() : !joinServerCode.trim()} 
                className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${(createServerModal === 'create' ? newServerName.trim() : joinServerCode.trim()) ? 'bg-[#00eeff] text-black shadow-[0_0_15px_rgba(0,238,255,0.4)]' : 'bg-white/[0.05] text-zinc-600 cursor-not-allowed'}`}
              >
                {createServerModal === 'create' ? 'Utwórz' : 'Dołącz'}
              </button>
            </div>
          </div>
        </div>
      )}

      {(createCategoryModal || editCategoryModal) && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200" onClick={(e) => e.stopPropagation()}>
          <div className="w-full max-w-md bg-[#0c0c0e] border border-white/[0.1] rounded-3xl shadow-[0_0_80px_rgba(0,0,0,1)] p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-white">{createCategoryModal ? 'Utwórz kategorię' : 'Edytuj kategorię'}</h3>
              <button onClick={() => { setCreateCategoryModal(false); setEditCategoryModal(null); }} className="text-zinc-500 hover:text-white"><X size={20}/></button>
            </div>
            <div className="mb-6">
              <label className="block text-xs font-bold uppercase tracking-widest text-zinc-500 mb-2">Nazwa kategorii</label>
              <div className="relative flex items-center bg-[#151515] border border-white/[0.1] rounded-xl focus-within:border-[#00eeff]/50 transition-colors px-3">
                <FolderPlus size={16} className="text-zinc-500"/>
                <input 
                  autoFocus 
                  value={categoryNameInput} 
                  onChange={e => setCategoryNameInput(e.target.value)} 
                  onKeyDown={e => {if(e.key==='Enter') createCategoryModal ? handleCreateCategory() : handleEditCategory()}} 
                  placeholder="np. Zespół Alpha" 
                  className="w-full bg-transparent outline-none py-3 px-3 text-sm text-white placeholder-zinc-600" 
                />
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => { setCreateCategoryModal(false); setEditCategoryModal(null); }} className="px-5 py-2.5 rounded-xl text-sm font-medium text-zinc-400 hover:bg-white/[0.05] transition-colors">Anuluj</button>
              <button 
                onClick={createCategoryModal ? handleCreateCategory : handleEditCategory} 
                disabled={!categoryNameInput.trim()} 
                className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${categoryNameInput.trim() ? 'bg-[#00eeff] text-black shadow-[0_0_15px_rgba(0,238,255,0.4)]' : 'bg-white/[0.05] text-zinc-600 cursor-not-allowed'}`}
              >
                {createCategoryModal ? 'Utwórz' : 'Zapisz'}
              </button>
            </div>
          </div>
        </div>
      )}

      {createChannelModal && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200" onClick={(e) => e.stopPropagation()}>
          <div className="w-full max-w-md bg-[#0c0c0e] border border-white/[0.1] rounded-3xl shadow-[0_0_80px_rgba(0,0,0,1)] p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-white">Utwórz kanał</h3>
              <button onClick={() => setCreateChannelModal(null)} className="text-zinc-500 hover:text-white"><X size={20}/></button>
            </div>
            <div className="flex gap-3 mb-6">
              <button onClick={() => setNewChannelType('text')} className={`flex-1 py-3 rounded-xl text-sm font-bold flex flex-col items-center justify-center gap-2 transition-all ${newChannelType === 'text' ? 'bg-[#00eeff]/10 text-[#00eeff] border border-[#00eeff]/50 shadow-[0_0_15px_rgba(0,238,255,0.2)]' : 'bg-white/[0.02] text-zinc-500 border border-white/[0.05] hover:bg-white/[0.05]'}`}><Hash size={24}/> Tekstowy</button>
              <button onClick={() => setNewChannelType('voice')} className={`flex-1 py-3 rounded-xl text-sm font-bold flex flex-col items-center justify-center gap-2 transition-all ${newChannelType === 'voice' ? 'bg-[#b266ff]/10 text-[#b266ff] border border-[#b266ff]/50 shadow-[0_0_15px_rgba(178,102,255,0.2)]' : 'bg-white/[0.02] text-zinc-500 border border-white/[0.05] hover:bg-white/[0.05]'}`}><Volume2 size={24}/> Głosowy</button>
            </div>
            <div className="mb-6">
              <label className="block text-xs font-bold uppercase tracking-widest text-zinc-500 mb-2">Nazwa kanału</label>
              <div className="relative flex items-center bg-[#151515] border border-white/[0.1] rounded-xl focus-within:border-[#00eeff]/50 transition-colors px-3">
                {newChannelType === 'text' ? <Hash size={16} className="text-zinc-500"/> : <Radio size={16} className="text-zinc-500"/>}
                <input autoFocus value={newChannelName} onChange={e=>setNewChannelName(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')handleCreateChannel()}} placeholder="nowy-kanal" className="w-full bg-transparent outline-none py-3 px-3 text-sm text-white placeholder-zinc-600" />
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setCreateChannelModal(null)} className="px-5 py-2.5 rounded-xl text-sm font-medium text-zinc-400 hover:bg-white/[0.05] transition-colors">Anuluj</button>
              <button onClick={handleCreateChannel} disabled={!newChannelName.trim()} className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${newChannelName.trim() ? 'bg-[#00eeff] text-black shadow-[0_0_15px_rgba(0,238,255,0.4)]' : 'bg-white/[0.05] text-zinc-600 cursor-not-allowed'}`}>Utwórz</button>
            </div>
          </div>
        </div>
      )}

      {createTaskModal.isOpen && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200" onClick={(e) => e.stopPropagation()}>
          <div className="w-full max-w-lg bg-[#0c0c0e] border border-white/[0.1] rounded-3xl shadow-[0_0_80px_rgba(0,0,0,1)] p-6">
            <div className="flex justify-between items-center mb-6">
              <div className="flex items-center gap-2"><ListTodo className="text-[#00eeff]" size={20}/><h3 className="text-xl font-bold text-white">Nowe zadanie</h3></div>
              <button onClick={() => setCreateTaskModal({isOpen: false})} className="text-zinc-500 hover:text-white"><X size={20}/></button>
            </div>
            {createTaskModal.sourceMsg && (
              <div className="mb-6 p-3 bg-white/[0.02] border border-white/[0.05] rounded-xl text-sm text-zinc-400 italic">
                <span className="font-semibold text-zinc-300 not-italic block mb-1">Na podstawie wiadomości:</span>
                "{createTaskModal.sourceMsg.content.slice(0, 80)}{createTaskModal.sourceMsg.content.length > 80 ? '...' : ''}"
              </div>
            )}
            <div className="mb-6">
              <label className="block text-xs font-bold uppercase tracking-widest text-zinc-500 mb-2">Tytuł zadania</label>
              <input autoFocus value={newTaskTitle} onChange={e=>setNewTaskTitle(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')handleCreateTask()}} placeholder="Co jest do zrobienia?" className="w-full bg-[#151515] border border-white/[0.1] focus:border-[#00eeff]/50 rounded-xl outline-none py-3 px-4 text-sm text-white placeholder-zinc-600 transition-colors" />
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setCreateTaskModal({isOpen: false})} className="px-5 py-2.5 rounded-xl text-sm font-medium text-zinc-400 hover:bg-white/[0.05] transition-colors">Anuluj</button>
              <button onClick={handleCreateTask} disabled={!newTaskTitle.trim()} className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${newTaskTitle.trim() ? 'bg-[#00eeff] text-black shadow-[0_0_15px_rgba(0,238,255,0.4)]' : 'bg-white/[0.05] text-zinc-600 cursor-not-allowed'}`}>Zapisz Zadanie</button>
            </div>
          </div>
        </div>
      )}

      {/* --- STRUKTURA GŁÓWNA APLIKACJI --- */}
      <div className="flex h-full w-full bg-[#050505] rounded-[32px] border border-white/[0.08] shadow-[0_0_80px_rgba(255,255,255,0.03)] overflow-hidden relative transition-all duration-500">
        
        {/* --- 1. LEWY PANEL (NAV) --- */}
        {!isZenMode && (
          <aside 
            onContextMenu={(e) => handleContextMenu(e, 'workspace', null)}
            className="w-[280px] flex flex-col shrink-0 z-30 border-r border-white/[0.04] bg-[#080808] transition-all duration-500"
          >
            {/* Workspace Switcher */}
            <div className="relative px-4 pt-6 pb-2 z-50">
              {(() => {
                const activeServerData = servers.find(s => s.id === activeServer) || servers[0];
                if (!activeServerData) return null;
                return (
                  <>
                    <button onClick={() => setIsWorkspaceDropdownOpen(!isWorkspaceDropdownOpen)} className="w-full flex items-center gap-3 p-2.5 rounded-2xl border transition-all duration-300 group hover:brightness-125 bg-black/50 backdrop-blur-md" style={{ borderColor: `${activeServerData.color}30`, boxShadow: isWorkspaceDropdownOpen ? activeServerData.glow : `0 0 15px ${activeServerData.color}10` }}>
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center transition-all" style={{ backgroundColor: `${activeServerData.color}20`, color: activeServerData.color }}><activeServerData.icon size={20} /></div>
                      <div className="flex flex-col items-start flex-1 min-w-0">
                        <span className="text-[15px] font-bold truncate w-full text-left tracking-wide" style={{ color: activeServerData.color, textShadow: `0 0 10px ${activeServerData.color}40` }}>{activeServerData.name}</span>
                        <span className="text-[10px] text-zinc-500 font-medium uppercase tracking-widest mt-0.5">Przestrzeń robocza</span>
                      </div>
                      <ChevronsUpDown size={16} className="text-zinc-600 group-hover:text-zinc-300 transition-colors mr-1" />
                    </button>
                    {isWorkspaceDropdownOpen && (
                      <div className="absolute top-[calc(100%-4px)] left-4 right-4 mt-2 bg-[#0c0c0e]/95 backdrop-blur-3xl border border-white/[0.1] rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.9)] p-2 flex flex-col gap-1 z-50">
                        {servers.map(server => (
                          <button 
                            key={server.id} 
                            onClick={() => { setActiveServer(server.id); setIsWorkspaceDropdownOpen(false); }} 
                            onContextMenu={(e) => handleContextMenu(e, 'server', server)}
                            className="w-full flex items-center gap-3 p-2 rounded-xl transition-all duration-200 hover:bg-white/[0.05] group"
                          >
                            <div className="w-8 h-8 rounded-lg flex items-center justify-center transition-transform group-hover:scale-105" style={{ color: server.color, backgroundColor: `${server.color}15`, border: `1px solid ${server.color}30` }}><server.icon size={14} /></div>
                            <span className="text-sm font-semibold tracking-wide" style={{ color: server.color }}>{server.name}</span>
                            {activeServer === server.id && <Check size={16} className="ml-auto" style={{ color: server.color }} />}
                          </button>
                        ))}
                        <div className="h-px bg-white/[0.05] my-1 mx-2"></div>
                        <button onClick={() => { setCreateServerModal('create'); setIsWorkspaceDropdownOpen(false); }} className="w-full flex items-center gap-3 p-2 rounded-xl transition-all duration-200 hover:bg-white/[0.05] text-zinc-400 hover:text-[#00eeff]">
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-white/[0.02] border border-white/[0.05]"><Plus size={14} /></div>
                          <span className="text-sm font-semibold tracking-wide">Utwórz serwer</span>
                        </button>
                        <button onClick={() => { setCreateServerModal('join'); setIsWorkspaceDropdownOpen(false); }} className="w-full flex items-center gap-3 p-2 rounded-xl transition-all duration-200 hover:bg-white/[0.05] text-zinc-400 hover:text-[#00eeff]">
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-white/[0.02] border border-white/[0.05]"><LogIn size={14} /></div>
                          <span className="text-sm font-semibold tracking-wide">Dołącz do serwera</span>
                        </button>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>

            {/* LISTA KANAŁÓW I KATEGORII */}
            <div className="flex-1 overflow-y-auto custom-scrollbar py-2 px-4 flex flex-col gap-6">
              
              {/* KANAŁY BEZ KATEGORII */}
              {uncategorizedChannels.length > 0 && (
                <div className="flex flex-col gap-1">
                  {uncategorizedChannels.map(channel => {
                    const isVoice = channel.type === 'voice';
                    const isActiveVoice = activeVoiceChannel === channel.id;
                    const isViewed = activeChannel === channel.id;
                    const participantsOnChannel = isVoice ? userIdsOnVoiceChannel(channel.id) : [];

                    return (
                      <div key={channel.id} className="flex flex-col">
                        <button 
                          onClick={() => handleChannelClick(channel)} 
                          onContextMenu={(e) => handleContextMenu(e, 'channel', channel)}
                          className="channel-row flex items-center gap-2.5 py-1.5 px-3 rounded-lg text-sm transition-all duration-200 group border border-transparent" 
                          style={isViewed || isActiveVoice ? { backgroundColor: `${channel.color}15`, borderColor: `${channel.color}30` } : { '--hover-bg': `${channel.color}10`, '--hover-border': `${channel.color}20` } as any}
                        >
                          {isVoice && isActiveVoice ? (
                            <div className="w-4 h-4 flex items-center justify-center relative"><Volume2 size={16} style={{ color: channel.color }} className="animate-pulse" /></div>
                          ) : (
                            <channel.icon size={16} style={{ color: isViewed ? channel.color : undefined }} className={!isViewed ? "text-zinc-500 group-hover:brightness-150 transition-all" : ""} />
                          )}
                          <span className={`truncate ${isViewed || isActiveVoice ? 'font-semibold' : 'text-zinc-400 group-hover:text-zinc-200'}`} style={isViewed || isActiveVoice ? { color: channel.color, textShadow: `0 0 10px ${channel.color}40` } : {}}>{channel.name}</span>
                          {!isVoice && channel.unread && !isViewed && <div className="ml-auto w-1.5 h-1.5 rounded-full" style={{ backgroundColor: channel.color, boxShadow: `0 0 8px ${channel.color}` }}></div>}
                        </button>
                        
                        {isVoice && participantsOnChannel.length > 0 && (
                          <div className="ml-8 mt-1.5 mb-1 flex flex-col gap-1.5">
                            {participantsOnChannel.map((uid) => {
                              const u = getUser(uid); const isMe = uid === guestIdRef.current;
                              return (
                                <div key={uid} onContextMenu={(e) => handleContextMenu(e, 'user', u)} className="flex items-center gap-2 text-xs text-zinc-400 py-1 px-2 rounded-md hover:bg-white/[0.05] cursor-pointer transition-colors border border-transparent hover:border-white/[0.05]">
                                  <div className="relative shrink-0">
                                    <div className="w-5 h-5 rounded-md bg-zinc-800 flex items-center justify-center text-[9px] font-bold text-white border border-white/[0.05]">{u.name.charAt(0)}</div>
                                    <div
                                      className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 border-2 rounded-full ${
                                        isMe && localMuted
                                          ? 'bg-red-500 border-[#080808]'
                                          : speakingPeers[uid]
                                            ? 'bg-[#00eeff] border-[#080808] animate-pulse shadow-[0_0_6px_rgba(0,238,255,0.6)]'
                                            : 'bg-emerald-500 border-[#080808]'
                                      }`}
                                    />
                                  </div>
                                  <span className={`truncate ${isMe ? 'text-[#00eeff] font-medium' : ''} ${speakingPeers[uid] && !isMe ? 'text-[#00eeff]/90' : ''}`}>{u.name}</span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* RENDER KATEGORII */}
              {currentServerCategories.map(cat => {
                const catChannels = currentServerChannels.filter(c => c.categoryId === cat.id);
                return (
                  <div key={cat.id}>
                    <div 
                      className="mb-2 px-2 flex items-center justify-between text-zinc-600 group cursor-pointer"
                      onContextMenu={(e) => handleContextMenu(e, 'category', cat)}
                    >
                      <div className="flex items-center gap-1 hover:text-zinc-300 transition-colors" onClick={() => toggleCategory(cat.id)}>
                        <ChevronDown size={14} className={`transition-transform ${!cat.isExpanded ? '-rotate-90' : ''}`} />
                        <span className="text-[10px] uppercase tracking-[0.2em] font-bold">{cat.name}</span>
                      </div>
                      <Plus size={14} onClick={(e) => { e.stopPropagation(); setCreateChannelModal({ categoryId: cat.id }); setNewChannelType('text'); }} className="opacity-0 group-hover:opacity-100 hover:text-[#00eeff] transition-all" />
                    </div>
                    
                    {cat.isExpanded && (
                      <div className="flex flex-col gap-1">
                        {catChannels.length === 0 && <span className="px-4 py-1 text-[11px] text-zinc-600 italic">Kategoria jest pusta</span>}
                        {catChannels.map(channel => {
                          const isVoice = channel.type === 'voice';
                          const isActiveVoice = activeVoiceChannel === channel.id;
                          const isViewed = activeChannel === channel.id;
                          const participantsOnChannel = isVoice ? userIdsOnVoiceChannel(channel.id) : [];

                          return (
                            <div key={channel.id} className="flex flex-col">
                              <button 
                                onClick={() => handleChannelClick(channel)} 
                                onContextMenu={(e) => handleContextMenu(e, 'channel', channel)}
                                className="channel-row flex items-center gap-2.5 py-1.5 px-3 rounded-lg text-sm transition-all duration-200 group border border-transparent" 
                                style={isViewed || isActiveVoice ? { backgroundColor: `${channel.color}15`, borderColor: `${channel.color}30` } : { '--hover-bg': `${channel.color}10`, '--hover-border': `${channel.color}20` } as any}
                              >
                                {isVoice && isActiveVoice ? (
                                  <div className="w-4 h-4 flex items-center justify-center relative"><Volume2 size={16} style={{ color: channel.color }} className="animate-pulse" /></div>
                                ) : (
                                  <channel.icon size={16} style={{ color: isViewed ? channel.color : undefined }} className={!isViewed ? "text-zinc-500 group-hover:brightness-150 transition-all" : ""} />
                                )}
                                <span className={`truncate ${isViewed || isActiveVoice ? 'font-semibold' : 'text-zinc-400 group-hover:text-zinc-200'}`} style={isViewed || isActiveVoice ? { color: channel.color, textShadow: `0 0 10px ${channel.color}40` } : {}}>{channel.name}</span>
                                {!isVoice && channel.unread && !isViewed && <div className="ml-auto w-1.5 h-1.5 rounded-full" style={{ backgroundColor: channel.color, boxShadow: `0 0 8px ${channel.color}` }}></div>}
                              </button>
                              
                              {/* Voice Participants */}
                              {isVoice && participantsOnChannel.length > 0 && (
                                <div className="ml-8 mt-1.5 mb-1 flex flex-col gap-1.5">
                                  {participantsOnChannel.map((uid) => {
                                    const u = getUser(uid); const isMe = uid === guestIdRef.current;
                                    return (
                                      <div key={uid} onContextMenu={(e) => handleContextMenu(e, 'user', u)} className="flex items-center gap-2 text-xs text-zinc-400 py-1 px-2 rounded-md hover:bg-white/[0.05] cursor-pointer transition-colors border border-transparent hover:border-white/[0.05]">
                                        <div className="relative shrink-0">
                                          <div className="w-5 h-5 rounded-md bg-zinc-800 flex items-center justify-center text-[9px] font-bold text-white border border-white/[0.05]">{u.name.charAt(0)}</div>
                                          <div
                                            className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 border-2 rounded-full ${
                                              isMe && localMuted
                                                ? 'bg-red-500 border-[#080808]'
                                                : speakingPeers[uid]
                                                  ? 'bg-[#00eeff] border-[#080808] animate-pulse shadow-[0_0_6px_rgba(0,238,255,0.6)]'
                                                  : 'bg-emerald-500 border-[#080808]'
                                            }`}
                                          />
                                        </div>
                                        <span className={`truncate ${isMe ? 'text-[#00eeff] font-medium' : ''} ${speakingPeers[uid] && !isMe ? 'text-[#00eeff]/90' : ''}`}>{u.name}</span>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="h-16 border-t border-white/[0.04] bg-black/40 p-2 flex items-center z-50">
              <div onClick={() => setIsSettingsOpen(true)} className="flex items-center gap-2 flex-1 hover:bg-white/[0.05] p-1.5 rounded-lg cursor-pointer transition-colors">
                <div className="relative">
                  <div className="w-8 h-8 rounded-lg bg-black border border-white/[0.1] text-white flex items-center justify-center font-bold text-sm shadow-[0_0_15px_rgba(255,255,255,0.1)]">{localUserName.charAt(0)}</div>
                  <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-emerald-500 border-2 border-[#080808] rounded-full shadow-[0_0_10px_rgba(16,185,129,0.5)]"></div>
                </div>
                <div className="flex flex-col overflow-hidden">
                  <span className="text-xs font-bold text-white truncate leading-tight">{localUserName}</span>
                  <span className="text-[10px] text-zinc-500 truncate leading-tight">Ty (Gość)</span>
                </div>
              </div>
              <div className="flex items-center gap-0.5 text-zinc-500">
                <button onClick={() => setIsSettingsOpen(true)} className="p-1.5 hover:text-white hover:bg-white/[0.05] rounded-md transition-colors"><Settings size={16} /></button>
              </div>
            </div>
          </aside>
        )}

        {/* --- 2. MAIN VIEW (CZAT / VOICE) --- */}
        <main className="flex-1 flex flex-col relative bg-[#0a0a0c] overflow-hidden z-0 border-l border-white/[0.02] transition-all duration-500">
          <header className="h-16 flex items-center justify-between px-6 border-b border-white/[0.04] bg-[#0a0a0c]/80 backdrop-blur-md shrink-0 z-10 transition-all">
            <div className="flex items-center gap-3 text-sm font-medium">
              {currentChannelData && <currentChannelData.icon size={20} style={{ color: currentChannelData.color }} />}
              <span className="tracking-tight font-bold text-lg" style={{ color: currentChannelData?.color, textShadow: `0 0 15px ${currentChannelData?.color}40` }}>{currentChannelData?.name}</span>
              <div className="w-[1px] h-4 bg-white/[0.1] mx-2 hidden md:block"></div>
              <span className="text-xs text-zinc-500 hidden md:block font-normal">{isMainViewVoice ? 'Aktywna komunikacja głosowa.' : 'System operacyjny Flux_.'}</span>
            </div>
            
            <div className="flex items-center gap-2 text-zinc-400">
              {!isMainViewVoice && !isZenMode && (
                <div className="flex items-center gap-1 border-r border-white/[0.1] pr-2 mr-2">
                  <button className="p-2 hover:text-[#00eeff] hover:bg-[#00eeff]/10 rounded-lg transition-colors"><Phone size={18} /></button>
                  <button className="p-2 hover:text-[#00eeff] hover:bg-[#00eeff]/10 rounded-lg transition-colors"><Video size={18} /></button>
                </div>
              )}
              <button onClick={() => setIsZenMode(!isZenMode)} className={`p-2 rounded-lg transition-all duration-300 ${isZenMode ? 'bg-[#00eeff] text-black shadow-[0_0_15px_rgba(0,238,255,0.4)]' : 'hover:text-white hover:bg-white/[0.05]'}`} title="Tryb Skupienia">
                {isZenMode ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
              </button>
              {!isZenMode && (
                <button onClick={() => { setActiveThread(null); setRightPanelTab(rightPanelTab === 'members' ? null : 'members'); }} className={`p-2 rounded-lg transition-colors ${(rightPanelTab && !activeThread) ? 'bg-white/[0.1] text-white' : 'hover:text-white hover:bg-white/[0.05]'}`}>
                  <Users size={18} />
                </button>
              )}
            </div>
          </header>

          {isMainViewVoice ? (
            <div className="flex-1 flex flex-col bg-[#050505] relative overflow-hidden">
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(0,238,255,0.03)_0%,transparent_70%)] pointer-events-none"></div>
              <div className="flex-1 p-6 sm:p-10 flex flex-col overflow-auto custom-scrollbar relative z-10">
                {activeVoiceChannel === currentChannelData?.id ? (
                  <div className="w-full max-w-7xl mx-auto flex flex-col pb-24">
                    {voicePhase === 'error' && voiceError && (
                      <div className="mb-6 rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                        {voiceError}
                      </div>
                    )}
                    {screenStream && (
                      <div className="w-full aspect-video rounded-3xl border border-[#00eeff]/20 bg-black/80 p-2 shadow-[0_0_80px_rgba(0,238,255,0.1)] relative mb-12 group transition-all duration-700">
                        <div className="absolute top-0 left-0 w-12 h-12 border-t-2 border-l-2 border-[#00eeff]/80 rounded-tl-3xl z-10 transition-all duration-500 group-hover:w-16 group-hover:h-16 shadow-[-5px_-5px_15px_rgba(0,238,255,0.2)]"></div>
                        <div className="absolute top-0 right-0 w-12 h-12 border-t-2 border-r-2 border-[#00eeff]/80 rounded-tr-3xl z-10 transition-all duration-500 group-hover:w-16 group-hover:h-16 shadow-[5px_-5px_15px_rgba(0,238,255,0.2)]"></div>
                        <div className="absolute bottom-0 left-0 w-12 h-12 border-b-2 border-l-2 border-[#00eeff]/80 rounded-bl-3xl z-10 transition-all duration-500 group-hover:w-16 group-hover:h-16 shadow-[-5px_5px_15px_rgba(0,238,255,0.2)]"></div>
                        <div className="absolute bottom-0 right-0 w-12 h-12 border-b-2 border-r-2 border-[#00eeff]/80 rounded-br-3xl z-10 transition-all duration-500 group-hover:w-16 group-hover:h-16 shadow-[5px_5px_15px_rgba(0,238,255,0.2)]"></div>
                        <div className="w-full h-full rounded-2xl overflow-hidden relative">
                          <VideoPlayer stream={screenStream} isLocal={true} className="w-full h-full object-contain bg-[#030303]" />
                          <div className="absolute top-4 left-4 px-3 py-1.5 bg-black/60 backdrop-blur-md rounded-lg text-[10px] uppercase tracking-widest font-black text-white border border-[#00eeff]/30 flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-[#00eeff] animate-pulse shadow-[0_0_8px_#00eeff]"></span>Strumień Ekranu</div>
                        </div>
                      </div>
                    )}
                    <div className="flex items-center gap-3 mb-8 px-2">
                      <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/[0.1] to-transparent"></div>
                      <span className="text-[10px] uppercase tracking-[0.3em] font-bold text-zinc-500">Węzły Komunikacyjne ({voiceParticipants.length})</span>
                      <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/[0.1] to-transparent"></div>
                    </div>
                    <div className="flex flex-wrap justify-center gap-6">
                      {voiceParticipants.map((uid) => {
                        const u = getUser(uid); const isSelf = uid === guestIdRef.current;
                        const isSpeaking = !!speakingPeers[uid];

                        return (
                          <div 
                            key={uid} 
                            onContextMenu={(e) => handleContextMenu(e, 'user', u)}
                            className={`group flex items-center gap-4 p-2.5 pr-6 rounded-full bg-gradient-to-r from-black/90 to-[#0a0a0c] border backdrop-blur-xl transition-all duration-500 shadow-xl cursor-pointer ${isSpeaking ? 'border-[#00eeff]/50 shadow-[0_0_30px_rgba(0,238,255,0.15)] scale-105' : 'border-white/[0.05] hover:border-white/[0.15]'} ${screenStream ? 'w-64' : 'w-72 sm:w-80'}`}
                          >
                            <div className="relative shrink-0">
                              <div className={`absolute inset-0 rounded-full blur-md transition-all duration-500 ${isSpeaking ? 'bg-[#00eeff] opacity-50 animate-pulse' : 'opacity-0'}`}></div>
                              <div className={`w-14 h-14 relative z-10 rounded-full flex items-center justify-center text-xl font-black transition-colors duration-500 ${isSpeaking ? 'bg-[#000] border-2 border-[#00eeff] text-[#00eeff]' : 'bg-[#151515] border border-white/[0.1] text-zinc-400'}`}>{u.name.charAt(0)}</div>
                              <div className={`absolute bottom-0 right-0 w-4 h-4 rounded-full border-2 border-[#050505] flex items-center justify-center z-20 ${isSelf && localMuted ? 'bg-red-500' : 'bg-emerald-500'}`}>
                                {isSelf && localMuted && <VolumeX size={8} className="text-black" />}
                              </div>
                            </div>
                            <div className="flex flex-col flex-1 min-w-0 justify-center">
                              <span className={`text-[15px] font-bold truncate transition-colors duration-300 ${isSpeaking ? 'text-[#00eeff] drop-shadow-[0_0_8px_rgba(0,238,255,0.4)]' : 'text-zinc-200'}`}>{u.name}</span>
                              <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-semibold flex items-center gap-1 mt-0.5">
                                {isSelf && localMuted ? 'Wyciszony' : isSpeaking ? 'Mówi…' : 'Połączony'}
                              </span>
                            </div>
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
                    <div className="w-20 h-20 rounded-full bg-[#00eeff]/5 border border-[#00eeff]/20 flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(0,238,255,0.1)]">{currentChannelData && <currentChannelData.icon size={40} style={{ color: currentChannelData.color }} className="opacity-80" />}</div>
                    <h2 className="text-2xl font-bold text-white mb-2">Prywatny węzeł głosowy</h2>
                    <p className="text-zinc-500 mb-8">Rozpocznij transmisję głosową lub wideo. Ruch danych w tym węźle jest w pełni szyfrowany.</p>
                    <button onClick={() => currentChannelData && handleChannelClick(currentChannelData)} className="px-8 py-3.5 rounded-full bg-[#00eeff] text-black font-bold text-sm shadow-[0_0_20px_rgba(0,238,255,0.4)] hover:shadow-[0_0_30px_rgba(0,238,255,0.6)] hover:scale-105 transition-all duration-300">Nawiąż połączenie z węzłem</button>
                  </div>
                )}
              </div>
              {activeVoiceChannel === currentChannelData?.id && (
                <div className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-[#0a0a0c]/80 backdrop-blur-2xl border border-white/[0.1] rounded-full flex items-center p-2 shadow-[0_20px_60px_rgba(0,0,0,0.8)] z-30 gap-2">
                  <button onClick={() => setLocalMuted(!localMuted)} className={`w-14 h-14 rounded-full flex items-center justify-center transition-all duration-300 border ${localMuted ? 'bg-red-500/20 text-red-400 border-red-500/40 shadow-[0_0_15px_rgba(239,68,68,0.2)]' : 'bg-white/[0.05] text-zinc-200 border-white/[0.05] hover:bg-white/[0.1]'}`} title={localMuted ? 'Odcisz' : 'Wycisz'}>
                    {localMuted ? <VolumeX size={22} /> : <Volume2 size={22} />}
                  </button>
                  <div className="w-px h-8 bg-white/[0.1] mx-1"></div>
                  <button onClick={toggleScreenShare} className={`px-6 h-14 rounded-full flex items-center gap-3 font-bold uppercase tracking-wider text-[11px] transition-all duration-300 border ${screenStream ? 'bg-[#00eeff] text-black border-[#00eeff] shadow-[0_0_20px_rgba(0,238,255,0.4)]' : 'bg-white/[0.05] text-zinc-200 border-white/[0.05] hover:bg-white/[0.1]'}`}>
                    <MonitorUp size={20} />{screenStream ? 'Zakończ transmisję' : 'Udostępnij ekran'}
                  </button>
                  <div className="w-px h-8 bg-white/[0.1] mx-1"></div>
                  <button onClick={disconnectVoice} className="w-14 h-14 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center transition-all duration-300 shadow-[0_0_20px_rgba(239,68,68,0.4)] hover:shadow-[0_0_30px_rgba(239,68,68,0.6)]" title="Rozłącz"><PhoneOff size={22} /></button>
                </div>
              )}
            </div>
          ) : (
            <>
              {/* WIDOK CZATU TEKSTOWEGO */}
              <div 
                onContextMenu={(e) => handleContextMenu(e, 'chatArea', null)}
                className="flex-1 overflow-y-auto px-6 pt-6 pb-44 custom-scrollbar flex flex-col relative transition-all duration-500"
              >
                <div className={`${isZenMode ? 'max-w-3xl' : 'max-w-4xl'} mx-auto w-full flex flex-col gap-6 mt-auto transition-all duration-500`}>
                  
                  <div className="pb-6 border-b border-white/[0.05] mb-4 flex flex-col items-start mt-8">
                    <div className="w-16 h-16 rounded-3xl border flex items-center justify-center mb-6 shadow-lg" style={{ backgroundColor: `${currentChannelData?.color}10`, borderColor: `${currentChannelData?.color}30`, boxShadow: `0 0 30px ${currentChannelData?.color}20` }}>
                      {currentChannelData && <currentChannelData.icon size={32} style={{ color: currentChannelData.color }} />}
                    </div>
                    <h1 className="text-3xl font-bold tracking-tighter mb-2" style={{ color: currentChannelData?.color, textShadow: `0 0 20px ${currentChannelData?.color}40` }}>Witaj na {currentChannelData?.name || 'pustym serwerze'}!</h1>
                    <p className="text-zinc-500 text-sm">Prywatna instancja Flux_. Tutaj pomysły płyną szybciej.</p>
                  </div>

                  {messages.map((msg, idx, arr) => {
                    const showHeader = idx === 0 || arr[idx - 1].userId !== msg.userId;
                    const user = getUser(msg.userId);
                    const role = getRole(user.roleId);
                    const isAI = msg.userId === 'flux_ai';
                    
                    return (
                      <div 
                        key={msg.id} 
                        onContextMenu={(e) => handleContextMenu(e, 'message', msg)}
                        className={`group flex gap-4 hover:bg-white/[0.02] -mx-4 px-4 py-3 rounded-xl transition-colors relative ${activeThread?.id === msg.id ? 'bg-white/[0.04] border border-white/[0.05]' : 'border border-transparent'}`}
                      >
                        <div className="w-10 shrink-0 flex justify-center mt-1">
                          {showHeader ? (
                            <div 
                              onContextMenu={(e) => { if(!isAI) handleContextMenu(e, 'user', user); }}
                              className={`w-10 h-10 rounded-xl border flex items-center justify-center font-bold text-sm shadow-inner overflow-hidden transition-opacity ${!isAI ? 'cursor-pointer hover:opacity-80' : ''} ${isAI ? 'bg-[#00eeff]/20 border-[#00eeff]/50 text-[#00eeff]' : 'bg-black border-white/[0.08] text-zinc-300'}`}
                            >
                              {isAI ? <Sparkles size={18}/> : user.name.charAt(0)}
                            </div>
                          ) : (
                            <div className="w-10 text-[9px] text-zinc-600 opacity-0 group-hover:opacity-100 text-center leading-[24px]">{msg.time}</div>
                          )}
                        </div>

                        <div className="flex-1 flex flex-col min-w-0">
                          {showHeader && (
                            <div className="flex items-baseline gap-2 mb-1.5">
                              <span 
                                onContextMenu={(e) => { if(!isAI) handleContextMenu(e, 'user', user); }}
                                className={`font-semibold text-[14px] tracking-wide ${!isAI ? 'cursor-pointer hover:underline' : ''}`} 
                                style={{ color: isAI ? '#00eeff' : role.color, textShadow: isAI || role.glow !== 'none' ? `0 0 15px ${isAI ? '#00eeff' : role.color}60` : 'none' }}
                              >
                                {user.name}
                              </span>
                              {!isAI && role.id !== 'r4' && (
                                <div className="flex items-center gap-1.5 px-1.5 py-[2px] rounded text-[9px] font-bold uppercase tracking-wider border shadow-sm backdrop-blur-sm" style={{ backgroundColor: role.bg, borderColor: role.border, color: role.color, boxShadow: role.glow !== 'none' ? `0 0 8px ${role.bg}` : 'none' }}>
                                  <role.icon size={10} strokeWidth={2.5} /><span>{role.name}</span>
                                </div>
                              )}
                              <span className="text-[10px] text-zinc-600 font-medium ml-1">{msg.time}</span>
                            </div>
                          )}
                          
                          <div className={`text-[15px] leading-relaxed ${isAI ? 'text-[#00eeff] font-medium' : 'text-zinc-300'}`}>
                            {renderMessageContent(msg.content)}
                          </div>

                          {msg.reactions && msg.reactions.length > 0 && (
                            <div className="flex items-center gap-1.5 mt-3">
                              {msg.reactions.map((r, i) => (
                                <button key={i} className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium border transition-colors ${r.userReacted ? 'bg-[#00eeff]/10 border-[#00eeff]/30 text-[#00eeff] shadow-[0_0_10px_rgba(0,238,255,0.1)]' : 'bg-white/[0.02] border-white/[0.05] text-zinc-400 hover:bg-white/[0.05]'}`}>
                                  <span>{r.emoji}</span><span>{r.count}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* MESSAGE ACTIONS */}
                        <div className="absolute right-4 top-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 bg-black/80 backdrop-blur-md border border-white/[0.1] rounded-lg p-1 shadow-xl">
                          <button className="p-1.5 text-zinc-400 hover:text-amber-400 hover:bg-amber-400/10 rounded-md transition-all" title="Zareaguj"><Smile size={14} /></button>
                          <button onClick={() => setCreateTaskModal({ isOpen: true, sourceMsg: msg })} className="p-1.5 text-zinc-400 hover:text-[#00eeff] hover:bg-[#00eeff]/20 rounded-md transition-all" title="Utwórz zadanie z wiadomości"><ListTodo size={14} /></button>
                          <button onClick={() => openThread(msg)} className="p-1.5 text-zinc-400 hover:text-white hover:bg-white/[0.1] rounded-md transition-all" title="Otwórz wątek"><MessageSquareShare size={14} /></button>
                          {msg.isMe && (
                            <>
                              <div className="w-[1px] h-3 bg-white/[0.1] mx-1"></div>
                              <button className="p-1.5 text-zinc-400 hover:text-blue-400 hover:bg-blue-400/10 rounded-md transition-all" title="Edytuj"><Edit2 size={14} /></button>
                              <button onClick={() => deleteMessage(msg.id as string)} className="p-1.5 text-zinc-400 hover:text-red-500 hover:bg-red-500/10 rounded-md transition-all" title="Usuń"><Trash2 size={14} /></button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  
                  {/* AI LOADING INDICATOR */}
                  {isAILoading && (
                    <div className="flex gap-4 -mx-4 px-4 py-3 items-center animate-in fade-in duration-300">
                      <div className="w-10 h-10 shrink-0 rounded-xl bg-[#00eeff]/10 border border-[#00eeff]/30 flex items-center justify-center text-[#00eeff] shadow-[0_0_15px_rgba(0,238,255,0.2)]">
                        <Sparkles size={18} className="animate-pulse" />
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-1.5 h-1.5 bg-[#00eeff] rounded-full loader-dot"></div>
                        <div className="w-1.5 h-1.5 bg-[#00eeff] rounded-full loader-dot"></div>
                        <div className="w-1.5 h-1.5 bg-[#00eeff] rounded-full loader-dot"></div>
                        <span className="ml-3 text-sm text-[#00eeff]/70 font-medium">Flux AI analizuje...</span>
                      </div>
                    </div>
                  )}

                  <div ref={messagesEndRef} className="h-4" />
                </div>
              </div>

              {/* INPUT CZATU */}
              <div className="absolute bottom-6 left-0 right-0 px-6 flex justify-center pointer-events-none z-20">
                <div className={`w-full ${isZenMode ? 'max-w-3xl' : 'max-w-4xl'} pointer-events-auto transition-all duration-500`}>
                  <div className={`bg-[#111111]/95 backdrop-blur-3xl border ${isInputFocused || isAIPromptOpen ? 'border-white/[0.2] bg-[#151515] shadow-[0_20px_60px_-15px_rgba(0,238,255,0.1)]' : 'border-white/[0.1] shadow-[0_20px_60px_-15px_rgba(0,0,0,1)]'} rounded-3xl p-1.5 flex flex-col transition-all overflow-hidden`}>
                    
                    {isAIPromptOpen && (
                      <div className="px-4 py-3 bg-[#00eeff]/5 border-b border-[#00eeff]/20 flex items-center gap-3 animate-in slide-in-from-top-2 fade-in duration-200">
                        <Sparkles size={18} className="text-[#00eeff] animate-pulse" />
                        <input autoFocus value={inputValue} onChange={(e) => setInputValue(e.target.value)} onKeyDown={handleKeyDown} placeholder="Poproś Flux AI o pomoc, podsumowanie lub kod..." className="flex-1 bg-transparent text-sm font-medium text-[#00eeff] outline-none placeholder-[#00eeff]/50" />
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
                          <button onClick={() => setIsAIPromptOpen(true)} className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[#00eeff]/10 text-[#00eeff] hover:bg-[#00eeff]/20 text-[10px] font-bold uppercase tracking-widest transition-colors"><Sparkles size={10} /> FLUX AI</button>
                        </div>
                      </div>
                    )}

                    <div className={`flex items-end w-full ${isAIPromptOpen ? 'hidden' : ''}`}>
                      <button onClick={handleAttachClick} className="h-10 w-10 shrink-0 m-1 rounded-2xl bg-white/[0.05] hover:bg-white/[0.1] flex items-center justify-center text-zinc-400 hover:text-[#00eeff] transition-colors"><Plus size={18} /></button>
                      <textarea ref={textareaRef} value={inputValue} onChange={(e) => setInputValue(e.target.value)} onKeyDown={handleKeyDown} onFocus={() => setIsInputFocused(true)} onBlur={() => setIsInputFocused(false)} placeholder={isZenMode ? "Zanurz się w strumieniu..." : `Napisz wiadomość na ${currentChannelData?.name || 'tym kanale'}...`} className="flex-1 bg-transparent text-zinc-100 placeholder-zinc-600 px-3 py-3.5 outline-none resize-none text-[15px] tracking-tight leading-relaxed custom-scrollbar" rows={1} disabled={!currentChannelData} />
                      <button onClick={handleSendMessage} className={`h-10 w-10 shrink-0 m-1 rounded-2xl flex items-center justify-center transition-all duration-300 ${inputValue.trim() ? 'bg-[#00eeff] text-black shadow-[0_0_20px_rgba(0,238,255,0.4)] scale-100' : 'bg-transparent text-zinc-600 scale-90'}`} disabled={!inputValue.trim()}>
                        <ArrowUpRight size={18} className={inputValue.trim() ? "translate-x-[1px] -translate-y-[1px]" : ""} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* PIP Głosowy, gdy jesteś na innym kanale */}
          {activeVoiceChannel && activeVoiceChannel !== activeChannel && (
            <div className="absolute bottom-32 right-8 w-80 max-w-[calc(100vw-2rem)] bg-[#111111]/95 backdrop-blur-3xl border border-[#00eeff]/20 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.8)] z-40 overflow-hidden animate-in slide-in-from-bottom-6 fade-in duration-300">
              {(() => {
                const voiceChan = channels.find((c) => c.id === activeVoiceChannel);
                if (!voiceChan) return null;
                const dotClass = voicePhase === 'connected' ? 'bg-[#00eeff] shadow-[0_0_8px_#00eeff]' : voicePhase === 'error' ? 'bg-red-500' : 'bg-amber-400 animate-pulse';
                return (
                  <>
                    <div className="px-4 py-3 border-b border-white/[0.05] flex items-center justify-between bg-white/[0.02] gap-2 cursor-pointer hover:bg-[#00eeff]/5 transition-colors" onClick={() => setActiveChannel(voiceChan.id)}>
                      <div className="flex items-center gap-2 min-w-0">
                        <div className={`w-2 h-2 rounded-full shrink-0 ${dotClass}`} />
                        <span className="text-xs font-semibold tracking-wide truncate" style={{ color: voiceChan.color }}>{voiceChan.name}</span>
                      </div>
                      <span className="text-[10px] text-[#00eeff] font-bold uppercase tracking-widest shrink-0 hover:underline">Wróć na grid</span>
                    </div>
                    <div className="px-4 py-3 bg-black/40 flex items-center justify-center gap-3">
                      <button onClick={() => setLocalMuted(!localMuted)} className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors border ${localMuted ? 'bg-red-500/15 text-red-400 border-red-500/35' : 'bg-white/[0.05] text-zinc-200 border-white/[0.08] hover:bg-white/[0.1]'}`}>
                        {localMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                      </button>
                      <button onClick={disconnectVoice} className="w-10 h-10 rounded-full bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/30 flex items-center justify-center transition-colors shadow-[0_0_15px_rgba(239,68,68,0.2)]"><PhoneOff size={16} /></button>
                    </div>
                  </>
                );
              })()}
            </div>
          )}
        </main>

        {/* --- 4. INTELIGENTNY PRAWY PANEL (WĄTKI, ZADANIA, PLIKI) --- */}
        {!isZenMode && (rightPanelTab || activeThread) && (
          <aside className="w-[320px] bg-[#080808]/80 backdrop-blur-xl border-l border-white/[0.04] flex flex-col shrink-0 z-20 transition-all duration-300 shadow-2xl">
            
            {activeThread ? (
              // WIDOK WĄTKU
              <>
                <div className="h-16 border-b border-white/[0.04] flex items-center justify-between px-5 bg-black/20">
                  <div className="flex items-center gap-2"><MessageSquareShare size={16} className="text-[#00eeff]" /><span className="text-sm font-semibold tracking-wide text-white">Wątek Flux</span></div>
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
                  <div className="flex flex-col items-center justify-center p-8 opacity-50">
                     <MessageSquare size={32} className="text-zinc-600 mb-2"/>
                     <span className="text-xs text-zinc-500">Brak odpowiedzi w wątku</span>
                  </div>
                </div>
                <div className="p-4 bg-black/40 border-t border-white/[0.04]">
                  <div className="bg-[#111] border border-white/[0.1] rounded-2xl p-1 flex items-end transition-all focus-within:border-[#00eeff]/50">
                    <textarea value={threadInputValue} onChange={(e) => setThreadInputValue(e.target.value)} placeholder="Odpowiedz w wątku..." className="flex-1 bg-transparent text-zinc-200 placeholder-zinc-600 px-3 py-2.5 outline-none resize-none text-[13px] tracking-tight custom-scrollbar" rows={1} />
                    <button className={`h-8 w-8 shrink-0 m-1 rounded-xl flex items-center justify-center transition-all ${threadInputValue.trim() ? 'bg-[#00eeff] text-black shadow-[0_0_10px_rgba(0,238,255,0.3)]' : 'bg-transparent text-zinc-600'}`}>
                      <Send size={14} className={threadInputValue.trim() ? "translate-x-[1px] -translate-y-[1px]" : ""} />
                    </button>
                  </div>
                </div>
              </>
            ) : (
              // WIDOK ZAKŁADEK
              <>
                <div className="h-16 border-b border-white/[0.04] flex items-end px-4 gap-4 bg-black/20">
                  <button onClick={() => setRightPanelTab('members')} className={`pb-3 text-sm font-medium transition-colors relative ${rightPanelTab === 'members' ? 'text-[#00eeff]' : 'text-zinc-500 hover:text-zinc-300'}`}>Członkowie{rightPanelTab === 'members' && <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#00eeff] rounded-t-full shadow-[0_0_10px_rgba(0,238,255,0.5)]"></div>}</button>
                  <button onClick={() => setRightPanelTab('files')} className={`pb-3 text-sm font-medium transition-colors relative ${rightPanelTab === 'files' ? 'text-[#00eeff]' : 'text-zinc-500 hover:text-zinc-300'}`}>Pliki{rightPanelTab === 'files' && <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#00eeff] rounded-t-full shadow-[0_0_10px_rgba(0,238,255,0.5)]"></div>}</button>
                  <button onClick={() => setRightPanelTab('tasks')} className={`pb-3 text-sm font-medium transition-colors relative ${rightPanelTab === 'tasks' ? 'text-[#00eeff]' : 'text-zinc-500 hover:text-zinc-300'}`}>Zadania{rightPanelTab === 'tasks' && <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#00eeff] rounded-t-full shadow-[0_0_10px_rgba(0,238,255,0.5)]"></div>}</button>
                </div>
                
                <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col">
                  {/* CZŁONKOWIE */}
                  {rightPanelTab === 'members' && (
                    <div 
                      className="p-4 space-y-6 flex-1 min-h-full"
                      onContextMenu={(e) => handleContextMenu(e, 'membersArea', null)}
                    >
                      {mockRoles.map(role => {
                        const usersInRole = mockUsers.filter(u => u.roleId === role.id && u.status !== 'offline');
                        if (usersInRole.length === 0) return null;
                        return (
                          <div key={role.id}>
                            <div className="mb-2 mt-6 first:mt-0 flex items-center justify-between px-2.5 py-1.5 rounded-lg border relative overflow-hidden backdrop-blur-md" style={{ backgroundColor: role.bg, borderColor: role.border }}>
                              <div className="absolute left-0 top-0 bottom-0 w-[2px]" style={{ backgroundColor: role.color, boxShadow: role.glow }} />
                              <div className="flex items-center gap-2"><role.icon size={12} style={{ color: role.color }} strokeWidth={2.5} /><span className="text-[9px] uppercase tracking-[0.2em] font-bold" style={{ color: role.color, textShadow: role.glow !== 'none' ? `0 0 10px ${role.color}80` : 'none' }}>{role.name}</span></div>
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-black/60 border flex items-center justify-center min-w-[20px]" style={{ color: role.color, borderColor: role.border }}>{usersInRole.length}</span>
                            </div>
                            <div className="flex flex-col gap-0.5 mt-1.5">
                              {usersInRole.map(user => (
                                <div 
                                  key={user.id} 
                                  onContextMenu={(e) => handleContextMenu(e, 'user', user)}
                                  className="user-row flex items-center gap-3 px-2 py-1.5 rounded-lg cursor-pointer transition-all duration-300 border border-transparent" 
                                  style={{ '--hover-bg': role.bg, '--hover-border': role.border } as any}
                                >
                                  <div className="relative">
                                    <div className="w-8 h-8 rounded-xl bg-black border border-white/[0.08] flex items-center justify-center text-xs font-bold transition-all duration-300" style={{ color: role.color }}>{user.name.charAt(0)}</div>
                                    <div className={`absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-[#0a0a0c] ${user.status === 'online' ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]' : user.status === 'idle' ? 'bg-amber-400' : 'bg-red-500'}`}></div>
                                  </div>
                                  <span className="text-[13px] font-semibold truncate transition-all tracking-wide" style={{ color: role.color, textShadow: role.glow !== 'none' ? `0 0 12px ${role.color}40` : 'none' }}>{user.name}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* PLIKI */}
                  {rightPanelTab === 'files' && (
                    <div className="space-y-3 p-4 flex-1 min-h-full" onContextMenu={(e) => handleContextMenu(e, 'filesArea', null)}>
                      <div className="flex justify-between items-center px-1">
                        <span className="text-xs font-semibold text-zinc-400 uppercase tracking-widest">Wszystkie pliki</span>
                        <button className="text-[#00eeff] hover:bg-[#00eeff]/10 p-1.5 rounded-lg transition-colors"><Search size={14}/></button>
                      </div>
                      {files.map(file => {
                        const uploader = getUser(file.uploaderId);
                        return (
                          <div 
                            key={file.id} 
                            onContextMenu={(e) => handleContextMenu(e, 'file', file)}
                            className="p-3 rounded-xl border border-white/[0.05] bg-white/[0.01] flex items-start gap-3 hover:bg-white/[0.05] hover:border-white/[0.1] cursor-pointer transition-all group"
                          >
                            <div className="p-2.5 rounded-xl bg-white/[0.05] text-zinc-300 group-hover:text-[#00eeff] group-hover:bg-[#00eeff]/10 transition-colors">
                              {getFileIcon(file.type)}
                            </div>
                            <div className="flex flex-col flex-1 min-w-0">
                              <span className="text-[13px] font-semibold text-zinc-200 truncate group-hover:text-white transition-colors">{file.name}</span>
                              <div className="flex items-center gap-2 mt-1 text-[10px] text-zinc-500">
                                <span>{file.size}</span>
                                <span className="w-1 h-1 bg-zinc-700 rounded-full"></span>
                                <span className="truncate">{uploader.name}</span>
                              </div>
                            </div>
                            <button className="opacity-0 group-hover:opacity-100 p-1.5 text-zinc-400 hover:text-[#00eeff] transition-all"><Download size={14}/></button>
                          </div>
                        );
                      })}
                      {files.length === 0 && <div className="text-center text-zinc-600 text-sm mt-10">Brak udostępnionych plików.</div>}
                    </div>
                  )}

                  {/* ZADANIA */}
                  {rightPanelTab === 'tasks' && (
                    <div className="space-y-3 p-4 flex-1 min-h-full" onContextMenu={(e) => handleContextMenu(e, 'tasksArea', null)}>
                      <div className="flex justify-between items-center px-1">
                        <span className="text-xs font-semibold text-zinc-400 uppercase tracking-widest">Otwarty Backlog</span>
                        <button onClick={() => setCreateTaskModal({isOpen: true})} className="text-[#00eeff] hover:bg-[#00eeff]/10 p-1.5 rounded-lg transition-colors"><Plus size={14}/></button>
                      </div>
                      {tasks.map(task => {
                        const assignee = getUser(task.assigneeId);
                        return (
                          <div 
                            key={task.id} 
                            onClick={() => toggleTask(task.id)} 
                            onContextMenu={(e) => handleContextMenu(e, 'task', task)}
                            className={`p-3 rounded-xl border transition-all cursor-pointer group ${task.completed ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-white/[0.05] bg-white/[0.01] hover:border-[#00eeff]/40 hover:bg-[#00eeff]/5'}`}
                          >
                            <div className="flex items-start gap-3">
                              <div className="mt-0.5 shrink-0 transition-colors">
                                {task.completed ? <CheckSquare size={16} className="text-emerald-500"/> : <Square size={16} className="text-zinc-600 group-hover:text-[#00eeff]"/>}
                              </div>
                              <div className="flex flex-col flex-1 min-w-0">
                                <span className={`text-sm font-medium leading-tight mb-2 transition-colors ${task.completed ? 'text-emerald-500/70 line-through' : 'text-zinc-200 group-hover:text-white'}`}>{task.title}</span>
                                <div className="flex items-center gap-2 text-[10px]">
                                  {task.sourceMsgId && <span className="px-1.5 py-0.5 rounded bg-[#00eeff]/10 text-[#00eeff] font-semibold border border-[#00eeff]/20">Z czatu</span>}
                                  <span className="flex items-center gap-1 text-zinc-500 bg-white/[0.05] px-1.5 py-0.5 rounded border border-white/[0.05]"><User size={10}/> {assignee.name}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      {tasks.length === 0 && <div className="text-center text-zinc-600 text-sm mt-10">Brak aktywnych zadań. Jesteś czysty!</div>}
                    </div>
                  )}
                </div>
              </>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}