import React, { useState, useRef, useEffect, useMemo, useCallback, useReducer } from 'react';
import { useVoiceRoom } from './useVoiceRoom';
import { loadFluxLocalSettings, saveFluxLocalSettings } from './fluxLocalSettings';
import { resizeImageFileToDataUrl } from './resizeAvatarImage';
import { SettingsGlowDropdown } from './SettingsGlowDropdown';
import { useChatSocket, type ChatUserUpdatedPayload } from './useChatSocket';
import { NickLabel } from './nickAppearance';
import { buildNickGlowJson, NICK_FONT_STACKS } from './nickGlowPresets';
import { dmThreadKey, loadDmStore, saveDmStore, type DmRow } from './dmStorage';
import { iconFromKey } from './iconMap';
import { AuthGate } from './AuthGate';
import { 
  Send, Search, Plus, ArrowUpRight, Hash, Volume2, 
  Phone, Video, Users, UserPlus, Settings, Mic, 
  Headphones, MessageSquare, Compass, Shield,
  Crown, Terminal, Sparkles, Code, Coffee, Radio, Zap,
  ChevronsUpDown, Check, Maximize2, Minimize2, Bookmark,
  ListTodo, Bold, Italic, Code as CodeIcon, Link, FileText, Image as ImageIcon,
  Command as CmdIcon, User, Moon, LogOut, 
  X, MicOff, PhoneOff, Palette, BellRing, MessageSquareShare,
  UploadCloud, Copy, Smile, MonitorUp, Monitor, Trash2, Edit2, MoreVertical, CheckSquare, Square, Download, FileAudio, FileArchive, Eye, UserCheck, UserMinus, BellOff, LogIn, Server, Link2, CopyPlus, ChevronDown, FolderPlus, Pin, SlidersHorizontal, VolumeX, Wifi, MoreHorizontal, StickyNote, ExternalLink, Globe
} from 'lucide-react';

// ============================================================================
// --- 1. KONFIGURACJA API (GOTOWE DO PODPIĘCIA) ---
// ============================================================================

// VITE_API_URL=http://localhost:3000/api — pusty = tryb mock (lokalne placeholdery).
const API_BASE_URL = ((import.meta.env.VITE_API_URL as string | undefined) ?? '').replace(/\/$/, '');
const DEMO_MODE = !API_BASE_URL;

function appPublicOrigin(): string {
  const fromEnv = (import.meta.env.VITE_PUBLIC_ORIGIN as string | undefined)?.trim().replace(/\/$/, '');
  if (fromEnv) return fromEnv;
  if (API_BASE_URL) {
    try {
      return new URL(API_BASE_URL).origin;
    } catch {
      /* ignore */
    }
  }
  if (typeof window !== 'undefined') return window.location.origin;
  return '';
}

function readChannelsPath(): { sid: string; cid: string } | null {
  if (typeof window === 'undefined') return null;
  const path = (window.location.pathname || '/').replace(/\/$/, '') || '/';
  const m = path.match(/^\/channels\/([^/]+)\/([^/]+)$/i);
  if (!m?.[1] || !m?.[2]) return null;
  try {
    return { sid: decodeURIComponent(m[1]), cid: decodeURIComponent(m[2]) };
  } catch {
    return { sid: m[1], cid: m[2] };
  }
}

function writeChannelsPath(sid: string, cid: string) {
  if (typeof window === 'undefined' || !sid || !cid) return;
  const want = `/channels/${sid}/${cid}`;
  const cur = (window.location.pathname || '').replace(/\/$/, '') || '/';
  if (cur === want) return;
  window.history.replaceState({ devcord: 1 }, '', want);
}

function mediaStreamHasLiveVideo(ms: MediaStream | null | undefined): boolean {
  if (!ms) return false;
  return ms.getVideoTracks().some((t) => t.readyState === 'live');
}

/** Klucz do wymuszenia odmontowania `<video>` przy zmianie / zakończeniu ścieżek (unfreeze ostatniej klatki). */
function remoteLiveVideoKey(peerId: string, stream: MediaStream): string {
  const vt = stream.getVideoTracks();
  return `${peerId}:${vt.map((t) => `${t.id}:${t.readyState}`).join('|')}`;
}

/** Wyciąga kod / ID z pełnego URL lub surowego kodu zaproszenia. */
function parseJoinInput(raw: string): string {
  const t = raw.trim();
  const m = t.match(/\/(?:join|invite)\/([^/?#]+)/i);
  if (m?.[1]) {
    try {
      return decodeURIComponent(m[1].trim());
    } catch {
      return m[1].trim();
    }
  }
  return t;
}

const AUTH_TOKEN_KEY = 'devcord_token';
const AUTH_TOKEN_LEGACY = 'flux_token';
const PENDING_JOIN_KEY = 'devcord_pending_join';
const PENDING_JOIN_LEGACY = 'flux_pending_join';

function getStoredAuthToken(): string {
  if (typeof localStorage === 'undefined') return '';
  const n = localStorage.getItem(AUTH_TOKEN_KEY);
  if (n) return n;
  const o = localStorage.getItem(AUTH_TOKEN_LEGACY);
  if (o) {
    localStorage.setItem(AUTH_TOKEN_KEY, o);
    localStorage.removeItem(AUTH_TOKEN_LEGACY);
    return o;
  }
  return '';
}

function clearStoredAuthToken() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_TOKEN_LEGACY);
}

function peekPendingJoin(): string | null {
  if (typeof sessionStorage === 'undefined') return null;
  let v = sessionStorage.getItem(PENDING_JOIN_KEY);
  if (v) return v;
  const o = sessionStorage.getItem(PENDING_JOIN_LEGACY);
  if (o) {
    sessionStorage.setItem(PENDING_JOIN_KEY, o);
    sessionStorage.removeItem(PENDING_JOIN_LEGACY);
    return o;
  }
  return null;
}

function setPendingJoinCode(code: string) {
  sessionStorage.setItem(PENDING_JOIN_KEY, code);
}

function takePendingJoinCode(): string | null {
  const v = peekPendingJoin();
  if (v) {
    sessionStorage.removeItem(PENDING_JOIN_KEY);
    sessionStorage.removeItem(PENDING_JOIN_LEGACY);
  }
  return v;
}

const apiClient = async (endpoint: string, method: string = 'GET', body?: unknown) => {
  if (!API_BASE_URL) {
    return new Promise((resolve) => setTimeout(() => resolve(null), 100));
  }
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  const token = getStoredAuthToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (response.status === 204) return null;
  if (!response.ok) {
    let serverMsg = '';
    try {
      const ect = response.headers.get('content-type');
      if (ect?.includes('application/json')) {
        const j = (await response.json()) as { error?: string };
        if (j?.error) serverMsg = j.error;
      }
    } catch {
      /* ignore */
    }
    const err = new Error(serverMsg || `HTTP ${response.status}`) as Error & { status: number };
    err.status = response.status;
    throw err;
  }
  const ct = response.headers.get('content-type');
  if (ct?.includes('application/json')) return response.json();
  return null;
};

// ============================================================================
// --- TYPY DANYCH BAZY DANYCH ---
// ============================================================================
type UserInfo = { id: string; name: string; roleId: string; status: 'online' | 'idle' | 'dnd' | 'offline'; avatarUrl?: string; nickColor?: string; nickGlow?: string };
type Category = { id: string; name: string; isExpanded: boolean; serverId: string };
type Channel = { id: string; name: string; type: 'text' | 'voice'; color: string; icon: React.ElementType; unread?: boolean; categoryId?: string; serverId: string };
type ChatRow = { id: string; userId: string; time: string; content: string; isMe?: boolean; isEdited?: boolean; reactions?: { emoji: string; count: number; userReacted: boolean }[] };
type TaskItem = { id: string; title: string; assigneeId: string; completed: boolean; sourceMsgId?: string };
type FileItem = { id: string; name: string; size: string; type: 'image' | 'doc' | 'audio' | 'archive'; uploaderId: string; date: string };
type ContextMenuType = 'channel'|'category'|'user'|'file'|'task'|'server'|'message'|'workspace'|'filesArea'|'tasksArea'|'chatArea'|'membersArea'|'general';

// --- MOCK DATA INICJALIZACYJNE ---
const initialServers = [
  { id: 's1', name: 'Devcord_', icon: Zap, active: true, color: '#00eeff', glow: '0 0 15px rgba(0,238,255,0.4)' },
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
  { id: 'r1', name: 'Zarząd Devcord_', color: '#00eeff', bg: 'rgba(0, 238, 255, 0.08)', border: 'rgba(0, 238, 255, 0.25)', icon: Crown, glow: '0 0 12px rgba(0,238,255,0.4)' },
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
  const k = 'devcord_guest_id';
  const leg = 'flux_guest_id';
  let id = sessionStorage.getItem(k);
  if (!id) {
    const o = sessionStorage.getItem(leg);
    if (o) {
      sessionStorage.setItem(k, o);
      sessionStorage.removeItem(leg);
      id = o;
    }
  }
  if (!id) {
    id = 'u1';
    sessionStorage.setItem(k, id);
  }
  return id;
}

// --- HOOKS ---
function useVoiceRoomMock({ enabled, roomId, userId }: { enabled: boolean, roomId: string | null, userId: string, micDeviceId: string }) {
  const [localMuted, setLocalMuted] = useState(false);
  const [localDeafened, setLocalDeafened] = useState(false);
  const [participants, setParticipants] = useState<string[]>([]);
  const [phase, setPhase] = useState('disconnected');

  useEffect(() => {
    if (enabled && roomId) {
      setPhase('connecting_signaling');
      const timer = setTimeout(() => {
        setPhase('connected');
        if (roomId === 'v1') setParticipants(['u2', 'u3', userId]);
        else setParticipants([userId]);
      }, 800);
      return () => clearTimeout(timer);
    } else {
      setPhase('disconnected');
      setParticipants([]);
    }
  }, [enabled, roomId, userId]);

  return {
    phase,
    error: null,
    participants,
    localMuted,
    setLocalMuted,
    localDeafened,
    setLocalDeafened,
    speakingPeers: {} as Record<string, boolean>,
    remoteScreenByUser: {} as Record<string, MediaStream>,
    remoteVoiceState: {} as Record<string, { muted: boolean; deafened: boolean }>,
    setUserVolume: () => {},
    setUserOutputMuted: () => {},
  };
}

function useVoiceRoomMaybe(opts: {
  apiMode: boolean;
  enabled: boolean;
  roomId: string | null;
  userId: string;
  micDeviceId: string;
  screenStream: MediaStream | null;
  cameraStream: MediaStream | null;
  screenBitrate?: number;
  micSoftwareGate: boolean;
  micGateThresholdDb: number;
}) {
  const real = useVoiceRoom({
    enabled: opts.apiMode && opts.enabled,
    roomId: opts.roomId,
    userId: opts.userId,
    micDeviceId: opts.micDeviceId,
    screenStream: opts.screenStream,
    cameraStream: opts.cameraStream,
    screenBitrate: opts.screenBitrate,
    micSoftwareGate: opts.micSoftwareGate,
    micGateThresholdDb: opts.micGateThresholdDb,
  });
  const mock = useVoiceRoomMock({
    enabled: !opts.apiMode && opts.enabled,
    roomId: opts.roomId,
    userId: opts.userId,
    micDeviceId: opts.micDeviceId,
  });
  if (opts.apiMode) return real;
  return mock;
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
    ctx.fillText('SYMULACJA EKRANU DEVCORD_', canvas.width / 2, canvas.height / 2 - 30);
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

const VideoPlayer = ({
  stream,
  isLocal,
  className,
  volume = 1,
  muted: mutedOverride,
  onContextMenu,
}: {
  stream: MediaStream | null;
  isLocal?: boolean;
  className?: string;
  volume?: number;
  muted?: boolean;
  onContextMenu?: (e: React.MouseEvent<HTMLVideoElement>) => void;
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (!stream) {
      v.srcObject = null;
      return;
    }
    v.srcObject = stream;

    const trackCleanups: Array<() => void> = [];

    const clearIfNoLiveVideo = () => {
      if (!mediaStreamHasLiveVideo(stream)) {
        v.srcObject = null;
      }
    };

    const wireVideoTrack = (t: MediaStreamTrack) => {
      if (t.kind !== 'video') return;
      const fn = () => clearIfNoLiveVideo();
      t.addEventListener('ended', fn);
      t.addEventListener('mute', fn);
      trackCleanups.push(() => {
        t.removeEventListener('ended', fn);
        t.removeEventListener('mute', fn);
      });
    };

    const wireAllVideoTracks = () => {
      while (trackCleanups.length) {
        const c = trackCleanups.pop();
        c?.();
      }
      for (const t of stream.getVideoTracks()) {
        wireVideoTrack(t);
      }
    };

    wireAllVideoTracks();

    const onStreamTrackChange = () => {
      wireAllVideoTracks();
      clearIfNoLiveVideo();
    };

    stream.addEventListener('addtrack', onStreamTrackChange);
    stream.addEventListener('removetrack', onStreamTrackChange);

    return () => {
      stream.removeEventListener('addtrack', onStreamTrackChange);
      stream.removeEventListener('removetrack', onStreamTrackChange);
      while (trackCleanups.length) {
        trackCleanups.pop()?.();
      }
    };
  }, [stream]);
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !stream) return;
    if (isLocal) {
      v.muted = true;
      return;
    }
    v.volume = Math.min(1, Math.max(0, volume));
    v.muted = mutedOverride ?? false;
  }, [volume, mutedOverride, isLocal, stream]);
  if (!stream) return null;
  const muted = isLocal ? true : (mutedOverride ?? false);
  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted={muted}
      className={`object-cover ${className}`}
      onContextMenu={onContextMenu}
    />
  );
};

function voiceVolumeUiLabel(linearGain: number): string {
  const pct = Math.round(linearGain * 100);
  if (linearGain <= 1.001) return `${pct}% — poziom bazowy`;
  return `${pct}% — boost (+${pct - 100}%)`;
}

/** Spójny avatar (lub inicjał) wszędzie w UI — `className` ustawia rozmiar i np. rounded-full. */
function UserAvatarBubble({
  user,
  className = 'w-8 h-8',
}: {
  user: Pick<UserInfo, 'name' | 'avatarUrl'>;
  className?: string;
}) {
  if (user.avatarUrl?.trim()) {
    return (
      <img
        src={user.avatarUrl}
        alt=""
        className={`${className} object-cover border border-white/[0.08] shrink-0 bg-black`}
      />
    );
  }
  return (
    <div
      className={`${className} bg-zinc-800 border border-white/[0.08] flex items-center justify-center text-[10px] font-bold text-white shrink-0 overflow-hidden`}
    >
      {user.name.charAt(0)}
    </div>
  );
}

