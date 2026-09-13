# Heatflask, as one container: the frontend is built in the first stage and
# only its output is copied into the second, which runs the Sanic backend.
#
#   docker build -t heatflask .
#   docker run -p 8000:8000 --env-file heatflask.env heatflask
#
# The container needs, at least:
#   MONGODB_URL            mongodb+srv://... (the app has no other datastore)
#   STRAVA_CLIENT_ID       from the Strava app registration
#   STRAVA_CLIENT_SECRET
#   SESSION_SECRET         a long random string; signs session cookies
#   SERVER_NAME            https://www.heatflask.com, or wherever it is served
# APP_ENV defaults to production here, and PORT to 8000.
#
# Nothing in it is specific to a host: it runs the same on a VPS, Fly.io,
# Render, or Heroku's container stack.

# ---- frontend ----------------------------------------------------------------
FROM node:22-bookworm AS frontend

WORKDIR /app/frontend

# Dependencies first, so editing source does not reinstall them. The workspace
# plugin under src/ has to be present for npm ci to link it. (The full node
# image rather than -slim: leaflet-areaselect installs from GitHub and needs
# git.)
#
# --ignore-scripts, as in the Nix dev loop: Parcel's native modules ship
# prebuilt binaries. knob is installed from a GitHub tarball rather than a git
# URL because npm always runs a git dependency's prepare script, whatever
# --ignore-scripts says, and knob's runs its own Parcel 2.5, whose lmdb has no
# build for current Node. Its dist/ is committed, so the tarball has everything.
COPY frontend/package.json frontend/package-lock.json ./
COPY frontend/src/parcel-namer-flat ./src/parcel-namer-flat
RUN npm ci --ignore-scripts --no-audit --no-fund

COPY frontend/ ./
RUN mkdir -p dist && npm run build

# ---- backend -----------------------------------------------------------------
FROM python:3.13-slim-bookworm

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    APP_ENV=production \
    PORT=8000

WORKDIR /app/backend

COPY backend/requirements.txt ./
RUN pip install -r requirements.txt

COPY backend/heatflask ./heatflask
# files.py serves templates and assets from ../frontend/dist
COPY --from=frontend /app/frontend/dist /app/frontend/dist

RUN useradd --system --home /app heatflask
USER heatflask

EXPOSE 8000
CMD ["python", "-m", "heatflask.webserver.serve"]
