-- ThreeStarOps v65 persistence upgrade.
-- Safe to run after v64. This adds the generic D1 record table used by inventory,
-- products, vendors, recipes, POS CSV rows, forecasts, prep tasks, orders, menus,
-- deliveries, saved inventories, schedules, and team/accountability records.

CREATE TABLE IF NOT EXISTS app_records (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  type TEXT NOT NULL,
  data_json TEXT NOT NULL,
  created_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (team_id) REFERENCES teams(id)
);

CREATE INDEX IF NOT EXISTS idx_app_records_team_type ON app_records(team_id, type, updated_at);
CREATE INDEX IF NOT EXISTS idx_app_records_type_id ON app_records(type, id);
