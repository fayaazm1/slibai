import os
import logging
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

logger = logging.getLogger(__name__)

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./slibai.db")

# SQLite is only a local fallback — it is wiped on every Render redeployment.
# If DATABASE_URL is not set in your deployment environment, all users will be
# lost on every redeploy. Set DATABASE_URL to your Supabase PostgreSQL URL.
if DATABASE_URL.startswith("sqlite"):
    logger.warning(
        "WARNING: Using SQLite fallback. "
        "Data will be lost on redeployment. "
        "Set the DATABASE_URL environment variable to your PostgreSQL URL."
    )
    engine = create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False},  # required for SQLite + FastAPI
    )
else:
    logger.info("Connected to PostgreSQL database.")
    engine = create_engine(
        DATABASE_URL,
        pool_pre_ping=True,   # drops stale connections before use — prevents signin failures after idle
        pool_size=5,
        max_overflow=10,
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
