import React, { createContext, useContext, useState, useEffect } from 'react';
import { fetchCategories } from '@shared/services';

interface CategoryFilterContextType {
  categories: string[];
  selectedCategory: string;
  setSelectedCategory: (category: string) => void;
  loading: boolean;
  categoryCounts: Record<string, number>;
}

const CategoryFilterContext = createContext<CategoryFilterContextType | null>(null);

export const useCategoryFilter = () => {
  const context = useContext(CategoryFilterContext);
  if (!context) {
    throw new Error('useCategoryFilter must be used within CategoryFilterProvider');
  }
  return context;
};

// Minimum markets required for a category to be displayed
const MIN_MARKETS_THRESHOLD = 50;

export const CategoryFilterProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [categories, setCategories] = useState<string[]>(['All']);
  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  // Fetch categories from backend on mount
  useEffect(() => {
    async function loadCategories() {
      try {
        setLoading(true);
        const backendCategories = await fetchCategories();

        // Handle both old format (string[]) and new format ({ category: string, count: number }[])
        let categoryData: Array<{ category: string; count: number }> = [];

        if (Array.isArray(backendCategories) && backendCategories.length > 0) {
          const firstItem = backendCategories[0];

          if (typeof firstItem === 'string') {
            // Old format (strings only) - assume all have enough markets
            categoryData = (backendCategories as string[]).map(cat => ({ category: cat, count: 100 }));
          } else if (typeof firstItem === 'object' && firstItem !== null && 'category' in firstItem && 'count' in firstItem) {
            // New format with counts - already in correct format
            categoryData = backendCategories as unknown as Array<{ category: string; count: number }>;
          }
        }

        // Filter out categories with fewer than MIN_MARKETS_THRESHOLD markets
        const filteredCategories = categoryData.filter(({ count }) => count >= MIN_MARKETS_THRESHOLD);

        if (filteredCategories.length === 0) {
          console.warn('No categories with sufficient markets, using fallback');
          setCategories(['All', 'Crypto', 'Politics', 'Sports', 'Entertainment', 'Technology']);
          setCategoryCounts({});
          return;
        }

        // Build counts map
        const counts: Record<string, number> = {};
        filteredCategories.forEach(({ category, count }) => {
          counts[category.toLowerCase()] = count;
        });
        setCategoryCounts(counts);

        // Capitalize and format category names
        const capitalizedCategories = filteredCategories.map(({ category }) =>
          category
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ')
        );

        // Add "All" at the beginning
        const uniqueCategories = ['All', ...Array.from(new Set(capitalizedCategories))];
        setCategories(uniqueCategories);

        console.log(`Loaded ${uniqueCategories.length - 1} categories (min ${MIN_MARKETS_THRESHOLD} markets each)`);
      } catch (error) {
        console.error('Failed to fetch categories from backend:', error);
        // Fallback to default categories if backend fetch fails
        setCategories(['All', 'Crypto', 'Politics', 'Sports', 'Entertainment', 'Technology']);
        setCategoryCounts({});
      } finally {
        setLoading(false);
      }
    }

    loadCategories();
  }, []);

  return (
    <CategoryFilterContext.Provider value={{ categories, selectedCategory, setSelectedCategory, loading, categoryCounts }}>
      {children}
    </CategoryFilterContext.Provider>
  );
};

