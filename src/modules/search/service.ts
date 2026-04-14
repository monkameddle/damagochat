import { getMeilisearch, INDEXES } from '../../lib/meilisearch.js';
import type {
  UserSearchQuery,
  MessageSearchQuery,
  UserSearchResult,
  MessageSearchResult,
  SearchResponse,
  UserIndexDoc,
  MessageIndexDoc,
} from './schema.js';

export class SearchService {
  async searchUsers(query: UserSearchQuery): Promise<SearchResponse<UserSearchResult>> {
    const index = getMeilisearch().index(INDEXES.USERS);

    const result = await index.search<UserIndexDoc>(query.q, {
      limit: query.limit,
      offset: query.offset,
      attributesToSearchOn: ['phoneNumber', 'displayName'],
      attributesToRetrieve: ['id', 'phoneNumber', 'displayName', 'avatarKey'],
    });

    return {
      hits: result.hits.map((h) => ({
        id: h.id,
        phoneNumber: h.phoneNumber,
        displayName: h.displayName,
        avatarKey: h.avatarKey,
      })),
      total: result.estimatedTotalHits ?? result.hits.length,
      offset: query.offset,
      limit: query.limit,
    };
  }

  async searchMessages(
    _userId: string,
    query: MessageSearchQuery,
  ): Promise<SearchResponse<MessageSearchResult>> {
    const index = getMeilisearch().index(INDEXES.MESSAGES);

    const filter: string[] = [];
    if (query.chatId) {
      filter.push(`chatId = "${query.chatId}"`);
    }

    const filterValue = filter.length > 0 ? filter.join(' AND ') : undefined;
    const result = await index.search<MessageIndexDoc>(query.q, {
      limit: query.limit,
      offset: query.offset,
      ...(filterValue !== undefined && { filter: filterValue }),
      attributesToSearchOn: ['plaintext'],
      attributesToRetrieve: ['id', 'chatId', 'senderId', 'plaintext', 'sentAt'],
      attributesToHighlight: ['plaintext'],
      highlightPreTag: '<mark>',
      highlightPostTag: '</mark>',
    });

    return {
      hits: result.hits.map((h) => ({
        id: h.id,
        chatId: h.chatId,
        senderId: h.senderId,
        sentAt: new Date(h.sentAt),
        snippet: (h as typeof h & { _formatted?: { plaintext?: string } })._formatted?.plaintext ?? h.plaintext,
      })),
      total: result.estimatedTotalHits ?? result.hits.length,
      offset: query.offset,
      limit: query.limit,
    };
  }

  async indexUser(user: UserIndexDoc): Promise<void> {
    await getMeilisearch()
      .index(INDEXES.USERS)
      .addDocuments([user]);
  }

  async removeUser(userId: string): Promise<void> {
    await getMeilisearch()
      .index(INDEXES.USERS)
      .deleteDocument(userId);
  }

  async indexMessage(doc: MessageIndexDoc): Promise<void> {
    await getMeilisearch()
      .index(INDEXES.MESSAGES)
      .addDocuments([doc]);
  }

  async removeMessage(messageId: string): Promise<void> {
    await getMeilisearch()
      .index(INDEXES.MESSAGES)
      .deleteDocument(messageId);
  }

  async removeMessagesForChat(chatId: string): Promise<void> {
    await getMeilisearch()
      .index(INDEXES.MESSAGES)
      .deleteDocuments({ filter: `chatId = "${chatId}"` });
  }
}
