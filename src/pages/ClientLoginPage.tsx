import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function ClientLoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { error, role } = await signIn(email, password);
    if (error) {
      setError(error.message);
    } else {
      navigate(role === 'client' ? '/portal' : '/dashboard', { replace: true });
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#FDFDFC] px-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-10">
          <h1 className="text-5xl font-extrabold text-primary tracking-tight" style={{ fontFamily: 'Nunito, sans-serif' }}>
            Brightly<span className="text-accent">.</span>
          </h1>
          <p className="text-muted-foreground text-sm mt-2 font-semibold">Client Portal</p>
        </div>

        <div className="bg-white rounded-2xl shadow-lg border border-border/50 p-8">
          <h2 className="text-xl font-bold text-primary text-center mb-6">Welcome back</h2>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-foreground font-semibold">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="h-14 rounded-2xl text-base"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-foreground font-semibold">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="h-14 rounded-2xl text-base"
              />
            </div>
            {error && <p className="text-destructive text-sm font-semibold text-center">{error}</p>}
            <Button type="submit" className="w-full h-14 rounded-2xl text-base font-bold bg-primary text-primary-foreground hover:bg-primary/90" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign In'}
            </Button>
          </form>
        </div>

        <p className="text-center text-muted-foreground text-xs mt-6">
          Powered by Brightly — Turnover Cleaning Operations
        </p>
      </div>
    </div>
  );
}
