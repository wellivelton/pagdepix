import { useState, useEffect, useRef } from 'react';
import {
  MessageCircle,
  Send,
  Clock,
  CheckCircle2,
  AlertCircle,
  Info,
  MessageSquare,
  Plus,
  Loader2,
  ChevronRight,
} from 'lucide-react';
import api from '../services/api';

const SUPPORT_TELEGRAM = '@PagDepixBot';
const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bitcoin/50 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900';

type Ticket = {
  id: string;
  status: string;
  priority: string | null;
  createdAt: string;
  updatedAt: string;
  lastMessage: { content: string; createdAt: string } | null;
};

type Message = {
  id: string;
  ticketId: string;
  senderId: string;
  isStaff: boolean;
  content: string;
  createdAt: string;
};

const statusLabel: Record<string, string> = {
  OPEN: 'Aberto',
  IN_PROGRESS: 'Em andamento',
  RESOLVED: 'Resolvido',
};

export default function Support() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [ticketStatus, setTicketStatus] = useState<string | null>(null);
  const [loadingTickets, setLoadingTickets] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [messageInput, setMessageInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadTickets = () => {
    setLoadingTickets(true);
    api
      .get<{ tickets: Ticket[] }>('/support/tickets')
      .then(({ data }) => setTickets(data.tickets ?? []))
      .catch(() => setTickets([]))
      .finally(() => setLoadingTickets(false));
  };

  const loadMessages = (ticketId: string) => {
    setLoadingMessages(true);
    api
      .get<{ ticket: { id: string; status: string }; messages: Message[] }>(`/support/tickets/${ticketId}/messages`)
      .then(({ data }) => {
        setMessages(data.messages ?? []);
        setTicketStatus(data.ticket?.status ?? null);
      })
      .catch(() => setMessages([]))
      .finally(() => setLoadingMessages(false));
  };

  useEffect(() => {
    loadTickets();
  }, []);

  useEffect(() => {
    if (selectedTicketId) {
      loadMessages(selectedTicketId);
      pollRef.current = setInterval(() => loadMessages(selectedTicketId), 8000);
      return () => {
        if (pollRef.current) clearInterval(pollRef.current);
      };
    }
  }, [selectedTicketId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleCreateTicket = () => {
    setSending(true);
    setError(null);
    api
      .post<{ ticket: { id: string } }>('/support/tickets')
      .then(({ data }) => {
        const id = data?.ticket?.id;
        if (id) {
          loadTickets();
          setSelectedTicketId(id);
        } else {
          setError('Resposta inválida do servidor. Tente novamente.');
        }
      })
      .catch((err) => {
        const msg = err?.response?.data?.error ?? err?.response?.data?.message ?? err?.message ?? 'Erro ao criar conversa';
        setError(typeof msg === 'string' ? msg : 'Erro ao criar conversa. Verifique se está logado.');
      })
      .finally(() => setSending(false));
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicketId || !messageInput.trim() || sending) return;
    const text = messageInput.trim();
    setMessageInput('');
    setSending(true);
    setError(null);
    api
      .post<{ message: Message }>(`/support/tickets/${selectedTicketId}/messages`, { content: text })
      .then(({ data }) => {
        setMessages((prev) => [...prev, data.message]);
        loadTickets();
      })
      .catch((err) => {
        setError(err?.response?.data?.error || 'Erro ao enviar');
        setMessageInput(text);
      })
      .finally(() => setSending(false));
  };

  const formatDate = (s: string) => {
    const d = new Date(s);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) {
      return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="bg-gradient-to-br from-gray-800/50 to-gray-800/30 backdrop-blur-xl rounded-2xl p-8 border border-gray-700/50 mb-6">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/20">
            <MessageCircle className="w-8 h-8 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-white">Suporte</h1>
            <p className="text-gray-400">Chat na plataforma ou contato pelo Telegram</p>
          </div>
        </div>
      </div>

      {/* Chat na plataforma */}
      <div className="bg-gradient-to-br from-gray-800/50 to-gray-800/30 backdrop-blur-xl rounded-2xl border border-gray-700/50 mb-6 overflow-hidden">
        <div className="p-4 border-b border-gray-700/50 flex items-center justify-between">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-blue-400" />
            Chat com o PagDepix
          </h2>
          {!selectedTicketId && (
            <button
              type="button"
              onClick={handleCreateTicket}
              disabled={sending}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-medium text-sm ${focusRing} disabled:opacity-50`}
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Iniciar conversa
            </button>
          )}
        </div>

        {/* Erro visível sempre (ex.: falha ao criar conversa ou ao enviar) */}
        {error && (
          <div className="mx-4 mt-3 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm flex items-center justify-between gap-2">
            <span>{error}</span>
            <button type="button" onClick={() => setError(null)} className="text-red-400 hover:text-white font-medium" aria-label="Fechar">
              ×
            </button>
          </div>
        )}

        <div className="flex flex-col md:flex-row min-h-[320px]">
          {/* Lista de tickets */}
          <div className="w-full md:w-64 border-b md:border-b-0 md:border-r border-gray-700/50 flex-shrink-0">
            {loadingTickets ? (
              <div className="p-4 flex items-center justify-center text-gray-400">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
            ) : tickets.length === 0 ? (
              <div className="p-4 text-center text-gray-500 text-sm">
                Nenhuma conversa ainda. Clique em &quot;Iniciar conversa&quot; para abrir um chat.
              </div>
            ) : (
              <ul className="divide-y divide-gray-700/50">
                {tickets.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedTicketId(t.id)}
                      className={`w-full text-left p-3 flex items-center gap-2 transition-colors ${focusRing} ${
                        selectedTicketId === t.id ? 'bg-blue-500/20 text-white' : 'hover:bg-gray-700/30 text-gray-300'
                      }`}
                    >
                      <span className="flex-1 min-w-0 truncate text-sm">
                        {t.lastMessage?.content || 'Conversa iniciada'}
                      </span>
                      <ChevronRight className="w-4 h-4 flex-shrink-0" />
                    </button>
                    <div className="px-3 pb-1 flex items-center justify-between text-xs text-gray-500">
                      <span>{statusLabel[t.status] || t.status}</span>
                      <span>{formatDate(t.updatedAt)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Área de mensagens */}
          <div className="flex-1 flex flex-col min-h-[280px]">
            {selectedTicketId ? (
              <>
                <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[200px]">
                  {loadingMessages ? (
                    <div className="flex justify-center py-8">
                      <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                    </div>
                  ) : (
                    messages.map((m) => (
                      <div
                        key={m.id}
                        className={`flex ${m.isStaff ? 'justify-start' : 'justify-end'}`}
                      >
                        <div
                          className={`max-w-[85%] rounded-xl px-4 py-2 ${
                            m.isStaff
                              ? 'bg-gray-700/50 text-gray-100'
                              : 'bg-blue-500/90 text-white'
                          }`}
                        >
                          {m.isStaff && (
                            <p className="text-xs text-blue-300 mb-0.5">PagDepix</p>
                          )}
                          <p className="text-sm whitespace-pre-wrap break-words">{m.content}</p>
                          <p className={`text-xs mt-1 ${m.isStaff ? 'text-gray-400' : 'text-blue-200'}`}>
                            {formatDate(m.createdAt)}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {ticketStatus === 'RESOLVED' ? (
                  <div className="p-4 border-t border-gray-700/50 text-center text-gray-400 text-sm">
                    Este atendimento foi encerrado. Para nova dúvida, inicie uma nova conversa.
                  </div>
                ) : (
                  <form onSubmit={handleSendMessage} className="p-4 border-t border-gray-700/50 flex gap-2">
                    <input
                      type="text"
                      value={messageInput}
                      onChange={(e) => setMessageInput(e.target.value)}
                      placeholder="Digite sua mensagem..."
                      maxLength={5000}
                      className={`flex-1 px-4 py-2.5 rounded-xl bg-gray-900/50 border border-gray-600 text-white placeholder-gray-500 text-sm ${focusRing}`}
                      disabled={sending}
                    />
                    <button
                      type="submit"
                      disabled={sending || !messageInput.trim()}
                      className="px-4 py-2.5 rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-medium disabled:opacity-50 flex items-center gap-2"
                    >
                      {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                      Enviar
                    </button>
                  </form>
                )}

                <div className="px-4 pb-2 flex justify-between">
                  <button
                    type="button"
                    onClick={() => setSelectedTicketId(null)}
                    className="text-sm text-gray-400 hover:text-white"
                  >
                    ← Ver todas as conversas
                  </button>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-gray-500 p-6 text-center">
                Selecione uma conversa ou clique em &quot;Iniciar conversa&quot; para falar com o suporte.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Contato Telegram */}
      <div className="bg-gradient-to-br from-gray-800/50 to-gray-800/30 backdrop-blur-xl rounded-2xl p-8 border border-gray-700/50 mb-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 bg-blue-500/10 rounded-xl">
            <Send className="w-6 h-6 text-blue-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Também pelo Telegram</h2>
            <p className="text-gray-400 text-sm">Prefere o Telegram? Use o bot oficial</p>
          </div>
        </div>

        <div className="bg-gradient-to-r from-blue-500/20 to-blue-600/20 rounded-xl p-6 border border-blue-500/30 mb-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm text-gray-300 mb-1">Telegram</p>
              <p className="text-2xl font-bold text-white">{SUPPORT_TELEGRAM}</p>
            </div>
            <a
              href={`https://t.me/${SUPPORT_TELEGRAM.replace('@', '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-xl transition-all flex items-center gap-2"
            >
              <Send className="w-5 h-5" />
              Abrir Telegram
            </a>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <Clock className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-white mb-1">Horário de Atendimento</h3>
              <p className="text-gray-400 text-sm">
                Segunda a Sexta: 9h às 17h (UTC-3)<br />
                Sábados, Domingos e Feriados: Fechado
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-white mb-1">Resposta Rápida</h3>
              <p className="text-gray-400 text-sm">
                Respondemos normalmente em até 1 hora durante o horário comercial.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Perguntas Frequentes */}
      <div className="bg-gradient-to-br from-gray-800/50 to-gray-800/30 backdrop-blur-xl rounded-2xl p-8 border border-gray-700/50 mb-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 bg-bitcoin/10 rounded-xl">
            <Info className="w-6 h-6 text-bitcoin" />
          </div>
          <h2 className="text-xl font-bold text-white">Perguntas Frequentes</h2>
        </div>

        <div className="space-y-4">
          <div className="bg-gray-900/50 rounded-xl p-4">
            <h3 className="font-semibold text-white mb-2">Como pagar um boleto?</h3>
            <p className="text-gray-400 text-sm">
              Vá em &quot;Pagar Boleto&quot;, preencha os dados, gere o QR Code e envie o valor exato em Depix para o endereço fornecido. Depois adicione o TXID no histórico.
            </p>
          </div>

          <div className="bg-gray-900/50 rounded-xl p-4">
            <h3 className="font-semibold text-white mb-2">Quanto tempo demora para aprovar?</h3>
            <p className="text-gray-400 text-sm">
              Em dias úteis das 9h às 17h, a aprovação é feita em até 1 hora após você enviar o TXID. Após 17h ou em finais de semana, fica para o próximo dia útil.
            </p>
          </div>

          <div className="bg-gray-900/50 rounded-xl p-4">
            <h3 className="font-semibold text-white mb-2">Esqueci de adicionar o TXID, e agora?</h3>
            <p className="text-gray-400 text-sm">
              Vá em &quot;Histórico&quot;, encontre o boleto pendente e clique em &quot;Editar&quot;. Lá você pode adicionar o TXID mesmo depois de sair do sistema.
            </p>
          </div>

          <div className="bg-gray-900/50 rounded-xl p-4">
            <h3 className="font-semibold text-white mb-2">Enviei o valor errado, o que fazer?</h3>
            <p className="text-gray-400 text-sm">
              Entre em contato conosco pelo chat acima ou pelo Telegram imediatamente informando o TXID da transação. Nossa equipe verificará e ajudará a resolver.
            </p>
          </div>

          <div className="bg-gray-900/50 rounded-xl p-4">
            <h3 className="font-semibold text-white mb-2">Como recebo o comprovante?</h3>
            <p className="text-gray-400 text-sm">
              Após a aprovação do pagamento pelo admin, o comprovante ficará disponível para download no histórico do boleto.
            </p>
          </div>
        </div>
      </div>

      {/* Avisos Importantes */}
      <div className="bg-gradient-to-br from-yellow-500/10 to-yellow-500/5 backdrop-blur-xl rounded-2xl p-6 border border-yellow-500/30">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-white mb-2">Importante</h3>
            <p className="text-gray-300 text-sm">
              Sempre envie o valor exato informado pelo sistema. Valores diferentes podem causar atraso na aprovação.
              Em caso de dúvidas ou problemas, use o chat ou o Telegram antes de fazer o pagamento.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
