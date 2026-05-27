interface Props {
  num: string;
  title: string;
  desc: string;
  isLast?: boolean;
}

export default function StepItem({ num, title, desc, isLast }: Props) {
  return (
    <div className="flex gap-3.5 group">
      <div className="flex flex-col items-center flex-shrink-0">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-bitcoin to-orange-500
          text-black font-black text-xs flex items-center justify-center
          group-hover:scale-110 transition-transform duration-300 shadow-lg shadow-bitcoin/20">
          {num}
        </div>
        {!isLast && (
          <div className="w-px flex-1 mt-1.5 bg-gradient-to-b from-bitcoin/40 to-transparent min-h-[1.5rem]" />
        )}
      </div>

      <div className="pb-3 md:pb-4">
        <h3 className="text-sm font-bold text-white mb-0.5 group-hover:text-bitcoin transition-colors">
          {title}
        </h3>
        <p className="text-xs text-gray-400 leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}
