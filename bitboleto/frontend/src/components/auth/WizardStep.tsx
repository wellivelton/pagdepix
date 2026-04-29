import type { ReactNode } from 'react';

interface WizardStepProps {
  children: ReactNode;
  className?: string;
}

export default function WizardStep({ children, className = '' }: WizardStepProps) {
  return (
    <div
      className={`animate-fade-in min-h-0 flex flex-col ${className}`}
      style={{ animationDuration: '0.25s' }}
    >
      {children}
    </div>
  );
}
