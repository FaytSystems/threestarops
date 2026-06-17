#!/usr/bin/env python3
"""
Path: chef-ledger-operational/tools/create_demo_account.py

Create a large, editable Chef Ledger demo account for usability testing.
Normal signup in the app still creates a blank restaurant account.

Run from the project root:
    python tools/create_demo_account.py

Demo owner login:
    Email: chef@chefledger.test
    Password: ChefLedger123!
"""
from __future__ import annotations

import itertools
import sys
from datetime import datetime, timedelta
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

import server  # noqa: E402

DEMO_PASSWORD = "ChefLedger123!"
DEMO_TEAM_NAME = "DEMO-high volume · Harbor Room"

STOCK_LOCATIONS_BY_CATEGORY = {
    "Produce": "Walk-In Cooler · Produce Rack",
    "Herbs": "Walk-In Cooler · Herb Shelf",
    "Dairy": "Walk-In Cooler · Dairy Shelf",
    "Protein": "Walk-In Cooler · Protein Speed Rack",
    "Seafood": "Walk-In Cooler · Seafood Bin",
    "Sauce": "Lowboy Cooler · Sauce Shelf",
    "Dry Goods": "Dry Storage · Canned Goods",
    "Grains": "Dry Storage · Grain Rack",
    "Bakery": "Bakery Dry Storage",
    "Frozen": "Freezer · Speed Rack",
}


def demo_stock_location(category: str, station: str) -> str:
    return STOCK_LOCATIONS_BY_CATEGORY.get(category) or (f"Station Storage · {station}" if station else "Unassigned stock area")


STATIONS = [
    ("Cold Prep", "prep", "Salads, salsas, chilled mise, and garnish pans"),
    ("Grill", "line", "Grilled proteins, vegetables, and fired pickup"),
    ("Sauté", "line", "Pasta, pans, finishing sauces, and hot pickup"),
    ("Sauce", "prep", "Batch sauces, stocks, reductions, and bases"),
    ("Bakery", "prep", "Desserts, breads, pastry, and batch sweets"),
    ("Expo", "service", "Final pass, plating standards, and pickup timing"),
    ("Pantry", "prep", "Dry storage, bulk items, and station refill backup"),
    ("Raw Bar", "line", "Seafood, shellfish, crudo, and cold fish station"),
    ("Garde Manger", "prep", "Composed salads, charcuterie, and cold plates"),
    ("Dish", "support", "Dish, sanitation, and closing support"),
]

SHIFT_TYPES = [
    ("Breakfast", "06:00", "11:00"),
    ("Lunch", "10:00", "16:00"),
    ("Dinner", "15:00", "23:00"),
    ("Prep", "08:00", "15:00"),
    ("Close", "16:00", "00:00"),
]

COLORS = [
    "#a83246", "#2f6fed", "#2e7d32", "#ef6c00", "#7e57c2", "#00838f", "#ad1457", "#5d4037",
    "#455a64", "#c62828", "#1565c0", "#558b2f", "#f9a825", "#6a1b9a", "#00695c", "#8d6e63",
    "#283593", "#d84315", "#0277bd", "#689f38", "#f57f17", "#4a148c", "#00796b", "#795548",
    "#37474f", "#b71c1c", "#0d47a1", "#33691e", "#e65100", "#880e4f", "#004d40", "#3e2723",
]

VENDORS = [
    ("FreshPoint Produce", "Sun,Wed", "Mon,Thu", "20:00", 1, "orders@freshpoint.example", "Broadline produce, herbs, and garnish."),
    ("North Coast Provisions", "Mon,Wed,Fri", "Tue,Thu,Sat", "20:00", 1, "orders@northcoast.example", "Proteins, seafood, dairy, and dry goods."),
    ("Garden Row Farms", "Sun,Wed", "Mon,Thu", "18:00", 1, "sales@gardenrow.example", "Local greens and seasonal produce."),
    ("Prime Cut Butcher", "Mon,Thu", "Tue,Fri", "19:00", 1, "orders@primecut.example", "Beef, pork, poultry, and charcuterie."),
    ("Ocean Pier Seafood", "Mon,Wed,Fri", "Tue,Thu,Sat", "17:00", 1, "orders@oceanpier.example", "Fish, shellfish, oysters, and raw bar seafood."),
    ("Dairy Guild", "Tue,Fri", "Wed,Sat", "16:00", 1, "orders@dairyguild.example", "Cream, butter, cheese, eggs, and cultured dairy."),
    ("Pantry & Co.", "Mon", "Wed", "15:00", 2, "orders@pantryco.example", "Dry goods, grains, beans, spices, oils, and disposables."),
    ("Sweet Bench Bakery Supply", "Sun,Wed", "Mon,Thu", "14:00", 1, "orders@sweetbench.example", "Flour, sugar, chocolate, pastry, and bakery ingredients."),
    ("Stone Mill Grains", "Tue", "Fri", "14:00", 2, "orders@stonemill.example", "Flours, grains, rice, and specialty milling products."),
    ("Harvest Table Herbs", "Mon,Thu", "Tue,Fri", "15:30", 1, "orders@harvestherbs.example", "Microgreens, herbs, edible flowers, and garnish."),
    ("Cityline Restaurant Supply", "Mon", "Wed", "12:00", 2, "orders@cityline.example", "Containers, deli cups, pans, paper goods, and smallwares."),
    ("Olive Branch Imports", "Tue", "Fri", "13:00", 2, "orders@olivebranch.example", "Olive oil, vinegars, olives, capers, and imported pantry."),
    ("Ferment House", "Wed", "Fri", "13:00", 1, "orders@fermenthouse.example", "Miso, kimchi, pickles, ferments, vinegars, and kombucha."),
    ("Valley Root Produce", "Sun,Tue,Thu", "Mon,Wed,Fri", "19:00", 1, "orders@valleyroot.example", "Root vegetables, mushrooms, onions, and potatoes."),
    ("Butcher Block Reserve", "Tue,Fri", "Wed,Sat", "18:00", 1, "orders@bbreserve.example", "Premium steaks, specialty cuts, and holiday proteins."),
    ("Pastry Atelier Supply", "Mon,Thu", "Tue,Fri", "13:00", 1, "orders@pastryatelier.example", "Chocolate, nuts, butter sheets, vanilla, and pastry specialty items."),
]

