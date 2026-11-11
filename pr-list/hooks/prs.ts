import type { Pr, PrChecks, PrReview, PrState } from '../types'

export const FIELDS =
  'number,title,url,headRefName,author,state,isDraft,reviewDecision,statusCheckRollup'

type Raw = {
  number?: unknown
  title?: unknown
  url?: unknown
  headRefName?: unknown
  author?: { login?: unknown } | null
  state?: unknown
  isDraft?: unknown
  reviewDecision?: unknown
  statusCheckRollup?: unknown
}

type Check = {
  __typename?: string
  status?: string
  conclusion?: string
  state?: string
}

const PASSING = new Set(['SUCCESS', 'NEUTRAL', 'SKIPPED'])
const WAITING = new Set(['PENDING', 'EXPECTED'])

export function classifyChecks(rollup: unknown): PrChecks {
  if (!Array.isArray(rollup) || rollup.length === 0) return 'NONE'
  let isWaiting = false
  for (const item of rollup as Check[]) {
    if (item.__typename === 'StatusContext') {
      if (item.state && PASSING.has(item.state)) continue
      if (item.state && WAITING.has(item.state)) isWaiting = true
      else return 'FAIL'
    } else if (item.status !== 'COMPLETED') {
      isWaiting = true
    } else if (!item.conclusion || !PASSING.has(item.conclusion)) {
      return 'FAIL'
    }
  }

  return isWaiting ? 'PENDING' : 'PASS'
}

function classifyState(raw: Raw): PrState {
  if (raw.state === 'MERGED') return 'MERGED'
  if (raw.state === 'CLOSED') return 'CLOSED'

  return raw.isDraft === true ? 'DRAFT' : 'OPEN'
}

function classifyReview(decision: unknown): PrReview {
  if (decision === 'APPROVED') return 'APPROVED'
  if (decision === 'CHANGES_REQUESTED') return 'CHANGES'
  if (decision === 'REVIEW_REQUIRED') return 'REVIEW'

  return 'NONE'
}

export function isOpenableUrl(url: string): boolean {
  return /^https:\/\/[^\s]+$/.test(url)
}

export function parsePrs(json: string): Pr[] {
  const data: unknown = JSON.parse(json)
  if (!Array.isArray(data)) return []

  return (data as Raw[]).flatMap(raw => {
    if (typeof raw.number !== 'number' || typeof raw.url !== 'string') return []

    return [
      {
        number: raw.number,
        title: typeof raw.title === 'string' ? raw.title : '(sin título)',
        url: raw.url,
        branch: typeof raw.headRefName === 'string' ? raw.headRefName : '',
        author:
          typeof raw.author?.login === 'string' ? raw.author.login : '',
        state: classifyState(raw),
        review: classifyReview(raw.reviewDecision),
        checks: classifyChecks(raw.statusCheckRollup),
      },
    ]
  })
}

export const STATE_LABEL: Record<PrState, string> = {
  OPEN: 'Abierto',
  DRAFT: 'Borrador',
  MERGED: 'Fusionado',
  CLOSED: 'Cerrado',
}

export const REVIEW_LABEL: Record<PrReview, string> = {
  APPROVED: 'aprobado',
  CHANGES: 'cambios pedidos',
  REVIEW: 'por revisar',
  NONE: '',
}

export const CHECKS_LABEL: Record<PrChecks, string> = {
  PASS: '✓ checks',
  FAIL: '✗ checks',
  PENDING: '… checks',
  NONE: '',
}
