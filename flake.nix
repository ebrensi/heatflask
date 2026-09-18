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
        pythonEnv = pkgs.python313.withPackages (ps: with ps; [
          pip
          setuptools
          wheel
          virtualenv

          # Development tools
          black
          ipython
        ]);

        # MongoDB is the only datastore. Postgres and Redis are gone:
        # Postgres survives only as a one-shot user import (Users.migrate(),
        # which talks to the remote legacy database, not a local one), and
        # Redis was a read cache in front of Mongo.
        mongoConf = pkgs.writeText "mongod.conf" ''
          storage:
            dbPath: ./.data/mongodb
          systemLog:
            destination: file
            path: ./.data/mongodb/mongod.log
            logAppend: true
          net:
            bindIp: 127.0.0.1
            port: 27017
        '';

        setupScript = pkgs.writeShellScriptBin "heatflask-setup" ''
          set -e

          echo "Setting up Heatflask development environment..."

          mkdir -p .data/mongodb

          # backend/.venv/heatflask, not a bare .venv: that is the path the
          # pre-commit hook runs Black from, and what .gitignore excludes
          if [ ! -d "backend/.venv/heatflask" ]; then
            echo "Creating Python virtual environment..."
            python -m venv backend/.venv/heatflask
            source backend/.venv/heatflask/bin/activate
            pip install --upgrade pip setuptools wheel
            echo "Installing backend dependencies..."
            pip install -r backend/requirements.txt
            pip install -r backend/requirements-dev.txt
            deactivate
          fi

          ( ${frontendInstall} )

          # The pre-commit hook in .githooks formats staged files with
          # Prettier and Black.
          git config core.hooksPath .githooks

          echo "Setup complete!"
          echo ""
          echo "  heatflask-start-services   # start MongoDB"
          echo "  heatflask-run              # run the Sanic server"
        '';

        startServicesScript = pkgs.writeShellScriptBin "heatflask-start-services" ''
          set -e

          # Detect by port, not by process name. mongod's dbPath lives in the
          # config file, so a `pgrep -f "mongod.*\.data/mongodb"` pattern never
          # matches -- the command line is just `mongod --config ... --fork`.
          # We would then start a second server, which exits 48 (addr in use).
          if (exec 3<>/dev/tcp/127.0.0.1/27017) 2>/dev/null; then
            echo "MongoDB already running on 127.0.0.1:27017"
          else
            echo "Starting MongoDB..."
            mkdir -p .data/mongodb
            ${pkgs.mongodb}/bin/mongod --config ${mongoConf} --fork
            echo "MongoDB: localhost:27017"
          fi
        '';

        stopServicesScript = pkgs.writeShellScriptBin "heatflask-stop-services" ''
          # mongod can shut itself down given its dbPath. The mongodb package
          # ships mongo/mongod/mongos and *not* mongosh, so the previous
          # `mongosh --eval shutdown` was a command-not-found, and its pkill
          # fallback matched a pattern that never appears in mongod's argv.
          if (exec 3<>/dev/tcp/127.0.0.1/27017) 2>/dev/null; then
            echo "Stopping MongoDB..."
            ${pkgs.mongodb}/bin/mongod --dbpath .data/mongodb --shutdown
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
