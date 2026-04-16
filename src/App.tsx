import { Outlet } from 'react-router-dom'
import { PageWrapper } from './components/layout/PageWrapper'

export default function App() {
  return (
    <div className="min-h-screen bg-studio-bg text-studio-text">
      <PageWrapper>
        <Outlet />
      </PageWrapper>
    </div>
  )
}
