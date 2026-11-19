-- ============================================================
-- Vocabulary game: +0.5 point in "ლექსიკა 2" (Scores.vocab2)
-- for an EXPERT win, once per week.
-- Run ONCE in Supabase → SQL Editor → New query → Run.
-- ============================================================

-- 1) vocab2 must accept half points (5.5). Keeps all existing values.
ALTER TABLE public."Scores"
    ALTER COLUMN vocab2 TYPE numeric(5,1) USING COALESCE(NULLIF(vocab2::text, ''), '0')::numeric(5,1);

-- 2) Which weeks already gave the expert point (one row per student + course + week)
CREATE TABLE IF NOT EXISTS content."VocabGameWins" (
    "StudentId"  text        NOT NULL,
    "Course"     text        NOT NULL DEFAULT '',
    "Week"       int         NOT NULL,
    "Wins"       int         NOT NULL DEFAULT 1,
    "FirstWonAt" timestamptz NOT NULL DEFAULT now(),
    "LastWonAt"  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY ("StudentId", "Course", "Week")
);

