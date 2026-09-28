CREATE INDEX IF NOT EXISTS refresh_tokens_user_expiry_idx
  ON refresh_tokens(user_id, expires_at DESC);

CREATE INDEX IF NOT EXISTS chat_sessions_user_updated_idx
  ON chat_sessions(user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS chat_messages_session_created_idx
  ON chat_messages(session_id, created_at);
