import { prisma } from '../../prisma';

/**
 * Gera slug único para produto a partir do título.
 * Remove acentos, caracteres especiais, substitui espaços por hífen.
 */
export function slugify(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 200);
}

/**
 * Gera slug único verificando no banco. Se já existir, adiciona sufixo numérico.
 */
export async function generateSlug(title: string): Promise<string> {
  let base = slugify(title);
  if (!base) base = 'produto';

  let slug = base;
  let attempts = 0;
  const maxAttempts = 50;

  while (attempts < maxAttempts) {
    const existing = await prisma.product.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!existing) return slug;
    attempts++;
    slug = `${base}-${attempts}`;
  }

  return `${base}-${Date.now()}`;
}
