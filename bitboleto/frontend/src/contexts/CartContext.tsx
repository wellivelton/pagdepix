import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import api from '../services/api';

interface CartItem {
  id: string;
  productId: string;
  variantId?: string | null;
  quantity: number;
  product: {
    id: string;
    title: string;
    priceInDepix: number;
    coverImageUrl?: string | null;
    slug: string;
    sellerId: string;
  };
  variant?: { id: string; priceInDepix: number } | null;
}

interface Cart {
  id: string;
  items: CartItem[];
}

interface CartContextValue {
  cart: Cart | null;
  loading: boolean;
  refreshCart: () => Promise<void>;
  addToCart: (productId: string, quantity?: number, variantId?: string) => Promise<void>;
  updateQuantity: (itemId: string, quantity: number) => Promise<void>;
  removeItem: (itemId: string) => Promise<void>;
  itemCount: number;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<Cart | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshCart = useCallback(async () => {
    try {
      const { data } = await api.get('/marketplace/cart');
      setCart(data);
    } catch {
      setCart(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      refreshCart();
    } else {
      setCart(null);
      setLoading(false);
    }
  }, [refreshCart]);

  const addToCart = useCallback(
    async (productId: string, quantity = 1, variantId?: string) => {
      const { data } = await api.post('/marketplace/cart/items', {
        productId,
        quantity,
        variantId: variantId || undefined,
      });
      await refreshCart();
      return data;
    },
    [refreshCart]
  );

  const updateQuantity = useCallback(
    async (itemId: string, quantity: number) => {
      await api.put(`/marketplace/cart/items/${itemId}`, { quantity });
      await refreshCart();
    },
    [refreshCart]
  );

  const removeItem = useCallback(
    async (itemId: string) => {
      await api.delete(`/marketplace/cart/items/${itemId}`);
      await refreshCart();
    },
    [refreshCart]
  );

  const itemCount = cart?.items?.reduce((s, i) => s + i.quantity, 0) ?? 0;

  return (
    <CartContext.Provider
      value={{
        cart,
        loading,
        refreshCart,
        addToCart,
        updateQuantity,
        removeItem,
        itemCount,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
