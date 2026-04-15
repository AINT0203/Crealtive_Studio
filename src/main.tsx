import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import './styles/index.css'
import { ToastViewport } from './components/ui/Toast'
import { AppProvider } from './state/AppContext'
import { router } from './router'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProvider>
      <RouterProvider router={router} />
      <ToastViewport />
    </AppProvider>
  </StrictMode>,
)
