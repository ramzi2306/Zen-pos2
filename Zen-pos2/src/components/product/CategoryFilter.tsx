import React from 'react';

/**
 * CategoryFilter — horizontal scrollable pill tabs for filtering the menu.
 *
 * Always includes an "All" option first, followed by the dynamically loaded
 * categories from the API.  Active category is highlighted with
 * `bg-surface-container-highest text-primary`.
 *
 * @prop categories      - Full list of category names (include 'All' as first)
 * @prop activeCategory  - Currently selected category name
 * @prop onChange        - Called with the selected category name
 */
export const CategoryFilter = ({
  categories,
  activeCategory,
  onChange,
}: {
  categories: string[];
  activeCategory: string;
  onChange: (category: string) => void;
}) => (
  <div className="flex gap-2 bg-surface-container p-1 rounded-lg border border-outline-variant/10 overflow-x-auto no-scrollbar w-full md:w-auto">
    {categories.map(category => (
      <button
        key={category}
        onClick={() => onChange(category)}
        className={`whitespace-nowrap px-4 py-1.5 rounded text-[10px] font-headline font-bold uppercase tracking-micro transition-colors flex-shrink-0 ${
          activeCategory === category
            ? 'bg-surface-container-highest text-primary shadow-sm'
            : 'text-on-surface-variant hover:text-on-surface'
        }`}
      >
        {category}
      </button>
    ))}
  </div>
);
