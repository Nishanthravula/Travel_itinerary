/** Placeholder for the option comparison while a plan is being built. */
export default function Skeleton({ step }: { step: string }) {
  return (
    <section className="loading" role="status" aria-live="polite">
      <p className="loading-step">{step}…</p>
      <div className="options options-skeleton" aria-hidden>
        {[0, 1, 2].map((i) => (
          <div className="option" key={i}>
            <span className="bone bone-title" />
            <span className="bone" />
            <span className="bone bone-short" />
            <span className="bone" />
            <span className="bone bone-short" />
          </div>
        ))}
      </div>
    </section>
  )
}
