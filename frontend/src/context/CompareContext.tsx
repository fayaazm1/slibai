import { createContext, useContext, useState } from 'react'
import type { ReactNode } from 'react'
import type { AITool } from '../types/tool'

interface CompareContextType {
  compareList: AITool[]
  addTool: (tool: AITool) => void
  removeTool: (id: number) => void
  clearCompare: () => void
  isInCompare: (id: number) => boolean
}

const CompareContext = createContext<CompareContextType | null>(null)

export function CompareProvider({ children }: { children: ReactNode }) {
  const [compareList, setCompareList] = useState<AITool[]>([])

  const addTool = (tool: AITool) => {
    if (compareList.length >= 4 || compareList.some(t => t.id === tool.id)) return
    setCompareList(prev => [...prev, tool])
  }

  const removeTool = (id: number) =>
    setCompareList(prev => prev.filter(t => t.id !== id))

  const clearCompare = () => setCompareList([])

  const isInCompare = (id: number) => compareList.some(t => t.id === id)

  return (
    <CompareContext.Provider value={{ compareList, addTool, removeTool, clearCompare, isInCompare }}>
      {children}
    </CompareContext.Provider>
  )
}

export function useCompare() {
  const ctx = useContext(CompareContext)
  if (!ctx) throw new Error('useCompare must be used within CompareProvider')
  return ctx
}
