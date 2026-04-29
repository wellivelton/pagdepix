/**
 * Em produção, nunca expor stack trace nem mensagens internas nas respostas da API.
 * Use esta função ao enviar mensagem de erro ao cliente.
 */
export function getSafeErrorMessage(err: unknown, fallback = 'Erro interno'): string {
  if (process.env.NODE_ENV === 'production') {
    return fallback;
  }
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return fallback;
}
