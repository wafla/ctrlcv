CREATE TABLE usage_events (
  id VARCHAR2(36) DEFAULT RAWTOHEX(sys_guid()) PRIMARY KEY,
  event_type VARCHAR2(50) NOT NULL,
  session_id_hash VARCHAR2(64),
  event_value NUMBER DEFAULT 1 NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT SYS_EXTRACT_UTC(SYSTIMESTAMP)
);

CREATE INDEX idx_usage_events_created ON usage_events(created_at);
CREATE INDEX idx_usage_events_type_created ON usage_events(event_type, created_at);

CREATE TABLE usage_daily_stats (
  stat_date DATE PRIMARY KEY,
  sessions_created NUMBER DEFAULT 0 NOT NULL,
  session_connections NUMBER DEFAULT 0 NOT NULL,
  messages_sent NUMBER DEFAULT 0 NOT NULL,
  images_uploaded NUMBER DEFAULT 0 NOT NULL,
  image_bytes_uploaded NUMBER DEFAULT 0 NOT NULL,
  files_uploaded NUMBER DEFAULT 0 NOT NULL,
  file_bytes_uploaded NUMBER DEFAULT 0 NOT NULL,
  api_errors NUMBER DEFAULT 0 NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT SYS_EXTRACT_UTC(SYSTIMESTAMP) NOT NULL
);
