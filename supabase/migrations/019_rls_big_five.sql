ALTER TABLE big_five_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_big_five_scores" ON big_five_scores
  FOR ALL USING (user_id = auth.uid());

ALTER TABLE big_five_facets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_big_five_facets" ON big_five_facets
  FOR ALL USING (user_id = auth.uid());
