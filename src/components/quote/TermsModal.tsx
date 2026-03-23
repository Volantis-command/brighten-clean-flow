import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';

const DEFAULT_TERMS = `BRIGHTLY CLEANING — TERMS & CONDITIONS (v1.0)

1. SERVICES
Brightly Cleaning provides residential and commercial cleaning services as described in the accepted quote. All work is performed by trained, insured cleaning professionals.

2. PAYMENT TERMS
Payment is due within 7 days of invoice. We accept bank transfer, credit card, and cash. A 10% late fee may apply to overdue invoices after 14 days.

3. CANCELLATION POLICY
Cancellations made with less than 24 hours' notice will incur a cancellation fee of 50% of the quoted price. No-shows will be charged the full quoted amount.

4. ACCESS REQUIREMENTS
The client must ensure safe and reasonable access to the property at the agreed time. If access cannot be provided, the cancellation policy applies.

5. PRE-EXISTING DAMAGE
Brightly Cleaning is not liable for pre-existing damage, wear, or staining. We recommend noting any existing damage before the clean commences. Our cleaners will document the state of the property on arrival.

6. LIABILITY
We carry public liability insurance. However, we are not responsible for damage caused by faulty fixtures, loose fittings, or items not disclosed prior to the clean. Claims must be reported within 24 hours.

7. COMPLETION PHOTOS
Brightly Cleaning may take photos upon completion of the clean for quality assurance and internal records. These photos will not be shared publicly without your consent.

8. PETS & HAZARDS
Please inform us of any pets, hazardous materials, or safety concerns prior to the clean. Failure to disclose may result in the clean being postponed.

9. SATISFACTION GUARANTEE
If you are not satisfied with the clean, please contact us within 24 hours and we will arrange a re-clean at no additional cost.

10. PRIVACY
Your personal information is collected solely for the purpose of providing cleaning services and will not be shared with third parties.

By accepting this quote, you agree to these terms and conditions.`;

interface TermsModalProps {
  open: boolean;
  onClose: () => void;
}

export function TermsModal({ open, onClose }: TermsModalProps) {
  const [terms, setTerms] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open) return;
    async function load() {
      setLoading(true);
      const { data } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'terms_and_conditions')
        .maybeSingle();
      setTerms(data?.value || DEFAULT_TERMS);
      setLoading(false);
    }
    load();
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Terms & Conditions</DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-[#0C463D]" />
          </div>
        ) : (
          <div className="whitespace-pre-wrap text-sm text-gray-700 leading-relaxed">
            {terms}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export { DEFAULT_TERMS };
