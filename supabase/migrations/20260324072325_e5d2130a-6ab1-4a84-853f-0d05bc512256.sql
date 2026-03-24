ALTER TABLE quotes DROP CONSTRAINT IF EXISTS quotes_status_check;

ALTER TABLE quotes ADD CONSTRAINT quotes_status_check 
CHECK (status IN (
  'draft',
  'sent', 
  'quote_sent',
  'awaiting_client_response',
  'accepted',
  'client_accepted',
  'declined',
  'quote_declined',
  'awaiting_schedule_approval',
  'scheduled',
  'in_progress',
  'completed',
  'cancelled'
));