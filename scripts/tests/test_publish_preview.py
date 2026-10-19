"""Vérifie les préfixes avec le véritable parseur et la CLI, sans aucune commande Git."""
import contextlib
import importlib.util
import io
from pathlib import Path
import subprocess
import sys
import unittest
from unittest.mock import patch


SCRIPT = Path(__file__).resolve().parents[1] / 'publish-preview.py'
SPEC = importlib.util.spec_from_file_location('publish_preview', SCRIPT)
publication = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(publication)


class PreviewPrefixTests(unittest.TestCase):
    def test_default_is_unchanged(self):
        self.assertEqual(publication.parse_args([]).prefix, 'essais/reprise-v8/')

    def test_valid_prefixes_are_normalized(self):
        for value, expected in [
            ('essais/recettes-v11/', 'essais/recettes-v11/'),
            ('essais/recettes-v11', 'essais/recettes-v11/'),
            ('essais/Lot_2/recettes-3/', 'essais/Lot_2/recettes-3/'),
        ]:
            with self.subTest(prefix=value):
                self.assertEqual(publication.parse_args(['--prefix', value]).prefix, expected)

    def test_unsafe_prefixes_are_rejected_by_cli_before_any_git_or_build_access(self):
        invalid = [
            '', '/', '/essais/test/', 'essais', 'essais/', 'assets/test/',
            '../essais/test/', 'essais/../test/', 'essais/a/../../test/',
            'essais/./test/', 'essais/.git/', 'essais/a..b/', 'essais/test//',
            'essais//test/', 'essais/test/*', 'essais/test?/', 'essais/[ab]/',
            'essais/{a,b}/', 'essais/:glob/', ':(glob)essais/*',
            'essais/test\\other/', 'C:/essais/test/', 'essais/test name/',
            ' essais/test/', 'essais/test/ ', 'essais/test\n/', 'essais/tést/',
            'essais/%2e%2e/', 'essais/a#b/', 'essais/-option/',
        ]
        for value in invalid:
            with self.subTest(prefix=repr(value)):
                # Appeler main réel tout en interdisant explicitement les opérations Git.
                with patch.object(publication, 'git', side_effect=AssertionError('Git interdit')) as git:
                    with contextlib.redirect_stderr(io.StringIO()):
                        with self.assertRaises(SystemExit) as error:
                            publication.main(['--prefix', value])
                    self.assertEqual(error.exception.code, 2)
                    git.assert_not_called()

        # Le point d’entrée exécuté en sous-processus rejette aussi le traversal avec -O.
        result = subprocess.run([sys.executable, '-O', str(SCRIPT), '--prefix', 'essais/../'],
                                capture_output=True, text=True)
        self.assertEqual(result.returncode, 2)
        self.assertIn('préfixe attendu', result.stderr)
        self.assertNotIn('Traceback', result.stderr)

    def test_cli_help_is_safe_with_a_custom_prefix(self):
        result = subprocess.run([sys.executable, str(SCRIPT), '--prefix', 'essais/recettes-v11/', '--help'],
                                capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('--prefix', result.stdout)
        self.assertIn('essais/reprise-v8/', result.stdout)

    def test_reports_are_separate_and_default_location_is_preserved(self):
        root = Path('/depot')
        self.assertEqual(publication.report_path(root, publication.DEFAULT_PREFIX),
                         root / 'verification/out/harmonisation-v9/preview-publication.json')
        self.assertEqual(publication.report_path(root, 'essais/recettes-v11/'),
                         root / 'verification/out/previews/recettes-v11/preview-publication.json')

    def test_safety_checks_raise_explicitly(self):
        with self.assertRaisesRegex(RuntimeError, 'protection'):
            publication.require(False, 'protection')
        publication.require(True, 'protection')


if __name__ == '__main__':
    unittest.main()
