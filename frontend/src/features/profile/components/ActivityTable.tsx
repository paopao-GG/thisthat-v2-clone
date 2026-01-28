import React, { useEffect, useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { type UserPosition } from '@shared/services';
import '@/styles/profile/style.css';

interface ActivityTableProps {
  positions: UserPosition[];
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onPositionClick: (position: UserPosition) => void;
}

const ITEMS_PER_PAGE = 10;

const ActivityTable: React.FC<ActivityTableProps> = ({
  positions,
  searchQuery,
  onSearchChange,
  onPositionClick
}) => {
  const [currentPage, setCurrentPage] = useState(1);

  const filteredPositions = useMemo(() => {
    const filtered = positions.filter((position) => {
      if (position.status === 'open') return false;

      if (!searchQuery || searchQuery.trim() === '') return true;

      const query = searchQuery.toLowerCase().trim();
      const marketTitle = (position.marketTitle || '').toLowerCase();
      const side = (position.side || '').toLowerCase();

      return marketTitle.includes(query) || side.includes(query);
    });

    return filtered.sort((a, b) => {
      const dateA = a.updatedAt || a.createdAt || '';
      const dateB = b.updatedAt || b.createdAt || '';
      return new Date(dateB).getTime() - new Date(dateA).getTime();
    });
  }, [positions, searchQuery]);

  useEffect(() => {
    queueMicrotask(() => {
      setCurrentPage(1);
    });
  }, [searchQuery]);

  // Calculate pagination
  const totalPages = Math.ceil(filteredPositions.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedPositions = filteredPositions.slice(startIndex, endIndex);

  // Generate page numbers to display
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const maxVisible = 5;
    
    if (totalPages <= maxVisible) {
      // Show all pages if total is less than max visible
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Always show first page
      pages.push(1);
      
      if (currentPage <= 3) {
        // Near the start
        for (let i = 2; i <= 4; i++) {
          pages.push(i);
        }
        pages.push('ellipsis');
        pages.push(totalPages);
      } else if (currentPage >= totalPages - 2) {
        // Near the end
        pages.push('ellipsis');
        for (let i = totalPages - 3; i <= totalPages; i++) {
          pages.push(i);
        }
      } else {
        // In the middle
        pages.push('ellipsis');
        for (let i = currentPage - 1; i <= currentPage + 1; i++) {
          pages.push(i);
        }
        pages.push('ellipsis');
        pages.push(totalPages);
      }
    }
    
    return pages;
  };

  return (
    <>
      <div className="mb-3 sm:mb-4 md:mb-5">
        <input
          type="text"
          placeholder="Search activity"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full px-3 sm:px-4 md:px-5 py-2 sm:py-2.5 md:py-3 text-xs sm:text-sm md:text-base rounded-md transition-all focus:outline-none positions-search-input"
        />
      </div>

      {/* Activity List */}
      <div className="overflow-x-auto -mx-4 px-4 positions-table-container">
        <div className="min-w-[600px]">
          {/* Table Header */}
          <div className="flex items-center py-2.5 sm:py-3 md:py-3.5 text-xs sm:text-sm md:text-base font-semibold uppercase tracking-wide positions-table-header sticky top-0 z-10">
            <div className="flex-1 min-w-[300px] pl-3 sm:pl-4 md:pl-5">MARKET</div>
            <div className="w-20 sm:w-24 md:w-28 text-right flex-shrink-0 pr-3 sm:pr-4 md:pr-5">SIDE</div>
            <div className="w-20 sm:w-24 md:w-28 text-right flex-shrink-0 pr-3 sm:pr-4 md:pr-5">AMOUNT</div>
            <div className="w-28 sm:w-32 md:w-36 text-right flex-shrink-0 pr-3 sm:pr-4 md:pr-5">RESULT</div>
          </div>

          {/* Table Rows */}
          <div>
            <div className="flex flex-col">
              {filteredPositions.length === 0 ? (
                <div className="text-center py-8 sm:py-10 md:py-12 text-[#f5f5f5]/50 text-sm sm:text-base">
                  {searchQuery ? 'No activity found' : 'No previous activity'}
                </div>
              ) : (
                paginatedPositions.map((position) => (
                  <div 
                    key={position.id} 
                    className="flex items-start py-3 sm:py-3.5 md:py-4 transition-all group positions-table-row cursor-pointer hover:bg-[#1a1a1a]/30"
                    onClick={() => onPositionClick(position)}
                  >
                    <div className="flex-1 min-w-[300px] pl-3 sm:pl-4 md:pl-5">
                      <div className="flex items-start gap-2 sm:gap-3 md:gap-4">
                        <div className="w-10 h-10 sm:w-11 sm:h-11 md:w-12 md:h-12 rounded flex-shrink-0 positions-placeholder-avatar"></div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs sm:text-sm md:text-base font-medium text-[#f5f5f5] m-0 mb-1">
                            {position.marketTitle}
                          </p>
                          <div className="flex items-center gap-1.5 sm:gap-2 md:gap-2.5">
                            <span 
                              className={`text-xs sm:text-sm px-2 sm:px-2.5 md:px-3 py-0.5 sm:py-1 rounded ${
                                position.status === 'open' 
                                  ? 'bg-blue-500/20 text-blue-400'
                                  : position.status === 'resolved'
                                  ? position.pnl > 0 
                                    ? 'bg-green-500/20 text-green-400' 
                                    : 'bg-red-500/20 text-red-400'
                                  : 'bg-gray-500/20 text-gray-400'
                              }`}
                            >
                              {position.status === 'open' ? 'Active' : position.status === 'resolved' ? position.pnl > 0 ? 'Won' : 'Lost' : 'Closed'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="w-20 sm:w-24 md:w-28 text-right text-xs sm:text-sm md:text-base flex-shrink-0 pr-3 sm:pr-4 md:pr-5">
                      <span 
                        className={`font-medium ${
                          position.side === 'this'
                            ? 'positions-prediction-yes positions-prediction-this'
                            : 'positions-prediction-no positions-prediction-that'
                        }`}
                      >
                        {position.side.toUpperCase()}
                      </span>
                    </div>
                    <div className="w-20 sm:w-24 md:w-28 text-right text-xs sm:text-sm md:text-base text-[#f5f5f5] flex-shrink-0 pr-3 sm:pr-4 md:pr-5">
                      {(position.value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} credits
                    </div>
                    <div className="w-28 sm:w-32 md:w-36 text-right flex-shrink-0 pr-3 sm:pr-4 md:pr-5">
                      <div 
                        className="text-xs sm:text-sm md:text-base font-semibold"
                        style={{
                          color: Number(position.pnl) > 0 ? '#4ade80' : Number(position.pnl) < 0 ? '#f87171' : '#f5f5f5'
                        }}
                      >
                        {Number(position.pnl) > 0 ? '+' : ''}{Number(position.pnl || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} credits
                      </div>
                      <div 
                        className="text-xs sm:text-sm mt-1"
                        style={{
                          color: Number(position.pnl) > 0 ? '#4ade80' : Number(position.pnl) < 0 ? '#f87171' : '#f5f5f5'
                        }}
                      >
                        ({Number(position.pnlPercent) > 0 ? '+' : ''}{Number(position.pnlPercent || 0).toFixed(1)}%)
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

          </div>
        </div>
      </div>

      {/* Pagination */}
      {filteredPositions.length > ITEMS_PER_PAGE && (
        <div className="flex items-center justify-center gap-2 sm:gap-3 mt-4 sm:mt-5 md:mt-6">
          {/* Previous Button */}
          <button
            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
            disabled={currentPage === 1}
            className={`flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-lg transition-all duration-200 ${
              currentPage === 1
                ? 'opacity-40 cursor-not-allowed'
                : 'hover:bg-white/5 active:scale-95'
            }`}
            style={{
              background: currentPage === 1 
                ? 'rgba(255, 255, 255, 0.05)' 
                : 'transparent',
              border: '1px solid rgba(255, 255, 255, 0.1)',
            }}
          >
            <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5 text-[#f5f5f5]" />
          </button>

          {/* Page Numbers */}
          <div className="flex items-center gap-1 sm:gap-1.5">
            {getPageNumbers().map((page, index) => {
              if (page === 'ellipsis') {
                return (
                  <span
                    key={`ellipsis-${index}`}
                    className="px-2 sm:px-3 text-[#f5f5f5]/40 text-sm sm:text-base"
                  >
                    ...
                  </span>
                );
              }

              const pageNum = page as number;
              const isActive = pageNum === currentPage;

              return (
                <button
                  key={pageNum}
                  onClick={() => setCurrentPage(pageNum)}
                  className={`min-w-[32px] sm:min-w-[36px] h-8 sm:h-9 px-2 sm:px-3 text-xs sm:text-sm font-medium rounded-lg transition-all duration-200 ${
                    isActive
                      ? 'text-white scale-105'
                      : 'text-[#f5f5f5]/60 hover:text-[#f5f5f5] hover:bg-white/5 active:scale-95'
                  }`}
                  style={
                    isActive
                      ? {
                          background: 'rgba(74, 144, 184, 0.15)',
                          border: '1px solid rgba(74, 144, 184, 0.4)',
                          backdropFilter: 'blur(8px)',
                        }
                      : {
                          background: 'transparent',
                          border: '1px solid transparent',
                        }
                  }
                >
                  {pageNum}
                </button>
              );
            })}
          </div>

          {/* Next Button */}
          <button
            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
            disabled={currentPage === totalPages}
            className={`flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-lg transition-all duration-200 ${
              currentPage === totalPages
                ? 'opacity-40 cursor-not-allowed'
                : 'hover:bg-white/5 active:scale-95'
            }`}
            style={{
              background: currentPage === totalPages 
                ? 'rgba(255, 255, 255, 0.05)' 
                : 'transparent',
              border: '1px solid rgba(255, 255, 255, 0.1)',
            }}
          >
            <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5 text-[#f5f5f5]" />
          </button>
        </div>
      )}

      {filteredPositions.length > 0 && (
        <div className="text-center mt-3 sm:mt-4 text-xs sm:text-sm text-[#f5f5f5]/50">
          Showing {startIndex + 1}-{Math.min(endIndex, filteredPositions.length)} of {filteredPositions.length} activit{filteredPositions.length !== 1 ? 'ies' : 'y'}
        </div>
      )}
    </>
  );
};

export default ActivityTable;

