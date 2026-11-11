export type PrState = 'OPEN' | 'DRAFT' | 'MERGED' | 'CLOSED'
export type PrReview = 'APPROVED' | 'CHANGES' | 'REVIEW' | 'NONE'
export type PrChecks = 'PASS' | 'FAIL' | 'PENDING' | 'NONE'

export type Provider = 'github' | 'gitlab' | 'bitbucket' | 'gitea' | 'unknown'

export type Pr = {
  number: number
  title: string
  url: string
  branch: string
  author: string
  state: PrState
  review: PrReview
  checks: PrChecks
}

export type View = {
  status: 'idle' | 'loading' | 'ready' | 'error'
  message: string
  repo: string
  worktree: string
  provider: Provider
  repoUrl: string
  prs: Pr[]
}

export type Filter = 'ALL' | PrState

declare module 'claude-code' {
  interface PluginState {
    'pr-list': { view: Shaped<View>; filter: Shaped<Filter> }
  }
}
