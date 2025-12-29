INSERT INTO sessions (
  id, session_code, created_at, expires_at, is_active
) VALUES (
  'TESTSESSION001',
  'ABC123',
  SYSTIMESTAMP,
  SYSTIMESTAMP + INTERVAL '2' HOUR, -- 2분 뒤 만료
  1
);

INSERT INTO messages (
  id, session_id, content, sender_type
) VALUES (
  'MSG001',
  'TESTSESSION001',
  '첫 번째 메시지입니다.',
  'desktop'
);

INSERT INTO messages (
  id, session_id, content, sender_type
) VALUES (
  'MSG002',
  'TESTSESSION001',
  '두 번째 메시지입니다.',
  'mobile'
);
