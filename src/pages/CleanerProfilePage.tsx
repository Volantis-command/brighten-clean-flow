import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { LogOut, Phone, Mail } from 'lucide-react';

export default function CleanerProfilePage() {
  const { profile, signOut } = useAuth();

  return (
    <div className="space-y-6 max-w-lg mx-auto">
      <h1 className="text-2xl font-extrabold text-primary">My Profile</h1>

      <div className="bg-card rounded-2xl shadow-md p-6 space-y-4">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold text-2xl">
            {(profile?.full_name || '?')[0].toUpperCase()}
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground">{profile?.full_name || 'Cleaner'}</h2>
            <span className="inline-block text-xs font-bold bg-secondary text-secondary-foreground px-3 py-1 rounded-full mt-1">
              Cleaner
            </span>
          </div>
        </div>

        {profile?.email && (
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <Mail className="h-4 w-4" />
            <span>{profile.email}</span>
          </div>
        )}
        {(profile as any)?.phone && (
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <Phone className="h-4 w-4" />
            <span>{(profile as any).phone}</span>
          </div>
        )}
      </div>

      <div className="bg-card rounded-2xl shadow-md p-6 space-y-3">
        <h3 className="font-bold text-foreground">Need Help?</h3>
        <p className="text-sm text-muted-foreground">
          Contact your manager if you have questions about jobs, schedules, or need to report an issue.
        </p>
      </div>

      <Button
        variant="outline"
        size="lg"
        onClick={signOut}
        className="w-full gap-2 h-14 text-base font-bold rounded-2xl"
      >
        <LogOut className="h-5 w-5" />
        Sign Out
      </Button>
    </div>
  );
}