PRODUCT_TEMPLATES = [
    ("Produce", "lb", "case", "Cold Prep", ["Baby Arugula", "Romaine Hearts", "Kale", "Spinach", "Frisée", "Radicchio", "Cabbage", "Carrots", "Celery", "Red Onion", "Yellow Onion", "Shallots", "Garlic", "Tomatoes", "Cherry Tomatoes", "Cucumbers", "Zucchini", "Eggplant", "Mushrooms", "Fingerling Potatoes", "Yukon Potatoes", "Sweet Potatoes", "Corn Kernels", "Peppers", "Jalapeños", "Asparagus", "Green Beans", "Broccolini", "Cauliflower", "Avocados"]),
    ("Herbs", "oz", "bunch", "Garde Manger", ["Basil", "Parsley", "Cilantro", "Mint", "Dill", "Tarragon", "Chives", "Rosemary", "Thyme", "Oregano", "Sage", "Micro Cilantro", "Micro Basil", "Edible Flowers", "Fennel Fronds"]),
    ("Protein", "lb", "case", "Grill", ["Chicken Breast", "Chicken Thigh", "Pork Shoulder", "Pork Belly", "Beef Short Rib", "Ribeye", "NY Strip", "Ground Beef", "Lamb Shoulder", "Lamb Rack", "Duck Breast", "Turkey Breast", "Veal Cutlet", "Italian Sausage", "Chorizo"]),
    ("Seafood", "lb", "case", "Raw Bar", ["Salmon Fillet", "Halibut", "Cod", "Scallops U10", "Shrimp 16/20", "Tuna Loin", "Branzino", "Mussels", "Clams", "Oysters", "Crab Meat", "Lobster Meat", "Squid", "Octopus"]),
    ("Dairy", "qt", "case", "Sauce", ["Heavy Cream", "Half and Half", "Whole Milk", "Buttermilk", "Crème Fraîche", "Sour Cream", "Yogurt", "Ricotta", "Mascarpone", "Goat Cheese", "Parmesan", "Pecorino", "Mozzarella", "Cheddar", "Butter"]),
    ("Dry Goods", "lb", "bag", "Pantry", ["All Purpose Flour", "Bread Flour", "Cake Flour", "Sugar", "Brown Sugar", "Powdered Sugar", "Cornmeal", "Polenta", "Arborio Rice", "Jasmine Rice", "Basmati Rice", "Farro", "Quinoa", "Couscous", "Panko", "Breadcrumbs", "Black Beans", "Cannellini Beans", "Chickpeas", "Lentils", "Pasta Sheets", "Rigatoni", "Spaghetti", "Oats"]),
    ("Spices", "oz", "jar", "Pantry", ["Kosher Salt", "Black Pepper", "Paprika", "Smoked Paprika", "Cumin", "Coriander", "Fennel Seed", "Mustard Seed", "Chili Flake", "Cayenne", "Cinnamon", "Nutmeg", "Clove", "Bay Leaves", "Curry Powder", "Turmeric", "Sumac", "Za'atar"]),
    ("Sauce", "cup", "tub", "Sauce", ["Tomato Sauce", "Demi-Glace", "Chicken Stock", "Vegetable Stock", "Miso Paste", "Harissa", "Tahini", "Dijon Mustard", "Honey", "Maple Syrup", "Soy Sauce", "Fish Sauce", "Rice Vinegar", "Red Wine Vinegar", "Balsamic Vinegar", "Olive Oil", "Canola Oil", "Sesame Oil"]),
    ("Bakery", "lb", "case", "Bakery", ["Dark Chocolate", "White Chocolate", "Cocoa Powder", "Yeast", "Baking Powder", "Baking Soda", "Gelatin", "Almond Flour", "Pistachios", "Walnuts", "Hazelnuts", "Raisins", "Dried Cranberries", "Vanilla Beans", "Lemon Zest", "Orange Zest"]),
    ("Count", "each", "case", "Expo", ["Lemons", "Limes", "Oranges", "Eggs", "Burger Buns", "Brioche Rolls", "Tortillas", "Pita", "Nori Sheets", "Asparagus Spears", "Corn Tortillas", "Bao Buns", "Romaine Head", "Avocado", "Artichoke"]),
]

RECIPE_ADJECTIVES = [
    "Charred", "Roasted", "Crisp", "Braised", "Grilled", "Seared", "Smoked", "Herb", "Lemon", "Garlic",
    "Brown Butter", "Miso", "Harissa", "Green Goddess", "Citrus", "Truffle", "Spiced", "Spring", "Autumn", "House",
]
RECIPE_NOUNS = [
    "Chicken", "Salmon", "Short Rib", "Scallop", "Mushroom", "Risotto", "Salad", "Pasta", "Taco Filling", "Salsa",
    "Vinaigrette", "Cream Sauce", "Stock", "Demi", "Vegetable Base", "Bread", "Shortbread", "Tart", "Puré e", "Relish",
]
PLATE_NAMES = [
    "Harbor Room Taco Salad", "Lemon Herb Chicken Entrée", "Asparagus Arugula Salad", "Seared Salmon Plate",
    "Short Rib Supper", "Scallop Crudo Plate", "Wild Mushroom Risotto", "Grilled Ribeye Dinner", "Roasted Vegetable Bowl",
    "Chef's Pasta Plate", "Brown Butter Gnocchi", "Crispy Pork Belly Plate", "Duck Breast Dinner", "Garden Mezze Plate",
    "Seafood Toast Plate", "Chicken Milanese", "Bakery Dessert Trio", "Chocolate Citrus Tart",
]

EMPLOYEE_NAMES = [
    "Maya Chen", "Luis Ortega", "Riley Brooks", "Nina Patel", "Owen Miller", "Sofia Rossi", "Caleb Stone", "Iris Kim", "Andre Lewis", "Priya Shah",
    "Mateo Garcia", "Ella Nguyen", "Jonah Reed", "Ava Thompson", "Noah Bennett", "Lina Morales", "Theo Carter", "Grace Allen", "Evan Wright", "Mila Scott",
    "Kai Johnson", "Harper Clark", "Diego Flores", "Chloe Morgan", "Sam Rivera",
]


