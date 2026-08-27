import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PanelEdgeToggleProps {
  side: 'left' | 'right';
  collapsed: boolean;
  onClick: () => void;
  expandLabel: string;
  collapseLabel: string;
}

/**
 * The tiny chevron tab on a collapsible panel's edge (Reckon-Bill prototype):
 * invisible until the panel is hovered, always visible while collapsed so the
 * panel can be brought back. Rendered OUTSIDE the panel's clipping box.
 */
const PanelEdgeToggle: React.FC<PanelEdgeToggleProps> = ({
  side,
  collapsed,
  onClick,
  expandLabel,
  collapseLabel,
}) => {
  const pointsRight = side === 'left' ? collapsed : !collapsed;
  const Icon = pointsRight ? ChevronRight : ChevronLeft;
  const label = collapsed ? expandLabel : collapseLabel;

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`absolute top-1/2 z-20 flex h-9 w-4 -translate-y-1/2 items-center justify-center border border-border bg-surface text-muted shadow-sm transition-[opacity,background-color,color] hover:bg-surface-muted hover:text-body focus-visible:opacity-100 cursor-pointer ${
        collapsed ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
      } ${side === 'left' ? '-right-4 rounded-r-md' : '-left-4 rounded-l-md'}`}
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
};

export default PanelEdgeToggle;
