PYTEST_COV_ARGS =

BIN_PREFIX ?= venv/bin

PYTHON_BIN = python3.11

FORCE: ;

create-venv:
	$(PYTHON_BIN) -mvenv venv

deps:
	venv/bin/pip install -r requirements.txt

remove-venv: FORCE
	rm -rf venv

recreate-venv: remove-venv create-venv

lint:
	venv/bin/ruff check

lint-fix:
	venv/bin/ruff --fix

format:
	venv/bin/ruff format

requirements.txt: deps-top.txt scripts/lock_requirements.py
	$(PYTHON_BIN) scripts/lock_requirements.py production

requirements-dev.txt: deps-dev-top.txt requirements.txt requirements-storage-all.txt requirements-oss.txt requirements-r2.txt requirements-google-ocr.txt scripts/lock_requirements.py
	$(PYTHON_BIN) scripts/lock_requirements.py dev

requirements-oss.txt: deps-oss-top.txt requirements.txt scripts/lock_requirements.py
	$(PYTHON_BIN) scripts/lock_requirements.py oss

requirements-r2.txt: deps-r2-top.txt requirements.txt scripts/lock_requirements.py
	$(PYTHON_BIN) scripts/lock_requirements.py r2

requirements-google-ocr.txt: deps-google-ocr-top.txt requirements.txt scripts/lock_requirements.py
	$(PYTHON_BIN) scripts/lock_requirements.py google-ocr

test: test_all

test_all:
	venv/bin/pytest

test_all_parallel:
	# TODO: fix this
	venv/bin/pytest -n 8

test_single:
	venv/bin/pytest tests/api/test_file_api.py

test_logging:
	#--capture=no
	venv/bin/pytest --capture=sys --log-cli-level=DEBUG tests/base/test_logging.py

babel-update-po:
	$(BIN_PREFIX)/pybabel extract -F babel.cfg -k lazy_gettext -k hardcode_text -o messages.pot app
	$(BIN_PREFIX)/pybabel update -i messages.pot -d app/translations

babel-compile-mo:
	$(BIN_PREFIX)/pybabel compile -d app/translations

babel-update-mo: babel-update-po
	$(MAKE) babel-compile-mo

babel-translate-po:
	venv/bin/python app/scripts/fill_zh_translations.py
	venv/bin/python app/scripts/fill_en_translations.py
