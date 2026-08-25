/**
 * Letter content: the default terms per letter kind, and the merge fields they
 * are written against.
 *
 * How letters used to work: HR uploaded a fillable PDF per letter type, and the
 * app filled its AcroForm boxes. That made the wording untouchable from inside
 * the app — changing a clause meant editing a PDF in Acrobat and re-uploading
 * it — and it clipped any value longer than the box someone had drawn, because
 * form fields do not reflow.
 *
 * A letter is now a list of titled sections. A draft starts from the defaults
 * below with the employee's details already merged in, and HR edits the wording,
 * reorders sections, and adds or deletes them before sending it for signature.
 * The PDF is drawn from the sections at generation time, so long values wrap
 * instead of disappearing.
 *
 * Deliberately not `server-only`: the letter workspace shows HR which merge
 * fields exist, so the vocabulary has to be importable from a client component.
 */

// ============================================================
// Merge fields
// ============================================================

/**
 * The values a section body may reference as `{{field}}`.
 *
 * Kept in step with `buildMergeValues` in src/actions/letters.ts. An unknown
 * field is left in the text verbatim rather than blanked, so a typo is visible
 * on screen while the letter is still a draft instead of printing as a gap.
 */
export const LETTER_MERGE_FIELDS = [
  'firstName',
  'lastName',
  'fullName',
  'employeeNumber',
  'nric',
  'passportNumber',
  'position',
  'department',
  'company',
  'country',
  'email',
  'startDate',
  'probationMonths',
  'probationEndDate',
  'confirmationDate',
  'today',
  'approvingOfficerName',
  // Pay. Part-time letters quote day-type rates; the others quote none.
  'hourlyRate',
  'hourlyRateWeekday',
  'hourlyRateSaturday',
  'hourlyRateSundayPh',
  'hourlyRateWeekend',
] as const

export type LetterMergeField = (typeof LETTER_MERGE_FIELDS)[number]

/** `{{field}}` → value. Unknown fields are left untouched (see above). */
export function mergeText(text: string, values: Record<string, string>): string {
  return text.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (whole, name: string) =>
    name in values ? values[name] : whole,
  )
}

// ============================================================
// Sections
// ============================================================

export type LetterSection = {
  /** Stable per-section id, so reordering and editing don't get confused. */
  id: string
  title: string
  body: string
}

/** Runtime check for `EmploymentLetter.sections`, which is `Json` in the schema. */
export function parseSections(value: unknown): LetterSection[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((row, index) => {
    if (!row || typeof row !== 'object') return []
    const r = row as Record<string, unknown>
    if (typeof r.title !== 'string' || typeof r.body !== 'string') return []
    return [
      {
        id: typeof r.id === 'string' && r.id ? r.id : `section-${index + 1}`,
        title: r.title,
        body: r.body,
      },
    ]
  })
}

// ============================================================
// The six kinds of employment letter
// ============================================================

export const LETTER_KINDS = [
  'FT_RETAIL',
  'FT_HQ',
  'PT_LOGISTICS',
  'PT_RETAIL',
  'INTERN_REGULAR',
  'INTERN_SCHOOL',
] as const

export type LetterKindName = (typeof LETTER_KINDS)[number]

export const LETTER_KIND_LABELS: Record<LetterKindName, string> = {
  FT_RETAIL: 'Full-time — Retail',
  FT_HQ: 'Full-time — HQ',
  PT_LOGISTICS: 'Part-time — Logistics',
  PT_RETAIL: 'Part-time — Retail',
  INTERN_REGULAR: 'Internship — regular',
  INTERN_SCHOOL: 'Internship — school programme',
}

/**
 * Which terms to draft from, given how the person is employed.
 *
 * Retail and Retail Operations share the retail terms; every other department
 * gets the HQ ones. The two internship variants cannot be derived — whether an
 * internship is attached to a school programme is not recorded anywhere on the
 * employee record — so HR picks those in the workspace, and this only ever
 * suggests a starting point.
 */
export function deriveLetterKind(input: {
  employmentType: string
  department: string | null | undefined
  position: string | null | undefined
}): LetterKindName {
  const dept = (input.department ?? '').trim().toLowerCase()
  const retailTerms = dept === 'retail' || dept === 'retail operations'
  const logistics = dept === 'logistics'

  if (input.employmentType === 'PART_TIME') {
    return logistics ? 'PT_LOGISTICS' : 'PT_RETAIL'
  }

  // An intern is usually recorded as a contractor with "intern" in the title.
  // Default to the regular variant; HR switches to the school one when the
  // placement comes through an institution.
  if (/\bintern/i.test(input.position ?? '')) {
    return 'INTERN_REGULAR'
  }

  return retailTerms ? 'FT_RETAIL' : 'FT_HQ'
}

