import {
  useEffect,
  useMemo,
  useReducer,
} from 'react'
import { QuotationContext } from './quotationContext'
import {
  getInitialReducerState,
  persistState,
  quotationReducer,
} from '../quotationReducer'

export function QuotationProvider({ children }) {
  const [state, dispatch] = useReducer(
    quotationReducer,
    undefined,
    getInitialReducerState
  )

  useEffect(() => {
    persistState(state)
  }, [state])

  const value = useMemo(() => ({ state, dispatch }), [state, dispatch])

  return (
    <QuotationContext.Provider value={value}>
      {children}
    </QuotationContext.Provider>
  )
}
