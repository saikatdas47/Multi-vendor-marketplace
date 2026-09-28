import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import ErrorBoundary from './components/ErrorBoundary'
import { RequireRole } from './components/RouteGuards'
import { AuthProvider } from './context/AuthContext'
import { ThemeProvider } from './context/ThemeContext'
import { ToastProvider } from './context/ToastContext'
import AdminLayout from './layouts/AdminLayout'
import CustomerLayout from './layouts/CustomerLayout'
import SellerLayout from './layouts/SellerLayout'
import { Forbidden, NotFound } from './pages/Errors'
import { adminRoutes } from './app/routes/adminRoutes'
import { customerRoutes } from './app/routes/customerRoutes'
import { sellerRoutes } from './app/routes/sellerRoutes'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      // Auth and permission failures will never succeed on retry.
      retry: (failureCount, error) =>
        ![401, 403, 404].includes(error?.status) && failureCount < 2,
    },
  },
})

export default function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AuthProvider>
            <ToastProvider>
              {/* Wraps the routes, not the providers: a render error should
                  cost you the page, not the theme, the toasts or the session.
                  Without this a single bad render unmounts everything and the
                  screen just goes white. */}
              <ErrorBoundary>
                <Routes>
                  {/* Three separate trees, one per role. Each guard wraps its
                      *layout* rather than the children, so a seller who opens
                      /admin never paints the admin shell around a redirect. */}
                  <Route element={<CustomerLayout />}>{customerRoutes}</Route>

                  <Route element={<RequireRole role="seller" />}>
                    <Route path="seller" element={<SellerLayout />}>
                      {sellerRoutes}
                    </Route>
                  </Route>

                  <Route element={<RequireRole role="admin" />}>
                    <Route path="admin" element={<AdminLayout />}>
                      {adminRoutes}
                    </Route>
                  </Route>

                  {/* Errors sit outside the trees: /forbidden is reachable by any
                      role, and a 404 must not render a shell the visitor has no
                      access to. */}
                  <Route path="forbidden" element={<Forbidden />} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </ErrorBoundary>
            </ToastProvider>
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ThemeProvider>
  )
}