def iso(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%dT%H:%M")


def date_iso(dt: datetime) -> str:
    return dt.date().isoformat()


def current_monday() -> datetime:
    today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    return today - timedelta(days=today.weekday())


def add_user(conn, team_id: int, name: str, email: str, role: str, station: str, color: str, qualified: str, shifts: str, days_allowed: float, days_remaining: float, rollover: int) -> int:
    reset_year = datetime.now().year + 1
    reset_date = f"{reset_year}-01-01"
    conn.execute(
        """
        INSERT INTO users (
            team_id, name, email, password_hash, role, station, active,
            days_off_allowed, days_off_remaining, days_off_reset_date,
            days_off_rollover, days_off_last_reset_at, schedule_color,
            qualified_stations, eligible_shifts, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, '', ?, ?, ?, ?)
        """,
        (
            team_id,
            name,
            email.lower(),
            server.hash_password(DEMO_PASSWORD),
            role,
            station,
            days_allowed,
            days_remaining,
            reset_date,
            rollover,
            color,
            qualified,
            shifts,
            server.now_iso(),
        ),
    )
    return int(conn.execute("SELECT last_insert_rowid()").fetchone()[0])


def add_vendor(conn, team_id: int, row: tuple[str, str, str, str, int, str, str]) -> int:
    name, order_days, delivery_days, cutoff, lead_days, email, notes = row
    conn.execute(
        """
        INSERT INTO vendors (team_id, name, order_days, delivery_days, cutoff_time, lead_days, email, phone, notes, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, '', ?, ?)
        """,
        (team_id, name, order_days, delivery_days, cutoff, lead_days, email, notes, server.now_iso()),
    )
    return int(conn.execute("SELECT last_insert_rowid()").fetchone()[0])


def add_station(conn, team_id: int, name: str, station_type: str, notes: str) -> None:
    conn.execute(
        "INSERT INTO stations (team_id, name, station_type, notes, created_at) VALUES (?, ?, ?, ?, ?)",
        (team_id, name, station_type, notes, server.now_iso()),
    )


def add_product(conn, team_id: int, vendor_id: int, name: str, category: str, unit: str, current_qty: float, par_level: float, reorder_point: float, package_qty: float, package_unit: str, package_price: float, shelf_life: int, station: str, notes: str, stock_location: str = "") -> int:
    cost = server.calculate_cost_per_unit(package_qty, package_unit, package_price, unit)
    conn.execute(
        """
        INSERT INTO products (team_id, vendor_id, name, category, unit, current_qty, par_level, reorder_point,
            package_qty, package_unit, package_price, cost_per_unit, shelf_life_days, station,
            stock_location, stocked_where, min_order_size, units_per_min_order, notes, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (team_id, vendor_id, name, category, unit, current_qty, par_level, reorder_point, package_qty, package_unit, package_price, cost, shelf_life, station,
         stock_location or demo_stock_location(category, station), stock_location or demo_stock_location(category, station), 1, package_qty, notes, server.now_iso()),
    )
    return int(conn.execute("SELECT last_insert_rowid()").fetchone()[0])


def add_recipe(conn, team_id: int, name: str, station: str, yield_qty: float, menu_price: float, shelf_life_days: int, notes: str, item_rows: list[tuple[int, float, str, str]], steps: list[dict]) -> int:
    conn.execute(
        """
        INSERT INTO recipes (team_id, name, station, yield_qty, portion_unit, menu_price, shelf_life_days, notes, recipe_steps, created_at)
        VALUES (?, ?, ?, ?, 'plate', ?, ?, ?, ?, ?)
        """,
        (team_id, name, station, yield_qty, menu_price, shelf_life_days, notes, server.json.dumps(steps), server.now_iso()),
    )
    rid = int(conn.execute("SELECT last_insert_rowid()").fetchone()[0])
    for product_id, qty, unit, prep_note in item_rows:
        conn.execute(
            "INSERT INTO recipe_items (team_id, recipe_id, product_id, qty, unit, prep_note) VALUES (?, ?, ?, ?, ?, ?)",
            (team_id, rid, product_id, qty, unit, prep_note),
        )
    return rid


def add_dish(conn, team_id: int, name: str, station: str, menu_price: float, notes: str, components: list[tuple[str, int, float, str, str]]) -> int:
    conn.execute(
        "INSERT INTO dishes (team_id, name, station, menu_price, notes, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        (team_id, name, station, menu_price, notes, server.now_iso()),
    )
    dish_id = int(conn.execute("SELECT last_insert_rowid()").fetchone()[0])
    for component_type, component_id, qty, unit, portion_note in components:
        conn.execute(
            "INSERT INTO dish_components (team_id, dish_id, component_type, component_id, qty, unit, portion_note) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (team_id, dish_id, component_type, component_id, qty, unit, portion_note),
        )
    return dish_id


def add_weekly_availability(conn, team_id: int, user_id: int, created_by: int, day: int, shift: str, start: str, end: str, status: str, label: str) -> None:
    conn.execute(
        """
        INSERT INTO employee_weekly_availability
            (team_id, user_id, day_of_week, shift_label, start_time, end_time, status, label, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (team_id, user_id, day, shift, start, end, status, label, created_by, server.now_iso()),
    )


def add_blueprint(conn, team_id: int, created_by: int, day: int, shift_label: str, station: str, start: str, end: str, employees_needed: int, notes: str) -> None:
    conn.execute(
        """
        INSERT INTO schedule_blueprints (team_id, day_of_week, shift_label, station, start_time, end_time, employees_needed, notes, active, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
        """,
        (team_id, day, shift_label, station, start, end, employees_needed, notes, created_by, server.now_iso()),
    )


def add_shift(conn, team_id: int, title: str, station: str, start: datetime, end: datetime, status: str, assigned_to: int | None, created_by: int, notes: str = "") -> int:
    conn.execute(
        """
        INSERT INTO shifts (team_id, title, station, start_at, end_at, status, assigned_to, created_by, notes, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (team_id, title, station, iso(start), iso(end), status, assigned_to, created_by, notes, server.now_iso()),
    )
    return int(conn.execute("SELECT last_insert_rowid()").fetchone()[0])


def build_stock_locations(conn, team_id: int) -> None:
    for idx, (name, subclass) in enumerate([
        ("Walk-In Cooler · Produce Rack", "produce / herbs"),
        ("Walk-In Cooler · Herb Shelf", "herbs"),
        ("Walk-In Cooler · Dairy Shelf", "dairy"),
        ("Walk-In Cooler · Protein Speed Rack", "protein"),
        ("Walk-In Cooler · Seafood Bin", "seafood"),
        ("Lowboy Cooler · Sauce Shelf", "sauces (cold)"),
        ("Dry Storage · Canned Goods", "#10 cans / dry goods"),
        ("Dry Storage · Grain Rack", "dry goods / grains"),
        ("Bakery Dry Storage", "bakery"),
        ("Freezer · Speed Rack", "frozen"),
    ], 1):
        conn.execute(
            """
            INSERT INTO stock_locations (team_id, name, subclass, sort_order, notes, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(team_id, name) DO UPDATE SET subclass=excluded.subclass, sort_order=excluded.sort_order, notes=excluded.notes
            """,
            (team_id, name, subclass, idx, "Demo COUNT walking-order location", server.now_iso()),
        )


def build_products(conn, team_id: int, vendor_ids: list[int], max_products: int = 250) -> list[dict]:
    products: list[dict] = []
    seen: set[str] = set()
    vendor_cycle = itertools.cycle(vendor_ids)
    index = 0
    # First pass creates restaurant-native item names without generic numbers.
    for category, unit, package_unit, station, names in PRODUCT_TEMPLATES:
        for base_name in names:
            if len(products) >= max_products:
                break
            name = base_name
            if name in seen:
                continue
            seen.add(name)
            index += 1
            vendor_id = next(vendor_cycle)
            package_qty = {
                "lb": 25, "oz": 16, "qt": 12, "cup": 64, "each": 48
            }.get(unit, 12)
            if package_unit in ("bunch", "jar", "tub"):
                package_qty = 12
            if unit == "each" and "Asparagus" in base_name:
                package_qty = 120
                package_unit = "box"
            package_price = round((8 + (index % 17) * 2.75 + package_qty * 0.55), 2)
            par = round(max(8, package_qty * (1.4 + (index % 5) * 0.15)), 2)
            current = round(par * (0.55 + (index % 9) * 0.09), 2)
            reorder = round(par * 0.45, 2)
            shelf = 3 if category in ("Produce", "Herbs", "Seafood") else 7 if category in ("Dairy", "Protein", "Sauce") else 120
            pid = add_product(
                conn, team_id, vendor_id, name, category, unit, current, par, reorder,
                package_qty, package_unit, package_price, shelf, station,
                f"Demo BUILD inventory item. Supplier pack: {package_qty:g} {unit} per {package_unit}.",
            )
            products.append({"id": pid, "name": name, "category": category, "unit": unit, "station": station, "stock_location": demo_stock_location(category, station), "cost": server.calculate_cost_per_unit(package_qty, package_unit, package_price, unit)})
    # Fill the remaining rows with station/category variations so exactly 250 inventory items exist.
    descriptors = ["Reserve", "Premium", "Local", "Organic", "Trimmed", "Diced", "Sliced", "Roasted", "Pickled", "Frozen", "Fresh", "Batch"]
    bases = [item for _, _, _, _, names in PRODUCT_TEMPLATES for item in names]
    for desc, base_name in itertools.product(descriptors, bases):
        if len(products) >= max_products:
            break
        name = f"{desc} {base_name}"
        if name in seen:
            continue
        template = PRODUCT_TEMPLATES[index % len(PRODUCT_TEMPLATES)]
        category, unit, package_unit, station, _ = template
        seen.add(name)
        index += 1
        vendor_id = next(vendor_cycle)
        package_qty = {"lb": 20, "oz": 24, "qt": 12, "cup": 80, "each": 50}.get(unit, 10)
        package_price = round(10 + (index % 23) * 1.85 + package_qty * 0.48, 2)
        par = round(max(6, package_qty * (1.2 + (index % 4) * 0.2)), 2)
        current = round(par * (0.5 + (index % 10) * 0.08), 2)
        reorder = round(par * 0.4, 2)
        shelf = 4 if category in ("Produce", "Herbs", "Seafood") else 10 if category in ("Dairy", "Protein", "Sauce") else 180
        pid = add_product(
            conn, team_id, vendor_id, name, category, unit, current, par, reorder,
            package_qty, package_unit, package_price, shelf, station,
            f"Generated demo item for large usability testing. Supplier pack: {package_qty:g} {unit} per {package_unit}.",
        )
        products.append({"id": pid, "name": name, "category": category, "unit": unit, "station": station, "stock_location": demo_stock_location(category, station), "cost": server.calculate_cost_per_unit(package_qty, package_unit, package_price, unit)})
    return products


def build_recipes(conn, team_id: int, products: list[dict], max_recipes: int = 100) -> list[dict]:
    recipes: list[dict] = []
    stations = ["Cold Prep", "Grill", "Sauté", "Sauce", "Bakery", "Raw Bar", "Garde Manger"]
    product_by_station: dict[str, list[dict]] = {}
    for p in products:
        product_by_station.setdefault(p["station"], []).append(p)
    all_recipe_names = []
    for adj, noun in itertools.product(RECIPE_ADJECTIVES, RECIPE_NOUNS):
        name = f"{adj} {noun}"
        if name not in all_recipe_names:
            all_recipe_names.append(name)
        if len(all_recipe_names) >= max_recipes:
            break
    for i, name in enumerate(all_recipe_names[:max_recipes], start=1):
        station = stations[(i - 1) % len(stations)]
        pool = product_by_station.get(station) or products
        if len(pool) < 4:
            pool = products
        item_rows = []
        for j in range(4 + (i % 3)):
            product = pool[(i * 7 + j * 11) % len(pool)]
            unit = product["unit"]
            if unit in ("lb", "qt", "cup"):
                qty = round(0.5 + ((i + j) % 6) * 0.75, 2)
            elif unit in ("oz",):
                qty = round(1 + ((i + j) % 12) * 0.5, 2)
            else:
                qty = float(1 + ((i + j) % 10))
            item_rows.append((product["id"], qty, unit, f"BUILD Recipe Tool ingredient {j + 1}; pulled from saved inventory."))
        yield_qty = [8, 12, 16, 20, 24, 32, 40][i % 7]
        menu_price = round(9 + (i % 18) * 1.25, 2)
        steps = [
            {"order": 1, "level": 0, "text": f"Gather mise for {name}."},
            {"order": 2, "level": 0, "text": "Prep ingredients to station standard."},
            {"order": 3, "level": 1, "text": "Taste and adjust seasoning before service."},
            {"order": 4, "level": 0, "text": "Label, date, and store in the assigned station."},
        ]
        rid = add_recipe(
            conn, team_id, name, station, yield_qty, menu_price, 2 + (i % 6),
            "Generated demo recipe. Editable in BUILD → Recipe Tool; feeds recipe cards, prep, plates, and costing.",
            item_rows, steps,
        )
        recipes.append({"id": rid, "name": name, "station": station, "yield": yield_qty, "price": menu_price})
    return recipes


def build_dishes(conn, team_id: int, recipes: list[dict], products: list[dict], plate_count: int = 18, plate_names: list[str] | None = None) -> None:
    for i, plate_name in enumerate((plate_names or PLATE_NAMES)[:plate_count]):
        station = ["Cold Prep", "Grill", "Sauté", "Raw Bar", "Bakery", "Garde Manger"][i % 6]
        components: list[tuple[str, int, float, str, str]] = []
        r1 = recipes[(i * 5) % len(recipes)]
        r2 = recipes[(i * 5 + 13) % len(recipes)]
        p1 = products[(i * 9 + 3) % len(products)]
        p2 = products[(i * 9 + 23) % len(products)]
        components.append(("recipe", r1["id"], 1, "portion", "Primary recipe component"))
        components.append(("recipe", r2["id"], 0.25, "portion", "Sauce, garnish, or side recipe"))
        components.append(("product", p1["id"], 0.5 if p1["unit"] in ("lb", "qt", "cup") else 1, p1["unit"], "Direct inventory garnish or plate item"))
        components.append(("product", p2["id"], 0.25 if p2["unit"] in ("lb", "qt", "cup") else 2, p2["unit"], "Second direct item for plate costing"))
        add_dish(
            conn, team_id, plate_name, station, round(16 + (i % 12) * 2.5, 2),
            "Generated demo Menu Item/Plate Tool record combining recipes and inventory items.",
            components,
        )


def add_pos_history(conn, team_id: int, recipes: list[dict]) -> None:
    today = datetime.now().date()
    for offset in range(45, 0, -1):
        day = today - timedelta(days=offset)
        for idx, recipe in enumerate(recipes[:45]):
            if (idx + offset) % 3 == 0:
                continue
            weekday_boost = 8 if day.weekday() in (4, 5) else 0
            qty = max(1, 8 + (idx % 18) + weekday_boost + (offset % 5))
            service = "dinner" if idx % 2 else "lunch"
            conn.execute(
                "INSERT INTO pos_sales (team_id, recipe_id, sale_date, qty_sold, service_period, source, created_at) VALUES (?, ?, ?, ?, ?, 'demo_pos_csv', ?)",
                (team_id, recipe["id"], day.isoformat(), float(qty), service, server.now_iso()),
            )


def build_profiles_and_scheduler(conn, team_id: int, owner_id: int, sous_id: int, manager_id: int, employee_ids: list[int], schedule_style: str = "high") -> None:
    monday = current_monday()
    # Employee weekly availability stored indefinitely in Employee Profile BUILD.
    shift_lookup = {name: (start, end) for name, start, end in SHIFT_TYPES}
    for idx, uid in enumerate(employee_ids):
        can_days = [(idx + d) % 7 for d in range(5)]
        for d in sorted(set(can_days)):
            shift_name = SHIFT_TYPES[(idx + d) % len(SHIFT_TYPES)][0]
            start, end = shift_lookup[shift_name]
            add_weekly_availability(conn, team_id, uid, owner_id, d, shift_name, start, end, "can_work", f"Profile BUILD: can work {shift_name}")
        cannot_day = (idx + 5) % 7
        add_weekly_availability(conn, team_id, uid, owner_id, cannot_day, "Unavailable", "00:00", "23:59", "cannot_work", "Profile BUILD: unavailable")
        if idx % 4 == 0:
            add_weekly_availability(conn, team_id, uid, owner_id, 6, "All day", "00:00", "23:59", "cannot_work", "Requested off / family")
    for uid in (owner_id, sous_id, manager_id):
        for d in range(6):
            add_weekly_availability(conn, team_id, uid, owner_id, d, "Manager coverage", "09:00", "23:00", "can_work", "Leadership coverage")

    # Date-specific examples: vacation, sick, call off.
    reasons = ["Vacation", "Sick", "Call off", "School", "Appointment"]
    for i, uid in enumerate(employee_ids[:10]):
        start = monday + timedelta(days=(i % 6), hours=10 + (i % 4))
        end = start + timedelta(hours=6)
        conn.execute(
            "INSERT INTO employee_unavailability (team_id, user_id, start_at, end_at, reason, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (team_id, uid, iso(start), iso(end), reasons[i % len(reasons)], owner_id, server.now_iso()),
        )

    # Chef BUILD → Scheduler Blueprint: realistic demo restaurant hours.
    # The demo is intentionally pre-filled so a buyer can see the product immediately instead of building 80+ shifts from scratch.
    demo_hours = {
        0: ("Monday", "11:00", "22:00"),
        1: ("Tuesday", "11:00", "22:00"),
        2: ("Wednesday", "11:00", "22:00"),
        3: ("Thursday", "11:00", "22:00"),
        4: ("Friday", "11:00", "23:30"),
        5: ("Saturday", "11:00", "23:30"),
        6: ("Sunday", "09:00", "15:00"),
    }
    station_plan = {
        "Brunch": [("Cold Prep", 1), ("Sauté", 1), ("Bakery", 1), ("Expo", 1), ("Dish", 1)],
        "Lunch": [("Cold Prep", 1), ("Grill", 1), ("Sauté", 1), ("Garde Manger", 1), ("Expo", 1), ("Dish", 1)],
        "Dinner": [("Cold Prep", 1), ("Grill", 2), ("Sauté", 2), ("Sauce", 1), ("Raw Bar", 1), ("Expo", 1), ("Dish", 1)],
        "Prep": [("Cold Prep", 2), ("Sauce", 1), ("Bakery", 1), ("Pantry", 1)],
        "Close": [("Grill", 1), ("Sauté", 1), ("Expo", 1), ("Dish", 1)],
    }
    if schedule_style == "boutique":
        demo_hours = {
            0: ("Monday", "08:00", "15:00"),
            1: ("Tuesday", "08:00", "15:00"),
            2: ("Wednesday", "08:00", "15:00"),
            3: ("Thursday", "08:00", "15:00"),
            4: ("Friday", "08:00", "15:00"),
            5: ("Saturday", "08:00", "15:00"),
            6: ("Sunday", "08:00", "15:00"),
        }
        station_plan = {
            "Breakfast": [("Bakery", 1), ("Cold Prep", 1), ("Expo", 1), ("Dish", 1)],
            "Brunch": [("Bakery", 1), ("Cold Prep", 1), ("Sauté", 1), ("Expo", 1), ("Dish", 1)],
            "Lunch": [("Cold Prep", 1), ("Garde Manger", 1), ("Expo", 1), ("Dish", 1)],
            "Prep": [("Bakery", 1), ("Cold Prep", 1), ("Pantry", 1)],
        }
    elif schedule_style == "steady":
        station_plan["Dinner"] = [("Cold Prep", 1), ("Grill", 1), ("Sauté", 1), ("Sauce", 1), ("Expo", 1), ("Dish", 1)]
        station_plan["Close"] = [("Grill", 1), ("Sauté", 1), ("Dish", 1)]

    blueprint_defs: list[dict] = []
    for d, (_, open_t, close_t) in demo_hours.items():
        if schedule_style == "boutique":
            if d in (5, 6):
                daily_shifts = [("Prep", "07:00", "09:00", station_plan["Prep"]), ("Brunch", "08:00", "15:00", station_plan["Brunch"])]
            else:
                daily_shifts = [("Prep", "07:00", "10:00", station_plan["Prep"]), ("Breakfast", "08:00", "11:00", station_plan["Breakfast"]), ("Lunch", "10:00", "15:00", station_plan["Lunch"])]
        elif d == 6:
            daily_shifts = [("Brunch", "09:00", "15:00", station_plan["Brunch"])]
        elif d in (4, 5):
            daily_shifts = [
                ("Prep", "08:00", "15:00", station_plan["Prep"]),
                ("Lunch", "10:00", "16:00", station_plan["Lunch"]),
                ("Dinner", "15:00", "23:30", station_plan["Dinner"]),
                ("Close", "17:00", "23:30", station_plan["Close"]),
            ]
        else:
            daily_shifts = [
                ("Prep", "08:00", "15:00", station_plan["Prep"]),
                ("Lunch", "10:00", "16:00", station_plan["Lunch"]),
                ("Dinner", "15:00", "22:00", station_plan["Dinner"]),
                ("Close", "16:00", "22:00", station_plan["Close"]),
            ]
        for shift_label, start, end, station_rows in daily_shifts:
            for station, employees_needed in station_rows:
                add_blueprint(conn, team_id, owner_id, d, shift_label, station, start, end, employees_needed, f"Demo hours {open_t}-{close_t}. Generated from Chef BUILD so grey slots are ready for demo use.")
                blueprint_defs.append({"day": d, "shift": shift_label, "station": station, "start": start, "end": end, "need": employees_needed})

    # Seed every uploaded/ChatGPT-generated scheduler blueprint slot as assigned so the demo opens with a complete schedule.
    # One separate training slot is added later for customers to click and test grey-slot mechanics.
    users = server.rows_dict(server.all_rows(conn, "SELECT * FROM users WHERE team_id=? AND active=1 ORDER BY role DESC, name", (team_id,)))
    employees = [u for u in users if u["role"] in ("employee", "team_leader", "manager")]
    assignments_by_user: dict[int, int] = {}

    def user_can_cover(u: dict, station: str, shift: str, day: int, start: str, end: str) -> bool:
        q = [x.strip().lower() for x in str(u.get("qualified_stations") or u.get("station") or "").split(",") if x.strip()]
        eligible = [x.strip().lower() for x in str(u.get("eligible_shifts") or "").split(",") if x.strip()]
        if q and station.lower() not in q and not any(station.lower() in item for item in q):
            return False
        if eligible and shift.lower() not in eligible and "any" not in eligible and "manager coverage" not in eligible:
            return False
        patterns = server.rows_dict(server.all_rows(conn, "SELECT * FROM employee_weekly_availability WHERE team_id=? AND user_id=? AND day_of_week=?", (team_id, u["id"], day)))
        for p in patterns:
            if p.get("status") == "cannot_work":
                # Full-day cannot-work blocks should prevent assignment; narrower overlaps are also blocked.
                if p.get("start_time") <= end and start <= p.get("end_time"):
                    return False
        can = [p for p in patterns if p.get("status") == "can_work"]
        if can and not any((p.get("start_time") <= start and p.get("end_time") >= end) or str(p.get("shift_label") or "").lower() in (shift.lower(), "manager coverage") for p in can):
            return False
        return True

    for slot_index, slot in enumerate(blueprint_defs):
        for n in range(int(slot["need"])):
            candidates = [u for u in employees if user_can_cover(u, slot["station"], slot["shift"], slot["day"], slot["start"], slot["end"])]
            if not candidates:
                candidates = employees
            candidates.sort(key=lambda u: (assignments_by_user.get(int(u["id"]), 0), u["name"]))
            chosen = candidates[(slot_index + n) % len(candidates)]
            day_start = monday + timedelta(days=slot["day"])
            start_dt = datetime.fromisoformat(f"{day_start.date().isoformat()}T{slot['start']}")
            end_dt = datetime.fromisoformat(f"{day_start.date().isoformat()}T{slot['end']}")
            if end_dt <= start_dt:
                end_dt += timedelta(days=1)
            add_shift(conn, team_id, f"{slot['shift']} — {slot['station']}", slot["station"], start_dt, end_dt, "assigned", int(chosen["id"]), owner_id, "Pre-filled demo schedule from Chef BUILD restaurant hours.")
            assignments_by_user[int(chosen["id"])] = assignments_by_user.get(int(chosen["id"]), 0) + 1

    # Add one extra training slot that is not part of the uploaded blueprint list. This keeps every uploaded slot filled
    # while still giving a visible grey card for customers to click during demos.
    add_blueprint(
        conn, team_id, owner_id,
        0, "Demo Fill", "Grill", "13:00", "15:00", 1,
        "Interactive demo slot. Click this grey box to see fill by station, fill by day, employee availability, side-panel hours, and offer-shift mechanics."
    )

    # Notifications explain the demo schedule is intentionally pre-filled.
    server.create_notification(conn, team_id, "Demo scheduler fully filled", "All 131 uploaded blueprint slots are already assigned. One extra Monday Demo Fill Grill slot is left grey so customers can click it and test fill by station, fill by day, side-panel hours, and offer-shift mechanics without building the week from scratch.", owner_id)

def add_prep_orders_counts(conn, team_id: int, owner_id: int, sous_id: int, manager_id: int, employee_ids: list[int], products: list[dict], recipes: list[dict]) -> None:
    tomorrow = (datetime.now() + timedelta(days=1)).date().isoformat()
    conn.execute(
        "INSERT INTO prep_sheets (team_id, title, prep_date, service_period, status, created_by, created_at) VALUES (?, ?, ?, ?, 'open', ?, ?)",
        (team_id, "Tomorrow Full Service Prep", tomorrow, "combined", owner_id, server.now_iso()),
    )
    sheet_id = int(conn.execute("SELECT last_insert_rowid()").fetchone()[0])
    for i, recipe in enumerate(recipes[:30]):
        assigned = employee_ids[i % len(employee_ids)]
        conn.execute(
            """
            INSERT INTO prep_tasks (team_id, prep_sheet_id, recipe_id, product_id, title, qty, unit, station, assigned_to, priority, status, due_at, notes)
            VALUES (?, ?, ?, NULL, ?, ?, 'batch', ?, ?, ?, 'todo', ?, ?)
            """,
            (team_id, sheet_id, recipe["id"], f"Prep {recipe['name']}", 1 + (i % 4), recipe["station"], assigned, 1 + (i % 3), f"{8 + (i % 8):02d}:00", "Generated demo prep task from recipes."),
        )
    for i, product in enumerate(products[:20]):
        assigned = employee_ids[(i + 3) % len(employee_ids)]
        conn.execute(
            """
            INSERT INTO prep_tasks (team_id, prep_sheet_id, recipe_id, product_id, title, qty, unit, station, assigned_to, priority, status, due_at, notes)
            VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, 'todo', ?, ?)
            """,
            (team_id, sheet_id, product["id"], f"Restock {product['name']}", 1 + (i % 6), product["unit"], product["station"], assigned, 1 + (i % 3), f"{9 + (i % 7):02d}:30", "Generated product prep/restock task."),
        )

    # Previous shift FILL / CLOSEOUT / PREP CHECK examples for manager analytics
    # and Inventory Sheet → IN USE demo rows. These records pretend the prior shift
    # submitted its closeout/fill/prep check, restocked stations, and left active
    # station batches ready for the next service.
    today = server.today_iso()
    previous_service_at = datetime.now() - timedelta(hours=10)
    previous_shift_notes = [
        "Previous shift closeout: stocked what was left in the cooler; enough for lunch.",
        "Previous shift closeout: spoiled trim discarded and station refilled.",
        "Previous shift closeout: spilled dressing noted during restock.",
        "Previous shift closeout: 86 in walk-in but station has lunch coverage.",
    ]
    for i, product in enumerate(products[:24]):
        employee = employee_ids[i % len(employee_ids)]
        pre = round(2 + (i % 8) * 0.75, 2)
        post = round(pre + 1 + (i % 4) * 0.5, 2)
        restocked = max(post - pre, 0)
        house_before = float(server.one(conn, "SELECT current_qty FROM products WHERE id=? AND team_id=?", (product["id"], team_id))["current_qty"] or 0)
        house_after = max(house_before - restocked, 0.0)
        note = previous_shift_notes[i % len(previous_shift_notes)]
        conn.execute(
            """
            INSERT INTO station_shift_counts (
                team_id, user_id, station, count_date, service_period, product_id,
                qty_before_snapshot, expected_pos_usage, expected_after_usage, qty_left, variance_qty,
                pre_stocked_qty, post_stocked_qty, restocked_from_house, ready_for_next_service,
                house_qty_before_snapshot, house_qty_after_restock, manager_expected_usage,
                actual_station_used, usage_variance_qty, count_workflow, unit, status, notes, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, 'end_shift_and_post_restock', ?, 'station_ready', ?, ?)
            """,
            (
                team_id, employee, product["station"], today, "previous shift", product["id"],
                house_before, 2.5 + (i % 6), max(house_before - (2.5 + (i % 6)), 0), post, 0,
                pre, post, restocked, house_before, house_after, 2.5 + (i % 6), max(pre - post, 0),
                round((max(pre - post, 0)) - (2.5 + (i % 6)), 2), product["unit"], note, server.now_iso(),
            ),
        )
        if restocked > 0:
            conn.execute("UPDATE products SET current_qty=?, updated_at=? WHERE id=? AND team_id=?", (house_after, server.now_iso(), product["id"], team_id))
            conn.execute(
                "INSERT INTO inventory_transactions (team_id, product_id, user_id, change_qty, type, reason, created_at) VALUES (?, ?, ?, ?, 'station_restock_from_house', ?, ?)",
                (team_id, product["id"], employee, -restocked, f"Demo previous shift restocked {product['station']} station", server.now_iso()),
            )
        conn.execute(
            """
            INSERT INTO station_batches (team_id, product_id, recipe_id, prep_task_id, station, qty, unit, made_at, expires_at, created_by, notes)
            VALUES (?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                team_id, product["id"], product["station"], post, product["unit"],
                iso(previous_service_at), iso(previous_service_at + timedelta(days=2)), employee,
                f"IN USE from previous shift FILL / CLOSEOUT / PREP CHECK: {note}",
            ),
        )

    for i, recipe in enumerate(recipes[:12]):
        employee = employee_ids[(i + 5) % len(employee_ids)]
        qty = 0.5 + (i % 4) * 0.5
        conn.execute(
            """
            INSERT INTO station_batches (team_id, product_id, recipe_id, prep_task_id, station, qty, unit, made_at, expires_at, created_by, notes)
            VALUES (?, NULL, ?, NULL, ?, ?, 'batch', ?, ?, ?, ?)
            """,
            (
                team_id, recipe["id"], recipe["station"], qty, iso(previous_service_at),
                iso(previous_service_at + timedelta(days=2)), employee,
                "IN USE recipe batch from previous shift profile. Inventory Sheet shows the ingredient impact by item.",
            ),
        )

    # Vendor order drafts based on live forecast suggestions.
    suggestions = server.build_order_suggestions(conn, team_id, 4)
    by_vendor: dict[int | None, list[dict]] = {}
    for s in suggestions:
        if float(s.get("suggested_order_qty") or 0) > 0:
            by_vendor.setdefault(s.get("vendor_id"), []).append(s)
    for vendor_id, items in by_vendor.items():
        vendor = server.one(conn, "SELECT * FROM vendors WHERE id=? AND team_id=?", (vendor_id, team_id)) if vendor_id else None
        expected = server.expected_delivery_for_vendor(vendor)
        title = f"{vendor['name'] if vendor else 'Unassigned Vendor'} Demo Order - {server.today_iso()}"
        conn.execute(
            "INSERT INTO orders (team_id, vendor_id, title, status, order_date, expected_delivery, created_by, created_at) VALUES (?, ?, ?, 'draft', ?, ?, ?, ?)",
            (team_id, vendor_id, title, server.today_iso(), expected, owner_id, server.now_iso()),
        )
        order_id = int(conn.execute("SELECT last_insert_rowid()").fetchone()[0])
        for s in items[:25]:
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
                    s.get("risk") or "", server.json.dumps(s.get("prep_sources") or []), server.json.dumps(s.get("pos_sources") or []),
                ),
            )


