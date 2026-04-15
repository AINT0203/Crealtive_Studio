import { useCallback, useRef, useState } from 'react'

export type UploadedImage = {
  file: File
  previewUrl: string
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toFixed(1)} KB`
  const mb = kb / 1024
  return `${mb.toFixed(2)} MB`
}

export function ImageUploadZone({
  value,
  onChange,
}: {
  value: UploadedImage | null
  onChange: (next: UploadedImage | null) => void
}) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  const pick = useCallback(() => inputRef.current?.click(), [])

  const acceptFile = useCallback(
    async (file: File | null | undefined) => {
      if (!file) return
      const url = URL.createObjectURL(file)
      onChange({ file, previewUrl: url })
    },
    [onChange],
  )

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => acceptFile(e.target.files?.[0])}
      />

      <button
        type="button"
        onClick={pick}
        onDragEnter={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setIsDragging(true)
        }}
        onDragOver={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setIsDragging(true)
        }}
        onDragLeave={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setIsDragging(false)
        }}
        onDrop={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setIsDragging(false)
          acceptFile(e.dataTransfer.files?.[0])
        }}
        className={[
          'studio-card studio-focus-ring w-full border border-dashed px-4 py-4 text-left',
          'transition-colors',
          isDragging
            ? 'border-studio-secondary bg-[#2E86C114]'
            : 'border-studio-border hover:border-studio-secondary/70 hover:bg-[#2E86C10A]',
        ].join(' ')}
      >
        <div className="text-sm font-semibold text-studio-text">Upload Image</div>
        <div className="mt-1 text-xs text-studio-muted">
          Drop a square PNG here or click to upload
        </div>

        {value ? (
          <div className="mt-4 flex items-center gap-4">
            <div className="relative h-[200px] w-[200px] overflow-hidden rounded-xl border border-studio-border bg-studio-secondary/10">
              <img
                src={value.previewUrl}
                alt="Uploaded preview"
                className="h-full w-full object-cover"
              />
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-studio-text">
                {value.file.name}
              </div>
              <div className="mt-1 font-mono text-xs text-studio-muted">
                {formatBytes(value.file.size)}
              </div>
              <div className="mt-3 flex gap-2">
                <span className="rounded-full border border-studio-border bg-studio-secondary/10 px-2.5 py-1 text-[11px] font-semibold text-studio-muted">
                  Preview 200×200
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault()
                    onChange(null)
                  }}
                  className="rounded-full px-2.5 py-1 text-[11px] font-semibold text-studio-danger hover:bg-studio-danger/15"
                >
                  Remove
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </button>
    </div>
  )
}

