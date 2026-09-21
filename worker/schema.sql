-- ══════════════════════════════════════════════════════════════════
-- KINEORA CLOUD SYNC — Neon Postgres schema (v1.4.35+)
-- Live DB se EXACT match (Sep 2026). Sab statements idempotent hain —
-- existing DB par bhi safe hai chalana.
--   psql "$NEON_DATABASE_URL" -f worker/schema.sql
-- ══════════════════════════════════════════════════════════════════

-- ── cloud sync (push/pull, per-user records, LWW) ──
CREATE TABLE IF NOT EXISTS sync_records (
  uid        text   NOT NULL,
  kind       text   NOT NULL,          -- attempt | test | question | note | setting | meta
  rid        text   NOT NULL,
  data       jsonb,
  updated_at bigint NOT NULL,
  deleted    boolean NOT NULL DEFAULT false,
  PRIMARY KEY (uid, kind, rid)
);
CREATE INDEX IF NOT EXISTS sync_records_pull_idx ON sync_records (uid, updated_at);

CREATE TABLE IF NOT EXISTS sync_devices (
  uid       text   NOT NULL,
  device    text   NOT NULL,
  last_seen bigint NOT NULL,
  platform  text,
  PRIMARY KEY (uid, device)
);

-- ── 🔗 shareable test links (v1.4.35 — battle tables hata diye gaye) ──
CREATE TABLE IF NOT EXISTS share_tests (
  code       text  NOT NULL,           -- 6-char code (charset A-Z 2-9 minus confusing)
  owner_uid  text  NOT NULL,           -- creator ka Firebase uid (create = AUTH)
  owner_name text  NOT NULL,
  name       text  NOT NULL,           -- test ka naam (max 80)
  data       jsonb NOT NULL,           -- {sections, duration, mode, marking, exam, strategy, totalQuestions, maxScore}
  created_at bigint NOT NULL,          -- epoch ms
  PRIMARY KEY (code)
);

CREATE TABLE IF NOT EXISTS share_attempts (
  id           bigserial PRIMARY KEY,
  code         text   NOT NULL,        -- share_tests.code
  uid          text   NOT NULL,        -- '' for signed-out dost (NO-AUTH upload)
  name         text   NOT NULL,        -- candidate name = identity (max 40)
  score        integer NOT NULL DEFAULT 0,
  correct      integer NOT NULL DEFAULT 0,
  wrong        integer NOT NULL DEFAULT 0,
  unattempted  integer NOT NULL DEFAULT 0,
  accuracy     real    NOT NULL DEFAULT 0,
  answers      jsonb   NOT NULL DEFAULT '[]',  -- [{qid, opt, correct}] — "kisne kya chuna" matrix
  at           bigint  NOT NULL        -- epoch ms (5s throttle per code+name isi se)
);
CREATE INDEX IF NOT EXISTS share_attempts_code_idx ON share_attempts (code);
