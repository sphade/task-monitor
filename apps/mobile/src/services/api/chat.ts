import { privateApi, toArray, unwrap } from '@/lib/api';
import { API } from '@/lib/endpoints';
import type { Conversation, Message } from '@/types';
import type { GroupDto, SendMessageDto } from '@/types/api';

/**
 * Chat service.
 *
 * Two kinds of threads:
 *
 *   - **Direct** (message-centric, as the original Django API): a "conversation
 *     list" is derived by grouping the caller's flat message list on
 *     `conversation`, keeping the most recent of each. Sending takes a
 *     `recipient`; the server find-or-creates the thread.
 *   - **Groups** (`/v1/chat/groups/`): server-side rooms with real membership
 *     and per-member unread counts. The whole-team room ("Team") always exists.
 *
 * `listConversations` merges both into one list for the chat tab.
 */

/** History is available now that conversation detail returns messages. */
export const CHAT_HISTORY_SUPPORTED = true;

/** id → display name, so message rows can show who is speaking. */
export type NameLookup = Record<string, string>;

function mapMessage(dto: SendMessageDto, names: NameLookup = {}): Message {
  const senderId = String(dto.sender);
  return {
    id: String(dto.id),
    conversationId: String(dto.conversation),
    senderId,
    senderName: names[senderId] ?? `User ${senderId}`,
    body: dto.content,
    createdAt: dto.created_at,
    isRead: dto.is_read ?? dto.status === 'read',
    status: dto.status,
  };
}

function mapGroup(g: GroupDto): Conversation {
  return {
    id: String(g.id),
    kind: 'forum',
    participantIds: g.member_ids.map(String),
    title: g.name,
    lastMessageAt: g.last_message_at ?? undefined,
    unreadCount: g.unread_count,
  };
}

/** Collapses a flat DIRECT-message list into one entry per thread. */
function groupIntoConversations(
  messages: Message[],
  rawById: Map<string, SendMessageDto>,
  viewerId: string,
  names: NameLookup,
): Conversation[] {
  const latest = new Map<string, Message>();
  const unread = new Map<string, number>();
  const otherParty = new Map<string, string>();

  for (const m of messages) {
    const current = latest.get(m.conversationId);
    if (!current || m.createdAt > current.createdAt) latest.set(m.conversationId, m);

    const raw = rawById.get(m.id);
    if (raw && raw.recipient !== null) {
      // The counterpart is whichever side of the message is not the viewer.
      const other =
        String(raw.sender) === viewerId ? String(raw.recipient) : String(raw.sender);
      otherParty.set(m.conversationId, other);

      // Unread means: addressed to me and not yet read.
      if (String(raw.recipient) === viewerId && !(raw.is_read ?? raw.status === 'read')) {
        unread.set(m.conversationId, (unread.get(m.conversationId) ?? 0) + 1);
      }
    }
  }

  return [...latest.entries()]
    .map(([conversationId, message]) => {
      const recipientId = otherParty.get(conversationId) ?? '';
      return {
        id: conversationId,
        kind: 'direct' as const,
        participantIds: [viewerId, recipientId],
        recipientId,
        title: names[recipientId] ?? `User ${recipientId}`,
        lastMessage: message.body,
        lastMessageAt: message.createdAt,
        unreadCount: unread.get(conversationId) ?? 0,
      };
    })
    .sort((a, b) => (b.lastMessageAt ?? '').localeCompare(a.lastMessageAt ?? ''));
}

export const chatService = {
  /** Every message visible to the caller, newest first. */
  async listAllMessages(): Promise<SendMessageDto[]> {
    const res = await privateApi.get(API.CONVERSATIONS, { params: { size: 200 } });
    return toArray<SendMessageDto>(res);
  },

  /** Group rooms I belong to (includes the auto-provisioned Team room). */
  async listGroups(): Promise<Conversation[]> {
    const res = await privateApi.get(API.GROUPS);
    const data = unwrap<GroupDto[]>(res) ?? [];
    return data.map(mapGroup);
  },

  /**
   * Threads derived from the caller's direct messages plus their group rooms,
   * most recent activity first. Groups without traffic still appear.
   */
  async listConversations(viewerId: string, names: NameLookup = {}): Promise<Conversation[]> {
    const [groups, raw] = await Promise.all([
      chatService.listGroups(),
      chatService.listAllMessages(),
    ]);
    const groupIds = new Set(groups.map((g) => g.id));

    const directRaw = raw.filter((d) => !groupIds.has(String(d.conversation)));
    const rawById = new Map(directRaw.map((d) => [String(d.id), d]));
    const directMessages = directRaw.map((d) => mapMessage(d, names));
    const direct = groupIntoConversations(directMessages, rawById, viewerId, names);

    return [...groups, ...direct].sort((a, b) =>
      (b.lastMessageAt ?? '').localeCompare(a.lastMessageAt ?? ''),
    );
  },

  async getConversation(
    id: string,
    viewerId: string,
    names: NameLookup = {},
  ): Promise<Conversation | undefined> {
    const all = await chatService.listConversations(viewerId, names);
    return all.find((c) => c.id === id);
  },

  /** Messages in one thread (direct or group), oldest first. */
  async listMessages(conversationId: string, names: NameLookup = {}): Promise<Message[]> {
    const res = await privateApi.get(API.conversation(conversationId));
    // The endpoint is annotated as a single object but returns the thread, so
    // normalise both shapes.
    return toArray<SendMessageDto>(res)
      .map((d) => mapMessage(d, names))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  },

  /**
   * Sends a message. Direct threads take `recipientId`; group/forum threads
   * take `conversationId`. The server derives the sender from the JWT.
   */
  async sendMessage(input: {
    recipientId?: string;
    conversationId?: string;
    content: string;
  }): Promise<Message> {
    const payload = input.conversationId !== undefined
      ? { conversation: Number(input.conversationId), content: input.content }
      : { recipient: Number(input.recipientId), content: input.content };

    const res = await privateApi.post(API.MESSAGES, payload);
    const dto = (res.data?.data ?? res.data) as SendMessageDto;
    return mapMessage(dto);
  },

  /** Marks my position in a thread read (works for direct and groups). */
  async markConversationRead(conversationId: string): Promise<void> {
    await privateApi.post(API.conversationRead(conversationId), {}).catch(() => {
      // Best-effort — read state must never block the UI.
    });
  },
};
