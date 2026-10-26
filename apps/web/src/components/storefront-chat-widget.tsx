"use client";

import { useState, useRef, useEffect, useCallback } from "react";

interface ChatMessage {
  id: string;
  role: "visitor" | "ai" | "seller";
  content: string;
  created_at: string;
  metadata?: any;
}

interface SuggestedProduct {
  title: string;
  price: string;
  slug: string;
}

interface StorefrontChatWidgetProps {
  sellerProfileId: string;
  storeName: string;
  storeAvatar?: string;
  accentColor?: string;
}

export default function StorefrontChatWidget({
  sellerProfileId,
  storeName,
  storeAvatar,
  accentColor = "#004bfc",
}: StorefrontChatWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [sending, setSending] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const visitorSessionIdRef = useRef<string>("");
  const [suggestedProducts, setSuggestedProducts] = useState<SuggestedProduct[]>([]);
  const [showLeadCapture, setShowLeadCapture] = useState(false);
  const [visitorName, setVisitorName] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Real-time SSE listener for live seller interventions & replies
  useEffect(() => {
    if (!sessionId || !accessToken || typeof window === "undefined" || !window.EventSource) return;

    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource(`/api/v1/storefront/chat/session/${sessionId}/stream?accessToken=${encodeURIComponent(accessToken)}`);
      eventSource.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.eventType === "seller_message" && payload.payload) {
            setMessages((prev) => {
              if (prev.some((m) => m.id === payload.payload.id)) return prev;
              return [...prev, payload.payload];
            });
          }
        } catch {}
      };
    } catch {}

    return () => {
      eventSource?.close();
    };
  }, [sessionId, accessToken]);

  const initSession = async () => {
    try {
      if (!visitorSessionIdRef.current) {
        const storageKey = `puvo-chat-visitor:${sellerProfileId}`;
        const stored = window.sessionStorage.getItem(storageKey);
        const visitorSessionId = stored && /^[0-9a-f-]{36}$/i.test(stored) ? stored : crypto.randomUUID();
        visitorSessionIdRef.current = visitorSessionId;
        window.sessionStorage.setItem(storageKey, visitorSessionId);
      }
      const res = await fetch("/api/v1/storefront/chat/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sellerProfileId,
          visitorSessionId: visitorSessionIdRef.current,
          visitorName: visitorName || undefined,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setSessionId(data.session.id);
        setAccessToken(data.accessToken);
        if (data.messages?.length) {
          setMessages(data.messages);
        } else {
          // Add welcome message
          setMessages([
            {
              id: "welcome",
              role: "ai",
              content: `Olá! 👋 Bem-vindo(a) à ${storeName}. Como posso ajudá-lo(a) hoje? Pode perguntar sobre os nossos produtos, preços, entregas e formas de pagamento!`,
              created_at: new Date().toISOString(),
            },
          ]);
        }
      }
    } catch {
      setMessages([
        {
          id: "offline",
          role: "ai",
          content: `Olá! 👋 Bem-vindo(a) à ${storeName}. A nossa equipa está disponível para ajudá-lo(a). Envie a sua mensagem!`,
          created_at: new Date().toISOString(),
        },
      ]);
    }
  };

  const handleOpen = () => {
    setIsOpen(true);
    if (!sessionId) initSession();
  };

  const sendMessage = async () => {
    const text = inputValue.trim();
    if (!text || sending || !sessionId || !accessToken) return;

    // Add visitor message immediately
    const tempMsg: ChatMessage = {
      id: `temp_${Date.now()}`,
      role: "visitor",
      content: text,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempMsg]);
    setInputValue("");
    setSending(true);

    try {
      const res = await fetch(`/api/v1/storefront/chat/session/${sessionId}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          sellerProfileId,
          accessToken,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        // Add AI reply
        setMessages((prev) => [
          ...prev,
          {
            id: data.aiReply?.id || `ai_${Date.now()}`,
            role: "ai",
            content: data.aiReply?.content || "Obrigado pela mensagem! A equipa vai responder em breve.",
            created_at: data.aiReply?.created_at || new Date().toISOString(),
          },
        ]);

        if (data.suggestedProducts?.length) {
          setSuggestedProducts(data.suggestedProducts);
        }

        if (data.shouldConvertToLead) {
          setShowLeadCapture(true);
        }
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: `err_${Date.now()}`,
            role: "ai",
            content: "Desculpe, ocorreu um erro. Tente novamente em instantes!",
            created_at: new Date().toISOString(),
          },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `err_${Date.now()}`,
          role: "ai",
          content: "A conexão falhou. Verifique a sua internet e tente novamente.",
          created_at: new Date().toISOString(),
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <>
      {/* Floating Chat Button */}
      {!isOpen && (
        <button
          className="storefront-chat-fab"
          onClick={handleOpen}
          style={{ "--chat-accent": accentColor } as React.CSSProperties}
          aria-label="Abrir chat"
        >
          <span className="chat-fab-icon">💬</span>
          <span className="chat-fab-pulse" />
        </button>
      )}

      {/* Chat Window */}
      {isOpen && (
        <div className="storefront-chat-window" style={{ "--chat-accent": accentColor } as React.CSSProperties}>
          {/* Header */}
          <div className="storefront-chat-header">
            <div className="storefront-chat-header-info">
              <div className="storefront-chat-avatar">
                {storeAvatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={storeAvatar} alt={storeName} />
                ) : (
                  <span>{storeName.charAt(0).toUpperCase()}</span>
                )}
                <span className="storefront-chat-online" />
              </div>
              <div>
                <h4>{storeName}</h4>
                <span className="storefront-chat-status">🟢 Assistente Online</span>
              </div>
            </div>
            <button className="storefront-chat-close" onClick={() => setIsOpen(false)}>✕</button>
          </div>

          {/* Messages */}
          <div className="storefront-chat-messages">
            {messages.map((msg) => (
              <div key={msg.id} className={`storefront-chat-msg ${msg.role}`}>
                <div className="storefront-chat-bubble">
                  {msg.content}
                </div>
                <span className="storefront-chat-time">
                  {new Date(msg.created_at).toLocaleTimeString("pt-AO", { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            ))}

            {sending && (
              <div className="storefront-chat-msg ai">
                <div className="storefront-chat-bubble typing">
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                </div>
              </div>
            )}

            {/* Suggested Products */}
            {suggestedProducts.length > 0 && (
              <div className="storefront-chat-products">
                <span className="storefront-chat-products-label">Produtos Sugeridos:</span>
                {suggestedProducts.map((product, i) => (
                  <a key={i} href={`/produtos/${product.slug}`} className="storefront-chat-product-card">
                    <span className="storefront-product-title">{product.title}</span>
                    <span className="storefront-product-price">{Number(product.price).toLocaleString("pt-AO")} Kz</span>
                  </a>
                ))}
              </div>
            )}

            {/* Lead Capture */}
            {showLeadCapture && (
              <div className="storefront-chat-lead-capture">
                <div className="storefront-chat-bubble ai">
                  <p>📋 Parece que tem interesse! Deixe o seu nome para que a equipa possa acompanhá-lo(a) melhor:</p>
                  <input
                    type="text"
                    placeholder="O seu nome..."
                    value={visitorName}
                    onChange={(e) => setVisitorName(e.target.value)}
                    className="storefront-lead-input"
                  />
                  <button
                    className="storefront-lead-btn"
                    onClick={() => {
                      setShowLeadCapture(false);
                      setMessages((prev) => [
                        ...prev,
                        {
                          id: `lead_${Date.now()}`,
                          role: "ai",
                          content: `Obrigado, ${visitorName || "visitante"}! A equipa de vendas vai contactá-lo(a) em breve. 🎉`,
                          created_at: new Date().toISOString(),
                        },
                      ]);
                    }}
                  >
                    Enviar
                  </button>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="storefront-chat-input-area">
            <input
              type="text"
              placeholder="Escreva a sua mensagem..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={sending}
              className="storefront-chat-input"
            />
            <button
              className="storefront-chat-send"
              onClick={sendMessage}
              disabled={!inputValue.trim() || sending}
            >
              ➤
            </button>
          </div>

          {/* Footer */}
          <div className="storefront-chat-footer">
            Powered by <strong>PUVO</strong> · Assistente com IA
          </div>
        </div>
      )}
    </>
  );
}
