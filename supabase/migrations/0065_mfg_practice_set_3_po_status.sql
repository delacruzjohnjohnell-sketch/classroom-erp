-- ============================================================
-- Classroom ERP — migration 0065 (Activity 3 answer set: three purchase orders stay open after goods were returned)
--
-- Needs 0064. DATA ONLY: in the stored set 'capiz-feb-mar-2027', the three purchase orders whose goods were partly returned to the vendor after inspection
-- (₱65,100.00 and ₱46,200.00 to Bohol Capiz Traders, ₱44,540.00 to Manila Electronics) are expected as 'sent' (reopened by the return), not 'closed'.
-- The checker (src/lib/mfgPracticeCheck.ts) reads the optional "status" of each purchase order; the default stays 'closed'.
--
-- ROLLBACK: update mfg_practice_sets set definition = definition #- '{purchaseOrders}' ... or simply re-run 0064 (it rebuilds the whole set).
-- ============================================================

update mfg_practice_sets
   set definition = jsonb_set(definition, '{purchaseOrders}',
         (select jsonb_agg(case when (p->>'total')::numeric in (65100, 46200, 44540) then p || '{"status":"sent"}'::jsonb else p end)
            from jsonb_array_elements(definition->'purchaseOrders') p))
 where id = 'capiz-feb-mar-2027';
