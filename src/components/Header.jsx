import { ShieldAlert } from 'lucide-react'

export default function Header({ onHome }) {
  return (
    <header className="sticky top-0 z-10 border-b border-stone-200/80 bg-[#f6f5f2]/90 backdrop-blur">
      <div className="mx-auto flex w-full max-w-3xl items-center px-4 py-4 sm:px-6">
        <button
          type="button"
          onClick={onHome}
          className="flex items-center gap-3 rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-900 text-white">
            <ShieldAlert size={18} aria-hidden="true" />
          </span>
          <span>
            <span className="block text-base font-semibold tracking-tight text-slate-950">
              ScamTrail
            </span>
            <span className="block text-xs text-slate-500">Conversation pattern analysis</span>
          </span>
        </button>
      </div>
    </header>
  )
}
