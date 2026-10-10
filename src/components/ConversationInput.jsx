export default function ConversationInput({
  value,
  onChange,
  onAnalyze,
  loading = false,
  error = '',
  errorDetail = '',
}) {
  const canAnalyze = value.trim().length > 0 && !loading

  function handleSubmit(event) {
    event.preventDefault()
    if (canAnalyze) onAnalyze()
  }

  return (
    <form onSubmit={handleSubmit} className="mt-10">
      <label htmlFor="conversation" className="sr-only">
        Suspicious conversation
      </label>
      <textarea
        id="conversation"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Paste a suspicious conversation here..."
        rows={12}
        readOnly={loading}
        className="min-h-64 w-full resize-y rounded-3xl border border-stone-200 bg-white px-4 py-4 text-base leading-relaxed text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-4 focus:ring-slate-900/5 sm:px-5 sm:py-5"
      />
      {error ? (
        <div className="mt-4" role="alert">
          <p className="text-sm leading-relaxed text-rose-800">{error}</p>
          {import.meta.env.DEV && errorDetail ? (
            <p className="mt-1 text-xs leading-relaxed text-slate-500">{errorDetail}</p>
          ) : null}
        </div>
      ) : null}
      <button
        type="submit"
        disabled={!canAnalyze}
        aria-busy={loading}
        className="mt-4 w-full rounded-2xl bg-slate-900 px-5 py-3.5 text-base font-medium text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        {loading ? 'Mapping conversation patterns...' : error ? 'Retry' : 'Analyze Conversation'}
      </button>
    </form>
  )
}
