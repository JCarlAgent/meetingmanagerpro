import crypto from 'node:crypto';

function getEncryptionKey(): Buffer {
  const secret = process.env.INTEGRATIONS_ENCRYPTION_SECRET;
  if (!secret) {
    throw new Error('Missing INTEGRATIONS_ENCRYPTION_SECRET');
  }

  // Derive a stable 32-byte key from the provided secret.
  // This allows using a human-managed secret string in env vars.
  return crypto.scryptSync(secret, 'mmp-integrations-salt', 32);
}

export function encryptString(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  // Format: v1:<iv_b64>:<tag_b64>:<ciphertext_b64>
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${ciphertext.toString('base64')}`;
}

export function decryptString(payload: string): string {
  if (!payload.startsWith('v1:')) {
    throw new Error('Unsupported encrypted payload format');
  }

  const key = getEncryptionKey();
  const parts = payload.split(':');
  if (parts.length !== 4) {
    throw new Error('Invalid encrypted payload format');
  }

  const iv = Buffer.from(parts[1], 'base64');
  const tag = Buffer.from(parts[2], 'base64');
  const ciphertext = Buffer.from(parts[3], 'base64');

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);

  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString('utf8');
}
