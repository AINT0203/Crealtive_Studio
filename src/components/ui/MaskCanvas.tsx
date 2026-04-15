import { useEffect, useMemo, useRef, useState } from 'react'

export function MaskCanvas({
  enabled,
  brushSize,
  onBrushSizeChange,
  onClear,
}: {
  enabled: boolean
  brushSize: number
  onBrushSizeChange: (n: number) => void
  onClear: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [isPainting, setIsPainting] = useState(false)

  const size = useMemo(() => 200, [])

  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    c.width = size
    c.height = size
    const ctx = c.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, size, size)
  }, [size, enabled])

  function paintAt(clientX: number, clientY: number) {
    const c = canvasRef.current
    if (!c) return
    const ctx = c.getContext('2d')
    if (!ctx) return
    const rect = c.getBoundingClientRect()
    const x = ((clientX - rect.left) / rect.width) * size
    const y = ((clientY - rect.top) / rect.height) * size
    ctx.fillStyle = 'rgba(243,156,18,0.55)'
    ctx.beginPath()
    ctx.arc(x, y, brushSize / 2, 0, Math.PI * 2)
    ctx.fill()
  }

  if (!enabled) return null

  return (
    <div className="mt-3 studio-card p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="text-xs font-semibold text-studio-muted">Mask (visual)</div>
        <button
          type="button"
          onClick={() => {
            const c = canvasRef.current
            const ctx = c?.getContext('2d')
            if (ctx) ctx.clearRect(0, 0, size, size)
            onClear()
          }}
          className="rounded-md px-2 py-1 text-xs font-semibold text-studio-muted hover:bg-studio-secondary/12 hover:text-studio-text"
        >
          Clear Mask
        </button>
      </div>

      <div className="relative h-[200px] w-[200px] overflow-hidden rounded-xl border border-studio-border bg-studio-secondary/10">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full cursor-crosshair"
          onMouseDown={(e) => {
            setIsPainting(true)
            paintAt(e.clientX, e.clientY)
          }}
          onMouseMove={(e) => {
            if (!isPainting) return
            paintAt(e.clientX, e.clientY)
          }}
          onMouseUp={() => setIsPainting(false)}
          onMouseLeave={() => setIsPainting(false)}
        />
        <div className="absolute inset-0 pointer-events-none bg-gradient-to-br from-transparent via-transparent to-black/30" />
      </div>

      <div className="mt-3 flex items-center gap-3">
        <div className="text-xs font-semibold text-studio-muted">Brush</div>
        <input
          type="range"
          min={6}
          max={64}
          value={brushSize}
          onChange={(e) => onBrushSizeChange(Number(e.target.value))}
          className="w-full accent-studio-accent"
        />
        <div className="w-10 text-right font-mono text-xs text-studio-muted">
          {brushSize}
        </div>
      </div>
    </div>
  )
}

