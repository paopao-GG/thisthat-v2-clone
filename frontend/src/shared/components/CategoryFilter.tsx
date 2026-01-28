import React from 'react';
import { ChevronDown } from 'lucide-react';
import '@/styles/shared/style.css';

interface CategoryFilterProps {
  categories: string[];
  selectedCategory: string;
  onCategoryChange: (category: string) => void;
  className?: string;
}

const CategoryFilter: React.FC<CategoryFilterProps> = ({
  categories,
  selectedCategory,
  onCategoryChange,
  className = '',
}) => {
  return (
    <div className={`relative ${className}`}>
      <select
        id="category-select"
        value={selectedCategory}
        onChange={(e) => onCategoryChange(e.target.value)}
        className="w-full py-2.5 sm:py-3 md:py-3.5 px-3 sm:px-4 md:px-5 pr-9 sm:pr-10 md:pr-11 text-xs sm:text-sm md:text-base font-medium cursor-pointer appearance-none category-filter-select"
      >
        {categories.map((category) => (
          <option key={category} value={category} style={{ background: '#0a0a0a', color: '#f5f5f5' }}>
            {category === 'All' ? 'All Categories' : category}
          </option>
        ))}
      </select>
      <ChevronDown className="absolute right-3 sm:right-4 top-1/2 transform -translate-y-1/2 text-[#f5f5f5]/60 pointer-events-none w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6" />
    </div>
  );
};

export default CategoryFilter;

