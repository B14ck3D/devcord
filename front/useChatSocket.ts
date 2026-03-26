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
  } = opts;
  const wsRef = useRef<WebSocket | null>(null);
  const chRef = useRef<string | null>(null);
  const dmRef = useRef<string | null>(null);
  const onMessageRef = useRef(onMessage);
  const onTypingRef = useRef(onTyping);
  const onUserUpdatedRef = useRef(onUserUpdated);
  const onDmMessageRef = useRef(onDmMessage);
  const onDmTypingRef = useRef(onDmTyping);
  onMessageRef.current = onMessage;
  onTypingRef.current = onTyping;
  onUserUpdatedRef.current = onUserUpdated;
  onDmMessageRef.current = onDmMessage;
  onDmTypingRef.current = onDmTyping;

  const subscribeOpenChannels = useCallback((ws: WebSocket) => {
    const ch = chRef.current;
    if (ch) {
      ws.send(JSON.stringify({ type: 'subscribe', channel_id: String(ch) }));
    }
    const dm = dmRef.current;
    if (dm) {
      ws.send(JSON.stringify({ type: 'subscribe_dm', conversation_id: String(dm) }));
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
      ws.send(JSON.stringify({ type: 'subscribe', channel_id: String(channelId) }));
    }
  }, [channelId]);

  useEffect(() => {
    dmRef.current = dmConversationId;
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN && dmConversationId) {
      ws.send(JSON.stringify({ type: 'subscribe_dm', conversation_id: String(dmConversationId) }));
    }
  }, [dmConversationId]);

  const sendTyping = useCallback((typing: boolean) => {
    const ws = wsRef.current;
    const ch = chRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || !ch) return;
    ws.send(JSON.stringify({ type: 'typing', channel_id: String(ch), typing }));
  }, []);

  const sendTypingDm = useCallback((typing: boolean) => {
    const ws = wsRef.current;
    const dm = dmRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || !dm) return;
    ws.send(JSON.stringify({ type: 'typing_dm', conversation_id: String(dm), typing }));
  }, []);

  return { sendTyping, sendTypingDm };
}
