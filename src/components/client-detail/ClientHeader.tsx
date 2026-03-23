import { Button } from '@/components/ui/button';
import { ArrowLeft, Mail, Phone, Pencil, CalendarPlus } from 'lucide-react';

interface ClientHeaderProps {
  name: string;
  email?: string | null;
  phone?: string | null;
  onBack: () => void;
  onEdit: () => void;
  onScheduleClean?: () => void;
  onViewPortal?: () => void;
  onCopyLink?: () => void;
  portalLink?: string | null;
}

export default function ClientHeader({ name, email, phone, onBack, onEdit, onScheduleClean }: ClientHeaderProps) {
  return (
    <>
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5">
          <ArrowLeft className="w-4 h-4" /> Back
        </Button>
      </div>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-primary">{name || 'Client'}</h1>
          <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
            {email && <span className="flex items-center gap-1"><Mail className="w-3.5 h-3.5" />{email}</span>}
            {phone && <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" />{phone}</span>}
          </div>
        </div>
        <div className="flex gap-2">
          {onScheduleClean && (
            <Button size="sm" onClick={onScheduleClean}>
              <CalendarPlus className="w-4 h-4 mr-1" /> Schedule a Clean
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onEdit}>
            <Pencil className="w-4 h-4 mr-1" /> Edit
          </Button>
        </div>
      </div>
    </>
  );
}
