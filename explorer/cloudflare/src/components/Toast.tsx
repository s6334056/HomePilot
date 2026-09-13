import { useEffect, useState } from 'react';

interface ToastProps {
  message: string;
  detail?: string;
  duration?: number;
  onDone: () => void;
}

export function Toast({ message, detail, duration = 3000, onDone }: ToastProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(onDone, 300);
    }, duration);
    return () => clearTimeout(timer);
  }, [duration, onDone]);

  return (
    <div className={`hp-toast ${visible ? 'hp-toast--visible' : 'hp-toast--hidden'}`}>
      <div className="hp-toast-message">{message}</div>
      {detail && <div className="hp-toast-detail">{detail}</div>}
    </div>
  );
}
