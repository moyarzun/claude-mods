import type { Pr, PrChecks, PrState, Provider } from '../types'
import { FIELDS } from './prs'

export type Remote = { provider: Provider; host: string; path: string }

export const PROVIDER_NAME: Record<Provider, string> = {
  github: 'GitHub',
  gitlab: 'GitLab',
  bitbucket: 'Bitbucket',
  gitea: 'Gitea',
  unknown: 'Git',
}

export const PROVIDER_COLOR: Record<Provider, string> = {
  github: '#8b949e',
  gitlab: '#fc6d26',
  bitbucket: '#2684ff',
  gitea: '#609926',
  unknown: '#8b949e',
}

// The CLI each provider is read with. Bitbucket has no official one: its
// public REST API is read with curl instead.
export const PROVIDER_CLI: Record<Provider, string> = {
  github: 'gh',
  gitlab: 'glab',
  bitbucket: 'curl',
  gitea: 'tea',
  unknown: '',
}

export function detectProvider(host: string): Provider {
  const h = host.toLowerCase()
  if (h === 'github.com' || h.includes('github')) return 'github'
  if (h === 'gitlab.com' || h.includes('gitlab')) return 'gitlab'
  if (h === 'bitbucket.org' || h.includes('bitbucket')) return 'bitbucket'
  if (
    h === 'codeberg.org' ||
    h === 'gitea.com' ||
    h.includes('gitea') ||
    h.includes('forgejo')
  )
    return 'gitea'

  return 'unknown'
}

// https://host/owner/repo.git, ssh://git@host:22/owner/repo.git and
// git@host:owner/repo.git all name the same repository.
export function parseRemote(url: string): Remote | null {
  const text = url.trim()
  const scp = /^(?:[\w.-]+@)?([\w.-]+):(?!\/\/)(.+)$/.exec(text)
  const std = /^[a-z+]+:\/\/(?:[^@/]+@)?([^/:]+)(?::\d+)?\/(.+)$/i.exec(text)
  const m = std ?? scp
  if (!m) return null
  const host = m[1]
  const path = m[2].replace(/\.git$/, '').replace(/^\/+|\/+$/g, '')
  if (!host || !path.includes('/')) return null

  return { provider: detectProvider(host), host, path }
}

export function listCommand(provider: Provider, path: string): string[] | null {
  switch (provider) {
    case 'github':
      return ['gh', 'pr', 'list', '--state', 'all', '--limit', '30', '--json', FIELDS]
    case 'gitlab':
      return ['glab', 'mr', 'list', '--all', '--per-page', '30', '--output', 'json']
    case 'gitea':
      return [
        'tea', 'pulls', 'list', '--state', 'all', '--limit', '30',
        '--fields', 'index,title,url,head,state,author', '--output', 'json',
      ]
    case 'bitbucket':
      return [
        'curl', '-sS', '-L', '--max-time', '20', '-w', '\n%{http_code}',
        `https://api.bitbucket.org/2.0/repositories/${path}/pullrequests` +
          '?state=OPEN&state=MERGED&state=DECLINED&state=SUPERSEDED' +
          '&pagelen=30&sort=-updated_on',
      ]
    default:
      return null
  }
}

const str = (x: unknown): string => (typeof x === 'string' ? x : '')

function list(json: string): Record<string, any>[] {
  const data: unknown = JSON.parse(json)
  if (Array.isArray(data)) return data as Record<string, any>[]
  const values = (data as { values?: unknown } | null)?.values

  return Array.isArray(values) ? (values as Record<string, any>[]) : []
}

export function parseGitlab(json: string): Pr[] {
  return list(json).flatMap(mr => {
    if (typeof mr.iid !== 'number' || typeof mr.web_url !== 'string') return []
    const state: PrState =
      mr.state === 'merged'
        ? 'MERGED'
        : mr.state === 'opened'
          ? mr.draft === true || mr.work_in_progress === true
            ? 'DRAFT'
            : 'OPEN'
          : 'CLOSED'
    const pipeline = str((mr.head_pipeline ?? mr.pipeline)?.status)
    const checks: PrChecks =
      pipeline === ''
        ? 'NONE'
        : pipeline === 'success' || pipeline === 'skipped'
          ? 'PASS'
          : pipeline === 'failed' || pipeline === 'canceled'
            ? 'FAIL'
            : 'PENDING'

    return [
      {
        number: mr.iid,
        title: str(mr.title) || '(sin título)',
        url: mr.web_url,
        branch: str(mr.source_branch),
        author: str(mr.author?.username),
        state,
        review: 'NONE',
        checks,
      },
    ]
  })
}

export function parseGitea(json: string): Pr[] {
  return list(json).flatMap(pr => {
    const number = Number(pr.index)
    if (!Number.isFinite(number) || typeof pr.url !== 'string') return []
    const raw = str(pr.state).toLowerCase()
    const title = str(pr.title) || '(sin título)'
    const state: PrState =
      raw === 'merged'
        ? 'MERGED'
        : raw === 'open'
          ? /^(wip|draft)\b[:\s]/i.test(title)
            ? 'DRAFT'
            : 'OPEN'
          : 'CLOSED'

    return [
      {
        number,
        title,
        url: pr.url,
        branch: str(pr.head),
        author: str(pr.author),
        state,
        review: 'NONE',
        checks: 'NONE',
      },
    ]
  })
}

export function parseBitbucket(json: string): Pr[] {
  return list(json).flatMap(pr => {
    const url = pr.links?.html?.href
    if (typeof pr.id !== 'number' || typeof url !== 'string') return []
    const state: PrState =
      pr.state === 'MERGED'
        ? 'MERGED'
        : pr.state === 'OPEN'
          ? pr.draft === true
            ? 'DRAFT'
            : 'OPEN'
          : 'CLOSED'

    return [
      {
        number: pr.id,
        title: str(pr.title) || '(sin título)',
        url,
        branch: str(pr.source?.branch?.name),
        author: str(pr.author?.display_name),
        state,
        review: 'NONE',
        checks: 'NONE',
      },
    ]
  })
}

// Simplified marks in each service's colour, drawn where the surface has Svg.
export const PROVIDER_ICON: Record<Provider, string> = {
  github:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path fill="#8b949e" d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"/></svg>',
  gitlab:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#fc6d26" d="M12 22 2 14.7 4.3 7.7 6.6 2 9 9h6l2.4-7 2.3 5.7 2.3 7z"/></svg>',
  bitbucket:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#2684ff" d="M3 4h18l-2.1 15.4a1.2 1.2 0 0 1-1.2 1H6.3a1.2 1.2 0 0 1-1.2-1z"/><path fill="#0b1d3a" d="M9 9.5h6l-.7 5h-4.6z"/></svg>',
  gitea:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#609926" d="M3 8h14v5a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5z"/><path fill="none" stroke="#609926" stroke-width="2" d="M17 9.5h1.5a2.5 2.5 0 0 1 0 5H17"/></svg>',
  unknown: '',
}
