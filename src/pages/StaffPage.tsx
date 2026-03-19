import AdminTimeView from '@/components/timeclock/AdminTimeView';

export default function StaffPage() {
  return (
    <div className="space-y-8">
      <h1 className="text-2xl md:text-3xl font-extrabold text-primary">Staff</h1>

      <div className="bg-card rounded-2xl shadow-md p-6">
        <p className="text-muted-foreground">Staff management coming soon.</p>
      </div>

      <AdminTimeView />
    </div>
  );
}
