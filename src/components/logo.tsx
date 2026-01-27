import { Grape } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Logo({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2 text-primary", className)}>
      <Grape className="h-6 w-6" />
      <span className="text-lg font-bold font-headline text-foreground">
        Posada Manuel Lobo
      </span>
    </div>
  );
}
