# Jtap backend — FastAPI + SQLite
FROM python:3.12-slim

# Don't buffer stdout/stderr so `docker logs` / host dashboards show output live
ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

# DATA_DIR must point at a persistent volume on the host (e.g. /data).
# The SQLite DB (jtap.db) and uploads/ both live under it.
ENV DATA_DIR=/data

EXPOSE 8000

# $PORT is injected by Railway/Render/Fly; default 8000 for local docker runs.
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
