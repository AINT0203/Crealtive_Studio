import type { PropsWithChildren } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { isSessionAuthenticated } from '../../auth/session'

export function RequireAuth({ children }: PropsWithChildren) {
  const location = useLocation()
  if (!isSessionAuthenticated()) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }
  return <>{children}</>
}
