import React, { useState, useRef, useEffect, useMemo, useCallback, useReducer } from 'react';
import { useChatStore } from '../store/chatStore';
import type { ChatRow } from '../store/chatStore';
import { ChatMessage } from '../messaging/ChatMessage';
import { MessageInput } from '../messaging/MessageInput';
import { ServerRail } from '../layout/ServerRail';
import { ChannelSidebar } from '../layout/ChannelSidebar';
import { ChatColumn } from '../layout/ChatColumn';
import { MemberColumn } from '../layout/MemberColumn';
import { useLiveKitVoice, VOICE_PEER_GAIN_MAX, VOICE_PEER_GAIN_MIN } from './useLiveKitVoice';
import { VoiceSidebarParticipantRow, VoiceStageParticipantTile } from './VoiceSpeakingUi';
import type { VoicePhase } from './voicePhase';
import { loadDevcordLocalSettings, saveDevcordLocalSettings } from './devcordLocalSettings';
import { useSettingsStore } from '../store/settingsStore';
import { resizeImageFileToDataUrl } from './resizeAvatarImage';
import { SettingsGlowDropdown } from './SettingsGlowDropdown';
import { SettingsOverlay } from '../components/settings/SettingsOverlay';
import { UserPopout } from '../components/popout/UserPopout';
import { useChatSocket, type ChatUserUpdatedPayload, type DmMessageRow, type DmTaskEvent, type DmCallStateEvent } from './useChatSocket';
import { NickLabel } from './nickAppearance';
import { buildNickGlowJson, NICK_FONT_STACKS } from './nickGlowPresets';
import { dmThreadKey, loadDmStore, saveDmStore, type DmRow } from './dmStorage';
import { iconFromKey } from './iconMap';
import { AuthGate } from './AuthGate';
import { MemberProfileCard } from './MemberProfileCard';
import { resolveMediaUrl } from './resolveMediaUrl';
import { 
  Send, Search, Plus, ArrowUpRight, Hash, Volume2, 
  Phone, Video, Users, UserPlus, Settings, Mic, 
  Headphones, MessageSquare, Compass, Shield,
  Crown, Terminal, Sparkles, Code, Coffee, Radio, Zap,
  ChevronsUpDown, Check, Maximize2, Minimize2, Bookmark,
  ListTodo, Link, FileText, Image as ImageIcon,
  Command as CmdIcon, User, Moon, LogOut, 
  X, MicOff, PhoneOff, Palette, BellRing, MessageSquareShare,
  UploadCloud, Copy, MonitorUp, Monitor, Trash2, Edit2, MoreVertical, CheckSquare, Square, Download, FileAudio, FileArchive, Eye, UserCheck, UserMinus, BellOff, LogIn, Server, Link2, CopyPlus, ChevronDown, FolderPlus, Pin, SlidersHorizontal, VolumeX, Wifi, MoreHorizontal, StickyNote, ExternalLink, Globe
} from 'lucide-react';

// ============================================================================
// --- 1. KONFIGURACJA API (GOTOWE DO PODPIĘCIA) ---
// ============================================================================

// VITE_API_URL=http://localhost:3000/api — pusty = tryb mock (lokalne placeholdery).
const API_BASE_URL = (
  (import.meta.env.VITE_API_URL as string | undefined) ??
  'https://devcord.ndevelopment.org/api'
).replace(/\/$/, '');
const DEMO_MODE = !API_BASE_URL;
const APP_BASE_PATH = '/app';

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
  const m = path.match(/^(?:\/app)?\/channels\/([^/]+)\/([^/]+)$/i);
  if (!m?.[1] || !m?.[2]) return null;
  try {
    return { sid: decodeURIComponent(m[1]), cid: decodeURIComponent(m[2]) };
  } catch {
    return { sid: m[1], cid: m[2] };
  }
}

function writeChannelsPath(sid: string, cid: string) {
  if (typeof window === 'undefined' || !sid || !cid) return;
  const want = `${APP_BASE_PATH}/channels/${sid}/${cid}`;
  const cur = (window.location.pathname || '').replace(/\/$/, '') || '/';
  if (cur === want) return;
  window.history.replaceState({ devcord: 1 }, '', want);
}

/** Terminal osobisty / DM — usuń /channels/... żeby URL nie nadpisywał stanu po odświeżeniu. */
function writePersonalHomePath() {
  if (typeof window === 'undefined') return;
  const cur = (window.location.pathname || '').replace(/\/$/, '') || '/';
  if (cur === APP_BASE_PATH || cur === `${APP_BASE_PATH}/`) return;
  if (!/^(?:\/app)?\/channels\//i.test(cur)) return;
  window.history.replaceState({ devcord: 1 }, '', APP_BASE_PATH);
}

function readPersonalDmPath(): { cid: string } | null {
  if (typeof window === 'undefined') return null;
  const path = (window.location.pathname || '/').replace(/\/$/, '') || '/';
  const m = path.match(/^(?:\/app)?\/channels\/@me\/([^/]+)$/i);
  if (!m?.[1]) return null;
  try {
    return { cid: decodeURIComponent(m[1]) };
  } catch {
    return { cid: m[1] };
  }
}

function writePersonalDmPath(cid: string) {
  if (typeof window === 'undefined' || !cid) return;
  const want = `${APP_BASE_PATH}/channels/@me/${encodeURIComponent(cid)}`;
  const cur = (window.location.pathname || '').replace(/\/$/, '') || '/';
  if (cur === want) return;
  window.history.replaceState({ devcord: 1 }, '', want);
}

const DEVCORD_LAST_LOCATION_KEY = 'devcord_last_location';

type DevcordLastLocationV1 =
  | { v: 1; kind: 'guild'; serverId: string; channelId: string }
  | { v: 1; kind: 'dm'; conversationId: string };

function readDevcordLastLocation(): DevcordLastLocationV1 | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(DEVCORD_LAST_LOCATION_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as DevcordLastLocationV1;
    if (o?.v !== 1 || !o.kind) return null;
    if (o.kind === 'guild' && String(o.serverId) && String(o.channelId)) {
      return { v: 1, kind: 'guild', serverId: String(o.serverId), channelId: String(o.channelId) };
    }
    if (o.kind === 'dm' && String(o.conversationId)) {
      return { v: 1, kind: 'dm', conversationId: String(o.conversationId) };
    }
    return null;
  } catch {
    return null;
  }
}

function writeDevcordLastLocation(loc: DevcordLastLocationV1) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(DEVCORD_LAST_LOCATION_KEY, JSON.stringify(loc));
  } catch {
    /* ignore */
  }
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

