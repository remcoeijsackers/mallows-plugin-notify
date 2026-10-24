-- Every push this plugin sent (or tried to), per workspace. `key` stops a second push for the same thing (one push per
-- question, one reminder per waiting item); the page shows the last ones.
CREATE TABLE {{sent}} (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id TEXT NOT NULL,
  key TEXT NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  ok INTEGER NOT NULL,
  error TEXT,
  at TEXT NOT NULL
);
CREATE UNIQUE INDEX {{sent}}_key ON {{sent}} (workspace_id, key);
CREATE INDEX {{sent}}_at ON {{sent}} (workspace_id, at);
