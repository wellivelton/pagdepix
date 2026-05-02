export type BusinessVariant = 'open' | 'opening-soon' | 'closed';

export interface BusinessStatus {
  isOpen: boolean;
  variant: BusinessVariant;
  primary: string;
  secondary: string;
}

const WEEKDAY = { open: 8, close: 18 } as const;
const SATURDAY = { open: 8, close: 12 } as const;

export function getBusinessStatus(now: Date = new Date()): BusinessStatus {
  // Always compute in America/Sao_Paulo regardless of user's browser timezone
  const sp = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const day = sp.getDay(); // 0=Sun 1=Mon … 6=Sat
  const t = sp.getHours() + sp.getMinutes() / 60;

  if (day === 0) {
    return { isOpen: false, variant: 'closed', primary: 'Fechado', secondary: 'Reabre segunda às 08h' };
  }

  if (day === 6) {
    if (t < SATURDAY.open)  return { isOpen: false, variant: 'opening-soon', primary: 'Abre às 08h', secondary: 'Hoje' };
    if (t >= SATURDAY.close) return { isOpen: false, variant: 'closed',       primary: 'Fechado',    secondary: 'Reabre segunda às 08h' };
    return { isOpen: true, variant: 'open', primary: 'Atendimento aberto', secondary: 'Até as 12h' };
  }

  // Mon–Fri
  if (t < WEEKDAY.open)  return { isOpen: false, variant: 'opening-soon', primary: 'Abre às 08h', secondary: 'Hoje' };
  if (t >= WEEKDAY.close) {
    const secondary = day === 5 ? 'Reabre segunda às 08h' : 'Reabre amanhã às 08h';
    return { isOpen: false, variant: 'closed', primary: 'Fechado', secondary };
  }
  return { isOpen: true, variant: 'open', primary: 'Atendimento aberto', secondary: 'Até as 18h' };
}
