import { useCallback, useMemo, useRef, useState } from 'react'
import { UiContext } from './uiContext'

export function UiProvider({ children }) {
  const [toast, setToast] = useState(null)
  const timeoutRef = useRef(null)

  const notify = useCallback((message) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    setToast(message)
    timeoutRef.current = setTimeout(() => setToast(null), 2600)
  }, [])

  const value = useMemo(() => ({ notify }), [notify])

  return (
    <UiContext.Provider value={value}>
      {children}
      {toast ? (
        <div role="status" aria-live="polite" className="adt-toast">
          {toast}
        </div>
      ) : null}
    </UiContext.Provider>
  )
}

