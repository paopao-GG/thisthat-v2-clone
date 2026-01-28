import React from 'react';
import LoadingPage from './LoadingPage';

/**
 * AssetLoader - Wrapper for the loading page
 * LoadingPage now handles asset preloading internally and tracks it in the progress bar
 */
interface AssetLoaderProps {
  onComplete: () => void;
}

const AssetLoader: React.FC<AssetLoaderProps> = ({ onComplete }) => {
  // LoadingPage now handles asset loading internally
  // Progress bar reflects actual loading progress
  return <LoadingPage onComplete={onComplete} minDuration={3000} />;
};

export default AssetLoader;

