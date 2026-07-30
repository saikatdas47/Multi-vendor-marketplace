import { Alert, EmptyState, Skeleton } from './ui'

/**
 * One place that decides what a data-driven panel renders.
 *
 * Every list page had the same four-branch ladder — loading, error, empty,
 * content — written slightly differently each time, which is why some pages
 * flashed blank while fetching and others swallowed errors. Centralising it
 * means a page describes *what* it shows and not *when*.
 *
 * `isEmpty` is a prop rather than something inferred from `children`, because
 * only the caller knows whether an empty array is genuinely empty or just the
 * current page of a filtered list.
 */
export default function DataState({
  isLoading,
  isError,
  error,
  isEmpty,
  skeleton,
  empty,
  children,
}) {
  if (isLoading) {
    return (
      skeleton ?? (
        <div className="space-y-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      )
    )
  }

  // Errors come before empty: a failed request has no data, and reporting that
  // as "nothing here yet" tells the user the opposite of what happened.
  if (isError) {
    return (
      <Alert>
        {error?.message || 'Something went wrong loading this. Try again in a moment.'}
      </Alert>
    )
  }

  if (isEmpty) return empty ?? <EmptyState title="Nothing here yet" />

  return children
}
