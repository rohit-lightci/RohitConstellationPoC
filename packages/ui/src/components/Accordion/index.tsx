import React, { useState } from 'react';

export interface AccordionItem {
  title: string;
  content: React.ReactNode;
}

export interface AccordionProps {
  items: AccordionItem[];
  defaultOpenIndices?: number[];
  className?: string;
}

export const Accordion: React.FC<AccordionProps> = ({ items, defaultOpenIndices = [], className = '' }) => {
  const [openIndices, setOpenIndices] = useState<number[]>(defaultOpenIndices);

  const toggleIndex = (idx: number) => {
    setOpenIndices((prev) =>
      prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx]
    );
  };

  return (
    <div className={`space-y-2 ${className}`}>
      {items.map((item, idx) => (
        <div key={idx} className="border rounded-lg bg-white">
          <button
            className="w-full flex justify-between items-center px-4 py-3 text-left font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
            onClick={() => toggleIndex(idx)}
            aria-expanded={openIndices.includes(idx)}
            type="button"
          >
            <span>{item.title}</span>
            <span className={`transform transition-transform ${openIndices.includes(idx) ? 'rotate-180' : ''}`}>▼</span>
          </button>
          <div
            className={`overflow-hidden transition-all duration-300 ${openIndices.includes(idx) ? 'max-h-96 p-4' : 'max-h-0 p-0'}`}
            aria-hidden={!openIndices.includes(idx)}
          >
            {openIndices.includes(idx) && item.content}
          </div>
        </div>
      ))}
    </div>
  );
}; 