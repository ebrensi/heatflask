#!/usr/bin/make -f

SHELL := /bin/bash
PYTHON = python3.12

PYTHON_FOLDERS = . ./heatflask
VENV_FOLDER= ./.venv/heatflask

GIT_HOOKS_FOLDER=.git/hooks
PRE_COMMIT_SOURCE=.githooks/pre-commit
PRE_COMMIT_DEST=$(GIT_HOOKS_FOLDER)/pre-commit

ACTIVATE=$(VENV_FOLDER)/bin/activate
LOCAL_ACTIVATE=./.activate
ENV=./.env

.DEFAULT_GOAL := clean-install

GUNICORN_CMD_ARGS="--reload --worker-class flask_sockets.worker --log-level=debug --bind '0.0.0.0:5000'"
HEROKU_EXE=/usr/bin/heroku


# CLEAN SCRIPTS
clean-temp:
	@echo "Cleaning temp files"
	-rm -rf temp/*

clean-venv:
	@echo "Cleaning Python virtual environment"
	-rm -rf ./.venv/
	-rm -f $(ENV)

clean-python:
	@echo "Cleaning Python files"
	-rm -rf *.spec
	-for f in $(PYTHON_FOLDERS); do \
		rm -rf $$f/__pycache__/ $$f/.mypy_cache/; \
	done

clean-all: clean-temp clean-python clean-venv
.PHONY: clean-temp clean-venv clean-python clean-all

# INSTALL HOOKS
$(GIT_HOOKS_FOLDER):
	@echo "Creating hooks folder"
	mkdir --parents $@

$(PRE_COMMIT_DEST): | $(GIT_HOOKS_FOLDER)
	# This is a hook to (on git commit) automatically run
	# Black formatter for Python files and
	# Prettier for frontend (HTML, JavaScript, TypeScript, CSS, etc)
	@echo "Creating pre-commit hook"
	@if [ ! -L "$(PRE_COMMIT_DEST)" ]; then \
		ln -s $(PRE_COMMIT_SOURCE) $@; \
	fi

install-hooks: $(PRE_COMMIT_DEST)
	@echo "Git hooks installed"
.PHONY: install-hooks

# PYTHON VIRTUAL ENVIRONMENT
$(ACTIVATE): requirements.txt
	@echo "Creating Python virtual environment"
	test -d $(VENV_FOLDER) || mkdir --parents $(VENV_FOLDER); \
	$(PYTHON) -m venv --clear $(VENV_FOLDER); \
	echo "#!/bin/env sh" > $(LOCAL_ACTIVATE) && \
	echo ". $(ACTIVATE)" >> $(LOCAL_ACTIVATE)

install-python: $(ACTIVATE)
	. $(ACTIVATE) && \
		pip install --upgrade pip && \
		pip install --upgrade -r requirements.txt
.PHONY: install-python

# # INSTALL/UPDATE FRONTEND DEPENDENCIES
# install-client: Client/package.json
# 	@echo "Installing Client"
# 	cd Client && npm ci --quiet || npm install --quiet

# INSTALL/UPDATE everything (from current repo)
install:
	$(MAKE) install-python
	# $(MAKE) install-client

update: install

clean-install: clean-all install
	$(MAKE) install-hooks

.PHONY: install update clean-install install-client

# UPDATE REPO (from remote) and install/update
pull:
	git pull && $(MAKE) install
pull-clean:
	git pull && $(MAKE) clean-install
.PHONY: update-repo pull pull-clean

# RUN SERVER
serve: $(ENV)
	@echo "Running local server"
	@echo
	@. $(ENV) && \
	if [ -f "$(HEROKU_EXE)" ]; then \
		heroku local; \
	else \
		gunicorn wsgi:app; \
	fi
.PHONY: serve

# # FOR FRONTEND DEVELOPMENT
# watch:
# 	cd Client; npm run watch
# .PHONY: watch