function emitForceLogout(reason: string) {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent('devcord:force-logout', { detail: { reason } }));
  } catch {
    /* ignore */
  }
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
    if (response.status === 401) {
      clearStoredAuthToken();
      emitForceLogout('api_401');
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
type UserInfo = {
  id: string;
  name: string;
  roleId: string;
  roleIds?: string[];
  nick?: string;
  status: 'online' | 'idle' | 'dnd' | 'offline';
  avatarUrl?: string;
  nickColor?: string;
  nickGlow?: string;
  bannerUrl?: string;
  bio?: string;
};

function userFromFriendApi(p: { id?: string; name?: string; avatar_url?: string }): UserInfo | null {
  if (p.id == null || String(p.id) === '') return null;
  return {
    id: String(p.id),
    name: String(p.name ?? ''),
    roleId: '__devcord_members',
    status: 'online',
    avatarUrl: p.avatar_url,
  };
}
type Category = { id: string; name: string; isExpanded: boolean; serverId: string };
type Channel = { id: string; name: string; type: 'text' | 'voice'; color: string; icon: React.ElementType; unread?: boolean; categoryId?: string; serverId: string };
type TaskItem = { id: string; title: string; assigneeId: string; completed: boolean; sourceMsgId?: string };
type DmTaskItem = { id: string; conversationId: string; title: string; assigneeId: string; completed: boolean; sourceMsgId?: string };
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
  const [phase, setPhase] = useState<VoicePhase>('idle');

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
      setPhase('idle');
      setParticipants([]);
    }
  }, [enabled, roomId, userId]);

  return {
    phase,
    error: null as string | null,
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
    voiceDiagnostics: {
      backend: 'livekit' as const,
      connectionState: 'disconnected',
      participantCount: 0,
    },
    screenPublishStats: {
      captureFps: null as number | null,
      sendBitrateKbps: null as number | null,
      packetsLost: null as number | null,
    },
  };
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
  const g = Math.min(VOICE_PEER_GAIN_MAX, Math.max(VOICE_PEER_GAIN_MIN, linearGain));
  const pct = Math.round(g * 100);
  const x = Math.round(g * 100) / 100;
  const xStr = Number.isInteger(x) ? String(x) : x.toFixed(2).replace(/\.?0+$/, '');
  return `${pct}% (×${xStr})`;
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
  const devcordSeed = useMemo(() => loadDevcordLocalSettings(), []);

  // Stany Danych — przy podłączonym API startujemy pusto (bez s1/c1), żeby nie strzelać w nieistniejące ID.
  const [servers, setServers] = useState(() => (DEMO_MODE ? initialServers : []));
  const [categories, setCategories] = useState<Category[]>(() => (DEMO_MODE ? initialCategories : []));
  const [channels, setChannels] = useState<Channel[]>(() => (DEMO_MODE ? initialChannels : []));
  const [tasks, setTasks] = useState<TaskItem[]>(() => (DEMO_MODE ? initialTasks : []));
  const [files, setFiles] = useState<FileItem[]>(() => (DEMO_MODE ? initialFiles : []));
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
  const isSettingsOpen = useSettingsStore((s) => s.isSettingsOpen);
  const setIsSettingsOpen = useSettingsStore((s) => s.setSettingsOpen);
  const settingsTab = useSettingsStore((s) => s.settingsTab);
  const setSettingsTab = useSettingsStore((s) => s.setSettingsTab);
  const [localUserName, setLocalUserName] = useState(() => (DEMO_MODE ? 'Admin' : 'Użytkownik'));
  const [localUserAvatar, setLocalUserAvatar] = useState('');
  const [localUserColor, setLocalUserColor] = useState('#00eeff');
  const [localUserGlow, setLocalUserGlow] = useState('none');
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [settingsSuccess, setSettingsSuccess] = useState('');
  const [settingsError, setSettingsError] = useState('');
  const localTheme = useSettingsStore((s) => s.localTheme);
  const setLocalTheme = useSettingsStore((s) => s.setLocalTheme);
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
  const [screenCaptureProfile, setScreenCaptureProfile] = useState<240 | 120 | 60 | null>(null);
  const [screenCaptureFps, setScreenCaptureFps] = useState<number | null>(null);
  const screenFallbackStrikeRef = useRef(0);
  const micDeviceId = useSettingsStore((s) => s.micDeviceId);
  const setMicDeviceId = useSettingsStore((s) => s.setMicDeviceId);
  const micSoftwareGate = false;
  const micGateThresholdDb = devcordSeed.audio.micGateThresholdDb;
  const rnnoiseEnabled = useSettingsStore((s) => s.rnnoiseEnabled);
  const setRnnoiseEnabled = useSettingsStore((s) => s.setRnnoiseEnabled);
  const screenFps = useSettingsStore((s) => s.screenFps);
  const setScreenFps = useSettingsStore((s) => s.setScreenFps);
  const screenRes = useSettingsStore((s) => s.screenRes);
  const setScreenRes = useSettingsStore((s) => s.setScreenRes);
  const [userVolumes, setUserVolumes] = useState<Record<string, number>>(() => ({ ...devcordSeed.userVoiceGain }));
  const [userOutputMuted, setUserOutputMutedMap] = useState<Record<string, boolean>>(() => ({ ...devcordSeed.userOutputMuted }));
  const [micLevel, setMicLevel] = useState(0);

  const [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([]);
  const [voiceMixPanelOpen, setVoiceMixPanelOpen] = useState(false);
  /** Obecność z Redisa / WS (kto jest w pokoju LiveKit), niezależnie od lokalnego połączenia RTC. */
  const voicePresenceByChannel = useChatStore((s) => s.voicePresenceByChannel);
  const voicePresenceByConversation = useChatStore((s) => s.voicePresenceByConversation);

  const [dmPeerId, setDmPeerId] = useState<string | null>(null);
  const [dmInputValue, setDmInputValue] = useState('');
  const [dmActiveConversationId, setDmActiveConversationId] = useState<string | null>(null);
  const dmActiveConversationIdRef = useRef<string | null>(null);
  dmActiveConversationIdRef.current = dmActiveConversationId;
  const [dmApiConversations, setDmApiConversations] = useState<
    { id: string; peer: UserInfo; last_message?: { id: string; content: string; time: string } }[]
  >([]);
  const [dmMessagesByConversation, setDmMessagesByConversation] = useState<Record<string, ChatRow[]>>({});
  const [dmTasksByConversation, setDmTasksByConversation] = useState<Record<string, DmTaskItem[]>>({});
  const [dmTypingUsers, setDmTypingUsers] = useState<Record<string, boolean>>({});
  const [dmMessagesByThread, setDmMessagesByThread] = useState<Record<string, DmRow[]>>(() => loadDmStore());
  const [profileCardUser, setProfileCardUser] = useState<UserInfo | null>(null);
  /** Zakładki lewego panelu w Terminalu osobistym */
  const [personalSidebarTab, setPersonalSidebarTab] = useState<'messages' | 'contacts'>('messages');
  const [friendIncoming, setFriendIncoming] = useState<{ id: string; from: UserInfo }[]>([]);
  const [friendOutgoing, setFriendOutgoing] = useState<{ id: string; to: UserInfo }[]>([]);
  const [acceptedFriends, setAcceptedFriends] = useState<UserInfo[]>([]);
  const [profileCardNote, setProfileCardNote] = useState('');
  const [userPopout, setUserPopout] = useState<{ user: UserInfo; x: number; y: number } | null>(null);
  const [pvCall, setPvCall] = useState<{ peerId: string; status: 'ringing' | 'connected' } | null>(null);
  const [dmCallState, setDmCallState] = useState<{
    callId: string;
    conversationId: string;
    fromUserId: string;
    toUserId: string;
    status: 'ringing' | 'connected' | 'rejected' | 'ended';
    kind: 'audio' | 'video';
    startedAtMs?: number;
  } | null>(null);
  const remoteScreenHostRef = useRef<HTMLDivElement | null>(null);

  const [nickStudioFx, setNickStudioFx] = useState<'gradient' | 'gradient_neon' | 'neon_pulse' | 'shimmer' | 'double_outline'>(
    'gradient_neon',
  );
  const [nickStudioG1, setNickStudioG1] = useState('#00eeff');
  const [nickStudioG2, setNickStudioG2] = useState('#ff00aa');
  const [nickStudioFontId, setNickStudioFontId] = useState('outfit');

  useEffect(() => {
    if (API_BASE_URL) return;
    saveDmStore(dmMessagesByThread);
  }, [dmMessagesByThread, API_BASE_URL]);

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
    if (activeServer !== '') {
      setDmPeerId(null);
      setDmActiveConversationId(null);
    }
  }, [activeServer]);

  useEffect(() => {
    if (activeServer !== '' || !dmActiveConversationId) return;
    setRightPanelTab(null);
    setActiveThread(null);
  }, [activeServer, dmActiveConversationId]);

  useEffect(() => {
    const dmView = activeServer === '' && !!dmActiveConversationId && !!dmPeerId;
    if (!dmView) return;
    if (rightPanelTab === 'files' || rightPanelTab === 'tasks' || rightPanelTab == null) setRightPanelTab('members');
  }, [activeServer, dmActiveConversationId, dmPeerId, rightPanelTab]);

  useEffect(() => {
    saveDevcordLocalSettings({
      version: 1,
      audio: {
        micDeviceId,
        micSoftwareGate,
        micGateThresholdDb,
        rnnoiseEnabled,
      },
      screen: { fps: screenFps, res: screenRes },
      userVoiceGain: userVolumes,
      userOutputMuted,
      appearance: { theme: localTheme },
    });
  }, [micDeviceId, micSoftwareGate, micGateThresholdDb, rnnoiseEnabled, screenFps, screenRes, userVolumes, userOutputMuted, localTheme]);

  useEffect(() => {
    if (!screenStream) return;
    screenStream.getVideoTracks().forEach((track) => {
      track
        .applyConstraints({
          frameRate: { max: screenFps },
          width: { max: 1920 },
          height: { max: screenRes },
        })
        .catch(() => {
          /* ignore */
        });
      const f = track.getSettings().frameRate;
      if (typeof f === 'number' && Number.isFinite(f)) setScreenCaptureFps(Math.round(f));
    });
  }, [screenStream, screenFps, screenRes]);

  const [devcordToken, setDevcordToken] = useState(() => getStoredAuthToken());
  const [meUserId, setMeUserId] = useState('');
  type PanelRole = (typeof mockRoles)[number];
  const [workspaceRoles, setWorkspaceRoles] = useState<PanelRole[]>(() => (DEMO_MODE ? [...mockRoles] : []));
  const [workspaceMembers, setWorkspaceMembers] = useState<UserInfo[]>(() => (DEMO_MODE ? [...mockUsers] : []));
  const [typingUsers, setTypingUsers] = useState<Record<string, boolean>>({});
  const typingClearTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const dmTypingClearTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [authMode, setAuthMode] = useState<'login' | 'register' | 'verify'>('login');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authNick, setAuthNick] = useState('');
  const [authCode, setAuthCode] = useState('');
  const [authErr, setAuthErr] = useState('');

  useEffect(() => {
    return () => {
      Object.values(typingClearTimersRef.current).forEach(clearTimeout);
      Object.values(dmTypingClearTimersRef.current).forEach(clearTimeout);
    };
  }, []);

  useEffect(() => {
    setTypingUsers({});
    Object.values(typingClearTimersRef.current).forEach(clearTimeout);
    typingClearTimersRef.current = {};
  }, [activeChannel]);

  useEffect(() => {
    setDmTypingUsers({});
    Object.values(dmTypingClearTimersRef.current).forEach(clearTimeout);
    dmTypingClearTimersRef.current = {};
  }, [dmActiveConversationId]);

  // Referencje
  const guestIdRef = useRef(guestSessionId());
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const dmMessagesEndRef = useRef<HTMLDivElement | null>(null);
  const channelScrollRef = useRef<HTMLDivElement | null>(null);
  const dmScrollRef = useRef<HTMLDivElement | null>(null);
  const channelStickToBottomRef = useRef(true);
  const dmStickToBottomRef = useRef(true);
  const prevChannelKeyRef = useRef('');
  const prevChannelLenRef = useRef(0);
  const prevDmConversationRef = useRef<string | null>(null);
  const prevDmLenRef = useRef(0);
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
    if (!devcordToken) initialNavSyncedRef.current = false;
  }, [devcordToken]);

  useEffect(() => {
    if (DEMO_MODE || !API_BASE_URL || !devcordToken) return;
    if (initialNavSyncedRef.current) return;
    const path = window.location.pathname || '';
    if (/^\/(invite|join)\//i.test(path)) {
      initialNavSyncedRef.current = true;
      return;
    }
    const dmPath = readPersonalDmPath();
    if (dmPath?.cid) {
      setActiveServer('');
      setActiveChannel('');
      setDmActiveConversationId(dmPath.cid);
      initialNavSyncedRef.current = true;
      return;
    }
    if (servers.length === 0 || channels.length === 0) return;
    const p = readChannelsPath();
    if (!p?.sid || !p?.cid) {
      const last = readDevcordLastLocation();
      if (
        last?.kind === 'guild' &&
        servers.some((s) => s.id === last.serverId) &&
        channels.some((c) => c.id === last.channelId && c.serverId === last.serverId)
      ) {
        setActiveServer(last.serverId);
        setActiveChannel(last.channelId);
        writeChannelsPath(last.serverId, last.channelId);
      } else if (last?.kind === 'dm' && last.conversationId) {
        setActiveServer('');
        setActiveChannel('');
        setDmActiveConversationId(last.conversationId);
        writePersonalDmPath(last.conversationId);
      }
      initialNavSyncedRef.current = true;
      return;
    }
    if (servers.some((s) => s.id === p.sid) && channels.some((c) => c.id === p.cid && c.serverId === p.sid)) {
      setActiveServer(p.sid);
      setActiveChannel(p.cid);
    }
    initialNavSyncedRef.current = true;
  }, [servers, channels, devcordToken]);

  useEffect(() => {
    if (DEMO_MODE || !API_BASE_URL || !devcordToken) return;
    const path = window.location.pathname || '';
    if (/^\/(invite|join)\//i.test(path)) return;
    if (activeServer && activeChannel) {
      writeDevcordLastLocation({ v: 1, kind: 'guild', serverId: activeServer, channelId: activeChannel });
      return;
    }
    if (activeServer === '' && dmActiveConversationId) {
      writeDevcordLastLocation({ v: 1, kind: 'dm', conversationId: dmActiveConversationId });
    }
  }, [activeServer, activeChannel, dmActiveConversationId, devcordToken]);

  useEffect(() => {
    if (DEMO_MODE || !API_BASE_URL || !devcordToken) return;
    if (!activeServer || !activeChannel) return;
    const path = window.location.pathname || '';
    if (/^\/(invite|join)\//i.test(path)) return;
    writeChannelsPath(activeServer, activeChannel);
  }, [activeServer, activeChannel, devcordToken]);

  useEffect(() => {
    if (DEMO_MODE || !API_BASE_URL || !devcordToken) return;
    if (activeServer !== '' || !dmActiveConversationId) return;
    writePersonalDmPath(dmActiveConversationId);
  }, [activeServer, dmActiveConversationId, devcordToken]);

  useEffect(() => {
    if (DEMO_MODE || !API_BASE_URL || !devcordToken) return;
    const handler = () => {
      const dmp = readPersonalDmPath();
      if (dmp?.cid) {
        setActiveServer('');
        setActiveChannel('');
        setDmActiveConversationId(dmp.cid);
        return;
      }
      const p = readChannelsPath();
      if (p && servers.some((s) => s.id === p.sid) && channels.some((c) => c.id === p.cid && c.serverId === p.sid)) {
        setActiveServer(p.sid);
        setActiveChannel(p.cid);
      }
    };
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, [devcordToken, servers, channels]);

  useEffect(() => {
    if (!DEMO_MODE || !activeServer || !activeChannel) return;
    writeChannelsPath(activeServer, activeChannel);
  }, [activeServer, activeChannel]);

  useEffect(() => {
    if (!API_BASE_URL || !devcordToken) {
      setMeUserId('');
      setSessionEmail('');
      return;
    }
    (async () => {
      try {
        const me = await apiClient('/auth/me');
        if (me && typeof me === 'object' && 'id' in me && (me as { id: unknown }).id != null && String((me as { id: unknown }).id) !== '') {
          setMeUserId(String((me as { id: unknown }).id));
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
  }, [API_BASE_URL, devcordToken]);

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
    if (!devcordToken) {
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
  }, [API_BASE_URL, devcordToken]);

  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        if (!API_BASE_URL || !devcordToken) return;
        const [apiServers, apiCategories, apiChannels] = await Promise.all([
          apiClient('/servers'),
          apiClient('/categories'),
          apiClient('/channels'),
        ]);
        if (Array.isArray(apiServers)) {
          setServers(
            apiServers.map((s: { id?: unknown; name: string; iconKey?: string; icon?: string; color?: string; glow?: string; active?: boolean; inviteCode?: string }) => ({
              ...s,
              id: String(s.id ?? ''),
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
            apiCategories.map((c: Category & { id?: unknown; serverId?: unknown; isExpanded?: boolean }) => ({
              ...c,
              id: String(c.id ?? ''),
              serverId: String(c.serverId ?? ''),
              isExpanded: c.isExpanded !== false,
            })),
          );
        }
        if (Array.isArray(apiChannels)) {
          setChannels(
            apiChannels.map((ch: Channel & { id?: unknown; serverId?: unknown; categoryId?: unknown }) => ({
              ...ch,
              id: String(ch.id ?? ''),
              serverId: String(ch.serverId ?? ''),
              categoryId: ch.categoryId != null ? String(ch.categoryId) : undefined,
              icon: ch.type === 'voice' ? Radio : Hash,
            })),
          );
        }
      } catch (err) {
        console.error('Błąd ładowania inicjalnego API', err);
      }
    };
    void fetchInitialData();
  }, [API_BASE_URL, devcordToken]);

  useEffect(() => {
    if (!API_BASE_URL || !devcordToken) return;
    if (servers.length === 0) {
      setActiveServer('');
      setActiveChannel('');
      writePersonalHomePath();
      setTasks([]);
      useChatStore.getState().clearMessages();
      setWorkspaceRoles([]);
      setWorkspaceMembers([]);
      return;
    }
    if (activeServer === '') {
      return;
    }
    if (!servers.some((s) => s.id === activeServer)) {
      setActiveServer(servers[0].id);
    }
  }, [API_BASE_URL, devcordToken, servers, activeServer]);

  useEffect(() => {
    if (!API_BASE_URL || !devcordToken || !activeServer) return;
    if (!servers.some((s) => s.id === activeServer)) return;
    (async () => {
      try {
        const rows = await apiClient(`/tasks?serverId=${activeServer}`);
        if (Array.isArray(rows)) setTasks(rows as TaskItem[]);
      } catch {
        /* ignore */
      }
    })();
  }, [API_BASE_URL, devcordToken, activeServer, servers]);

  useEffect(() => {
    if (!API_BASE_URL || !devcordToken || !activeServer) return;
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
            const raw = m as UserInfo & { nick?: string; role_ids?: unknown };
            const roleIds = Array.isArray(raw.role_ids) ? raw.role_ids.map((x) => String(x)) : undefined;
            return {
              ...m,
              id: mid,
              roleId: rid,
              roleIds,
              nick: typeof raw.nick === 'string' ? raw.nick : undefined,
              avatarUrl: (m as { avatar_url?: string }).avatar_url,
              nickColor: (m as { nick_color?: string }).nick_color,
              nickGlow: (m as { nick_glow?: string }).nick_glow,
            } as UserInfo;
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
            mapped = [
              ...mapped,
              {
                id: meUserId,
                name: localUserName,
                roleId: selfRid,
                status: 'online' as const,
                avatarUrl: localUserAvatar,
                nickColor: localUserColor,
                nickGlow: localUserGlow,
              } as UserInfo,
            ];
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
  }, [API_BASE_URL, devcordToken, activeServer, servers, meUserId, localUserName, localUserAvatar, localUserColor, localUserGlow]);

  useEffect(() => {
    if (!API_BASE_URL || !devcordToken || !activeChannel) return;
    if (!channels.some((c) => c.id === activeChannel)) return;
    (async () => {
      try {
        const rows = await apiClient(`/channels/${activeChannel}/messages`);
        if (!Array.isArray(rows)) return;
        useChatStore.getState().setChannelMessages(
          activeChannel,
          rows.map((r: { id: string; userId: string; time: string; content: string; isEdited?: boolean }) => ({
            id: r.id,
            userId: r.userId,
            time: r.time,
            content: r.content,
            isEdited: r.isEdited,
            isMe: r.userId === meUserId,
          })),
        );
      } catch {
        /* ignore */
      }
    })();
  }, [API_BASE_URL, devcordToken, activeChannel, meUserId, channels]);

  useEffect(() => {
    setTypingUsers({});
  }, [activeChannel]);

  const myUserId = API_BASE_URL ? meUserId : guestIdRef.current;
  const messages = useChatStore((s) => s.messagesByChannel[activeChannel] ?? []);
  const activeDmRows = useMemo<(DmRow | ChatRow)[]>(() => {
    if (activeServer !== '') return [];
    const tKey = dmPeerId && myUserId ? dmThreadKey(myUserId, dmPeerId) : '';
    if (API_BASE_URL && dmActiveConversationId) return dmMessagesByConversation[dmActiveConversationId] ?? [];
    if (!tKey) return [];
    return dmMessagesByThread[tKey] ?? [];
  }, [
    activeServer,
    dmPeerId,
    myUserId,
    API_BASE_URL,
    dmActiveConversationId,
    dmMessagesByConversation,
    dmMessagesByThread,
  ]);

  const voiceDmActive = useMemo(
    () => !!(dmCallState?.status === 'connected' && dmCallState.conversationId),
    [dmCallState],
  );
  const voiceServerActive = !!activeVoiceChannel && !voiceDmActive;

  const mergeChatMessage = useCallback(
    (row: { channelId: string; id: string; userId: string; content: string; time: string; isEdited?: boolean }) => {
      useChatStore.getState().mergeChannelMessage(row, myUserId);
    },
    [myUserId],
  );

  const mergeDmMessage = useCallback(
    (row: DmMessageRow) => {
      const conv = row.conversationId;
      if (!conv) return;
      setDmMessagesByConversation((prev) => {
        const list = [...(prev[conv] ?? [])];
        const entry: ChatRow = {
          id: row.id,
          userId: row.userId,
          time: row.time,
          content: row.content,
          isEdited: row.isEdited,
          isMe: row.userId === meUserId,
        };
        const i = list.findIndex((m) => m.id === row.id);
        if (i >= 0) {
          list[i] = { ...list[i], ...entry };
        } else {
          const tmpIdx = list.findIndex(
            (m) => m.id.startsWith('tmp_') && m.userId === row.userId && m.content === row.content,
          );
          if (tmpIdx >= 0) list[tmpIdx] = entry;
          else list.push(entry);
        }
        list.sort((a, b) => {
          const na = Number(a.id);
          const nb = Number(b.id);
          if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
          return a.id.localeCompare(b.id, 'en', { numeric: true });
        });
        return { ...prev, [conv]: list };
      });
      setDmApiConversations((inbox) =>
        inbox.map((c) =>
          c.id === conv ? { ...c, last_message: { id: row.id, content: row.content, time: row.time } } : c,
        ),
      );
    },
    [meUserId],
  );

  const openDmForPeer = useCallback(
    async (peerId: string) => {
      const pid = String(peerId);
      setActiveServer('');
      setActiveChannel('');
      writePersonalHomePath();
      setPersonalSidebarTab('messages');
      if (!API_BASE_URL || !devcordToken) {
        setDmPeerId(pid);
        setDmActiveConversationId(null);
        writePersonalHomePath();
        return;
      }
      try {
        const res = (await apiClient('/dm/conversations', 'POST', { peer_user_id: pid })) as {
          id: string;
          peer?: { id: string; name: string; avatar_url?: string };
        };
        const cid = String(res?.id ?? '');
        if (!cid) return;
        const peer = res?.peer;
        const peerUser: UserInfo = {
          id: String(peer?.id ?? pid),
          name: String(peer?.name ?? ''),
          roleId: '__devcord_members',
          status: 'online',
          avatarUrl: peer?.avatar_url,
        };
        setDmApiConversations((prev) => {
          if (prev.some((c) => c.id === cid)) return prev;
          return [{ id: cid, peer: peerUser }, ...prev];
        });
        setWorkspaceMembers((prev) => (prev.some((m) => m.id === peerUser.id) ? prev : [...prev, peerUser]));
        setDmActiveConversationId(cid);
        setDmPeerId(peerUser.id);
        writePersonalDmPath(cid);
      } catch {
        setDmPeerId(pid);
        setDmActiveConversationId(null);
      }
    },
    [API_BASE_URL, devcordToken],
  );

  const refreshDmTasks = useCallback(
    async (conversationId: string) => {
      if (!API_BASE_URL || !devcordToken || !conversationId) return;
      try {
        const rows = await apiClient(`/dm/conversations/${conversationId}/tasks`);
        if (!Array.isArray(rows)) return;
        setDmTasksByConversation((prev) => ({
          ...prev,
          [conversationId]: rows.map((r) => ({
            id: String((r as { id?: string }).id ?? ''),
            conversationId: String((r as { conversationId?: string }).conversationId ?? conversationId),
            title: String((r as { title?: string }).title ?? ''),
            assigneeId: String((r as { assigneeId?: string }).assigneeId ?? ''),
            completed: !!(r as { completed?: boolean }).completed,
            sourceMsgId: (r as { sourceMsgId?: string }).sourceMsgId,
          })),
        }));
      } catch {
        /* ignore */
      }
    },
    [API_BASE_URL, devcordToken],
  );

  const createDmTask = useCallback(
    async (conversationId: string, title: string, sourceMsgId?: string) => {
      if (!API_BASE_URL || !devcordToken || !conversationId || !title.trim()) return;
      await apiClient(`/dm/conversations/${conversationId}/tasks`, 'POST', {
        title: title.trim(),
        assigneeId: myUserId,
        sourceMsgId,
      });
      await refreshDmTasks(conversationId);
    },
    [API_BASE_URL, devcordToken, myUserId, refreshDmTasks],
  );

  const toggleDmTask = useCallback(
    async (taskId: string) => {
      if (!taskId) return;
      const currentConv = dmActiveConversationId;
      if (!currentConv) return;
      const cur = (dmTasksByConversation[currentConv] ?? []).find((t) => t.id === taskId);
      await apiClient(`/dm/tasks/${taskId}`, 'PUT', { completed: !cur?.completed });
      await refreshDmTasks(currentConv);
    },
    [dmActiveConversationId, dmTasksByConversation, refreshDmTasks],
  );

  const deleteDmTask = useCallback(
    async (taskId: string) => {
      if (!taskId) return;
      const currentConv = dmActiveConversationId;
      if (!currentConv) return;
      await apiClient(`/dm/tasks/${taskId}`, 'DELETE');
      await refreshDmTasks(currentConv);
    },
    [dmActiveConversationId, refreshDmTasks],
  );

  const startDmCall = useCallback(
    async (kind: 'audio' | 'video') => {
      if (!API_BASE_URL || !devcordToken || !dmActiveConversationId) return;
      try {
        const res = (await apiClient(`/dm/conversations/${dmActiveConversationId}/calls`, 'POST', { kind })) as {
          id?: string;
          conversationId?: string;
          status?: 'ringing' | 'connected' | 'rejected' | 'ended';
        };
        setDmCallState({
          callId: String(res?.id ?? ''),
          conversationId: String(res?.conversationId ?? dmActiveConversationId),
          fromUserId: myUserId,
          toUserId: dmPeerId ?? '',
          status: (res?.status ?? 'ringing') as 'ringing' | 'connected' | 'rejected' | 'ended',
          kind,
          startedAtMs: Date.now(),
        });
      } catch {
        /* ignore */
      }
    },
    [API_BASE_URL, devcordToken, dmActiveConversationId, myUserId, dmPeerId],
  );

  const runDmCallAction = useCallback(
    async (action: 'accept' | 'reject' | 'end') => {
      if (!dmCallState?.callId) return;
      try {
        const durationSec =
          action === 'end' && dmCallState.startedAtMs ? Math.max(0, Math.round((Date.now() - dmCallState.startedAtMs) / 1000)) : 0;
        await apiClient(`/dm/calls/${dmCallState.callId}/${action}`, 'POST', {
          conversationId: dmCallState.conversationId,
          fromUserId: dmCallState.fromUserId,
          toUserId: dmCallState.toUserId,
          durationSec,
        });
        if (action === 'reject' || action === 'end') {
          setDmCallState((prev) => (prev ? { ...prev, status: action === 'reject' ? 'rejected' : 'ended' } : prev));
        }
      } catch {
        /* ignore */
      }
    },
    [dmCallState],
  );

  const refreshFriendsData = useCallback(async () => {
    if (!API_BASE_URL || !getStoredAuthToken()) return;
    try {
      const [incRaw, outRaw, listRaw] = await Promise.all([
        apiClient('/friends/requests/incoming'),
        apiClient('/friends/requests/outgoing'),
        apiClient('/friends'),
      ]);
      if (Array.isArray(incRaw)) {
        const rows = incRaw as { id: string; from: { id?: string; name?: string; avatar_url?: string } }[];
        setFriendIncoming(
          rows
            .map((r) => {
              const u = userFromFriendApi(r.from);
              return u ? { id: String(r.id), from: u } : null;
            })
            .filter(Boolean) as { id: string; from: UserInfo }[],
        );
      }
      if (Array.isArray(outRaw)) {
        const rows = outRaw as { id: string; to: { id?: string; name?: string; avatar_url?: string } }[];
        setFriendOutgoing(
          rows
            .map((r) => {
              const u = userFromFriendApi(r.to);
              return u ? { id: String(r.id), to: u } : null;
            })
            .filter(Boolean) as { id: string; to: UserInfo }[],
        );
      }
      if (Array.isArray(listRaw)) {
        setAcceptedFriends(
          (listRaw as { id?: string; name?: string; avatar_url?: string }[])
            .map((x) => userFromFriendApi(x))
            .filter(Boolean) as UserInfo[],
        );
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!API_BASE_URL || !devcordToken) return;
    void refreshFriendsData();
  }, [API_BASE_URL, devcordToken, refreshFriendsData]);

  const sendFriendRequest = useCallback(
    async (peerId: string) => {
      try {
        await apiClient('/friends/request', 'POST', { to_user_id: String(peerId) });
        await refreshFriendsData();
      } catch {
        /* ignore */
      }
    },
    [refreshFriendsData],
  );

  const acceptFriendByRequestId = useCallback(
    async (requestId: string) => {
      try {
        await apiClient(`/friends/requests/${requestId}/accept`, 'POST');
        await refreshFriendsData();
      } catch {
        /* ignore */
      }
    },
    [refreshFriendsData],
  );

  const rejectFriendByRequestId = useCallback(
    async (requestId: string) => {
      try {
        await apiClient(`/friends/requests/${requestId}/reject`, 'POST');
        await refreshFriendsData();
      } catch {
        /* ignore */
      }
    },
    [refreshFriendsData],
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

  useEffect(() => {
    setDmTypingUsers({});
  }, [dmActiveConversationId]);

  useEffect(() => {
    if (!API_BASE_URL || !devcordToken) return;
    void (async () => {
      try {
        const list = await apiClient('/dm/conversations');
        if (!Array.isArray(list)) return;
        const mapped = list.map(
          (x: {
            id: string;
            peer: { id: string; name: string; avatar_url?: string };
            last_message?: { id: string; content: string; time: string };
          }) => ({
            id: String(x.id),
            peer: {
              id: String(x.peer?.id ?? ''),
              name: String(x.peer?.name ?? ''),
              roleId: '__devcord_members',
              status: 'online' as const,
              avatarUrl: x.peer?.avatar_url,
            },
            last_message: x.last_message
              ? {
                  id: String(x.last_message.id),
                  content: String(x.last_message.content),
                  time: String(x.last_message.time),
                }
              : undefined,
          }),
        );
        setDmApiConversations(mapped);
      } catch {
        /* ignore */
      }
    })();
  }, [API_BASE_URL, devcordToken]);

  useEffect(() => {
    if (!API_BASE_URL || !devcordToken || !dmActiveConversationId) return;
    void (async () => {
      try {
        const rows = await apiClient(`/dm/conversations/${dmActiveConversationId}/messages`);
        if (!Array.isArray(rows)) return;
        setDmMessagesByConversation((prev) => ({
          ...prev,
          [dmActiveConversationId]: (
            rows as { id: string; userId: string; time: string; content: string; isEdited?: boolean }[]
          ).map((r) => ({
            id: r.id,
            userId: r.userId,
            time: r.time,
            content: r.content,
            isEdited: r.isEdited,
            isMe: r.userId === myUserId,
          })),
        }));
      } catch {
        /* ignore */
      }
    })();
  }, [API_BASE_URL, devcordToken, dmActiveConversationId, myUserId]);

  useEffect(() => {
    if (!API_BASE_URL || !devcordToken || !dmActiveConversationId) return;
    void refreshDmTasks(dmActiveConversationId);
  }, [API_BASE_URL, devcordToken, dmActiveConversationId, refreshDmTasks]);

  useEffect(() => {
    if (!dmActiveConversationId) return;
    const conv = dmApiConversations.find((c) => String(c.id) === String(dmActiveConversationId));
    if (conv?.peer?.id) setDmPeerId(String(conv.peer.id));
  }, [dmActiveConversationId, dmApiConversations]);

  const { sendTyping, sendTypingDm } = useChatSocket({
    apiBase: API_BASE_URL,
    token: devcordToken || null,
    channelId: activeServer !== '' ? activeChannel : null,
    onMessage: mergeChatMessage,
    onTyping: (ev) => {
      if (String(ev.channelId) !== String(activeChannel)) return;
      if (String(ev.userId) === String(meUserId)) return;
      const uid = String(ev.userId);
      const prevT = typingClearTimersRef.current[uid];
      if (prevT) clearTimeout(prevT);
      delete typingClearTimersRef.current[uid];
      setTypingUsers((t) => {
        const next = { ...t };
        if (ev.typing) next[uid] = true;
        else delete next[uid];
        return next;
      });
      if (ev.typing) {
        typingClearTimersRef.current[uid] = setTimeout(() => {
          setTypingUsers((t) => {
            const n = { ...t };
            delete n[uid];
            return n;
          });
          delete typingClearTimersRef.current[uid];
        }, 4800);
      }
    },
    onUserUpdated: API_BASE_URL && devcordToken ? mergeUserFromWs : undefined,
    dmConversationId: activeServer === '' ? dmActiveConversationId : null,
    onDmMessage: API_BASE_URL && devcordToken ? mergeDmMessage : undefined,
    onDmTyping:
      API_BASE_URL && devcordToken
        ? (ev) => {
            if (String(ev.conversationId) !== String(dmActiveConversationIdRef.current)) return;
            if (String(ev.userId) === String(meUserId)) return;
            const uid = String(ev.userId);
            const prevT = dmTypingClearTimersRef.current[uid];
            if (prevT) clearTimeout(prevT);
            delete dmTypingClearTimersRef.current[uid];
            setDmTypingUsers((t) => {
              const next = { ...t };
              if (ev.typing) next[uid] = true;
              else delete next[uid];
              return next;
            });
            if (ev.typing) {
              dmTypingClearTimersRef.current[uid] = setTimeout(() => {
                setDmTypingUsers((t) => {
                  const n = { ...t };
                  delete n[uid];
                  return n;
                });
                delete dmTypingClearTimersRef.current[uid];
              }, 4800);
            }
          }
        : undefined,
    onDmTaskEvent:
      API_BASE_URL && devcordToken
        ? (ev: DmTaskEvent) => {
            if (!ev.conversationId) return;
            if (ev.type === 'dm_task_deleted') {
              setDmTasksByConversation((prev) => ({
                ...prev,
                [ev.conversationId]: (prev[ev.conversationId] ?? []).filter((t) => t.id !== ev.id),
              }));
              return;
            }
            if (ev.type === 'dm_task_created' && ev.title) {
              setDmTasksByConversation((prev) => {
                if ((prev[ev.conversationId] ?? []).some((t) => t.id === ev.id)) return prev;
                const row: DmTaskItem = {
                  id: ev.id,
                  conversationId: ev.conversationId,
                  title: ev.title ?? '',
                  assigneeId: ev.assigneeId ?? '',
                  completed: !!ev.completed,
                  sourceMsgId: ev.sourceMsgId,
                };
                return { ...prev, [ev.conversationId]: [row, ...(prev[ev.conversationId] ?? [])] };
              });
              return;
            }
            if (ev.type === 'dm_task_updated') {
              if (ev.conversationId === dmActiveConversationIdRef.current) void refreshDmTasks(ev.conversationId);
            }
          }
        : undefined,
    onDmCallState:
      API_BASE_URL && devcordToken
        ? (ev: DmCallStateEvent) => {
            setDmCallState({
              callId: ev.callId,
              conversationId: ev.conversationId,
              fromUserId: ev.fromUserId,
              toUserId: ev.toUserId,
              status: ev.status,
              kind: ev.kind ?? 'audio',
              startedAtMs: ev.status === 'connected' ? Date.now() : undefined,
            });
          }
        : undefined,
    onVoiceInitialState:
      API_BASE_URL && devcordToken
        ? (p) => {
            useChatStore.getState().setVoicePresenceByChannel({ ...p.channels });
            useChatStore.getState().setVoicePresenceByConversation({ ...p.conversations });
          }
        : undefined,
    onVoiceRoomState:
      API_BASE_URL && devcordToken
        ? (p) => {
            useChatStore.getState().mergeVoiceRoomEvent({
              channel_id: p.channel_id,
              conversation_id: p.conversation_id,
              user_ids: p.user_ids,
            });
          }
        : undefined,
  });

  useEffect(() => {
    if (!API_BASE_URL || !devcordToken || !isInputFocused) return;
    if (currentChannelMeta?.type !== 'text') return;
    if (!inputValue.trim()) {
      sendTyping(false);
      return;
    }
    sendTyping(true);
    const tid = window.setTimeout(() => sendTyping(false), 2800);
    return () => clearTimeout(tid);
  }, [inputValue, isInputFocused, currentChannelMeta?.type, API_BASE_URL, devcordToken, sendTyping]);

  useEffect(() => {
    if (!API_BASE_URL || !devcordToken || activeServer !== '' || !dmActiveConversationId) return;
    if (!dmInputValue.trim()) {
      sendTypingDm(false);
      return;
    }
    sendTypingDm(true);
    const tid = window.setTimeout(() => sendTypingDm(false), 2800);
    return () => clearTimeout(tid);
  }, [dmInputValue, dmActiveConversationId, API_BASE_URL, devcordToken, activeServer, sendTypingDm]);

  const voiceLive = useLiveKitVoice({
    enabled: !!API_BASE_URL && !!devcordToken.trim() && (voiceServerActive || voiceDmActive),
    channelId: voiceServerActive ? activeVoiceChannel : null,
    dmConversationId: voiceDmActive && dmCallState?.conversationId ? dmCallState.conversationId : null,
    userId: myUserId,
    micDeviceId,
    accessToken: devcordToken,
    screenStream,
    cameraStream,
    screenBitrate: screenRes === 1440 ? 8000000 : screenRes === 1080 ? 4000000 : screenRes === 720 ? 1500000 : 800000,
    screenPreferredCodec: screenFps >= 120 ? 'av1' : 'h264',
    rnnoiseEnabled,
  });
  const voiceMock = useVoiceRoomMock({
    enabled: DEMO_MODE && !!activeVoiceChannel && !voiceDmActive,
    roomId: activeVoiceChannel,
    userId: myUserId,
    micDeviceId,
  });
  const {
    phase: voicePhase,
    error: voiceError,
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
    screenPublishStats,
  } = API_BASE_URL ? voiceLive : voiceMock;

  const [voicePingRttMs, setVoicePingRttMs] = useState<number | null>(null);
  const [voicePingServerMs, setVoicePingServerMs] = useState<number | null>(null);
  const [voicePingOk, setVoicePingOk] = useState(false);

  useEffect(() => {
    if (!API_BASE_URL || (!activeVoiceChannel && !voiceDmActive)) {
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
  }, [API_BASE_URL, activeVoiceChannel, voiceDmActive]);

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
    if (!window.devcordDesktop?.onShortcutAction) return;
    return window.devcordDesktop.onShortcutAction(({ action }) => {
      if (action === 'toggle-deafen') {
        toggleVoiceHeadphones();
        return;
      }
      if (action === 'toggle-mute') toggleVoiceMic();
    });
  }, [toggleVoiceHeadphones, toggleVoiceMic]);

  useEffect(() => {
    if (!screenStream) {
      setScreenCaptureFps(null);
      screenFallbackStrikeRef.current = 0;
      return;
    }
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.srcObject = screenStream;
    void video.play().catch(() => {
      /* ignore */
    });
    let frames = 0;
    let lastTs = performance.now();
    let raf = 0;
    const tick = () => {
      frames += 1;
      const now = performance.now();
      if (now - lastTs >= 1000) {
        setScreenCaptureFps(Math.round((frames * 1000) / (now - lastTs)));
        frames = 0;
        lastTs = now;
      }
      const anyVideo = video as HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number };
      if (typeof anyVideo.requestVideoFrameCallback === 'function') {
        anyVideo.requestVideoFrameCallback(tick);
      } else {
        raf = window.requestAnimationFrame(tick);
      }
    };
    tick();
    return () => {
      if (raf) window.cancelAnimationFrame(raf);
      video.pause();
      video.srcObject = null;
    };
  }, [screenStream]);

  useEffect(() => {
    if (!screenStream || !screenCaptureProfile) return;
    const measuredFps = screenCaptureFps ?? screenPublishStats.captureFps;
    const bitrate = screenPublishStats.sendBitrateKbps;

    const fpsFloor = screenCaptureProfile === 240 ? 170 : screenCaptureProfile === 120 ? 85 : 45;
    const bitrateFloor = screenCaptureProfile === 240 ? 12000 : screenCaptureProfile === 120 ? 7000 : 3500;
    const fpsBad = typeof measuredFps === 'number' && measuredFps > 0 && measuredFps < fpsFloor;
    const bitrateBad = typeof bitrate === 'number' && bitrate > 0 && bitrate < bitrateFloor;

    if (!fpsBad && !bitrateBad) {
      screenFallbackStrikeRef.current = 0;
      return;
    }

    screenFallbackStrikeRef.current += 1;
    if (screenFallbackStrikeRef.current < 3) return;

    const nextProfile: 120 | 60 | null =
      screenCaptureProfile === 240 ? 120 : screenCaptureProfile === 120 ? 60 : null;
    if (!nextProfile) return;

    screenFallbackStrikeRef.current = 0;
    setScreenCaptureProfile(nextProfile);
    setScreenFps(nextProfile);
    screenStream.getVideoTracks().forEach((track) => {
      track
        .applyConstraints({
          frameRate: { min: 60, max: nextProfile },
          width: { min: 1920, max: 1920 },
          height: { min: 1080, max: 1080 },
        })
        .catch(() => {
          /* ignore */
        });
    });
  }, [
    screenStream,
    screenCaptureProfile,
    screenCaptureFps,
    screenPublishStats.captureFps,
    screenPublishStats.sendBitrateKbps,
    setScreenFps,
  ]);

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
    if (voicePhase !== 'connected' || (!activeVoiceChannel && !voiceDmActive)) return;
    const id = window.setInterval(() => bumpScreenLayout(), 1200);
    return () => clearInterval(id);
  }, [voicePhase, activeVoiceChannel, voiceDmActive]);

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

  const isNearBottom = (el: HTMLDivElement) => {
    const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
    return remaining < 72;
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
      setUserPopout(null);
    };
    window.addEventListener('click', closeMenu);
    return () => window.removeEventListener('click', closeMenu);
  }, []);

  useEffect(() => {
    const key = `${activeServer}:${activeChannel}`;
    const changedChannel = prevChannelKeyRef.current !== key;
    const nextLen = messages.length + (isAILoading ? 1 : 0);
    const grew = nextLen > prevChannelLenRef.current;
    if (activeServer !== '' && (changedChannel || (grew && channelStickToBottomRef.current))) {
      messagesEndRef.current?.scrollIntoView({ behavior: changedChannel ? 'auto' : 'smooth' });
    }
    prevChannelKeyRef.current = key;
    prevChannelLenRef.current = nextLen;
  }, [messages.length, activeChannel, activeServer, isAILoading]);

  useEffect(() => {
    if (activeServer !== '' || !dmPeerId) return;
    const changedConversation = prevDmConversationRef.current !== dmActiveConversationId;
    const grew = activeDmRows.length > prevDmLenRef.current;
    if (changedConversation || (grew && dmStickToBottomRef.current)) {
      dmMessagesEndRef.current?.scrollIntoView({ behavior: changedConversation ? 'auto' : 'smooth' });
    }
    prevDmConversationRef.current = dmActiveConversationId;
    prevDmLenRef.current = activeDmRows.length;
  }, [activeServer, dmPeerId, dmActiveConversationId, activeDmRows.length]);

  useEffect(() => {
    if (!isSettingsOpen || settingsTab !== 'audio') return;
    let raf = 0;
    let mounted = true;
    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    let source: MediaStreamAudioSourceNode | null = null;
    const data = new Uint8Array(1024);

    const loop = () => {
      if (!mounted || !analyser) return;
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i += 1) {
        const v = (data[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / data.length);
      setMicLevel(Math.min(1, rms * 4));
      raf = window.requestAnimationFrame(loop);
    };

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: micDeviceId && micDeviceId !== 'default' ? { deviceId: { exact: micDeviceId } } : true,
          video: false,
        });
        if (!mounted) return;
        ctx = new AudioContext();
        analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        source = ctx.createMediaStreamSource(stream);
        source.connect(analyser);
        loop();
      } catch {
        setMicLevel(0);
      }
    })();

    return () => {
      mounted = false;
      if (raf) window.cancelAnimationFrame(raf);
      setMicLevel(0);
      try {
        source?.disconnect();
      } catch {
        /* ignore */
      }
      try {
        void ctx?.close();
      } catch {
        /* ignore */
      }
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [isSettingsOpen, settingsTab, micDeviceId]);

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

  const openUserPopout = (e: React.MouseEvent, user: UserInfo) => {
    e.preventDefault();
    e.stopPropagation();
    setUserPopout({ user, x: e.clientX, y: e.clientY });
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
      if (firstCh) window.history.replaceState({ devcord: 1 }, '', `${APP_BASE_PATH}/channels/${res.id}/${firstCh}`);
      else window.history.replaceState({ devcord: 1 }, '', APP_BASE_PATH);
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
          writePersonalHomePath();
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
        useChatStore.getState().appendChannelMessage(activeChannel, {
          id: `ai_${Date.now()}`,
          userId: 'devcord_ai',
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          content: `**Devcord AI:** Przeanalizowałem Twoje zapytanie: "${content}". Gotowe rozwiązanie:\n\n\`\`\`javascript\nconst devcordNode = new DevcordNode();\ndevcordNode.connect();\n\`\`\``,
          isMe: false,
        });
      }, 1500);
      return;
    }

    try {
      const tempId = `tmp_${Date.now()}`;
      useChatStore.getState().appendChannelMessage(activeChannel, {
        id: tempId,
        userId: myUserId,
        time: timeString,
        content,
        isMe: true,
      });
      setInputValue('');
      const res = (await apiClient(`/channels/${activeChannel}/messages`, 'POST', { content })) as { id?: string; userId?: string; time?: string } | null;
      if (res?.id) {
        useChatStore.getState().patchChannelMessage(activeChannel, tempId, {
          id: res.id!,
          userId: res.userId ?? myUserId,
          time: res.time ?? timeString,
        });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const deleteMessage = async (msgId: string) => {
    try {
      await apiClient(`/messages/${msgId}`, 'DELETE');
      useChatStore.getState().removeChannelMessage(activeChannel, msgId);
      if (activeThread?.id === msgId) setActiveThread(null);
      setContextMenu(null);
    } catch(e) { console.error(e); }
  };

  // --- ZADANIA ---
  const handleCreateTask = async () => {
    if (!newTaskTitle.trim()) return;
    try {
      if (isDmView && dmActiveConversationId) {
        await createDmTask(dmActiveConversationId, newTaskTitle.trim(), createTaskModal.sourceMsg?.id);
        setCreateTaskModal({ isOpen: false });
        setNewTaskTitle('');
        setRightPanelTab('tasks');
        return;
      }
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
      useChatStore.getState().appendChannelMessage(activeChannel, {
        id: `m_${Date.now()}`,
        userId: myUserId,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        content: 'Wrzuciłem nowy plik do zakładki pliki: **wspolny_zrzut.png** 🚀',
        isMe: true,
      });
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

  const forceLogout = useCallback(
    (reason: string = 'unknown') => {
      disconnectVoice();
      clearStoredAuthToken();
      setDevcordToken('');
      setMeUserId('');
      setSessionEmail('');
      setIsSettingsOpen(false);
      setSettingsError(`Sesja wygasła lub jest nieprawidłowa. (${reason})`);
      setActiveServer('');
      setActiveChannel('');
      setDmPeerId(null);
      setDmActiveConversationId(null);
      setDmCallState(null);
      setDmApiConversations([]);
      setDmMessagesByConversation({});
      setDmTasksByConversation({});
      useChatStore.getState().clearVoicePresence();
    },
    [disconnectVoice],
  );

  useEffect(() => {
    const onForce = (ev: Event) => {
      const e = ev as CustomEvent<{ reason?: string }>;
      const reason = e?.detail?.reason ? String(e.detail.reason) : 'unknown';
      forceLogout(reason);
    };
    window.addEventListener('devcord:force-logout', onForce as EventListener);
    return () => window.removeEventListener('devcord:force-logout', onForce as EventListener);
  }, [forceLogout]);
  const toggleScreenShare = async () => {
    if (screenStream) {
      screenStream.getTracks().forEach((track) => track.stop());
      setScreenStream(null);
      setScreenCaptureProfile(null);
      return;
    }

    const openWithElectron = async (): Promise<MediaStream> => {
      const listSources = window.devcordDesktop?.listScreenSources;
      if (!listSources) throw new Error('desktop-capturer unavailable');
      const sources = await listSources();
      if (!Array.isArray(sources) || sources.length === 0) throw new Error('no capture sources');
      const source =
        sources.find((s) => String(s.id).startsWith('screen:')) ??
        sources[0];
      const profiles: Array<240 | 120 | 60> = [240, 120, 60];
      for (const profile of profiles) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
              mandatory: {
                chromeMediaSource: 'desktop',
                chromeMediaSourceId: source.id,
                minFrameRate: 60,
                maxFrameRate: profile,
                minWidth: 1920,
                minHeight: 1080,
              },
            } as MediaTrackConstraints,
          } as MediaStreamConstraints);
          setScreenCaptureProfile(profile);
          return stream;
        } catch {
          /* try next profile */
        }
      }
      throw new Error('no compatible desktop profile');
    };

    try {
      let stream: MediaStream;
      if (window.devcordDesktop?.isElectron) {
        stream = await openWithElectron();
      } else {
        try {
          stream = await navigator.mediaDevices.getDisplayMedia({
            video: {
              cursor: 'always',
              width: { min: 1920, ideal: 1920 },
              height: { min: 1080, ideal: 1080 },
              frameRate: { min: 60, max: 240 },
            } as MediaTrackConstraints,
            audio: true,
          });
          setScreenCaptureProfile(240);
        } catch {
          stream = await navigator.mediaDevices.getDisplayMedia({
            video: {
              cursor: 'always',
              width: { min: 1920, ideal: 1920 },
              height: { min: 1080, ideal: 1080 },
              frameRate: { min: 60, max: 120 },
            } as MediaTrackConstraints,
            audio: false,
          });
          setScreenCaptureProfile(120);
        }
      }
      stream.getVideoTracks()[0].onended = () => {
        setScreenStream(null);
        setScreenCaptureProfile(null);
      };
      setScreenStream(stream);
    } catch {
      const mockStream = createMockScreenStream();
      mockStream.getVideoTracks()[0].onended = () => {
        setScreenStream(null);
        setScreenCaptureProfile(null);
      };
      setScreenCaptureProfile(60);
      setScreenStream(mockStream);
    }
  };

  const toggleCameraShare = async () => {
    if (!activeVoiceChannel && dmCallState?.status !== 'connected') return;
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
    const sid = String(id);
    if (sid === 'devcord_ai') return { id: 'devcord_ai', name: 'Devcord AI', roleId: 'r1', status: 'online', nickColor: '#00eeff', nickGlow: '0 0 15px rgba(0,238,255,0.4)', avatarUrl: '' };
    if (sid === String(myUserId)) return { id: sid, name: localUserName, roleId: workspaceRoles[0]?.id ?? 'r1', status: 'online', avatarUrl: localUserAvatar, nickColor: localUserColor, nickGlow: localUserGlow };
    const u = workspaceMembers.find((x) => String(x.id) === sid);
    if (u) return u;
    const dmPeer = dmApiConversations.find((c) => String(c.peer.id) === sid)?.peer;
    if (dmPeer) return dmPeer;
    const af = acceptedFriends.find((x) => String(x.id) === sid);
    if (af) return af;
    const fin = friendIncoming.find((r) => String(r.from.id) === sid);
    if (fin) return fin.from;
    const fout = friendOutgoing.find((r) => String(r.to.id) === sid);
    if (fout) return fout.to;
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
    const set = new Set<string>();
    (voicePresenceByChannel[String(channelId)] ?? []).forEach((id) => set.add(String(id)));
    if (activeVoiceChannel === channelId) {
      voiceParticipants.forEach((id) => set.add(String(id)));
    }
    return [...set].sort();
  };

  const locateUserVoiceOnServer = useCallback(
    (uid: string) => {
      const srvName = servers.find((s) => s.id === activeServer)?.name ?? '';
      const want = String(uid);
      for (const ch of channels) {
        if (ch.serverId !== activeServer || ch.type !== 'voice') continue;
        const set = new Set<string>();
        (voicePresenceByChannel[ch.id] ?? []).forEach((id) => set.add(String(id)));
        if (activeVoiceChannel === ch.id) {
          voiceParticipants.forEach((id) => set.add(String(id)));
        }
        if ([...set].some((p) => p === want)) {
          return { channelId: String(ch.id), channelName: ch.name, serverName: srvName };
        }
      }
      return null;
    },
    [channels, activeServer, activeVoiceChannel, voiceParticipants, voicePresenceByChannel, servers],
  );
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
  const isDmView = activeServer === '' && !!dmActiveConversationId && !!dmPeerId;
  const dmPanelPeer = dmPeerId ? (workspaceMembers.find((m) => m.id === dmPeerId) ?? getUser(dmPeerId)) : null;
  const dmPanelTasks = dmActiveConversationId ? (dmTasksByConversation[dmActiveConversationId] ?? []) : [];

  if (API_BASE_URL && !devcordToken) {
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
          setDevcordToken(t);
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
      data-devcord-theme={localTheme}
      className="flex h-screen w-full p-1.5 overflow-hidden relative"
      style={{ background: '#191919', color: 'var(--md-sys-color-on-surface)', fontFamily: 'Inter, system-ui, sans-serif', userSelect: 'none' }}
      onDragEnter={handleDragEnter} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop} 
      onContextMenu={(e) => handleContextMenu(e, 'general', null)}
    >
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; height: 4px; display: none; }
        .custom-scrollbar:hover::-webkit-scrollbar { display: block; }
        .loader-dot { animation: loader 1.4s infinite ease-in-out both; }
        .loader-dot:nth-child(1) { animation-delay: -0.32s; }
        .loader-dot:nth-child(2) { animation-delay: -0.16s; }
        @keyframes loader { 0%, 80%, 100% { transform: scale(0); } 40% { transform: scale(1); } }
        .devcord-category-body[data-open="false"] { max-height: 0; overflow: hidden; opacity: 0; transition: max-height 0.2s ease, opacity 0.15s ease; }
        .devcord-category-body[data-open="true"] { max-height: 2000px; opacity: 1; transition: max-height 0.25s ease, opacity 0.15s ease; }
      `}</style>

      {/* --- MENU KONTEKSTOWE --- */}
      {contextMenu && (
        <div
          className="fixed z-[300] w-64 bg-[#0c0c0e]/95 backdrop-blur-3xl border border-white/[0.1] rounded-xl shadow-[0_20px_60px_rgba(0,0,0,0.9)] overflow-hidden flex flex-col p-1.5 animate-modal-in"
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
                    setDevcordToken('');
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
                  <button
                    onClick={() => {
                      setEditingId(contextMenu.data.id);
                      setEditValue(contextMenu.data.content ?? '');
                      setContextMenu(null);
                    }}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-300 hover:text-white hover:bg-white/[0.05] rounded-lg transition-colors w-full text-left"
                  ><Edit2 size={14}/> Edytuj</button>
                  <button onClick={() => deleteMessage(contextMenu.data.id)} className="flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors w-full text-left"><Trash2 size={14}/> Usuń</button>
                </>
              )}
            </>
          )}
          {contextMenu.type === 'channel' && (
            <>
              <div className="px-3 py-2 text-xs font-bold text-zinc-500 uppercase tracking-widest border-b border-white/[0.05] mb-1 truncate">{contextMenu.data.name}</div>
              <button
                onClick={() => {
                  setNewChannelName(contextMenu.data.name ?? '');
                  setCreateChannelModal({ categoryId: contextMenu.data.categoryId });
                  setContextMenu(null);
                }}
                className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-300 hover:text-white hover:bg-white/[0.05] rounded-lg transition-colors w-full text-left"
              ><Edit2 size={14}/> Edytuj kanał</button>
              <button
                onClick={() => {
                  setContextMenu(null);
                  setSettingsSuccess(`Kanał ${contextMenu.data.name} został wyciszony lokalnie.`);
                  window.setTimeout(() => setSettingsSuccess(''), 1800);
                }}
                className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-300 hover:text-white hover:bg-white/[0.05] rounded-lg transition-colors w-full text-left"
              ><BellOff size={14}/> Wycisz</button>
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
                  const u = contextMenu.data as UserInfo;
                  setContextMenu(null);
                  void openDmForPeer(u.id);
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
                        min={VOICE_PEER_GAIN_MIN}
                        max={VOICE_PEER_GAIN_MAX}
                        step={0.05}
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
                    <p className="text-[9px] text-zinc-600 px-0.5 leading-snug">
                      Głośność tylko u Ciebie (Web Audio). 100% = ×1, 200% = ×2, max {Math.round(VOICE_PEER_GAIN_MAX * 100)}%.
                    </p>
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

      {deepJoinToken && API_BASE_URL && devcordToken && (
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
                  if (window.location.pathname.match(/^\/(?:join|invite)\//i)) window.history.replaceState({ devcord: 1 }, '', APP_BASE_PATH);
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
                  if (window.location.pathname.match(/^\/(?:join|invite)\//i)) window.history.replaceState({ devcord: 1 }, '', APP_BASE_PATH);
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

      <SettingsOverlay
        open={isSettingsOpen}
        activeTab={settingsTab}
        onTabChange={setSettingsTab}
        onClose={() => setIsSettingsOpen(false)}
        success={settingsSuccess}
        error={settingsError}
      >
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

              {settingsTab === 'privacy' && (
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

                  {API_BASE_URL ? (
                    <div className="pt-6 border-t border-white/[0.06]">
                      <h4 className="text-sm font-bold text-white mb-1">Sesja</h4>
                      <p className="text-xs text-zinc-500 mb-4">Wyloguj się z tej przeglądarki. Token zostanie usunięty z pamięci lokalnej.</p>
                      <button
                        type="button"
                        onClick={() => {
                          clearStoredAuthToken();
                          setDevcordToken('');
                          setIsSettingsOpen(false);
                        }}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-white/[0.12] text-zinc-200 hover:bg-white/[0.06] hover:text-white transition-colors text-sm font-semibold"
                      >
                        <LogOut size={18} className="text-zinc-400" />
                        Wyloguj
                      </button>
                    </div>
                  ) : null}

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
                    <h3 className="text-xl font-bold text-white mb-1">Audio</h3>
                    <p className="text-sm text-zinc-400">Mikrofon, redukcja szumów i poziom wejścia.</p>
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
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-bold text-white tracking-wide">NullNoise AI (RNNoise)</span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={rnnoiseEnabled}
                        onClick={() => setRnnoiseEnabled(!rnnoiseEnabled)}
                        className={`relative w-12 h-6 rounded-full transition-colors ${rnnoiseEnabled ? 'bg-[#00eeff]/50' : 'bg-white/[0.1]'}`}
                      >
                        <span className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${rnnoiseEnabled ? 'translate-x-6' : ''}`} />
                      </button>
                    </div>
                    <p className="mt-3 text-xs text-zinc-500 leading-relaxed">
                      VoidFilter ładuje się leniwie dopiero przy wejściu na kanał głosowy / połączenie DM. Bramka ciszy została wyłączona.
                    </p>
                  </div>
                  <div className="bg-[#151515] border border-white/[0.08] rounded-2xl p-5">
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <span className="text-sm font-bold text-white tracking-wide">Poziom mikrofonu</span>
                      <span className="text-xs text-zinc-400 tabular-nums">{Math.round(micLevel * 100)}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-white/[0.08] overflow-hidden">
                      <div
                        className="h-full transition-[width] duration-75"
                        style={{
                          width: `${Math.round(micLevel * 100)}%`,
                          background:
                            micLevel > 0.82
                              ? 'var(--md-sys-color-error)'
                              : 'var(--md-sys-color-primary)',
                        }}
                      />
                    </div>
                    <p className="mt-2 text-xs text-zinc-500">
                      Wskaźnik działa lokalnie i nie wysyła próbek audio na serwer.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void refreshAudioDevices()}
                    className="mt-4 w-full py-3 rounded-xl text-sm font-semibold border border-white/[0.1] text-zinc-300 hover:bg-white/[0.05] hover:text-white transition-colors"
                  >
                    Wyszukaj ponownie urządzenia
                  </button>
                  <p className="text-sm text-zinc-500 leading-relaxed">
                    Mikrofon i NullNoise zapisują się automatycznie w tej przeglądarce.
                  </p>
                </div>
              )}
              {settingsTab === 'video' && (
                <div className="space-y-6 animate-in fade-in duration-300">
                  <div>
                    <h3 className="text-xl font-bold text-white mb-1">Wideo</h3>
                    <p className="text-sm text-zinc-400">Jakość udostępniania ekranu i strumienia.</p>
                  </div>
                  <div className="rounded-2xl border border-white/[0.08] bg-[#151515] p-5 space-y-4">
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">Rozdzielczość streamu</label>
                      <select
                        value={screenRes}
                        onChange={(e) => {
                          const r = parseInt(e.target.value, 10);
                          setScreenRes(r);
                          if (r === 1440 && screenFps > 60) setScreenFps(60);
                        }}
                        className="w-full bg-[#111] border border-white/[0.1] rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-[#00eeff]/40"
                      >
                        <option value={720}>720p</option>
                        <option value={1080}>1080p</option>
                        <option value={1440}>1440p</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">FPS streamu</label>
                      <select
                        value={screenFps}
                        onChange={(e) => setScreenFps(parseInt(e.target.value, 10))}
                        className="w-full bg-[#111] border border-white/[0.1] rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-[#00eeff]/40"
                      >
                        <option value={30}>30 FPS</option>
                        <option value={60}>60 FPS</option>
                        {screenRes < 1440 ? <option value={120}>120 FPS</option> : null}
                        {screenRes < 1440 ? <option value={240}>240 FPS</option> : null}
                      </select>
                    </div>
                    <div className="rounded-xl border border-white/[0.08] bg-black/25 p-3 text-xs text-zinc-400 space-y-1">
                      <div className="flex items-center justify-between">
                        <span>Profil capture</span>
                        <span className="font-semibold text-zinc-200">
                          {screenCaptureProfile ? `${screenCaptureProfile} FPS` : 'auto'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Real capture FPS</span>
                        <span className="font-semibold text-zinc-200">
                          {screenCaptureFps != null ? `${screenCaptureFps}` : '—'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Send bitrate (kbps)</span>
                        <span className="font-semibold text-zinc-200">
                          {screenPublishStats.sendBitrateKbps != null ? `${screenPublishStats.sendBitrateKbps}` : '—'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Packets lost</span>
                        <span className="font-semibold text-zinc-200">
                          {screenPublishStats.packetsLost != null ? `${screenPublishStats.packetsLost}` : '—'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
      </SettingsOverlay>

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
        className="flex h-full w-full rounded-md3-xli overflow-hidden relative devcord-shell"
        style={{ background: 'var(--md-sys-color-surface-container-low)' }}
      >
        
        {/* --- 1. LEWY PANEL (NAV) --- */}
        {!isZenMode && (
          <div className="flex shrink-0 z-30 min-h-0">
            <ServerRail
              activeServerId={activeServer}
              personalActive={activeServer === ''}
              servers={servers.map((s) => ({
                id: s.id,
                name: s.name,
                icon: s.icon,
              }))}
              onSelectPersonal={() => {
                setActiveServer('');
                setActiveChannel('');
                writePersonalHomePath();
                setIsWorkspaceDropdownOpen(false);
              }}
              onSelectServer={(id) => {
                setActiveServer(id);
                setIsWorkspaceDropdownOpen(false);
              }}
              onAddServer={() => setCreateServerModal('create')}
              onContextMenuServer={(e, server) => {
                const full = servers.find((x) => x.id === server.id);
                if (full) handleContextMenu(e, 'server', full);
              }}
            />
            <ChannelSidebar onContextMenu={(e) => handleContextMenu(e, 'workspace', null)}>
            {/* Workspace header */}
            <div className="relative px-[var(--gap-md)] pt-4 pb-2 z-50 flex-shrink-0">
              {API_BASE_URL && servers.length === 0 ? (
                <div className="rounded-md3-md p-3" style={{ background: 'var(--md-sys-color-surface-container)', border: '1px solid var(--md-sys-color-outline-variant)' }}>
                  <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--md-sys-color-outline)' }}>Serwery</p>
                  <p className="text-sm mb-3 leading-relaxed" style={{ color: 'var(--md-sys-color-on-surface-variant)' }}>Utwórz pierwszą przestrzeń albo dołącz kodem.</p>
                  <button
                    type="button"
                    onClick={() => setCreateServerModal('create')}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-md3-md text-sm font-semibold"
                    style={{ background: 'var(--md-sys-color-primary-container)', color: 'var(--md-sys-color-on-primary-container)' }}
                  >
                    <Plus size={16} /> Utwórz serwer
                  </button>
                  <button
                    type="button"
                    onClick={() => setCreateServerModal('join')}
                    className="w-full mt-1.5 flex items-center justify-center gap-2 py-2.5 rounded-md3-md text-sm font-semibold transition-colors"
                    style={{ color: 'var(--md-sys-color-on-surface-variant)', border: '1px solid var(--md-sys-color-outline-variant)' }}
                  >
                    <LogIn size={16} /> Dołącz do serwera
                  </button>
                </div>
              ) : (
                (() => {
                  const activeServerData = activeServer === '' ? null : servers.find((s) => s.id === activeServer);
                  const displayName = activeServer === '' ? 'Terminal Osobisty' : (activeServerData?.name ?? 'Serwer');
                  const DisplayIcon = activeServer === '' ? Terminal : (activeServerData?.icon ?? Terminal);
                  return (
                    <>
                      <button
                        onClick={() => setIsWorkspaceDropdownOpen(!isWorkspaceDropdownOpen)}
                        className="w-full flex items-center gap-[var(--gap-md)] px-[var(--gap-md)] py-[var(--gap-sm)] rounded-md3-xl transition-colors"
                        style={{
                          height: 48,
                          background: isWorkspaceDropdownOpen ? 'var(--md-sys-color-surface-container)' : 'transparent',
                          color: 'var(--md-sys-color-on-surface)',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--md-sys-color-surface-container)')}
                        onMouseLeave={e => (e.currentTarget.style.background = isWorkspaceDropdownOpen ? 'var(--md-sys-color-surface-container)' : 'transparent')}
                      >
                        <div
                          className="w-8 h-8 rounded-md3-sm flex items-center justify-center flex-shrink-0"
                          style={{ background: 'var(--md-sys-color-primary-container)', color: 'var(--md-sys-color-on-primary-container)' }}
                        >
                          <DisplayIcon size={18} />
                        </div>
                        <span className="text-[15px] font-semibold truncate flex-1 text-left">{displayName}</span>
                        <ChevronsUpDown size={16} style={{ color: 'var(--md-sys-color-outline)', flexShrink: 0 }} />
                      </button>
                      {isWorkspaceDropdownOpen && (
                        <div
                          className="absolute top-[calc(100%-4px)] left-0 right-0 mx-[var(--gap-md)] mt-1 rounded-md3-md shadow-md3 p-1.5 flex flex-col gap-0.5 z-50 animate-modal-in"
                          style={{ background: 'var(--md-sys-color-surface-container-highest)', border: '1px solid var(--md-sys-color-outline-variant)' }}
                        >
                          <button
                            onClick={() => {
                              setActiveServer('');
                              setActiveChannel('');
                              writePersonalHomePath();
                              setIsWorkspaceDropdownOpen(false);
                            }}
                            className="w-full flex items-center gap-[var(--gap-md)] px-[var(--gap-md)] py-[var(--gap-sm)] rounded-md3-md text-sm transition-colors"
                            style={{
                              color: activeServer === '' ? 'var(--md-sys-color-on-primary-container)' : 'var(--md-sys-color-on-surface)',
                              background: activeServer === '' ? 'var(--md-sys-color-primary-container)' : 'transparent',
                            }}
                            onMouseEnter={e => { if (activeServer !== '') e.currentTarget.style.background = 'var(--md-sys-color-surface-container)'; }}
                            onMouseLeave={e => { if (activeServer !== '') e.currentTarget.style.background = 'transparent'; }}
                          >
                            <Terminal size={16} className="flex-shrink-0" />
                            <span className="flex-1 text-left font-medium">Terminal Osobisty</span>
                            {activeServer === '' && <Check size={14} />}
                          </button>
                          {servers.length > 0 && <div className="h-px my-1" style={{ background: 'var(--md-sys-color-outline-variant)' }} />}
                          {servers.map((server) => (
                            <button
                              key={server.id}
                              onClick={() => {
                                setActiveServer(server.id);
                                setIsWorkspaceDropdownOpen(false);
                              }}
                              onContextMenu={(e) => handleContextMenu(e, 'server', server)}
                              className="w-full flex items-center gap-[var(--gap-md)] px-[var(--gap-md)] py-[var(--gap-sm)] rounded-md3-md text-sm transition-colors"
                              style={{
                                color: activeServer === server.id ? 'var(--md-sys-color-on-primary-container)' : 'var(--md-sys-color-on-surface)',
                                background: activeServer === server.id ? 'var(--md-sys-color-primary-container)' : 'transparent',
                              }}
                              onMouseEnter={e => { if (activeServer !== server.id) e.currentTarget.style.background = 'var(--md-sys-color-surface-container)'; }}
                              onMouseLeave={e => { if (activeServer !== server.id) e.currentTarget.style.background = 'transparent'; }}
                            >
                              <div className="w-6 h-6 rounded-md3-xs flex items-center justify-center flex-shrink-0" style={{ background: 'var(--md-sys-color-secondary-container)', color: 'var(--md-sys-color-on-secondary-container)' }}>
                                <server.icon size={14} />
                              </div>
                              <span className="flex-1 text-left font-medium truncate">{server.name}</span>
                              {activeServer === server.id && <Check size={14} />}
                            </button>
                          ))}
                          <div className="h-px my-1" style={{ background: 'var(--md-sys-color-outline-variant)' }} />
                          <button
                            onClick={() => { setCreateServerModal('create'); setIsWorkspaceDropdownOpen(false); }}
                            className="w-full flex items-center gap-[var(--gap-md)] px-[var(--gap-md)] py-[var(--gap-sm)] rounded-md3-md text-sm transition-colors"
                            style={{ color: 'var(--md-sys-color-on-surface-variant)' }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'var(--md-sys-color-surface-container)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                          >
                            <Plus size={16} className="flex-shrink-0" /> <span className="font-medium">Utwórz serwer</span>
                          </button>
                          <button
                            onClick={() => { setCreateServerModal('join'); setIsWorkspaceDropdownOpen(false); }}
                            className="w-full flex items-center gap-[var(--gap-md)] px-[var(--gap-md)] py-[var(--gap-sm)] rounded-md3-md text-sm transition-colors"
                            style={{ color: 'var(--md-sys-color-on-surface-variant)' }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'var(--md-sys-color-surface-container)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                          >
                            <LogIn size={16} className="flex-shrink-0" /> <span className="font-medium">Dołącz do serwera</span>
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
              <div className="flex-1 overflow-y-auto custom-scrollbar py-2 px-[var(--gap-sm)] flex flex-col gap-1 min-h-0">
                <div
                  className="flex rounded-md3-md p-0.5 mx-[var(--gap-sm)] mb-1 flex-shrink-0"
                  style={{ background: 'var(--md-sys-color-surface-container)' }}
                >
                  {(['messages', 'contacts'] as const).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setPersonalSidebarTab(tab)}
                      className="flex-1 py-1.5 rounded-md3-sm text-[12px] font-semibold transition-colors"
                      style={{
                        background: personalSidebarTab === tab ? 'var(--md-sys-color-surface-container-high)' : 'transparent',
                        color: personalSidebarTab === tab ? 'var(--md-sys-color-on-surface)' : 'var(--md-sys-color-on-surface-variant)',
                      }}
                    >
                      {tab === 'messages' ? 'Rozmowy' : 'Znajomi'}
                    </button>
                  ))}
                </div>
                {!API_BASE_URL ? (
                  <p className="text-xs text-zinc-500 px-2 leading-relaxed relative z-10">
                    Tryb lokalny — DM używa identyfikatora gościa; wiadomości zapisują się w tej przeglądarce.
                  </p>
                ) : !meUserId ? (
                  <p className="text-xs text-zinc-500 px-2 leading-relaxed relative z-10">Zaloguj się, aby pisać z członkami zespołu.</p>
                ) : personalSidebarTab === 'messages' ? (
                  <>
                    {dmApiConversations.length === 0 ? (
                      <p className="text-xs text-zinc-500 px-2 relative z-10 leading-relaxed">
                        Brak rozmów PW. Otwórz profil osoby na serwerze i wybierz „Wyślij wiadomość”, albo przejdź do zakładki Znajomi.
                      </p>
                    ) : (
                      <div className="flex flex-col gap-0.5">
                        {dmApiConversations.map((c) => {
                          const active = dmActiveConversationId === c.id;
                          const last = c.last_message?.content;
                          const avSrc = c.peer.avatarUrl?.trim()
                            ? resolveMediaUrl(API_BASE_URL || appPublicOrigin(), c.peer.avatarUrl) ?? c.peer.avatarUrl
                            : '';
                          return (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => {
                                setDmActiveConversationId(c.id);
                                setDmPeerId(c.peer.id);
                              }}
                              className="menu-btn"
                              data-active={active}
                              style={active ? { background: 'var(--md-sys-color-primary-container)', color: 'var(--md-sys-color-on-primary-container)' } : undefined}
                            >
                              <div className="relative shrink-0 flex-shrink-0">
                                {avSrc ? (
                                  <img src={avSrc} alt="" className="w-8 h-8 rounded-full object-cover" />
                                ) : (
                                  <div
                                    className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                                    style={{ background: 'var(--md-sys-color-secondary-container)', color: 'var(--md-sys-color-on-secondary-container)' }}
                                  >
                                    {c.peer.name.charAt(0)}
                                  </div>
                                )}
                                <div
                                  className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2"
                                  style={{ background: 'var(--color-status-online)', borderColor: 'var(--md-sys-color-surface-container-low)' }}
                                />
                              </div>
                              <div className="flex flex-col min-w-0 flex-1 overflow-hidden">
                                <NickLabel user={c.peer} fallbackColor="var(--md-sys-color-on-surface)" className="text-sm font-semibold truncate" />
                                <span className="text-[11px] truncate" style={{ color: 'var(--md-sys-color-outline)' }}>{last || 'Rozpocznij rozmowę…'}</span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="relative z-10 space-y-4">
                    {API_BASE_URL && meUserId ? (
                      <>
                        {friendIncoming.length > 0 && (
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 px-2 mb-1.5">Zaproszenia</p>
                            <div className="space-y-1">
                              {friendIncoming.map((r) => {
                                const m = r.from;
                                const mAv = m.avatarUrl?.trim()
                                  ? resolveMediaUrl(API_BASE_URL || appPublicOrigin(), m.avatarUrl) ?? m.avatarUrl
                                  : '';
                                return (
                                  <div
                                    key={r.id}
                                    className="flex items-center gap-[var(--gap-md)] px-[var(--gap-md)] py-[var(--gap-sm)] rounded-md3-md"
                                    style={{ background: 'var(--md-sys-color-surface-container)', border: '1px solid var(--md-sys-color-outline-variant)' }}
                                  >
                                    {mAv ? (
                                      <img src={mAv} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
                                    ) : (
                                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0" style={{ background: 'var(--md-sys-color-secondary-container)', color: 'var(--md-sys-color-on-secondary-container)' }}>
                                        {m.name.charAt(0)}
                                      </div>
                                    )}
                                    <div className="flex flex-col min-w-0 flex-1">
                                      <NickLabel user={m} fallbackColor="var(--md-sys-color-on-surface)" className="text-sm font-semibold truncate" />
                                      <span className="text-[11px]" style={{ color: 'var(--md-sys-color-outline)' }}>chce dodać Cię do znajomych</span>
                                    </div>
                                    <div className="flex shrink-0 gap-1">
                                      <button
                                        type="button"
                                        onClick={() => void acceptFriendByRequestId(r.id)}
                                        className="px-2 py-1 rounded-md3-sm text-[11px] font-semibold"
                                        style={{ background: 'var(--md-sys-color-primary-container)', color: 'var(--md-sys-color-on-primary-container)' }}
                                      >
                                        Akceptuj
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => void rejectFriendByRequestId(r.id)}
                                        className="px-2 py-1 rounded-md3-sm text-[11px] font-semibold"
                                        style={{ color: 'var(--md-sys-color-on-surface-variant)' }}
                                      >
                                        Odrzuć
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                        {friendOutgoing.length > 0 && (
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 px-2 mb-1.5">Wysłane</p>
                            <div className="space-y-1">
                              {friendOutgoing.map((r) => {
                                const m = r.to;
                                const mAv = m.avatarUrl?.trim()
                                  ? resolveMediaUrl(API_BASE_URL || appPublicOrigin(), m.avatarUrl) ?? m.avatarUrl
                                  : '';
                                return (
                                  <div
                                    key={r.id}
                                    className="flex items-center gap-2 p-2 rounded-xl border border-white/[0.06] opacity-80"
                                  >
                                    {mAv ? (
                                      <img src={mAv} alt="" className="w-8 h-8 rounded-[10px] object-cover border border-white/[0.1] shrink-0" />
                                    ) : (
                                      <div className="w-8 h-8 rounded-[10px] bg-black border border-white/[0.1] flex items-center justify-center text-xs font-bold text-white shrink-0">
                                        {m.name.charAt(0)}
                                      </div>
                                    )}
                                    <div className="min-w-0 flex-1">
                                      <NickLabel user={m} fallbackColor="#e4e4e7" className="text-sm font-semibold truncate" />
                                      <span className="text-[10px] text-zinc-500">oczekuje na akceptację</span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                        {acceptedFriends.length > 0 && (
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 px-2 mb-1.5">Znajomi</p>
                            <div className="space-y-1">
                              {acceptedFriends.map((m) => {
                                const mAv = m.avatarUrl?.trim()
                                  ? resolveMediaUrl(API_BASE_URL || appPublicOrigin(), m.avatarUrl) ?? m.avatarUrl
                                  : '';
                                const active = dmPeerId === m.id && !!dmActiveConversationId;
                                return (
                                  <button
                                    key={m.id}
                                    type="button"
                                    onClick={() => void openDmForPeer(m.id)}
                                    className="menu-btn"
                                    data-active={active}
                                    style={active ? { background: 'var(--md-sys-color-primary-container)', color: 'var(--md-sys-color-on-primary-container)' } : undefined}
                                  >
                                    <div className="relative shrink-0 flex-shrink-0">
                                      {mAv ? (
                                        <img src={mAv} alt="" className="w-8 h-8 rounded-full object-cover" />
                                      ) : (
                                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: 'var(--md-sys-color-secondary-container)', color: 'var(--md-sys-color-on-secondary-container)' }}>
                                          {m.name.charAt(0)}
                                        </div>
                                      )}
                                      <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2" style={{ background: 'var(--color-status-online)', borderColor: 'var(--md-sys-color-surface-container-low)' }} />
                                    </div>
                                    <div className="flex flex-col min-w-0 flex-1 overflow-hidden">
                                      <NickLabel user={m} fallbackColor="var(--md-sys-color-on-surface)" className="text-sm font-semibold truncate" />
                                      <span className="text-[11px] truncate" style={{ color: 'var(--md-sys-color-outline)' }}>Wyślij wiadomość</span>
                                    </div>
                                    <UserCheck size={14} style={{ color: 'var(--color-status-online)', flexShrink: 0 }} />
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </>
                    ) : null}
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 px-2 mb-1.5">Kontakty z serwerów</p>
                      {workspaceMembers.filter((m) => m.id !== meUserId).length === 0 ? (
                        <p className="text-xs text-zinc-500 px-2 leading-relaxed">
                          Dołącz do serwera, aby zobaczyć członków i wysłać zaproszenie do znajomych.
                        </p>
                      ) : (
                        <div className="space-y-1">
                          {workspaceMembers
                            .filter((m) => m.id !== meUserId)
                            .map((m) => {
                              const key = dmThreadKey(myUserId, m.id);
                              const lastLocal = (dmMessagesByThread[key] ?? []).slice(-1)[0];
                              const active = API_BASE_URL ? dmPeerId === m.id && !!dmActiveConversationId : dmPeerId === m.id;
                              const mAv = m.avatarUrl?.trim()
                                ? resolveMediaUrl(API_BASE_URL || appPublicOrigin(), m.avatarUrl) ?? m.avatarUrl
                                : '';
                              const isFr = acceptedFriends.some((f) => f.id === m.id);
                              const pendOut = friendOutgoing.some((o) => o.to.id === m.id);
                              const pendIn = friendIncoming.some((i) => i.from.id === m.id);
                                return (
                                <button
                                  key={m.id}
                                  type="button"
                                  onClick={() => void openDmForPeer(m.id)}
                                  className="menu-btn"
                                  data-active={active}
                                  style={active ? { background: 'var(--md-sys-color-primary-container)', color: 'var(--md-sys-color-on-primary-container)' } : undefined}
                                >
                                  <div className="relative shrink-0 flex-shrink-0">
                                    {mAv ? (
                                      <img src={mAv} alt="" className="w-8 h-8 rounded-full object-cover" />
                                    ) : (
                                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: 'var(--md-sys-color-secondary-container)', color: 'var(--md-sys-color-on-secondary-container)' }}>
                                        {m.name.charAt(0)}
                                      </div>
                                    )}
                                    <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2" style={{ background: 'var(--color-status-online)', borderColor: 'var(--md-sys-color-surface-container-low)' }} />
                                  </div>
                                  <div className="flex flex-col min-w-0 flex-1 overflow-hidden">
                                    <NickLabel user={m} fallbackColor="var(--md-sys-color-on-surface)" className="text-sm font-semibold truncate" />
                                    <span className="text-[11px] truncate" style={{ color: 'var(--md-sys-color-outline)' }}>
                                      {!API_BASE_URL && lastLocal ? lastLocal.content : 'Wyślij wiadomość'}
                                    </span>
                                  </div>
                                  {API_BASE_URL && meUserId ? (
                                    <span
                                      className="shrink-0"
                                      onClick={(e) => e.stopPropagation()}
                                      onKeyDown={(e) => e.stopPropagation()}
                                      role="presentation"
                                    >
                                      {isFr ? (
                                        <UserCheck size={14} style={{ color: 'var(--color-status-online)' }} />
                                      ) : pendIn ? (
                                        <span className="text-[10px] font-semibold px-1" style={{ color: 'var(--md-sys-color-primary)' }}>Zaproszenie</span>
                                      ) : pendOut ? (
                                        <span className="text-[10px] px-1" style={{ color: 'var(--md-sys-color-outline)' }}>Wysłano</span>
                                      ) : (
                                        <button
                                          type="button"
                                          title="Zaproś do znajomych"
                                          onClick={() => void sendFriendRequest(m.id)}
                                          className="p-1.5 rounded-md3-sm transition-colors"
                                          style={{ color: 'var(--md-sys-color-on-surface-variant)' }}
                                          onMouseEnter={e => (e.currentTarget.style.background = 'var(--md-sys-color-surface-container)')}
                                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                        >
                                          <UserPlus size={14} />
                                        </button>
                                      )}
                                    </span>
                                  ) : null}
                                </button>
                              );
                            })}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : (
            <div className="flex-1 overflow-y-auto custom-scrollbar py-2 flex flex-col min-h-0">

              {/* Channel helper */}
              {(() => {
                const renderChannelRow = (channel: typeof uncategorizedChannels[0]) => {
                  const isVoice = channel.type === 'voice';
                  const isActiveVoice = activeVoiceChannel === channel.id;
                  const isViewed = activeChannel === channel.id;
                  const isActive = isViewed || isActiveVoice;
                  const participantsOnChannel = isVoice ? userIdsOnVoiceChannel(channel.id) : [];
                  const sidebarVoiceVad = isVoice && activeVoiceChannel === channel.id && voicePhase === 'connected';
                  return (
                    <div key={channel.id} className="flex flex-col">
                      <button
                        onClick={() => handleChannelClick(channel)}
                        onContextMenu={(e) => handleContextMenu(e, 'channel', channel)}
                        className="menu-btn"
                        data-active={isActive}
                        style={isActive
                          ? { background: 'var(--md-sys-color-primary-container)', color: 'var(--md-sys-color-on-primary-container)' }
                          : undefined}
                      >
                        {isVoice && isActiveVoice ? (
                          <Volume2 size={16} className="shrink-0" style={{ color: 'var(--md-sys-color-primary)' }} />
                        ) : (
                          <channel.icon size={16} className="shrink-0" style={{ color: isActive ? 'inherit' : 'var(--md-sys-color-on-surface-variant)' }} />
                        )}
                        <span className="truncate min-w-0 flex-1 text-left font-medium">{channel.name}</span>
                        {isVoice && participantsOnChannel.length > 0 && (
                          <span
                            className="shrink-0 text-[11px] font-semibold tabular-nums px-1.5 py-0.5 rounded-md3-xs"
                            style={{ background: 'var(--md-sys-color-surface-container)', color: 'var(--md-sys-color-on-surface-variant)' }}
                          >
                            {participantsOnChannel.length}
                          </span>
                        )}
                        {!isVoice && channel.unread && !isViewed && (
                          <span
                            className="shrink-0 w-2 h-2 rounded-full"
                            style={{ background: 'var(--md-sys-color-primary)' }}
                            aria-label="Nieprzeczytane"
                          />
                        )}
                      </button>
                      {isVoice && participantsOnChannel.length > 0 && (
                        <div className="ms-[calc(var(--gap-md)*2+16px)] flex flex-col gap-0.5 mt-0.5 mb-1">
                          {participantsOnChannel.map((uid) => {
                            const u = getUser(uid);
                            return (
                              <VoiceSidebarParticipantRow
                                key={uid}
                                user={u}
                                isMe={uid === myUserId}
                                voicePhaseConnected={voicePhase === 'connected'}
                                sidebarVoiceVad={sidebarVoiceVad}
                                isSpeaking={!!speakingPeers[uid]}
                                onContextMenu={(e) => handleContextMenu(e, 'user', u)}
                              />
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                };
                return (
                  <>
                    {uncategorizedChannels.length > 0 && (
                      <div className="flex flex-col mb-2">
                        {uncategorizedChannels.map(renderChannelRow)}
                      </div>
                    )}
                    {currentServerCategories.map(cat => {
                      const catChannels = currentServerChannels.filter(c => c.categoryId === cat.id);
                      return (
                        <div key={cat.id} className="mb-2">
                          <div
                            className="flex items-center justify-between px-[calc(var(--gap-lg)+5px)] pt-2.5 pb-1 cursor-pointer select-none group"
                            style={{ color: 'var(--md-sys-color-on-surface-variant)' }}
                            onClick={() => toggleCategory(cat.id)}
                            onContextMenu={(e) => handleContextMenu(e, 'category', cat)}
                          >
                            <div className="flex items-center gap-[var(--gap-sm)] flex-1 min-w-0">
                              <ChevronDown
                                size={12}
                                className="transition-transform duration-200 flex-shrink-0"
                                style={{ transform: !cat.isExpanded ? 'rotate(-90deg)' : 'none' }}
                              />
                              <span className="text-[11px] uppercase tracking-[0.15em] font-bold truncate"
                                style={{ color: 'var(--md-sys-color-on-surface-variant)' }}
                              >{cat.name}</span>
                            </div>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setCreateChannelModal({ categoryId: cat.id }); setNewChannelType('text'); }}
                              className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-white/10 flex-shrink-0"
                            >
                              <Plus size={14} />
                            </button>
                          </div>
                          <div className="devcord-category-body flex flex-col" data-open={cat.isExpanded ? 'true' : 'false'}>
                            {catChannels.length === 0 && (
                              <span className="px-[var(--gap-lg)] py-1 text-[11px] italic" style={{ color: 'var(--md-sys-color-outline)' }}>
                                Kategoria jest pusta
                              </span>
                            )}
                            {catChannels.map(renderChannelRow)}
                          </div>
                        </div>
                      );
                    })}
                  </>
                );
              })()}
            </div>
            )}

            {API_BASE_URL && activeVoiceChannel && (
              <div
                className="shrink-0 px-[var(--gap-md)] py-[var(--gap-md)] flex flex-col gap-[var(--gap-sm)]"
                style={{ borderTop: '1px solid var(--md-sys-color-outline-variant)', background: 'var(--md-sys-color-surface-container)' }}
              >
                {/* Connection status */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-[var(--gap-sm)] min-w-0">
                    <div
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ background: voicePhase === 'connected' ? 'var(--color-status-online)' : voicePhase === 'error' ? 'var(--md-sys-color-error)' : 'var(--color-status-idle)' }}
                    />
                    <span
                      className="text-[11px] font-semibold truncate"
                      style={{ color: voicePhase === 'connected' ? 'var(--md-sys-color-primary)' : voicePhase === 'error' ? 'var(--md-sys-color-error)' : 'var(--md-sys-color-outline)' }}
                    >
                      {voicePhase === 'connected' ? 'Połączono' : voicePhase === 'error' ? 'Błąd' : voicePhase === 'idle' ? 'Rozłączono' : 'Łączenie…'}
                    </span>
                    <span className="text-[10px] truncate" style={{ color: 'var(--md-sys-color-outline)' }}>
                      {channels.find((c) => c.id === activeVoiceChannel)?.name ?? 'Kanał głosowy'}
                    </span>
                  </div>
                  {voicePingRttMs != null && (
                    <span className="text-[10px] shrink-0 font-mono tabular-nums" style={{ color: 'var(--md-sys-color-outline)' }}>
                      {voicePingRttMs}ms
                    </span>
                  )}
                </div>
                {voicePhase === 'error' && voiceError && (
                  <p className="text-[10px] leading-snug break-words" style={{ color: 'var(--md-sys-color-error)' }}>{voiceError}</p>
                )}
                {/* Action buttons */}
                <div className="voice-actions self-stretch justify-center" style={{ borderRadius: 'var(--borderRadius-md)', padding: '4px', gap: 4 }}>
                  <button
                    type="button"
                    title={cameraStream ? 'Wyłącz kamerę' : 'Włącz kamerę'}
                    disabled={voicePhase !== 'connected'}
                    onClick={() => void toggleCameraShare()}
                    className="flex-1 h-8 rounded-md3-sm flex items-center justify-center transition-colors disabled:opacity-40"
                    style={{
                      background: cameraStream ? 'var(--md-sys-color-primary-container)' : 'var(--md-sys-color-surface-container-high)',
                      color: cameraStream ? 'var(--md-sys-color-on-primary-container)' : 'var(--md-sys-color-on-surface-variant)',
                    }}
                  >
                    <Video size={15} />
                  </button>
                  <button
                    type="button"
                    title={screenStream ? 'Zakończ udostępnianie' : 'Udostępnij ekran'}
                    disabled={voicePhase !== 'connected'}
                    onClick={() => void toggleScreenShare()}
                    className="flex-1 h-8 rounded-md3-sm flex items-center justify-center transition-colors disabled:opacity-40"
                    style={{
                      background: screenStream ? 'var(--md-sys-color-primary-container)' : 'var(--md-sys-color-surface-container-high)',
                      color: screenStream ? 'var(--md-sys-color-on-primary-container)' : 'var(--md-sys-color-on-surface-variant)',
                    }}
                  >
                    <MonitorUp size={15} />
                  </button>
                </div>
              </div>
            )}

            {/* User bar */}
            <div
              className="shrink-0 flex items-center gap-[var(--gap-sm)] px-[var(--gap-sm)] py-[var(--gap-sm)] z-50"
              style={{ borderTop: '1px solid var(--md-sys-color-outline-variant)', background: 'var(--md-sys-color-surface-container)' }}
            >
              <button
                type="button"
                onClick={() => setIsSettingsOpen(true)}
                className="flex items-center gap-[var(--gap-md)] flex-1 min-w-0 px-[var(--gap-sm)] py-[var(--gap-sm)] rounded-md3-xl cursor-pointer transition-colors"
                style={{ color: 'var(--md-sys-color-on-surface)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--md-sys-color-surface-container-high)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <div className="relative flex-shrink-0">
                  {localUserAvatar?.trim() ? (
                    <img src={localUserAvatar} alt="" className="w-8 h-8 rounded-full object-cover" />
                  ) : (
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm"
                      style={{ background: 'var(--md-sys-color-secondary-container)', color: 'var(--md-sys-color-on-secondary-container)' }}
                    >
                      {localUserName.charAt(0)}
                    </div>
                  )}
                  <div
                    className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2"
                    style={{ background: 'var(--color-status-online)', borderColor: 'var(--md-sys-color-surface-container)' }}
                  />
                </div>
                <div className="flex flex-col overflow-hidden min-w-0">
                  <NickLabel
                    user={{ name: localUserName, nickColor: localUserColor, nickGlow: localUserGlow }}
                    fallbackColor="var(--md-sys-color-on-surface)"
                    className="text-sm font-semibold truncate leading-tight"
                  />
                  <span className="text-[11px] truncate leading-tight" style={{ color: 'var(--md-sys-color-outline)' }}>
                    {API_BASE_URL ? 'Online' : 'Gość'}
                  </span>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setIsSettingsOpen(true)}
                className="flex-shrink-0 p-1.5 rounded-md3-sm transition-colors"
                style={{ color: 'var(--md-sys-color-on-surface-variant)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--md-sys-color-surface-container-high)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                title="Ustawienia"
              >
                <Settings size={16} />
              </button>
            </div>
            </ChannelSidebar>
          </div>
        )}

        {/* --- 2. MAIN VIEW (CZAT / VOICE) --- */}
        <ChatColumn>
          {activeServer === '' ? (
            dmPeerId && myUserId ? (
              <div className="flex-1 flex flex-col relative overflow-hidden min-h-0" style={{ background: 'var(--md-sys-color-surface-container-low)' }}>
                {(() => {
                  const dmPeer = workspaceMembers.find((m) => m.id === dmPeerId) ?? getUser(dmPeerId);
                  const tKey = dmThreadKey(myUserId, dmPeerId);
                  const dms: (DmRow | ChatRow)[] = activeDmRows;
                  const sendDmLocal = (trimmed: string) => {
                    const row: DmRow = {
                      id: `dm_${Date.now()}`,
                      userId: myUserId,
                      time: new Date().toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' }),
                      content: trimmed,
                    };
                    setDmMessagesByThread((prev) => ({
                      ...prev,
                      [tKey]: [...(prev[tKey] ?? []), row],
                    }));
                    setDmInputValue('');
                  };
                  const sendDmApi = async (trimmed: string) => {
                    if (!dmActiveConversationId) return;
                    const tmpId = `tmp_${Date.now()}`;
                    setDmMessagesByConversation((prev) => ({
                      ...prev,
                      [dmActiveConversationId]: [
                        ...(prev[dmActiveConversationId] ?? []),
                        {
                          id: tmpId,
                          userId: myUserId,
                          time: new Date().toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' }),
                          content: trimmed,
                          isMe: true,
                        },
                      ],
                    }));
                    setDmInputValue('');
                    try {
                      await apiClient(`/dm/conversations/${dmActiveConversationId}/messages`, 'POST', {
                        content: trimmed,
                      });
                    } catch {
                      setDmMessagesByConversation((prev) => ({
                        ...prev,
                        [dmActiveConversationId]: (prev[dmActiveConversationId] ?? []).filter((r) => r.id !== tmpId),
                      }));
                    }
                  };
                  return (
                    <>
                      <header
                        className="shrink-0 h-12 flex items-center justify-between px-4 gap-[var(--gap-md)] z-10"
                        style={{ borderBottom: '1px solid var(--md-sys-color-outline-variant)', background: 'var(--md-sys-color-surface-container-low)' }}
                      >
                        <div className="flex items-center gap-[var(--gap-md)] min-w-0 flex-1 overflow-hidden">
                          {dmPeer.avatarUrl?.trim() ? (
                            <img src={dmPeer.avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                          ) : (
                            <div
                              className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                              style={{ background: 'var(--md-sys-color-secondary-container)', color: 'var(--md-sys-color-on-secondary-container)' }}
                            >
                              {dmPeer.name.charAt(0)}
                            </div>
                          )}
                          <div className="min-w-0 overflow-hidden">
                            <NickLabel user={dmPeer} fallbackColor="var(--md-sys-color-on-surface)" className="font-semibold text-[15px] truncate block leading-tight" />
                            {API_BASE_URL && Object.keys(dmTypingUsers).filter((u) => u !== myUserId).length > 0 ? (
                              <p className="text-[11px] truncate leading-tight" style={{ color: 'var(--md-sys-color-primary)' }}>
                                {(() => {
                                  const ids = Object.keys(dmTypingUsers).filter((u) => u !== myUserId);
                                  const names = ids.map((id) => getUser(id).name);
                                  if (names.length === 1) return `${names[0]} pisze…`;
                                  if (names.length === 2) return `${names[0]} i ${names[1]} piszą…`;
                                  return `${names[0]}, ${names[1]} i ${names.length - 2} innych pisze…`;
                                })()}
                              </p>
                            ) : (
                              <p className="text-[11px] leading-tight truncate" style={{ color: 'var(--md-sys-color-outline)' }}>Wiadomość bezpośrednia</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-0.5 shrink-0">
                          <button
                            type="button"
                            title="Rozmowa głosowa PV"
                            onClick={() => void startDmCall('audio')}
                            className="p-2 rounded-md3-sm transition-colors"
                            style={{ color: 'var(--md-sys-color-on-surface-variant)' }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'var(--md-sys-color-surface-container)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                          >
                            <Phone size={18} />
                          </button>
                          <button
                            type="button"
                            title="Rozmowa wideo PV"
                            onClick={() => void startDmCall('video')}
                            className="p-2 rounded-md3-sm transition-colors"
                            style={{ color: 'var(--md-sys-color-on-surface-variant)' }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'var(--md-sys-color-surface-container)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                          >
                            <Video size={18} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setProfileCardUser(dmPeer)}
                            className="p-2 rounded-md3-sm transition-colors"
                            style={{ color: 'var(--md-sys-color-on-surface-variant)' }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'var(--md-sys-color-surface-container)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                          >
                            <User size={18} />
                          </button>
                        </div>
                      </header>
                      <div
                        ref={dmScrollRef}
                        onScroll={(e) => {
                          dmStickToBottomRef.current = isNearBottom(e.currentTarget);
                        }}
                        className="flex-1 overflow-y-auto custom-scrollbar px-4 py-3 relative z-10 flex flex-col"
                      >
                        <div className="w-full max-w-none flex flex-col pb-4 mt-auto">
                          {dms.length === 0 ? (
                            <div
                              className="rounded-md3-md p-8 text-center text-sm"
                              style={{ border: '1px dashed var(--md-sys-color-outline-variant)', color: 'var(--md-sys-color-on-surface-variant)' }}
                            >
                              Zacznij rozmowę z <span className="font-semibold" style={{ color: 'var(--md-sys-color-on-surface)' }}>{dmPeer.name}</span>.
                              {API_BASE_URL
                                ? ' Historia jest na serwerze i synchronizowana między urządzeniami.'
                                : ' Historia jest zapisana lokalnie w tej przeglądarce.'}
                            </div>
                          ) : (
                            dms.map((row, idx, arr) => {
                              const isTail = idx > 0 && arr[idx - 1].userId === row.userId;
                              const u = getUser(row.userId);
                              const isMe = row.userId === myUserId;
                              const avatarSrc = u.avatarUrl?.trim()
                                ? resolveMediaUrl(API_BASE_URL || appPublicOrigin(), u.avatarUrl) ?? u.avatarUrl
                                : '';
                              return (
                                <div
                                  key={row.id}
                                  className="msg-row relative flex py-0.5 rounded-md3-md hover:bg-surf-ch transition-colors"
                                  style={{ marginTop: isTail ? 0 : 'var(--message-group-spacing)' }}
                                  onContextMenu={(e) => handleContextMenu(e, 'message', { ...row, isMe })}
                                >
                                  <div className="flex-shrink-0 flex justify-end items-start py-0.5 px-[var(--gap-sm)]" style={{ width: 54 }}>
                                    {!isTail ? (
                                      <button type="button" onClick={(e) => openUserPopout(e, u)}
                                        onContextMenu={(e) => handleContextMenu(e, 'user', u)}
                                        className="w-9 h-9 rounded-md3-md overflow-hidden hover:ring-2 hover:ring-primary/40 transition-all"
                                      >
                                        {avatarSrc ? (
                                          <img src={avatarSrc} alt="" className="w-full h-full object-cover" />
                                        ) : (
                                          <div className="w-full h-full flex items-center justify-center font-bold text-sm" style={{ background: 'var(--md-sys-color-secondary-container)', color: 'var(--md-sys-color-on-secondary-container)' }}>
                                            {u.name.charAt(0)}
                                          </div>
                                        )}
                                      </button>
                                    ) : (
                                      <span className="text-[0.68em] mt-[0.15em] text-right opacity-0 hover:opacity-100 transition-opacity" style={{ width: '7ch', color: 'var(--md-sys-color-outline)', fontVariantNumeric: 'tabular-nums' }}>
                                        {row.time}
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex-1 flex flex-col min-w-0 overflow-hidden pe-[var(--gap-lg)]">
                                    {!isTail && (
                                      <div className="flex items-baseline gap-[var(--gap-md)] mb-[2px]">
                                        <button type="button" onClick={(e) => openUserPopout(e, u)} onContextMenu={(e) => handleContextMenu(e, 'user', u)} className="font-semibold hover:underline bg-transparent border-none p-0">
                                          <NickLabel user={u} fallbackColor={isMe ? 'var(--md-sys-color-primary)' : 'var(--md-sys-color-on-surface)'} className="text-[15px] font-semibold" />
                                        </button>
                                        <span className="text-[0.7em] tabular-nums" style={{ color: 'var(--md-sys-color-outline)' }}>{row.time}</span>
                                      </div>
                                    )}
                                    <div className="msg-content text-sm whitespace-pre-wrap break-words" style={{ fontSize: 'var(--message-size)', color: 'var(--md-sys-color-on-surface)' }}>{row.content}</div>
                                  </div>
                                </div>
                              );
                            })
                          )}
                          <div ref={dmMessagesEndRef} className="h-4" />
                        </div>
                      </div>
                      <MessageInput
                        inputValue={dmInputValue}
                        onChange={setDmInputValue}
                        onSend={() => {
                          if (!dmInputValue.trim()) return;
                          const trimmed = dmInputValue.trim();
                          if (API_BASE_URL && devcordToken && dmActiveConversationId) void sendDmApi(trimmed);
                          else sendDmLocal(trimmed);
                        }}
                        placeholder={`Wiadomość do ${dmPeer.name}…`}
                        pickerTheme={localTheme === 'light' ? 'light' : 'dark'}
                      />
                    </>
                  );
                })()}
              </div>
            ) : (
              <div className="flex-1 flex flex-col p-8 overflow-y-auto custom-scrollbar animate-fade-in" style={{ background: 'var(--md-sys-color-surface-container-low)' }}>
                <div className="max-w-2xl mx-auto w-full pt-8 space-y-6">
                  <div className="flex items-start gap-4">
                    <div
                      className="w-12 h-12 rounded-md3-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: 'var(--md-sys-color-primary-container)', color: 'var(--md-sys-color-on-primary-container)' }}
                    >
                      <Terminal size={24} />
                    </div>
                    <div>
                      <h1 className="text-2xl font-semibold" style={{ color: 'var(--md-sys-color-on-surface)' }}>Terminal osobisty</h1>
                      <p className="text-sm mt-1 leading-relaxed" style={{ color: 'var(--md-sys-color-on-surface-variant)' }}>
                        Wybierz rozmówcę z listy po lewej lub przejdź do serwera.
                      </p>
                    </div>
                  </div>
                  <div
                    className="rounded-md3-lg p-6 space-y-3"
                    style={{ background: 'var(--md-sys-color-surface-container)', border: '1px solid var(--md-sys-color-outline-variant)' }}
                  >
                    <h2 className="text-xs font-bold uppercase tracking-[0.15em]" style={{ color: 'var(--md-sys-color-primary)' }}>Jak zacząć</h2>
                    <ol className="list-decimal list-inside space-y-2 text-sm leading-relaxed" style={{ color: 'var(--md-sys-color-on-surface-variant)' }}>
                      <li>Otwórz przestrzeń roboczą serwera (ikonka nad listą kanałów).</li>
                      <li>Wróć tutaj — w sekcji „Wiadomości bezpośrednie” zobaczysz członków zespołu.</li>
                      <li>
                        {API_BASE_URL
                          ? 'Wiadomości PV są zapisywane w bazie i widoczne po zalogowaniu z innej przeglądarki.'
                          : 'Wiadomości PV są przechowywane lokalnie (ta przeglądarka).'}
                      </li>
                    </ol>
                    {servers.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setActiveServer(servers[0].id)}
                        className="mt-3 px-4 py-2 rounded-md3-md text-sm font-semibold transition-colors"
                        style={{ background: 'var(--md-sys-color-primary-container)', color: 'var(--md-sys-color-on-primary-container)' }}
                      >
                        Przejdź do serwera
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          ) : API_BASE_URL && servers.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-10 text-center">
              <div
                className="w-16 h-16 rounded-md3-lg flex items-center justify-center mb-6"
                style={{ background: 'var(--md-sys-color-primary-container)', color: 'var(--md-sys-color-on-primary-container)' }}
              >
                <Server size={32} />
              </div>
              <h1 className="text-xl font-semibold mb-2" style={{ color: 'var(--md-sys-color-on-surface)' }}>Brak serwerów</h1>
              <p className="text-sm max-w-md mb-6 leading-relaxed" style={{ color: 'var(--md-sys-color-on-surface-variant)' }}>
                Utwórz przestrzeń roboczą lub dołącz do istniejącej.
              </p>
              <div className="flex flex-wrap gap-3 justify-center">
                <button
                  type="button"
                  onClick={() => { setActiveServer(''); setActiveChannel(''); writePersonalHomePath(); }}
                  className="px-5 py-2.5 rounded-md3-xl text-sm font-semibold flex items-center gap-2 transition-colors"
                  style={{ background: 'var(--md-sys-color-primary-container)', color: 'var(--md-sys-color-on-primary-container)' }}
                >
                  <Terminal size={16} /> Terminal osobisty
                </button>
                <button
                  type="button"
                  onClick={() => setCreateServerModal('create')}
                  className="px-5 py-2.5 rounded-md3-xl text-sm font-semibold flex items-center gap-2 transition-colors"
                  style={{ border: '1px solid var(--md-sys-color-outline-variant)', color: 'var(--md-sys-color-on-surface-variant)' }}
                >
                  <Plus size={16} /> Nowy serwer
                </button>
              </div>
            </div>
          ) : API_BASE_URL && servers.length > 0 && !currentChannelData ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-sm" style={{ color: 'var(--md-sys-color-on-surface-variant)' }}>
              <div
                className="w-14 h-14 rounded-md3-lg flex items-center justify-center mb-4"
                style={{ background: 'var(--md-sys-color-surface-container)', color: 'var(--md-sys-color-on-surface-variant)' }}
              >
                <Zap size={24} />
              </div>
              Wybierz kanał z listy po lewej.
            </div>
          ) : (
          <>
          <header
            className="h-12 flex items-center justify-between px-4 shrink-0 z-10"
            style={{ borderBottom: '1px solid var(--md-sys-color-outline-variant)', background: 'var(--md-sys-color-surface-container-low)' }}
          >
            <div className="flex items-center gap-[var(--gap-md)] min-w-0 flex-1 overflow-hidden">
              {currentChannelData && (
                <currentChannelData.icon size={18} className="flex-shrink-0" style={{ color: 'var(--md-sys-color-on-surface-variant)' }} />
              )}
              <span className="font-semibold text-[15px] truncate" style={{ color: 'var(--md-sys-color-on-surface)' }}>
                {currentChannelData?.name}
              </span>
              {!isMainViewVoice && (
                <span className="text-[11px] truncate hidden md:block max-w-[28rem]" style={{ color: 'var(--md-sys-color-outline)' }}>
                  {(() => {
                    const ids = Object.keys(typingUsers).filter((u) => u !== myUserId);
                    if (ids.length === 0) return '';
                    const names = ids.map((id) => workspaceMembers.find((m) => m.id === id)?.name ?? getUser(id).name);
                    if (names.length === 1) return `${names[0]} pisze…`;
                    if (names.length === 2) return `${names[0]} i ${names[1]} piszą…`;
                    return `${names[0]}, ${names[1]} i ${names.length - 2} innych pisze…`;
                  })()}
                </span>
              )}
            </div>
            <div className="flex items-center gap-0.5 flex-shrink-0" style={{ color: 'var(--md-sys-color-on-surface-variant)' }}>
              <button
                onClick={() => setIsZenMode(!isZenMode)}
                className="p-2 rounded-md3-sm transition-colors"
                style={isZenMode ? { background: 'var(--md-sys-color-primary-container)', color: 'var(--md-sys-color-on-primary-container)' } : undefined}
                onMouseEnter={e => { if (!isZenMode) e.currentTarget.style.background = 'var(--md-sys-color-surface-container)'; }}
                onMouseLeave={e => { if (!isZenMode) e.currentTarget.style.background = 'transparent'; }}
                title="Tryb skupienia"
              >
                {isZenMode ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
              </button>
              {!isZenMode && (
                <button
                  onClick={() => { setActiveThread(null); setRightPanelTab(rightPanelTab === 'members' ? null : 'members'); }}
                  className="p-2 rounded-md3-sm transition-colors"
                  style={(rightPanelTab && !activeThread) ? { background: 'var(--md-sys-color-surface-container)', color: 'var(--md-sys-color-on-surface)' } : undefined}
                  onMouseEnter={e => { if (!(rightPanelTab && !activeThread)) e.currentTarget.style.background = 'var(--md-sys-color-surface-container)'; }}
                  onMouseLeave={e => { if (!(rightPanelTab && !activeThread)) e.currentTarget.style.background = 'transparent'; }}
                >
                  <Users size={18} />
                </button>
              )}
            </div>
          </header>

          {isMainViewVoice ? (
            <div className="flex-1 flex flex-col relative overflow-hidden" style={{ background: 'var(--md-sys-color-surface-dim)' }}>
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
                        <div className="w-full flex flex-col gap-4">
                          {/* Maximized Screen */}
                          <div className="w-full aspect-video rounded-md3-lg overflow-hidden relative group" style={{ background: '#000' }}>
                            {maximized.isLocal ? (
                              maximized.kind === 'camera' ? (
                                <>
                                  <div className="w-full h-full overflow-hidden relative">
                                    <VideoPlayer stream={maximized.stream} isLocal={true} className="w-full h-full object-contain bg-black" />
                                    <div className="absolute top-3 left-3 z-20 px-2 py-1 bg-black/60 rounded-md3-xs text-[10px] text-white flex items-center gap-1.5">
                                      <span className="w-2 h-2 rounded-full bg-online animate-pulse"></span>
                                      Kamera
                                    </div>
                                  </div>
                                </>
                              ) : (
                                <>
                                  <div className="w-full h-full overflow-hidden relative">
                                    <VideoPlayer stream={maximized.stream} isLocal={true} className="w-full h-full object-contain bg-black" />
                                    <div className="absolute top-3 left-3 z-20 px-2 py-1 bg-black/60 rounded-md3-xs text-[10px] text-white flex items-center gap-1.5" style={{ border: '1px solid var(--md-sys-color-outline-variant)' }}>
                                      <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: 'var(--md-sys-color-primary)' }}></span>
                                      Twój ekran
                                    </div>
                                    <div className="absolute top-3 right-3 z-30 flex items-center gap-1.5 bg-black/70 px-2 py-1 rounded-md3-xs text-[11px]" style={{ border: '1px solid var(--md-sys-color-outline-variant)', color: 'var(--md-sys-color-on-surface-variant)' }}>
                                      <Monitor size={11} style={{ color: 'var(--md-sys-color-primary)' }} />
                                      <select value={screenRes} onChange={e => {
                                        const r = parseInt(e.target.value);
                                        setScreenRes(r);
                                        if (r === 1440 && screenFps > 60) setScreenFps(60);
                                      }} className="bg-transparent text-white text-xs outline-none cursor-pointer">
                                        <option value={480} className="bg-[#111]">480p</option>
                                        <option value={720} className="bg-[#111]">720p</option>
                                        <option value={1080} className="bg-[#111]">1080p</option>
                                        <option value={1440} className="bg-[#111]">1440p</option>
                                      </select>
                                      <select value={screenFps} onChange={e => setScreenFps(parseInt(e.target.value))} className="bg-transparent text-white text-xs outline-none cursor-pointer ml-1">
                                        <option value={30} className="bg-[#111]">30fps</option>
                                        <option value={60} className="bg-[#111]">60fps</option>
                                        {screenRes < 1440 && <option value={120} className="bg-[#111]">120fps</option>}
                                        {screenRes < 1440 && <option value={240} className="bg-[#111]">240fps</option>}
                                      </select>
                                    </div>
                                  </div>
                                </>
                              )
                            ) : (
                              <div
                                ref={remoteScreenHostRef}
                                className="w-full h-full overflow-hidden relative bg-black min-h-[200px] flex items-center justify-center group/fs"
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
                                    className="absolute top-3 right-3 z-40 p-2 rounded-md3-sm bg-black/70 text-white opacity-90 hover:opacity-100 transition-all"
                                    style={{ border: '1px solid var(--md-sys-color-outline-variant)' }}
                                  >
                                    <Maximize2 size={18} />
                                  </button>
                                  </>
                                ) : (
                                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-8">
                                    <button
                                      onClick={() => setRemoteScreenWatching(true)}
                                      className="px-6 py-2.5 rounded-md3-lg text-sm font-semibold transition-colors"
                                      style={{ background: 'var(--md-sys-color-primary-container)', color: 'var(--md-sys-color-on-primary-container)' }}
                                    >
                                      Obejrzyj stream
                                    </button>
                                  </div>
                                )}
                                <div className="absolute bottom-3 left-3 flex items-center gap-2 px-2 py-1 rounded-md3-xs bg-black/75 text-white text-xs font-semibold pointer-events-none max-w-[min(92%,20rem)] min-w-0">
                                  <Monitor size={12} style={{ color: 'var(--md-sys-color-primary)', flexShrink: 0 }} />
                                  {maximized.isLocal ? (
                                    <span className="truncate">{maximized.kind === 'camera' ? 'Kamera' : 'Twój ekran'}</span>
                                  ) : (
                                    <>
                                      <UserAvatarBubble user={getUser(maximized.id)} className="w-5 h-5 rounded-full" />
                                      <NickLabel user={getUser(maximized.id)} fallbackColor="#fff" className="truncate text-xs font-semibold min-w-0" />
                                    </>
                                  )}
                                </div>
                                {remoteScreenWatching && (
                                  <div className="absolute top-3 left-3 px-2 py-1 bg-black/60 rounded-md3-xs text-[10px] text-white flex items-center gap-1.5 pointer-events-none">
                                    <span className="w-2 h-2 rounded-full bg-online animate-pulse"></span>Oglądasz
                                  </div>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Thumbnail Screens */}
                          {others.length > 0 && (
                            <div className="flex flex-wrap gap-3 justify-center">
                              {others.map(s => (
                                <div
                                  key={s.id}
                                  onClick={() => setMaximizedScreenId(s.id)}
                                  className="w-56 aspect-video rounded-md3-md overflow-hidden cursor-pointer transition-all relative group"
                                  style={{ border: '1px solid var(--md-sys-color-outline-variant)', background: '#000' }}
                                  onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--md-sys-color-primary)')}
                                  onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--md-sys-color-outline-variant)')}
                                >
                                  <VideoPlayer
                                    key={s.isLocal ? `loc-${s.id}` : remoteLiveVideoKey(s.id, s.stream)}
                                    stream={s.stream}
                                    isLocal={s.isLocal}
                                    className="w-full h-full object-cover opacity-70 group-hover:opacity-100 transition-opacity"
                                  />
                                  <div className="absolute bottom-2 left-2 flex items-center gap-1.5 px-2 py-1 rounded-md3-xs bg-black/80 text-white text-[10px] font-semibold min-w-0 max-w-[95%]">
                                    {s.kind === 'camera' ? <Video size={10} className="shrink-0" style={{ color: 'var(--color-status-online)' }} /> : <Monitor size={10} className="shrink-0" style={{ color: 'var(--md-sys-color-primary)' }} />}
                                    <span className="truncate flex items-center gap-1 min-w-0">
                                      {s.kind === 'camera' && s.isLocal ? 'Kamera' : s.isLocal ? 'Twój ekran' : (
                                        <>
                                          <UserAvatarBubble user={getUser(s.id)} className="w-4 h-4 rounded-full" />
                                          <NickLabel user={getUser(s.id)} fallbackColor="#fff" className="truncate font-semibold text-[10px] min-w-0" />
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
                    <div className="flex items-center gap-3 mb-4 px-2">
                      <div className="h-px flex-1" style={{ background: 'var(--md-sys-color-outline-variant)' }}></div>
                      <span className="text-[11px] uppercase tracking-[0.15em] font-semibold" style={{ color: 'var(--md-sys-color-on-surface-variant)' }}>Uczestnicy ({voiceParticipants.length})</span>
                      <div className="h-px flex-1" style={{ background: 'var(--md-sys-color-outline-variant)' }}></div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 w-full max-w-5xl mx-auto px-2">
                      {voiceParticipants.map((uid) => {
                        const u = getUser(uid);
                        const isSelf = uid === myUserId;
                        const isSpeaking = !!speakingPeers[uid];
                        const isScreenSharing =
                          (isSelf && localScreenLive) || mediaStreamHasLiveVideo(remoteScreenByUser[uid]);
                        const muted = isSelf ? localMuted : (remoteVoiceState[uid]?.muted ?? false);
                        const deafened = isSelf ? localDeafened : (remoteVoiceState[uid]?.deafened ?? false);
                        const statusLine = isSelf
                          ? localDeafened
                            ? 'Nie słyszysz innych · mikrofon wył.'
                            : muted
                              ? 'Wyciszony'
                              : 'Połączony'
                          : deafened
                            ? 'Głuchy'
                            : muted
                              ? 'Wyciszony'
                              : 'Połączony';
                        return (
                          <VoiceStageParticipantTile
                            key={uid}
                            user={u}
                            isSelf={isSelf}
                            isSpeaking={isSpeaking}
                            isScreenSharing={isScreenSharing}
                            muted={muted}
                            deafened={deafened}
                            statusLine={statusLine}
                            voicePhase={voicePhase}
                            voiceHasScreenActivity={voiceHasScreenActivity}
                            onContextMenu={(e) => handleContextMenu(e, 'user', u)}
                            onToggleDeafen={(e) => {
                              e.stopPropagation();
                              toggleVoiceHeadphones();
                            }}
                          />
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div
                    className="flex flex-col items-center justify-center text-center p-8 max-w-sm m-auto rounded-md3-lg"
                    style={{ background: 'var(--md-sys-color-surface-container)' }}
                  >
                    <div
                      className="w-14 h-14 rounded-md3-lg flex items-center justify-center mb-4"
                      style={{ background: 'var(--md-sys-color-primary-container)', color: 'var(--md-sys-color-on-primary-container)' }}
                    >
                      {currentChannelData && <currentChannelData.icon size={28} />}
                    </div>
                    <h2 className="text-lg font-semibold mb-2" style={{ color: 'var(--md-sys-color-on-surface)' }}>Kanał głosowy</h2>
                    <p className="text-sm mb-6" style={{ color: 'var(--md-sys-color-on-surface-variant)' }}>Dołącz do kanału, aby rozmawiać z innymi uczestnikami.</p>
                    <button
                      onClick={() => currentChannelData && handleChannelClick(currentChannelData)}
                      className="px-6 py-2.5 rounded-md3-xl text-sm font-semibold transition-colors"
                      style={{ background: 'var(--md-sys-color-primary-container)', color: 'var(--md-sys-color-on-primary-container)' }}
                    >
                      Dołącz
                    </button>
                  </div>
                )}
              </div>
              {activeVoiceChannel === currentChannelData?.id && (
                <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-3">
                  {voiceMixPanelOpen && voicePhase === 'connected' && (
                  <div
                    className="max-h-[min(50vh,320px)] w-[min(92vw,360px)] overflow-y-auto custom-scrollbar rounded-md3-lg p-3 text-left animate-modal-in"
                    style={{ background: 'var(--md-sys-color-surface-container-highest)', border: '1px solid var(--md-sys-color-outline-variant)' }}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="text-[11px] font-semibold uppercase tracking-widest mb-2 px-1" style={{ color: 'var(--md-sys-color-outline)' }}>
                      Miks (tylko u Ciebie)
                    </div>
                    {voiceParticipants.filter((id) => id !== myUserId).length === 0 ? (
                      <p className="text-xs px-1 py-2" style={{ color: 'var(--md-sys-color-on-surface-variant)' }}>Brak innych uczestników.</p>
                    ) : (
                      <ul className="flex flex-col gap-2">
                        {voiceParticipants.filter((id) => id !== myUserId).map((uid) => {
                          const u = getUser(uid);
                          const vol = userVolumes[uid] ?? 1;
                          const outMuted = !!userOutputMuted[uid];
                          return (
                            <li key={uid} className="flex flex-col gap-1.5 rounded-md3-sm px-3 py-2" style={{ background: 'var(--md-sys-color-surface-container-high)' }}>
                              <div className="flex items-center justify-between gap-2 min-w-0">
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                  <UserAvatarBubble user={u} className="w-7 h-7 rounded-full" />
                                  <NickLabel user={u} fallbackColor="var(--md-sys-color-on-surface)" className="text-sm font-semibold truncate min-w-0" />
                                </div>
                                <button
                                  type="button"
                                  title={outMuted ? 'Włącz odsłuch' : 'Wycisz odsłuch'}
                                  onClick={() => {
                                    const next = !outMuted;
                                    setUserOutputMutedMap((prev) => ({ ...prev, [uid]: next }));
                                    setPeerOutputMute(uid, next);
                                  }}
                                  className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-colors"
                                  style={{
                                    background: outMuted ? 'var(--md-sys-color-error-container)' : 'var(--md-sys-color-surface-container)',
                                    color: outMuted ? 'var(--md-sys-color-on-error-container)' : 'var(--md-sys-color-on-surface-variant)',
                                  }}
                                >
                                  {outMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                                </button>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] tabular-nums shrink-0 text-right w-20" style={{ color: 'var(--md-sys-color-outline)' }}>
                                  {voiceVolumeUiLabel(vol)}
                                </span>
                                <input
                                  type="range"
                                  min={VOICE_PEER_GAIN_MIN}
                                  max={VOICE_PEER_GAIN_MAX}
                                  step={0.05}
                                  value={vol}
                                  onChange={(e) => {
                                    const v = parseFloat(e.target.value);
                                    setUserVolumes((prev) => ({ ...prev, [uid]: v }));
                                    setUserVolume(uid, v);
                                  }}
                                  className="flex-1 min-w-0 h-1.5 rounded-full appearance-none"
                                  style={{ accentColor: 'var(--md-sys-color-primary)' }}
                                />
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                  )}
                  {/* Voice action bar */}
                  <div
                    className="flex items-center p-[var(--gap-md)] rounded-md3-xl shadow-md3 gap-[var(--gap-md)] max-w-[98vw] flex-wrap justify-center"
                    style={{ background: 'var(--md-sys-color-surface-container-high)', border: '1px solid var(--md-sys-color-outline-variant)' }}
                  >
                    {/* Mute */}
                    <button
                      type="button"
                      onClick={() => toggleVoiceMic()}
                      className="w-12 h-12 rounded-full flex items-center justify-center transition-colors"
                      style={{
                        background: localMuted || localDeafened ? 'var(--md-sys-color-error-container)' : 'var(--md-sys-color-primary-container)',
                        color: localMuted || localDeafened ? 'var(--md-sys-color-on-error-container)' : 'var(--md-sys-color-on-primary-container)',
                      }}
                      title={localDeafened ? 'Wyjdź z trybu głuchego' : localMuted ? 'Włącz mikrofon' : 'Wycisz mikrofon'}
                    >
                      {localMuted || localDeafened ? <MicOff size={20} /> : <Mic size={20} />}
                    </button>
                    {/* Deafen */}
                    <button
                      type="button"
                      onClick={() => toggleVoiceHeadphones()}
                      disabled={voicePhase !== 'connected'}
                      className="w-10 h-10 rounded-full flex items-center justify-center transition-colors disabled:opacity-40"
                      style={{
                        background: localDeafened ? 'var(--md-sys-color-error-container)' : 'var(--md-sys-color-surface-container)',
                        color: localDeafened ? 'var(--md-sys-color-on-error-container)' : 'var(--md-sys-color-on-surface-variant)',
                      }}
                      title={localDeafened ? 'Włącz odsłuch' : 'Wycisz odsłuch'}
                    >
                      <Headphones size={18} className={localDeafened ? 'opacity-50' : ''} />
                    </button>
                    {/* Mix */}
                    <button
                      type="button"
                      onClick={() => setVoiceMixPanelOpen((o) => !o)}
                      disabled={voicePhase !== 'connected'}
                      className="w-10 h-10 rounded-full flex items-center justify-center transition-colors disabled:opacity-40"
                      style={{
                        background: voiceMixPanelOpen ? 'var(--md-sys-color-primary-container)' : 'var(--md-sys-color-surface-container)',
                        color: voiceMixPanelOpen ? 'var(--md-sys-color-on-primary-container)' : 'var(--md-sys-color-on-surface-variant)',
                      }}
                      title="Miks głośności"
                    >
                      <SlidersHorizontal size={18} />
                    </button>
                    <div className="w-px h-7" style={{ background: 'var(--md-sys-color-outline-variant)' }} />
                    {/* Screen share */}
                    <button
                      type="button"
                      onClick={toggleScreenShare}
                      className="px-4 h-10 rounded-full flex items-center gap-2 text-[12px] font-semibold transition-colors"
                      style={{
                        background: screenStream ? 'var(--md-sys-color-primary-container)' : 'var(--md-sys-color-surface-container)',
                        color: screenStream ? 'var(--md-sys-color-on-primary-container)' : 'var(--md-sys-color-on-surface-variant)',
                      }}
                    >
                      <MonitorUp size={18} />{screenStream ? 'Zakończ' : 'Udostępnij ekran'}
                    </button>
                    <div className="w-px h-7" style={{ background: 'var(--md-sys-color-outline-variant)' }} />
                    {/* Disconnect */}
                    <button
                      type="button"
                      onClick={disconnectVoice}
                      className="w-12 h-12 rounded-full flex items-center justify-center transition-colors"
                      style={{ background: 'var(--md-sys-color-error-container)', color: 'var(--md-sys-color-on-error-container)' }}
                      title="Rozłącz"
                    >
                      <PhoneOff size={20} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <>
              {/* WIDOK CZATU TEKSTOWEGO */}
              <div
                ref={channelScrollRef}
                onScroll={(e) => {
                  channelStickToBottomRef.current = isNearBottom(e.currentTarget);
                }}
                onContextMenu={(e) => handleContextMenu(e, 'chatArea', null)}
                className="flex-1 overflow-y-auto px-4 pt-4 pb-4 custom-scrollbar flex flex-col"
                style={{ background: 'var(--md-sys-color-surface-container-low)' }}
              >
                <div className="w-full max-w-none flex flex-col mt-auto">
                  <div
                    className="pb-4 mb-4 flex flex-col items-start mt-6"
                    style={{ borderBottom: '1px solid var(--md-sys-color-outline-variant)' }}
                  >
                    <div
                      className="w-12 h-12 rounded-md3-lg flex items-center justify-center mb-3"
                      style={{ background: 'var(--md-sys-color-primary-container)', color: 'var(--md-sys-color-on-primary-container)' }}
                    >
                      {currentChannelData && <currentChannelData.icon size={24} />}
                    </div>
                    <h1 className="text-2xl font-semibold mb-1" style={{ color: 'var(--md-sys-color-on-surface)' }}>
                      #{currentChannelData?.name || 'kanał'}
                    </h1>
                    <p className="text-sm" style={{ color: 'var(--md-sys-color-on-surface-variant)' }}>
                      {DEMO_MODE ? 'Prywatna instancja Devcord.' : 'To jest początek kanału.'}
                    </p>
                  </div>

                  <div className="flex flex-col">
                    {messages.map((msg, idx, arr) => {
                      const showHeader = idx === 0 || arr[idx - 1].userId !== msg.userId;
                      const tail = !showHeader;
                      const user = getUser(msg.userId);
                      const role = getRole(user.roleId);
                      const isAI = msg.userId === 'devcord_ai';
                      const avatarSrc =
                        !isAI && user.avatarUrl?.trim()
                          ? resolveMediaUrl(API_BASE_URL || appPublicOrigin(), user.avatarUrl) ?? user.avatarUrl
                          : '';
                      return (
                        <ChatMessage
                          key={msg.id}
                          msg={msg}
                          tail={tail}
                          user={user}
                          role={role}
                          isAI={isAI}
                          avatarSrc={avatarSrc}
                          activeThreadId={activeThread?.id ?? null}
                          renderContent={renderMessageContent}
                          onContextMenuMessage={(e) => handleContextMenu(e, 'message', msg)}
                          onContextMenuUser={(e) => handleContextMenu(e, 'user', user)}
                          onOpenProfile={() => setProfileCardUser(user)}
                          onCreateTask={() => setCreateTaskModal({ isOpen: true, sourceMsg: msg })}
                          onOpenThread={() => openThread(msg)}
                          onDelete={() => deleteMessage(msg.id)}
                        />
                      );
                    })}
                  </div>
                  
                  {/* AI LOADING INDICATOR */}
                  {isAILoading && (
                    <div className="flex gap-[var(--gap-md)] py-0.5 items-center animate-fade-in" style={{ marginTop: 'var(--message-group-spacing)' }}>
                      <div className="flex-shrink-0 flex justify-end items-start py-0.5 px-[var(--gap-sm)]" style={{ width: 54 }}>
                        <div
                          className="w-9 h-9 rounded-md3-md flex items-center justify-center"
                          style={{ background: 'var(--md-sys-color-primary-container)', color: 'var(--md-sys-color-on-primary-container)' }}
                        >
                          <Sparkles size={16} className="animate-pulse" />
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full loader-dot" style={{ background: 'var(--md-sys-color-primary)' }}></div>
                        <div className="w-2 h-2 rounded-full loader-dot" style={{ background: 'var(--md-sys-color-primary)' }}></div>
                        <div className="w-2 h-2 rounded-full loader-dot" style={{ background: 'var(--md-sys-color-primary)' }}></div>
                        <span className="ml-2 text-sm" style={{ color: 'var(--md-sys-color-on-surface-variant)' }}>Devcord AI analizuje…</span>
                      </div>
                    </div>
                  )}

                  <div ref={messagesEndRef} className="h-4" />
                </div>
              </div>

              {/* INPUT CZATU */}
              <MessageInput
                inputValue={inputValue}
                onChange={setInputValue}
                onSend={handleSendMessage}
                onKeyDown={handleKeyDown}
                placeholder={`Napisz na #${currentChannelData?.name || 'kanale'}…`}
                disabled={!currentChannelData}
                onAttach={handleAttachClick}
                isAIPromptOpen={isAIPromptOpen}
                onCloseAI={() => setIsAIPromptOpen(false)}
                onOpenAI={() => setIsAIPromptOpen(true)}
                textareaRef={textareaRef}
                isZenMode={isZenMode}
                pickerTheme={localTheme === 'light' ? 'light' : 'dark'}
              />
            </>
          )}

          {/* PIP Głosowy, gdy jesteś na innym kanale */}
          {activeVoiceChannel && activeVoiceChannel !== activeChannel && (
            <div
              className="absolute bottom-24 right-4 w-72 max-w-[calc(100vw-2rem)] max-h-[min(85vh,500px)] flex flex-col rounded-md3-lg shadow-md3 z-40 overflow-hidden animate-modal-in"
              style={{ background: 'var(--md-sys-color-secondary-container)', border: '1px solid var(--md-sys-color-outline-variant)', color: 'var(--md-sys-color-on-secondary-container)' }}
            >
              {(() => {
                const voiceChan = channels.find((c) => c.id === activeVoiceChannel);
                if (!voiceChan) return null;
                return (
                  <>
                    <div
                      className="px-3 py-2.5 flex items-center justify-between gap-2 cursor-pointer shrink-0 transition-colors"
                      style={{ borderBottom: '1px solid var(--md-sys-color-outline-variant)' }}
                      onClick={() => setActiveChannel(voiceChan.id)}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ background: voicePhase === 'connected' ? 'var(--color-status-online)' : voicePhase === 'error' ? 'var(--md-sys-color-error)' : 'var(--color-status-idle)' }}
                        />
                        <span className="text-xs font-semibold truncate">{voiceChan.name}</span>
                      </div>
                      <span className="text-[10px] font-semibold shrink-0 hover:underline" style={{ color: 'var(--md-sys-color-primary)' }}>Wróć</span>
                    </div>
                    {/* PiP action bar */}
                    <div
                      className="px-3 py-2.5 flex items-center justify-center gap-2 flex-wrap shrink-0"
                      style={{ borderTop: '1px solid var(--md-sys-color-outline-variant)' }}
                    >
                      <button
                        type="button"
                        onClick={() => toggleVoiceMic()}
                        className="w-9 h-9 rounded-full flex items-center justify-center transition-colors"
                        style={{
                          background: localMuted || localDeafened ? 'var(--md-sys-color-error-container)' : 'var(--md-sys-color-primary-container)',
                          color: localMuted || localDeafened ? 'var(--md-sys-color-on-error-container)' : 'var(--md-sys-color-on-primary-container)',
                        }}
                      >
                        {localMuted || localDeafened ? <MicOff size={15} /> : <Mic size={15} />}
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleVoiceHeadphones()}
                        disabled={voicePhase !== 'connected'}
                        className="w-9 h-9 rounded-full flex items-center justify-center transition-colors disabled:opacity-40"
                        style={{
                          background: localDeafened ? 'var(--md-sys-color-error-container)' : 'var(--md-sys-color-surface-container)',
                          color: localDeafened ? 'var(--md-sys-color-on-error-container)' : 'var(--md-sys-color-on-surface-variant)',
                        }}
                      >
                        <Headphones size={15} className={localDeafened ? 'opacity-50' : ''} />
                      </button>
                      <button
                        type="button"
                        onClick={disconnectVoice}
                        className="w-9 h-9 rounded-full flex items-center justify-center transition-colors"
                        style={{ background: 'var(--md-sys-color-error-container)', color: 'var(--md-sys-color-on-error-container)' }}
                      >
                        <PhoneOff size={15} />
                      </button>
                    </div>
                  </>
                );
              })()}
            </div>
          )}
          </>
          )}
        </ChatColumn>

        {/* --- 4. INTELIGENTNY PRAWY PANEL (WĄTKI, ZADANIA, PLIKI) --- */}
        {!isZenMode &&
          (rightPanelTab || activeThread) &&
          !(API_BASE_URL && servers.length === 0) && (
          <MemberColumn>
            
            {activeThread ? (
              // WIDOK WĄTKU
              <>
                <div
                  className="h-14 flex items-center justify-between px-4 shrink-0"
                  style={{ borderBottom: '1px solid var(--md-sys-color-outline-variant)' }}
                >
                  <div className="flex items-center gap-2">
                    <MessageSquareShare size={15} style={{ color: 'var(--md-sys-color-primary)' }} />
                    <span className="text-sm font-semibold" style={{ color: 'var(--md-sys-color-on-surface)' }}>Wątek</span>
                  </div>
                  <button
                    onClick={() => setActiveThread(null)}
                    className="p-1.5 rounded-md3-sm transition-colors"
                    style={{ color: 'var(--md-sys-color-on-surface-variant)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--md-sys-color-surface-container-high)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <X size={15} />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col relative">
                  <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--md-sys-color-surface-container-high)' }}>
                    <div className="flex items-center gap-2 mb-2 min-w-0">
                      <UserAvatarBubble user={getUser(activeThread.userId)} className="w-6 h-6 rounded-md3-sm" />
                      <NickLabel
                        user={getUser(activeThread.userId)}
                        className="text-xs font-semibold truncate min-w-0"
                        style={{ color: 'var(--md-sys-color-on-surface)' }}
                      />
                      <span className="text-[10px] shrink-0" style={{ color: 'var(--md-sys-color-on-surface-variant)' }}>{activeThread.time}</span>
                    </div>
                    <div className="text-[13px] leading-relaxed" style={{ color: 'var(--md-sys-color-on-surface-variant)' }}>{renderMessageContent(activeThread.content)}</div>
                  </div>
                  <div className="flex flex-col items-center justify-center p-8 opacity-50">
                    <MessageSquare size={28} className="mb-2" style={{ color: 'var(--md-sys-color-on-surface-variant)' }} />
                    <span className="text-xs" style={{ color: 'var(--md-sys-color-on-surface-variant)' }}>Brak odpowiedzi w wątku</span>
                  </div>
                </div>
                <div className="px-3 py-3 shrink-0" style={{ borderTop: '1px solid var(--md-sys-color-outline-variant)' }}>
                  <div
                    className="rounded-md3-lg p-1 flex items-end transition-all focus-within:ring-1 focus-within:ring-primary/50"
                    style={{ background: 'var(--md-sys-color-surface-container-high)', border: '1px solid var(--md-sys-color-outline-variant)' }}
                  >
                    <textarea
                      value={threadInputValue}
                      onChange={(e) => setThreadInputValue(e.target.value)}
                      placeholder="Odpowiedz w wątku…"
                      className="flex-1 bg-transparent px-3 py-2 outline-none resize-none text-[13px] custom-scrollbar"
                      style={{ color: 'var(--md-sys-color-on-surface)', caretColor: 'var(--md-sys-color-primary)' }}
                      rows={1}
                    />
                    <button
                      className="h-8 w-8 shrink-0 m-0.5 rounded-md3-md flex items-center justify-center transition-all"
                      style={threadInputValue.trim() ? { background: 'var(--md-sys-color-primary)', color: 'var(--md-sys-color-on-primary)' } : { background: 'transparent', color: 'var(--md-sys-color-on-surface-variant)' }}
                    >
                      <Send size={13} className={threadInputValue.trim() ? 'translate-x-[1px] -translate-y-[1px]' : ''} />
                    </button>
                  </div>
                </div>
              </>
            ) : (
              // WIDOK ZAKŁADEK
              <>
                <div className="h-12 flex items-center px-3 gap-1 shrink-0" style={{ borderBottom: '1px solid var(--md-sys-color-outline-variant)' }}>
                  {(['members', ...(!isDmView ? ['files', 'tasks'] : [])] as const).map(tab => (
                    <button
                      key={tab}
                      onClick={() => setRightPanelTab(tab as any)}
                      className="px-3 py-1.5 rounded-md3-sm text-sm font-medium transition-colors"
                      style={rightPanelTab === tab
                        ? { background: 'var(--md-sys-color-primary-container)', color: 'var(--md-sys-color-on-primary-container)' }
                        : { color: 'var(--md-sys-color-on-surface-variant)' }}
                      onMouseEnter={e => { if (rightPanelTab !== tab) e.currentTarget.style.background = 'var(--md-sys-color-surface-container-high)'; }}
                      onMouseLeave={e => { if (rightPanelTab !== tab) e.currentTarget.style.background = 'transparent'; }}
                    >
                      {tab === 'members' ? (isDmView ? 'Profil' : 'Członkowie') : tab === 'files' ? 'Pliki' : 'Zadania'}
                    </button>
                  ))}
                </div>
                
                <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col">
                  {/* CZŁONKOWIE */}
                  {rightPanelTab === 'members' && (
                    <div className="p-4 space-y-6 flex-1 min-h-full" onContextMenu={(e) => handleContextMenu(e, 'membersArea', null)}>
                      {isDmView && dmPanelPeer ? (
                        <div className="rounded-md3-lg p-4" style={{ background: 'var(--md-sys-color-surface-container)', border: '1px solid var(--md-sys-color-outline-variant)' }}>
                          <div className="flex items-center gap-3">
                            {dmPanelPeer.avatarUrl?.trim() ? (
                              <img
                                src={resolveMediaUrl(API_BASE_URL || appPublicOrigin(), dmPanelPeer.avatarUrl) ?? dmPanelPeer.avatarUrl}
                                alt=""
                                className="w-12 h-12 rounded-md3-md object-cover"
                              />
                            ) : (
                              <div
                                className="w-12 h-12 rounded-md3-md flex items-center justify-center text-sm font-bold"
                                style={{ background: 'var(--md-sys-color-secondary-container)', color: 'var(--md-sys-color-on-secondary-container)' }}
                              >
                                {dmPanelPeer.name.charAt(0)}
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <NickLabel user={dmPanelPeer} className="text-sm font-bold truncate" style={{ color: 'var(--md-sys-color-on-surface)' }} />
                              <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--md-sys-color-on-surface-variant)' }}>DM #{dmActiveConversationId?.slice(0, 8)}</p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setProfileCardUser(dmPanelPeer)}
                            className="mt-3 w-full rounded-md3-sm py-1.5 text-sm font-semibold transition-colors"
                            style={{ background: 'var(--md-sys-color-surface-container-high)', color: 'var(--md-sys-color-on-surface)', border: '1px solid var(--md-sys-color-outline-variant)' }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'var(--md-sys-color-primary-container)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'var(--md-sys-color-surface-container-high)')}
                          >
                            Otwórz profil
                          </button>
                        </div>
                      ) : (
                        workspaceRoles.map(role => {
                        const usersInRole = workspaceMembers.filter((u) => u.roleId === role.id);
                        if (usersInRole.length === 0) return null;
                        return (
                          <div key={role.id}>
                            <div
                              className="mb-1 mt-4 first:mt-0 flex items-center justify-between px-2 py-1"
                              style={{ color: 'var(--md-sys-color-on-surface-variant)' }}
                            >
                              <div className="flex items-center gap-1.5">
                                <role.icon size={11} strokeWidth={2.5} />
                                <span className="text-[10px] uppercase tracking-[0.15em] font-semibold">{role.name}</span>
                              </div>
                              <span
                                className="text-[10px] font-bold px-1.5 py-0.5 rounded-md3-sm"
                                style={{ background: 'var(--md-sys-color-surface-container-high)', color: 'var(--md-sys-color-on-surface-variant)' }}
                              >{usersInRole.length}</span>
                            </div>
                            <div className="flex flex-col gap-0.5">
                              {usersInRole.map(user => (
                                <div 
                                  key={user.id} 
                                  onClick={(e) => openUserPopout(e, user)}
                                  onContextMenu={(e) => handleContextMenu(e, 'user', user)}
                                  className="menu-btn flex items-center gap-2.5 px-2 py-1.5 rounded-md3-sm cursor-pointer"
                                >
                                  <div className="relative shrink-0">
                                    {user.avatarUrl?.trim() ? (
                                      <img
                                        src={resolveMediaUrl(API_BASE_URL || appPublicOrigin(), user.avatarUrl) ?? user.avatarUrl}
                                        alt=""
                                        className="w-8 h-8 rounded-md3-sm object-cover"
                                      />
                                    ) : (
                                      <div
                                        className="w-8 h-8 rounded-md3-sm flex items-center justify-center text-xs font-bold"
                                        style={{ background: 'var(--md-sys-color-secondary-container)', color: 'var(--md-sys-color-on-secondary-container)' }}
                                      >{user.name.charAt(0)}</div>
                                    )}
                                    <div
                                      className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full"
                                      style={{
                                        background: user.status === 'online' ? 'var(--color-status-online)' : user.status === 'idle' ? 'var(--color-status-idle)' : user.status === 'dnd' ? 'var(--color-status-dnd)' : 'var(--color-status-offline)',
                                        outline: '2px solid var(--md-sys-color-surface-container-low)',
                                      }}
                                    />
                                  </div>
                                  <NickLabel user={user} className="text-[13px] font-medium truncate" style={{ color: 'var(--md-sys-color-on-surface)' }} />
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      }))}
                    </div>
                  )}

                  {/* PLIKI */}
                  {rightPanelTab === 'files' && (
                    <div className="space-y-2 p-3 flex-1 min-h-full" onContextMenu={(e) => handleContextMenu(e, 'filesArea', null)}>
                      <div className="flex justify-between items-center px-1 py-1">
                        <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--md-sys-color-on-surface-variant)' }}>Pliki</span>
                        <button
                          className="p-1.5 rounded-md3-sm transition-colors"
                          style={{ color: 'var(--md-sys-color-primary)' }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'var(--md-sys-color-primary-container)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        ><Search size={13}/></button>
                      </div>
                      {files.map(file => {
                        const uploader = getUser(file.uploaderId);
                        return (
                          <div 
                            key={file.id} 
                            onContextMenu={(e) => handleContextMenu(e, 'file', file)}
                            className="p-2.5 rounded-md3-sm flex items-start gap-2.5 cursor-pointer transition-all group"
                            style={{ background: 'var(--md-sys-color-surface-container)', border: '1px solid var(--md-sys-color-outline-variant)' }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'var(--md-sys-color-surface-container-high)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'var(--md-sys-color-surface-container)')}
                          >
                            <div
                              className="p-2 rounded-md3-sm shrink-0 transition-colors"
                              style={{ background: 'var(--md-sys-color-primary-container)', color: 'var(--md-sys-color-on-primary-container)' }}
                            >
                              {getFileIcon(file.type)}
                            </div>
                            <div className="flex flex-col flex-1 min-w-0">
                              <span className="text-[13px] font-medium truncate" style={{ color: 'var(--md-sys-color-on-surface)' }}>{file.name}</span>
                              <div className="flex items-center gap-2 mt-0.5 text-[10px] min-w-0" style={{ color: 'var(--md-sys-color-on-surface-variant)' }}>
                                <span>{file.size}</span>
                                <span className="w-1 h-1 rounded-full shrink-0" style={{ background: 'var(--md-sys-color-outline)' }} />
                                <UserAvatarBubble user={uploader} className="w-4 h-4 rounded-md3-xs shrink-0" />
                                <NickLabel user={uploader} className="truncate min-w-0 text-[10px]" style={{ color: 'var(--md-sys-color-on-surface-variant)' }} />
                              </div>
                            </div>
                            <button
                              className="opacity-0 group-hover:opacity-100 p-1.5 transition-all rounded-md3-sm"
                              style={{ color: 'var(--md-sys-color-primary)' }}
                            ><Download size={13}/></button>
                          </div>
                        );
                      })}
                      {files.length === 0 && <div className="text-center text-sm mt-10 py-8" style={{ color: 'var(--md-sys-color-on-surface-variant)' }}>Brak udostępnionych plików.</div>}
                    </div>
                  )}

                  {/* ZADANIA */}
                  {!isDmView && rightPanelTab === 'tasks' && (
                    <div className="space-y-2 p-3 flex-1 min-h-full" onContextMenu={(e) => handleContextMenu(e, 'tasksArea', null)}>
                      <div className="flex justify-between items-center px-1 py-1">
                        <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--md-sys-color-on-surface-variant)' }}>Backlog</span>
                        <button
                          onClick={() => setCreateTaskModal({isOpen: true})}
                          className="p-1.5 rounded-md3-sm transition-colors"
                          style={{ color: 'var(--md-sys-color-primary)' }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'var(--md-sys-color-primary-container)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        ><Plus size={13}/></button>
                      </div>
                      {isDmView ? dmPanelTasks.map(task => {
                        const assignee = getUser(task.assigneeId || myUserId);
                        return (
                          <div
                            key={task.id}
                            onClick={() => void toggleDmTask(task.id)}
                            className="p-2.5 rounded-md3-sm cursor-pointer group transition-colors"
                            style={{
                              background: task.completed ? 'var(--md-sys-color-surface-container)' : 'var(--md-sys-color-surface-container)',
                              border: `1px solid ${task.completed ? 'var(--md-sys-color-primary-container)' : 'var(--md-sys-color-outline-variant)'}`,
                              opacity: task.completed ? 0.7 : 1,
                            }}
                          >
                            <div className="flex items-start gap-2.5">
                              <div className="mt-0.5 shrink-0" style={{ color: task.completed ? 'var(--color-status-online)' : 'var(--md-sys-color-on-surface-variant)' }}>
                                {task.completed ? <CheckSquare size={15}/> : <Square size={15}/>}
                              </div>
                              <div className="flex flex-col flex-1 min-w-0">
                                <span className={`text-[13px] font-medium leading-tight mb-1.5 ${task.completed ? 'line-through' : ''}`} style={{ color: 'var(--md-sys-color-on-surface)' }}>{task.title}</span>
                                <div className="flex items-center gap-2 text-[10px]">
                                  {task.sourceMsgId && (
                                    <span className="px-1.5 py-0.5 rounded-md3-xs font-semibold" style={{ background: 'var(--md-sys-color-primary-container)', color: 'var(--md-sys-color-on-primary-container)' }}>Z czatu</span>
                                  )}
                                  <span className="flex items-center gap-1.5 px-1.5 py-0.5 rounded-md3-xs min-w-0 max-w-full" style={{ background: 'var(--md-sys-color-surface-container-high)', color: 'var(--md-sys-color-on-surface-variant)' }}>
                                    <UserAvatarBubble user={assignee} className="w-4 h-4 rounded-full shrink-0" />
                                    <NickLabel user={assignee} className="truncate text-[10px] min-w-0" style={{ color: 'var(--md-sys-color-on-surface-variant)' }} />
                                  </span>
                                  <button
                                    type="button"
                                    className="ml-auto p-1 rounded-md3-xs transition-colors"
                                    style={{ color: 'var(--md-sys-color-on-surface-variant)' }}
                                    onMouseEnter={e => (e.currentTarget.style.color = 'var(--md-sys-color-error)')}
                                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--md-sys-color-on-surface-variant)')}
                                    onClick={(e) => { e.stopPropagation(); void deleteDmTask(task.id); }}
                                  >
                                    <Trash2 size={11} />
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      }) : tasks.map(task => {
                        const assignee = getUser(task.assigneeId);
                        return (
                          <div 
                            key={task.id} 
                            onClick={() => toggleTask(task.id)} 
                            onContextMenu={(e) => handleContextMenu(e, 'task', task)}
                            className="p-2.5 rounded-md3-sm cursor-pointer group transition-colors"
                            style={{
                              background: 'var(--md-sys-color-surface-container)',
                              border: `1px solid ${task.completed ? 'var(--md-sys-color-primary-container)' : 'var(--md-sys-color-outline-variant)'}`,
                              opacity: task.completed ? 0.7 : 1,
                            }}
                          >
                            <div className="flex items-start gap-2.5">
                              <div className="mt-0.5 shrink-0" style={{ color: task.completed ? 'var(--color-status-online)' : 'var(--md-sys-color-on-surface-variant)' }}>
                                {task.completed ? <CheckSquare size={15}/> : <Square size={15}/>}
                              </div>
                              <div className="flex flex-col flex-1 min-w-0">
                                <span className={`text-[13px] font-medium leading-tight mb-1.5 ${task.completed ? 'line-through' : ''}`} style={{ color: 'var(--md-sys-color-on-surface)' }}>{task.title}</span>
                                <div className="flex items-center gap-2 text-[10px]">
                                  {task.sourceMsgId && (
                                    <span className="px-1.5 py-0.5 rounded-md3-xs font-semibold" style={{ background: 'var(--md-sys-color-primary-container)', color: 'var(--md-sys-color-on-primary-container)' }}>Z czatu</span>
                                  )}
                                  <span className="flex items-center gap-1.5 px-1.5 py-0.5 rounded-md3-xs min-w-0 max-w-full" style={{ background: 'var(--md-sys-color-surface-container-high)', color: 'var(--md-sys-color-on-surface-variant)' }}>
                                    <UserAvatarBubble user={assignee} className="w-4 h-4 rounded-full shrink-0" />
                                    <NickLabel user={assignee} className="truncate text-[10px] min-w-0" style={{ color: 'var(--md-sys-color-on-surface-variant)' }} />
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      {(isDmView ? dmPanelTasks.length === 0 : tasks.length === 0) && <div className="text-center text-sm mt-10 py-8" style={{ color: 'var(--md-sys-color-on-surface-variant)' }}>Brak aktywnych zadań.</div>}
                    </div>
                  )}
                </div>
              </>
            )}
          </MemberColumn>
        )}
      </div>

      {userPopout ? (
        <UserPopout
          user={userPopout.user}
          x={userPopout.x}
          y={userPopout.y}
          onClose={() => setUserPopout(null)}
          onOpenProfile={() => {
            setProfileCardUser(userPopout.user);
            setUserPopout(null);
          }}
          onOpenDm={() => {
            void openDmForPeer(userPopout.user.id);
            setUserPopout(null);
          }}
        />
      ) : null}

      {profileCardUser &&
        (() => {
          const pc = profileCardUser;
          let originLabel = 'Devcord';
          try {
            originLabel = new URL(appPublicOrigin()).host || originLabel;
          } catch {
            /* ignore */
          }
          const voiceAct = API_BASE_URL && activeServer ? locateUserVoiceOnServer(pc.id) : null;
          const serverName = servers.find((s) => s.id === activeServer)?.name ?? 'Serwer';
          const incomingFr = friendIncoming.find((r) => r.from.id === pc.id);
          const friendRel =
            !API_BASE_URL || !devcordToken || pc.id === myUserId
              ? undefined
              : acceptedFriends.some((f) => f.id === pc.id)
                ? ('friend' as const)
                : incomingFr
                  ? ('incoming' as const)
                  : friendOutgoing.some((o) => o.to.id === pc.id)
                    ? ('pending' as const)
                    : ('add' as const);
          return (
            <MemberProfileCard
              user={pc}
              workspaceRoles={workspaceRoles}
              serverName={serverName}
              voiceActivity={voiceAct}
              apiBase={API_BASE_URL || appPublicOrigin()}
              publicOrigin={appPublicOrigin()}
              originLabel={originLabel}
              note={profileCardNote}
              onNoteChange={setProfileCardNote}
              onSaveNote={(text) => {
                try {
                  localStorage.setItem(`devcord_profile_note_${pc.id}`, text);
                } catch {
                  /* ignore */
                }
              }}
              onClose={() => setProfileCardUser(null)}
              onDm={() => {
                void openDmForPeer(pc.id);
                setProfileCardUser(null);
              }}
              onVoiceCall={() => {
                void (async () => {
                  await openDmForPeer(pc.id);
                  setDmPeerId(pc.id);
                  setTimeout(() => {
                    void startDmCall('audio');
                  }, 150);
                  setProfileCardUser(null);
                })();
              }}
              onOpenVoiceChannel={() => {
                const v = locateUserVoiceOnServer(pc.id);
                if (!v) return;
                setActiveVoiceChannel(v.channelId);
                setProfileCardUser(null);
              }}
              onCopyOrigin={() => copyToClipboard(appPublicOrigin())}
              friendRelation={friendRel}
              incomingFriendRequestId={incomingFr?.id}
              onAddFriend={() => void sendFriendRequest(pc.id)}
              onAcceptFriendRequest={(id) => void acceptFriendByRequestId(id)}
              onRejectFriendRequest={(id) => void rejectFriendByRequestId(id)}
            />
          );
        })()}

      {dmCallState && (
        <div
          className="fixed inset-0 z-[470] flex items-center justify-center p-4 animate-scrim-fade-in"
          style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(8px)' }}
          role="presentation"
          onClick={() => {
            if (dmCallState.status === 'ringing' || dmCallState.status === 'connected') return;
            setDmCallState(null);
          }}
        >
          <div
            className="w-full max-w-sm rounded-md3-xl p-6 shadow-md3 animate-modal-in"
            style={{ background: 'var(--md-sys-color-surface-container)', border: '1px solid var(--md-sys-color-outline-variant)' }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
          >
            {(() => {
              const peerId = dmCallState.fromUserId === myUserId ? dmCallState.toUserId : dmCallState.fromUserId;
              const peer = workspaceMembers.find((m) => m.id === peerId) ?? getUser(peerId);
              const incoming = dmCallState.toUserId === myUserId && dmCallState.status === 'ringing';
              const dmVoiceHud =
                API_BASE_URL &&
                dmCallState.status === 'connected' &&
                voiceDmActive &&
                voicePhase === 'connected';
              const peerSpeaking = dmVoiceHud && !!speakingPeers[peerId];
              const selfSpeaking = dmVoiceHud && !!speakingPeers[myUserId];
              return (
                <>
                  <div className="flex flex-col items-center text-center gap-3">
                    <div
                      className="w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold relative"
                      style={{
                        background: 'var(--md-sys-color-primary-container)',
                        color: 'var(--md-sys-color-on-primary-container)',
                        outline: (peerSpeaking || selfSpeaking) ? '3px solid var(--md-sys-color-primary)' : '2px solid var(--md-sys-color-outline-variant)',
                        outlineOffset: '2px',
                      }}
                    >
                      {peer.avatarUrl?.trim() ? (
                        <img src={peer.avatarUrl} alt="" className="w-full h-full rounded-full object-cover" />
                      ) : (
                        peer.name.charAt(0)
                      )}
                    </div>
                    <NickLabel user={peer} className="text-base font-semibold" style={{ color: 'var(--md-sys-color-on-surface)' }} />
                    <p className="text-sm" style={{ color: 'var(--md-sys-color-on-surface-variant)' }}>
                      {dmCallState.status === 'ringing'
                        ? incoming
                          ? 'Połączenie przychodzące…'
                          : 'Dzwonisz…'
                        : dmCallState.status === 'connected'
                          ? dmVoiceHud
                            ? peerSpeaking
                              ? 'Rozmówca mówi…'
                              : selfSpeaking
                                ? 'Nagrywasz / mówisz…'
                                : 'Połączono'
                            : 'Połączono'
                          : dmCallState.status === 'rejected'
                            ? 'Odrzucono'
                            : 'Zakończono'}
                    </p>
                  </div>
                  <div className="flex justify-center gap-3 mt-6">
                    {incoming && (
                      <>
                        <button
                          type="button"
                          onClick={() => void runDmCallAction('reject')}
                          className="px-5 py-2.5 rounded-md3-full text-sm font-semibold transition-colors"
                          style={{ background: 'var(--md-sys-color-error-container)', color: 'var(--md-sys-color-on-error-container)' }}
                          onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
                          onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
                        >
                          Odrzuć
                        </button>
                        <button
                          type="button"
                          onClick={() => void runDmCallAction('accept')}
                          className="px-5 py-2.5 rounded-md3-full text-sm font-semibold transition-colors"
                          style={{ background: 'var(--color-status-online)', color: '#fff' }}
                          onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
                          onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
                        >
                          Odbierz
                        </button>
                      </>
                    )}
                    {!incoming && (dmCallState.status === 'ringing' || dmCallState.status === 'connected') && (
                      <button
                        type="button"
                        onClick={() => void runDmCallAction('end')}
                        className="px-5 py-2.5 rounded-md3-full text-sm font-semibold transition-colors"
                        style={{ background: 'var(--md-sys-color-error-container)', color: 'var(--md-sys-color-on-error-container)' }}
                        onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
                        onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
                      >
                        Rozłącz
                      </button>
                    )}
                    {(dmCallState.status === 'rejected' || dmCallState.status === 'ended') && (
                      <button
                        type="button"
                        onClick={() => setDmCallState(null)}
                        className="px-5 py-2.5 rounded-md3-full text-sm font-semibold transition-colors"
                        style={{ background: 'var(--md-sys-color-surface-container-high)', color: 'var(--md-sys-color-on-surface)', border: '1px solid var(--md-sys-color-outline-variant)' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--md-sys-color-primary-container)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'var(--md-sys-color-surface-container-high)')}
                      >
                        Zamknij
                      </button>
                    )}
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {pvCall && (
        <div
          className="fixed inset-0 z-[470] flex items-center justify-center p-4 animate-scrim-fade-in"
          style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(8px)' }}
          role="presentation"
          onClick={() => setPvCall(null)}
        >
          <div
            className="w-full max-w-sm rounded-md3-xl p-6 shadow-md3 animate-modal-in"
            style={{ background: 'var(--md-sys-color-surface-container)', border: '1px solid var(--md-sys-color-outline-variant)' }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
          >
            {(() => {
              const peer = workspaceMembers.find((m) => m.id === pvCall.peerId) ?? getUser(pvCall.peerId);
              return (
                <>
                  <div className="flex flex-col items-center text-center gap-3">
                    <div
                      className="w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold"
                      style={{ background: 'var(--md-sys-color-primary-container)', color: 'var(--md-sys-color-on-primary-container)', outline: '2px solid var(--md-sys-color-primary)', outlineOffset: '2px' }}
                    >
                      {peer.avatarUrl?.trim() ? (
                        <img src={peer.avatarUrl} alt="" className="w-full h-full rounded-full object-cover" />
                      ) : (
                        peer.name.charAt(0)
                      )}
                    </div>
                    <NickLabel user={peer} className="text-base font-semibold" style={{ color: 'var(--md-sys-color-on-surface)' }} />
                    <p className="text-sm" style={{ color: 'var(--md-sys-color-on-surface-variant)' }}>
                      {pvCall.status === 'ringing' ? 'Łączenie…' : 'Połączono'}
                    </p>
                  </div>
                  <div className="flex justify-center gap-3 mt-6">
                    <button
                      type="button"
                      onClick={() => setPvCall(null)}
                      className="px-5 py-2.5 rounded-md3-full text-sm font-semibold transition-colors"
                      style={{ background: 'var(--md-sys-color-error-container)', color: 'var(--md-sys-color-on-error-container)' }}
                      onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
                      onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
                    >
                      Rozłącz
                    </button>
                    {pvCall.status !== 'connected' && (
                      <button
                        type="button"
                        onClick={() => setPvCall((c) => (c ? { ...c, status: 'connected' } : c))}
                        className="px-5 py-2.5 rounded-md3-full text-sm font-semibold transition-colors"
                        style={{ background: 'var(--md-sys-color-primary-container)', color: 'var(--md-sys-color-on-primary-container)' }}
                        onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
                        onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
                      >
                        Symuluj odebranie
                      </button>
                    )}
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