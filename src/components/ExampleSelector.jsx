import { Camera, Landmark, MessageCircle, Store } from 'lucide-react'

const icons = {
  instagram: Camera,
  marketplace: Store,
  bank: Landmark,
  normal: MessageCircle,
}

export default function ExampleSelector({ examples, selectedId, onSelect, disabled = false }) {
  return (
    <div className="mt-8 text-center">
      <p className="text-sm text-slate-500">Or try an example</p>
      <div className="mt-3 flex flex-wrap justify-center gap-2" role="group" aria-label="Example conversations">
        {examples.map((example) => {
          const Icon = icons[example.id]
          const selected = example.id === selectedId

          return (
            <button
              key={example.id}
              type="button"
              aria-pressed={selected}
              disabled={disabled}
              onClick={() => onSelect(example)}
              className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${
                selected
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-stone-300 bg-white text-slate-700 hover:border-slate-400'
              }`}
            >
              <Icon size={16} aria-hidden="true" />
              {example.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
