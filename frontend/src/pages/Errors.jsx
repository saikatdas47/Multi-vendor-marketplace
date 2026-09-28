import { Link } from 'react-router-dom'

import { Button, EmptyState } from '../components/ui'

export function NotFound() {
  return (
    <div className="py-16">
      <EmptyState
        title="404 — page not found"
        description="The page you're looking for doesn't exist or has moved."
        action={
          <Button as={Link} to="/">
            Back to home
          </Button>
        }
      />
    </div>
  )
}

export function Forbidden() {
  return (
    <div className="py-16">
      <EmptyState
        title="403 — not allowed"
        description="Your account doesn't have permission to view this page."
        action={
          <Button as={Link} to="/">
            Back to home
          </Button>
        }
      />
    </div>
  )
}
