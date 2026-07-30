import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'

import { assistantApi } from '../api/endpoints'
import { cn } from '../lib/cn'
import { CloseIcon, SearchIcon, SparkleIcon } from './icons'
import { Badge, Money, Spinner, Thumb } from './ui'

const SESSION_KEY = 'commercex.assistant.session'

function readSession() {
  try {
    return localStorage.getItem(SESSION_KEY) || null
  } catch {
    return null
  }
}

/* --------------------------------------------------------- product result */

function ProductPill({ product }) {
  return (
    <Link
      to={`/products/${product.slug}`}
      className="group flex items-center gap-3 rounded-xl border border-line bg-surface p-2.5 transition hover:border-brand-300 hover:shadow-sm dark:hover:border-brand-700"
    >
      <Thumb
        src={product.primary_image}
        alt=""
        className="h-12 w-12 shrink-0 rounded-lg"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold text-fg transition group-hover:text-brand-600 dark:group-hover:text-brand-400">
          {product.name}
        </p>
        <p className="truncate text-[11px] text-fg-subtle">{product.seller_name}</p>
        <div className="mt-0.5 flex items-center gap-1.5">
          <Money amount={product.price} className="text-xs font-bold text-fg" />
          {product.stock === 0 && (
            <Badge tone="rose" size="sm">
              Out of stock
            </Badge>
          )}
          {product.avg_rating ? (
            <span className="text-[11px] text-fg-subtle">
              {product.avg_rating.toFixed(1)}★
            </span>
          ) : null}
        </div>
      </div>
    </Link>
  )
}

/* ---------------------------------------------------------------- bubble */

function Bubble({ message }) {
  const isUser = message.role === 'user'

  return (
    <div className={cn('flex flex-col gap-2', isUser ? 'items-end' : 'items-start')}>
      <div
        className={cn(
          'max-w-[85%] animate-fade-up rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed',
          isUser
            ? 'rounded-br-md bg-brand-600 text-white'
            : 'rounded-bl-md bg-surface-muted text-fg',
        )}
      >
        {/* Citations like [2] are markers for the product list below, not
            something a shopper should read. */}
        {isUser ? message.content : message.content.replace(/\s*\[\d{1,2}\]/g, '')}
      </div>

      {message.products?.length > 0 && (
        <div className="w-full space-y-2">
          {message.products.map((product) => (
            <ProductPill key={product.id} product={product} />
          ))}
        </div>
      )}

      {message.degraded && (
        <p className="text-[11px] text-fg-subtle">
          Showing catalogue search results — the AI assistant isn't configured.
        </p>
      )}
    </div>
  )
}

/* ---------------------------------------------------------------- widget */

