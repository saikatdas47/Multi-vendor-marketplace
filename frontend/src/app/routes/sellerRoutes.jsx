import { Route } from 'react-router-dom'

import ProductForm from '../../pages/seller/ProductForm'
import SellerBilling from '../../pages/seller/SellerBilling'
import SellerInventory from '../../pages/seller/SellerInventory'
import SellerMessages from '../../pages/seller/SellerMessages'
import SellerNotices from '../../pages/seller/SellerNotices'
import SellerOrders from '../../pages/seller/SellerOrders'
import SellerOverview from '../../pages/seller/SellerOverview'
import SellerProducts from '../../pages/seller/SellerProducts'
import ShopPreview from '../../pages/seller/ShopPreview'
import StoreSettings from '../../pages/seller/StoreSettings'

/**
 * The seller's own shop, and nothing else.
 *
 * `/seller` lands on their product list: "my shop's products" is what a seller
 * opens the dashboard to see. The stats overview keeps its own route rather
 * than being deleted — it is a working page.
 *
 * There is no route to another shop's products from here. `ShopPreview` shows
 * the seller their *own* storefront as a customer sees it, which is the only
 * shop-facing view they get.
 */
export const sellerRoutes = (
  <>
    <Route index element={<SellerProducts />} />
    <Route path="dashboard" element={<SellerOverview />} />
    <Route path="products" element={<SellerProducts />} />
    <Route path="products/new" element={<ProductForm />} />
    <Route path="products/:slug" element={<ProductForm />} />
    <Route path="inventory" element={<SellerInventory />} />
    {/* Order status is a query param, not four routes: the pending / processing
        / delivered / cancelled tabs differ by one filter and share the table,
        the pagination and the status mutation. */}
    <Route path="orders" element={<SellerOrders />} />
    <Route path="store" element={<StoreSettings />} />
    <Route path="preview" element={<ShopPreview />} />
    <Route path="billing" element={<SellerBilling />} />
    <Route path="messages" element={<SellerMessages />} />
    <Route path="notices" element={<SellerNotices />} />
  </>
)
