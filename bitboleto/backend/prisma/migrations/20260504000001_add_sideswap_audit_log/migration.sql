CREATE TABLE IF NOT EXISTS sideswap_audit_log (
  id          BIGSERIAL    PRIMARY KEY,
  swap_id     TEXT         NOT NULL,
  from_status TEXT         NOT NULL,
  to_status   TEXT         NOT NULL,
  metadata    JSONB        NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sideswap_audit_log_swap_id    ON sideswap_audit_log (swap_id);
CREATE INDEX IF NOT EXISTS idx_sideswap_audit_log_created_at ON sideswap_audit_log (created_at DESC);
