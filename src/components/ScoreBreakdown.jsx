import { ChevronDown } from 'lucide-react'

const PATTERN_LABELS = {
  authority: 'Authority',
  fear_reward: 'Fear / Reward',
  urgency: 'Urgency',
  isolation: 'Isolation',
  sensitive_request: 'Sensitive Request',
  money_action: 'Money / Action',
}

function total(items) {
  return (items || []).reduce((sum, item) => sum + item.points, 0)
}

export default function ScoreBreakdown({ score, breakdown }) {
  if (!breakdown) return null

  const baseSignals = breakdown.basePatterns || []
  const combinationPoints = total(breakdown.combinations)
  const progressionPoints = breakdown.progressionBonus || 0
  const uncapped = total(baseSignals) + combinationPoints + progressionPoints

  return (
    <details className="group rounded-3xl border border-stone-200 bg-white p-5 shadow-sm sm:p-7">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-lg font-semibold tracking-tight text-slate-950 [&::-webkit-details-marker]:hidden">
        How was this score calculated?
        <ChevronDown
          size={18}
          aria-hidden="true"
          className="shrink-0 text-slate-400 transition group-open:rotate-180"
        />
      </summary>
      <div className="mt-5 space-y-4 text-sm">
        <div>
          <h3 className="font-semibold text-slate-950">Base signals</h3>
          {baseSignals.length > 0 ? (
            <ul className="mt-2 space-y-1.5">
              {baseSignals.map((signal) => (
                <li key={signal.type} className="flex items-baseline justify-between gap-4 text-slate-700">
                  <span>{PATTERN_LABELS[signal.type] || signal.type}</span>
                  <span className="tabular-nums">+{signal.points}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-slate-500">No base signals.</p>
          )}
        </div>
        <div className="flex items-baseline justify-between gap-4 border-t border-stone-200 pt-3 text-slate-700">
          <span>Pattern combinations</span>
          <span className="tabular-nums">+{combinationPoints}</span>
        </div>
        <div className="flex items-baseline justify-between gap-4 text-slate-700">
          <span>Progression</span>
          <span className="tabular-nums">+{progressionPoints}</span>
        </div>
        <div className="flex items-baseline justify-between gap-4 border-t border-stone-200 pt-3 font-semibold text-slate-950">
          <span>Final ScamTrail Score</span>
          <span className="tabular-nums">{score}/100</span>
        </div>
        {uncapped > 100 ? (
          <p className="text-slate-500">Final scores are capped at 100.</p>
        ) : null}
      </div>
    </details>
  )
}
