import { useState } from 'react';
import { format, startOfWeek, addDays, isSameDay, isToday, isPast } from 'date-fns';
import { cn } from '@/lib/utils';

interface WeekCalendarProps {
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
}

export function WeekCalendar({ selectedDate, onSelectDate }: WeekCalendarProps) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  return (
    <div className="bg-card rounded-2xl shadow-md p-4">
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => setWeekStart(addDays(weekStart, -7))}
          className="h-10 w-10 rounded-xl flex items-center justify-center hover:bg-muted transition-colors font-bold text-muted-foreground"
        >
          ←
        </button>
        <span className="text-sm font-bold text-foreground">
          {format(days[0], 'MMM d')} – {format(days[6], 'MMM d, yyyy')}
        </span>
        <button
          onClick={() => setWeekStart(addDays(weekStart, 7))}
          className="h-10 w-10 rounded-xl flex items-center justify-center hover:bg-muted transition-colors font-bold text-muted-foreground"
        >
          →
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {days.map((day) => {
          const selected = isSameDay(day, selectedDate);
          const today = isToday(day);
          return (
            <button
              key={day.toISOString()}
              onClick={() => onSelectDate(day)}
              className={cn(
                'flex flex-col items-center py-2.5 px-1 rounded-xl transition-colors min-h-[60px] justify-center',
                selected ? 'bg-primary text-primary-foreground' : today ? 'bg-accent text-accent-foreground' : 'hover:bg-muted'
              )}
            >
              <span className="text-[10px] font-bold uppercase">{format(day, 'EEE')}</span>
              <span className="text-lg font-extrabold">{format(day, 'd')}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
