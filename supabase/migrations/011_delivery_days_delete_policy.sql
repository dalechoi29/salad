-- Allow users to delete their own delivery day selections
-- Needed for bulk sync from subscription page

CREATE POLICY "Users can delete own delivery days"
  ON delivery_days FOR DELETE
  USING (auth.uid() = user_id);

GRANT DELETE ON delivery_days TO authenticated;
