import React from 'react';

export function LoadingSpinner({ size = 'md', text = '' }) {
  return (
    <div className={`loading-spinner loading-spinner-${size}`}>
      <div className="spinner">
        <div className="spinner-ring"></div>
        <div className="spinner-ring"></div>
        <div className="spinner-ring"></div>
      </div>
      {text && <div className="loading-text">{text}</div>}
    </div>
  );
}
