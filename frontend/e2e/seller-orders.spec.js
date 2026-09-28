import { test, expect } from '@playwright/test'

test('seller can update an order line', async ({ page }) => {
  await page.goto('/login')
  await page.getByRole('button', { name: 'Seller Use' }).click()
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/seller/)
  await page.goto('/seller/orders')
  await expect(page.getByPlaceholder('Order number or product…')).toBeVisible()

  const row = page.locator('tbody tr').filter({ has: page.getByRole('button', { name: 'Update' }) }).first()
  await expect(row).toBeVisible()
  const nextStatus = await row.locator('select').inputValue()
  if (nextStatus === 'shipped') {
    await row.getByPlaceholder('Tracking number (optional)').fill(`E2E-${Date.now()}`)
  }
  const response = page.waitForResponse(
    (res) => res.url().includes('/seller/order-items/') && res.request().method() === 'POST',
  )
  await row.getByRole('button', { name: 'Update' }).click()
  const updateResponse = await response
  expect(updateResponse.ok()).toBeTruthy()
  expect((await updateResponse.json()).status).toBe(nextStatus)
})
