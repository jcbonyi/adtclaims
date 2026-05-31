import { buildSeedQuotations } from './seedData'
import { STORAGE_KEY } from './constants'

export const initialState = {
  quotations: [],
  nextId: 1,
}

function normalizeQuotation(row) {
  return {
    ...row,
    followUpHistory: Array.isArray(row.followUpHistory)
      ? row.followUpHistory.map((e) => ({ ...e }))
      : [],
    statusHistory: Array.isArray(row.statusHistory)
      ? row.statusHistory.map((e) => ({ ...e }))
      : [],
    premium: row.premium ?? null,
    sumInsured: row.sumInsured ?? null,
    renewalDate: row.renewalDate ?? null,
    policyNumber: row.policyNumber ?? '',
  }
}

export function loadPersistedState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || !Array.isArray(parsed.quotations)) return null
    const maxId = parsed.quotations.reduce(
      (m, q) => Math.max(m, Number(q.id) || 0),
      0
    )
    return {
      quotations: parsed.quotations.map(normalizeQuotation),
      nextId: Math.max(maxId + 1, parsed.nextId || maxId + 1),
    }
  } catch {
    return null
  }
}

export function getInitialReducerState() {
  const persisted = loadPersistedState()
  if (persisted) return persisted
  const seed = buildSeedQuotations()
  const maxId = seed.reduce((m, q) => Math.max(m, q.id), 0)
  return { quotations: seed.map(normalizeQuotation), nextId: maxId + 1 }
}

export function quotationReducer(state, action) {
  switch (action.type) {
    case 'ADD': {
      const id = state.nextId
      const row = normalizeQuotation({
        ...action.payload,
        id,
        statusHistory: action.payload.status
          ? [{ date: action.payload.dateReceived, status: action.payload.status }]
          : [],
      })
      return {
        quotations: [...state.quotations, row],
        nextId: id + 1,
      }
    }
    case 'UPDATE': {
      const { id, patch } = action.payload
      const current = state.quotations.find((q) => q.id === id)
      return {
        ...state,
        quotations: state.quotations.map((q) =>
          q.id === id
            ? normalizeQuotation({
                ...q,
                ...patch,
                statusHistory:
                  current && patch.status && patch.status !== current.status
                    ? [
                        ...q.statusHistory,
                        {
                          date: patch.lastFollowUp || patch.dateReceivedFromInsurer || patch.dateReceived || new Date().toISOString().slice(0, 10),
                          status: patch.status,
                        },
                      ]
                    : q.statusHistory,
              })
            : q
        ),
      }
    }
    case 'DELETE': {
      return {
        ...state,
        quotations: state.quotations.filter((q) => q.id !== action.payload),
      }
    }
    case 'IMPORT': {
      const incoming = Array.isArray(action.payload) ? action.payload : []
      const normalized = incoming.map(normalizeQuotation)
      const maxId = normalized.reduce((m, q) => Math.max(m, Number(q.id) || 0), 0)
      return {
        quotations: normalized,
        nextId: maxId + 1,
      }
    }
    case 'LOG_FOLLOW_UP': {
      const { id, date, note } = action.payload
      return {
        ...state,
        quotations: state.quotations.map((q) => {
          if (q.id !== id) return q
          const entry = { date, note }
          return normalizeQuotation({
            ...q,
            lastFollowUp: date,
            followUpHistory: [...q.followUpHistory, entry],
          })
        }),
      }
    }
    default:
      return state
  }
}

export function persistState(state) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        quotations: state.quotations,
        nextId: state.nextId,
      })
    )
  } catch {
    /* ignore */
  }
}
