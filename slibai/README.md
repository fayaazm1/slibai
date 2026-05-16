# SLIBai — Software Library Directory & Finder: AI

A catalogue and discovery tool for AI/ML libraries, built as a graduate capstone project for SENG 701 at the University of Calgary. It lets engineers, designers, and product managers search, compare, and explore 160+ AI tools, scan a GitHub repo to detect which AI libraries it uses, and see real-world library usage trends collected from public repositories.

---

## Why it exists

Every AI project starts with the same question: which library should I actually use? The options are fragmented across blog posts, GitHub stars, and word of mouth. SLIBai pulls them into one place with structured metadata, an AI code generator, a scanner that detects the stack in any public repo, and usage statistics from real GitHub projects — so the answer is one search away instead of an hour of research.

---

## Live Demo

Deployed on Render (free tier). The backend cold-starts after inactivity — the app shows a "waking up" message and retries automatically, typically ready within 30 seconds.

Frontend: https://slibai.onrender.com  
Backend API: https://slibai-backend.onrender.com

---

## Tech Stack

| Layer           | Technology                                                           |
|-----------------|----------------------------------------------------------------------|
| Backend         | Python 3.11+, FastAPI, Uvicorn                                       |
| ORM / DB        | SQLAlchemy 2, PostgreSQL (Supabase), SQLite fallback for local dev   |
| Auth            | JWT (python-jose, HS256), bcrypt (12 rounds), OAuth2 via Starlette   |
| Background jobs | APScheduler (daily crawler), threading.Lock (crawl concurrency)      |
| Frontend        | React 18, TypeScript, Vite                                           |
| Styling         | Tailwind CSS                                                         |
| Charts          | Recharts                                                             |
| HTTP client     | Axios                                                                |
| AI features     | Google Gemini API (code generation + explanation)                    |
| Search          | difflib SequenceMatcher (fuzzy), TF-IDF-style scoring (exact + alias + fuzzy) |

---

## Architecture Overview

```
frontend/src/
  pages/          — Full-page route components (Home, Compare, Scan, Research, Admin, Profile, Stats)
  components/     — Shared UI components (Navbar, ToolCard, ToolDetailModal, CompareFloatBar, FilterBar)
  context/        — React Context providers (AuthContext, CompareContext, BookmarkContext)
  api/            — Axios wrappers for each backend domain (tools, auth, admin, scan, codegen, user, research)
  hooks/          — Custom hooks (useBackendHealth for Render cold-start detection)

backend/app/
  routes/         — FastAPI route modules (tools, auth, admin, scan, research, codegen, user)
  services/       — Business logic (tool_service: search/filter; research_service: GitHub scanning)
  auth/           — JWT utils, bcrypt helpers, OAuth handlers, password reset email
  crawler/        — Daily crawler (GitHub + HuggingFace) with merger writing to JSON and/or PostgreSQL
  models.py       — SQLAlchemy ORM models
  database.py     — Engine setup, session factory, pool tuning for Supabase free tier
  main.py         — App factory, lifespan, CORS, router registration
```

Two data paths exist for tools: a static `ai_tools.json` file and PostgreSQL, controlled by `USE_DB_FOR_TOOLS`. The crawler similarly writes to either or both via `USE_DB_FOR_CRAWLER_WRITES`. Both paths produce identical response shapes so route handlers don't care which is active.

---

## Local Setup

### Prerequisites

- Python 3.11+
- Node.js 18+
- A PostgreSQL database (or leave `DATABASE_URL` unset to fall back to SQLite)

### Backend

```bash
cd slibai/backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# Copy and fill in the environment variables below
cp .env.example .env

uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd slibai/frontend
npm install

# Set VITE_API_URL if the backend isn't on localhost:8000
echo "VITE_API_URL=http://localhost:8000" > .env

npm run dev
# Vite serves on http://localhost:5173
```

### Environment Variables

**Backend (`.env` in `slibai/backend/`)**

