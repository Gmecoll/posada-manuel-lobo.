import Image from 'next/image';
import { cn } from '@/lib/utils';

export function Logo({ className }: { className?: string }) {
  return (
    <div className={cn("relative h-14 w-28", className)}>
      <Image
        src="https://storage.googleapis.com/gweb-aip-dev.appspot.com/public/project_clx1l5sp80003s6s9rcr2r22t/logo_clxtar7830001s6s9mdnm0xvy.png"
        alt="Posada Manuel Lobo Logo"
        fill
        className="object-contain"
        priority
      />
    </div>
  );
}
