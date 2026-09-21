{
  description = "Heatflask - Strava activity visualization web application";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs {
          inherit system;
          config.allowUnfree = true;
        };

        # Python 3.13. The floor is set by numpy 2.5, which requires >= 3.12.
        # Sanic 25.12 supports 3.10-3.14 and pymongo 4.18 supports 3.9-3.14.
        #
        # The dev shell is the development environment, so the development
        # tools come from here rather than from a requirements-dev.txt. Only
        # the application's runtime dependencies are pip-installed, into a
        # venv, because that venv mirrors what the Dockerfile builds and the
        # versions that reach production should come from one place.
        #
        # These four import the application to do their work, so they have to
        # see its pip-installed dependencies. heatflask-setup builds the venv
        # with --system-site-packages, which makes this environment visible
        # from inside it, and they are invoked as `python -m ...` from there
        # (see heatflask-test) rather than by their own console scripts, which
        # would run under this interpreter and not find sanic.
        pythonEnv = pkgs.python313.withPackages (ps: with ps; [
          pip
          setuptools
          wheel
          virtualenv

          # Development tools
          pytest
          pytest-asyncio
          mypy
          pdoc
          ipython
        ]);

        # MongoDB is the only datastore. Postgres and Redis are gone:
        # Postgres survives only as a one-shot user import (Users.migrate(),
        # which talks to the remote legacy database, not a local one), and
        # Redis was a read cache in front of Mongo.

        # One local database per clone, at .data/mongodb in the main worktree.
        # A relative dbPath resolved against the shell's working directory, so
        # starting MongoDB from frontend/ or from a linked worktree quietly
        # made a second, empty database, and it looked as if the data had
        # been wiped. --git-common-dir is the main worktree's .git from
        # anywhere in the repo, linked worktrees included.
        mongoDataDir = ''
          git_dir=$(${pkgs.git}/bin/git rev-parse --path-format=absolute --git-common-dir 2>/dev/null) || {
            echo "ERROR: run this from inside the heatflask repository"
            exit 1
          }
          MONGO_DATA_DIR="$(dirname "$git_dir")/.data/mongodb"
        '';

        setupScript = pkgs.writeShellScriptBin "heatflask-setup" ''
          set -e

          echo "Setting up Heatflask development environment..."

          ${mongoDataDir}
          mkdir -p "$MONGO_DATA_DIR"

          # backend/.venv/heatflask, not a bare .venv: that is what
          # .gitignore excludes
          if [ ! -d "backend/.venv/heatflask" ]; then
            echo "Creating Python virtual environment..."
            # --system-site-packages so that pytest, mypy and pdoc, which the
            # dev shell provides, can see the dependencies pip installs here.
            python -m venv --system-site-packages backend/.venv/heatflask
            source backend/.venv/heatflask/bin/activate
            pip install --upgrade pip setuptools wheel
            echo "Installing backend dependencies..."
            pip install -r backend/requirements.txt
            deactivate
          fi

          ( ${frontendInstall} )

          # The pre-commit hook in .githooks formats staged files with
          # Prettier and Ruff.
          git config core.hooksPath .githooks

          echo "Setup complete!"
          echo ""
          echo "  heatflask-start-services   # start MongoDB"
          echo "  heatflask-run              # run the Sanic server"
          echo "  heatflask-test             # run the backend tests"
        '';

        startServicesScript = pkgs.writeShellScriptBin "heatflask-start-services" ''
          set -e
          ${mongoDataDir}

          # Detect by port, not by process name, so that a mongod started some
          # other way is found too. A second server would exit 48 (address in
          # use).
          if (exec 3<>/dev/tcp/127.0.0.1/27017) 2>/dev/null; then
            echo "MongoDB already running on 127.0.0.1:27017"
          else
            echo "Starting MongoDB..."
            mkdir -p "$MONGO_DATA_DIR"
            ${pkgs.mongodb}/bin/mongod --fork \
              --dbpath "$MONGO_DATA_DIR" \
              --logpath "$MONGO_DATA_DIR/mongod.log" --logappend \
              --bind_ip 127.0.0.1 --port 27017
            echo "MongoDB: localhost:27017, data in $MONGO_DATA_DIR"
          fi
        '';

        stopServicesScript = pkgs.writeShellScriptBin "heatflask-stop-services" ''
          ${mongoDataDir}
          # mongod can shut itself down given its dbPath. The mongodb package
          # ships mongo/mongod/mongos and *not* mongosh, so the previous
          # `mongosh --eval shutdown` was a command-not-found, and its pkill
          # fallback matched a pattern that never appears in mongod's argv.
          if (exec 3<>/dev/tcp/127.0.0.1/27017) 2>/dev/null; then
            echo "Stopping MongoDB..."
            ${pkgs.mongodb}/bin/mongod --dbpath "$MONGO_DATA_DIR" --shutdown
          else
            echo "MongoDB is not running"
          fi
        '';

        runAppScript = pkgs.writeShellScriptBin "heatflask-run" ''
          if [ ! -d "backend/.venv/heatflask" ]; then
            echo "ERROR: no virtual environment. Run 'heatflask-setup' first."
            exit 1
          fi

          if ! (exec 3<>/dev/tcp/127.0.0.1/27017) 2>/dev/null; then
            echo "WARNING: MongoDB is not running. Run 'heatflask-start-services'."
          fi

          cd backend || exit 1
          source .venv/heatflask/bin/activate

          # Local credentials, copied from backend/.env.example and gitignored.
          if [ -f .env ]; then
            echo "loading backend/.env"
            set -a
            . ./.env
            set +a
          fi

          export MONGODB_URL=''${MONGODB_URL:-mongodb://localhost:27017/heatflask}
          export APP_ENV=''${APP_ENV:-development}

          if [ -z "''${STRAVA_CLIENT_ID:-}" ]; then
            echo ""
            echo "ERROR: STRAVA_CLIENT_ID is not set, so the app cannot import."
            echo "       Copy backend/.env.example to backend/.env and fill it in."
            exit 1
          fi

          echo "MONGODB_URL: $MONGODB_URL"
          echo "APP_ENV:     $APP_ENV"
          echo ""

          exec python -m heatflask.webserver.serve "''${@}"
        '';

        # Tests run from inside the venv, as `python -m pytest`: pytest comes
        # from the dev shell and the application's dependencies come from the
        # venv, and only the venv's interpreter can see both. Running the
        # `pytest` console script instead would use the dev shell's
        # interpreter, which cannot import sanic.
        testScript = pkgs.writeShellScriptBin "heatflask-test" ''
          if [ ! -d "backend/.venv/heatflask" ]; then
            echo "ERROR: no virtual environment. Run 'heatflask-setup' first."
            exit 1
          fi
          cd backend || exit 1
          source .venv/heatflask/bin/activate

          # Strava.py reads these at import; conftest.py sets them too, but
          # only after pytest has started collecting.
          export STRAVA_CLIENT_ID=''${STRAVA_CLIENT_ID:-1}
          export STRAVA_CLIENT_SECRET=''${STRAVA_CLIENT_SECRET:-test-secret}

          exec python -m pytest "''${@}"
        '';

        # Frontend. Note there is no asc-build step: the AssemblyScript/WASM
        # layer is being removed, and npm ci needs --ignore-scripts because the
        # three GitHub fork dependencies run `prepare` on install and pull in
        # build chains that do not compile on current Node.
        frontendInstall = ''
          cd frontend || exit 1
          if [ ! -d node_modules ]; then
            echo "Installing frontend dependencies..."
            npm ci --ignore-scripts --no-audit --no-fund || exit 1
          fi
          mkdir -p dist
          cp -n src/dist/* dist/ 2>/dev/null || true
        '';

        frontendBuildScript = pkgs.writeShellScriptBin "heatflask-frontend-build" ''
          ${frontendInstall}
          # Parcel emits content-hashed filenames, so without clearing the old
          # output first every build leaves all of its predecessors behind.
          rm -rf dist/* .parcel-cache
          cp -n src/dist/* dist/ 2>/dev/null || true
          exec ./node_modules/.bin/parcel build 'src/webpages/**/!(tab.*).html' "''${@}"
        '';

        frontendWatchScript = pkgs.writeShellScriptBin "heatflask-frontend-watch" ''
          ${frontendInstall}
          exec ./node_modules/.bin/parcel watch 'src/webpages/**/!(tab.*).html' "''${@}"
        '';

      in
      {
        devShells.default = pkgs.mkShell {
          buildInputs = with pkgs; [
            pythonEnv
            mongodb

            # Build tools for compiled Python extensions
            gcc
            gnumake
            pkg-config

            zlib
            openssl
            libffi

            # numpy and other binary wheels link against libstdc++ at runtime
            stdenv.cc.cc.lib

            # Linting and formatting for Python, replacing black and
            # flake8. It parses rather than imports, so unlike pytest it
            # needs nothing from the venv.
            ruff

            # Node.js for frontend assets
            nodejs_22

            git
            jq
            curl

            # Deploys and the production logs and database. Only the
            # maintainer has access to the Heroku app, but whoever does
            # should get the CLI with the project, not their own machine.
            heroku

            setupScript
            startServicesScript
            stopServicesScript
            runAppScript
            testScript
            frontendBuildScript
            frontendWatchScript
          ];

          shellHook = ''
            # pip-installed wheels (numpy above all) dlopen libstdc++ at
            # runtime, which a venv built on a bare nix python cannot find.
            # Without this, `import numpy` fails with
            #   libstdc++.so.6: cannot open shared object file
            export LD_LIBRARY_PATH="${pkgs.lib.makeLibraryPath [
              pkgs.stdenv.cc.cc.lib
              pkgs.zlib
              pkgs.openssl
              pkgs.libffi
            ]}:$LD_LIBRARY_PATH"

            echo "🔥 Heatflask Development Environment"
            echo "===================================="
            echo ""
            echo "Python:  $(python --version)"
            echo "MongoDB: $(mongod --version | head -n1)"
            echo "Node.js: $(node --version)"
            echo ""
            echo "  heatflask-setup            - install deps and the git hooks"
            echo "  heatflask-start-services   - start MongoDB"
            echo "  heatflask-stop-services    - stop MongoDB"
            echo "  heatflask-run              - run the Sanic backend"
            echo "  heatflask-test             - run the backend tests"
            echo "  heatflask-frontend-build   - build the frontend once"
            echo "  heatflask-frontend-watch   - rebuild the frontend on change"
            echo ""
            echo "Local dev loop, from the repo root:"
            echo "  1. heatflask-setup && heatflask-start-services"
            echo "  2. heatflask-frontend-watch     (leave running)"
            echo "  3. heatflask-run               (in a second shell)"
            echo "  Needs STRAVA_CLIENT_ID/SECRET in backend/.env; copy"
            echo "  backend/.env.example there and fill it in."
            echo ""
          '';

          LDFLAGS = "-L${pkgs.lib.makeLibraryPath [
            pkgs.zlib
            pkgs.openssl
            pkgs.libffi
          ]}";
        };
      }
    );
}
