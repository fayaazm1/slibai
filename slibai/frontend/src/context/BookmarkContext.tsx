import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { useAuth } from './AuthContext'
import { Bookmark, getBookmarks, addBookmark, removeBookmark } from '../api/user'

interface BookmarkContextValue {
  bookmarks: Bookmark[]
  toggleBookmark: (toolId: number, toolName: string, toolCategory?: string | null) => Promise<void>
  isBookmarked: (toolId: number) => boolean
  reload: () => void
}

const BookmarkContext = createContext<BookmarkContextValue | null>(null)

export function BookmarkProvider({ children }: { children: ReactNode }) {
  const { token, user } = useAuth()
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])

  function load() {
    if (!token || !user) { setBookmarks([]); return }
    getBookmarks(token).then(setBookmarks).catch(() => {})
  }

  useEffect(() => { load() }, [token, user])

  const bookmarkedIds = new Set(bookmarks.map(b => b.tool_id))

  async function toggleBookmark(toolId: number, toolName: string, toolCategory?: string | null) {
    if (!token) return
    if (bookmarkedIds.has(toolId)) {
      await removeBookmark(token, toolId)
      setBookmarks(prev => prev.filter(b => b.tool_id !== toolId))
    } else {
      const bm = await addBookmark(token, { tool_id: toolId, tool_name: toolName, tool_category: toolCategory })
      setBookmarks(prev => [bm, ...prev])
    }
  }

  return (
    <BookmarkContext.Provider value={{ bookmarks, toggleBookmark, isBookmarked: id => bookmarkedIds.has(id), reload: load }}>
      {children}
    </BookmarkContext.Provider>
  )
}

export function useBookmarks() {
  const ctx = useContext(BookmarkContext)
  if (!ctx) throw new Error('useBookmarks must be used inside BookmarkProvider')
  return ctx
}
