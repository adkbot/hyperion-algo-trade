-- Add single_position_mode column to user_settings
ALTER TABLE user_settings 
ADD COLUMN single_position_mode boolean DEFAULT true;