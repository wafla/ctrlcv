import { useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

import { Monitor, Smartphone, RefreshCw, Send } from "lucide-react"
import './App.css'

function App() {
  const [sessionData, setSessionData] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [qrUrl, setQrUrl] = useState("")
  const [messages, setMessages] = useState([])
  const [newMessage, setNewMessage] = useState("")
  const [isSending, setIsSending] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const [copiedMessageId, setCopiedMessageId] = useState(null)
  const messagesEndRef = useRef(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

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
            {/* QR 이미지 자리 */}
            <div className="flex justify-center py-10 bg-muted/20 rounded-lg">
              QR CODE AREA
            </div>

            <div className="text-center space-y-2">
              <p className="text-sm text-muted-foreground">Session Code</p>
              <p className="text-xl font-mono font-bold text-primary">123456</p>
            </div>

            <div className="flex items-center justify-center gap-2 text-sm">
              <Smartphone className="h-4 w-4" />
              <span className="text-muted-foreground">Waiting for mobile device...</span>
            </div>

            <Button className="w-full bg-transparent">
              <RefreshCw className="h-4 w-4 mr-2" />
              New Session
            </Button>

            <div className="text-center space-y-2">
              <p className="text-sm text-muted-foreground">Messages are deleted after 24 hours.</p>
            </div>
          </CardContent>
        </Card>

        {/* Chat Section */}
        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle>Text Sharing</CardTitle>
            <CardDescription>Share text instantly between your devices</CardDescription>
          </CardHeader>

          <CardContent className="flex-1 flex flex-col space-y-4">

            {/* Messages */}
            <div className="flex-1 min-h-[300px] max-h-[400px] overflow-y-auto space-y-3 p-3 bg-muted/30 rounded-lg">
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                No messages yet. Start typing to share text!
              </div>
            </div>

            {/* Input */}
            <div className="flex gap-2">
              <Textarea
                placeholder="Type your message here..."
                className="flex-1 min-h-[60px] resize-none"
              />

              <Button size="lg" className="px-4">
                <Send className="h-4 w-4" />
              </Button>
            </div>

          </CardContent>
        </Card>

      </div>
    </div>
  )
}

export default App
