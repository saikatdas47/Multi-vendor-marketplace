import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import client from '../../api/client'
import { aiApi, catalogApi } from '../../api/endpoints'
import {
  Alert,
  Button,
  Field,
  Input,
  Select,
  Skeleton,
  Textarea,
} from '../../components/ui'
import { CheckIcon, SparkleIcon } from '../../components/icons'

const BLANK = {
  name: '',
  sku: '',
  category_id: '',
  short_description: '',
  description: '',
  price: '',
  compare_at_price: '',
  stock: 0,
  low_stock_threshold: 5,
  weight_grams: '',
  status: 'draft',
  is_featured: false,
}

function ImageManager({ product, onChange }) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  async function upload(event) {
    const files = Array.from(event.target.files || [])
    if (!files.length) return

    setUploading(true)
    setError('')
    try {
      for (const [index, file] of files.entries()) {
        const body = new FormData()
        body.append('product', product.id)
        body.append('image', file)
        body.append('alt_text', product.name)
        body.append('is_primary', String(!product.images?.length && index === 0))
        await client.post('/product-images/', body)
      }
      await onChange()
    } catch (err) {
      setError(err.message)
    } finally {
      setUploading(false)
      event.target.value = ''
    }
  }

  async function remove(id) {
    try {
      await client.delete(`/product-images/${id}/`)
      await onChange()
    } catch (err) {
      setError(err.message)
    }
  }

  async function makePrimary(id) {
    try {
      await client.patch(`/product-images/${id}/`, { is_primary: true })
      await onChange()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="rounded-card border border-line bg-surface p-6">
      <h2 className="text-base font-semibold text-fg">Images</h2>
      <p className="mt-1 text-sm text-fg-muted">
        The first image is used on product cards. PNG or JPG, up to 10 MB each.
      </p>

      {error && (
        <div className="mt-3">
          <Alert>{error}</Alert>
        </div>
      )}

      <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4">
        {(product.images ?? []).map((img) => (
          <div key={img.id} className="group relative aspect-square overflow-hidden rounded-lg border border-line">
            <img src={img.image} alt={img.alt_text} className="h-full w-full object-cover" />
            {img.is_primary && (
              <span className="absolute left-1 top-1 rounded bg-brand-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                Primary
              </span>
            )}
            <div className="absolute inset-x-0 bottom-0 flex justify-between bg-black/75 px-1.5 py-1 text-white opacity-0 transition group-hover:opacity-100">
              {!img.is_primary && (
                <button
                  type="button"
                  onClick={() => makePrimary(img.id)}
                  className="text-[10px] font-medium text-white hover:underline"
                >
                  Make primary
                </button>
              )}
              <button
                type="button"
                onClick={() => remove(img.id)}
                className="ml-auto text-[10px] font-medium text-red-200 hover:underline"
              >
                Delete
              </button>
            </div>
          </div>
        ))}

        <label className="grid aspect-square cursor-pointer place-items-center rounded-lg border-2 border-dashed border-line-strong text-center text-xs text-fg-muted hover:border-brand-400 hover:text-brand-600">
          <input type="file" accept="image/*" multiple className="sr-only" onChange={upload} />
          {uploading ? 'Uploading…' : '+ Add images'}
        </label>
      </div>
    </div>
  )
}

/**
 * AI listing assistant.
 *
 * Generates SEO title, description, bullets and meta description in ONE model
 * call, then lets the seller apply each field independently. Nothing is written
 * to the product until they press Save, which keeps a human accountable for
 * claims made about a real product.
 */
