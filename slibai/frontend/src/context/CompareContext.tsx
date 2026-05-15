// Tracks which tools the user has selected for side-by-side comparison.
// Context is used here instead of local state because the CompareBar lives in the
// Navbar and needs to reflect selection made on Browse, Scan, and Compare pages all
// at once — passing that state through props would mean every page carries compare
// state even when it has nothing to do with comparison. Context keeps it in one place
// and lets any component subscribe.
// No persistence — compare selection resets on page refresh by design.
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

/**
 * Provides compare selection state to all children.
 *
 * The 4-tool cap in addTool matches the Compare page layout — the side-by-side
 * view was designed for up to 4 columns, and comparing more becomes unreadable
 * on most screen widths. The duplicate guard prevents the same tool being added
 * twice if a user clicks "Add to compare" from two different pages.
 *
 * @param props.children - Component tree that needs access to compare state.
 * @returns CompareContext.Provider with compareList and add/remove/clear/isInCompare actions.
 *
 * Note: State is in-memory only — refreshing clears the selection. Persisting it
 * to localStorage would add complexity with little benefit since compare selections
 * are a short-lived browsing action, not something users expect to return to.
 */
export function CompareProvider({ children }: { children: ReactNode }) {
  const [compareList, setCompareList] = useState<AITool[]>([])

  const addTool = (tool: AITool) => {
    // cap at 4 — the Compare page layout supports up to 4 side-by-side columns
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

/**
 * Hook that returns the current compare context.
 *
 * Throws if called outside CompareProvider, making misconfigured usage
 * obvious immediately rather than failing with a confusing null reference later.
 *
 * @returns CompareContextType with compareList and the selection actions.
 */
export function useCompare() {
  const ctx = useContext(CompareContext)
  if (!ctx) throw new Error('useCompare must be used within CompareProvider')
  return ctx
}
