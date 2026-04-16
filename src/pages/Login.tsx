import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  DEMO_EMAIL,
  DEMO_PASSWORD,
  isSessionAuthenticated,
  setSessionAuthenticated,
} from '../auth/session'
import { CreaitiveMark } from '../components/brand/CreaitiveMark'
import { useApp } from '../state/AppContext'

export default function Login() {
  const navigate = useNavigate()
  const { addToast } = useApp()
  const [email, setEmail] = useState(DEMO_EMAIL)
  const [password, setPassword] = useState(DEMO_PASSWORD)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isSessionAuthenticated()) {
      navigate('/projects', { replace: true })
    }
  }, [navigate])

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const em = email.trim().toLowerCase()
    if (em !== DEMO_EMAIL.toLowerCase() || password !== DEMO_PASSWORD) {
      setError('Invalid email or password.')
      return
    }
    setSessionAuthenticated(true)
    navigate('/projects', { replace: true })
  }

  function onSsoClick() {
    addToast({
      variant: 'info',
      title: 'SSO not configured',
      message: 'Use email and password to sign in for this workspace.',
    })
  }

  return (
    <div className="grid min-h-screen md:grid-cols-2">
      {/* Left — hero image */}
      <div className="relative isolate min-h-[42vh] overflow-hidden bg-[#1a0a18] md:min-h-0">
        <div
          className="absolute inset-0 bg-cover"
          style={{
            backgroundImage: "url('/login-hero.png')",
            /* Favor bottom-left of the artwork so the slogan is not cropped (cover + center clipped the left) */
            backgroundPosition: '14% 86%',
          }}
          aria-hidden="true"
        />
        <div
          className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/50"
          aria-hidden="true"
        />

        <header className="relative z-10 flex max-w-md items-center gap-3 p-6 sm:p-8 lg:p-10">
          <CreaitiveMark imgClassName="h-10 w-10 object-contain sm:h-11 sm:w-11" />
          <div className="min-w-0">
            <p className="text-lg font-bold tracking-tight text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.85)] sm:text-xl">
              CREALTIVE STUDIO
            </p>
            <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-white/85 drop-shadow-[0_1px_8px_rgba(0,0,0,0.75)] sm:text-[11px]">
              Generative workspace
            </p>
          </div>
        </header>

        <div className="relative z-10 hidden px-8 pb-10 pt-4 md:block lg:px-10">
          <p className="max-w-sm text-2xl font-bold leading-tight tracking-tight text-white drop-shadow-md lg:text-3xl">
            Welcome back
          </p>
          <p className="mt-2 max-w-xs text-sm text-white/80 drop-shadow">
            Sign in on the right to open your workspace.
          </p>
        </div>
      </div>

      {/* Right — whitish panel + form (maroon accents match Projects / nav) */}
      <div className="flex min-h-[58vh] flex-col justify-center bg-gradient-to-b from-white via-[#faf7f8] to-[#f0e8ec] px-6 py-10 md:min-h-0 md:px-10 lg:px-14">
        <div className="mx-auto w-full max-w-[380px]">
          <h1 className="bg-gradient-to-r from-[#2b0614] via-[#7a0f33] to-[#3a1652] bg-clip-text text-2xl font-bold tracking-tight text-transparent">
            Sign in
          </h1>
          <p className="mt-1 bg-gradient-to-r from-[#2b0614] via-[#7a0f33] to-[#3a1652] bg-clip-text text-sm text-transparent opacity-90">
            Use your workspace credentials
          </p>

          <form className="mt-8 space-y-4" onSubmit={onSubmit}>
            {error ? (
              <div
                className="rounded-lg border border-studio-danger/35 bg-studio-danger/[0.08] px-3 py-2 text-sm text-studio-danger"
                role="alert"
              >
                {error}
              </div>
            ) : null}

            <label className="block">
              <span className="sr-only">Email</span>
              <input
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-studio-canvasBorder bg-white px-3 py-3 text-sm text-studio-ink shadow-sm outline-none transition placeholder:text-studio-inkMuted/75 focus:border-[#7a0f33]/50 focus:ring-2 focus:ring-[#7a0f33]/25"
                placeholder={DEMO_EMAIL}
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-studio-inkMuted">Password</span>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-studio-canvasBorder bg-white px-3 py-3 text-sm text-studio-ink shadow-sm outline-none transition focus:border-[#7a0f33]/50 focus:ring-2 focus:ring-[#7a0f33]/25"
                placeholder="••••••••"
              />
            </label>

            <button
              type="submit"
              className="w-full rounded-xl border border-[#7a0f33]/30 bg-[#7a0f33] py-3 text-sm font-bold tracking-wide text-white shadow-md shadow-[#7a0f33]/25 transition hover:bg-[#5e0c27] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7a0f33]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
            >
              Log In
            </button>
          </form>

          <div className="relative my-8">
            <div className="absolute inset-0 flex items-center" aria-hidden="true">
              <div className="w-full border-t border-studio-canvasBorder" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-gradient-to-b from-white to-[#faf7f8] px-3 text-xs font-medium text-[#7a0f33]/70">
                or
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onSsoClick}
            className="w-full rounded-xl border border-[#7a0f33]/25 bg-white/90 py-3 text-sm font-semibold text-[#4a1524] shadow-sm transition hover:border-[#7a0f33]/45 hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7a0f33]/30 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
          >
            Sign in with SSO
          </button>
        </div>
      </div>
    </div>
  )
}
