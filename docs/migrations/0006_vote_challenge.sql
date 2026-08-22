-- Vote challenge: the citizen confirms a vote by answering with three CPF
-- digits (random positions) plus the day, month or year of their birth.
--
-- The birth date is therefore needed in full, not just the year. It is stored
-- encrypted (AES-256-GCM under CPF_ENC_KEY, same as the CPF), opened only in
-- memory to compare one answer, never displayed and never exported. A challenge
-- restricted to the year could only ever ask for the same two digits, which
-- stops being a challenge the second time somebody sees it.
--
-- `birthYear` stays in clear alongside it: the age gate and the anonymized
-- demographics have to be queryable in SQL, and a year alone identifies nobody.
--
-- Idempotent: re-running is a no-op.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "birthDateEncrypted" TEXT;
