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

          # backend/.venv/heatflask, not a bare .venv: that is the path
          # backend/.env.tmp sources, what backend/.dev-install-backend creates,
          # and what .gitignore already excludes
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

          echo "Setup complete!"
          echo ""
          echo "  heatflask-start-services   # start MongoDB"
          echo "  heatflask-run              # run the Sanic server"
        '';

        startServicesScript = pkgs.writeShellScriptBin "heatflask-start-services" ''
          set -e

          if ! pgrep -f "mongod.*\.data/mongodb" > /dev/null; then
            echo "Starting MongoDB..."
            ${pkgs.mongodb}/bin/mongod --config ${mongoConf} --fork
            sleep 2
          else
            echo "MongoDB already running"
          fi

          echo "MongoDB: localhost:27017"
        '';

        stopServicesScript = pkgs.writeShellScriptBin "heatflask-stop-services" ''
          if pgrep -f "mongod.*\.data/mongodb" > /dev/null; then
            echo "Stopping MongoDB..."
            ${pkgs.mongodb}/bin/mongosh --eval "db.adminCommand({ shutdown: 1 })" 2>/dev/null \
              || pkill -f "mongod.*\.data/mongodb"
          fi

          echo "Services stopped."
        '';

        runAppScript = pkgs.writeShellScriptBin "heatflask-run" ''
          if [ ! -d "backend/.venv/heatflask" ]; then
            echo "ERROR: no virtual environment. Run 'heatflask-setup' first."
            exit 1
          fi

          source backend/.venv/heatflask/bin/activate

          if ! ${pkgs.mongodb}/bin/mongosh --quiet --eval "db.version()" > /dev/null 2>&1; then
            echo "WARNING: MongoDB is not running. Run 'heatflask-start-services'."
          fi

          export MONGODB_URL=''${MONGODB_URL:-mongodb://localhost:27017/heatflask}
          export APP_ENV=''${APP_ENV:-development}

          echo "MONGODB_URL: $MONGODB_URL"
          echo "APP_ENV:     $APP_ENV"
          echo ""

          cd backend && exec python -m heatflask.webserver.serve "''${@}"
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
            echo "  heatflask-setup            - create .venv and install deps"
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
            echo "  Needs STRAVA_CLIENT_ID/SECRET in the environment; see"
            echo "  backend/.env.tmp for the full list."
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
