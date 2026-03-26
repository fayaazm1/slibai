from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from apscheduler.schedulers.background import BackgroundScheduler

from app.routes.tools import router as tools_router
from app.routes.admin import router as admin_router
from app.crawler.runner import run_crawl


# ── Scheduler ──────────────────────────────────────────────────────────────────

_scheduler = BackgroundScheduler(timezone="UTC")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Run a crawl every 24 hours.  first_run=True fires one immediately at startup.
    _scheduler.add_job(
        run_crawl,
        trigger="interval",
        hours=24,
        id="daily_crawl",
        replace_existing=True,
    )
    _scheduler.start()
    print("[Scheduler] Daily crawl scheduled (every 24 h).")
    yield
    _scheduler.shutdown(wait=False)
    print("[Scheduler] Shut down.")


# ── App ────────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="SLIBAI Backend",
    description="Software Library Directory and Finder — AI",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(tools_router)
app.include_router(admin_router)


@app.get("/")
def root():
    return {"message": "SLIBAI backend is running"}
