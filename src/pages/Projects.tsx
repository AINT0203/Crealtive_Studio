import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppHeader } from '../components/layout/AppHeader'
import { Badge } from '../components/ui/Badge'
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
  const [deleteTarget, setDeleteTarget] = useState<null | { id: string; name: string }>(null)

  const canCreate = useMemo(() => form.name.trim().length >= 2, [form.name])

  function onCreate() {
    if (!canCreate) return
    createProject(form)
    setForm({ name: '', description: '' })
    setIsModalOpen(false)
  }

  async function confirmDeleteNow() {
    if (!deleteTarget) return
    const { id } = deleteTarget
    setDeleteTarget(null)
    await deleteProject(id)
  }

  return (
    <div>
      <AppHeader onNewProject={() => setIsModalOpen(true)} />

      <section className="studio-card flex flex-1 flex-col p-5 sm:p-7">
        <div className="mb-5">
          <h2 className="inline-flex items-center gap-2 text-2xl font-extrabold tracking-tight sm:text-3xl">
            <span className="bg-gradient-to-r from-[#2b0614] via-[#7a0f33] to-[#3a1652] bg-clip-text text-transparent">
              My Projects
            </span>
  
          </h2>
          <p className="mt-1 text-sm text-studio-muted bg-gradient-to-r from-[#000000] via-[#7a0f33] to-[#3a1652] bg-clip-text text-transparent">Organize your AI image editing work</p>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-studio-border bg-studio-inset/40">
          <div className="flex-1 overflow-auto p-4">
          {projects.length === 0 ? (
            <div className="grid min-h-[320px] place-items-center rounded-xl border border-dashed border-[#7a0f33]/35 bg-[#7a0f33]/6 p-6 text-center">
              <div className="max-w-md">
                <h3 className="text-xl font-bold text-[#7a0f33]">No projects yet</h3>
                <p className="mt-2 text-sm text-studio-muted">
                  Start your first workspace to organize image edits, sessions, and outputs.
                </p>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(true)}
                  className="studio-focus-ring mt-5 inline-flex items-center gap-2 rounded-lg border border-[#7a0f33]/35 bg-[#7a0f33]/14 px-4 py-2 text-sm font-bold text-[#7a0f33] shadow-sm transition hover:bg-[#7a0f33]/18"
                >
                  + Create Project
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3 max-[1024px]:grid-cols-2 max-[768px]:grid-cols-1">
              {projects.map((p) => (
                <div
                  key={p.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate(`/editor?projectId=${encodeURIComponent(p.id)}`)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      navigate(`/editor?projectId=${encodeURIComponent(p.id)}`)
                    }
                  }}
                  className="studio-card studio-hover-lift group relative cursor-pointer overflow-hidden p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-base font-semibold text-studio-text">
                        {p.name}
                      </div>
                      <div className="mt-0.5 truncate text-xs text-studio-muted">{p.description}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {p.status === 'active' ? (
                        <span className="relative flex h-2 w-2" aria-label="Active" title="Active">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-40" />
                          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                        </span>
                      ) : (
                        <Badge variant="neutral">Archived</Badge>
                      )}

                      <details
                        className="group relative"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                      >
                        <summary className="studio-focus-ring list-none cursor-pointer rounded-md p-1 text-black/70 transition hover:bg-black/5 hover:text-black">
                          <span className="sr-only">More</span>
                          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
                            <circle cx="12" cy="5" r="1.6" />
                            <circle cx="12" cy="12" r="1.6" />
                            <circle cx="12" cy="19" r="1.6" />
                          </svg>
                        </summary>
                        <div className="absolute right-0 z-20 mt-2 w-32 overflow-hidden rounded-xl border border-studio-border bg-white p-1 shadow-lg">
                          <button
                            type="button"
                            onClick={() => setDeleteTarget({ id: p.id, name: p.name })}
                            className="studio-focus-ring w-full rounded-lg px-3 py-2 text-left text-xs font-semibold text-studio-danger hover:bg-studio-danger/10"
                          >
                            Delete
                          </button>
                        </div>
                      </details>
                    </div>
                  </div>

                  <div className="mt-3 space-y-1 text-[11px] text-studio-muted">
                    <div>Created {formatCreatedDate(p.created)}</div>
                    {p.images > 0 || p.experiments > 0 || p.credits > 0 ? (
                      <div className="text-studio-muted/90">
                        Last activity {formatCreatedDate(p.updated)}
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-studio-muted">
                    <span>⚗ {pluralize(p.experiments, 'experiment', 'experiments')}</span>
                    <span>
                      ⚡{' '}
                      {p.credits === 0
                        ? '0 credits used'
                        : `${p.credits.toLocaleString()} credits used`}
                    </span>
                  </div>

                </div>
              ))}
            </div>
          )}
          </div>
        </div>

        <div className="mt-4 flex items-center justify-end">
          <button
            type="button"
            onClick={() => navigate('/editor')}
            className="studio-focus-ring inline-flex items-center gap-2 rounded-lg border border-[#7a0f33]/35 bg-[#7a0f33]/14 px-5 py-2 text-sm font-bold text-[#7a0f33] shadow-sm transition hover:bg-[#7a0f33]/18"
          >
            Next
            <span className="text-lg leading-none">›</span>
          </button>
        </div>
      </section>

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
              className="studio-focus-ring rounded-lg border border-[#7a0f33]/35 bg-[#7a0f33]/14 px-3 py-2 text-sm font-semibold text-[#7a0f33] shadow-sm transition hover:bg-[#7a0f33]/18 disabled:cursor-not-allowed disabled:opacity-50"
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

      <Modal
        open={Boolean(deleteTarget)}
        title="Delete project?"
        onClose={() => setDeleteTarget(null)}
        footer={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setDeleteTarget(null)}
              className="rounded-lg px-3 py-2 text-sm font-semibold text-studio-muted hover:bg-studio-secondary/12 hover:text-studio-text"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmDeleteNow}
              className="studio-focus-ring rounded-lg bg-[#2b0614] px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#4b071d]"
            >
              Delete
            </button>
          </div>
        }
      >
        <div className="space-y-2">
          <div className="text-sm text-studio-text">
            This will permanently delete{' '}
            <span className="font-semibold">
              {deleteTarget ? deleteTarget.name : 'this project'}
            </span>
            .
          </div>
          <div className="text-sm text-studio-muted">This action cannot be undone.</div>
        </div>
      </Modal>
    </div>
  )
}

