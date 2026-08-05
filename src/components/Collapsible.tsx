import React, { useState } from 'react'
import { ChevronDown } from 'lucide-react'

interface CollapsibleProps {
  label: string
  defaultOpen?: boolean
  children: React.ReactNode
}

const Collapsible: React.FC<CollapsibleProps> = ({ label, defaultOpen = false, children }) => {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="border-b border-divider mb-2">
      <div
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-s2 py-2 px-3 cursor-pointer select-none"
      >
        <ChevronDown
          size={14}
          className="text-fg-2 transition-transform"
          style={{ transform: open ? 'rotate(0deg)' : 'rotate(-90deg)' }}
        />
        <span className="text-[0.8125rem] font-medium text-fg-1">{label}</span>
      </div>
      {open && <div className="px-3 pb-3">{children}</div>}
    </div>
  )
}

export default Collapsible
