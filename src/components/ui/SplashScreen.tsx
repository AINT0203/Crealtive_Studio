export function SplashScreen() {
  return (
    <div className="relative grid min-h-screen place-items-center overflow-hidden bg-[#070c14]">
      {/* animated background */}
      <div className="absolute inset-0" aria-hidden="true">
        <div className="absolute inset-0 bg-gradient-to-br from-[#070c14] via-[#0f1f3c] to-[#3a1652]" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/40 to-black/20" />
        <div className="absolute inset-0 animate-pulseSoft bg-gradient-to-br from-rose-500/20 via-fuchsia-500/12 to-cyan-400/14" />
        <div className="absolute -left-1/4 -top-1/3 h-[520px] w-[520px] animate-[spin_14s_linear_infinite] rounded-full bg-[conic-gradient(from_90deg,rgba(122,15,51,0.0),rgba(122,15,51,0.35),rgba(58,22,82,0.0))] blur-2xl" />
        <div className="absolute -bottom-1/3 -right-1/4 h-[520px] w-[520px] animate-[spin_16s_linear_infinite] rounded-full bg-[conic-gradient(from_250deg,rgba(34,211,238,0.0),rgba(34,211,238,0.28),rgba(122,15,51,0.0))] blur-2xl" />
      </div>

      {/* card */}
      <div className="relative mx-6 w-full max-w-md rounded-3xl border border-white/10 bg-black/35 p-6 shadow-[0_30px_90px_rgba(0,0,0,0.65)] backdrop-blur-xl">
        <div className="text-center">
          <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/70">
            CREALTIVE STUDIO
          </div>
          <div className="mt-2 bg-gradient-to-r from-white via-white to-white/70 bg-clip-text text-3xl font-extrabold tracking-tight text-transparent">
            Loading workspace
          </div>
          <div className="mt-2 text-sm text-white/70">Preparing your projects and sessions…</div>
        </div>

        <div className="mt-6">
          <div className="h-2 w-full overflow-hidden rounded-full border border-white/10 bg-white/5">
            <div className="h-full w-2/3 animate-shimmer rounded-full bg-[linear-gradient(90deg,#2b0614,#7a0f33,#3a1652)] bg-[length:200%_100%]" />
          </div>
          <div className="mt-3 flex items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/25 border-t-white/80" aria-label="Loading" />
          </div>
        </div>
      </div>
    </div>
  )
}

