-- =============================================
-- Migration: Add MR Number, History, and Department to patients table
-- Run this in the Supabase SQL Editor
-- =============================================

-- 1. Create a sequence for MR numbers starting at 1001
CREATE SEQUENCE IF NOT EXISTS patients_mr_number_seq START WITH 1001;

-- 2. Add mr_number column with auto-increment default
ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS mr_number INTEGER UNIQUE DEFAULT nextval('patients_mr_number_seq');

-- Backfill any existing rows that may have NULL mr_number
UPDATE patients SET mr_number = nextval('patients_mr_number_seq') WHERE mr_number IS NULL;

-- Now make it NOT NULL
ALTER TABLE patients ALTER COLUMN mr_number SET NOT NULL;

-- 3. Add history text field
ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS history TEXT DEFAULT NULL;

-- 4. Add department/specialty text field
ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS department TEXT DEFAULT NULL;
