import Image from 'next/image';
import { cn } from '@/lib/utils';

export function Logo({ className }: { className?: string }) {
  return (
    <div className={cn("relative h-14 w-28", className)}>
      <Image
        src="https://lirp.cdn-website.com/0ec5f781/dms3rep/multi/opt/posadamanuellobo-removebg-preview-165w.png"
        alt="Posada Manuel Lobo Logo"
        fill
        className="object-contain"
        priority
      />
    </div>
  );
}
