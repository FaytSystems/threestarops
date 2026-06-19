#!/usr/bin/env python3
"""
Chef Ledger Operational MVP — Render + Stripe Subscription v63
Path: chef-ledger-operational/server.py

A dependency-free SaaS-style backend for ThreeStarOps / Chef Ledger.
Local run: python server.py
Render run: PORT is detected automatically and the server binds to 0.0.0.0.
"""
from __future__ import annotations

import base64
import csv
import hashlib
import hmac
import html
import io
import json
import math
import mimetypes
import os
import secrets
import sqlite3
import sys
import time
import traceback
from datetime import datetime, timedelta, timezone
from http import HTTPStatus
from http.cookies import SimpleCookie
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

APP_ROOT = Path(__file__).resolve().parent
STATIC_ROOT = APP_ROOT / "static"
DATA_ROOT = APP_ROOT / "data"
UPLOAD_ROOT = DATA_ROOT / "uploads"
DB_PATH = DATA_ROOT / "chef_ledger.sqlite3"
PORT = int(os.environ.get("CHEF_LEDGER_PORT") or os.environ.get("PORT") or "8787")
HOST = os.environ.get("CHEF_LEDGER_HOST") or ("0.0.0.0" if os.environ.get("PORT") else "127.0.0.1")
SESSION_DAYS = 14

ROLE_ORDER = {
    "owner": 5,
    "chef": 4,
    "manager": 3,
    "team_leader": 2,
    "employee": 1,
}

WEIGHT_TO_GRAMS = {
    "g": 1.0,
    "gram": 1.0,
    "grams": 1.0,
    "kg": 1000.0,
    "kilogram": 1000.0,
    "kilograms": 1000.0,
    "oz": 28.349523125,
    "ounce": 28.349523125,
    "ounces": 28.349523125,
    "lb": 453.59237,
    "lbs": 453.59237,
    "pound": 453.59237,
    "pounds": 453.59237,
}

VOLUME_TO_ML = {
    "ml": 1.0,
    "milliliter": 1.0,
    "milliliters": 1.0,
    "l": 1000.0,
    "liter": 1000.0,
    "liters": 1000.0,
    "tsp": 4.92892159375,
    "teaspoon": 4.92892159375,
    "teaspoons": 4.92892159375,
    "tbsp": 14.78676478125,
    "tablespoon": 14.78676478125,
    "tablespoons": 14.78676478125,
    "cup": 236.5882365,
    "cups": 236.5882365,
    "pt": 473.176473,
    "pint": 473.176473,
    "pints": 473.176473,
    "qt": 946.352946,
    "quart": 946.352946,
    "quarts": 946.352946,
    "gal": 3785.411784,
    "gallon": 3785.411784,
    "gallons": 3785.411784,
    "fl oz": 29.5735295625,
    "floz": 29.5735295625,
    "fluid ounce": 29.5735295625,
    "fluid ounces": 29.5735295625,
}

COUNT_UNITS = {
    "ea", "each", "unit", "units", "piece", "pieces", "spear", "spears", "bunch", "bunches", "case", "cases", "can", "cans", "box", "boxes", "tray", "trays", "portion", "portions"
}

MEASURE_STEPS = {
    "cup": 0.125,
    "cups": 0.125,
    "tsp": 0.125,
    "teaspoon": 0.125,
    "teaspoons": 0.125,
    "tbsp": 1.0 / 3.0,
    "tablespoon": 1.0 / 3.0,
    "tablespoons": 1.0 / 3.0,
    "oz": 0.25,
    "ounce": 0.25,
    "ounces": 0.25,
    "lb": 0.125,
    "lbs": 0.125,
    "g": 1.0,
    "gram": 1.0,
    "grams": 1.0,
    "kg": 0.01,
    "ml": 5.0,
    "l": 0.01,
    "ea": 1.0,
    "each": 1.0,
    "spear": 1.0,
    "spears": 1.0,
}


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def today_iso() -> str:
    return datetime.now().date().isoformat()


def normalize_unit(unit: str | None) -> str:
    return (unit or "each").strip().lower()


def unit_family(unit: str | None) -> str:
    unit = normalize_unit(unit)
    if unit in WEIGHT_TO_GRAMS:
        return "weight"
    if unit in VOLUME_TO_ML:
        return "volume"
    if unit in COUNT_UNITS:
        return "count"
    return "unknown"


def convert_qty(qty: float, from_unit: str | None, to_unit: str | None) -> float | None:
    from_unit_n = normalize_unit(from_unit)
    to_unit_n = normalize_unit(to_unit)
    if from_unit_n == to_unit_n:
        return float(qty)
    if from_unit_n in WEIGHT_TO_GRAMS and to_unit_n in WEIGHT_TO_GRAMS:
        return float(qty) * WEIGHT_TO_GRAMS[from_unit_n] / WEIGHT_TO_GRAMS[to_unit_n]
    if from_unit_n in VOLUME_TO_ML and to_unit_n in VOLUME_TO_ML:
        return float(qty) * VOLUME_TO_ML[from_unit_n] / VOLUME_TO_ML[to_unit_n]
    if from_unit_n in COUNT_UNITS and to_unit_n in COUNT_UNITS:
        return float(qty)
    return None


def round_kitchen_measure(qty: float, unit: str | None) -> float:
    step = MEASURE_STEPS.get(normalize_unit(unit), 0.01)
    if step <= 0:
        return qty
    rounded = round(qty / step) * step
    if abs(rounded) < step:
        rounded = step if qty > 0 else 0.0
    return round(rounded, 4)


def db() -> sqlite3.Connection:
    DATA_ROOT.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def one(conn: sqlite3.Connection, sql: str, params: tuple = ()) -> sqlite3.Row | None:
    return conn.execute(sql, params).fetchone()


def all_rows(conn: sqlite3.Connection, sql: str, params: tuple = ()) -> list[sqlite3.Row]:
    return conn.execute(sql, params).fetchall()


def row_dict(row: sqlite3.Row | None) -> dict | None:
    if row is None:
        return None
    return {k: row[k] for k in row.keys()}


def rows_dict(rows: list[sqlite3.Row]) -> list[dict]:
    return [row_dict(r) for r in rows]


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    key = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 120_000)
    return base64.b64encode(salt + key).decode("ascii")


def verify_password(password: str, stored: str) -> bool:
    try:
        raw = base64.b64decode(stored.encode("ascii"))
        salt, key = raw[:16], raw[16:]
        new_key = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 120_000)
        return hmac.compare_digest(key, new_key)
    except Exception:
        return False


def make_code(length: int = 8) -> str:
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "".join(secrets.choice(alphabet) for _ in range(length))


