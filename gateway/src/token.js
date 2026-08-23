import { randomBytes } from 'node:crypto';

export function generateToken() {
  return randomBytes(48).toString('base64url');
}

export function verifyToken(requestToken, storedToken) {
  if (!requestToken || !storedToken) return false;
  return timingSafeEqual(Buffer.from(requestToken), Buffer.from(storedToken));
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i];
  }
  return result === 0;
}
