import { Navigate, createBrowserRouter } from 'react-router-dom'
import App from './App'
import { RequireAuth } from './components/auth/RequireAuth'
import { Editor } from './pages/Editor'
import { History } from './pages/History'
import Login from './pages/Login'
import { Projects } from './pages/Projects'

export const router = createBrowserRouter([
  { path: '/login', element: <Login /> },
  {
    path: '/',
    element: (
      <RequireAuth>
        <App />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <Navigate to="/projects" replace /> },
      { path: 'projects', element: <Projects /> },
      { path: 'editor', element: <Editor /> },
      { path: 'history', element: <History /> },
      { path: '*', element: <Navigate to="/projects" replace /> },
    ],
  },
])

