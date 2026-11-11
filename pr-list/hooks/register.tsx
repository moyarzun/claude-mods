import { atom, read, update } from 'claude-code'
import type { Hook, Register, Timer } from 'claude-code'

import type { Filter, PrChecks, PrState, Provider, View } from '../types'
import {
  CHECKS_LABEL,
  FIELDS,
  REVIEW_LABEL,
  STATE_LABEL,
  isOpenableUrl,
  parsePrs,
} from './prs'
import {
  PROVIDER_CLI,
  PROVIDER_COLOR,
  PROVIDER_ICON,
  PROVIDER_NAME,
  listCommand,
  parseBitbucket,
  parseGitea,
  parseGitlab,
  parseRemote,
} from './providers'

const PANE = 'pr-list'
// Change the tag when View's fields change: it declines what an earlier
// version stored, which outlives a reload.
const INITIAL: View = {
  status: 'idle',
  message: '',
  repo: '',
  worktree: '',
  provider: 'unknown',
  repoUrl: '',
  prs: [],
}
const view = atom({ plugin: 'pr-list', key: 'view' } as const, INITIAL, {
  shape: 'view-4',
})
const filter = atom({ plugin: 'pr-list', key: 'filter' } as const, 'ALL' as Filter, {
  shape: 'filter-1',
})
const FILTERS: readonly Filter[] = ['ALL', 'OPEN', 'DRAFT', 'MERGED', 'CLOSED']
// How often the pane refreshes itself while open, so a PR's state and checks
// don't go stale without anyone pressing "Actualizar".
const POLL_MS = 15000
let poll: Timer | null = null

// `$` as a hook receives it, for the helpers below.
type Dollar = Parameters<Hook<'session.start'>>[0]

const STATE_COLOR: Record<PrState, string> = {
  OPEN: 'green',
  DRAFT: 'gray',
  MERGED: 'magenta',
  CLOSED: 'red',
}

const CHECKS_COLOR: Record<PrChecks, string> = {
  PASS: 'green',
  FAIL: 'red',
  PENDING: 'yellow',
  NONE: 'gray',
}

const baseName = (path: string): string => path.split('/').pop() ?? ''

// `origin`, else the first remote there is.
async function remoteUrl($: Dollar, cwd: string): Promise<string> {
  const origin = await $.process.run(['git', 'remote', 'get-url', 'origin'], {
    cwd,
    timeoutMs: 10000,
  })
  if (origin.exitCode === 0 && String(origin.stdout).trim() !== '')
    return String(origin.stdout).trim()
  const names = await $.process.run(['git', 'remote'], { cwd, timeoutMs: 10000 })
  const first = String(names.stdout).trim().split('\n')[0]
  if (!first) return ''
  const one = await $.process.run(['git', 'remote', 'get-url', first], {
    cwd,
    timeoutMs: 10000,
  })

  return one.exitCode === 0 ? String(one.stdout).trim() : ''
}

function parseFor(provider: Provider, stdout: string) {
  switch (provider) {
    case 'gitlab':
      return parseGitlab(stdout)
    case 'gitea':
      return parseGitea(stdout)
    case 'bitbucket':
      return parseBitbucket(stdout)
    default:
      return parsePrs(stdout)
  }
}

// Git repo with a remote claude-mods can read, regardless of whether the
// provider is one it recognizes — `load` reports that case on its own.
async function isLinkedRepo($: Dollar, cwd: string): Promise<boolean> {
  const git = await $.process.run(
    ['git', 'rev-parse', '--is-inside-work-tree'],
    { cwd, timeoutMs: 10000 },
  )
  if (git.exitCode !== 0) return false

  return parseRemote(await remoteUrl($, cwd)) !== null
}

