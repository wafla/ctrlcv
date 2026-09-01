import {
  decryptFile,
  decryptFileChunk,
  encryptFileChunk,
} from "@/lib/client-crypto"

export const FILE_CHUNK_SIZE = 8 * 1024 * 1024
export const FILE_CHUNK_ENCRYPTION_OVERHEAD = 28
const LARGE_DOWNLOAD_FALLBACK_LIMIT = 512 * 1024 * 1024

export interface ChunkedAttachmentInfo {
  fileId: string
  fileName: string
  mimeType: string
  size: number
  transferVersion?: "chunked-v1"
  chunkSize?: number
  chunkCount?: number
}

interface UploadOptions {
  file: File
  encryptionKey: CryptoKey
  sessionId: string
  onProgress?: (progress: number) => void
}

interface DownloadOptions {
  attachment: ChunkedAttachmentInfo
  encryptionKey: CryptoKey
  sessionId: string
  onProgress?: (progress: number) => void
}

interface FileSystemWritableFileStreamLike {
  write(data: ArrayBuffer): Promise<void>
  close(): Promise<void>
  abort(): Promise<void>
}

interface FileSystemFileHandleLike {
  createWritable(): Promise<FileSystemWritableFileStreamLike>
}

type SaveFilePicker = (options: {
  suggestedName: string
}) => Promise<FileSystemFileHandleLike>

async function readJsonResponse(response: Response) {
  const text = await response.text()
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`The upload server returned HTTP ${response.status}.`)
  }
}

function getErrorMessage(data: any, fallback: string) {
  return typeof data?.error === "string" ? data.error : fallback
}

async function uploadChunkWithRetry(
  fileId: string,
  uploadToken: string,
  offset: number,
  encryptedChunk: Blob
) {
  let lastError: Error | null = null

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(`/api/files/uploads/${fileId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/octet-stream",
          Authorization: `Bearer ${uploadToken}`,
          "X-Upload-Offset": String(offset),
        },
        body: encryptedChunk,
      })
      const data = await readJsonResponse(response)
      if (!response.ok) {
        const error = new Error(getErrorMessage(data, "Failed to upload file chunk."))
        if (response.status < 500) throw error
        lastError = error
      } else {
        return Number(data.offset)
      }
    } catch (error: any) {
      lastError = error instanceof Error ? error : new Error(String(error))
    }
  }

  throw lastError ?? new Error("Failed to upload file chunk.")
}

export async function uploadEncryptedFile({
  file,
  encryptionKey,
  sessionId,
  onProgress,
}: UploadOptions) {
  const chunkCount = Math.ceil(file.size / FILE_CHUNK_SIZE)
  const mimeType = file.type || "application/octet-stream"
  const initResponse = await fetch("/api/files/uploads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId,
      fileName: file.name,
      mimeType,
      size: file.size,
      chunkSize: FILE_CHUNK_SIZE,
      chunkCount,
    }),
  })
  const initData = await readJsonResponse(initResponse)
  if (
    !initResponse.ok ||
    typeof initData.fileId !== "string" ||
    typeof initData.uploadToken !== "string"
  ) {
    throw new Error(getErrorMessage(initData, "Failed to initialize upload."))
  }

  let encryptedOffset = 0
  onProgress?.(0)

  for (let index = 0; index < chunkCount; index += 1) {
    const start = index * FILE_CHUNK_SIZE
    const end = Math.min(file.size, start + FILE_CHUNK_SIZE)
    const encryptedChunk = await encryptFileChunk(
      file.slice(start, end),
      encryptionKey
    )
    encryptedOffset = await uploadChunkWithRetry(
      initData.fileId,
      initData.uploadToken,
      encryptedOffset,
      encryptedChunk
    )
    onProgress?.(Math.round(((index + 1) / chunkCount) * 100))
  }

  const completeResponse = await fetch(
    `/api/files/uploads/${initData.fileId}/complete`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${initData.uploadToken}` },
    }
  )
  const completeData = await readJsonResponse(completeResponse)
  if (!completeResponse.ok || typeof completeData.fileId !== "string") {
    throw new Error(getErrorMessage(completeData, "Failed to complete upload."))
  }

  return {
    fileId: completeData.fileId as string,
    transferVersion: "chunked-v1" as const,
    chunkSize: FILE_CHUNK_SIZE,
    chunkCount,
  }
}

