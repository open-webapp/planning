import React, { useState, useRef, useEffect } from 'react';

export interface AutocompleteCellProps {
  value: string;
  options: string[];
  onCommit: (value: string) => void;
  placeholder?: string;
  wrapperStyle?: React.CSSProperties;
  inputStyle?: React.CSSProperties;
  inputHoverStyle?: React.CSSProperties;
  inputFocusStyle?: React.CSSProperties;
  onStopClick?: (e: React.MouseEvent) => void;
}

interface MenuPos {
  top: number;
  left: number;
  width: number;
}

const AutocompleteCell: React.FC<AutocompleteCellProps> = ({
  value,
  options = [],
  onCommit,
  placeholder = '',
  wrapperStyle,
  inputStyle,
  inputHoverStyle,
  inputFocusStyle,
  onStopClick,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const [menuPos, setMenuPos] = useState<MenuPos | null>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const scrollListenerRef = useRef<(() => void) | null>(null);

  // Compute display query
  const displayQuery = editing ? query : value;

  // Filtering logic
  const trimmedQuery = displayQuery.trim();
  const queryLower = trimmedQuery.toLowerCase();
  const filtered = (
    queryLower
      ? options.filter((o) => o.toLowerCase().includes(queryLower))
      : options
  ).slice(0, 8);
  const exactMatch = options.some(
    (o) => o.toLowerCase() === queryLower
  );
  const showAddNew = open && !!trimmedQuery && !exactMatch;
  const showEmpty = open && filtered.length === 0 && !showAddNew;

  // Update menu position
  const updateMenuPos = () => {
    const el = inputRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setMenuPos({
      top: r.bottom + 2,
      left: r.left,
      width: Math.max(r.width, 160),
    });
  };

  // Open menu with position update
  const openMenu = () => {
    updateMenuPos();
    requestAnimationFrame(() => updateMenuPos());
  };

  // Commit value
  const commit = (val: string) => {
    const trimmed = (val || '').trim();
    setEditing(false);
    setOpen(false);
    setHighlight(-1);
    if (trimmed) {
      onCommit(trimmed);
    }
  };

  // Setup scroll/resize listeners
  useEffect(() => {
    const handleScroll = () => {
      if (open) updateMenuPos();
    };
    scrollListenerRef.current = handleScroll;
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleScroll);
    return () => {
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleScroll);
    };
  }, [open]);

  // Event handlers
  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.select();
    setEditing(true);
    setQuery(value);
    setOpen(true);
    setHighlight(-1);
    setIsFocused(true);
    openMenu();
  };

  const handleBlur = () => {
    setIsFocused(false);
    if (editing) {
      commit(query);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    setOpen(true);
    setHighlight(-1);
    setEditing(true);
    openMenu();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit(query);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setEditing(false);
      setOpen(false);
      setQuery(value);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((prev) => Math.min((prev ?? -1) + 1, filtered.length - 1));
      setOpen(true);
      setEditing(true);
      if (!editing) {
        setQuery(value);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((prev) => Math.max((prev ?? -1) - 1, 0));
    }
  };

  const handleStopClick = (e: React.MouseEvent) => {
    if (onStopClick) {
      onStopClick(e);
    }
  };

  const handleMenuItemClick = (item: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    commit(item);
  };

  const handleAddNewClick = (e: React.MouseEvent) => {
    e.preventDefault();
    commit(trimmedQuery);
  };

  // Compute merged input styles
  const mergedInputStyle = {
    width: '100%',
    fontSize: '0.8125rem',
    outline: 'none',
    ...(inputStyle && typeof inputStyle === 'object' ? inputStyle : {}),
  } as React.CSSProperties;

  if (isHovered && inputHoverStyle) {
    Object.assign(mergedInputStyle, inputHoverStyle);
  }

  if (isFocused && inputFocusStyle) {
    Object.assign(mergedInputStyle, inputFocusStyle);
  }

  // Menu style
  const menuStyle: React.CSSProperties = menuPos
    ? {
        position: 'fixed',
        top: `${menuPos.top}px`,
        left: `${menuPos.left}px`,
        width: `${menuPos.width}px`,
        background: '#fff',
        border: '1px solid var(--ns-border)',
        borderRadius: 'var(--ns-r-md)',
        boxShadow: 'var(--ns-shadow-2)',
        zIndex: 9999,
        maxHeight: '220px',
        overflow: 'auto',
      }
    : { display: 'none' };

  const menuVisible = open && !!menuPos;

  return (
    <div
      style={{
        position: 'relative',
        ...wrapperStyle,
      }}
      onClick={handleStopClick}
    >
      <input
        ref={inputRef}
        value={displayQuery}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        placeholder={placeholder}
        autoComplete="off"
        style={mergedInputStyle}
      />
      {menuVisible && (
        <div style={menuStyle}>
          {filtered.map((item, i) => (
            <div
              key={i}
              onMouseDown={handleMenuItemClick(item)}
              style={{
                padding: '7px 12px',
                fontSize: '0.8125rem',
                cursor: 'pointer',
                color: 'var(--ns-fg-1)',
                whiteSpace: 'nowrap',
                ...(i === highlight
                  ? { background: 'var(--ns-ink-050)' }
                  : {}),
              }}
            >
              {item}
            </div>
          ))}
          {showAddNew && (
            <div
              onMouseDown={handleAddNewClick}
              style={{
                padding: '7px 12px',
                fontSize: '0.8125rem',
                cursor: 'pointer',
                color: 'var(--ns-netskope-blue)',
                borderTop: '1px solid var(--ns-divider)',
                whiteSpace: 'nowrap',
              }}
            >
              Add “{trimmedQuery}”
            </div>
          )}
          {showEmpty && (
            <div
              style={{
                padding: '7px 12px',
                fontSize: '0.8125rem',
                color: 'var(--ns-fg-3)',
              }}
            >
              No matches
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AutocompleteCell;
