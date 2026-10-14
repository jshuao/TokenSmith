import assert from 'node:assert/strict'
import test from 'node:test'
import { requireTranspiledTs } from './ts-module-loader.mjs'

const { practiceMasteryInputs } = requireTranspiledTs('src/renderer/src/practice-tracking.ts')

function feedback(verdict, statuses) {
  return { verdict, checks: statuses.map((status, index) => ({ criterionId: `c${index + 1}`, status, feedback: '' })),
    improvement: '', nextStep: '', questionIssue: '' }
}

test('practice mastery inputs pass through every met check', () => {
  assert.deepEqual(practiceMasteryInputs(feedback('correct', ['met', 'met']), false), { statuses: ['met', 'met'], assisted: false })
})

test('practice mastery inputs keep mixed check statuses in order', () => {
  assert.deepEqual(practiceMasteryInputs(feedback('partial', ['met', 'missing', 'incorrect']), true),
    { statuses: ['met', 'missing', 'incorrect'], assisted: true })
})

test('practice mastery inputs learn nothing from questions that need review', () => {
  assert.deepEqual(practiceMasteryInputs(feedback('needs_review', ['met', 'incorrect']), false), { statuses: [], assisted: false })
})

test('practice mastery inputs learn nothing from plain text feedback', () => {
  assert.deepEqual(practiceMasteryInputs('Looks good.', true), { statuses: [], assisted: true })
})

const { practiceTopic, practiceMasteryLabel, practiceMasteryPercent, practiceMasteryWeakestFirst, mergeTopicMastery } =
  requireTranspiledTs('src/shared/practice.ts')
const { loadTopicMastery, trackAnswerReveal, trackPracticeAttempt } = requireTranspiledTs('src/renderer/src/practice-tracking.ts')

const entry = (topic, mastery, attempts = 3) => ({ topic, mastery, attempts, confidence: attempts, alpha: 1, beta: 1, updatedAt: '' })

test('practice topic prefers the section, then the document, and is blank without sources', () => {
  assert.equal(practiceTopic({ sources: [{ sectionHeader: ' Joins ', documentTitle: 'db.md' }] }), 'Joins')
  assert.equal(practiceTopic({ sources: [{ sectionHeader: '', documentTitle: 'db.md' }] }), 'db.md')
  assert.equal(practiceTopic({ sources: [] }), '')
})

test('mastery labels wait for enough attempts before judging a topic', () => {
  assert.equal(practiceMasteryLabel(entry('a', 0.9, 2)), 'Just started')
  assert.equal(practiceMasteryLabel(entry('a', 0.75)), 'Strong')
  assert.equal(practiceMasteryLabel(entry('a', 0.5)), 'Developing')
  assert.equal(practiceMasteryLabel(entry('a', 0.49)), 'Needs practice')
  assert.equal(practiceMasteryPercent(entry('a', 2 / 3)), 67)
})

test('mastery lists put the weakest topic first and replace updated topics', () => {
  const entries = [entry('b', 0.8), entry('c', 0.2), entry('a', 0.8)]
  assert.deepEqual(practiceMasteryWeakestFirst(entries).map(item => item.topic), ['c', 'a', 'b'])
  assert.equal(mergeTopicMastery(entries, null), entries)
  const merged = mergeTopicMastery(entries, entry('c', 0.6))
  assert.deepEqual(merged.map(item => [item.topic, item.mastery]), [['b', 0.8], ['a', 0.8], ['c', 0.6]])
})

test('tracking records the attempt and returns the updated topic mastery', async t => {
  const calls = []
  const updated = entry('Joins', 0.6, 1)
  globalThis.window = { tokensmith: {
    recordPracticeAttempt: async input => { calls.push(['record', input]); return 1 },
    updateTopicMastery: async (...args) => { calls.push(['mastery', ...args]); return updated },
    listTopicMastery: async () => [updated]
  } }
  t.after(() => { delete globalThis.window })
  const question = { id: 'q1', text: 'Why?', sources: [{ materialId: 'c1', documentId: 1, chunkId: 'ch', sectionHeader: 'Joins' }], attempts: [] }
  assert.equal(await trackPracticeAttempt({ id: 's1' }, question, 'Because.', feedback('partial', ['met', 'missing']), false, 12.4), updated)
  assert.equal(calls[0][1].topic, 'Joins')
  assert.equal(calls[0][1].attemptNumber, 1)
  assert.equal(calls[0][1].durationMs, 12)
  assert.deepEqual(calls[1], ['mastery', 'Joins', ['met', 'missing'], false, false])
  assert.equal(await trackAnswerReveal({ id: 's1' }, question), updated)
  assert.deepEqual(calls[2], ['mastery', 'Joins', [], true, true])
  assert.equal(calls[3][1].verdict, 'revealed')
  assert.equal(await trackAnswerReveal({ id: 's1' }, { ...question, attempts: [{}] }), null)
  assert.deepEqual(await loadTopicMastery(), [updated])
})

test('tracking failures never interrupt practice', async t => {
  globalThis.window = { tokensmith: { recordPracticeAttempt: async () => { throw new Error('offline') },
    updateTopicMastery: async () => { throw new Error('offline') }, listTopicMastery: async () => { throw new Error('offline') } } }
  t.after(() => { delete globalThis.window })
  const question = { id: 'q1', text: 'Why?', sources: [], attempts: [] }
  assert.equal(await trackPracticeAttempt({ id: 's1' }, question, 'x', 'ok', false, 1), null)
  assert.equal(await trackAnswerReveal({ id: 's1' }, question), null)
  assert.deepEqual(await loadTopicMastery(), [])
})
