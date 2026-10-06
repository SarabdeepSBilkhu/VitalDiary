/**
 * AES-256-GCM encryption/decryption for sensitive fields at rest.
 * 
 * Requires ENCRYPTION_KEY env var — a 64-char hex string (32 bytes).
 * Generate one with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 * 
 * Encrypted format: "<iv_hex>:<authTag_hex>:<ciphertext_hex>"
 * If the value doesn't match this pattern (e.g., legacy plaintext), it's returned as-is
 * so existing data migrates transparently on first re-save.
 */
const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits recommended for GCM
const TAG_LENGTH = 16;

function getKey() {
  const keyHex = process.env.ENCRYPTION_KEY;
  if (!keyHex) {
    // In test/dev without a key, return null to skip encryption
    return null;
  }
  if (keyHex.length !== 64) {
    throw new Error('ENCRYPTION_KEY must be a 64-character hex string (32 bytes).');
  }
  return Buffer.from(keyHex, 'hex');
}

/**
 * Encrypt a plaintext string.
 * Returns "<iv>:<authTag>:<ciphertext>" in hex, or the original value if no key configured.
 */
function encrypt(text) {
  if (!text) return text;
  const key = getKey();
  if (!key) return text; // No key: passthrough (dev mode)

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypt an encrypted string.
 * Returns plaintext. If value is not in encrypted format, returns it as-is (legacy migration).
 */
function decrypt(encryptedText) {
  if (!encryptedText) return encryptedText;
  const key = getKey();
  if (!key) return encryptedText; // No key: passthrough

  const parts = encryptedText.split(':');
  if (parts.length !== 3) return encryptedText; // Legacy plaintext — return as-is

  try {
    const [ivHex, tagHex, ciphertextHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const ciphertext = Buffer.from(ciphertextHex, 'hex');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    return decipher.update(ciphertext, undefined, 'utf8') + decipher.final('utf8');
  } catch (err) {
    console.error('[encryption] Decryption failed — returning ciphertext:', err.message);
    return encryptedText;
  }
}

/**
 * Check if a value is already encrypted (has our format).
 */
function isEncrypted(value) {
  if (!value || typeof value !== 'string') return false;
  const parts = value.split(':');
  return parts.length === 3 && parts[0].length === 24; // IV is 12 bytes = 24 hex chars
}

module.exports = { encrypt, decrypt, isEncrypted };
