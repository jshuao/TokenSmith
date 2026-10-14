import tempfile
import unittest

from python_engine import tokensmith_store as store


class TopicMasteryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = self.temp.name

    def test_all_met_adds_full_evidence_to_alpha(self):
        entry = store.update_topic_mastery(self.root, 'B+ trees', ['met', 'met'])
        self.assertAlmostEqual(entry['alpha'], 2.0)
        self.assertAlmostEqual(entry['beta'], 1.0)
        self.assertEqual(entry['attempts'], 1)
        self.assertEqual(entry['confidence'], 1)
        self.assertAlmostEqual(entry['mastery'], 2.0 / 3.0)
        self.assertEqual(entry['topic'], 'B+ trees')
        self.assertTrue(entry['updatedAt'])

    def test_met_and_incorrect_split_evidence(self):
        entry = store.update_topic_mastery(self.root, 'joins', ['met', 'incorrect'])
        self.assertAlmostEqual(entry['alpha'], 1.5)
        self.assertAlmostEqual(entry['beta'], 1.5)

    def test_missing_adds_half_weight_to_beta(self):
        entry = store.update_topic_mastery(self.root, 'joins', ['missing'])
        self.assertAlmostEqual(entry['alpha'], 1.0)
        self.assertAlmostEqual(entry['beta'], 1.5)

    def test_assisted_halves_met_credit(self):
        entry = store.update_topic_mastery(self.root, 'joins', ['met', 'met'], assisted=True)
        self.assertAlmostEqual(entry['alpha'], 1.5)
        self.assertAlmostEqual(entry['beta'], 1.0)

    def test_unknown_status_is_ignored(self):
        entry = store.update_topic_mastery(self.root, 'joins', ['met', 'unclear'])
        self.assertAlmostEqual(entry['alpha'], 1.5)
        self.assertAlmostEqual(entry['beta'], 1.0)

    def test_blank_topic_or_empty_statuses_write_nothing(self):
        self.assertIsNone(store.update_topic_mastery(self.root, '', ['met']))
        self.assertIsNone(store.update_topic_mastery(self.root, '   ', ['met']))
        self.assertIsNone(store.update_topic_mastery(self.root, 'joins', []))
        self.assertEqual(store.list_topic_mastery(self.root), [])

    def test_reveal_without_statuses_adds_penalty(self):
        entry = store.update_topic_mastery(self.root, 'joins', [], revealed=True)
        self.assertAlmostEqual(entry['alpha'], 1.0)
        self.assertAlmostEqual(entry['beta'], 1.25)
        self.assertEqual(entry['attempts'], 1)

    def test_updates_accumulate_and_topic_is_stripped(self):
        store.update_topic_mastery(self.root, '  joins ', ['met'])
        entry = store.update_topic_mastery(self.root, 'joins', ['incorrect'])
        self.assertAlmostEqual(entry['alpha'], 2.0)
        self.assertAlmostEqual(entry['beta'], 2.0)
        self.assertEqual(entry['attempts'], 2)
        self.assertEqual([item['topic'] for item in store.list_topic_mastery(self.root)], ['joins'])

    def test_mastery_stays_strictly_between_zero_and_one(self):
        for _ in range(200):
            high = store.update_topic_mastery(self.root, 'high', ['met'])
            low = store.update_topic_mastery(self.root, 'low', ['incorrect'])
        self.assertLess(high['mastery'], 1.0)
        self.assertGreater(low['mastery'], 0.0)
        self.assertEqual(high['attempts'], 200)

    def test_list_returns_all_topics(self):
        store.update_topic_mastery(self.root, 'joins', ['met'])
        store.update_topic_mastery(self.root, 'indexes', ['incorrect'])
        entries = {item['topic']: item for item in store.list_topic_mastery(self.root)}
        self.assertEqual(set(entries), {'joins', 'indexes'})
        self.assertAlmostEqual(entries['indexes']['mastery'], 1.0 / 3.0)


class PracticeAttemptTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = self.temp.name

    def record(self, session_id, **overrides):
        values = {
            'session_id': session_id,
            'question_id': 'q1',
            'attempt_number': 1,
            'question': 'Why do B+ trees keep leaves linked?',
            'student_answer': 'For range scans.',
            'verdict': 'partial',
            'checks': [{'criterion': 'range scans', 'status': 'met'}, {'criterion': 'ordering', 'status': 'missing'}],
            'reference_answer': 'Linked leaves allow ordered range scans.',
            'source_keys': ['material:1:chunk:4', 'material:1:chunk:9'],
            'topic': 'B+ trees',
            'assisted': True,
            'hint_used': False,
            'answer_revealed': True,
            'duration_ms': 4200,
        }
        values.update(overrides)
        return store.record_practice_attempt(self.root, **values), values

    def test_round_trips_every_field(self):
        attempt_id, values = self.record('s1')
        [row] = store.export_practice_attempts(self.root)
        self.assertEqual(row['id'], attempt_id)
        self.assertEqual(row['sessionId'], 's1')
        self.assertEqual(row['questionId'], values['question_id'])
        self.assertEqual(row['attemptNumber'], 1)
        self.assertEqual(row['question'], values['question'])
        self.assertEqual(row['studentAnswer'], values['student_answer'])
        self.assertEqual(row['verdict'], 'partial')
        self.assertEqual(row['checks'], values['checks'])
        self.assertEqual(row['referenceAnswer'], values['reference_answer'])
        self.assertEqual(row['sourceKeys'], values['source_keys'])
        self.assertEqual(row['topic'], 'B+ trees')
        self.assertIs(row['assisted'], True)
        self.assertIs(row['hintUsed'], False)
        self.assertIs(row['answerRevealed'], True)
        self.assertEqual(row['durationMs'], 4200)
        self.assertTrue(row['createdAt'])

    def test_optional_fields_round_trip_as_none(self):
        self.record('s1', reference_answer=None, topic=None, duration_ms=None, checks=[], source_keys=[])
        [row] = store.export_practice_attempts(self.root)
        self.assertIsNone(row['referenceAnswer'])
        self.assertIsNone(row['topic'])
        self.assertIsNone(row['durationMs'])
        self.assertEqual(row['checks'], [])
        self.assertEqual(row['sourceKeys'], [])

    def test_session_filter_and_oldest_first_order(self):
        first, _ = self.record('s1')
        self.record('s2')
        third, _ = self.record('s1', attempt_number=2)
        self.assertEqual([row['id'] for row in store.export_practice_attempts(self.root, 's1')], [first, third])
        self.assertEqual(len(store.export_practice_attempts(self.root, 's2')), 1)
        self.assertEqual(store.export_practice_attempts(self.root, 'missing'), [])
        self.assertEqual(len(store.export_practice_attempts(self.root)), 3)


class SchemaUpgradeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = self.temp.name

    def table_names(self):
        with store.connect(self.root) as conn:
            return {row['name'] for row in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}

    def test_version_11_database_gains_new_tables_without_losing_data(self):
        store.init_db(self.root)
        with store.connect(self.root) as conn:
            conn.execute('DROP TABLE practice_attempts')
            conn.execute('DROP TABLE topic_mastery')
            store.set_schema_value(conn, 'version', '11')
            conn.execute("INSERT INTO collections(id, name) VALUES (7, 'Databases')")
            conn.execute("INSERT INTO folders(id, path) VALUES (3, '/course')")
        self.assertNotIn('practice_attempts', self.table_names())
        self.assertNotIn('topic_mastery', self.table_names())

        store.init_db(self.root)

        self.assertTrue({'practice_attempts', 'topic_mastery'} <= self.table_names())
        self.assertEqual(store.get_schema_value(self.root, 'version'), '12')
        with store.connect(self.root) as conn:
            self.assertEqual(conn.execute('SELECT name FROM collections WHERE id = 7').fetchone()['name'], 'Databases')
            self.assertEqual(conn.execute('SELECT path FROM folders WHERE id = 3').fetchone()['path'], '/course')
            indexes = {row['name'] for row in conn.execute("SELECT name FROM sqlite_master WHERE type = 'index'")}
        self.assertTrue({'idx_practice_attempts_session_id', 'idx_practice_attempts_topic'} <= indexes)
        self.assertIsNotNone(store.update_topic_mastery(self.root, 'joins', ['met']))


if __name__ == '__main__':
    unittest.main()
