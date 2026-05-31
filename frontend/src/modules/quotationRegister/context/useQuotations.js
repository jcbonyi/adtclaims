import { useContext } from 'react'
import { QuotationContext } from './quotationContext'

export function useQuotations() {
  const ctx = useContext(QuotationContext)
  if (!ctx) {
    throw new Error('useQuotations must be used within QuotationProvider')
  }
  return ctx
}
