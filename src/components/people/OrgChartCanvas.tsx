'use client'

import { useEffect, useRef } from 'react'
import type { OrgNode } from './OrgChart'

type Props = {
  data: OrgNode[]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type D3OrgChartInstance = any

export default function OrgChartCanvas({ data }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current || data.length === 0) return

    let chart: D3OrgChartInstance = null
    let mounted = true

    async function initChart() {
      if (!containerRef.current || !mounted) return

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const d3OrgChart = await import('d3-org-chart')
      const OrgChartClass =
        d3OrgChart.OrgChart ??
        (d3OrgChart as unknown as { default: new () => D3OrgChartInstance }).default

      chart = new OrgChartClass()
        .container(containerRef.current as unknown as string)
        .data(data)
        .nodeWidth(() => 240)
        .nodeHeight(() => 90)
        .nodeContent((d: { data: OrgNode }) => {
          const node = d.data
          const bgColor = '#ffffff'
          const borderColor = '#e4e4e7'
          const textColor = '#18181b'
          const mutedColor = '#71717a'

          return `
            <div style="
              background: ${bgColor};
              border: 1px solid ${borderColor};
              border-radius: 8px;
              padding: 10px 12px;
              width: 240px;
              height: 90px;
              box-sizing: border-box;
              display: flex;
              flex-direction: column;
              justify-content: center;
              gap: 3px;
            ">
              <div style="font-weight: 600; font-size: 14px; color: ${textColor}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                ${node.name}
              </div>
              <div style="font-size: 12px; color: ${mutedColor}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                ${node.title || ''}
              </div>
              <div style="font-size: 11px; color: ${mutedColor}; display: flex; align-items: center; gap: 8px; margin-top: 2px;">
                <span>${node.location || ''}</span>
                ${node.department ? `<span style="color: #d4d4d8">·</span><span>${node.department}</span>` : ''}
                ${node.directReportCount > 0 ? `<span style="background: #f4f4f5; color: #18181b; border-radius: 9999px; padding: 1px 6px; font-size: 10px;">${node.directReportCount}</span>` : ''}
              </div>
            </div>
          `
        })
        .render()
    }

    initChart()

    return () => {
      mounted = false
      // Clear container on unmount
      if (containerRef.current) {
        containerRef.current.innerHTML = ''
      }
    }
  }, [data])

  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-lg bg-card text-muted-foreground"
        style={{ minHeight: 500 }}
      >
        No org chart data available
      </div>
    )
  }

  return <div ref={containerRef} style={{ minHeight: 500, width: '100%' }} />
}
