import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { CheckCircle2, MapPin } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

export default function JobCompleteDonePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { jobId } = useParams();
  const nextJob = (location.state as any)?.nextJob;

  function openMaps(address: string, provider: 'apple' | 'google') {
    const encoded = encodeURIComponent(address);
    if (provider === 'apple') {
      window.open(`https://maps.apple.com/?q=${encoded}`, '_blank');
    } else {
      window.open(`https://www.google.com/maps/search/?api=1&query=${encoded}`, '_blank');
    }
  }

  if (nextJob) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 max-w-lg mx-auto">
        <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mb-4">
          <CheckCircle2 className="h-10 w-10 text-green-600" />
        </div>
        <h1 className="text-2xl font-extrabold text-foreground mb-1">Job Complete</h1>
        <p className="text-sm text-muted-foreground mb-6">Great work! Your next job is ready.</p>

        <Card className="w-full border-border mb-6">
          <CardContent className="p-5 space-y-2">
            <p className="font-bold text-foreground text-lg">{nextJob.name}</p>
            {nextJob.address && (
              <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                <MapPin className="h-4 w-4 shrink-0" /> {nextJob.address}
              </p>
            )}
            {nextJob.time && (
              <p className="text-sm text-muted-foreground">Scheduled: {nextJob.time}</p>
            )}
          </CardContent>
        </Card>

        <div className="w-full space-y-3">
          <Button
            size="lg"
            className="w-full h-14 rounded-2xl font-extrabold text-base gap-2"
            onClick={() => nextJob.address && openMaps(nextJob.address, 'apple')}
          >
            Navigate with Apple Maps
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="w-full h-14 rounded-2xl font-extrabold text-base gap-2"
            onClick={() => nextJob.address && openMaps(nextJob.address, 'google')}
          >
            Navigate with Google Maps
          </Button>
          <button
            onClick={() => navigate(`/clean/${nextJob.id}`)}
            className="w-full text-center text-sm text-primary font-bold py-3"
          >
            Skip navigation — go to job
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 max-w-lg mx-auto">
      <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mb-6">
        <CheckCircle2 className="h-12 w-12 text-green-600" />
      </div>
      <h1 className="text-3xl font-extrabold text-foreground mb-2">All Done for Today!</h1>
      <p className="text-muted-foreground text-center mb-8">Great work. Your timesheet has been updated.</p>
      <Button
        size="lg"
        className="w-full h-16 rounded-2xl font-extrabold text-lg"
        onClick={() => navigate('/dashboard')}
      >
        Back to Dashboard
      </Button>
    </div>
  );
}
