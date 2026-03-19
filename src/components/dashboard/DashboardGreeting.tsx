import { useAuth } from '@/contexts/AuthContext';

export function DashboardGreeting() {
  const { profile } = useAuth();
  const firstName = profile?.full_name?.split(' ')[0] || 'there';

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <h1 className="text-2xl md:text-3xl font-extrabold text-primary">
      {greeting}, {firstName}. ✨
    </h1>
  );
}
