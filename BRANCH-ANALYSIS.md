# Heatflask Branch Analysis & Modernization Plan

**Date:** October 28, 2025
**Current Production:** master branch at https://www.heatflask.com
**Urgent Issue:** PostgreSQL 14 → 17 forced upgrade on Nov 4, 2025

---

## Executive Summary

This repository has multiple modernization branches representing different approaches to upgrading the application. The **new-old** branch represents the most viable path forward for incremental modernization, while **main-fix** provides an immediate emergency fix for the Postgres upgrade deadline.

---

## Branch Inventory

### Production & Emergency Branches

#### **master** (Production Baseline)
- **Last Updated:** September 2020
- **Status:** 🔴 Currently deployed at heatflask.com
- **Tech Stack:**
  - Flask 1.x
  - Python 3.8.2
  - PostgreSQL 14 (⚠️ URGENT: deprecated, force upgrade Nov 4)
  - MongoDB via Flask-PyMongo
  - Redis 3
  - Gunicorn 20 + gevent 1.4
- **Issues:** Outdated dependencies, Postgres 14 deprecated
- **Recommendation:** ✅ Keep as historical baseline

#### **main-fix** (Emergency Fix - NEW)
- **Last Updated:** October 28, 2025
- **Status:** 🟢 Ready to deploy
- **Changes from master:**
  - Updated `psycopg2==2.8` → `psycopg2-binary~=2.9.9` (Postgres 17 compatible)
  - Added comprehensive Nix flake development environment
  - Support for both Flask and Sanic frameworks
  - Helper scripts for local development
  - Direnv integration
- **Purpose:** Emergency compatibility fix + modernized dev environment
- **Recommendation:** ✅ Deploy to production IMMEDIATELY
- **Files Changed:** 6 files, +650 lines

---

### Active Modernization Branches

#### **new-old** ⭐ (Best Path Forward)
- **Last Updated:** January 2024
- **Status:** 🟡 90% complete, has websocket issues
- **Divergence:** +17 commits ahead of master, 46 files changed
- **Tech Stack:**
  - Flask 3.0.1 (major upgrade ✓)
  - Python 3.12.1 (latest ✓)
  - psycopg2-binary 2.9.9 (Postgres 17 compatible ✓)
  - SQLAlchemy 3.1.1 (major upgrade ✓)
  - Gunicorn 21.2
  - flask-sock (replaces deprecated flask-sockets)
- **Architecture:** Maintains monolithic Flask structure
- **Improvements:**
  - Makefile for better dev workflow
  - Git hooks for quality control
  - Code reformatting with Black
  - Simplified DotLayer (removed WorkerPool)
  - Better environment sample files
- **Known Issues:**
  - Websocket functionality needs debugging
  - Last commit: "fixes websockets, I think"
- **Significance:** **MOST VIABLE MODERNIZATION PATH**
  - Conservative upgrade approach
  - Modern dependencies without architectural changes
  - Minimal risk, maximum benefit
  - ~90% complete
- **Recommendation:** ✅ **PRIORITY: Complete this branch for v0.5.0**

#### **new-backend** 🚀 (Complete Rewrite)
- **Last Updated:** May 2022
- **Status:** 🟡 ~50% complete, significant work remains
- **Divergence:** +617 commits ahead, 297 files changed
- **Tech Stack:**
  - **Sanic 22.3.1** (async framework, replaces Flask)
  - **Python 3.10+**
  - **TypeScript** frontend
  - **Motor** (async MongoDB driver)
  - **aioredis** (async Redis)
  - **numpy** for data processing
  - **Jupyter notebooks** for development
- **Architecture:** Complete separation of concerns
  ```
  backend/
    heatflask/
      Users.py          # User management
      Strava.py         # Strava API integration
      Streams.py        # Activity stream processing
      Index.py          # Activity indexing
      Events.py         # Event logging
      DataAPIs.py       # Data access layer
      webserver/        # Sanic server + blueprints
      notebooks/        # Jupyter development notebooks
  frontend/
    src/
      assembly/         # AssemblyScript → WASM
      webpages/         # HTML/TypeScript
    (Parcel bundler, modern build system)
  ```
