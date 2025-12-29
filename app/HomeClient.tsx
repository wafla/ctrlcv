"use client"

import { useState, useEffect, useRef } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { QRCodeGenerator } from "@/components/qr-code-generator"
import { Loader2, Monitor, RefreshCw, Send, Copy, Check, ChevronDown, ChevronUp, AlertCircle } from "lucide-react"

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
  onCopy 
}: { 
  message: Message
  copiedMessageId: string | null
  onCopy: (content: string, id: string) => void
}) {
  const [isExpanded, setIsExpanded] = useState(false)
  const MAX_LENGTH = 200

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
        <p className="text-sm whitespace-pre-wrap break-words">
          {displayContent}
        </p>
        
        {shouldCollapse && (
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
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null)
  
  const [sessionError, setSessionError] = useState<ErrorInfo | null>(null)
  const [messageError, setMessageError] = useState<ErrorInfo | null>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)

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
    setCopiedMessageId(null)
    setIsAtBottom(true)
    setNewMessagesCount(0)
    setMessageError(null)
    messagesMetaRef.current = { len: 0, lastId: null }
    sendingRef.current = false
  }

  const updateUrl = (code: string | null) => {
    if (code) {
      router.replace(`?code=${code}`, { scroll: false })
    } else {
      router.replace("/", { scroll: false })
    }
  }

  const loadMessages = async (sessionId: string) => {
    try {
      const response = await fetch(`/api/messages?sessionId=${sessionId}`)
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        console.error("Error loading messages:", errorData)
        return
      }
      
      const data = await response.json()
      const next: Message[] = data.map((row: any) => ({
        id: row.ID,
        content: row.CONTENT,
        sender_type: row.SENDER_TYPE.toLowerCase(),
        created_at: row.CREATED_AT,
      }))

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
      console.error("Error loading messages:", error)
    }
  }

  const connectToSession = async (code: string) => {
    setIsLoading(true)
    setSessionError(null)
    resetChatState()

    try {
      const response = await fetch(`/api/session?code=${code.trim().toUpperCase()}`)
      const data = await response.json()

      if (!response.ok) {
        setSessionError({
          message: data.error || "Session not found.",
          details: data.details,
          code: data.code,
        })
        updateUrl(null)
        await createSession()
        return
      }

      setSessionData({
        sessionId: data.sessionId,
        sessionCode: data.sessionCode,
      })

      const baseUrl = window.location.origin
      setQrUrl(`${baseUrl}/mobile?code=${data.sessionCode}`)
    } catch (error: any) {
      setSessionError({
        message: "Server error. Please try again later.",
        details: error?.message,
      })
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

      const baseUrl = window.location.origin
      setQrUrl(`${baseUrl}/mobile?code=${data.sessionCode}`)

      updateUrl(data.sessionCode)
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
  }, [sessionData])

  useEffect(() => {
    if (messages.length === 0) return
    if (isAtBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
      setNewMessagesCount(0)
    }
  }, [messages, isAtBottom])

  const sendMessage = async () => {
    const content = newMessage.trim()
    if (!content || !sessionData) return
    if (sendingRef.current) return

    sendingRef.current = true
    setIsSending(true)
    setMessageError(null)

    try {
      const response = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: sessionData.sessionId,
          content,
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

  const copyToClipboard = async (content: string, messageId: string) => {
    try {
      await navigator.clipboard.writeText(content)
      setCopiedMessageId(messageId)
      setTimeout(() => setCopiedMessageId(null), 2000)
    } catch (error) {
      console.error("Failed to copy:", error)
    }
  }

  const handleNewSession = async () => {
    updateUrl(null)
    await createSession()
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
                  <p className="text-xl font-mono font-bold text-primary">
                    {sessionData.sessionCode}
                  </p>
                </div>

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

                <div className="text-center space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Messages are deleted after 2 hours.
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
                disabled={!sessionData}
              />

              <Button
                type="button"
                onClick={sendMessage}
                disabled={!newMessage.trim() || !sessionData || isSending}
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