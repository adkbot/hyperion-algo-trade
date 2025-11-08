-- Add DELETE policies for clearing history
ALTER TABLE session_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE operations ENABLE ROW LEVEL SECURITY;

-- Allow users to delete their own session history
CREATE POLICY "Users can delete their own session history"
ON session_history FOR DELETE
USING (auth.uid() = user_id);

-- Allow users to delete their own operations
CREATE POLICY "Users can delete their own operations"
ON operations FOR DELETE
USING (auth.uid() = user_id);

-- Allow users to delete their own agent logs
CREATE POLICY "Users can delete their own agent logs"
ON agent_logs FOR DELETE
USING (auth.uid() = user_id);

-- Allow users to delete their own daily goals
CREATE POLICY "Users can delete their own daily goals"
ON daily_goals FOR DELETE
USING (auth.uid() = user_id);

-- Allow users to delete their own session state
CREATE POLICY "Users can delete their own session state"
ON session_state FOR DELETE
USING (auth.uid() = user_id);