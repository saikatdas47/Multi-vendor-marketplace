import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { profileApi } from '../../api/endpoints'
import {
  Alert,
  Button,
  Field,
  Input,
  Skeleton,
} from '../../components/ui'

export default function StoreSettings() {
  const queryClient = useQueryClient()
  const [form, setForm] = useState({
    shop_name: '',
    description: '',
    business_email: '',
    business_phone: '',
    tax_id: '',
  })
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [message, setMessage] = useState('')

  const { data: profile, isPending } = useQuery({
    queryKey: ['seller-profile'],
    queryFn: profileApi.seller,
  })

  useEffect(() => {
    if (!profile) return
    setForm({
      shop_name: profile.shop_name ?? '',
      description: profile.description ?? '',
      business_email: profile.business_email ?? '',
      business_phone: profile.business_phone ?? '',
      tax_id: profile.tax_id ?? '',
    })
  }, [profile])

  const save = useMutation({
    mutationFn: () => profileApi.updateSeller(form),
    onSuccess: () => {
      setMessage('Store settings saved.')
      setError('')
      setFieldErrors({})
      queryClient.invalidateQueries({ queryKey: ['seller-profile'] })
    },
    onError: (err) => {
      setError(err.message)
      setFieldErrors(err.fields || {})
      setMessage('')
    },
  })

  const update = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  if (isPending) return <Skeleton className="h-96" />

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          save.mutate()
        }}
        className="space-y-5 rounded-card border border-line bg-surface p-6"
      >
        <h2 className="text-base font-semibold text-fg">Store details</h2>

        <Alert>{error}</Alert>
        <Alert tone="success">{message}</Alert>

        <Field label="Shop name" required error={fieldErrors.shop_name}>
          <Input required value={form.shop_name} onChange={update('shop_name')} maxLength={150} />
        </Field>

        <Field label="About your store" error={fieldErrors.description}>
          <textarea
            rows={5}
            className="w-full rounded-lg border border-line-strong px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
            value={form.description}
            onChange={update('description')}
            placeholder="What do you sell? Shown on your public shop page."
          />
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Business email" error={fieldErrors.business_email}>
            <Input type="email" value={form.business_email} onChange={update('business_email')} />
          </Field>
          <Field label="Business phone" error={fieldErrors.business_phone}>
            <Input value={form.business_phone} onChange={update('business_phone')} />
          </Field>
        </div>

        <Field label="Tax ID" error={fieldErrors.tax_id}>
          <Input value={form.tax_id} onChange={update('tax_id')} maxLength={60} />
        </Field>

        <Button type="submit" loading={save.isPending}>
          Save settings
        </Button>
      </form>

      <div className="rounded-card border border-line bg-surface p-6">
        <h2 className="text-base font-semibold text-fg">Account status</h2>
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <dt className="text-fg-muted">Status</dt>
          <dd className="font-medium text-fg">{profile?.status}</dd>
          <dt className="text-fg-muted">Commission rate</dt>
          <dd className="text-fg">{profile?.commission_rate}%</dd>
          <dt className="text-fg-muted">Shop URL</dt>
          <dd className="text-fg">/{profile?.slug}</dd>
          <dt className="text-fg-muted">Joined</dt>
          <dd className="text-fg">
            {profile?.created_at && new Date(profile.created_at).toLocaleDateString()}
          </dd>
        </dl>
        <p className="mt-4 text-xs text-fg-subtle">
          Status and commission rate are set by platform admins.
        </p>
      </div>
    </div>
  )
}