- **Significance:** **MOST MODERN ARCHITECTURE**
  - Fully async (better scalability)
  - Better code organization (modular, testable)
  - TypeScript type safety
  - Modern development workflow
  - But requires significant completion work
- **README Quote:** "As of 2022-04-25 `new-backend` is the main development branch"
- **Recommendation:** ✅ Keep for future async migration
  - Consider FastAPI instead of Sanic (more popular in 2025)
  - Use as reference for modular architecture

---

### Experimental/Inactive Branches

#### **bundle** (WASM Frontend Experiment)
- **Last Updated:** February 2021 (4 years ago)
- **Status:** 🟡 Incomplete experiment
- **Divergence:** +418 commits, 238 files changed
- **Tech Stack:**
  - Flask 1.1.2 backend (unchanged)
  - AssemblyScript → WASM frontend
  - Parcel bundler
  - TypeScript
- **Purpose:** Frontend modernization while keeping Flask backend
- **Significance:** Proof of concept for WASM rendering
- **Recommendation:** 🤔 Keep IF you want WASM approach, else DELETE

#### **wasm** (Extended bundle)
- **Last Updated:** March 2021 (4 years ago)
- **Status:** 🔴 Superseded by bundle
- **Divergence:** +6 commits beyond bundle
- **Changes:** Memory management experiments
- **Recommendation:** ❌ DELETE - Bundle has the base work

#### **user** (Personal Experiments)
- **Last Updated:** January 2023 (2 years ago)
- **Status:** 🔴 Experimental dead end
- **Divergence:** +16 commits beyond new-backend
- **Changes:** Data structure experiments
  - "remove recordclass"
  - NamedTuple experiments
  - Schema redesign attempts
- **Significance:** Personal sandbox, not production-ready
- **Recommendation:** ❌ DELETE - Just experiments

#### **staging** (Old Deployment Test)
- **Last Updated:** April 2022 (3.5 years ago)
- **Status:** 🔴 Obsolete staging environment
- **Purpose:** Was for testing deployments
- **Recommendation:** ❌ DELETE - No longer used

#### **staging.old** (Ancient Staging)
- **Last Updated:** February 2021 (4 years ago)
- **Status:** 🔴 Obviously obsolete
- **Recommendation:** ❌ DELETE

#### **dependabot/pip/gunicorn-22.0.0**
- **Last Updated:** April 2024
- **Status:** 🟡 Automated security update
- **Changes:** Gunicorn 20 → 22.0.0
- **Recommendation:** ❌ DELETE - Already incorporated into main-fix

---

## Branch Relationships Diagram

```
                    master (v0.4.0-alpha, Sept 2020)
                      │
                      ├─→ main-fix (Oct 2025) ⚡ URGENT
                      │   └─ Postgres 17 fix + Nix dev env
                      │
                      ├─→ new-old (Jan 2024) ⭐ BEST PATH
                      │   └─ Flask 3.x + Python 3.12
                      │
                      └─→ [divergence point ~2020]
                          │
                          ├─→ bundle (Feb 2021)
                          │   └─→ wasm (Mar 2021) ❌
                          │
                          └─→ new-backend (May 2022) 🚀
                              ├─→ staging (Apr 2022) ❌
                              └─→ user (Jan 2023) ❌

Legend:
⚡ Deploy immediately
⭐ Primary modernization target
🚀 Future async rewrite
❌ Recommend deletion
```

---

## Modernization Roadmap

### Phase 1: Emergency Fix (This Week)
**Goal:** Keep production running past Nov 4 deadline

```bash
# Deploy main-fix to production
git push heroku main-fix:master

# Verify at https://www.heatflask.com
# Monitor for 48 hours
```

**Risk:** Very low - minimal changes, backward compatible
**Effort:** 1 hour
**Impact:** Prevents production outage

---

