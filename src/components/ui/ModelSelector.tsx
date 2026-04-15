import type { Model } from '../../data/models'
import { Badge } from './Badge'

export function ModelSelector({
  models,
  value,
  onChange,
}: {
  models: Model[]
  value: string
  onChange: (id: string) => void
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {models.map((m) => {
        const isActive = m.id === value
        return (
          <button
            type="button"
            key={m.id}
            onClick={() => onChange(m.id)}
            className={[
              'studio-card studio-hover-lift studio-focus-ring w-full p-4 text-left',
              isActive ? 'border-studio-secondary shadow-glow' : 'border-studio-border',
            ].join(' ')}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <div className="text-sm font-semibold text-studio-text">{m.name}</div>
                  <Badge variant="info">{m.badge}</Badge>
                </div>
                <div className="mt-1 text-xs text-studio-muted">{m.version}</div>
              </div>
              {isActive ? (
                <div className="grid h-7 w-7 place-items-center rounded-full bg-[#2E86C124] text-studio-secondary">
                  ✓
                </div>
              ) : null}
            </div>
            <div className="mt-3 text-xs text-studio-muted">{m.description}</div>
            <div className="mt-3 font-mono text-[11px] text-studio-muted">
              Cost/unit: ⚡ {m.costPerUnit}
            </div>
          </button>
        )
      })}
    </div>
  )
}

