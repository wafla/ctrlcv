BEGIN
  DBMS_SCHEDULER.DROP_JOB(
    job_name => 'JOB_CLEANUP_USAGE_EVENTS',
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
    job_name        => 'JOB_CLEANUP_USAGE_EVENTS',
    job_type        => 'STORED_PROCEDURE',
    job_action      => 'CLEANUP_USAGE_EVENTS',
    start_date      => SYSTIMESTAMP,
    repeat_interval => 'FREQ=DAILY;INTERVAL=1',
    enabled         => TRUE,
    comments        => 'Deletes raw usage events older than 30 days.'
  );
END;
/