function isChunkedAttachment(attachment: ChunkedAttachmentInfo) {
  return (
    attachment.transferVersion === "chunked-v1" &&
    Number.isSafeInteger(attachment.chunkSize) &&
    Number.isSafeInteger(attachment.chunkCount) &&
    attachment.chunkSize === FILE_CHUNK_SIZE &&
    (attachment.chunkCount ?? 0) > 0
  )
}

async function fetchEncryptedChunk(
  attachment: ChunkedAttachmentInfo,
  accessToken: string,
  index: number
) {
  const chunkSize = attachment.chunkSize!
  const plaintextStart = index * chunkSize
  const plaintextLength = Math.min(chunkSize, attachment.size - plaintextStart)
  const encryptedLength = plaintextLength + FILE_CHUNK_ENCRYPTION_OVERHEAD
  const encryptedOffset = index * (chunkSize + FILE_CHUNK_ENCRYPTION_OVERHEAD)
  const response = await fetch(
    `/api/files/${attachment.fileId}?offset=${encryptedOffset}&length=${encryptedLength}`,
    {
      cache: "no-store",
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  )
  if (!response.ok) throw new Error("Failed to download encrypted file chunk.")
  return response.arrayBuffer()
}

async function getFileAccessToken(fileId: string, sessionId: string) {
  const response = await fetch(
    `/api/files/${fileId}/access?sessionId=${encodeURIComponent(sessionId)}`,
    { cache: "no-store" }
  )
  const data = await readJsonResponse(response)
  if (!response.ok || typeof data.token !== "string") {
    throw new Error(getErrorMessage(data, "Failed to authorize file download."))
  }
  return data.token as string
}

export async function loadEncryptedAttachmentBlob({
  attachment,
  encryptionKey,
  sessionId,
  onProgress,
}: DownloadOptions) {
  if (!isChunkedAttachment(attachment)) {
    const response = await fetch(
      `/api/files/${attachment.fileId}?sessionId=${encodeURIComponent(sessionId)}`,
      { cache: "no-store" }
    )
    if (!response.ok) throw new Error("Failed to load encrypted file.")
    return decryptFile(await response.arrayBuffer(), encryptionKey, attachment.mimeType)
  }

  const accessToken = await getFileAccessToken(attachment.fileId, sessionId)
  const decryptedChunks: ArrayBuffer[] = []
  for (let index = 0; index < attachment.chunkCount!; index += 1) {
    const encrypted = await fetchEncryptedChunk(attachment, accessToken, index)
    decryptedChunks.push(await decryptFileChunk(encrypted, encryptionKey))
    onProgress?.(Math.round(((index + 1) / attachment.chunkCount!) * 100))
  }
  return new Blob(decryptedChunks, { type: attachment.mimeType })
}

function triggerBlobDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function supportsStreamedDownload() {
  return typeof (window as unknown as { showSaveFilePicker?: SaveFilePicker })
    .showSaveFilePicker === "function"
}

export async function saveEncryptedAttachment({
  attachment,
  encryptionKey,
  sessionId,
  onProgress,
}: DownloadOptions) {
  if (!isChunkedAttachment(attachment)) {
    const blob = await loadEncryptedAttachmentBlob({
      attachment,
      encryptionKey,
      sessionId,
      onProgress,
    })
    triggerBlobDownload(blob, attachment.fileName)
    return
  }

  const picker = (window as unknown as { showSaveFilePicker?: SaveFilePicker })
    .showSaveFilePicker
  if (!picker) {
    if (attachment.size > LARGE_DOWNLOAD_FALLBACK_LIMIT) {
      throw new Error("Large file downloads currently require Chrome or Edge.")
    }
    const blob = await loadEncryptedAttachmentBlob({
      attachment,
      encryptionKey,
      sessionId,
      onProgress,
    })
    triggerBlobDownload(blob, attachment.fileName)
    return
  }

  const handle = await picker.call(window, { suggestedName: attachment.fileName })
  const writable = await handle.createWritable()
  try {
    const accessToken = await getFileAccessToken(attachment.fileId, sessionId)
    for (let index = 0; index < attachment.chunkCount!; index += 1) {
      const encrypted = await fetchEncryptedChunk(attachment, accessToken, index)
      const decrypted = await decryptFileChunk(encrypted, encryptionKey)
      await writable.write(decrypted)
      onProgress?.(Math.round(((index + 1) / attachment.chunkCount!) * 100))
    }
    await writable.close()
  } catch (error) {
    await writable.abort().catch(() => {})
    throw error
  }
}
