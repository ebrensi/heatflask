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
        pythonEnv = pkgs.python311.withPackages (ps: with ps; [
          # Essential build/dev tools
          pip
          setuptools
          wheel
          virtualenv

          # Development tools
          black
          ipython
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
            pip install --upgrade pip
            pip install -r requirements.txt
            pip install -r requirements-dev.txt 2>/dev/null || true
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

        # Run app script
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
            echo "ERROR: PostgreSQL is not running. Run 'heatflask-start-services' first."
            SERVICES_OK=false
          fi

          if ! ${pkgs.redis}/bin/redis-cli ping > /dev/null 2>&1; then
            echo "ERROR: Redis is not running. Run 'heatflask-start-services' first."
            SERVICES_OK=false
          fi

          if ! ${pkgs.mongodb}/bin/mongosh --eval "db.version()" > /dev/null 2>&1; then
            echo "ERROR: MongoDB is not running. Run 'heatflask-start-services' first."
            SERVICES_OK=false
          fi

          if [ "$SERVICES_OK" = false ]; then
            exit 1
          fi

          # Set environment variables if not set
          export APP_SETTINGS=''${APP_SETTINGS:-config.DevelopmentConfig}
          export DATABASE_URL=''${DATABASE_URL:-postgresql://localhost/heatflask}
          export MONGO_URI=''${MONGO_URI:-mongodb://localhost:27017/heatflask}
          export REDIS_URL=''${REDIS_URL:-redis://localhost:6379}

          echo "Environment configured:"
          echo "  APP_SETTINGS: $APP_SETTINGS"
          echo "  DATABASE_URL: $DATABASE_URL"
          echo "  MONGO_URI: $MONGO_URI"
          echo "  REDIS_URL: $REDIS_URL"
          echo ""

          # Run with gunicorn
          exec gunicorn wsgi:app \
            --worker-class flask_sockets.worker \
            --timeout 20 \
            --log-level=debug \
            --reload \
            "''${@}"
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

            # Build tools
            gcc
            gnumake

            # Development utilities
            git
            tmux
            htop
            jq
            curl

            # Node.js for frontend assets (if needed)
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
            echo ""
            echo "Available commands:"
            echo "  heatflask-setup           - Initialize data directories and databases"
            echo "  heatflask-start-services  - Start PostgreSQL, MongoDB, and Redis"
            echo "  heatflask-stop-services   - Stop all services"
            echo "  heatflask-run             - Run the web application (after starting services)"
            echo ""
            echo "Quick start:"
            echo "  1. heatflask-setup"
            echo "  2. heatflask-start-services"
            echo "  3. Configure your .env file with Strava API keys"
            echo "  4. heatflask-run"
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

          # Environment variables
          PGDATA = ".data/postgresql";
          PGHOST = "localhost";
          PGPORT = "5432";
          PGDATABASE = "heatflask";
        };
      }
    );
}
