import { useCallback, useEffect, useRef } from 'react';

function chatWsUrl(apiBase: string, token: string): string {
  const base = apiBase.replace(/\/$/, '');
  const u = new URL(base, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
  const wsProto = u.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${wsProto}//${u.host}${u.pathname}/ws/chat?token=${encodeURIComponent(token)}`;
}

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
}) {
  const { apiBase, token, channelId, onMessage, onTyping } = opts;
  const wsRef = useRef<WebSocket | null>(null);
  const chRef = useRef<string | null>(null);
  const onMessageRef = useRef(onMessage);
  const onTypingRef = useRef(onTyping);
  onMessageRef.current = onMessage;
  onTypingRef.current = onTyping;

  useEffect(() => {
    if (!apiBase || !token) return;
    const ws = new WebSocket(chatWsUrl(apiBase, token));
    wsRef.current = ws;
    ws.onmessage = (ev) => {
      try {
        const d = JSON.parse(ev.data as string);
        if (d.type === 'message' && d.payload) {
          const p = d.payload;
          onMessageRef.current({
            channelId: String(p.channel_id ?? ''),
            id: String(p.id),
            userId: String(p.user_id),
            content: String(p.content ?? ''),
            time: String(p.time ?? ''),
            isEdited: !!p.is_edited,
          });
        }
        if (d.type === 'typing' && d.payload) {
          onTypingRef.current({
            channelId: String(d.payload.channel_id ?? ''),
            userId: String(d.payload.user_id),
            typing: !!d.payload.typing,
          });
        }
      } catch {
        /* ignore */
      }
    };
    ws.onopen = () => {
      const ch = chRef.current;
      if (ch) {
        ws.send(JSON.stringify({ type: 'subscribe', channel_id: ch }));
      }
    };
    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [apiBase, token]);

  useEffect(() => {
    chRef.current = channelId;
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN && channelId) {
      ws.send(JSON.stringify({ type: 'subscribe', channel_id: channelId }));
    }
  }, [channelId]);

  const sendTyping = useCallback((typing: boolean) => {
    const ws = wsRef.current;
    const ch = chRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || !ch) return;
    ws.send(JSON.stringify({ type: 'typing', channel_id: ch, typing }));
  }, []);

  return { sendTyping };
}
