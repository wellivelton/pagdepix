export const CATEGORIES_DIGITAL = [
  { value: 'EBOOK', label: 'E-book' },
  { value: 'SOFTWARE', label: 'Software' },
  { value: 'COURSE', label: 'Curso' },
  { value: 'DESIGN', label: 'Design' },
  { value: 'GIFTCARD', label: 'Gift Card' },
  { value: 'OTHER', label: 'Outros' },
] as const;

export const CATEGORIES_LOCAL = [
  { value: 'FOOD', label: 'Alimentação' },
  { value: 'LOCAL_SERVICE', label: 'Serviço Local' },
  { value: 'HANDCRAFT', label: 'Artesanato' },
  { value: 'OTHER', label: 'Outros' },
] as const;

export const DELIVERY_TYPES_DIGITAL = [
  { value: 'FILE', label: 'Arquivo (PDF, ZIP, etc.)' },
  { value: 'CODE', label: 'Código / Licença / Serial' },
  { value: 'LINK', label: 'Link externo (área de membros)' },
] as const;

export const CATEGORY_LABELS: Record<string, string> = {
  EBOOK: 'E-book',
  SOFTWARE: 'Software',
  COURSE: 'Curso',
  DESIGN: 'Design',
  GIFTCARD: 'Gift Card',
  OTHER: 'Outros',
  FOOD: 'Alimentação',
  LOCAL_SERVICE: 'Serviço Local',
  HANDCRAFT: 'Artesanato',
};

export const PRICE_MIN = 0;
export const PRICE_MAX = 999999.99;
export const COVER_MAX_SIZE = 1 * 1024 * 1024; // 1MB
export const COVER_ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
export const COVER_FORMATS_LABEL = 'JPG, PNG, WEBP ou GIF';
