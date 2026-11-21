-- Run once in the Supabase SQL Editor before deploying the balance payment UI.
-- If any object already exists or a statement fails, the transaction rolls back.
-- Keep the original booking payment and each later balance collection on its own date.
BEGIN;

CREATE TABLE public.order_payments (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id text NOT NULL,
  amount_pkr integer NOT NULL CHECK (amount_pkr >= 0),
  payment_method text NOT NULL CHECK (payment_method IN ('Cash', 'Card', 'Unknown')),
  received_at timestamptz NOT NULL DEFAULT now(),
  recorded_by uuid DEFAULT auth.uid(),
  kind text NOT NULL CHECK (kind IN ('booking', 'balance'))
);

CREATE UNIQUE INDEX order_payments_one_booking
  ON public.order_payments (order_id) WHERE kind = 'booking';
CREATE INDEX order_payments_received_at
  ON public.order_payments (received_at);
CREATE INDEX order_payments_order_id
  ON public.order_payments (order_id);

ALTER TABLE public.order_payments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.order_payments FROM anon, authenticated;
GRANT SELECT ON public.order_payments TO authenticated;

CREATE POLICY order_payments_read ON public.order_payments
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.user_roles
            WHERE user_id = auth.uid() AND role IN ('admin', 'receptionist'))
  );

-- Existing bookings are entered at their original order date, without changing any totals.
INSERT INTO public.order_payments (order_id, amount_pkr, payment_method, received_at, kind)
SELECT o.id::text, COALESCE(o.paid_amount_pkr, o.final_total_pkr) - COALESCE(b.collected, 0),
       CASE WHEN lower(trim(o.payment_method)) = 'cash' THEN 'Cash'
            WHEN lower(trim(o.payment_method)) IN ('card', 'bank') THEN 'Card'
            ELSE 'Unknown' END,
       COALESCE(o.order_date, now()), 'booking'
FROM public.orders o
LEFT JOIN (
  SELECT order_id, sum(amount_pkr)::integer AS collected
  FROM public.order_payments WHERE kind = 'balance' GROUP BY order_id
) b ON b.order_id = o.id::text
WHERE COALESCE(o.paid_amount_pkr, o.final_total_pkr) - COALESCE(b.collected, 0) >= 0
ON CONFLICT (order_id) WHERE kind = 'booking' DO NOTHING;

CREATE FUNCTION public.record_booking_payment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.order_payments (order_id, amount_pkr, payment_method, received_at, kind)
  VALUES (NEW.id::text, COALESCE(NEW.paid_amount_pkr, NEW.final_total_pkr),
    CASE WHEN lower(trim(NEW.payment_method)) = 'cash' THEN 'Cash'
         WHEN lower(trim(NEW.payment_method)) IN ('card', 'bank') THEN 'Card'
         ELSE 'Unknown' END,
    COALESCE(NEW.order_date, now()), 'booking');
  RETURN NEW;
END;
$$;

CREATE TRIGGER record_booking_payment AFTER INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.record_booking_payment();

-- Admin corrections to the original amount stay in sync with the booking entry.
-- A balance collection is a separate event and never changes the booking entry.
CREATE FUNCTION public.sync_booking_payment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_balance_collected integer;
  v_booking_paid integer;
BEGIN
  SELECT COALESCE(sum(amount_pkr), 0)::integer INTO v_balance_collected
  FROM public.order_payments WHERE order_id = NEW.id::text AND kind = 'balance';
  v_booking_paid := COALESCE(NEW.paid_amount_pkr, NEW.final_total_pkr) - v_balance_collected;
  IF v_booking_paid < 0 THEN
    RAISE EXCEPTION 'Paid amount cannot be below already collected balance payments';
  END IF;

  INSERT INTO public.order_payments (order_id, amount_pkr, payment_method, received_at, kind)
  VALUES (NEW.id::text, v_booking_paid,
    CASE WHEN lower(trim(NEW.payment_method)) = 'cash' THEN 'Cash'
         WHEN lower(trim(NEW.payment_method)) IN ('card', 'bank') THEN 'Card'
         ELSE 'Unknown' END,
    COALESCE(NEW.order_date, now()), 'booking')
  ON CONFLICT (order_id) WHERE kind = 'booking'
  DO UPDATE SET amount_pkr = EXCLUDED.amount_pkr,
                payment_method = EXCLUDED.payment_method;
  RETURN NEW;
END;
$$;

CREATE TRIGGER sync_booking_payment
  AFTER UPDATE OF paid_amount_pkr, final_total_pkr, payment_method ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.sync_booking_payment();

CREATE FUNCTION public.receive_order_balance(
  p_order_id text, p_amount_pkr integer, p_method text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_paid integer;
  v_method text;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role IN ('admin', 'receptionist')
  ) THEN
    RAISE EXCEPTION 'Not authorized to receive payments';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id::text = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  v_paid := COALESCE(v_order.paid_amount_pkr, v_order.final_total_pkr);
  v_method := CASE WHEN lower(trim(p_method)) = 'cash' THEN 'Cash'
                   WHEN lower(trim(p_method)) = 'card' THEN 'Card'
                   ELSE NULL END;
  IF v_method IS NULL OR p_amount_pkr IS NULL OR p_amount_pkr <= 0
     OR p_amount_pkr > v_order.final_total_pkr - v_paid THEN
    RAISE EXCEPTION 'Invalid amount or payment method for the current balance';
  END IF;

  INSERT INTO public.order_payments (order_id, amount_pkr, payment_method, kind, recorded_by)
  VALUES (p_order_id, p_amount_pkr, v_method, 'balance', auth.uid());
  UPDATE public.orders SET paid_amount_pkr = v_paid + p_amount_pkr
  WHERE id = v_order.id;

  RETURN jsonb_build_object('paid_amount_pkr', v_paid + p_amount_pkr,
                            'balance_due_pkr', v_order.final_total_pkr - v_paid - p_amount_pkr);
END;
$$;

REVOKE ALL ON FUNCTION public.receive_order_balance(text, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.receive_order_balance(text, integer, text) TO authenticated;

COMMIT;
