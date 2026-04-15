/** App mark — source: `public/creaitive-mark.png` */
const MARK_SRC = '/creaitive-mark.png'

type CreaitiveMarkProps = {
  /** Size of the graphic inside the optional chip */
  imgClassName?: string
  /** Wrapper — add margins if needed */
  className?: string
  /** Light plate helps non-transparent PNGs sit on busy or dark UIs */
  chip?: boolean
}

export function CreaitiveMark({
  imgClassName = 'h-9 w-9 object-contain sm:h-10 sm:w-10',
  className = '',
  chip = true,
}: CreaitiveMarkProps) {
  const img = (
    <img
      src={MARK_SRC}
      alt=""
      width={160}
      height={160}
      decoding="async"
      className={imgClassName}
    />
  )

  if (!chip) {
    return (
      <span className={`inline-flex shrink-0 ${className}`} aria-hidden="true">
        {img}
      </span>
    )
  }

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-xl bg-white/[0.96] p-1.5 shadow-[0_10px_40px_rgba(0,0,0,0.28)] ring-1 ring-white/50 ${className}`}
      aria-hidden="true"
    >
      {img}
    </span>
  )
}