function AIListingHelper({ form, onApply }) {
  const [open, setOpen] = useState(false)
  const [brand, setBrand] = useState('')
  const [features, setFeatures] = useState('')
  const [tone, setTone] = useState('professional')
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [applied, setApplied] = useState({})

  const generate = useMutation({
    mutationFn: () =>
      aiApi.draftListing({
        name: form.name,
        category: form.category_id || null,
        brand,
        features,
        short_description: form.short_description,
        tone,
      }),
    onSuccess: (data) => {
      setResult(data)
      setApplied({})
      setError('')
    },
    onError: (err) => {
      setError(err.message)
      setResult(null)
    },
  })

  function apply(field, value) {
    onApply(field, value)
    setApplied((prev) => ({ ...prev, [field]: true }))
  }

  function applyAll() {
    if (!result) return
    onApply('name', result.seo_title)
    onApply('short_description', result.meta_description)
    onApply(
      'description',
      result.bullets.length
        ? `${result.description}\n\n${result.bullets.map((b) => `• ${b}`).join('\n')}`
        : result.description,
    )
    setApplied({ seo_title: true, description: true, meta_description: true })
  }

  if (!form.name) {
    return (
      <div className="rounded-xl border border-dashed border-line-strong bg-surface-muted p-4">
        <p className="flex items-center gap-2 text-xs text-fg-subtle">
          <SparkleIcon className="h-4 w-4" />
          Enter a product name to use the AI listing assistant.
        </p>
      </div>
    )
  }

  const FieldResult = ({ label, field, value, mono }) => (
    <div className="rounded-lg border border-line bg-surface p-3">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">
          {label}
        </span>
        <Button
          size="xs"
          variant={applied[field] ? 'secondary' : 'primary'}
          onClick={() => apply(field, value)}
        >
          {applied[field] ? 'Applied ✓' : 'Use'}
        </Button>
      </div>
      <p className={`whitespace-pre-line text-sm text-fg ${mono ? 'font-mono text-xs' : ''}`}>
        {value}
      </p>
    </div>
  )

  return (
    <div className="overflow-hidden rounded-xl border border-brand-200 bg-gradient-to-br from-brand-50 to-transparent dark:border-brand-800 dark:from-brand-950/40">
      <div className="flex items-center justify-between gap-3 p-4">
        <div className="flex items-start gap-2.5">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-600 text-white">
            <SparkleIcon className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-semibold text-fg">AI listing assistant</p>
            <p className="text-xs text-fg-muted">
              SEO title, description, bullets and meta — one call, you choose what to keep.
            </p>
          </div>
        </div>
        <Button size="sm" variant="secondary" onClick={() => setOpen((v) => !v)}>
          {open ? 'Hide' : 'Open'}
        </Button>
      </div>

      {open && (
        <div className="space-y-4 border-t border-brand-200 p-4 dark:border-brand-800">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Brand" hint="Optional">
              <Input
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder="Logitech"
                maxLength={80}
              />
            </Field>
            <Field label="Tone">
              <Select value={tone} onChange={(e) => setTone(e.target.value)}>
                <option value="professional">Professional</option>
                <option value="friendly">Friendly</option>
                <option value="technical">Technical</option>
                <option value="playful">Playful</option>
              </Select>
            </Field>
          </div>

          <Field
            label="Features"
            hint="One per line, or comma-separated. The AI will not invent specs beyond these."
          >
            <Textarea
              rows={4}
              value={features}
              onChange={(e) => setFeatures(e.target.value)}
              placeholder={'RGB lighting\n16000 DPI sensor\nUSB-C rechargeable\n70h battery'}
              maxLength={400}
            />
          </Field>

          {error && <Alert>{error}</Alert>}

          <Button loading={generate.isPending} onClick={() => generate.mutate()}>
            <SparkleIcon className="h-4 w-4" />
            {result ? 'Regenerate' : 'Generate listing'}
          </Button>

          {result && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">
                  Generated
                </p>
                <Button size="xs" onClick={applyAll}>
                  Apply all
                </Button>
              </div>

              <FieldResult
                label="SEO title"
                field="seo_title"
                value={result.seo_title}
              />

              <div className="rounded-lg border border-line bg-surface p-3">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">
                    Description
                  </span>
                  <Button
                    size="xs"
                    variant={applied.description ? 'secondary' : 'primary'}
                    onClick={() =>
                      apply(
                        'description',
                        result.bullets.length
                          ? `${result.description}\n\n${result.bullets
                              .map((b) => `• ${b}`)
                              .join('\n')}`
                          : result.description,
                      )
                    }
                  >
                    {applied.description ? 'Applied ✓' : 'Use'}
                  </Button>
                </div>
                <p className="whitespace-pre-line text-sm text-fg">{result.description}</p>

                {result.bullets.length > 0 && (
                  <ul className="mt-3 space-y-1 border-t border-line pt-3">
                    {result.bullets.map((bullet) => (
                      <li
                        key={bullet}
                        className="flex items-start gap-2 text-sm text-fg-muted"
                      >
                        <CheckIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-700 dark:text-emerald-400" />
                        {bullet}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <FieldResult
                label="Meta description"
                field="meta_description"
                value={result.meta_description}
                mono
              />

              <Alert tone="warning">
                {result.notice}
              </Alert>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function ProductForm() {
  const { slug } = useParams()
  const isEdit = Boolean(slug)
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [form, setForm] = useState(BLANK)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [message, setMessage] = useState('')

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => catalogApi.categories({ page_size: 100 }),
    staleTime: 5 * 60 * 1000,
  })

  const { data: product, isPending: loadingProduct } = useQuery({
    queryKey: ['product', slug],
    queryFn: () => catalogApi.product(slug),
    enabled: isEdit,
  })

  useEffect(() => {
    if (!product) return
    setForm({
      name: product.name ?? '',
      sku: product.sku ?? '',
      category_id: product.category?.id ?? '',
      short_description: product.short_description ?? '',
      description: product.description ?? '',
      price: product.price ?? '',
      compare_at_price: product.compare_at_price ?? '',
      stock: product.stock ?? 0,
      low_stock_threshold: product.low_stock_threshold ?? 5,
      weight_grams: product.weight_grams ?? '',
      status: product.status ?? 'draft',
      is_featured: product.is_featured ?? false,
    })
  }, [product])

  const save = useMutation({
    mutationFn: () => {
      const payload = { ...form }
      // Django rejects "" for nullable numerics; send null instead.
      for (const key of ['compare_at_price', 'weight_grams']) {
        if (payload[key] === '') payload[key] = null
      }
      return isEdit
        ? catalogApi.updateProduct(slug, payload)
        : catalogApi.createProduct(payload)
    },
    onSuccess: (saved) => {
      setError('')
      setFieldErrors({})
      setMessage('Saved.')
      queryClient.invalidateQueries({ queryKey: ['seller-products'] })
      queryClient.invalidateQueries({ queryKey: ['seller-low-stock'] })
      if (!isEdit) navigate(`/seller/products/${saved.slug}`, { replace: true })
    },
    onError: (err) => {
      setError(err.message)
      setFieldErrors(err.fields || {})
      setMessage('')
    },
  })

  const update = (key) => (e) =>
    setForm((f) => ({
      ...f,
      [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value,
    }))

  if (isEdit && loadingProduct) {
    return <Skeleton className="h-96" />
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight text-fg">
          {isEdit ? 'Edit product' : 'New product'}
        </h1>
        <Button as={Link} to="/seller/products" variant="ghost" size="sm">
          ← Back to products
        </Button>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          save.mutate()
        }}
        className="space-y-5 rounded-card border border-line bg-surface p-6"
      >
        <Alert>{error}</Alert>
        <Alert tone="success">{message}</Alert>

        <Field label="Product name" required error={fieldErrors.name}>
          <Input required value={form.name} onChange={update('name')} maxLength={200} />
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="SKU" required error={fieldErrors.sku} hint="Must be unique across the platform.">
            <Input required value={form.sku} onChange={update('sku')} maxLength={64} />
          </Field>
          <Field label="Category" required error={fieldErrors.category_id}>
            <Select required value={form.category_id} onChange={update('category_id')}>
              <option value="">Select a category…</option>
              {(categories?.results ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_path}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="Short description" error={fieldErrors.short_description}>
          <Input
            value={form.short_description}
            onChange={update('short_description')}
            maxLength={300}
            placeholder="One line shown under the product name"
          />
        </Field>

        <Field label="Full description" error={fieldErrors.description}>
          <Textarea
            rows={7}
            value={form.description}
            onChange={update('description')}
            placeholder="What is it, who is it for, what makes it worth buying?"
          />
        </Field>

        <AIListingHelper
          form={form}
          onApply={(field, value) => setForm((f) => ({ ...f, [field]: value }))}
        />

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Price" required error={fieldErrors.price}>
            <Input
              type="number"
              step="0.01"
              min="0.01"
              required
              value={form.price}
              onChange={update('price')}
            />
          </Field>
          <Field
            label="Compare-at price"
            error={fieldErrors.compare_at_price}
            hint="Shown struck through. Must exceed the price."
          >
            <Input
              type="number"
              step="0.01"
              min="0"
              value={form.compare_at_price ?? ''}
              onChange={update('compare_at_price')}
            />
          </Field>
        </div>

        <div className="grid gap-5 sm:grid-cols-3">
          <Field label="Stock" error={fieldErrors.stock}>
            <Input type="number" min="0" value={form.stock} onChange={update('stock')} />
          </Field>
          <Field label="Low-stock alert at" error={fieldErrors.low_stock_threshold}>
            <Input
              type="number"
              min="0"
              value={form.low_stock_threshold}
              onChange={update('low_stock_threshold')}
            />
          </Field>
          <Field label="Weight (grams)" error={fieldErrors.weight_grams}>
            <Input
              type="number"
              min="0"
              value={form.weight_grams ?? ''}
              onChange={update('weight_grams')}
            />
          </Field>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Status" error={fieldErrors.status}>
            <Select value={form.status} onChange={update('status')}>
              <option value="draft">Draft — not visible to shoppers</option>
              <option value="published">Published — live in the catalogue</option>
              <option value="archived">Archived</option>
            </Select>
          </Field>
          <label className="flex items-end gap-2 pb-2 text-sm text-fg">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-line-strong accent-brand-600 focus:ring-brand-500"
              checked={form.is_featured}
              onChange={update('is_featured')}
            />
            Feature on the homepage
          </label>
        </div>

        <div className="flex gap-3 border-t border-line pt-5">
          <Button type="submit" loading={save.isPending}>
            {isEdit ? 'Save changes' : 'Create product'}
          </Button>
          <Button as={Link} to="/seller/products" variant="secondary">
            Cancel
          </Button>
        </div>
      </form>

      {isEdit && product && (
        <ImageManager
          product={product}
          onChange={() => queryClient.invalidateQueries({ queryKey: ['product', slug] })}
        />
      )}

      {!isEdit && (
        <p className="text-sm text-fg-muted">
          Save the product first, then you can upload images.
        </p>
      )}
    </div>
  )
}
