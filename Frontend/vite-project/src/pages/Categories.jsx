import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'

import { catalogApi } from '../api/endpoints'
import { Alert, EmptyState, PageHeader, Skeleton } from '../components/ui'

function CategoryNode({ category, depth = 0 }) {
  return (
    <li>
      <Link
        to={`/products?category=${category.slug}`}
        className="flex items-center justify-between rounded-lg px-3 py-2 text-sm transition hover:bg-surface-muted"
        style={{ paddingLeft: `${depth * 16 + 12}px` }}
      >
        <span className={depth === 0 ? 'font-semibold text-fg' : 'text-fg-muted'}>
          {category.name}
        </span>
        <span className="text-xs text-fg-subtle">{category.product_count}</span>
      </Link>
      {category.children?.length > 0 && (
        <ul>
          {category.children.map((child) => (
            <CategoryNode key={child.id} category={child} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  )
}

export default function Categories() {
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['category-tree'],
    queryFn: () => catalogApi.categoryTree(),
    staleTime: 5 * 60 * 1000,
  })

  return (
    <div>
      <PageHeader title="Categories" subtitle="Browse the full catalogue structure." />

      {isError && <Alert>{error.message}</Alert>}

      {isPending ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      ) : data?.length ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((root) => (
            <div key={root.id} className="rounded-card border border-line bg-surface p-3">
              <ul>
                <CategoryNode category={root} />
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          title="No categories yet"
          description="Run manage.py seed_demo, or create categories from the Django admin."
        />
      )}
    </div>
  )
}
