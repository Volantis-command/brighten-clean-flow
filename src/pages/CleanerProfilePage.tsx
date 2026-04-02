import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { LogOut, Phone, Mail, Star } from 'lucide-react';

export default function CleanerProfilePage() {
  const { profile, signOut } = useAuth();

  const { data: avgRating } = useQuery({
    queryKey: ['cleaner-avg-rating', profile?.id],
    enabled: !!profile?.id,
    queryFn: async () => {
      // Get jobs where this cleaner was assigned
      const { data: jobs } = await supabase
        .from('jobs')
        .select('feedback_score')
        .or(`cleaner_1_id.eq.${profile!.id},cleaner_2_id.eq.${profile!.id}`)
        .not('feedback_score', 'is', null);

      if (!jobs?.length) return null;
      const scores = jobs.map(j => j.feedback_score!).filter(s => s > 0);
      if (!scores.length) return null;
      return (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1);
    },
  });

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
