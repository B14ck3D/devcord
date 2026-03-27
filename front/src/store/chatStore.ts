import { create } from 'zustand';

const API_BASE_URL = (
  (import.meta.env.VITE_API_URL as string | undefined) ??
  'https://devcord.ndevelopment.org/api'
).replace(/\/$/, '');
const DEMO_MODE = !API_BASE_URL;

export type ChatRow = {
  id: string;
  userId: string;
  time: string;
  content: string;
  isMe?: boolean;
  isEdited?: boolean;
  isOptimistic?: boolean;
  reactions?: { emoji: string; count: number; userReacted: boolean }[];
};

function compareMessageIds(a: string, b: string): number {
  const na = Number(a);
  const nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
  return a.localeCompare(b, 'en', { numeric: true });
}

const initialDemo: Record<string, ChatRow[]> = DEMO_MODE
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
  : {};

function mergeIntoList(list: ChatRow[], entry: ChatRow): ChatRow[] {
  const i = list.findIndex((m) => m.id === entry.id);
  if (i >= 0) {
    const next = [...list];
    next[i] = { ...next[i], ...entry };
    return next;
  }
  const tmpIdx = list.findIndex(
    (m) => m.id.startsWith('tmp_') && m.userId === entry.userId && m.content === entry.content,
  );
  if (tmpIdx >= 0) {
    const next = [...list];
    next[tmpIdx] = entry;
    return next.sort((a, b) => compareMessageIds(a.id, b.id));
  }
  return [...list, entry].sort((a, b) => compareMessageIds(a.id, b.id));
}

type ChatStore = {
  messagesByChannel: Record<string, ChatRow[]>;
  setChannelMessages: (channelId: string, rows: ChatRow[]) => void;
  mergeChannelMessage: (
    row: { channelId: string; id: string; userId: string; content: string; time: string; isEdited?: boolean },
    meUserId: string,
  ) => void;
  appendChannelMessage: (channelId: string, row: ChatRow) => void;
  patchChannelMessage: (channelId: string, messageId: string, patch: Partial<ChatRow>) => void;
  removeChannelMessage: (channelId: string, messageId: string) => void;
  replaceAllMessages: (map: Record<string, ChatRow[]>) => void;
  clearMessages: () => void;
  voicePresenceByChannel: Record<string, string[]>;
  voicePresenceByConversation: Record<string, string[]>;
  setVoicePresenceByChannel: (map: Record<string, string[]>) => void;
  setVoicePresenceByConversation: (map: Record<string, string[]>) => void;
  patchVoicePresenceChannel: (channelId: string, userIds: string[]) => void;
  patchVoicePresenceConversation: (conversationId: string, userIds: string[]) => void;
  mergeVoiceRoomEvent: (p: { channel_id?: string | null; conversation_id?: string | null; user_ids: string[] }) => void;
  clearVoicePresence: () => void;
};

export const useChatStore = create<ChatStore>((set) => ({
  messagesByChannel: initialDemo,
  voicePresenceByChannel: {},
  voicePresenceByConversation: {},

  setChannelMessages: (channelId, rows) =>
    set((s) => ({ messagesByChannel: { ...s.messagesByChannel, [channelId]: rows } })),

  mergeChannelMessage: (row, meUserId) => {
    const ch = row.channelId;
    if (!ch) return;
    const entry: ChatRow = {
      id: row.id,
      userId: row.userId,
      time: row.time,
      content: row.content,
      isEdited: row.isEdited,
      isMe: row.userId === meUserId,
    };
    set((s) => {
      const list = mergeIntoList([...(s.messagesByChannel[ch] ?? [])], entry);
      return { messagesByChannel: { ...s.messagesByChannel, [ch]: list } };
    });
  },

  appendChannelMessage: (channelId, row) =>
    set((s) => ({
      messagesByChannel: {
        ...s.messagesByChannel,
        [channelId]: [...(s.messagesByChannel[channelId] ?? []), row],
      },
    })),

  patchChannelMessage: (channelId, messageId, patch) =>
    set((s) => ({
      messagesByChannel: {
        ...s.messagesByChannel,
        [channelId]: (s.messagesByChannel[channelId] ?? []).map((m) =>
          m.id === messageId ? { ...m, ...patch } : m,
        ),
      },
    })),

  removeChannelMessage: (channelId, messageId) =>
    set((s) => ({
      messagesByChannel: {
        ...s.messagesByChannel,
        [channelId]: (s.messagesByChannel[channelId] ?? []).filter((m) => m.id !== messageId),
      },
    })),

  replaceAllMessages: (map) => set({ messagesByChannel: map }),
  clearMessages: () => set({ messagesByChannel: {} }),

  setVoicePresenceByChannel: (map) => set({ voicePresenceByChannel: map }),
  setVoicePresenceByConversation: (map) => set({ voicePresenceByConversation: map }),

  patchVoicePresenceChannel: (channelId, userIds) =>
    set((s) => ({
      voicePresenceByChannel: { ...s.voicePresenceByChannel, [channelId]: userIds },
    })),

  patchVoicePresenceConversation: (conversationId, userIds) =>
    set((s) => ({
      voicePresenceByConversation: { ...s.voicePresenceByConversation, [conversationId]: userIds },
    })),

  mergeVoiceRoomEvent: (p) =>
    set((s) => {
      const vpc = { ...s.voicePresenceByChannel };
      const vpcs = { ...s.voicePresenceByConversation };
      const chId = p.channel_id;
      if (chId) {
        if (p.user_ids.length === 0) delete vpc[chId];
        else vpc[chId] = [...p.user_ids];
      }
      const convId = p.conversation_id;
      if (convId) {
        if (p.user_ids.length === 0) delete vpcs[convId];
        else vpcs[convId] = [...p.user_ids];
      }
      return { voicePresenceByChannel: vpc, voicePresenceByConversation: vpcs };
    }),

  clearVoicePresence: () => set({ voicePresenceByChannel: {}, voicePresenceByConversation: {} }),
}));
