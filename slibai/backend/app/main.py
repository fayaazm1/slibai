from contextlib import asynccontextmanager

from dotenv import load_dotenv
load_dotenv()  # loads backend/.env when running locally

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from apscheduler.schedulers.background import BackgroundScheduler

from app.database import engine, Base
import app.models.user      # noqa: F401
import app.models.bookmark  # noqa: F401
import app.models.activity  # noqa: F401
import app.models.use_case  # noqa: F401
import app.models.report    # noqa: F401
from app.routes.tools import router as tools_router
from app.routes.admin import router as admin_router
from app.routes.auth import router as auth_router
from app.routes.admin_users import router as admin_users_router
from app.routes.user import router as user_router
from app.routes.reports import router as reports_router
from app.routes.admin_reports import router as admin_reports_router
from app.routes.codegen import router as codegen_router
from app.crawler.runner import run_crawl


# background scheduler — runs the crawler once a day to keep tool data fresh
_scheduler = BackgroundScheduler(timezone="UTC")


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)  # create any missing tables on startup

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

app.include_router(auth_router)
app.include_router(tools_router)
app.include_router(admin_router)
app.include_router(admin_users_router)
app.include_router(user_router)
app.include_router(reports_router)
app.include_router(admin_reports_router)
app.include_router(codegen_router)


@app.get("/")
def root():
    return {"message": "SLIBAI backend is running"}
