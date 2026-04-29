interface StepProgressProps {
  current: number;
  total: number;
}

export default function StepProgress({ current, total }: StepProgressProps) {
  return (
    <div className="flex items-center justify-center gap-1.5 mb-4">
      <span className="text-sm text-gray-400">
        {current}/{total}
      </span>
      <div className="flex-1 max-w-[120px] h-1.5 bg-gray-700 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-bitcoin to-orange-500 rounded-full transition-all duration-300 ease-out"
          style={{ width: `${(current / total) * 100}%` }}
        />
      </div>
    </div>
  );
}
