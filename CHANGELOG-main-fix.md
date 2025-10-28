# Changelog - main-fix Branch

## Purpose
Emergency branch to maintain compatibility with Heroku's forced PostgreSQL upgrade from version 14 to 17 (scheduled for Nov 4, 2025).

## Changes

### Database Compatibility
- **Updated**: `psycopg2==2.8` → `psycopg2-binary~=2.9.9`
  - Adds support for PostgreSQL 9.6 through 17
  - Changed to `psycopg2-binary` for easier deployment on Heroku
  - Uses `~=` for patch-level flexibility (allows 2.9.x updates)

### Development Environment (New!)
Added modern Nix flake-based development environment with:

#### Infrastructure
- **PostgreSQL 17** - Latest version with local instance management
- **MongoDB** - Local instance with configuration
- **Redis** - Local instance with configuration
- **Python 3.11** - Modern Python with venv support
- **Node.js 20** - For frontend asset building

#### Multi-Framework Support
The dev environment supports both Flask and Sanic-based branches:
- **Flask** (master, main-fix, bundle) - Gunicorn with gevent workers
- **Sanic** (new-backend) - Async web framework with Motor/aioredis

#### Build Dependencies
Includes all system libraries needed for Python packages:
- **psycopg2-binary** - PostgreSQL adapter (with libpq)
- **numpy** - Scientific computing (with BLAS/LAPACK)
- **hiredis** - High-performance Redis protocol parser
- **Cython** - For compiled Python extensions

#### Helper Commands
```bash
heatflask-setup           # One-time setup: databases + Python venv
heatflask-start-services  # Start all services (Postgres, MongoDB, Redis)
heatflask-stop-services   # Stop all services
heatflask-run             # Run the application with auto-reload
```

#### Direnv Integration
- Automatic environment activation with `.envrc`
- Requires [direnv](https://direnv.net/) installed
- Run `direnv allow` once to enable

#### Smart Branch Detection
The `heatflask-run` command automatically detects which framework to use:
- Checks for Sanic backend → runs with Sanic dev server
- Falls back to Flask → runs with Gunicorn
- Uses `backend/dev-run` script if available on Sanic branches

#### File Structure
```
.data/              # Local database files (gitignored)
├── postgresql/     # Postgres data directory
├── mongodb/        # MongoDB data directory
└── redis/          # Redis data directory

.venv/              # Python virtual environment (gitignored)
flake.nix           # Nix development environment
flake.lock          # Locked dependency versions
.envrc              # Direnv configuration
```

## Quick Start (Nix)

```bash
# Enter the development shell (or use direnv)
nix develop

# One-time setup (creates databases + Python venv)
heatflask-setup

# Start services
heatflask-start-services

# Copy and configure environment
cp .env.sample .env
# Edit .env with your Strava API keys

# Run the app (auto-detects Flask or Sanic)
heatflask-run
```

### Using Different Branches

The same dev environment works for all branches:

```bash
# Flask (main-fix)
git checkout main-fix
nix develop
heatflask-setup  # Installs Flask dependencies
heatflask-start-services
heatflask-run    # Runs with Gunicorn

# Sanic (new-backend)
git checkout new-backend
rm -rf .venv  # Clean slate
nix develop
heatflask-setup  # Installs Sanic dependencies
heatflask-start-services
heatflask-run    # Runs with Sanic
```

## Quick Start (Traditional)

```bash
# Install Python dependencies
pip install -r requirements.txt

# Start external services (Postgres, MongoDB, Redis)
# Set environment variables
export DATABASE_URL=postgresql://localhost/heatflask
export MONGO_URI=mongodb://localhost:27017/heatflask
export REDIS_URL=redis://localhost:6379

# Run the app
gunicorn wsgi:app --worker-class flask_sockets.worker --reload
```

## Deployment to Heroku

No code changes required! The `psycopg2-binary` upgrade is backward compatible.

```bash
git push heroku main-fix:master
```

## Testing

The app should work identically to the master branch. Key compatibility points:
- PostgreSQL 14 → 17 (via psycopg2-binary 2.9.9)
- No application code changes
- All existing features maintained

## Future Considerations

This is a minimal maintenance branch. For major modernization, see:
- `new-old` branch - Flask 3.x upgrade
- `new-backend` branch - Async Sanic rewrite
- `bundle` branch - WASM frontend

## Notes

- Python version unchanged (3.8.2 in runtime.txt) for deployment stability
- Development environment uses Python 3.11 for better local experience
- All database data stored in `.data/` directory (gitignored)
- Services run locally without Docker for simplicity
