import React, { useState } from 'react';
import styles from './DownloadAndroidButton.module.css';

export default function DownloadAndroidButton() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleDownload = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/public/download/android-app');
      
      if (!response.ok) {
        throw new Error('Failed to download app');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'ascend-capital.apk';
      document.body.appendChild(link);
      link.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(link);
    } catch (err) {
      setError('Failed to download. Please try again.');
      console.error('Download error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.icon}>📱</div>
        <div>
          <h3 className={styles.title}>Download Mobile App</h3>
          <p className={styles.subtitle}>Trade on the go with Ascend Capital</p>
        </div>
      </div>

      <ul className={styles.features}>
        <li>Real-time trading updates</li>
        <li>Manage deposits & withdrawals</li>
        <li>Track daily profits</li>
        <li>Monitor referral rewards</li>
      </ul>

      <button 
        onClick={handleDownload}
        disabled={isLoading}
        className={styles.downloadBtn}
      >
        {isLoading ? (
          <>
            <span className={styles.spinner}></span>
            Downloading...
          </>
        ) : (
          <>
            📥 Download for Android
          </>
        )}
      </button>

      {error && (
        <div className={styles.error}>
          {error}
        </div>
      )}

      <div className={styles.requirements}>
        <strong>Requirements:</strong> Android 6.0 or higher
      </div>
    </div>
  );
}
