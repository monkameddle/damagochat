/**
 * Server-side Signal Protocol helpers.
 *
 * The server only handles public key material — private keys never leave the device.
 * Responsibilities:
 *   - Validate the signedPreKey signature against the identity key on upload.
 *   - Store and serve PreKeyBundles.
 *   - Consume (delete) one-time pre-keys on fetch.
 */

import { PublicKey } from '@signalapp/libsignal-client';

export interface SignedPreKey {
  keyId: number;
  publicKey: string;   // base64 DER
  signature: string;   // base64
}

export interface PreKey {
  keyId: number;
  publicKey: string;   // base64 DER
}

/**
 * Verify that signedPreKey.signature is a valid Ed25519 signature of
 * signedPreKey.publicKey bytes, produced by the identity key.
 */
export function verifySignedPreKey(
  identityKeyBase64: string,
  signedPreKey: SignedPreKey,
): boolean {
  try {
    const identityKey = PublicKey.deserialize(
      Buffer.from(identityKeyBase64, 'base64'),
    );
    const signedPreKeyBytes = Buffer.from(signedPreKey.publicKey, 'base64');
    const signature = Buffer.from(signedPreKey.signature, 'base64');
    return identityKey.verify(signedPreKeyBytes, signature);
  } catch {
    return false;
  }
}

export function validateBase64Key(value: string, name: string): void {
  try {
    const buf = Buffer.from(value, 'base64');
    if (buf.length < 32) throw new Error('too short');
    PublicKey.deserialize(buf);
  } catch (err) {
    throw new Error(`Invalid ${name}: ${String(err)}`);
  }
}
