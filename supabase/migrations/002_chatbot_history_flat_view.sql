-- View that normalizes message/customer so both JSONB object and JSONB string (double-encoded) work.
-- Use this view for reads; keep inserting into chatbot_history.
create or replace view chatbot_history_flat as
select
  id,
  session_id,
  date_time,
  coalesce(message->>'type', (message#>>'{}')::jsonb->>'type') as msg_type,
  coalesce(message->>'content', (message#>>'{}')::jsonb->>'content') as msg_content,
  coalesce(message->>'body', (message#>>'{}')::jsonb->>'body') as msg_body,
  coalesce(customer->>'name', (customer#>>'{}')::jsonb->>'name') as cust_name,
  coalesce(customer->>'number', (customer#>>'{}')::jsonb->>'number') as cust_number
from chatbot_history;
