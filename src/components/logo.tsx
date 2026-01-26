import { Hotel } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Logo({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2 text-primary", className)}>
      <Hotel className="h-6 w-6" />
      <span className="text-xl font-bold font-headline text-foreground">
        Hotel Hub
      </span>
    </div>
  );
}
