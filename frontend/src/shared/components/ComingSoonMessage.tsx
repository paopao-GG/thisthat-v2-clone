import React from 'react';
import '@/styles/shared/style.css';

const ComingSoonMessage: React.FC = () => {
  return (
    <div className="coming-soon-page flex flex-col items-center justify-center min-h-screen w-full px-6">
      <div className="max-w-lg mx-auto text-center space-y-12">
        <div className="space-y-8">
          <h1 className="text-5xl md:text-6xl font-light tracking-tight text-white">
            Coming Soon
          </h1>
          
          <div className="space-y-6 pt-4">
            <p className="text-base md:text-lg font-light text-white/70 leading-relaxed max-w-md mx-auto">
              The desktop and tablet versions of this app are currently under development.
            </p>
            <p className="text-sm md:text-base font-light text-white/60 leading-relaxed max-w-md mx-auto">
              For now, this app is available on mobile devices only.
            </p>
          </div>
        </div>
        
        <div className="pt-8 border-t border-white/5">
          <p className="text-xs md:text-sm font-light text-white/50 tracking-widest uppercase">
            Please access this app from your mobile device to continue.
          </p>
        </div>
      </div>
    </div>
  );
};

export default ComingSoonMessage;

