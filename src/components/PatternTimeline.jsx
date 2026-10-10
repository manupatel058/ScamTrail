function lineClass(detected) {
  return detected ? 'bg-rose-300' : 'bg-stone-200'
}

export default function PatternTimeline({ stages }) {
  return (
    <section className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm sm:p-7">
      <h2 className="text-lg font-semibold tracking-tight text-slate-950">Manipulation Pattern</h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
        ScamTrail looks at how warning signs combine and progress, not just whether one suspicious
        phrase appears.
      </p>
      <ol className="mt-6 flex flex-col sm:flex-row sm:items-start" aria-label="Manipulation pattern progression">
        {stages.map((stage, index) => {
          const last = index === stages.length - 1
          const line = lineClass(stage.detected)

          return (
            <li
              key={stage.id}
              className={`flex gap-3 sm:min-w-0 sm:flex-1 sm:flex-col sm:items-center sm:gap-0 ${
                stage.detected ? 'stage-detected' : ''
              }`}
              style={stage.detected ? { animationDelay: `${index * 70}ms` } : undefined}
            >
              <div className="flex flex-col items-center self-stretch sm:w-full sm:flex-row sm:self-auto">
                <span
                  className={`w-px sm:h-px sm:w-auto sm:flex-1 ${index === 0 ? 'h-0 bg-transparent sm:bg-transparent' : `min-h-3 sm:min-h-0 ${line}`}`}
                />
                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                    stage.detected
                      ? 'bg-rose-600 text-white shadow-sm ring-4 ring-rose-100'
                      : 'bg-stone-100 text-stone-400'
                  }`}
                >
                  {index + 1}
                </span>
                <span
                  className={`w-px flex-1 sm:h-px sm:w-auto sm:flex-1 ${
                    last ? 'h-0 bg-transparent sm:bg-transparent' : `min-h-4 sm:min-h-0 ${line}`
                  }`}
                />
              </div>
              <div className={`pb-1 sm:mt-3 sm:px-1 sm:pb-0 sm:text-center ${last ? '' : 'pb-4'}`}>
                <p
                  className={`text-sm font-medium leading-snug sm:text-xs ${
                    stage.detected ? 'text-slate-950' : 'text-stone-400'
                  }`}
                >
                  {stage.label}
                </p>
                <p
                  className={`mt-1 text-[10px] font-semibold tracking-wide uppercase ${
                    stage.detected ? 'text-rose-700' : 'text-stone-400'
                  }`}
                >
                  {stage.detected ? 'Detected' : 'Not seen'}
                </p>
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
