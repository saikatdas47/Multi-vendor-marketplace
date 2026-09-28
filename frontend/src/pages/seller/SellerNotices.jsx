import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { noticeApi } from '../../api/endpoints'
import { Alert, Badge, Button, EmptyState, Skeleton } from '../../components/ui'
import { MegaphoneIcon } from '../../components/icons'
import { useToast } from '../../hooks/useToast'

function rows(data) {
  return Array.isArray(data) ? data : (data?.results ?? [])
}

export default function SellerNotices() {
  const queryClient = useQueryClient()
  const toast = useToast()

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['seller-notices'],
    queryFn: () => noticeApi.list(),
  })

  // Both the list and the sidebar badge read from the server, so invalidate the
  // unread count too rather than tracking it in local state.
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['seller-notices'] })
    queryClient.invalidateQueries({ queryKey: ['seller-notice-unread'] })
  }

  const markRead = useMutation({ mutationFn: noticeApi.markRead, onSuccess: refresh })
  const markAll = useMutation({
    mutationFn: noticeApi.markAllRead,
    onSuccess: (data) => {
      toast.success(`Marked ${data.marked} notice${data.marked === 1 ? '' : 's'} read.`)
      refresh()
    },
    onError: (err) => toast.error(err.message),
  })

  const notices = rows(data)
  const unread = notices.filter((n) => !n.is_read).length

  return (
    <div>
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-fg">Admin notices</h1>
          <p className="mt-1 text-sm text-fg-muted">
            Announcements from the CommerceX team.
          </p>
        </div>
        {unread > 0 && (
          <Button size="sm" variant="secondary" onClick={() => markAll.mutate()} loading={markAll.isPending}>
            Mark all read
          </Button>
        )}
      </header>

      {isError && <Alert>{error.message}</Alert>}

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      ) : notices.length === 0 ? (
        <EmptyState
          icon={<MegaphoneIcon className="h-6 w-6" />}
          title="No notices"
          description="Messages from the platform team will appear here."
        />
      ) : (
        <ul className="space-y-3">
          {notices.map((notice) => (
            <li
              key={notice.id}
              className={
                notice.is_read
                  ? 'rounded-card border border-line bg-surface p-5'
                  : 'rounded-card border border-brand-200 bg-brand-50 p-5 dark:border-brand-800 dark:bg-brand-950/40'
              }
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h2 className="font-semibold text-fg">{notice.subject}</h2>
                {notice.is_read ? (
                  <Badge tone="slate">Read</Badge>
                ) : (
                  <Badge tone="brand">New</Badge>
                )}
              </div>

              <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-fg-muted">
                {notice.body}
              </p>

              <div className="mt-3 flex items-center justify-between gap-3">
                <p className="text-xs text-fg-subtle">
                  {new Date(notice.sent_at).toLocaleString()}
                </p>
                {!notice.is_read && (
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={() => markRead.mutate(notice.id)}
                    loading={markRead.isPending && markRead.variables === notice.id}
                  >
                    Mark read
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
