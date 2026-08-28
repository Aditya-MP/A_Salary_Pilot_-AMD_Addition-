-- Google Sign-In support.
--
-- password_hash goes from NOT NULL to nullable: an account created via
-- Google never had a password, and inventing one to satisfy the constraint
-- would just be a fake credential nobody knows and nobody should be able to
-- log in with. A NULL password_hash is the honest representation - and
-- because auth.VerifyPassword fails safely on an empty/malformed hash
-- (rejects rather than panics), a Google-only account trying the password
-- form simply gets "email or password is incorrect", same as any other
-- wrong attempt.
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

-- Google's own stable, permanent per-user identifier (the JWT `sub` claim).
-- Not the email: a user can change their Google account's email, and using
-- email as the join key would silently reassign the account to whoever
-- controls that address next. `sub` never changes for the life of the
-- Google account.
ALTER TABLE users ADD COLUMN google_sub TEXT UNIQUE;
