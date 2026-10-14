import type { PracticeAttemptInput, PracticeFeedback, PracticeQuestion, PracticeSession, TopicMastery } from '@shared/practice'
import { practiceSourceKey, practiceTopic } from '../../shared/practice'

export function practiceMasteryInputs(feedback: PracticeFeedback | string, assisted: boolean): { statuses: string[]; assisted: boolean } {
  if (typeof feedback === 'string' || feedback.verdict === 'needs_review') return { statuses: [], assisted }
  return { statuses: feedback.checks.map(check => check.status), assisted }
}

export async function loadTopicMastery(): Promise<TopicMastery[]> {
  try {
    return await window.tokensmith?.listTopicMastery() ?? []
  } catch {
    return []
  }
}

export async function trackPracticeAttempt(session: PracticeSession, question: PracticeQuestion, answer: string,
  feedback: PracticeFeedback | string, assisted: boolean, durationMs: number): Promise<TopicMastery | null> {
  try {
    const bridge = window.tokensmith
    if (!bridge) return null
    const topic = practiceTopic(question)
    const input: PracticeAttemptInput = {
      sessionId: session.id,
      questionId: question.id,
      attemptNumber: question.attempts.length + 1,
      question: question.text,
      studentAnswer: answer,
      verdict: typeof feedback === 'string' ? 'unknown' : feedback.verdict,
      checks: typeof feedback === 'string' ? [] : feedback.checks,
      referenceAnswer: question.referenceAnswer ?? null,
      sourceKeys: question.sources.map(practiceSourceKey),
      topic,
      assisted,
      hintUsed: Boolean(question.hintUsed),
      answerRevealed: Boolean(question.answerRevealed),
      durationMs: Math.round(durationMs)
    }
    await bridge.recordPracticeAttempt(input)
    const mastery = practiceMasteryInputs(feedback, assisted)
    return await bridge.updateTopicMastery(topic, mastery.statuses, mastery.assisted, false)
  } catch {
    return null
  }
}

export async function trackAnswerReveal(session: PracticeSession, question: PracticeQuestion): Promise<TopicMastery | null> {
  try {
    const bridge = window.tokensmith
    if (!bridge || question.attempts.length !== 0) return null
    const topic = practiceTopic(question)
    const entry = await bridge.updateTopicMastery(topic, [], true, true)
    await bridge.recordPracticeAttempt({
      sessionId: session.id,
      questionId: question.id,
      attemptNumber: 1,
      question: question.text,
      studentAnswer: '',
      verdict: 'revealed',
      checks: [],
      referenceAnswer: question.referenceAnswer ?? null,
      sourceKeys: question.sources.map(practiceSourceKey),
      topic,
      assisted: true,
      hintUsed: Boolean(question.hintUsed),
      answerRevealed: true,
      durationMs: null
    })
    return entry
  } catch {
    return null
  }
}
