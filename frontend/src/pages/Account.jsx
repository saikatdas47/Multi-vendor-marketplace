import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { authApi, profileApi } from '../api/endpoints'
import { useAuth } from '../hooks/useAuth'
import {
  Alert,
  Badge,
  Button,
  Field,
  Input,
  PageHeader,
  Skeleton,
} from '../components/ui'

function ProfileCard() {
  const { user, refreshUser } = useAuth()
  const [form, setForm] = useState({
    first_name: user.first_name || '',
    last_name: user.last_name || '',
    phone: user.phone || '',
  })
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const mutation = useMutation({
    mutationFn: () => authApi.updateMe(form),
    onSuccess: async () => {
      setMessage('Profile updated.')
      setError('')
      await refreshUser()
    },
    onError: (err) => {
      setError(err.message)
      setMessage('')
    },
  })

  const update = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        mutation.mutate()
      }}
      className="space-y-4 rounded-card border border-line bg-surface p-6"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-fg">Profile</h2>
        <Badge tone="brand">{user.role}</Badge>
      </div>

      <Alert>{error}</Alert>
      <Alert tone="success">{message}</Alert>

      <Field label="Email">
        {/* No className: CONTROL_BASE already carries disabled:bg-surface-muted,
                  so this was both redundant and unreliable. */}
              <Input value={user.email} disabled />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="First name">
          <Input value={form.first_name} onChange={update('first_name')} />
        </Field>
        <Field label="Last name">
          <Input value={form.last_name} onChange={update('last_name')} />
        </Field>
      </div>

      <Field label="Phone">
        <Input value={form.phone} onChange={update('phone')} />
      </Field>

      <Button type="submit" loading={mutation.isPending}>
        Save changes
      </Button>
    </form>
  )
}

function PasswordCard() {
  const [form, setForm] = useState({ old_password: '', new_password: '' })
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})

  const mutation = useMutation({
    mutationFn: () => authApi.changePassword(form),
    onSuccess: () => {
      setForm({ old_password: '', new_password: '' })
      setMessage('Password changed.')
      setError('')
      setFieldErrors({})
    },
    onError: (err) => {
      setError(err.message)
      setFieldErrors(err.fields || {})
      setMessage('')
    },
  })

  const update = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        mutation.mutate()
      }}
      className="space-y-4 rounded-card border border-line bg-surface p-6"
    >
      <h2 className="text-base font-semibold text-fg">Change password</h2>

      <Alert>{error}</Alert>
      <Alert tone="success">{message}</Alert>

      <Field label="Current password" required error={fieldErrors.old_password}>
        <Input
          type="password"
          required
          autoComplete="current-password"
          value={form.old_password}
          onChange={update('old_password')}
        />
      </Field>

      <Field label="New password" required error={fieldErrors.new_password} hint="At least 8 characters.">
        <Input
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          value={form.new_password}
          onChange={update('new_password')}
        />
      </Field>

      <Button type="submit" loading={mutation.isPending}>
        Update password
      </Button>
    </form>
  )
}

function AddressCard() {
  const queryClient = useQueryClient()
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    label: 'Home',
    full_name: '',
    phone: '',
    line1: '',
    city: '',
    postal_code: '',
    country: 'Bangladesh',
  })

  const { data, isPending } = useQuery({
    queryKey: ['addresses'],
    queryFn: profileApi.addresses,
  })

  const createMutation = useMutation({
    mutationFn: () => profileApi.createAddress(form),
    onSuccess: () => {
      setAdding(false)
      setError('')
      queryClient.invalidateQueries({ queryKey: ['addresses'] })
    },
    onError: (err) => setError(err.message),
  })

  const deleteMutation = useMutation({
    mutationFn: profileApi.deleteAddress,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['addresses'] }),
  })

  const update = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  return (
    <div className="space-y-4 rounded-card border border-line bg-surface p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-fg">Addresses</h2>
        <Button size="sm" variant="secondary" onClick={() => setAdding((v) => !v)}>
          {adding ? 'Cancel' : 'Add address'}
        </Button>
      </div>

      {adding && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            createMutation.mutate()
          }}
          className="space-y-3 rounded-lg bg-surface-muted p-4"
        >
          <Alert>{error}</Alert>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Label">
              <Input value={form.label} onChange={update('label')} />
            </Field>
            <Field label="Full name" required>
              <Input required value={form.full_name} onChange={update('full_name')} />
            </Field>
            <Field label="Phone" required>
              <Input required value={form.phone} onChange={update('phone')} />
            </Field>
            <Field label="Postal code" required>
              <Input required value={form.postal_code} onChange={update('postal_code')} />
            </Field>
          </div>
          <Field label="Address line" required>
            <Input required value={form.line1} onChange={update('line1')} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="City" required>
              <Input required value={form.city} onChange={update('city')} />
            </Field>
            <Field label="Country">
              <Input value={form.country} onChange={update('country')} />
            </Field>
          </div>
          <Button type="submit" size="sm" loading={createMutation.isPending}>
            Save address
          </Button>
        </form>
      )}

      {isPending ? (
        <Skeleton className="h-20" />
      ) : data?.results?.length ? (
        <ul className="divide-y divide-line">
          {data.results.map((address) => (
            <li key={address.id} className="flex items-start justify-between gap-4 py-3">
              <div className="text-sm">
                <p className="font-medium text-fg">
                  {address.full_name}
                  {address.is_default && (
                    <span className="ml-2">
                      <Badge tone="green">Default</Badge>
                    </span>
                  )}
                </p>
                <p className="text-fg-muted">
                  {address.line1}, {address.city} {address.postal_code}, {address.country}
                </p>
                <p className="text-fg-subtle">{address.phone}</p>
              </div>
              <button
                onClick={() => deleteMutation.mutate(address.id)}
                className="text-xs font-medium text-red-600 dark:text-red-400 hover:text-red-700"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-4 text-sm text-fg-muted">No addresses saved yet.</p>
      )}
    </div>
  )
}

export default function Account() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="My account" subtitle="Manage your profile, password and addresses." />
      <div className="space-y-6">
        <ProfileCard />
        <AddressCard />
        <PasswordCard />
      </div>
    </div>
  )
}
