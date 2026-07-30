import { Route } from 'react-router-dom'

import { RequireAnonymous, RequireRole } from '../../components/RouteGuards'
import Account from '../../pages/Account'
import Cart from '../../pages/Cart'
import Categories from '../../pages/Categories'
import Checkout from '../../pages/Checkout'
import Home from '../../pages/Home'
import OrderDetail from '../../pages/OrderDetail'
import Orders from '../../pages/Orders'
import ProductDetail from '../../pages/ProductDetail'
import ProductList from '../../pages/ProductList'
import ShopDetail from '../../pages/ShopDetail'
import ShopList from '../../pages/ShopList'
import Wishlist from '../../pages/Wishlist'
import ForgotPassword from '../../pages/auth/ForgotPassword'
import Login from '../../pages/auth/Login'
import Register from '../../pages/auth/Register'
import ResetPassword from '../../pages/auth/ResetPassword'
import VerifyEmail from '../../pages/auth/VerifyEmail'

/**
 * The marketplace. Public browsing plus the customer-only routes.
 *
 * `RequireRole role="customer"` rather than the old `RequireAuth`: a signed-in
 * seller could previously open /cart and /checkout, and the backend accepted the
 * requests too. Both halves of that are now closed.
 */
export const customerRoutes = (
  <>
    <Route index element={<Home />} />
    <Route path="products" element={<ProductList />} />
    <Route path="products/:slug" element={<ProductDetail />} />
    <Route path="categories" element={<Categories />} />
    <Route path="shops" element={<ShopList />} />
    <Route path="shops/:slug" element={<ShopDetail />} />

    {/* Verification works signed in or out — the link arrives by email and may
        be opened in a different browser. */}
    <Route path="verify-email" element={<VerifyEmail />} />

    <Route element={<RequireAnonymous />}>
      <Route path="login" element={<Login />} />
      <Route path="register" element={<Register />} />
      <Route path="forgot-password" element={<ForgotPassword />} />
      <Route path="reset-password" element={<ResetPassword />} />
    </Route>

    <Route element={<RequireRole role="customer" />}>
      <Route path="account" element={<Account />} />
      <Route path="cart" element={<Cart />} />
      <Route path="checkout" element={<Checkout />} />
      <Route path="orders" element={<Orders />} />
      <Route path="orders/:number" element={<OrderDetail />} />
      <Route path="wishlist" element={<Wishlist />} />
    </Route>
  </>
)
