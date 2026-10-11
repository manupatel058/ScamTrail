import { Mic } from 'lucide-react'

export default function HomeHero({ onStartLive, onAnalyzeExisting, onRunDemo }) {
  return (
    <div className="text-center">
      <h1 className="text-4xl font-semibold tracking-tight text-balance text-slate-950 sm:text-5xl sm:leading-tight">
        See the pattern before it's too late.
      </h1>
      <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-slate-600 sm:text-lg">
        ScamTrail monitors conversations as they happen and detects fraud patterns before you take action.
      </p>
      <div className="mx-auto mt-8 flex max-w-md flex-col gap-3">
        <button
          type="button"
          onClick={onStartLive}
          className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-5 py-3.5 text-base font-medium text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
        >
          <Mic size={18} aria-hidden="true" />
          Start Live Protection
        </button>
        <button
          type="button"
          onClick={onAnalyzeExisting}
          className="w-full rounded-2xl border border-stone-300 bg-white px-5 py-3.5 text-base font-medium text-slate-900 transition hover:border-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
        >
          Analyze Existing Conversation
        </button>
        <button
          type="button"
          onClick={onRunDemo}
          className="text-sm font-medium text-slate-600 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
        >
          Run Demo
        </button>
      </div>
      <p className="mx-auto mt-4 max-w-md text-xs leading-relaxed text-slate-500">
        Microphone access begins only after you start a session. This browser may send audio to its speech-recognition
        service, and finalized text is sent for analysis.
      </p>
    </div>
  )
}
