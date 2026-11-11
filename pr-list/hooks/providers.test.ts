import { expect, test } from 'claude-code/testing'

import {
  detectProvider,
  listCommand,
  parseBitbucket,
  parseGitea,
  parseGitlab,
  parseRemote,
} from './providers'

test('remotes of every shape give provider, host and owner/repo', () => {
  expect(parseRemote('git@github.com:moyarzun/nobira-android.git')).toEqual({
    provider: 'github',
    host: 'github.com',
    path: 'moyarzun/nobira-android',
  })
  expect(parseRemote('https://gitlab.com/group/sub/app.git')).toEqual({
    provider: 'gitlab',
    host: 'gitlab.com',
    path: 'group/sub/app',
  })
  expect(parseRemote('ssh://git@bitbucket.org:22/ws/repo.git')?.provider).toBe(
    'bitbucket',
  )
  expect(parseRemote('https://user@codeberg.org/me/proj')?.provider).toBe('gitea')
  expect(parseRemote('not a url')).toBeNull()
})

test('self-hosted hosts are recognised by name, others are unknown', () => {
  expect(detectProvider('git.gitlab.acme.io')).toBe('gitlab')
  expect(detectProvider('gitea.acme.io')).toBe('gitea')
  expect(detectProvider('git.acme.io')).toBe('unknown')
  expect(listCommand('unknown', 'a/b')).toBeNull()
  expect(listCommand('bitbucket', 'ws/repo')?.at(-1)).toContain('/ws/repo/pullrequests')
})

test('gitlab merge requests become rows', () => {
  const [a, b] = parseGitlab(
    JSON.stringify([
      {
        iid: 7,
        title: 'Fix',
        web_url: 'https://gitlab.com/g/a/-/merge_requests/7',
        source_branch: 'fix',
        state: 'opened',
        draft: true,
        author: { username: 'moy' },
        head_pipeline: { status: 'failed' },
      },
      {
        iid: 8,
        title: 'Done',
        web_url: 'https://gitlab.com/g/a/-/merge_requests/8',
        source_branch: 'done',
        state: 'merged',
        head_pipeline: { status: 'success' },
      },
    ]),
  )
  expect([a.state, a.checks, a.author]).toEqual(['DRAFT', 'FAIL', 'moy'])
  expect([b.state, b.checks]).toEqual(['MERGED', 'PASS'])
})

test('gitea pulls become rows', () => {
  const [a, b] = parseGitea(
    JSON.stringify([
      { index: '3', title: 'WIP: x', url: 'https://c.org/o/r/pulls/3', head: 'x', state: 'open', author: 'me' },
      { index: '4', title: 'y', url: 'https://c.org/o/r/pulls/4', head: 'y', state: 'merged', author: 'me' },
    ]),
  )
  expect([a.number, a.state]).toEqual([3, 'DRAFT'])
  expect(b.state).toBe('MERGED')
})

test('bitbucket pull requests become rows', () => {
  const rows = parseBitbucket(
    JSON.stringify({
      values: [
        {
          id: 5,
          title: 'T',
          state: 'DECLINED',
          source: { branch: { name: 'feat' } },
          author: { display_name: 'Moy' },
          links: { html: { href: 'https://bitbucket.org/w/r/pull-requests/5' } },
        },
      ],
    }),
  )
  expect(rows[0]).toMatchObject({ number: 5, state: 'CLOSED', branch: 'feat' })
})
