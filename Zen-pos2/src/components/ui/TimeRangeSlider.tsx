import React from 'react';

interface TimeRangeSliderProps {
  min?: number;
  max?: number;
  step?: number;
  value: [number, number];
  onChange: (val: [number, number]) => void;
}

export function TimeRangeSlider({ min = 0, max = 24, step = 0.5, value, onChange }: TimeRangeSliderProps) {
  const [start, end] = value;

  const handleStartChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let newVal = Math.min(Number(e.target.value), end - step);
    onChange([newVal, end]);
  };

  const handleEndChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let newVal = Math.max(Number(e.target.value), start + step);
    onChange([start, newVal]);
  };

  const getPercent = (val: number) => ((val - min) / (max - min)) * 100;

  return (
    <div className="relative w-full h-6 flex items-center group">
      {/* Background track */}
      <div className="absolute w-full h-1.5 bg-surface-container-highest rounded-full overflow-hidden">
        {/* Active track */}
        <div 
          className="absolute h-full bg-primary transition-all duration-75"
          style={{ left: `${getPercent(start)}%`, right: `${100 - getPercent(end)}%` }}
        />
      </div>

      {/* Start Range Input */}
      <input 
        type="range" 
        min={min} max={max} step={step} 
        value={start} 
        onChange={handleStartChange}
        className="absolute w-full appearance-none bg-transparent pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-primary"
      />
      
      {/* End Range Input */}
      <input 
        type="range" 
        min={min} max={max} step={step} 
        value={end} 
        onChange={handleEndChange}
        className="absolute w-full appearance-none bg-transparent pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-primary"
      />
    </div>
  );
}
