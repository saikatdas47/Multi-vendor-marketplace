import { test, expect } from '@playwright/test'

test('customer can sign in, add a product and reach checkout', async ({ page }) => {
  await page.goto('/login')
  await page.getByRole('button', { name: 'Customer Use' }).click()
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL('/')
  await page.goto('/products/lumen-7-pro-smartphone')
  const option = page.getByRole('button', { name: /Premium/ }).first()
  await expect(option).toBeVisible()
  await option.click()
  const addToCart = page.getByRole('button', { name: 'Add to cart' })
  await expect(addToCart).toBeEnabled()
  await addToCart.click()
  await page.goto('/cart')
  await expect(page.getByText('Lumen 7 Pro Smartphone')).toBeVisible()
  await page.getByRole('link', { name: /checkout/i }).click()
  await expect(page).toHaveURL(/checkout/)
})
