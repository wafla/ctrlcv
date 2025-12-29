CREATE OR REPLACE FUNCTION generate_session_code
RETURN VARCHAR2
AS
  v_code VARCHAR2(10);
  v_cnt NUMBER;
BEGIN
  LOOP
    v_code := DBMS_RANDOM.STRING('X', 6);

    SELECT COUNT(*) INTO v_cnt
    FROM sessions
    WHERE session_code = v_code
      AND is_active = 1;

    IF v_cnt = 0 THEN
      RETURN v_code;
    END IF;
  END LOOP;
END;
