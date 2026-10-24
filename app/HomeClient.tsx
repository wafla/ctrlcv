"use client"

import { useState, useEffect, useRef, type ClipboardEvent, type DragEvent } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { createSessionInviteUrl, type SessionInfo } from "@/lib/session-info"
import { Textarea } from "@/components/ui/textarea"
import { QRCodeGenerator } from "@/components/qr-code-generator"
import { SessionExpiryCountdown } from "@/components/session-expiry-countdown"
import { DeviceNameInput } from "@/components/device-name-input"
import { InfoTip } from "@/components/info-tip"
import { useDeviceIdentity } from "@/hooks/use-device-identity"
import {
  decodeDeviceMessage,
  encodeDeviceMessage,
  getSenderLabel,
  isOwnDeviceMessage,
  type DeviceMessage,
} from "@/lib/device-message"
import { Loader2, Monitor, RefreshCw, Send, Copy, Check, ChevronDown, ChevronUp, AlertCircle, Paperclip, Download, File as FileIcon, Upload, X } from "lucide-react"
import {
  decryptMessage,
  encryptMessage,
  generateEncryptionKeyParam,
  getSessionCryptoKey,
  getEncryptionKeyFromHash,
} from "@/lib/client-crypto"
import {
  loadEncryptedAttachmentBlob,
  saveEncryptedAttachment,
  uploadEncryptedFile,
} from "@/lib/client-file-transfer"

type Message = DeviceMessage

interface ErrorInfo {
  message: string
  details?: string
  code?: string | number
}

interface Attachment {
  type: "image" | "file"
  fileId: string
  fileName: string
  mimeType: string
  size: number
  transferVersion?: "chunked-v1"
  chunkSize?: number
  chunkCount?: number
}

const DEFAULT_ATTACHMENT_SIZE = 10 * 1024 * 1024

function getAttachmentValidationError(file: File, maxAttachmentSize: number) {
  if (maxAttachmentSize <= 0) {
    return "Uploads are temporarily unavailable due to low server storage."
  }

  if (file.size > maxAttachmentSize) {
    return `Files must be ${formatFileSize(maxAttachmentSize)} or smaller.`
  }
  return null
}