| Variable                    | Required | Description                                                         |
|-----------------------------|----------|---------------------------------------------------------------------|
| `DATABASE_URL`              | No       | PostgreSQL connection string. Falls back to SQLite if unset.        |
| `SECRET_KEY`                | Yes      | JWT signing secret. Generate with `openssl rand -hex 32`.           |
| `GOOGLE_CLIENT_ID`          | No       | Google OAuth2 client ID. OAuth disabled if unset.                   |
| `GOOGLE_CLIENT_SECRET`      | No       | Google OAuth2 client secret.                                        |
| `GITHUB_CLIENT_ID`          | No       | GitHub OAuth2 client ID.                                            |
| `GITHUB_CLIENT_SECRET`      | No       | GitHub OAuth2 client secret.                                        |
| `SMTP_HOST`                 | No       | SMTP server for password reset emails.                              |
| `SMTP_PORT`                 | No       | Defaults to 587 (STARTTLS).                                         |
| `SMTP_USER`                 | No       | SMTP login username.                                                |
| `SMTP_PASSWORD`             | No       | SMTP login password.                                                |
| `GEMINI_API_KEY`            | No       | Google Gemini API key. Code generation disabled if unset.           |
| `GITHUB_TOKEN`              | No       | GitHub personal access token. Raises crawler rate limit to 5000/hr. |
| `USE_DB_FOR_TOOLS`          | No       | Set to `true` to serve tool data from PostgreSQL instead of JSON.   |
| `USE_DB_FOR_CRAWLER_WRITES` | No       | Set to `true` to write crawler output to PostgreSQL.                |
| `FRONTEND_URL`              | No       | Used in OAuth redirect and password reset email links.              |

**Frontend (`.env` in `slibai/frontend/`)**

| Variable       | Required | Description                                           |
|----------------|----------|-------------------------------------------------------|
| `VITE_API_URL` | No       | Backend base URL. Defaults to `http://localhost:8000`.|

---

## Running Tests

```bash
cd slibai/backend
pytest tests/ -v
```

The test suite covers auth endpoints (signup, signin, JWT validation), tool search and filter logic, the repo scanner parser functions, and admin user management. Tests use a separate SQLite database and do not require any external services.

---

## Known Limitations

- **Render free tier cold starts.** The backend spins down after ~15 minutes of inactivity. First load after idle takes up to 30 seconds. The frontend handles this gracefully with a "waking up" message and automatic retry.
- **Supabase free tier connection cap.** The PostgreSQL pool is capped at pool_size=5, max_overflow=10 to stay within Supabase's 20-connection limit. Under heavy load this will queue requests rather than error, but response times will increase.
- **GitHub API rate limiting.** The repo scanner and research crawler are subject to GitHub's unauthenticated rate limit (60 req/hr) unless `GITHUB_TOKEN` is set, which raises it to 5000/hr. The scanner surfaces rate limit errors to the user with an estimated wait time.
- **AI code generation quality.** Gemini-generated code examples are illustrative, not production-ready. They may contain hallucinated method names for less well-known libraries.
- **Research scan data is sampled.** The AI Insights page reflects a sample of GitHub repositories filtered to those with 500+ stars, not a census. Results represent popular usage patterns, not the full ecosystem.
- **No real-time updates.** The catalogue updates once per day via the scheduled crawler. Newly released libraries won't appear until the next crawl runs and an admin approves any tool requests.

---

## Project Structure

```
slibai/
  backend/
    app/
      routes/         tools.py, auth.py, admin.py, admin_users.py, scan.py, research.py, codegen.py, user.py
      services/       tool_service.py (search/filter), research_service.py (GitHub data collection)
      auth/           jwt_utils.py, password.py, email.py, dependencies.py, oauth.py
      crawler/        crawler.py (fetch), merger.py (deduplicate + persist)
      models.py
      database.py
      main.py
    tests/
    ai_tools.json     Static tool catalogue (fallback when USE_DB_FOR_TOOLS is unset)
    requirements.txt
  frontend/
    src/
      pages/          Home Compare Stats Admin AdminReports AdminAllUsers AdminLibraries
                      AdminToolRequests Profile Scan Research SignIn SignUp
                      ForgotPassword ResetPassword
      components/     Navbar ToolCard ToolDetailModal CompareFloatBar FilterBar
                      CategoryChart ReportIssueModal
      context/        AuthContext CompareContext BookmarkContext
      api/            auth tools admin scan codegen user research
      hooks/          useBackendHealth
      utils/          avatars
      types/          tool
    index.html
    vite.config.ts
  README.md
```