async function load($: Dollar, opts: { silent?: boolean } = {}): Promise<void> {
  if (!opts.silent)
    await update<View>($, view, v => ({ ...v, status: 'loading', message: 'Cargando…' }))
  let cwd = ''
  let repo = ''
  let provider: Provider = 'unknown'
  let repoUrl = ''
  // A background poll's hiccup (a rate limit, a dropped connection) isn't
  // worth blanking an already-loaded list over; it just tries again later.
  const fail = (message: string) =>
    opts.silent
      ? Promise.resolve()
      : update<View>($, view, () => ({
          status: 'error',
          message,
          repo,
          worktree: baseName(cwd),
          provider,
          repoUrl,
          prs: [],
        }))
  try {
    cwd = await $.session.cwd()
    repo = baseName(cwd)
    const git = await $.process.run(
      ['git', 'rev-parse', '--is-inside-work-tree'],
      { cwd, timeoutMs: 10000 },
    )
    if (git.exitCode !== 0) {
      repo = ''
      await fail('Este directorio no es un repositorio git.')

      return
    }
    const remote = parseRemote(await remoteUrl($, cwd))
    if (!remote) {
      await fail('Este repositorio no tiene un remoto reconocible.')

      return
    }
    repo = remote.path
    provider = remote.provider
    repoUrl = `https://${remote.host}/${remote.path}`
    const argv = listCommand(provider, remote.path)
    if (!argv) {
      await fail(`No reconozco el proveedor de ${remote.host}.`)

      return
    }
    const run = await $.process.run(argv, { cwd, timeoutMs: 30000 })
    let stdout = String(run.stdout)
    let ok = run.exitCode === 0
    if (provider === 'bitbucket') {
      // curl -w appends the HTTP status on a last line.
      const cut = stdout.lastIndexOf('\n')
      const code = Number(stdout.slice(cut + 1))
      stdout = stdout.slice(0, cut)
      ok = ok && code === 200
      if (run.exitCode === 0 && (code === 401 || code === 403 || code === 404))
        return void (await fail(
          'Bitbucket respondió que el repositorio es privado o no existe: solo leo repos públicos.',
        ))
    }
    if (!ok) {
      const first = String(run.stderr).trim().split('\n')[0]
      await fail(
        first ||
          `${PROVIDER_CLI[provider]} no pudo listar los pull requests de ${PROVIDER_NAME[provider]}.`,
      )

      return
    }
    const prs = parseFor(provider, stdout)
    await update<View>($, view, () => ({
      status: 'ready',
      message: prs.length === 0 ? 'No hay pull requests.' : '',
      repo,
      worktree: baseName(cwd),
      provider,
      repoUrl,
      prs,
    }))
  } catch (err) {
    await fail(
      `No pude ejecutar ${PROVIDER_CLI[provider] || 'git'} (${
        err instanceof Error ? err.message : String(err)
      }).`,
    )
  }
}

// The desktop app's built-in browser is an MCP server the session already
// runs; it is not listed in this plugin's manifest, so `$.mcp.connect` would
// always answer `unlisted`. Call it directly and fall back when it is absent.
// `preview_start` with a url opens it in a tab of its own (and reuses the tab
// already on that url); `navigate` would overwrite the active tab.
const BROWSER_SERVER = 'Claude_Browser'
const BROWSER_TOOLS = ['preview_start', 'navigate']

// `preview_start` opens the tab but leaves a hidden Browser pane hidden. The
// desktop app's own `ccd_view` server can bring it to the front; best effort,
// since other hosts have no such server.
async function revealBrowserPane($: Dollar): Promise<void> {
  try {
    await $.mcp.call('ccd_view', 'show_pane', { pane: 'preview' })
  } catch {
    // not the desktop app: nothing to reveal
  }
}

async function openInIntegratedBrowser($: Dollar, url: string): Promise<boolean> {
  for (const tool of BROWSER_TOOLS) {
    try {
      const result = await $.mcp.call(BROWSER_SERVER, tool, { url })
      if (!result.isError) {
        await revealBrowserPane($)

        return true
      }
    } catch {
      // no integrated browser in this session (CLI, VS Code, ...)
      return false
    }
  }

  return false
}

async function openUrl($: Dollar, url: string): Promise<void> {
  if (!isOpenableUrl(url)) {
    $.ui.toast('La URL del PR no es https.')

    return
  }
  if (await openInIntegratedBrowser($, url)) {
    $.ui.toast(`Abierto: ${url}`)

    return
  }
  for (const bin of ['open', 'xdg-open']) {
    try {
      const run = await $.process.run([bin, url], { timeoutMs: 10000 })
      if (run.exitCode === 0) {
        $.ui.toast(`Abierto: ${url}`)

        return
      }
    } catch {
      // that opener is not installed; try the next one
    }
  }
  $.ui.toast('No encontré cómo abrir el navegador.')
}

function startPolling($: Dollar): void {
  if (poll) return
  poll = $.clock.every(POLL_MS, () => void load($, { silent: true }))
}

