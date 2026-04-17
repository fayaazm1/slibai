import os
import logging
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

logger = logging.getLogger(__name__)

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./slibai.db")

# SQLite is just a local fallback — don't ship this to prod.
# Without DATABASE_URL set, everything gets wiped on restart.
if DATABASE_URL.startswith("sqlite"):
    logger.warning(
        "WARNING: Using SQLite fallback. "
        "Data will be lost on redeployment. "
        "Set the DATABASE_URL environment variable to your PostgreSQL URL."
    )
    engine = create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False},  # SQLite + FastAPI need this
    )
else:
    logger.info("Connected to PostgreSQL database.")
    engine = create_engine(
        DATABASE_URL,
        pool_pre_ping=True,   # test connections before use so we don't get errors after idle time
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
