"""Tests for authentication endpoints."""

import uuid


def test_login_default_user(client):
    """Default admin user should be created on startup and able to login."""
    resp = client.post("/api/v1/auth/login", json={
        "username": "admin",
        "password": "admin123",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"


def test_login_invalid_password(client):
    resp = client.post("/api/v1/auth/login", json={
        "username": "admin",
        "password": "wrong",
    })
    assert resp.status_code == 401


def test_login_nonexistent_user(client):
    resp = client.post("/api/v1/auth/login", json={
        "username": "nobody",
        "password": "whatever",
    })
    assert resp.status_code == 401


def test_register_user(client):
    uname = f"user_{uuid.uuid4().hex[:8]}"
    resp = client.post("/api/v1/auth/register", json={
        "username": uname,
        "password": "newpass123",
        "email": f"{uname}@test.com",
        "display_name": "New User",
    })
    assert resp.status_code == 201, f"Expected 201, got {resp.status_code}: {resp.text}"
    data = resp.json()
    assert "access_token" in data
    assert data["username"] == uname


def test_register_duplicate_username(client):
    client.post("/api/v1/auth/register", json={
        "username": "dupe",
        "password": "pass123456",
    })
    resp = client.post("/api/v1/auth/register", json={
        "username": "dupe",
        "password": "pass123456",
    })
    assert resp.status_code == 409


def test_register_short_password(client):
    resp = client.post("/api/v1/auth/register", json={
        "username": "user2",
        "password": "12345",
    })
    assert resp.status_code == 422


def test_register_short_username(client):
    resp = client.post("/api/v1/auth/register", json={
        "username": "ab",
        "password": "123456",
    })
    assert resp.status_code == 422
