-- Enable realtime for active_positions
ALTER TABLE public.active_positions REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.active_positions;

-- Enable realtime for operations
ALTER TABLE public.operations REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.operations;

-- Enable realtime for daily_goals
ALTER TABLE public.daily_goals REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.daily_goals;

-- Enable realtime for agent_logs
ALTER TABLE public.agent_logs REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_logs;

-- Enable realtime for user_settings
ALTER TABLE public.user_settings REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_settings;