// ============================================================
// Default section sets
// ============================================================

const OPENING: LetterSection = {
  id: 'opening',
  title: 'Offer of employment',
  body:
    'Dear {{firstName}},\n\n' +
    'We are pleased to offer you the position of {{position}} in the {{department}} department at {{company}}, ' +
    'commencing on {{startDate}}. This letter sets out the terms of your employment.',
}

const CONFIDENTIALITY: LetterSection = {
  id: 'confidentiality',
  title: 'Confidentiality',
  body:
    'During and after your employment you shall keep confidential all information belonging to the Group, ' +
    'including sales figures, supplier terms, customer data, product plans and any information about your ' +
    'colleagues, and shall not disclose it to anyone outside the Group without written authorisation.',
}

const CLOSING: LetterSection = {
  id: 'closing',
  title: 'Acceptance',
  body:
    'Please review this letter and, if the terms are acceptable, sign it in the HR system. ' +
    'Once signed you will be asked to upload the documents we need to add you to payroll.\n\n' +
    'We look forward to welcoming you.',
}

/** Full-time terms shared by the retail and HQ letters. */
function fullTimeSections(flavour: 'retail' | 'hq'): LetterSection[] {
  return [
    OPENING,
    {
      id: 'appointment',
      title: 'Appointment and reporting',
      body:
        'Your appointment is as {{position}}, {{department}}, based in {{country}}. ' +
        (flavour === 'retail'
          ? 'You may be assigned to any of the Group’s stores according to operational needs, and your ' +
            'rostered hours will follow the store roster issued by your store manager.'
          : 'Your normal working hours are those of the office to which you are assigned, and you may be ' +
            'required to work such additional hours as your responsibilities reasonably require.'),
    },
    {
      id: 'probation',
      title: 'Probation',
      body:
        'You will serve a probationary period of {{probationMonths}} months from your start date, ending on ' +
        '{{probationEndDate}}. During probation either party may terminate this employment by giving one ' +
        'week’s written notice. Your confirmation in the role will be communicated to you in writing.',
    },
    {
      id: 'remuneration',
      title: 'Remuneration',
      body:
        'Your salary, allowances and any incentive arrangements are as set out in the accompanying salary ' +
        'advice, and are reviewed annually. Salary is paid monthly, subject to statutory deductions.',
    },
    {
      id: 'leave',
      title: 'Leave and benefits',
      body:
        'You are entitled to annual leave, sick leave and public holidays in accordance with Group policy and ' +
        'the employment legislation of {{country}}, as recorded in the HR system. Leave is applied for and ' +
        'approved through the HR system.',
    },
    CONFIDENTIALITY,
    {
      id: 'notice',
      title: 'Notice of termination',
      body:
        'After confirmation, either party may terminate this employment by giving one month’s written notice, ' +
        'or salary in lieu of notice. The Group may terminate employment without notice for misconduct.',
    },
    CLOSING,
  ]
}

/** Part-time terms. Logistics quotes three day-type rates, retail two. */
function partTimeSections(flavour: 'logistics' | 'retail'): LetterSection[] {
  const rates =
    flavour === 'logistics'
      ? {
          id: 'rates',
          title: 'Hourly rates',
          body:
            'You will be paid by the hour, at the following rates:\n\n' +
            'Weekdays (Monday to Friday): {{hourlyRateWeekday}} per hour\n' +
            'Saturdays: {{hourlyRateSaturday}} per hour\n' +
            'Sundays and public holidays: {{hourlyRateSundayPh}} per hour\n\n' +
            'Hours are recorded on your timesheet in the HR system, approved by your supervisor, and paid ' +
            'monthly in arrears.',
        }
      : {
          id: 'rates',
          title: 'Hourly rates',
          body:
            'You will be paid by the hour, at the following rates:\n\n' +
            'Weekdays (Monday to Friday): {{hourlyRateWeekday}} per hour\n' +
            'Weekends and public holidays: {{hourlyRateWeekend}} per hour\n\n' +
            'Hours are recorded on your timesheet in the HR system, approved by your store manager, and paid ' +
            'monthly in arrears.',
        }

  return [
    {
      ...OPENING,
      title: 'Offer of part-time employment',
      body:
        'Dear {{firstName}},\n\n' +
        'We are pleased to offer you part-time employment as {{position}} in the {{department}} department at ' +
        '{{company}}, commencing on {{startDate}}. This letter sets out the terms of your employment.',
    },
    {
      id: 'hours',
      title: 'Working hours',
      body:
        flavour === 'logistics'
          ? 'You will work the shifts assigned to you at the distribution centre. There is no guaranteed ' +
            'minimum number of hours; shifts are offered according to operational needs and you may decline ' +
            'a shift you are not available for.'
          : 'You will work the shifts assigned to you on the store roster. There is no guaranteed minimum ' +
            'number of hours; shifts are offered according to store needs and you may decline a shift you ' +
            'are not available for.',
    },
    rates,
    {
      id: 'leave',
      title: 'Leave',
      body:
        'You are entitled to pro-rated annual leave, sick leave and public holiday entitlement in accordance ' +
        'with the employment legislation of {{country}}, calculated on the hours you work.',
    },
    CONFIDENTIALITY,
    {
      id: 'notice',
      title: 'Notice of termination',
      body:
        'Either party may terminate this employment by giving one week’s written notice. The Group may ' +
        'terminate employment without notice for misconduct.',
    },
    CLOSING,
  ]
}

