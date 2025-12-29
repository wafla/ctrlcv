-- SESSIONS TABLE
CREATE TABLE sessions (
  id VARCHAR2(36) DEFAULT RAWTOHEX(sys_guid()) PRIMARY KEY,
  session_code VARCHAR2(10) UNIQUE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT SYS_EXTRACT_UTC(SYSTIMESTAMP),
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (SYS_EXTRACT_UTC(SYSTIMESTAMP) + INTERVAL '2' HOUR),
  is_active NUMBER(1) DEFAULT 1 CHECK (is_active IN (0, 1))
);

CREATE INDEX idx_sessions_code ON sessions(session_code);
CREATE INDEX idx_sessions_active ON sessions(is_active, expires_at);

-- MESSAGES TABLE
CREATE TABLE messages (
  id VARCHAR2(36) DEFAULT RAWTOHEX(sys_guid()) PRIMARY KEY,
  session_id VARCHAR2(36) NOT NULL,
  content CLOB NOT NULL,
  sender_type VARCHAR2(20)
    CHECK (sender_type IN ('desktop', 'mobile')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT SYS_EXTRACT_UTC(SYSTIMESTAMP),
  CONSTRAINT fk_messages_session
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE INDEX idx_messages_session_id ON messages(session_id);
CREATE INDEX idx_messages_created_at ON messages(created_at);
