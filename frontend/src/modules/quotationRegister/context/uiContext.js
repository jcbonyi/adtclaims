import { createContext, useContext } from 'react'

export const UiContext = createContext(null)

export function useUi() {
  const ctx = useContext(UiContext)
  if (!ctx) throw new Error('useUi must be used within UiProvider')
  return ctx
}

