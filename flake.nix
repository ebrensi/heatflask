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

        # Python environment with essential packages
        # Most dependencies will be installed via pip from requirements.txt
        # This includes build dependencies for packages like numpy, psycopg2, etc.
        pythonEnv = pkgs.python311.withPackages (ps: with ps; [
          # Essential build/dev tools
          pip
          setuptools
          wheel
          virtualenv

          # Build dependencies for compiled extensions
          cython

          # Development tools
          black
          ipython
          jupyter
        ]);

        # PostgreSQL with custom config
        postgresConf = pkgs.writeText "postgresql.conf" ''
          max_connections = 100
          shared_buffers = 128MB
          dynamic_shared_memory_type = posix
          log_timezone = 'UTC'
          datestyle = 'iso, mdy'
          timezone = 'UTC'
          lc_messages = 'en_US.UTF-8'
          lc_monetary = 'en_US.UTF-8'
          lc_numeric = 'en_US.UTF-8'
          lc_time = 'en_US.UTF-8'
          default_text_search_config = 'pg_catalog.english'
        '';

        # MongoDB config
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

        # Redis config
        redisConf = pkgs.writeText "redis.conf" ''
          port 6379
          bind 127.0.0.1
          dir ./.data/redis
          save ""
        '';

        # Setup script to initialize data directories and services
        setupScript = pkgs.writeShellScriptBin "heatflask-setup" ''
          set -e

          echo "Setting up Heatflask development environment..."

          # Create data directories
          mkdir -p .data/{postgresql,mongodb,redis}

          # Initialize PostgreSQL if needed
          if [ ! -d ".data/postgresql/base" ]; then
            echo "Initializing PostgreSQL database..."
            ${pkgs.postgresql_17}/bin/initdb -D .data/postgresql
            cp ${postgresConf} .data/postgresql/postgresql.conf
          fi

          # Setup Python virtual environment
          if [ ! -d ".venv" ]; then
            echo "Creating Python virtual environment..."
            python -m venv .venv
            echo "Installing Python dependencies..."
            source .venv/bin/activate
            pip install --upgrade pip setuptools wheel

            # Install from requirements files based on what exists
            if [ -f "backend/requirements.txt" ]; then
              echo "Installing backend dependencies (Sanic)..."
              pip install -r backend/requirements.txt
              pip install -r backend/requirements-dev.txt 2>/dev/null || true
            elif [ -f "requirements.txt" ]; then
              echo "Installing dependencies (Flask)..."
              pip install -r requirements.txt
              pip install -r requirements-dev.txt 2>/dev/null || true
            fi

            deactivate
          fi

          echo "Setup complete!"
          echo ""
          echo "To start services, run:"
          echo "  heatflask-start-services"
          echo ""
          echo "To stop services, run:"
          echo "  heatflask-stop-services"
        '';

        # Start services script
        startServicesScript = pkgs.writeShellScriptBin "heatflask-start-services" ''
          set -e

          echo "Starting services..."

          # Start PostgreSQL
          if [ ! -f ".data/postgresql/postmaster.pid" ]; then
            echo "Starting PostgreSQL..."
            ${pkgs.postgresql_17}/bin/pg_ctl -D .data/postgresql -l .data/postgresql/logfile start
            sleep 2

            # Create database if it doesn't exist
            ${pkgs.postgresql_17}/bin/psql -h localhost -d postgres -c "SELECT 1 FROM pg_database WHERE datname = 'heatflask';" | grep -q 1 || \
              ${pkgs.postgresql_17}/bin/createdb -h localhost heatflask
          else
            echo "PostgreSQL already running"
          fi

          # Start MongoDB
          if ! pgrep -f "mongod.*\.data/mongodb" > /dev/null; then
            echo "Starting MongoDB..."
            ${pkgs.mongodb}/bin/mongod --config ${mongoConf} --fork
            sleep 2
          else
            echo "MongoDB already running"
          fi

          # Start Redis
          if ! pgrep -f "redis-server.*6379" > /dev/null; then
            echo "Starting Redis..."
            ${pkgs.redis}/bin/redis-server ${redisConf} --daemonize yes
            sleep 1
          else
            echo "Redis already running"
          fi

          echo ""
          echo "All services started!"
          echo ""
          echo "PostgreSQL: localhost:5432 (database: heatflask)"
          echo "MongoDB:    localhost:27017"
          echo "Redis:      localhost:6379"
          echo ""
          echo "To stop services: heatflask-stop-services"
        '';

        # Stop services script
        stopServicesScript = pkgs.writeShellScriptBin "heatflask-stop-services" ''
          echo "Stopping services..."

          # Stop PostgreSQL
          if [ -f ".data/postgresql/postmaster.pid" ]; then
            echo "Stopping PostgreSQL..."
            ${pkgs.postgresql_17}/bin/pg_ctl -D .data/postgresql stop
          fi

          # Stop MongoDB
          if pgrep -f "mongod.*\.data/mongodb" > /dev/null; then
            echo "Stopping MongoDB..."
            ${pkgs.mongodb}/bin/mongosh --eval "db.adminCommand({ shutdown: 1 })" 2>/dev/null || pkill -f "mongod.*\.data/mongodb"
          fi

          # Stop Redis
          if pgrep -f "redis-server.*6379" > /dev/null; then
            echo "Stopping Redis..."
            ${pkgs.redis}/bin/redis-cli shutdown 2>/dev/null || pkill -f "redis-server.*6379"
          fi

          echo "All services stopped!"
        '';

        # Run app script (detects Flask vs Sanic)
        runAppScript = pkgs.writeShellScriptBin "heatflask-run" ''
          echo "Starting Heatflask web application..."
          echo ""

          # Check if venv exists
          if [ ! -d ".venv" ]; then
            echo "ERROR: Python virtual environment not found. Run 'heatflask-setup' first."
            exit 1
          fi

          # Activate virtual environment
          source .venv/bin/activate

          # Check if services are running
          SERVICES_OK=true

          if ! ${pkgs.postgresql_17}/bin/pg_isready -h localhost -p 5432 > /dev/null 2>&1; then
            echo "WARNING: PostgreSQL is not running. Some features may not work."
            echo "         Run 'heatflask-start-services' to start all services."
          fi

          if ! ${pkgs.redis}/bin/redis-cli ping > /dev/null 2>&1; then
            echo "WARNING: Redis is not running. Some features may not work."
            echo "         Run 'heatflask-start-services' to start all services."
          fi

          if ! ${pkgs.mongodb}/bin/mongosh --eval "db.version()" > /dev/null 2>&1; then
            echo "WARNING: MongoDB is not running. Some features may not work."
            echo "         Run 'heatflask-start-services' to start all services."
          fi

          # Set environment variables if not set
          export APP_SETTINGS=''${APP_SETTINGS:-config.DevelopmentConfig}
          export DATABASE_URL=''${DATABASE_URL:-postgresql://localhost/heatflask}
          export MONGO_URI=''${MONGO_URI:-mongodb://localhost:27017/heatflask}
          export REDIS_URL=''${REDIS_URL:-redis://localhost:6379}

          echo ""
          echo "Environment configured:"
          echo "  APP_SETTINGS: $APP_SETTINGS"
          echo "  DATABASE_URL: $DATABASE_URL"
          echo "  MONGO_URI: $MONGO_URI"
          echo "  REDIS_URL: $REDIS_URL"
          echo ""

          # Detect which framework to use
          if [ -f "backend/heatflask/webserver/serve.py" ] || python -c "import sanic" 2>/dev/null; then
            echo "Detected Sanic backend"
            if [ -f "backend/dev-run" ]; then
              echo "Using backend/dev-run script"
              cd backend && exec ./dev-run "''${@}"
            else
              echo "Running Sanic directly..."
              cd backend 2>/dev/null || true
              exec python -m heatflask.webserver.serve "''${@}"
            fi
          elif [ -f "wsgi.py" ]; then
            echo "Detected Flask backend (gunicorn)"
            exec gunicorn wsgi:app \
              --worker-class flask_sockets.worker \
              --timeout 20 \
              --log-level=debug \
              --reload \
              "''${@}"
          else
            echo "ERROR: Could not detect application type (Flask or Sanic)"
            echo "       Make sure you're in the correct directory"
            exit 1
          fi
        '';

      in
      {
        devShells.default = pkgs.mkShell {
          buildInputs = with pkgs; [
            # Python with packages
            pythonEnv

            # Databases
            postgresql_17
            mongodb
            redis

            # Build tools and libraries for Python packages
            gcc
            gnumake
            pkg-config

            # Libraries needed for Python package compilation
            zlib
            openssl
            libffi
            readline
            ncurses

            # For numpy and scientific packages
            blas
            lapack
            gfortran

            # For psycopg2
            postgresql_17.lib

            # For hiredis (aioredis dependency)
            hiredis

            # Development utilities
            git
            tmux
            htop
            jq
            curl
            wget

            # Node.js for frontend assets
            nodejs_20

            # Helper scripts
            setupScript
            startServicesScript
            stopServicesScript
            runAppScript
          ];

          shellHook = ''
            echo "🔥 Heatflask Development Environment"
            echo "===================================="
            echo ""
            echo "Python:     $(python --version)"
            echo "PostgreSQL: $(postgres --version | head -n1)"
            echo "MongoDB:    $(mongod --version | head -n1)"
            echo "Redis:      $(redis-server --version)"
            echo "Node.js:    $(node --version)"
            echo ""
            echo "Available commands:"
            echo "  heatflask-setup           - Initialize data directories and databases"
            echo "  heatflask-start-services  - Start PostgreSQL, MongoDB, and Redis"
            echo "  heatflask-stop-services   - Stop all services"
            echo "  heatflask-run             - Run the web application (Flask or Sanic)"
            echo ""
            echo "Quick start:"
            echo "  1. heatflask-setup"
            echo "  2. heatflask-start-services"
            echo "  3. Configure your .env file with Strava API keys"
            echo "  4. heatflask-run"
            echo ""
            echo "Supported branches:"
            echo "  - master/main-fix: Flask + Gunicorn"
            echo "  - new-backend: Sanic async backend"
            echo "  - bundle: Flask + WASM frontend"
            echo ""

            # Add .data and .venv to gitignore if not already there
            if [ ! -f .gitignore ] || ! grep -q "^\.data/" .gitignore; then
              echo ".data/" >> .gitignore
            fi
            if [ ! -f .gitignore ] || ! grep -q "^\.venv/" .gitignore; then
              echo ".venv/" >> .gitignore
            fi

            # Create a sample .env if it doesn't exist
            if [ ! -f .env.sample ]; then
              cat > .env.sample << 'EOF'
# Heatflask Environment Configuration
APP_SETTINGS=config.DevelopmentConfig

# Database URLs (defaults are set by heatflask-run)
DATABASE_URL=postgresql://localhost/heatflask
MONGO_URI=mongodb://localhost:27017/heatflask
REDIS_URL=redis://localhost:6379

# Strava API (required - get from https://www.strava.com/settings/api)
STRAVA_CLIENT_ID=your_client_id_here
STRAVA_CLIENT_SECRET=your_client_secret_here

# Optional services
# IPSTACK_ACCESS_KEY=your_ipstack_key
# PAYPAL_CLIENT_ID=your_paypal_client_id
# PAYPAL_CLIENT_SECRET=your_paypal_secret
# MAPBOX_ACCESS_TOKEN=your_mapbox_token
EOF
              echo "Created .env.sample - copy to .env and configure"
            fi
          '';

          # Environment variables for PostgreSQL
          PGDATA = ".data/postgresql";
          PGHOST = "localhost";
          PGPORT = "5432";
          PGDATABASE = "heatflask";

          # Build environment variables for Python package compilation
          LDFLAGS = "-L${pkgs.lib.makeLibraryPath [
            pkgs.zlib
            pkgs.openssl
            pkgs.libffi
            pkgs.readline
            pkgs.ncurses
            pkgs.postgresql_17.lib
            pkgs.hiredis
          ]}";

          CPPFLAGS = "-I${pkgs.lib.makeIncludePath [
            "${pkgs.zlib.dev}/include"
            "${pkgs.openssl.dev}/include"
            "${pkgs.libffi.dev}/include"
            "${pkgs.readline.dev}/include"
            "${pkgs.ncurses.dev}/include"
            "${pkgs.postgresql_17}/include"
            "${pkgs.hiredis}/include"
          ]}";

          # Help Python find PostgreSQL for psycopg2
          LIBRARY_PATH = "${pkgs.lib.makeLibraryPath [
            pkgs.postgresql_17.lib
            pkgs.openssl
            pkgs.zlib
          ]}";

          # For hiredis Python bindings
          HIREDIS_LIBRARY_PATH = "${pkgs.hiredis}/lib";
          HIREDIS_INCLUDE_PATH = "${pkgs.hiredis}/include";
        };
      }
    );
}
