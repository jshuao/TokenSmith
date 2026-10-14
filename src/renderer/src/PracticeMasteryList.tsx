import { practiceMasteryLabel, practiceMasteryPercent, type TopicMastery } from '@shared/practice'

export function PracticeMasteryList({ title, entries }: { title: string; entries: TopicMastery[] }) {
  if (!entries.length) return null
  return <section className="practice-mastery" aria-label={title}>
    <h3>{title}</h3>
    <ul>{entries.map(entry => <li key={entry.topic}>
      <span className="practice-mastery-topic">{entry.topic}</span>
      <span className="practice-muted">{practiceMasteryLabel(entry)} · {entry.attempts} attempt{entry.attempts === 1 ? '' : 's'}</span>
      <span className="practice-mastery-bar" role="meter" aria-label={`Mastery of ${entry.topic}`} aria-valuemin={0} aria-valuemax={100}
        aria-valuenow={practiceMasteryPercent(entry)}><span style={{ width: `${practiceMasteryPercent(entry)}%` }} /></span>
    </li>)}</ul>
  </section>
}
