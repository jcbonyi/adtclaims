import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from 'react'
import { QuotationContext } from './quotationContext'
import {
  getInitialReducerState,
  loadPersistedState,
  persistState,
  quotationReducer,
} from '../quotationReducer'
import {
  createQuotation,
  deleteQuotation,
  fetchQuotations,
  importQuotations,
  logFollowUp,
  updateQuotation,
} from '../api/quotationsApi'

export function QuotationProvider({ children }) {
  const [state, dispatch] = useReducer(
    quotationReducer,
    undefined,
    getInitialReducerState
  )
  const stateRef = useRef(state)
  stateRef.current = state

  const reloadFromServer = useCallback(async () => {
    const data = await fetchQuotations()
    dispatch({ type: 'HYDRATE', payload: data })
    return data
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const data = await fetchQuotations()
        if (!cancelled) {
          dispatch({ type: 'HYDRATE', payload: data })
        }
      } catch (err) {
        console.warn('Quotation API load failed, using local storage:', err)
        const persisted = loadPersistedState()
        if (!cancelled) {
          if (persisted) {
            dispatch({ type: 'HYDRATE', payload: persisted })
          }
          dispatch({
            type: 'SET_LOAD_ERROR',
            payload: 'Could not reach server — showing locally saved data only.',
          })
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const syncDispatch = useCallback(
    async (action) => {
      try {
        switch (action.type) {
          case 'ADD': {
            await createQuotation(action.payload)
            await reloadFromServer()
            return
          }
          case 'UPDATE': {
            const { id, patch } = action.payload
            const current = stateRef.current.quotations.find((q) => q.id === id)
            if (!current) throw new Error('Quotation not found')
            await updateQuotation(id, { ...current, ...patch })
            await reloadFromServer()
            return
          }
          case 'DELETE': {
            await deleteQuotation(action.payload)
            await reloadFromServer()
            return
          }
          case 'IMPORT': {
            await importQuotations(action.payload)
            await reloadFromServer()
            return
          }
          case 'LOG_FOLLOW_UP': {
            const { id, date, note } = action.payload
            await logFollowUp(id, { date, note })
            await reloadFromServer()
            return
          }
          default:
            dispatch(action)
        }
      } catch (err) {
        console.error('Quotation save failed:', err)
        throw err
      }
    },
    [reloadFromServer]
  )

  useEffect(() => {
    if (!state.ready) return
    persistState(state)
  }, [state])

  const value = useMemo(
    () => ({ state, dispatch: syncDispatch, reloadFromServer }),
    [state, syncDispatch, reloadFromServer]
  )

  return (
    <QuotationContext.Provider value={value}>
      {children}
    </QuotationContext.Provider>
  )
}
