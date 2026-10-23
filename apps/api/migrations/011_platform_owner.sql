ALTER TABLE user_roles
  DROP CONSTRAINT IF EXISTS user_roles_role_check;

ALTER TABLE user_roles
  ADD CONSTRAINT user_roles_role_check
  CHECK (role IN ('buyer', 'moderator', 'administrator', 'platform_owner'));

CREATE UNIQUE INDEX IF NOT EXISTS user_roles_single_platform_owner_idx
  ON user_roles (role)
  WHERE role = 'platform_owner';
