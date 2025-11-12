-- Adicionar política UPDATE para operations (necessária para fechar posições)
DROP POLICY IF EXISTS "Users can update their own operations" ON operations;
CREATE POLICY "Users can update their own operations"
ON operations
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);