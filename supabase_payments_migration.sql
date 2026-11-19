-- Run in the Supabase SQL Editor before deploying the payment changes.
-- NULL preserves the old behavior for orders recorded before this migration.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS paid_amount_pkr integer
  CHECK (paid_amount_pkr >= 0 AND paid_amount_pkr <= final_total_pkr);
