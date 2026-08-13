'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { AlertTriangle, ShieldCheck } from 'lucide-react'
import {
  createStatutoryRuleSet,
  seedBaselineRuleSet,
  verifyStatutoryRuleSet,
  type RuleSetRow,
} from '@/actions/statutory'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'

type Country = 'SG' | 'MY'

type Draft = {
  annualBaseEmployee: number
  annualBaseContractor: number
  annualBasePartTime: number
  daysPerYearOfService: number
  maxDays: number
  outpatientDays: number
  hospitalisationDays: number
  weeklyRegularCap: number
  overtimeMultiplier: number
  publicHolidayMultiplier: number
  publicHolidayOvertimeMultiplier: number
}

function draftFrom(rules: RuleSetRow['rules']): Draft {
  return {
    annualBaseEmployee: rules.annualLeave.base.EMPLOYEE,
    annualBaseContractor: rules.annualLeave.base.CONTRACTOR,
    annualBasePartTime: rules.annualLeave.base.PART_TIME,
    daysPerYearOfService: rules.annualLeave.daysPerYearOfService,
    maxDays: rules.annualLeave.maxDays,
    outpatientDays: rules.sickLeave.outpatientDays,
    hospitalisationDays: rules.sickLeave.hospitalisationDays,
    weeklyRegularCap: rules.overtime.weeklyRegularCap,
    overtimeMultiplier: rules.overtime.overtimeMultiplier,
    publicHolidayMultiplier: rules.overtime.publicHolidayMultiplier,
    publicHolidayOvertimeMultiplier: rules.overtime.publicHolidayOvertimeMultiplier,
  }
}

function rulesFrom(d: Draft, sourceNote?: string) {
  return {
    annualLeave: {
      base: {
        EMPLOYEE: d.annualBaseEmployee,
        CONTRACTOR: d.annualBaseContractor,
        PART_TIME: d.annualBasePartTime,
      },
      daysPerYearOfService: d.daysPerYearOfService,
      maxDays: d.maxDays,
    },
    sickLeave: {
      outpatientDays: d.outpatientDays,
      hospitalisationDays: d.hospitalisationDays,
      tenureBands: [],
    },
    overtime: {
      weeklyRegularCap: d.weeklyRegularCap,
      overtimeMultiplier: d.overtimeMultiplier,
      publicHolidayMultiplier: d.publicHolidayMultiplier,
      publicHolidayOvertimeMultiplier: d.publicHolidayOvertimeMultiplier,
    },
    ...(sourceNote ? { sourceNote } : {}),
  }
}

export function StatutoryRulesManager({
  rows,
  missingCountries,
}: {
  rows: RuleSetRow[]
  missingCountries: Country[]
}) {
  const [editing, setEditing] = useState<{ country: Country; from: RuleSetRow } | null>(null)

  return (
    <div className="space-y-8">
      {missingCountries.length > 0 && <BaselineImport countries={missingCountries} />}

      {(['SG', 'MY'] as Country[]).map(country => {
        const countryRows = rows.filter(r => r.country === country)
        if (countryRows.length === 0) return null

        return (
          <div key={country} className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                {country === 'SG' ? 'Singapore' : 'Malaysia'}
              </h2>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setEditing({ country, from: countryRows[0] })}
              >
                New version
              </Button>
            </div>

            {countryRows.map(row => (
              <RuleSetCard key={row.id} row={row} />
            ))}
          </div>
        )
      })}

      {editing && (
        <NewVersionForm
          country={editing.country}
          basedOn={editing.from}
          onDone={() => setEditing(null)}
        />
      )}
    </div>
  )
}

function BaselineImport({ countries }: { countries: Country[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-900 dark:bg-amber-950/40">
      <p className="flex items-center gap-2 font-medium">
        <AlertTriangle className="h-4 w-4" />
        {countries.join(' and ')} {countries.length === 1 ? 'has' : 'have'} no rule set stored
      </p>
      <p className="mt-1 text-muted-foreground">
        The app is falling back to the values hardcoded in the source. Import them so they become
        visible and editable here.
      </p>
      <div className="mt-3 flex gap-2">
        {countries.map(c => (
          <Button
            key={c}
            size="sm"
            variant="outline"
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                const res = await seedBaselineRuleSet(c)
                if (res.error) toast.error(res.error)
                else {
                  toast.success(`${c} baseline imported`)
                  router.refresh()
                }
              })
            }
          >
            Import {c} baseline
          </Button>
        ))}
      </div>
    </div>
  )
}

