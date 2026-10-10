import { Ban, Globe, KeyRound, RefreshCw, Search } from 'lucide-react'

const icons = [Ban, KeyRound, Search, Globe, RefreshCw]

export default function SafetyAdvice({ items }) {
  return (
    <section className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm sm:p-7">
      <h2 className="text-lg font-semibold tracking-tight text-slate-950">What should I do?</h2>
      <ul className="mt-5 space-y-3">
        {items.map((item, index) => {
          const Icon = icons[index] || Ban

          return (
            <li key={item} className="flex items-start gap-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white">
                <Icon size={15} aria-hidden="true" />
              </span>
              <span className="pt-1 text-sm leading-relaxed text-slate-800 sm:text-base">{item}</span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
