import { getQueue, QUEUES, type PushJobData } from '../../lib/queue.js';
import { isOnline } from '../../websocket/presence.js';
import type { NotificationRepository } from './repository.js';
import type { PushPayload, RegisterTokenInput } from './schema.js';

export class NotificationService {
  constructor(private readonly repo: NotificationRepository) {}

  async registerToken(
    userId: string,
    deviceId: string,
    input: RegisterTokenInput,
  ): Promise<void> {
    await this.repo.setToken(userId, deviceId, input.token);
  }

  async unregisterToken(userId: string, deviceId: string): Promise<void> {
    await this.repo.clearToken(userId, deviceId);
  }

  /**
   * Enqueue push notifications for all offline recipients in a chat.
   * Called by the message.send WS handler after persisting the message.
   */
  async notifyOfflineMembers(
    memberIds: string[],
    senderUserId: string,
    payload: PushPayload,
  ): Promise<void> {
    // Check presence for all members except sender
    const recipients = memberIds.filter((id) => id !== senderUserId);
    if (recipients.length === 0) return;

    const presenceChecks = await Promise.all(
      recipients.map(async (id) => ({ id, online: await isOnline(id) })),
    );

    const offlineUserIds = presenceChecks
      .filter((p) => !p.online)
      .map((p) => p.id);

    if (offlineUserIds.length === 0) return;

    const tokenMap = await this.repo.getTokensForUsers(offlineUserIds);
    const queue = getQueue(QUEUES.PUSH_NOTIFICATIONS);

    const jobs = Object.entries(tokenMap).flatMap(([userId, tokens]) =>
      tokens.map((token) => ({
        name: 'push',
        data: {
          userId,
          token,
          title: payload.title,
          body: payload.body,
          ...(payload.data !== undefined && { data: payload.data }),
        } satisfies PushJobData,
      })),
    );

    if (jobs.length > 0) {
      await queue.addBulk(jobs);
    }
  }
}
