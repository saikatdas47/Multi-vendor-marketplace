import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { cartApi, wishlistApi } from '../api/endpoints'
import { useAuth } from './useAuth'

const CART_KEY = ['cart']
const WISHLIST_KEY = ['wishlist']

/**
 * Cart state lives in TanStack Query rather than a bespoke context: the server
 * is the source of truth (it enforces stock), and every mutation returns the
 * whole cart, so we can write the response straight into the cache instead of
 * refetching.
 */
export function useCart() {
  const { isAuthenticated } = useAuth()
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: CART_KEY,
    queryFn: cartApi.get,
    enabled: isAuthenticated,
    staleTime: 10_000,
  })

  const writeCart = (cart) => queryClient.setQueryData(CART_KEY, cart)

  const addItem = useMutation({
    mutationFn: ({ productId, variantId, quantity = 1 }) =>
      cartApi.addItem({
        product: productId,
        ...(variantId ? { variant: variantId } : {}),
        quantity,
      }),
    onSuccess: writeCart,
  })

  const updateItem = useMutation({
    mutationFn: ({ itemId, quantity }) => cartApi.updateItem(itemId, quantity),
    onSuccess: writeCart,
  })

  const removeItem = useMutation({
    mutationFn: (itemId) => cartApi.removeItem(itemId),
    onSuccess: writeCart,
  })

  const resyncPrice = useMutation({
    mutationFn: (itemId) => cartApi.resyncPrice(itemId),
    onSuccess: writeCart,
  })

  const clear = useMutation({
    mutationFn: cartApi.clear,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CART_KEY }),
  })

  const cart = query.data

  return {
    cart,
    items: cart?.items ?? [],
    itemCount: cart?.total_quantity ?? 0,
    subtotal: cart?.subtotal ?? '0.00',
    issues: cart?.issues ?? [],
    isLoading: query.isPending && isAuthenticated,
    addItem,
    updateItem,
    removeItem,
    resyncPrice,
    clear,
  }
}

export function useWishlist() {
  const { isAuthenticated } = useAuth()
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: WISHLIST_KEY,
    queryFn: wishlistApi.list,
    enabled: isAuthenticated,
    staleTime: 30_000,
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: WISHLIST_KEY })
    queryClient.invalidateQueries({ queryKey: CART_KEY })
  }

  const toggle = useMutation({
    mutationFn: wishlistApi.toggle,
    onSuccess: invalidate,
  })

  const moveToCart = useMutation({
    mutationFn: wishlistApi.moveToCart,
    onSuccess: invalidate,
  })

  const items = query.data?.results ?? []

  return {
    items,
    isLoading: query.isPending && isAuthenticated,
    toggle,
    moveToCart,
    has: (productId) => items.some((i) => i.product?.id === productId),
  }
}
