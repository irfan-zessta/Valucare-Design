// ===========================================================================
// wesupportReferenceSob — the reference "WESUPPORT INCORPORATED (Dependent)"
// Corporate HMO Program content, used to populate the SOB builder so the
// document preview matches the supplied reference exactly. Convenience/demo
// content only: it fills header, eligibility, plans and the first benefit
// sections (Basis of Coverage + Summary of Benefits).
// ===========================================================================
import dayjs from 'dayjs'
import { uid } from '../../../domain/ids'
import type { SobBenefitLine, SobDraft, SobSection } from '../../../domain/types'

type LineSeed = {
  description: string
  coverage?: SobBenefitLine['coverage']
  limits?: string
  children?: LineSeed[]
}

function line(seed: LineSeed): SobBenefitLine {
  return {
    id: uid('sobln'),
    description: seed.description,
    coverage: seed.coverage ?? 'covered',
    limits: seed.limits ?? '',
    children: seed.children?.map(line),
  }
}

function section(title: string, lines: LineSeed[], extra?: Partial<SobSection>): SobSection {
  return { id: uid('sobsec'), title, lines: lines.map(line), exclusions: [], ...extra }
}

/** The reference SOB fields to merge into a draft (keeps version/status/source). */
export function wesupportReferenceSob(): Pick<SobDraft, 'header' | 'eligibility' | 'plans' | 'sections'> {
  const docDate = dayjs('2026-09-25')
  const effective = dayjs('2026-11-01')
  return {
    header: {
      companyName: 'WESUPPORT INCORPORATED',
      programTitle: 'Full-risk HMO',
      applicability: 'Dependent',
      memberCount: '119 Dependent',
      documentDate: docDate.toISOString(),
      originalEffectiveDate: effective.toISOString(),
      currentEffectiveDate: effective.toISOString(),
      expiryDate: effective.add(1, 'year').toISOString(),
      reference: 'SOB-WSI-DEP-2026',
    },
    eligibility: {
      principal: 'Employees of the Client who is 18 yrs. old up to 65 yrs. old.',
      dependent:
        'Dependents of Married Employee — Spouse: 18 up to 65 yrs. old; Children: 30 days old up to 23 yrs. old. ' +
        'Dependents of Single / Single Parent — Children: 30 days old up to 23 yrs. old; Parents: up to 65 yrs. old; Siblings: up to 23 yrs. old.',
      extendedDependent: '',
      other: '',
    },
    plans: [
      { id: uid('sobpln'), planId: 'Plan A', roomBoard: 'PRIVATE', mblAmount: 'Php60,000', limitBasis: '/member/year', notes: '' },
      { id: uid('sobpln'), planId: 'Plan B', roomBoard: 'SEMI-PRIVATE', mblAmount: 'Php60,000', limitBasis: '/member/year', notes: '' },
    ],
    sections: [
      section('Basis of Coverage', [
        {
          description: 'Account Type',
          children: [
            { description: 'Full-risk HMO', coverage: 'covered' },
            { description: 'Administrative Services only (ASO)', coverage: 'not-covered' },
            { description: 'In-patient', coverage: 'covered' },
            { description: 'Out-patient', coverage: 'covered' },
            { description: 'Emergency cases (Out-patient)', coverage: 'covered' },
            { description: 'Emergency cases (Leading to confinement)', coverage: 'covered' },
            { description: 'Access to All', coverage: 'covered' },
            { description: 'Clinic-based', coverage: 'not-covered' },
            { description: 'Co-payment', coverage: 'not-specified', limits: '(specify sharing)' },
            { description: 'Others', coverage: 'not-specified', limits: '(specify)' },
          ],
        },
        {
          description: 'Pre-existing Conditions (dreaded / non-dreaded illnesses)',
          children: [
            {
              description: 'Principal',
              children: [
                { description: 'Coverage on the first 12 months of membership', limits: '100% of MBL' },
                { description: 'Coverage after 12 months of membership', limits: '100% of MBL' },
              ],
            },
            {
              description: 'Dependent',
              children: [
                {
                  description: 'Coverage on the first 12 months of membership',
                  limits:
                    'If total Dependent is less than 78% Principal count, No Pre-existing Coverage. Otherwise up to MBL.',
                },
                { description: 'Coverage after 12 months of membership', limits: '100% of MBL' },
              ],
            },
            {
              description: 'Others',
              children: [
                { description: 'Coverage on the first 12 months of membership', limits: '20% of MBL' },
                { description: 'Coverage after 12 months of membership', limits: '100% of MBL' },
              ],
            },
          ],
        },
      ]),
      section(
        'A. Preventive Health Care',
        [
          {
            description: 'Annual Physical Examination (APE)',
            limits: 'Clinic, Walk-in or Mobile; EES or DEPS',
            children: [
              { description: "Physician's Assessment" },
              { description: 'Chest X-ray' },
              { description: 'Complete Blood Count (CBC)' },
              { description: 'Urinalysis (UA)' },
              { description: 'Stool Exam (Fecalysis)' },
              { description: 'Electrocardiogram', limits: 'Covered for members 35 yrs. old & above' },
              { description: 'Pap smear', limits: 'Covered for female members 35 yrs. old & above' },
              { description: 'Others (specify)', coverage: 'not-specified' },
            ],
          },
          {
            description: 'Executive Check-up',
            coverage: 'not-covered',
            children: [
              { description: 'In-patient', coverage: 'not-covered' },
              { description: 'Out-patient', coverage: 'not-covered' },
            ],
          },
          {
            description:
              'Active / Passive Vaccines for treatment of tetanus and animal bites (including administration fee but excluding ER Fees) including immunoglobulin',
            limits: 'Up to P20,000/member/year. Shared limit for OP and IP.',
            children: [
              {
                description: 'Initial Treatment within 24 hours from time of bite of Animal bites',
                limits: '100% of MBL (except cost of vaccines)',
              },
              {
                description: 'Succeeding treatment after 24 hours from time of bite of Animal bites',
                limits: '100% of MBL (except cost of vaccines)',
              },
            ],
          },
          {
            description: 'Administration of vaccines (e.g. Flu, HPV, Primary Immunization, etc.) except ER Fees',
            limits: '100% of MBL',
          },
          { description: 'Pre-natal monitoring & management of health problems', limits: '100% of MBL' },
          { description: 'Counseling on family planning', limits: '100% of MBL' },
          { description: 'Health education on diet & exercise', limits: '100% of MBL' },
          { description: 'Medical history record keeping', limits: '100% of MBL' },
        ],
        {
          group: 'Summary of Benefits',
          note:
            'The APE can be availed (Annual mode) upon full payment of the membership fees (Semi-Annual: on the 6th month / Quarterly: on the 10th month) after the effective date of the Agreement. APE shall be conducted at any ValuCare Designated Clinic for walk-in and on-site availment (should be coordinated with Wellness Team). For a guaranteed minimum of 40 heads for half day (<4 hours, 100 heads for a 1-hour) and 120 heads for whole day (>4 hours). Members who will avail of the APE, the said benefit can be reimbursed at the CLIENT’s premises as a Mobile Service (subject to confirmed schedule).',
        },
      ),
      section(
        'B. Out-Patient Care Coverage',
        [
          {
            description:
              'For laser therapy only for retinal tear, retinal hole, retinal detachment and glaucoma prescribed by an Affiliated Physician/Specialist',
            limits: 'Up to MBL/eye/member/year',
          },
          {
            description:
              'Electrocauterization of skin lesions such as plantar warts, flat warts, periungual warts, molluscum contagiosum, in any part of the body',
            limits: 'Up to MBL/member/year',
          },
        ],
        { group: 'Summary of Benefits' },
      ),
    ],
  }
}