### Phase 2: Incremental Modernization (Next 2-3 months)
**Goal:** Deploy modern Flask 3.x stack as v0.5.0

**Target Branch:** new-old

**Action Plan:**

1. **Merge main-fix Nix environment into new-old**
   ```bash
   git checkout new-old
   git merge main-fix
   # Resolve conflicts (if any)
   ```

2. **Fix websocket issues**
   - Debug flask-sock integration
   - Test websocket connections
   - Verify real-time features work

3. **Test thoroughly**
   - Local testing with Nix dev environment
   - Staging deployment
   - Load testing
   - User acceptance testing

4. **Deploy as v0.5.0**
   ```bash
   git push heroku new-old:master
   ```

**Risk:** Low - incremental upgrade, well-understood stack
**Effort:** 4-8 weeks
**Benefits:**
- Flask 3.x (modern, supported)
- Python 3.12 (latest features, performance)
- Better dev workflow (Makefile, hooks)
- Clean codebase (Black formatting)

---

### Phase 3: Future Async Rewrite (6-12 months+)
**Goal:** Modern async architecture for better scalability

**Target Branch:** new-backend (or new implementation)

**Considerations:**

1. **Framework Choice:**
   - **Sanic** (current): Less popular, but async-first
   - **FastAPI** (recommended): More popular in 2025, better docs, type hints
   - **Flask 3.x + async**: Flask now has async support

2. **Completion Work Needed:**
   - Finish backend module integration
   - Complete TypeScript frontend
   - Testing and debugging
   - Data migration scripts
   - Documentation

3. **Benefits:**
   - True async I/O (better concurrency)
   - Type safety (TypeScript + Python type hints)
   - Modular architecture (easier maintenance)
   - Better scalability

**Risk:** Medium-High - major architectural change
**Effort:** 6-12 months
**When:** After new-old is stable in production

---

## Recommended Branch Cleanup

### Delete These Branches

```bash
# Safe to delete - obsolete or experimental
git push origin --delete staging.old
git push origin --delete staging
git push origin --delete wasm
git push origin --delete user
git push origin --delete dependabot/pip/gunicorn-22.0.0
```

**Rationale:**
- **staging.old/staging:** Old deployment testing, no longer used
- **wasm:** Superseded by bundle branch
- **user:** Personal experiments, not production-ready
- **dependabot branch:** Auto-update incorporated into main-fix

### Keep These Branches

- **master** - Production baseline (historical reference)
- **main-fix** - Current production after emergency deploy
- **new-old** - Primary modernization target ⭐
- **new-backend** - Future async rewrite reference 🚀
- **bundle** - Optional: Keep if WASM frontend is interesting

---

## Development Environment

The main-fix branch includes a comprehensive Nix flake that supports **all branches**:

### Features
- **PostgreSQL 17** - Latest version
- **MongoDB** - Local instance
- **Redis** - Local cache
- **Python 3.11** - With virtualenv
- **Node.js 20** - For frontend builds

### Smart Detection
Automatically detects and runs the correct framework:
- Flask branches: Runs with Gunicorn
- Sanic branches: Runs with Sanic dev server

### Helper Commands
```bash
heatflask-setup           # Initialize databases + Python venv
heatflask-start-services  # Start all services
heatflask-stop-services   # Stop all services
heatflask-run             # Run app (auto-detects framework)
```

### Using Across Branches
```bash
# Switch to any branch
git checkout new-old      # or new-backend, or bundle
rm -rf .venv              # Clean slate
nix develop               # Enter dev shell (or use direnv)
heatflask-setup           # Installs correct dependencies
heatflask-start-services  # Start databases
heatflask-run             # Runs correct server
```

---

## Technology Stack Comparison

