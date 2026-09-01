"use client"

import { useState, useEffect, useRef, type ClipboardEvent, type DragEvent } from "react"
import { useSearchParams } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Smartphone, Monitor, Loader2, Send, Copy, Check, ArrowLeft, ChevronDown, ChevronUp, AlertCircle, Paperclip, Download, File as FileIcon, Upload, X } from "lucide-react"
import {
  decryptMessage,
  encryptMessage,
  getChatCryptoKey,
  getEncryptionKeyFromHash,
} from "@/lib/client-crypto"
import {
  loadEncryptedAttachmentBlob,
  saveEncryptedAttachment,
  uploadEncryptedFile,
} from "@/lib/client-file-transfer"

interface Message {
  id: string
  content: string
  sender_type: "desktop" | "mobile"
  created_at: string
}

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
const ALLOWED_ATTACHMENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/json",
  "application/zip",
  "application/x-zip-compressed",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/x-hwp",
  "application/haansofthwp",
  "application/vnd.hancom.hwp",
  "application/vnd.hancom.hwpx",
]
const ALLOWED_ATTACHMENT_EXTENSIONS = ["hwp", "hwpx"]
const ATTACHMENT_ACCEPT =
  "image/jpeg,image/png,image/webp,application/pdf,text/plain,text/csv,application/json,.zip,.docx,.xlsx,.pptx,.hwp,.hwpx"

function getFileExtension(fileName: string) {
  return fileName.split(".").pop()?.toLowerCase() ?? ""
}

