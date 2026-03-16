# SLIBai — Software Library Directory & Finder: AI

> A capstone project for SENG 701 — A tool to help software engineers, managers, product owners, and designers find AI components and techniques used in building software products.

---

## Features

- **Search** — Fuzzy + partial search by name or function across 105+ AI tools
- **Detail View** — Full properties: version, developer, cost, license, compatibility, dependencies, social impacts
- **Side-by-Side Comparison** — Compare up to 4 tools at once
- **Statistics** — Visual charts by category, cost, developer, type, and release year
- **Code Examples** — Runnable example code for every tool in the library

---

## Tech Stack

| Layer    | Technology                          |
|----------|-------------------------------------|
| Backend  | Python 3.11+, FastAPI, Uvicorn      |
| Frontend | React 18, TypeScript, Vite          |
| Styling  | Tailwind CSS                        |
| Charts   | Recharts                            |
| HTTP     | Axios                               |

---

## Getting Started

### Backend
```bash
cd slibai/backend
pip install -r requirements.txt
python main.py
# Runs on http://localhost:8000
```

### Frontend
```bash
cd slibai/frontend
npm install
npm run dev
# Runs on http://localhost:5173
```

---

## API Endpoints

| Method | Endpoint                  | Description                     |
|--------|---------------------------|---------------------------------|
| GET    | `/api/tools`              | List all tools (filterable)     |
| GET    | `/api/tools/{id}`         | Get a single tool               |
| GET    | `/api/search?q=`          | Fuzzy search                    |
| GET    | `/api/compare?ids=1,2,3`  | Compare multiple tools          |
| GET    | `/api/stats`              | Aggregated statistics           |
| GET    | `/api/categories`         | All unique categories           |
| GET    | `/api/code-example/{id}`  | Code example for a tool         |

---

## Library Size

105+ entries spanning: ML Frameworks, LLMs, NLP, Computer Vision, Generative AI, Speech/Audio, LLM Orchestration, Vector Databases, MLOps, Conversational AI, Reinforcement Learning, and Specialized tools.
