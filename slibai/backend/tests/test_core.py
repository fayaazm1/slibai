# SLIBai core tests — hits the main endpoints to make sure nothing is obviously broken.
# tools, auth, admin, compare, scan, and research all get checked here.

import os
# must be set before any app imports so the model picks JSON (SQLite) not JSONB (Postgres)
os.environ["DATABASE_URL"] = "sqlite:///./test_slibai.db"
# keep tools reading from the JSON file — no need to seed the DB for tool tests
os.environ["USE_DB_FOR_TOOLS"] = "false"

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.database import Base, get_db


TEST_DATABASE_URL = "sqlite:///./test_slibai.db"

engine = create_engine(
    TEST_DATABASE_URL, connect_args={"check_same_thread": False}
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def override_get_db():
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db

client = TestClient(app)


# wipe and rebuild tables before every test so nothing bleeds between runs

@pytest.fixture(autouse=True)
def reset_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


def _register(email="user@test.com", password="password123", name="Test User"):
    return client.post("/auth/signup", json={
        "email": email,
        "name": name,
        "password": password,
    })


def _token(email="user@test.com", password="password123"):
    res = _register(email, password)
    return res.json()["access_token"]


# --- tools ---

class TestTools:

    def test_get_all_tools_returns_list(self):
        res = client.get("/tools/")
        assert res.status_code == 200
        data = res.json()
        assert isinstance(data, list)
        assert len(data) > 0

    def test_search_exact_tensorflow(self):
        res = client.get("/tools/search?q=TensorFlow")
        assert res.status_code == 200
        data = res.json()
        assert "results" in data
        assert len(data["results"]) > 0

    def test_search_fuzzy_tensorflo(self):
        # typo on purpose — fuzzy search should still find something
        res = client.get("/tools/search?q=tensorflo")
        assert res.status_code == 200

    def test_search_no_results_for_garbage(self):
        res = client.get("/tools/search?q=xyznotreal123")
        assert res.status_code == 200
        data = res.json()
        assert data["total_results"] == 0

    def test_search_returns_200_for_any_query(self):
        res = client.get("/tools/search?q=pytorch")
        assert res.status_code == 200
        data = res.json()
        assert "results" in data
        assert isinstance(data["results"], list)


# --- compare ---

class TestCompare:

    def test_compare_valid_ids(self):
        # grab two real IDs from the JSON data and compare them
        all_tools = client.get("/tools/").json()
        assert len(all_tools) >= 2
        id1, id2 = all_tools[0]["id"], all_tools[1]["id"]
        res = client.get(f"/tools/compare?ids={id1},{id2}")
        assert res.status_code == 200
        data = res.json()
        assert isinstance(data, list)
        assert len(data) == 2

    def test_compare_single_tool(self):
        all_tools = client.get("/tools/").json()
        id1 = all_tools[0]["id"]
        res = client.get(f"/tools/compare?ids={id1}")
        assert res.status_code == 200
        assert len(res.json()) == 1

    def test_compare_nonexistent_id_returns_404(self):
        res = client.get("/tools/compare?ids=999999")
        assert res.status_code == 404

    def test_category_stats_returns_data(self):
        res = client.get("/tools/stats/categories")
        assert res.status_code == 200
        assert isinstance(res.json(), list)


# --- auth ---

class TestAuth:

    def test_signup_success(self):
        res = _register()
        assert res.status_code == 201
        data = res.json()
        assert "access_token" in data
        assert data["user"]["email"] == "user@test.com"

    def test_signup_duplicate_email_rejected(self):
        _register()
        res = _register()  # try signing up again with the same email
        assert res.status_code == 400

    def test_signin_success(self):
        _register()
        res = client.post("/auth/signin", json={
            "email": "user@test.com",
            "password": "password123",
        })
        assert res.status_code == 200
        assert "access_token" in res.json()

    def test_signin_wrong_password_returns_401(self):
        _register()
        res = client.post("/auth/signin", json={
            "email": "user@test.com",
            "password": "wrongpassword",
        })
        assert res.status_code == 401

    def test_signin_unknown_email_returns_401(self):
        res = client.post("/auth/signin", json={
            "email": "nobody@test.com",
            "password": "password123",
        })
        assert res.status_code == 401

    def test_me_with_valid_token(self):
        token = _token()
        res = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert res.status_code == 200
        assert res.json()["email"] == "user@test.com"

    def test_me_without_token_returns_401(self):
        res = client.get("/auth/me")
        assert res.status_code == 401

    def test_me_with_invalid_token_returns_401(self):
        res = client.get("/auth/me", headers={"Authorization": "Bearer invalidtoken"})
        assert res.status_code == 401


# --- admin ---

class TestAdmin:

    def test_list_users_no_token_returns_401(self):
        res = client.get("/admin/users")
        assert res.status_code == 401

    def test_list_users_non_admin_returns_403(self):
        # register admin first, then a regular user and confirm they can't see the user list
        _register("admin@test.com", "password123", "Admin")
        token = _token("regular@test.com", "password123")
        res = client.get("/admin/users", headers={"Authorization": f"Bearer {token}"})
        assert res.status_code == 403

    def test_list_users_as_admin_succeeds(self):
        # whoever signs up first gets admin automatically
        token = _token("admin@test.com", "password123")
        res = client.get("/admin/users", headers={"Authorization": f"Bearer {token}"})
        assert res.status_code == 200
        assert isinstance(res.json(), list)


# --- scan ---

class TestScan:

    def test_scan_missing_repo_param_returns_422(self):
        # scan is a POST — missing body should give 422
        res = client.post("/scan", json={})
        assert res.status_code == 422

    def test_scan_invalid_repo_format_returns_400(self):
        # repo_url must contain github.com/owner/repo — plain text fails validation
        res = client.post("/scan", json={"repo_url": "notavalidrepo"})
        assert res.status_code == 400

    def test_scan_returns_200_structure(self):
        # this one hits GitHub for real, just checking the response has the right keys
        res = client.post("/scan", json={"repo_url": "https://github.com/huggingface/transformers"})
        assert res.status_code == 200
        data = res.json()
        assert "matched" in data
        assert "not_matched" in data
        assert isinstance(data["matched"], list)
        assert isinstance(data["not_matched"], list)


# --- research / AI insights ---

class TestResearch:

    def test_summary_returns_200(self):
        res = client.get("/research/summary")
        assert res.status_code == 200
        data = res.json()
        # summary returns scan metadata — just check a few expected keys
        assert "repos_scanned" in data or "detail" in data

    def test_top_libraries_returns_200(self):
        res = client.get("/research/top-libraries")
        assert res.status_code == 200
        data = res.json()
        # returns {"data": [...], "total_results": N, "note": "..."}
        assert "data" in data or "detail" in data
        if "data" in data:
            assert isinstance(data["data"], list)

    def test_top_libraries_custom_limit(self):
        res = client.get("/research/top-libraries?limit=5")
        assert res.status_code == 200

    def test_category_breakdown_returns_200(self):
        res = client.get("/research/category-breakdown")
        assert res.status_code == 200

    def test_run_scan_no_token_returns_401(self):
        res = client.post("/research/run-scan")
        assert res.status_code == 401

    def test_run_scan_non_admin_returns_403(self):
        _register("admin@test.com", "password123", "Admin")
        token = _token("regular@test.com", "password123")
        res = client.post(
            "/research/run-scan",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res.status_code == 403