function getAttachmentValidationError(file: File, maxAttachmentSize: number) {
  if (maxAttachmentSize <= 0) {
    return "Uploads are temporarily unavailable due to low server storage."
  }

  if (
    !ALLOWED_ATTACHMENT_TYPES.includes(file.type) &&
    !ALLOWED_ATTACHMENT_EXTENSIONS.includes(getFileExtension(file.name))
  ) {
    return "This file type is not supported."
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

const normalizeUtcIso = (s: string) =>
  s.replace(/(\.\d{3})\d+(Z|[+-]\d\d:\d\d)$/, "$1$2")

const formatMessageTime = (createdAt: string) => {
  const d = new Date(normalizeUtcIso(createdAt))
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
}

// 에러 표시 컴포넌트
function ErrorDisplay({ error, onDismiss }: { error: ErrorInfo; onDismiss?: () => void }) {
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 space-y-2">
      <div className="flex items-start gap-2">
        <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-destructive">{error.message}</p>
          
          {(error.details || error.code) && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-xs text-muted-foreground hover:text-foreground mt-1 flex items-center gap-1"
            >
              {isExpanded ? (
                <>
                  <ChevronUp className="h-3 w-3" />
                  상세 정보 숨기기
                </>
              ) : (
                <>
                  <ChevronDown className="h-3 w-3" />
                  상세 정보 보기
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

// 메시지 접기/펴기 컴포넌트
function CollapsibleMessage({ 
  message, 
  copiedMessageId, 
  onCopy,
  sessionId,
  encryptionKey,
}: { 
  message: Message
  copiedMessageId: string | null
  onCopy: (content: string, id: string) => void
  sessionId: string
  encryptionKey: CryptoKey | null
}) {
  const [isExpanded, setIsExpanded] = useState(false)
  const MAX_LENGTH = 200
  const attachment = parseAttachment(message.content)

  const shouldCollapse = message.content.length > MAX_LENGTH
  const displayContent = shouldCollapse && !isExpanded 
    ? message.content.slice(0, MAX_LENGTH) + "..."
    : message.content

  return (
    <div
      className={`flex ${
        message.sender_type === "mobile"
          ? "justify-end"
          : "justify-start"
      }`}
    >
      <div
        className={`max-w-[85%] p-3 rounded-lg relative group ${
          message.sender_type === "mobile"
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
                접기
              </>
            ) : (
              <>
                <ChevronDown className="h-3 w-3" />
                더보기
              </>
            )}
          </button>
        )}

        <div className="flex items-center justify-between mt-2 gap-2">
          <span className="text-xs opacity-70">
            {message.sender_type === "mobile" ? "You" : "Desktop"}
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

export default function MobilePage() {
  const searchParams = useSearchParams()
  const codeFromUrl = searchParams.get("code")

  const [sessionCode, setSessionCode] = useState(codeFromUrl || "")
  const [encryptionKeyInput, setEncryptionKeyInput] = useState("")
  const [isConnecting, setIsConnecting] = useState(false)
  const [sessionData, setSessionData] = useState<{
    sessionId: string
    sessionCode: string
    expiresAt: string
  } | null>(null)
  const [connectionError, setConnectionError] = useState<ErrorInfo | null>(null)
  const [messageError, setMessageError] = useState<ErrorInfo | null>(null)
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
  const [encryptionKey, setEncryptionKey] = useState<CryptoKey | null>(null)

  const [isAtBottom, setIsAtBottom] = useState(true)
  const [newMessagesCount, setNewMessagesCount] = useState(0)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const attachmentInputRef = useRef<HTMLInputElement>(null)
  const attachmentUploadRef = useRef(false)
  const attachmentDragDepthRef = useRef(0)
  const completedAttachmentRef = useRef<{
    file: File
    attachment: Attachment
  } | null>(null)

  const isAtBottomRef = useRef(true)
  useEffect(() => {
    isAtBottomRef.current = isAtBottom
  }, [isAtBottom])

  const messagesMetaRef = useRef<{ len: number; lastId: string | null }>({
    len: 0,
    lastId: null,
  })

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
    const container = messagesContainerRef.current
    if (!container) return
    const isBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight < 10
    setIsAtBottom(isBottom)
    if (isBottom) setNewMessagesCount(0)
  }

  useEffect(() => {
    if (!sessionData || !encryptionKey) return

    loadMessages(sessionData.sessionId)

    const interval = setInterval(() => {
      loadMessages(sessionData.sessionId)
    }, 2000)

    return () => clearInterval(interval)
  }, [sessionData, encryptionKey])

  useEffect(() => {
    if (messages.length === 0) return
    if (isAtBottom) {
      scrollToBottom()
    }
  }, [messages.length, isAtBottom])

  const connectToSession = async (code: string) => {
    if (!code.trim()) {
      setConnectionError({ message: "세션 코드를 입력해주세요." })
      return
    }

    const keyParam = getEncryptionKeyFromHash() || encryptionKeyInput.trim()
    if (!/^\d{8}$/.test(keyParam)) {
      setConnectionError({ message: "Enter the 8-digit encryption key." })
      return
    }

    setIsConnecting(true)
    setConnectionError(null)

    try {
      const response = await fetch(`/api/session?code=${code.trim().toUpperCase()}`)
      const data = await response.json()
      
      if (!response.ok) {
        setConnectionError({
          message: data.error || "세션 연결에 실패했습니다.",
          details: data.details,
          code: data.code,
        })
        return
      }
      
      const key = await getChatCryptoKey(data.sessionCode, keyParam)

      setSessionData(data)
      setEncryptionKey(key)
    } catch (error: any) {
      setConnectionError({
        message: "서버에 문제가 발생했습니다. 잠시 후 다시 시도해주세요.",
        details: error?.message,
      })
    } finally {
      setIsConnecting(false)
    }
  }

  const loadMessages = async (sessionId: string) => {
    if (!encryptionKey) return

    try {
      const response = await fetch(`/api/messages?sessionId=${sessionId}`)
      if (!response.ok) return
      const data = await response.json()
      const next: Message[] = await Promise.all(
        data.map(async (row: any) => ({
          id: row.ID,
          content: await decryptMessage(row.CONTENT, encryptionKey).catch(
            () => "[Unable to decrypt message]"
          ),
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

  const sendMessage = async () => {
    if (!newMessage.trim() || !sessionData || !encryptionKey || isSending) return
    setIsSending(true)
    setMessageError(null)

    try {
      const encryptedContent = await encryptMessage(newMessage.trim(), encryptionKey)

      const response = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: sessionData.sessionId,
          content: encryptedContent,
          senderType: "mobile",
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        setMessageError({
          message: data.error || "메시지 전송에 실패했습니다.",
          details: data.details,
          code: data.code,
        })
        return
      }

      setNewMessage("")
      loadMessages(sessionData.sessionId)
    } catch (error: any) {
      setMessageError({
        message: "메시지 전송에 실패했습니다. 다시 시도해주세요.",
        details: error?.message,
      })
    } finally {
      setIsSending(false)
    }
  }

  const sendAttachment = async (file: File | null): Promise<boolean> => {
    if (!file || !sessionData || !encryptionKey || attachmentUploadRef.current) return false

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
        JSON.stringify(attachment),
        encryptionKey
      )

      const messageResponse = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: sessionData.sessionId,
          content: encryptedContent,
          senderType: "mobile",
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

      completedAttachmentRef.current = null
      loadMessages(sessionData.sessionId)
      return true
    } catch (error: any) {
      setMessageError({
        message: "Failed to upload file.",
        details: error?.message,
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

  const disconnect = () => {
    setSessionData(null)
    setMessages([])
    setSessionCode("")
    setEncryptionKeyInput("")
    setEncryptionKey(null)
    setIsUploadingAttachment(false)
    setUploadProgress(null)
    setIsDraggingAttachment(false)
    setPendingAttachment(null)
    setConnectionError(null)
    setMessageError(null)
    setNewMessagesCount(0)
    setIsAtBottom(true)
    messagesMetaRef.current = { len: 0, lastId: null }
    attachmentUploadRef.current = false
    attachmentDragDepthRef.current = 0
    completedAttachmentRef.current = null
  }

  useEffect(() => {
    if (codeFromUrl) connectToSession(codeFromUrl)
  }, [codeFromUrl])

  useEffect(() => {
    const keyParam = getEncryptionKeyFromHash()
    if (keyParam) setEncryptionKeyInput(keyParam)
  }, [])

  if (sessionData) {
    return (
      <div className="min-h-screen bg-background p-4">
        <div
          className="relative w-full max-w-md mx-auto"
          onDragEnter={handleAttachmentDragEnter}
          onDragOver={handleAttachmentDragOver}
          onDragLeave={handleAttachmentDragLeave}
          onDrop={handleAttachmentDrop}
        >
          {isDraggingAttachment && (
            <div className="absolute inset-0 z-20 flex items-center justify-center border-2 border-dashed border-primary bg-background/95 pointer-events-none">
              <div className="flex flex-col items-center gap-2 text-primary">
                <Upload className="h-8 w-8" />
                <p className="text-sm font-medium">Drop file to send</p>
              </div>
            </div>
          )}
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={disconnect}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div>
                <h1 className="text-lg font-semibold">CtrlCV Mobile</h1>
                <p className="text-sm text-muted-foreground">
                  Session {sessionData.sessionCode}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 text-green-600">
              <div className="w-2 h-2 bg-green-600 rounded-full animate-pulse" />
              <span className="text-xs">Encrypted</span>
            </div>
          </div>

          {/* 메시지 에러 표시 */}
          {messageError && (
            <div className="mb-4">
              <ErrorDisplay 
                error={messageError} 
                onDismiss={() => setMessageError(null)} 
              />
            </div>
          )}

          {/* Messages */}
          <Card className="mb-4 relative">
            <CardContent className="p-3">
              <div
                ref={messagesContainerRef}
                className="h-[60vh] overflow-y-auto space-y-3 relative"
                onScroll={handleScroll}
              >
                {messages.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                    No messages yet. Start typing to share text!
                  </div>
                ) : (
                  messages.map((message) => (
                    <CollapsibleMessage
                      key={message.id}
                      message={message}
                      copiedMessageId={copiedMessageId}
                      onCopy={copyToClipboard}
                      sessionId={sessionData.sessionId}
                      encryptionKey={encryptionKey}
                    />
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* New Messages Button */}
              {newMessagesCount > 0 && !isAtBottom && (
                <Button
                  size="sm"
                  onClick={scrollToBottom}
                  className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10"
                >
                  {newMessagesCount} new message
                  {newMessagesCount > 1 ? "s" : ""}
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Input */}
          <p className="mb-2 text-xs text-muted-foreground">
            {maxAttachmentSize > 0
              ? `Current attachment limit: ${formatFileSize(maxAttachmentSize)}`
              : "Attachments are temporarily unavailable due to low server storage."}
          </p>
          <div className="flex gap-2">
            <input
              ref={attachmentInputRef}
              type="file"
              accept={ATTACHMENT_ACCEPT}
              className="hidden"
              onChange={(event) => prepareAttachment(event.target.files?.[0] ?? null)}
            />

            <Button
              type="button"
              variant="outline"
              onClick={() => attachmentInputRef.current?.click()}
              disabled={!encryptionKey || isUploadingAttachment}
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
                placeholder="Type your message..."
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onPaste={handleAttachmentPaste}
                onKeyDown={(e) => {
                  if (e.nativeEvent.isComposing) return
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault()
                    void handleSend()
                  }
                }}
                className="flex-1 min-h-[60px] resize-none"
                disabled={!encryptionKey}
              />
            )}
            <Button
              onClick={() => void handleSend()}
              disabled={
                (!pendingAttachment && !newMessage.trim()) ||
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
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-foreground mb-2">CtrlCV</h1>
          <p className="text-muted-foreground">Connect to your desktop session</p>
        </div>

        <Card>
          <CardHeader className="text-center">
            <CardTitle className="flex items-center justify-center gap-2">
              <Smartphone className="h-5 w-5" />
              Mobile Connection
            </CardTitle>
            <CardDescription>Enter the session code from your computer</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="sessionCode">Session Code</Label>
              <Input
                id="sessionCode"
                type="text"
                placeholder="Enter 6-digit code"
                value={sessionCode}
                onChange={(e) => setSessionCode(e.target.value.toUpperCase())}
                maxLength={6}
                className="text-center text-lg font-mono"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="encryptionKey">Encryption Key</Label>
              <Input
                id="encryptionKey"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="8-digit key"
                value={encryptionKeyInput}
                onChange={(e) =>
                  setEncryptionKeyInput(
                    e.target.value.replace(/\D/g, "").slice(0, 8)
                  )
                }
                maxLength={8}
                className="text-center text-lg font-mono tracking-widest"
              />
              <p className="text-xs text-muted-foreground text-center">
                This key decrypts messages in your browser and is never sent to the server.
              </p>
            </div>

            {connectionError && (
              <ErrorDisplay 
                error={connectionError} 
                onDismiss={() => setConnectionError(null)} 
              />
            )}

            <Button
              onClick={() => connectToSession(sessionCode)}
              className="w-full"
              disabled={isConnecting || !sessionCode.trim() || encryptionKeyInput.length !== 8}
            >
              {isConnecting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <Monitor className="h-4 w-4 mr-2" />
                  Connect to Desktop
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
