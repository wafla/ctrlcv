"use client"

import { useState, useEffect, useRef } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { QRCodeGenerator } from "@/components/qr-code-generator"
import { Loader2, Monitor, RefreshCw, Send, Copy, Check, ChevronDown, ChevronUp, AlertCircle, Paperclip, Download, File as FileIcon } from "lucide-react"
import {
  decryptFile,
  decryptMessage,
  encryptFile,
  encryptMessage,
  generateEncryptionKeyParam,
  getChatCryptoKey,
  getEncryptionKeyFromHash,
} from "@/lib/client-crypto"

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
}

const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024
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
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
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
        message.sender_type === "desktop" ? "justify-end" : "justify-start"
      }`}
    >
      <div
        className={`max-w-[80%] p-3 rounded-lg relative group ${
          message.sender_type === "desktop"
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
          <span className="text-xs opacity-70">
            {message.sender_type === "desktop" ? "You" : "Mobile"}
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

  useEffect(() => {
    if (!encryptionKey) return

    let objectUrl: string | null = null
    let cancelled = false

    async function loadImage() {
      try {
        const response = await fetch(
          `/api/files/${attachment.fileId}?sessionId=${sessionId}`
        )
        if (!response.ok) throw new Error("Failed to load image")

        const decrypted = await decryptFile(
          await response.arrayBuffer(),
          encryptionKey!,
          attachment.mimeType
        )
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
  }, [attachment.fileId, attachment.mimeType, encryptionKey, sessionId])

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

  if (attachment.type === "file") {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <FileIcon className="h-4 w-4 shrink-0" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{attachment.fileName}</p>
            <p className="text-xs opacity-70">{formatFileSize(attachment.size)}</p>
          </div>
        </div>
        <Button asChild size="sm" variant="secondary" className="w-full">
          <a href={fileUrl} download={attachment.fileName}>
            <Download className="h-4 w-4 mr-2" />
            Download
          </a>
        </Button>
      </div>
    )
  }

  return (
    <img
      src={fileUrl}
      alt={attachment.fileName || "Encrypted upload"}
      className="max-h-72 rounded-md object-contain"
    />
  )
}

export default function HomePage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const codeFromUrl = searchParams.get("code")

  const [sessionData, setSessionData] = useState<{
    sessionId: string
    sessionCode: string
  } | null>(null)

  const [isLoading, setIsLoading] = useState(false)
  const [qrUrl, setQrUrl] = useState("")
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState("")
  const [isSending, setIsSending] = useState(false)
  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false)
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null)
  const [isSessionCodeCopied, setIsSessionCodeCopied] = useState(false)
  const [isEncryptionKeyCopied, setIsEncryptionKeyCopied] = useState(false)
  const [encryptionKey, setEncryptionKey] = useState<CryptoKey | null>(null)
  const [encryptionKeyParam, setEncryptionKeyParam] = useState<string | null>(null)
  const [isJoinFormOpen, setIsJoinFormOpen] = useState(false)
  const [joinSessionCode, setJoinSessionCode] = useState("")
  const [joinEncryptionKey, setJoinEncryptionKey] = useState("")
  
  const [sessionError, setSessionError] = useState<ErrorInfo | null>(null)
  const [joinError, setJoinError] = useState<ErrorInfo | null>(null)
  const [messageError, setMessageError] = useState<ErrorInfo | null>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const attachmentInputRef = useRef<HTMLInputElement>(null)

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
    setCopiedMessageId(null)
    setIsSessionCodeCopied(false)
    setIsEncryptionKeyCopied(false)
    setEncryptionKey(null)
    setEncryptionKeyParam(null)
    setIsAtBottom(true)
    setNewMessagesCount(0)
    setMessageError(null)
    messagesMetaRef.current = { len: 0, lastId: null }
    sendingRef.current = false
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

  const connectToSession = async (
    code: string,
    keyParamOverride?: string | null,
    createFallback = true
  ) => {
    setIsLoading(true)
    setSessionError(null)
    setJoinError(null)
    resetChatState()

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

      setSessionData({
        sessionId: data.sessionId,
        sessionCode: data.sessionCode,
      })

      const keyParam = keyParamOverride || getEncryptionKeyFromHash()
      if (!keyParam || !/^\d{8}$/.test(keyParam)) {
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

      setEncryptionKeyParam(keyParam)
      setEncryptionKey(await getChatCryptoKey(data.sessionCode, keyParam))

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

  const createSession = async () => {
    setIsLoading(true)
    setSessionError(null)

    setSessionData(null)
    setQrUrl("")
    resetChatState()

    try {
      const response = await fetch("/api/session", { method: "POST" })
      const data = await response.json()
      
      if (!response.ok) {
        setSessionError({
          message: data.error || "Failed to create session.",
          details: data.details,
          code: data.code
        })
        return
      }

      setSessionData(data)

      const keyParam = generateEncryptionKeyParam()
      setEncryptionKeyParam(keyParam)
      setEncryptionKey(await getChatCryptoKey(data.sessionCode, keyParam))

      const baseUrl = window.location.origin
      setQrUrl(`${baseUrl}/mobile?code=${data.sessionCode}#key=${keyParam}`)

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
  }, [sessionData, encryptionKey])

  useEffect(() => {
    if (messages.length === 0) return
    if (isAtBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
      setNewMessagesCount(0)
    }
  }, [messages, isAtBottom])

  const sendMessage = async () => {
    const content = newMessage.trim()
    if (!content || !sessionData || !encryptionKey) return
    if (sendingRef.current) return

    sendingRef.current = true
    setIsSending(true)
    setMessageError(null)

    try {
      const encryptedContent = await encryptMessage(content, encryptionKey)

      const response = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: sessionData.sessionId,
          content: encryptedContent,
          senderType: "desktop",
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

  const sendAttachment = async (file: File | null) => {
    if (!file || !sessionData || !encryptionKey) return

    if (
      !ALLOWED_ATTACHMENT_TYPES.includes(file.type) &&
      !ALLOWED_ATTACHMENT_EXTENSIONS.includes(getFileExtension(file.name))
    ) {
      setMessageError({ message: "This file type is not supported." })
      return
    }

    if (file.size > MAX_ATTACHMENT_SIZE) {
      setMessageError({ message: "Files must be 10MB or smaller." })
      return
    }

    setIsUploadingAttachment(true)
    setMessageError(null)

    try {
      const encryptedFile = await encryptFile(file, encryptionKey)
      const formData = new FormData()
      formData.append("sessionId", sessionData.sessionId)
      formData.append("mimeType", file.type)
      formData.append("fileName", file.name)
      formData.append("file", encryptedFile, "image.bin")

      const uploadResponse = await fetch("/api/files", {
        method: "POST",
        body: formData,
      })
      const uploadData = await uploadResponse.json()

      if (!uploadResponse.ok) {
        setMessageError({
          message: uploadData.error || "Failed to upload image.",
          details: uploadData.details,
          code: uploadData.code,
        })
        return
      }

      const attachment: Attachment = {
        type: file.type.startsWith("image/") ? "image" : "file",
        fileId: uploadData.fileId,
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        size: file.size,
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
          senderType: "desktop",
        }),
      })
      const messageData = await messageResponse.json()

      if (!messageResponse.ok) {
        setMessageError({
          message: messageData.error || "Failed to send file.",
          details: messageData.details,
          code: messageData.code,
        })
        return
      }

      loadMessages(sessionData.sessionId)
    } catch (error: any) {
      setMessageError({
        message: "Failed to upload file.",
        details: error?.message || String(error),
      })
    } finally {
      setIsUploadingAttachment(false)
      if (attachmentInputRef.current) attachmentInputRef.current.value = ""
    }
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

  const copyEncryptionKey = async () => {
    if (!encryptionKeyParam) return

    try {
      await navigator.clipboard.writeText(encryptionKeyParam)
      setIsEncryptionKeyCopied(true)
      setTimeout(() => setIsEncryptionKeyCopied(false), 2000)
    } catch (error) {
      console.error("Failed to copy encryption key:", error)
    }
  }

  const copySessionCode = async () => {
    if (!sessionData?.sessionCode) return

    try {
      await navigator.clipboard.writeText(sessionData.sessionCode)
      setIsSessionCodeCopied(true)
      setTimeout(() => setIsSessionCodeCopied(false), 2000)
    } catch (error) {
      console.error("Failed to copy session code:", error)
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

    if (!code || key.length !== 8) {
      setJoinError({
        message: "Enter a session code and 8-digit encryption key.",
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
            <CardDescription>Scan QR code with your phone to connect</CardDescription>
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
                  <div className="flex items-center gap-2">
                    <div className="h-9 w-9 shrink-0" aria-hidden="true" />
                    <p className="flex-1 rounded-md border bg-muted/40 px-3 py-2 text-center font-mono text-xl font-bold text-primary tracking-wider">
                      {sessionData.sessionCode}
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={copySessionCode}
                    >
                      {isSessionCodeCopied ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>

                {encryptionKeyParam && (
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground text-center">
                      Encryption Key
                    </p>
                    <div className="flex items-center gap-2">
                      <div className="h-9 w-9 shrink-0" aria-hidden="true" />
                      <p className="flex-1 rounded-md border bg-muted/40 px-3 py-2 text-center font-mono text-lg font-semibold tracking-widest">
                        {encryptionKeyParam}
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={copyEncryptionKey}
                      >
                        {isEncryptionKeyCopied ? (
                          <Check className="h-4 w-4" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground text-center">
                      Use this 8-digit key only for manual connection. It is not sent to the server.
                    </p>
                  </div>
                )}

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
                        placeholder="Enter 6-digit code"
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
                      <Label htmlFor="joinEncryptionKey">Encryption Key</Label>
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
                      <p className="text-xs text-muted-foreground text-center">
                        Enter both values shown on the host screen.
                      </p>
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
                        !joinSessionCode.trim() ||
                        joinEncryptionKey.length !== 8
                      }
                    >
                      Join
                    </Button>
                  </div>
                )}

                <div className="text-center space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Messages are encrypted in your browser and deleted after 2 hours.
                  </p>
                </div>

                <div className="text-center space-y-2">
                  <p className="text-xs text-muted-foreground">
                    For your security, please do not include any sensitive or personal information in this message.
                  </p>
                </div>
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
        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle>Text Sharing</CardTitle>
            <CardDescription>Share text instantly between your devices</CardDescription>
          </CardHeader>

          <CardContent className="flex-1 flex flex-col space-y-4">
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
                    No messages yet. Start typing to share text!
                  </div>
                ) : (
                  messages.map((message) => (
                    <CollapsibleMessage
                      key={message.id}
                      message={message}
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
                accept={ATTACHMENT_ACCEPT}
                className="hidden"
                onChange={(event) => sendAttachment(event.target.files?.[0] ?? null)}
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

              <Textarea
                placeholder="Type your message here..."
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.nativeEvent.isComposing) return
                  if (e.repeat) return
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault()
                    sendMessage()
                  }
                }}
                className="flex-1 min-h-[60px] resize-none"
                disabled={!sessionData || !encryptionKey}
              />

              <Button
                type="button"
                onClick={sendMessage}
                disabled={!newMessage.trim() || !sessionData || !encryptionKey || isSending}
                size="lg"
                className="px-4"
              >
                {isSending ? (
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
