import { useCallback, useEffect, useRef } from 'react';

function chatWsUrl(apiBase: string, token: string): string {
  const base = apiBase.replace(/\/$/, '');
  const u = new URL(base, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
  const wsProto = u.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${wsProto}//${u.host}${u.pathname}/ws/chat?token=${encodeURIComponent(token)}`;
}

export type ChatUserUpdatedPayload = {
  user_id: string;
  name?: string;
  avatar_url?: string;
  nick_color?: string;
  nick_glow?: string;
};

export type DmMessageRow = {
  conversationId: string;
  id: string;
  userId: string;
  content: string;
  time: string;
  isEdited?: boolean;
};

export type DmTaskEvent = {
  type: 'dm_task_created' | 'dm_task_updated' | 'dm_task_deleted';
  conversationId: string;
  id: string;
  title?: string;
  assigneeId?: string;
  completed?: boolean;
  sourceMsgId?: string;
};

export type DmCallStateEvent = {
  callId: string;
  conversationId: string;
  fromUserId: string;
  toUserId: string;
  status: 'ringing' | 'connected' | 'rejected' | 'ended';
  kind?: 'audio' | 'video';
};

/** Snapshot z Redisa / WS przy starcie połączenia czatu. */
export type VoiceInitialStatePayload = {
  channels: Record<string, string[]>;
  conversations: Record<string, string[]>;
};

/** Przyrost po webhooku LiveKit (pełna lista w pokoju). */
export type VoiceRoomStatePayload = {
  room_name: string;
  user_ids: string[];
  channel_id?: string;
  server_id?: string;
  conversation_id?: string;
};

export function useChatSocket(opts: {
  apiBase: string;
  token: string | null;
  channelId: string | null;
  onMessage: (row: {
    channelId: string;
    id: string;
    userId: string;
    content: string;
    time: string;
    isEdited?: boolean;
  }) => void;
  onTyping: (ev: { channelId: string; userId: string; typing: boolean }) => void;
  onUserUpdated?: (payload: ChatUserUpdatedPayload) => void;
  dmConversationId?: string | null;
  onDmMessage?: (row: DmMessageRow) => void;
  onDmTyping?: (ev: { conversationId: string; userId: string; typing: boolean }) => void;
  onDmTaskEvent?: (ev: DmTaskEvent) => void;
  onDmCallState?: (ev: DmCallStateEvent) => void;
  onVoiceInitialState?: (payload: VoiceInitialStatePayload) => void;
  onVoiceRoomState?: (payload: VoiceRoomStatePayload) => void;
}) {
  const {
    apiBase,
    token,
    channelId,
    onMessage,
    onTyping,
    onUserUpdated,
    dmConversationId = null,
    onDmMessage,
    onDmTyping,
    onDmTaskEvent,
    onDmCallState,
    onVoiceInitialState,
    onVoiceRoomState,
  } = opts;
  const wsRef = useRef<WebSocket | null>(null);
  const chRef = useRef<string | null>(null);
  const dmRef = useRef<string | null>(null);
  const onMessageRef = useRef(onMessage);
  const onTypingRef = useRef(onTyping);
  const onUserUpdatedRef = useRef(onUserUpdated);
  const onDmMessageRef = useRef(onDmMessage);
  const onDmTypingRef = useRef(onDmTyping);
  const onDmTaskEventRef = useRef(onDmTaskEvent);
  const onDmCallStateRef = useRef(onDmCallState);
  const onVoiceInitialStateRef = useRef(onVoiceInitialState);
  const onVoiceRoomStateRef = useRef(onVoiceRoomState);
  const typingSendRef = useRef<{ key: string; typing: boolean; ts: number } | null>(null);
  onMessageRef.current = onMessage;
  onTypingRef.current = onTyping;
  onUserUpdatedRef.current = onUserUpdated;
  onDmMessageRef.current = onDmMessage;
  onDmTypingRef.current = onDmTyping;
  onDmTaskEventRef.current = onDmTaskEvent;
  onDmCallStateRef.current = onDmCallState;
  onVoiceInitialStateRef.current = onVoiceInitialState;
  onVoiceRoomStateRef.current = onVoiceRoomState;

  const subscribeOpenChannels = useCallback((ws: WebSocket) => {
    const safeSend = (payload: unknown) => {
      try {
        if (ws.readyState !== WebSocket.OPEN) return;
        ws.send(JSON.stringify(payload));
      } catch {
        /* ignore socket send crash */
      }
    };
    const ch = chRef.current;
    if (ch) {
      safeSend({ type: 'subscribe', channel_id: String(ch) });
    }
    const dm = dmRef.current;
    if (dm) {
      safeSend({ type: 'subscribe_dm', conversation_id: String(dm) });
    }
  }, []);

  useEffect(() => {
    if (!apiBase || !token) return;
    const ws = new WebSocket(chatWsUrl(apiBase, token));
    wsRef.current = ws;
    ws.onmessage = (ev) => {
      try {
        const d = JSON.parse(ev.data as string);
        if (d.type === 'message' && d.payload) {
          const p = d.payload as Record<string, unknown>;
          const conv = p.conversation_id != null && String(p.conversation_id) !== '';
          if (conv) {
            onDmMessageRef.current?.({
              conversationId: String(p.conversation_id),
              id: String(p.id),
              userId: String(p.user_id),
              content: String(p.content ?? ''),
              time: String(p.time ?? ''),
              isEdited: !!p.is_edited,
            });
          } else {
            onMessageRef.current({
              channelId: String(p.channel_id ?? ''),
              id: String(p.id),
              userId: String(p.user_id),
              content: String(p.content ?? ''),
              time: String(p.time ?? ''),
              isEdited: !!p.is_edited,
            });
          }
        }
        if (d.type === 'typing' && d.payload) {
          const p = d.payload as Record<string, unknown>;
          if (p.conversation_id != null && String(p.conversation_id) !== '') {
            onDmTypingRef.current?.({
              conversationId: String(p.conversation_id),
              userId: String(p.user_id),
              typing: !!p.typing,
            });
          } else {
            onTypingRef.current({
              channelId: String(p.channel_id ?? ''),
              userId: String(p.user_id),
              typing: !!p.typing,
            });
          }
        }
        if ((d.type === 'dm_task_created' || d.type === 'dm_task_updated' || d.type === 'dm_task_deleted') && d.payload) {
          const p = d.payload as Record<string, unknown>;
          onDmTaskEventRef.current?.({
            type: d.type,
            conversationId: String(p.conversationId ?? ''),
            id: String(p.id ?? ''),
            title: typeof p.title === 'string' ? p.title : undefined,
            assigneeId: typeof p.assigneeId === 'string' ? p.assigneeId : undefined,
            completed: typeof p.completed === 'boolean' ? p.completed : undefined,
            sourceMsgId: typeof p.sourceMsgId === 'string' ? p.sourceMsgId : undefined,
          });
        }
        if (d.type === 'dm_call_state' && d.payload) {
          const p = d.payload as Record<string, unknown>;
          const status = String(p.status ?? '') as DmCallStateEvent['status'];
          if (!status) return;
          onDmCallStateRef.current?.({
            callId: String(p.callId ?? ''),
            conversationId: String(p.conversationId ?? ''),
            fromUserId: String(p.fromUserId ?? ''),
            toUserId: String(p.toUserId ?? ''),
            status,
            kind: String(p.kind ?? 'audio') === 'video' ? 'video' : 'audio',
          });
        }
        if (d.type === 'user_updated' && d.payload && onUserUpdatedRef.current) {
          const p = d.payload as Record<string, unknown>;
          const uid = String(p.user_id ?? '');
          if (!uid) return;
          onUserUpdatedRef.current({
            user_id: uid,
            name: typeof p.name === 'string' ? p.name : undefined,
            avatar_url: typeof p.avatar_url === 'string' ? p.avatar_url : undefined,
            nick_color: typeof p.nick_color === 'string' ? p.nick_color : undefined,
            nick_glow: typeof p.nick_glow === 'string' ? p.nick_glow : undefined,
          });
        }
        if (d.type === 'voice_initial_state' && d.payload && onVoiceInitialStateRef.current) {
          const p = d.payload as Record<string, unknown>;
          const chRaw = p.channels;
          const convRaw = p.conversations;
          const channels: Record<string, string[]> = {};
          const conversations: Record<string, string[]> = {};
          if (chRaw && typeof chRaw === 'object' && !Array.isArray(chRaw)) {
            for (const [k, v] of Object.entries(chRaw as Record<string, unknown>)) {
              if (!Array.isArray(v)) continue;
              channels[String(k)] = v.map((x) => String(x));
            }
          }
          if (convRaw && typeof convRaw === 'object' && !Array.isArray(convRaw)) {
            for (const [k, v] of Object.entries(convRaw as Record<string, unknown>)) {
              if (!Array.isArray(v)) continue;
              conversations[String(k)] = v.map((x) => String(x));
            }
          }
          onVoiceInitialStateRef.current({ channels, conversations });
        }
        if (d.type === 'voice_room_state' && d.payload && onVoiceRoomStateRef.current) {
          const p = d.payload as Record<string, unknown>;
          const userIds = Array.isArray(p.user_ids) ? (p.user_ids as unknown[]).map((x) => String(x)) : [];
          onVoiceRoomStateRef.current({
            room_name: String(p.room_name ?? ''),
            user_ids: userIds,
            channel_id: typeof p.channel_id === 'string' ? p.channel_id : undefined,
            server_id: typeof p.server_id === 'string' ? p.server_id : undefined,
            conversation_id: typeof p.conversation_id === 'string' ? p.conversation_id : undefined,
          });
        }
      } catch {
        /* ignore */
      }
    };
    ws.onopen = () => subscribeOpenChannels(ws);
    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [apiBase, token, subscribeOpenChannels]);

  useEffect(() => {
    chRef.current = channelId;
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN && channelId) {
      try {
        ws.send(JSON.stringify({ type: 'subscribe', channel_id: String(channelId) }));
      } catch {
        /* ignore socket send crash */
      }
    }
  }, [channelId]);

  useEffect(() => {
    dmRef.current = dmConversationId;
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN && dmConversationId) {
      try {
        ws.send(JSON.stringify({ type: 'subscribe_dm', conversation_id: String(dmConversationId) }));
      } catch {
        /* ignore socket send crash */
      }
    }
  }, [dmConversationId]);

  const sendTyping = useCallback((typing: boolean) => {
    const ws = wsRef.current;
    const ch = chRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || !ch) return;
    const now = Date.now();
    const prev = typingSendRef.current;
    const key = `ch:${String(ch)}`;
    if (prev && prev.key === key && prev.typing === typing && now - prev.ts < 300) return;
    typingSendRef.current = { key, typing, ts: now };
    try {
      ws.send(JSON.stringify({ type: 'typing', channel_id: String(ch), typing }));
    } catch {
      /* ignore socket send crash */
    }
  }, []);

  const sendTypingDm = useCallback((typing: boolean) => {
    const ws = wsRef.current;
    const dm = dmRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || !dm) return;
    const now = Date.now();
    const prev = typingSendRef.current;
    const key = `dm:${String(dm)}`;
    if (prev && prev.key === key && prev.typing === typing && now - prev.ts < 300) return;
    typingSendRef.current = { key, typing, ts: now };
    try {
      ws.send(JSON.stringify({ type: 'typing_dm', conversation_id: String(dm), typing }));
    } catch {
      /* ignore socket send crash */
    }
  }, []);

  return { sendTyping, sendTypingDm };
}