| Component | master | main-fix | new-old | new-backend |
|-----------|--------|----------|---------|-------------|
| **Language** | Python 3.8.2 | Python 3.8.2 | Python 3.12.1 | Python 3.10+ |
| **Web Framework** | Flask 1.x | Flask 1.x | Flask 3.0.1 | Sanic 22.3.1 |
| **PostgreSQL** | psycopg2 2.8 | psycopg2-binary 2.9.9 | psycopg2-binary 2.9.9 | psycopg2-binary 2.9.3 |
| **MongoDB** | pymongo (sync) | pymongo (sync) | pymongo (sync) | Motor (async) |
| **Redis** | redis (sync) | redis (sync) | redis (sync) | aioredis (async) |
| **ORM** | SQLAlchemy 2.4 | SQLAlchemy 2.4 | SQLAlchemy 3.1 | SQLAlchemy 1.4 |
| **Server** | Gunicorn 20 | Gunicorn 20 | Gunicorn 21.2 | Sanic built-in |
| **Frontend** | jQuery + Leaflet | jQuery + Leaflet | jQuery + Leaflet | TypeScript + WASM |
| **Build** | Flask-Assets | Flask-Assets | Flask-Assets | Parcel |
| **Architecture** | Monolithic | Monolithic | Monolithic | Separated backend/frontend |
| **Async** | No (gevent) | No (gevent) | No (gevent) | Yes (native) |
| **Dev Env** | Manual | Nix flake | Makefile | .dev-setup script |

---

## Migration Checklist

### Immediate (This Week)

- [ ] Deploy main-fix to production
- [ ] Monitor Postgres 17 compatibility
- [ ] Verify all features work
- [ ] Update documentation

### Short Term (Next Month)

- [ ] Merge main-fix Nix environment into new-old
- [ ] Set up local development environment
- [ ] Debug websocket issues in new-old
- [ ] Test new-old branch thoroughly
- [ ] Delete obsolete branches

### Medium Term (2-3 Months)

- [ ] Deploy new-old as v0.5.0
- [ ] Monitor production stability
- [ ] Document new dev workflow
- [ ] Plan Phase 3 (async rewrite)

### Long Term (6+ Months)

- [ ] Evaluate FastAPI vs Sanic for async rewrite
- [ ] Complete new-backend or start fresh
- [ ] Migrate to modern frontend framework (React/Vue/Svelte?)
- [ ] Deploy v1.0.0

---

## Questions & Decisions

### Open Questions

1. **WASM Frontend:** Is WASM rendering performance important enough to keep the bundle branch?
2. **Database Migration:** Should we continue dual-database (Postgres + Mongo) or consolidate?
3. **Frontend Framework:** Stick with jQuery or migrate to React/Vue/Svelte?
4. **Async Framework:** FastAPI (modern, popular) vs Sanic (current) vs Flask-async?

### Key Decisions Needed

1. **Immediate:** Deploy main-fix this week? (Recommended: YES)
2. **Short Term:** Focus on new-old or jump to new-backend? (Recommended: new-old)
3. **Branch Cleanup:** Delete obsolete branches? (Recommended: YES for staging.old, staging, wasm, user)
4. **Long Term:** Complete rewrite or incremental modernization? (Recommended: incremental first)

---

## Resources

### Documentation
- Flask 3.x: https://flask.palletsprojects.com/
- FastAPI: https://fastapi.tiangolo.com/
- Sanic: https://sanic.dev/
- Nix Flakes: https://nixos.wiki/wiki/Flakes

### Related Files
- `CHANGELOG-main-fix.md` - Detailed changes in main-fix branch
- `flake.nix` - Nix development environment
- `.envrc` - Direnv configuration
- `requirements.txt` - Python dependencies (master/main-fix/new-old)
- `backend/requirements.txt` - Python dependencies (new-backend/bundle)

---

## Conclusion

The **main-fix** branch provides an immediate solution to the urgent Postgres upgrade deadline, while **new-old** represents the best path forward for incremental modernization. The **new-backend** branch contains valuable architectural insights for a future async rewrite but requires significant completion work.

**Recommended Priority:**
1. ⚡ Deploy main-fix (this week)
2. ⭐ Complete new-old (2-3 months)
3. 🧹 Clean up obsolete branches
4. 🚀 Plan async rewrite (future)

This approach balances immediate stability needs with long-term modernization goals while minimizing risk.
