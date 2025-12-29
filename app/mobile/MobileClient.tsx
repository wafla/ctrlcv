"use client"

import { useState, useEffect, useRef } from "react"
import { useSearchParams } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Smartphone, Monitor, Loader2, Send, Copy, Check, ArrowLeft, ChevronDown, ChevronUp, AlertCircle } from "lucide-react"

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

export default function MobilePage() {
  const searchParams = useSearchParams()
  const codeFromUrl = searchParams.get("code")

  const [sessionCode, setSessionCode] = useState(codeFromUrl || "")
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
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null)

  const [isAtBottom, setIsAtBottom] = useState(true)
  const [newMessagesCount, setNewMessagesCount] = useState(0)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)

  const isAtBottomRef = useRef(true)
  useEffect(() => {
    isAtBottomRef.current = isAtBottom
  }, [isAtBottom])

  const messagesMetaRef = useRef<{ len: number; lastId: string | null }>({
    len: 0,
    lastId: null,
  })

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
    if (!sessionData) return

    loadMessages(sessionData.sessionId)

    const interval = setInterval(() => {
      loadMessages(sessionData.sessionId)
    }, 2000)

    return () => clearInterval(interval)
  }, [sessionData])

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
      
      setSessionData(data)
      await loadMessages(data.sessionId)
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
    try {
      const response = await fetch(`/api/messages?sessionId=${sessionId}`)
      if (!response.ok) return
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

  const sendMessage = async () => {
    if (!newMessage.trim() || !sessionData || isSending) return
    setIsSending(true)
    setMessageError(null)

    try {
      const response = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: sessionData.sessionId,
          content: newMessage,
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
    setConnectionError(null)
    setMessageError(null)
    setNewMessagesCount(0)
    setIsAtBottom(true)
    messagesMetaRef.current = { len: 0, lastId: null }
  }

  useEffect(() => {
    if (codeFromUrl) connectToSession(codeFromUrl)
  }, [codeFromUrl])

  if (sessionData) {
    return (
      <div className="min-h-screen bg-background p-4">
        <div className="w-full max-w-md mx-auto">
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
              <span className="text-xs">Connected</span>
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
          <div className="flex gap-2">
            <Textarea
              placeholder="Type your message..."
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  sendMessage()
                }
              }}
              className="flex-1 min-h-[60px] resize-none"
            />
            <Button
              onClick={sendMessage}
              disabled={!newMessage.trim() || isSending}
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

            {connectionError && (
              <ErrorDisplay 
                error={connectionError} 
                onDismiss={() => setConnectionError(null)} 
              />
            )}

            <Button
              onClick={() => connectToSession(sessionCode)}
              className="w-full"
              disabled={isConnecting || !sessionCode.trim()}
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