// ============================================================================
// --- GŁÓWNY KOMPONENT APLIKACJI ---
// ============================================================================
export default function App() {
  const fluxSeed = useMemo(() => loadFluxLocalSettings(), []);

  // Stany Danych — przy podłączonym API startujemy pusto (bez s1/c1), żeby nie strzelać w nieistniejące ID.
  const [servers, setServers] = useState(() => (DEMO_MODE ? initialServers : []));
  const [categories, setCategories] = useState<Category[]>(() => (DEMO_MODE ? initialCategories : []));
  const [channels, setChannels] = useState<Channel[]>(() => (DEMO_MODE ? initialChannels : []));
  const [tasks, setTasks] = useState<TaskItem[]>(() => (DEMO_MODE ? initialTasks : []));
  const [files, setFiles] = useState<FileItem[]>(() => (DEMO_MODE ? initialFiles : []));
  const [messagesByChannel, setMessagesByChannel] = useState<Record<string, ChatRow[]>>(() =>
    DEMO_MODE
      ? {
          c1: [
            { id: 'm1', userId: 'u2', time: '10:00', content: 'Siema, widzieliście nowe makiety od Ani?' },
            {
              id: 'm2',
              userId: 'u3',
              time: '10:05',
              content: 'Wrzuciłam je do zakładki pliki 🚀',
              reactions: [{ emoji: '🔥', count: 2, userReacted: true }],
            },
          ],
        }
      : ({} as Record<string, ChatRow[]>),
  );

  // Stany Nawigacji
  const [activeServer, setActiveServer] = useState(() => (DEMO_MODE ? 's1' : ''));
  const [isWorkspaceDropdownOpen, setIsWorkspaceDropdownOpen] = useState(false);
  const [activeChannel, setActiveChannel] = useState(() => (DEMO_MODE ? 'c1' : ''));
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
  const [settingsTab, setSettingsTab] = useState<'profile' | 'account' | 'appearance' | 'audio'>('profile');
  const [localUserName, setLocalUserName] = useState(() => (DEMO_MODE ? 'Admin' : 'Użytkownik'));
  const [localUserAvatar, setLocalUserAvatar] = useState('');
  const [localUserColor, setLocalUserColor] = useState('#00eeff');
  const [localUserGlow, setLocalUserGlow] = useState('none');
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [settingsSuccess, setSettingsSuccess] = useState('');
  const [settingsError, setSettingsError] = useState('');
  const [localTheme, setLocalTheme] = useState<'dark' | 'light'>(() =>
    fluxSeed.appearance.theme === 'light' ? 'light' : 'dark',
  );
  const [sessionEmail, setSessionEmail] = useState('');
  const [accountPwdOpen, setAccountPwdOpen] = useState(false);
  const [pwdOld, setPwdOld] = useState('');
  const [pwdNew, setPwdNew] = useState('');
  const [pwdConfirm, setPwdConfirm] = useState('');
  const [pwdBusy, setPwdBusy] = useState(false);
  const [pwdErr, setPwdErr] = useState('');
  const [pwdOk, setPwdOk] = useState('');
  
  // Modale (Kanały/Serwery/Kategorie/Zadania)
  const [createServerModal, setCreateServerModal] = useState<'create' | 'join' | null>(null);
  const [newServerName, setNewServerName] = useState('');
  const [joinServerCode, setJoinServerCode] = useState('');
  const [joinModalErr, setJoinModalErr] = useState('');
  const [deepJoinToken, setDeepJoinToken] = useState<string | null>(null);
  const [inviteModal, setInviteModal] = useState<{ id: string; name: string } | null>(null);
  const [inviteListRows, setInviteListRows] = useState<
    Array<{ id: string; code: string; usesCount: number; maxUses?: number | null; expiresAt?: string | null; createdAt: string }>
  >([]);
  const [inviteFormMaxUses, setInviteFormMaxUses] = useState('');
  const [inviteFormDays, setInviteFormDays] = useState<'0' | '1' | '7' | '30'>('0');
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteCreateErr, setInviteCreateErr] = useState('');
  const [inviteCreatedUrl, setInviteCreatedUrl] = useState<string | null>(null);

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
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [remoteScreenWatching, setRemoteScreenWatching] = useState(false);
  const [maximizedScreenId, setMaximizedScreenId] = useState<string | null>(null);
  const [remoteScreenVolume, setRemoteScreenVolume] = useState(1);
  const [remoteScreenVideoMuted, setRemoteScreenVideoMuted] = useState(false);
  const [screenStreamContext, setScreenStreamContext] = useState<{ x: number; y: number } | null>(null);
  const [micDeviceId, setMicDeviceId] = useState(fluxSeed.audio.micDeviceId);
  const [micSoftwareGate, setMicSoftwareGate] = useState(fluxSeed.audio.micSoftwareGate);
  const [micGateThresholdDb, setMicGateThresholdDb] = useState(fluxSeed.audio.micGateThresholdDb);
  const [screenFps, setScreenFps] = useState(fluxSeed.screen.fps);
  const [screenRes, setScreenRes] = useState(fluxSeed.screen.res);
  const [userVolumes, setUserVolumes] = useState<Record<string, number>>(() => ({ ...fluxSeed.userVoiceGain }));
  const [userOutputMuted, setUserOutputMutedMap] = useState<Record<string, boolean>>(() => ({ ...fluxSeed.userOutputMuted }));

  const [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([]);
  const [voicePeersByChannel, setVoicePeersByChannel] = useState<Record<string, string[]>>({});
  const [voiceMixPanelOpen, setVoiceMixPanelOpen] = useState(false);

  const [dmPeerId, setDmPeerId] = useState<string | null>(null);
  const [dmInputValue, setDmInputValue] = useState('');
  const [dmMessagesByThread, setDmMessagesByThread] = useState<Record<string, DmRow[]>>(() => loadDmStore());
  const [profileCardUser, setProfileCardUser] = useState<UserInfo | null>(null);
  const [profileCardNote, setProfileCardNote] = useState('');
  const [pvCall, setPvCall] = useState<{ peerId: string; status: 'ringing' | 'connected' } | null>(null);
  const remoteScreenHostRef = useRef<HTMLDivElement | null>(null);

  const [nickStudioFx, setNickStudioFx] = useState<'gradient' | 'gradient_neon' | 'neon_pulse' | 'shimmer' | 'double_outline'>(
    'gradient_neon',
  );
  const [nickStudioG1, setNickStudioG1] = useState('#00eeff');
  const [nickStudioG2, setNickStudioG2] = useState('#ff00aa');
  const [nickStudioFontId, setNickStudioFontId] = useState('outfit');

  useEffect(() => {
    saveDmStore(dmMessagesByThread);
  }, [dmMessagesByThread]);

  useEffect(() => {
    if (!profileCardUser) {
      setProfileCardNote('');
      return;
    }
    try {
      setProfileCardNote(localStorage.getItem(`devcord_profile_note_${profileCardUser.id}`) ?? '');
    } catch {
      setProfileCardNote('');
    }
  }, [profileCardUser]);

  useEffect(() => {
    if (activeServer !== '') setDmPeerId(null);
  }, [activeServer]);

  useEffect(() => {
    saveFluxLocalSettings({
      version: 1,
      audio: {
        micDeviceId,
        micSoftwareGate,
        micGateThresholdDb,
      },
      screen: { fps: screenFps, res: screenRes },
      userVoiceGain: userVolumes,
      userOutputMuted,
      appearance: { theme: localTheme },
    });
  }, [micDeviceId, micSoftwareGate, micGateThresholdDb, screenFps, screenRes, userVolumes, userOutputMuted, localTheme]);

  useEffect(() => {
    if (!screenStream) return;
    screenStream.getVideoTracks().forEach(track => {
      track.applyConstraints({ frameRate: { max: screenFps }, height: { max: screenRes } }).catch(console.error);
    });
  }, [screenStream, screenFps, screenRes]);

  const [fluxToken, setFluxToken] = useState(() => getStoredAuthToken());
  const [meUserId, setMeUserId] = useState('');
  type PanelRole = (typeof mockRoles)[number];
  const [workspaceRoles, setWorkspaceRoles] = useState<PanelRole[]>(() => (DEMO_MODE ? [...mockRoles] : []));
  const [workspaceMembers, setWorkspaceMembers] = useState<UserInfo[]>(() => (DEMO_MODE ? [...mockUsers] : []));
  const [typingUsers, setTypingUsers] = useState<Record<string, boolean>>({});
  const [authMode, setAuthMode] = useState<'login' | 'register' | 'verify'>('login');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authNick, setAuthNick] = useState('');
  const [authCode, setAuthCode] = useState('');
  const [authErr, setAuthErr] = useState('');

  // Referencje
  const guestIdRef = useRef(guestSessionId());
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const settingsAvatarFileRef = useRef<HTMLInputElement | null>(null);
  const initialNavSyncedRef = useRef(false);

  // Filtrowanie pod aktywny serwer
  const currentServerCategories = useMemo(() => categories.filter(c => c.serverId === activeServer), [categories, activeServer]);
  const currentServerChannels = useMemo(() => channels.filter(c => c.serverId === activeServer), [channels, activeServer]);
  const currentChannelMeta = useMemo(
    () => currentServerChannels.find((c) => c.id === activeChannel),
    [currentServerChannels, activeChannel],
  );
  const currentChannelData = currentChannelMeta ?? currentServerChannels[0];

  useEffect(() => {
    if (currentServerChannels.length > 0 && !currentServerChannels.find(c => c.id === activeChannel)) {
      const firstTextChannel = currentServerChannels.find(c => c.type === 'text') || currentServerChannels[0];
      setActiveChannel(firstTextChannel.id);
    }
  }, [activeServer, currentServerChannels, activeChannel]);

  useEffect(() => {
    if (!fluxToken) initialNavSyncedRef.current = false;
  }, [fluxToken]);

  useEffect(() => {
    if (DEMO_MODE || !API_BASE_URL || !fluxToken) return;
    if (servers.length === 0 || channels.length === 0) return;
    if (initialNavSyncedRef.current) return;
    const p = readChannelsPath();
    if (!p) {
      initialNavSyncedRef.current = true;
      return;
    }
    if (servers.some((s) => s.id === p.sid) && channels.some((c) => c.id === p.cid && c.serverId === p.sid)) {
      setActiveServer(p.sid);
      setActiveChannel(p.cid);
    }
    initialNavSyncedRef.current = true;
  }, [servers, channels, fluxToken]);

  useEffect(() => {
    if (DEMO_MODE || !API_BASE_URL || !fluxToken) return;
    if (!activeServer || !activeChannel) return;
    const path = window.location.pathname || '';
    if (/^\/(invite|join)\//i.test(path)) return;
    writeChannelsPath(activeServer, activeChannel);
  }, [activeServer, activeChannel, fluxToken]);

  useEffect(() => {
    if (DEMO_MODE || !API_BASE_URL || !fluxToken) return;
    const handler = () => {
      const p = readChannelsPath();
      if (p && servers.some((s) => s.id === p.sid) && channels.some((c) => c.id === p.cid && c.serverId === p.sid)) {
        setActiveServer(p.sid);
        setActiveChannel(p.cid);
      }
    };
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, [fluxToken, servers, channels]);

  useEffect(() => {
    if (!DEMO_MODE || !activeServer || !activeChannel) return;
    writeChannelsPath(activeServer, activeChannel);
  }, [activeServer, activeChannel]);

  useEffect(() => {
    if (!API_BASE_URL || !fluxToken) {
      setMeUserId('');
      setSessionEmail('');
      return;
    }
    (async () => {
      try {
        const me = await apiClient('/auth/me');
        if (me && typeof me === 'object' && 'id' in me && (me as { id: string }).id) {
          setMeUserId((me as { id: string }).id);
          const em = (me as { email?: string }).email;
          if (typeof em === 'string') setSessionEmail(em);
          const dn = (me as { display_name?: string }).display_name;
          if (dn) setLocalUserName(dn);
          const av = (me as { avatar_url?: string }).avatar_url;
          if (av) setLocalUserAvatar(av);
          const nc = (me as { nick_color?: string }).nick_color;
          if (nc) setLocalUserColor(nc);
          const ng = (me as { nick_glow?: string }).nick_glow;
          if (ng != null && ng !== '') setLocalUserGlow(ng);
        }
      } catch {
        setMeUserId('');
      }
    })();
  }, [API_BASE_URL, fluxToken]);

  useEffect(() => {
    const path = window.location.pathname.replace(/\/$/, '') || '/';
    const m = path.match(/^\/(?:join|invite)\/([^/]+)$/i);
    if (!m?.[1]) return;
    if (!getStoredAuthToken()) {
      try {
        setPendingJoinCode(decodeURIComponent(m[1]));
      } catch {
        /* ignore */
      }
    }
  }, []);

  useEffect(() => {
    if (!API_BASE_URL || DEMO_MODE) {
      setDeepJoinToken(null);
      return;
    }
    if (!fluxToken) {
      setDeepJoinToken(null);
      return;
    }
    const path = window.location.pathname.replace(/\/$/, '') || '/';
    let token: string | null = null;
    const m = path.match(/^\/(?:join|invite)\/([^/]+)$/i);
    if (m?.[1]) token = decodeURIComponent(m[1]);
    if (!token) {
      try {
        token = takePendingJoinCode();
      } catch {
        /* ignore */
      }
    }
    if (token) {
      setJoinModalErr('');
      setDeepJoinToken(token);
    } else {
      setDeepJoinToken(null);
    }
  }, [API_BASE_URL, fluxToken]);

  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        if (!API_BASE_URL || !fluxToken) return;
        const [apiServers, apiCategories, apiChannels] = await Promise.all([
          apiClient('/servers'),
          apiClient('/categories'),
          apiClient('/channels'),
        ]);
        if (Array.isArray(apiServers)) {
          setServers(
            apiServers.map((s: { id: string; name: string; iconKey?: string; icon?: string; color?: string; glow?: string; active?: boolean; inviteCode?: string }) => ({
              ...s,
              icon: iconFromKey(s.iconKey ?? s.icon, Zap),
              active: s.active !== false,
              color: s.color ?? '#00eeff',
              glow: s.glow ?? '',
              inviteCode: s.inviteCode,
            })) as Array<(typeof initialServers)[number] & { inviteCode?: string }>,
          );
        }
        if (Array.isArray(apiCategories)) {
          setCategories(
            apiCategories.map((c: Category & { isExpanded?: boolean }) => ({
              ...c,
              isExpanded: c.isExpanded !== false,
            })),
          );
        }
        if (Array.isArray(apiChannels)) {
          setChannels(
            apiChannels.map((ch: Channel) => ({
              ...ch,
              icon: ch.type === 'voice' ? Radio : Hash,
            })),
          );
        }
      } catch (err) {
        console.error('Błąd ładowania inicjalnego API', err);
      }
    };
    void fetchInitialData();
  }, [API_BASE_URL, fluxToken]);

  useEffect(() => {
    if (!API_BASE_URL || !fluxToken) return;
    if (servers.length === 0) {
      setActiveServer('');
      setActiveChannel('');
      setTasks([]);
      setMessagesByChannel({});
      setWorkspaceRoles([]);
      setWorkspaceMembers([]);
      return;
    }
    if (!activeServer || !servers.some((s) => s.id === activeServer)) {
      setActiveServer(servers[0].id);
    }
  }, [API_BASE_URL, fluxToken, servers, activeServer]);

  useEffect(() => {
    if (!API_BASE_URL || !fluxToken || !activeServer) return;
    if (!servers.some((s) => s.id === activeServer)) return;
    (async () => {
      try {
        const rows = await apiClient(`/tasks?serverId=${activeServer}`);
        if (Array.isArray(rows)) setTasks(rows as TaskItem[]);
      } catch {
        /* ignore */
      }
    })();
  }, [API_BASE_URL, fluxToken, activeServer, servers]);

  useEffect(() => {
    if (!API_BASE_URL || !fluxToken || !activeServer) return;
    if (!servers.some((s) => s.id === activeServer)) return;
    let cancelled = false;
    const run = () => {
      if (cancelled || document.visibilityState === 'hidden') return;
      void (async () => {
        try {
          const data = await apiClient(`/members?serverId=${activeServer}`);
          if (cancelled || !data || typeof data !== 'object' || !('members' in data)) return;
          const d = data as {
            roles: Array<{ id: string; name: string; color: string; bg: string; border: string; glow: string; iconKey?: string }>;
            members: UserInfo[];
          };
          const mappedRoles = d.roles.map((r) => ({
            id: String(r.id ?? ''),
            name: r.name,
            color: r.color,
            bg: r.bg,
            border: r.border,
            glow: r.glow,
            icon: iconFromKey(r.iconKey, Users),
          }));
          const roleIdSet = new Set(mappedRoles.map((r) => r.id).filter(Boolean));
          const fallbackRoleId =
            mappedRoles.find((r) => r.name === 'Member')?.id ??
            mappedRoles[mappedRoles.length - 1]?.id ??
            '';
          let mapped = (d.members as UserInfo[]).map((m) => {
            const mid = String(m.id ?? '');
            let rid = m.roleId != null && String(m.roleId).length > 0 ? String(m.roleId) : fallbackRoleId;
            if (rid && !roleIdSet.has(rid)) rid = fallbackRoleId || mappedRoles[0]?.id || '';
            return { ...m, id: mid, roleId: rid, avatarUrl: (m as any).avatar_url, nickColor: (m as any).nick_color, nickGlow: (m as any).nick_glow };
          });
          let rolesOut = mappedRoles;
          if (mappedRoles.length === 0 && mapped.length > 0) {
            rolesOut = [
              {
                id: '__devcord_members',
                name: 'Członkowie',
                color: '#a1a1aa',
                bg: 'rgba(161, 161, 170, 0.05)',
                border: 'rgba(161, 161, 170, 0.1)',
                glow: 'none',
                icon: Users,
              },
            ];
            mapped = mapped.map((u) => ({ ...u, roleId: '__devcord_members' }));
          }
          const selfRid =
            rolesOut.find((r) => r.name === 'Member')?.id ??
            rolesOut[rolesOut.length - 1]?.id ??
            rolesOut[0]?.id ??
            '__devcord_members';
          if (meUserId && !mapped.some((x) => x.id === meUserId)) {
            mapped = [...mapped, { id: meUserId, name: localUserName, roleId: selfRid, status: 'online' as const, avatarUrl: localUserAvatar, nickColor: localUserColor, nickGlow: localUserGlow }];
          }
          setWorkspaceRoles(rolesOut);
          setWorkspaceMembers(mapped);
        } catch {
          /* ignore */
        }
      })();
    };
    run();
    const id = window.setInterval(run, 5000);
    const onVis = () => {
      if (document.visibilityState === 'visible') run();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [API_BASE_URL, fluxToken, activeServer, servers, meUserId, localUserName, localUserAvatar, localUserColor, localUserGlow]);

  useEffect(() => {
    if (!API_BASE_URL || !fluxToken || !activeChannel) return;
    if (!channels.some((c) => c.id === activeChannel)) return;
    (async () => {
      try {
        const rows = await apiClient(`/channels/${activeChannel}/messages`);
        if (!Array.isArray(rows)) return;
        setMessagesByChannel((prev) => ({
          ...prev,
          [activeChannel]: rows.map((r: { id: string; userId: string; time: string; content: string; isEdited?: boolean }) => ({
            id: r.id,
            userId: r.userId,
            time: r.time,
            content: r.content,
            isEdited: r.isEdited,
            isMe: r.userId === meUserId,
          })),
        }));
      } catch {
        /* ignore */
      }
    })();
  }, [API_BASE_URL, fluxToken, activeChannel, meUserId, channels]);

  useEffect(() => {
    setTypingUsers({});
  }, [activeChannel]);

  const messages = messagesByChannel[activeChannel] ?? [];
  const myUserId = API_BASE_URL ? meUserId : guestIdRef.current;

  const mergeChatMessage = useCallback(
    (row: { channelId: string; id: string; userId: string; content: string; time: string; isEdited?: boolean }) => {
      const ch = row.channelId;
      if (!ch) return;
      setMessagesByChannel((prev) => {
        const list = [...(prev[ch] ?? [])];
        const i = list.findIndex((m) => m.id === row.id);
        const entry: ChatRow = {
          id: row.id,
          userId: row.userId,
          time: row.time,
          content: row.content,
          isEdited: row.isEdited,
          isMe: row.userId === meUserId,
        };
        if (i >= 0) {
          list[i] = { ...list[i], ...entry };
        } else {
          const tmpIdx = list.findIndex(
            (m) => m.id.startsWith('tmp_') && m.userId === row.userId && m.content === row.content,
          );
          if (tmpIdx >= 0) list[tmpIdx] = entry;
          else list.push(entry);
        }
        return { ...prev, [ch]: list };
      });
    },
    [meUserId],
  );

  const mergeUserFromWs = useCallback(
    (p: ChatUserUpdatedPayload) => {
      const uid = p.user_id;
      setWorkspaceMembers((prev) => {
        const i = prev.findIndex((m) => m.id === uid);
        if (i < 0) return prev;
        const cur = prev[i];
        const next: UserInfo = {
          ...cur,
          name: p.name ?? cur.name,
          avatarUrl: p.avatar_url !== undefined ? p.avatar_url : cur.avatarUrl,
          nickColor: p.nick_color !== undefined ? p.nick_color : cur.nickColor,
          nickGlow: p.nick_glow !== undefined ? p.nick_glow : cur.nickGlow,
        };
        const copy = [...prev];
        copy[i] = next;
        return copy;
      });
      if (uid === meUserId) {
        if (p.name) setLocalUserName(p.name);
        if (p.avatar_url !== undefined) setLocalUserAvatar(p.avatar_url);
        if (p.nick_color) setLocalUserColor(p.nick_color);
        if (p.nick_glow !== undefined) setLocalUserGlow(p.nick_glow);
      }
    },
    [meUserId],
  );

  const { sendTyping } = useChatSocket({
    apiBase: API_BASE_URL,
    token: fluxToken || null,
    channelId: activeChannel,
    onMessage: mergeChatMessage,
    onTyping: (ev) => {
      if (ev.channelId !== activeChannel) return;
      if (ev.userId === meUserId) return;
      setTypingUsers((t) => {
        const next = { ...t };
        if (ev.typing) next[ev.userId] = true;
        else delete next[ev.userId];
        return next;
      });
    },
    onUserUpdated: API_BASE_URL && fluxToken ? mergeUserFromWs : undefined,
  });

  useEffect(() => {
    if (!API_BASE_URL || !fluxToken || !isInputFocused) return;
    if (currentChannelMeta?.type !== 'text') return;
    if (!inputValue.trim()) {
      sendTyping(false);
      return;
    }
    sendTyping(true);
    const tid = window.setTimeout(() => sendTyping(false), 2800);
    return () => clearTimeout(tid);
  }, [inputValue, isInputFocused, currentChannelMeta?.type, API_BASE_URL, fluxToken, sendTyping]);

  const {
    phase: voicePhase,
    participants: voiceParticipants,
    localMuted,
    setLocalMuted,
    localDeafened,
    setLocalDeafened,
    speakingPeers,
    remoteScreenByUser,
    remoteVoiceState,
    setUserVolume,
    setUserOutputMuted: setPeerOutputMute,
  } = useVoiceRoomMaybe({
    apiMode: !!API_BASE_URL,
    enabled: !!activeVoiceChannel,
    roomId: activeVoiceChannel,
    userId: myUserId,
    micDeviceId,
    screenStream,
    cameraStream,
    screenBitrate: screenRes === 1440 ? 8000000 : screenRes === 1080 ? 4000000 : screenRes === 720 ? 1500000 : 800000,
    micSoftwareGate,
    micGateThresholdDb,
  });

  const [voicePingRttMs, setVoicePingRttMs] = useState<number | null>(null);
  const [voicePingServerMs, setVoicePingServerMs] = useState<number | null>(null);
  const [voicePingOk, setVoicePingOk] = useState(false);

  useEffect(() => {
    if (!API_BASE_URL || !activeVoiceChannel) {
      setVoicePingRttMs(null);
      setVoicePingServerMs(null);
      setVoicePingOk(false);
      return;
    }
    let alive = true;
    const ping = async () => {
      try {
        const t0 = performance.now();
        const r = await fetch(`${API_BASE_URL}/ping`, {
          cache: 'no-store',
          method: 'GET',
          credentials: 'omit',
        });
        const rtt = Math.round(performance.now() - t0);
        const j = (await r.json()) as { ok?: boolean; server_ms?: number };
        if (!alive) return;
        const bodyOk = j.ok !== false;
        setVoicePingOk(r.ok && bodyOk);
        setVoicePingRttMs(r.ok ? rtt : null);
        setVoicePingServerMs(r.ok && typeof j.server_ms === 'number' ? j.server_ms : null);
      } catch {
        if (alive) {
          setVoicePingOk(false);
          setVoicePingRttMs(null);
          setVoicePingServerMs(null);
        }
      }
    };
    void ping();
    const id = window.setInterval(ping, 5000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [API_BASE_URL, activeVoiceChannel]);

  /** Słuchawki: u Ciebie brak odsłuchu innych + wyłączony mikrofon. */
  const toggleVoiceHeadphones = useCallback(() => {
    if (localDeafened) {
      setLocalDeafened(false);
      setLocalMuted(false);
    } else {
      setLocalDeafened(true);
      setLocalMuted(true);
    }
  }, [localDeafened, setLocalDeafened, setLocalMuted]);

  /** Mikrofon: zwykle tylko mute; w trybie głuchym jedno kliknięcie wyłącza też głuchotę. */
  const toggleVoiceMic = useCallback(() => {
    if (localDeafened) {
      setLocalDeafened(false);
      setLocalMuted(false);
    } else {
      setLocalMuted((m) => !m);
    }
  }, [localDeafened, setLocalDeafened, setLocalMuted]);

  useEffect(() => {
    if (!API_BASE_URL || !activeServer) return;
    const voiceCh = channels.filter((c) => c.serverId === activeServer && c.type === 'voice');
    if (voiceCh.length === 0) return;
    let cancelled = false;
    const tick = async () => {
      const updates: Record<string, string[]> = {};
      await Promise.all(
        voiceCh.map(async (ch) => {
          try {
            const r = await fetch(`/voice/peers?room=${encodeURIComponent(ch.id)}`);
            if (!r.ok) return;
            const j = (await r.json()) as { user_ids?: string[] };
            updates[ch.id] = [...new Set(j.user_ids ?? [])].sort();
          } catch {
            /* ignore */
          }
        }),
      );
      if (cancelled) return;
      setVoicePeersByChannel((prev) => {
        const next = { ...prev };
        for (const ch of voiceCh) {
          if (updates[ch.id] !== undefined) next[ch.id] = updates[ch.id]!;
        }
        return next;
      });
    };
    const runTick = () => {
      if (document.visibilityState === 'hidden') return;
      void tick();
    };
    runTick();
    const id = window.setInterval(runTick, 900);
    const onVis = () => {
      if (document.visibilityState === 'visible') void tick();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [API_BASE_URL, activeServer, channels]);

  const [screenLayoutTick, bumpScreenLayout] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    const cleanups: Array<() => void> = [];
    for (const s of Object.values(remoteScreenByUser)) {
      const bump = () => bumpScreenLayout();
      const onStreamTracks = () => bump();
      s.addEventListener('addtrack', onStreamTracks);
      s.addEventListener('removetrack', onStreamTracks);
      cleanups.push(() => {
        s.removeEventListener('addtrack', onStreamTracks);
        s.removeEventListener('removetrack', onStreamTracks);
      });
      for (const t of s.getVideoTracks()) {
        const fn = () => bumpScreenLayout();
        t.addEventListener('ended', fn);
        t.addEventListener('mute', fn);
        cleanups.push(() => {
          t.removeEventListener('ended', fn);
          t.removeEventListener('mute', fn);
        });
      }
    }
    return () => cleanups.forEach((c) => c());
  }, [remoteScreenByUser]);

  /** Gdy track kończy się bez zdarzenia lub stan zacią się w przeglądarce — odśwież układ podglądu. */
  useEffect(() => {
    if (voicePhase !== 'connected' || !activeVoiceChannel) return;
    const id = window.setInterval(() => bumpScreenLayout(), 1200);
    return () => clearInterval(id);
  }, [voicePhase, activeVoiceChannel]);

  const localScreenLive = useMemo(() => mediaStreamHasLiveVideo(screenStream), [screenStream, screenLayoutTick]);
  const localCameraLive = useMemo(() => mediaStreamHasLiveVideo(cameraStream), [cameraStream, screenLayoutTick]);
  const remoteScreenPeers = useMemo(
    () =>
      Object.entries(remoteScreenByUser).filter(
        ([id, stream]) => id !== myUserId && mediaStreamHasLiveVideo(stream),
      ),
    [remoteScreenByUser, myUserId, screenLayoutTick],
  );
  const primaryRemoteScreen = remoteScreenPeers[0] ?? null;
  const primaryRemoteSharerId = primaryRemoteScreen?.[0] ?? null;
  const primaryRemoteStream = primaryRemoteScreen?.[1] ?? null;
  const voiceHasScreenActivity = localScreenLive || localCameraLive || remoteScreenPeers.length > 0;

  useEffect(() => {
    if (!primaryRemoteStream || !mediaStreamHasLiveVideo(primaryRemoteStream)) {
      setRemoteScreenWatching(false);
      setScreenStreamContext(null);
    }
  }, [primaryRemoteStream, screenLayoutTick]);

  useEffect(() => {
    if (voicePhase !== 'connected') {
      setVoiceMixPanelOpen(false);
      return;
    }
    Object.entries(userVolumes).forEach(([id, vol]) => setUserVolume(id, vol));
    Object.entries(userOutputMuted).forEach(([id, muted]) => setPeerOutputMute(id, !!muted));
  }, [voicePhase, userVolumes, userOutputMuted, setUserVolume, setPeerOutputMute]);

  useEffect(() => {
    const ids = new Set<string>();
    if (localScreenLive) ids.add(myUserId);
    if (localCameraLive) ids.add(`${myUserId}-cam`);
    remoteScreenPeers.forEach(([id]) => ids.add(id));
    if (maximizedScreenId && !ids.has(maximizedScreenId)) {
      setMaximizedScreenId(ids.size > 0 ? [...ids][0] : null);
    }
  }, [maximizedScreenId, localScreenLive, localCameraLive, remoteScreenPeers, myUserId]);

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
        setAccountPwdOpen(false);
        setVoiceMixPanelOpen(false);
        setScreenStreamContext(null);
        setCreateChannelModal(null); setCreateTaskModal({ isOpen: false }); setContextMenu(null);
        setCreateServerModal(null); setCreateCategoryModal(false); setEditCategoryModal(null);
        setDeepJoinToken(null); setJoinModalErr(''); setInviteModal(null); setInviteCreateErr('');
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  useEffect(() => {
    const closeMenu = () => {
      setContextMenu(null);
      setScreenStreamContext(null);
    };
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
      const res = (await apiClient('/servers', 'POST', payload)) as { id?: string; name?: string; iconKey?: string; color?: string; glow?: string } | null;
      if (API_BASE_URL && res?.id) {
        setServers((prev) => [
          ...prev,
          {
            id: res.id!,
            name: res.name ?? newServerName.trim(),
            icon: iconFromKey(res.iconKey ?? 'Zap', Zap),
            color: res.color ?? '#00eeff',
            glow: res.glow ?? payload.glow,
            active: true,
            inviteCode: (res as { inviteCode?: string }).inviteCode,
          },
        ]);
        const apiCategories = await apiClient('/categories');
        const apiChannels = await apiClient('/channels');
        if (Array.isArray(apiCategories)) {
          setCategories(apiCategories.map((c: Category & { isExpanded?: boolean }) => ({ ...c, isExpanded: c.isExpanded !== false })));
        }
        if (Array.isArray(apiChannels)) {
          setChannels(apiChannels.map((ch: Channel) => ({ ...ch, icon: ch.type === 'voice' ? Radio : Hash })));
          const fc = (apiChannels as Channel[]).find((x) => x.serverId === res.id && x.type === 'text');
          if (fc) setActiveChannel(fc.id);
        }
        setCreateServerModal(null);
        setNewServerName('');
        setActiveServer(res.id!);
        return;
      }
      const newSrvId = res?.id || `s_${Date.now()}`;
      const defaultCatId = `cat_${Date.now()}`;
      const defaultChanId = `c_${Date.now()}`;
      setServers([...servers, { ...payload, id: newSrvId, icon: Zap }]);
      setCategories([...categories, { id: defaultCatId, name: 'Ogólne', isExpanded: true, serverId: newSrvId }]);
      setChannels([...channels, { id: defaultChanId, name: 'powitania', type: 'text', color: '#00eeff', icon: Hash, categoryId: defaultCatId, serverId: newSrvId }]);
      setCreateServerModal(null);
      setNewServerName('');
      setActiveServer(newSrvId);
      setActiveChannel(defaultChanId);
    } catch (e) {
      console.error(e);
    }
  };

  const finishJoinSuccess = async (res: {
    id: string;
    name?: string;
    iconKey?: string;
    color?: string;
    glow?: string;
    inviteCode?: string;
  }) => {
    if (!API_BASE_URL) return;
    setServers((prev) => {
      if (prev.some((s) => s.id === res.id)) return prev;
      return [
        ...prev,
        {
          id: res.id,
          name: res.name || 'Serwer',
          icon: iconFromKey(res.iconKey ?? '', Compass),
          color: res.color ?? '#b266ff',
          glow: res.glow ?? '0 0 15px rgba(178,102,255,0.4)',
          active: true,
          inviteCode: res.inviteCode,
        },
      ];
    });
    const apiCategories = await apiClient('/categories');
    const apiChannels = await apiClient('/channels');
    if (Array.isArray(apiCategories)) {
      setCategories(apiCategories.map((c: Category & { isExpanded?: boolean }) => ({ ...c, isExpanded: c.isExpanded !== false })));
    }
    let firstCh = '';
    if (Array.isArray(apiChannels)) {
      setChannels(apiChannels.map((ch: Channel) => ({ ...ch, icon: ch.type === 'voice' ? Radio : Hash })));
      const fc = (apiChannels as Channel[]).find((x) => x.serverId === res.id && x.type === 'text');
      if (fc) {
        firstCh = fc.id;
        setActiveChannel(fc.id);
      }
    }
    setCreateServerModal(null);
    setJoinServerCode('');
    setJoinModalErr('');
    setDeepJoinToken(null);
    setActiveServer(res.id);
    const path = window.location.pathname || '';
    if (path.match(/^\/(?:join|invite)\//i)) {
      if (firstCh) window.history.replaceState({ devcord: 1 }, '', `/channels/${res.id}/${firstCh}`);
      else window.history.replaceState({ devcord: 1 }, '', '/');
    } else if (firstCh) {
      writeChannelsPath(res.id, firstCh);
    }
  };

  const joinServerWithCode = async (raw: string) => {
    const code = parseJoinInput(raw);
    if (!code) return false;
    setJoinModalErr('');
    try {
      const res = (await apiClient('/servers/join', 'POST', { code })) as {
        id?: string;
        name?: string;
        iconKey?: string;
        color?: string;
        glow?: string;
        inviteCode?: string;
      } | null;
      if (res?.id) {
        await finishJoinSuccess(res as { id: string; name?: string; iconKey?: string; color?: string; glow?: string; inviteCode?: string });
        return true;
      }
    } catch (e) {
      const er = e as Error & { status?: number };
      const st = er.status ?? 0;
      if (st === 400 && /not a server invite/i.test(er.message)) {
        setJoinModalErr(
          'To nie jest zaproszenie do serwera — użyj „Zaproś” z menu serwera (PPM na ikonie). Kanały nie mają osobnego linku dołączenia.',
        );
      } else if (/invite expired/i.test(er.message)) {
        setJoinModalErr('To zaproszenie wygasło.');
      } else if (/invite exhausted/i.test(er.message)) {
        setJoinModalErr('Wykorzystano limit użyć tego zaproszenia.');
      } else if (st === 404 || /invalid invite/i.test(er.message)) {
        setJoinModalErr(
          'Nie znaleziono serwera — zły kod lub serwer nie istnieje w tej bazie. Poproś o nowy link (/invite/…).',
        );
      } else {
        setJoinModalErr(er.message || 'Nie udało się dołączyć.');
      }
    }
    return false;
  };

  const handleJoinServer = async () => {
    if (!joinServerCode.trim()) return;
    if (API_BASE_URL) {
      await joinServerWithCode(joinServerCode);
      return;
    }
    try {
      const res = null as {
        id?: string;
        name?: string;
        iconKey?: string;
        color?: string;
        glow?: string;
      } | null;
      const newSrvId = res?.id || `s_${Date.now()}`;
      const newSrv = {
        id: newSrvId,
        name: res?.name || `Serwer: ${joinServerCode.replace(/.*\/join\//i, '')}`,
        icon: Compass,
        active: true,
        color: '#b266ff',
        glow: '0 0 15px rgba(178,102,255,0.4)',
      };
      setServers([...servers, newSrv]);
      setCategories([...categories, { id: `cat_${Date.now()}`, name: 'Nowe Połączenie', isExpanded: true, serverId: newSrvId }]);
      setChannels([...channels, { id: `c_${Date.now()}`, name: 'witaj', type: 'text', color: '#b266ff', icon: Hash, serverId: newSrvId }]);
      setCreateServerModal(null);
      setJoinServerCode('');
      setJoinModalErr('');
      setActiveServer(newSrvId);
    } catch (e) {
      console.error(e);
    }
  };

  const loadInvitesForServer = async (serverId: string) => {
    if (!API_BASE_URL) return;
    try {
      const rows = await apiClient(`/servers/${serverId}/invites`);
      if (Array.isArray(rows)) {
        setInviteListRows(
          rows as Array<{
            id: string;
            code: string;
            usesCount: number;
            maxUses?: number | null;
            expiresAt?: string | null;
            createdAt: string;
          }>,
        );
      } else setInviteListRows([]);
    } catch {
      setInviteListRows([]);
    }
  };

  const openInviteModal = (s: { id: string; name: string }) => {
    setInviteModal(s);
    setInviteCreateErr('');
    setInviteCreatedUrl(null);
    setInviteFormMaxUses('');
    setInviteFormDays('0');
    void loadInvitesForServer(s.id);
  };

  const submitCreateInvite = async () => {
    if (!inviteModal || !API_BASE_URL) return;
    setInviteBusy(true);
    setInviteCreateErr('');
    try {
      const body: { maxUses?: number; expiresInDays?: number } = {};
      const mu = inviteFormMaxUses.trim();
      if (mu !== '') {
        const n = parseInt(mu, 10);
        if (!Number.isNaN(n) && n > 0) body.maxUses = n;
      }
      if (inviteFormDays !== '0') body.expiresInDays = parseInt(inviteFormDays, 10);
      const res = (await apiClient(`/servers/${inviteModal.id}/invites`, 'POST', body)) as { code?: string };
      if (res?.code) {
        setInviteCreatedUrl(`${appPublicOrigin()}/invite/${encodeURIComponent(res.code)}`);
        await loadInvitesForServer(inviteModal.id);
      }
    } catch (e) {
      const er = e as Error & { status?: number };
      const msg = er.message || '';
      if (/invite_create_failed/i.test(msg)) {
        setInviteCreateErr('Nie udało się zapisać zaproszenia (baza). Jeśli to świeży deploy, uruchom migrację 002_server_invites.sql.');
      } else {
        setInviteCreateErr(msg || 'Nie udało się utworzyć zaproszenia.');
      }
      console.error(e);
    } finally {
      setInviteBusy(false);
    }
  };

  const leaveServer = async (id: string) => {
    try {
      await apiClient(`/servers/${id}/leave`, 'POST');
      const updated = servers.filter(s => s.id !== id);
      setServers(updated);
      if (activeServer === id) {
        if (updated.length > 0) setActiveServer(updated[0].id);
        else {
          setActiveServer('');
          setActiveChannel('');
          setTasks([]);
          setWorkspaceRoles([]);
          setWorkspaceMembers([]);
        }
      }
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
      if (activeChannel === id) setActiveChannel(currentServerChannels.find((c) => c.type === 'text')?.id ?? '');
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

    if (isAI) {
      setIsAILoading(true); setInputValue(''); setIsAIPromptOpen(false);
      setTimeout(() => {
        setIsAILoading(false);
        setMessagesByChannel((prev) => ({
          ...prev, [activeChannel]: [...(prev[activeChannel] ?? []), { 
            id: `ai_${Date.now()}`, userId: 'devcord_ai', time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), 
            content: `**Devcord AI:** Przeanalizowałem Twoje zapytanie: "${content}". Gotowe rozwiązanie:\n\n\`\`\`javascript\nconst devcordNode = new DevcordNode();\ndevcordNode.connect();\n\`\`\``, 
            isMe: false 
          }],
        }));
      }, 1500);
      return;
    }

    try {
      const tempId = `tmp_${Date.now()}`;
      setMessagesByChannel((prev) => ({
        ...prev,
        [activeChannel]: [...(prev[activeChannel] ?? []), { id: tempId, userId: myUserId, time: timeString, content, isMe: true }],
      }));
      setInputValue('');
      const res = (await apiClient(`/channels/${activeChannel}/messages`, 'POST', { content })) as { id?: string; userId?: string; time?: string } | null;
      if (res?.id) {
        setMessagesByChannel((prev) => ({
          ...prev,
          [activeChannel]: (prev[activeChannel] ?? []).map((m) =>
            m.id === tempId ? { ...m, id: res.id!, userId: res.userId ?? myUserId, time: res.time ?? m.time } : m,
          ),
        }));
      }
    } catch (e) {
      console.error(e);
    }
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
      // W prawdziwej aplikacji użylibyśmy FormData:
      // const formData = new FormData(); formData.append('file', fileObject);
      // await fetch(`${API_BASE_URL}/files`, { method: 'POST', body: formData });
      
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
    setVoiceMixPanelOpen(false);
    setActiveVoiceChannel(null);
    setRemoteScreenWatching(false);
    setScreenStreamContext(null);
    if (screenStream) { screenStream.getTracks().forEach(track => track.stop()); setScreenStream(null); }
    if (cameraStream) { cameraStream.getTracks().forEach(track => track.stop()); setCameraStream(null); }
    const currentViewType = currentServerChannels.find(c => c.id === activeChannel)?.type;
    if (currentViewType === 'voice') setActiveChannel(currentServerChannels.find(c => c.type === 'text')?.id || currentServerChannels[0]?.id || '');
  };
  const toggleScreenShare = async () => {
    if (screenStream) { screenStream.getTracks().forEach(track => track.stop()); setScreenStream(null); } 
    else {
      try {
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getDisplayMedia({
            video: { cursor: 'always' } as MediaTrackConstraints,
            audio: true,
          });
        } catch {
          stream = await navigator.mediaDevices.getDisplayMedia({
            video: { cursor: 'always' } as MediaTrackConstraints,
            audio: false,
          });
        }
        stream.getVideoTracks()[0].onended = () => setScreenStream(null);
        setScreenStream(stream);
      } catch {
        const mockStream = createMockScreenStream();
        mockStream.getVideoTracks()[0].onended = () => setScreenStream(null);
        setScreenStream(mockStream);
      }
    }
  };

  const toggleCameraShare = async () => {
    if (!activeVoiceChannel) return;
    if (cameraStream) {
      cameraStream.getTracks().forEach((t) => t.stop());
      setCameraStream(null);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
        audio: false,
      });
      const vt = stream.getVideoTracks()[0];
      if (vt) vt.onended = () => setCameraStream(null);
      setCameraStream(stream);
    } catch {
      /* ignore */
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
    if (id === 'devcord_ai') return { id: 'devcord_ai', name: 'Devcord AI', roleId: 'r1', status: 'online', nickColor: '#00eeff', nickGlow: '0 0 15px rgba(0,238,255,0.4)', avatarUrl: '' };
    if (id === myUserId) return { id, name: localUserName, roleId: workspaceRoles[0]?.id ?? 'r1', status: 'online', avatarUrl: localUserAvatar, nickColor: localUserColor, nickGlow: localUserGlow };
    const u = workspaceMembers.find((x) => x.id === id);
    if (u) return u;
    if (DEMO_MODE) {
      const u2 = mockUsers.find((x) => x.id === id);
      if (u2) return u2;
    }
    return {
      id,
      name: `Użytkownik·${id.slice(-4)}`,
      roleId: workspaceRoles[workspaceRoles.length - 1]?.id ?? 'r4',
      status: 'online' as const,
    };
  };
  const getRole = (roleId: string) => {
    const r = workspaceRoles.find((x) => x.id === roleId);
    if (r) return r;
    if (DEMO_MODE) return mockRoles[3];
    return {
      id: roleId,
      name: 'Członek',
      color: '#a1a1aa',
      bg: 'rgba(161, 161, 170, 0.05)',
      border: 'rgba(161, 161, 170, 0.1)',
      icon: Users,
      glow: 'none' as const,
    };
  };
  const userIdsOnVoiceChannel = (channelId: string) => {
    const polled = voicePeersByChannel[channelId] ?? [];
    if (activeVoiceChannel === channelId && voiceParticipants.length > 0) {
      return [...new Set([...voiceParticipants, ...polled])].sort();
    }
    return polled;
  };
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

  const isMainViewVoice = currentChannelData?.type === 'voice';
  const uncategorizedChannels = currentServerChannels.filter(c => !c.categoryId);

  if (API_BASE_URL && !fluxToken) {
    return (
      <AuthGate
        apiBase={API_BASE_URL}
        mode={authMode}
        setMode={setAuthMode}
        email={authEmail}
        setEmail={setAuthEmail}
        password={authPassword}
        setPassword={setAuthPassword}
        nick={authNick}
        setNick={setAuthNick}
        code={authCode}
        setCode={setAuthCode}
        err={authErr}
        setErr={setAuthErr}
        onToken={(t) => {
          localStorage.setItem(AUTH_TOKEN_KEY, t);
          localStorage.removeItem(AUTH_TOKEN_LEGACY);
          setFluxToken(t);
        }}
      />
    );
  }

  const onSettingsAvatarFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setSettingsError('');
    setSettingsSuccess('');
    try {
      const dataUrl = await resizeImageFileToDataUrl(file);
      setLocalUserAvatar(dataUrl);
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : 'Nie udało się wgrać avatara.');
    }
  };

  const saveProfileSettings = async () => {
    if (!API_BASE_URL) {
      setSettingsSuccess('Avatar i nick są widoczne lokalnie (tryb bez API).');
      setTimeout(() => setSettingsSuccess(''), 2800);
      return;
    }
    setSettingsBusy(true); setSettingsSuccess(''); setSettingsError('');
    try {
      await apiClient('/auth/me', 'PUT', {
        display_name: localUserName,
        avatar_url: localUserAvatar,
        nick_color: localUserColor,
        nick_glow: localUserGlow
      });
      setSettingsSuccess('Profil zaktualizowany! Zmiany są widoczne na żywo.');
      setTimeout(() => setSettingsSuccess(''), 3000);
    } catch (e: any) {
      setSettingsError(e.message || 'Błąd zapisu profilu.');
    } finally {
      setSettingsBusy(false);
    }
  };

  const submitAccountPasswordChange = async () => {
    setPwdErr('');
    setPwdOk('');
    if (!API_BASE_URL) {
      setPwdErr('Dostępne tylko po zalogowaniu do serwera API.');
      return;
    }
    if (pwdNew !== pwdConfirm) {
      setPwdErr('Powtórzenie hasła nie zgadza się z nowym hasłem.');
      return;
    }
    if (pwdNew.length < 8) {
      setPwdErr('Nowe hasło musi mieć co najmniej 8 znaków.');
      return;
    }
    setPwdBusy(true);
    try {
      await apiClient('/auth/me', 'PUT', { old_password: pwdOld, new_password: pwdNew });
      setPwdOk('Hasło zostało zmienione.');
      setPwdOld('');
      setPwdNew('');
      setPwdConfirm('');
      window.setTimeout(() => {
        setPwdOk('');
        setAccountPwdOpen(false);
      }, 2200);
    } catch (e: unknown) {
      setPwdErr(e instanceof Error ? e.message : 'Nie udało się zmienić hasła.');
    } finally {
      setPwdBusy(false);
    }
  };

  return (
    <div
      data-flux-theme={localTheme}
      className={`flex h-screen w-full p-2 md:p-4 font-sans overflow-hidden relative transition-colors ${
        localTheme === 'light'
          ? 'bg-zinc-300 text-zinc-900 selection:bg-[#00eeff]/35'
          : 'bg-[#000000] text-zinc-200 selection:bg-[#00eeff]/30 selection:text-white'
      }`}
      onDragEnter={handleDragEnter} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop} 
      onContextMenu={(e) => handleContextMenu(e, 'general', null)}
    >
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; height: 4px; display: none; }
        .custom-scrollbar:hover::-webkit-scrollbar { display: block; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }
        [data-flux-theme="light"] .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.15); }
        .user-row:hover, .channel-row:hover { background-color: var(--hover-bg) !important; border-color: var(--hover-border) !important; }
        .loader-dot { animation: loader 1.4s infinite ease-in-out both; }
        .loader-dot:nth-child(1) { animation-delay: -0.32s; }
        .loader-dot:nth-child(2) { animation-delay: -0.16s; }
        @keyframes loader { 0%, 80%, 100% { transform: scale(0); } 40% { transform: scale(1); } }
        [data-flux-theme="light"] .flux-sidebar .text-zinc-100,
        [data-flux-theme="light"] .flux-main .text-zinc-100,
        [data-flux-theme="light"] .flux-rightbar .text-zinc-100 { color: #18181b !important; }
        [data-flux-theme="light"] .flux-sidebar .text-zinc-200,
        [data-flux-theme="light"] .flux-main .text-zinc-200,
        [data-flux-theme="light"] .flux-rightbar .text-zinc-200 { color: #27272a !important; }
        [data-flux-theme="light"] .flux-sidebar .text-zinc-300,
        [data-flux-theme="light"] .flux-main .text-zinc-300,
        [data-flux-theme="light"] .flux-rightbar .text-zinc-300 { color: #3f3f46 !important; }
        [data-flux-theme="light"] .flux-sidebar .text-zinc-400,
        [data-flux-theme="light"] .flux-main .text-zinc-400,
        [data-flux-theme="light"] .flux-rightbar .text-zinc-400 { color: #52525b !important; }
        [data-flux-theme="light"] .flux-sidebar .text-zinc-500,
        [data-flux-theme="light"] .flux-main .text-zinc-500,
        [data-flux-theme="light"] .flux-rightbar .text-zinc-500 { color: #71717a !important; }
        [data-flux-theme="light"] .flux-sidebar .text-zinc-600,
        [data-flux-theme="light"] .flux-main .text-zinc-600,
        [data-flux-theme="light"] .flux-rightbar .text-zinc-600 { color: #52525b !important; }
        [data-flux-theme="light"] .flux-sidebar .text-white,
        [data-flux-theme="light"] .flux-main .text-white,
        [data-flux-theme="light"] .flux-rightbar .text-white { color: #0a0a0a !important; }
      `}</style>

      {/* --- MENU KONTEKSTOWE --- */}
      {contextMenu && (
        <div
          className="fixed z-[300] w-64 bg-[#0c0c0e]/95 backdrop-blur-3xl border border-white/[0.1] rounded-xl shadow-[0_20px_60px_rgba(0,0,0,0.9)] overflow-hidden flex flex-col p-1.5 animate-in fade-in zoom-in-95 duration-100"
          style={{
            top: Math.min(contextMenu.y, window.innerHeight - 350),
            left: Math.min(contextMenu.x, window.innerWidth - 256)
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
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
              {API_BASE_URL ? (
                <button
                  onClick={() => {
                    clearStoredAuthToken();
                    setFluxToken('');
                    setContextMenu(null);
                  }}
                  className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-300 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors w-full text-left"
                >
                  <LogOut size={14} /> Wyloguj
                </button>
              ) : null}
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
              <button
                onClick={() => {
                  const d = contextMenu.data as { id: string; name: string };
                  openInviteModal({ id: d.id, name: d.name });
                  setContextMenu(null);
                }}
                className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-300 hover:text-white hover:bg-white/[0.05] rounded-lg transition-colors w-full text-left"
              >
                <Link2 size={14} /> Zaproś do serwera
              </button>
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
              <div className="px-3 py-2.5 flex items-center gap-2 border-b border-white/[0.05] mb-1 min-w-0">
                <UserAvatarBubble user={contextMenu.data as UserInfo} className="w-8 h-8 rounded-lg shrink-0" />
                <div className="min-w-0 flex-1">
                  <NickLabel
                    user={contextMenu.data as UserInfo}
                    fallbackColor="#fafafa"
                    className="text-sm font-bold truncate block"
                  />
                  <span className="text-[9px] text-zinc-500 uppercase tracking-widest">Użytkownik</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setProfileCardUser(contextMenu.data as UserInfo);
                  setContextMenu(null);
                }}
                className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-300 hover:text-white hover:bg-white/[0.05] rounded-lg transition-colors w-full text-left"
              >
                <Eye size={14}/> Karta użytkownika
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveServer('');
                  setDmPeerId(String((contextMenu.data as UserInfo).id));
                  setContextMenu(null);
                }}
                className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-300 hover:text-white hover:bg-white/[0.05] rounded-lg transition-colors w-full text-left"
              >
                <MessageSquare size={14}/> Wiadomość (DM)
              </button>
              {activeVoiceChannel && (
                  <div
                    className="px-3 py-2 flex flex-col gap-2 w-full border-y border-white/[0.05] mt-1 pt-2 pb-2"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex flex-col gap-1 w-full">
                    <div className="flex items-center gap-2 w-full">
                      <Volume2 size={14} className="text-zinc-500 shrink-0" />
                      <span className="text-[9px] text-zinc-400 tabular-nums shrink-0 min-w-[7.5rem] text-right leading-tight">
                        {voiceVolumeUiLabel(userVolumes[contextMenu.data.id] ?? 1)}
                      </span>
                      <input
                        type="range"
                        min="0.25"
                        max="4"
                        step="0.05"
                        value={userVolumes[contextMenu.data.id] ?? 1}
                        onChange={(e) => {
                          const vol = parseFloat(e.target.value);
                          const uid = contextMenu.data.id as string;
                          setUserVolumes((prev) => ({ ...prev, [uid]: vol }));
                          setUserVolume(uid, vol);
                        }}
                        className="flex-1 min-w-0 h-1 rounded-full appearance-none bg-white/[0.1] accent-[#00eeff]"
                      />
                    </div>
                    <p className="text-[9px] text-zinc-600 px-0.5 leading-snug">Do 100% — normalna głośność; wyżej — cyfrowy boost (ciche mikrofony).</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const uid = contextMenu.data.id as string;
                        const next = !userOutputMuted[uid];
                        setUserOutputMutedMap((prev) => ({ ...prev, [uid]: next }));
                        setPeerOutputMute(uid, next);
                      }}
                      className="flex items-center gap-2 px-2 py-1.5 text-xs text-zinc-300 hover:text-white hover:bg-white/[0.06] rounded-lg transition-colors w-full text-left"
                    >
                      <VolumeX size={14} />
                      {userOutputMuted[contextMenu.data.id as string] ? 'Włącz odsłuch użytkownika' : 'Wycisz odsłuch (tylko u Ciebie)'}
                    </button>
                  </div>
              )}
              <button className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-300 hover:text-white hover:bg-white/[0.05] rounded-lg transition-colors w-full text-left"><UserCheck size={14}/> Zmień rolę</button>
              <div className="h-px bg-white/[0.05] my-1"></div>
              <button className="flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors w-full text-left"><UserMinus size={14}/> Wyrzuć z Devcord_</button>
            </>
          )}
          {contextMenu.type === 'file' && (
            <>
              <div className="px-3 py-2 text-xs font-bold text-zinc-500 uppercase tracking-widest border-b border-white/[0.05] mb-1 truncate">{contextMenu.data.name}</div>
              <button className="flex items-center gap-2 px-3 py-2 text-sm text-[#00eeff] hover:text-[#00eeff] hover:bg-[#00eeff]/10 rounded-lg transition-colors w-full text-left"><Download size={14}/> Pobierz plik</button>
              <button onClick={() => copyToClipboard(`${appPublicOrigin()}/files/${contextMenu.data.id}`)} className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-300 hover:text-white hover:bg-white/[0.05] rounded-lg transition-colors w-full text-left"><Link size={14}/> Kopiuj link</button>
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
              <button onClick={() => { setCreateServerModal(null); setJoinModalErr(''); }} className="text-zinc-500 hover:text-white"><X size={20}/></button>
            </div>
            <div className="mb-6">
              <label className="block text-xs font-bold uppercase tracking-widest text-zinc-500 mb-2">
                {createServerModal === 'create'
                  ? 'Nazwa serwera'
                  : `Link /invite/… lub kod (np. ${appPublicOrigin() || '…'}/invite/KOD)`}
              </label>
              {createServerModal === 'join' && joinModalErr ? (
                <p className="mb-3 text-sm text-red-400">{joinModalErr}</p>
              ) : null}
              <div className="relative flex items-center bg-[#151515] border border-white/[0.1] rounded-xl focus-within:border-[#00eeff]/50 transition-colors px-3">
                {createServerModal === 'create' ? <Server size={16} className="text-zinc-500"/> : <Link2 size={16} className="text-zinc-500"/>}
                <input 
                  autoFocus 
                  value={createServerModal === 'create' ? newServerName : joinServerCode} 
                  onChange={e => createServerModal === 'create' ? setNewServerName(e.target.value) : setJoinServerCode(e.target.value)} 
                  onKeyDown={e => {if(e.key==='Enter') createServerModal === 'create' ? handleCreateServer() : handleJoinServer()}} 
                  placeholder={
                    createServerModal === 'create'
                      ? 'Mój super serwer'
                      : `${appPublicOrigin() || 'https://…'}/invite/… lub sam kod`
                  } 
                  className="w-full bg-transparent outline-none py-3 px-3 text-sm text-white placeholder-zinc-600" 
                />
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => { setCreateServerModal(null); setJoinModalErr(''); }} className="px-5 py-2.5 rounded-xl text-sm font-medium text-zinc-400 hover:bg-white/[0.05] transition-colors">Anuluj</button>
              <button onClick={createServerModal === 'create' ? handleCreateServer : handleJoinServer} disabled={createServerModal === 'create' ? !newServerName.trim() : !joinServerCode.trim()} className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${(createServerModal === 'create' ? newServerName.trim() : joinServerCode.trim()) ? 'bg-[#00eeff] text-black shadow-[0_0_15px_rgba(0,238,255,0.4)]' : 'bg-white/[0.05] text-zinc-600 cursor-not-allowed'}`}>
                {createServerModal === 'create' ? 'Utwórz' : 'Dołącz'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deepJoinToken && API_BASE_URL && fluxToken && (
        <div
          className="fixed inset-0 z-[160] flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="w-full max-w-md bg-[#0c0c0e] border border-white/[0.1] rounded-3xl shadow-[0_0_80px_rgba(0,0,0,1)] p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-white">Zaproszenie do serwera</h3>
              <button
                type="button"
                onClick={() => {
                  setDeepJoinToken(null);
                  setJoinModalErr('');
                  if (window.location.pathname.match(/^\/(?:join|invite)\//i)) window.history.replaceState({ devcord: 1 }, '', '/');
                }}
                className="text-zinc-500 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>
            <p className="text-sm text-zinc-400 mb-2">
              Dołączyć jako <span className="font-semibold text-zinc-200">{localUserName}</span>?
            </p>
            <p className="text-xs text-zinc-600 font-mono truncate mb-4" title={deepJoinToken}>
              {deepJoinToken}
            </p>
            {joinModalErr ? <p className="text-sm text-red-400 mb-4">{joinModalErr}</p> : null}
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setDeepJoinToken(null);
                  setJoinModalErr('');
                  if (window.location.pathname.match(/^\/(?:join|invite)\//i)) window.history.replaceState({ devcord: 1 }, '', '/');
                }}
                className="px-5 py-2.5 rounded-xl text-sm font-medium text-zinc-400 hover:bg-white/[0.05] transition-colors"
              >
                Anuluj
              </button>
              <button
                type="button"
                onClick={() => void joinServerWithCode(deepJoinToken)}
                className="px-5 py-2.5 rounded-xl text-sm font-bold bg-[#00eeff] text-black shadow-[0_0_15px_rgba(0,238,255,0.4)]"
              >
                Dołącz
              </button>
            </div>
          </div>
        </div>
      )}

      {inviteModal && API_BASE_URL && (
        <div
          className="fixed inset-0 z-[165] flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="w-full max-w-lg bg-[#0c0c0e] border border-white/[0.1] rounded-3xl shadow-[0_0_80px_rgba(0,0,0,1)] p-6 max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-white">Zaproś — {inviteModal.name}</h3>
              <button
                type="button"
                onClick={() => { setInviteModal(null); setInviteCreateErr(''); }}
                className="text-zinc-500 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>
            {inviteCreateErr ? <p className="text-sm text-red-400 mb-3">{inviteCreateErr}</p> : null}
            <p className="text-xs text-zinc-500 mb-4">
              Link zaproszenia: <span className="font-mono text-zinc-400">{appPublicOrigin()}/invite/KOD</span>. Możesz ograniczyć liczbę użyć i czas ważności.
            </p>
            <div className="grid gap-3 mb-4">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1.5">Maks. użyć (puste = bez limitu)</label>
                <input
                  type="number"
                  min={1}
                  value={inviteFormMaxUses}
                  onChange={(e) => setInviteFormMaxUses(e.target.value)}
                  placeholder="np. 10"
                  className="w-full bg-[#151515] border border-white/[0.1] rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-[#00eeff]/40"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1.5">Wygasa</label>
                <select
                  value={inviteFormDays}
                  onChange={(e) => setInviteFormDays(e.target.value as '0' | '1' | '7' | '30')}
                  className="w-full bg-[#151515] border border-white/[0.1] rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-[#00eeff]/40"
                >
                  <option value="0">Nigdy</option>
                  <option value="1">Po 1 dniu</option>
                  <option value="7">Po 7 dniach</option>
                  <option value="30">Po 30 dniach</option>
                </select>
              </div>
            </div>
            <button
              type="button"
              disabled={inviteBusy}
              onClick={() => void submitCreateInvite()}
              className="w-full py-2.5 rounded-xl text-sm font-bold bg-[#00eeff] text-black shadow-[0_0_15px_rgba(0,238,255,0.3)] disabled:opacity-50"
            >
              {inviteBusy ? 'Tworzenie…' : 'Utwórz zaproszenie'}
            </button>
            {inviteCreatedUrl ? (
              <div className="mt-4 p-3 rounded-xl bg-[#151515] border border-white/[0.08]">
                <span className="text-[10px] uppercase tracking-widest text-zinc-500">Nowy link</span>
                <div className="flex gap-2 mt-2">
                  <input readOnly value={inviteCreatedUrl} className="flex-1 bg-black/40 border border-white/[0.06] rounded-lg px-2 py-1.5 text-xs text-zinc-300 font-mono truncate" />
                  <button
                    type="button"
                    onClick={() => copyToClipboard(inviteCreatedUrl)}
                    className="shrink-0 px-3 py-1.5 rounded-lg bg-white/[0.06] text-xs text-zinc-300 hover:text-white"
                  >
                    Kopiuj
                  </button>
                </div>
              </div>
            ) : null}
            <div className="mt-5 pt-4 border-t border-white/[0.06]">
              <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Aktywne zaproszenia</span>
              <div className="mt-2 space-y-2 max-h-40 overflow-y-auto custom-scrollbar">
                {inviteListRows.length === 0 ? (
                  <p className="text-xs text-zinc-600">Brak — utwórz pierwsze powyżej.</p>
                ) : (
                  inviteListRows.map((row) => (
                    <div key={row.id} className="text-xs text-zinc-400 flex flex-wrap items-center gap-x-2 gap-y-1">
                      <code className="text-[#00eeff] font-mono">{row.code}</code>
                      <span>
                        użyć {row.usesCount}
                        {row.maxUses != null && row.maxUses !== undefined ? ` / ${row.maxUses}` : ' / ∞'}
                      </span>
                      <span className="text-zinc-600">
                        {row.expiresAt ? `do ${new Date(row.expiresAt).toLocaleString()}` : 'bez wygaśnięcia'}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {screenStreamContext && remoteScreenWatching && primaryRemoteStream && (
        <div
          className="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setScreenStreamContext(null)}
          onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setScreenStreamContext(null); }}
        >
          <div
            className="bg-[#0c0c0e] border border-white/[0.1] rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.9)] overflow-hidden flex flex-col min-w-[200px]"
            style={{
              position: 'absolute',
              left: Math.min(screenStreamContext.x, window.innerWidth - 220),
              top: Math.min(screenStreamContext.y, window.innerHeight - 150),
            }}
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
          >
            <div className="p-3 border-b border-white/[0.05] bg-black/40">
              <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Ustawienia Streamu</span>
            </div>
            <div className="p-2 flex flex-col gap-1">
              <div className="flex items-center gap-3 px-3 py-2">
                <Volume2 size={14} className="text-zinc-400" />
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={remoteScreenVolume}
                  onChange={(e) => setRemoteScreenVolume(Number(e.target.value))}
                  className="w-full accent-[#00eeff] h-1"
                />
              </div>
              <label className="flex items-center gap-3 px-3 py-2 hover:bg-white/[0.05] rounded-xl cursor-pointer transition-colors group">
                 <div className={`w-8 h-4 rounded-full relative transition-colors ${remoteScreenVideoMuted ? 'bg-[#00eeff]/50' : 'bg-white/[0.1]'}`}>
                   <div className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-transform ${remoteScreenVideoMuted ? 'translate-x-4' : ''}`}></div>
                 </div>
                 <span className="text-sm font-medium text-zinc-300 group-hover:text-white transition-colors">Wstrzymaj wideo</span>
              </label>
            </div>
          </div>
        </div>
      )}

      {isSettingsOpen && (
        <div
          className="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setIsSettingsOpen(false)}
          role="presentation"
        >
          <div
            className="w-full max-w-2xl bg-[#0c0c0e] border border-white/[0.1] rounded-3xl shadow-[0_0_80px_rgba(0,0,0,1),0_0_40px_rgba(0,238,255,0.08)] ring-1 ring-[#00eeff]/15 flex overflow-hidden max-h-[85vh]"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-labelledby="settings-title"
          >
            {/* Sidebar Ustawień */}
            <div className="w-1/3 min-w-[180px] bg-[#050505] p-4 border-r border-white/[0.06] flex flex-col gap-1 overflow-y-auto">
              <h2 id="settings-title" className="text-xl font-bold text-white mb-4 px-2 tracking-tight">
                Ustawienia
              </h2>
              <div className="text-[10px] uppercase font-bold text-zinc-500 tracking-widest px-2 mb-2 mt-2">Personalizacja</div>
              <button
                type="button"
                onClick={() => setSettingsTab('profile')}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                  settingsTab === 'profile' ? 'bg-[#00eeff]/15 text-[#00eeff]' : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.05]'
                }`}
              >
                Mój Profil
              </button>
              <button
                type="button"
                onClick={() => setSettingsTab('appearance')}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                  settingsTab === 'appearance' ? 'bg-[#00eeff]/15 text-[#00eeff]' : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.05]'
                }`}
              >
                Wygląd i Motywy
              </button>
              <div className="text-[10px] uppercase font-bold text-zinc-500 tracking-widest px-2 mb-2 mt-4">Prywatność</div>
              <button
                type="button"
                onClick={() => setSettingsTab('account')}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                  settingsTab === 'account' ? 'bg-[#00eeff]/15 text-[#00eeff]' : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.05]'
                }`}
              >
                Konto i Hasła
              </button>
              <div className="text-[10px] uppercase font-bold text-zinc-500 tracking-widest px-2 mb-2 mt-4">Sprzęt</div>
              <button
                type="button"
                onClick={() => setSettingsTab('audio')}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                  settingsTab === 'audio' ? 'bg-[#00eeff]/15 text-[#00eeff]' : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.05]'
                }`}
              >
                Dźwięk i Wideo
              </button>
            </div>

            {/* Content Ustawień */}
            <div className="flex-1 p-8 flex flex-col overflow-y-auto custom-scrollbar relative">
              <button
                type="button"
                onClick={() => setIsSettingsOpen(false)}
                className="absolute top-4 right-4 text-zinc-500 hover:text-white p-1 rounded-lg hover:bg-white/[0.06] transition-colors"
              >
                <X size={22} />
              </button>
              
              {settingsSuccess && <div className="mb-6 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm">{settingsSuccess}</div>}
              {settingsError && <div className="mb-6 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-500 text-sm">{settingsError}</div>}

              {settingsTab === 'profile' && (
                <div className="space-y-8 animate-in fade-in duration-300">
                  <div>
                    <h3 className="text-xl font-bold text-white mb-1">Mój Profil</h3>
                    <p className="text-sm text-zinc-400">Dostosuj to, jak inni widzą Cię na kanałach.</p>
                  </div>

                  <div className="flex gap-6 items-start">
                    {/* Podgląd */}
                    <div className="w-32 h-32 rounded-2xl bg-black border border-white/[0.08] flex items-center justify-center shadow-xl overflow-hidden shrink-0 relative">
                       {localUserAvatar ? (
                          <img src={localUserAvatar} alt="avatar" className="w-full h-full object-cover" />
                       ) : (
                          <span className="text-4xl font-bold" style={{ color: localUserColor }}>{localUserName.charAt(0)}</span>
                       )}
                    </div>

                    <div className="flex-1 space-y-4">
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">Avatar</label>
                        <input
                          ref={settingsAvatarFileRef}
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
                          className="hidden"
                          onChange={onSettingsAvatarFileChange}
                        />
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => settingsAvatarFileRef.current?.click()}
                            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#151515] border border-white/[0.1] text-sm text-zinc-200 hover:border-[#00eeff]/40 hover:text-white transition-colors"
                          >
                            <UploadCloud size={16} className="text-[#00eeff]" />
                            Wgraj z dysku
                          </button>
                          {localUserAvatar ? (
                            <button
                              type="button"
                              onClick={() => {
                                setLocalUserAvatar('');
                                setSettingsError('');
                              }}
                              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-white/[0.08] text-sm text-zinc-400 hover:text-red-400 hover:border-red-500/30 transition-colors"
                            >
                              <Trash2 size={16} />
                              Usuń avatar
                            </button>
                          ) : null}
                        </div>
                        <p className="text-[11px] text-zinc-600 mt-2">JPG, PNG, WebP itd. — obraz zostanie zmniejszony (max ok. 512 px).</p>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">Albo adres URL obrazka</label>
                        <input
                          value={localUserAvatar.startsWith('data:') ? '' : localUserAvatar}
                          onChange={(e) => setLocalUserAvatar(e.target.value)}
                          className="w-full bg-[#151515] border border-white/[0.1] rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-[#00eeff]/40 transition-colors"
                          placeholder="https://…"
                        />
                        {localUserAvatar.startsWith('data:') ? (
                          <p className="text-[11px] text-zinc-500 mt-1.5">Aktywny jest wgrany plik. Wpisz URL powyżej, aby go zastąpić linkiem.</p>
                        ) : null}
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">Wyświetlana nazwa</label>
                        <input
                          value={localUserName}
                          onChange={(e) => setLocalUserName(e.target.value)}
                          className="w-full bg-[#151515] border border-white/[0.1] rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-[#00eeff]/40 transition-colors"
                          placeholder="Twój nick"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="pt-6 border-t border-white/[0.06] space-y-4">
                    <h4 className="text-sm font-bold text-white uppercase tracking-wider">Styl Nicku (Nitro)</h4>
                    
                    <div>
                        <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">Kolor Główny (HEX)</label>
                        <div className="flex gap-3 items-center">
                          <input type="color" value={localUserColor} onChange={e => setLocalUserColor(e.target.value)} className="w-10 h-10 rounded-lg cursor-pointer bg-transparent border-0 p-0" />
                          <input
                            value={localUserColor}
                            onChange={(e) => setLocalUserColor(e.target.value)}
                            className="flex-1 bg-[#151515] border border-white/[0.1] rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-[#00eeff]/40 font-mono transition-colors"
                            placeholder="#00eeff"
                          />
                        </div>
                    </div>

                    <div>
                        <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">Poświata nicku</label>
                        <SettingsGlowDropdown value={localUserGlow} onChange={setLocalUserGlow} disabled={settingsBusy} />
                        <p className="text-[11px] text-zinc-600 mt-2">Presety Nitro (gradient, puls, shimmer) lub klasyka — kolory i czcionka w studio poniżej.</p>
                    </div>

                    <div className="p-4 rounded-xl border border-[#00eeff]/15 bg-gradient-to-br from-black/60 to-[#00eeff]/[0.04] space-y-3">
                      <div className="text-[10px] font-bold uppercase tracking-widest text-[#00eeff]/80">Studio stylu Nitro</div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[9px] text-zinc-500 mb-1">Efekt</label>
                          <select
                            value={nickStudioFx}
                            onChange={(e) => setNickStudioFx(e.target.value as typeof nickStudioFx)}
                            className="w-full bg-[#151515] border border-white/[0.1] rounded-lg px-2 py-2 text-xs text-white outline-none focus:border-[#00eeff]/40"
                          >
                            <option value="gradient">Gradient</option>
                            <option value="gradient_neon">Gradient + puls</option>
                            <option value="neon_pulse">Pulsujący neon</option>
                            <option value="shimmer">Shimmer</option>
                            <option value="double_outline">Podwójna obwódka</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[9px] text-zinc-500 mb-1">Czcionka nicku</label>
                          <select
                            value={nickStudioFontId}
                            onChange={(e) => setNickStudioFontId(e.target.value)}
                            className="w-full bg-[#151515] border border-white/[0.1] rounded-lg px-2 py-2 text-xs text-white outline-none focus:border-[#00eeff]/40"
                          >
                            {NICK_FONT_STACKS.map((f) => (
                              <option key={f.id} value={f.id}>
                                {f.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div className="flex gap-4 flex-wrap items-center">
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] text-zinc-500">Kolor A</span>
                          <input type="color" value={nickStudioG1} onChange={(e) => setNickStudioG1(e.target.value)} className="w-9 h-9 rounded-lg cursor-pointer border-0 bg-transparent p-0" />
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] text-zinc-500">Kolor B</span>
                          <input type="color" value={nickStudioG2} onChange={(e) => setNickStudioG2(e.target.value)} className="w-9 h-9 rounded-lg cursor-pointer border-0 bg-transparent p-0" />
                        </div>
                        <button
                          type="button"
                          disabled={settingsBusy}
                          onClick={() => {
                            const stack = NICK_FONT_STACKS.find((x) => x.id === nickStudioFontId)?.stack ?? '';
                            setLocalUserGlow(buildNickGlowJson({ fx: nickStudioFx, g1: nickStudioG1, g2: nickStudioG2, fontStack: stack }));
                          }}
                          className="ml-auto px-4 py-2 rounded-xl border border-[#00eeff]/35 text-[#00eeff] text-xs font-bold hover:bg-[#00eeff]/10 transition-colors disabled:opacity-40"
                        >
                          Zastosuj studio → nick
                        </button>
                      </div>
                    </div>
                    
                    <div className="mt-4 p-4 rounded-xl border border-white/[0.06] bg-black/40">
                      <span className="text-xs text-zinc-500 mb-2 block uppercase font-bold tracking-widest">Podgląd na czacie:</span>
                      <NickLabel
                        user={{ nickGlow: localUserGlow, nickColor: localUserColor, name: localUserName || 'Anonim' }}
                        fallbackColor="#a1a1aa"
                        className="font-semibold text-[15px] tracking-wide"
                      />
                    </div>
                  </div>

                  <div className="pt-4 flex justify-end">
                    <button onClick={saveProfileSettings} disabled={settingsBusy} className="px-6 py-2.5 rounded-xl bg-[#00eeff] text-black font-bold text-sm shadow-[0_0_15px_rgba(0,238,255,0.4)] disabled:opacity-50">
                      {settingsBusy ? 'Zapisywanie...' : 'Zapisz Zmiany'}
                    </button>
                  </div>
                </div>
              )}

              {settingsTab === 'appearance' && (
                <div className="space-y-8 animate-in fade-in duration-300">
                  <div>
                    <h3 className="text-xl font-bold text-white mb-1">Wygląd</h3>
                    <p className="text-sm text-zinc-400">Zmień motyw aplikacji.</p>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mt-6">
                    <button type="button" onClick={() => setLocalTheme('dark')} className={`p-4 rounded-2xl border text-left transition-all ${localTheme === 'dark' ? 'border-[#00eeff] bg-[#00eeff]/5' : 'border-white/[0.08] hover:border-white/[0.2] bg-white/[0.02]'}`}>
                      <div className="w-full h-24 bg-[#0a0a0c] rounded-lg border border-white/[0.1] mb-3 flex relative overflow-hidden">
                         <div className="w-1/4 bg-[#080808] border-r border-white/[0.05]"></div>
                         <div className="flex-1 p-2"><div className="w-1/2 h-2 rounded bg-white/[0.1] mb-1"></div><div className="w-3/4 h-2 rounded bg-[#00eeff]/50"></div></div>
                      </div>
                      <span className="font-bold text-white">Classic Dark</span>
                      <p className="text-xs text-zinc-500 mt-1">Domyślny motyw Devcord.</p>
                    </button>

                    <button type="button" onClick={() => setLocalTheme('light')} className={`p-4 rounded-2xl border text-left transition-all ${localTheme === 'light' ? 'border-[#00eeff] bg-[#00eeff]/5' : 'border-white/[0.08] hover:border-white/[0.2] bg-white/[0.02]'}`}>
                      <div className="w-full h-24 bg-white rounded-lg border border-black/[0.1] mb-3 flex relative overflow-hidden">
                         <div className="w-1/4 bg-gray-100 border-r border-black/[0.05]"></div>
                         <div className="flex-1 p-2"><div className="w-1/2 h-2 rounded bg-black/[0.1] mb-1"></div><div className="w-3/4 h-2 rounded bg-[#00eeff]"></div></div>
                      </div>
                      <span className="font-bold text-white">Light Mode</span>
                      <p className="text-xs text-zinc-500 mt-1">Jasny wariant interfejsu.</p>
                    </button>
                  </div>
                  <p className="text-sm text-zinc-500 mt-4 leading-relaxed">
                    Motyw zapisuje się automatycznie w tej przeglądarce (localStorage) i stosuje się od razu.
                  </p>
                </div>
              )}

              {settingsTab === 'account' && (
                <div className="space-y-8 animate-in fade-in duration-300">
                  <div>
                    <h3 className="text-xl font-bold text-white mb-1">Moje Konto</h3>
                    <p className="text-sm text-zinc-400">Zarządzaj swoimi danymi dostępowymi.</p>
                  </div>
                  
                  <div className="bg-black/40 border border-white/[0.06] rounded-2xl p-6 space-y-6">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-white/[0.06] pb-6">
                      <div>
                        <span className="text-xs uppercase font-bold text-zinc-500 block mb-1">E-mail logowania</span>
                        <span className="text-zinc-200 break-all">{sessionEmail || authEmail || (API_BASE_URL ? '—' : 'Tryb bez API')}</span>
                        <p className="text-[11px] text-zinc-600 mt-2 max-w-md">Adres służy do logowania. Zmiana e-maila z poziomu aplikacji nie jest jeszcze włączona — w razie potrzeby skontaktuj się z administratorem domeny.</p>
                      </div>
                      <button
                        type="button"
                        disabled
                        title="Zmiana e-maila nie jest jeszcze dostępna w aplikacji."
                        className="shrink-0 px-4 py-2 bg-white/[0.04] rounded-lg text-sm text-zinc-600 cursor-not-allowed border border-white/[0.06]"
                      >
                        Zmień e-mail
                      </button>
                    </div>

                    <div className="flex flex-col gap-4">
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                        <div>
                          <span className="text-xs uppercase font-bold text-zinc-500 block mb-1">Hasło</span>
                          <span className="text-sm text-zinc-400">Użyj obecnego hasła i ustaw nowe (min. 8 znaków).</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setAccountPwdOpen((o) => !o);
                            setPwdErr('');
                            setPwdOk('');
                          }}
                          disabled={!API_BASE_URL}
                          className="shrink-0 px-4 py-2 border border-blue-500/35 text-blue-400 hover:bg-blue-500/10 rounded-lg text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {accountPwdOpen ? 'Anuluj zmianę hasła' : 'Zmień hasło'}
                        </button>
                      </div>

                      {accountPwdOpen && API_BASE_URL && (
                        <div className="rounded-xl border border-white/[0.08] bg-[#111]/80 p-4 space-y-3">
                          {pwdOk ? <div className="text-sm text-emerald-400">{pwdOk}</div> : null}
                          {pwdErr ? <div className="text-sm text-red-400">{pwdErr}</div> : null}
                          <div>
                            <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1.5">Obecne hasło</label>
                            <input
                              type="password"
                              autoComplete="current-password"
                              value={pwdOld}
                              onChange={(e) => setPwdOld(e.target.value)}
                              className="w-full bg-[#151515] border border-white/[0.1] rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-[#00eeff]/40"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1.5">Nowe hasło</label>
                            <input
                              type="password"
                              autoComplete="new-password"
                              value={pwdNew}
                              onChange={(e) => setPwdNew(e.target.value)}
                              className="w-full bg-[#151515] border border-white/[0.1] rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-[#00eeff]/40"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1.5">Powtórz nowe hasło</label>
                            <input
                              type="password"
                              autoComplete="new-password"
                              value={pwdConfirm}
                              onChange={(e) => setPwdConfirm(e.target.value)}
                              className="w-full bg-[#151515] border border-white/[0.1] rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-[#00eeff]/40"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => void submitAccountPasswordChange()}
                            disabled={pwdBusy || !pwdOld || !pwdNew}
                            className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-[#00eeff] text-black font-bold text-sm disabled:opacity-50"
                          >
                            {pwdBusy ? 'Zapisywanie…' : 'Zapisz nowe hasło'}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="pt-2 border-t border-white/[0.06]">
                     <h4 className="text-sm font-bold text-red-500 mb-2">Strefa zagrożenia</h4>
                     <p className="text-xs text-zinc-500 mb-4">Trwałe usunięcie konta nie jest jeszcze obsługiwane przez API. Skontaktuj się z administratorem, jeśli musisz zamknąć konto.</p>
                     <button
                       type="button"
                       onClick={() => setSettingsError('Usuwanie konta z aplikacji nie jest jeszcze dostępne.')}
                       className="px-4 py-2 border border-red-500/40 text-red-400/90 hover:bg-red-500/10 rounded-lg text-sm transition-colors"
                     >
                       Usuń konto (niedostępne)
                     </button>
                  </div>
                </div>
              )}

              {settingsTab === 'audio' && (
                <div className="space-y-6 animate-in fade-in duration-300">
                  <div>
                    <h3 className="text-xl font-bold text-white mb-1">Dźwięk i Wideo</h3>
                    <p className="text-sm text-zinc-400">Dostosuj swoje wejścia i wyjścia.</p>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">
                      Mikrofon
                    </label>
                    <select
                      value={micDeviceId}
                      onChange={(e) => setMicDeviceId(e.target.value)}
                      className="w-full bg-[#151515] border border-white/[0.1] rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-[#00eeff]/40 transition-colors"
                    >
                      <option value="">Domyślny sprzęt systemowy</option>
                      {audioInputs.map((d) => (
                        <option key={d.deviceId} value={d.deviceId}>
                          {d.label || d.deviceId || 'Wejście audio'}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="bg-[#151515] border border-white/[0.08] rounded-2xl p-5">
                    <div className="flex items-center justify-between gap-3 mb-4">
                      <span className="text-sm font-bold text-white tracking-wide">Bramka ciszy (Tłumienie sprzętowe)</span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={micSoftwareGate}
                        onClick={() => setMicSoftwareGate((v) => !v)}
                        className={`relative w-12 h-6 rounded-full transition-colors ${micSoftwareGate ? 'bg-[#00eeff]/50' : 'bg-white/[0.1]'}`}
                      >
                        <span
                          className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${micSoftwareGate ? 'translate-x-6' : ''}`}
                        />
                      </button>
                    </div>
                    <div>
                      <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-3 mt-4">
                        <span>Próg odcięcia (dBFS)</span>
                        <span className="text-[#00eeff] font-mono tabular-nums bg-[#00eeff]/10 px-2 py-0.5 rounded">{micGateThresholdDb} dB</span>
                      </div>
                      <input
                        type="range"
                        min={-58}
                        max={-26}
                        step={1}
                        value={micGateThresholdDb}
                        onChange={(e) => setMicGateThresholdDb(Number(e.target.value))}
                        disabled={!micSoftwareGate}
                        className="w-full accent-[#00eeff] h-2 disabled:opacity-35"
                      />
                      <div className="flex justify-between text-[10px] text-zinc-500 mt-2 font-medium">
                        <span>Bardzo czuły (Ciszej)</span>
                        <span>Ostre cięcie (Głośniej)</span>
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void refreshAudioDevices()}
                    className="mt-4 w-full py-3 rounded-xl text-sm font-semibold border border-white/[0.1] text-zinc-300 hover:bg-white/[0.05] hover:text-white transition-colors"
                  >
                    Wyszukaj ponownie urządzenia
                  </button>
                  <p className="text-sm text-zinc-500 leading-relaxed">
                    Mikrofon, bramka ciszy oraz ustawienia ekranu (FPS / rozdzielczość) zapisują się automatycznie w tej przeglądarce i są używane przy rozmowach głosowych oraz udostępnianiu pulpitu.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {screenStreamContext && remoteScreenWatching && primaryRemoteStream && (
        <div
          className="fixed z-[380] w-56 rounded-xl border border-white/[0.1] bg-[#0c0c0e]/95 backdrop-blur-xl p-3 shadow-[0_20px_60px_rgba(0,0,0,0.9)]"
          style={{
            top: Math.min(screenStreamContext.y, window.innerHeight - 180),
            left: Math.min(screenStreamContext.x, window.innerWidth - 230),
          }}
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
        >
          <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">Dźwięk streamu</div>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(remoteScreenVolume * 100)}
            onChange={(e) => setRemoteScreenVolume(Number(e.target.value) / 100)}
            className="w-full accent-[#00eeff] h-2"
          />
          <div className="flex justify-between text-[10px] text-zinc-600 mt-1">
            <span>0</span>
            <span>{Math.round(remoteScreenVolume * 100)}%</span>
          </div>
          <button
            type="button"
            onClick={() => setRemoteScreenVideoMuted((m) => !m)}
            className="mt-3 w-full py-2 rounded-lg text-xs font-bold uppercase tracking-wide bg-white/[0.06] hover:bg-white/[0.1] text-zinc-200 border border-white/[0.08] transition-colors"
          >
            {remoteScreenVideoMuted ? 'Wyłącz wyciszenie' : 'Wycisz stream'}
          </button>
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
                <input autoFocus value={categoryNameInput} onChange={e => setCategoryNameInput(e.target.value)} onKeyDown={e => {if(e.key==='Enter') createCategoryModal ? handleCreateCategory() : handleEditCategory()}} placeholder="np. Zespół Alpha" className="w-full bg-transparent outline-none py-3 px-3 text-sm text-white placeholder-zinc-600" />
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => { setCreateCategoryModal(false); setEditCategoryModal(null); }} className="px-5 py-2.5 rounded-xl text-sm font-medium text-zinc-400 hover:bg-white/[0.05] transition-colors">Anuluj</button>
              <button onClick={createCategoryModal ? handleCreateCategory : handleEditCategory} disabled={!categoryNameInput.trim()} className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${categoryNameInput.trim() ? 'bg-[#00eeff] text-black shadow-[0_0_15px_rgba(0,238,255,0.4)]' : 'bg-white/[0.05] text-zinc-600 cursor-not-allowed'}`}>
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
      <div
        className={`flex h-full w-full rounded-[32px] border overflow-hidden relative transition-all duration-500 flux-shell ${
          localTheme === 'light'
            ? 'bg-zinc-100 border-zinc-300/90 shadow-lg shadow-black/10'
            : 'bg-[#050505] border-white/[0.08] shadow-[0_0_80px_rgba(255,255,255,0.03)]'
        }`}
      >
        
        {/* --- 1. LEWY PANEL (NAV) --- */}
        {!isZenMode && (
          <aside 
            onContextMenu={(e) => handleContextMenu(e, 'workspace', null)}
            className={`w-[280px] flex flex-col shrink-0 z-30 border-r transition-all duration-500 flux-sidebar ${
              localTheme === 'light' ? 'bg-zinc-50 border-zinc-200' : 'border-white/[0.04] bg-[#080808]'
            }`}
          >
            {/* Workspace Switcher */}
            <div className="relative px-4 pt-6 pb-2 z-50">
              {API_BASE_URL && servers.length === 0 ? (
                <div className="rounded-2xl border border-white/[0.08] bg-black/40 p-4">
                  <p className="text-xs text-zinc-500 uppercase tracking-widest font-bold mb-3">Serwery</p>
                  <p className="text-sm text-zinc-400 mb-4 leading-relaxed">Utwórz pierwszą przestrzeń albo dołącz kodem.</p>
                  <button
                    type="button"
                    onClick={() => setCreateServerModal('create')}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[#00eeff] text-black font-bold text-sm shadow-[0_0_16px_rgba(0,238,255,0.25)]"
                  >
                    <Plus size={18} />
                    Utwórz serwer
                  </button>
                  <button
                    type="button"
                    onClick={() => setCreateServerModal('join')}
                    className="w-full mt-2 flex items-center justify-center gap-2 py-3 rounded-xl border border-white/[0.1] text-zinc-200 text-sm font-semibold hover:bg-white/[0.05]"
                  >
                    <LogIn size={16} />
                    Dołącz do serwera
                  </button>
                </div>
              ) : (
                (() => {
                  const terminalServerData = { id: '', name: 'Terminal Osobisty', color: '#00eeff', glow: '0 0 15px rgba(0,238,255,0.1)', icon: Terminal };
                  const activeServerData = activeServer === '' ? terminalServerData : (servers.find((s) => s.id === activeServer) || servers[0]);
                  if (!activeServerData) return null;
                  return (
                    <>
                      <button
                        onClick={() => setIsWorkspaceDropdownOpen(!isWorkspaceDropdownOpen)}
                        className="w-full flex items-center gap-3 p-2.5 rounded-2xl border transition-all duration-300 group hover:brightness-125 bg-black/50 backdrop-blur-md"
                        style={{
                          borderColor: `${activeServerData.color}30`,
                          boxShadow: isWorkspaceDropdownOpen ? activeServerData.glow : `0 0 15px ${activeServerData.color}10`,
                        }}
                      >
                        <div
                          className="w-10 h-10 rounded-xl flex items-center justify-center transition-all"
                          style={{ backgroundColor: `${activeServerData.color}20`, color: activeServerData.color }}
                        >
                          <activeServerData.icon size={20} />
                        </div>
                        <div className="flex flex-col items-start flex-1 min-w-0">
                          <span
                            className="text-[15px] font-bold truncate w-full text-left tracking-wide"
                            style={{ color: activeServerData.color, textShadow: `0 0 10px ${activeServerData.color}40` }}
                          >
                            {activeServerData.name}
                          </span>
                          <span className="text-[10px] text-zinc-500 font-medium uppercase tracking-widest mt-0.5">Przestrzeń robocza</span>
                        </div>
                        <ChevronsUpDown size={16} className="text-zinc-600 group-hover:text-zinc-300 transition-colors mr-1" />
                      </button>
                      {isWorkspaceDropdownOpen && (
                        <div className="absolute top-[calc(100%-4px)] left-4 right-4 mt-2 bg-[#0c0c0e]/95 backdrop-blur-3xl border border-white/[0.1] rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.9)] p-2 flex flex-col gap-1 z-50">
                          <button
                            onClick={() => {
                              setActiveServer('');
                              setActiveChannel('');
                              setIsWorkspaceDropdownOpen(false);
                            }}
                            className="w-full flex items-center gap-3 p-2 rounded-xl transition-all duration-200 hover:bg-white/[0.05] group"
                          >
                            <div className="w-8 h-8 rounded-lg flex items-center justify-center transition-transform group-hover:scale-105" style={{ color: '#00eeff', backgroundColor: 'rgba(0,238,255,0.15)', border: '1px solid rgba(0,238,255,0.3)' }}>
                              <Terminal size={14} />
                            </div>
                            <span className="text-sm font-semibold tracking-wide flex-1 text-left" style={{ color: '#00eeff' }}>Terminal Osobisty</span>
                            {activeServer === '' && <Check size={16} className="ml-auto text-[#00eeff]" />}
                          </button>
                          <div className="h-px bg-white/[0.05] my-1 mx-2"></div>
                          {servers.map((server) => (
                            <button
                              key={server.id}
                              onClick={() => {
                                setActiveServer(server.id);
                                setIsWorkspaceDropdownOpen(false);
                              }}
                              onContextMenu={(e) => handleContextMenu(e, 'server', server)}
                              className="w-full flex items-center gap-3 p-2 rounded-xl transition-all duration-200 hover:bg-white/[0.05] group"
                            >
                              <div
                                className="w-8 h-8 rounded-lg flex items-center justify-center transition-transform group-hover:scale-105"
                                style={{ color: server.color, backgroundColor: `${server.color}15`, border: `1px solid ${server.color}30` }}
                              >
                                <server.icon size={14} />
                              </div>
                              <span className="text-sm font-semibold tracking-wide" style={{ color: server.color }}>
                                {server.name}
                              </span>
                              {activeServer === server.id && <Check size={16} className="ml-auto" style={{ color: server.color }} />}
                            </button>
                          ))}
                          <div className="h-px bg-white/[0.05] my-1 mx-2"></div>
                          <button
                            onClick={() => {
                              setCreateServerModal('create');
                              setIsWorkspaceDropdownOpen(false);
                            }}
                            className="w-full flex items-center gap-3 p-2 rounded-xl transition-all duration-200 hover:bg-white/[0.05] text-zinc-400 hover:text-[#00eeff]"
                          >
                            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-white/[0.02] border border-white/[0.05]">
                              <Plus size={14} />
                            </div>
                            <span className="text-sm font-semibold tracking-wide">Utwórz serwer</span>
                          </button>
                          <button
                            onClick={() => {
                              setCreateServerModal('join');
                              setIsWorkspaceDropdownOpen(false);
                            }}
                            className="w-full flex items-center gap-3 p-2 rounded-xl transition-all duration-200 hover:bg-white/[0.05] text-zinc-400 hover:text-[#00eeff]"
                          >
                            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-white/[0.02] border border-white/[0.05]">
                              <LogIn size={14} />
                            </div>
                            <span className="text-sm font-semibold tracking-wide">Dołącz do serwera</span>
                          </button>
                        </div>
                      )}
                    </>
                  );
                })()
              )}
            </div>

            {/* LISTA KANAŁÓW I KATEGORII */}
            {activeServer === '' ? (
              <div className="flex-1 overflow-y-auto custom-scrollbar py-4 px-4 flex flex-col gap-2 relative min-h-0">
                <div className="absolute inset-0 bg-[#00eeff]/[0.01] pointer-events-none rounded-xl"></div>
                <div className="text-[10px] uppercase font-bold tracking-[0.2em] text-zinc-500 mb-2 px-2 flex items-center justify-between mt-2 relative z-10">
                  <span>Wiadomości bezpośrednie</span>
                </div>
                {!API_BASE_URL ? (
                  <p className="text-xs text-zinc-500 px-2 leading-relaxed relative z-10">
                    Tryb lokalny — DM używa identyfikatora gościa; wiadomości zapisują się w tej przeglądarce.
                  </p>
                ) : !meUserId ? (
                  <p className="text-xs text-zinc-500 px-2 leading-relaxed relative z-10">Zaloguj się, aby pisać z członkami zespołu.</p>
                ) : workspaceMembers.filter((m) => m.id !== meUserId).length === 0 ? (
                  <p className="text-xs text-zinc-500 px-2 relative z-10">Brak innych członków — dołącz do serwera, aby zobaczyć kontakty.</p>
                ) : (
                  workspaceMembers
                    .filter((m) => m.id !== meUserId)
                    .map((m) => {
                      const key = dmThreadKey(myUserId, m.id);
                      const last = (dmMessagesByThread[key] ?? []).slice(-1)[0];
                      const active = dmPeerId === m.id;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setDmPeerId(m.id)}
                          className={`relative z-10 flex items-center gap-3 p-2 rounded-xl border transition-colors text-zinc-300 hover:text-white w-full text-left group ${
                            active
                              ? 'bg-[#00eeff]/12 border-[#00eeff]/25'
                              : 'hover:bg-[#00eeff]/10 border-transparent hover:border-[#00eeff]/15'
                          }`}
                        >
                          <div className="relative shrink-0">
                            {m.avatarUrl?.trim() ? (
                              <img src={m.avatarUrl} alt="" className="w-8 h-8 rounded-[10px] object-cover border border-white/[0.1] group-hover:border-[#00eeff]/30 transition-colors" />
                            ) : (
                              <div className="w-8 h-8 rounded-[10px] bg-black border border-white/[0.1] flex items-center justify-center text-xs font-bold text-white group-hover:border-[#00eeff]/30 transition-colors">
                                {m.name.charAt(0)}
                              </div>
                            )}
                            <div className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-500 border-[3px] border-[#080808]" />
                          </div>
                          <div className="flex flex-col min-w-0 flex-1">
                            <NickLabel
                              user={m}
                              fallbackColor="#e4e4e7"
                              className="text-sm font-semibold truncate group-hover:text-[#00eeff] transition-colors"
                            />
                            <span className="text-[10px] text-zinc-500 truncate">
                              {last ? last.content : 'Rozpocznij rozmowę…'}
                            </span>
                          </div>
                        </button>
                      );
                    })
                )}
              </div>
            ) : (
            <div className="flex-1 overflow-y-auto custom-scrollbar py-2 px-4 flex flex-col gap-6">
              
              {/* KANAŁY BEZ KATEGORII */}
              {uncategorizedChannels.length > 0 && (
                <div className="flex flex-col gap-1">
                  {uncategorizedChannels.map(channel => {
                    const isVoice = channel.type === 'voice';
                    const isActiveVoice = activeVoiceChannel === channel.id;
                    const isViewed = activeChannel === channel.id;
                    const participantsOnChannel = isVoice ? userIdsOnVoiceChannel(channel.id) : [];
                    const sidebarVoiceVad = isVoice && activeVoiceChannel === channel.id && voicePhase === 'connected';

                    return (
                      <div key={channel.id} className="flex flex-col">
                        <button 
                          onClick={() => handleChannelClick(channel)} 
                          onContextMenu={(e) => handleContextMenu(e, 'channel', channel)}
                          className="channel-row flex items-center gap-2.5 py-1.5 px-3 rounded-lg text-sm transition-all duration-200 group border border-transparent min-w-0" 
                          style={isViewed || isActiveVoice ? { backgroundColor: `${channel.color}15`, borderColor: `${channel.color}30` } : { '--hover-bg': `${channel.color}10`, '--hover-border': `${channel.color}20` } as any}
                        >
                          {isVoice && isActiveVoice ? (
                            <div className="w-4 h-4 flex items-center justify-center relative shrink-0"><Volume2 size={16} style={{ color: channel.color }} className="animate-pulse" /></div>
                          ) : (
                            <channel.icon size={16} style={{ color: isViewed ? channel.color : undefined }} className={`shrink-0 ${!isViewed ? "text-zinc-500 group-hover:brightness-150 transition-all" : ""}`} />
                          )}
                          <span className={`truncate min-w-0 flex-1 text-left ${isViewed || isActiveVoice ? 'font-semibold' : 'text-zinc-400 group-hover:text-zinc-200'}`} style={isViewed || isActiveVoice ? { color: channel.color, textShadow: `0 0 10px ${channel.color}40` } : {}}>{channel.name}</span>
                          {isVoice && participantsOnChannel.length > 0 && (
                            <span className="shrink-0 text-[10px] font-bold tabular-nums text-zinc-500 px-1.5 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.06]" title="Na kanale głosowym">
                              {participantsOnChannel.length}
                            </span>
                          )}
                          {!isVoice && channel.unread && !isViewed && <div className="ml-auto w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: channel.color, boxShadow: `0 0 8px ${channel.color}` }}></div>}
                        </button>
                        
                        {isVoice && participantsOnChannel.length > 0 && (
                          <div className="ml-8 mt-1.5 mb-1 flex flex-col gap-1.5">
                            {participantsOnChannel.map((uid) => {
                              const u = getUser(uid); const isMe = uid === myUserId;
                              return (
                                <div key={uid} onContextMenu={(e) => handleContextMenu(e, 'user', u)} title={sidebarVoiceVad ? (speakingPeers[uid] ? 'Mówi' : 'Cisza') : undefined} className="flex items-center gap-2 text-xs text-zinc-400 py-1 px-2 rounded-md hover:bg-white/[0.05] cursor-pointer transition-colors border border-transparent hover:border-white/[0.05] min-w-0">
                                  <div className="relative shrink-0">
                                    {u.avatarUrl?.trim() ? (
                                      <img src={u.avatarUrl} alt="" className="w-5 h-5 rounded-md object-cover border border-white/[0.05]" />
                                    ) : (
                                      <div className="w-5 h-5 rounded-md bg-zinc-800 flex items-center justify-center text-[9px] font-bold text-white border border-white/[0.05]">{u.name.charAt(0)}</div>
                                    )}
                                    <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 border-2 rounded-full ${isMe && voicePhase === 'connected' ? 'bg-[#00eeff] border-[#080808]' : 'bg-emerald-500 border-[#080808]'}`} />
                                  </div>
                                  <span className={`truncate min-w-0 flex items-center gap-1.5 ${isMe ? 'text-[#00eeff] font-medium' : ''}`}>
                                    {sidebarVoiceVad && speakingPeers[uid] ? (
                                      <span className="w-1.5 h-1.5 rounded-full bg-[#00eeff] shadow-[0_0_6px_#00eeff] animate-pulse shrink-0" aria-hidden />
                                    ) : null}
                                    <NickLabel
                                      user={u}
                                      fallbackColor={isMe ? '#00eeff' : '#a1a1aa'}
                                      className="truncate font-medium"
                                    />
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
                          const sidebarVoiceVad = isVoice && activeVoiceChannel === channel.id && voicePhase === 'connected';

                          return (
                            <div key={channel.id} className="flex flex-col">
                              <button 
                                onClick={() => handleChannelClick(channel)} 
                                onContextMenu={(e) => handleContextMenu(e, 'channel', channel)}
                                className="channel-row flex items-center gap-2.5 py-1.5 px-3 rounded-lg text-sm transition-all duration-200 group border border-transparent min-w-0" 
                                style={isViewed || isActiveVoice ? { backgroundColor: `${channel.color}15`, borderColor: `${channel.color}30` } : { '--hover-bg': `${channel.color}10`, '--hover-border': `${channel.color}20` } as any}
                              >
                                {isVoice && isActiveVoice ? (
                                  <div className="w-4 h-4 flex items-center justify-center relative shrink-0"><Volume2 size={16} style={{ color: channel.color }} className="animate-pulse" /></div>
                                ) : (
                                  <channel.icon size={16} style={{ color: isViewed ? channel.color : undefined }} className={`shrink-0 ${!isViewed ? "text-zinc-500 group-hover:brightness-150 transition-all" : ""}`} />
                                )}
                                <span className={`truncate min-w-0 flex-1 text-left ${isViewed || isActiveVoice ? 'font-semibold' : 'text-zinc-400 group-hover:text-zinc-200'}`} style={isViewed || isActiveVoice ? { color: channel.color, textShadow: `0 0 10px ${channel.color}40` } : {}}>{channel.name}</span>
                                {isVoice && participantsOnChannel.length > 0 && (
                                  <span className="shrink-0 text-[10px] font-bold tabular-nums text-zinc-500 px-1.5 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.06]" title="Na kanale głosowym">
                                    {participantsOnChannel.length}
                                  </span>
                                )}
                                {!isVoice && channel.unread && !isViewed && <div className="ml-auto w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: channel.color, boxShadow: `0 0 8px ${channel.color}` }}></div>}
                              </button>
                              
                              {/* Voice Participants */}
                              {isVoice && participantsOnChannel.length > 0 && (
                                <div className="ml-8 mt-1.5 mb-1 flex flex-col gap-1.5">
                                  {participantsOnChannel.map((uid) => {
                                    const u = getUser(uid); const isMe = uid === myUserId;
                                    return (
                                      <div key={uid} onContextMenu={(e) => handleContextMenu(e, 'user', u)} title={sidebarVoiceVad ? (speakingPeers[uid] ? 'Mówi' : 'Cisza') : undefined} className="flex items-center gap-2 text-xs text-zinc-400 py-1 px-2 rounded-md hover:bg-white/[0.05] cursor-pointer transition-colors border border-transparent hover:border-white/[0.05] min-w-0">
                                        <div className="relative shrink-0">
                                          {u.avatarUrl?.trim() ? (
                                            <img src={u.avatarUrl} alt="" className="w-5 h-5 rounded-md object-cover border border-white/[0.05]" />
                                          ) : (
                                            <div className="w-5 h-5 rounded-md bg-zinc-800 flex items-center justify-center text-[9px] font-bold text-white border border-white/[0.05]">{u.name.charAt(0)}</div>
                                          )}
                                          <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 border-2 rounded-full ${isMe && voicePhase === 'connected' ? 'bg-[#00eeff] border-[#080808]' : 'bg-emerald-500 border-[#080808]'}`} />
                                        </div>
                                        <span className={`truncate min-w-0 flex items-center gap-1.5 ${isMe ? 'text-[#00eeff] font-medium' : ''}`}>
                                          {sidebarVoiceVad && speakingPeers[uid] ? (
                                            <span className="w-1.5 h-1.5 rounded-full bg-[#00eeff] shadow-[0_0_6px_#00eeff] animate-pulse shrink-0" aria-hidden />
                                          ) : null}
                                          <NickLabel
                                            user={u}
                                            fallbackColor={isMe ? '#00eeff' : '#a1a1aa'}
                                            className="truncate font-medium"
                                          />
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
                    )}
                  </div>
                );
              })}
            </div>
            )}

            {API_BASE_URL && activeVoiceChannel && (
              <div className="shrink-0 px-3 py-2.5 border-t border-white/[0.06] bg-black/35 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Wifi size={14} className={`shrink-0 ${voicePingOk ? 'text-emerald-400' : 'text-red-400'}`} />
                    <span
                      className={`text-[10px] font-semibold leading-tight truncate ${voicePingOk ? 'text-emerald-400' : 'text-red-400'}`}
                    >
                      {voicePingOk ? 'Serwer odpowiada' : 'Brak odpowiedzi'}
                    </span>
                  </div>
                  <span className="text-[10px] text-zinc-500 tabular-nums shrink-0 font-mono text-right max-w-[55%] leading-tight">
                    {voicePingRttMs != null ? (
                      <>
                        RTT {voicePingRttMs} ms
                        {voicePingServerMs != null ? ` · srv ${voicePingServerMs} ms` : ''}
                      </>
                    ) : (
                      '—'
                    )}
                  </span>
                </div>
                    <div className="flex items-start justify-between gap-2 pt-1 border-t border-white/[0.04]">
                      <div className="min-w-0 flex-1">
                        <p
                          className={`text-[11px] font-bold leading-tight ${
                            voicePhase === 'connected'
                              ? 'text-emerald-400'
                              : voicePhase === 'error'
                                ? 'text-red-400'
                                : 'text-amber-400'
                          }`}
                        >
                          {voicePhase === 'connected'
                            ? 'Nawiązano połączenie'
                            : voicePhase === 'error'
                              ? 'Błąd połączenia głosowego'
                              : voicePhase === 'idle'
                                ? 'Rozłączono'
                                : 'Łączenie…'}
                        </p>
                        <p className="text-[10px] text-zinc-500 truncate mt-0.5 flex items-center gap-1">
                          <Radio size={10} className="shrink-0 text-zinc-600" />
                          {servers.find((s) => s.id === activeServer)?.name ?? 'Serwer'} ·{' '}
                          {channels.find((c) => c.id === activeVoiceChannel)?.name ?? 'Kanał głosowy'}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        title={
                          voicePhase !== 'connected'
                            ? 'Najpierw połączenie z kanałem'
                            : cameraStream
                              ? 'Wyłącz kamerę'
                              : 'Włącz kamerę'
                        }
                        disabled={voicePhase !== 'connected'}
                        onClick={() => void toggleCameraShare()}
                        className={`flex-1 h-9 rounded-lg flex items-center justify-center border transition-colors ${
                          cameraStream
                            ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                            : 'bg-white/[0.05] border-white/[0.08] text-zinc-300 hover:bg-white/[0.08]'
                        } disabled:opacity-40 disabled:pointer-events-none`}
                      >
                        <Video size={16} />
                      </button>
                      <button
                        type="button"
                        title={
                          voicePhase !== 'connected'
                            ? 'Najpierw połączenie z kanałem'
                            : screenStream
                              ? 'Zakończ udostępnianie ekranu'
                              : 'Udostępnij ekran'
                        }
                        disabled={voicePhase !== 'connected'}
                        onClick={() => void toggleScreenShare()}
                        className={`flex-1 h-9 rounded-lg flex items-center justify-center border transition-colors ${
                          screenStream
                            ? 'bg-[#00eeff]/20 border-[#00eeff]/40 text-[#00eeff]'
                            : 'bg-white/[0.05] border-white/[0.08] text-zinc-300 hover:bg-white/[0.08]'
                        } disabled:opacity-40 disabled:pointer-events-none`}
                      >
                        <MonitorUp size={16} />
                      </button>
                    </div>
              </div>
            )}

            <div className="h-16 border-t border-white/[0.04] bg-black/40 p-2 flex items-center z-50">
              <div onClick={() => setIsSettingsOpen(true)} className="flex items-center gap-2 flex-1 hover:bg-white/[0.05] p-1.5 rounded-lg cursor-pointer transition-colors">
                <div className="relative">
                  {localUserAvatar?.trim() ? (
                    <img src={localUserAvatar} alt="" className="w-8 h-8 rounded-lg object-cover border border-white/[0.1] shadow-[0_0_15px_rgba(255,255,255,0.08)]" />
                  ) : (
                    <div className="w-8 h-8 rounded-lg bg-black border border-white/[0.1] text-white flex items-center justify-center font-bold text-sm shadow-[0_0_15px_rgba(255,255,255,0.1)]">{localUserName.charAt(0)}</div>
                  )}
                  <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-emerald-500 border-2 border-[#080808] rounded-full shadow-[0_0_10px_rgba(16,185,129,0.5)]"></div>
                </div>
                <div className="flex flex-col overflow-hidden min-w-0">
                  <NickLabel
                    user={{ name: localUserName, nickColor: localUserColor, nickGlow: localUserGlow }}
                    fallbackColor="#fff"
                    className="text-xs font-bold truncate leading-tight block"
                  />
                  <span className="text-[10px] text-zinc-500 truncate leading-tight">{API_BASE_URL ? 'Zalogowany' : 'Ty (Gość)'}</span>
                </div>
              </div>
              <div className="flex items-center gap-0.5 text-zinc-500">
                <button onClick={() => setIsSettingsOpen(true)} className="p-1.5 hover:text-white hover:bg-white/[0.05] rounded-md transition-colors"><Settings size={16} /></button>
              </div>
            </div>
          </aside>
        )}

        {/* --- 2. MAIN VIEW (CZAT / VOICE) --- */}
        <main
          className={`flex-1 flex flex-col relative overflow-hidden z-0 border-l transition-all duration-500 flux-main ${
            localTheme === 'light' ? 'bg-zinc-100 border-zinc-200' : 'bg-[#0a0a0c] border-white/[0.02]'
          }`}
        >
          {activeServer === '' ? (
            dmPeerId && myUserId ? (
              <div className="flex-1 flex flex-col bg-[#0a0a0c] relative overflow-hidden min-h-0">
                <div className="absolute inset-0 bg-gradient-to-b from-[#00eeff]/[0.06] to-transparent pointer-events-none opacity-50" />
                {(() => {
                  const dmPeer = workspaceMembers.find((m) => m.id === dmPeerId) ?? getUser(dmPeerId);
                  const tKey = dmThreadKey(myUserId, dmPeerId);
                  const dms = dmMessagesByThread[tKey] ?? [];
                  return (
                    <>
                      <header className="shrink-0 h-16 flex items-center justify-between px-6 border-b border-white/[0.06] bg-[#0a0a0c]/90 backdrop-blur-md z-10">
                        <div className="flex items-center gap-3 min-w-0">
                          <button
                            type="button"
                            onClick={() => setDmPeerId(null)}
                            className="text-xs text-zinc-500 hover:text-[#00eeff] font-semibold uppercase tracking-widest shrink-0"
                          >
                            ← Terminal
                          </button>
                          <div className="w-px h-6 bg-white/[0.08]" />
                          {dmPeer.avatarUrl?.trim() ? (
                            <img src={dmPeer.avatarUrl} alt="" className="w-9 h-9 rounded-xl object-cover border border-white/[0.08]" />
                          ) : (
                            <div className="w-9 h-9 rounded-xl bg-black border border-white/[0.08] flex items-center justify-center text-xs font-bold text-white">
                              {dmPeer.name.charAt(0)}
                            </div>
                          )}
                          <div className="min-w-0">
                            <NickLabel user={dmPeer} fallbackColor="#f4f4f5" className="font-bold text-base truncate block" />
                            <p className="text-[10px] text-zinc-500 uppercase tracking-widest">Wiadomość bezpośrednia</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            title="Rozmowa głosowa PV"
                            onClick={() => setPvCall({ peerId: dmPeerId, status: 'ringing' })}
                            className="p-2.5 rounded-xl text-zinc-400 hover:text-[#00eeff] hover:bg-[#00eeff]/10 border border-transparent hover:border-[#00eeff]/25 transition-all"
                          >
                            <Phone size={18} />
                          </button>
                          <button
                            type="button"
                            title="Rozmowa wideo PV"
                            onClick={() => setPvCall({ peerId: dmPeerId, status: 'ringing' })}
                            className="p-2.5 rounded-xl text-zinc-400 hover:text-[#00eeff] hover:bg-[#00eeff]/10 border border-transparent hover:border-[#00eeff]/25 transition-all"
                          >
                            <Video size={18} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setProfileCardUser(dmPeer)}
                            className="p-2.5 rounded-xl text-zinc-400 hover:text-white hover:bg-white/[0.06] border border-white/[0.06] transition-all ml-1"
                          >
                            <User size={18} />
                          </button>
                        </div>
                      </header>
                      <div className="flex-1 overflow-y-auto custom-scrollbar px-6 py-6 relative z-10">
                        <div className="max-w-3xl mx-auto w-full flex flex-col gap-3 pb-28">
                          {dms.length === 0 ? (
                            <div className="rounded-2xl border border-dashed border-white/[0.1] bg-black/30 p-8 text-center text-zinc-500 text-sm">
                              Zacznij rozmowę z <span className="text-zinc-300 font-semibold">{dmPeer.name}</span>. Historia jest zapisana lokalnie w tej przeglądarce.
                            </div>
                          ) : (
                            dms.map((row) => {
                              const isMe = row.userId === myUserId;
                              const u = getUser(row.userId);
                              return (
                                <div
                                  key={row.id}
                                  className={`flex gap-3 ${isMe ? 'flex-row-reverse' : ''}`}
                                >
                                  <div className="w-8 h-8 shrink-0 rounded-lg border border-white/[0.08] overflow-hidden bg-black flex items-center justify-center text-[10px] font-bold text-zinc-400">
                                    {u.avatarUrl?.trim() ? (
                                      <img src={u.avatarUrl} alt="" className="w-full h-full object-cover" />
                                    ) : (
                                      u.name.charAt(0)
                                    )}
                                  </div>
                                  <div
                                    className={`max-w-[min(85%,520px)] rounded-2xl px-4 py-2.5 text-sm leading-relaxed border ${
                                      isMe
                                        ? 'bg-[#00eeff]/15 border-[#00eeff]/25 text-zinc-100'
                                        : 'bg-white/[0.04] border-white/[0.08] text-zinc-200'
                                    }`}
                                  >
                                    {row.content}
                                    <div className="text-[9px] text-zinc-500 mt-1.5 tabular-nums">{row.time}</div>
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                      <div className="shrink-0 absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-[#0a0a0c] via-[#0a0a0c] to-transparent z-20">
                        <div className="max-w-3xl mx-auto flex gap-2 items-end bg-[#111]/95 border border-white/[0.08] rounded-2xl p-2 backdrop-blur-xl shadow-[0_20px_50px_rgba(0,0,0,0.6)]">
                          <textarea
                            value={dmInputValue}
                            onChange={(e) => setDmInputValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                if (!dmInputValue.trim()) return;
                                const row: DmRow = {
                                  id: `dm_${Date.now()}`,
                                  userId: myUserId,
                                  time: new Date().toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' }),
                                  content: dmInputValue.trim(),
                                };
                                setDmMessagesByThread((prev) => ({
                                  ...prev,
                                  [tKey]: [...(prev[tKey] ?? []), row],
                                }));
                                setDmInputValue('');
                              }
                            }}
                            placeholder={`Wiadomość do ${dmPeer.name}…`}
                            rows={1}
                            className="flex-1 bg-transparent text-zinc-100 placeholder-zinc-600 px-3 py-3 outline-none resize-none text-[15px] max-h-32 custom-scrollbar"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              if (!dmInputValue.trim()) return;
                              const row: DmRow = {
                                id: `dm_${Date.now()}`,
                                userId: myUserId,
                                time: new Date().toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' }),
                                content: dmInputValue.trim(),
                              };
                              setDmMessagesByThread((prev) => ({
                                ...prev,
                                [tKey]: [...(prev[tKey] ?? []), row],
                              }));
                              setDmInputValue('');
                            }}
                            className="h-11 w-11 shrink-0 rounded-xl bg-[#00eeff] text-black flex items-center justify-center shadow-[0_0_20px_rgba(0,238,255,0.35)] disabled:opacity-40"
                            disabled={!dmInputValue.trim()}
                          >
                            <ArrowUpRight size={20} />
                          </button>
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>
            ) : (
              <div className="flex-1 flex flex-col p-6 md:p-10 bg-[#0a0a0c] overflow-y-auto custom-scrollbar relative animate-in fade-in duration-300">
                <div className="absolute inset-0 bg-gradient-to-b from-[#00eeff]/[0.08] to-transparent pointer-events-none opacity-40" />
                <div className="max-w-3xl mx-auto w-full pt-6 md:pt-10 relative z-10 space-y-8">
                  <div className="flex items-start gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-[#00eeff]/10 border border-[#00eeff]/20 flex items-center justify-center shadow-[0_0_20px_rgba(0,238,255,0.15)] shrink-0">
                      <Terminal size={26} className="text-[#00eeff]" />
                    </div>
                    <div>
                      <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">Terminal osobisty</h1>
                      <p className="text-zinc-400 text-sm mt-1 leading-relaxed">
                        Skrót do DM i szybkiego podglądu — wybierz rozmówę na liście po lewej albo przejdź do serwera z górnego menu.
                      </p>
                    </div>
                  </div>
                  <div className="rounded-3xl border border-white/[0.08] bg-[#0f0f12] p-6 md:p-8 shadow-[0_0_40px_rgba(0,0,0,0.45)] ring-1 ring-[#00eeff]/10 space-y-4">
                    <h2 className="text-sm font-bold text-[#00eeff] uppercase tracking-[0.2em]">Jak zacząć</h2>
                    <ol className="list-decimal list-inside space-y-3 text-sm text-zinc-400 leading-relaxed">
                      <li>Otwórz przestrzeń roboczą serwera (ikonka nad listą kanałów).</li>
                      <li>Wróć tutaj — w sekcji „Wiadomości bezpośrednie” zobaczysz członków zespołu.</li>
                      <li>
                        Wiadomości PV są przechowywane lokalnie (ta przeglądarka). Połączenia głosowe PV używają tego samego stylu co reszta
                        aplikacji; pełny most WebRTC dla DM wymaga osobnej usługi sygnalizacji na backendzie.
                      </li>
                    </ol>
                    {servers.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setActiveServer(servers[0].id)}
                        className="mt-4 px-5 py-2.5 rounded-xl bg-[#00eeff]/15 border border-[#00eeff]/30 text-[#00eeff] text-sm font-bold hover:bg-[#00eeff]/25 transition-colors"
                      >
                        Przejdź do ostatniego serwera
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          ) : API_BASE_URL && servers.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-10 text-center">
              <div className="w-20 h-20 rounded-3xl bg-[#00eeff]/10 border border-[#00eeff]/25 flex items-center justify-center mb-8">
                <Server size={40} className="text-[#00eeff]" />
              </div>
              <h1 className="text-2xl font-bold text-white mb-2 tracking-tight">System pusty</h1>
              <p className="text-zinc-500 text-sm max-w-md mb-8 leading-relaxed">
                Przejdź do <b>Terminala Osobistego</b>, aby sprawdzić DM, lub dołącz do nowej przestrzeni roboczej korzystając z przycisków w menu.
              </p>
              <div className="flex flex-wrap gap-3 justify-center">
                <button
                  type="button"
                  onClick={() => setActiveServer('')}
                  className="px-6 py-3 rounded-xl bg-[#00eeff] text-black font-bold text-sm shadow-[0_0_20px_rgba(0,238,255,0.35)] hover:scale-[1.02] transition-transform flex items-center gap-2"
                >
                  <Terminal size={16} /> Przejdź do Terminala
                </button>
                <button
                  type="button"
                  onClick={() => setCreateServerModal('create')}
                  className="px-6 py-3 rounded-xl border border-white/[0.12] text-zinc-200 font-semibold text-sm hover:bg-white/[0.05] transition-colors flex items-center gap-2"
                >
                  <Plus size={16} /> Nowy Serwer
                </button>
              </div>
            </div>
          ) : API_BASE_URL && servers.length > 0 && !currentChannelData ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-zinc-500 text-sm">
              <div className="w-16 h-16 rounded-3xl bg-white/[0.02] border border-white/[0.05] flex items-center justify-center mb-6">
                <Zap size={24} className="text-zinc-400" />
              </div>
              Brak zdefiniowanego kanału tekstawego w tej przestrzeni roboczej.
            </div>
          ) : (
          <>
          <header className="h-16 flex items-center justify-between px-6 border-b border-white/[0.04] bg-[#0a0a0c]/80 backdrop-blur-md shrink-0 z-10 transition-all">
            <div className="flex items-center gap-3 text-sm font-medium">
              {currentChannelData && <currentChannelData.icon size={20} style={{ color: currentChannelData.color }} />}
              <span className="tracking-tight font-bold text-lg" style={{ color: currentChannelData?.color, textShadow: `0 0 15px ${currentChannelData?.color}40` }}>{currentChannelData?.name}</span>
              <div className="w-[1px] h-4 bg-white/[0.1] mx-2 hidden md:block"></div>
              <span className="text-xs text-zinc-500 hidden md:block font-normal">
                {isMainViewVoice
                  ? 'Aktywna komunikacja głosowa.'
                  : Object.keys(typingUsers).filter((u) => u !== myUserId).length > 0
                    ? 'Ktoś pisze…'
                    : 'System operacyjny Devcord_.'}
              </span>
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
                    <div className="flex flex-col gap-10 mb-12 w-full">
                    {(() => {
                      type ScreenTile = { id: string; stream: MediaStream; isLocal: boolean; kind: 'screen' | 'camera' };
                      const allScreens: ScreenTile[] = [
                        ...(localScreenLive && screenStream
                          ? [{ id: myUserId, stream: screenStream, isLocal: true, kind: 'screen' as const }]
                          : []),
                        ...(localCameraLive && cameraStream
                          ? [{ id: `${myUserId}-cam`, stream: cameraStream, isLocal: true, kind: 'camera' as const }]
                          : []),
                        ...(API_BASE_URL
                          ? remoteScreenPeers.map(([id, stream]) => ({
                              id,
                              stream,
                              isLocal: false,
                              kind: 'screen' as const,
                            }))
                          : []),
                      ];
                      if (allScreens.length === 0) return null;

                      const maximized = allScreens.find(s => s.id === maximizedScreenId) || allScreens[0];
                      const others = allScreens.filter(s => s.id !== maximized.id);

                      return (
                        <div className="w-full flex flex-col gap-6">
                          {/* Maximized Screen */}
                          <div className="w-full aspect-video rounded-3xl border border-white/[0.12] bg-[#0a0a0c] p-2 shadow-[0_0_60px_rgba(0,0,0,0.5)] relative group transition-all duration-700 overflow-hidden">
                            {maximized.isLocal ? (
                              maximized.kind === 'camera' ? (
                                <>
                                  <div className="w-full h-full rounded-2xl overflow-hidden relative">
                                    <VideoPlayer stream={maximized.stream} isLocal={true} className="w-full h-full object-contain bg-[#030303]" />
                                    <div className="absolute top-4 left-4 z-20 px-3 py-1.5 bg-black/60 backdrop-blur-md rounded-lg text-[10px] uppercase tracking-widest font-black text-white border border-emerald-400/30 flex items-center gap-2">
                                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_#34d399]"></span>
                                      Kamera
                                    </div>
                                  </div>
                                </>
                              ) : (
                                <>
                                  <div className="absolute top-0 left-0 w-12 h-12 border-t-2 border-l-2 border-[#00eeff]/80 rounded-tl-3xl z-10 transition-all duration-500 group-hover:w-16 group-hover:h-16 shadow-[-5px_-5px_15px_rgba(0,238,255,0.2)]"></div>
                                  <div className="absolute top-0 right-0 w-12 h-12 border-t-2 border-r-2 border-[#00eeff]/80 rounded-tr-3xl z-10 transition-all duration-500 group-hover:w-16 group-hover:h-16 shadow-[5px_-5px_15px_rgba(0,238,255,0.2)]"></div>
                                  <div className="absolute bottom-0 left-0 w-12 h-12 border-b-2 border-l-2 border-[#00eeff]/80 rounded-bl-3xl z-10 transition-all duration-500 group-hover:w-16 group-hover:h-16 shadow-[-5px_5px_15px_rgba(0,238,255,0.2)]"></div>
                                  <div className="absolute bottom-0 right-0 w-12 h-12 border-b-2 border-r-2 border-[#00eeff]/80 rounded-br-3xl z-10 transition-all duration-500 group-hover:w-16 group-hover:h-16 shadow-[5px_5px_15px_rgba(0,238,255,0.2)]"></div>
                                  <div className="w-full h-full rounded-2xl overflow-hidden relative">
                                    <VideoPlayer stream={maximized.stream} isLocal={true} className="w-full h-full object-contain bg-[#030303]" />
                                    <div className="absolute top-4 left-4 z-20 px-3 py-1.5 bg-black/60 backdrop-blur-md rounded-lg text-[10px] uppercase tracking-widest font-black text-white border border-[#00eeff]/30 flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-[#00eeff] animate-pulse shadow-[0_0_8px_#00eeff]"></span>Twój ekran</div>
                                    
                                    <div className="absolute top-4 right-4 z-30 flex items-center gap-2 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/[0.1]">
                                      <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest hidden sm:block mr-2">Jakość Streamu</span>
                                      <div className="flex items-center gap-1.5 border-r border-white/[0.1] pr-2">
                                        <Monitor size={12} className="text-[#00eeff]" />
                                        <select value={screenRes} onChange={e => {
                                          const r = parseInt(e.target.value);
                                          setScreenRes(r);
                                          if (r === 1440 && screenFps > 60) setScreenFps(60);
                                        }} className="bg-transparent text-white font-semibold text-xs outline-none cursor-pointer">
                                          <option value={480} className="bg-[#111]">480p</option>
                                          <option value={720} className="bg-[#111]">720p</option>
                                          <option value={1080} className="bg-[#111]">1080p</option>
                                          <option value={1440} className="bg-[#111]">1440p (Max 60fps)</option>
                                        </select>
                                      </div>
                                      <div className="flex items-center gap-1.5 pl-1">
                                        <Zap size={12} className="text-emerald-400" />
                                        <select value={screenFps} onChange={e => setScreenFps(parseInt(e.target.value))} className="bg-transparent text-white font-semibold text-xs outline-none cursor-pointer">
                                          <option value={30} className="bg-[#111]">30 FPS</option>
                                          <option value={60} className="bg-[#111]">60 FPS</option>
                                          {screenRes < 1440 && <option value={120} className="bg-[#111]">120 FPS</option>}
                                          {screenRes < 1440 && <option value={240} className="bg-[#111]">240 FPS</option>}
                                        </select>
                                      </div>
                                    </div>
                                  </div>
                                </>
                              )
                            ) : (
                              <div
                                ref={remoteScreenHostRef}
                                className="w-full h-full rounded-2xl overflow-hidden relative bg-[#121214] min-h-[200px] flex items-center justify-center group/fs"
                              >
                                {remoteScreenWatching ? (
                                  <>
                                  <VideoPlayer
                                    key={remoteLiveVideoKey(maximized.id, maximized.stream)}
                                    stream={maximized.stream}
                                    volume={remoteScreenVolume}
                                    muted={remoteScreenVideoMuted}
                                    className="w-full h-full object-contain bg-[#030303]"
                                    onContextMenu={(e) => {
                                      e.preventDefault(); e.stopPropagation(); setScreenStreamContext({ x: e.clientX, y: e.clientY });
                                    }}
                                  />
                                  <button
                                    type="button"
                                    title="Pełny ekran"
                                    onClick={() => {
                                      const n = remoteScreenHostRef.current;
                                      if (!n) return;
                                      void (document.fullscreenElement
                                        ? document.exitFullscreen()
                                        : n.requestFullscreen?.());
                                    }}
                                    className="absolute top-4 right-4 z-40 p-2.5 rounded-xl bg-black/70 border border-white/[0.12] text-white opacity-90 hover:opacity-100 hover:border-[#00eeff]/40 transition-all shadow-lg"
                                  >
                                    <Maximize2 size={18} />
                                  </button>
                                  </>
                                ) : (
                                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 p-8">
                                    <button onClick={() => setRemoteScreenWatching(true)} className="px-8 py-3.5 rounded-2xl bg-white/[0.08] hover:bg-white/[0.12] border border-white/[0.1] text-white text-sm font-bold tracking-wide transition-colors">Obejrzyj stream</button>
                                  </div>
                                )}
                                <div className="absolute bottom-4 left-4 flex items-center gap-2 px-3 py-1.5 rounded-xl bg-black/75 border border-white/[0.08] text-white text-xs font-semibold pointer-events-none max-w-[min(92%,20rem)] min-w-0">
                                  <Monitor size={14} className="text-[#00eeff] shrink-0" />
                                  {maximized.isLocal ? (
                                    <span className="truncate">{maximized.kind === 'camera' ? 'Kamera' : 'Twój ekran'}</span>
                                  ) : (
                                    <>
                                      <UserAvatarBubble user={getUser(maximized.id)} className="w-7 h-7 rounded-lg" />
                                      <NickLabel
                                        user={getUser(maximized.id)}
                                        fallbackColor="#fafafa"
                                        className="truncate text-xs font-semibold min-w-0"
                                      />
                                    </>
                                  )}
                                </div>
                                {remoteScreenWatching && (
                                  <div className="absolute top-4 left-4 px-3 py-1.5 bg-black/60 backdrop-blur-md rounded-lg text-[10px] uppercase tracking-widest font-black text-white border border-white/[0.12] flex items-center gap-2 pointer-events-none">
                                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_#34d399]"></span>Oglądasz
                                  </div>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Thumbnail Screens */}
                          {others.length > 0 && (
                            <div className="flex flex-wrap gap-4 justify-center">
                              {others.map(s => (
                                <div key={s.id} onClick={() => setMaximizedScreenId(s.id)} className="w-64 aspect-video rounded-2xl border border-white/[0.1] bg-[#0a0a0c] overflow-hidden cursor-pointer hover:border-[#00eeff]/50 hover:shadow-[0_0_20px_rgba(0,238,255,0.15)] transition-all relative group">
                                  <VideoPlayer
                                    key={s.isLocal ? `loc-${s.id}` : remoteLiveVideoKey(s.id, s.stream)}
                                    stream={s.stream}
                                    isLocal={s.isLocal}
                                    className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity"
                                  />
                                  <div className="absolute bottom-2 left-2 flex items-center gap-1.5 px-2 py-1 rounded-lg bg-black/80 text-white text-[10px] font-semibold border border-white/[0.05] min-w-0 max-w-[95%]">
                                    {s.kind === 'camera' ? <Video size={10} className="text-emerald-400 shrink-0" /> : <Monitor size={10} className="text-[#00eeff] shrink-0" />}
                                    <span className="truncate flex items-center gap-1 min-w-0">
                                      {s.kind === 'camera' && s.isLocal ? (
                                        'Kamera'
                                      ) : s.isLocal ? (
                                        'Twój ekran'
                                      ) : (
                                        <>
                                          <UserAvatarBubble user={getUser(s.id)} className="w-4 h-4 rounded-md" />
                                          <NickLabel
                                            user={getUser(s.id)}
                                            fallbackColor="#fafafa"
                                            className="truncate font-semibold text-[10px] min-w-0"
                                          />
                                        </>
                                      )}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                    </div>
                    <div className="flex items-center gap-3 mb-8 px-2">
                      <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/[0.1] to-transparent"></div>
                      <span className="text-[10px] uppercase tracking-[0.3em] font-bold text-zinc-500">Węzły Komunikacyjne ({voiceParticipants.length})</span>
                      <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/[0.1] to-transparent"></div>
                    </div>
                    <div className="flex flex-wrap justify-center gap-6">
                      {voiceParticipants.map((uid) => {
                        const u = getUser(uid); const isSelf = uid === myUserId; const isSpeaking = !!speakingPeers[uid];
                        const isScreenSharing =
                          (isSelf && localScreenLive) || mediaStreamHasLiveVideo(remoteScreenByUser[uid]);
                        const muted = isSelf ? localMuted : (remoteVoiceState[uid]?.muted ?? false);
                        const deafened = isSelf ? localDeafened : (remoteVoiceState[uid]?.deafened ?? false);
                        const statusLine = isSelf
                          ? (localDeafened ? 'Nie słyszysz innych · mikrofon wył.' : muted ? 'Wyciszony' : 'Połączony')
                          : deafened
                            ? 'Głuchy'
                            : muted
                              ? 'Wyciszony'
                              : 'Połączony';
                        return (
                          <div 
                            key={uid} 
                            onContextMenu={(e) => handleContextMenu(e, 'user', u)}
                            className={`group flex items-center gap-4 p-2.5 pr-6 rounded-full bg-gradient-to-r from-black/90 to-[#0a0a0c] border backdrop-blur-xl transition-all duration-500 shadow-xl cursor-pointer ${isSpeaking ? 'border-[#00eeff]/50 shadow-[0_0_30px_rgba(0,238,255,0.15)] scale-105' : 'border-white/[0.05] hover:border-white/[0.15]'} ${voiceHasScreenActivity ? 'w-64' : 'w-72 sm:w-80'}`}
                          >
                            <div className="relative shrink-0">
                              <div className={`absolute inset-0 rounded-full blur-md transition-all duration-500 ${isSpeaking ? 'bg-[#00eeff] opacity-50 animate-pulse' : 'opacity-0'}`}></div>
                              <div
                                className={`w-14 h-14 relative z-10 rounded-full flex items-center justify-center text-xl font-black transition-colors duration-500 overflow-hidden shrink-0 ${
                                  isSpeaking ? 'bg-[#000] border-2 border-[#00eeff] text-[#00eeff]' : 'bg-[#151515] border border-white/[0.1] text-zinc-400'
                                }`}
                              >
                                {u.avatarUrl?.trim() ? (
                                  <img src={u.avatarUrl} alt="" className="w-full h-full object-cover" />
                                ) : (
                                  u.name.charAt(0)
                                )}
                              </div>
                              <div className={`absolute bottom-0 right-0 w-4 h-4 rounded-full border-2 border-[#050505] flex items-center justify-center z-20 ${muted || deafened ? 'bg-red-500' : 'bg-emerald-500'}`}>
                                {deafened ? <Headphones size={8} className="text-black" /> : muted ? <MicOff size={8} className="text-black" /> : null}
                              </div>
                              {isScreenSharing && (
                                <div className="absolute -top-0.5 -left-0.5 z-30 w-5 h-5 rounded-md bg-[#00eeff]/20 border border-[#00eeff]/50 flex items-center justify-center" title="Udostępnia ekran">
                                  <Monitor size={10} className="text-[#00eeff]" />
                                </div>
                              )}
                            </div>
                            <div className="flex flex-col flex-1 min-w-0 justify-center">
                              <span
                                className={`text-[15px] font-bold truncate block transition-colors duration-300 ${isSpeaking ? 'drop-shadow-[0_0_8px_rgba(0,238,255,0.4)]' : ''}`}
                              >
                                <NickLabel
                                  user={u}
                                  fallbackColor={isSpeaking ? '#00eeff' : '#e4e4e7'}
                                  className="font-bold truncate"
                                />
                              </span>
                              <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-semibold flex items-center gap-1 mt-0.5">
                                {isScreenSharing ? <><Monitor size={10} className="text-[#00eeff]" /> Ekran · </> : null}
                                {statusLine}
                              </span>
                            </div>
                            {isSelf ? (
                              <button
                                type="button"
                                title={
                                  localDeafened
                                    ? 'Włącz odsłuch innych i mikrofon'
                                    : 'Wycisz mikrofon i przestań słyszeć innych u siebie'
                                }
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleVoiceHeadphones();
                                }}
                                disabled={voicePhase !== 'connected'}
                                className={`w-10 h-10 shrink-0 rounded-full flex items-center justify-center transition-colors border ${
                                  localDeafened
                                    ? 'bg-red-500/15 text-red-400 border-red-500/35'
                                    : 'bg-white/[0.05] text-zinc-200 border-white/[0.08] hover:bg-white/[0.1]'
                                } disabled:opacity-40 disabled:cursor-not-allowed`}
                              >
                                <Headphones size={18} className={localDeafened ? 'opacity-50' : ''} />
                              </button>
                            ) : null}
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
                <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-3">
                  {voiceMixPanelOpen && voicePhase === 'connected' && (
                    <div
                      className="max-h-[min(50vh,320px)] w-[min(92vw,380px)] overflow-y-auto custom-scrollbar rounded-2xl border border-white/[0.1] bg-[#0c0c0e]/95 backdrop-blur-2xl shadow-[0_20px_60px_rgba(0,0,0,0.85)] p-3 text-left"
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2 px-1">Miks uczestników (tylko u Ciebie)</div>
                      {voiceParticipants.filter((id) => id !== myUserId).length === 0 ? (
                        <p className="text-xs text-zinc-500 px-1 py-2">Brak innych uczestników na kanale.</p>
                      ) : (
                        <ul className="flex flex-col gap-2">
                          {voiceParticipants
                            .filter((id) => id !== myUserId)
                            .map((uid) => {
                              const u = getUser(uid);
                              const vol = userVolumes[uid] ?? 1;
                              const outMuted = !!userOutputMuted[uid];
                              return (
                                <li key={uid} className="flex flex-col gap-1.5 rounded-xl bg-white/[0.03] border border-white/[0.06] px-3 py-2">
                                  <div className="flex items-center justify-between gap-2 min-w-0">
                                    <div className="flex items-center gap-2 min-w-0 flex-1">
                                      <UserAvatarBubble user={u} className="w-8 h-8 rounded-full" />
                                      <NickLabel user={u} fallbackColor="#e4e4e7" className="text-sm font-semibold truncate min-w-0" />
                                    </div>
                                    <button
                                      type="button"
                                      title={outMuted ? 'Włącz odsłuch' : 'Wycisz odsłuch'}
                                      onClick={() => {
                                        const next = !outMuted;
                                        setUserOutputMutedMap((prev) => ({ ...prev, [uid]: next }));
                                        setPeerOutputMute(uid, next);
                                      }}
                                      className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center border transition-colors ${outMuted ? 'bg-red-500/20 text-red-400 border-red-500/35' : 'bg-white/[0.06] text-zinc-300 border-white/[0.08] hover:bg-white/[0.1]'}`}
                                    >
                                      {outMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
                                    </button>
                                  </div>
                                  <div className="flex flex-col gap-1">
                                    <div className="flex items-center gap-2">
                                      <span className="text-[9px] text-zinc-400 tabular-nums min-w-[9rem] text-right shrink-0 leading-tight">
                                        {voiceVolumeUiLabel(vol)}
                                      </span>
                                      <input
                                        type="range"
                                        min="0.25"
                                        max="4"
                                        step="0.05"
                                        value={vol}
                                        onChange={(e) => {
                                          const v = parseFloat(e.target.value);
                                          setUserVolumes((prev) => ({ ...prev, [uid]: v }));
                                          setUserVolume(uid, v);
                                        }}
                                        className="flex-1 min-w-0 h-1.5 rounded-full appearance-none bg-white/[0.1] accent-[#00eeff]"
                                      />
                                    </div>
                                    <span className="text-[9px] text-zinc-600">100% = poziom bazowy, powyżej = boost.</span>
                                  </div>
                                </li>
                              );
                            })}
                        </ul>
                      )}
                    </div>
                  )}
                  <div className="bg-[#0a0a0c]/80 backdrop-blur-2xl border border-white/[0.1] rounded-full flex items-center p-2 shadow-[0_20px_60px_rgba(0,0,0,0.8)] gap-2">
                    <button
                      type="button"
                      onClick={() => toggleVoiceMic()}
                      className={`w-14 h-14 rounded-full flex items-center justify-center transition-all duration-300 border ${localMuted || localDeafened ? 'bg-red-500/20 text-red-400 border-red-500/40 shadow-[0_0_15px_rgba(239,68,68,0.2)]' : 'bg-white/[0.05] text-zinc-200 border-white/[0.05] hover:bg-white/[0.1]'}`}
                      title={localDeafened ? 'Wyłącz tryb głuchy i włącz mikrofon' : localMuted ? 'Włącz mikrofon' : 'Wycisz mikrofon'}
                    >
                      {localMuted || localDeafened ? <MicOff size={22} /> : <Mic size={22} />}
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleVoiceHeadphones()}
                      disabled={voicePhase !== 'connected'}
                      className={`w-12 h-12 rounded-full flex items-center justify-center transition-all border shrink-0 ${
                        localDeafened ? 'bg-red-500/15 text-red-400 border-red-500/35' : 'bg-white/[0.05] text-zinc-200 border-white/[0.08] hover:bg-white/[0.1]'
                      } disabled:opacity-40 disabled:cursor-not-allowed`}
                      title={localDeafened ? 'Włącz odsłuch innych i mikrofon' : 'Wycisz mikrofon i przestań słyszeć innych'}
                    >
                      <Headphones size={20} className={localDeafened ? 'opacity-50' : ''} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setVoiceMixPanelOpen((o) => !o)}
                      disabled={voicePhase !== 'connected'}
                      className={`w-12 h-12 rounded-full flex items-center justify-center transition-all border shrink-0 ${voiceMixPanelOpen ? 'bg-[#00eeff]/15 text-[#00eeff] border-[#00eeff]/35' : 'bg-white/[0.05] text-zinc-300 border-white/[0.08] hover:bg-white/[0.1]'} disabled:opacity-40 disabled:cursor-not-allowed`}
                      title="Głośność i wyciszenie odsłuchu uczestników"
                    >
                      <SlidersHorizontal size={20} />
                    </button>
                    <div className="w-px h-8 bg-white/[0.1] mx-1"></div>
                    <button onClick={toggleScreenShare} className={`px-6 h-14 rounded-full flex items-center gap-3 font-bold uppercase tracking-wider text-[11px] transition-all duration-300 border ${screenStream ? 'bg-[#00eeff] text-black border-[#00eeff] shadow-[0_0_20px_rgba(0,238,255,0.4)]' : 'bg-white/[0.05] text-zinc-200 border-white/[0.05] hover:bg-white/[0.1]'}`}>
                      <MonitorUp size={20} />{screenStream ? 'Zakończ transmisję' : 'Udostępnij ekran'}
                    </button>
                    <div className="w-px h-8 bg-white/[0.1] mx-1"></div>
                    <button onClick={disconnectVoice} className="w-14 h-14 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center transition-all duration-300 shadow-[0_0_20px_rgba(239,68,68,0.4)] hover:shadow-[0_0_30px_rgba(239,68,68,0.6)]" title="Rozłącz"><PhoneOff size={22} /></button>
                  </div>
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
                <div className={`${isZenMode ? 'max-w-3xl' : 'max-w-4xl'} mx-auto w-full flex flex-col mt-auto transition-all duration-500`}>
                  
                  <div className="pb-6 border-b border-white/[0.05] mb-6 flex flex-col items-start mt-8">
                    <div className="w-16 h-16 rounded-3xl border flex items-center justify-center mb-6 shadow-lg" style={{ backgroundColor: `${currentChannelData?.color}10`, borderColor: `${currentChannelData?.color}30`, boxShadow: `0 0 30px ${currentChannelData?.color}20` }}>
                      {currentChannelData && <currentChannelData.icon size={32} style={{ color: currentChannelData.color }} />}
                    </div>
                    <h1 className="text-3xl font-bold tracking-tighter mb-2" style={{ color: currentChannelData?.color, textShadow: `0 0 20px ${currentChannelData?.color}40` }}>Witaj na #{currentChannelData?.name || 'kanale'}!</h1>
                    <p className="text-zinc-500 text-sm">
                      {DEMO_MODE ? 'Prywatna instancja Devcord_. Tutaj pomysły płyną szybciej.' : 'To jest początek kanału — napisz pierwszą wiadomość poniżej.'}
                    </p>
                  </div>

                  <div className="flex flex-col">
                  {messages.map((msg, idx, arr) => {
                    const showHeader = idx === 0 || arr[idx - 1].userId !== msg.userId;
                    const user = getUser(msg.userId);
                    const role = getRole(user.roleId);
                    const isAI = msg.userId === 'devcord_ai';
                    const groupTop =
                      idx === 0 ? '' : showHeader ? 'mt-6' : 'mt-1.5';
                    const rowPad = showHeader ? 'py-2' : 'py-0.5';
                    
                    return (
                      <div 
                        key={msg.id} 
                        onContextMenu={(e) => handleContextMenu(e, 'message', msg)}
                        className={`group flex gap-4 hover:bg-white/[0.02] -mx-4 px-4 ${rowPad} ${groupTop} rounded-xl transition-colors relative ${activeThread?.id === msg.id ? 'bg-white/[0.04] border border-white/[0.05]' : 'border border-transparent'}`}
                      >
                        <div className={`w-10 shrink-0 flex justify-center ${showHeader ? 'mt-1' : 'mt-0'}`}>
                          {showHeader ? (
                            <div 
                              onContextMenu={(e) => { if(!isAI) handleContextMenu(e, 'user', user); }}
                              className={`w-10 h-10 rounded-xl border flex items-center justify-center font-bold text-sm shadow-inner overflow-hidden transition-opacity ${!isAI ? 'cursor-pointer hover:opacity-80' : ''} ${isAI ? 'bg-[#00eeff]/20 border-[#00eeff]/50 text-[#00eeff]' : 'bg-black border-white/[0.08] text-zinc-300'}`}
                            >
                              {isAI ? (
                                <Sparkles size={18}/>
                              ) : user.avatarUrl?.trim() ? (
                                <img src={user.avatarUrl} alt="" className="w-full h-full object-cover" />
                              ) : (
                                user.name.charAt(0)
                              )}
                            </div>
                          ) : (
                            <div className="w-10 text-[9px] text-zinc-600 opacity-0 group-hover:opacity-100 text-center leading-[24px]">{msg.time}</div>
                          )}
                        </div>

                        <div className="flex-1 flex flex-col min-w-0">
                          {showHeader && (
                            <div className="flex items-baseline gap-2 mb-1.5">
                              <span
                                onContextMenu={(e) => {
                                  if (!isAI) handleContextMenu(e, 'user', user);
                                }}
                                className={`font-semibold text-[14px] tracking-wide ${!isAI ? 'cursor-pointer hover:underline' : ''}`}
                              >
                                {isAI ? (
                                  <span
                                    style={{
                                      color: '#00eeff',
                                      textShadow: '0 0 15px #00eeff60',
                                    }}
                                  >
                                    {user.name}
                                  </span>
                                ) : (
                                  <NickLabel user={user} fallbackColor={role.color} />
                                )}
                              </span>
                              {!isAI && role.name !== 'Member' && role.id !== 'r4' && (
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
                  </div>
                  
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
                        <span className="ml-3 text-sm text-[#00eeff]/70 font-medium">Devcord AI analizuje...</span>
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
                        <input autoFocus value={inputValue} onChange={(e) => setInputValue(e.target.value)} onKeyDown={handleKeyDown} placeholder="Poproś Devcord AI o pomoc, podsumowanie lub kod..." className="flex-1 bg-transparent text-sm font-medium text-[#00eeff] outline-none placeholder-[#00eeff]/50" />
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
                          <button onClick={() => setIsAIPromptOpen(true)} className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[#00eeff]/10 text-[#00eeff] hover:bg-[#00eeff]/20 text-[10px] font-bold uppercase tracking-widest transition-colors"><Sparkles size={10} /> DEVCORD AI</button>
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
            <div className="absolute bottom-32 right-8 w-80 max-w-[calc(100vw-2rem)] max-h-[min(85vh,520px)] flex flex-col bg-[#111111]/95 backdrop-blur-3xl border border-[#00eeff]/20 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.8)] z-40 overflow-hidden animate-in slide-in-from-bottom-6 fade-in duration-300">
              {(() => {
                const voiceChan = channels.find((c) => c.id === activeVoiceChannel);
                if (!voiceChan) return null;
                const dotClass = voicePhase === 'connected' ? 'bg-[#00eeff] shadow-[0_0_8px_#00eeff]' : voicePhase === 'error' ? 'bg-red-500' : 'bg-amber-400 animate-pulse';
                return (
                  <>
                    <div className="px-4 py-3 border-b border-white/[0.05] flex items-center justify-between bg-white/[0.02] gap-2 cursor-pointer hover:bg-[#00eeff]/5 transition-colors shrink-0" onClick={() => setActiveChannel(voiceChan.id)}>
                      <div className="flex items-center gap-2 min-w-0">
                        <div className={`w-2 h-2 rounded-full shrink-0 ${dotClass}`} />
                        <span className="text-xs font-semibold tracking-wide truncate" style={{ color: voiceChan.color }}>{voiceChan.name}</span>
                      </div>
                      <span className="text-[10px] text-[#00eeff] font-bold uppercase tracking-widest shrink-0 hover:underline">Wróć na grid</span>
                    </div>
                    {voiceMixPanelOpen && voicePhase === 'connected' && (
                      <div
                        className="px-3 py-2 border-b border-white/[0.06] overflow-y-auto custom-scrollbar max-h-[220px] shrink-0"
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="text-[9px] font-bold uppercase tracking-widest text-zinc-500 mb-2 px-0.5">Miks uczestników</div>
                        {voiceParticipants.filter((id) => id !== myUserId).length === 0 ? (
                          <p className="text-[11px] text-zinc-500 py-1">Brak innych uczestników.</p>
                        ) : (
                          <ul className="flex flex-col gap-2">
                            {voiceParticipants
                              .filter((id) => id !== myUserId)
                              .map((uid) => {
                                const u = getUser(uid);
                                const vol = userVolumes[uid] ?? 1;
                                const outMuted = !!userOutputMuted[uid];
                                return (
                                  <li key={uid} className="flex flex-col gap-1 rounded-lg bg-white/[0.04] border border-white/[0.06] px-2 py-1.5">
                                    <div className="flex items-center justify-between gap-1 min-w-0">
                                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                        <UserAvatarBubble user={u} className="w-6 h-6 rounded-full" />
                                        <NickLabel user={u} fallbackColor="#e4e4e7" className="text-xs font-semibold truncate min-w-0" />
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const next = !outMuted;
                                          setUserOutputMutedMap((prev) => ({ ...prev, [uid]: next }));
                                          setPeerOutputMute(uid, next);
                                        }}
                                        className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center border ${outMuted ? 'bg-red-500/20 text-red-400 border-red-500/35' : 'bg-white/[0.06] text-zinc-300 border-white/[0.08]'}`}
                                      >
                                        {outMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                                      </button>
                                    </div>
                                    <div className="flex flex-col gap-0.5">
                                      <div className="flex items-center gap-1.5">
                                        <span className="text-[8px] text-zinc-400 tabular-nums min-w-[8rem] text-right shrink-0 leading-tight">
                                          {voiceVolumeUiLabel(vol)}
                                        </span>
                                        <input
                                          type="range"
                                          min="0.25"
                                          max="4"
                                          step="0.05"
                                          value={vol}
                                          onChange={(e) => {
                                            const v = parseFloat(e.target.value);
                                            setUserVolumes((prev) => ({ ...prev, [uid]: v }));
                                            setUserVolume(uid, v);
                                          }}
                                          className="flex-1 min-w-0 h-1 rounded-full appearance-none bg-white/[0.1] accent-[#00eeff]"
                                        />
                                      </div>
                                    </div>
                                  </li>
                                );
                              })}
                          </ul>
                        )}
                      </div>
                    )}
                    <div className="px-4 py-3 bg-black/40 flex items-center justify-center gap-2 flex-wrap shrink-0">
                      <button
                        type="button"
                        onClick={() => toggleVoiceMic()}
                        className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors border ${localMuted || localDeafened ? 'bg-red-500/15 text-red-400 border-red-500/35' : 'bg-white/[0.05] text-zinc-200 border-white/[0.08] hover:bg-white/[0.1]'}`}
                        title={localDeafened ? 'Wyłącz tryb głuchy i włącz mikrofon' : localMuted ? 'Włącz mikrofon' : 'Wycisz mikrofon'}
                      >
                        {localMuted || localDeafened ? <MicOff size={16} /> : <Mic size={16} />}
                      </button>
                      <button
                        type="button"
                        onClick={() => setVoiceMixPanelOpen((o) => !o)}
                        disabled={voicePhase !== 'connected'}
                        className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors border shrink-0 ${voiceMixPanelOpen ? 'bg-[#00eeff]/15 text-[#00eeff] border-[#00eeff]/35' : 'bg-white/[0.05] text-zinc-300 border-white/[0.08] hover:bg-white/[0.1]'} disabled:opacity-40`}
                        title="Miks uczestników"
                      >
                        <SlidersHorizontal size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleVoiceHeadphones()}
                        disabled={voicePhase !== 'connected'}
                        className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors border shrink-0 ${localDeafened ? 'bg-red-500/15 text-red-400 border-red-500/35' : 'bg-white/[0.05] text-zinc-200 border-white/[0.08] hover:bg-white/[0.1]'} disabled:opacity-40`}
                        title={localDeafened ? 'Włącz odsłuch innych i mikrofon' : 'Wycisz mikrofon i przestań słyszeć innych'}
                      >
                        <Headphones size={16} className={localDeafened ? 'opacity-50' : ''} />
                      </button>
                      <button onClick={disconnectVoice} className="w-10 h-10 rounded-full bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/30 flex items-center justify-center transition-colors shadow-[0_0_15px_rgba(239,68,68,0.2)]"><PhoneOff size={16} /></button>
                    </div>
                  </>
                );
              })()}
            </div>
          )}
          </>
          )}
        </main>

        {/* --- 4. INTELIGENTNY PRAWY PANEL (WĄTKI, ZADANIA, PLIKI) --- */}
        {!isZenMode && (rightPanelTab || activeThread) && !(API_BASE_URL && servers.length === 0) && (
          <aside
            className={`w-[320px] backdrop-blur-xl border-l flex flex-col shrink-0 z-20 transition-all duration-300 shadow-2xl flux-rightbar ${
              localTheme === 'light' ? 'bg-zinc-50/95 border-zinc-200' : 'bg-[#080808]/80 border-white/[0.04]'
            }`}
          >
            
            {activeThread ? (
              // WIDOK WĄTKU
              <>
                <div className="h-16 border-b border-white/[0.04] flex items-center justify-between px-5 bg-black/20">
                  <div className="flex items-center gap-2"><MessageSquareShare size={16} className="text-[#00eeff]" /><span className="text-sm font-semibold tracking-wide text-white">Wątek Devcord</span></div>
                  <button onClick={() => setActiveThread(null)} className="p-1.5 text-zinc-500 hover:text-white hover:bg-white/[0.1] rounded-lg transition-colors"><X size={16} /></button>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col relative">
                  <div className="p-5 border-b border-white/[0.02] bg-white/[0.01]">
                    <div className="flex items-center gap-2 mb-3 min-w-0">
                      <UserAvatarBubble user={getUser(activeThread.userId)} className="w-6 h-6 rounded-md" />
                      <NickLabel
                        user={getUser(activeThread.userId)}
                        fallbackColor="#fafafa"
                        className="text-xs font-semibold truncate min-w-0"
                      />
                      <span className="text-[10px] text-zinc-600 shrink-0">{activeThread.time}</span>
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
                      {workspaceRoles.map(role => {
                        const usersInRole = workspaceMembers.filter((u) => u.roleId === role.id);
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
                                    {user.avatarUrl?.trim() ? (
                                      <img src={user.avatarUrl} alt="" className="w-8 h-8 rounded-xl object-cover border border-white/[0.08]" />
                                    ) : (
                                      <div className="w-8 h-8 rounded-xl bg-black border border-white/[0.08] flex items-center justify-center text-xs font-bold transition-all duration-300" style={{ color: role.color }}>{user.name.charAt(0)}</div>
                                    )}
                                    <div className={`absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-[#0a0a0c] ${user.status === 'online' ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]' : user.status === 'idle' ? 'bg-amber-400' : user.status === 'dnd' ? 'bg-red-500' : 'bg-zinc-600'}`}></div>
                                  </div>
                                  <NickLabel user={user} fallbackColor={role.color} className="text-[13px] font-semibold truncate tracking-wide" />
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
                              <div className="flex items-center gap-2 mt-1 text-[10px] text-zinc-500 min-w-0">
                                <span>{file.size}</span>
                                <span className="w-1 h-1 bg-zinc-700 rounded-full shrink-0" />
                                <UserAvatarBubble user={uploader} className="w-4 h-4 rounded-md shrink-0" />
                                <NickLabel user={uploader} fallbackColor="#a1a1aa" className="truncate min-w-0 text-[10px]" />
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
                                  <span className="flex items-center gap-1.5 text-zinc-500 bg-white/[0.05] px-1.5 py-0.5 rounded border border-white/[0.05] min-w-0 max-w-full">
                                    <User size={10} className="shrink-0 opacity-70" />
                                    <UserAvatarBubble user={assignee} className="w-4 h-4 rounded-md shrink-0" />
                                    <NickLabel user={assignee} fallbackColor="#a1a1aa" className="truncate text-[10px] min-w-0" />
                                  </span>
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

      {profileCardUser &&
        (() => {
          const pc = profileCardUser;
          const pr = getRole(pc.roleId);
          const cardBg = '#111214';
          const statusDot =
            pc.status === 'online'
              ? 'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.65)]'
              : pc.status === 'idle'
                ? 'bg-amber-400'
                : pc.status === 'dnd'
                  ? 'bg-red-500'
                  : 'bg-zinc-600';
          let originLabel = 'Devcord_';
          try {
            originLabel = new URL(appPublicOrigin()).host || originLabel;
          } catch {
            /* ignore */
          }
          return (
            <div
              className="fixed inset-0 z-[460] flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-md"
              role="presentation"
              onClick={() => setProfileCardUser(null)}
            >
              <div
                className="w-full max-w-[420px] max-h-[90vh] overflow-y-auto custom-scrollbar rounded-2xl border border-white/[0.07] bg-[#111214]/96 backdrop-blur-2xl shadow-[0_24px_80px_rgba(0,0,0,0.85),0_0_60px_rgba(0,238,255,0.07)] ring-1 ring-white/[0.05]"
                style={{ ['--card-surface' as string]: cardBg }}
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-labelledby="profile-card-title"
              >
                <div className="relative h-[118px] overflow-hidden shrink-0">
                  <div className="absolute inset-0 bg-gradient-to-br from-[#061018] via-[#12081c] to-[#050506]" />
                  <div
                    className="absolute -top-16 left-[12%] h-48 w-48 rounded-full bg-[#00eeff]/35 blur-[46px] motion-safe:animate-pulse"
                    aria-hidden
                  />
                  <div
                    className="absolute -top-12 right-[8%] h-44 w-44 rounded-full bg-fuchsia-600/40 blur-[42px] motion-safe:animate-pulse"
                    style={{ animationDelay: '400ms' }}
                    aria-hidden
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#111214] via-[#111214]/40 to-transparent" />
                  <div className="absolute inset-0 opacity-[0.12] bg-[url('data:image/svg+xml,%3Csvg%20viewBox%3D%220%200%20256%20256%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cfilter%20id%3D%22n%22%3E%3CfeTurbulence%20type%3D%22fractalNoise%22%20baseFrequency%3D%220.9%22%20numOctaves%3D%224%22%2F%3E%3C%2Ffilter%3E%3Crect%20width%3D%22100%25%22%20height%3D%22100%25%22%20filter%3D%22url(%23n)%22%2F%3E%3C%2Fsvg%3E')]" />
                  <button
                    type="button"
                    aria-label="Zamknij"
                    onClick={() => setProfileCardUser(null)}
                    className="absolute top-3 right-3 z-10 p-2 rounded-xl text-white/70 hover:text-white hover:bg-white/[0.08] transition-colors"
                  >
                    <X size={18} />
                  </button>
                </div>

                <div className="relative px-5 pb-5 -mt-[52px]">
                  <div className="flex items-start gap-4">
                    <div className="relative shrink-0">
                      <div
                        className="w-[88px] h-[88px] rounded-full border-[4px] border-[#111214] bg-[#18181b] overflow-hidden shadow-[0_12px_40px_rgba(0,0,0,0.65)] ring-1 ring-white/[0.06]"
                      >
                        {pc.avatarUrl?.trim() ? (
                          <img src={pc.avatarUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-3xl font-black text-zinc-200">
                            {pc.name.charAt(0)}
                          </div>
                        )}
                      </div>
                      <div
                        className={`absolute bottom-1 right-1 z-10 h-[18px] w-[18px] rounded-full border-[3px] border-[#111214] ${statusDot}`}
                        title={pc.status}
                      />
                    </div>
                    <div className="flex-1 min-w-0 pt-10 sm:pt-11">
                      <button
                        type="button"
                        className="inline-flex items-center gap-1.5 max-w-full px-2.5 py-1 rounded-full bg-black/45 border border-white/[0.09] text-[11px] text-zinc-400 hover:border-[#00eeff]/25 hover:text-zinc-200 transition-colors"
                        onClick={() => copyToClipboard(appPublicOrigin())}
                      >
                        <Globe size={12} className="text-[#00eeff]/80 shrink-0" />
                        <span className="truncate font-medium">{originLabel}</span>
                      </button>
                    </div>
                  </div>

                  <h2 id="profile-card-title" className="mt-4 min-w-0">
                    <NickLabel user={pc} fallbackColor="#f4f4f5" className="text-[22px] sm:text-2xl font-bold leading-tight tracking-tight block" />
                  </h2>
                  <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[13px] text-zinc-500">
                    <span className="font-mono text-[11px] text-zinc-500 tabular-nums">id · {pc.id}</span>
                    <span className="text-zinc-700 hidden sm:inline">·</span>
                    <span
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border"
                      style={{
                        backgroundColor: pr.bg,
                        borderColor: pr.border,
                        color: pr.color,
                        boxShadow: pr.glow !== 'none' ? `0 0 12px ${pr.color}22` : undefined,
                      }}
                    >
                      <pr.icon size={10} strokeWidth={2.5} />
                      {pr.name}
                    </span>
                  </div>

                  <div className="mt-5 flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setActiveServer('');
                        setDmPeerId(pc.id);
                        setProfileCardUser(null);
                      }}
                      className="flex-1 min-w-0 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-[#00eeff] text-black text-sm font-bold shadow-[0_0_24px_rgba(0,238,255,0.22)] hover:brightness-110 transition-all"
                    >
                      <MessageSquare size={18} className="shrink-0" />
                      Wiadomość
                    </button>
                    <button
                      type="button"
                      title="Połączenie głosowe"
                      onClick={() => {
                        setPvCall({ peerId: pc.id, status: 'ringing' });
                        setProfileCardUser(null);
                      }}
                      className="shrink-0 w-11 h-11 rounded-lg flex items-center justify-center border border-white/[0.1] bg-[#2b2d31] text-zinc-200 hover:bg-[#35373c] hover:border-[#00eeff]/25 hover:text-[#00eeff] transition-colors"
                    >
                      <Phone size={18} />
                    </button>
                    <button
                      type="button"
                      title="Zaproś / więcej"
                      onClick={() => {
                        setActiveServer('');
                        setDmPeerId(pc.id);
                        setProfileCardUser(null);
                      }}
                      className="shrink-0 w-11 h-11 rounded-lg flex items-center justify-center border border-white/[0.1] bg-[#2b2d31] text-zinc-200 hover:bg-[#35373c] transition-colors"
                    >
                      <MoreHorizontal size={18} />
                    </button>
                  </div>

                  <div className="mt-8 border-t border-white/[0.06] pt-5">
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500 mb-2">O użytkowniku</p>
                    <p className="text-sm text-zinc-400 leading-relaxed">
                      Publiczny opis profilu z API pojawi się tutaj po rozszerzeniu backendu. Avatar, nick i efekty Nitro są już synchronizowane globalnie.
                    </p>
                    <a
                      href={appPublicOrigin() || '#'}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 mt-3 text-xs font-semibold text-[#00eeff] hover:underline"
                    >
                      <ExternalLink size={12} />
                      Otwórz przestrzeń Devcord
                    </a>
                  </div>

                  <div className="mt-6">
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500 mb-2 flex items-center gap-1.5">
                      <StickyNote size={12} className="text-zinc-600" />
                      Notka (tylko u Ciebie)
                    </p>
                    <textarea
                      value={profileCardNote}
                      onChange={(e) => setProfileCardNote(e.target.value)}
                      onBlur={() => {
                        try {
                          localStorage.setItem(`devcord_profile_note_${pc.id}`, profileCardNote);
                        } catch {
                          /* ignore */
                        }
                      }}
                      placeholder="Kliknij, aby dodać notkę…"
                      rows={3}
                      className="w-full rounded-xl bg-black/35 border border-white/[0.08] text-[13px] text-zinc-200 placeholder:text-zinc-600 px-3 py-2.5 outline-none focus:border-[#00eeff]/35 resize-y min-h-[76px] custom-scrollbar"
                    />
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

      {pvCall && (
        <div
          className="fixed inset-0 z-[470] flex items-center justify-center p-4 bg-black/85 backdrop-blur-lg"
          role="presentation"
          onClick={() => setPvCall(null)}
        >
          <div
            className="w-full max-w-lg rounded-3xl border border-[#00eeff]/20 bg-[#0a0a0c] p-8 shadow-[0_0_60px_rgba(0,238,255,0.12)]"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
          >
            {(() => {
              const peer = workspaceMembers.find((m) => m.id === pvCall.peerId) ?? getUser(pvCall.peerId);
              return (
                <>
                  <div className="flex flex-col items-center text-center gap-2">
                    <div className="w-20 h-20 rounded-full bg-[#00eeff]/10 border border-[#00eeff]/30 flex items-center justify-center text-2xl font-bold text-[#00eeff] animate-pulse">
                      {peer.avatarUrl?.trim() ? (
                        <img src={peer.avatarUrl} alt="" className="w-full h-full rounded-full object-cover" />
                      ) : (
                        peer.name.charAt(0)
                      )}
                    </div>
                    <NickLabel user={peer} fallbackColor="#fff" className="text-lg font-bold" />
                    <p className="text-sm text-zinc-500">
                      {pvCall.status === 'ringing' ? 'Łączenie (PV)…' : 'Połączono (lokalny interfejs UI)'}
                    </p>
                    <p className="text-xs text-zinc-600 leading-relaxed max-w-sm mt-2">
                      Pełny przekaz audio/wideo między użytkownikami wymaga sygnalizacji na serwerze. Tutaj masz spójny z Devcord_ ekran rozmowy; backend PV można dołożyć pod ten sam motyw.
                    </p>
                  </div>
                  <div className="flex justify-center gap-3 mt-8">
                    <button
                      type="button"
                      onClick={() => setPvCall(null)}
                      className="px-6 py-3 rounded-full bg-red-500/20 text-red-400 border border-red-500/40 text-sm font-bold hover:bg-red-500/30 transition-colors"
                    >
                      Rozłącz
                    </button>
                    <button
                      type="button"
                      onClick={() => setPvCall((c) => (c ? { ...c, status: 'connected' } : c))}
                      className={`px-6 py-3 rounded-full text-sm font-bold border transition-colors ${
                        pvCall.status === 'connected'
                          ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                          : 'bg-[#00eeff]/15 text-[#00eeff] border-[#00eeff]/35 hover:bg-[#00eeff]/25'
                      }`}
                    >
                      {pvCall.status === 'connected' ? 'Aktywne' : 'Symuluj odebranie'}
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

    </div>
  );
}