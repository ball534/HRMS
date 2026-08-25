import { ApplicationForm } from '@/components/candidates/ApplicationForm'

export const metadata = {
  title: 'Apply — IORA Group',
  description: 'Apply to join the IORA Group retail and HQ teams.',
}

/**
 * The public application form.
 *
 * Deliberately outside the (dashboard) route group and outside every session
 * check: this is the form linked from a job ad, filled in by people who have no
 * account and mostly never will. What it creates is a Candidate, not a User.
 */
export default function ApplyPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <header className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          IORA Group
        </p>
        <h1 className="mt-2 text-3xl font-bold">Apply to join us</h1>
        <p className="mt-2 text-muted-foreground">
          Tell us a little about yourself. If your application looks like a fit, we will be in touch
          to arrange an interview.
        </p>
      </header>

      <ApplicationForm />

      <p className="mt-8 text-xs text-muted-foreground">
        We use what you send here to consider your application and, if you are hired, to set up your
        employment record. We do not ask for your NRIC, bank details or any other identity document
        at this stage — you will be asked for those only after you have accepted an offer.
      </p>
    </main>
  )
}
