import { Request, Response } from 'express';
import * as path from 'path';
import * as fs from 'fs';
import { prisma } from '../../prisma';
import { generateSlug } from '../../services/marketplace/slug.service';
import { cacheGet, cacheSet, cacheInvalidatePrefix } from '../../utils/memoryCache';

export const createProduct = async (req: Request, res: Response) => {
  const sellerId = (req as any).userId;
  const {
    title,
    description,
    category,
    priceInDepix,
    deliveryType,
    deliveryLink,
    allowAffiliates,
    affiliateCommissionPercent,
    isReusable,
    isAdultContent,
    localDeliveryMode,
    localDeliveryZones,
    localDeliveryCep,
  } = req.body;

  try {
    const seller = await prisma.user.findUnique({ where: { id: sellerId } });
    if (seller?.role !== 'COMMERCE' && (req as any).userRole !== 'ADMIN') {
      return res.status(403).json({ error: 'Apenas comerciantes podem vender' });
    }

    const slug = await generateSlug(title || 'Produto');
    const coverUrl = (req as any).file
      ? `/uploads/products/${(req as any).file.filename}`
      : null;

    let parsedZones = undefined;
    if (localDeliveryZones) {
      try { parsedZones = typeof localDeliveryZones === 'string' ? JSON.parse(localDeliveryZones) : localDeliveryZones; } catch {}
    }

    const product = await prisma.product.create({
      data: {
        sellerId,
        title: String(title || '').slice(0, 200),
        slug,
        description: String(description || ''),
        category: category || 'EBOOK',
        priceInDepix: parseFloat(priceInDepix) || 0,
        deliveryType: deliveryType || 'FILE',
        deliveryLink: deliveryType === 'LINK' ? (deliveryLink || null) : null,
        allowAffiliates: !!allowAffiliates,
        affiliateCommissionPercent: parseFloat(affiliateCommissionPercent) || 0,
        coverImageUrl: coverUrl,
        status: 'DRAFT',
        isReusable: isReusable === 'false' || isReusable === false ? false : true,
        isAdultContent: isAdultContent === 'true' || isAdultContent === true ? true : false,
        localDeliveryMode: deliveryType === 'LOCAL' ? (localDeliveryMode || null) : null,
        localDeliveryZones: deliveryType === 'LOCAL' && parsedZones ? parsedZones : undefined,
        localDeliveryCep: deliveryType === 'LOCAL' ? (String(localDeliveryCep || '').replace(/\D/g, '').slice(0, 8) || null) : null,
      },
    });

    res.status(201).json({ success: true, productId: product.id });
  } catch (error) {
    console.error('Erro ao criar produto:', error);
    res.status(500).json({ error: 'Erro ao criar produto' });
  }
};

export const listProducts = async (req: Request, res: Response) => {
  const { category, categoryId, search, sort = 'newest', page = '1', limit = '20' } = req.query;

  try {
    const pageNum = Math.max(1, parseInt(String(page), 10));
    const limitNum = Math.min(50, Math.max(1, parseInt(String(limit), 10)));

    // Cache apenas para buscas sem filtro de texto (listagem padrão)
    const hasSearch = search && typeof search === 'string' && search.trim().length > 0;
    const cacheKey = !hasSearch
      ? `products:list:${category ?? ''}:${categoryId ?? ''}:${sort}:${pageNum}:${limitNum}`
      : null;

    if (cacheKey) {
      const cached = cacheGet<object>(cacheKey);
      if (cached) return res.json(cached);
    }

    const where: any = {
      status: 'APPROVED',
      AND: [
        {
          OR: [
            { deliveryType: { not: 'CODE' } },
            { codes: { some: { isUsed: false } } },
          ],
        },
      ],
    };
    if (category && typeof category === 'string') where.AND.push({ category });
    if (categoryId && typeof categoryId === 'string') where.AND.push({ categoryId });
    if (hasSearch) {
      where.AND.push({
        OR: [
          { title: { contains: search as string, mode: 'insensitive' } },
          { description: { contains: search as string, mode: 'insensitive' } },
        ],
      });
    }

    const skip = (pageNum - 1) * limitNum;

    const orderByMap: Record<string, object> = {
      newest: { createdAt: 'desc' },
      price_asc: { priceInDepix: 'asc' },
      price_desc: { priceInDepix: 'desc' },
      rating: { averageRating: 'desc' as const },
    };
    const orderBy = orderByMap[String(sort)] ?? { createdAt: 'desc' };

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        include: {
          seller: { select: { id: true, name: true } },
        },
        orderBy,
        skip,
        take: limitNum,
      }),
      prisma.product.count({ where }),
    ]);

    const result = {
      products,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    };

    if (cacheKey) cacheSet(cacheKey, result, 60); // 60s TTL

    res.json(result);
  } catch (error) {
    console.error('Erro ao listar produtos:', error);
    res.status(500).json({ error: 'Erro ao listar produtos' });
  }
};