function RuleSetCard({ row }: { row: RuleSetRow }) {
  const router = useRouter()
  const [verifying, setVerifying] = useState(false)
  const [note, setNote] = useState('')
  const [isPending, startTransition] = useTransition()

  const r = row.rules

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <span className="text-sm font-medium">Effective from {row.effectiveFrom}</span>
        {row.inForce && <Badge>In force</Badge>}
        {row.verified ? (
          <Badge variant="secondary" className="gap-1">
            <ShieldCheck className="h-3 w-3" /> Verified
          </Badge>
        ) : (
          <Badge variant="destructive">Unverified</Badge>
        )}
        {!row.verified && !verifying && (
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto"
            onClick={() => setVerifying(true)}
          >
            Record adviser sign-off
          </Button>
        )}
      </div>

      <div className="grid gap-x-8 gap-y-1 px-4 py-3 text-sm sm:grid-cols-2">
        <Fact label="Annual leave — employee">{r.annualLeave.base.EMPLOYEE} days</Fact>
        <Fact label="Annual leave — contractor">{r.annualLeave.base.CONTRACTOR} days</Fact>
        <Fact label="Annual leave — part-time">{r.annualLeave.base.PART_TIME} days</Fact>
        <Fact label="Per year of service">+{r.annualLeave.daysPerYearOfService} days</Fact>
        <Fact label="Entitlement cap">{r.annualLeave.maxDays} days</Fact>
        <Fact label="Sick leave — outpatient">{r.sickLeave.outpatientDays} days</Fact>
        <Fact label="Sick leave — hospitalised">{r.sickLeave.hospitalisationDays} days</Fact>
        <Fact label="Weekly regular cap">{r.overtime.weeklyRegularCap} hours</Fact>
        <Fact label="Overtime multiplier">{r.overtime.overtimeMultiplier}×</Fact>
        <Fact label="Public holiday">{r.overtime.publicHolidayMultiplier}×</Fact>
        <Fact label="Public holiday overtime">{r.overtime.publicHolidayOvertimeMultiplier}×</Fact>
      </div>

      {(r.sourceNote || row.note) && (
        <p className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
          {row.note ?? r.sourceNote}
        </p>
      )}

      {row.verified && row.verifiedNote && (
        <p className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
          Signed off by {row.verifiedByName}: {row.verifiedNote}
        </p>
      )}

      {verifying && (
        <div className="space-y-2 border-t border-border px-4 py-3">
          <Label htmlFor={`verify-${row.id}`}>Who confirmed these values?</Label>
          <Input
            id={`verify-${row.id}`}
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="e.g. Confirmed by <firm>, advice dated 4 Aug 2026, ref 1234"
            disabled={isPending}
          />
          <p className="text-xs text-muted-foreground">
            This records an external professional judgement — it does not substitute for one.
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={note.trim().length < 10 || isPending}
              onClick={() =>
                startTransition(async () => {
                  const res = await verifyStatutoryRuleSet(row.id, note)
                  if (res.error) toast.error(res.error)
                  else {
                    toast.success('Sign-off recorded')
                    setVerifying(false)
                    router.refresh()
                  }
                })
              }
            >
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setVerifying(false)} disabled={isPending}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border/50 py-1 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{children}</span>
    </div>
  )
}

const FIELDS: { key: keyof Draft; label: string; step?: string }[] = [
  { key: 'annualBaseEmployee', label: 'Annual leave — employee (days)' },
  { key: 'annualBaseContractor', label: 'Annual leave — contractor (days)' },
  { key: 'annualBasePartTime', label: 'Annual leave — part-time (days)' },
  { key: 'daysPerYearOfService', label: 'Extra days per year of service' },
  { key: 'maxDays', label: 'Entitlement cap (days)' },
  { key: 'outpatientDays', label: 'Sick leave — outpatient (days)' },
  { key: 'hospitalisationDays', label: 'Sick leave — hospitalised (days)' },
  { key: 'weeklyRegularCap', label: 'Weekly regular hours cap' },
  { key: 'overtimeMultiplier', label: 'Overtime multiplier', step: '0.1' },
  { key: 'publicHolidayMultiplier', label: 'Public holiday multiplier', step: '0.1' },
  { key: 'publicHolidayOvertimeMultiplier', label: 'Public holiday OT multiplier', step: '0.1' },
]

function NewVersionForm({
  country,
  basedOn,
  onDone,
}: {
  country: Country
  basedOn: RuleSetRow
  onDone: () => void
}) {
  const router = useRouter()
  const [draft, setDraft] = useState<Draft>(() => draftFrom(basedOn.rules))
  const [effectiveFrom, setEffectiveFrom] = useState(() => new Date().toISOString().slice(0, 10))
  const [note, setNote] = useState('')
  const [isPending, startTransition] = useTransition()

  return (
    <div className="rounded-lg border border-primary/40 bg-card p-4">
      <h3 className="text-sm font-semibold">
        New {country === 'SG' ? 'Singapore' : 'Malaysia'} rule version
      </h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Creates a new version rather than editing the existing one, so figures already used for pay
        and leave stay as they were. The new version starts unverified.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {FIELDS.map(f => (
          <div key={f.key} className="space-y-1">
            <Label htmlFor={f.key} className="text-xs">
              {f.label}
            </Label>
            <Input
              id={f.key}
              type="number"
              step={f.step ?? '0.5'}
              value={draft[f.key]}
              disabled={isPending}
              onChange={e => setDraft(d => ({ ...d, [f.key]: Number(e.target.value) }))}
            />
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="effective-from" className="text-xs">
            Effective from
          </Label>
          <Input
            id="effective-from"
            type="date"
            value={effectiveFrom}
            onChange={e => setEffectiveFrom(e.target.value)}
            disabled={isPending}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="rule-note" className="text-xs">
            What changed and why
          </Label>
          <Input
            id="rule-note"
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="e.g. Corrected SG overtime cap per adviser"
            disabled={isPending}
          />
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        <Button
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              const res = await createStatutoryRuleSet({
                country,
                effectiveFrom,
                note: note || undefined,
                rules: rulesFrom(draft, note || undefined),
              })
              if (res.error) toast.error(res.error)
              else {
                toast.success('New rule version saved')
                onDone()
                router.refresh()
              }
            })
          }
        >
          {isPending ? 'Saving…' : 'Save new version'}
        </Button>
        <Button variant="ghost" onClick={onDone} disabled={isPending}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
