'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { setOrgSetting, type SettingRow } from '@/actions/settings'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'

type Props = {
  rows: SettingRow[]
  approverOptions: { id: string; name: string; role: string }[]
}

function fmtWhen(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function SettingsManager({ rows, approverOptions }: Props) {
  const groups = Array.from(new Set(rows.map(r => r.group)))

  return (
    <div className="space-y-6">
      {groups.map(group => (
        <div key={group} className="rounded-lg border border-border bg-card">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {group}
            </h2>
          </div>
          <div className="divide-y divide-border">
            {rows
              .filter(r => r.group === group)
              .map(row => (
                <SettingField key={row.key} row={row} approverOptions={approverOptions} />
              ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function SettingField({ row, approverOptions }: { row: SettingRow; approverOptions: Props['approverOptions'] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  // Local draft so the field doesn't snap back while the action is in flight.
  const [draft, setDraft] = useState<string>(() => {
    if (row.kind === 'boolean') return row.value ? 'true' : 'false'
    if (row.value === null || row.value === undefined) return ''
    return String(row.value)
  })

  const current =
    row.kind === 'boolean'
      ? row.value
        ? 'true'
        : 'false'
      : row.value === null || row.value === undefined
        ? ''
        : String(row.value)

  const dirty = draft !== current

  function save(nextRaw?: string) {
    const raw = nextRaw ?? draft

    let parsed: unknown
    if (row.kind === 'boolean') parsed = raw === 'true'
    else if (row.kind === 'number') {
      const n = Number(raw)
      if (!Number.isFinite(n)) {
        toast.error('Enter a number')
        return
      }
      parsed = n
    } else {
      // user picker — empty string means "no fallback approver set"
      parsed = raw === '' ? null : raw
    }

    startTransition(async () => {
      const res = await setOrgSetting(row.key, parsed)
      if (res.error) {
        toast.error(res.error)
        return
      }
      toast.success(`${row.label} saved`)
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 sm:max-w-xl">
        <div className="flex flex-wrap items-center gap-2">
          <Label htmlFor={row.key} className="text-sm font-medium">
            {row.label}
          </Label>
          {row.isDefault && (
            <Badge variant="outline" className="text-[10px]">
              default
            </Badge>
          )}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{row.description}</p>
        {!row.isDefault && row.updatedByName && (
          <p className="mt-1 text-[11px] text-muted-foreground/80">
            Changed by {row.updatedByName} · {fmtWhen(row.updatedAt)}
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {row.kind === 'boolean' && (
          <select
            id={row.key}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={draft}
            disabled={isPending}
            onChange={e => {
              setDraft(e.target.value)
              save(e.target.value)
            }}
          >
            <option value="true">On</option>
            <option value="false">Off</option>
          </select>
        )}

        {row.kind === 'user' && (
          <select
            id={row.key}
            className="h-9 min-w-56 rounded-md border border-input bg-background px-3 text-sm"
            value={draft}
            disabled={isPending}
            onChange={e => {
              setDraft(e.target.value)
              save(e.target.value)
            }}
          >
            <option value="">— none set —</option>
            {approverOptions.map(o => (
              <option key={o.id} value={o.id}>
                {o.name} ({o.role})
              </option>
            ))}
          </select>
        )}

        {row.kind === 'number' && (
          <>
            <Input
              id={row.key}
              type="number"
              className="h-9 w-28"
              value={draft}
              disabled={isPending}
              onChange={e => setDraft(e.target.value)}
            />
            <Button size="sm" variant="outline" disabled={!dirty || isPending} onClick={() => save()}>
              {isPending ? 'Saving…' : 'Save'}
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