export const getProduct = async (req: Request, res: Response) => {
  const slug = param(req.params.slug);

  try {
    if (!slug) return res.status(400).json({ error: 'Slug obrigatório' });
    const product = await prisma.product.findUnique({
      where: { slug },
      include: {
        seller: { select: { id: true, name: true } },
        reviews: {
          where: { isApproved: true },
          include: { user: { select: { name: true } } },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!product || product.status !== 'APPROVED') {
      return res.status(404).json({ error: 'Produto não encontrado' });
    }

    await prisma.product.update({
      where: { id: product.id },
      data: { viewCount: { increment: 1 } },
    });

    res.json({ ...product, viewCount: product.viewCount + 1 });
  } catch (error) {
    console.error('Erro ao buscar produto:', error);
    res.status(500).json({ error: 'Erro ao buscar produto' });
  }
};


export const getSellerProducts = async (req: Request, res: Response) => {
  const sellerId = (req as any).userId;

  try {
    const products = await prisma.product.findMany({
      where: { sellerId },
      include: {
        _count: { select: { orders: true, reviews: true } },
        files: { select: { id: true, originalFilename: true, filename: true, fileSize: true, mimeType: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    const serialized = products.map((p) => {
      const { files: rawFiles, ...rest } = p;
      return {
        ...rest,
        files: (rawFiles || []).map((f: { fileSize?: bigint } & Record<string, unknown>) => ({
          id: f.id,
          originalFilename: f.originalFilename,
          filename: f.filename,
          fileSize: f.fileSize != null ? Number(f.fileSize) : 0,
          mimeType: f.mimeType,
        })),
      };
    });
    res.json(serialized);
  } catch (error) {
    console.error('Erro ao listar produtos do vendedor:', error);
    res.status(500).json({ error: 'Erro' });
  }
};

function param(id: string | string[] | undefined): string | undefined {
  return Array.isArray(id) ? id[0] : id;
}

export const uploadProductFiles = async (req: Request, res: Response) => {
  const productId = param(req.params.productId);
  const sellerId = (req as any).userId;
  const files = (req as any).files as Express.Multer.File[] | undefined;

  try {
    if (!productId) return res.status(400).json({ error: 'productId obrigatório' });
    const product = await prisma.product.findFirst({
      where: { id: productId, sellerId },
    });
    if (!product) return res.status(404).json({ error: 'Produto não encontrado' });

    if (!files?.length) return res.status(400).json({ error: 'Nenhum arquivo enviado' });

    const fileRecords = await Promise.all(
      files.map((file: Express.Multer.File) =>
        prisma.productFile.create({
          data: {
            productId,
            filename: file.filename,
            originalFilename: file.originalname || file.filename,
            filePath: file.path || `uploads/products/${file.filename}`,
            fileSize: BigInt(file.size || 0),
            mimeType: file.mimetype || null,
            virusScanStatus: 'pending',
          },
        })
      )
    );
    const serializable = fileRecords.map((f) => ({
      ...f,
      fileSize: f.fileSize != null ? Number(f.fileSize) : 0,
    }));
    res.json({ success: true, files: serializable });
  } catch (error) {
    console.error('Erro ao fazer upload:', error);
    res.status(500).json({ error: 'Erro ao fazer upload' });
  }
};

export const addProductCodes = async (req: Request, res: Response) => {
  const productId = param(req.params.productId);
  const { codes } = req.body as { codes?: string[] };
  const sellerId = (req as any).userId;

  try {
    if (!productId) return res.status(400).json({ error: 'productId obrigatório' });
    const product = await prisma.product.findFirst({
      where: { id: productId, sellerId },
    });
    if (!product) return res.status(404).json({ error: 'Produto não encontrado' });
    if (product.deliveryType !== 'CODE') {
      return res.status(400).json({ error: 'Produto não é do tipo CODE' });
    }

    const arr = Array.isArray(codes) ? codes : [];
    const toCreate = arr.filter((c: unknown) => typeof c === 'string' && (c as string).trim()).map((c: string) => ({ productId, code: c.trim() }));
    if (toCreate.length === 0) return res.status(400).json({ error: 'Nenhum código válido' });

    const result = await prisma.productCode.createMany({ data: toCreate });
    res.json({ success: true, created: result.count });
  } catch (error) {
    console.error('Erro ao adicionar códigos:', error);
    res.status(500).json({ error: 'Erro ao adicionar códigos' });
  }
};

/** Admin: listar produtos com filtro de status */
export const adminListProducts = async (req: Request, res: Response) => {
  try {
    if ((req as any).userRole !== 'ADMIN') {
      return res.status(403).json({ error: 'Acesso negado' });
    }
    const { status = 'PENDING_APPROVAL', page = '1', limit = '20', search } = req.query;
    const statusVal = String(status).toUpperCase();
    const validStatuses = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'INACTIVE'];
    const where: any = {};
    if (statusVal !== 'ALL' && validStatuses.includes(statusVal)) {
      where.status = statusVal;
    }
    if (search && typeof search === 'string' && search.trim()) {
      where.OR = [
        { title: { contains: search.trim(), mode: 'insensitive' } },
        { description: { contains: search.trim(), mode: 'insensitive' } },
      ];
    }
    const pageNum = Math.max(1, parseInt(String(page), 10));
    const limitNum = Math.min(50, Math.max(1, parseInt(String(limit), 10)));
    const skip = (pageNum - 1) * limitNum;

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        include: {
          seller: { select: { id: true, name: true, email: true } },
          _count: { select: { orders: true, reviews: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
      }),
      prisma.product.count({ where }),
    ]);

    const counts = await prisma.product.groupBy({
      by: ['status'],
      _count: { id: true },
    });
    const statusCounts = Object.fromEntries(counts.map((c) => [c.status, c._count.id]));

    res.json({
      products,
      pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
      statusCounts: {
        DRAFT: statusCounts.DRAFT ?? 0,
        PENDING_APPROVAL: statusCounts.PENDING_APPROVAL ?? 0,
        APPROVED: statusCounts.APPROVED ?? 0,
        REJECTED: statusCounts.REJECTED ?? 0,
        INACTIVE: statusCounts.INACTIVE ?? 0,
      },
    });
  } catch (error) {
    console.error('Erro ao listar produtos (admin):', error);
    res.status(500).json({ error: 'Erro ao listar produtos' });
  }
};

export const approveProduct = async (req: Request, res: Response) => {
  const productId = param(req.params.productId);
  const adminId = (req as any).userId;

  try {
    if ((req as any).userRole !== 'ADMIN') {
      return res.status(403).json({ error: 'Acesso negado' });
    }
    const product = await prisma.product.update({
      where: { id: productId },
      data: { status: 'APPROVED', approvedAt: new Date(), approvedBy: adminId, rejectionReason: null, adminAdjustmentRequest: null },
    });
    cacheInvalidatePrefix('products:list:');
    res.json({ success: true, product });
  } catch (error) {
    console.error('Erro ao aprovar produto:', error);
    res.status(500).json({ error: 'Erro ao aprovar produto' });
  }
};

export const rejectProduct = async (req: Request, res: Response) => {
  const productId = param(req.params.productId);
  const { reason } = req.body;

  try {
    if ((req as any).userRole !== 'ADMIN') return res.status(403).json({ error: 'Acesso negado' });
    if (!productId) return res.status(400).json({ error: 'productId obrigatório' });
    const product = await prisma.product.update({
      where: { id: productId },
      data: { status: 'REJECTED', rejectionReason: reason || null, adminAdjustmentRequest: null },
    });
    res.json({ success: true, product });
  } catch (error) {
    console.error('Erro ao rejeitar produto:', error);
    res.status(500).json({ error: 'Erro ao rejeitar produto' });
  }
};

/** Vendedor: enviar rascunho para aprovação (DRAFT → PENDING_APPROVAL) */
export const submitForApproval = async (req: Request, res: Response) => {
  const productId = param(req.params.productId);
  const sellerId = (req as any).userId;

  try {
    if (!productId) return res.status(400).json({ error: 'productId obrigatório' });
    const product = await prisma.product.findFirst({
      where: { id: productId, sellerId },
      include: {
        files: true,
        codes: { where: { isUsed: false } },
      },
    });
    if (!product) return res.status(404).json({ error: 'Produto não encontrado' });
    if (product.status !== 'DRAFT') {
      return res.status(400).json({ error: 'Apenas produtos em rascunho podem ser enviados para aprovação' });
    }

    if (product.deliveryType === 'FILE' && (!product.files || product.files.length === 0)) {
      return res.status(400).json({ error: 'Adicione pelo menos um arquivo antes de enviar para aprovação' });
    }
    if (product.deliveryType === 'CODE' && (!product.codes || product.codes.length === 0)) {
      return res.status(400).json({ error: 'Adicione pelo menos um código antes de enviar para aprovação' });
    }
    if (product.deliveryType === 'LINK' && !product.deliveryLink?.trim()) {
      return res.status(400).json({ error: 'Informe o link de entrega antes de enviar para aprovação' });
    }
    if (product.deliveryType === 'LOCAL') {
      if (!product.localDeliveryCep?.trim()) {
        return res.status(400).json({ error: 'Informe o CEP de origem antes de enviar para aprovação' });
      }
      if (!product.localDeliveryMode) {
        return res.status(400).json({ error: 'Informe o modo de entrega antes de enviar para aprovação' });
      }
      if (product.localDeliveryMode === 'ZONE_PRICE') {
        const zones = product.localDeliveryZones as any[];
        if (!zones || zones.length === 0) {
          return res.status(400).json({ error: 'Adicione pelo menos uma zona de entrega antes de enviar para aprovação' });
        }
      }
    }

    const updated = await prisma.product.update({
      where: { id: productId },
      data: { status: 'PENDING_APPROVAL', adminAdjustmentRequest: null },
    });
    res.json({ success: true, product: updated });
  } catch (error) {
    console.error('Erro ao enviar para aprovação:', error);
    res.status(500).json({ error: 'Erro ao enviar para aprovação' });
  }
};

/** Admin: obter conteúdo do produto para revisão (arquivos, link, qtd códigos) */
export const adminGetProductContent = async (req: Request, res: Response) => {
  const productId = param(req.params.productId);
  try {
    if ((req as any).userRole !== 'ADMIN') return res.status(403).json({ error: 'Acesso negado' });
    if (!productId) return res.status(400).json({ error: 'productId obrigatório' });
    const [product, codesTotal, codesAvailable] = await Promise.all([
      prisma.product.findUnique({
        where: { id: productId },
        include: { files: { select: { id: true, originalFilename: true, filename: true, fileSize: true, mimeType: true } } },
      }),
      prisma.productCode.count({ where: { productId } }),
      prisma.productCode.count({ where: { productId, isUsed: false } }),
    ]);
    if (!product) return res.status(404).json({ error: 'Produto não encontrado' });
    res.json({
      deliveryType: product.deliveryType,
      deliveryLink: product.deliveryLink,
      files: product.files,
      codesTotal,
      codesAvailable,
    });
  } catch (error) {
    console.error('Erro ao obter conteúdo:', error);
    res.status(500).json({ error: 'Erro ao obter conteúdo' });
  }
};

/** Admin: download de arquivo do produto (para revisão antes de aprovar) */
export const adminDownloadProductFile = async (req: Request, res: Response) => {
  const productId = param(req.params.productId);
  const fileId = param(req.params.fileId);
  try {
    if ((req as any).userRole !== 'ADMIN') return res.status(403).json({ error: 'Acesso negado' });
    if (!productId || !fileId) return res.status(400).json({ error: 'Parâmetros obrigatórios' });
    const file = await prisma.productFile.findFirst({
      where: { id: fileId, productId },
    });
    if (!file) return res.status(404).json({ error: 'Arquivo não encontrado' });
    const fullPath = path.isAbsolute(file.filePath)
      ? file.filePath
      : path.resolve(__dirname, '..', '..', file.filePath);
    if (!fs.existsSync(fullPath)) return res.status(404).json({ error: 'Arquivo não encontrado no servidor' });
    res.download(fullPath, file.originalFilename || file.filename);
  } catch (error) {
    console.error('Erro ao baixar arquivo:', error);
    res.status(500).json({ error: 'Erro ao baixar' });
  }
};

/** Admin: solicitar ajustes ao vendedor (mantém PENDING_APPROVAL, adiciona feedback) */
export const requestAdjustment = async (req: Request, res: Response) => {
  const productId = param(req.params.productId);
  const { notes } = req.body as { notes?: string };

  try {
    if ((req as any).userRole !== 'ADMIN') return res.status(403).json({ error: 'Acesso negado' });
    if (!productId) return res.status(400).json({ error: 'productId obrigatório' });
    const text = typeof notes === 'string' ? notes.trim() : '';
    if (!text) return res.status(400).json({ error: 'Descreva os ajustes necessários' });

    const product = await prisma.product.update({
      where: { id: productId },
      data: { adminAdjustmentRequest: text },
    });
    res.json({ success: true, product });
  } catch (error) {
    console.error('Erro ao solicitar ajustes:', error);
    res.status(500).json({ error: 'Erro ao solicitar ajustes' });
  }
};

export const updateProduct = async (req: Request, res: Response) => {
  const productId = param(req.params.productId);
  const sellerId = (req as any).userId;
  const body = req.body as Record<string, unknown>;
  const file = (req as any).file;

  try {
    if (!productId) return res.status(400).json({ error: 'productId obrigatório' });
    const product = await prisma.product.findFirst({
      where: { id: productId, sellerId },
    });
    if (!product) return res.status(404).json({ error: 'Produto não encontrado' });
    if (product.status !== 'DRAFT' && product.status !== 'PENDING_APPROVAL' && product.status !== 'APPROVED') {
      return res.status(400).json({ error: 'Produto não pode ser editado' });
    }

    const data: any = {};
    if (typeof body.title === 'string') data.title = body.title.slice(0, 200);
    if (typeof body.description === 'string') data.description = body.description;
    if (body.category) data.category = body.category;
    if (typeof body.priceInDepix === 'number' || (typeof body.priceInDepix === 'string' && body.priceInDepix !== '')) {
      data.priceInDepix = parseFloat(String(body.priceInDepix));
    }
    if (body.deliveryType) data.deliveryType = body.deliveryType;
    if (body.deliveryType === 'LINK' && body.deliveryLink != null) data.deliveryLink = body.deliveryLink;
    if (typeof body.allowAffiliates === 'boolean') data.allowAffiliates = body.allowAffiliates;
    if (typeof body.affiliateCommissionPercent === 'number' || (typeof body.affiliateCommissionPercent === 'string' && body.affiliateCommissionPercent !== '')) {
      data.affiliateCommissionPercent = parseFloat(String(body.affiliateCommissionPercent));
    }
    if (body.status === 'INACTIVE') data.status = 'INACTIVE';
    if (file) data.coverImageUrl = `/uploads/products/${file.filename}`;
    if (body.isReusable !== undefined) data.isReusable = body.isReusable === 'false' || body.isReusable === false ? false : true;
    if (body.isAdultContent !== undefined) data.isAdultContent = body.isAdultContent === 'true' || body.isAdultContent === true ? true : false;
    if (body.localDeliveryMode !== undefined) data.localDeliveryMode = body.localDeliveryMode || null;
    if (body.localDeliveryCep !== undefined) data.localDeliveryCep = String(body.localDeliveryCep || '').replace(/\D/g, '').slice(0, 8) || null;
    if (body.localDeliveryZones !== undefined) {
      try { data.localDeliveryZones = typeof body.localDeliveryZones === 'string' ? JSON.parse(body.localDeliveryZones as string) : body.localDeliveryZones; } catch {}
    }

    const updated = await prisma.product.update({
      where: { id: productId! },
      data,
    });
    res.json({ success: true, product: updated });
  } catch (error) {
    console.error('Erro ao atualizar produto:', error);
    res.status(500).json({ error: 'Erro ao atualizar produto' });
  }
};

/**
 * Perfil público de um vendedor: dados básicos + produtos aprovados.
 * GET /marketplace/seller/:sellerId/profile
 */
export const getSellerPublicProfile = async (req: Request, res: Response) => {
  const sellerId = param(req.params.sellerId);
  const { page = '1', limit = '24' } = req.query;

  try {
    if (!sellerId) return res.status(400).json({ error: 'sellerId obrigatório' });

    const pageNum = Math.max(1, parseInt(String(page), 10));
    const limitNum = Math.min(48, Math.max(1, parseInt(String(limit), 10)));
    const skip = (pageNum - 1) * limitNum;

    const seller = await prisma.user.findUnique({
      where: { id: sellerId },
      select: {
        id: true,
        name: true,
        createdAt: true,
        sellerBalance: { select: { totalEarned: true } },
        _count: {
          select: {
            sellerProducts: { where: { status: 'APPROVED' } },
            sellerOrdersV2: { where: { status: { in: ['PAID', 'COMPLETED'] } } },
          },
        },
      },
    });

    if (!seller) return res.status(404).json({ error: 'Vendedor não encontrado' });

    const productsWhere = { sellerId, status: 'APPROVED' as const };
    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where: productsWhere,
        select: {
          id: true,
          title: true,
          slug: true,
          priceInDepix: true,
          coverImageUrl: true,
          category: true,
          averageRating: true,
          reviewCount: true,
          seller: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
      }),
      prisma.product.count({ where: productsWhere }),
    ]);

    // Avaliação média do vendedor (média das médias de produtos)
    const avgResult = await prisma.product.aggregate({
      where: { sellerId, status: 'APPROVED', reviewCount: { gt: 0 } },
      _avg: { averageRating: true },
    });

    res.json({
      seller: {
        ...seller,
        averageRating: avgResult._avg.averageRating ?? null,
        totalSales: seller._count.sellerOrdersV2,
        totalProducts: seller._count.sellerProducts,
      },
      products,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error('Erro ao buscar perfil do vendedor:', error);
    res.status(500).json({ error: 'Erro ao buscar perfil do vendedor' });
  }
};
