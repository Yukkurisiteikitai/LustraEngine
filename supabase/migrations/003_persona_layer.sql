-- L4 Persona Layer: trait scores and persona snapshots

CREATE TABLE traits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (name IN (
    'introversion', 'discipline', 'curiosity', 'risk_tolerance', 'self_criticism', 'social_anxiety'
  )),
  score REAL NOT NULL CHECK (score >= 0 AND score <= 1),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, name)
);

ALTER TABLE traits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_traits" ON traits FOR ALL USING (user_id = auth.uid());

CREATE TABLE persona_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  persona_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE persona_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_snapshots" ON persona_snapshots FOR ALL USING (user_id = auth.uid());
