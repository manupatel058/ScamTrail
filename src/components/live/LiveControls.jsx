const buttonClass =
  'rounded-2xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-900 transition hover:border-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2'

const primaryClass =
  'rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2'

export default function LiveControls({ phase, hasSession, onStart, onPause, onResume, onStop, onNewSession }) {
  const showStart = phase === 'idle' || phase === 'stopped'
  const showResume = phase === 'paused'

  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Live session controls">
      {showStart ? (
        <button type="button" onClick={onStart} className={primaryClass}>
          Start
        </button>
      ) : null}
      {phase === 'listening' || phase === 'requesting' ? (
        <button type="button" onClick={onPause} className={buttonClass} disabled={phase === 'requesting'}>
          Pause
        </button>
      ) : null}
      {showResume ? (
        <button type="button" onClick={onResume} className={primaryClass}>
          Resume
        </button>
      ) : null}
      {phase !== 'idle' ? (
        <button type="button" onClick={onStop} className={buttonClass}>
          Stop
        </button>
      ) : null}
      {hasSession ? (
        <button type="button" onClick={onNewSession} className={buttonClass}>
          New Session
        </button>
      ) : null}
    </div>
  )
}
