const badgeStyles = {
  Authority: 'bg-slate-100 text-slate-800 ring-slate-200',
  'Fear / Reward': 'bg-rose-50 text-rose-800 ring-rose-200',
  Urgency: 'bg-amber-50 text-amber-900 ring-amber-200',
  Isolation: 'bg-violet-50 text-violet-800 ring-violet-200',
  'Sensitive Request': 'bg-orange-50 text-orange-900 ring-orange-200',
  'Money / Action': 'bg-red-50 text-red-800 ring-red-200',
}

function firstSignalKeys(messages, patterns) {
  const seen = new Set()
  const first = new Set()

  messages.forEach((message, index) => {
    patterns
      .filter((pattern) => pattern.messageIndex === index)
      .forEach((pattern) => {
        if (!pattern.type || seen.has(pattern.type)) return
        seen.add(pattern.type)
        first.add(`${index}:${pattern.type}`)
      })
  })

  return first
}

export default function AnalyzedConversation({
  messages,
  patterns = [],
  heading = 'Where the risk escalated',
  description = 'See which messages introduced new manipulation signals.',
}) {
  const firstSignals = firstSignalKeys(messages, patterns)

  return (
    <section>
      <h2 className="text-lg font-semibold tracking-tight text-slate-950">{heading}</h2>
      <p className="mt-1 text-sm leading-relaxed text-slate-500">{description}</p>
      <ol className="mt-4 space-y-3">
        {messages.map((message, index) => {
          const findings = patterns.filter((pattern) => pattern.messageIndex === index)
          const labels =
            findings.length > 0
              ? findings.map((finding) => finding.label)
              : Array.isArray(message.patterns)
                ? message.patterns
                : message.pattern
                  ? [message.pattern]
                  : []
          const flagged = labels.length > 0

          return (
            <li key={message.id}>
              <article
                className={`rounded-2xl border p-4 sm:p-5 ${
                  flagged
                    ? 'border-rose-200 bg-rose-50/70 shadow-sm'
                    : 'border-stone-200 bg-stone-50/80'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className={`text-sm font-semibold ${flagged ? 'text-slate-950' : 'text-slate-500'}`}>
                    {message.sender}
                  </p>
                  {flagged && (
                    <span className="flex flex-wrap justify-end gap-1.5">
                      {labels.map((label, labelIndex) => (
                        <span
                          key={`${label}-${labelIndex}`}
                          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${badgeStyles[label] || 'bg-stone-100 text-slate-700 ring-stone-200'}`}
                        >
                          {label}
                        </span>
                      ))}
                    </span>
                  )}
                </div>
                <p
                  className={`mt-2 text-[15px] leading-relaxed whitespace-pre-wrap ${
                    flagged ? 'text-slate-800' : 'text-slate-500'
                  }`}
                >
                  {message.text}
                </p>
                {findings.length > 0 && (
                  <div className="mt-3 space-y-3 border-t border-rose-100 pt-3">
                    {findings.map((finding, findingIndex) => (
                      <div key={`${finding.type}-${findingIndex}`}>
                        {firstSignals.has(`${index}:${finding.type}`) && (
                          <p className="text-xs font-medium text-rose-700">New signal detected</p>
                        )}
                        <p className="mt-1 text-sm leading-relaxed text-slate-600">{finding.detail}</p>
                      </div>
                    ))}
                  </div>
                )}
              </article>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
