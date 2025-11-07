-- Create profiles table for user data
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- Add user_id to existing tables for data isolation
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.active_positions ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.operations ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.daily_goals ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.session_history ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Update RLS policies for user_settings
DROP POLICY IF EXISTS "Allow all operations on user_settings" ON public.user_settings;
CREATE POLICY "Users can view their own settings"
  ON public.user_settings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own settings"
  ON public.user_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own settings"
  ON public.user_settings FOR UPDATE
  USING (auth.uid() = user_id);

-- Update RLS policies for active_positions
DROP POLICY IF EXISTS "Allow all operations on active_positions" ON public.active_positions;
CREATE POLICY "Users can view their own positions"
  ON public.active_positions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own positions"
  ON public.active_positions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own positions"
  ON public.active_positions FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own positions"
  ON public.active_positions FOR DELETE
  USING (auth.uid() = user_id);

-- Update RLS policies for operations
DROP POLICY IF EXISTS "Allow all operations on operations" ON public.operations;
CREATE POLICY "Users can view their own operations"
  ON public.operations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own operations"
  ON public.operations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Update RLS policies for daily_goals
DROP POLICY IF EXISTS "Allow all operations on daily_goals" ON public.daily_goals;
CREATE POLICY "Users can view their own daily goals"
  ON public.daily_goals FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own daily goals"
  ON public.daily_goals FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own daily goals"
  ON public.daily_goals FOR UPDATE
  USING (auth.uid() = user_id);

-- Update RLS policies for session_history
DROP POLICY IF EXISTS "Allow all operations on session_history" ON public.session_history;
CREATE POLICY "Users can view their own session history"
  ON public.session_history FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own session history"
  ON public.session_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Update RLS policies for agent_logs
DROP POLICY IF EXISTS "Allow all operations on agent_logs" ON public.agent_logs;
ALTER TABLE public.agent_logs ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE POLICY "Users can view their own agent logs"
  ON public.agent_logs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own agent logs"
  ON public.agent_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Create trigger to auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'name', 'User')
  );
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();