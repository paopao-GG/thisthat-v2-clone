import React from 'react';
import leftLogo from '@/assets/logo/left.png';
import middleLogo from '@/assets/logo/middle.png';
import rightLogo from '@/assets/logo/right.png';
import '@/styles/shared/style.css';

interface LogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  isTransitioning?: boolean;
}

const Logo: React.FC<LogoProps> = ({ className = '', size = 'md', isTransitioning = false }) => {
  // Logo should be visible immediately when transitioning (comes from loading page)
  // or immediately when not transitioning
//  const [isVisible, setIsVisible] = useState(true);
  
  const sizeClasses = {
    sm: 'logo-sm',
    md: 'logo-md',
    lg: 'logo-lg'
  };

  return (
    <div 
      className={`logo-container ${sizeClasses[size]} ${className} ${isTransitioning ? 'logo-transitioning logo-immediately-visible' : 'logo-visible'}`}
    >
      <div className="logo-pieces">
        <div className="logo-piece logo-left">
          <div className="logo-glow logo-glow-left"></div>
          <img src={leftLogo} alt="Logo Left" className="logo-image" />
        </div>
        <div className="logo-piece logo-middle">
          <div className="logo-glow logo-glow-middle"></div>
          <img src={middleLogo} alt="Logo Middle" className="logo-image" />
        </div>
        <div className="logo-piece logo-right">
          <div className="logo-glow logo-glow-right"></div>
          <img src={rightLogo} alt="Logo Right" className="logo-image" />
        </div>
      </div>
    </div>
  );
};

export default Logo;
