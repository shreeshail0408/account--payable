# PayFlow AP backend: Django + DRF served by gunicorn, with Tesseract and Poppler for invoice OCR.
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    OMP_THREAD_LIMIT=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends tesseract-ocr tesseract-ocr-eng poppler-utils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .
RUN useradd --create-home appuser && mkdir -p /app/media && chown -R appuser /app
USER appuser

EXPOSE 8000
CMD ["sh", "start.sh"]
