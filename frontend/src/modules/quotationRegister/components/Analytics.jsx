import { useMemo, useState } from 'react'
import { THEME, isPlacedStatus } from '../constants'
import { useQuotations } from '../context/useQuotations'
import { daysBetween, monthKey, monthLabel } from '../utils/dates'
import {
  FunnelBars,
  HorizontalBarChart,
} from './charts/SimpleCharts'
import { Card, CardTitle, PageHeader, KpiCard, KpiRow } from './ui'

function avg(nums) {
  if (!nums.length) return null
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10
}

export function Analytics() {
  const { state } = useQuotations()
  const { quotations } = state
  const [fromMonth, setFromMonth] = useState('')
  const [toMonth, setToMonth] = useState('')

  const scopedQuotes = useMemo(() => {
    return quotations.filter((q) => {
      const key = monthKey(q.dateReceived)
      if (!key) return false
      if (fromMonth && key < fromMonth) return false
      if (toMonth && key > toMonth) return false
      return true
    })
  }, [quotations, fromMonth, toMonth])

  const monthOptions = useMemo(() => {
    const keys = new Set(quotations.map((q) => monthKey(q.dateReceived)).filter(Boolean))
    return [...keys].sort()
  }, [quotations])

  const monthly = useMemo(() => {
    const map = new Map()
    for (const q of scopedQuotes) {
      const k = monthKey(q.dateReceived)
      if (!k) continue
      map.set(k, (map.get(k) ?? 0) + 1)
    }
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, value]) => ({ label: monthLabel(k), value }))
  }, [scopedQuotes])

  const funnel = useMemo(() => {
    const total = scopedQuotes.length
    const sent = scopedQuotes.filter((q) => q.dateSentToInsurer).length
    const back = scopedQuotes.filter((q) => q.dateReceivedFromInsurer).length
    const placed = scopedQuotes.filter((q) => isPlacedStatus(q.status)).length
    return [
      { label: 'Received', count: total },
      { label: 'Sent to insurer', count: sent },
      { label: 'Quote back from insurer', count: back },
      { label: 'Cover placed', count: placed },
    ]
  }, [scopedQuotes])

  const agents = useMemo(() => {
    const map = new Map()
    for (const q of scopedQuotes) {
      const a = q.sourceAgent?.trim() || '—'
      map.set(a, (map.get(a) ?? 0) + 1)
    }
    return [...map.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
  }, [scopedQuotes])

  const { avgToInsurer, avgInsurerBack } = useMemo(() => {
    const toIns = []
    const insBack = []
    for (const q of scopedQuotes) {
      if (q.dateReceived && q.dateSentToInsurer) {
        const d = daysBetween(q.dateReceived, q.dateSentToInsurer)
        if (d != null) toIns.push(d)
      }
      if (q.dateSentToInsurer && q.dateReceivedFromInsurer) {
        const d = daysBetween(q.dateSentToInsurer, q.dateReceivedFromInsurer)
        if (d != null) insBack.push(d)
      }
    }
    return { avgToInsurer: avg(toIns), avgInsurerBack: avg(insBack) }
  }, [scopedQuotes])

  return (
    <>
      <PageHeader
        title="Analytics"
        subtitle="Turnaround and conversion metrics for performance tracking."
        actions={(
          <>
            <select value={fromMonth} onChange={(e) => setFromMonth(e.target.value)} className="adt-select" style={{ minWidth: 170 }}>
              <option value="">From month</option>
              {monthOptions.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
            </select>
            <select value={toMonth} onChange={(e) => setToMonth(e.target.value)} className="adt-select" style={{ minWidth: 170 }}>
              <option value="">To month</option>
              {monthOptions.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
            </select>
          </>
        )}
      />

      <KpiRow>
        <KpiCard
          label="Avg. days — received → sent"
          value={avgToInsurer != null ? `${avgToInsurer}d` : 'N/A'}
          sub="Time to send to insurer"
          accent={THEME.brandBlue}
        />
        <KpiCard
          label="Avg. days — insurer cycle"
          value={avgInsurerBack != null ? `${avgInsurerBack}d` : 'N/A'}
          sub="Sent to received back"
          accent={THEME.brandGreen}
        />
      </KpiRow>

      <Card style={{ padding: 24 }} hover>
        <CardTitle>Monthly quote volume (by date received)</CardTitle>
        <HorizontalBarChart items={monthly} labelKey="label" valueKey="value" barColor={THEME.brandGreen} />
      </Card>

      <Card style={{ padding: 24 }} hover>
        <CardTitle>Conversion funnel</CardTitle>
        <FunnelBars stages={funnel} />
      </Card>

      <Card style={{ padding: 24 }} hover>
        <CardTitle>Agent leaderboard (quotes handled)</CardTitle>
        <HorizontalBarChart items={agents} labelKey="label" valueKey="value" barColor={THEME.brandBlue} />
      </Card>
    </>
  )
}
