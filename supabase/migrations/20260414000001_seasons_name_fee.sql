-- ============================================================
-- Migration: seasons_name_fee
-- Adds display name and registration fee to the seasons table.
-- These columns were omitted from the initial migration.
-- ============================================================

ALTER TABLE seasons
  ADD COLUMN IF NOT EXISTS name             TEXT,
  ADD COLUMN IF NOT EXISTS registration_fee NUMERIC(10, 2) NOT NULL DEFAULT 1000;
