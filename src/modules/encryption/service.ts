import { NotFoundError, ValidationError } from '../../shared/errors.js';
import { verifySignedPreKey } from '../../lib/signal.js';
import type { EncryptionRepository } from './repository.js';
import type { UploadKeyBundleInput, PreKeyBundleResponse } from './schema.js';

// Warn (but don't hard-error) when pre-key stock runs low
export const PRE_KEY_LOW_WATERMARK = 10;

export class EncryptionService {
  constructor(private readonly repo: EncryptionRepository) {}

  async uploadBundle(userId: string, input: UploadKeyBundleInput): Promise<void> {
    const valid = verifySignedPreKey(input.identityKey, input.signedPreKey);
    if (!valid) {
      throw new ValidationError(
        'signedPreKey signature is invalid — signature must be over the signedPreKey public key bytes using the identity key',
      );
    }

    await this.repo.upsertBundle({
      userId,
      deviceId: input.deviceId,
      identityKey: input.identityKey,
      signedPreKey: input.signedPreKey,
      preKeys: input.preKeys,
    });
  }

  async fetchBundle(
    requestingUserId: string,
    targetUserId: string,
  ): Promise<PreKeyBundleResponse> {
    const bundle = await this.repo.findBundle(targetUserId);
    if (!bundle) throw new NotFoundError('PreKeyBundle for user', targetUserId);

    const { preKey, remaining } = await this.repo.consumePreKey(targetUserId);

    if (remaining < PRE_KEY_LOW_WATERMARK) {
      // In production: trigger a push notification asking the device to replenish keys.
      // Here we just log so the client can handle it.
      process.stderr.write(
        `[encryption] User ${targetUserId} has only ${remaining} one-time pre-keys left\n`,
      );
    }

    return {
      userId: targetUserId,
      deviceId: bundle.deviceId,
      identityKey: bundle.identityKey,
      signedPreKey: bundle.signedPreKey,
      preKey,
    };
  }

  async replenishPreKeys(
    userId: string,
    newPreKeys: Array<{ keyId: number; publicKey: string }>,
  ): Promise<void> {
    const bundle = await this.repo.findBundle(userId);
    if (!bundle) throw new NotFoundError('PreKeyBundle for user', userId);

    if (newPreKeys.length === 0) {
      throw new ValidationError('Must provide at least one new pre-key');
    }

    await this.repo.appendPreKeys(userId, newPreKeys);
  }

  async getPreKeyCount(userId: string): Promise<number> {
    return this.repo.countPreKeys(userId);
  }
}
