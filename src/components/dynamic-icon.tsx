"use client";
import React from 'react';
import * as Icons from 'lucide-react';
export const DynamicIcon = ({ name, ...props }: any) => {
  const IconComponent = (Icons as any)[name];
  if (!IconComponent) return null;
  return <IconComponent {...props} />;
};
export default DynamicIcon;