export default function ChatWidget() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [sessionId, setSessionId] = useState(readSession)

  const scrollRef = useRef(null)
  const inputRef = useRef(null)

  const { data: config } = useQuery({
    queryKey: ['assistant-suggestions'],
    queryFn: assistantApi.suggestions,
    staleTime: Infinity,
    retry: false,
  })

  // Replay the stored conversation the first time the panel opens, so a
  // refresh doesn't lose context.
  const { data: history } = useQuery({
    queryKey: ['assistant-history', sessionId],
    queryFn: () => assistantApi.history(sessionId),
    enabled: Boolean(sessionId) && open && messages.length === 0,
    retry: false,
  })

  useEffect(() => {
    if (history?.messages?.length) {
      setMessages(
        history.messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          products: m.products,
        })),
      )
    }
  }, [history])

  // Keep the newest message in view as the conversation grows.
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    })
  }, [messages, open])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 120)
  }, [open])

  useEffect(() => {
    const onKey = (event) => event.key === 'Escape' && setOpen(false)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])


  const send = useMutation({
    mutationFn: (message) => assistantApi.ask({ message, sessionId }),
    onSuccess: (data) => {
      if (data.session_id && data.session_id !== sessionId) {
        setSessionId(data.session_id)
        try {
          localStorage.setItem(SESSION_KEY, data.session_id)
        } catch {
          /* private mode — the conversation just won't persist */
        }
      }
      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          content: data.reply,
          products: data.products,
          degraded: data.ai === false,
        },
      ])
    },
    onError: (err) => {
      setMessages((prev) => [
        ...prev,
        { id: `e-${Date.now()}`, role: 'assistant', content: err.message, error: true },
      ])
    },
  })

  // The search bar hands a query over here rather than importing this
  // component's state — a custom event keeps the two decoupled. Declared after
  // `send` because the dependency array is evaluated during render, and a
  // `const` referenced before its declaration throws.
  useEffect(() => {
    const onAsk = (event) => {
      const question = event.detail?.trim()
      if (!question) return
      setOpen(true)
      setMessages((prev) => [
        ...prev,
        { id: `u-${Date.now()}`, role: 'user', content: question },
      ])
      send.mutate(question)
    }
    window.addEventListener('commercex:ask-assistant', onAsk)
    return () => window.removeEventListener('commercex:ask-assistant', onAsk)
  }, [send])

  function submit(text) {
    const question = (text ?? input).trim()
    if (!question || send.isPending) return
    setMessages((prev) => [
      ...prev,
      { id: `u-${Date.now()}`, role: 'user', content: question },
    ])
    setInput('')
    send.mutate(question)
  }

  function reset() {
    setMessages([])
    setSessionId(null)
    try {
      localStorage.removeItem(SESSION_KEY)
    } catch {
      /* ignore */
    }
  }

  const suggestions = config?.suggestions ?? []

  return (
    <>
      {/* --------------------------------------------------------- launcher */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Close shopping assistant' : 'Open shopping assistant'}
        aria-expanded={open}
        className={cn(
          'fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-full shadow-lg',
          'transition-all duration-200 ease-out-soft hover:scale-105 active:scale-95',
          open
            ? 'h-12 w-12 justify-center bg-surface text-fg ring-1 ring-line-strong'
            : 'h-13 bg-gradient-to-br from-brand-600 to-brand-800 px-5 text-white',
        )}
      >
        {open ? (
          <CloseIcon />
        ) : (
          <>
            <SparkleIcon className="h-5 w-5" />
            <span className="text-sm font-semibold">Ask AI</span>
          </>
        )}
      </button>

      {/* ------------------------------------------------------------ panel */}
      {open && (
        <div
          role="dialog"
          aria-label="Shopping assistant"
          className={cn(
            'fixed z-50 flex flex-col overflow-hidden border border-line bg-surface shadow-lg',
            // Full-height sheet on a phone, floating card on desktop.
            'inset-x-0 bottom-0 top-16 rounded-t-3xl',
            'sm:inset-auto sm:bottom-24 sm:right-5 sm:top-auto sm:h-[min(620px,calc(100dvh-8rem))] sm:w-[400px] sm:rounded-2xl',
            'animate-fade-up',
          )}
        >
          <header className="flex items-center gap-3 border-b border-line bg-gradient-to-r from-brand-600 to-brand-700 px-4 py-3.5 text-white">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/15 backdrop-blur">
              <SparkleIcon className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold">Shopping assistant</p>
              <p className="text-xs text-brand-100">
                {config?.ai === false ? 'Catalogue search mode' : 'Answers from our catalogue'}
              </p>
            </div>
            {messages.length > 0 && (
              <button
                onClick={reset}
                className="rounded-lg px-2 py-1 text-xs font-medium text-brand-100 transition hover:bg-white/10 hover:text-white"
              >
                New chat
              </button>
            )}
            <button
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="grid h-8 w-8 place-items-center rounded-lg text-brand-100 transition hover:bg-white/10 hover:text-white"
            >
              <CloseIcon className="h-4.5 w-4.5" />
            </button>
          </header>

          <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4">
            {messages.length === 0 ? (
              <div className="py-4">
                <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-950/60 dark:text-brand-400">
                  <SparkleIcon className="h-6 w-6" />
                </div>
                <p className="text-center text-sm font-semibold text-fg">
                  What are you shopping for?
                </p>
                <p className="mx-auto mt-1 max-w-64 text-center text-xs text-fg-muted">
                  Describe what you need in your own words — I'll search the
                  catalogue and explain the options.
                </p>

                <div className="mt-5 space-y-2">
                  {suggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      onClick={() => submit(suggestion)}
                      className="flex w-full items-center gap-2 rounded-xl border border-line bg-surface-muted px-3 py-2.5 text-left text-xs text-fg-muted transition hover:border-brand-300 hover:bg-surface hover:text-fg dark:hover:border-brand-700"
                    >
                      <SearchIcon className="h-3.5 w-3.5 shrink-0 text-fg-subtle" />
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((message) => <Bubble key={message.id} message={message} />)
            )}

            {send.isPending && (
              <div className="flex items-center gap-2 text-xs text-fg-subtle">
                <Spinner className="h-3.5 w-3.5" />
                Searching the catalogue…
              </div>
            )}
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault()
              submit()
            }}
            className="border-t border-line bg-surface p-3"
          >
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                rows={1}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  // Enter sends, Shift+Enter makes a new line — the convention
                  // every chat UI uses.
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault()
                    submit()
                  }
                }}
                placeholder="e.g. a laptop under $1000"
                maxLength={500}
                className="max-h-28 min-h-10 flex-1 resize-none rounded-xl bg-surface-muted px-3.5 py-2.5 text-sm text-fg ring-1 ring-inset ring-transparent placeholder:text-fg-subtle focus:bg-surface focus:outline-none focus:ring-brand-500"
              />
              <button
                type="submit"
                disabled={!input.trim() || send.isPending}
                aria-label="Send"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-600 text-white transition hover:bg-brand-700 disabled:opacity-40"
              >
                <svg className="h-4.5 w-4.5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M3.4 20.4l17.5-7.5a1 1 0 0 0 0-1.8L3.4 3.6a1 1 0 0 0-1.4 1.1L4 11l10 1-10 1-2 6.3a1 1 0 0 0 1.4 1.1z" />
                </svg>
              </button>
            </div>
            <p className="mt-2 text-center text-[10px] text-fg-subtle">
              Recommendations come from live catalogue data. Verify details before buying.
            </p>
          </form>
        </div>
      )}
    </>
  )
}
