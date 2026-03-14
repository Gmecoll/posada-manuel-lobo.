"use client";

import React from 'react';
import * as Icons from 'lucide-react';

interface DynamicIconProps extends React.SVGProps<SVGSVGElement> {
  name: string;
  size?: number | string;
  color?: string;
}

export const DynamicIcon = ({ name, ...props }: DynamicIconProps) => {
  // @ts-ignore - Forzamos la lectura dinámica para que el build pase
  const IconComponent = Icons[name as keyof typeof Icons];

  if (!IconComponent) {
    return null;
  }

  // @ts-ignore - Evitamos el error de "construct or call signatures"
  return <IconComponent {...props} />;
};

export default DynamicIcon;