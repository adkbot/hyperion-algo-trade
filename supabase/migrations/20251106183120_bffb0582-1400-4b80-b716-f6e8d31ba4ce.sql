-- Add API key fields to user_settings table
ALTER TABLE user_settings 
ADD COLUMN IF NOT EXISTS api_key TEXT,
ADD COLUMN IF NOT EXISTS api_secret TEXT;