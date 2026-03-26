import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import type { CategoryStat } from '../types/tool'

const COLORS = [
  '#6366f1', '#8b5cf6', '#06b6d4', '#10b981',
  '#f59e0b', '#ef4444', '#ec4899', '#14b8a6',
  '#f97316', '#84cc16', '#a78bfa', '#38bdf8',
]

interface Props {
  data: CategoryStat[]
}

export default function CategoryChart({ data }: Props) {
  const sorted = [...data].sort((a, b) => b.count - a.count)

  return (
    <ResponsiveContainer width="100%" height={380}>
      <BarChart data={sorted} margin={{ top: 5, right: 20, left: 0, bottom: 110 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
        <XAxis
          dataKey="category"
          tick={{ fill: '#94a3b8', fontSize: 11 }}
          angle={-40}
          textAnchor="end"
          interval={0}
          tickLine={false}
        />
        <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} tickLine={false} axisLine={false} />
        <Tooltip
          contentStyle={{
            backgroundColor: '#1e293b',
            border: '1px solid #334155',
            borderRadius: '10px',
            color: '#e2e8f0',
          }}
          labelStyle={{ color: '#e2e8f0', fontWeight: 600 }}
          itemStyle={{ color: '#94a3b8' }}
          cursor={{ fill: 'rgba(99,102,241,0.08)' }}
        />
        <Bar dataKey="count" name="Tools" radius={[4, 4, 0, 0]} maxBarSize={40}>
          {sorted.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
