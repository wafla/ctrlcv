import { createHmac, timingSafeEqual } from "crypto";

export interface UploadTokenPayload {
  kind: "upload";
  fileId: string;
  sessionId: string;
  originalSize: number;
  expectedEncryptedSize: number;
  expiresAt: number;
  isImage: boolean;
}

export interface FileAccessTokenPayload {
  kind: "download";
  fileId: string;
  storagePath: string;
  mimeType: string;
  expiresAt: number;
}

function getSecret() {
  const secret =
    process.env.UPLOAD_TOKEN_SECRET ||
    process.env.DB_KEEPALIVE_SECRET ||
    process.env.ORACLE_WALLET_PASSWORD;
  if (!secret) throw new Error("Upload token secret is not configured");
  return secret;
}

function sign(value: string) {
  return createHmac("sha256", getSecret()).update(value).digest("base64url");
}

export function createUploadToken(payload: UploadTokenPayload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

export function createFileAccessToken(payload: FileAccessTokenPayload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

function decodeToken(token: string) {
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;

  const expected = Buffer.from(sign(encoded));
  const provided = Buffer.from(signature);
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
    return null;
  }

  try {
    return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

export function verifyUploadToken(token: string): UploadTokenPayload | null {
  try {
    const payload = decodeToken(token) as UploadTokenPayload | null;
    if (
      !payload ||
      payload.kind !== "upload" ||
      typeof payload.fileId !== "string" ||
      !/^[A-F0-9]{32}$/.test(payload.fileId) ||
      typeof payload.sessionId !== "string" ||
      !Number.isSafeInteger(payload.originalSize) ||
      !Number.isSafeInteger(payload.expectedEncryptedSize) ||
      !Number.isSafeInteger(payload.expiresAt) ||
      typeof payload.isImage !== "boolean" ||
      payload.expiresAt <= Date.now()
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export function verifyFileAccessToken(token: string): FileAccessTokenPayload | null {
  try {
    const payload = decodeToken(token) as FileAccessTokenPayload | null;
    if (
      !payload ||
      payload.kind !== "download" ||
      typeof payload.fileId !== "string" ||
      !/^[A-F0-9]{32}$/.test(payload.fileId) ||
      typeof payload.storagePath !== "string" ||
      payload.storagePath !== `${payload.fileId}.bin` ||
      typeof payload.mimeType !== "string" ||
      !Number.isSafeInteger(payload.expiresAt) ||
      payload.expiresAt <= Date.now()
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export function getBearerToken(request: Request) {
  const authorization = request.headers.get("authorization");
  return authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
}
