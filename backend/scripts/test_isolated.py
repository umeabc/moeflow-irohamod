"""Run Flask tests with an in-memory database and disposable local image storage.

Example: python scripts/test_isolated.py tests/api/test_site_setting_api.py
Install requirements-dev.txt first (existing Windows .review-* dependencies also work).
"""

import os
import shutil
import sys
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
CONFIG = {
    'SITE_NAME': 'MoeFlow Tests',
    'SITE_ORIGIN': 'http://localhost',
    'SECRET_KEY': 'isolated-unit-test-key',
    'ADMIN_EMAIL': 'admin@example.invalid',
    'ADMIN_INITIAL_PASSWORD': 'isolated-test-password',
    'TESTING': 'YES',
    'MONGODB_URI': 'mongomock://localhost/moeflow_isolated_test',
    'STORAGE_TYPE': 'LOCAL_STORAGE',
    'STORAGE_DOMAIN': 'http://localhost/storage/',
    'ENABLE_USER_EMAIL': 'False',
    'ENABLE_LOG_EMAIL': 'False',
    'LOG_PATH': '',
    'LOG_LEVEL': 'WARNING',
    'CELERY_BROKER_URL': 'memory://',
    'CELERY_BACKEND_URL': 'cache+memory://',
    'MOEFLOW_BUILD_ID': 'iroha16-fix14',
    'PYTEST_DISABLE_PLUGIN_AUTOLOAD': '1',
}


def main(args):
    for dependencies in (ROOT / '.review-deps', ROOT / '.review-minimal'):
        if dependencies.is_dir():
            sys.path.insert(0, str(dependencies))
    import pytest

    ignore = shutil.ignore_patterns('__pycache__', '*.pyc', '.env*', '*.pem', '*.key')
    with TemporaryDirectory(prefix='moeflow-isolated-') as tmp:
        sandbox = Path(tmp).resolve()
        for name in ('app', 'tests', 'files/test', 'files/fonts'):
            shutil.copytree(ROOT / name, sandbox / name, ignore=ignore)
        (sandbox / 'files' / 'tmp').mkdir()
        (sandbox / 'storage').mkdir()
        prev = Path.cwd()
        os.chdir(sandbox)
        sys.path.insert(0, str(sandbox))
        try:
            with patch.dict(os.environ, CONFIG), patch('dotenv.load_dotenv', return_value=False):
                return pytest.main(['-p', 'no:cacheprovider', '-o', 'addopts=', '-q', *args])
        finally:
            sys.path.remove(str(sandbox))
            os.chdir(prev)


if __name__ == '__main__':
    raise SystemExit(main(sys.argv[1:]))
