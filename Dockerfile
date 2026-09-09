FROM python:3.11-slim

# ffmpeg is not included in the base image, install it explicitly
RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY render.py .
COPY server.py .
COPY sfx/ ./sfx/

# Cloud Run sends traffic to whatever port is in $PORT (defaults to 8080)
ENV PORT=8080
EXPOSE 8080

CMD ["python", "server.py"]