function stopPolling(): void {
  poll?.cancel()
  poll = null
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'prs',
      description: 'Lista los pull requests del repositorio y abre uno en el navegador',
    })
    const cwd = await $.session.cwd()
    if (await isLinkedRepo($, cwd)) {
      await $.ui.open({ id: PANE, title: 'Pull requests' })
      startPolling($)
      void load($)
    }

    return next(e)
  })

  on('command.run', { command: 'prs' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Pull requests', focus: true })
    startPolling($)
    void load($)

    return { text: 'Panel de pull requests abierto.' }
  })

  on('ui.close', { id: PANE }, async ($, e, next) => {
    stopPolling()

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const ui = $.ui.resolve(e)
    const { Box, Text, Button, Select, Markdown } = ui
    const Svg = 'Svg' in ui ? ui.Svg : undefined
    const v = await read($, view)
    const pick = await read($, filter)
    const counts = (s: Filter) =>
      s === 'ALL' ? v.prs.length : v.prs.filter(p => p.state === s).length
    const matching = v.prs.filter(p => pick === 'ALL' || p.state === pick)
    // Each card takes five rows: border, title, state, branch, border.
    const room = Math.max(1, Math.floor(((e.viewport?.rows ?? 24) - 8) / 5))
    const shown = v.status === 'error' ? [] : matching.slice(0, room)

    return (
      <Box flexDirection="column" padding={1} gap={1}>
        <Box flexDirection="row" justifyContent="space-between" alignItems="center">
          <Box flexDirection="column">
            <Box flexDirection="row" gap={1} alignItems="center">
              {v.provider !== 'unknown' &&
                (Svg ? (
                  <Svg
                    source={PROVIDER_ICON[v.provider]}
                    alt={PROVIDER_NAME[v.provider]}
                    width={20}
                    height={20}
                  />
                ) : (
                  <Text bold color={PROVIDER_COLOR[v.provider]}>
                    {`[${PROVIDER_NAME[v.provider]}]`}
                  </Text>
                ))}
              {v.repoUrl ? (
                <Markdown
                  key="repo-link"
                  text={`## [${v.repo}](${v.repoUrl})`}
                  onLinkPress={link => void openUrl($, link.href)}
                />
              ) : (
                <Text bold size="heading">
                  {v.repo ? v.repo : 'Pull requests'}
                </Text>
              )}
            </Box>
            {v.worktree !== '' && (
              <Text dimColor>{`Worktree: ${v.worktree}`}</Text>
            )}
          </Box>
          <Button key="refresh" hotkey="r" onPress={() => void load($)}>
            Actualizar (r)
          </Button>
        </Box>
        <Select
          key="filter"
          label="Estado: "
          value={pick}
          options={FILTERS.map(f => ({
            value: f,
            label: `${f === 'ALL' ? 'Todos' : STATE_LABEL[f]} (${counts(f)})`,
          }))}
          onSelect={val => {
            void update<Filter>($, filter, () => val as Filter)
          }}
        />
        {v.status === 'idle' && (
          <Text dimColor>Pulsa «Actualizar» para cargar los PRs.</Text>
        )}
        {v.status === 'loading' && <Text dimColor>{v.message}</Text>}
        {v.status === 'error' && <Text color="red">{v.message}</Text>}
        {v.status === 'ready' && v.message && <Text dimColor>{v.message}</Text>}
        {v.status === 'ready' && !v.message && matching.length === 0 && (
          <Text dimColor>Ningún PR con ese estado.</Text>
        )}
        {shown.map((pr, i) => (
          <Box
            key={`card-${pr.number}`}
            flexDirection="column"
            borderStyle="round"
            borderColor={STATE_COLOR[pr.state]}
            paddingX={1}
          >
            <Button
              key={`pr-${pr.number}`}
              hotkey={i < 9 ? String(i + 1) : undefined}
              onPress={() => void openUrl($, pr.url)}
            >
              <Text dimColor>{`#${pr.number}  `}</Text>
              <Text bold>{pr.title}</Text>
            </Button>
            <Box flexDirection="row" gap={2}>
              <Text color={STATE_COLOR[pr.state]} bold>
                {`● ${STATE_LABEL[pr.state]}`}
              </Text>
              {pr.checks !== 'NONE' && (
                <Text color={CHECKS_COLOR[pr.checks]}>{CHECKS_LABEL[pr.checks]}</Text>
              )}
              {pr.review !== 'NONE' && (
                <Text dimColor>{REVIEW_LABEL[pr.review]}</Text>
              )}
            </Box>
            <Text dimColor wrap="truncate-end">
              {`⎇ ${pr.branch}`}
            </Text>
          </Box>
        ))}
        {v.status === 'ready' && matching.length > room && (
          <Text dimColor>{`… y ${matching.length - room} más (ensancha el panel)`}</Text>
        )}
      </Box>
    )
  })
}
