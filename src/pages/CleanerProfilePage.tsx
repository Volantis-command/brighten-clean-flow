import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { LogOut, Phone, Mail, Star, TrendingUp, DollarSign, Calendar, ChevronRight, GraduationCap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function CleanerProfilePage() {
  const { profile, user, signOut } = useAuth();
  const navigate = useNavigate();

  const userId = user?.id;

  const { data: onboarding } = useQuery({
    queryKey: ['my-onboarding-status', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase
        .from('cleaner_onboarding')
        .select('onboarding_complete, director_approved')
        .eq('user_id', userId!)
        .maybeSingle();
      return data;
    },
  });

  const { data: avgRating } = useQuery({
    queryKey: ['cleaner-avg-rating', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data: jobs } = await supabase
        .from('jobs')
        .select('feedback_score')
        .or(`cleaner_1_id.eq.${userId},cleaner_2_id.eq.${userId}`)
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
            <div className="flex items-center gap-2 mt-1">
              <span className="inline-block text-xs font-bold bg-secondary text-secondary-foreground px-3 py-1 rounded-full">
                Cleaner
              </span>
              {avgRating && (
                <span className="inline-flex items-center gap-1 text-xs font-bold bg-[rgba(251,191,36,0.15)] text-[#FCD34D] px-3 py-1 rounded-full">
                  <Star className="h-3 w-3 fill-amber-500 text-amber-500" />
                  {avgRating} avg
                </span>
              )}
            </div>
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

      <div className="bg-card rounded-2xl shadow-md overflow-hidden">
        {[
          { label: 'My Brightly Score', icon: TrendingUp, path: '/my-score' },
          { label: 'My Pay Summary', icon: DollarSign, path: '/my-pay' },
          { label: 'My Availability', icon: Calendar, path: '/availability' },
        ].map((item) => (
          <button
            key={item.path}
            onClick={() => navigate(item.path)}
            className="w-full flex items-center justify-between px-5 py-4 border-b border-border last:border-b-0 hover:bg-muted/30 transition-colors"
          >
            <div className="flex items-center gap-3">
              <item.icon className="h-5 w-5 text-primary" />
              <span className="font-bold text-foreground text-sm">{item.label}</span>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </button>
        ))}
      </div>

      {onboarding?.onboarding_complete !== true && (
        <button
          onClick={() => navigate('/cleaner-onboarding')}
          className="w-full text-left bg-accent/15 border-2 border-accent rounded-2xl p-4 flex items-center gap-3 hover:bg-accent/25 transition-colors"
        >
          <GraduationCap className="h-6 w-6 text-accent-foreground" />
          <div className="flex-1">
            <p className="font-bold text-foreground text-sm">Complete your onboarding</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Required before you can be assigned solo jobs.
            </p>
          </div>
          <ChevronRight className="h-5 w-5 text-muted-foreground" />
        </button>
      )}

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
