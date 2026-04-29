/**
 * Validação de nome completo (nome real)
 */

/** Palavras proibidas - nomes genéricos ou falsos */
const FORBIDDEN_NAMES = [
  'teste', 'test', 'admin', 'administrador', 'usuário', 'usuario', 'user',
  'nome sobrenome', 'fulano de tal', 'fulano', 'cicrano', 'beltrano',
  'asdf qwerty', 'qwerty', 'asdf', 'xxxxx', 'yyyyy', 'aaaa', 'bbbb',
  'nome teste', 'teste teste', 'abc abc', 'foo bar', 'bar foo',
  'pagdepix', 'pag depix', 'sistema', 'conta', 'default',
];

export interface NameValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Verifica se o nome parece genérico/falso
 */
function looksFake(name: string): boolean {
  const lower = name.toLowerCase().trim();
  if (FORBIDDEN_NAMES.includes(lower)) return true;
  if (FORBIDDEN_NAMES.some((f) => lower.includes(f))) return true;

  // Padrões como "Xxxxx Yyyyy" (alternância de maiúsculas/minúsculas)
  const words = lower.split(/\s+/);
  if (words.length >= 2) {
    const allSameLength = words.every((w) => w.length === words[0].length);
    const allRepeated = words.every((w) => /^(.)\1+$/.test(w));
    if (allSameLength && allRepeated) return true;
  }

  return false;
}

/**
 * Validação completa de nome completo
 */
export function validateFullName(name: string): NameValidationResult {
  if (!name || typeof name !== 'string') {
    return { valid: false, error: 'Nome é obrigatório' };
  }

  const trimmed = name.trim();
  if (trimmed.length < 4) {
    return { valid: false, error: 'Nome deve ter pelo menos 4 caracteres' };
  }

  // Pelo menos 2 palavras
  const words = trimmed.split(/\s+/).filter((w) => w.length > 0);
  if (words.length < 2) {
    return { valid: false, error: 'Informe nome e sobrenome' };
  }

  // Cada palavra com mínimo 2 letras
  const invalidWord = words.find((w) => w.length < 2);
  if (invalidWord) {
    return { valid: false, error: 'Cada parte do nome deve ter pelo menos 2 letras' };
  }

  // Sem números
  if (/\d/.test(trimmed)) {
    return { valid: false, error: 'Nome não pode conter números' };
  }

  // Apenas letras, espaços e acentos (sem caracteres especiais) - compatível com ES5+
  if (!/^[a-zA-ZÀ-ÿ\s'-]+$/.test(trimmed)) {
    return { valid: false, error: 'Nome contém caracteres inválidos' };
  }

  if (looksFake(trimmed)) {
    return {
      valid: false,
      error: 'Informe seu nome real completo',
    };
  }

  return { valid: true };
}
