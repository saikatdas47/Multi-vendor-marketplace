import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { adminApi, adminNoticeApi } from '../../api/endpoints'
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  EmptyState,
  Field,
  Input,
  Skeleton,
  Textarea,
} from '../../components/ui'
import { MegaphoneIcon } from '../../components/icons'
import { useToast } from '../../hooks/useToast'

function rows(data) {
  return Array.isArray(data) ? data : (data?.results ?? [])
}

function Composer({ sellers, onSent }) {
  const toast = useToast()
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [sendToAll, setSendToAll] = useState(true)
  const [selected, setSelected] = useState([])

  const send = useMutation({
    mutationFn: () =>
      adminNoticeApi.send({
        subject: subject.trim(),
        body: body.trim(),
        // Mutually exclusive on the server too: sending both is a 400 rather
        // than a silent broadcast.
        send_to_all: sendToAll,
        ...(sendToAll ? {} : { seller_ids: selected }),
      }),
    onSuccess: (data) => {
      setSubject('')
      setBody('')
      setSelected([])
      toast.success(
        `Notice delivered to ${data.delivered_to} seller${data.delivered_to === 1 ? '' : 's'}.`,
      )
      onSent(data)
    },
    onError: (err) => toast.error(err.message),
  })

  const toggle = (id) =>
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )

  const ready = subject.trim() && body.trim() && (sendToAll || selected.length > 0)

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (ready && !send.isPending) send.mutate()
      }}
      className="rounded-card border border-line bg-surface p-5"
    >
      <h2 className="text-base font-semibold text-fg">Send a notice</h2>
      <p className="mt-1 text-sm text-fg-muted">
        Sellers see this in their dashboard inbox. Rejected applications are
        excluded automatically.
      </p>

      <div className="mt-4 space-y-4">
        <Field label="Subject" htmlFor="notice-subject" required>
          <Input
            id="notice-subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={160}
            placeholder="Scheduled maintenance on Sunday"
          />
        </Field>

        <Field label="Message" htmlFor="notice-body" required>
          <Textarea
            id="notice-body"
            rows={5}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="What do sellers need to know?"
          />
        </Field>

        <Checkbox
          checked={sendToAll}
          onChange={(e) => setSendToAll(e.target.checked)}
          label="Send to all sellers"
          description="Includes pending applications, so you can ask for missing documents."
        />

        {!sendToAll && (
          <div className="rounded-lg border border-line bg-surface-muted p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-fg-subtle">
              Recipients ({selected.length} selected)
            </p>
            {sellers.length === 0 ? (
              <p className="text-sm text-fg-muted">No sellers registered yet.</p>
            ) : (
              <div className="max-h-52 space-y-1 overflow-y-auto">
                {sellers.map((seller) => (
                  <Checkbox
                    key={seller.id}
                    checked={selected.includes(seller.id)}
                    onChange={() => toggle(seller.id)}
                    label={seller.shop_name}
                    description={seller.email}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Errors stay inline — they belong next to the form that caused
            them. Success is a toast, because the form clears itself and an
            inline confirmation would sit above an empty box. */}
        {send.isError && <Alert>{send.error.message}</Alert>}

        <Button type="submit" disabled={!ready} loading={send.isPending}>
          <MegaphoneIcon className="h-4 w-4" />
          Send notice
        </Button>
      </div>
    </form>
  )
}

export default function AdminNotices() {
  const queryClient = useQueryClient()

  const { data: sellerData } = useQuery({
    queryKey: ['admin-sellers', { status: '' }],
    queryFn: () => adminApi.sellers({}),
  })

  const { data: noticeData, isLoading, isError, error } = useQuery({
    queryKey: ['admin-notices'],
    queryFn: () => adminNoticeApi.list(),
  })

  const notices = rows(noticeData)

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-fg">Notices</h1>
        <p className="mt-1 text-sm text-fg-muted">
          Announcements to one seller, several, or everyone.
        </p>
      </header>

      <Composer
        sellers={rows(sellerData)}
        onSent={() => queryClient.invalidateQueries({ queryKey: ['admin-notices'] })}
      />

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-fg-subtle">
          Sent
        </h2>

        {isError && <Alert>{error.message}</Alert>}

        {isLoading ? (
          <Skeleton className="h-32" />
        ) : notices.length === 0 ? (
          <EmptyState
            icon={<MegaphoneIcon className="h-6 w-6" />}
            title="No notices sent"
            description="Anything you send will be listed here with read counts."
          />
        ) : (
          <ul className="space-y-3">
            {notices.map((notice) => (
              <li
                key={notice.id}
                className="rounded-card border border-line bg-surface p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h3 className="font-semibold text-fg">{notice.subject}</h3>
                  <div className="flex items-center gap-2">
                    <Badge tone={notice.audience === 'all' ? 'brand' : 'slate'}>
                      {notice.audience === 'all' ? 'All sellers' : 'Selected'}
                    </Badge>
                    <Badge tone="green">
                      {notice.read_count}/{notice.recipient_count} read
                    </Badge>
                  </div>
                </div>
                <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-fg-muted">
                  {notice.body}
                </p>
                <p className="mt-2 text-xs text-fg-subtle">
                  {new Date(notice.created_at).toLocaleString()}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