function parseAttachment(content: string): Attachment | null {
  try {
    const parsed = JSON.parse(content)
    if (
      (parsed?.type === "image" || parsed?.type === "file") &&
      typeof parsed.fileId === "string" &&
      typeof parsed.fileName === "string" &&
      typeof parsed.mimeType === "string" &&
      typeof parsed.size === "number"
    ) {
      const hasValidTransferMetadata =
        parsed.transferVersion === undefined ||
        (parsed.transferVersion === "chunked-v1" &&
          typeof parsed.chunkSize === "number" &&
          typeof parsed.chunkCount === "number")
      if (!hasValidTransferMetadata) return null
      return parsed
    }
  } catch {
    return null
  }

  return null
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`
}

function ErrorDisplay({ error, onDismiss }: { error: ErrorInfo; onDismiss?: () => void }) {
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 space-y-2">
      <div className="flex items-start gap-2">
        <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-destructive">{error.message}</p>
          
          {(error.details || error.code) && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-xs text-muted-foreground hover:text-foreground mt-1 flex items-center gap-1"
            >
              {isExpanded ? (
                <>
                  <ChevronUp className="h-3 w-3" />
                  Hide details
                </>
              ) : (
                <>
                  <ChevronDown className="h-3 w-3" />
                  Show details
                </>
              )}
            </button>
          )}
          
          {isExpanded && (
            <div className="mt-2 p-2 bg-muted/50 rounded text-xs font-mono break-all">
              {error.code && <p className="text-muted-foreground">Code: {error.code}</p>}
              {error.details && <p className="text-muted-foreground mt-1">{error.details}</p>}
            </div>
          )}
        </div>
        
        {onDismiss && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 shrink-0"
            onClick={onDismiss}
          >
            ×
          </Button>
        )}
      </div>
    </div>
  )
}

function CollapsibleMessage({ 
  message, 
  deviceId,
  copiedMessageId, 
  onCopy,
  sessionId,
  encryptionKey,
}: { 
  message: Message
  deviceId?: string
  copiedMessageId: string | null
  onCopy: (content: string, id: string) => void
  sessionId: string
  encryptionKey: CryptoKey | null
}) {
  const [isExpanded, setIsExpanded] = useState(false)
  const MAX_LENGTH = 200
  const attachment = parseAttachment(message.content)
  const isOwn = isOwnDeviceMessage(message, deviceId)

  const shouldCollapse = message.content.length > MAX_LENGTH
  const displayContent = shouldCollapse && !isExpanded 
    ? message.content.slice(0, MAX_LENGTH) + "..."
    : message.content

  const formatMessageTime = (createdAt: string) => {
    const normalizeUtcIso = (s: string) =>
      s.replace(/(\.\d{3})\d+(Z|[+-]\d\d:\d\d)$/, "$1$2")
    
    const d = new Date(normalizeUtcIso(createdAt))
    if (Number.isNaN(d.getTime())) return ""
    return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
  }

  return (
    <div
      className={`flex ${
        isOwn ? "justify-end" : "justify-start"
      }`}
    >
      <div
        className={`max-w-[80%] p-3 rounded-lg relative group ${
          isOwn
            ? "bg-primary text-primary-foreground"
            : "bg-card border"
        }`}
      >
        {attachment ? (
          <EncryptedAttachment
            attachment={attachment}
            sessionId={sessionId}
            encryptionKey={encryptionKey}
          />
        ) : (
          <p className="text-sm whitespace-pre-wrap break-words">
            {displayContent}
          </p>
        )}
        
        {shouldCollapse && !attachment && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-xs opacity-70 hover:opacity-100 mt-1 flex items-center gap-1 transition-opacity"
          >
            {isExpanded ? (
              <>
                <ChevronUp className="h-3 w-3" />
                Show less
              </>
            ) : (
              <>
                <ChevronDown className="h-3 w-3" />
                Show more
              </>
            )}
          </button>
        )}

        <div className="flex items-center justify-between mt-2 gap-2">
          <span className="min-w-0 break-words text-xs opacity-70">
            {getSenderLabel(message, deviceId)}
            {formatMessageTime(message.created_at) ? ` · ${formatMessageTime(message.created_at)}` : ""}
          </span>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0"
            onClick={() => onCopy(message.content, message.id)}
            disabled={Boolean(attachment)}
          >
            {copiedMessageId === message.id ? (
              <Check className="h-3 w-3" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}

function EncryptedAttachment({
  attachment,
  sessionId,
  encryptionKey,
}: {
  attachment: Attachment
  sessionId: string
  encryptionKey: CryptoKey | null
}) {
  const [fileUrl, setFileUrl] = useState<string | null>(null)
  const [error, setError] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null)
  const [downloadError, setDownloadError] = useState<string | null>(null)
  const isLargeImage = attachment.type === "image" && attachment.size > 100 * 1024 * 1024

  useEffect(() => {
    if (!encryptionKey || attachment.type !== "image" || isLargeImage) return

    let objectUrl: string | null = null
    let cancelled = false

    async function loadImage() {
      try {
        const decrypted = await loadEncryptedAttachmentBlob({
          attachment,
          encryptionKey: encryptionKey!,
          sessionId,
        })
        objectUrl = URL.createObjectURL(decrypted)
        if (!cancelled) setFileUrl(objectUrl)
      } catch {
        if (!cancelled) setError(true)
      }
    }

    loadImage()

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [
    attachment.chunkCount,
    attachment.chunkSize,
    attachment.fileId,
    attachment.mimeType,
    attachment.size,
    attachment.transferVersion,
    attachment.type,
    encryptionKey,
    isLargeImage,
    sessionId,
  ])

  const handleDownload = async () => {
    if (!encryptionKey || isDownloading) return
    setIsDownloading(true)
    setDownloadProgress(0)
    setDownloadError(null)
    try {
      await saveEncryptedAttachment({
        attachment,
        encryptionKey,
        sessionId,
        onProgress: setDownloadProgress,
      })
    } catch (error: any) {
      if (error?.name !== "AbortError") {
        setDownloadError(error?.message || "Failed to download file.")
      }
    } finally {
      setIsDownloading(false)
      setDownloadProgress(null)
    }
  }

  if (attachment.type === "file" || isLargeImage) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <FileIcon className="h-4 w-4 shrink-0" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{attachment.fileName}</p>
            <p className="text-xs opacity-70">{formatFileSize(attachment.size)}</p>
          </div>
        </div>
        {isLargeImage && (
          <p className="text-xs opacity-70">Preview skipped for this large image.</p>
        )}
        {downloadError && <p className="text-xs text-destructive">{downloadError}</p>}
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="w-full"
          onClick={() => void handleDownload()}
          disabled={isDownloading}
        >
          {isDownloading ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Download className="h-4 w-4 mr-2" />
          )}
          {isDownloading ? `Downloading ${downloadProgress ?? 0}%` : "Download"}
        </Button>
      </div>
    )
  }

  if (error) {
    return <p className="text-sm opacity-80">Unable to load encrypted file.</p>
  }

  if (!fileUrl) {
    return (
      <div className="flex items-center gap-2 text-sm opacity-80">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading encrypted file...
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <img
        src={fileUrl}
        alt={attachment.fileName || "Encrypted upload"}
        className="max-h-72 rounded-md object-contain"
      />
      {downloadError && <p className="text-xs text-destructive">{downloadError}</p>}
      <Button
        type="button"
        size="sm"
        variant="secondary"
        className="w-full"
        onClick={() => void handleDownload()}
        disabled={isDownloading}
      >
        {isDownloading ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <Download className="h-4 w-4 mr-2" />
        )}
        {isDownloading ? `Downloading ${downloadProgress ?? 0}%` : "Download"}
      </Button>
    </div>
  )
}

export default function HomePage() {
  const { device, renameDevice } = useDeviceIdentity()
  const searchParams = useSearchParams()
  const router = useRouter()
  const codeFromUrl = searchParams.get("code")

  const [sessionData, setSessionData] = useState<SessionInfo | null>(null)

  const [isLoading, setIsLoading] = useState(false)
  const [qrUrl, setQrUrl] = useState("")
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState("")
  const [isSending, setIsSending] = useState(false)
  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
  const [isDraggingAttachment, setIsDraggingAttachment] = useState(false)
  const [maxAttachmentSize, setMaxAttachmentSize] = useState(DEFAULT_ATTACHMENT_SIZE)
  const [pendingAttachment, setPendingAttachment] = useState<File | null>(null)
  const [pendingAttachmentUrl, setPendingAttachmentUrl] = useState<string | null>(null)
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null)
  const [isLinkCopied, setIsLinkCopied] = useState(false)
  const [encryptionKey, setEncryptionKey] = useState<CryptoKey | null>(null)
  const [encryptionKeyParam, setEncryptionKeyParam] = useState<string | null>(null)
  const [isJoinFormOpen, setIsJoinFormOpen] = useState(false)
  const [joinSessionCode, setJoinSessionCode] = useState("")
  const [joinEncryptionKey, setJoinEncryptionKey] = useState("")
  
  const [sessionError, setSessionError] = useState<ErrorInfo | null>(null)
  const [joinError, setJoinError] = useState<ErrorInfo | null>(null)
  const [messageError, setMessageError] = useState<ErrorInfo | null>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const copyLinkTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const attachmentInputRef = useRef<HTMLInputElement>(null)
  const attachmentUploadRef = useRef(false)
  const attachmentDragDepthRef = useRef(0)
  const completedAttachmentRef = useRef<{
    file: File
    attachment: Attachment
  } | null>(null)

  const [isAtBottom, setIsAtBottom] = useState(true)
  const [newMessagesCount, setNewMessagesCount] = useState(0)

  const isAtBottomRef = useRef(true)
  useEffect(() => {
    isAtBottomRef.current = isAtBottom
  }, [isAtBottom])

  const messagesMetaRef = useRef<{ len: number; lastId: string | null }>({
    len: 0,
    lastId: null,
  })

  const sendingRef = useRef(false)
  const initializedRef = useRef(false)

  useEffect(() => () => clearTimeout(copyLinkTimeoutRef.current), [])

  useEffect(() => {
    let cancelled = false

    async function loadUploadLimit() {
      try {
        const response = await fetch("/api/files", { cache: "no-store" })
        const data = await response.json()
        if (
          !cancelled &&
          response.ok &&
          typeof data.maxFileSize === "number" &&
          data.maxFileSize >= 0
        ) {
          setMaxAttachmentSize(data.maxFileSize)
        }
      } catch (error) {
        console.warn("Failed to load upload limit:", error)
      }
    }

    void loadUploadLimit()
    const interval = setInterval(loadUploadLimit, 30000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  useEffect(() => {
    if (!pendingAttachment || !pendingAttachment.type.startsWith("image/")) {
      setPendingAttachmentUrl(null)
      return
    }

    const objectUrl = URL.createObjectURL(pendingAttachment)
    setPendingAttachmentUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [pendingAttachment])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
    setIsAtBottom(true)
    setNewMessagesCount(0)
  }

  const handleScroll = () => {
    const el = messagesContainerRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 10
    setIsAtBottom(atBottom)
    if (atBottom) setNewMessagesCount(0)
  }

  const resetChatState = () => {
    setMessages([])
    setNewMessage("")
    setIsSending(false)
    setIsUploadingAttachment(false)
    setUploadProgress(null)
    setIsDraggingAttachment(false)
    setPendingAttachment(null)
    setCopiedMessageId(null)
    clearTimeout(copyLinkTimeoutRef.current)
    setIsLinkCopied(false)
    setEncryptionKey(null)
    setEncryptionKeyParam(null)
    setIsAtBottom(true)
    setNewMessagesCount(0)
    setMessageError(null)
    messagesMetaRef.current = { len: 0, lastId: null }
    sendingRef.current = false
    attachmentUploadRef.current = false
    attachmentDragDepthRef.current = 0
    completedAttachmentRef.current = null
  }

  const updateUrl = (code: string | null, keyParam?: string | null) => {
    if (code) {
      router.replace(`?code=${code}${keyParam ? `#key=${keyParam}` : ""}`, { scroll: false })
    } else {
      router.replace("/", { scroll: false })
    }
  }

  const loadMessages = async (sessionId: string) => {
    if (!encryptionKey) return

    try {
      const response = await fetch(`/api/messages?sessionId=${sessionId}`)
      const expiresAt = response.headers.get("X-Session-Expires-At")
      if (expiresAt) {
        setSessionData((current) =>
          current &&
          current.sessionId === sessionId &&
          current.expiresAt !== expiresAt
            ? { ...current, expiresAt }
            : current
        )
      }
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => "")
        console.warn("Error loading messages:", {
          status: response.status,
          body: errorText.slice(0, 200),
        })
        return
      }
      
      const data = await response.json()
      const next: Message[] = await Promise.all(
        data.map(async (row: any) => ({
          id: row.ID,
          ...decodeDeviceMessage(await decryptMessage(row.CONTENT, encryptionKey).catch(
            () => "[Unable to decrypt message]"
          )),
          sender_type: row.SENDER_TYPE.toLowerCase(),
          created_at: row.CREATED_AT,
        }))
      )

      const prevMeta = messagesMetaRef.current
      const nextLastId = next.at(-1)?.id ?? null
      const added = next.length - prevMeta.len

      const changed = added !== 0 || nextLastId !== prevMeta.lastId
      if (!changed) return

      if (prevMeta.len > 0 && added > 0 && !isAtBottomRef.current) {
        setNewMessagesCount((c) => c + added)
      }

      setMessages(next)
      messagesMetaRef.current = { len: next.length, lastId: nextLastId }
      
      if (isAtBottomRef.current) setNewMessagesCount(0)
    } catch (error) {
      console.warn("Error loading messages:", error)
    }
  }

  const connectToSession = async (
    code: string,
    keyParamOverride?: string | null,
    createFallback = true
  ) => {
    setIsLoading(true)
    setSessionError(null)
    setJoinError(null)

    try {
      const response = await fetch(`/api/session?code=${code.trim().toUpperCase()}`)
      const data = await response.json()

      if (!response.ok) {
        const errorInfo = {
          message: data.error || "Session not found.",
          details: data.details,
          code: data.code,
        }
        if (createFallback) {
          setSessionError(errorInfo)
          updateUrl(null)
          await createSession()
        } else {
          setJoinError(errorInfo)
        }
        return
      }

      const requiresKey = data.requiresKey !== false
      const suppliedKey = keyParamOverride !== undefined ? keyParamOverride : getEncryptionKeyFromHash()
      const keyParam = requiresKey ? suppliedKey : null
      if (requiresKey && (!keyParam || !/^\d{8}$/.test(keyParam))) {
        const errorInfo = {
          message: "Encryption key is missing.",
          details: "Enter the 8-digit encryption key or use the full QR link.",
        }
        if (createFallback) {
          setSessionError(errorInfo)
          updateUrl(null)
          await createSession()
        } else {
          setJoinError(errorInfo)
        }
        return
      }

      const cryptoKey = await getSessionCryptoKey(data.sessionCode, requiresKey, keyParam)
      resetChatState()
      setSessionData({ ...data, requiresKey })
      setEncryptionKeyParam(keyParam)
      setEncryptionKey(cryptoKey)

      const baseUrl = window.location.origin
      setQrUrl(`${baseUrl}/mobile?code=${data.sessionCode}${keyParam ? `#key=${keyParam}` : ""}`)
      updateUrl(data.sessionCode, keyParam)
      setIsJoinFormOpen(false)
      setJoinSessionCode("")
      setJoinEncryptionKey("")
      setJoinError(null)
    } catch (error: any) {
      const errorInfo = {
        message: "Server error. Please try again later.",
        details: error?.message,
      }
      if (createFallback) {
        setSessionError(errorInfo)
      } else {
        setJoinError(errorInfo)
      }
    } finally {
      setIsLoading(false)
    }
  }

  const createSession = async (requestedRequiresKey = true) => {
    setIsLoading(true)
    setSessionError(null)

    setSessionData(null)
    setQrUrl("")
    resetChatState()

    try {
      const response = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requiresKey: requestedRequiresKey }),
      })
      const data = await response.json()
      
      if (!response.ok) {
        setSessionError({
          message: data.error || "Failed to create session.",
          details: data.details,
          code: data.code
        })
        return
      }

      const requiresKey = data.requiresKey !== false
      setSessionData({ ...data, requiresKey })

      const keyParam = requiresKey ? generateEncryptionKeyParam() : null
      setEncryptionKeyParam(keyParam)
      setEncryptionKey(await getSessionCryptoKey(data.sessionCode, requiresKey, keyParam))

      const baseUrl = window.location.origin
      setQrUrl(`${baseUrl}/mobile?code=${data.sessionCode}${keyParam ? `#key=${keyParam}` : ""}`)

      updateUrl(data.sessionCode, keyParam)
    } catch (error: any) {
      setSessionError({
        message: "Failed to create session.",
        details: error?.message || String(error)
      })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (initializedRef.current) return
    initializedRef.current = true

    if (codeFromUrl) {
      connectToSession(codeFromUrl)
    } else {
      createSession()
    }
  }, [])

  useEffect(() => {
    if (!sessionData) return

    const id = sessionData.sessionId
    loadMessages(id)

    const interval = setInterval(() => {
      loadMessages(id)
    }, 2000)

    return () => clearInterval(interval)
  }, [sessionData?.sessionId, encryptionKey])

  useEffect(() => {
    if (messages.length === 0) return
    if (isAtBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
      setNewMessagesCount(0)
    }
  }, [messages, isAtBottom])

  const sendMessage = async () => {
    const content = newMessage.trim()
    if (!content || !sessionData || !encryptionKey || !device) return
    if (sendingRef.current) return

    sendingRef.current = true
    setIsSending(true)
    setMessageError(null)

    try {
      const encryptedContent = await encryptMessage(encodeDeviceMessage(content, device), encryptionKey)

      const response = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: sessionData.sessionId,
          content: encryptedContent,
          senderType: device.kind,
        }),
      })

      const data = await response.json()
      
      if (!response.ok) {
        setMessageError({
          message: data.error || "Failed to send message.",
          details: data.details,
          code: data.code
        })
        return
      }

      if (typeof data.expiresAt === "string") {
        setSessionData((current) =>
          current ? { ...current, expiresAt: data.expiresAt } : current
        )
      }
      setNewMessage("")
      loadMessages(sessionData.sessionId)
    } catch (error: any) {
      setMessageError({
        message: "Failed to send message.",
        details: error?.message || String(error)
      })
    } finally {
      setIsSending(false)
      sendingRef.current = false
    }
  }

  const sendAttachment = async (file: File | null): Promise<boolean> => {
    if (!file || !sessionData || !encryptionKey || !device || attachmentUploadRef.current) return false

    const validationError = getAttachmentValidationError(file, maxAttachmentSize)
    if (validationError) {
      setMessageError({ message: validationError })
      return false
    }

    attachmentUploadRef.current = true
    setIsUploadingAttachment(true)
    setUploadProgress(0)
    setMessageError(null)

    try {
      let attachment =
        completedAttachmentRef.current?.file === file
          ? completedAttachmentRef.current.attachment
          : null

      if (!attachment) {
        const uploadData = await uploadEncryptedFile({
          file,
          encryptionKey,
          sessionId: sessionData.sessionId,
          onProgress: setUploadProgress,
        })
        attachment = {
          type: file.type.startsWith("image/") ? "image" : "file",
          fileId: uploadData.fileId,
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
          size: file.size,
          transferVersion: uploadData.transferVersion,
          chunkSize: uploadData.chunkSize,
          chunkCount: uploadData.chunkCount,
        }
        completedAttachmentRef.current = { file, attachment }
      }
      const encryptedContent = await encryptMessage(
        encodeDeviceMessage(JSON.stringify(attachment), device),
        encryptionKey
      )

      const messageResponse = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: sessionData.sessionId,
          content: encryptedContent,
          senderType: device.kind,
        }),
      })
      const messageData = await messageResponse.json()

      if (!messageResponse.ok) {
        setMessageError({
          message: messageData.error || "Failed to send file.",
          details: messageData.details,
          code: messageData.code,
        })
        return false
      }

      if (typeof messageData.expiresAt === "string") {
        setSessionData((current) =>
          current ? { ...current, expiresAt: messageData.expiresAt } : current
        )
      }
      completedAttachmentRef.current = null
      loadMessages(sessionData.sessionId)
      return true
    } catch (error: any) {
      setMessageError({
        message: "Failed to upload file.",
        details: error?.message || String(error),
      })
      return false
    } finally {
      attachmentUploadRef.current = false
      setIsUploadingAttachment(false)
      setUploadProgress(null)
      if (attachmentInputRef.current) attachmentInputRef.current.value = ""
    }
  }

  const prepareAttachment = (file: File | null) => {
    if (!file) return

    const validationError = getAttachmentValidationError(file, maxAttachmentSize)
    if (validationError) {
      setMessageError({ message: validationError })
      return
    }

    setMessageError(null)
    completedAttachmentRef.current = null
    setPendingAttachment(file)
    if (attachmentInputRef.current) attachmentInputRef.current.value = ""
  }

  const handleSend = async () => {
    if (pendingAttachment) {
      const sent = await sendAttachment(pendingAttachment)
      if (sent) setPendingAttachment(null)
      return
    }

    await sendMessage()
  }

  const hasDraggedFiles = (event: DragEvent<HTMLElement>) =>
    Array.from(event.dataTransfer.types).includes("Files")

  const handleAttachmentDragEnter = (event: DragEvent<HTMLElement>) => {
    if (!sessionData || !encryptionKey || !hasDraggedFiles(event)) return
    event.preventDefault()
    attachmentDragDepthRef.current += 1
    setIsDraggingAttachment(true)
  }

  const handleAttachmentDragOver = (event: DragEvent<HTMLElement>) => {
    if (!sessionData || !encryptionKey || !hasDraggedFiles(event)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = "copy"
  }

  const handleAttachmentDragLeave = (event: DragEvent<HTMLElement>) => {
    if (!hasDraggedFiles(event)) return
    event.preventDefault()
    attachmentDragDepthRef.current = Math.max(0, attachmentDragDepthRef.current - 1)
    if (attachmentDragDepthRef.current === 0) setIsDraggingAttachment(false)
  }

  const handleAttachmentDrop = (event: DragEvent<HTMLElement>) => {
    if (!sessionData || !encryptionKey || !hasDraggedFiles(event)) return
    event.preventDefault()
    attachmentDragDepthRef.current = 0
    setIsDraggingAttachment(false)
    prepareAttachment(event.dataTransfer.files[0] ?? null)
  }

  const handleAttachmentPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const imageItem = Array.from(event.clipboardData.items).find(
      (item) => item.kind === "file" && item.type.startsWith("image/")
    )
    const image = imageItem?.getAsFile()
    if (!image) return

    event.preventDefault()
    const extension = image.type.split("/")[1]?.replace("jpeg", "jpg") || "png"
    const pastedImage = new File(
      [image],
      `pasted-image-${Date.now()}.${extension}`,
      { type: image.type, lastModified: Date.now() }
    )
    prepareAttachment(pastedImage)
  }

  const copyToClipboard = async (content: string, messageId: string) => {
    try {
      await navigator.clipboard.writeText(content)
      setCopiedMessageId(messageId)
      setTimeout(() => setCopiedMessageId(null), 2000)
    } catch (error) {
      console.error("Failed to copy:", error)
    }
  }

  const copySessionLink = async () => {
    if (!sessionData) return

    try {
      const url = createSessionInviteUrl(window.location.origin, sessionData, encryptionKeyParam)
      await navigator.clipboard.writeText(url)
      clearTimeout(copyLinkTimeoutRef.current)
      setIsLinkCopied(true)
      copyLinkTimeoutRef.current = setTimeout(() => setIsLinkCopied(false), 2000)
    } catch (error) {
      setMessageError({ message: "Couldn't copy the link. Copy it from the address bar." })
    }
  }

  const handleNewSession = async () => {
    updateUrl(null)
    setIsJoinFormOpen(false)
    await createSession()
  }

  const handleJoinSession = async () => {
    const code = joinSessionCode.trim().toUpperCase()
    const key = joinEncryptionKey.trim()

    if (!/^[A-Z0-9]{6}$/.test(code)) {
      setJoinError({
        message: "Enter a 6-character session code.",
      })
      return
    }

    await connectToSession(code, key, false)
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* QR Code Section */}
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="flex items-center justify-center gap-2">
              <Monitor className="h-5 w-5" />
              CtrlCV Desktop
            </CardTitle>
            <CardDescription>QR or session code</CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : sessionError ? (
              <div className="space-y-4">
                <ErrorDisplay 
                  error={sessionError} 
                  onDismiss={() => setSessionError(null)} 
                />
                <Button onClick={handleNewSession} className="w-full" disabled={isLoading}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Try Again
                </Button>
              </div>
            ) : sessionData && qrUrl ? (
              <>
                <div className="flex justify-center">
                  <QRCodeGenerator value={qrUrl} size={180} />
                </div>

                <div className="text-center space-y-2">
                  <p className="text-sm text-muted-foreground">Session Code</p>
                  <p className="rounded-md border bg-muted/40 px-3 py-2 text-center font-mono text-xl font-bold text-primary tracking-wider">
                    {sessionData.sessionCode}
                  </p>
                </div>

                <div className="space-y-2 rounded-md border p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-1">
                      <Label htmlFor="requireEncryptionKey">Require key</Label>
                      <InfoTip label="About key protection">
                        On by default. A separate 8-digit key protects your messages and files.
                        Changing this setting creates a new session; the previous one remains until expiry.
                      </InfoTip>
                    </div>
                    <Switch id="requireEncryptionKey" checked={sessionData.requiresKey}
                      disabled={isLoading || isSending || isUploadingAttachment}
                      onCheckedChange={(checked) => { void createSession(checked) }} />
                  </div>
                  {!sessionData.requiresKey && (
                    <div className="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400" role="status">
                      <span>Anyone with the code can join.</span>
                      <InfoTip label="About code-only access">
                        Anyone with the code, including the server, can derive the encryption key
                        and read messages and files.
                      </InfoTip>
                    </div>
                  )}
                </div>

                {encryptionKeyParam && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-center gap-1 text-sm text-muted-foreground">
                      <span>Encryption Key</span>
                      <InfoTip label="About the encryption key">
                        Share this 8-digit key for manual connections. The full QR link includes it.
                        This private key is never sent to the server.
                      </InfoTip>
                    </div>
                    <p className="rounded-md border bg-muted/40 px-3 py-2 text-center font-mono text-lg font-semibold tracking-widest">
                      {encryptionKeyParam}
                    </p>
                  </div>
                )}

                <Button type="button" onClick={copySessionLink} variant="outline"
                  size="sm" className="w-full" aria-live="polite">
                  {isLinkCopied ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
                  {isLinkCopied ? "Copied" : "Copy link"}
                </Button>

                <Button
                  onClick={handleNewSession}
                  variant="outline"
                  size="sm"
                  className="w-full bg-transparent"
                  disabled={isLoading}
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  New Session
                </Button>

                <Button
                  onClick={() => {
                    setSessionError(null)
                    setIsJoinFormOpen((open) => !open)
                  }}
                  variant="secondary"
                  size="sm"
                  className="w-full"
                  disabled={isLoading}
                >
                  Join Session
                </Button>

                {isJoinFormOpen && (
                  <div className="space-y-3 rounded-md border bg-muted/20 p-3">
                    <div className="space-y-2">
                      <Label htmlFor="joinSessionCode">Session Code</Label>
                      <Input
                        id="joinSessionCode"
                        type="text"
                        placeholder="Enter 6-character code"
                        value={joinSessionCode}
                        onChange={(event) =>
                          setJoinSessionCode(
                            event.target.value.toUpperCase().slice(0, 6)
                          )
                        }
                        maxLength={6}
                        className="text-center text-lg font-mono"
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center gap-1">
                        <Label htmlFor="joinEncryptionKey">Encryption Key</Label>
                        <InfoTip label="When a key is required">
                          Enter the host's 8-digit key, or leave blank for a code-only session.
                        </InfoTip>
                      </div>
                      <Input
                        id="joinEncryptionKey"
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        placeholder="8-digit key"
                        value={joinEncryptionKey}
                        onChange={(event) =>
                          setJoinEncryptionKey(
                            event.target.value.replace(/\D/g, "").slice(0, 8)
                          )
                        }
                        maxLength={8}
                        className="text-center text-lg font-mono tracking-widest"
                      />
                    </div>

                    {joinError && (
                      <ErrorDisplay
                        error={joinError}
                        onDismiss={() => setJoinError(null)}
                      />
                    )}

                    <Button
                      type="button"
                      onClick={handleJoinSession}
                      className="w-full"
                      disabled={
                        isLoading ||
                        joinSessionCode.trim().length !== 6
                      }
                    >
                      Join
                    </Button>
                  </div>
                )}

                <SessionExpiryCountdown expiresAt={sessionData.expiresAt} />
              </>
            ) : (
              <div className="text-center py-8">
                <p className="text-muted-foreground mb-4">Failed to create session</p>
                <Button onClick={handleNewSession} disabled={isLoading}>
                  Try Again
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Chat Section */}
        <Card
          className="relative flex flex-col"
          onDragEnter={handleAttachmentDragEnter}
          onDragOver={handleAttachmentDragOver}
          onDragLeave={handleAttachmentDragLeave}
          onDrop={handleAttachmentDrop}
        >
          {isDraggingAttachment && (
            <div className="absolute inset-0 z-20 flex items-center justify-center rounded-lg border-2 border-dashed border-primary bg-background/95 pointer-events-none">
              <div className="flex flex-col items-center gap-2 text-primary">
                <Upload className="h-8 w-8" />
                <p className="text-sm font-medium">Drop file to send</p>
              </div>
            </div>
          )}
          <CardHeader>
            <CardTitle>Chat</CardTitle>
            <CardDescription className="flex items-center gap-1">
              <span>
                {maxAttachmentSize > 0
                  ? `Files up to ${formatFileSize(maxAttachmentSize)}`
                  : "Uploads unavailable"}
              </span>
              <InfoTip label="About file limits">
                The file limit adjusts to available server storage and refreshes automatically.
              </InfoTip>
            </CardDescription>
          </CardHeader>

          <CardContent className="flex-1 flex flex-col space-y-4">
            <DeviceNameInput device={device} onRename={renameDevice} />
            {messageError && (
              <ErrorDisplay 
                error={messageError} 
                onDismiss={() => setMessageError(null)} 
              />
            )}

            <div className="flex-1 relative">
              <div
                ref={messagesContainerRef}
                onScroll={handleScroll}
                className="min-h-[300px] max-h-[400px] overflow-y-auto space-y-3 p-3 bg-muted/30 rounded-lg"
              >
                {messages.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                    No messages yet
                  </div>
                ) : (
                  messages.map((message) => (
                    <CollapsibleMessage
                      key={message.id}
                      message={message}
                      deviceId={device?.id}
                      copiedMessageId={copiedMessageId}
                      onCopy={copyToClipboard}
                      sessionId={sessionData?.sessionId ?? ""}
                      encryptionKey={encryptionKey}
                    />
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              {newMessagesCount > 0 && !isAtBottom && (
                <Button
                  size="sm"
                  onClick={scrollToBottom}
                  className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10"
                >
                  {newMessagesCount} new message{newMessagesCount > 1 ? "s" : ""}
                </Button>
              )}
            </div>

            <div className="flex gap-2">
              <input
                ref={attachmentInputRef}
                type="file"
                className="hidden"
                onChange={(event) => prepareAttachment(event.target.files?.[0] ?? null)}
              />

              <Button
                type="button"
                variant="outline"
                onClick={() => attachmentInputRef.current?.click()}
                disabled={!sessionData || !encryptionKey || isUploadingAttachment}
                size="lg"
                className="px-4"
              >
                {isUploadingAttachment ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Paperclip className="h-4 w-4" />
                )}
              </Button>

              {pendingAttachment ? (
                <div className="flex min-h-[60px] flex-1 items-center gap-3 rounded-md border bg-muted/30 px-3 py-2">
                  {pendingAttachment.type.startsWith("image/") && pendingAttachmentUrl ? (
                    <img
                      src={pendingAttachmentUrl}
                      alt="Attachment preview"
                      className="h-12 w-12 shrink-0 rounded object-cover"
                    />
                  ) : (
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-muted">
                      <FileIcon className="h-6 w-6 text-muted-foreground" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{pendingAttachment.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {isUploadingAttachment
                        ? `Uploading ${uploadProgress ?? 0}%`
                        : formatFileSize(pendingAttachment.size)}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      completedAttachmentRef.current = null
                      setPendingAttachment(null)
                    }}
                    disabled={isUploadingAttachment}
                    aria-label="Remove selected attachment"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <Textarea
                  placeholder="Type your message here..."
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onPaste={handleAttachmentPaste}
                  onKeyDown={(e) => {
                    if (e.nativeEvent.isComposing) return
                    if (e.repeat) return
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault()
                      void handleSend()
                    }
                  }}
                  className="flex-1 min-h-[60px] resize-none"
                  disabled={!sessionData || !encryptionKey}
                />
              )}

              <Button
                type="button"
                onClick={() => void handleSend()}
                disabled={
                  (!pendingAttachment && !newMessage.trim()) ||
                  !sessionData ||
                  !encryptionKey ||
                  isSending ||
                  isUploadingAttachment
                }
                size="lg"
                className="px-4"
              >
                {isSending || isUploadingAttachment ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
