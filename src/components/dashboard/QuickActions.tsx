import { Plus, Eye } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export function QuickActions() {
  const navigate = useNavigate();

  return (
    <div>
      <h2 className="text-xl font-bold text-primary mb-4">Quick Actions</h2>
      <div className="flex flex-wrap gap-3">
        <Button variant="accent" size="lg" onClick={() => navigate('/schedule')} className="gap-2">
          <Plus className="h-5 w-5" />
          Add Job
        </Button>
        <Button variant="accent" size="lg" onClick={() => navigate('/properties')} className="gap-2">
          <Plus className="h-5 w-5" />
          Add Property
        </Button>
        <Button variant="outline" size="lg" onClick={() => navigate('/schedule')} className="gap-2">
          <Eye className="h-5 w-5" />
          View All Jobs
        </Button>
      </div>
    </div>
  );
}
