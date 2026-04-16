import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import './styles/index.css'
import { ToastViewport } from './components/ui/Toast'
import { SplashScreen } from './components/ui/SplashScreen'
import { AppProvider } from './state/AppContext'
import { router } from './router'

function Boot() {
  const [showSplash, setShowSplash] = useState(true)

  useEffect(() => {
    // Small animated splash so first paint isn't "static".
    const t = window.setTimeout(() => setShowSplash(false), 2000)
    return () => window.clearTimeout(t)
  }, [])

  if (showSplash) return <SplashScreen />
  return <RouterProvider router={router} />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProvider>
      <Boot />
      <ToastViewport />
    </AppProvider>
  </StrictMode>,
)
