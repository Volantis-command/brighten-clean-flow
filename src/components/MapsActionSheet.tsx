import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { MapPin, Navigation } from 'lucide-react';

interface MapsActionSheetProps {
  open: boolean;
  onClose: () => void;
  address: string;
}

export function MapsActionSheet({ open, onClose, address }: MapsActionSheetProps) {
  const encoded = encodeURIComponent(address);

  const openAppleMaps = () => {
    window.open(`maps://maps.apple.com/?daddr=${encoded}&dirflg=d`, '_blank');
    onClose();
  };

  const openGoogleMaps = () => {
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${encoded}&travelmode=driving`, '_blank');
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-sm rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <Navigation className="h-5 w-5 text-primary" />
            Navigate to Property
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-2">
          <Button
            onClick={openAppleMaps}
            className="w-full gap-2 h-14 rounded-2xl"
            variant="outline"
          >
            <MapPin className="h-5 w-5" />
            Open in Apple Maps
          </Button>
          <Button
            onClick={openGoogleMaps}
            className="w-full gap-2 h-14 rounded-2xl"
            variant="outline"
          >
            <MapPin className="h-5 w-5" />
            Open in Google Maps
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
