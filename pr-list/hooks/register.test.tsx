import { expect, test } from 'claude-code/testing'

const PANE = {
  plugin: 'pr-list',
  component: 'Pane',
  requestId: 'pr-list',
  props: {
    title: 'Pull requests',
    isFocused: false,
    bodyColumns: 80,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

const GH = JSON.stringify([
  {
    number: 213,
    title: 'chore: instalar review-harness',
    url: 'https://github.com/moyarzun/nobira-android/pull/213',
    headRefName: 'chore/review-harness-init',
    author: { login: 'moyarzun' },
    state: 'OPEN',
    isDraft: false,
    reviewDecision: 'REVIEW_REQUIRED',
    statusCheckRollup: [
      { __typename: 'CheckRun', status: 'COMPLETED', conclusion: 'SUCCESS' },
    ],
  },
])

async function settle() {
  for (let i = 0; i < 200; i++) await Promise.resolve()
}

test('lists the pull requests and opens the chosen one', async ($, on) => {
  const ran: string[][] = []
  on('command.register', () => ({ value: { command: 'prs' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: '/work/nobira-android' }))
  on('ui.toast', () => ({ value: undefined }))
  on('clock.after', () => ({ value: { cancel: () => {} } }))
  on('mcp.call', () => ({ value: { content: [], isError: true } }))
  on('process.run', (_, e) => {
    ran.push([...e.argv])
    if (e.argv[0] === 'git' && e.argv[1] === 'remote')
      return { value: { exitCode: 0, stdout: 'git@github.com:moyarzun/nobira-android.git\n', stderr: '' } }
    if (e.argv[0] === 'git')
      return { value: { exitCode: 0, stdout: 'true\n', stderr: '' } }
    if (e.argv[0] === 'gh')
      return { value: { exitCode: 0, stdout: GH, stderr: '' } }

    return { value: { exitCode: 0, stdout: '', stderr: '' } }
  })

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'prs' })
  await settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const row = await ui.find({ type: 'Button', text: /#213/ })
  expect(
    await ui.find({ type: 'Text', text: 'Worktree: nobira-android' }),
  ).toBeTruthy()
  expect(row?.text).toMatch(/instalar review-harness/)
  expect(await ui.find({ type: 'Text', text: /Abierto/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /por revisar/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /✓ checks/ })).toBeTruthy()
  expect(
    await ui.find({ type: 'Text', text: /chore\/review-harness-init/ }),
  ).toBeTruthy()

  expect((await ui.find({ type: 'Markdown' }))?.props.text).toBe(
    '## [moyarzun/nobira-android](https://github.com/moyarzun/nobira-android)',
  )

  await ui.press({ key: 'pr-213' })
  await settle()
  expect(
    ran.some(
      a =>
        (a[0] === 'open' || a[0] === 'xdg-open') &&
        a[1] === 'https://github.com/moyarzun/nobira-android/pull/213',
    ),
  ).toBe(true)
  await ui.unmount()
})

test('a PR opens through the integrated browser when one is connected', async ($, on) => {
  const ran: string[][] = []
  const calls: Array<[string, string, Record<string, unknown> | undefined]> = []
  on('command.register', () => ({ value: { command: 'prs' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: '/work/nobira-android' }))
  on('ui.toast', () => ({ value: undefined }))
  on('clock.after', () => ({ value: { cancel: () => {} } }))
  on('mcp.call', (_, e) => {
    calls.push([e.server, e.tool, e.args])

    return { value: { content: [], isError: false } }
  })
  on('process.run', (_, e) => {
    ran.push([...e.argv])
    if (e.argv[0] === 'git' && e.argv[1] === 'remote')
      return { value: { exitCode: 0, stdout: 'git@github.com:moyarzun/nobira-android.git\n', stderr: '' } }
    if (e.argv[0] === 'git')
      return { value: { exitCode: 0, stdout: 'true\n', stderr: '' } }
    if (e.argv[0] === 'gh')
      return { value: { exitCode: 0, stdout: GH, stderr: '' } }

    return { value: { exitCode: 0, stdout: '', stderr: '' } }
  })

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'prs' })
  await settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'pr-213' })
  await settle()
  await ui.press({ key: 'repo-link', link: { href: 'https://github.com/moyarzun/nobira-android' } })
  await settle()

  expect(calls.filter(c => c[0] === 'ccd_view')).toEqual([
    ['ccd_view', 'show_pane', { pane: 'preview' }],
    ['ccd_view', 'show_pane', { pane: 'preview' }],
  ])
  expect(calls.filter(c => c[0] === 'Claude_Browser')).toEqual([
    [
      'Claude_Browser',
      'preview_start',
      { url: 'https://github.com/moyarzun/nobira-android/pull/213' },
    ],
    ['Claude_Browser', 'preview_start', { url: 'https://github.com/moyarzun/nobira-android' }],
  ])
  expect(ran.some(a => a[0] === 'open' || a[0] === 'xdg-open')).toBe(false)
  await ui.unmount()
})

test('a PR falls back to the system opener when the integrated browser is absent', async ($, on) => {
  const ran: string[][] = []
  const calls: Array<[string, string, Record<string, unknown> | undefined]> = []
  on('command.register', () => ({ value: { command: 'prs' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: '/work/nobira-android' }))
  on('ui.toast', () => ({ value: undefined }))
  on('clock.after', () => ({ value: { cancel: () => {} } }))
  on('mcp.call', (_, e) => {
    calls.push([e.server, e.tool, e.args])
    throw new Error('server not connected')
  })
  on('process.run', (_, e) => {
    ran.push([...e.argv])
    if (e.argv[0] === 'git' && e.argv[1] === 'remote')
      return { value: { exitCode: 0, stdout: 'git@github.com:moyarzun/nobira-android.git\n', stderr: '' } }
    if (e.argv[0] === 'git')
      return { value: { exitCode: 0, stdout: 'true\n', stderr: '' } }
    if (e.argv[0] === 'gh')
      return { value: { exitCode: 0, stdout: GH, stderr: '' } }

    return { value: { exitCode: 0, stdout: '', stderr: '' } }
  })

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'prs' })
  await settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'pr-213' })
  await settle()

  expect(calls).toHaveLength(1)
  expect(
    ran.some(a => (a[0] === 'open' || a[0] === 'xdg-open') && a[1] === 'https://github.com/moyarzun/nobira-android/pull/213'),
  ).toBe(true)
  await ui.unmount()
})

