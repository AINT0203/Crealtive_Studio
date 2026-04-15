import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { TopBar } from '../components/layout/TopBar'
import { Badge } from '../components/ui/Badge'
import { EmptyState } from '../components/ui/EmptyState'
import { Modal } from '../components/ui/Modal'
import { useApp } from '../state/AppContext'

/** e.g. "14 Apr 2026" */
function formatCreatedDate(iso: string) {
  const [y, m, d] = iso.split('-').map((v) => Number(v))
  const dt = new Date(y, m - 1, d)
  return dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function pluralize(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`
}

export function Projects() {
  const navigate = useNavigate()
  const { projects, createProject, deleteProject } = useApp()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [form, setForm] = useState({ name: '', description: '' })
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null)

  const canCreate = useMemo(() => form.name.trim().length >= 2, [form.name])

  function onCreate() {
    if (!canCreate) return
    createProject(form)
    setForm({ name: '', description: '' })
    setIsModalOpen(false)
  }

  return (
    <div>
      <TopBar
        title="Projects"
        subtitle="Organize your AI image editing work"
        right={
          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="studio-focus-ring rounded-xl bg-studio-primary px-4 py-2 text-sm font-semibold text-studio-text shadow-glow hover:bg-studio-secondary"
          >
            + New Project
          </button>
        }
      />

      {projects.length === 0 ? (
        <EmptyState
          icon="📁"
          title="No projects yet"
          subtitle="Create your first project to start organizing edits."
          ctaLabel="+ New Project"
          onCta={() => setIsModalOpen(true)}
        />
      ) : (
        <div className="grid grid-cols-3 gap-4 max-[1024px]:grid-cols-2 max-[768px]:grid-cols-1">
          {projects.map((p) => (
            <div
              key={p.id}
              className="studio-card studio-hover-lift group relative overflow-hidden p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-lg font-semibold text-studio-text">
                    {p.name}
                  </div>
                  <div className="mt-1 text-sm text-studio-muted">{p.description}</div>
                </div>
                <Badge variant={p.status === 'active' ? 'success' : 'neutral'}>
                  {p.status === 'active' ? 'Active' : 'Archived'}
                </Badge>
              </div>

              <div className="mt-4 space-y-1 text-xs text-studio-muted">
                <div>Created {formatCreatedDate(p.created)}</div>
                {p.images > 0 || p.experiments > 0 || p.credits > 0 ? (
                  <div className="text-studio-muted/90">
                    Last activity {formatCreatedDate(p.updated)}
                  </div>
                ) : null}
              </div>

              <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-studio-muted">
                <span>🖼 {pluralize(p.images, 'image', 'images')}</span>
                <span>⚗ {pluralize(p.experiments, 'experiment', 'experiments')}</span>
                <span>
                  ⚡{' '}
                  {p.credits === 0
                    ? '0 credits used'
                    : `${p.credits.toLocaleString()} credits used`}
                </span>
              </div>

              <div className="mt-4 flex gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                <button
                  type="button"
                  onClick={() => navigate(`/editor?projectId=${encodeURIComponent(p.id)}`)}
                  className="studio-focus-ring rounded-lg bg-studio-primary px-3 py-2 text-xs font-semibold text-studio-text hover:bg-studio-secondary"
                >
                  Open
                </button>

                {confirmingDeleteId === p.id ? (
                  <div className="ml-auto flex items-center gap-2">
                    <span className="text-[11px] text-studio-muted">
                      Delete this project? Cannot be undone.
                    </span>
                    <button
                      type="button"
                      onClick={async () => {
                        setConfirmingDeleteId(null)
                        await deleteProject(p.id)
                      }}
                      className="studio-focus-ring rounded-lg bg-studio-danger px-3 py-2 text-xs font-semibold text-studio-text hover:brightness-110"
                    >
                      Confirm Delete
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmingDeleteId(null)}
                      className="rounded-lg px-3 py-2 text-xs font-semibold text-studio-muted hover:bg-studio-secondary/12 hover:text-studio-text"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmingDeleteId(p.id)}
                    className="ml-auto rounded-lg px-3 py-2 text-xs font-semibold text-studio-danger hover:bg-studio-danger/15"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={isModalOpen}
        title="New Project"
        onClose={() => setIsModalOpen(false)}
        footer={
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="rounded-lg px-3 py-2 text-sm font-semibold text-studio-muted hover:bg-studio-secondary/12 hover:text-studio-text"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!canCreate}
              onClick={onCreate}
              className="studio-focus-ring rounded-lg bg-studio-primary px-3 py-2 text-sm font-semibold text-studio-text hover:bg-studio-secondary disabled:cursor-not-allowed disabled:opacity-50"
            >
              Create Project
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <label className="block">
            <div className="mb-1 text-xs font-semibold text-studio-muted">
              Project Name
            </div>
            <input
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              className="studio-focus-ring w-full rounded-xl border border-studio-border bg-studio-bg px-3 py-2 text-sm text-studio-text placeholder:text-studio-muted/60"
              placeholder="e.g. Product Launch Assets"
            />
          </label>
          <label className="block">
            <div className="mb-1 text-xs font-semibold text-studio-muted">
              Description
            </div>
            <textarea
              value={form.description}
              onChange={(e) =>
                setForm((p) => ({ ...p, description: e.target.value }))
              }
              rows={4}
              className="studio-focus-ring w-full resize-none rounded-xl border border-studio-border bg-studio-bg px-3 py-2 text-sm text-studio-text placeholder:text-studio-muted/60"
              placeholder="A short description of what this project is for…"
            />
          </label>
        </div>
      </Modal>
    </div>
  )
}

