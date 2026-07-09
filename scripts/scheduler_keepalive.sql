BEGIN
  DBMS_SCHEDULER.DROP_JOB(
    job_name => 'JOB_DB_KEEPALIVE',
    force => TRUE
  );
EXCEPTION
  WHEN OTHERS THEN
    IF SQLCODE != -27475 THEN
      RAISE;
    END IF;
END;
/

BEGIN
  DBMS_SCHEDULER.CREATE_JOB (
    job_name        => 'JOB_DB_KEEPALIVE',
    job_type        => 'STORED_PROCEDURE',
    job_action      => 'CREATE_KEEPALIVE_PING',
    start_date      => SYSTIMESTAMP + INTERVAL '1' DAY,
    repeat_interval => 'FREQ=DAILY;INTERVAL=1',
    enabled         => TRUE,
    comments        => 'Creates a lightweight keepalive row daily so the database is not left idle.'
  );
END;
/