test('a PR falls back to navigate when preview_start fails, without the system opener', async ($, on) => {
  const ran: string[][] = []
  const calls: Array<[string, string, Record<string, unknown> | undefined]> = []
  on('command.register', () => ({ value: { command: 'prs' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: '/work/nobira-android' }))
  on('ui.toast', () => ({ value: undefined }))
  on('clock.after', () => ({ value: { cancel: () => {} } }))
  on('mcp.call', (_, e) => {
    calls.push([e.server, e.tool, e.args])

    return { value: { content: [], isError: e.tool === 'preview_start' } }
  })
  on('process.run', (_, e) => {
    ran.push([...e.argv])
    if (e.argv[0] === 'git' && e.argv[1] === 'remote')
      return { value: { exitCode: 0, stdout: 'git@github.com:moyarzun/nobira-android.git\n', stderr: '' } }
    if (e.argv[0] === 'git')
      return { value: { exitCode: 0, stdout: 'true\n', stderr: '' } }
    if (e.argv[0] === 'gh')
      return { value: { exitCode: 0, stdout: GH, stderr: '' } }

    return { value: { exitCode: 0, stdout: '', stderr: '' } }
  })

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'prs' })
  await settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'pr-213' })
  await settle()

  expect(calls.map(c => c[1])).toEqual(['preview_start', 'navigate', 'show_pane'])
  expect(ran.some(a => a[0] === 'open' || a[0] === 'xdg-open')).toBe(false)
  await ui.unmount()
})

test('the pane starts refreshing at the fast interval', async ($, on) => {
  const PENDING = JSON.stringify([
    {
      number: 7,
      title: 'wip',
      url: 'https://github.com/moyarzun/nobira-android/pull/7',
      headRefName: 'wip',
      author: { login: 'moyarzun' },
      state: 'OPEN',
      isDraft: false,
      reviewDecision: '',
      statusCheckRollup: [{ __typename: 'CheckRun', status: 'IN_PROGRESS', conclusion: '' }],
    },
  ])
  let stdout = PENDING
  const delays: number[] = []
  on('command.register', () => ({ value: { command: 'prs' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: '/work/nobira-android' }))
  on('ui.toast', () => ({ value: undefined }))
  on('clock.after', (_, e) => {
    delays.push(e.ms)

    return { value: { cancel: () => {} } }
  })
  on('process.run', (_, e) => {
    if (e.argv[0] === 'git' && e.argv[1] === 'remote')
      return { value: { exitCode: 0, stdout: 'git@github.com:moyarzun/nobira-android.git\n', stderr: '' } }
    if (e.argv[0] === 'git')
      return { value: { exitCode: 0, stdout: 'true\n', stderr: '' } }
    if (e.argv[0] === 'gh')
      return { value: { exitCode: 0, stdout, stderr: '' } }

    return { value: { exitCode: 0, stdout: '', stderr: '' } }
  })

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'prs' })
  await settle()
  expect(delays[0]).toBe(5000)
})

test('a linked git repo opens the pane on session start, unprompted', async ($, on) => {
  const opened: Array<{ id: string }> = []
  on('command.register', () => ({ value: { command: 'prs' } }))
  on('ui.open', (_, e) => {
    opened.push(e)

    return { value: { isPlaced: true } }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: '/work/nobira-android' }))
  on('process.run', (_, e) => {
    if (e.argv[0] === 'git' && e.argv[1] === 'remote')
      return { value: { exitCode: 0, stdout: 'git@github.com:moyarzun/nobira-android.git\n', stderr: '' } }
    if (e.argv[0] === 'git')
      return { value: { exitCode: 0, stdout: 'true\n', stderr: '' } }
    if (e.argv[0] === 'gh')
      return { value: { exitCode: 0, stdout: GH, stderr: '' } }

    return { value: { exitCode: 0, stdout: '', stderr: '' } }
  })

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await settle()

  expect(opened).toEqual([{ id: 'pr-list', title: 'Pull requests' }])

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Button', text: /#213/ })).toBeTruthy()
  await ui.unmount()
})

test('outside a git repository the pane stays closed on session start', async ($, on) => {
  const opened: unknown[] = []
  on('command.register', () => ({ value: { command: 'prs' } }))
  on('ui.open', (_, e) => {
    opened.push(e)

    return { value: { isPlaced: true } }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: '/tmp' }))
  on('process.run', () => ({
    value: { exitCode: 128, stdout: '', stderr: 'fatal: not a git repository' },
  }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await settle()

  expect(opened).toEqual([])
})

test('outside a git repository the pane says so', async ($, on) => {
  on('command.register', () => ({ value: { command: 'prs' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: '/tmp' }))
  on('process.run', () => ({
    value: { exitCode: 128, stdout: '', stderr: 'fatal: not a git repository' },
  }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'prs' })
  await settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const msg = await ui.find({ type: 'Text', text: /no es un repositorio git/ })
  expect(msg?.text).toBe('Este directorio no es un repositorio git.')
  await ui.unmount()
})
