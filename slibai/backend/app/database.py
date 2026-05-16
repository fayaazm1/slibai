"""
Creates the SQLAlchemy engine and session factory — everything that needs database
access imports get_db from here. Lives as its own file so all connection configuration
is in one place: if we ever swap Supabase for another provider the pool settings and
URL are only in this file. The engine branches on DATABASE_URL at startup — SQLite for
local development, PostgreSQL for everything else. Pool settings are sized specifically
around the Supabase free tier's 20-connection ceiling, so changing them without
checking that limit first will cause connection errors under concurrent load.
"""
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
        # Render free tier drops idle database connections after roughly 5 minutes
        # of inactivity. Without pre_ping the first request after any quiet period
        # throws a stale-connection error. The tiny overhead on the first query is
        # worth completely eliminating those errors.
        pool_pre_ping=True,   # test connections before use so we don't get errors after idle time
        # Sized for the expected classroom demo load of 25-30 concurrent users.
        # Supabase free tier caps at 20 total connections, so pool_size=5 with
        # overflow=10 keeps us well under that ceiling while still absorbing spikes.
        pool_size=5,
        max_overflow=10,
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    """
    FastAPI dependency that yields a database session for the duration of a request.

    The try/finally guarantees the session is always closed and returned to the pool
    even if the route handler raises an exception — without this, a failed request
    would leak a connection and eventually exhaust the pool.

    Yields:
        Session: Active SQLAlchemy session. Callers should not close it themselves;
            the finally block handles that.

    Note:
        Used as a FastAPI dependency via Depends(get_db) in routes that need DB access.
        Each request gets its own session — sessions are not shared across requests.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
