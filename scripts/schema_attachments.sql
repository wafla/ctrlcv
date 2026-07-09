CREATE TABLE image_attachments (
  id VARCHAR2(36) PRIMARY KEY,
  session_id VARCHAR2(36) NOT NULL,
  storage_path VARCHAR2(255) NOT NULL,
  encrypted_size NUMBER NOT NULL,
  mime_type VARCHAR2(100) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT SYS_EXTRACT_UTC(SYSTIMESTAMP),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX idx_image_attachments_session ON image_attachments(session_id);
CREATE INDEX idx_image_attachments_expires ON image_attachments(expires_at);
