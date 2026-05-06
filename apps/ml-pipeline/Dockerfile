FROM python:3.12-slim
WORKDIR /usr/src/app

# Keep python from buffering stdout/stderr so logs appear immediately
ENV PYTHONUNBUFFERED=1
# Ensure Python can find local modules
ENV PYTHONPATH=/usr/src/app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt || true

COPY src/ ./src/

EXPOSE 8000
CMD ["python", "src/main.py"]
