import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { adminApi, adminMessageApi } from '../../api/endpoints'
import DataState from '../../components/DataState'
import { MegaphoneIcon, PlusIcon } from '../../components/icons'
import {
  Badge,
  Button,
  EmptyState,
  Input,
  PageHeader,
  Skeleton,
  Textarea,
  Thumb,
} from '../../components/ui'
import { cn } from '../../lib/cn'
import { useToast } from '../../hooks/useToast'
import { connectSocket } from '../../api/socket'

function rows(data) {
  return Array.isArray(data) ? data : (data?.results ?? [])
}

const SIDE = {
  admin: {
    align: 'justify-end',
    bubble: 'rounded-br-md bg-brand-600 text-white',
    meta: 'text-brand-100',
  },
  seller: {
    align: 'justify-start',
    bubble: 'rounded-bl-md bg-surface-muted text-fg',
    meta: 'text-fg-subtle',
  },
}

function Transcript({ messages }) {
  const endRef = useRef(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' })
  }, [messages])

  return (
    <div className="max-h-[26rem] space-y-2.5 overflow-y-auto p-4">
      {messages.map((message) => {
        // Bubble background, body colour and timestamp colour are one decision.
        // Splitting them across three ternaries on the same condition is how a
        // dark bubble ends up with dark text after someone edits one of them.
        const tone = message.side === 'admin' ? SIDE.admin : SIDE.seller
        return (
          <div key={message.id} className={cn('flex', tone.align)}>
            <div
              className={cn(
                'max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed',
                tone.bubble,
              )}
            >
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
  )
}

/**
 * Start a thread with a shop that has never written in.
 *
 * The inbox can only ever list conversations that already exist, so without
 * this the only way to open one was the seller detail page — which meant the
 * Messages screen looked like it simply could not send. Same endpoint as a
 * reply: it is addressed by seller id and creates the thread on demand.
 */
function NewConversation({ existingSellerIds, onSent, onCancel }) {
  const [search, setSearch] = useState('')
  const [picked, setPicked] = useState(null)
  const [body, setBody] = useState('')
  const toast = useToast()

  const sellers = useQuery({
    queryKey: ['admin-sellers', { status: '' }],
    queryFn: () => adminApi.sellers({}),
  })

  const send = useMutation({
    mutationFn: () => adminMessageApi.send(picked.id, body.trim()),
    onSuccess: (thread) => {
      toast.success(`Message sent to ${picked.shop_name}.`)
      setPicked(null)
      setBody('')
      onSent(thread)
    },
    onError: (err) => toast.error(err.message),
  })

  const term = search.trim().toLowerCase()
  const candidates = rows(sellers.data).filter(
    (s) =>
      !term ||
      s.shop_name.toLowerCase().includes(term) ||
      (s.email ?? '').toLowerCase().includes(term),
  )

  return (
    <div className="mb-4 rounded-card border border-brand-200 bg-surface p-4 dark:border-brand-800">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-fg">
          {picked ? `Message ${picked.shop_name}` : 'Pick a shop'}
        </h2>
        <Button size="xs" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>

      {picked ? (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (body.trim() && !send.isPending) send.mutate()
          }}
        >
          <Textarea
            rows={3}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={`Write to ${picked.shop_name}…`}
            autoFocus
          />
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={!body.trim()} loading={send.isPending}>
              Send
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setPicked(null)}>
              Choose another shop
            </Button>
          </div>
        </form>
      ) : (
        <>
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search shops"
            autoFocus
          />
          <ul className="mt-2 max-h-56 divide-y divide-line overflow-y-auto rounded-lg border border-line">
            {candidates.length === 0 ? (
              <li className="px-3 py-4 text-sm text-fg-muted">
                {sellers.isLoading ? 'Loading shops…' : 'No shops match that search.'}
              </li>
            ) : (
              candidates.map((seller) => (
                <li key={seller.id}>
                  <button
                    onClick={() => setPicked(seller)}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition hover:bg-surface-hover"
                  >
                    <Thumb src={seller.logo} alt="" className="h-7 w-7 shrink-0 rounded-md" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-fg">
                        {seller.shop_name}
                      </span>
                      <span className="block truncate text-xs text-fg-subtle">
                        {seller.email}
                      </span>
                    </span>
                    {existingSellerIds.has(seller.id) && (
                      <Badge tone="slate" size="sm">
                        Existing
                      </Badge>
                    )}
                  </button>
                </li>
              ))
            )}
          </ul>
        </>
      )}
    </div>
  )
}

