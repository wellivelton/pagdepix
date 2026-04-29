interface Props {
  num: string;
  title: string;
  desc: string;
  isLast?: boolean;
}

export default function StepItem({ num, title, desc, isLast }: Props) {
  return (
    <div className="flex gap-5 group">
      {/* Número + linha conectora */}
      <div className="flex flex-col items-center flex-shrink-0">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-bitcoin to-orange-500
          text-black font-black text-sm flex items-center justify-center
          group-hover:scale-110 transition-transform duration-300 shadow-lg shadow-bitcoin/20">
          {num}
        </div>
        {!isLast && (
          <div className="w-px flex-1 mt-2 bg-gradient-to-b from-bitcoin/40 to-transparent min-h-[2rem]" />
        )}
      </div>

      {/* Conteúdo */}
      <div className="pb-8">
        <h3 className="text-base font-bold text-white mb-1 group-hover:text-bitcoin transition-colors">
          {title}
        </h3>
        <p className="text-sm text-gray-400 leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}
