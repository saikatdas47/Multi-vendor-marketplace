import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { messageApi } from '../../api/endpoints'
import { MegaphoneIcon } from '../../components/icons'
import {
  Alert,
  Button,
  EmptyState,
  PageHeader,
  Skeleton,
  Textarea,
} from '../../components/ui'
import { cn } from '../../lib/cn'
import { useToast } from '../../hooks/useToast'

// Bubble background, label colour and timestamp colour are one decision, kept
// in one place so they cannot drift apart. Note this is the mirror of the admin
// view: here *you* are the seller, so the seller side is the branded one.
const SIDE = {
  admin: {
    align: 'justify-start',
    bubble: 'rounded-bl-md bg-surface-muted text-fg',
    meta: 'text-fg-subtle',
    label: 'CommerceX team',
  },
  seller: {
    align: 'justify-end',
    bubble: 'rounded-br-md bg-brand-600 text-white',
    meta: 'text-brand-100',
    label: 'You',
  },
}

export default function SellerMessages() {
  const [body, setBody] = useState('')
  const endRef = useRef(null)
  const toast = useToast()
  const queryClient = useQueryClient()

  const thread = useQuery({
    queryKey: ['seller-thread'],
    queryFn: messageApi.thread,
    refetchInterval: 60_000,
  })

  const send = useMutation({
    mutationFn: () => messageApi.reply(body.trim()),
    onSuccess: () => {
      setBody('')
      toast.success('Message sent to the platform team.')
      queryClient.invalidateQueries({ queryKey: ['seller-thread'] })
      queryClient.invalidateQueries({ queryKey: ['seller-thread-unread'] })
    },
    onError: (err) => toast.error(err.message),
  })

  const messages = thread.data?.messages ?? []

  // Reading the thread marks it read server-side, so the sidebar badge is stale
  // as soon as the transcript loads.
  useEffect(() => {
    if (thread.isSuccess) {
      queryClient.invalidateQueries({ queryKey: ['seller-thread-unread'] })
    }
  }, [thread.isSuccess, messages.length, queryClient])

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' })
  }, [messages.length])

  return (
    <div>
      <PageHeader
        title="Messages"
        subtitle="Your direct line to the CommerceX team. Ask about approval, fees or anything else."
      />

      {thread.isError && (
        <div className="mb-4">
          <Alert>{thread.error.message}</Alert>
        </div>
      )}

      <div className="rounded-card border border-line bg-surface">
        {thread.isLoading ? (
          <div className="p-4">
            <Skeleton className="h-56" />
          </div>
        ) : messages.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={<MegaphoneIcon className="h-6 w-6" />}
              title="No messages yet"
              description="Write below and the platform team will see it in their inbox."
            />
          </div>
        ) : (
          <div className="max-h-[28rem] space-y-2.5 overflow-y-auto p-4">
            {messages.map((message) => {
              const tone = message.is_admin ? SIDE.admin : SIDE.seller
              return (
                <div key={message.id} className={cn('flex', tone.align)}>
                  <div
                    className={cn(
                      'max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed',
                      tone.bubble,
                    )}
                  >
                    <p
                      className={cn(
                        'mb-1 text-[11px] font-semibold uppercase tracking-wider',
                        tone.meta,
                      )}
                    >
                      {tone.label}
                    </p>
                    <p className="whitespace-pre-line">{message.body}</p>
                    <p className={cn('mt-1 text-[11px]', tone.meta)}>
                      {new Date(message.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
              )
            })}
            <div ref={endRef} />
          </div>
        )}

        <form
          className="flex items-end gap-2 border-t border-line p-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (body.trim() && !send.isPending) send.mutate()
          }}
        >
          <Textarea
            rows={2}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write to the platform team…"
            className="flex-1"
          />
          <Button type="submit" disabled={!body.trim()} loading={send.isPending}>
            Send
          </Button>
        </form>
      </div>
    </div>
  )
}
