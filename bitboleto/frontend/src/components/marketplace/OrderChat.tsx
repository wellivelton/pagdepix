import { useState, useEffect, useRef } from 'react';
import api from '../../services/api';
import { MessageCircle, Send, Paperclip, Download } from 'lucide-react';

interface ChatMessage {
  id: string;
  orderId: string;
  senderId: string;
  sender: { id: string; name: string | null };
  messageType: string;
  content: string | null;
  attachmentPath?: string | null;
  attachmentName?: string | null;
  attachmentSize?: number | null;
  isFromAdmin: boolean;
  adminIntervention: boolean;
  createdAt: string;
}

interface OrderChatProps {
  orderId: string;
  currentUserId: string;
  isBuyer: boolean;
  isSeller: boolean;
  isAdmin?: boolean;
}

export default function OrderChat({ orderId, currentUserId, isBuyer, isSeller }: OrderChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getApiBaseUrl = () => {
    const base = api.defaults.baseURL || '';
    return base.endsWith('/api') ? base : `${base.replace(/\/$/, '')}/api`;
  };

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });

  const fetchMessages = () => {
    setLoading(true);
    setError(null);
    api
      .get(`/marketplace/order/${orderId}/chat`)
      .then(({ data }) => setMessages(data.messages || []))
      .catch(() => setError('Não foi possível carregar as mensagens.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!orderId) return;
    fetchMessages();
  }, [orderId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = newMessage.trim();
    if (!text || sending) return;

    setSending(true);
    setError(null);
    try {
      const { data } = await api.post(`/marketplace/order/${orderId}/chat`, {
        content: text,
        adminIntervention: false,
      });
      setMessages((prev) => [...prev, data.message]);
      setNewMessage('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao enviar mensagem.');
    } finally {
      setSending(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || uploading) return;
    if (file.size > 20 * 1024 * 1024) {
      setError('Arquivo muito grande. Máximo 20MB.');
      return;
    }

    setUploading(true);
    setError(null);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const { data } = await api.post(`/marketplace/order/${orderId}/chat/attachment`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setMessages((prev) => [...prev, data.message]);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao enviar anexo.');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleDownloadAttachment = async (messageId: string, fileName: string) => {
    try {
      const token = localStorage.getItem('token');
      const url = `${getApiBaseUrl()}/marketplace/chat/attachment/${messageId}`;
      const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error('Falha no download');
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = fileName || 'anexo';
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      setError('Erro ao baixar anexo.');
    }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 86400000) return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  const isOwnMessage = (msg: ChatMessage) => msg.senderId === currentUserId;

  if (loading) {
    return (
      <div className="rounded-xl border border-gray-700/50 bg-gray-800/50 p-6">
        <div className="flex items-center gap-2 text-gray-400 mb-4">
          <MessageCircle className="w-5 h-5" />
          <span>Conversa com o vendedor</span>
        </div>
        <div className="animate-pulse h-48 bg-gray-700/50 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-700/50 bg-gray-800/50 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-700/50 bg-gray-900/30">
        <MessageCircle className="w-5 h-5 text-bitcoin" />
        <span className="font-medium text-white">Conversa sobre este pedido</span>
        {(isBuyer || isSeller) && (
          <span className="text-gray-500 text-sm ml-1">
            {isBuyer ? '(com o vendedor)' : '(com o comprador)'}
          </span>
        )}
      </div>

      <div className="h-64 overflow-y-auto p-4 space-y-3">
        {error && (
          <div className="text-red-400 text-sm bg-red-500/10 rounded-lg px-3 py-2">{error}</div>
        )}
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500 text-sm">
            <MessageCircle className="w-12 h-12 mb-2 opacity-50" />
            <p>Nenhuma mensagem ainda.</p>
            <p className="mt-1">Envie uma mensagem para iniciar a conversa.</p>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${isOwnMessage(msg) ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-lg px-3 py-2 ${
                  isOwnMessage(msg)
                    ? 'bg-bitcoin/20 text-bitcoin border border-bitcoin/30'
                    : msg.adminIntervention
                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                    : 'bg-gray-700/50 text-gray-200 border border-gray-600/50'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-medium opacity-80">
                    {msg.sender.name || 'Usuário'}
                    {msg.isFromAdmin && (
                      <span className="ml-1 text-amber-400">(Admin)</span>
                    )}
                  </span>
                  <span className="text-xs opacity-60">{formatDate(msg.createdAt)}</span>
                </div>
                {msg.messageType === 'ATTACHMENT' ? (
                  <button
                    type="button"
                    onClick={() => handleDownloadAttachment(msg.id, msg.attachmentName || 'anexo')}
                    className="inline-flex items-center gap-2 text-sm hover:underline"
                  >
                    <Download className="w-4 h-4" />
                    {msg.attachmentName || 'Anexo'}
                  </button>
                ) : (
                  <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                )}
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSend} className="p-4 border-t border-gray-700/50 bg-gray-900/30">
        <div className="flex gap-2">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="p-2 rounded-lg bg-gray-700/50 hover:bg-gray-600/50 text-gray-400 disabled:opacity-50 transition"
            title="Enviar anexo (máx. 20MB)"
          >
            <Paperclip className="w-5 h-5" />
          </button>
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Digite sua mensagem..."
            className="flex-1 px-4 py-2 rounded-lg bg-gray-800 border border-gray-600 text-white placeholder-gray-500 focus:border-bitcoin/50 focus:ring-1 focus:ring-bitcoin/30 transition"
            disabled={sending || uploading}
          />
          <button
            type="submit"
            disabled={sending || uploading || !newMessage.trim()}
            className="px-4 py-2 rounded-lg bg-bitcoin text-black font-semibold hover:bg-bitcoin/90 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center gap-2"
          >
            <Send className="w-5 h-5" />
            {sending ? '...' : 'Enviar'}
          </button>
        </div>
      </form>
    </div>
  );
}
