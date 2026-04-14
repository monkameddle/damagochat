import type { PrismaClient } from '@prisma/client';
import type { SignedPreKey, PreKey } from '../../lib/signal.js';

interface PreKeyBundleRow {
  id: string;
  userId: string;
  deviceId: string;
  identityKey: string;
  signedPreKey: SignedPreKey;
  preKeys: PreKey[];
  updatedAt: Date;
}

export class EncryptionRepository {
  constructor(private readonly db: PrismaClient) {}

  async findBundle(userId: string): Promise<PreKeyBundleRow | null> {
    const row = await this.db.preKeyBundle.findUnique({ where: { userId } });
    if (!row) return null;
    return {
      id: row.id,
      userId: row.userId,
      deviceId: row.deviceId,
      identityKey: row.identityKey,
      signedPreKey: row.signedPreKey as unknown as SignedPreKey,
      preKeys: row.preKeys as unknown as PreKey[],
      updatedAt: row.updatedAt,
    };
  }

  async upsertBundle(data: {
    userId: string;
    deviceId: string;
    identityKey: string;
    signedPreKey: SignedPreKey;
    preKeys: PreKey[];
  }): Promise<void> {
    await this.db.preKeyBundle.upsert({
      where: { userId: data.userId },
      update: {
        deviceId: data.deviceId,
        identityKey: data.identityKey,
        signedPreKey: data.signedPreKey as object,
        preKeys: data.preKeys as object,
      },
      create: {
        userId: data.userId,
        deviceId: data.deviceId,
        identityKey: data.identityKey,
        signedPreKey: data.signedPreKey as object,
        preKeys: data.preKeys as object,
      },
    });
  }

  /**
   * Atomically pop one one-time pre-key and return the rest.
   * Returns null if no pre-keys remain.
   */
  async consumePreKey(
    userId: string,
  ): Promise<{ preKey: PreKey | null; remaining: number }> {
    const bundle = await this.findBundle(userId);
    if (!bundle) return { preKey: null, remaining: 0 };

    const keys = bundle.preKeys;
    if (keys.length === 0) return { preKey: null, remaining: 0 };

    const [consumed, ...rest] = keys;

    await this.db.preKeyBundle.update({
      where: { userId },
      data: { preKeys: rest as object },
    });

    return { preKey: consumed!, remaining: rest.length };
  }

  async appendPreKeys(userId: string, newKeys: PreKey[]): Promise<void> {
    const bundle = await this.findBundle(userId);
    if (!bundle) return;

    const merged = [...bundle.preKeys, ...newKeys];
    await this.db.preKeyBundle.update({
      where: { userId },
      data: { preKeys: merged as object },
    });
  }

  async countPreKeys(userId: string): Promise<number> {
    const bundle = await this.findBundle(userId);
    return bundle?.preKeys.length ?? 0;
  }
}
