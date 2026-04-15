import { Outlet } from 'react-router-dom'
import { PageWrapper } from './components/layout/PageWrapper'
import { Sidebar } from './components/layout/Sidebar'

export default function App() {
  return (
    <div className="min-h-screen bg-studio-bg text-studio-text">
      <Sidebar />
      <PageWrapper>
        <Outlet />
      </PageWrapper>
    </div>
  )
}
