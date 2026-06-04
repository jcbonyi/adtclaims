import { useEffect, useMemo, useRef, useState } from 'react'
import { FILTERS_STORAGE_KEY, THEME } from '../constants'
import { useQuotations } from '../context/useQuotations'
import { useUi } from '../context/uiContext'
import { daysOpen, formatDisplayDate } from '../utils/dates'
import {
  buildQuotationFilterSummary,
  buildQuotationManagementWorkbookBuffer,
  downloadQuotationWorkbook,
} from '../utils/quotationExportExcel'
import { StatusBadge } from './StatusBadge'
import { QuotationFormModal } from './QuotationFormModal'
import { Modal } from './Modal'
import { FollowUpLogModal } from './FollowUpLogModal'
import { Button, Card, PageHeader, LinkButton, EmptyState } from './ui'

function SortIndicator({ active, dir }) {
  if (!active) return <span style={{ opacity: 0.25 }}> ↕</span>
  return <span>{dir === 'asc' ? ' ↑' : ' ↓'}</span>
}

export function Register({
  onView,
}) {
  const { state, dispatch } = useQuotations()
  const { notify } = useUi()
  const { quotations } = state
  const importRef = useRef(null)

  const [search, setSearch] = useState(() => sessionStorage.getItem(`${FILTERS_STORAGE_KEY}:search`) || '')
  const [fStatus, setFStatus] = useState(() => sessionStorage.getItem(`${FILTERS_STORAGE_KEY}:status`) || '')
  const [fCover, setFCover] = useState(() => sessionStorage.getItem(`${FILTERS_STORAGE_KEY}:cover`) || '')
  const [fInsurer, setFInsurer] = useState(() => sessionStorage.getItem(`${FILTERS_STORAGE_KEY}:insurer`) || '')
  const [fAgent, setFAgent] = useState(() => sessionStorage.getItem(`${FILTERS_STORAGE_KEY}:agent`) || '')
  const [sortKey, setSortKey] = useState('dateReceived')
  const [sortDir, setSortDir] = useState('desc')

  const [addOpen, setAddOpen] = useState(false)
  const [editRow, setEditRow] = useState(null)
  const [followRow, setFollowRow] = useState(null)
  const [deleteId, setDeleteId] = useState(null)
  const [importing, setImporting] = useState(false)
  const [exporting, setExporting] = useState(false)

  const filterOptions = useMemo(() => {
    const statuses = new Set()
    const covers = new Set()
    const insurers = new Set()
    const agents = new Set()
    for (const q of quotations) {
      statuses.add(q.status)
      covers.add(q.coverType)
      insurers.add(q.insurer)
      agents.add(q.sourceAgent)
    }
    return {
      statuses: [...statuses].sort(),
      covers: [...covers].sort(),
      insurers: [...insurers].sort(),
      agents: [...agents].sort(),
    }
  }, [quotations])

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase()
    return quotations.filter((q) => {
      if (fStatus && q.status !== fStatus) return false
      if (fCover && q.coverType !== fCover) return false
      if (fInsurer && q.insurer !== fInsurer) return false
      if (fAgent && q.sourceAgent !== fAgent) return false
      if (!s) return true
      const blob = [
        q.clientName,
        q.coverType,
        q.contactPerson,
        q.sourceAgent,
        q.insurer,
        q.status,
        q.notes,
      ]
        .join(' ')
        .toLowerCase()
      return blob.includes(s)
    })
  }, [quotations, search, fStatus, fCover, fInsurer, fAgent])

  const sorted = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1
    const get = (q, key) => {
      switch (key) {
        case 'id':
          return q.id
        case 'clientName':
          return q.clientName?.toLowerCase() ?? ''
        case 'coverType':
          return q.coverType?.toLowerCase() ?? ''
        case 'contactPerson':
          return q.contactPerson?.toLowerCase() ?? ''
        case 'sourceAgent':
          return q.sourceAgent?.toLowerCase() ?? ''
        case 'dateReceived':
          return q.dateReceived ?? ''
        case 'daysOpen':
          return daysOpen(q.dateReceived)
        case 'insurer':
          return q.insurer?.toLowerCase() ?? ''
        case 'status':
          return q.status?.toLowerCase() ?? ''
        default:
          return q.id
      }
    }
    return [...filtered].sort((a, b) => {
      const va = get(a, sortKey)
      const vb = get(b, sortKey)
      if (va < vb) return -1 * dir
      if (va > vb) return 1 * dir
      return 0
    })
  }, [filtered, sortKey, sortDir])

  useEffect(() => {
    sessionStorage.setItem(`${FILTERS_STORAGE_KEY}:search`, search)
    sessionStorage.setItem(`${FILTERS_STORAGE_KEY}:status`, fStatus)
    sessionStorage.setItem(`${FILTERS_STORAGE_KEY}:cover`, fCover)
    sessionStorage.setItem(`${FILTERS_STORAGE_KEY}:insurer`, fInsurer)
    sessionStorage.setItem(`${FILTERS_STORAGE_KEY}:agent`, fAgent)
  }, [search, fStatus, fCover, fInsurer, fAgent])

  const toggleSort = (key) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir(key === 'clientName' || key === 'contactPerson' ? 'asc' : 'desc')
    }
  }

  const selectClass = 'adt-select'

  const handleExport = async () => {
    setExporting(true)
    try {
      const filterSummary = buildQuotationFilterSummary({
        search,
        status: fStatus,
        coverType: fCover,
        insurer: fInsurer,
        agent: fAgent,
      })
      const buffer = await buildQuotationManagementWorkbookBuffer({
        quotations: sorted,
        filterSummary,
      })
      downloadQuotationWorkbook(buffer)
      notify(`Exported ${sorted.length} records to Excel.`)
    } catch (err) {
      console.error('Quotation Excel export failed:', err)
      notify('Excel export failed. Please try again.')
    } finally {
      setExporting(false)
    }
  }

  const handleImportFile = async (file) => {
    if (!file) return
    setImporting(true)
    try {
      const text = await file.text()
      const lines = text.split(/\r?\n/).filter(Boolean)
      if (lines.length < 2) throw new Error('No rows found in CSV.')
      const headers = lines[0].split(',').map((x) => x.trim().replaceAll('"', ''))
      const rows = lines.slice(1).map((line, idx) => {
        const values = parseCsvLine(line)
        const obj = Object.fromEntries(headers.map((h, i) => [h, values[i] ?? '']))
        return {
          id: Number(obj.id) || idx + 1,
          clientName: obj.clientName || '',
          coverType: obj.coverType || '',
          contactPerson: obj.contactPerson || '',
          sourceAgent: obj.sourceAgent || '',
          dateReceived: obj.dateReceived || null,
          dateSentToInsurer: obj.dateSentToInsurer || null,
          insurer: obj.insurer || '',
          dateReceivedFromInsurer: obj.dateReceivedFromInsurer || null,
          status: obj.status || 'Pending',
          policyNumber: obj.policyNumber || '',
          premium: obj.premium ? Number(obj.premium) : null,
          sumInsured: obj.sumInsured ? Number(obj.sumInsured) : null,
          renewalDate: obj.renewalDate || null,
          notes: obj.notes || '',
          lastFollowUp: obj.lastFollowUp || null,
          followUpHistory: [],
          statusHistory: obj.status
            ? [{ date: obj.dateReceived || obj.lastFollowUp || new Date().toISOString().slice(0, 10), status: obj.status }]
            : [],
        }
      })
      await dispatch({ type: 'IMPORT', payload: rows })
      notify(`Imported ${rows.length} records from CSV.`)
    } catch {
      notify('CSV import failed. Check header names and row formatting.')
    } finally {
      setImporting(false)
      if (importRef.current) importRef.current.value = ''
    }
  }

  return (
    <>
      <PageHeader
        title="Quotation Register"
        subtitle={`Showing ${sorted.length} of ${quotations.length} records.`}
        actions={(
          <>
            <Button tone="accent" onClick={() => setAddOpen(true)}>+ Add new quotation</Button>
            <Button tone="primary" onClick={handleExport} disabled={exporting}>
              {exporting ? 'Exporting...' : 'Export Excel'}
            </Button>
            <Button onClick={() => importRef.current?.click()}>{importing ? 'Importing...' : 'Import CSV'}</Button>
            <input
              ref={importRef}
              type="file"
              accept=".csv,text/csv"
              style={{ display: 'none' }}
              onChange={(e) => handleImportFile(e.target.files?.[0])}
            />
          </>
        )}
      />

      <div className="adt-filter-bar">
        <div className="adt-search-wrap">
          <span className="adt-search-icon" aria-hidden="true">🔍</span>
          <input
            className="adt-input"
            placeholder="Search client, cover, contact, insurer, notes…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} className={selectClass} style={{ minWidth: 140 }}>
          <option value="">All statuses</option>
          {filterOptions.statuses.map((x) => (
            <option key={x} value={x}>{x}</option>
          ))}
        </select>
        <select value={fCover} onChange={(e) => setFCover(e.target.value)} className={selectClass} style={{ minWidth: 140 }}>
          <option value="">All cover types</option>
          {filterOptions.covers.map((x) => (
            <option key={x} value={x}>{x}</option>
          ))}
        </select>
        <select value={fInsurer} onChange={(e) => setFInsurer(e.target.value)} className={selectClass} style={{ minWidth: 140 }}>
          <option value="">All insurers</option>
          {filterOptions.insurers.map((x) => (
            <option key={x} value={x}>{x}</option>
          ))}
        </select>
        <select value={fAgent} onChange={(e) => setFAgent(e.target.value)} className={selectClass} style={{ minWidth: 140 }}>
          <option value="">All agents</option>
          {filterOptions.agents.map((x) => (
            <option key={x} value={x}>{x}</option>
          ))}
        </select>
        <Button
          onClick={() => {
            setSearch('')
            setFStatus('')
            setFCover('')
            setFInsurer('')
            setFAgent('')
          }}
        >
          Clear filters
        </Button>
      </div>

      <Card>
        <div className="adt-table-wrap">
          <table className="adt-table">
            <thead>
              <tr>
                {[
                  ['id', '#'],
                  ['clientName', 'Client'],
                  ['coverType', 'Cover type'],
                  ['contactPerson', 'Contact'],
                  ['sourceAgent', 'Agent'],
                  ['dateReceived', 'Date received'],
                  ['daysOpen', 'Days open'],
                  ['insurer', 'Insurer'],
                  ['status', 'Status'],
                ].map(([key, label]) => (
                  <th key={key} onClick={() => toggleSort(key)} scope="col">
                    {label}
                    <SortIndicator active={sortKey === key} dir={sortDir} />
                  </th>
                ))}
                <th scope="col" className="adt-th-static">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((q) => {
                const dOpen = daysOpen(q.dateReceived)
                return (
                  <tr key={q.id}>
                    <td style={{ color: THEME.textMuted, fontSize: 13 }}>{q.id}</td>
                    <td>
                      <LinkButton onClick={() => onView(q.id)}>{q.clientName}</LinkButton>
                    </td>
                    <td>{q.coverType}</td>
                    <td>{q.contactPerson}</td>
                    <td>{q.sourceAgent}</td>
                    <td>{formatDisplayDate(q.dateReceived)}</td>
                    <td
                      style={{
                        fontWeight: 700,
                        color: dOpen > 14 ? '#DC2626' : dOpen > 7 ? '#B45309' : THEME.text,
                      }}
                    >
                      {dOpen}
                    </td>
                    <td>{q.insurer}</td>
                    <td><StatusBadge status={q.status} /></td>
                    <td>
                      <select
                        aria-label={`Actions for ${q.clientName}`}
                        className={selectClass}
                        style={{ minWidth: 118, padding: '6px 10px', fontSize: 13 }}
                        onChange={(e) => {
                          const value = e.target.value
                          e.target.value = ''
                          if (value === 'view') onView(q.id)
                          if (value === 'edit') setEditRow(q)
                          if (value === 'follow') setFollowRow(q)
                          if (value === 'delete') setDeleteId(q.id)
                        }}
                      >
                        <option value="">Actions</option>
                        <option value="view">View</option>
                        <option value="edit">Edit</option>
                        <option value="follow">Follow up</option>
                        <option value="delete">Delete</option>
                      </select>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {sorted.length === 0 && (
          <EmptyState>No quotations match your filters.</EmptyState>
        )}
      </Card>

      {addOpen && (
        <QuotationFormModal
          onClose={() => setAddOpen(false)}
          initial={null}
          title="Add quotation"
          onSave={async (payload) => {
            try {
              await dispatch({
                type: 'ADD',
                payload: { ...payload, followUpHistory: [] },
              })
              notify('Quotation added.')
            } catch {
              notify('Could not save quotation. Please try again.')
            }
          }}
        />
      )}

      {editRow && (
        <QuotationFormModal
          key={editRow.id}
          onClose={() => setEditRow(null)}
          initial={editRow}
          title="Edit quotation"
          onSave={async (payload) => {
            try {
              await dispatch({ type: 'UPDATE', payload: { id: editRow.id, patch: payload } })
              notify('Quotation updated.')
              setEditRow(null)
            } catch {
              notify('Could not update quotation. Please try again.')
            }
          }}
        />
      )}

      {followRow && (
        <FollowUpLogModal
          clientLabel={followRow.clientName}
          onClose={() => setFollowRow(null)}
          onSubmit={async ({ date, note }) => {
            try {
              await dispatch({
                type: 'LOG_FOLLOW_UP',
                payload: { id: followRow.id, date, note },
              })
              notify('Follow-up entry saved.')
              setFollowRow(null)
            } catch {
              notify('Could not save follow-up. Please try again.')
            }
          }}
        />
      )}

      {deleteId != null && (
        <Modal title="Delete quotation?" onClose={() => setDeleteId(null)}>
          <p style={{ marginTop: 0, color: THEME.textMuted }}>
            This removes the record from the register. This cannot be undone.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <Button onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button
              tone="danger"
              onClick={async () => {
                try {
                  await dispatch({ type: 'DELETE', payload: deleteId })
                  setDeleteId(null)
                  notify('Quotation deleted.')
                } catch {
                  notify('Could not delete quotation. Please try again.')
                }
              }}
            >
              Delete
            </Button>
          </div>
        </Modal>
      )}
    </>
  )
}

function parseCsvLine(line) {
  const values = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i]
    const next = line[i + 1]
    if (c === '"' && quoted && next === '"') {
      cur += '"'
      i += 1
    } else if (c === '"') {
      quoted = !quoted
    } else if (c === ',' && !quoted) {
      values.push(cur)
      cur = ''
    } else {
      cur += c
    }
  }
  values.push(cur)
  return values.map((v) => v.trim())
}
