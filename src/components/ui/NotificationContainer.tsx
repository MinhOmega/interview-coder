import React from 'react';

interface Notification {
  id: string;
  type: string;
  message: string;
}

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
          className={`notification ${notification.type} visible`}
        >
          {notification.message}
        </div>
      ))}
    </div>
  );
}; 