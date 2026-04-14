import { createHash, randomBytes } from 'crypto';
import { getRedis } from '../../lib/redis.js';
import { config } from '../../config/index.js';

const OTP_TTL_SECONDS = 300; // 5 min
const otpKey = (phoneNumber: string) => `otp:${phoneNumber}`;

function hashOtp(otp: string): string {
  return createHash('sha256').update(otp).digest('hex');
}

export async function generateAndStoreOtp(phoneNumber: string): Promise<string> {
  const otp = String(Math.floor(100000 + Math.random() * 900000));
  const redis = getRedis();
  await redis.set(otpKey(phoneNumber), hashOtp(otp), 'EX', OTP_TTL_SECONDS);
  return otp;
}

export async function sendOtp(phoneNumber: string, otp: string): Promise<void> {
  if (config.OTP_STUB) return; // dev: log only, no actual send

  if (!config.SEVEN_API_KEY) {
    throw new Error('SEVEN_API_KEY not configured');
  }

  const res = await fetch('https://gateway.seven.io/api/sms', {
    method: 'POST',
    headers: {
      'X-Api-Key': config.SEVEN_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      to: phoneNumber,
      from: config.SEVEN_FROM,
      text: `Your Damagochat code: ${otp}`,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`seven.io SMS failed (${res.status}): ${body}`);
  }
}

export async function verifyOtp(
  phoneNumber: string,
  otp: string,
): Promise<boolean> {
  if (config.OTP_STUB) return true;

  const redis = getRedis();
  const stored = await redis.get(otpKey(phoneNumber));
  if (!stored) return false;

  const valid = stored === hashOtp(otp);
  if (valid) {
    await redis.del(otpKey(phoneNumber));
  }
  return valid;
}

export function generateRefreshToken(): string {
  return randomBytes(48).toString('hex');
}