def add_team_activity(conn, team_id: int, owner_id: int, sous_id: int, manager_id: int, employee_ids: list[int]) -> None:
    posts = [
        (owner_id, "announcement", "Demo mode loaded", "This account includes 250 inventory items, 100 recipes, 18 menu plates, and 28 filled profiles.", "team"),
        (sous_id, "manager_note", "Sous profile test", "Sous chef has manager access and can review scheduling, prep, inventory, and station closeout analytics.", "managers"),
        (manager_id, "incident", "Station closeout review", "Compare POS sales to station counts to spot overuse, underuse, or over-prep by service period.", "leaders"),
        (employee_ids[0], "suggestion", "Cold Prep label printer", "Suggestion: add printed labels to the station closeout page after post-restock is ready.", "team"),
    ]
    for user_id, post_type, title, body, visibility in posts:
        conn.execute(
            "INSERT INTO posts (team_id, user_id, type, title, body, visibility, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (team_id, user_id, post_type, title, body, visibility, server.now_iso()),
        )

    for uid in employee_ids[:5]:
        conn.execute(
            "INSERT INTO access_grants (team_id, user_id, tool, expires_at, reason, granted_by, created_at) VALUES (?, ?, 'inventory', ?, ?, ?, ?)",
            (team_id, uid, (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%dT%H:%M"), "Demo temporary inventory counting access.", owner_id, server.now_iso()),
        )
    for i, uid in enumerate(employee_ids[:8]):
        start = datetime.now().date() + timedelta(days=14 + i)
        end = start + timedelta(days=i % 3)
        conn.execute(
            "INSERT INTO time_off_requests (team_id, user_id, start_date, end_date, days_requested, status, reason, created_at) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)",
            (team_id, uid, start.isoformat(), end.isoformat(), float((end - start).days + 1), "Generated demo time-off request.", server.now_iso()),
        )

    notifications = [
        (owner_id, "Demo data ready", "Chef profile can adjust all demo BUILD data: 250 items, 100 recipes, 18 plates, and 25 employee profiles."),
        (sous_id, "Sous profile ready", "Use this manager profile to test scheduling, prep, and inventory permissions."),
        (manager_id, "Manager profile ready", "Use this profile to test team leader approvals and station closeout analytics."),
    ]
    for uid, title, body in notifications:
        server.create_notification(conn, team_id, title, body, uid)
    for uid in employee_ids[:10]:
        server.create_notification(conn, team_id, "Employee profile loaded", "Your schedule, availability, station qualifications, and time-off balance are filled for demo testing.", uid)


DEMO_CONFIGS = [
    {
        "team_name": "DEMO-boutique · Brunch & Lunch Cafe",
        "owner_email": "boutique@chefledger.test",
        "sous_email": "sous.boutique@chefledger.test",
        "manager_email": "manager.boutique@chefledger.test",
        "domain": "boutique.chefledger.test",
        "style": "boutique",
        "vendor_count": 5,
        "product_count": 70,
        "recipe_count": 30,
        "plate_count": 20,
        "employee_count": 8,
        "owner_name": "Chef Elise Moreau",
        "profile_note": "Boutique demo: brunch/lunch service, about 40 seats, no dinner buildout, smaller staff and vendor set.",
    },
    {
        "team_name": "DEMO-steady · 50 Table Neighborhood Restaurant",
        "owner_email": "steady@chefledger.test",
        "sous_email": "sous.steady@chefledger.test",
        "manager_email": "manager.steady@chefledger.test",
        "domain": "steady.chefledger.test",
        "style": "steady",
        "vendor_count": 10,
        "product_count": 150,
        "recipe_count": 60,
        "plate_count": 36,
        "employee_count": 16,
        "owner_name": "Chef Morgan Lee",
        "profile_note": "Steady demo: 50-table restaurant with lunch, dinner, moderate prep, and a practical manager/sous/team-lead workflow.",
    },
    {
        "team_name": "DEMO-high volume · Harbor Room",
        "owner_email": "highvolume@chefledger.test",
        "sous_email": "sous.highvolume@chefledger.test",
        "manager_email": "manager.highvolume@chefledger.test",
        "domain": "highvolume.chefledger.test",
        "style": "high",
        "vendor_count": 16,
        "product_count": 250,
        "recipe_count": 100,
        "plate_count": 18,
        "employee_count": 25,
        "owner_name": "Chef Alex Rivera",
        "profile_note": "High-volume demo: full-service operation with large inventory, heavy prep, vendor forecasting, filled manager schedule, and team workflows.",
    },
]


def create_demo_team(conn, cfg: dict) -> None:
    conn.execute("INSERT INTO teams (name, created_at) VALUES (?, ?)", (cfg["team_name"], server.now_iso()))
    team_id = int(conn.execute("SELECT last_insert_rowid()").fetchone()[0])

    vendor_ids = [add_vendor(conn, team_id, row) for row in VENDORS[: cfg["vendor_count"]]]
    for name, station_type, notes in STATIONS:
        add_station(conn, team_id, name, station_type, notes)

    owner_id = add_user(
        conn, team_id, cfg["owner_name"], cfg["owner_email"], "owner", "Executive Chef", COLORS[0],
        "Executive Chef, Expo, Sauce, Grill, Sauté, Cold Prep, Bakery", "Breakfast, Lunch, Dinner, Prep, Close, Brunch, Manager coverage", 14, 10, 1,
    )
    sous_id = add_user(
        conn, team_id, "Sous Chef Jamie Park", cfg["sous_email"], "manager", "Sous Chef", COLORS[1],
        "Sauté, Sauce, Expo, Grill, Cold Prep", "Breakfast, Lunch, Dinner, Prep, Close, Brunch, Manager coverage", 10, 6, 0,
    )
    manager_id = add_user(
        conn, team_id, "Manager Dana Wells", cfg["manager_email"], "team_leader", "Floor + Expo Manager", COLORS[2],
        "Expo, Cold Prep, Pantry, Dish", "Breakfast, Lunch, Dinner, Prep, Close, Brunch, Manager coverage", 8, 5, 0,
    )

    employee_ids: list[int] = []
    for i, name in enumerate(EMPLOYEE_NAMES[: cfg["employee_count"]]):
        main_station = STATIONS[(i + 1) % (len(STATIONS) - 1)][0]
        second_station = STATIONS[(i + 3) % (len(STATIONS) - 1)][0]
        email_slug = name.lower().replace(" ", ".").replace("'", "")
        qualified = f"{main_station}, {second_station}"
        eligible = ", ".join([SHIFT_TYPES[(i + j) % len(SHIFT_TYPES)][0] for j in range(3)])
        uid = add_user(
            conn, team_id, name, f"{email_slug}@{cfg['domain']}", "employee", main_station, COLORS[i + 3],
            qualified, eligible, 6 + (i % 8), 2 + (i % 6), i % 3 == 0,
        )
        employee_ids.append(uid)

    build_stock_locations(conn, team_id)
    products = build_products(conn, team_id, vendor_ids, cfg["product_count"])
    recipes = build_recipes(conn, team_id, products, cfg["recipe_count"])

    if cfg["style"] == "boutique":
        boutique_plates = [f"Boutique Brunch Plate {i:02d}" for i in range(1, 11)] + [f"Boutique Lunch Plate {i:02d}" for i in range(1, 11)]
        build_dishes(conn, team_id, recipes, products, cfg["plate_count"], boutique_plates)
    elif cfg["style"] == "steady":
        steady_plates = [f"Neighborhood Lunch Plate {i:02d}" for i in range(1, 19)] + [f"Neighborhood Dinner Plate {i:02d}" for i in range(1, 19)]
        build_dishes(conn, team_id, recipes, products, cfg["plate_count"], steady_plates)
    else:
        build_dishes(conn, team_id, recipes, products, cfg["plate_count"])

    add_pos_history(conn, team_id, recipes)
    build_profiles_and_scheduler(conn, team_id, owner_id, sous_id, manager_id, employee_ids, cfg["style"])
    add_prep_orders_counts(conn, team_id, owner_id, sous_id, manager_id, employee_ids, products, recipes)
    add_team_activity(conn, team_id, owner_id, sous_id, manager_id, employee_ids)
    server.create_notification(conn, team_id, "Demo profile loaded", cfg["profile_note"], owner_id)


def create_demo_database() -> None:
    server.DATA_ROOT.mkdir(parents=True, exist_ok=True)
    if server.DB_PATH.exists():
        server.DB_PATH.unlink()
    server.migrate()

    with server.db() as conn:
        for cfg in DEMO_CONFIGS:
            create_demo_team(conn, cfg)
        conn.commit()

    print(f"Created Chef Ledger demo database: {server.DB_PATH}")
    print("DEMO-boutique login: boutique@chefledger.test / ChefLedger123!")
    print("DEMO-steady login: steady@chefledger.test / ChefLedger123!")
    print("DEMO-high volume login: highvolume@chefledger.test / ChefLedger123!")


if __name__ == "__main__":
    create_demo_database()
