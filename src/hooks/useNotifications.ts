import { useState, useRef } from "react";

export interface Notification {
  id: string;
  type: string;
  message: string;
}

export const useNotifications = () => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const notificationTimeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // Function to add a notification with automatic removal
  const addNotification = (message: string, type: string = "success") => {
    const id = Date.now().toString();
    setNotifications((prev) => [...prev, { id, message, type }]);

    // Set timeout to remove notification after 5 seconds
    const timeout = setTimeout(() => {
      setNotifications((prev) => prev.filter((notification) => notification.id !== id));
      notificationTimeoutsRef.current.delete(id);
    }, 5000);

    notificationTimeoutsRef.current.set(id, timeout);
  };

  const clearAllNotifications = () => {
    setNotifications([]);
    notificationTimeoutsRef.current.forEach((timeout) => {
      clearTimeout(timeout);
    });
    notificationTimeoutsRef.current.clear();
  };

  // Cleanup function to clear any remaining notification timeouts
  const cleanupNotifications = () => {
    notificationTimeoutsRef.current.forEach((timeout) => {
      clearTimeout(timeout);
    });
  };

  return {
    notifications,
    addNotification,
    clearAllNotifications,
    cleanupNotifications
  };
}; 