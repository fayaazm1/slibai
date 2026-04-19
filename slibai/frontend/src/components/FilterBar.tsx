export interface FilterValues {
  category: string
  cost: string
  language: string
  developer: string
}

export interface FilterOptions {
  categories: string[]
  costs: string[]
  languages: string[]
  developers: string[]
}

interface Props {
  options: FilterOptions
  filters: FilterValues
  onChange: (key: keyof FilterValues, value: string) => void
  onReset: () => void
}

const SELECT = [
  'bg-zinc-900 border border-zinc-700 text-zinc-300 text-xs rounded-lg',
  'px-3 py-2 focus:outline-none focus:border-indigo-500 cursor-pointer',
  'hover:border-zinc-500 transition-colors',
].join(' ')

export default function FilterBar({ options, filters, onChange, onReset }: Props) {
  const activeCount = Object.values(filters).filter(Boolean).length

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-zinc-600 text-xs font-medium shrink-0">Filter:</span>

      <select
        value={filters.category}
        onChange={e => onChange('category', e.target.value)}
        className={SELECT}
      >
        <option value="">All Categories</option>
        {options.categories.map(c => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>

      <select
        value={filters.cost}
        onChange={e => onChange('cost', e.target.value)}
        className={SELECT}
      >
        <option value="">Any Cost</option>
        {options.costs.map(c => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>

      <select
        value={filters.language}
        onChange={e => onChange('language', e.target.value)}
        className={SELECT}
      >
        <option value="">Any Language / Platform</option>
        {options.languages.map(l => (
          <option key={l} value={l}>{l}</option>
        ))}
      </select>

      <select
        value={filters.developer}
        onChange={e => onChange('developer', e.target.value)}
        className={SELECT}
      >
        <option value="">Any Developer</option>
        {options.developers.map(d => (
          <option key={d} value={d}>{d}</option>
        ))}
      </select>

      {activeCount > 0 && (
        <button
          onClick={onReset}
          className="flex items-center gap-1.5 text-xs bg-indigo-600/20 border border-indigo-500/30 text-indigo-300 hover:bg-red-900/20 hover:border-red-500/30 hover:text-red-300 px-3 py-2 rounded-lg transition-colors"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
          Reset ({activeCount})
        </button>
      )}
    </div>
  )
}
