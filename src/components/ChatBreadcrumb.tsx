import React from 'react';

interface ChatBreadcrumbProps {
  developmentTitle: string;
}

export default function ChatBreadcrumb({ developmentTitle }: ChatBreadcrumbProps) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] font-bold tracking-widest text-burgundy opacity-60">FROM:</span>
      <span className="text-[10px] font-bold uppercase tracking-widest text-burgundy">{developmentTitle}</span>
    </div>
  );
}
