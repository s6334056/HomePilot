import React, { useEffect, useRef, useState } from 'react';

export interface ContextActionMenuItem {
  label: string;
  disabled?: boolean;
  onClick: () => void;
}

interface ContextActionMenuProps {
  isOpen: boolean;
  items: ContextActionMenuItem[];
  onClose: () => void;
  triggerRect: DOMRect | null;
}

export const ContextActionMenu: React.FC<ContextActionMenuProps> = ({
  isOpen,
  items,
  onClose,
  triggerRect,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  useEffect(() => {
    if (!isOpen || !triggerRect || !menuRef.current) return;

    const menu = menuRef.current;
    const menuRect = menu.getBoundingClientRect();
    const gap = 4;

    let top = triggerRect.bottom + gap;
    let left = triggerRect.left;

    // Clamp to viewport edges
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Right edge
    if (left + menuRect.width > vw - 8) {
      left = vw - menuRect.width - 8;
    }
    // Left edge
    if (left < 8) {
      left = 8;
    }
    // Bottom edge — flip above if no room below
    if (top + menuRect.height > vh - 8) {
      top = triggerRect.top - menuRect.height - gap;
    }
    // Top edge fallback
    if (top < 8) {
      top = 8;
    }

    setPos({ top, left });
  }, [isOpen, triggerRect]);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !triggerRect) return null;

  return (
    <div
      className="hp-context-menu"
      ref={menuRef}
      style={{ top: pos.top, left: pos.left }}
    >
      {items.map((item, idx) => (
        <button
          key={idx}
          className={`hp-context-menu-item ${item.disabled ? 'hp-context-menu-item--disabled' : ''}`}
          disabled={item.disabled}
          onClick={() => {
            if (!item.disabled) {
              item.onClick();
              onClose();
            }
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
};
