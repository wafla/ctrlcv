BEGIN
  EXECUTE IMMEDIATE '
    CREATE TABLE db_keepalive_pings (
      id VARCHAR2(36) DEFAULT RAWTOHEX(sys_guid()) PRIMARY KEY,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT SYS_EXTRACT_UTC(SYSTIMESTAMP),
      note VARCHAR2(100) DEFAULT ''scheduled keepalive''
    )
  ';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLCODE != -955 THEN
      RAISE;
    END IF;
END;
/

CREATE OR REPLACE PROCEDURE create_keepalive_ping AS
BEGIN
  INSERT INTO db_keepalive_pings (note)
  VALUES ('scheduled keepalive');

  COMMIT;
END;
/