def migrate() -> None:
    with db() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS teams (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                team_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                email TEXT NOT NULL COLLATE NOCASE,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'employee',
                station TEXT DEFAULT '',
                active INTEGER NOT NULL DEFAULT 1,
                days_off_allowed REAL NOT NULL DEFAULT 0,
                days_off_remaining REAL NOT NULL DEFAULT 0,
                days_off_reset_date TEXT DEFAULT '',
                days_off_rollover INTEGER NOT NULL DEFAULT 0,
                days_off_last_reset_at TEXT DEFAULT '',
                schedule_color TEXT DEFAULT '',
                qualified_stations TEXT DEFAULT '',
                eligible_shifts TEXT DEFAULT '',
                created_at TEXT NOT NULL,
                UNIQUE(team_id, email),
                FOREIGN KEY(team_id) REFERENCES teams(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS sessions (
                token TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL,
                expires_at TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS invites (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                team_id INTEGER NOT NULL,
                code TEXT NOT NULL UNIQUE,
                role TEXT NOT NULL DEFAULT 'employee',
                station TEXT DEFAULT '',
                expires_at TEXT NOT NULL,
                used_by INTEGER,
                used_at TEXT,
                created_by INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY(team_id) REFERENCES teams(id) ON DELETE CASCADE,
                FOREIGN KEY(used_by) REFERENCES users(id),
                FOREIGN KEY(created_by) REFERENCES users(id)
            );

            CREATE TABLE IF NOT EXISTS vendors (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                team_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                order_days TEXT DEFAULT '',
                delivery_days TEXT DEFAULT '',
                cutoff_time TEXT DEFAULT '',
                lead_days INTEGER NOT NULL DEFAULT 1,
                email TEXT DEFAULT '',
                phone TEXT DEFAULT '',
                notes TEXT DEFAULT '',
                employee_response TEXT NOT NULL DEFAULT 'pending',
                created_at TEXT NOT NULL,
                FOREIGN KEY(team_id) REFERENCES teams(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS stations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                team_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                station_type TEXT DEFAULT '',
                notes TEXT DEFAULT '',
                created_at TEXT NOT NULL,
                UNIQUE(team_id, name),
                FOREIGN KEY(team_id) REFERENCES teams(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS stock_locations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                team_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                subclass TEXT DEFAULT '',
                sort_order INTEGER NOT NULL DEFAULT 999,
                notes TEXT DEFAULT '',
                created_at TEXT NOT NULL,
                UNIQUE(team_id, name),
                FOREIGN KEY(team_id) REFERENCES teams(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS products (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                team_id INTEGER NOT NULL,
                vendor_id INTEGER,
                name TEXT NOT NULL,
                category TEXT DEFAULT '',
                unit TEXT NOT NULL DEFAULT 'each',
                current_qty REAL NOT NULL DEFAULT 0,
                par_level REAL NOT NULL DEFAULT 0,
                reorder_point REAL NOT NULL DEFAULT 0,
                package_qty REAL NOT NULL DEFAULT 1,
                package_unit TEXT NOT NULL DEFAULT 'each',
                package_price REAL NOT NULL DEFAULT 0,
                cost_per_unit REAL NOT NULL DEFAULT 0,
                shelf_life_days INTEGER NOT NULL DEFAULT 3,
                station TEXT DEFAULT '',
                stock_location TEXT DEFAULT '',
                stocked_where TEXT DEFAULT '',
                min_order_size REAL NOT NULL DEFAULT 1,
                units_per_min_order REAL NOT NULL DEFAULT 1,
                notes TEXT DEFAULT '',
                updated_at TEXT NOT NULL,
                FOREIGN KEY(team_id) REFERENCES teams(id) ON DELETE CASCADE,
                FOREIGN KEY(vendor_id) REFERENCES vendors(id) ON DELETE SET NULL
            );

            CREATE TABLE IF NOT EXISTS inventory_transactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                team_id INTEGER NOT NULL,
                product_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                change_qty REAL NOT NULL,
                type TEXT NOT NULL,
                reason TEXT DEFAULT '',
                related_type TEXT DEFAULT '',
                related_id INTEGER,
                created_at TEXT NOT NULL,
                FOREIGN KEY(team_id) REFERENCES teams(id) ON DELETE CASCADE,
                FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE,
                FOREIGN KEY(user_id) REFERENCES users(id)
            );

            CREATE TABLE IF NOT EXISTS recipes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                team_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                station TEXT DEFAULT '',
                yield_qty REAL NOT NULL DEFAULT 1,
                portion_unit TEXT DEFAULT 'plate',
                menu_price REAL NOT NULL DEFAULT 0,
                shelf_life_days INTEGER NOT NULL DEFAULT 3,
                notes TEXT DEFAULT '',
                recipe_steps TEXT DEFAULT '',
                storage_container TEXT DEFAULT '',
                station_container TEXT DEFAULT '',
                container_size_qty REAL NOT NULL DEFAULT 0,
                container_size_unit TEXT DEFAULT '',
                created_at TEXT NOT NULL,
                FOREIGN KEY(team_id) REFERENCES teams(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS recipe_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                team_id INTEGER NOT NULL,
                recipe_id INTEGER NOT NULL,
                product_id INTEGER NOT NULL,
                qty REAL NOT NULL,
                unit TEXT NOT NULL DEFAULT 'each',
                prep_note TEXT DEFAULT '',
                FOREIGN KEY(team_id) REFERENCES teams(id) ON DELETE CASCADE,
                FOREIGN KEY(recipe_id) REFERENCES recipes(id) ON DELETE CASCADE,
                FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS dishes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                team_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                station TEXT DEFAULT '',
                menu_price REAL NOT NULL DEFAULT 0,
                notes TEXT DEFAULT '',
                photo_url TEXT DEFAULT '',
                created_at TEXT NOT NULL,
                FOREIGN KEY(team_id) REFERENCES teams(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS dish_components (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                team_id INTEGER NOT NULL,
                dish_id INTEGER NOT NULL,
                component_type TEXT NOT NULL CHECK(component_type IN ('recipe','product')),
                component_id INTEGER NOT NULL,
                qty REAL NOT NULL DEFAULT 1,
                unit TEXT NOT NULL DEFAULT 'each',
                portion_note TEXT DEFAULT '',
                FOREIGN KEY(team_id) REFERENCES teams(id) ON DELETE CASCADE,
                FOREIGN KEY(dish_id) REFERENCES dishes(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS prep_sheets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                team_id INTEGER NOT NULL,
                title TEXT NOT NULL,
                prep_date TEXT NOT NULL,
                service_period TEXT DEFAULT 'dinner',
                status TEXT NOT NULL DEFAULT 'open',
                created_by INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY(team_id) REFERENCES teams(id) ON DELETE CASCADE,
                FOREIGN KEY(created_by) REFERENCES users(id)
            );

            CREATE TABLE IF NOT EXISTS prep_tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                team_id INTEGER NOT NULL,
                prep_sheet_id INTEGER NOT NULL,
                recipe_id INTEGER,
                product_id INTEGER,
                title TEXT NOT NULL,
                qty REAL NOT NULL DEFAULT 1,
                unit TEXT NOT NULL DEFAULT 'each',
                station TEXT DEFAULT '',
                assigned_to INTEGER,
                priority INTEGER NOT NULL DEFAULT 3,
                status TEXT NOT NULL DEFAULT 'todo',
                due_at TEXT DEFAULT '',
                completed_by INTEGER,
                completed_at TEXT,
                made_at TEXT,
                expires_at TEXT,
                notes TEXT DEFAULT '',
                FOREIGN KEY(team_id) REFERENCES teams(id) ON DELETE CASCADE,
                FOREIGN KEY(prep_sheet_id) REFERENCES prep_sheets(id) ON DELETE CASCADE,
                FOREIGN KEY(recipe_id) REFERENCES recipes(id) ON DELETE SET NULL,
                FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE SET NULL,
                FOREIGN KEY(assigned_to) REFERENCES users(id),
                FOREIGN KEY(completed_by) REFERENCES users(id)
            );


            CREATE TABLE IF NOT EXISTS prep_station_template_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                team_id INTEGER NOT NULL,
                station TEXT NOT NULL,
                item_kind TEXT NOT NULL CHECK(item_kind IN ('recipe','product')),
                source_id INTEGER NOT NULL,
                default_qty REAL NOT NULL DEFAULT 1,
                unit TEXT NOT NULL DEFAULT 'each',
                min_station_qty REAL NOT NULL DEFAULT 0,
                min_station_unit TEXT DEFAULT '',
                active INTEGER NOT NULL DEFAULT 1,
                source_plates TEXT DEFAULT '',
                notes TEXT DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                UNIQUE(team_id, station, item_kind, source_id),
                FOREIGN KEY(team_id) REFERENCES teams(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS station_batches (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                team_id INTEGER NOT NULL,
                product_id INTEGER,
                recipe_id INTEGER,
                prep_task_id INTEGER,
                station TEXT DEFAULT '',
                qty REAL NOT NULL DEFAULT 1,
                unit TEXT NOT NULL DEFAULT 'batch',
                made_at TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'active',
                created_by INTEGER NOT NULL,
                notes TEXT DEFAULT '',
                FOREIGN KEY(team_id) REFERENCES teams(id) ON DELETE CASCADE,
                FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE SET NULL,
                FOREIGN KEY(recipe_id) REFERENCES recipes(id) ON DELETE SET NULL,
                FOREIGN KEY(prep_task_id) REFERENCES prep_tasks(id) ON DELETE SET NULL,
                FOREIGN KEY(created_by) REFERENCES users(id)
            );

            CREATE TABLE IF NOT EXISTS orders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                team_id INTEGER NOT NULL,
                vendor_id INTEGER,
                title TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'draft',
                order_date TEXT NOT NULL,
                expected_delivery TEXT DEFAULT '',
                created_by INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY(team_id) REFERENCES teams(id) ON DELETE CASCADE,
                FOREIGN KEY(vendor_id) REFERENCES vendors(id) ON DELETE SET NULL,
                FOREIGN KEY(created_by) REFERENCES users(id)
            );

            CREATE TABLE IF NOT EXISTS order_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                team_id INTEGER NOT NULL,
                order_id INTEGER NOT NULL,
                product_id INTEGER NOT NULL,
                qty REAL NOT NULL,
                unit TEXT NOT NULL DEFAULT 'each',
                unit_cost REAL NOT NULL DEFAULT 0,
                pack_size_qty REAL NOT NULL DEFAULT 1,
                pack_size_unit TEXT NOT NULL DEFAULT 'each',
                base_unit TEXT NOT NULL DEFAULT 'each',
                expected_prep_usage REAL NOT NULL DEFAULT 0,
                expected_pos_usage REAL NOT NULL DEFAULT 0,
                expected_total_usage REAL NOT NULL DEFAULT 0,
                current_qty_snapshot REAL NOT NULL DEFAULT 0,
                projected_before_delivery REAL NOT NULL DEFAULT 0,
                projected_after_order REAL NOT NULL DEFAULT 0,
                par_level_snapshot REAL NOT NULL DEFAULT 0,
                reorder_point_snapshot REAL NOT NULL DEFAULT 0,
                suggested_base_qty REAL NOT NULL DEFAULT 0,
                risk_snapshot TEXT DEFAULT '',
                prep_sources_snapshot TEXT DEFAULT '',
                pos_sources_snapshot TEXT DEFAULT '',
                status TEXT NOT NULL DEFAULT 'ordered',
                FOREIGN KEY(team_id) REFERENCES teams(id) ON DELETE CASCADE,
                FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE,
                FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS shifts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                team_id INTEGER NOT NULL,
                title TEXT NOT NULL,
                station TEXT DEFAULT '',
                start_at TEXT NOT NULL,
                end_at TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'open',
                assigned_to INTEGER,
                created_by INTEGER NOT NULL,
                notes TEXT DEFAULT '',
                created_at TEXT NOT NULL,
                FOREIGN KEY(team_id) REFERENCES teams(id) ON DELETE CASCADE,
                FOREIGN KEY(assigned_to) REFERENCES users(id),
                FOREIGN KEY(created_by) REFERENCES users(id)
            );

            CREATE TABLE IF NOT EXISTS shift_claims (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                team_id INTEGER NOT NULL,
                shift_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                created_at TEXT NOT NULL,
                decided_by INTEGER,
                decided_at TEXT,
                UNIQUE(shift_id, user_id),
                FOREIGN KEY(team_id) REFERENCES teams(id) ON DELETE CASCADE,
                FOREIGN KEY(shift_id) REFERENCES shifts(id) ON DELETE CASCADE,
                FOREIGN KEY(user_id) REFERENCES users(id),
                FOREIGN KEY(decided_by) REFERENCES users(id)
            );

            CREATE TABLE IF NOT EXISTS posts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                team_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                type TEXT NOT NULL DEFAULT 'note',
                title TEXT NOT NULL,
                body TEXT NOT NULL,
                visibility TEXT NOT NULL DEFAULT 'team',
                created_at TEXT NOT NULL,
                FOREIGN KEY(team_id) REFERENCES teams(id) ON DELETE CASCADE,
                FOREIGN KEY(user_id) REFERENCES users(id)
            );

            CREATE TABLE IF NOT EXISTS post_votes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                team_id INTEGER NOT NULL,
                post_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                vote TEXT NOT NULL,
                created_at TEXT NOT NULL,
                UNIQUE(post_id, user_id),
                FOREIGN KEY(team_id) REFERENCES teams(id) ON DELETE CASCADE,
                FOREIGN KEY(post_id) REFERENCES posts(id) ON DELETE CASCADE,
                FOREIGN KEY(user_id) REFERENCES users(id)
            );

            CREATE TABLE IF NOT EXISTS notifications (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                team_id INTEGER NOT NULL,
                user_id INTEGER,
                title TEXT NOT NULL,
                body TEXT NOT NULL,
                read_at TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY(team_id) REFERENCES teams(id) ON DELETE CASCADE,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS pos_sales (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                team_id INTEGER NOT NULL,
                recipe_id INTEGER NOT NULL,
                sale_date TEXT NOT NULL,
                qty_sold REAL NOT NULL,
                service_period TEXT DEFAULT '',
                source TEXT DEFAULT 'manual',
                created_at TEXT NOT NULL,
                FOREIGN KEY(team_id) REFERENCES teams(id) ON DELETE CASCADE,
                FOREIGN KEY(recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS pos_csv_files (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                team_id INTEGER NOT NULL,
                filename TEXT NOT NULL,
                uploaded_by INTEGER NOT NULL,
                uploaded_at TEXT NOT NULL,
                row_count INTEGER NOT NULL DEFAULT 0,
                imported_count INTEGER NOT NULL DEFAULT 0,
                missing_count INTEGER NOT NULL DEFAULT 0,
                notes TEXT DEFAULT '',
                source_kind TEXT DEFAULT 'manual_upload',
                original_csv TEXT DEFAULT '',
                FOREIGN KEY(team_id) REFERENCES teams(id) ON DELETE CASCADE,
                FOREIGN KEY(uploaded_by) REFERENCES users(id)
            );

            CREATE TABLE IF NOT EXISTS pos_csv_rows (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                team_id INTEGER NOT NULL,
                file_id INTEGER NOT NULL,
                matched_recipe_id INTEGER,
                plate_name TEXT NOT NULL,
                sale_date TEXT NOT NULL,
                day_of_week TEXT NOT NULL,
                qty_sold REAL NOT NULL DEFAULT 0,
                price_sold_at REAL NOT NULL DEFAULT 0,
                service_period TEXT DEFAULT '',
                on_special INTEGER NOT NULL DEFAULT 0,
                source_row_json TEXT DEFAULT '',
                created_at TEXT NOT NULL,
                FOREIGN KEY(team_id) REFERENCES teams(id) ON DELETE CASCADE,
                FOREIGN KEY(file_id) REFERENCES pos_csv_files(id) ON DELETE CASCADE,
                FOREIGN KEY(matched_recipe_id) REFERENCES recipes(id) ON DELETE SET NULL
            );

            CREATE TABLE IF NOT EXISTS projection_profiles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                team_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                profile_type TEXT NOT NULL DEFAULT 'projection',
                payload_json TEXT NOT NULL DEFAULT '{}',
                created_by INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY(team_id) REFERENCES teams(id) ON DELETE CASCADE,
                FOREIGN KEY(created_by) REFERENCES users(id)
            );

            CREATE TABLE IF NOT EXISTS file_storage_settings (
                team_id INTEGER PRIMARY KEY,
                storage_limit_mb REAL NOT NULL DEFAULT 250,
                provider_cost_per_gb_month REAL NOT NULL DEFAULT 0.25,
                monthly_storage_cost REAL NOT NULL DEFAULT 0,
                subscription_storage_note TEXT DEFAULT '',
                updated_at TEXT NOT NULL,
                FOREIGN KEY(team_id) REFERENCES teams(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS picture_folders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                team_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                purpose TEXT DEFAULT 'general',
                created_by INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY(team_id) REFERENCES teams(id) ON DELETE CASCADE,
                FOREIGN KEY(created_by) REFERENCES users(id)
            );

            CREATE TABLE IF NOT EXISTS picture_files (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                team_id INTEGER NOT NULL,
                folder_id INTEGER NOT NULL,
                filename TEXT NOT NULL,
                original_name TEXT NOT NULL,
                content_type TEXT NOT NULL DEFAULT 'image/jpeg',
                size_bytes INTEGER NOT NULL DEFAULT 0,
                storage_path TEXT NOT NULL,
                public_url TEXT NOT NULL,
                usage_target TEXT DEFAULT 'recipe_cards',
                linked_name TEXT DEFAULT '',
                created_by INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY(team_id) REFERENCES teams(id) ON DELETE CASCADE,
                FOREIGN KEY(folder_id) REFERENCES picture_folders(id) ON DELETE CASCADE,
                FOREIGN KEY(created_by) REFERENCES users(id)
            );

            CREATE TABLE IF NOT EXISTS user_social_links (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                team_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                platform TEXT NOT NULL,
                url TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                UNIQUE(team_id, user_id, platform),
                FOREIGN KEY(team_id) REFERENCES teams(id) ON DELETE CASCADE,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS social_prompt_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                team_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                picture_id INTEGER,
                prompt_hash TEXT NOT NULL,
                prompt TEXT NOT NULL,
                created_at TEXT NOT NULL,
                UNIQUE(team_id, prompt_hash),
                FOREIGN KEY(team_id) REFERENCES teams(id) ON DELETE CASCADE,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY(picture_id) REFERENCES picture_files(id) ON DELETE SET NULL
            );

            CREATE TABLE IF NOT EXISTS saved_inventory_snapshots (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                team_id INTEGER NOT NULL,
                snapshot_type TEXT NOT NULL DEFAULT 'inventory',
                title TEXT NOT NULL,
                payload_json TEXT NOT NULL DEFAULT '{}',
                created_by INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY(team_id) REFERENCES teams(id) ON DELETE CASCADE,
                FOREIGN KEY(created_by) REFERENCES users(id)
            );

            CREATE TABLE IF NOT EXISTS delivery_file_records (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                team_id INTEGER NOT NULL,
                vendor_id INTEGER,
                order_id INTEGER,
                delivery_date TEXT NOT NULL,
                title TEXT NOT NULL,
                payload_json TEXT NOT NULL DEFAULT '{}',
                created_by INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY(team_id) REFERENCES teams(id) ON DELETE CASCADE,
                FOREIGN KEY(vendor_id) REFERENCES vendors(id) ON DELETE SET NULL,
                FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE SET NULL,
                FOREIGN KEY(created_by) REFERENCES users(id)
            );

            CREATE TABLE IF NOT EXISTS forecast_prep_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                team_id INTEGER NOT NULL,
                profile_id INTEGER,
                prep_sheet_id INTEGER,
                title TEXT NOT NULL,
                start_date TEXT NOT NULL,
                end_date TEXT NOT NULL,
                payload_json TEXT NOT NULL DEFAULT '{}',
                status TEXT NOT NULL DEFAULT 'active',
                created_by INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                undone_by INTEGER,
                undone_at TEXT,
                FOREIGN KEY(team_id) REFERENCES teams(id) ON DELETE CASCADE,
                FOREIGN KEY(profile_id) REFERENCES projection_profiles(id) ON DELETE SET NULL,
                FOREIGN KEY(prep_sheet_id) REFERENCES prep_sheets(id) ON DELETE SET NULL,
                FOREIGN KEY(created_by) REFERENCES users(id),
                FOREIGN KEY(undone_by) REFERENCES users(id)
            );

            CREATE TABLE IF NOT EXISTS forecast_inventory_impacts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                team_id INTEGER NOT NULL,
                event_id INTEGER NOT NULL,
                product_id INTEGER NOT NULL,
                qty REAL NOT NULL DEFAULT 0,
                unit TEXT NOT NULL DEFAULT 'each',
                source_plate TEXT DEFAULT '',
                source_kind TEXT DEFAULT 'forecaster',
                created_at TEXT NOT NULL,
                FOREIGN KEY(team_id) REFERENCES teams(id) ON DELETE CASCADE,
                FOREIGN KEY(event_id) REFERENCES forecast_prep_events(id) ON DELETE CASCADE,
                FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS recipe_qr_codes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                team_id INTEGER NOT NULL,
                recipe_id INTEGER NOT NULL,
                token TEXT NOT NULL UNIQUE,
                label TEXT NOT NULL,
                url TEXT NOT NULL,
                svg TEXT NOT NULL,
                created_by INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY(team_id) REFERENCES teams(id) ON DELETE CASCADE,
                FOREIGN KEY(recipe_id) REFERENCES recipes(id) ON DELETE CASCADE,
                FOREIGN KEY(created_by) REFERENCES users(id)
            );


            CREATE TABLE IF NOT EXISTS employee_availability (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                team_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                start_at TEXT NOT NULL,
                end_at TEXT NOT NULL,
                label TEXT DEFAULT 'Can work',
                created_by INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY(team_id) REFERENCES teams(id) ON DELETE CASCADE,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY(created_by) REFERENCES users(id)
            );

            CREATE TABLE IF NOT EXISTS employee_unavailability (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                team_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                start_at TEXT NOT NULL,
                end_at TEXT NOT NULL,
                reason TEXT DEFAULT 'Scheduled off',
                created_by INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY(team_id) REFERENCES teams(id) ON DELETE CASCADE,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY(created_by) REFERENCES users(id)
            );

            CREATE TABLE IF NOT EXISTS employee_weekly_availability (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                team_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                day_of_week INTEGER NOT NULL,
                shift_label TEXT DEFAULT '',
                start_time TEXT NOT NULL,
                end_time TEXT NOT NULL,
                status TEXT NOT NULL CHECK(status IN ('can_work','cannot_work')),
                label TEXT DEFAULT '',
                created_by INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY(team_id) REFERENCES teams(id) ON DELETE CASCADE,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY(created_by) REFERENCES users(id)
            );

            CREATE TABLE IF NOT EXISTS schedule_posts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                team_id INTEGER NOT NULL,
                week_start TEXT NOT NULL,
                title TEXT NOT NULL,
                body TEXT NOT NULL,
                created_by INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY(team_id) REFERENCES teams(id) ON DELETE CASCADE,
                FOREIGN KEY(created_by) REFERENCES users(id)
            );

            CREATE TABLE IF NOT EXISTS schedule_blueprints (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                team_id INTEGER NOT NULL,
                day_of_week INTEGER NOT NULL,
                shift_label TEXT NOT NULL DEFAULT '',
                station TEXT NOT NULL DEFAULT '',
                start_time TEXT NOT NULL,
                end_time TEXT NOT NULL,
                employees_needed INTEGER NOT NULL DEFAULT 1,
                notes TEXT DEFAULT '',
                active INTEGER NOT NULL DEFAULT 1,
                created_by INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY(team_id) REFERENCES teams(id) ON DELETE CASCADE,
                FOREIGN KEY(created_by) REFERENCES users(id)
            );


            CREATE TABLE IF NOT EXISTS access_grants (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                team_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                tool TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                reason TEXT DEFAULT '',
                granted_by INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY(team_id) REFERENCES teams(id) ON DELETE CASCADE,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY(granted_by) REFERENCES users(id)
            );


            CREATE TABLE IF NOT EXISTS message_permissions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                team_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                tool TEXT NOT NULL,
                notes TEXT DEFAULT '',
                updated_by INTEGER,
                updated_at TEXT NOT NULL,
                UNIQUE(team_id, user_id, tool),
                FOREIGN KEY(team_id) REFERENCES teams(id) ON DELETE CASCADE,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY(updated_by) REFERENCES users(id)
            );

            CREATE TABLE IF NOT EXISTS station_shift_counts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                team_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                station TEXT NOT NULL,
                count_date TEXT NOT NULL,
                service_period TEXT DEFAULT '',
                product_id INTEGER NOT NULL,
                qty_before_snapshot REAL NOT NULL DEFAULT 0,
                expected_pos_usage REAL NOT NULL DEFAULT 0,
                expected_after_usage REAL NOT NULL DEFAULT 0,
                qty_left REAL NOT NULL DEFAULT 0,
                variance_qty REAL NOT NULL DEFAULT 0,
                pre_stocked_qty REAL NOT NULL DEFAULT 0,
                post_stocked_qty REAL NOT NULL DEFAULT 0,
                restocked_from_house REAL NOT NULL DEFAULT 0,
                ready_for_next_service INTEGER NOT NULL DEFAULT 0,
                house_qty_before_snapshot REAL NOT NULL DEFAULT 0,
                house_qty_after_restock REAL NOT NULL DEFAULT 0,
                manager_expected_usage REAL NOT NULL DEFAULT 0,
                actual_station_used REAL NOT NULL DEFAULT 0,
                usage_variance_qty REAL NOT NULL DEFAULT 0,
                count_workflow TEXT DEFAULT 'end_shift_and_post_restock',
                unit TEXT NOT NULL DEFAULT 'each',
                status TEXT DEFAULT '',
                notes TEXT DEFAULT '',
                created_at TEXT NOT NULL,
                FOREIGN KEY(team_id) REFERENCES teams(id) ON DELETE CASCADE,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS time_off_requests (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                team_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                start_date TEXT NOT NULL,
                end_date TEXT NOT NULL,
                days_requested REAL NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                reason TEXT DEFAULT '',
                decided_by INTEGER,
                decided_at TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY(team_id) REFERENCES teams(id) ON DELETE CASCADE,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY(decided_by) REFERENCES users(id)
            );
            """
        )
        # Lightweight migrations for existing local databases created by earlier Chef Ledger builds.
        for column_sql in [
            "ALTER TABLE teams ADD COLUMN subscription_tier TEXT DEFAULT 'top'",
            "ALTER TABLE teams ADD COLUMN subscription_status TEXT DEFAULT 'active'",
            "ALTER TABLE teams ADD COLUMN subscription_price_monthly REAL NOT NULL DEFAULT 0",
            "ALTER TABLE teams ADD COLUMN subscription_checkout_url TEXT DEFAULT ''",
            "ALTER TABLE teams ADD COLUMN subscription_started_at TEXT DEFAULT ''",
            "ALTER TABLE teams ADD COLUMN subscription_updated_at TEXT DEFAULT ''",
            "ALTER TABLE teams ADD COLUMN stripe_customer_id TEXT DEFAULT ''",
            "ALTER TABLE teams ADD COLUMN stripe_subscription_id TEXT DEFAULT ''",
            "ALTER TABLE teams ADD COLUMN stripe_last_event_id TEXT DEFAULT ''",
            "ALTER TABLE pos_csv_rows ADD COLUMN matched_dish_id INTEGER",
            "ALTER TABLE pos_csv_files ADD COLUMN storage_path TEXT DEFAULT ''",
            "ALTER TABLE pos_csv_files ADD COLUMN size_bytes INTEGER NOT NULL DEFAULT 0",
            "ALTER TABLE order_items ADD COLUMN pack_size_qty REAL NOT NULL DEFAULT 1",
            "ALTER TABLE order_items ADD COLUMN pack_size_unit TEXT NOT NULL DEFAULT 'each'",
            "ALTER TABLE order_items ADD COLUMN base_unit TEXT NOT NULL DEFAULT 'each'",
            "ALTER TABLE order_items ADD COLUMN expected_prep_usage REAL NOT NULL DEFAULT 0",
            "ALTER TABLE order_items ADD COLUMN expected_pos_usage REAL NOT NULL DEFAULT 0",
            "ALTER TABLE order_items ADD COLUMN expected_total_usage REAL NOT NULL DEFAULT 0",
            "ALTER TABLE order_items ADD COLUMN current_qty_snapshot REAL NOT NULL DEFAULT 0",
            "ALTER TABLE order_items ADD COLUMN projected_before_delivery REAL NOT NULL DEFAULT 0",
            "ALTER TABLE order_items ADD COLUMN projected_after_order REAL NOT NULL DEFAULT 0",
            "ALTER TABLE order_items ADD COLUMN par_level_snapshot REAL NOT NULL DEFAULT 0",
            "ALTER TABLE order_items ADD COLUMN reorder_point_snapshot REAL NOT NULL DEFAULT 0",
            "ALTER TABLE order_items ADD COLUMN suggested_base_qty REAL NOT NULL DEFAULT 0",
            "ALTER TABLE order_items ADD COLUMN risk_snapshot TEXT DEFAULT ''",
            "ALTER TABLE order_items ADD COLUMN prep_sources_snapshot TEXT DEFAULT ''",
            "ALTER TABLE order_items ADD COLUMN pos_sources_snapshot TEXT DEFAULT ''",
            "ALTER TABLE users ADD COLUMN days_off_allowed REAL NOT NULL DEFAULT 0",
            "ALTER TABLE users ADD COLUMN days_off_remaining REAL NOT NULL DEFAULT 0",
            "ALTER TABLE users ADD COLUMN days_off_reset_date TEXT DEFAULT ''",
            "ALTER TABLE users ADD COLUMN days_off_rollover INTEGER NOT NULL DEFAULT 0",
            "ALTER TABLE users ADD COLUMN days_off_last_reset_at TEXT DEFAULT ''",
            "ALTER TABLE users ADD COLUMN schedule_color TEXT DEFAULT ''",
            "ALTER TABLE users ADD COLUMN qualified_stations TEXT DEFAULT ''",
            "ALTER TABLE users ADD COLUMN eligible_shifts TEXT DEFAULT ''",
            "ALTER TABLE products ADD COLUMN stock_location TEXT DEFAULT ''",
            "ALTER TABLE products ADD COLUMN stocked_where TEXT DEFAULT ''",
            "ALTER TABLE products ADD COLUMN min_order_size REAL NOT NULL DEFAULT 1",
            "ALTER TABLE products ADD COLUMN units_per_min_order REAL NOT NULL DEFAULT 1",
            "ALTER TABLE shifts ADD COLUMN employee_response TEXT NOT NULL DEFAULT 'pending'",
            "ALTER TABLE pos_sales ADD COLUMN service_period TEXT DEFAULT ''",
            "ALTER TABLE station_shift_counts ADD COLUMN pre_stocked_qty REAL NOT NULL DEFAULT 0",
            "ALTER TABLE station_shift_counts ADD COLUMN post_stocked_qty REAL NOT NULL DEFAULT 0",
            "ALTER TABLE station_shift_counts ADD COLUMN restocked_from_house REAL NOT NULL DEFAULT 0",
            "ALTER TABLE station_shift_counts ADD COLUMN ready_for_next_service INTEGER NOT NULL DEFAULT 0",
            "ALTER TABLE station_shift_counts ADD COLUMN house_qty_before_snapshot REAL NOT NULL DEFAULT 0",
            "ALTER TABLE station_shift_counts ADD COLUMN house_qty_after_restock REAL NOT NULL DEFAULT 0",
            "ALTER TABLE station_shift_counts ADD COLUMN manager_expected_usage REAL NOT NULL DEFAULT 0",
            "ALTER TABLE station_shift_counts ADD COLUMN actual_station_used REAL NOT NULL DEFAULT 0",
            "ALTER TABLE station_shift_counts ADD COLUMN usage_variance_qty REAL NOT NULL DEFAULT 0",
            "ALTER TABLE station_shift_counts ADD COLUMN count_workflow TEXT DEFAULT 'end_shift_and_post_restock'",
            "ALTER TABLE prep_station_template_items ADD COLUMN min_station_qty REAL NOT NULL DEFAULT 0",
            "ALTER TABLE prep_station_template_items ADD COLUMN min_station_unit TEXT DEFAULT ''",
            "ALTER TABLE recipes ADD COLUMN storage_container TEXT DEFAULT ''",
            "ALTER TABLE recipes ADD COLUMN station_container TEXT DEFAULT ''",
            "ALTER TABLE recipes ADD COLUMN container_size_qty REAL NOT NULL DEFAULT 0",
            "ALTER TABLE recipes ADD COLUMN container_size_unit TEXT DEFAULT ''",
            "ALTER TABLE dishes ADD COLUMN photo_url TEXT DEFAULT ''",
            "ALTER TABLE posts ADD COLUMN category TEXT DEFAULT 'generic'",
            "ALTER TABLE posts ADD COLUMN target_tools TEXT DEFAULT ''",
            "ALTER TABLE posts ADD COLUMN target_user_ids TEXT DEFAULT ''",
            "ALTER TABLE posts ADD COLUMN status TEXT DEFAULT 'posted'",
            "ALTER TABLE posts ADD COLUMN captain_note TEXT DEFAULT ''",
            "ALTER TABLE posts ADD COLUMN options_json TEXT DEFAULT ''",
            "ALTER TABLE posts ADD COLUMN approved_by INTEGER",
            "ALTER TABLE posts ADD COLUMN approved_at TEXT DEFAULT ''",
        ]:
            try:
                conn.execute(column_sql)
            except sqlite3.OperationalError as exc:
                if "duplicate column name" not in str(exc).lower():
                    raise
        seed_demo_subscription_tiers(conn)
        seed_demo_ytd_pos_csvs(conn)
        conn.commit()


TIER_LIMITS = {
    "starter": {
        "inventory_snapshots": 3,
        "count_snapshots": 3,
        "prep_week_days": 7,
        "delivery_records": 5,
        "order_pages": 5,
        "storage_mb": 250,
        "menu_level": "csv",
        "pictures": False,
        "qr": False,
        "social_prompt": False,
    },
    "basic": {
        "inventory_snapshots": 3,
        "count_snapshots": 3,
        "prep_week_days": 7,
        "delivery_records": 5,
        "order_pages": 5,
        "storage_mb": 250,
        "menu_level": "csv",
        "pictures": False,
        "qr": False,
        "social_prompt": False,
    },
    "plus": {
        "inventory_snapshots": 7,
        "count_snapshots": 7,
        "prep_week_days": 7,
        "delivery_records": 12,
        "order_pages": 12,
        "storage_mb": 750,
        "menu_level": "shift",
        "pictures": False,
        "qr": False,
        "social_prompt": False,
    },
    "pro": {
        "inventory_snapshots": 14,
        "count_snapshots": 14,
        "prep_week_days": 7,
        "delivery_records": 25,
        "order_pages": 25,
        "storage_mb": 1536,
        "menu_level": "pictures",
        "pictures": True,
        "qr": False,
        "social_prompt": False,
    },
    "top": {
        "inventory_snapshots": 60,
        "count_snapshots": 60,
        "prep_week_days": 7,
        "delivery_records": 120,
        "order_pages": 120,
        "storage_mb": 3072,
        "menu_level": "full",
        "pictures": True,
        "qr": True,
        "social_prompt": True,
    },
}

SUBSCRIPTION_TIERS = {
    "starter": {
        "key": "starter",
        "name": "Starter",
        "price": 10,
        "stripe_env": "CHEF_LEDGER_STRIPE_PAYLINK_STARTER",
        "tagline": "Replace paper counts and basic menu spreadsheets.",
        "best_for": "Small kitchens moving off clipboards.",
        "features": [
            "Profile setup and secure team login",
            "Inventory builder and simple saved counts",
            "Basic menu plate CSV export",
            "Prep sheet workflow for daily kitchen use",
            "250 MB included FILES storage cap",
        ],
    },
    "plus": {
        "key": "plus",
        "name": "Kitchen",
        "price": 14,
        "stripe_env": "CHEF_LEDGER_STRIPE_PAYLINK_PLUS",
        "tagline": "Centralize prep, counts, shifts, and ordering signals.",
        "best_for": "Independent restaurants with regular prep lists.",
        "features": [
            "Everything in Starter",
            "Shift-based menu organization",
            "Saved inventory and count rolling history",
            "Delivery and vendor order file history",
            "750 MB included FILES storage cap",
        ],
    },
    "pro": {
        "key": "pro",
        "name": "Chef",
        "price": 19,
        "stripe_env": "CHEF_LEDGER_STRIPE_PAYLINK_PRO",
        "tagline": "Forecast plates, standardize recipe cards, and reduce rework.",
        "best_for": "Chefs who want prep/order automation.",
        "features": [
            "Everything in Kitchen",
            "POS CSV history and plate projections",
            "Pictures for plates, stations, recipes, and locations",
            "Ingredient-rich menus and JPEG recipe book exports",
            "1.5 GB included FILES storage cap",
        ],
    },
    "top": {
        "key": "top",
        "name": "Authority",
        "price": 25,
        "stripe_env": "CHEF_LEDGER_STRIPE_PAYLINK_TOP",
        "tagline": "Full portable recipebook, QR codes, and social prompt tools.",
        "best_for": "Teams that want the complete operating system.",
        "features": [
            "Everything in Chef",
            "Full menu access with all shifts and recipe cards",
            "QR Code Maker for portable recipebook access",
            "Create Post prompt generator for polished social posts",
            "3 GB included FILES storage cap",
        ],
    },
}

STRIPE_PUBLISHABLE_KEY = os.environ.get(
    "CHEF_LEDGER_STRIPE_PUBLISHABLE_KEY",
    "pk_live_51TdF41GJtywdCBcEVXcvUM8SB5O6Y34OCA0nrPqvlfa5RQfmSj5TroPhVQq8heMzbJZuEhxoOwVXC7sYrpSBybdk002vxsC9AC",
).strip()

STRIPE_BUY_BUTTON_IDS = {
    "starter": os.environ.get("CHEF_LEDGER_STRIPE_BUY_BUTTON_STARTER", "buy_btn_1ThUNgGJtywdCBcETVYJjTha").strip(),
    "plus": os.environ.get("CHEF_LEDGER_STRIPE_BUY_BUTTON_KITCHEN", "buy_btn_1ThUPGGJtywdCBcET4iAdZqh").strip(),
    "pro": os.environ.get("CHEF_LEDGER_STRIPE_BUY_BUTTON_CHEF", "buy_btn_1ThUPTGJtywdCBcEBqr6zQiM").strip(),
    "top": os.environ.get("CHEF_LEDGER_STRIPE_BUY_BUTTON_AUTHORITY", "buy_btn_1ThUOcGJtywdCBcEpfMequal").strip(),
}

ACTIVE_SUBSCRIPTION_STATUSES = {"active", "trialing", "demo", "comped"}


def checkout_url_for_tier(tier: str) -> str:
    item = SUBSCRIPTION_TIERS.get(tier) or SUBSCRIPTION_TIERS["starter"]
    env_name = item.get("stripe_env") or ""
    configured = os.environ.get(env_name, "").strip() if env_name else ""
    if configured:
        return configured
    # Local preview fallback. In production, configure the CHEF_LEDGER_STRIPE_PAYLINK_* env vars.
    return f"/checkout/stripe-paylink-needed?tier={item['key']}"


def subscription_tier_catalog() -> list[dict]:
    catalog = []
    for key in ("starter", "plus", "pro", "top"):
        item = dict(SUBSCRIPTION_TIERS[key])
        item["checkout_url"] = checkout_url_for_tier(key)
        item["stripe_buy_button_id"] = STRIPE_BUY_BUTTON_IDS.get(key, "")
        item["stripe_publishable_key"] = STRIPE_PUBLISHABLE_KEY
        item["limits"] = dict(TIER_LIMITS[key])
        item.pop("stripe_env", None)
        catalog.append(item)
    return catalog


def normalize_subscription_tier(value: str | None) -> str:
    tier = str(value or "starter").strip().lower()
    aliases = {"basic": "starter", "kitchen": "plus", "chef": "pro", "authority": "top", "premium": "top"}
    tier = aliases.get(tier, tier)
    return tier if tier in SUBSCRIPTION_TIERS else "starter"


def local_subscription_activation_allowed() -> bool:
    configured = os.environ.get("CHEF_LEDGER_ALLOW_LOCAL_SUBSCRIPTION_ACTIVATE")
    if configured is not None:
        return configured.lower() not in ("0", "false", "no")
    # Render/production deployments should unlock through Stripe webhooks, not local bypass buttons.
    if os.environ.get("RENDER") or os.environ.get("PORT"):
        return False
    return True


def subscription_for_team(conn: sqlite3.Connection, team_id: int) -> dict:
    team = one(conn, "SELECT * FROM teams WHERE id=?", (team_id,))
    tier = normalize_subscription_tier((team["subscription_tier"] if team and "subscription_tier" in team.keys() else "starter") or "starter")
    status = ((team["subscription_status"] if team and "subscription_status" in team.keys() else "active") or "active").strip().lower()
    item = dict(SUBSCRIPTION_TIERS[tier])
    item.pop("stripe_env", None)
    return {
        "tier": tier,
        "tier_name": item["name"],
        "status": status,
        "active": status in ACTIVE_SUBSCRIPTION_STATUSES,
        "price": item["price"],
        "checkout_url": (team["subscription_checkout_url"] if team and "subscription_checkout_url" in team.keys() and team["subscription_checkout_url"] else checkout_url_for_tier(tier)),
        "started_at": team["subscription_started_at"] if team and "subscription_started_at" in team.keys() else "",
        "updated_at": team["subscription_updated_at"] if team and "subscription_updated_at" in team.keys() else "",
        "catalog_item": item,
        "limits": tier_limits(conn, team_id),
        "local_preview_activation_available": local_subscription_activation_allowed(),
    }


def subscription_is_active(conn: sqlite3.Connection, team_id: int) -> bool:
    return bool(subscription_for_team(conn, team_id).get("active"))


def team_tier(conn: sqlite3.Connection, team_id: int) -> str:
    try:
        row = one(conn, "SELECT subscription_tier FROM teams WHERE id=?", (team_id,))
        tier = (row["subscription_tier"] if row and "subscription_tier" in row.keys() else "top") or "top"
    except sqlite3.OperationalError:
        tier = "top"
    tier = normalize_subscription_tier(str(tier).strip().lower())
    return tier if tier in TIER_LIMITS else "starter"


def tier_limits(conn: sqlite3.Connection, team_id: int) -> dict:
    tier = team_tier(conn, team_id)
    out = dict(TIER_LIMITS[tier])
    out["tier"] = tier
    return out


def seed_demo_subscription_tiers(conn: sqlite3.Connection) -> None:
    try:
        teams = all_rows(conn, "SELECT id, name, COALESCE(subscription_tier, '') AS subscription_tier FROM teams")
    except sqlite3.OperationalError:
        return
    for t in teams:
        name = (t["name"] or "").lower()
        if "boutique" in name:
            tier = "starter"
            status = "demo"
        elif "steady" in name or "neighborhood" in name:
            tier = "plus"
            status = "demo"
        elif "demo" in name or "harbor" in name:
            tier = "top"
            status = "demo"
        else:
            tier = normalize_subscription_tier(t["subscription_tier"] or "top")
            status = "active"
        price = SUBSCRIPTION_TIERS.get(tier, SUBSCRIPTION_TIERS["starter"])["price"]
        checkout_url = checkout_url_for_tier(tier)
        try:
            conn.execute(
                "UPDATE teams SET subscription_tier=?, subscription_status=COALESCE(NULLIF(subscription_status, ''), ?), subscription_price_monthly=?, subscription_checkout_url=?, subscription_updated_at=COALESCE(NULLIF(subscription_updated_at, ''), ?) WHERE id=?",
                (tier, status, price, checkout_url, now_iso(), t["id"]),
            )
        except sqlite3.OperationalError:
            conn.execute("UPDATE teams SET subscription_tier=? WHERE id=?", (tier, t["id"]))


def write_team_upload_text(team_id: int, folder: str, filename: str, text: str) -> tuple[str, int]:
    upload_dir = team_upload_root(team_id) / folder
    upload_dir.mkdir(parents=True, exist_ok=True)
    safe_name = safe_slug(filename, "upload.csv")
    path = upload_dir / safe_name
    path.write_text(text or "", encoding="utf-8")
    return str(path.relative_to(APP_ROOT)), path.stat().st_size


def demo_service_for_plate(name: str, idx: int, tier: str) -> str:
    lower = (name or "").lower()
    if "brunch" in lower:
        return "Brunch"
    if "lunch" in lower:
        return "Lunch"
    if "dinner" in lower:
        return "Dinner"
    if tier in ("starter", "basic"):
        return "Brunch" if idx % 2 == 0 else "Lunch"
    return ["Breakfast", "Lunch", "Dinner", "Brunch", "Late Night", "Bar Menu"][idx % 6]


def build_demo_pos_csv_for_team(conn: sqlite3.Connection, team_id: int) -> str:
    tier = team_tier(conn, team_id)
    plates = rows_dict(all_rows(conn, "SELECT id, name, station, menu_price FROM dishes WHERE team_id=? ORDER BY id", (team_id,)))
    if not plates:
        plates = rows_dict(all_rows(conn, "SELECT id, name, station, menu_price FROM recipes WHERE team_id=? ORDER BY id", (team_id,)))
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["business_date", "service_period", "plate", "qty_sold", "price_sold_at", "special", "discount_name", "check_count", "net_sales"])
    today = datetime.now().date()
    start = datetime(today.year, 1, 1).date()
    days = max(1, (today - start).days + 1)
    step = 1 if len(plates) <= 24 else 2
    for idx, plate in enumerate(plates):
        base_price = float(plate.get("menu_price") or (14 + idx % 11))
        service = demo_service_for_plate(plate.get("name"), idx, tier)
        for offset in range(idx % 5, days, step):
            day = start + timedelta(days=offset)
            weekday = day.weekday()
            weekend_boost = 10 if weekday in (4, 5) else 4 if weekday == 6 else 0
            seasonal = 6 if day.month in (5, 6, 7, 8) and idx % 3 == 0 else 0
            special = 1 if (weekday == (idx % 7) and (offset // max(step, 1)) % 3 == 0) else 0
            qty_sold = max(1, int(6 + (idx % 14) + weekend_boost + seasonal + ((offset + idx) % 6) + (7 if special else 0)))
            price = round(base_price * (0.84 if special else 1.0), 2)
            writer.writerow([day.isoformat(), service, plate.get("name") or f"Plate {idx+1}", qty_sold, price, "yes" if special else "no", "Chef Special" if special else "", max(1, qty_sold // 2), round(qty_sold * price, 2)])
    return output.getvalue()


def seed_demo_ytd_pos_csvs(conn: sqlite3.Connection) -> None:
    try:
        teams = all_rows(conn, "SELECT id, name FROM teams WHERE lower(name) LIKE 'demo-%' OR lower(name) LIKE 'demo%' ORDER BY id")
    except sqlite3.OperationalError:
        return
    demo_dir = APP_ROOT / "data" / "demo_pos_csv"
    demo_dir.mkdir(parents=True, exist_ok=True)
    for team in teams:
        csv_text = build_demo_pos_csv_for_team(conn, int(team["id"]))
        slug = safe_slug((team["name"] or f"team-{team['id']}").replace("DEMO-", "demo-"), f"demo-team-{team['id']}").lower()
        filename = f"{slug}-fake-ytd-pos.csv"
        (demo_dir / filename).write_text(csv_text, encoding="utf-8")
        exists = one(conn, "SELECT id FROM pos_csv_files WHERE team_id=? AND source_kind='demo_ytd_seed' LIMIT 1", (team["id"],))
        owner = one(conn, "SELECT id FROM users WHERE team_id=? ORDER BY id LIMIT 1", (team["id"],))
        if not exists and owner and csv_text.strip():
            parse_pos_csv(conn, int(team["id"]), int(owner["id"]), filename, csv_text, "Pre-loaded fake YTD POS CSV for demo forecaster testing.", "demo_ytd_seed")


def enforce_rolling_limit(conn: sqlite3.Connection, team_id: int, table: str, limit: int, where_clause: str = "", params: tuple = ()) -> None:
    if limit <= 0:
        return
    rows = all_rows(conn, f"SELECT id FROM {table} WHERE team_id=? {where_clause} ORDER BY created_at DESC, id DESC", (team_id, *params))
    for row in rows[int(limit):]:
        conn.execute(f"DELETE FROM {table} WHERE id=? AND team_id=?", (row["id"], team_id))


def inventory_snapshot_payload(conn: sqlite3.Connection, team_id: int) -> dict:
    rows = rows_dict(all_rows(conn, """
        SELECT p.*, v.name AS vendor_name
        FROM products p LEFT JOIN vendors v ON v.id=p.vendor_id
        WHERE p.team_id=? ORDER BY p.category, p.name
    """, (team_id,)))
    return {"kind": "inventory", "generated_at": now_iso(), "rows": rows}


def count_snapshot_payload(conn: sqlite3.Connection, team_id: int) -> dict:
    data = count_sheet_data(conn, team_id, 7)
    return {"kind": "count", "generated_at": now_iso(), "rows": data.get("rows", []), "suggested": data.get("suggested", [])}


def prep_week_payload(conn: sqlite3.Connection, team_id: int) -> list[dict]:
    today = datetime.now().date()
    out = []
    for i in range(6, -1, -1):
        day = today - timedelta(days=i)
        sheets = rows_dict(all_rows(conn, "SELECT * FROM prep_sheets WHERE team_id=? AND prep_date=? ORDER BY created_at DESC", (team_id, day.isoformat())))
        out.append({"date": day.isoformat(), "label": day.strftime("%A"), "sheets": sheets})
    return out


def files_inventories_data(conn: sqlite3.Connection, team_id: int) -> dict:
    snapshots = rows_dict(all_rows(conn, "SELECT * FROM saved_inventory_snapshots WHERE team_id=? ORDER BY created_at DESC, id DESC", (team_id,)))
    return {"limits": tier_limits(conn, team_id), "snapshots": snapshots, "prep_week": prep_week_payload(conn, team_id), "storage": file_storage_summary(conn, team_id)}


def save_inventory_snapshot(conn: sqlite3.Connection, team_id: int, user_id: int, snapshot_type: str, title: str = "") -> int:
    snapshot_type = (snapshot_type or "inventory").lower()
    payload = count_snapshot_payload(conn, team_id) if snapshot_type == "count" else inventory_snapshot_payload(conn, team_id)
    title = title or (("COUNT full inventory" if snapshot_type == "count" else "Inventory snapshot") + f" · {today_iso()}")
    cur = conn.execute(
        "INSERT INTO saved_inventory_snapshots (team_id, snapshot_type, title, payload_json, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        (team_id, snapshot_type, title, json.dumps(payload, sort_keys=True, default=str), user_id, now_iso()),
    )
    limits = tier_limits(conn, team_id)
    limit = int(limits["count_snapshots"] if snapshot_type == "count" else limits["inventory_snapshots"])
    enforce_rolling_limit(conn, team_id, "saved_inventory_snapshots", limit, "AND snapshot_type=?", (snapshot_type,))
    return int(cur.lastrowid)


def order_payload(conn: sqlite3.Connection, team_id: int, order_id: int) -> dict:
    order = row_dict(one(conn, "SELECT o.*, v.name AS vendor_name FROM orders o LEFT JOIN vendors v ON v.id=o.vendor_id WHERE o.id=? AND o.team_id=?", (order_id, team_id)))
    items = rows_dict(all_rows(conn, "SELECT oi.*, p.name AS product_name FROM order_items oi LEFT JOIN products p ON p.id=oi.product_id WHERE oi.order_id=? AND oi.team_id=? ORDER BY p.name", (order_id, team_id)))
    return {"order": order, "items": items}


def files_deliveries_data(conn: sqlite3.Connection, team_id: int) -> dict:
    orders = rows_dict(all_rows(conn, "SELECT o.*, v.name AS vendor_name FROM orders o LEFT JOIN vendors v ON v.id=o.vendor_id WHERE o.team_id=? ORDER BY COALESCE(o.expected_delivery, o.order_date, o.created_at) DESC, o.id DESC LIMIT 100", (team_id,)))
    records = rows_dict(all_rows(conn, "SELECT d.*, v.name AS vendor_name FROM delivery_file_records d LEFT JOIN vendors v ON v.id=d.vendor_id WHERE d.team_id=? ORDER BY d.delivery_date DESC, d.id DESC", (team_id,)))
    vendors = rows_dict(all_rows(conn, "SELECT * FROM vendors WHERE team_id=? ORDER BY name", (team_id,)))
    by_vendor = {}
    for order in orders:
        by_vendor.setdefault(order.get("vendor_name") or "Unassigned Vendor", []).append(order)
    return {"limits": tier_limits(conn, team_id), "vendors": vendors, "orders": orders, "records": records, "by_vendor": by_vendor}


def save_delivery_record(conn: sqlite3.Connection, team_id: int, user_id: int, order_id: int | None = None, vendor_id: int | None = None, title: str = "") -> int:
    payload = order_payload(conn, team_id, int(order_id)) if order_id else {"generated_at": now_iso(), "suggestions": build_order_suggestions(conn, team_id, 3)}
    order = payload.get("order") or {}
    vendor_id = vendor_id or order.get("vendor_id")
    delivery_date = order.get("expected_delivery") or order.get("order_date") or order.get("created_at") or today_iso()
    title = title or f"Delivery / vendor order · {order.get('vendor_name') or 'All vendors'} · {str(delivery_date)[:10]}"
    cur = conn.execute(
        "INSERT INTO delivery_file_records (team_id, vendor_id, order_id, delivery_date, title, payload_json, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (team_id, vendor_id, order_id, str(delivery_date)[:10], title, json.dumps(payload, sort_keys=True, default=str), user_id, now_iso()),
    )
    enforce_rolling_limit(conn, team_id, "delivery_file_records", int(tier_limits(conn, team_id)["delivery_records"]))
    return int(cur.lastrowid)


def menu_shift_for_row(row: dict, idx: int) -> str:
    name = (row.get("name") or "").lower()
    station = (row.get("station") or "").lower()
    if "brunch" in name:
        return "Brunch"
    if "breakfast" in name or "bakery" in station:
        return "Breakfast"
    if "lunch" in name or "cold" in station:
        return "Lunch"
    if "bar" in name or "raw" in station:
        return "Bar Menu"
    if "late" in name:
        return "Late Night"
    return ["Dinner", "Lunch", "Brunch", "Bar Menu", "Late Night", "Breakfast"][idx % 6]


def ingredient_names_for_plate(conn: sqlite3.Connection, team_id: int, row: dict, is_dish: bool) -> list[str]:
    names = []
    if is_dish:
        comps = all_rows(conn, """
            SELECT dc.*, r.name AS recipe_name, p.name AS product_name
            FROM dish_components dc
            LEFT JOIN recipes r ON r.id=dc.component_id AND dc.component_type='recipe'
            LEFT JOIN products p ON p.id=dc.component_id AND dc.component_type='product'
            WHERE dc.team_id=? AND dc.dish_id=?
        """, (team_id, row["id"]))
        for c in comps:
            names.append(c["recipe_name"] or c["product_name"] or "Component")
    else:
        comps = all_rows(conn, """
            SELECT ri.*, p.name AS product_name
            FROM recipe_items ri JOIN products p ON p.id=ri.product_id
            WHERE ri.team_id=? AND ri.recipe_id=?
        """, (team_id, row["id"]))
        for c in comps:
            names.append(c["product_name"])
    return names


def files_menu_data(conn: sqlite3.Connection, team_id: int) -> dict:
    limits = tier_limits(conn, team_id)
    dishes = rows_dict(all_rows(conn, "SELECT *, 'dish' AS source_type FROM dishes WHERE team_id=? ORDER BY name", (team_id,)))
    recipes = rows_dict(all_rows(conn, "SELECT *, 'recipe' AS source_type FROM recipes WHERE team_id=? ORDER BY name", (team_id,)))
    rows = dishes if dishes else recipes
    enriched = []
    for idx, r in enumerate(rows):
        is_dish = r.get("source_type") == "dish"
        ingredients = ingredient_names_for_plate(conn, team_id, r, is_dish) if limits["menu_level"] in ("pictures", "full") else []
        pics = rows_dict(all_rows(conn, "SELECT * FROM picture_files WHERE team_id=? AND lower(linked_name)=lower(?) ORDER BY created_at DESC LIMIT 3", (team_id, r.get("name") or ""))) if limits.get("pictures") else []
        enriched.append({**r, "shift": menu_shift_for_row(r, idx), "ingredients": ingredients, "pictures": pics})
    csv_out = io.StringIO()
    writer = csv.writer(csv_out)
    writer.writerow(["shift", "plate", "station", "menu_price", "ingredients"])
    for r in enriched:
        writer.writerow([r.get("shift"), r.get("name"), r.get("station"), r.get("menu_price") or 0, "; ".join(r.get("ingredients") or [])])
    by_shift = {}
    for r in enriched:
        by_shift.setdefault(r["shift"], []).append(r)
    return {"limits": limits, "rows": enriched, "by_shift": by_shift, "csv": csv_out.getvalue(), "storage": file_storage_summary(conn, team_id)}


def profile_payload(profile: sqlite3.Row | None) -> dict:
    try:
        return json.loads(profile["payload_json"] or "{}") if profile else {}
    except Exception:
        return {}


def resolve_plate_kind(conn: sqlite3.Connection, team_id: int, plate_name: str) -> tuple[str | None, sqlite3.Row | None]:
    row = one(conn, "SELECT * FROM dishes WHERE team_id=? AND lower(name)=lower(?)", (team_id, plate_name))
    if row:
        return "dish", row
    row = one(conn, "SELECT * FROM recipes WHERE team_id=? AND lower(name)=lower(?)", (team_id, plate_name))
    if row:
        return "recipe", row
    return None, None


def projected_usages_for_plate(conn: sqlite3.Connection, team_id: int, plate_name: str, plates_qty: float) -> list[dict]:
    kind, row = resolve_plate_kind(conn, team_id, plate_name)
    usages = {}
    if not kind or not row:
        return []
    def add_usage(product_id: int, qty: float, unit: str, source: str):
        product = one(conn, "SELECT * FROM products WHERE id=? AND team_id=?", (product_id, team_id))
        if not product:
            return
        converted = convert_qty(qty, unit, product["unit"])
        if converted is None:
            converted = qty
        target = usages.setdefault(product_id, {"product_id": product_id, "qty": 0.0, "unit": product["unit"], "sources": []})
        target["qty"] += float(converted or 0)
        target["sources"].append(source)
    if kind == "recipe":
        y = float(row["yield_qty"] or 1) or 1.0
        for item in all_rows(conn, "SELECT * FROM recipe_items WHERE team_id=? AND recipe_id=?", (team_id, row["id"])):
            add_usage(int(item["product_id"]), float(item["qty"] or 0) / y * plates_qty, item["unit"], f"{plate_name}: {plates_qty:g} plates")
    else:
        for comp in all_rows(conn, "SELECT * FROM dish_components WHERE team_id=? AND dish_id=?", (team_id, row["id"])):
            comp_qty = float(comp["qty"] or 0) * plates_qty
            if comp["component_type"] == "product":
                add_usage(int(comp["component_id"]), comp_qty, comp["unit"], f"{plate_name}: direct plate component")
            else:
                recipe = one(conn, "SELECT * FROM recipes WHERE id=? AND team_id=?", (comp["component_id"], team_id))
                if not recipe:
                    continue
                y = float(recipe["yield_qty"] or 1) or 1.0
                for item in all_rows(conn, "SELECT * FROM recipe_items WHERE team_id=? AND recipe_id=?", (team_id, recipe["id"])):
                    add_usage(int(item["product_id"]), float(item["qty"] or 0) / y * comp_qty, item["unit"], f"{plate_name}: {recipe['name']} component")
    return list(usages.values())


def forecaster_data(conn: sqlite3.Connection, team_id: int) -> dict:
    profiles = rows_dict(all_rows(conn, "SELECT * FROM projection_profiles WHERE team_id=? ORDER BY updated_at DESC, id DESC LIMIT 100", (team_id,)))
    events = rows_dict(all_rows(conn, "SELECT * FROM forecast_prep_events WHERE team_id=? ORDER BY created_at DESC, id DESC LIMIT 50", (team_id,)))
    return {"profiles": profiles, "events": events, "storage": file_storage_summary(conn, team_id), "limits": tier_limits(conn, team_id)}


def apply_forecaster_profile(conn: sqlite3.Connection, team_id: int, user_id: int, profile_id: int, start_date: str, end_date: str, adjustments: dict | None = None, title: str = "") -> dict:
    profile = one(conn, "SELECT * FROM projection_profiles WHERE id=? AND team_id=?", (profile_id, team_id))
    if not profile:
        raise ValueError("Projection profile not found")
    payload = profile_payload(profile)
    plates = payload.get("plates") or []
    projection_kind = payload.get("projection_type") or payload.get("projection_kind") or "week"
    if plates and all(isinstance(item, str) for item in plates):
        plates = projection_for_plates(conn, team_id, plates, projection_kind).get("plates", [])
    elif isinstance(plates, dict):
        plates = list(plates.values())
    adjustments = adjustments or {}
    title = title or f"FORECASTER · {profile['name']} · {start_date} to {end_date}"
    cur = conn.execute("INSERT INTO prep_sheets (team_id, title, prep_date, service_period, status, created_by, created_at) VALUES (?, ?, ?, 'forecaster', 'open', ?, ?)", (team_id, title, start_date or today_iso(), user_id, now_iso()))
    sheet_id = int(cur.lastrowid)
    event_cur = conn.execute(
        "INSERT INTO forecast_prep_events (team_id, profile_id, prep_sheet_id, title, start_date, end_date, payload_json, status, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)",
        (team_id, profile_id, sheet_id, title, start_date or today_iso(), end_date or start_date or today_iso(), json.dumps({"profile": row_dict(profile), "payload": payload, "adjustments": adjustments}, sort_keys=True, default=str), user_id, now_iso()),
    )
    event_id = int(event_cur.lastrowid)
    total_tasks = 0
    total_impacts = 0
    for p in plates:
        plate_name = p.get("plate_name") or p.get("plate") or ""
        base_qty = float(p.get("projected_qty") or p.get("plates_sold") or p.get("history_qty") or 0)
        final_qty = float(adjustments.get(plate_name, base_qty) or base_qty)
        if not plate_name or final_qty <= 0:
            continue
        kind, obj = resolve_plate_kind(conn, team_id, plate_name)
        if kind == "recipe":
            conn.execute("INSERT INTO prep_tasks (team_id, prep_sheet_id, recipe_id, product_id, title, qty, unit, station, assigned_to, priority, status, due_at, notes) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, NULL, 2, 'todo', '', ?)", (team_id, sheet_id, obj["id"], f"FORECAST · {plate_name}", final_qty, obj["portion_unit"] or "plates", obj["station"] or "Kitchen", f"Forecaster event #{event_id}; profile {profile['name']}"))
            total_tasks += 1
        elif kind == "dish":
            conn.execute("INSERT INTO prep_tasks (team_id, prep_sheet_id, recipe_id, product_id, title, qty, unit, station, assigned_to, priority, status, due_at, notes) VALUES (?, ?, NULL, NULL, ?, ?, 'plates', ?, NULL, 2, 'todo', '', ?)", (team_id, sheet_id, f"FORECAST · Plate count · {plate_name}", final_qty, obj["station"] or "Kitchen", f"Forecaster event #{event_id}; plate-level task"))
            total_tasks += 1
        for use in projected_usages_for_plate(conn, team_id, plate_name, final_qty):
            conn.execute("INSERT INTO forecast_inventory_impacts (team_id, event_id, product_id, qty, unit, source_plate, source_kind, created_at) VALUES (?, ?, ?, ?, ?, ?, 'forecaster', ?)", (team_id, event_id, int(use["product_id"]), float(use["qty"]), use["unit"], plate_name, now_iso()))
            total_impacts += 1
    return {"event_id": event_id, "prep_sheet_id": sheet_id, "task_count": total_tasks, "impact_count": total_impacts}


def undo_forecaster_event(conn: sqlite3.Connection, team_id: int, user_id: int, event_id: int) -> dict:
    event = one(conn, "SELECT * FROM forecast_prep_events WHERE id=? AND team_id=?", (event_id, team_id))
    if not event:
        raise ValueError("Forecast event not found")
    if event["prep_sheet_id"]:
        conn.execute("DELETE FROM prep_sheets WHERE id=? AND team_id=?", (event["prep_sheet_id"], team_id))
    conn.execute("UPDATE forecast_prep_events SET status='canceled', undone_by=?, undone_at=? WHERE id=? AND team_id=?", (user_id, now_iso(), event_id, team_id))
    conn.execute("DELETE FROM forecast_inventory_impacts WHERE event_id=? AND team_id=?", (event_id, team_id))
    return {"event_id": event_id, "status": "canceled"}


def qr_svg_for_url(value: str, label: str = "Recipe QR") -> str:
    digest = hashlib.sha256(value.encode("utf-8")).digest()
    size = 29
    cell = 8
    pad = 16
    def bit_at(x: int, y: int) -> bool:
        idx = (x * 31 + y * 17 + digest[(x + y) % len(digest)]) % 256
        return (idx ^ digest[(x * 7 + y * 11) % len(digest)]) & 1 == 1
    def finder(x0: int, y0: int) -> set[tuple[int, int]]:
        pts = set()
        for y in range(7):
            for x in range(7):
                if x in (0, 6) or y in (0, 6) or (2 <= x <= 4 and 2 <= y <= 4):
                    pts.add((x0 + x, y0 + y))
        return pts
    finders = finder(0, 0) | finder(size - 7, 0) | finder(0, size - 7)
    rects = []
    for y in range(size):
        for x in range(size):
            on = (x, y) in finders or ((x, y) not in finders and bit_at(x, y))
            if on:
                rects.append(f'<rect x="{pad+x*cell}" y="{pad+y*cell}" width="{cell}" height="{cell}" rx="1"/>')
    total = pad * 2 + size * cell
    safe_label = html.escape(label or "Recipe QR")
    safe_value = html.escape(value)
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{total}" height="{total+66}" viewBox="0 0 {total} {total+66}" role="img" aria-label="{safe_label}"><rect width="100%" height="100%" fill="#fff"/><g fill="#111">{"".join(rects)}</g><text x="{total/2}" y="{total+24}" text-anchor="middle" font-family="Arial" font-size="12" font-weight="700">{safe_label}</text><text x="{total/2}" y="{total+44}" text-anchor="middle" font-family="Arial" font-size="8">{safe_value}</text></svg>'


def recipe_qr_data(conn: sqlite3.Connection, team_id: int) -> dict:
    limits = tier_limits(conn, team_id)
    recipes = rows_dict(all_rows(conn, "SELECT id, name, station FROM recipes WHERE team_id=? ORDER BY name", (team_id,)))
    codes = rows_dict(all_rows(conn, "SELECT q.*, r.name AS recipe_name, r.station FROM recipe_qr_codes q JOIN recipes r ON r.id=q.recipe_id WHERE q.team_id=? ORDER BY q.created_at DESC", (team_id,)))
    return {"limits": limits, "recipes": recipes, "codes": codes}


def user_public(row: sqlite3.Row | None) -> dict | None:
    if row is None:
        return None
    return {
        "id": row["id"],
        "team_id": row["team_id"],
        "name": row["name"],
        "email": row["email"],
        "role": row["role"],
        "station": row["station"],
        "active": row["active"],
        "days_off_allowed": row["days_off_allowed"],
        "days_off_remaining": row["days_off_remaining"],
        "days_off_reset_date": row["days_off_reset_date"],
        "days_off_rollover": row["days_off_rollover"],
        "days_off_last_reset_at": row["days_off_last_reset_at"],
        "schedule_color": row["schedule_color"] if "schedule_color" in row.keys() else "",
        "qualified_stations": row["qualified_stations"] if "qualified_stations" in row.keys() else "",
        "eligible_shifts": row["eligible_shifts"] if "eligible_shifts" in row.keys() else "",
    }



def parse_date_only(value: str | None):
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).split("T")[0]).date()
    except ValueError:
        return None


def add_one_year_safe(day):
    try:
        return day.replace(year=day.year + 1)
    except ValueError:
        return day.replace(month=2, day=28, year=day.year + 1)


def time_off_days(start_date: str | None, end_date: str | None) -> float:
    start = parse_date_only(start_date)
    end = parse_date_only(end_date)
    if not start or not end or end < start:
        return 0.0
    return float((end - start).days + 1)


def apply_time_off_resets(conn: sqlite3.Connection, team_id: int) -> list[dict]:
    today = datetime.now().date()
    changed = []
    users = all_rows(
        conn,
        """
        SELECT * FROM users
        WHERE team_id=? AND active=1 AND days_off_reset_date IS NOT NULL AND days_off_reset_date!=''
        """,
        (team_id,),
    )
    for u in users:
        reset_date = parse_date_only(u["days_off_reset_date"])
        if not reset_date or reset_date > today:
            continue
        allowed = float(u["days_off_allowed"] or 0)
        remaining = float(u["days_off_remaining"] or 0)
        rollover = int(u["days_off_rollover"] or 0) == 1
        new_remaining = remaining
        applied_count = 0
        next_reset = reset_date
        while next_reset <= today:
            new_remaining = new_remaining + allowed if rollover else allowed
            applied_count += 1
            next_reset = add_one_year_safe(next_reset)
        conn.execute(
            """
            UPDATE users
            SET days_off_remaining=?, days_off_reset_date=?, days_off_last_reset_at=?
            WHERE id=? AND team_id=?
            """,
            (round(new_remaining, 3), next_reset.isoformat(), now_iso(), u["id"], team_id),
        )
        changed.append({
            "user_id": u["id"],
            "name": u["name"],
            "allowed": allowed,
            "previous_remaining": remaining,
            "new_remaining": round(new_remaining, 3),
            "rollover": rollover,
            "applied_count": applied_count,
            "next_reset_date": next_reset.isoformat(),
        })
        create_notification(
            conn,
            team_id,
            "Days off balance reset",
            f"{u['name']}'s days-off balance was {'rolled over and added to' if rollover else 'reset to'} {round(new_remaining, 3)} day(s). Next reset: {next_reset.isoformat()}.",
            u["id"],
        )
    if changed:
        notify_managers(conn, team_id, "Time-off balances updated", f"{len(changed)} employee time-off balance(s) were reset automatically.")
    return changed



def active_access_grants(conn: sqlite3.Connection, team_id: int, user_id: int | None = None) -> list[dict]:
    params: list = [team_id, now_iso()]
    sql = """
        SELECT ag.*, u.name AS user_name, g.name AS granted_by_name
        FROM access_grants ag
        JOIN users u ON u.id=ag.user_id
        JOIN users g ON g.id=ag.granted_by
        WHERE ag.team_id=? AND ag.expires_at>=?
    """
    if user_id is not None:
        sql += " AND ag.user_id=?"
        params.append(user_id)
    sql += " ORDER BY ag.expires_at, u.name"
    return rows_dict(all_rows(conn, sql, tuple(params)))




def all_message_permissions(conn: sqlite3.Connection, team_id: int) -> list[dict]:
    return rows_dict(all_rows(conn, """
        SELECT mp.*, u.name AS user_name, u.email AS user_email
        FROM message_permissions mp
        JOIN users u ON u.id=mp.user_id
        WHERE mp.team_id=?
        ORDER BY u.name, mp.tool
    """, (team_id,)))


def users_with_message_permission(conn: sqlite3.Connection, team_id: int, tool: str) -> list[sqlite3.Row]:
    tool = (tool or "generic").strip().lower()
    return all_rows(conn, """
        SELECT DISTINCT u.*
        FROM users u
        LEFT JOIN message_permissions mp ON mp.user_id=u.id AND mp.team_id=u.team_id
        WHERE u.team_id=? AND u.active=1
          AND (u.role IN ('owner','chef','manager','team_leader') OR lower(mp.tool)=lower(?) OR ?='generic')
    """, (team_id, tool, tool))


def notify_category(conn: sqlite3.Connection, team_id: int, title: str, body: str, category: str = "generic", target_user_id: int | None = None) -> None:
    if target_user_id:
        create_notification(conn, team_id, title, body, target_user_id)
        notify_managers(conn, team_id, title, body)
        return
    for row in users_with_message_permission(conn, team_id, category):
        create_notification(conn, team_id, title, body, row["id"])

def has_tool_access(conn: sqlite3.Connection, user: sqlite3.Row, tool: str) -> bool:
    if ROLE_ORDER.get(user["role"], 0) >= ROLE_ORDER["team_leader"]:
        return True
    row = one(
        conn,
        """
        SELECT id FROM access_grants
        WHERE team_id=? AND user_id=? AND tool=? AND expires_at>=?
        LIMIT 1
        """,
        (user["team_id"], user["id"], tool, now_iso()),
    )
    return row is not None


def capabilities_for_user(conn: sqlite3.Connection, user: sqlite3.Row) -> dict:
    leader = ROLE_ORDER.get(user["role"], 0) >= ROLE_ORDER["team_leader"]
    grants = active_access_grants(conn, user["team_id"], user["id"])
    tools = {g["tool"] for g in grants}
    return {
        "is_leader": leader,
        "inventory": leader or "inventory" in tools or "manual_inventory" in tools,
        "manual_inventory": leader or "manual_inventory" in tools,
        "ordering": leader or "ordering" in tools,
        "orders": leader or "ordering" in tools,
        "recipes": leader or "recipes" in tools,
        "scheduler": leader or "scheduler" in tools or "scheduler_read" in tools or "scheduler_write" in tools or "station" in tools,
        "scheduler_read": leader or "scheduler" in tools or "scheduler_read" in tools or "scheduler_write" in tools or "station" in tools,
        "scheduler_write": leader or "scheduler_write" in tools,
        "station": leader or "station" in tools,
        "prep": leader or "prep" in tools,
        "maintenance": leader or "maintenance" in tools,
        "votes": leader or "votes" in tools,
        "manager_notes": leader or "manager_notes" in tools,
        "team_admin": leader,
        "employee_portal": True,
        "station_counts": True,
        "prep_tasks": True,
        "active_grants": grants,
    }


def user_can_access_tool(conn: sqlite3.Connection, user: sqlite3.Row, tool: str) -> bool:
    return bool(capabilities_for_user(conn, user).get(tool))


def station_list(conn: sqlite3.Connection, team_id: int) -> list[str]:
    stations = set()
    try:
        for row in all_rows(conn, "SELECT name AS station FROM stations WHERE team_id=? AND COALESCE(name, '')!=''", (team_id,)):
            stations.add(row["station"])
    except sqlite3.OperationalError:
        pass
    for table, col in [("products", "station"), ("recipes", "station"), ("prep_tasks", "station"), ("users", "station")]:
        try:
            for row in all_rows(conn, f"SELECT DISTINCT {col} AS station FROM {table} WHERE team_id=? AND COALESCE({col}, '')!=''", (team_id,)):
                stations.add(row["station"])
        except sqlite3.OperationalError:
            pass
    return sorted(stations, key=lambda x: x.lower())


def expected_pos_usage_for_product(conn: sqlite3.Connection, team_id: int, product_id: int, count_date: str, service_period: str | None = None) -> dict:
    period = (service_period or "").strip().lower()
    params: list = [team_id, product_id, count_date]
    period_clause = ""
    if period:
        period_clause = " AND lower(COALESCE(ps.service_period, '')) IN ('', lower(?))"
        params.append(period)
    rows = all_rows(
        conn,
        f"""
        SELECT r.name AS recipe_name, SUM(ps.qty_sold) AS qty_sold, r.yield_qty,
               ri.qty, ri.unit, p.unit AS product_unit
        FROM pos_sales ps
        JOIN recipes r ON r.id=ps.recipe_id
        JOIN recipe_items ri ON ri.recipe_id=r.id
        JOIN products p ON p.id=ri.product_id
        WHERE ps.team_id=? AND ri.product_id=? AND ps.sale_date=? {period_clause}
        GROUP BY r.id, r.name, r.yield_qty, ri.qty, ri.unit, p.unit
        ORDER BY qty_sold DESC, r.name
        """,
        tuple(params),
    )
    total = 0.0
    sources = []
    for row in rows:
        per_batch = convert_qty(float(row["qty"] or 0), row["unit"], row["product_unit"])
        if per_batch is None:
            per_batch = float(row["qty"] or 0)
        per_plate = per_batch / (float(row["yield_qty"] or 1) or 1.0)
        use_qty = per_plate * float(row["qty_sold"] or 0)
        total += use_qty
        if use_qty:
            sources.append(f"{row['recipe_name']}: {round(float(row['qty_sold'] or 0), 1)} sold × {round(per_plate, 4)} {row['product_unit']} = {round(use_qty, 3)} {row['product_unit']}")
    return {"total": round(total, 4), "sources": sources}

def calculate_cost_per_unit(package_qty: float, package_unit: str, package_price: float, base_unit: str) -> float:
    package_qty = float(package_qty or 1)
    package_price = float(package_price or 0)
    converted = convert_qty(package_qty, package_unit, base_unit)
    if converted is None or converted <= 0:
        converted = package_qty if package_qty > 0 else 1
    return round(package_price / converted, 6)


def recipe_cost(conn: sqlite3.Connection, team_id: int, recipe_id: int) -> dict:
    recipe = one(conn, "SELECT * FROM recipes WHERE id=? AND team_id=?", (recipe_id, team_id))
    if not recipe:
        raise ValueError("Recipe not found")
    items = all_rows(
        conn,
        """
        SELECT ri.*, p.name AS product_name, p.unit AS product_unit, p.cost_per_unit,
               p.current_qty, p.par_level, p.reorder_point
        FROM recipe_items ri
        JOIN products p ON p.id = ri.product_id
        WHERE ri.recipe_id=? AND ri.team_id=?
        ORDER BY p.name
        """,
        (recipe_id, team_id),
    )
    rows = []
    total = 0.0
    conversion_warnings = []
    for item in items:
        converted = convert_qty(item["qty"], item["unit"], item["product_unit"])
        if converted is None:
            converted = float(item["qty"])
            conversion_warnings.append(f"Could not convert {item['unit']} to {item['product_unit']} for {item['product_name']}; used raw quantity.")
        line_cost = converted * float(item["cost_per_unit"] or 0)
        total += line_cost
        rows.append({
            "id": item["id"],
            "product_id": item["product_id"],
            "product_name": item["product_name"],
            "qty": item["qty"],
            "unit": item["unit"],
            "converted_qty": round(converted, 4),
            "product_unit": item["product_unit"],
            "cost_per_unit": item["cost_per_unit"],
            "line_cost": round(line_cost, 4),
            "prep_note": item["prep_note"],
        })
    yield_qty = float(recipe["yield_qty"] or 1) or 1
    cost_per_plate = total / yield_qty
    food_cost_pct = None
    if float(recipe["menu_price"] or 0) > 0:
        food_cost_pct = cost_per_plate / float(recipe["menu_price"]) * 100.0
    return {
        "recipe": row_dict(recipe),
        "items": rows,
        "total_cost": round(total, 4),
        "cost_per_plate": round(cost_per_plate, 4),
        "food_cost_pct": round(food_cost_pct, 2) if food_cost_pct is not None else None,
        "conversion_warnings": conversion_warnings,
    }


def dish_cost(conn: sqlite3.Connection, team_id: int, dish_id: int) -> dict:
    dish = one(conn, "SELECT * FROM dishes WHERE id=? AND team_id=?", (dish_id, team_id))
    if not dish:
        raise ValueError("Dish not found")
    components = all_rows(conn, "SELECT * FROM dish_components WHERE dish_id=? AND team_id=? ORDER BY id", (dish_id, team_id))
    rows = []
    total = 0.0
    warnings = []
    for component in components:
        ctype = component["component_type"]
        qty_used = float(component["qty"] or 0)
        unit_used = component["unit"] or "each"
        label = "Unknown component"
        line_cost = 0.0
        if ctype == "recipe":
            recipe = one(conn, "SELECT * FROM recipes WHERE id=? AND team_id=?", (component["component_id"], team_id))
            if recipe:
                rcost = recipe_cost(conn, team_id, recipe["id"])
                line_cost = float(rcost.get("cost_per_plate") or 0) * qty_used
                label = recipe["name"]
            else:
                warnings.append(f"Missing recipe component {component['component_id']}")
        elif ctype == "product":
            product = one(conn, "SELECT * FROM products WHERE id=? AND team_id=?", (component["component_id"], team_id))
            if product:
                converted = convert_qty(qty_used, unit_used, product["unit"])
                if converted is None:
                    converted = qty_used
                    warnings.append(f"Could not convert {unit_used} to {product['unit']} for {product['name']}; used raw quantity.")
                line_cost = converted * float(product["cost_per_unit"] or 0)
                label = product["name"]
            else:
                warnings.append(f"Missing product component {component['component_id']}")
        total += line_cost
        rows.append({
            "id": component["id"],
            "component_type": ctype,
            "component_id": component["component_id"],
            "label": label,
            "qty": qty_used,
            "unit": unit_used,
            "line_cost": round(line_cost, 4),
            "portion_note": component["portion_note"],
        })
    food_cost_pct = None
    if float(dish["menu_price"] or 0) > 0:
        food_cost_pct = total / float(dish["menu_price"]) * 100.0
    return {
        "dish": row_dict(dish),
        "components": rows,
        "total_cost": round(total, 4),
        "food_cost_pct": round(food_cost_pct, 2) if food_cost_pct is not None else None,
        "conversion_warnings": warnings,
    }


def optimize_recipe(conn: sqlite3.Connection, team_id: int, recipe_id: int, target_cost: float, target_type: str = "recipe") -> dict:
    cost = recipe_cost(conn, team_id, recipe_id)
    recipe = cost["recipe"]
    current_total = float(cost["total_cost"] or 0)
    if target_type == "plate":
        desired_total = float(target_cost) * float(recipe["yield_qty"] or 1)
    else:
        desired_total = float(target_cost)
    ratio = desired_total / current_total if current_total > 0 else 1.0
    adjusted_items = []
    adjusted_total = 0.0
    for item in cost["items"]:
        adjusted_qty = round_kitchen_measure(float(item["qty"]) * ratio, item["unit"])
        converted = convert_qty(adjusted_qty, item["unit"], item["product_unit"])
        if converted is None:
            converted = adjusted_qty
        line_cost = converted * float(item["cost_per_unit"] or 0)
        adjusted_total += line_cost
        adjusted_items.append({**item, "adjusted_qty": adjusted_qty, "adjusted_line_cost": round(line_cost, 4)})
    yield_qty = float(recipe["yield_qty"] or 1) or 1
    return {
        "recipe_id": recipe_id,
        "target_type": target_type,
        "target_cost": round(float(target_cost), 4),
        "current_total_cost": round(current_total, 4),
        "scale_ratio": round(ratio, 6),
        "adjusted_total_cost": round(adjusted_total, 4),
        "adjusted_cost_per_plate": round(adjusted_total / yield_qty, 4),
        "items": adjusted_items,
        "note": "All ingredient quantities are scaled by the same ratio, then rounded to practical kitchen increments.",
    }


def create_notification(conn: sqlite3.Connection, team_id: int, title: str, body: str, user_id: int | None = None) -> None:
    conn.execute(
        "INSERT INTO notifications (team_id, user_id, title, body, created_at) VALUES (?, ?, ?, ?, ?)",
        (team_id, user_id, title, body, now_iso()),
    )


def notify_managers(conn: sqlite3.Connection, team_id: int, title: str, body: str) -> None:
    managers = all_rows(conn, "SELECT id FROM users WHERE team_id=? AND role IN ('owner','chef','manager','team_leader') AND active=1", (team_id,))
    for manager in managers:
        create_notification(conn, team_id, title, body, manager["id"])


def seed_demo(conn: sqlite3.Connection, team_id: int, owner_id: int) -> None:
    if one(conn, "SELECT id FROM vendors WHERE team_id=? LIMIT 1", (team_id,)):
        return
    created = now_iso()
    vendors = [
        (team_id, "FreshPoint Produce", "Mon,Thu", "Tue,Fri", "21:00", 1, "orders@freshpoint.example", "", "Produce and herbs", created),
        (team_id, "North Coast Provisions", "Mon,Wed,Fri", "Tue,Thu,Sat", "20:00", 1, "orders@northcoast.example", "", "Protein, dairy, dry goods", created),
    ]
    conn.executemany(
        """
        INSERT INTO vendors (team_id, name, order_days, delivery_days, cutoff_time, lead_days, email, phone, notes, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        vendors,
    )
    fp = one(conn, "SELECT id FROM vendors WHERE team_id=? AND name='FreshPoint Produce'", (team_id,))["id"]
    nc = one(conn, "SELECT id FROM vendors WHERE team_id=? AND name='North Coast Provisions'", (team_id,))["id"]
    product_rows = [
        (team_id, fp, "Black Beans #10 Can", "Dry Goods", "cup", 20, 48, 24, 12.875, "#10 can", 8.80, 0, 5, "Pantry", "Supplier unit: #10 can; yields about 12.875 cups", created),
        (team_id, fp, "Romaine Lettuce", "Produce", "head", 18, 30, 20, 24, "case", 42.00, 0, 4, "Cold Prep", "Supplier unit: case; 24 heads", created),
        (team_id, fp, "Asparagus Spears", "Produce", "spear", 180, 240, 120, 120, "box", 68.00, 0, 4, "Grill", "Supplier unit: box; 120 spears", created),
        (team_id, nc, "Flour", "Dry Goods", "cup", 80, 120, 60, 320, "50 lb bag", 24.00, 0, 180, "Bakery", "Supplier unit: 50 lb bag; converted to cups for prototype", created),
        (team_id, nc, "Sugar", "Dry Goods", "cup", 72, 100, 50, 200, "25 lb bag", 18.00, 0, 180, "Bakery", "Supplier unit: 25 lb bag", created),
        (team_id, nc, "Butter", "Dairy", "cup", 24, 40, 20, 8, "case", 31.00, 0, 21, "Bakery", "Supplier unit: case; use recipe units as cups where needed", created),
        (team_id, nc, "Chicken Breast", "Protein", "lb", 22, 45, 25, 40, "case", 96.00, 0, 3, "Grill", "Supplier unit: case; 40 lb", created),
        (team_id, fp, "Lemons", "Produce", "each", 40, 80, 35, 88, "case", 32.00, 0, 14, "Garnish", "Supplier unit: case; 88 count", created),
        (team_id, nc, "Heavy Cream", "Dairy", "qt", 4, 10, 5, 12, "case", 46.00, 0, 7, "Sauce", "Supplier unit: case; 12 qt", created),
        (team_id, fp, "Arugula", "Produce", "lb", 2, 6, 3, 5, "case", 38.00, 0, 3, "Cold Prep", "Supplier unit: case; 5 lb", created),
    ]
    for row in product_rows:
        cost = calculate_cost_per_unit(row[8], row[9], row[10], row[4])
        row = list(row)
        row[11] = cost
        conn.execute(
            """
            INSERT INTO products (team_id, vendor_id, name, category, unit, current_qty, par_level, reorder_point,
                package_qty, package_unit, package_price, cost_per_unit, shelf_life_days, station, notes, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            row,
        )
    def product_id(name: str) -> int:
        return one(conn, "SELECT id FROM products WHERE team_id=? AND name=?", (team_id, name))["id"]
    conn.execute(
        "INSERT INTO recipes (team_id, name, station, yield_qty, portion_unit, menu_price, shelf_life_days, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (team_id, "Taco Salad", "Cold Prep", 24, "plate", 14.00, 2, "Prototype cost card", created),
    )
    taco = one(conn, "SELECT id FROM recipes WHERE team_id=? AND name='Taco Salad'", (team_id,))["id"]
    recipe_items = [
        (team_id, taco, product_id("Black Beans #10 Can"), 6, "cup", "1/4 cup beans per salad × 24 salads"),
        (team_id, taco, product_id("Romaine Lettuce"), 8, "head", "Trim and chop"),
        (team_id, taco, product_id("Lemons"), 6, "each", "Dressing"),
    ]
    conn.executemany("INSERT INTO recipe_items (team_id, recipe_id, product_id, qty, unit, prep_note) VALUES (?, ?, ?, ?, ?, ?)", recipe_items)
    conn.execute(
        "INSERT INTO recipes (team_id, name, station, yield_qty, portion_unit, menu_price, shelf_life_days, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (team_id, "House Shortbread", "Bakery", 36, "piece", 4.00, 5, "Used by target-cost optimizer example", created),
    )
    shortbread = one(conn, "SELECT id FROM recipes WHERE team_id=? AND name='House Shortbread'", (team_id,))["id"]
    conn.executemany(
        "INSERT INTO recipe_items (team_id, recipe_id, product_id, qty, unit, prep_note) VALUES (?, ?, ?, ?, ?, ?)",
        [
            (team_id, shortbread, product_id("Flour"), 1, "cup", ""),
            (team_id, shortbread, product_id("Sugar"), 1, "cup", ""),
            (team_id, shortbread, product_id("Butter"), 1, "cup", ""),
        ],
    )
    conn.execute(
        "INSERT INTO prep_sheets (team_id, title, prep_date, service_period, status, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (team_id, "Tomorrow Dinner Prep", today_iso(), "dinner", "open", owner_id, created),
    )
    sheet_id = one(conn, "SELECT id FROM prep_sheets WHERE team_id=? ORDER BY id DESC LIMIT 1", (team_id,))["id"]
    conn.executemany(
        """
        INSERT INTO prep_tasks (team_id, prep_sheet_id, recipe_id, product_id, title, qty, unit, station, priority, status, due_at, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        [
            (team_id, sheet_id, taco, None, "Make Taco Salad Mise", 48, "plates", "Cold Prep", 1, "todo", "10:00", "Generated from expected covers"),
            (team_id, sheet_id, None, product_id("Lemons"), "Cut Lemon Wedges", 24, "each", "Garnish", 2, "todo", "11:00", "Station setup"),
            (team_id, sheet_id, None, product_id("Asparagus Spears"), "Trim Asparagus", 60, "spear", "Grill", 3, "todo", "12:00", "Watch dinner count"),
        ],
    )
    notify_managers(conn, team_id, "Demo data loaded", "Chef Ledger seeded inventory, recipes, prep tasks, and vendors so you can test the workflow.")


def projected_usage_for_task(conn: sqlite3.Connection, team_id: int, task: sqlite3.Row) -> list[dict]:
    usages = []
    if task["recipe_id"]:
        cost = recipe_cost(conn, team_id, task["recipe_id"])
        recipe = cost["recipe"]
        scale = float(task["qty"] or 0) / float(recipe["yield_qty"] or 1)
        for item in cost["items"]:
            usage_in_product_unit = item["converted_qty"] * scale
            usages.append({
                "product_id": item["product_id"],
                "product_name": item["product_name"],
                "qty": usage_in_product_unit,
                "unit": item["product_unit"],
                "source": task["title"],
            })
    elif task["product_id"]:
        product = one(conn, "SELECT * FROM products WHERE id=? AND team_id=?", (task["product_id"], team_id))
        if product:
            converted = convert_qty(float(task["qty"] or 0), task["unit"], product["unit"])
            if converted is None:
                converted = float(task["qty"] or 0)
            usages.append({
                "product_id": product["id"],
                "product_name": product["name"],
                "qty": converted,
                "unit": product["unit"],
                "source": task["title"],
            })
    return usages




def stock_locations_for_team(conn: sqlite3.Connection, team_id: int) -> list[dict]:
    """Return stock locations in chef-defined COUNT order, with product-derived fallback."""
    saved = rows_dict(all_rows(conn, """
        SELECT id, name, subclass, sort_order, notes
        FROM stock_locations
        WHERE team_id=?
        ORDER BY sort_order ASC, name COLLATE NOCASE
    """, (team_id,)))
    seen = {str(r.get("name") or "").strip().lower() for r in saved}
    product_locs = rows_dict(all_rows(conn, """
        SELECT DISTINCT COALESCE(NULLIF(stock_location,''), NULLIF(stocked_where,''), NULLIF(station,''), 'Unassigned stock area') AS name
        FROM products
        WHERE team_id=?
        ORDER BY name COLLATE NOCASE
    """, (team_id,)))
    next_order = max([int(r.get("sort_order") or 0) for r in saved], default=0) + 1
    for r in product_locs:
        name = str(r.get("name") or "Unassigned stock area").strip() or "Unassigned stock area"
        if name.lower() not in seen:
            saved.append({"id": None, "name": name, "subclass": "From item locations", "sort_order": next_order, "notes": "Auto-discovered from Inventory Item Builder"})
            seen.add(name.lower())
            next_order += 1
    return saved


def count_sheet_data(conn: sqlite3.Connection, team_id: int, forecast_days: float = 7.0) -> dict:
    """Location-based count sheet with estimated usage, par, order math, and vendor grouping."""
    suggestions = build_order_suggestions(conn, team_id, forecast_days)
    suggestion_by_product = {int(s["product_id"]): s for s in suggestions}
    products = rows_dict(all_rows(conn, """
        SELECT p.*, v.name AS vendor_name, v.delivery_days, v.order_days, v.cutoff_time, v.order_days, v.lead_days, v.notes AS vendor_notes
        FROM products p LEFT JOIN vendors v ON v.id=p.vendor_id
        WHERE p.team_id=?
        ORDER BY COALESCE(NULLIF(p.stock_location,''), NULLIF(p.stocked_where,''), NULLIF(p.station,''), 'Unassigned stock area'), p.category, p.name
    """, (team_id,)))
    rows = []
    for p in products:
        pid = int(p["id"])
        sug = suggestion_by_product.get(pid, {})
        current = float(p.get("current_qty") or 0)
        expected = float(sug.get("expected_total_usage") or 0)
        par = float(p.get("par_level") or 0)
        reorder = float(p.get("reorder_point") or 0)
        units_per_order = float(p.get("units_per_min_order") or p.get("package_qty") or 1) or 1
        order_qty = float(sug.get("suggested_order_qty") or 0)
        will_have_after = current - expected + (order_qty * units_per_order)
        two_delivery_use = expected * 2
        projected_after_next_delivery = current - expected
        projected_after_delivery_after_that = current - two_delivery_use + (order_qty * units_per_order)
        location = p.get("stock_location") or p.get("stocked_where") or p.get("station") or "Unassigned stock area"
        risk = "ok"
        if projected_after_next_delivery <= 0:
            risk = "86 risk before next delivery"
        elif projected_after_next_delivery <= reorder:
            risk = "below reorder before next delivery"
        elif projected_after_next_delivery <= par:
            risk = "at/below par before next delivery"
        elif projected_after_delivery_after_that <= par:
            risk = "watch next delivery cycle"
        rows.append({
            "product_id": pid,
            "name": p.get("name"),
            "category": p.get("category") or "",
            "location": location,
            "station": p.get("station") or "",
            "vendor_id": p.get("vendor_id"),
            "vendor_name": p.get("vendor_name") or "Unassigned Vendor",
            "have": round(current, 4),
            "have_unit": p.get("unit") or "each",
            "supplier_unit": p.get("package_unit") or "order unit",
            "min_order_size": round(float(p.get("min_order_size") or 1), 4),
            "units_per_order": round(units_per_order, 4),
            "estimated_use_until_delivery_after_next": round(two_delivery_use, 4),
            "estimated_use_until_next_delivery": round(expected, 4),
            "par": round(par, 4),
            "reorder_point": round(reorder, 4),
            "suggested_order": round(order_qty, 4),
            "par_to_order": "",
            "will_have_after_order_arrives": round(will_have_after, 4),
            "projected_after_next_delivery": round(projected_after_next_delivery, 4),
            "projected_after_delivery_after_that": round(projected_after_delivery_after_that, 4),
            "package_price": round(float(p.get("package_price") or 0), 4),
            "estimated_order_cost": round(order_qty * float(p.get("package_price") or 0), 2),
            "risk": risk,
            "risk_level": "critical" if "86" in risk else "danger" if "below" in risk else "watch" if "watch" in risk or "par" in risk else "ok",
            "delivery_days": p.get("delivery_days") or "",
            "order_days": p.get("order_days") or "",
            "cutoff_time": p.get("cutoff_time") or "",
            "lead_days": p.get("lead_days") or 1,
            "vendor_notes": p.get("vendor_notes") or "",
            "prep_sources": sug.get("prep_sources", []),
            "pos_sources": sug.get("pos_sources", []),
        })
    location_records = stock_locations_for_team(conn, team_id)
    location_order = {str(r.get("name") or "").lower(): i for i, r in enumerate(location_records)}
    locations = [r.get("name") for r in location_records if r.get("name")]
    if not locations:
        locations = sorted({r["location"] for r in rows}, key=lambda x: x.lower())
    vendors = {}
    for r in rows:
        qty_to_order = float(r["suggested_order"] or 0)
        if qty_to_order <= 0 and r["risk_level"] == "ok":
            continue
        vendors.setdefault(r["vendor_name"], []).append(r)
    suggested = [r for r in rows if r["risk_level"] != "ok" or float(r["suggested_order"] or 0) > 0]
    rank_order = {"critical": 0, "danger": 1, "watch": 2, "ok": 3}
    suggested.sort(key=lambda r: (rank_order.get(r["risk_level"], 9), -float(r["estimated_use_until_next_delivery"] or 0), r["name"].lower()))
    return {"locations": locations, "location_records": location_records, "rows": rows, "vendors": vendors, "suggested": suggested, "forecast_days": forecast_days}


def prep_inventory_ledger(conn: sqlite3.Connection, team_id: int) -> dict:
    """Build station-aware inventory tabs: storage, in-use, open prep, total after prep, and par risk."""
    products = all_rows(
        conn,
        """
        SELECT p.*, v.name AS vendor_name
        FROM products p LEFT JOIN vendors v ON v.id=p.vendor_id
        WHERE p.team_id=?
        ORDER BY p.station, p.category, p.name
        """,
        (team_id,),
    )
    open_tasks = all_rows(conn, "SELECT * FROM prep_tasks WHERE team_id=? AND status!='done'", (team_id,))
    open_prep: dict[int, float] = {}
    open_sources: dict[int, list[str]] = {}
    for task in open_tasks:
        for use in projected_usage_for_task(conn, team_id, task):
            pid = int(use["product_id"])
            open_prep[pid] = open_prep.get(pid, 0.0) + float(use["qty"] or 0)
            open_sources.setdefault(pid, []).append(f"{use['source']}: {round(float(use['qty'] or 0), 2)} {use['unit']}")

    # Estimate product quantities currently tied up in active station batches.
    in_use: dict[int, float] = {}
    in_use_sources: dict[int, list[str]] = {}
    batches = all_rows(conn, "SELECT * FROM station_batches WHERE team_id=? AND status='active'", (team_id,))
    for batch in batches:
        station = batch["station"] or "Station"
        if batch["product_id"]:
            product = one(conn, "SELECT * FROM products WHERE id=? AND team_id=?", (batch["product_id"], team_id))
            if product:
                converted = convert_qty(float(batch["qty"] or 0), batch["unit"], product["unit"])
                if converted is None:
                    converted = float(batch["qty"] or 0)
                pid = int(product["id"])
                in_use[pid] = in_use.get(pid, 0.0) + converted
                in_use_sources.setdefault(pid, []).append(f"{station} batch: {round(converted, 2)} {product['unit']}")
        elif batch["recipe_id"]:
            recipe = one(conn, "SELECT * FROM recipes WHERE id=? AND team_id=?", (batch["recipe_id"], team_id))
            if not recipe:
                continue
            cost = recipe_cost(conn, team_id, int(recipe["id"]))
            scale = float(batch["qty"] or 0) / (float(recipe["yield_qty"] or 1) or 1.0)
            for item in cost["items"]:
                qty_used = float(item["converted_qty"] or 0) * scale
                pid = int(item["product_id"])
                in_use[pid] = in_use.get(pid, 0.0) + qty_used
                in_use_sources.setdefault(pid, []).append(f"{station}: {recipe['name']} uses {round(qty_used, 2)} {item['product_unit']}")

    rows = []
    for p in products:
        pid = int(p["id"])
        storage_qty = float(p["current_qty"] or 0)
        in_use_qty = float(in_use.get(pid, 0.0))
        prep_qty = float(open_prep.get(pid, 0.0))
        total_after_prep = storage_qty + in_use_qty - prep_qty
        par = float(p["par_level"] or 0)
        reorder = float(p["reorder_point"] or 0)
        risk = "critical" if total_after_prep <= 0 else "below_reorder" if total_after_prep <= reorder else "below_par" if total_after_prep <= par else "ok"
        rows.append({
            "product_id": pid,
            "name": p["name"],
            "category": p["category"],
            "station": p["station"],
            "vendor_name": p["vendor_name"] or "Unassigned",
            "unit": p["unit"],
            "storage_qty": round(storage_qty, 4),
            "in_use_qty": round(in_use_qty, 4),
            "prep_estimated_qty": round(prep_qty, 4),
            "total_after_prep_qty": round(total_after_prep, 4),
            "par_level": round(par, 4),
            "reorder_point": round(reorder, 4),
            "risk": risk,
            "in_use_sources": in_use_sources.get(pid, []),
            "prep_sources": open_sources.get(pid, []),
        })
    by_station: dict[str, list[dict]] = {}
    for row in rows:
        by_station.setdefault(row["station"] or "Unassigned station", []).append(row)
    return {
        "rows": rows,
        "by_station": by_station,
        "par_risk": [r for r in rows if r["risk"] != "ok"],
        "summary": {
            "products": len(rows),
            "below_par": sum(1 for r in rows if r["risk"] in ("below_par", "below_reorder", "critical")),
            "critical": sum(1 for r in rows if r["risk"] == "critical"),
            "open_prep_items": sum(1 for r in rows if r["prep_estimated_qty"] > 0),
        },
    }


def build_manager_preplist(conn: sqlite3.Connection, team_id: int, user: sqlite3.Row) -> dict:
    """Station-grouped manager prep list with simple POS-informed suggested ranking."""
    tasks = rows_dict(all_rows(conn, """
        SELECT pt.*, u.name AS assigned_name, ps.prep_date, ps.service_period
        FROM prep_tasks pt
        JOIN prep_sheets ps ON ps.id=pt.prep_sheet_id
        LEFT JOIN users u ON u.id=pt.assigned_to
        WHERE pt.team_id=? AND pt.status!='done'
        ORDER BY pt.station, pt.priority, pt.due_at, pt.title
    """, (team_id,)))
    # Upcoming schedule employees: used by ASSIGN dropdown on manager preplist.
    week_start, week_end = week_bounds(None)
    scheduled = rows_dict(all_rows(conn, """
        SELECT s.*, u.name AS assigned_name, u.schedule_color
        FROM shifts s JOIN users u ON u.id=s.assigned_to
        WHERE s.team_id=? AND s.start_at>=? AND s.start_at<? AND s.status='assigned'
        ORDER BY s.start_at, u.name
    """, (team_id, week_start, week_end)))
    scheduled_users = {}
    for srow in scheduled:
        st = srow.get("station") or "Unassigned"
        scheduled_users.setdefault(st, [])
        if not any(str(x["id"]) == str(srow["assigned_to"]) for x in scheduled_users[st]):
            scheduled_users[st].append({"id": srow["assigned_to"], "name": srow["assigned_name"], "schedule_color": srow.get("schedule_color") or "#8b7cf6"})
    users = rows_dict(all_rows(conn, "SELECT id, name, station, qualified_stations, schedule_color FROM users WHERE team_id=? AND active=1 ORDER BY name", (team_id,)))
    for task in tasks:
        priority = int(task.get("priority") or 4)
        service = (task.get("service_period") or "").lower()
        station = task.get("station") or "Unassigned"
        # Lower number = more urgent. Next shift/lunch/brunch generally beats dinner when both are open.
        service_rank = {"breakfast": 0, "brunch": 0, "lunch": 1, "prep": 1, "dinner": 2, "close": 3, "all-day": 1}.get(service, 2)
        task["suggested_rank"] = max(1, min(5, priority + service_rank))
        task["need_by_label"] = f"{task.get('prep_date') or today_iso()} · {task.get('service_period') or 'next shift'}"
        task["station_schedule_candidates"] = scheduled_users.get(station, [])
        if not task["station_schedule_candidates"]:
            # fallback to qualified station users
            station_l = station.lower()
            candidates = []
            for u in users:
                q = [x.strip().lower() for x in (u.get("qualified_stations") or "").split(",") if x.strip()]
                if station_l in q or station_l == (u.get("station") or "").lower():
                    candidates.append({"id": u["id"], "name": u["name"], "schedule_color": u.get("schedule_color") or "#8b7cf6"})
            task["station_schedule_candidates"] = candidates
    by_station: dict[str, list[dict]] = {}
    for t in tasks:
        by_station.setdefault(t.get("station") or "Unassigned", []).append(t)
    return {"tasks": tasks, "by_station": by_station, "scheduled_users": scheduled_users}


def station_prep_options(conn: sqlite3.Connection, team_id: int, station: str) -> dict:
    """Build chef-facing station prep options from Menu Items / Plates first."""
    station = (station or "").strip()
    if not station:
        return {"station": station, "plates": [], "recipes": [], "products": []}

    plates = rows_dict(all_rows(conn, "SELECT * FROM dishes WHERE team_id=? AND lower(COALESCE(station,''))=lower(?) ORDER BY name", (team_id, station)))
    recipe_map: dict[int, dict] = {}
    product_map: dict[int, dict] = {}

    for plate in plates:
        comps = all_rows(conn, "SELECT * FROM dish_components WHERE team_id=? AND dish_id=?", (team_id, plate["id"]))
        for comp in comps:
            ctype = comp["component_type"]
            cid = int(comp["component_id"])
            if ctype == "recipe":
                rec = one(conn, "SELECT * FROM recipes WHERE id=? AND team_id=?", (cid, team_id))
                if not rec:
                    continue
                entry = recipe_map.setdefault(cid, dict(rec))
                entry.setdefault("source_plates", []).append(plate["name"])
                entry["default_qty"] = max(float(entry.get("default_qty") or 0), float(comp["qty"] or rec["yield_qty"] or 1))
                entry["unit"] = comp["unit"] or rec["portion_unit"] or "servings"
            elif ctype == "product":
                prod = one(conn, "SELECT p.*, v.name AS vendor_name FROM products p LEFT JOIN vendors v ON v.id=p.vendor_id WHERE p.id=? AND p.team_id=?", (cid, team_id))
                if not prod:
                    continue
                entry = product_map.setdefault(cid, dict(prod))
                entry.setdefault("source_plates", []).append(plate["name"])
                entry["default_qty"] = max(float(entry.get("default_qty") or 0), float(comp["qty"] or 1))
                entry["unit"] = comp["unit"] or prod["unit"] or "each"

    direct_recipes = rows_dict(all_rows(conn, "SELECT * FROM recipes WHERE team_id=? AND lower(COALESCE(station,''))=lower(?) ORDER BY name", (team_id, station)))
    for rec in direct_recipes:
        entry = recipe_map.setdefault(int(rec["id"]), dict(rec))
        entry.setdefault("source_plates", [])
        entry.setdefault("default_qty", float(rec.get("yield_qty") or 1))
        entry.setdefault("unit", rec.get("portion_unit") or "servings")

    direct_products = rows_dict(all_rows(conn, "SELECT p.*, v.name AS vendor_name FROM products p LEFT JOIN vendors v ON v.id=p.vendor_id WHERE p.team_id=? AND lower(COALESCE(p.station,''))=lower(?) ORDER BY p.category, p.name", (team_id, station)))
    for prod in direct_products:
        entry = product_map.setdefault(int(prod["id"]), dict(prod))
        entry.setdefault("source_plates", [])
        entry.setdefault("default_qty", 1.0)
        entry.setdefault("unit", prod.get("unit") or "each")

    recipes = list(recipe_map.values())
    products = list(product_map.values())
    for r in recipes:
        try:
            r["cost"] = recipe_cost(conn, team_id, int(r["id"]))
        except Exception:
            r["cost"] = {}
        r["source_plates"] = sorted(set(r.get("source_plates") or []))
    for p in products:
        p["source_plates"] = sorted(set(p.get("source_plates") or []))
    return {"station": station, "plates": plates, "recipes": recipes, "products": products}


def station_prep_template(conn: sqlite3.Connection, team_id: int, station: str) -> dict:
    station = (station or "").strip()
    saved = rows_dict(all_rows(conn, "SELECT * FROM prep_station_template_items WHERE team_id=? AND lower(station)=lower(?) AND active=1 ORDER BY item_kind, id", (team_id, station)))
    if not saved:
        options = station_prep_options(conn, team_id, station)
        rows = []
        for r in options.get("recipes", []):
            rows.append({"kind": "recipe", "id": r["id"], "name": r["name"], "category": "Recipe", "station": r.get("station") or station, "unit": r.get("unit") or r.get("portion_unit") or "servings", "default_qty": r.get("default_qty") or r.get("yield_qty") or 1, "min_station_qty": 0, "min_station_unit": r.get("station_container") or r.get("container_size_unit") or r.get("portion_unit") or "container", "source_plates": r.get("source_plates") or [], "cost": r.get("cost") or {}})
        for p in options.get("products", []):
            rows.append({"kind": "product", "id": p["id"], "name": p["name"], "category": p.get("category") or "Item", "station": p.get("station") or station, "unit": p.get("unit") or "each", "default_qty": p.get("default_qty") or 1, "min_station_qty": 0, "min_station_unit": p.get("unit") or "each", "source_plates": p.get("source_plates") or [], "current_qty": p.get("current_qty") or 0})
        return {"station": station, "source": "auto-from-plates", "items": rows, "plates": options.get("plates", [])}

    rows = []
    for t in saved:
        kind = t["item_kind"]
        source_id = int(t["source_id"])
        if kind == "recipe":
            rec = one(conn, "SELECT * FROM recipes WHERE id=? AND team_id=?", (source_id, team_id))
            if not rec:
                continue
            item = {"kind": "recipe", "id": rec["id"], "name": rec["name"], "category": "Recipe", "station": rec["station"] or station, "unit": t["unit"] or rec["portion_unit"] or "servings", "default_qty": float(t["default_qty"] or 1), "min_station_qty": float(t["min_station_qty"] or 0), "min_station_unit": t["min_station_unit"] or rec["station_container"] or rec["container_size_unit"] or rec["portion_unit"] or "container", "source_plates": json.loads(t["source_plates"] or "[]"), "cost": recipe_cost(conn, team_id, int(rec["id"]))}
        else:
            prod = one(conn, "SELECT * FROM products WHERE id=? AND team_id=?", (source_id, team_id))
            if not prod:
                continue
            item = {"kind": "product", "id": prod["id"], "name": prod["name"], "category": prod["category"] or "Item", "station": prod["station"] or station, "unit": t["unit"] or prod["unit"] or "each", "default_qty": float(t["default_qty"] or 1), "min_station_qty": float(t["min_station_qty"] or 0), "min_station_unit": t["min_station_unit"] or prod["unit"] or "each", "source_plates": json.loads(t["source_plates"] or "[]"), "current_qty": prod["current_qty"]}
        rows.append(item)
    return {"station": station, "source": "saved-template", "items": rows, "plates": []}


def urgency_to_priority(flags: dict) -> int:
    if flags.get("is_86"):
        return 1
    if flags.get("need_before_start"):
        return 1
    if flags.get("expiring_soon"):
        return 2
    if flags.get("watch_list"):
        return 3
    return 4


def urgency_notes(flags: dict) -> str:
    labels = []
    if flags.get("is_86"):
        labels.append("86")
    if flags.get("need_before_start"):
        labels.append("NEED BEFORE START OF SHIFT")
    if flags.get("watch_list"):
        labels.append("WATCH-LIST")
    if flags.get("expiring_soon"):
        labels.append("EXPIRING SOON")
    return ", ".join(labels)


def replace_master_prep_sheet_from_template(conn: sqlite3.Connection, team_id: int, station: str, selections: list[dict], user_id: int) -> dict:
    """Create/replace the station MASTER PREPSHEET from checked BUILD PREP rows.

    The master sheet is a live planning object: tasks on it remain open and therefore
    feed PREP ESTIMATOR, ON HAND/TOTAL inventory math, PAR risk, and order suggestions.
    Actual raw-stock deduction still happens when a prep task is completed; before that,
    inventory views show it as prep-estimated usage so chefs can order ahead without
    physically removing product too early.
    """
    station_clean = (station or "").strip()
    if not station_clean:
        return {"master_sheet_id": None, "task_count": 0}
    existing = all_rows(
        conn,
        """
        SELECT id FROM prep_sheets
        WHERE team_id=? AND status='master' AND lower(title)=lower(?)
        """,
        (team_id, f"MASTER PREPSHEET · {station_clean}"),
    )
    for row in existing:
        conn.execute("DELETE FROM prep_sheets WHERE id=? AND team_id=?", (row["id"], team_id))
    conn.execute(
        """
        INSERT INTO prep_sheets (team_id, title, prep_date, service_period, status, created_by, created_at)
        VALUES (?, ?, ?, 'master', 'master', ?, ?)
        """,
        (team_id, f"MASTER PREPSHEET · {station_clean}", today_iso(), user_id, now_iso()),
    )
    sheet_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    task_count = 0
    for sel in selections:
        kind = sel.get("kind")
        source_id = int(sel.get("id") or 0)
        if kind not in ("recipe", "product") or source_id <= 0:
            continue
        qty = float(sel.get("qty") or 1)
        unit = sel.get("unit") or "each"
        plates = sel.get("source_plates") or []
        plate_note = f"Source plates: {', '.join(plates)}" if plates else "Generated from BUILD PREP station template."
        if kind == "recipe":
            recipe = one(conn, "SELECT * FROM recipes WHERE id=? AND team_id=?", (source_id, team_id))
            if not recipe:
                continue
            title = f"MASTER · Prep {recipe['name']}"
            conn.execute(
                """
                INSERT INTO prep_tasks (team_id, prep_sheet_id, recipe_id, product_id, title, qty, unit, station, assigned_to, priority, status, due_at, notes)
                VALUES (?, ?, ?, NULL, ?, ?, ?, ?, NULL, 3, 'todo', '', ?)
                """,
                (team_id, sheet_id, source_id, title, qty, unit or recipe["portion_unit"] or "servings", station_clean, plate_note),
            )
        else:
            product = one(conn, "SELECT * FROM products WHERE id=? AND team_id=?", (source_id, team_id))
            if not product:
                continue
            title = f"MASTER · Prep / stock {product['name']}"
            conn.execute(
                """
                INSERT INTO prep_tasks (team_id, prep_sheet_id, recipe_id, product_id, title, qty, unit, station, assigned_to, priority, status, due_at, notes)
                VALUES (?, ?, NULL, ?, ?, ?, ?, ?, NULL, 3, 'todo', '', ?)
                """,
                (team_id, sheet_id, source_id, title, qty, unit or product["unit"], station_clean, plate_note),
            )
        task_count += 1
    return {"master_sheet_id": sheet_id, "task_count": task_count}


def complete_prep_task_now(conn: sqlite3.Connection, team_id: int, task_id: int, user_id: int, made_at: str | None = None) -> list[dict]:
    task = one(conn, "SELECT * FROM prep_tasks WHERE id=? AND team_id=?", (task_id, team_id))
    if not task:
        return []
    usages = projected_usage_for_task(conn, team_id, task)
    for use in usages:
        product = one(conn, "SELECT * FROM products WHERE id=? AND team_id=?", (use["product_id"], team_id))
        if not product:
            continue
        new_qty = float(product["current_qty"] or 0) - float(use["qty"] or 0)
        conn.execute("UPDATE products SET current_qty=?, updated_at=? WHERE id=?", (new_qty, now_iso(), product["id"]))
        conn.execute(
            "INSERT INTO inventory_transactions (team_id, product_id, user_id, change_qty, type, reason, related_type, related_id, created_at) VALUES (?, ?, ?, ?, 'prep_usage', ?, 'prep_task', ?, ?)",
            (team_id, product["id"], user_id, -float(use["qty"] or 0), task["title"], task_id, now_iso()),
        )
    made_at = made_at or now_iso()
    recipe_id = task["recipe_id"]
    product_id = task["product_id"]
    shelf_days = 3
    if recipe_id:
        r = one(conn, "SELECT shelf_life_days FROM recipes WHERE id=? AND team_id=?", (recipe_id, team_id))
        shelf_days = int((r and r["shelf_life_days"]) or 3)
    elif product_id:
        p = one(conn, "SELECT shelf_life_days FROM products WHERE id=? AND team_id=?", (product_id, team_id))
        shelf_days = int((p and p["shelf_life_days"]) or 3)
    try:
        expires = (datetime.fromisoformat(made_at.replace("Z", "+00:00")) + timedelta(days=shelf_days)).replace(microsecond=0).isoformat()
    except Exception:
        expires = (datetime.now(timezone.utc) + timedelta(days=shelf_days)).replace(microsecond=0).isoformat()
    conn.execute("UPDATE prep_tasks SET status='done', completed_by=?, completed_at=?, made_at=?, expires_at=? WHERE id=?", (user_id, now_iso(), made_at, expires, task_id))
    conn.execute(
        "INSERT INTO station_batches (team_id, product_id, recipe_id, prep_task_id, station, qty, unit, made_at, expires_at, created_by, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (team_id, product_id, recipe_id, task_id, task["station"], float(task["qty"] or 1), task["unit"], made_at, expires, user_id, task["title"]),
    )
    return usages

def parse_weekdays(days_text: str | None) -> list[int]:
    day_lookup = {
        "mon": 0, "monday": 0,
        "tue": 1, "tues": 1, "tuesday": 1,
        "wed": 2, "wednesday": 2,
        "thu": 3, "thur": 3, "thurs": 3, "thursday": 3,
        "fri": 4, "friday": 4,
        "sat": 5, "saturday": 5,
        "sun": 6, "sunday": 6,
    }
    found: list[int] = []
    raw = (days_text or "").replace("/", ",").replace(";", ",").split(",")
    for token in raw:
        key = token.strip().lower()
        if key in day_lookup and day_lookup[key] not in found:
            found.append(day_lookup[key])
    return found


def expected_delivery_for_vendor(vendor: sqlite3.Row | None) -> str:
    today = datetime.now().date()
    if vendor:
        delivery_weekdays = parse_weekdays(vendor["delivery_days"])
        if delivery_weekdays:
            for offset in range(1, 15):
                candidate = today + timedelta(days=offset)
                if candidate.weekday() in delivery_weekdays:
                    return candidate.isoformat()
        lead_days = int(vendor["lead_days"] or 1)
    else:
        lead_days = 1
    return (today + timedelta(days=max(1, lead_days))).isoformat()


def days_until_date(date_text: str | None) -> float:
    try:
        target = datetime.fromisoformat((date_text or "").split("T")[0]).date()
        return float(max(1, (target - datetime.now().date()).days))
    except Exception:
        return 1.0


def is_whole_supplier_unit(unit: str | None) -> bool:
    unit_n = normalize_unit(unit)
    whole_tokens = ("case", "box", "can", "bunch", "bag", "head", "each", "ea", "spear", "jar", "tub", "tray", "bottle", "#10")
    return unit_family(unit_n) == "count" or any(token in unit_n for token in whole_tokens)


def round_supplier_order_qty(qty: float, supplier_unit: str | None) -> float:
    qty = max(0.0, float(qty or 0))
    if qty <= 0:
        return 0.0
    if is_whole_supplier_unit(supplier_unit):
        return float(math.ceil(qty))
    # Many vendors can sell weight/volume items in quarter-unit increments.
    return round(math.ceil(qty * 4.0) / 4.0, 4)


def pack_contains_base_qty(product: sqlite3.Row) -> float:
    package_qty = float(product["package_qty"] or 1)
    converted = convert_qty(package_qty, product["package_unit"], product["unit"])
    if converted is None or converted <= 0:
        converted = package_qty if package_qty > 0 else 1.0
    return float(converted)


def supplier_unit_label(product: sqlite3.Row) -> str:
    return product["package_unit"] or product["unit"] or "each"


def forecast_product_usage_detail(conn: sqlite3.Connection, team_id: int, product_id: int, days: float) -> dict:
    since = (datetime.now().date() - timedelta(days=28)).isoformat()
    rows = all_rows(
        conn,
        """
        SELECT r.name AS recipe_name, SUM(ps.qty_sold) AS qty_sold, r.yield_qty,
               ri.qty, ri.unit, p.unit AS product_unit
        FROM pos_sales ps
        JOIN recipes r ON r.id = ps.recipe_id
        JOIN recipe_items ri ON ri.recipe_id = r.id
        JOIN products p ON p.id = ri.product_id
        WHERE ps.team_id=? AND ri.product_id=? AND ps.sale_date>=?
        GROUP BY r.id, r.name, r.yield_qty, ri.qty, ri.unit, p.unit
        ORDER BY qty_sold DESC, r.name
        """,
        (team_id, product_id, since),
    )
    total = 0.0
    sources: list[str] = []
    for row in rows:
        per_batch = convert_qty(float(row["qty"] or 0), row["unit"], row["product_unit"])
        if per_batch is None:
            per_batch = float(row["qty"] or 0)
        yield_qty = float(row["yield_qty"] or 1) or 1.0
        per_plate = per_batch / yield_qty
        expected_plates = float(row["qty_sold"] or 0) / 28.0 * float(days or 1)
        use_qty = per_plate * expected_plates
        total += use_qty
        if expected_plates > 0 and use_qty > 0:
            sources.append(
                f"{row['recipe_name']}: {round(expected_plates, 1)} plates × {round(per_plate, 4)} {row['product_unit']} = {round(use_qty, 2)} {row['product_unit']}"
            )
    return {"total": total, "sources": sources}


def forecast_product_usage(conn: sqlite3.Connection, team_id: int, product_id: int, days: float) -> float:
    return float(forecast_product_usage_detail(conn, team_id, product_id, days)["total"] or 0)


def build_order_suggestions(conn: sqlite3.Connection, team_id: int, forecast_days: float = 3.0, delivery_date: str | None = None) -> list[dict]:
    products = all_rows(
        conn,
        """
        SELECT p.*, v.name AS vendor_name, v.lead_days, v.delivery_days, v.order_days, v.cutoff_time
        FROM products p LEFT JOIN vendors v ON v.id=p.vendor_id
        WHERE p.team_id=?
        ORDER BY COALESCE(v.name,''), p.category, p.name
        """,
        (team_id,),
    )
    pending_tasks = all_rows(conn, "SELECT * FROM prep_tasks WHERE team_id=? AND status!='done'", (team_id,))
    pending_usage: dict[int, float] = {}
    pending_sources: dict[int, list[str]] = {}
    for task in pending_tasks:
        for use in projected_usage_for_task(conn, team_id, task):
            pid = int(use["product_id"])
            pending_usage[pid] = pending_usage.get(pid, 0.0) + float(use["qty"] or 0)
            pending_sources.setdefault(pid, []).append(f"{use['source']}: {round(use['qty'], 2)} {use['unit']}")
    try:
        impact_rows = all_rows(conn, """
            SELECT fi.*, e.title AS event_title
            FROM forecast_inventory_impacts fi
            JOIN forecast_prep_events e ON e.id=fi.event_id
            WHERE fi.team_id=? AND e.status='active'
        """, (team_id,))
        for imp in impact_rows:
            pid = int(imp["product_id"])
            pending_usage[pid] = pending_usage.get(pid, 0.0) + float(imp["qty"] or 0)
            pending_sources.setdefault(pid, []).append(f"FORECASTER {imp['source_plate']}: {round(float(imp['qty'] or 0), 2)} {imp['unit']}")
    except sqlite3.OperationalError:
        pass

    suggestions = []
    for p in products:
        pid = int(p["id"])
        vendor = one(conn, "SELECT * FROM vendors WHERE id=? AND team_id=?", (p["vendor_id"], team_id)) if p["vendor_id"] else None
        item_delivery_date = delivery_date or expected_delivery_for_vendor(vendor)
        days_to_delivery = max(float(forecast_days or 1), days_until_date(item_delivery_date))
        prep_use = pending_usage.get(pid, 0.0)
        forecast_detail = forecast_product_usage_detail(conn, team_id, pid, days_to_delivery)
        forecast_use = float(forecast_detail["total"] or 0)
        expected_total_use = prep_use + forecast_use
        current_qty = float(p["current_qty"] or 0)
        projected = current_qty - expected_total_use
        par_level = float(p["par_level"] or 0)
        reorder_point = float(p["reorder_point"] or 0)
        target = max(par_level, reorder_point)
        suggested_base_qty = max(0.0, target - projected)
        pack_qty = pack_contains_base_qty(p)
        supplier_unit = supplier_unit_label(p)
        suggested_supplier_qty = round_supplier_order_qty(suggested_base_qty / pack_qty if pack_qty > 0 else suggested_base_qty, supplier_unit)
        projected_after_order = projected + suggested_supplier_qty * pack_qty
        below_par_after_prep = projected < par_level
        below_reorder = projected < reorder_point
        risk = "critical" if projected <= 0 else "below_reorder" if below_reorder else "below_par" if below_par_after_prep else "watchlist"
        if suggested_supplier_qty > 0 or below_par_after_prep or below_reorder:
            suggestions.append({
                "product_id": pid,
                "product_name": p["name"],
                "category": p["category"],
                "unit": p["unit"],
                "base_unit": p["unit"],
                "vendor_id": p["vendor_id"],
                "vendor_name": p["vendor_name"] or "Unassigned Vendor",
                "delivery_date": item_delivery_date,
                "days_until_delivery": round(days_to_delivery, 2),
                "current_qty": round(current_qty, 4),
                "par_level": round(par_level, 4),
                "reorder_point": round(reorder_point, 4),
                "pending_prep_usage": round(prep_use, 4),
                "forecast_usage": round(forecast_use, 4),
                "expected_total_usage": round(expected_total_use, 4),
                "projected_qty": round(projected, 4),
                "suggested_base_qty": round(suggested_base_qty, 4),
                "suggested_order_qty": round(suggested_supplier_qty, 4),
                "supplier_unit": supplier_unit,
                "pack_size_qty": round(pack_qty, 4),
                "pack_size_unit": p["unit"],
                "package_price": round(float(p["package_price"] or 0), 4),
                "cost_per_unit": p["cost_per_unit"],
                "unit_cost": round(float(p["package_price"] or 0), 4),
                "projected_after_order": round(projected_after_order, 4),
                "prep_sources": pending_sources.get(pid, []),
                "pos_sources": forecast_detail["sources"],
                "risk": risk,
            })
    return suggestions


def parse_dt(value: str | None) -> datetime | None:
    if not value:
        return None
    text = str(value).strip()
    if not text:
        return None
    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        try:
            return datetime.strptime(text, "%Y-%m-%d %H:%M")
        except ValueError:
            return None


def local_week_start(date_text: str | None = None) -> str:
    if date_text:
        try:
            base = datetime.fromisoformat(date_text.split("T")[0]).date()
        except ValueError:
            base = datetime.now().date()
    else:
        base = datetime.now().date()
    monday = base - timedelta(days=base.weekday())
    return monday.isoformat()


def overlap_minutes(start_a: str, end_a: str, start_b: str, end_b: str) -> float:
    a1, a2, b1, b2 = parse_dt(start_a), parse_dt(end_a), parse_dt(start_b), parse_dt(end_b)
    if not all([a1, a2, b1, b2]):
        return 0.0
    latest_start = max(a1, b1)
    earliest_end = min(a2, b2)
    seconds = (earliest_end - latest_start).total_seconds()
    return max(0.0, seconds / 60.0)


def range_fully_covers(outer_start: str, outer_end: str, inner_start: str, inner_end: str) -> bool:
    outer_a, outer_b, inner_a, inner_b = parse_dt(outer_start), parse_dt(outer_end), parse_dt(inner_start), parse_dt(inner_end)
    if not all([outer_a, outer_b, inner_a, inner_b]):
        return False
    return outer_a <= inner_a and outer_b >= inner_b


def shift_hours(start_at: str, end_at: str) -> float:
    start, end = parse_dt(start_at), parse_dt(end_at)
    if not start or not end:
        return 0.0
    return max(0.0, (end - start).total_seconds() / 3600.0)


DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


def normalize_time(value: str | None) -> str | None:
    if not value:
        return None
    text = str(value).strip()
    if not text:
        return None
    try:
        parts = text.split(":")
        hour = int(parts[0])
        minute = int(parts[1]) if len(parts) > 1 else 0
        if 0 <= hour <= 23 and 0 <= minute <= 59:
            return f"{hour:02d}:{minute:02d}"
    except Exception:
        return None
    return None


def weekly_pattern_to_range(pattern: sqlite3.Row | dict, week_start: str) -> tuple[str, str]:
    base = datetime.fromisoformat(week_start).date()
    day_index = int(pattern["day_of_week"] or 0)
    date_value = base + timedelta(days=day_index)
    start_time = normalize_time(pattern["start_time"]) or "09:00"
    end_time = normalize_time(pattern["end_time"]) or "17:00"
    start_at = datetime.fromisoformat(f"{date_value.isoformat()}T{start_time}")
    end_at = datetime.fromisoformat(f"{date_value.isoformat()}T{end_time}")
    if end_at <= start_at:
        end_at += timedelta(days=1)
    return start_at.strftime("%Y-%m-%dT%H:%M"), end_at.strftime("%Y-%m-%dT%H:%M")


def expand_weekly_patterns(conn: sqlite3.Connection, team_id: int, week_start: str, status: str) -> list[dict]:
    rows = all_rows(
        conn,
        """
        SELECT ewa.*, u.name AS user_name
        FROM employee_weekly_availability ewa JOIN users u ON u.id=ewa.user_id
        WHERE ewa.team_id=? AND ewa.status=? AND u.active=1
        ORDER BY ewa.day_of_week, ewa.start_time, u.name
        """,
        (team_id, status),
    )
    expanded: list[dict] = []
    for r in rows:
        start_at, end_at = weekly_pattern_to_range(r, week_start)
        label = r["label"] or r["shift_label"] or ("Can work" if status == "can_work" else "Unavailable")
        item = dict(r)
        item.update({
            "source": "weekly",
            "weekly_id": r["id"],
            "pattern_id": r["id"],
            "day_name": DAY_NAMES[int(r["day_of_week"] or 0) % 7],
            "start_at": start_at,
            "end_at": end_at,
        })
        if status == "can_work":
            item["label"] = label
        else:
            item["reason"] = label
        expanded.append(item)
    return expanded


def weekly_patterns_for_team(conn: sqlite3.Connection, team_id: int) -> list[dict]:
    rows = rows_dict(all_rows(
        conn,
        """
        SELECT ewa.*, u.name AS user_name
        FROM employee_weekly_availability ewa JOIN users u ON u.id=ewa.user_id
        WHERE ewa.team_id=? AND u.active=1
        ORDER BY u.name, ewa.day_of_week, ewa.start_time
        """,
        (team_id,),
    ))
    for r in rows:
        r["day_name"] = DAY_NAMES[int(r.get("day_of_week") or 0) % 7]
        r["source"] = "weekly"
    return rows


def week_bounds(week_start_text: str | None = None) -> tuple[str, str]:
    start = local_week_start(week_start_text)
    start_date = datetime.fromisoformat(start).date()
    end_date = start_date + timedelta(days=7)
    return start_date.isoformat(), end_date.isoformat()



def overlaps(start_a: str | None, end_a: str | None, start_b: str | None, end_b: str | None) -> bool:
    try:
        a0 = datetime.fromisoformat(str(start_a))
        a1 = datetime.fromisoformat(str(end_a))
        b0 = datetime.fromisoformat(str(start_b))
        b1 = datetime.fromisoformat(str(end_b))
        return a0 < b1 and b0 < a1
    except Exception:
        return False



def same_shift_label(title: str, label: str) -> bool:
    if not label:
        return True
    return label.strip().lower() in str(title or "").strip().lower()



def user_eligible_for_shift(schedule: dict, emp: dict, shift: dict) -> bool:
    def csv_parts(value):
        return [x.strip().lower() for x in str(value or '').split(',') if x.strip()]
    station = str(shift.get('station') or '').strip().lower()
    title = str(shift.get('title') or '').split('—')[0].strip().lower()
    qualified = csv_parts(emp.get('qualified_stations') or emp.get('station'))
    eligible_shifts = csv_parts(emp.get('eligible_shifts'))
    if qualified and station and station not in qualified and not any(station in q for q in qualified):
        return False
    if eligible_shifts and title and title not in eligible_shifts and 'any' not in eligible_shifts and 'any shift' not in eligible_shifts and 'manager coverage' not in eligible_shifts:
        return False
    off = [b for b in schedule.get('unavailable', []) if int(b.get('user_id') or 0) == int(emp.get('id') or 0) and overlaps(shift.get('start_at'), shift.get('end_at'), b.get('start_at'), b.get('end_at'))]
    if off:
        return False
    can = [b for b in schedule.get('available', []) if int(b.get('user_id') or 0) == int(emp.get('id') or 0)]
    if can and not any(overlaps(shift.get('start_at'), shift.get('end_at'), b.get('start_at'), b.get('end_at')) for b in can):
        return False
    return True

def build_week_schedule(conn: sqlite3.Connection, team_id: int, week_start_text: str | None = None) -> dict:
    week_start, week_end = week_bounds(week_start_text)
    start_dt = datetime.fromisoformat(week_start)
    days = [(start_dt + timedelta(days=i)).date().isoformat() for i in range(7)]
    users = [user_public(u) for u in all_rows(conn, "SELECT * FROM users WHERE team_id=? AND active=1 ORDER BY name", (team_id,))]
    shifts = rows_dict(all_rows(
        conn,
        """
        SELECT s.*, u.name AS assigned_name
        FROM shifts s LEFT JOIN users u ON u.id=s.assigned_to
        WHERE s.team_id=? AND s.start_at>=? AND s.start_at<?
        ORDER BY s.start_at, s.station, s.title
        """,
        (team_id, week_start, week_end),
    ))
    available = rows_dict(all_rows(
        conn,
        """
        SELECT ea.*, u.name AS user_name, 'date' AS source
        FROM employee_availability ea JOIN users u ON u.id=ea.user_id
        WHERE ea.team_id=? AND ea.end_at>=? AND ea.start_at<?
        ORDER BY ea.start_at, u.name
        """,
        (team_id, week_start, week_end),
    ))
    unavailable = rows_dict(all_rows(
        conn,
        """
        SELECT eu.*, u.name AS user_name, 'date' AS source
        FROM employee_unavailability eu JOIN users u ON u.id=eu.user_id
        WHERE eu.team_id=? AND eu.end_at>=? AND eu.start_at<?
        ORDER BY eu.start_at, u.name
        """,
        (team_id, week_start, week_end),
    ))
    weekly_patterns = weekly_patterns_for_team(conn, team_id)
    available.extend(expand_weekly_patterns(conn, team_id, week_start, "can_work"))
    unavailable.extend(expand_weekly_patterns(conn, team_id, week_start, "cannot_work"))
    available.sort(key=lambda x: (x.get("start_at", ""), x.get("user_name", "")))
    unavailable.sort(key=lambda x: (x.get("start_at", ""), x.get("user_name", "")))
    blueprints = rows_dict(all_rows(
        conn,
        """
        SELECT sb.*, u.name AS created_by_name
        FROM schedule_blueprints sb LEFT JOIN users u ON u.id=sb.created_by
        WHERE sb.team_id=? AND sb.active=1
        ORDER BY sb.day_of_week, sb.start_time, sb.station, sb.shift_label
        """,
        (team_id,),
    ))
    blueprint_slots: list[dict] = []
    for bp in blueprints:
        try:
            day = days[int(bp.get("day_of_week") or 0)]
        except Exception:
            continue
        slot = dict(bp)
        slot["date"] = day
        slot["start_at"] = f"{day}T{bp.get('start_time') or '00:00'}"
        slot["end_at"] = f"{day}T{bp.get('end_time') or '00:00'}"
        assigned = [
            sh for sh in shifts
            if (sh.get("station") or "").strip().lower() == (bp.get("station") or "").strip().lower()
            and same_shift_label(sh.get("title") or "", bp.get("shift_label") or "")
            and overlaps(slot["start_at"], slot["end_at"], sh.get("start_at"), sh.get("end_at"))
        ]
        slot["assigned_count"] = len(assigned)
        slot["assigned_names"] = ", ".join([str(sh.get("assigned_name") or "Open") for sh in assigned])
        slot["open_count"] = max(0, int(bp.get("employees_needed") or 1) - int(slot["assigned_count"] or 0))
        blueprint_slots.append(slot)
    totals: dict[int, dict] = {}
    warnings: list[dict] = []
    for u in users:
        totals[int(u["id"])] = {"user_id": u["id"], "name": u["name"], "hours": 0.0, "overtime": 0.0, "shift_count": 0}
    for s in shifts:
        if s.get("assigned_to"):
            uid = int(s["assigned_to"])
            totals.setdefault(uid, {"user_id": uid, "name": s.get("assigned_name") or "Employee", "hours": 0.0, "overtime": 0.0, "shift_count": 0})
            totals[uid]["hours"] += shift_hours(s.get("start_at"), s.get("end_at"))
            totals[uid]["shift_count"] += 1
            conflicts = [u for u in unavailable if int(u["user_id"]) == uid and overlap_minutes(s["start_at"], s["end_at"], u["start_at"], u["end_at"]) > 0]
            for c in conflicts:
                warnings.append({
                    "type": "scheduled_off_conflict",
                    "shift_id": s["id"],
                    "unavailability_id": c["id"],
                    "user_id": uid,
                    "user_name": s.get("assigned_name") or c.get("user_name") or "Employee",
                    "message": f"{s.get('assigned_name') or c.get('user_name') or 'Employee'} is scheduled off during {s.get('title') or 'shift'}.",
                })
            user_availability = [a for a in available if int(a["user_id"]) == uid]
            if user_availability and not any(range_fully_covers(a["start_at"], a["end_at"], s["start_at"], s["end_at"]) for a in user_availability):
                warnings.append({
                    "type": "outside_available_time",
                    "shift_id": s["id"],
                    "user_id": uid,
                    "user_name": s.get("assigned_name") or "Employee",
                    "message": f"{s.get('assigned_name') or 'Employee'} is assigned to {s.get('title') or 'a shift'} outside their submitted can-work blocks.",
                })
    for item in totals.values():
        item["hours"] = round(item["hours"], 2)
        item["overtime"] = round(max(0.0, item["hours"] - 40.0), 2)
    return {
        "week_start": week_start,
        "week_end": week_end,
        "days": days,
        "users": users,
        "shifts": shifts,
        "available": available,
        "unavailable": unavailable,
        "weekly_patterns": weekly_patterns,
        "blueprints": blueprints,
        "blueprint_slots": blueprint_slots,
        "hours": sorted(totals.values(), key=lambda x: (x["name"] or "").lower()),
        "warnings": warnings,
    }


DAY_NAMES_FULL = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
PROMPT_ADJECTIVES = [
    "polished", "seasonal", "sumptuous", "luminous", "artful", "crisp", "velvety", "refined", "vibrant", "golden",
    "silken", "rustic-luxe", "fresh", "charred", "herbaceous", "buttery", "bright", "elegant", "moody", "inviting",
    "coastal", "wood-fired", "chef-driven", "handcrafted", "market-fresh", "delicate", "luxurious", "comforting", "expressive", "balanced"
]
PROMPT_TEXTURES = [
    "glossy reduction", "crackling crust", "tender crumb", "silky sauce", "knife-cut herbs", "toasted aromatics", "clean negative space",
    "warm table light", "steam-lifted finish", "fresh citrus lift", "fine-dining restraint", "generous casual elegance", "layered garnish", "shallow depth of field",
    "subtle linen texture", "brushed ceramic plate", "natural shadows", "golden-hour highlights", "fresh prep detail", "finished-to-order energy"
]
PROMPT_SOCIAL_GOALS = [
    "make guests want to book tonight", "show why this plate is worth ordering", "feel premium without sounding stiff",
    "highlight freshness and craft", "create a polished restaurant social caption", "drive interest in a limited special",
    "turn the photo into a refined story", "make the plate feel memorable and craveable"
]


def parse_float(value, default: float = 0.0) -> float:
    try:
        text = str(value if value is not None else "").strip().replace("$", "").replace(",", "")
        if text == "":
            return default
        return float(text)
    except Exception:
        return default


def first_present(row: dict, names: list[str], default: str = "") -> str:
    lookup = {str(k or "").strip().lower(): v for k, v in row.items()}
    for name in names:
        if name in lookup and str(lookup[name] or "").strip() != "":
            return str(lookup[name]).strip()
    return default


def normalize_sale_date(value: str | None) -> str:
    text = str(value or "").strip()
    if not text:
        return today_iso()
    for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%m/%d/%y", "%Y/%m/%d", "%d-%m-%Y", "%d/%m/%Y"):
        try:
            return datetime.strptime(text.split()[0], fmt).date().isoformat()
        except Exception:
            pass
    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00")).date().isoformat()
    except Exception:
        return today_iso()


def day_name_for_date(date_text: str) -> str:
    try:
        return DAY_NAMES_FULL[datetime.fromisoformat(date_text).weekday()]
    except Exception:
        return DAY_NAMES_FULL[datetime.now().weekday()]


def truthy_csv(value: str | None) -> bool:
    return str(value or "").strip().lower() in {"1", "yes", "true", "y", "special", "promo", "promotion", "discount", "discounted"}


def storage_limit_mb_for_team(conn: sqlite3.Connection, team_id: int) -> float:
    row = one(conn, "SELECT storage_limit_mb FROM file_storage_settings WHERE team_id=?", (team_id,))
    if row:
        return float(row["storage_limit_mb"] or 250)
    env_limit = os.environ.get("CHEF_LEDGER_FILES_STORAGE_LIMIT_MB")
    if env_limit not in (None, ""):
        return max(1.0, parse_float(env_limit, 250.0))
    try:
        return max(1.0, float(tier_limits(conn, team_id).get("storage_mb", 250)))
    except Exception:
        return 250.0


def team_upload_root(team_id: int) -> Path:
    return UPLOAD_ROOT / f"team_{int(team_id)}"


def directory_size_bytes(path: Path) -> int:
    if not path.exists():
        return 0
    total = 0
    for file_path in path.rglob("*"):
        try:
            if file_path.is_file():
                total += file_path.stat().st_size
        except OSError:
            pass
    return total


def file_storage_summary(conn: sqlite3.Connection, team_id: int) -> dict:
    used = directory_size_bytes(team_upload_root(team_id))
    limit_mb = storage_limit_mb_for_team(conn, team_id)
    limit_bytes = int(limit_mb * 1024 * 1024)
    settings = row_dict(one(conn, "SELECT * FROM file_storage_settings WHERE team_id=?", (team_id,))) or {
        "team_id": team_id,
        "storage_limit_mb": limit_mb,
        "provider_cost_per_gb_month": parse_float(os.environ.get("CHEF_LEDGER_PROVIDER_COST_PER_GB_MONTH", "0.25"), 0.25),
        "monthly_storage_cost": 0,
        "subscription_storage_note": "Default FILES storage cap. Owners can price this into the monthly subscription.",
        "updated_at": now_iso(),
    }
    return {
        "used_bytes": used,
        "limit_bytes": limit_bytes,
        "remaining_bytes": max(limit_bytes - used, 0),
        "used_mb": round(used / 1024 / 1024, 3),
        "limit_mb": round(limit_mb, 3),
        "used_pct": round((used / limit_bytes * 100) if limit_bytes else 0, 2),
        "settings": settings,
    }


def safe_slug(value: str, fallback: str = "file") -> str:
    text = "".join(ch if ch.isalnum() or ch in ("-", "_", ".") else "-" for ch in str(value or "").strip())
    text = "-".join(part for part in text.split("-") if part)
    return text[:96] or fallback


def parse_pos_csv(conn: sqlite3.Connection, team_id: int, user_id: int, filename: str, csv_text: str, notes: str = "", source_kind: str = "manual_upload") -> dict:
    csv_text = csv_text or ""
    reader = csv.DictReader(io.StringIO(csv_text))
    created = now_iso()
    storage_path, size_bytes = write_team_upload_text(team_id, "pos_csv", filename or f"pos-upload-{today_iso()}.csv", csv_text)
    cursor = conn.execute(
        """
        INSERT INTO pos_csv_files (team_id, filename, uploaded_by, uploaded_at, notes, source_kind, original_csv, storage_path, size_bytes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (team_id, filename or f"pos-upload-{today_iso()}.csv", user_id, created, notes or "", source_kind or "manual_upload", csv_text[:250000], storage_path, size_bytes),
    )
    file_id = int(cursor.lastrowid)
    imported = 0
    missing: list[str] = []
    row_count = 0
    sample_headers = reader.fieldnames or []
    for raw_row in reader:
        row_count += 1
        clean = {str(k or "").strip().lower(): (v if v is not None else "") for k, v in raw_row.items()}
        plate = first_present(clean, ["plate", "recipe", "menu_item", "menu item", "item", "item_name", "item name", "name", "product"], "").strip()
        if not plate:
            continue
        sale_date = normalize_sale_date(first_present(clean, ["date", "sale_date", "sale date", "business_date", "business date", "sold_at", "time", "timestamp"], today_iso()))
        qty = parse_float(first_present(clean, ["qty", "quantity", "sold", "qty_sold", "qty sold", "plates", "plates_sold", "count"], "0"), 0.0)
        if qty == 0:
            qty = 1.0
        price = parse_float(first_present(clean, ["price", "unit_price", "unit price", "price_sold_at", "price sold at", "amount", "net_sales", "net sales", "sales"], "0"), 0.0)
        service_period = first_present(clean, ["service", "service_period", "service period", "shift", "daypart", "meal"], "").strip().lower()
        special_raw = first_present(clean, ["special", "on_special", "on special", "promo", "promotion", "discount", "discount_name", "discount name"], "")
        on_special = 1 if truthy_csv(special_raw) or ("special" in special_raw.lower()) or ("promo" in special_raw.lower()) else 0
        recipe = one(conn, "SELECT id, menu_price FROM recipes WHERE team_id=? AND lower(name)=lower(?)", (team_id, plate))
        dish = one(conn, "SELECT id, menu_price FROM dishes WHERE team_id=? AND lower(name)=lower(?)", (team_id, plate))
        matched_recipe_id = int(recipe["id"]) if recipe else None
        matched_dish_id = int(dish["id"]) if dish else None
        menu_price = float((recipe and recipe["menu_price"]) or (dish and dish["menu_price"]) or 0)
        if menu_price > 0 and price > 0 and price < menu_price * 0.95:
            on_special = 1
        conn.execute(
            """
            INSERT INTO pos_csv_rows (team_id, file_id, matched_recipe_id, matched_dish_id, plate_name, sale_date, day_of_week, qty_sold, price_sold_at, service_period, on_special, source_row_json, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (team_id, file_id, matched_recipe_id, matched_dish_id, plate, sale_date, day_name_for_date(sale_date), qty, price, service_period, on_special, json.dumps(clean, sort_keys=True), created),
        )
        if matched_recipe_id:
            conn.execute("INSERT INTO pos_sales (team_id, recipe_id, sale_date, qty_sold, service_period, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)", (team_id, matched_recipe_id, sale_date, qty, service_period, f"csv:{filename or file_id}", created))
            imported += 1
        elif matched_dish_id:
            for comp in all_rows(conn, "SELECT * FROM dish_components WHERE team_id=? AND dish_id=? AND component_type='recipe'", (team_id, matched_dish_id)):
                conn.execute("INSERT INTO pos_sales (team_id, recipe_id, sale_date, qty_sold, service_period, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)", (team_id, int(comp["component_id"]), sale_date, qty * float(comp["qty"] or 1), service_period, f"csv-plate:{filename or file_id}", created))
            imported += 1
        else:
            missing.append(plate)
    conn.execute("UPDATE pos_csv_files SET row_count=?, imported_count=?, missing_count=? WHERE id=? AND team_id=?", (row_count, imported, len(set(missing)), file_id, team_id))
    return {"file_id": file_id, "filename": filename, "headers": sample_headers, "rows_scanned": row_count, "imported": imported, "missing_recipes": sorted(set(missing))}


def pos_workspace_data(conn: sqlite3.Connection, team_id: int) -> dict:
    files = rows_dict(all_rows(conn, "SELECT * FROM pos_csv_files WHERE team_id=? ORDER BY uploaded_at DESC, id DESC LIMIT 50", (team_id,)))
    plate_rows = all_rows(conn, """
        SELECT plate_name, MAX(matched_recipe_id) AS matched_recipe_id, MAX(matched_dish_id) AS matched_dish_id, COUNT(*) AS sale_rows, SUM(qty_sold) AS qty_total,
               AVG(NULLIF(price_sold_at, 0)) AS avg_price, SUM(on_special) AS special_rows,
               MIN(sale_date) AS first_sale, MAX(sale_date) AS last_sale
        FROM pos_csv_rows
        WHERE team_id=?
        GROUP BY lower(plate_name)
        ORDER BY plate_name
    """, (team_id,))
    plates = [row_dict(r) for r in plate_rows]
    profiles = rows_dict(all_rows(conn, "SELECT * FROM projection_profiles WHERE team_id=? ORDER BY updated_at DESC, id DESC LIMIT 50", (team_id,)))
    return {"files": files, "plates": plates, "profiles": profiles, "storage": file_storage_summary(conn, team_id)}


def projection_for_plates(conn: sqlite3.Connection, team_id: int, plates: list[str], projection_type: str = "week") -> dict:
    projection_type = (projection_type or "week").lower()
    selected = [str(p).strip() for p in plates if str(p).strip()]
    if not selected:
        selected = [r["plate_name"] for r in all_rows(conn, "SELECT DISTINCT plate_name FROM pos_csv_rows WHERE team_id=? ORDER BY plate_name", (team_id,))]
    multiplier = {"day": 1, "week": 7, "month": 30, "season": 90}.get(projection_type, 7)
    results = []
    for plate in selected:
        rows = all_rows(conn, "SELECT * FROM pos_csv_rows WHERE team_id=? AND lower(plate_name)=lower(?) ORDER BY sale_date", (team_id, plate))
        if not rows:
            continue
        dates = sorted({r["sale_date"] for r in rows})
        active_days = max(len(dates), 1)
        total_qty = sum(float(r["qty_sold"] or 0) for r in rows)
        daily_avg = total_qty / active_days
        by_day = {}
        for r in rows:
            day = r["day_of_week"] or day_name_for_date(r["sale_date"])
            by_day.setdefault(day, {"day": day, "qty": 0.0, "rows": 0, "special_qty": 0.0})
            by_day[day]["qty"] += float(r["qty_sold"] or 0)
            by_day[day]["rows"] += 1
            if int(r["on_special"] or 0):
                by_day[day]["special_qty"] += float(r["qty_sold"] or 0)
        day_breakdown = []
        for day in DAY_NAMES_FULL:
            item = by_day.get(day, {"day": day, "qty": 0.0, "rows": 0, "special_qty": 0.0})
            item["avg_per_row"] = round(item["qty"] / item["rows"], 3) if item["rows"] else 0
            item["qty"] = round(item["qty"], 3)
            item["special_qty"] = round(item["special_qty"], 3)
            day_breakdown.append(item)
        results.append({
            "plate_name": plate,
            "projection_type": projection_type,
            "history_days": active_days,
            "history_qty": round(total_qty, 3),
            "daily_avg": round(daily_avg, 3),
            "projected_qty": round(daily_avg * multiplier, 3),
            "day_breakdown": day_breakdown,
            "first_sale": dates[0] if dates else "",
            "last_sale": dates[-1] if dates else "",
        })
    return {"projection_type": projection_type, "plates": results, "generated_at": now_iso()}


def ran_special_stats(conn: sqlite3.Connection, team_id: int, plates: list[str], days: list[str] | None = None, specific_days_only: bool = False) -> dict:
    selected = [str(p).strip() for p in plates if str(p).strip()]
    day_set = {str(d).strip().lower() for d in (days or []) if str(d).strip()}
    results = []
    for plate in selected:
        rows = rows_dict(all_rows(conn, "SELECT * FROM pos_csv_rows WHERE team_id=? AND lower(plate_name)=lower(?) ORDER BY sale_date", (team_id, plate)))
        if day_set:
            rows = [r for r in rows if str(r.get("day_of_week") or "").lower() in day_set]
        special_rows = [r for r in rows if int(r.get("on_special") or 0)]
        used_rows = special_rows if special_rows else rows
        if specific_days_only and day_set:
            used_rows = [r for r in used_rows if str(r.get("day_of_week") or "").lower() in day_set]
        by_key: dict[tuple[str, float], dict] = {}
        for r in used_rows:
            key = (r.get("day_of_week") or day_name_for_date(r.get("sale_date") or today_iso()), round(float(r.get("price_sold_at") or 0), 2))
            by_key.setdefault(key, {"day_offered_on": key[0], "price_sold_at": key[1], "plates_sold": 0.0, "sale_rows": 0, "dates": []})
            by_key[key]["plates_sold"] += float(r.get("qty_sold") or 0)
            by_key[key]["sale_rows"] += 1
            by_key[key]["dates"].append(r.get("sale_date") or "")
        stats = sorted(by_key.values(), key=lambda x: (DAY_NAMES_FULL.index(x["day_offered_on"]) if x["day_offered_on"] in DAY_NAMES_FULL else 99, -x["plates_sold"]))
        for stat in stats:
            stat["plates_sold"] = round(stat["plates_sold"], 3)
            stat["dates"] = sorted(set(stat["dates"]))[:20]
        best = sorted(stats, key=lambda x: x["plates_sold"], reverse=True)[:3]
        results.append({"plate_name": plate, "used_special_flag": bool(special_rows), "stats": stats, "best_days": best})
    return {"plates": results, "generated_at": now_iso()}


def save_projection_profile(conn: sqlite3.Connection, team_id: int, user_id: int, name: str, profile_type: str, payload: dict) -> int:
    now = now_iso()
    cursor = conn.execute(
        "INSERT INTO projection_profiles (team_id, name, profile_type, payload_json, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (team_id, name or f"Projection profile {today_iso()}", profile_type or "projection", json.dumps(payload or {}, sort_keys=True), user_id, now, now),
    )
    return int(cursor.lastrowid)


def generate_social_prompt(conn: sqlite3.Connection, team_id: int, user_id: int, picture_id: int | None, plate_name: str, occasion: str, tone: str) -> dict:
    seed = secrets.randbelow(10_000_000)
    # Build a varied prompt and persist the hash. Retry a few times to avoid duplicates for the team.
    for attempt in range(50):
        a = secrets.choice(PROMPT_ADJECTIVES)
        b = secrets.choice(PROMPT_ADJECTIVES)
        texture = secrets.choice(PROMPT_TEXTURES)
        goal = secrets.choice(PROMPT_SOCIAL_GOALS)
        plate = plate_name or "the featured plate"
        prompt = (
            f"Create a top 0.01% refined restaurant social-media post for a photo of {plate}. "
            f"Use a {tone or 'elegant, chef-led'} voice with {a} and {b} culinary language. "
            f"Describe visible details clearly for image-aware writing: plating, color, texture, garnish, light, and the feeling of {texture}. "
            f"Occasion/context: {occasion or 'today’s service'}. The goal is to {goal}. "
            f"Write one polished caption, one shorter alternate caption, and 8 tasteful hashtags. Avoid clichés, fake claims, and overhype."
        )
        digest = hashlib.sha256(prompt.encode("utf-8")).hexdigest()
        exists = one(conn, "SELECT id FROM social_prompt_history WHERE team_id=? AND prompt_hash=?", (team_id, digest))
        if not exists:
            conn.execute(
                "INSERT INTO social_prompt_history (team_id, user_id, picture_id, prompt_hash, prompt, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                (team_id, user_id, picture_id, digest, prompt, now_iso()),
            )
            return {"prompt": prompt, "prompt_hash": digest, "attempt": attempt + 1, "seed": seed}
    return {"prompt": prompt, "prompt_hash": digest, "attempt": 50, "seed": seed}


class ChefLedgerHandler(SimpleHTTPRequestHandler):
    server_version = "ChefLedger/1.0"

    def log_message(self, fmt: str, *args) -> None:
        sys.stdout.write("[%s] %s\n" % (datetime.now().strftime("%H:%M:%S"), fmt % args))

    def end_headers(self) -> None:
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Cache-Control", "no-store" if self.path.startswith("/api/") else "no-cache")
        super().end_headers()

    def send_json(self, data, status: int = 200, headers: dict | None = None) -> None:
        body = json.dumps(data, indent=2, default=str).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        for k, v in (headers or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def send_text(self, text: str, content_type: str = "text/plain; charset=utf-8", status: int = 200, headers: dict | None = None) -> None:
        body = text.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        for k, v in (headers or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def read_json(self) -> dict:
        length = int(self.headers.get("Content-Length", "0") or 0)
        if length <= 0:
            return {}
        raw = self.rfile.read(length).decode("utf-8")
        if not raw.strip():
            return {}
        return json.loads(raw)

    def current_user(self, conn: sqlite3.Connection) -> sqlite3.Row | None:
        cookie_header = self.headers.get("Cookie", "")
        cookies = SimpleCookie(cookie_header)
        token = cookies.get("chef_ledger_session")
        if not token:
            return None
        token_value = token.value
        session = one(conn, "SELECT * FROM sessions WHERE token=?", (token_value,))
        if not session:
            return None
        if session["expires_at"] < now_iso():
            conn.execute("DELETE FROM sessions WHERE token=?", (token_value,))
            conn.commit()
            return None
        return one(conn, "SELECT * FROM users WHERE id=? AND active=1", (session["user_id"],))

    def require_user(self, conn: sqlite3.Connection) -> sqlite3.Row | None:
        user = self.current_user(conn)
        if not user:
            self.send_json({"error": "Authentication required"}, 401)
            return None
        return user

    def require_role(self, user: sqlite3.Row, minimum: str) -> bool:
        if ROLE_ORDER.get(user["role"], 0) < ROLE_ORDER.get(minimum, 999):
            self.send_json({"error": f"Requires {minimum} access"}, 403)
            return False
        return True

    def do_GET(self) -> None:
        try:
            parsed = urlparse(self.path)
            path = parsed.path
            qs = parse_qs(parsed.query)
            if path.startswith("/api/"):
                return self.api_get(path, qs)
            if path.startswith("/uploads/"):
                return self.serve_upload(path)
            if path.startswith("/print/"):
                return self.print_page(path)
            if path.startswith("/recipebook/"):
                return self.recipebook_page(path)
            if path == "/" or path == "":
                return self.serve_static("index.html")
            return self.serve_static(path.lstrip("/"))
        except Exception as exc:
            traceback.print_exc()
            self.send_json({"error": str(exc)}, 500)

    def do_POST(self) -> None:
        try:
            parsed = urlparse(self.path)
            if parsed.path.startswith("/api/"):
                return self.api_post(parsed.path, parse_qs(parsed.query))
            self.send_json({"error": "Not found"}, 404)
        except json.JSONDecodeError:
            self.send_json({"error": "Invalid JSON"}, 400)
        except Exception as exc:
            traceback.print_exc()
            self.send_json({"error": str(exc)}, 500)

    def do_PUT(self) -> None:
        try:
            parsed = urlparse(self.path)
            if parsed.path.startswith("/api/"):
                return self.api_put(parsed.path, parse_qs(parsed.query))
            self.send_json({"error": "Not found"}, 404)
        except Exception as exc:
            traceback.print_exc()
            self.send_json({"error": str(exc)}, 500)

    def do_PATCH(self) -> None:
        return self.do_PUT()

    def do_DELETE(self) -> None:
        try:
            parsed = urlparse(self.path)
            if parsed.path.startswith("/api/"):
                return self.api_delete(parsed.path)
            self.send_json({"error": "Not found"}, 404)
        except Exception as exc:
            traceback.print_exc()
            self.send_json({"error": str(exc)}, 500)

    def serve_static(self, rel_path: str) -> None:
        safe = Path(rel_path)
        if ".." in safe.parts:
            self.send_json({"error": "Invalid path"}, 400)
            return
        file_path = STATIC_ROOT / safe
        if file_path.is_dir():
            file_path = file_path / "index.html"
        if not file_path.exists():
            self.send_json({"error": "Not found"}, 404)
            return
        content_type = mimetypes.guess_type(str(file_path))[0] or "application/octet-stream"
        data = file_path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def serve_upload(self, request_path: str) -> None:
        with db() as conn:
            user = self.require_user(conn)
            if not user:
                return
            team_id = user["team_id"]
            rel = request_path.replace("/uploads/", "", 1)
            safe = Path(rel)
            if ".." in safe.parts or not safe.parts or safe.parts[0] != f"team_{int(team_id)}":
                return self.send_json({"error": "Invalid upload path"}, 400)
            file_path = UPLOAD_ROOT / safe
            if not file_path.exists() or not file_path.is_file():
                return self.send_json({"error": "Upload not found"}, 404)
            content_type = mimetypes.guess_type(str(file_path))[0] or "application/octet-stream"
            data = file_path.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

    def recipebook_page(self, request_path: str) -> None:
        token = request_path.rstrip("/").split("/")[-1]
        with db() as conn:
            code = one(conn, "SELECT q.*, r.* FROM recipe_qr_codes q JOIN recipes r ON r.id=q.recipe_id WHERE q.token=?", (token,))
            if not code:
                return self.send_text("Recipe code not found", status=404)
            items = rows_dict(all_rows(conn, """
                SELECT ri.*, p.name AS product_name, p.unit AS product_unit
                FROM recipe_items ri JOIN products p ON p.id=ri.product_id
                WHERE ri.recipe_id=? ORDER BY p.name
            """, (code["recipe_id"],)))
            steps = html.escape(code["recipe_steps"] if "recipe_steps" in code.keys() else "")
            item_html = "".join(f"<li>{html.escape(str(i['product_name']))}: {i['qty']} {html.escape(i['unit'] or '')} <span class='muted'>({html.escape(i['prep_note'] or '')})</span></li>" for i in items)
            notes = steps or html.escape(code["notes"] or "No written steps yet. Add steps in BUILD → Recipe Builder.")
            body = f"""<!doctype html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width, initial-scale=1'><title>{html.escape(code['name'])}</title><style>body{{font-family:Arial,sans-serif;background:#111;color:#f8f2e8;margin:0;padding:24px}}main{{max-width:850px;margin:auto;background:#1e1814;border:1px solid #6b4a2f;border-radius:18px;padding:24px}}h1{{margin-top:0}}li{{margin:8px 0}}.muted{{color:#c8b8a5}}</style></head><body><main><p class='muted'>Chef Ledger portable recipe book</p><h1>{html.escape(code['name'])}</h1><p>{html.escape(code['station'] or 'Kitchen')} · yield {code['yield_qty']} {html.escape(code['portion_unit'] or '')}</p><h2>Ingredients</h2><ul>{item_html}</ul><h2>Steps / notes</h2><p>{notes}</p></main></body></html>"""
            return self.send_text(body, "text/html; charset=utf-8")

    def api_get(self, path: str, qs: dict) -> None:
        with db() as conn:
            user = self.current_user(conn)
            if path == "/api/health":
                return self.send_json({"ok": True, "app": "Chef Ledger", "time": now_iso()})
            if path == "/api/subscription/tiers":
                return self.send_json({"tiers": subscription_tier_catalog()})
            if path == "/api/session":
                if not user:
                    return self.send_json({"user": None, "tiers": subscription_tier_catalog()})
                apply_time_off_resets(conn, user["team_id"])
                conn.commit()
                user = one(conn, "SELECT * FROM users WHERE id=? AND active=1", (user["id"],))
                team = one(conn, "SELECT * FROM teams WHERE id=?", (user["team_id"],))
                unread = one(conn, "SELECT COUNT(*) AS c FROM notifications WHERE team_id=? AND (user_id IS NULL OR user_id=?) AND read_at IS NULL", (user["team_id"], user["id"]))["c"]
                return self.send_json({"user": user_public(user), "team": row_dict(team), "subscription": subscription_for_team(conn, user["team_id"]), "tiers": subscription_tier_catalog(), "unread_notifications": unread, "capabilities": capabilities_for_user(conn, user)})
            if not user:
                return self.send_json({"error": "Authentication required"}, 401)
            team_id = user["team_id"]
            if not subscription_is_active(conn, team_id) and path not in ("/api/subscription/tiers",):
                return self.send_json({"error": "Choose a subscription tier to unlock Chef Ledger.", "subscription_required": True, "subscription": subscription_for_team(conn, team_id), "tiers": subscription_tier_catalog()}, 402)
            apply_time_off_resets(conn, team_id)
            conn.commit()
            user = one(conn, "SELECT * FROM users WHERE id=? AND active=1", (user["id"],))
            if path == "/api/files/pos_workspace":
                if not (ROLE_ORDER.get(user["role"], 0) >= ROLE_ORDER["team_leader"] or has_tool_access(conn, user, "orders") or has_tool_access(conn, user, "ordering") or has_tool_access(conn, user, "inventory")):
                    return self.send_json({"error": "FILES / POS CSV access required"}, 403)
                return self.send_json(pos_workspace_data(conn, team_id))
            if path == "/api/files/pictures":
                if not (ROLE_ORDER.get(user["role"], 0) >= ROLE_ORDER["team_leader"] or has_tool_access(conn, user, "recipes") or has_tool_access(conn, user, "inventory")):
                    return self.send_json({"error": "FILES / Pictures access required"}, 403)
                folders = rows_dict(all_rows(conn, "SELECT * FROM picture_folders WHERE team_id=? ORDER BY created_at DESC, id DESC", (team_id,)))
                pictures = rows_dict(all_rows(conn, """
                    SELECT pf.*, f.name AS folder_name, u.name AS created_by_name
                    FROM picture_files pf
                    JOIN picture_folders f ON f.id=pf.folder_id
                    LEFT JOIN users u ON u.id=pf.created_by
                    WHERE pf.team_id=?
                    ORDER BY pf.created_at DESC, pf.id DESC
                """, (team_id,)))
                links = rows_dict(all_rows(conn, "SELECT * FROM user_social_links WHERE team_id=? AND user_id=? ORDER BY platform", (team_id, user["id"])))
                return self.send_json({"folders": folders, "pictures": pictures, "social_links": links, "storage": file_storage_summary(conn, team_id), "limits": tier_limits(conn, team_id)})
            if path == "/api/files/inventories":
                return self.send_json(files_inventories_data(conn, team_id))
            if path == "/api/files/deliveries":
                return self.send_json(files_deliveries_data(conn, team_id))
            if path == "/api/files/menu_workspace":
                return self.send_json(files_menu_data(conn, team_id))
            if path == "/api/files/qr_codes":
                return self.send_json(recipe_qr_data(conn, team_id))
            if path == "/api/prep/forecaster":
                return self.send_json(forecaster_data(conn, team_id))
            if path == "/api/dashboard":
                suggestions = build_order_suggestions(conn, team_id, 3)
                low = [s for s in suggestions if s["risk"] in ("critical", "below_reorder", "below_par")]
                tasks = rows_dict(all_rows(conn, "SELECT * FROM prep_tasks WHERE team_id=? AND status!='done' ORDER BY priority ASC, due_at ASC LIMIT 10", (team_id,)))
                expiring = rows_dict(all_rows(conn, "SELECT * FROM station_batches WHERE team_id=? AND status='active' AND expires_at<=? ORDER BY expires_at LIMIT 10", (team_id, (datetime.now(timezone.utc)+timedelta(days=1)).isoformat())))
                open_shifts = rows_dict(all_rows(conn, "SELECT * FROM shifts WHERE team_id=? AND status='open' ORDER BY start_at LIMIT 8", (team_id,)))
                return self.send_json({"suggestions": suggestions, "low_stock": low[:10], "tasks": tasks, "expiring_batches": expiring, "open_shifts": open_shifts})
            if path == "/api/access_grants":
                if not self.require_role(user, "team_leader"):
                    return
                return self.send_json({"grants": active_access_grants(conn, team_id)})
            if path == "/api/message_permissions":
                return self.send_json({"permissions": all_message_permissions(conn, team_id)})
            if path == "/api/stations":
                records = rows_dict(all_rows(conn, "SELECT * FROM stations WHERE team_id=? ORDER BY name", (team_id,)))
                return self.send_json({"stations": station_list(conn, team_id), "station_records": records})
            if path == "/api/locations":
                return self.send_json({"locations": stock_locations_for_team(conn, team_id)})
            if path == "/api/station_count_form":
                station = (qs.get("station", [user["station"] or ""])[0] or "").strip()
                count_date = qs.get("date", [today_iso()])[0]
                service_period = qs.get("service_period", [""])[0]
                params: list = [team_id]
                station_clause = ""
                if station:
                    station_clause = " AND lower(COALESCE(p.station, ''))=lower(?)"
                    params.append(station)
                products = rows_dict(all_rows(conn, f"SELECT p.*, v.name AS vendor_name FROM products p LEFT JOIN vendors v ON v.id=p.vendor_id WHERE p.team_id=? {station_clause} ORDER BY p.category, p.name", tuple(params)))
                template_rows = rows_dict(all_rows(conn, """
                    SELECT * FROM prep_station_template_items
                    WHERE team_id=? AND lower(station)=lower(?) AND active=1
                """, (team_id, station))) if station else []
                min_by_product = {int(t["source_id"]): t for t in template_rows if t["item_kind"] == "product"}
                # Employees should only see operational count fields. POS-derived usage, variance,
                # and house-inventory math are manager analytics and are shown in the leader history view.
                for p in products:
                    expected = expected_pos_usage_for_product(conn, team_id, int(p["id"]), count_date, service_period)
                    tmpl = min_by_product.get(int(p["id"]))
                    p["min_station_qty"] = float(tmpl["min_station_qty"] or 0) if tmpl else 0
                    p["min_station_unit"] = (tmpl["min_station_unit"] or p["unit"] or "each") if tmpl else (p["unit"] or "each")
                    p["manager_expected_usage"] = expected["total"] if (ROLE_ORDER.get(user["role"], 0) >= ROLE_ORDER["team_leader"]) else 0
                    p["manager_expected_sources"] = expected["sources"] if (ROLE_ORDER.get(user["role"], 0) >= ROLE_ORDER["team_leader"]) else []
                return self.send_json({"station": station, "count_date": count_date, "service_period": service_period, "products": products, "manager_view": (ROLE_ORDER.get(user["role"], 0) >= ROLE_ORDER["team_leader"])})
            if path == "/api/station_counts":
                if ROLE_ORDER.get(user["role"], 0) >= ROLE_ORDER["team_leader"]:
                    rows = rows_dict(all_rows(conn, """
                        SELECT ssc.*, u.name AS user_name, p.name AS product_name, p.category AS product_category
                        FROM station_shift_counts ssc
                        JOIN users u ON u.id=ssc.user_id
                        JOIN products p ON p.id=ssc.product_id
                        WHERE ssc.team_id=?
                        ORDER BY ssc.created_at DESC LIMIT 200
                    """, (team_id,)))
                else:
                    rows = rows_dict(all_rows(conn, """
                        SELECT ssc.*, u.name AS user_name, p.name AS product_name, p.category AS product_category
                        FROM station_shift_counts ssc
                        JOIN users u ON u.id=ssc.user_id
                        JOIN products p ON p.id=ssc.product_id
                        WHERE ssc.team_id=? AND ssc.user_id=?
                        ORDER BY ssc.created_at DESC LIMIT 100
                    """, (team_id, user["id"])))
                return self.send_json({"counts": rows})
            if path == "/api/users":
                rows = all_rows(conn, "SELECT * FROM users WHERE team_id=? ORDER BY role DESC, name", (team_id,))
                return self.send_json({"users": [user_public(r) for r in rows]})
            if path == "/api/time_off":
                rows = all_rows(conn, "SELECT * FROM users WHERE team_id=? ORDER BY role DESC, name", (team_id,))
                requests = rows_dict(all_rows(conn, """
                    SELECT tor.*, u.name AS user_name, d.name AS decided_by_name
                    FROM time_off_requests tor
                    JOIN users u ON u.id=tor.user_id
                    LEFT JOIN users d ON d.id=tor.decided_by
                    WHERE tor.team_id=?
                    ORDER BY tor.created_at DESC
                """, (team_id,)))
                return self.send_json({"profiles": [user_public(r) for r in rows], "requests": requests})
            if path == "/api/time_off/calculate":
                requested_user_id = int(qs.get("user_id", [user["id"]])[0] or user["id"])
                if requested_user_id != user["id"] and ROLE_ORDER.get(user["role"], 0) < ROLE_ORDER["team_leader"]:
                    return self.send_json({"error": "Only team leaders can calculate other employees' time off"}, 403)
                employee = one(conn, "SELECT * FROM users WHERE id=? AND team_id=?", (requested_user_id, team_id))
                if not employee:
                    return self.send_json({"error": "Employee not found"}, 404)
                start_date = qs.get("start_date", [""])[0]
                end_date = qs.get("end_date", [""])[0]
                days = time_off_days(start_date, end_date)
                remaining = float(employee["days_off_remaining"] or 0)
                return self.send_json({
                    "user": user_public(employee),
                    "start_date": start_date,
                    "end_date": end_date,
                    "days_requested": days,
                    "days_remaining": remaining,
                    "days_after_request": round(remaining - days, 3),
                    "enough_days": remaining >= days,
                })
            if path == "/api/invites":
                if not self.require_role(user, "team_leader"):
                    return
                rows = rows_dict(all_rows(conn, "SELECT * FROM invites WHERE team_id=? ORDER BY created_at DESC LIMIT 50", (team_id,)))
                return self.send_json({"invites": rows})
            if path == "/api/vendors":
                rows = rows_dict(all_rows(conn, "SELECT * FROM vendors WHERE team_id=? ORDER BY name", (team_id,)))
                return self.send_json({"vendors": rows})
            if path == "/api/products":
                rows = rows_dict(all_rows(conn, "SELECT p.*, v.name AS vendor_name FROM products p LEFT JOIN vendors v ON v.id=p.vendor_id WHERE p.team_id=? ORDER BY p.category, p.name", (team_id,)))
                return self.send_json({"products": rows})
            if path == "/api/recipes":
                recipes = rows_dict(all_rows(conn, "SELECT * FROM recipes WHERE team_id=? ORDER BY name", (team_id,)))
                for r in recipes:
                    r["cost"] = recipe_cost(conn, team_id, r["id"])
                return self.send_json({"recipes": recipes})
            if path == "/api/dishes":
                dishes = rows_dict(all_rows(conn, "SELECT * FROM dishes WHERE team_id=? ORDER BY name", (team_id,)))
                for d in dishes:
                    d["cost"] = dish_cost(conn, team_id, d["id"])
                return self.send_json({"dishes": dishes})
            if path.startswith("/api/dishes/"):
                parts = path.split("/")
                dish_id = int(parts[3])
                return self.send_json(dish_cost(conn, team_id, dish_id))
            if path.startswith("/api/recipes/"):
                parts = path.split("/")
                recipe_id = int(parts[3])
                if len(parts) >= 5 and parts[4] == "cost":
                    target = qs.get("target", [None])[0]
                    target_type = qs.get("target_type", ["recipe"])[0]
                    data = recipe_cost(conn, team_id, recipe_id)
                    if target:
                        data["optimizer"] = optimize_recipe(conn, team_id, recipe_id, float(target), target_type)
                    return self.send_json(data)
            if path == "/api/count/stock":
                if not has_tool_access(conn, user, "inventory"):
                    return self.send_json({"error": "Inventory or count access required"}, 403)
                days = float(qs.get("days", ["7"])[0] or 7)
                return self.send_json(count_sheet_data(conn, team_id, days))
            if path == "/api/inventory/sheet_summary":
                return self.send_json(prep_inventory_ledger(conn, team_id))
            if path == "/api/prep/station_build":
                station = (qs.get("station", [user["station"] or ""])[0] or "").strip()
                return self.send_json(station_prep_options(conn, team_id, station))
            if path == "/api/prep/station_template":
                station = (qs.get("station", [user["station"] or ""])[0] or "").strip()
                return self.send_json(station_prep_template(conn, team_id, station))
            if path == "/api/prep_sheets":
                if ROLE_ORDER.get(user["role"], 0) >= ROLE_ORDER["team_leader"]:
                    rows = rows_dict(all_rows(conn, "SELECT * FROM prep_sheets WHERE team_id=? ORDER BY prep_date DESC, id DESC", (team_id,)))
                else:
                    rows = rows_dict(all_rows(conn, """
                        SELECT DISTINCT ps.*
                        FROM prep_sheets ps
                        JOIN prep_tasks pt ON pt.prep_sheet_id=ps.id
                        WHERE ps.team_id=? AND (pt.assigned_to=? OR lower(COALESCE(pt.station,''))=lower(?))
                        ORDER BY ps.prep_date DESC, ps.id DESC
                    """, (team_id, user["id"], user["station"] or "")))
                return self.send_json({"prep_sheets": rows})
            if path.startswith("/api/prep_sheets/"):
                sheet_id = int(path.split("/")[3])
                sheet = row_dict(one(conn, "SELECT * FROM prep_sheets WHERE id=? AND team_id=?", (sheet_id, team_id)))
                if ROLE_ORDER.get(user["role"], 0) >= ROLE_ORDER["team_leader"]:
                    tasks = rows_dict(all_rows(conn, "SELECT pt.*, u.name AS assigned_name FROM prep_tasks pt LEFT JOIN users u ON u.id=pt.assigned_to WHERE pt.prep_sheet_id=? AND pt.team_id=? ORDER BY priority, station, title", (sheet_id, team_id)))
                else:
                    tasks = rows_dict(all_rows(conn, """
                        SELECT pt.*, u.name AS assigned_name
                        FROM prep_tasks pt LEFT JOIN users u ON u.id=pt.assigned_to
                        WHERE pt.prep_sheet_id=? AND pt.team_id=? AND (pt.assigned_to=? OR lower(COALESCE(pt.station,''))=lower(?))
                        ORDER BY priority, station, title
                    """, (sheet_id, team_id, user["id"], user["station"] or "")))
                return self.send_json({"prep_sheet": sheet, "tasks": tasks})
            if path == "/api/prep/aggregate":
                prep_date = qs.get("date", [today_iso()])[0]
                if ROLE_ORDER.get(user["role"], 0) >= ROLE_ORDER["team_leader"]:
                    tasks = rows_dict(all_rows(conn, "SELECT pt.*, u.name AS assigned_name FROM prep_tasks pt LEFT JOIN users u ON u.id=pt.assigned_to WHERE pt.team_id=? AND pt.status!='done' AND EXISTS (SELECT 1 FROM prep_sheets ps WHERE ps.id=pt.prep_sheet_id AND ps.prep_date=?) ORDER BY pt.priority, pt.due_at", (team_id, prep_date)))
                else:
                    tasks = rows_dict(all_rows(conn, """
                        SELECT pt.*, u.name AS assigned_name
                        FROM prep_tasks pt LEFT JOIN users u ON u.id=pt.assigned_to
                        WHERE pt.team_id=? AND pt.status!='done'
                          AND (pt.assigned_to=? OR lower(COALESCE(pt.station,''))=lower(?))
                          AND EXISTS (SELECT 1 FROM prep_sheets ps WHERE ps.id=pt.prep_sheet_id AND ps.prep_date=?)
                        ORDER BY pt.priority, pt.due_at
                    """, (team_id, user["id"], user["station"] or "", prep_date)))
                suggestions = build_order_suggestions(conn, team_id, 3)
                needed_now = [t for t in tasks if int(t.get("priority") or 3) <= 2]
                watchlist = [s for s in suggestions if s["risk"] in ("below_par", "below_reorder", "critical")]
                return self.send_json({"date": prep_date, "needed_now": needed_now, "watchlist": watchlist, "tasks": tasks})
            if path == "/api/manager/preplist":
                if not user_is_manager(user) and not has_tool_access(conn, user, "prep"):
                    return self.send_json({"error": "Manager or prep-list clearance required"}, 403)
                return self.send_json(build_manager_preplist(conn, team_id, user))
            if path == "/api/orders":
                rows = rows_dict(all_rows(conn, "SELECT o.*, v.name AS vendor_name FROM orders o LEFT JOIN vendors v ON v.id=o.vendor_id WHERE o.team_id=? ORDER BY o.created_at DESC", (team_id,)))
                return self.send_json({"orders": rows})
            if path == "/api/orders/suggest":
                days = float(qs.get("days", ["3"])[0])
                return self.send_json({"suggestions": build_order_suggestions(conn, team_id, days)})
            if path.startswith("/api/orders/"):
                order_id = int(path.split("/")[3])
                order = row_dict(one(conn, "SELECT o.*, v.name AS vendor_name FROM orders o LEFT JOIN vendors v ON v.id=o.vendor_id WHERE o.id=? AND o.team_id=?", (order_id, team_id)))
                items = rows_dict(all_rows(conn, "SELECT oi.*, p.name AS product_name FROM order_items oi JOIN products p ON p.id=oi.product_id WHERE oi.order_id=? AND oi.team_id=?", (order_id, team_id)))
                return self.send_json({"order": order, "items": items})
            if path == "/api/shifts":
                rows = rows_dict(all_rows(conn, "SELECT s.*, u.name AS assigned_name FROM shifts s LEFT JOIN users u ON u.id=s.assigned_to WHERE s.team_id=? ORDER BY s.start_at", (team_id,)))
                return self.send_json({"shifts": rows})
            if path == "/api/scheduler/hours":
                rows = all_rows(conn, "SELECT s.*, u.name AS assigned_name, u.id AS user_id FROM shifts s JOIN users u ON u.id=s.assigned_to WHERE s.team_id=? AND s.status='assigned' ORDER BY u.name, s.start_at", (team_id,))
                totals = {}
                for r in rows:
                    try:
                        start = datetime.fromisoformat(r["start_at"])
                        end = datetime.fromisoformat(r["end_at"])
                        hours = max(0, (end - start).total_seconds() / 3600.0)
                    except Exception:
                        hours = 0
                    uid = r["user_id"]
                    totals.setdefault(uid, {"user_id": uid, "name": r["assigned_name"], "hours": 0, "overtime": 0})
                    totals[uid]["hours"] += hours
                for t in totals.values():
                    t["hours"] = round(t["hours"], 2)
                    t["overtime"] = round(max(0, t["hours"] - 40), 2)
                claims = rows_dict(all_rows(conn, "SELECT sc.*, u.name AS user_name, u.schedule_color AS schedule_color, s.title AS shift_title, s.station AS shift_station, s.start_at, s.end_at, s.status AS shift_status FROM shift_claims sc JOIN users u ON u.id=sc.user_id JOIN shifts s ON s.id=sc.shift_id WHERE sc.team_id=? ORDER BY sc.created_at DESC", (team_id,)))
                return self.send_json({"hours": list(totals.values()), "claims": claims})
            if path == "/api/scheduler/week":
                week_start = qs.get("start", [None])[0]
                schedule = build_week_schedule(conn, team_id, week_start)
                claims = rows_dict(all_rows(conn, "SELECT sc.*, u.name AS user_name, u.schedule_color AS schedule_color, s.title AS shift_title, s.station AS shift_station, s.start_at, s.end_at, s.status AS shift_status FROM shift_claims sc JOIN users u ON u.id=sc.user_id JOIN shifts s ON s.id=sc.shift_id WHERE sc.team_id=? ORDER BY sc.created_at DESC", (team_id,)))
                schedule["claims"] = claims
                return self.send_json(schedule)
            if path == "/api/scheduler/blueprints":
                rows = rows_dict(all_rows(conn, "SELECT * FROM schedule_blueprints WHERE team_id=? AND active=1 ORDER BY day_of_week, start_time, station", (team_id,)))
                return self.send_json({"blueprints": rows})
            if path == "/api/schedule_maker":
                week_start = qs.get("start", [None])[0]
                week_start, week_end = week_bounds(week_start)
                my_available = rows_dict(all_rows(conn, "SELECT * FROM employee_availability WHERE team_id=? AND user_id=? AND end_at>=? AND start_at<? ORDER BY start_at", (team_id, user["id"], week_start, week_end)))
                my_unavailable = rows_dict(all_rows(conn, "SELECT * FROM employee_unavailability WHERE team_id=? AND user_id=? AND end_at>=? AND start_at<? ORDER BY start_at", (team_id, user["id"], week_start, week_end)))
                my_shifts = rows_dict(all_rows(conn, "SELECT * FROM shifts WHERE team_id=? AND assigned_to=? AND start_at>=? AND start_at<? ORDER BY start_at", (team_id, user["id"], week_start, week_end)))
                return self.send_json({"week_start": week_start, "week_end": week_end, "available": my_available, "unavailable": my_unavailable, "shifts": my_shifts})
            if path == "/api/weekly_availability":
                selected_user_id = qs.get("user_id", [None])[0]
                rows = weekly_patterns_for_team(conn, team_id)
                if selected_user_id:
                    rows = [r for r in rows if str(r.get("user_id")) == str(selected_user_id)]
                return self.send_json({"patterns": rows})
            if path == "/api/available_shifts":
                rows = rows_dict(all_rows(conn, "SELECT ea.*, u.name AS user_name FROM employee_availability ea JOIN users u ON u.id=ea.user_id WHERE ea.team_id=? ORDER BY ea.start_at DESC", (team_id,)))
                return self.send_json({"available": rows})
            if path == "/api/availability":
                rows = rows_dict(all_rows(conn, "SELECT eu.*, u.name AS user_name FROM employee_unavailability eu JOIN users u ON u.id=eu.user_id WHERE eu.team_id=? ORDER BY eu.start_at DESC", (team_id,)))
                return self.send_json({"availability": rows})
            if path == "/api/posts":
                if ROLE_ORDER.get(user["role"], 0) >= ROLE_ORDER["team_leader"]:
                    visibility_clause = "visibility IN ('team','managers','leaders')"
                else:
                    visibility_clause = "visibility='team' OR user_id=?"
                params = (team_id,) if ROLE_ORDER.get(user["role"], 0) >= ROLE_ORDER["team_leader"] else (team_id, user["id"])
                rows = rows_dict(all_rows(conn, f"SELECT p.*, u.name AS author_name FROM posts p JOIN users u ON u.id=p.user_id WHERE p.team_id=? AND ({visibility_clause}) ORDER BY p.created_at DESC LIMIT 100", params))
                for p in rows:
                    votes = rows_dict(all_rows(conn, "SELECT vote, COUNT(*) AS count FROM post_votes WHERE post_id=? GROUP BY vote", (p["id"],)))
                    p["votes"] = votes
                return self.send_json({"posts": rows})
            if path == "/api/notifications":
                rows = rows_dict(all_rows(conn, "SELECT * FROM notifications WHERE team_id=? AND (user_id IS NULL OR user_id=?) ORDER BY created_at DESC LIMIT 50", (team_id, user["id"])))
                return self.send_json({"notifications": rows})
            if path == "/api/batches":
                rows = rows_dict(all_rows(conn, "SELECT sb.*, p.name AS product_name, r.name AS recipe_name FROM station_batches sb LEFT JOIN products p ON p.id=sb.product_id LEFT JOIN recipes r ON r.id=sb.recipe_id WHERE sb.team_id=? ORDER BY sb.expires_at", (team_id,)))
                return self.send_json({"batches": rows})
            if path == "/api/export/inventory.csv":
                return self.export_inventory_csv(conn, user)
            if path == "/api/export/recipes.csv":
                return self.export_recipes_csv(conn, user)
            return self.send_json({"error": "Not found"}, 404)

    def api_post(self, path: str, qs: dict) -> None:
        if path == "/api/stripe/webhook":
            return self.handle_stripe_webhook()
        data = self.read_json()
        with db() as conn:
            if path == "/api/auth/register":
                team_name = (data.get("team_name") or "My Restaurant").strip()
                name = (data.get("name") or "Chef").strip()
                email = (data.get("email") or "").strip().lower()
                password = data.get("password") or ""
                tier = normalize_subscription_tier(data.get("subscription_tier"))
                price = SUBSCRIPTION_TIERS[tier]["price"]
                checkout_url = checkout_url_for_tier(tier)
                if not email or len(password) < 6:
                    return self.send_json({"error": "Email and 6+ character password required"}, 400)
                conn.execute(
                    """
                    INSERT INTO teams (name, created_at, subscription_tier, subscription_status, subscription_price_monthly, subscription_checkout_url, subscription_updated_at)
                    VALUES (?, ?, ?, 'pending_checkout', ?, ?, ?)
                    """,
                    (team_name, now_iso(), tier, price, checkout_url, now_iso()),
                )
                team_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
                conn.execute(
                    "INSERT INTO users (team_id, name, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, 'owner', ?)",
                    (team_id, name, email, hash_password(password), now_iso()),
                )
                user_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
                create_notification(
                    conn,
                    team_id,
                    "Welcome to Chef Ledger",
                    f"Your {SUBSCRIPTION_TIERS[tier]['name']} account is ready for checkout. Activate the subscription to unlock the app workspace.",
                    user_id,
                )
                conn.commit()
                return self.create_session_response(conn, user_id)
            if path == "/api/auth/login":
                email = (data.get("email") or "").strip().lower()
                password = data.get("password") or ""
                user = one(conn, "SELECT * FROM users WHERE email=? AND active=1", (email,))
                if not user or not verify_password(password, user["password_hash"]):
                    return self.send_json({"error": "Invalid email or password"}, 401)
                return self.create_session_response(conn, user["id"])
            if path == "/api/auth/join":
                code = (data.get("code") or "").strip().upper()
                name = (data.get("name") or "").strip()
                email = (data.get("email") or "").strip().lower()
                password = data.get("password") or ""
                invite = one(conn, "SELECT * FROM invites WHERE code=? AND used_at IS NULL", (code,))
                if not invite or invite["expires_at"] < now_iso():
                    return self.send_json({"error": "Invalid or expired passcode"}, 400)
                if not name or not email or len(password) < 6:
                    return self.send_json({"error": "Name, email, and 6+ character password required"}, 400)
                conn.execute(
                    "INSERT INTO users (team_id, name, email, password_hash, role, station, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                    (invite["team_id"], name, email, hash_password(password), invite["role"], invite["station"], now_iso()),
                )
                user_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
                conn.execute("UPDATE invites SET used_by=?, used_at=? WHERE id=?", (user_id, now_iso(), invite["id"]))
                notify_managers(conn, invite["team_id"], "Employee joined", f"{name} joined using a one-time passcode as {invite['role']}.")
                conn.commit()
                return self.create_session_response(conn, user_id)
            user = self.require_user(conn)
            if not user:
                return
            team_id = user["team_id"]
            if path == "/api/subscription/select":
                if not self.require_role(user, "owner"):
                    return
                tier = normalize_subscription_tier(data.get("tier") or data.get("subscription_tier"))
                price = SUBSCRIPTION_TIERS[tier]["price"]
                checkout_url = checkout_url_for_tier(tier)
                conn.execute(
                    """
                    UPDATE teams
                    SET subscription_tier=?, subscription_status='pending_checkout', subscription_price_monthly=?, subscription_checkout_url=?, subscription_updated_at=?
                    WHERE id=?
                    """,
                    (tier, price, checkout_url, now_iso(), team_id),
                )
                conn.commit()
                return self.send_json({"ok": True, "subscription": subscription_for_team(conn, team_id), "checkout_url": checkout_url})
            if path == "/api/subscription/activate_local":
                if not self.require_role(user, "owner"):
                    return
                if not local_subscription_activation_allowed():
                    return self.send_json({"error": "Local subscription activation is disabled. Use Stripe checkout/webhooks in production."}, 403)
                tier = normalize_subscription_tier(data.get("tier") or team_tier(conn, team_id))
                price = SUBSCRIPTION_TIERS[tier]["price"]
                conn.execute(
                    """
                    UPDATE teams
                    SET subscription_tier=?, subscription_status='active', subscription_price_monthly=?, subscription_started_at=COALESCE(NULLIF(subscription_started_at, ''), ?), subscription_updated_at=?
                    WHERE id=?
                    """,
                    (tier, price, now_iso(), now_iso(), team_id),
                )
                conn.commit()
                return self.send_json({"ok": True, "subscription": subscription_for_team(conn, team_id)})
            if path != "/api/auth/logout" and not subscription_is_active(conn, team_id):
                return self.send_json({"error": "Choose a subscription tier to unlock Chef Ledger.", "subscription_required": True, "subscription": subscription_for_team(conn, team_id), "tiers": subscription_tier_catalog()}, 402)
            apply_time_off_resets(conn, team_id)
            conn.commit()
            user = one(conn, "SELECT * FROM users WHERE id=? AND active=1", (user["id"],))
            if path == "/api/auth/logout":
                cookie_header = self.headers.get("Cookie", "")
                cookies = SimpleCookie(cookie_header)
                token = cookies.get("chef_ledger_session")
                if token:
                    conn.execute("DELETE FROM sessions WHERE token=?", (token.value,))
                    conn.commit()
                return self.send_json({"ok": True}, headers={"Set-Cookie": "chef_ledger_session=; Max-Age=0; Path=/; SameSite=Lax"})
            if path == "/api/access_grants":
                if not self.require_role(user, "team_leader"):
                    return
                target_user_id = int(data.get("user_id") or 0)
                target = one(conn, "SELECT * FROM users WHERE id=? AND team_id=?", (target_user_id, team_id))
                if not target:
                    return self.send_json({"error": "Employee not found"}, 404)
                tool = (data.get("tool") or "inventory").strip().lower()
                allowed_tools = {"employee_basic","station","inventory","manual_inventory","ordering","prep","scheduler","scheduler_read","scheduler_write","maintenance","votes","manager_notes","recipes"}
                if tool not in allowed_tools:
                    return self.send_json({"error": "Unknown access tool"}, 400)
                duration = (data.get("duration") or "custom").strip().lower()
                if duration == "shift":
                    expires_at = (datetime.now(timezone.utc) + timedelta(hours=8)).replace(microsecond=0).isoformat()
                elif duration == "day":
                    expires_at = (datetime.now(timezone.utc) + timedelta(days=1)).replace(microsecond=0).isoformat()
                elif duration == "week":
                    expires_at = (datetime.now(timezone.utc) + timedelta(days=7)).replace(microsecond=0).isoformat()
                elif duration == "indefinitely":
                    expires_at = "2099-12-31T23:59"
                else:
                    expires_at = data.get("expires_at") or (datetime.now(timezone.utc) + timedelta(hours=4)).replace(microsecond=0).isoformat()
                if "T" not in str(expires_at):
                    expires_at = f"{expires_at}T23:59"
                conn.execute(
                    "INSERT INTO access_grants (team_id, user_id, tool, expires_at, reason, granted_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                    (team_id, target_user_id, tool, expires_at, data.get("reason", f"Temporary {tool} access"), user["id"], now_iso()),
                )
                create_notification(conn, team_id, "Temporary access granted", f"You have temporary {tool} access until {expires_at}.", target_user_id)
                notify_managers(conn, team_id, "Temporary access granted", f"{target['name']} received temporary {tool} access until {expires_at}.")
                conn.commit()
                return self.send_json({"ok": True})
            if path == "/api/station_counts":
                station = (data.get("station") or user["station"] or "").strip()
                count_date = data.get("count_date") or today_iso()
                service_period = (data.get("service_period") or "").strip().lower()
                counts = data.get("counts") or []
                if not station:
                    return self.send_json({"error": "Station is required"}, 400)
                if not isinstance(counts, list) or not counts:
                    return self.send_json({"error": "At least one station count row is required"}, 400)
                saved = []
                for item in counts:
                    product_id = int(item.get("product_id") or 0)
                    product = one(conn, "SELECT * FROM products WHERE id=? AND team_id=?", (product_id, team_id))
                    if not product:
                        continue
                    pre_stocked_qty = float(item.get("pre_stocked_qty") or item.get("qty_left") or 0)
                    post_stocked_qty = float(item.get("post_stocked_qty") or pre_stocked_qty)
                    ready_for_next_service = 1 if item.get("ready_for_next_service") in (True, 1, "1", "true", "yes", "on") else 0
                    house_before = float(product["current_qty"] or 0)
                    restocked_from_house = max(post_stocked_qty - pre_stocked_qty, 0.0)
                    house_after = max(house_before - restocked_from_house, 0.0)

                    expected = expected_pos_usage_for_product(conn, team_id, product_id, count_date, service_period)
                    manager_expected_usage = max(float(expected["total"] or 0), 0.0)
                    previous = one(
                        conn,
                        """
                        SELECT post_stocked_qty, qty_left FROM station_shift_counts
                        WHERE team_id=? AND lower(station)=lower(?) AND product_id=?
                        ORDER BY created_at DESC LIMIT 1
                        """,
                        (team_id, station, product_id),
                    )
                    previous_ready_qty = None
                    if previous:
                        previous_ready_qty = float(previous["post_stocked_qty"] or previous["qty_left"] or 0)
                    actual_station_used = max((previous_ready_qty - pre_stocked_qty), 0.0) if previous_ready_qty is not None else 0.0
                    usage_variance = actual_station_used - manager_expected_usage if previous_ready_qty is not None else 0.0
                    status = "station_ready" if ready_for_next_service else "needs_restock_or_lead_check"
                    if previous_ready_qty is None and manager_expected_usage > 0:
                        status = "manager_review_needs_prior_ready_count"
                    elif previous_ready_qty is not None:
                        if usage_variance > 0.25:
                            status = "over_using_vs_pos"
                        elif usage_variance < -0.25:
                            status = "under_using_or_extra_left"
                        elif ready_for_next_service:
                            status = "on_track_and_ready"
                        else:
                            status = "on_track_not_yet_ready"

                    conn.execute(
                        """
                        INSERT INTO station_shift_counts (
                            team_id, user_id, station, count_date, service_period, product_id,
                            qty_before_snapshot, expected_pos_usage, expected_after_usage, qty_left,
                            variance_qty, pre_stocked_qty, post_stocked_qty, restocked_from_house,
                            ready_for_next_service, house_qty_before_snapshot, house_qty_after_restock,
                            manager_expected_usage, actual_station_used, usage_variance_qty, count_workflow,
                            unit, status, notes, created_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            team_id, user["id"], station, count_date, service_period, product_id,
                            house_before, manager_expected_usage, max(house_before - manager_expected_usage, 0.0), post_stocked_qty,
                            usage_variance, pre_stocked_qty, post_stocked_qty, restocked_from_house,
                            ready_for_next_service, house_before, house_after,
                            manager_expected_usage, actual_station_used, usage_variance, "end_shift_and_post_restock",
                            product["unit"], status, item.get("notes", ""), now_iso(),
                        ),
                    )
                    if restocked_from_house > 0:
                        conn.execute("UPDATE products SET current_qty=?, updated_at=? WHERE id=?", (house_after, now_iso(), product_id))
                        conn.execute(
                            "INSERT INTO inventory_transactions (team_id, product_id, user_id, change_qty, type, reason, created_at) VALUES (?, ?, ?, ?, 'station_restock_from_house', ?, ?)",
                            (team_id, product_id, user["id"], -restocked_from_house, f"{station} post-restock for {service_period or 'shift'}", now_iso()),
                        )
                    saved.append({
                        "product_id": product_id,
                        "product_name": product["name"],
                        "pre_stocked_qty": round(pre_stocked_qty, 4),
                        "post_stocked_qty": round(post_stocked_qty, 4),
                        "restocked_from_house": round(restocked_from_house, 4),
                        "house_qty_after_restock": round(house_after, 4),
                        "unit": product["unit"],
                        "ready_for_next_service": bool(ready_for_next_service),
                        "status": status,
                    })
                notify_managers(conn, team_id, "Station closeout submitted", f"{user['name']} submitted {len(saved)} station count(s) for {station} on {count_date} ({service_period or 'shift'}). Manager-only POS usage and variance are available in the team-lead view.")
                conn.commit()
                return self.send_json({"ok": True, "saved": saved})
            if path == "/api/invites":
                if not self.require_role(user, "team_leader"):
                    return
                role = data.get("role") or "employee"
                station = data.get("station") or ""
                code = make_code()
                expires = (datetime.now(timezone.utc) + timedelta(days=int(data.get("days", 7)))).replace(microsecond=0).isoformat()
                conn.execute(
                    "INSERT INTO invites (team_id, code, role, station, expires_at, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                    (team_id, code, role, station, expires, user["id"], now_iso()),
                )
                conn.commit()
                return self.send_json({"code": code, "role": role, "station": station, "expires_at": expires})
            if path == "/api/stations":
                if not self.require_role(user, "team_leader"):
                    return
                name = (data.get("name") or "").strip()
                if not name:
                    return self.send_json({"error": "Station name is required"}, 400)
                station_type = (data.get("station_type") or "").strip()
                notes = data.get("notes", "")
                conn.execute(
                    "INSERT INTO stations (team_id, name, station_type, notes, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(team_id, name) DO UPDATE SET station_type=excluded.station_type, notes=excluded.notes",
                    (team_id, name, station_type, notes, now_iso()),
                )
                conn.commit()
                return self.send_json({"ok": True, "name": name})
            if path == "/api/locations":
                if not self.require_role(user, "team_leader"):
                    return
                name = (data.get("name") or "").strip()
                if not name:
                    return self.send_json({"error": "Location name is required"}, 400)
                subclass = (data.get("subclass") or "").strip()
                notes = data.get("notes", "")
                try:
                    sort_order = int(float(data.get("sort_order") or data.get("in_order") or 999))
                except Exception:
                    sort_order = 999
                conn.execute(
                    """
                    INSERT INTO stock_locations (team_id, name, subclass, sort_order, notes, created_at)
                    VALUES (?, ?, ?, ?, ?, ?)
                    ON CONFLICT(team_id, name) DO UPDATE SET subclass=excluded.subclass, sort_order=excluded.sort_order, notes=excluded.notes
                    """,
                    (team_id, name, subclass, sort_order, notes, now_iso()),
                )
                conn.commit()
                return self.send_json({"ok": True, "name": name, "subclass": subclass, "sort_order": sort_order})
            if path == "/api/vendors":
                if not self.require_role(user, "team_leader"):
                    return
                conn.execute(
                    """
                    INSERT INTO vendors (team_id, name, order_days, delivery_days, cutoff_time, lead_days, email, phone, notes, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (team_id, data.get("name"), data.get("order_days", ""), data.get("delivery_days", ""), data.get("cutoff_time", ""), int(data.get("lead_days", 1)), data.get("email", ""), data.get("phone", ""), data.get("notes", ""), now_iso()),
                )
                conn.commit()
                return self.send_json({"ok": True, "id": conn.execute("SELECT last_insert_rowid()").fetchone()[0]})
            if path == "/api/products":
                if not self.require_role(user, "team_leader"):
                    return
                product_id = int(data.get("id") or 0)
                package_qty = float(data.get("package_qty") or data.get("amount_per_qty") or 1)
                package_unit = data.get("package_unit") or data.get("unit") or "each"
                package_price = float(data.get("package_price") or 0)
                unit = data.get("unit") or "each"
                current_qty = float(data.get("current_qty") or data.get("quantity_in_storage") or 0)
                cost_per_unit = calculate_cost_per_unit(package_qty, package_unit, package_price, unit)
                if product_id:
                    product = one(conn, "SELECT * FROM products WHERE id=? AND team_id=?", (product_id, team_id))
                    if not product:
                        return self.send_json({"error": "Product not found"}, 404)
                    delta = current_qty - float(product["current_qty"] or 0)
                    conn.execute(
                        """
                        UPDATE products SET vendor_id=?, name=?, category=?, unit=?, current_qty=?, par_level=?, reorder_point=?,
                            package_qty=?, package_unit=?, package_price=?, cost_per_unit=?, shelf_life_days=?, station=?,
                            stock_location=?, stocked_where=?, min_order_size=?, units_per_min_order=?, notes=?, updated_at=?
                        WHERE id=? AND team_id=?
                        """,
                        (data.get("vendor_id") or None, data.get("name"), data.get("category", ""), unit, current_qty,
                         float(data.get("par_level") or 0), float(data.get("reorder_point") or 0), package_qty, package_unit,
                         package_price, cost_per_unit, int(data.get("shelf_life_days") or 3), data.get("station", ""),
                         data.get("stock_location", ""), data.get("stocked_where", ""), float(data.get("min_order_size") or 1),
                         float(data.get("units_per_min_order") or data.get("package_qty") or 1), data.get("notes", ""), now_iso(), product_id, team_id),
                    )
                    if abs(delta) > 1e-9:
                        conn.execute("INSERT INTO inventory_transactions (team_id, product_id, user_id, change_qty, type, reason, created_at) VALUES (?, ?, ?, ?, 'inventory_adjustment', ?, ?)", (team_id, product_id, user["id"], delta, data.get("adjust_reason", "BUILD Inventory Tool adjustment"), now_iso()))
                    conn.commit()
                    return self.send_json({"ok": True, "id": product_id, "cost_per_unit": cost_per_unit, "mode": "adjust"})
                conn.execute(
                    """
                    INSERT INTO products (team_id, vendor_id, name, category, unit, current_qty, par_level, reorder_point,
                        package_qty, package_unit, package_price, cost_per_unit, shelf_life_days, station,
                        stock_location, stocked_where, min_order_size, units_per_min_order, notes, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (team_id, data.get("vendor_id") or None, data.get("name"), data.get("category", ""), unit, current_qty, float(data.get("par_level") or 0), float(data.get("reorder_point") or 0), package_qty, package_unit, package_price, cost_per_unit, int(data.get("shelf_life_days") or 3), data.get("station", ""), data.get("stock_location", ""), data.get("stocked_where", ""),
                     float(data.get("min_order_size") or 1), float(data.get("units_per_min_order") or data.get("package_qty") or 1), data.get("notes", ""), now_iso()),
                )
                product_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
                conn.execute("INSERT INTO inventory_transactions (team_id, product_id, user_id, change_qty, type, reason, created_at) VALUES (?, ?, ?, ?, 'initial_count', ?, ?)", (team_id, product_id, user["id"], current_qty, "Product created from BUILD Inventory Tool", now_iso()))
                conn.commit()
                return self.send_json({"ok": True, "id": product_id, "cost_per_unit": cost_per_unit, "mode": "create"})
            if path == "/api/count/manual":
                if not has_tool_access(conn, user, "inventory"):
                    return self.send_json({"error": "Temporary inventory/count access or team leader access required"}, 403)
                updates = data.get("items") or []
                saved = []
                for item in updates:
                    product_id = int(item.get("product_id") or 0)
                    if not product_id:
                        continue
                    product = one(conn, "SELECT * FROM products WHERE id=? AND team_id=?", (product_id, team_id))
                    if not product:
                        continue
                    old_qty = float(product["current_qty"] or 0)
                    new_qty = float(item.get("have") if item.get("have") not in (None, "") else old_qty)
                    delta = new_qty - old_qty
                    if abs(delta) > 1e-9:
                        conn.execute("UPDATE products SET current_qty=?, updated_at=? WHERE id=? AND team_id=?", (new_qty, now_iso(), product_id, team_id))
                        conn.execute("INSERT INTO inventory_transactions (team_id, product_id, user_id, change_qty, type, reason, created_at) VALUES (?, ?, ?, ?, 'count_stock_area', ?, ?)", (team_id, product_id, user["id"], delta, item.get("reason") or "COUNT stock-area count", now_iso()))
                    saved.append({"product_id": product_id, "old_qty": old_qty, "new_qty": new_qty, "delta": delta})
                conn.commit()
                return self.send_json({"ok": True, "saved": saved})
            if path.endswith("/count") and path.startswith("/api/products/"):
                if not has_tool_access(conn, user, "inventory"):
                    return self.send_json({"error": "Temporary inventory access or team leader access required"}, 403)
                product_id = int(path.split("/")[3])
                product = one(conn, "SELECT * FROM products WHERE id=? AND team_id=?", (product_id, team_id))
                if not product:
                    return self.send_json({"error": "Product not found"}, 404)
                new_qty = float(data.get("quantity") or 0)
                delta = new_qty - float(product["current_qty"] or 0)
                conn.execute("UPDATE products SET current_qty=?, updated_at=? WHERE id=?", (new_qty, now_iso(), product_id))
                conn.execute("INSERT INTO inventory_transactions (team_id, product_id, user_id, change_qty, type, reason, created_at) VALUES (?, ?, ?, ?, 'stock_count', ?, ?)", (team_id, product_id, user["id"], delta, data.get("reason", "Stock count"), now_iso()))
                if new_qty < float(product["reorder_point"] or 0):
                    notify_managers(conn, team_id, "Product below reorder point", f"{product['name']} is now {new_qty} {product['unit']}.")
                conn.commit()
                return self.send_json({"ok": True, "delta": round(delta, 4)})
            if path == "/api/recipes":
                if not self.require_role(user, "team_leader"):
                    return
                recipe_id = int(data.get("id") or 0)
                recipe_steps = data.get("recipe_steps") or data.get("steps_json") or ""
                if recipe_id:
                    existing = one(conn, "SELECT * FROM recipes WHERE id=? AND team_id=?", (recipe_id, team_id))
                    if not existing:
                        return self.send_json({"error": "Recipe not found"}, 404)
                    conn.execute(
                        """
                        UPDATE recipes SET name=?, station=?, yield_qty=?, portion_unit=?, menu_price=?, shelf_life_days=?, notes=?, recipe_steps=?, storage_container=?, station_container=?, container_size_qty=?, container_size_unit=?
                        WHERE id=? AND team_id=?
                        """,
                        (data.get("name"), data.get("station", ""), float(data.get("yield_qty") or 1), data.get("portion_unit", "plate"), float(data.get("menu_price") or 0), int(data.get("shelf_life_days") or 3), data.get("notes", ""), recipe_steps, data.get("storage_container", ""), data.get("station_container", ""), float(data.get("container_size_qty") or 0), data.get("container_size_unit", ""), recipe_id, team_id),
                    )
                    conn.execute("DELETE FROM recipe_items WHERE recipe_id=? AND team_id=?", (recipe_id, team_id))
                else:
                    conn.execute(
                        "INSERT INTO recipes (team_id, name, station, yield_qty, portion_unit, menu_price, shelf_life_days, notes, recipe_steps, storage_container, station_container, container_size_qty, container_size_unit, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                        (team_id, data.get("name"), data.get("station", ""), float(data.get("yield_qty") or 1), data.get("portion_unit", "plate"), float(data.get("menu_price") or 0), int(data.get("shelf_life_days") or 3), data.get("notes", ""), recipe_steps, data.get("storage_container", ""), data.get("station_container", ""), float(data.get("container_size_qty") or 0), data.get("container_size_unit", ""), now_iso()),
                    )
                    recipe_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
                for item in data.get("items", []):
                    conn.execute(
                        "INSERT INTO recipe_items (team_id, recipe_id, product_id, qty, unit, prep_note) VALUES (?, ?, ?, ?, ?, ?)",
                        (team_id, recipe_id, int(item["product_id"]), float(item["qty"]), item.get("unit", "each"), item.get("prep_note", "")),
                    )
                conn.commit()
                return self.send_json({"ok": True, "id": recipe_id, "cost": recipe_cost(conn, team_id, recipe_id), "mode": "adjust" if data.get("id") else "create"})
            if path == "/api/dishes":
                if not self.require_role(user, "team_leader"):
                    return
                dish_id = int(data.get("id") or 0)
                if dish_id:
                    existing = one(conn, "SELECT * FROM dishes WHERE id=? AND team_id=?", (dish_id, team_id))
                    if not existing:
                        return self.send_json({"error": "Menu item not found"}, 404)
                    conn.execute("UPDATE dishes SET name=?, station=?, menu_price=?, notes=?, photo_url=? WHERE id=? AND team_id=?", (data.get("name"), data.get("station", ""), float(data.get("menu_price") or 0), data.get("notes", ""), data.get("photo_url", ""), dish_id, team_id))
                    conn.execute("DELETE FROM dish_components WHERE dish_id=? AND team_id=?", (dish_id, team_id))
                else:
                    conn.execute("INSERT INTO dishes (team_id, name, station, menu_price, notes, photo_url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)", (team_id, data.get("name"), data.get("station", ""), float(data.get("menu_price") or 0), data.get("notes", ""), data.get("photo_url", ""), now_iso()))
                    dish_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
                for item in data.get("components", []):
                    ctype = item.get("component_type") or "recipe"
                    if ctype not in ("recipe", "product"):
                        continue
                    component_id = int(item.get("component_id") or 0)
                    if component_id <= 0:
                        continue
                    conn.execute("INSERT INTO dish_components (team_id, dish_id, component_type, component_id, qty, unit, portion_note) VALUES (?, ?, ?, ?, ?, ?, ?)", (team_id, dish_id, ctype, component_id, float(item.get("qty") or 0), item.get("unit", "each"), item.get("portion_note", "")))
                conn.commit()
                return self.send_json({"ok": True, "id": dish_id, "cost": dish_cost(conn, team_id, dish_id), "mode": "adjust" if data.get("id") else "create"})
            if path == "/api/count/stock":
                if not has_tool_access(conn, user, "inventory"):
                    return self.send_json({"error": "Inventory or count access required"}, 403)
                days = float(qs.get("days", ["7"])[0] or 7)
                return self.send_json(count_sheet_data(conn, team_id, days))
            if path == "/api/inventory/sheet_summary":
                return self.send_json(prep_inventory_ledger(conn, team_id))
            if path == "/api/prep/station_build":
                station = (qs.get("station", [user["station"] or ""])[0] or "").strip()
                return self.send_json(station_prep_options(conn, team_id, station))
            if path == "/api/prep/station_template":
                station = (data.get("station") or user["station"] or "").strip()
                selections = data.get("selections") or []
                if not user_is_manager(user):
                    return self.send_json({"error": "Only a chef/team leader can save BUILD PREP templates."}, 403)
                if not station:
                    return self.send_json({"error": "Choose a station first."}, 400)
                if not selections:
                    return self.send_json({"error": "Select at least one item or recipe for this station template."}, 400)
                conn.execute("DELETE FROM prep_station_template_items WHERE team_id=? AND lower(station)=lower(?)", (team_id, station))
                now = now_iso()
                for sel in selections:
                    kind = sel.get("kind")
                    if kind not in ("recipe", "product"):
                        continue
                    source_id = int(sel.get("id") or 0)
                    if source_id <= 0:
                        continue
                    conn.execute("""
                        INSERT OR REPLACE INTO prep_station_template_items
                        (team_id, station, item_kind, source_id, default_qty, unit, min_station_qty, min_station_unit, active, source_plates, notes, created_at, updated_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
                    """, (team_id, station, kind, source_id, float(sel.get("qty") or 1), sel.get("unit") or "each", float(sel.get("min_station_qty") or 0), sel.get("min_station_unit") or sel.get("unit") or "each", json.dumps(sel.get("source_plates") or []), sel.get("notes") or "", now, now))
                master = replace_master_prep_sheet_from_template(conn, team_id, station, selections, user["id"])
                conn.commit()
                notify_managers(conn, team_id, "MASTER PREPSHEET updated", f"{station} BUILD PREP template now feeds the Master Prep Sheet, Prep Estimator, Inventory totals, PAR risk, and vendor order suggestions.")
                return self.send_json({"ok": True, "station": station, "saved": len(selections), "master": master, "template": station_prep_template(conn, team_id, station), "inventory": prep_inventory_ledger(conn, team_id), "suggestions": build_order_suggestions(conn, team_id, 3)})
            if path == "/api/prep/station_build_submit":
                station = (data.get("station") or user["station"] or "").strip()
                prep_date = data.get("prep_date") or today_iso()
                service_period = data.get("service_period") or "dinner"
                selections = data.get("selections") or []
                if not station:
                    return self.send_json({"error": "Choose a station before uploading prep."}, 400)
                if not selections:
                    return self.send_json({"error": "Check at least one station item or recipe."}, 400)
                conn.execute(
                    "INSERT INTO prep_sheets (team_id, title, prep_date, service_period, status, created_by, created_at) VALUES (?, ?, ?, ?, 'uploaded', ?, ?)",
                    (team_id, f"{station} employee prep upload — {prep_date} {service_period}", prep_date, service_period, user["id"], now_iso()),
                )
                sheet_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
                created = []
                for sel in selections:
                    kind = sel.get("kind")
                    item_id = int(sel.get("id") or 0)
                    qty = float(sel.get("qty") or 1)
                    unit = sel.get("unit") or "each"
                    flags = sel.get("flags") or {}
                    notes = urgency_notes(flags)
                    priority = urgency_to_priority(flags)
                    if kind == "recipe":
                        recipe = one(conn, "SELECT * FROM recipes WHERE id=? AND team_id=?", (item_id, team_id))
                        if not recipe: continue
                        conn.execute("""
                            INSERT INTO prep_tasks (team_id, prep_sheet_id, recipe_id, product_id, title, qty, unit, station, assigned_to, priority, status, due_at, notes)
                            VALUES (?, ?, ?, NULL, ?, ?, ?, ?, NULL, ?, 'todo', ?, ?)
                        """, (team_id, sheet_id, item_id, f"Prep {recipe['name']}", qty, unit or recipe["portion_unit"] or "servings", station, priority, sel.get("due_at") or "", notes))
                    else:
                        product = one(conn, "SELECT * FROM products WHERE id=? AND team_id=?", (item_id, team_id))
                        if not product: continue
                        conn.execute("""
                            INSERT INTO prep_tasks (team_id, prep_sheet_id, recipe_id, product_id, title, qty, unit, station, assigned_to, priority, status, due_at, notes)
                            VALUES (?, ?, NULL, ?, ?, ?, ?, ?, NULL, ?, 'todo', ?, ?)
                        """, (team_id, sheet_id, item_id, f"Prep / restock {product['name']}", qty, unit or product["unit"], station, priority, sel.get("due_at") or "", notes))
                    task_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
                    created.append({"task_id": task_id, "kind": kind, "source_id": item_id, "qty": qty, "unit": unit, "urgency": notes})
                notify_managers(conn, team_id, "Employee prep sheet uploaded", f"{station} uploaded {len(created)} prep-needed item(s). Review by station, then send to the next shift, print, or save.")
                conn.commit()
                return self.send_json({"ok": True, "sheet_id": sheet_id, "created": created, "inventory": prep_inventory_ledger(conn, team_id), "suggestions": build_order_suggestions(conn, team_id, 3)})

            if path.startswith("/api/prep_tasks/") and path.endswith("/claim"):
                task_id = int(path.split("/")[3])
                task = one(conn, "SELECT * FROM prep_tasks WHERE id=? AND team_id=?", (task_id, team_id))
                if not task:
                    return self.send_json({"error": "Prep item not found"}, 404)
                conn.execute("UPDATE prep_tasks SET assigned_to=?, status='claimed', notes=? WHERE id=? AND team_id=?", (user["id"], ((task["notes"] or "") + "\nClaimed from employee Claim Prep Item page.").strip(), task_id, team_id))
                notify_managers(conn, team_id, "Prep item claimed", f"{user['name']} claimed {task['title']} for {task['station'] or 'station prep'}.")
                conn.commit()
                return self.send_json({"ok": True, "assigned_to": user["id"]})

            if path == "/api/prep/send_next_shift":
                if not self.require_role(user, "team_leader"):
                    return
                prep_date = data.get("date") or today_iso()
                tasks = rows_dict(all_rows(conn, """
                    SELECT pt.*, ps.prep_date, ps.service_period
                    FROM prep_tasks pt
                    JOIN prep_sheets ps ON ps.id=pt.prep_sheet_id
                    WHERE pt.team_id=? AND ps.prep_date=? AND pt.status!='done'
                    ORDER BY pt.station, pt.priority, pt.title
                """, (team_id, prep_date)))
                stations = sorted({t.get("station") or "Unassigned station" for t in tasks})
                title = f"Prep list ready for next shift — {prep_date}"
                station_text = ', '.join(stations) if stations else 'none'
                body = f"Chef Ledger has {len(tasks)} prep item(s) grouped by station: {station_text}. Open PREP to review your station checklist."
                active_users = all_rows(conn, "SELECT id FROM users WHERE team_id=? AND active=1", (team_id,))
                for row in active_users:
                    create_notification(conn, team_id, title, body, row["id"])
                conn.commit()
                return self.send_json({"ok": True, "notified": len(active_users), "tasks": len(tasks), "stations": stations})

            if path == "/api/prep_sheets":
                conn.execute(
                    "INSERT INTO prep_sheets (team_id, title, prep_date, service_period, status, created_by, created_at) VALUES (?, ?, ?, ?, 'open', ?, ?)",
                    (team_id, data.get("title") or "Prep Sheet", data.get("prep_date") or today_iso(), data.get("service_period") or "dinner", user["id"], now_iso()),
                )
                sheet_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
                conn.commit()
                return self.send_json({"ok": True, "id": sheet_id})
            if path.startswith("/api/prep_sheets/") and path.endswith("/tasks"):
                sheet_id = int(path.split("/")[3])
                conn.execute(
                    """
                    INSERT INTO prep_tasks (team_id, prep_sheet_id, recipe_id, product_id, title, qty, unit, station, assigned_to, priority, status, due_at, notes)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'todo', ?, ?)
                    """,
                    (team_id, sheet_id, data.get("recipe_id") or None, data.get("product_id") or None, data.get("title"), float(data.get("qty") or 1), data.get("unit", "each"), data.get("station", ""), data.get("assigned_to") or None, int(data.get("priority") or 3), data.get("due_at", ""), data.get("notes", "")),
                )
                conn.commit()
                return self.send_json({"ok": True, "id": conn.execute("SELECT last_insert_rowid()").fetchone()[0]})
            if path.startswith("/api/prep_sheets/") and path.endswith("/generate"):
                sheet_id = int(path.split("/")[3])
                created_ids = []
                for demand in data.get("recipe_demands", []):
                    recipe = one(conn, "SELECT * FROM recipes WHERE id=? AND team_id=?", (int(demand["recipe_id"]), team_id))
                    if not recipe:
                        continue
                    servings = float(demand.get("servings") or recipe["yield_qty"] or 1)
                    conn.execute(
                        """
                        INSERT INTO prep_tasks (team_id, prep_sheet_id, recipe_id, title, qty, unit, station, priority, status, due_at, notes)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'todo', ?, ?)
                        """,
                        (team_id, sheet_id, recipe["id"], f"Prep {recipe['name']}", servings, recipe["portion_unit"] + "s", recipe["station"], int(demand.get("priority") or 2), demand.get("due_at", ""), "Generated from recipe demand"),
                    )
                    created_ids.append(conn.execute("SELECT last_insert_rowid()").fetchone()[0])
                conn.commit()
                return self.send_json({"ok": True, "task_ids": created_ids})
            if path.startswith("/api/prep_tasks/") and path.endswith("/complete"):
                task_id = int(path.split("/")[3])
                task = one(conn, "SELECT * FROM prep_tasks WHERE id=? AND team_id=?", (task_id, team_id))
                if not task:
                    return self.send_json({"error": "Task not found"}, 404)
                if task["status"] == "done":
                    return self.send_json({"ok": True, "message": "Already complete"})
                usages = complete_prep_task_now(conn, team_id, task_id, user["id"], data.get("made_at") or now_iso())
                conn.commit()
                return self.send_json({"ok": True, "deducted": usages})
            if path == "/api/orders/create_from_suggestions":
                if not self.require_role(user, "team_leader"):
                    return
                suggestions = data.get("suggestions") or build_order_suggestions(conn, team_id, float(data.get("days", 3)))
                vendor_filter = data.get("vendor_id")
                by_vendor = {}
                for s in suggestions:
                    if vendor_filter and int(s.get("vendor_id") or 0) != int(vendor_filter):
                        continue
                    if float(s.get("suggested_order_qty") or 0) <= 0:
                        continue
                    by_vendor.setdefault(s.get("vendor_id"), []).append(s)
                order_ids = []
                for vendor_id, items in by_vendor.items():
                    vendor = one(conn, "SELECT * FROM vendors WHERE id=? AND team_id=?", (vendor_id, team_id)) if vendor_id else None
                    expected = expected_delivery_for_vendor(vendor)
                    title = f"{vendor['name'] if vendor else 'Unassigned Vendor'} Order - {today_iso()}"
                    conn.execute("INSERT INTO orders (team_id, vendor_id, title, status, order_date, expected_delivery, created_by, created_at) VALUES (?, ?, ?, 'draft', ?, ?, ?, ?)", (team_id, vendor_id, title, today_iso(), expected, user["id"], now_iso()))
                    order_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
                    order_ids.append(order_id)
                    for s in items:
                        conn.execute(
                            """
                            INSERT INTO order_items (
                                team_id, order_id, product_id, qty, unit, unit_cost,
                                pack_size_qty, pack_size_unit, base_unit,
                                expected_prep_usage, expected_pos_usage, expected_total_usage,
                                current_qty_snapshot, projected_before_delivery, projected_after_order,
                                par_level_snapshot, reorder_point_snapshot, suggested_base_qty,
                                risk_snapshot, prep_sources_snapshot, pos_sources_snapshot, status
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ordered')
                            """,
                            (
                                team_id, order_id, s["product_id"], float(s.get("suggested_order_qty") or 0), s.get("supplier_unit") or s.get("unit") or "each", float(s.get("unit_cost") or s.get("package_price") or 0),
                                float(s.get("pack_size_qty") or 1), s.get("pack_size_unit") or s.get("unit") or "each", s.get("base_unit") or s.get("unit") or "each",
                                float(s.get("pending_prep_usage") or 0), float(s.get("forecast_usage") or 0), float(s.get("expected_total_usage") or 0),
                                float(s.get("current_qty") or 0), float(s.get("projected_qty") or 0), float(s.get("projected_after_order") or 0),
                                float(s.get("par_level") or 0), float(s.get("reorder_point") or 0), float(s.get("suggested_base_qty") or 0),
                                s.get("risk") or "", json.dumps(s.get("prep_sources") or []), json.dumps(s.get("pos_sources") or []),
                            ),
                        )
                conn.commit()
                return self.send_json({"ok": True, "order_ids": order_ids})
            if path.startswith("/api/orders/") and path.endswith("/receive"):
                if not self.require_role(user, "team_leader"):
                    return
                order_id = int(path.split("/")[3])
                items = all_rows(conn, "SELECT oi.*, p.name AS product_name, p.package_qty, p.package_unit, p.unit AS product_base_unit FROM order_items oi JOIN products p ON p.id=oi.product_id WHERE oi.order_id=? AND oi.team_id=?", (order_id, team_id))
                for item in items:
                    received_supplier_qty = float(data.get("received", {}).get(str(item["id"]), item["qty"])) if isinstance(data.get("received"), dict) else float(item["qty"])
                    product = one(conn, "SELECT * FROM products WHERE id=? AND team_id=?", (item["product_id"], team_id))
                    pack_qty = float(item["pack_size_qty"] or 0) or pack_contains_base_qty(product)
                    received_base_qty = received_supplier_qty * pack_qty
                    new_qty = float(product["current_qty"] or 0) + received_base_qty
                    conn.execute("UPDATE products SET current_qty=?, updated_at=? WHERE id=?", (new_qty, now_iso(), product["id"]))
                    conn.execute("INSERT INTO inventory_transactions (team_id, product_id, user_id, change_qty, type, reason, related_type, related_id, created_at) VALUES (?, ?, ?, ?, 'order_received', ?, 'order', ?, ?)", (team_id, product["id"], user["id"], received_base_qty, f"Received {received_supplier_qty:g} {item['unit']} from order #{order_id}", order_id, now_iso()))
                    conn.execute("UPDATE order_items SET status='received' WHERE id=?", (item["id"],))
                conn.execute("UPDATE orders SET status='received' WHERE id=? AND team_id=?", (order_id, team_id))
                notify_managers(conn, team_id, "Order received", f"Order #{order_id} was marked received and inventory was updated in base inventory units.")
                conn.commit()
                return self.send_json({"ok": True})
            if path == "/api/files/storage_settings":
                if not self.require_role(user, "owner"):
                    return
                limit_mb = max(1.0, parse_float(data.get("storage_limit_mb"), 250.0))
                provider_cost = max(0.0, parse_float(data.get("provider_cost_per_gb_month"), 0.25))
                monthly_cost = (limit_mb / 1024.0) * provider_cost
                note = data.get("subscription_storage_note") or "Configured FILES storage cap priced into the monthly subscription."
                conn.execute(
                    """
                    INSERT INTO file_storage_settings (team_id, storage_limit_mb, provider_cost_per_gb_month, monthly_storage_cost, subscription_storage_note, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?)
                    ON CONFLICT(team_id) DO UPDATE SET storage_limit_mb=excluded.storage_limit_mb, provider_cost_per_gb_month=excluded.provider_cost_per_gb_month,
                    monthly_storage_cost=excluded.monthly_storage_cost, subscription_storage_note=excluded.subscription_storage_note, updated_at=excluded.updated_at
                    """,
                    (team_id, limit_mb, provider_cost, monthly_cost, note, now_iso()),
                )
                conn.commit()
                return self.send_json({"ok": True, "storage": file_storage_summary(conn, team_id)})
            if path == "/api/files/pos/upload_csv":
                if not self.require_role(user, "team_leader"):
                    return
                files = data.get("files") or []
                if not files and data.get("csv"):
                    files = [{"filename": data.get("filename") or f"pasted-pos-{today_iso()}.csv", "csv": data.get("csv") or ""}]
                summary = file_storage_summary(conn, team_id)
                incoming_bytes = sum(int(item.get("size_bytes") or len((item.get("csv") or "").encode("utf-8"))) for item in files)
                if int(summary["used_bytes"]) + incoming_bytes > int(summary["limit_bytes"]):
                    return self.send_json({"error": "FILES storage limit would be exceeded by these POS CSV uploads."}, 400)
                results = []
                for item in files:
                    result = parse_pos_csv(conn, team_id, user["id"], item.get("filename") or f"pos-{today_iso()}.csv", item.get("csv") or "", data.get("notes", ""), data.get("source_kind", "manual_upload"))
                    results.append(result)
                imported = sum(int(r.get("imported") or 0) for r in results)
                missing = sorted({m for r in results for m in r.get("missing_recipes", [])})
                notify_managers(conn, team_id, "POS CSV upload complete", f"Scanned {len(results)} POS CSV file(s), imported {imported} matched rows, and found {len(missing)} unmatched plate name(s).")
                conn.commit()
                return self.send_json({"ok": True, "results": results, "imported": imported, "missing_recipes": missing, "workspace": pos_workspace_data(conn, team_id)})
            if path == "/api/files/pos/project":
                payload = projection_for_plates(conn, team_id, data.get("plates") or [], data.get("projection_type") or "week")
                return self.send_json(payload)
            if path == "/api/files/pos/ran_special":
                payload = ran_special_stats(conn, team_id, data.get("plates") or [], data.get("days") or [], bool(data.get("specific_days_only")))
                return self.send_json(payload)
            if path == "/api/files/pos/save_profile":
                if not self.require_role(user, "team_leader"):
                    return
                profile_id = save_projection_profile(conn, team_id, user["id"], data.get("name") or f"Projection {today_iso()}", data.get("profile_type") or "projection", data.get("payload") or {})
                conn.commit()
                return self.send_json({"ok": True, "id": profile_id, "workspace": pos_workspace_data(conn, team_id)})
            if path == "/api/files/pictures/folders":
                if not self.require_role(user, "team_leader"):
                    return
                name = (data.get("name") or "Untitled folder").strip()
                purpose = (data.get("purpose") or "general").strip()
                cursor = conn.execute("INSERT INTO picture_folders (team_id, name, purpose, created_by, created_at) VALUES (?, ?, ?, ?, ?)", (team_id, name, purpose, user["id"], now_iso()))
                conn.commit()
                return self.send_json({"ok": True, "id": int(cursor.lastrowid)})
            if path == "/api/files/pictures/upload":
                if not self.require_role(user, "team_leader"):
                    return
                folder_id = int(data.get("folder_id") or 0)
                folder = one(conn, "SELECT * FROM picture_folders WHERE id=? AND team_id=?", (folder_id, team_id))
                if not folder:
                    return self.send_json({"error": "Create or choose a picture folder first."}, 400)
                upload_items = data.get("files") or []
                if not upload_items:
                    return self.send_json({"error": "No pictures selected."}, 400)
                summary = file_storage_summary(conn, team_id)
                incoming_bytes = sum(int(item.get("size_bytes") or 0) for item in upload_items)
                if int(summary["used_bytes"]) + incoming_bytes > int(summary["limit_bytes"]):
                    return self.send_json({"error": "FILES storage limit would be exceeded. Raise the storage cap or remove files before uploading."}, 400)
                folder_path = team_upload_root(team_id) / "pictures" / f"folder_{folder_id}"
                folder_path.mkdir(parents=True, exist_ok=True)
                saved = []
                for item in upload_items:
                    original_name = item.get("name") or "picture.jpg"
                    content_type = item.get("content_type") or "image/jpeg"
                    data_url = item.get("data_url") or ""
                    if not content_type.startswith("image/") or "," not in data_url:
                        continue
                    encoded = data_url.split(",", 1)[1]
                    raw = base64.b64decode(encoded)
                    ext = mimetypes.guess_extension(content_type) or Path(original_name).suffix or ".jpg"
                    filename = f"{int(time.time())}-{secrets.token_hex(4)}-{safe_slug(Path(original_name).stem, 'picture')}{ext}"
                    file_path = folder_path / filename
                    file_path.write_bytes(raw)
                    rel_url = f"/uploads/team_{int(team_id)}/pictures/folder_{folder_id}/{filename}"
                    cursor = conn.execute(
                        """
                        INSERT INTO picture_files (team_id, folder_id, filename, original_name, content_type, size_bytes, storage_path, public_url, usage_target, linked_name, created_by, created_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (team_id, folder_id, filename, original_name, content_type, len(raw), str(file_path.relative_to(APP_ROOT)), rel_url, data.get("usage_target") or "recipe_cards", data.get("linked_name") or "", user["id"], now_iso()),
                    )
                    saved.append({"id": int(cursor.lastrowid), "filename": filename, "url": rel_url, "size_bytes": len(raw)})
                conn.commit()
                return self.send_json({"ok": True, "saved": saved, "pictures": rows_dict(all_rows(conn, "SELECT * FROM picture_files WHERE team_id=? ORDER BY created_at DESC", (team_id,))), "storage": file_storage_summary(conn, team_id)})
            if path == "/api/files/pictures/social_links":
                platform_map = data.get("links") or {}
                for platform, url in platform_map.items():
                    platform = safe_slug(platform, "social").lower()
                    url = str(url or "").strip()
                    if not url:
                        conn.execute("DELETE FROM user_social_links WHERE team_id=? AND user_id=? AND platform=?", (team_id, user["id"], platform))
                        continue
                    conn.execute(
                        """
                        INSERT INTO user_social_links (team_id, user_id, platform, url, updated_at) VALUES (?, ?, ?, ?, ?)
                        ON CONFLICT(team_id, user_id, platform) DO UPDATE SET url=excluded.url, updated_at=excluded.updated_at
                        """,
                        (team_id, user["id"], platform, url, now_iso()),
                    )
                conn.commit()
                return self.send_json({"ok": True})
            if path == "/api/files/pictures/generate_prompt":
                if not tier_limits(conn, team_id).get("social_prompt"):
                    return self.send_json({"error": "Create Post prompt generator is available only on the top-tier subscription."}, 403)
                picture_id = int(data.get("picture_id") or 0) or None
                result = generate_social_prompt(conn, team_id, user["id"], picture_id, data.get("plate_name") or data.get("linked_name") or "", data.get("occasion") or "", data.get("tone") or "")
                conn.commit()
                return self.send_json({"ok": True, **result})
            if path == "/api/files/inventories/save_snapshot":
                if not self.require_role(user, "team_leader"):
                    return
                snapshot_id = save_inventory_snapshot(conn, team_id, user["id"], data.get("snapshot_type") or "inventory", data.get("title") or "")
                conn.commit()
                return self.send_json({"ok": True, "id": snapshot_id, "workspace": files_inventories_data(conn, team_id)})
            if path == "/api/files/deliveries/save_record":
                if not self.require_role(user, "team_leader"):
                    return
                record_id = save_delivery_record(conn, team_id, user["id"], int(data.get("order_id") or 0) or None, int(data.get("vendor_id") or 0) or None, data.get("title") or "")
                conn.commit()
                return self.send_json({"ok": True, "id": record_id, "workspace": files_deliveries_data(conn, team_id)})
            if path == "/api/prep/forecaster/apply":
                if not self.require_role(user, "team_leader"):
                    return
                result = apply_forecaster_profile(conn, team_id, user["id"], int(data.get("profile_id") or 0), data.get("start_date") or today_iso(), data.get("end_date") or data.get("start_date") or today_iso(), data.get("adjustments") or {}, data.get("title") or "")
                notify_managers(conn, team_id, "Forecaster added to prep", f"Added forecast profile to prep sheet #{result['prep_sheet_id']} with {result['task_count']} prep task(s).")
                conn.commit()
                return self.send_json({"ok": True, **result, "workspace": forecaster_data(conn, team_id)})
            if path == "/api/prep/forecaster/undo":
                if not self.require_role(user, "team_leader"):
                    return
                result = undo_forecaster_event(conn, team_id, user["id"], int(data.get("event_id") or 0))
                notify_managers(conn, team_id, "Want to Cancel Special ?", f"Forecaster event #{result['event_id']} was canceled and removed from prep/order impact.")
                conn.commit()
                return self.send_json({"ok": True, **result, "workspace": forecaster_data(conn, team_id)})
            if path == "/api/files/qr_codes/create":
                if not self.require_role(user, "team_leader"):
                    return
                if not tier_limits(conn, team_id).get("qr"):
                    return self.send_json({"error": "QR CODE MAKER is available only on the top-tier subscription."}, 403)
                recipe_id = int(data.get("recipe_id") or 0)
                recipe = one(conn, "SELECT * FROM recipes WHERE id=? AND team_id=?", (recipe_id, team_id))
                if not recipe:
                    return self.send_json({"error": "Choose a recipe first."}, 400)
                existing = one(conn, "SELECT * FROM recipe_qr_codes WHERE team_id=? AND recipe_id=?", (team_id, recipe_id))
                if existing:
                    return self.send_json({"ok": True, "code": row_dict(existing), "workspace": recipe_qr_data(conn, team_id)})
                token = secrets.token_urlsafe(10).replace("-", "A").replace("_", "B")
                url = f"/recipebook/{token}"
                svg = qr_svg_for_url(url, recipe["name"])
                cur = conn.execute("INSERT INTO recipe_qr_codes (team_id, recipe_id, token, label, url, svg, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", (team_id, recipe_id, token, recipe["name"], url, svg, user["id"], now_iso()))
                conn.commit()
                return self.send_json({"ok": True, "id": int(cur.lastrowid), "workspace": recipe_qr_data(conn, team_id)})
            if path == "/api/pos/import_csv":
                if not self.require_role(user, "team_leader"):
                    return
                result = parse_pos_csv(conn, team_id, user["id"], data.get("filename") or f"pasted-pos-{today_iso()}.csv", data.get("csv", ""), data.get("notes", ""), "legacy_pos_import")
                notify_managers(conn, team_id, "POS import complete", f"Imported {result['imported']} POS sales rows from {result.get('filename') or 'pasted CSV'}. Missing recipes: {', '.join(result['missing_recipes'][:5]) if result['missing_recipes'] else 'none'}.")
                conn.commit()
                return self.send_json({"ok": True, **result})
            if path == "/api/shifts/offer":
                if not user_can_access_tool(conn, user, "scheduler_write"):
                    return self.send_json({"error": "Scheduler write access required"}, 403)
                user_ids = data.get("user_ids") or []
                try:
                    user_ids = [int(x) for x in user_ids]
                except Exception:
                    return self.send_json({"error": "user_ids must be a list of employee ids"}, 400)
                if not user_ids:
                    return self.send_json({"error": "Choose at least one employee to offer this shift"}, 400)
                conn.execute("INSERT INTO shifts (team_id, title, station, start_at, end_at, status, assigned_to, created_by, notes, created_at) VALUES (?, ?, ?, ?, ?, 'offered', NULL, ?, ?, ?)", (team_id, data.get("title"), data.get("station", ""), data.get("start_at"), data.get("end_at"), user["id"], data.get("notes", ""), now_iso()))
                shift_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
                respond_by = data.get("respond_by") or ""
                respond_text = f" Respond by {respond_by}." if respond_by else ""
                for uid in user_ids:
                    emp = one(conn, "SELECT id, name FROM users WHERE id=? AND team_id=? AND active=1", (uid, team_id))
                    if not emp:
                        continue
                    conn.execute("INSERT OR IGNORE INTO shift_claims (team_id, shift_id, user_id, status, created_at) VALUES (?, ?, ?, 'offered', ?)", (team_id, shift_id, uid, now_iso()))
                    create_notification(conn, team_id, "Shift offered", f"You were offered {data.get('title')} from {data.get('start_at')} to {data.get('end_at')}.{respond_text} Please accept or decline.", uid)
                notify_managers(conn, team_id, "Shift offers sent", f"{data.get('title')} was offered to {len(user_ids)} employee(s).")
                conn.commit()
                return self.send_json({"ok": True, "id": shift_id, "offered_to": len(user_ids)})

            if path == "/api/shifts":
                if not user_can_access_tool(conn, user, "scheduler_write"):
                    return self.send_json({"error": "Scheduler write access required"}, 403)
                conn.execute("INSERT INTO shifts (team_id, title, station, start_at, end_at, status, assigned_to, created_by, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", (team_id, data.get("title"), data.get("station", ""), data.get("start_at"), data.get("end_at"), data.get("status", "open"), data.get("assigned_to") or None, user["id"], data.get("notes", ""), now_iso()))
                shift_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
                if data.get("status", "open") == "open":
                    create_notification(conn, team_id, "Open shift available", f"{data.get('title')} is available for sign-up.")
                elif data.get("assigned_to"):
                    create_notification(conn, team_id, "Shift added to your schedule", f"{data.get('title')} was added from {data.get('start_at')} to {data.get('end_at')}.", int(data.get("assigned_to")))
                    assigned_uid = int(data.get("assigned_to"))
                    shift_week_start = local_week_start(str(data.get("start_at") or "").split("T")[0])
                    schedule_for_shift = build_week_schedule(conn, team_id, shift_week_start)
                    conflicts = [block for block in schedule_for_shift.get("unavailable", []) if int(block.get("user_id") or 0) == assigned_uid]
                    for block in conflicts:
                        if overlap_minutes(data.get("start_at"), data.get("end_at"), block["start_at"], block["end_at"]) > 0:
                            notify_managers(conn, team_id, "Schedule conflict", f"{data.get('title')} overlaps {block.get('reason') or 'scheduled off'}.")
                            break
                    can_work_blocks = [block for block in schedule_for_shift.get("available", []) if int(block.get("user_id") or 0) == assigned_uid]
                    if can_work_blocks and not any(range_fully_covers(block["start_at"], block["end_at"], data.get("start_at"), data.get("end_at")) for block in can_work_blocks):
                        notify_managers(conn, team_id, "Schedule availability warning", f"{data.get('title')} is outside the employee's weekly can-work shift availability.")
                conn.commit()
                return self.send_json({"ok": True, "id": shift_id})
            if path.startswith("/api/shifts/") and path.endswith("/offer_own"):
                shift_id = int(path.split("/")[3])
                shift = one(conn, "SELECT * FROM shifts WHERE id=? AND team_id=?", (shift_id, team_id))
                if not shift:
                    return self.send_json({"error": "Shift not found"}, 404)
                if int(shift["assigned_to"] or 0) != int(user["id"]):
                    return self.send_json({"error": "Only the assigned employee can offer their own shift"}, 403)
                schedule_for_shift = build_week_schedule(conn, team_id, local_week_start(str(shift["start_at"]).split("T")[0]))
                eligible = []
                for emp in schedule_for_shift.get("users", []):
                    if int(emp.get("id") or 0) == int(user["id"]):
                        continue
                    if not user_eligible_for_shift(schedule_for_shift, emp, shift):
                        continue
                    eligible.append(int(emp["id"]))
                conn.execute("UPDATE shifts SET status='offered', notes=? WHERE id=? AND team_id=?", ((shift["notes"] or "") + "\nEmployee offered this shift for pickup.", shift_id, team_id))
                for uid in eligible:
                    conn.execute("INSERT OR IGNORE INTO shift_claims (team_id, shift_id, user_id, status, created_at) VALUES (?, ?, ?, 'offered', ?)", (team_id, shift_id, uid, now_iso()))
                    create_notification(conn, team_id, "Shift available to claim", f"{user['name']} offered {shift['title']} from {shift['start_at']} to {shift['end_at']}. Tap CLAIM if you can cover it.", uid)
                notify_managers(conn, team_id, "Shift offered by employee", f"{user['name']} offered {shift['title']} to {len(eligible)} eligible coworker(s). A shift captain must approve any claim.")
                conn.commit()
                return self.send_json({"ok": True, "offered_to": len(eligible)})

            if path.startswith("/api/shifts/") and path.endswith("/respond"):
                shift_id = int(path.split("/")[3])
                shift = one(conn, "SELECT * FROM shifts WHERE id=? AND team_id=?", (shift_id, team_id))
                if not shift:
                    return self.send_json({"error": "Shift not found"}, 404)
                if shift["assigned_to"] != user["id"]:
                    return self.send_json({"error": "Only the assigned employee can respond to this shift"}, 403)
                response = str(data.get("response") or "").strip().lower()
                if response not in ("accepted", "declined"):
                    return self.send_json({"error": "Response must be accepted or declined"}, 400)
                conn.execute("UPDATE shifts SET employee_response=? WHERE id=? AND team_id=?", (response, shift_id, team_id))
                notify_managers(conn, team_id, "Schedule response", f"{user['name']} {response} {shift['title']} from {shift['start_at']} to {shift['end_at']}.")
                conn.commit()
                return self.send_json({"ok": True})
            if path.startswith("/api/shifts/") and path.endswith("/claim"):
                shift_id = int(path.split("/")[3])
                shift = one(conn, "SELECT * FROM shifts WHERE id=? AND team_id=?", (shift_id, team_id))
                if not shift:
                    return self.send_json({"error": "Shift not found"}, 404)
                conn.execute("INSERT OR IGNORE INTO shift_claims (team_id, shift_id, user_id, status, created_at) VALUES (?, ?, ?, 'pending', ?)", (team_id, shift_id, user["id"], now_iso()))
                notify_managers(conn, team_id, "Open shift claim", f"{user['name']} offered to work {shift['title']}.")
                conn.commit()
                return self.send_json({"ok": True})
            if path.startswith("/api/shift_claims/") and path.endswith("/respond_offer"):
                claim_id = int(path.split("/")[3])
                response = str(data.get("response") or "").strip().lower()
                if response not in ("accepted", "declined"):
                    return self.send_json({"error": "Response must be accepted or declined"}, 400)
                claim = one(conn, "SELECT sc.*, s.title, s.start_at, s.end_at FROM shift_claims sc JOIN shifts s ON s.id=sc.shift_id WHERE sc.id=? AND sc.team_id=?", (claim_id, team_id))
                if not claim:
                    return self.send_json({"error": "Offer not found"}, 404)
                if int(claim["user_id"]) != int(user["id"]):
                    return self.send_json({"error": "Only the offered employee can respond"}, 403)
                new_status = "pending" if response == "accepted" else "declined"
                conn.execute("UPDATE shift_claims SET status=? WHERE id=? AND team_id=?", (new_status, claim_id, team_id))
                if response == "accepted":
                    notify_managers(conn, team_id, "AWAITING APPROVAL", f"{user['name']} accepted the offered shift {claim['title']} from {claim['start_at']} to {claim['end_at']}.")
                    create_notification(conn, team_id, "AWAITING APPROVAL", f"You accepted {claim['title']}. A team leader must approve before it is final.", user["id"])
                else:
                    notify_managers(conn, team_id, "Shift offer declined", f"{user['name']} declined {claim['title']} from {claim['start_at']} to {claim['end_at']}.")
                conn.commit()
                return self.send_json({"ok": True, "status": new_status})

            if path.startswith("/api/shift_claims/") and path.endswith("/decide"):
                if not user_can_access_tool(conn, user, "scheduler_write"):
                    return self.send_json({"error": "Scheduler write access required"}, 403)
                claim_id = int(path.split("/")[3])
                status = data.get("status", "approved")
                claim = one(conn, "SELECT * FROM shift_claims WHERE id=? AND team_id=?", (claim_id, team_id))
                if not claim:
                    return self.send_json({"error": "Claim not found"}, 404)
                conn.execute("UPDATE shift_claims SET status=?, decided_by=?, decided_at=? WHERE id=?", (status, user["id"], now_iso(), claim_id))
                if status == "approved":
                    conn.execute("UPDATE shifts SET assigned_to=?, status='assigned' WHERE id=? AND team_id=?", (claim["user_id"], claim["shift_id"], team_id))
                    conn.execute("UPDATE shift_claims SET status='declined', decided_by=?, decided_at=? WHERE shift_id=? AND id!=?", (user["id"], now_iso(), claim["shift_id"], claim_id))
                    create_notification(conn, team_id, "Shift approved", "You were selected for the open shift.", claim["user_id"])
                conn.commit()
                return self.send_json({"ok": True})
            if path == "/api/weekly_availability":
                requested_user_id = int(data.get("user_id") or user["id"])
                if requested_user_id != user["id"] and not self.require_role(user, "team_leader"):
                    return
                assigned_user = one(conn, "SELECT * FROM users WHERE id=? AND team_id=?", (requested_user_id, team_id))
                if not assigned_user:
                    return self.send_json({"error": "Employee not found"}, 404)
                try:
                    day_of_week = int(data.get("day_of_week"))
                except Exception:
                    return self.send_json({"error": "Day of week is required"}, 400)
                if day_of_week < 0 or day_of_week > 6:
                    return self.send_json({"error": "Day of week must be Monday through Sunday"}, 400)
                start_time = normalize_time(data.get("start_time"))
                end_time = normalize_time(data.get("end_time"))
                if not start_time or not end_time:
                    return self.send_json({"error": "Valid start and end times are required"}, 400)
                status = data.get("status") or "can_work"
                if status not in ("can_work", "cannot_work"):
                    return self.send_json({"error": "Status must be can_work or cannot_work"}, 400)
                shift_label = data.get("shift_label") or ""
                label = data.get("label") or data.get("reason") or ("Can work" if status == "can_work" else "Unavailable")
                conn.execute(
                    """
                    INSERT INTO employee_weekly_availability
                    (team_id, user_id, day_of_week, shift_label, start_time, end_time, status, label, created_by, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (team_id, requested_user_id, day_of_week, shift_label, start_time, end_time, status, label, user["id"], now_iso()),
                )
                action = "can work" if status == "can_work" else "cannot work"
                day_name = DAY_NAMES[day_of_week]
                if requested_user_id != user["id"]:
                    create_notification(conn, team_id, "Weekly availability updated", f"Your {day_name} {shift_label or 'shift'} availability was marked as {action}: {start_time} to {end_time} ({label}).", requested_user_id)
                else:
                    notify_managers(conn, team_id, "Employee weekly availability updated", f"{user['name']} says they {action} {day_name} {shift_label or 'shift'} from {start_time} to {end_time}: {label}.")
                conn.commit()
                return self.send_json({"ok": True})
            if path == "/api/available_shifts":
                requested_user_id = int(data.get("user_id") or user["id"])
                if requested_user_id != user["id"] and not self.require_role(user, "team_leader"):
                    return
                assigned_user = one(conn, "SELECT * FROM users WHERE id=? AND team_id=?", (requested_user_id, team_id))
                if not assigned_user:
                    return self.send_json({"error": "Employee not found"}, 404)
                start_at = data.get("start_at") or ""
                end_at = data.get("end_at") or ""
                if not start_at or not end_at or not parse_dt(start_at) or not parse_dt(end_at) or parse_dt(end_at) <= parse_dt(start_at):
                    return self.send_json({"error": "Valid start and end times are required"}, 400)
                label = data.get("label") or "Can work"
                conn.execute("INSERT INTO employee_availability (team_id, user_id, start_at, end_at, label, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)", (team_id, requested_user_id, start_at, end_at, label, user["id"], now_iso()))
                if requested_user_id != user["id"]:
                    create_notification(conn, team_id, "Available shift block added", f"You are marked available from {start_at} to {end_at}: {label}.", requested_user_id)
                else:
                    notify_managers(conn, team_id, "Employee availability updated", f"{user['name']} added a can-work block from {start_at} to {end_at}.")
                conn.commit()
                return self.send_json({"ok": True})
            if path == "/api/availability":
                requested_user_id = int(data.get("user_id") or user["id"])
                if requested_user_id != user["id"] and not self.require_role(user, "team_leader"):
                    return
                assigned_user = one(conn, "SELECT * FROM users WHERE id=? AND team_id=?", (requested_user_id, team_id))
                if not assigned_user:
                    return self.send_json({"error": "Employee not found"}, 404)
                start_at = data.get("start_at") or ""
                end_at = data.get("end_at") or ""
                if not start_at or not end_at or not parse_dt(start_at) or not parse_dt(end_at) or parse_dt(end_at) <= parse_dt(start_at):
                    return self.send_json({"error": "Valid start and end times are required"}, 400)
                reason = data.get("reason") or "Scheduled off"
                conn.execute("INSERT INTO employee_unavailability (team_id, user_id, start_at, end_at, reason, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)", (team_id, requested_user_id, start_at, end_at, reason, user["id"], now_iso()))
                if requested_user_id != user["id"]:
                    create_notification(conn, team_id, "Scheduled off added", f"You are marked unavailable from {start_at} to {end_at}: {reason}.", requested_user_id)
                else:
                    notify_managers(conn, team_id, "Employee availability updated", f"{user['name']} added a can't-work block from {start_at} to {end_at}: {reason}.")
                conn.commit()
                return self.send_json({"ok": True})
            if path == "/api/scheduler/blueprints":
                if not self.require_role(user, "team_leader"):
                    return
                try:
                    days = data.get("days") or [data.get("day_of_week")]
                    normalized_days = []
                    for d in days:
                        if d in (None, ""):
                            continue
                        dd = int(d)
                        if 0 <= dd <= 6:
                            normalized_days.append(dd)
                    if not normalized_days:
                        return self.send_json({"error": "Choose at least one day"}, 400)
                except Exception:
                    return self.send_json({"error": "Choose valid days Monday through Sunday"}, 400)
                shift_label = (data.get("shift_label") or "").strip()
                station = (data.get("station") or "").strip()
                start_time = normalize_time(data.get("start_time"))
                end_time = normalize_time(data.get("end_time"))
                if not shift_label or not station or not start_time or not end_time:
                    return self.send_json({"error": "Shift, station, start time, and end time are required"}, 400)
                employees_needed = max(1, int(float(data.get("employees_needed") or 1)))
                notes = data.get("notes") or ""
                action = (data.get("action") or "submit").strip().lower()
                adjust_scope = (data.get("adjust_scope") or "day").strip().lower()
                if action == "adjust":
                    if adjust_scope == "day":
                        conn.executemany("UPDATE schedule_blueprints SET active=0 WHERE team_id=? AND station=? AND shift_label=? AND day_of_week=?", [(team_id, station, shift_label, day) for day in normalized_days])
                    else:
                        conn.execute("UPDATE schedule_blueprints SET active=0 WHERE team_id=? AND station=? AND shift_label=?", (team_id, station, shift_label))
                created = []
                for day in normalized_days:
                    conn.execute("""
                        INSERT INTO schedule_blueprints
                        (team_id, day_of_week, shift_label, station, start_time, end_time, employees_needed, notes, active, created_by, created_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
                    """, (team_id, day, shift_label, station, start_time, end_time, employees_needed, notes, user["id"], now_iso()))
                    created.append(day)
                conn.commit()
                return self.send_json({"ok": True, "created_days": created})
            if path.startswith("/api/scheduler/blueprints/") and path.endswith("/delete"):
                if not self.require_role(user, "team_leader"):
                    return
                blueprint_id = int(path.split("/")[4])
                conn.execute("UPDATE schedule_blueprints SET active=0 WHERE id=? AND team_id=?", (blueprint_id, team_id))
                conn.commit()
                return self.send_json({"ok": True})
            if path.startswith("/api/users/") and path.endswith("/schedule_profile"):
                if not self.require_role(user, "team_leader"):
                    return
                requested_user_id = int(path.split("/")[3])
                target = one(conn, "SELECT * FROM users WHERE id=? AND team_id=?", (requested_user_id, team_id))
                if not target:
                    return self.send_json({"error": "Employee not found"}, 404)
                new_name = str(data.get("employee_name") or "").strip()
                color = str(data.get("schedule_color") or "").strip()
                qualified = str(data.get("qualified_stations") or "").strip()
                eligible = str(data.get("eligible_shifts") or "").strip()
                if color:
                    other = one(conn, "SELECT id, name FROM users WHERE team_id=? AND id!=? AND lower(schedule_color)=lower(?)", (team_id, requested_user_id, color))
                    if other:
                        return self.send_json({"error": f"That schedule color is already used by {other['name']}. Choose another color."}, 400)
                if new_name:
                    conn.execute("UPDATE users SET name=?, schedule_color=?, qualified_stations=?, eligible_shifts=? WHERE id=? AND team_id=?", (new_name, color, qualified, eligible, requested_user_id, team_id))
                else:
                    conn.execute("UPDATE users SET schedule_color=?, qualified_stations=?, eligible_shifts=? WHERE id=? AND team_id=?", (color, qualified, eligible, requested_user_id, team_id))
                create_notification(conn, team_id, "Schedule profile updated", "Your station qualifications, eligible shifts, or schedule color were updated by a team leader.", requested_user_id)
                conn.commit()
                return self.send_json({"ok": True})
            if path.startswith("/api/shifts/") and path.endswith("/notes"):
                if not user_can_access_tool(conn, user, "scheduler_write"):
                    return self.send_json({"error": "Scheduler write access required"}, 403)
                shift_id = int(path.split("/")[3])
                shift = one(conn, "SELECT * FROM shifts WHERE id=? AND team_id=?", (shift_id, team_id))
                if not shift:
                    return self.send_json({"error": "Shift not found"}, 404)
                notes = data.get("notes") or ""
                conn.execute("UPDATE shifts SET notes=? WHERE id=? AND team_id=?", (notes, shift_id, team_id))
                conn.commit()
                return self.send_json({"ok": True})
            if path == "/api/scheduler/publish_week":
                if not user_can_access_tool(conn, user, "scheduler_write"):
                    return self.send_json({"error": "Scheduler write access required"}, 403)
                week_start = local_week_start(data.get("week_start"))
                schedule = build_week_schedule(conn, team_id, week_start)
                offered_claims = rows_dict(all_rows(conn, "SELECT sc.*, s.title, s.station, s.start_at, s.end_at FROM shift_claims sc JOIN shifts s ON s.id=sc.shift_id WHERE sc.team_id=? AND s.status='offered' AND s.start_at>=? AND s.start_at<? AND sc.status IN ('offered','pending')", (team_id, schedule["week_start"], schedule["week_end"])))
                def slot_has_offer(slot):
                    for c in offered_claims:
                        if (str(c.get("station") or "").strip().lower() == str(slot.get("station") or "").strip().lower()
                            and str(c.get("start_at") or "")[:16] == str(slot.get("start_at") or "")[:16]
                            and str(c.get("end_at") or "")[:16] == str(slot.get("end_at") or "")[:16]):
                            return True
                    return False
                unfilled = [slot for slot in schedule.get("blueprint_slots", []) if int(slot.get("open_count") or 0) > 0]
                hard_unfilled = [slot for slot in unfilled if not slot_has_offer(slot)]
                if hard_unfilled:
                    return self.send_json({"error": f"Cannot send final weekly schedule: {len(hard_unfilled)} needed shift slot(s) are still unfilled. Fill them or use OFFER SHIFT first."}, 400)
                not_final = bool(unfilled and offered_claims)
                title = data.get("title") or ("NOT FINALIZED — fill a shift(s)" if not_final else f"Weekly schedule posted: {week_start}")
                body = data.get("body") or ("NOT FINALIZED, PLEASE CHECK THE FILL A SHIFT(s) PAGE. Some shifts were offered and still need employee response or team leader approval." if not_final else f"The weekly schedule for {week_start} has been posted. Check your Chef Ledger schedule page for your shifts and scheduled-off blocks.")
                conn.execute("INSERT INTO schedule_posts (team_id, week_start, title, body, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)", (team_id, week_start, title, body, user["id"], now_iso()))
                active_users = all_rows(conn, "SELECT id FROM users WHERE team_id=? AND active=1", (team_id,))
                for row in active_users:
                    create_notification(conn, team_id, title, body, row["id"])
                if schedule["warnings"]:
                    notify_managers(conn, team_id, "Schedule posted with conflicts", f"The week of {week_start} was posted with {len(schedule['warnings'])} scheduled-off conflict(s).")
                conn.commit()
                return self.send_json({"ok": True, "week_start": week_start, "notified": len(active_users), "warnings": schedule["warnings"], "not_finalized": not_final})
            if path == "/api/time_off/profile":
                if not self.require_role(user, "team_leader"):
                    return
                requested_user_id = int(data.get("user_id") or 0)
                employee = one(conn, "SELECT * FROM users WHERE id=? AND team_id=?", (requested_user_id, team_id))
                if not employee:
                    return self.send_json({"error": "Employee not found"}, 404)
                allowed = max(0.0, float(data.get("days_off_allowed") or 0))
                remaining_raw = data.get("days_off_remaining")
                remaining = max(0.0, float(remaining_raw if remaining_raw not in (None, "") else allowed))
                reset_date = data.get("days_off_reset_date") or ""
                if reset_date and not parse_date_only(reset_date):
                    return self.send_json({"error": "Reset date must be YYYY-MM-DD"}, 400)
                rollover = 1 if str(data.get("days_off_rollover", "0")).lower() in ("1", "true", "yes", "on", "rollover") else 0
                conn.execute("""
                    UPDATE users
                    SET days_off_allowed=?, days_off_remaining=?, days_off_reset_date=?, days_off_rollover=?
                    WHERE id=? AND team_id=?
                """, (round(allowed, 3), round(remaining, 3), reset_date, rollover, requested_user_id, team_id))
                create_notification(conn, team_id, "Time-off profile updated", f"Your days-off balance is now {round(remaining, 3)} day(s). Reset date: {reset_date or 'not set'}.", requested_user_id)
                conn.commit()
                return self.send_json({"ok": True})
            if path == "/api/time_off/request":
                requested_user_id = int(data.get("user_id") or user["id"])
                if requested_user_id != user["id"] and not self.require_role(user, "team_leader"):
                    return
                employee = one(conn, "SELECT * FROM users WHERE id=? AND team_id=?", (requested_user_id, team_id))
                if not employee:
                    return self.send_json({"error": "Employee not found"}, 404)
                start_date = data.get("start_date") or ""
                end_date = data.get("end_date") or ""
                days = time_off_days(start_date, end_date)
                if days <= 0:
                    return self.send_json({"error": "Valid start and end dates are required"}, 400)
                remaining = float(employee["days_off_remaining"] or 0)
                conn.execute("""
                    INSERT INTO time_off_requests (team_id, user_id, start_date, end_date, days_requested, status, reason, created_at)
                    VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)
                """, (team_id, requested_user_id, start_date, end_date, days, data.get("reason", ""), now_iso()))
                request_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
                notify_managers(conn, team_id, "Time-off request", f"{employee['name']} requested {days:g} day(s) off from {start_date} to {end_date}. Remaining balance before approval: {remaining:g}.")
                conn.commit()
                return self.send_json({"ok": True, "id": request_id, "days_requested": days, "days_remaining": remaining, "days_after_request": round(remaining - days, 3), "enough_days": remaining >= days})
            if path.startswith("/api/time_off/requests/") and path.endswith("/decide"):
                if not self.require_role(user, "team_leader"):
                    return
                request_id = int(path.split("/")[4])
                status = data.get("status", "approved")
                if status not in ("approved", "declined"):
                    return self.send_json({"error": "Status must be approved or declined"}, 400)
                req = one(conn, "SELECT tor.*, u.name AS user_name, u.days_off_remaining FROM time_off_requests tor JOIN users u ON u.id=tor.user_id WHERE tor.id=? AND tor.team_id=?", (request_id, team_id))
                if not req:
                    return self.send_json({"error": "Time-off request not found"}, 404)
                if req["status"] != "pending":
                    return self.send_json({"error": "Request has already been decided"}, 400)
                remaining = float(req["days_off_remaining"] or 0)
                days = float(req["days_requested"] or 0)
                if status == "approved" and remaining < days and not data.get("force"):
                    return self.send_json({"error": f"Not enough days remaining. Employee has {remaining:g} day(s), request needs {days:g}."}, 400)
                conn.execute("UPDATE time_off_requests SET status=?, decided_by=?, decided_at=? WHERE id=? AND team_id=?", (status, user["id"], now_iso(), request_id, team_id))
                if status == "approved":
                    new_remaining = round(remaining - days, 3)
                    conn.execute("UPDATE users SET days_off_remaining=? WHERE id=? AND team_id=?", (new_remaining, req["user_id"], team_id))
                    start_at = f"{req['start_date']}T00:00"
                    end_at = f"{req['end_date']}T23:59"
                    conn.execute("INSERT INTO employee_unavailability (team_id, user_id, start_at, end_at, reason, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)", (team_id, req["user_id"], start_at, end_at, "Approved time off", user["id"], now_iso()))
                    create_notification(conn, team_id, "Time off approved", f"Your request for {days:g} day(s) off was approved. Days remaining: {new_remaining:g}.", req["user_id"])
                else:
                    create_notification(conn, team_id, "Time off declined", f"Your request from {req['start_date']} to {req['end_date']} was declined.", req["user_id"])
                conn.commit()
                return self.send_json({"ok": True, "status": status})
            if path == "/api/message_permissions":
                if not self.require_role(user, "team_leader"):
                    return
                target_user_id = int(data.get("user_id") or 0)
                target = one(conn, "SELECT * FROM users WHERE id=? AND team_id=?", (target_user_id, team_id))
                if not target:
                    return self.send_json({"error": "Employee not found"}, 404)
                tools = data.get("tools") or []
                if not isinstance(tools, list):
                    tools = [str(tools)]
                notes = data.get("notes", "")
                conn.execute("DELETE FROM message_permissions WHERE team_id=? AND user_id=?", (team_id, target_user_id))
                for tool in tools:
                    tool = str(tool).strip().lower()
                    if not tool:
                        continue
                    conn.execute("INSERT OR REPLACE INTO message_permissions (team_id, user_id, tool, notes, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?)", (team_id, target_user_id, tool, notes, user["id"], now_iso()))
                create_notification(conn, team_id, "Message eligibility updated", f"Your message/task eligibility was updated: {', '.join(tools) or 'none'}.", target_user_id)
                conn.commit()
                return self.send_json({"ok": True, "tools": tools})
            if path == "/api/vote_topics":
                options = [line.strip() for line in str(data.get("options") or "").splitlines() if line.strip()]
                if not options:
                    return self.send_json({"error": "Add at least one vote selection"}, 400)
                title = data.get("title") or "Vote topic"
                target_group = data.get("target_group") or "all"
                body = "Vote options:\n" + "\n".join(f"- {o}" for o in options)
                conn.execute("""
                    INSERT INTO posts (team_id, user_id, type, title, body, visibility, category, target_tools, target_user_ids, status, options_json, created_at)
                    VALUES (?, ?, 'vote_topic', ?, ?, 'team', 'vote', ?, '', 'pending', ?, ?)
                """, (team_id, user["id"], title, body, target_group, json.dumps(options), now_iso()))
                post_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
                notify_managers(conn, team_id, "Vote topic awaiting approval", f"{user['name']} submitted vote topic: {title}")
                conn.commit()
                return self.send_json({"ok": True, "id": post_id})
            if path == "/api/posts":
                visibility = data.get("visibility", "team")
                if visibility in ("managers", "leaders") and ROLE_ORDER.get(user["role"], 0) < ROLE_ORDER["team_leader"]:
                    return self.send_json({"error": "Only leaders can create manager/leader-only posts"}, 403)
                category = (data.get("category") or "generic").strip().lower()
                target_user_id = int(data.get("target_user_id") or 0) or None
                target_user_ids = str(target_user_id or "")
                conn.execute("""
                    INSERT INTO posts (team_id, user_id, type, title, body, visibility, category, target_tools, target_user_ids, status, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'posted', ?)
                """, (team_id, user["id"], data.get("type", "note"), data.get("title", "Untitled"), data.get("body", ""), visibility, category, category, target_user_ids, now_iso()))
                post_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
                notify_category(conn, team_id, f"New {data.get('type', 'note')} post", f"{user['name']} posted: {data.get('title', 'Untitled')}", category, target_user_id)
                conn.commit()
                return self.send_json({"ok": True, "id": post_id})
            if path.startswith("/api/posts/") and path.endswith("/review"):
                if not self.require_role(user, "team_leader"):
                    return
                post_id = int(path.split("/")[3])
                status = data.get("status", "approved")
                if status not in {"approved", "denied", "pending"}:
                    return self.send_json({"error": "Invalid vote status"}, 400)
                note = data.get("captain_note", "")
                post = one(conn, "SELECT * FROM posts WHERE id=? AND team_id=?", (post_id, team_id))
                if not post:
                    return self.send_json({"error": "Vote topic not found"}, 404)
                conn.execute("UPDATE posts SET status=?, captain_note=?, approved_by=?, approved_at=? WHERE id=? AND team_id=?", (status, note, user["id"], now_iso(), post_id, team_id))
                create_notification(conn, team_id, f"Vote topic {status}", f"{post['title']} was {status}. {note}", post["user_id"])
                if status == "approved":
                    notify_category(conn, team_id, "New approved vote topic", post["title"], "vote")
                conn.commit()
                return self.send_json({"ok": True, "status": status})
            if path.startswith("/api/posts/") and path.endswith("/vote"):
                post_id = int(path.split("/")[3])
                if ROLE_ORDER.get(user["role"], 0) < ROLE_ORDER["team_leader"]:
                    return self.send_json({"error": "Only leaders can vote"}, 403)
                vote = data.get("vote", "approve")
                conn.execute("INSERT OR REPLACE INTO post_votes (team_id, post_id, user_id, vote, created_at) VALUES (?, ?, ?, ?, ?)", (team_id, post_id, user["id"], vote, now_iso()))
                conn.commit()
                return self.send_json({"ok": True})
            if path == "/api/notifications/read":
                conn.execute("UPDATE notifications SET read_at=? WHERE team_id=? AND (user_id IS NULL OR user_id=?)", (now_iso(), team_id, user["id"]))
                conn.commit()
                return self.send_json({"ok": True})
            return self.send_json({"error": "Not found"}, 404)

    def api_put(self, path: str, qs: dict) -> None:
        data = self.read_json()
        with db() as conn:
            user = self.require_user(conn)
            if not user:
                return
            team_id = user["team_id"]
            apply_time_off_resets(conn, team_id)
            conn.commit()
            user = one(conn, "SELECT * FROM users WHERE id=? AND active=1", (user["id"],))
            if path.startswith("/api/products/"):
                if not self.require_role(user, "team_leader"):
                    return
                product_id = int(path.split("/")[3])
                product = one(conn, "SELECT * FROM products WHERE id=? AND team_id=?", (product_id, team_id))
                if not product:
                    return self.send_json({"error": "Product not found"}, 404)
                fields = ["vendor_id", "name", "category", "unit", "current_qty", "par_level", "reorder_point", "package_qty", "package_unit", "package_price", "shelf_life_days", "station", "notes"]
                updated = {f: data.get(f, product[f]) for f in fields}
                updated["cost_per_unit"] = calculate_cost_per_unit(float(updated["package_qty"] or 1), updated["package_unit"], float(updated["package_price"] or 0), updated["unit"])
                conn.execute(
                    """
                    UPDATE products SET vendor_id=?, name=?, category=?, unit=?, current_qty=?, par_level=?, reorder_point=?, package_qty=?, package_unit=?, package_price=?, cost_per_unit=?, shelf_life_days=?, station=?, stock_location=?, stocked_where=?, min_order_size=?, units_per_min_order=?, notes=?, updated_at=?
                    WHERE id=? AND team_id=?
                    """,
                    (updated["vendor_id"], updated["name"], updated["category"], updated["unit"], float(updated["current_qty"]), float(updated["par_level"]), float(updated["reorder_point"]), float(updated["package_qty"]), updated["package_unit"], float(updated["package_price"]), updated["cost_per_unit"], int(updated["shelf_life_days"]), updated["station"], updated["notes"], now_iso(), product_id, team_id),
                )
                conn.commit()
                return self.send_json({"ok": True, "cost_per_unit": updated["cost_per_unit"]})
            if path.startswith("/api/recipes/"):
                if not self.require_role(user, "team_leader"):
                    return
                recipe_id = int(path.split("/")[3])
                recipe = one(conn, "SELECT * FROM recipes WHERE id=? AND team_id=?", (recipe_id, team_id))
                if not recipe:
                    return self.send_json({"error": "Recipe not found"}, 404)
                conn.execute("UPDATE recipes SET name=?, station=?, yield_qty=?, portion_unit=?, menu_price=?, shelf_life_days=?, notes=? WHERE id=? AND team_id=?", (data.get("name", recipe["name"]), data.get("station", recipe["station"]), float(data.get("yield_qty", recipe["yield_qty"])), data.get("portion_unit", recipe["portion_unit"]), float(data.get("menu_price", recipe["menu_price"])), int(data.get("shelf_life_days", recipe["shelf_life_days"])), data.get("notes", recipe["notes"]), recipe_id, team_id))
                if "items" in data:
                    conn.execute("DELETE FROM recipe_items WHERE recipe_id=? AND team_id=?", (recipe_id, team_id))
                    for item in data.get("items", []):
                        conn.execute("INSERT INTO recipe_items (team_id, recipe_id, product_id, qty, unit, prep_note) VALUES (?, ?, ?, ?, ?, ?)", (team_id, recipe_id, int(item["product_id"]), float(item["qty"]), item.get("unit", "each"), item.get("prep_note", "")))
                conn.commit()
                return self.send_json({"ok": True, "cost": recipe_cost(conn, team_id, recipe_id)})
            if path.startswith("/api/shifts/"):
                if not self.require_role(user, "team_leader"):
                    return
                shift_id = int(path.split("/")[3])
                shift = one(conn, "SELECT * FROM shifts WHERE id=? AND team_id=?", (shift_id, team_id))
                if not shift:
                    return self.send_json({"error": "Shift not found"}, 404)
                fields = ["title", "station", "start_at", "end_at", "status", "assigned_to", "notes"]
                values = {field: data.get(field, shift[field]) for field in fields}
                conn.execute("UPDATE shifts SET title=?, station=?, start_at=?, end_at=?, status=?, assigned_to=?, notes=? WHERE id=? AND team_id=?", (values["title"], values["station"], values["start_at"], values["end_at"], values["status"], values["assigned_to"] or None, values["notes"], shift_id, team_id))
                if values["assigned_to"]:
                    create_notification(conn, team_id, "Schedule updated", f"Your shift {values['title']} is now scheduled from {values['start_at']} to {values['end_at']}.", int(values["assigned_to"]))
                conn.commit()
                return self.send_json({"ok": True})
            if path.startswith("/api/prep_tasks/"):
                task_id = int(path.split("/")[3])
                task = one(conn, "SELECT * FROM prep_tasks WHERE id=? AND team_id=?", (task_id, team_id))
                if not task:
                    return self.send_json({"error": "Task not found"}, 404)
                allowed = ["title", "qty", "unit", "station", "assigned_to", "priority", "status", "due_at", "notes"]
                values = {k: data.get(k, task[k]) for k in allowed}
                conn.execute("UPDATE prep_tasks SET title=?, qty=?, unit=?, station=?, assigned_to=?, priority=?, status=?, due_at=?, notes=? WHERE id=? AND team_id=?", (values["title"], float(values["qty"]), values["unit"], values["station"], values["assigned_to"] or None, int(values["priority"]), values["status"], values["due_at"], values["notes"], task_id, team_id))
                conn.commit()
                return self.send_json({"ok": True})
            if path.startswith("/api/batches/"):
                batch_id = int(path.split("/")[3])
                status = data.get("status", "discarded")
                conn.execute("UPDATE station_batches SET status=? WHERE id=? AND team_id=?", (status, batch_id, team_id))
                conn.commit()
                return self.send_json({"ok": True})
            return self.send_json({"error": "Not found"}, 404)

    def api_delete(self, path: str) -> None:
        with db() as conn:
            user = self.require_user(conn)
            if not user:
                return
            team_id = user["team_id"]
            apply_time_off_resets(conn, team_id)
            conn.commit()
            user = one(conn, "SELECT * FROM users WHERE id=? AND active=1", (user["id"],))
            if path.startswith("/api/access_grants/"):
                if not self.require_role(user, "team_leader"):
                    return
                grant_id = int(path.split("/")[3])
                conn.execute("DELETE FROM access_grants WHERE id=? AND team_id=?", (grant_id, team_id))
                conn.commit()
                return self.send_json({"ok": True})
            if path.startswith("/api/weekly_availability/"):
                pattern_id = int(path.split("/")[3])
                row = one(conn, "SELECT * FROM employee_weekly_availability WHERE id=? AND team_id=?", (pattern_id, team_id))
                if not row:
                    return self.send_json({"error": "Weekly availability pattern not found"}, 404)
                if row["user_id"] != user["id"] and not self.require_role(user, "team_leader"):
                    return
                conn.execute("DELETE FROM employee_weekly_availability WHERE id=? AND team_id=?", (pattern_id, team_id))
                conn.commit()
                return self.send_json({"ok": True})
            if path.startswith("/api/available_shifts/"):
                availability_id = int(path.split("/")[3])
                row = one(conn, "SELECT * FROM employee_availability WHERE id=? AND team_id=?", (availability_id, team_id))
                if not row:
                    return self.send_json({"error": "Can-work block not found"}, 404)
                if row["user_id"] != user["id"] and not self.require_role(user, "team_leader"):
                    return
                conn.execute("DELETE FROM employee_availability WHERE id=? AND team_id=?", (availability_id, team_id))
                conn.commit()
                return self.send_json({"ok": True})
            if path.startswith("/api/availability/"):
                availability_id = int(path.split("/")[3])
                row = one(conn, "SELECT * FROM employee_unavailability WHERE id=? AND team_id=?", (availability_id, team_id))
                if not row:
                    return self.send_json({"error": "Can't-work block not found"}, 404)
                if row["user_id"] != user["id"] and not self.require_role(user, "team_leader"):
                    return
                conn.execute("DELETE FROM employee_unavailability WHERE id=? AND team_id=?", (availability_id, team_id))
                conn.commit()
                return self.send_json({"ok": True})
            if path.startswith("/api/shifts/"):
                if not self.require_role(user, "team_leader"):
                    return
                shift_id = int(path.split("/")[3])
                conn.execute("DELETE FROM shifts WHERE id=? AND team_id=?", (shift_id, team_id))
                conn.commit()
                return self.send_json({"ok": True})
            if path.startswith("/api/products/"):
                if not self.require_role(user, "team_leader"):
                    return
                product_id = int(path.split("/")[3])
                conn.execute("DELETE FROM products WHERE id=? AND team_id=?", (product_id, team_id))
                conn.commit()
                return self.send_json({"ok": True})
            if path.startswith("/api/recipes/"):
                if not self.require_role(user, "team_leader"):
                    return
                recipe_id = int(path.split("/")[3])
                conn.execute("DELETE FROM recipes WHERE id=? AND team_id=?", (recipe_id, team_id))
                conn.commit()
                return self.send_json({"ok": True})
            return self.send_json({"error": "Not found"}, 404)

    def read_raw_body(self) -> bytes:
        length = int(self.headers.get("Content-Length", "0") or 0)
        if length <= 0:
            return b""
        return self.rfile.read(length)

    def verify_stripe_signature(self, raw_body: bytes) -> bool:
        secret = os.environ.get("STRIPE_WEBHOOK_SECRET", "").strip()
        if not secret:
            # Allow unverified local/test handling if no webhook secret is configured.
            # Production should set STRIPE_WEBHOOK_SECRET from Stripe Dashboard.
            return True
        sig_header = self.headers.get("Stripe-Signature", "")
        parts: dict[str, list[str]] = {}
        for bit in sig_header.split(","):
            if "=" in bit:
                k, v = bit.split("=", 1)
                parts.setdefault(k.strip(), []).append(v.strip())
        timestamp = (parts.get("t") or [""])[0]
        signatures = parts.get("v1") or []
        if not timestamp or not signatures:
            return False
        signed_payload = timestamp.encode("utf-8") + b"." + raw_body
        expected = hmac.new(secret.encode("utf-8"), signed_payload, hashlib.sha256).hexdigest()
        return any(hmac.compare_digest(expected, item) for item in signatures)

    def parse_stripe_client_reference(self, value: str | None) -> dict:
        ref = (value or "").strip()
        out = {"team_id": 0, "user_id": 0, "tier": ""}
        if not ref:
            return out
        # Current frontend format: chefledger|team=1|user=2|tier=starter
        for part in ref.split("|"):
            if "=" not in part:
                continue
            k, v = part.split("=", 1)
            k = k.strip().lower()
            v = v.strip()
            try:
                if k == "team":
                    out["team_id"] = int(v or 0)
                elif k == "user":
                    out["user_id"] = int(v or 0)
                elif k == "tier":
                    out["tier"] = normalize_subscription_tier(v)
            except ValueError:
                continue
        return out

    def activate_team_subscription_from_stripe(self, conn: sqlite3.Connection, *, team_id: int = 0, user_id: int = 0, tier: str = "", status: str = "active", stripe_customer_id: str = "", stripe_subscription_id: str = "", event_id: str = "") -> dict:
        tier = normalize_subscription_tier(tier or "starter")
        if not team_id and user_id:
            row = one(conn, "SELECT team_id FROM users WHERE id=?", (user_id,))
            team_id = int(row["team_id"] or 0) if row else 0
        if not team_id and stripe_subscription_id:
            row = one(conn, "SELECT id FROM teams WHERE stripe_subscription_id=?", (stripe_subscription_id,))
            team_id = int(row["id"] or 0) if row else 0
        if not team_id and stripe_customer_id:
            row = one(conn, "SELECT id FROM teams WHERE stripe_customer_id=?", (stripe_customer_id,))
            team_id = int(row["id"] or 0) if row else 0
        if not team_id:
            return {"ok": False, "error": "No matching ThreeStarOps team for Stripe event"}
        price = SUBSCRIPTION_TIERS[tier]["price"]
        now = now_iso()
        conn.execute(
            """
            UPDATE teams
            SET subscription_tier=?, subscription_status=?, subscription_price_monthly=?,
                subscription_started_at=COALESCE(NULLIF(subscription_started_at, ''), ?),
                subscription_updated_at=?, stripe_customer_id=COALESCE(NULLIF(?, ''), stripe_customer_id),
                stripe_subscription_id=COALESCE(NULLIF(?, ''), stripe_subscription_id),
                stripe_last_event_id=COALESCE(NULLIF(?, ''), stripe_last_event_id)
            WHERE id=?
            """,
            (tier, status, price, now, now, stripe_customer_id, stripe_subscription_id, event_id, team_id),
        )
        create_notification(conn, team_id, "Subscription activated", f"{SUBSCRIPTION_TIERS[tier]['name']} tier is now {status}. Your tools are unlocked according to this plan.", user_id or None)
        return {"ok": True, "team_id": team_id, "tier": tier, "status": status}

    def handle_stripe_webhook(self) -> None:
        raw = self.read_raw_body()
        if not self.verify_stripe_signature(raw):
            return self.send_json({"error": "Invalid Stripe signature"}, 400)
        try:
            event = json.loads(raw.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            return self.send_json({"error": "Invalid Stripe webhook JSON"}, 400)
        event_type = event.get("type", "")
        event_id = event.get("id", "")
        obj = (event.get("data") or {}).get("object") or {}
        with db() as conn:
            # Idempotency: ignore exact same Stripe event if already recorded.
            if event_id:
                seen = one(conn, "SELECT id FROM teams WHERE stripe_last_event_id=?", (event_id,))
                if seen:
                    return self.send_json({"received": True, "duplicate": True})
            result = {"ok": True, "ignored": event_type}
            if event_type == "checkout.session.completed":
                ref = self.parse_stripe_client_reference(obj.get("client_reference_id"))
                status = "active" if obj.get("payment_status") in ("paid", "no_payment_required") or obj.get("status") == "complete" else "pending_checkout"
                result = self.activate_team_subscription_from_stripe(
                    conn,
                    team_id=ref.get("team_id", 0),
                    user_id=ref.get("user_id", 0),
                    tier=ref.get("tier") or "starter",
                    status=status,
                    stripe_customer_id=str(obj.get("customer") or ""),
                    stripe_subscription_id=str(obj.get("subscription") or ""),
                    event_id=event_id,
                )
            elif event_type in ("customer.subscription.created", "customer.subscription.updated"):
                sub_status = str(obj.get("status") or "active").lower()
                app_status = "active" if sub_status in ("active", "trialing") else sub_status
                result = self.activate_team_subscription_from_stripe(
                    conn,
                    status=app_status,
                    stripe_customer_id=str(obj.get("customer") or ""),
                    stripe_subscription_id=str(obj.get("id") or ""),
                    event_id=event_id,
                )
            elif event_type == "customer.subscription.deleted":
                result = self.activate_team_subscription_from_stripe(
                    conn,
                    status="canceled",
                    stripe_customer_id=str(obj.get("customer") or ""),
                    stripe_subscription_id=str(obj.get("id") or ""),
                    event_id=event_id,
                )
            elif event_type == "invoice.payment_failed":
                result = self.activate_team_subscription_from_stripe(
                    conn,
                    status="past_due",
                    stripe_customer_id=str(obj.get("customer") or ""),
                    stripe_subscription_id=str(obj.get("subscription") or ""),
                    event_id=event_id,
                )
            elif event_type == "invoice.payment_succeeded":
                result = self.activate_team_subscription_from_stripe(
                    conn,
                    status="active",
                    stripe_customer_id=str(obj.get("customer") or ""),
                    stripe_subscription_id=str(obj.get("subscription") or ""),
                    event_id=event_id,
                )
            conn.commit()
        return self.send_json({"received": True, "event_type": event_type, "result": result})

    def create_session_response(self, conn: sqlite3.Connection, user_id: int) -> None:
        token = secrets.token_urlsafe(32)
        expires = (datetime.now(timezone.utc) + timedelta(days=SESSION_DAYS)).replace(microsecond=0).isoformat()
        conn.execute("INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)", (token, user_id, expires, now_iso()))
        conn.commit()
        user = one(conn, "SELECT * FROM users WHERE id=?", (user_id,))
        team = one(conn, "SELECT * FROM teams WHERE id=?", (user["team_id"],)) if user else None
        self.send_json(
            {"ok": True, "user": user_public(user), "team": row_dict(team), "subscription": subscription_for_team(conn, user["team_id"]) if user else None, "tiers": subscription_tier_catalog()},
            headers={"Set-Cookie": f"chef_ledger_session={token}; HttpOnly; Path=/; SameSite=Lax; Max-Age={SESSION_DAYS*24*60*60}"},
        )

    def export_inventory_csv(self, conn: sqlite3.Connection, user: sqlite3.Row) -> None:
        rows = all_rows(conn, "SELECT p.*, v.name AS vendor_name FROM products p LEFT JOIN vendors v ON v.id=p.vendor_id WHERE p.team_id=? ORDER BY p.category, p.name", (user["team_id"],))
        out = io.StringIO()
        writer = csv.writer(out)
        writer.writerow(["Name", "Category", "Vendor", "Unit", "On Hand", "Par", "Reorder Point", "Cost Per Unit", "Station", "Shelf Life Days"])
        for r in rows:
            writer.writerow([r["name"], r["category"], r["vendor_name"] or "", r["unit"], r["current_qty"], r["par_level"], r["reorder_point"], r["cost_per_unit"], r["station"], r["shelf_life_days"]])
        self.send_text(out.getvalue(), "text/csv; charset=utf-8", headers={"Content-Disposition": "attachment; filename=chef-ledger-inventory.csv"})

    def export_recipes_csv(self, conn: sqlite3.Connection, user: sqlite3.Row) -> None:
        recipes = all_rows(conn, "SELECT * FROM recipes WHERE team_id=? ORDER BY name", (user["team_id"],))
        out = io.StringIO()
        writer = csv.writer(out)
        writer.writerow(["Recipe", "Station", "Yield", "Portion Unit", "Menu Price", "Total Cost", "Cost Per Plate", "Food Cost %"])
        for r in recipes:
            cost = recipe_cost(conn, user["team_id"], r["id"])
            writer.writerow([r["name"], r["station"], r["yield_qty"], r["portion_unit"], r["menu_price"], cost["total_cost"], cost["cost_per_plate"], cost["food_cost_pct"]])
        self.send_text(out.getvalue(), "text/csv; charset=utf-8", headers={"Content-Disposition": "attachment; filename=chef-ledger-recipes.csv"})

    def print_page(self, path: str) -> None:
        with db() as conn:
            user = self.require_user(conn)
            if not user:
                return
            team_id = user["team_id"]
            parts = path.strip("/").split("/")
            if len(parts) < 3:
                return self.send_json({"error": "Not found"}, 404)
            kind = parts[1]
            if kind == "schedule":
                week_start = parts[2].replace(".html", "") if len(parts) >= 3 else today_iso()
                schedule = build_week_schedule(conn, team_id, week_start)
                rows = "".join(
                    f"<tr><td>{sh.get('start_at','')}</td><td>{sh.get('end_at','')}</td><td>{sh.get('station') or ''}</td><td>{sh.get('title') or ''}</td><td>{sh.get('assigned_name') or 'Open'}</td><td>{sh.get('notes') or ''}</td></tr>"
                    for sh in schedule.get("shifts", [])
                ) or "<tr><td colspan='6'>No shifts saved for this week.</td></tr>"
                html_doc = f"""
                <!doctype html><html><head><title>Chef Ledger Weekly Schedule</title><style>body{{font-family:Arial,sans-serif;padding:24px;color:#111}}button{{padding:10px 14px;margin-bottom:16px}}table{{width:100%;border-collapse:collapse;font-size:12px}}th,td{{border:1px solid #222;padding:6px;text-align:left;vertical-align:top}}th{{background:#f0eadf}}h1{{margin-bottom:0}}.meta{{margin:4px 0 18px;color:#555}}@media print{{button{{display:none}}}}</style></head><body>
                <button onclick="window.print()">Print / save as PDF</button><h1>Chef Ledger Weekly Schedule</h1><div class="meta">Week of {schedule.get('week_start','')}</div>
                <table><thead><tr><th>Start</th><th>End</th><th>Station</th><th>Shift</th><th>Employee</th><th>Chef notes</th></tr></thead><tbody>{rows}</tbody></table></body></html>
                """
                return self.send_text(html_doc, "text/html; charset=utf-8")
            item_id = int(parts[2].replace(".html", ""))
            if kind == "prep":
                sheet = one(conn, "SELECT * FROM prep_sheets WHERE id=? AND team_id=?", (item_id, team_id))
                if not sheet:
                    return self.send_text("Prep sheet not found", status=404)
                tasks = all_rows(conn, "SELECT pt.*, u.name AS assigned_name FROM prep_tasks pt LEFT JOIN users u ON u.id=pt.assigned_to WHERE pt.prep_sheet_id=? AND pt.team_id=? ORDER BY pt.station, pt.priority, pt.title", (item_id, team_id))
                rows = "".join(f"<tr><td><input type='checkbox'></td><td>{t['station'] or ''}</td><td>{t['title']}</td><td>{t['qty']} {t['unit']}</td><td>{t['assigned_name'] or ''}</td><td>{t['priority']}</td><td>{t['notes'] or ''}</td></tr>" for t in tasks)
                html = f"""
                <!doctype html><html><head><title>{sheet['title']}</title><style>body{{font-family:Arial,sans-serif;padding:32px}}table{{width:100%;border-collapse:collapse}}th,td{{border:1px solid #222;padding:8px;text-align:left}}h1{{margin-bottom:0}}.meta{{margin:4px 0 24px;color:#555}}@media print{{button{{display:none}}}}</style></head><body>
                <button onclick="window.print()">Print Prep Sheet</button><h1>Chef Ledger Prep Sheet</h1><div class="meta">{sheet['title']} · {sheet['prep_date']} · {sheet['service_period']}</div>
                <table><thead><tr><th>Done</th><th>Station</th><th>Task</th><th>Qty</th><th>Assigned</th><th>Priority</th><th>Notes</th></tr></thead><tbody>{rows}</tbody></table></body></html>
                """
                return self.send_text(html, "text/html; charset=utf-8")
            if kind == "order":
                order = one(conn, "SELECT o.*, v.name AS vendor_name FROM orders o LEFT JOIN vendors v ON v.id=o.vendor_id WHERE o.id=? AND o.team_id=?", (item_id, team_id))
                if not order:
                    return self.send_text("Order not found", status=404)
                items = all_rows(
                    conn,
                    """
                    SELECT oi.*, p.name AS product_name, p.notes AS product_notes
                    FROM order_items oi JOIN products p ON p.id=oi.product_id
                    WHERE oi.order_id=? AND oi.team_id=?
                    ORDER BY p.name
                    """,
                    (item_id, team_id),
                )
                def fmt_num(value):
                    value = float(value or 0)
                    return f"{value:.2f}".rstrip("0").rstrip(".")
                def short_sources(raw):
                    try:
                        values = json.loads(raw or "[]")
                    except Exception:
                        values = []
                    return "; ".join(str(v) for v in values[:2])
                rows = "".join(
                    f"<tr>"
                    f"<td><strong>{i['product_name']}</strong><br><small>{i['product_notes'] or ''}</small></td>"
                    f"<td>{fmt_num(i['qty'])}</td>"
                    f"<td>{i['unit']}</td>"
                    f"<td>{fmt_num(i['pack_size_qty'])} {i['pack_size_unit']} / {i['unit']}</td>"
                    f"<td>{fmt_num(i['current_qty_snapshot'])} {i['base_unit']}</td>"
                    f"<td>{fmt_num(i['expected_prep_usage'])} {i['base_unit']}<br><small>{short_sources(i['prep_sources_snapshot'])}</small></td>"
                    f"<td>{fmt_num(i['expected_pos_usage'])} {i['base_unit']}<br><small>{short_sources(i['pos_sources_snapshot'])}</small></td>"
                    f"<td>{fmt_num(i['expected_total_usage'])} {i['base_unit']}</td>"
                    f"<td>{fmt_num(i['projected_before_delivery'])} {i['base_unit']}</td>"
                    f"<td>{fmt_num(i['par_level_snapshot'])} {i['base_unit']}</td>"
                    f"<td>{fmt_num(i['projected_after_order'])} {i['base_unit']}</td>"
                    f"<td>${float(i['unit_cost'] or 0):.2f}</td>"
                    f"<td>${float(i['qty'] or 0)*float(i['unit_cost'] or 0):.2f}</td>"
                    f"<td>{i['risk_snapshot'] or ''}</td>"
                    f"</tr>"
                    for i in items
                )
                total = sum(float(i["qty"] or 0) * float(i["unit_cost"] or 0) for i in items)
                html = f"""
                <!doctype html><html><head><title>{order['title']}</title><style>
                body{{font-family:Arial,sans-serif;padding:24px;color:#111}}button{{padding:10px 14px;margin-bottom:16px}}table{{width:100%;border-collapse:collapse;font-size:12px}}th,td{{border:1px solid #222;padding:6px;text-align:left;vertical-align:top}}th{{background:#f0eadf}}h1{{margin-bottom:0}}.meta{{margin:4px 0 18px;color:#555}}small{{color:#555}}.note{{margin:12px 0;padding:10px;background:#fff7df;border:1px solid #d8bd74}}@media print{{button{{display:none}}body{{padding:10px}}table{{font-size:10px}}}}
                </style></head><body>
                <button onclick="window.print()">Print Order</button><h1>Chef Ledger Order Sheet</h1><div class="meta">{order['title']} · Vendor: {order['vendor_name'] or 'Unassigned'} · Delivery: {order['expected_delivery']}</div>
                <div class="note"><strong>Forecast rule:</strong> Current inventory minus open prep-sheet usage minus POS expected usage through the delivery date. Suggested order is rounded to supplier pack units, while inventory/par math stays in recipe base units.</div>
                <table><thead><tr><th>Item</th><th>Order Qty</th><th>Supplier Unit</th><th>Pack Size</th><th>Current Inventory</th><th>Prep Use Before Delivery</th><th>POS Forecast Use</th><th>Expected Total Use</th><th>Projected Before Delivery</th><th>Par</th><th>Projected After Order</th><th>Supplier Unit Cost</th><th>Total</th><th>Status / Vendor Notes</th></tr></thead><tbody>{rows}</tbody><tfoot><tr><th colspan='12'>Total</th><th>${total:.2f}</th><th></th></tr></tfoot></table></body></html>
                """
                return self.send_text(html, "text/html; charset=utf-8")
            self.send_json({"error": "Not found"}, 404)


def main() -> None:
    migrate()
    print(f"Chef Ledger is running at http://{HOST}:{PORT}")
    print(f"Database: {DB_PATH}")
    httpd = ThreadingHTTPServer((HOST, PORT), ChefLedgerHandler)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nChef Ledger stopped.")


if __name__ == "__main__":
    main()
