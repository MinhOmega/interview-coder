import React from 'react';
import { Notification } from '../../hooks/useNotifications';
import '../../styles/Notifications.css';

interface NotificationContainerProps {
  notifications: Notification[];
}

export const NotificationContainer: React.FC<NotificationContainerProps> = ({ 
  notifications 
}) => {
  return (
    <div className="notification-container">
      {notifications.map((notification) => (
        <div 
          key={notification.id} 
          className={`notification ${notification.type}`}
          role="alert"
        >
          <div className="notification-content">
            <div className="notification-icon">
              {notification.type === 'success' && '✓'}
              {notification.type === 'error' && '✕'}
              {notification.type === 'warning' && '⚠'}
              {notification.type === 'info' && 'ℹ'}
            </div>
            <div className="notification-message">
              {notification.message}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}; 