export default function AdminMessages() {
  const [openId, setOpenId] = useState(null)
  const [body, setBody] = useState('')
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [composing, setComposing] = useState(false)
  const toast = useToast()
  const queryClient = useQueryClient()

  const threads = useQuery({
    queryKey: ['admin-conversations', { unread: unreadOnly }],
    queryFn: () => adminMessageApi.threads(unreadOnly ? { unread: '1' } : {}),
    refetchInterval: 60_000,
  })

  const thread = useQuery({
    queryKey: ['admin-conversation', openId],
    queryFn: () => adminMessageApi.thread(openId),
    enabled: Boolean(openId),
  })

  const reply = useMutation({
    // Sent by seller id, not conversation id: the same endpoint serves both
    // replying and writing first, so there is one code path either way.
    mutationFn: () => adminMessageApi.send(thread.data.seller_id, body.trim()),
    onSuccess: () => {
      setBody('')
      toast.success('Reply sent.')
      queryClient.invalidateQueries({ queryKey: ['admin-conversation', openId] })
      queryClient.invalidateQueries({ queryKey: ['admin-conversations'] })
      queryClient.invalidateQueries({ queryKey: ['admin-dashboard'] })
    },
    onError: (err) => toast.error(err.message),
  })

  // Opening a thread marks it read server-side, so the inbox counts are stale
  // the moment the transcript arrives.
  useEffect(() => {
    if (thread.isSuccess) {
      queryClient.invalidateQueries({ queryKey: ['admin-conversations'] })
      queryClient.invalidateQueries({ queryKey: ['admin-dashboard'] })
    }
  }, [thread.isSuccess, thread.data?.id, queryClient])

  const list = rows(threads.data)

  useEffect(() => {
    const socket = connectSocket()
    if (!socket) return undefined
    const refresh = (event) => {
      queryClient.invalidateQueries({ queryKey: ['admin-conversations'] })
      queryClient.invalidateQueries({ queryKey: ['admin-dashboard'] })
      if (event.conversation_id === openId) {
        queryClient.invalidateQueries({ queryKey: ['admin-conversation', openId] })
      }
    }
    socket.on('message:new', refresh)
    return () => socket.off('message:new', refresh)
  }, [openId, queryClient])

  return (
    <div>
      <PageHeader
        title="Messages"
        subtitle="Two-way conversations with sellers."
        action={
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={unreadOnly ? 'primary' : 'secondary'}
              onClick={() => setUnreadOnly((v) => !v)}
            >
              {unreadOnly ? 'Showing unread' : 'Unread only'}
            </Button>
            <Button size="sm" onClick={() => setComposing(true)}>
              <PlusIcon className="h-4 w-4" />
              New message
            </Button>
          </div>
        }
      />

      {composing && (
        <NewConversation
          existingSellerIds={new Set(list.map((row) => row.seller_id))}
          onCancel={() => setComposing(false)}
          onSent={(thread) => {
            setComposing(false)
            // Jump straight into the thread that was just created, so sending
            // visibly does something instead of returning to an inbox the new
            // row has yet to appear in.
            setOpenId(thread.id)
            queryClient.invalidateQueries({ queryKey: ['admin-conversations'] })
            queryClient.invalidateQueries({ queryKey: ['admin-dashboard'] })
          }}
        />
      )}

      <div className="grid gap-4 lg:grid-cols-[20rem_1fr]">
        {/* ------------------------------------------------------- inbox */}
        <div className="rounded-card border border-line bg-surface">
          <DataState
            isLoading={threads.isLoading}
            isError={threads.isError}
            error={threads.error}
            isEmpty={list.length === 0}
            skeleton={<Skeleton className="h-64" />}
            empty={
              <div className="p-4">
                <EmptyState
                  icon={<MegaphoneIcon className="h-6 w-6" />}
                  title={unreadOnly ? 'Nothing unread' : 'No conversations'}
                  description={
                    unreadOnly
                      ? 'Every thread has been read.'
                      : 'Use “New message” to write to a shop.'
                  }
                />
              </div>
            }
          >
            <ul className="max-h-[32rem] divide-y divide-line overflow-y-auto">
              {list.map((row) => (
                <li key={row.id}>
                  <button
                    onClick={() => setOpenId(row.id)}
                    className={cn(
                      'w-full px-4 py-3 text-left transition',
                      openId === row.id
                        ? 'bg-brand-50 dark:bg-brand-950/50'
                        : 'hover:bg-surface-hover',
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-semibold text-fg">
                        {row.shop_name}
                      </span>
                      {row.admin_unread > 0 && (
                        <Badge tone="brand" size="sm">
                          {row.admin_unread}
                        </Badge>
                      )}
                    </div>
                    {/* `preview` is {side, body}, not a string. Rendering the
                        object directly threw "Objects are not valid as a React
                        child", which unmounts the whole tree — a blank page. */}
                    <p className="mt-0.5 truncate text-xs text-fg-muted">
                      {row.preview ? (
                        <>
                          {row.preview.side === 'admin' && (
                            <span className="font-medium text-fg-subtle">You: </span>
                          )}
                          {row.preview.body}
                        </>
                      ) : (
                        'No messages yet'
                      )}
                    </p>
                    <p className="mt-0.5 text-[11px] text-fg-subtle">
                      {row.last_message_at
                        ? new Date(row.last_message_at).toLocaleDateString()
                        : ''}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          </DataState>
        </div>

        {/* --------------------------------------------------- transcript */}
        <div className="rounded-card border border-line bg-surface">
          {!openId ? (
            <div className="p-4">
              <EmptyState
                icon={<MegaphoneIcon className="h-6 w-6" />}
                title="Pick a conversation"
                description="Select a shop on the left to read and reply."
              />
            </div>
          ) : thread.isLoading ? (
            <div className="p-4">
              <Skeleton className="h-64" />
            </div>
          ) : thread.isError ? (
            <div className="p-4">
              <EmptyState title="Could not load this thread" description={thread.error.message} />
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
                <div className="min-w-0">
                  <Link
                    to={`/admin/sellers/${thread.data.seller_id}`}
                    className="truncate font-semibold text-fg hover:text-brand-600 dark:hover:text-brand-400"
                  >
                    {thread.data.shop_name}
                  </Link>
                  <p className="truncate text-xs text-fg-subtle">
                    {thread.data.seller_email}
                  </p>
                </div>
              </div>

              {thread.data.messages.length === 0 ? (
                <div className="p-4">
                  <EmptyState title="No messages yet" description="Write the first one below." />
                </div>
              ) : (
                <Transcript messages={thread.data.messages} />
              )}

              <form
                className="flex items-end gap-2 border-t border-line p-3"
                onSubmit={(e) => {
                  e.preventDefault()
                  if (body.trim() && !reply.isPending) reply.mutate()
                }}
              >
                <Textarea
                  rows={2}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Write a reply…"
                  className="flex-1"
                />
                <Button type="submit" disabled={!body.trim()} loading={reply.isPending}>
                  Send
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