/** Internship terms. The school variant adds the institution's reporting. */
function internSections(flavour: 'regular' | 'school'): LetterSection[] {
  return [
    {
      id: 'opening',
      title: 'Offer of internship',
      body:
        'Dear {{firstName}},\n\n' +
        'We are pleased to offer you an internship as {{position}} in the {{department}} department at ' +
        '{{company}}, commencing on {{startDate}}. This letter sets out the terms of your internship.',
    },
    {
      id: 'duration',
      title: 'Duration and hours',
      body:
        flavour === 'school'
          ? 'Your internship runs for the period agreed with your institution and follows the working hours ' +
            'of the team you are attached to. Any change to the dates must be agreed with both your ' +
            'institution and the Group.'
          : 'Your internship runs for the period agreed in writing with your supervisor and follows the ' +
            'working hours of the team you are attached to.',
    },
    {
      id: 'allowance',
      title: 'Allowance',
      body:
        'You will receive a monthly internship allowance as set out in the accompanying advice. The ' +
        'internship does not carry the benefits of permanent employment.',
    },
    ...(flavour === 'school'
      ? [
          {
            id: 'institution',
            title: 'Reporting to your institution',
            body:
              'The Group will complete the attendance records, appraisals and reports your institution ' +
              'requires as part of this placement, and will keep your institution informed of your progress ' +
              'and of any change to the placement.',
          },
        ]
      : []),
    {
      id: 'supervision',
      title: 'Supervision and learning',
      body:
        'You will be assigned a supervisor who is responsible for your work and your learning objectives. ' +
        'You are expected to follow Group policies, including those on conduct, safety and confidentiality.',
    },
    CONFIDENTIALITY,
    {
      id: 'closing',
      title: 'Acceptance',
      body:
        'Please review this letter and, if the terms are acceptable, sign it in the HR system. ' +
        'We look forward to working with you.',
    },
  ]
}

/** The starting sections for a letter of the given kind. */
export function defaultSectionsFor(kind: LetterKindName): LetterSection[] {
  switch (kind) {
    case 'FT_RETAIL':
      return fullTimeSections('retail')
    case 'FT_HQ':
      return fullTimeSections('hq')
    case 'PT_LOGISTICS':
      return partTimeSections('logistics')
    case 'PT_RETAIL':
      return partTimeSections('retail')
    case 'INTERN_REGULAR':
      return internSections('regular')
    case 'INTERN_SCHOOL':
      return internSections('school')
  }
}

/**
 * Confirmation letters have one shape regardless of how the person is employed,
 * so they carry no `kind`.
 */
export function confirmationSections(): LetterSection[] {
  return [
    {
      id: 'opening',
      title: 'Confirmation of employment',
      body:
        'Dear {{firstName}},\n\n' +
        'Following the successful completion of your probationary period, we are pleased to confirm your ' +
        'appointment as {{position}} in the {{department}} department at {{company}} with effect from ' +
        '{{confirmationDate}}.',
    },
    {
      id: 'terms',
      title: 'Terms',
      body:
        'All other terms of your employment, as set out in your letter of employment dated {{startDate}}, ' +
        'remain unchanged. Your notice period is now one month, in accordance with those terms.',
    },
    {
      id: 'closing',
      title: 'Thank you',
      body:
        'Thank you for your contribution during your first months with us. We look forward to your continued ' +
        'success with the Group.',
    },
  ]
}
