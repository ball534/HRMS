'use client'

import dynamic from 'next/dynamic'

const OrgChartCanvas = dynamic(() => import('./OrgChartCanvas'), {
  ssr: false,
  loading: () => (
    <div className="animate-pulse rounded-lg bg-card" style={{ minHeight: 500 }} />
  ),
})

export type OrgNode = {
  id: string
  name: string
  title: string
  location: string
  department: string
  parentId: string | null
  directReportCount: number
}

export function OrgChart({ data }: { data: OrgNode[] }) {
  return <OrgChartCanvas data={data} />
}
