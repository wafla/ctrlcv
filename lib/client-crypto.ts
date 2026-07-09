const ENCRYPTED_PREFIX = "ctrlcv:v1:";
const KEY_DERIVATION_PREFIX = "ctrlcv-chat-key-v1";

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlToBytes(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

async function importAesKey(rawKey: Uint8Array) {
  const keyBytes = new Uint8Array(rawKey.byteLength);
  keyBytes.set(rawKey);

  return crypto.subtle.importKey("raw", keyBytes.buffer as ArrayBuffer, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

export function generateEncryptionKeyParam() {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  const value = new DataView(bytes.buffer).getUint32(0) % 100000000;

  return value.toString().padStart(8, "0");
}

export function getEncryptionKeyFromHash() {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  return params.get("key");
}

export async function getChatCryptoKey(
  sessionCode: string,
  keyParam?: string | null
) {
  if (!keyParam || !/^\d{8}$/.test(keyParam)) {
    throw new Error("An 8-digit encryption key is required");
  }

  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(keyParam),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: encoder.encode(
        `${KEY_DERIVATION_PREFIX}:${sessionCode.toUpperCase()}`
      ),
      iterations: 250000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export function isEncryptedMessage(content: string) {
  return content.startsWith(ENCRYPTED_PREFIX);
}

export async function encryptMessage(content: string, key: CryptoKey) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(content);
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoded
  );

  return `${ENCRYPTED_PREFIX}${bytesToBase64Url(iv)}.${bytesToBase64Url(
    new Uint8Array(encrypted)
  )}`;
}

export async function encryptFile(file: File, key: CryptoKey) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    await file.arrayBuffer()
  );
  const encryptedBytes = new Uint8Array(encrypted);
  const payload = new Uint8Array(iv.byteLength + encryptedBytes.byteLength);

  payload.set(iv, 0);
  payload.set(encryptedBytes, iv.byteLength);

  return new Blob([payload], { type: "application/octet-stream" });
}

export async function decryptFile(
  encrypted: ArrayBuffer,
  key: CryptoKey,
  mimeType: string
) {
  const payload = new Uint8Array(encrypted);
  const iv = payload.slice(0, 12);
  const data = payload.slice(12);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    data
  );

  return new Blob([decrypted], { type: mimeType });
}

export async function decryptMessage(content: string, key: CryptoKey) {
  if (!isEncryptedMessage(content)) return content;

  const payload = content.slice(ENCRYPTED_PREFIX.length);
  const [iv, encrypted] = payload.split(".");

  if (!iv || !encrypted) {
    throw new Error("Invalid encrypted message format");
  }

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64UrlToBytes(iv) },
    key,
    base64UrlToBytes(encrypted)
  );

  return new TextDecoder().decode(decrypted);
}
