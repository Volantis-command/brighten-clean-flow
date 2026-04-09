import { Avatar, AvatarFallback } from '@/components/ui/avatar';

interface CleanerProfileChipProps {
  name: string;
  avatarUrl?: string | null;
}

export default function CleanerProfileChip({ name, avatarUrl }: CleanerProfileChipProps) {
  const initials = name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="flex items-center gap-2">
      <Avatar className="w-6 h-6">
        {avatarUrl && <img src={avatarUrl} alt={name} className="w-full h-full object-cover rounded-full" />}
        <AvatarFallback className="text-[10px] bg-primary/10 text-primary font-bold">{initials}</AvatarFallback>
      </Avatar>
      <span className="text-sm font-medium text-foreground">{name}</span>
    </div>
  );
}
