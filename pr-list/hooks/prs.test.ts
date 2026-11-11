import { expect, test } from 'claude-code/testing'

import { classifyChecks, isOpenableUrl, parsePrs } from './prs'

test('checks: any failure wins, then pending, then pass', () => {
  expect(classifyChecks([])).toBe('NONE')
  expect(classifyChecks(null)).toBe('NONE')
  expect(
    classifyChecks([
      { __typename: 'CheckRun', status: 'COMPLETED', conclusion: 'SUCCESS' },
      { __typename: 'CheckRun', status: 'COMPLETED', conclusion: 'SKIPPED' },
    ]),
  ).toBe('PASS')
  expect(
    classifyChecks([
      { __typename: 'CheckRun', status: 'IN_PROGRESS' },
      { __typename: 'StatusContext', state: 'SUCCESS' },
    ]),
  ).toBe('PENDING')
  expect(
    classifyChecks([
      { __typename: 'CheckRun', status: 'IN_PROGRESS' },
      { __typename: 'CheckRun', status: 'COMPLETED', conclusion: 'FAILURE' },
    ]),
  ).toBe('FAIL')
  expect(
    classifyChecks([{ __typename: 'StatusContext', state: 'ERROR' }]),
  ).toBe('FAIL')
})

test('gh json becomes rows with state, review and checks', () => {
  const prs = parsePrs(
    JSON.stringify([
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
          { __typename: 'CheckRun', status: 'COMPLETED', conclusion: 'FAILURE' },
        ],
      },
      { number: 7, url: 'https://x/7', state: 'OPEN', isDraft: true },
      { number: 8, url: 'https://x/8', state: 'MERGED', isDraft: false },
      { title: 'sin número' },
    ]),
  )

  expect(prs.length).toBe(3)
  expect(prs[0].state).toBe('OPEN')
  expect(prs[0].review).toBe('REVIEW')
  expect(prs[0].checks).toBe('FAIL')
  expect(prs[0].author).toBe('moyarzun')
  expect(prs[1].state).toBe('DRAFT')
  expect(prs[2].state).toBe('MERGED')
})

test('only https urls are opened', () => {
  expect(isOpenableUrl('https://github.com/a/b/pull/1')).toBe(true)
  expect(isOpenableUrl('http://github.com/a/b/pull/1')).toBe(false)
  expect(isOpenableUrl('file:///etc/passwd')).toBe(false)
  expect(isOpenableUrl('https://x.com/a b')).toBe(false)
})
