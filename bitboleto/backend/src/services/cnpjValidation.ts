/**
 * Serviço de validação de CNPJ via BrasilAPI (gratuita, sem autenticação).
 * Consulta dados da Receita Federal: razão social, situação cadastral, etc.
 */

export interface CnpjData {
  cnpj: string;
  razao_social: string;
  nome_fantasia: string;
  situacao_cadastral: string; // "Ativa", "Inapta", "Baixada", etc.
  descricao_situacao_cadastral: string;
  data_inicio_atividade: string;
  cnae_fiscal: number;
  cnae_fiscal_descricao: string;
  logradouro: string;
  municipio: string;
  uf: string;
  cep: string;
}

export interface CnpjValidationResult {
  valid: boolean;
  data?: CnpjData;
  error?: string;
}

export async function validateCnpjReceita(cnpj: string): Promise<CnpjValidationResult> {
  const digits = cnpj.replace(/\D/g, '');

  if (digits.length !== 14) {
    return { valid: false, error: 'CNPJ deve conter 14 dígitos.' };
  }

  if (!isValidCnpjDigits(digits)) {
    return { valid: false, error: 'CNPJ inválido (dígitos verificadores incorretos).' };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'PagDepix/1.0 (https://pagdepix.com; contato@pagdepix.com)',
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      if (res.status === 404) {
        return { valid: false, error: 'CNPJ não encontrado na base da Receita Federal.' };
      }
      if (res.status === 429) {
        return { valid: false, error: 'Muitas consultas. Tente novamente em alguns minutos.' };
      }
      if (res.status === 403) {
        console.warn('[cnpjValidation] BrasilAPI retornou 403. Tentando fallback ReceitaWS...');
        const fallback = await tryReceitaWsFallback(digits);
        if (fallback) return fallback;
        return {
          valid: false,
          error: 'O serviço de consulta de CNPJ está temporariamente indisponível. Tente novamente em alguns minutos ou entre em contato com o suporte pelo Telegram.',
        };
      }
      return { valid: false, error: `Erro ao consultar CNPJ (status ${res.status}). Tente novamente.` };
    }

    const data = await res.json() as any;

    const situacao = (data.descricao_situacao_cadastral || data.situacao_cadastral || '').toString().toUpperCase();

    if (!situacao.includes('ATIVA')) {
      return {
        valid: false,
        error: `CNPJ com situação "${data.descricao_situacao_cadastral || situacao}". Apenas CNPJs com situação ATIVA podem ativar o Modo Comércio.`,
        data: mapCnpjData(data),
      };
    }

    return {
      valid: true,
      data: mapCnpjData(data),
    };
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      return { valid: false, error: 'Tempo esgotado ao consultar CNPJ. Tente novamente.' };
    }
    console.error('[cnpjValidation] Erro:', err?.message);
    return { valid: false, error: 'Não foi possível validar o CNPJ no momento. Tente novamente.' };
  }
}

/**
 * Fallback para ReceitaWS quando BrasilAPI retorna 403.
 * ReceitaWS: https://www.receitaws.com.br/v1/cnpj/{cnpj}
 */
async function tryReceitaWsFallback(digits: string): Promise<CnpjValidationResult | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(`https://www.receitaws.com.br/v1/cnpj/${digits}`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'PagDepix/1.0 (https://pagdepix.com; contato@pagdepix.com)',
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) {
      console.warn('[cnpjValidation] ReceitaWS fallback falhou:', res.status);
      return null;
    }
    const rw = (await res.json()) as any;
    if (rw.status === 'ERROR') {
      return null;
    }
    const situacao = (rw.situacao || '').toString().toUpperCase();
    if (!situacao.includes('ATIVA')) {
      return {
        valid: false,
        error: `CNPJ com situação "${rw.situacao || situacao}". Apenas CNPJs com situação ATIVA podem ativar o Modo Comércio.`,
        data: mapReceitaWsToCnpjData(rw, digits),
      };
    }
    return {
      valid: true,
      data: mapReceitaWsToCnpjData(rw, digits),
    };
  } catch (e) {
    console.warn('[cnpjValidation] ReceitaWS fallback erro:', (e as Error).message);
    return null;
  }
}

function mapReceitaWsToCnpjData(rw: any, digits: string): CnpjData {
  const atividades = Array.isArray(rw.atividades_secundarias) ? rw.atividades_secundarias : [];
  const principal = Array.isArray(rw.atividade_principal) ? rw.atividade_principal[0] : null;
  return {
    cnpj: digits,
    razao_social: rw.nome || '',
    nome_fantasia: rw.fantasia || '',
    situacao_cadastral: rw.situacao || '',
    descricao_situacao_cadastral: rw.situacao || '',
    data_inicio_atividade: rw.abertura || '',
    cnae_fiscal: principal?.code ? parseInt(principal.code.replace(/\D/g, '').slice(0, 7), 10) || 0 : 0,
    cnae_fiscal_descricao: principal?.text || '',
    logradouro: [rw.logradouro, rw.numero, rw.bairro].filter(Boolean).join(', ') || '',
    municipio: rw.municipio || '',
    uf: rw.uf || '',
    cep: (rw.cep || '').replace(/\D/g, '').replace(/(\d{5})(\d{3})/, '$1-$2'),
  };
}

function mapCnpjData(data: any): CnpjData {
  return {
    cnpj: data.cnpj?.toString().replace(/\D/g, '') || '',
    razao_social: data.razao_social || '',
    nome_fantasia: data.nome_fantasia || '',
    situacao_cadastral: data.descricao_situacao_cadastral || '',
    descricao_situacao_cadastral: data.descricao_situacao_cadastral || '',
    data_inicio_atividade: data.data_inicio_atividade || '',
    cnae_fiscal: data.cnae_fiscal || 0,
    cnae_fiscal_descricao: data.cnae_fiscal_descricao || '',
    logradouro: data.logradouro || '',
    municipio: data.municipio || '',
    uf: data.uf || '',
    cep: data.cep || '',
  };
}

function isValidCnpjDigits(cnpj: string): boolean {
  const digits = cnpj.replace(/\D/g, '');
  if (digits.length !== 14) return false;
  if (/^(\d)\1+$/.test(digits)) return false;

  let size = digits.length - 2;
  let numbers = digits.substring(0, size);
  const verificadores = digits.substring(size);
  let sum = 0;
  let pos = size - 7;

  for (let i = size; i >= 1; i--) {
    sum += parseInt(numbers.charAt(size - i)) * pos--;
    if (pos < 2) pos = 9;
  }

  let result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (result !== parseInt(verificadores.charAt(0))) return false;

  size = size + 1;
  numbers = digits.substring(0, size);
  sum = 0;
  pos = size - 7;

  for (let i = size; i >= 1; i--) {
    sum += parseInt(numbers.charAt(size - i)) * pos--;
    if (pos < 2) pos = 9;
  }

  result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (result !== parseInt(verificadores.charAt(1))) return false;

  return true;
}
