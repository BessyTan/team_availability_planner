
import React, { useMemo, useCallback } from 'react';
import { TIME_SLOTS, DAYS_OF_WEEK } from '../constants';
import type { TimeSlot, Member } from '../types';

interface AvailabilityGridProps {
  mode: 'input' | 'display';
  selectedSlots?: TimeSlot[];
  onSlotClick?: (slot: TimeSlot) => void;
  members?: Member[];
}

const isSlotSelected = (slot: TimeSlot, selectedSlots: TimeSlot[]): boolean => {
  return selectedSlots.some(s => s.day === slot.day && s.time === slot.time);
};

const getColorForPercentage = (percentage: number): string => {
  if (percentage === 0) return 'bg-slate-100 hover:bg-slate-200';
  if (percentage > 0 && percentage < 0.25) return 'bg-red-200';
  if (percentage >= 0.25 && percentage < 0.5) return 'bg-orange-300';
  if (percentage >= 0.5 && percentage < 0.75) return 'bg-yellow-300';
  if (percentage >= 0.75 && percentage < 1) return 'bg-lime-400';
  if (percentage === 1) return 'bg-green-500 text-white';
  return 'bg-slate-100';
};

export const AvailabilityGrid: React.FC<AvailabilityGridProps> = ({ mode, selectedSlots = [], onSlotClick, members = [] }) => {
  
  const availabilityCounts = useMemo(() => {
    if (mode !== 'display' || members.length === 0) {
      return new Map<string, string[]>();
    }
    const counts = new Map<string, string[]>();
    for (const member of members) {
      for (const slot of member.availability) {
        const key = `${slot.day}-${slot.time}`;
        if (!counts.has(key)) {
          counts.set(key, []);
        }
        counts.get(key)?.push(member.name);
      }
    }
    return counts;
  }, [members, mode]);

  const handleCellClick = useCallback((day: string, time: string) => {
    if (mode === 'input' && onSlotClick) {
      onSlotClick({ day, time });
    }
  }, [mode, onSlotClick]);

  return (
    <div className="grid grid-cols-6 gap-1 p-2 bg-white rounded-lg shadow-md">
      {/* Header Row */}
      <div className="font-bold text-center text-slate-500"></div>
      {DAYS_OF_WEEK.map(day => (
        <div key={day} className="font-bold text-center text-slate-600 text-xs md:text-sm">{day}</div>
      ))}

      {/* Grid Content */}
      {TIME_SLOTS.map(time => (
        <React.Fragment key={time}>
          <div className="font-bold text-center text-slate-600 text-xs md:text-sm self-center">{time}</div>
          {DAYS_OF_WEEK.map(day => {
            const key = `${day}-${time}`;
            let cellContent: React.ReactNode = null;
            let cellClass = 'h-10 md:h-12 rounded-md transition-all duration-200 cursor-pointer';
            let tooltip = '';

            if (mode === 'input') {
              const isSelected = isSlotSelected({ day, time }, selectedSlots);
              cellClass += isSelected
                ? ' bg-indigo-500 hover:bg-indigo-600'
                : ' bg-slate-100 hover:bg-indigo-200';
            } else {
              const availableMembers = availabilityCounts.get(key) || [];
              const percentage = members.length > 0 ? availableMembers.length / members.length : 0;
              cellClass += ` ${getColorForPercentage(percentage)}`;
              if (availableMembers.length > 0) {
                tooltip = `${availableMembers.length}/${members.length} available: ${availableMembers.join(', ')}`;
                if (percentage === 1) {
                  cellContent = <span className="font-bold text-sm">ALL</span>;
                } else {
                  cellContent = <span className="font-semibold text-slate-700 text-sm">{`${Math.round(percentage * 100)}%`}</span>;
                }
              }
            }
            
            return (
              <div
                key={key}
                className={`${cellClass} flex items-center justify-center`}
                onClick={() => handleCellClick(day, time)}
                title={tooltip}
              >
                {cellContent}
              </div>
            );
          })}
        </React.Fragment>
      ))}
    </div>
  );
};
