BEGIN
  DBMS_SCHEDULER.DROP_JOB(
    job_name => 'JOB_CLEANUP_SESSIONS',
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
    job_name        => 'JOB_CLEANUP_SESSIONS',
    job_type        => 'STORED_PROCEDURE',
    job_action      => 'CLEANUP_EXPIRED_SESSIONS',
    start_date      => SYSTIMESTAMP,
    repeat_interval => 'FREQ=MINUTELY;INTERVAL=10',
    enabled         => TRUE
  );
END;
/
