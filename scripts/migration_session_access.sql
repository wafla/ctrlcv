-- Run once before deploying code-only session support. Existing sessions keep
-- requiring their original key. Safe to run again or after a fresh schema.sql.
DECLARE
  column_count NUMBER;
BEGIN
  SELECT COUNT(*) INTO column_count
  FROM user_tab_columns
  WHERE table_name = 'SESSIONS' AND column_name = 'REQUIRES_KEY';

  IF column_count = 0 THEN
    EXECUTE IMMEDIATE 'ALTER TABLE sessions ADD (
      requires_key NUMBER(1) DEFAULT 1 NOT NULL CHECK (requires_key IN (0, 1))
    )';
  END IF;
END;
/
