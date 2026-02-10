import 'server-only';
import crypto from 'crypto';

const IV_LENGTH = 16;

function getEncryptionKey(): string {
  const key = process.env.DATA_ENCRYPTION_KEY || '';
  if (key.length !== 32) {
    throw new Error("DATA_ENCRYPTION_KEY must be 32 characters long");
  }
  return key;
}

export function encrypt(text: string) {
  const encryptionKey = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(encryptionKey), iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

export function decrypt(text: string) {
  const encryptionKey = getEncryptionKey();
  const textParts = text.split(':');
  const iv = Buffer.from(textParts.shift()!, 'hex');
  const encryptedText = Buffer.from(textParts.join(':'), 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(encryptionKey), iv);
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
}