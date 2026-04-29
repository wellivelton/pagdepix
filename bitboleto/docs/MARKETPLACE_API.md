# Marketplace API - Referência

## Público
- `GET /marketplace/products` - Listar produtos (query: page, limit, search, category, categoryId, sort)
- `GET /marketplace/search` - Busca (query: q, category, categoryId, minPrice, maxPrice, sort, limit, offset)
- `GET /marketplace/product/:slug` - Detalhe do produto
- `GET /marketplace/categories` - Categorias
- `GET /marketplace/banners` - Banners ativos
- `GET /marketplace/product/:productId/reviews` - Avaliações do produto

## Autenticado (comprador)
- `GET/POST/DELETE /marketplace/wishlist` - Wishlist
- `GET/POST /marketplace/cart` - Carrinho
- `POST /marketplace/checkout/cart` - Checkout (body: shippingOptions, globalCouponCode, affiliateCode)
- `GET /marketplace/orders`, `GET /marketplace/order/:id` - Pedidos
- `POST /marketplace/review` - Avaliar
- `POST /marketplace/dispute` - Abrir disputa

## Vendedor
- `GET/POST/PUT /marketplace/seller/*` - Produtos, vendas, saldo, transações, saques, cupons

## Afiliado
- `POST /marketplace/affiliate/link` - Gerar link (body: productId ou productSlug)
- `GET /marketplace/affiliate/earnings` - Comissões marketplace

## Admin
- `GET /marketplace/admin/metrics` - Métricas resumidas
- `GET /marketplace/admin/products` - Produtos
- `GET /marketplace/admin/reviews` - Avaliações
- `GET /marketplace/admin/sellers` - Vendedores
- `GET /marketplace/admin/seller-withdrawals` - Saques vendedores
- `POST /marketplace/admin/seller-withdrawal/:id/process` - Aprovar/Rejeitar saque
- `GET/POST/PUT/DELETE /marketplace/admin/global-coupon(s)` - Cupons globais
