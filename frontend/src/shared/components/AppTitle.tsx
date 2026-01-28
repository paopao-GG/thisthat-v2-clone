import React from 'react';

interface AppTitleProps {
  className?: string;
  showTagline?: boolean;
  tagline?: string;
}

const AppTitle: React.FC<AppTitleProps> = ({ 
  className = '', 
  showTagline = true,
  tagline = 'Swipe Decisions, Real Stakes'
}) => {
  return (
    <div className={`flex flex-col items-center justify-center ${className}`}>
      <div className="flex flex-col items-center text-center">
        {/* This */}
        <h1 
          className="text-8xl font-light text-white/90 tracking-tight mb-1 leading-none"
          style={{
            textShadow: '0 0 20px rgba(255, 255, 255, 0.1), 0 2px 4px rgba(0, 0, 0, 0.3)',
            background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.95) 0%, rgba(255, 255, 255, 0.85) 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text'
          }}
        >
          This
        </h1>
        
        {/* or */}
        {/* <p className="text-2xl md:text-3xl lg:text-5xl text-white/60 font-light">
          or
        </p> */}
        
        {/* That */}
        <h1 
          className="text-8xl font-light text-white/90 tracking-tight leading-none"
          style={{
            textShadow: '0 0 20px rgba(255, 255, 255, 0.1), 0 2px 4px rgba(0, 0, 0, 0.3)',
            background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.95) 0%, rgba(255, 255, 255, 0.85) 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text'
          }}
        >
          That
        </h1>
      </div>
      
      {showTagline && (
        <p className="text-base text-white/50 text-center font-light mt-4">
          {tagline}
        </p>
      )}
    </div>
  );
};

export default AppTitle;

