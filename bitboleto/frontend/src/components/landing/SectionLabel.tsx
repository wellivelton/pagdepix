interface Props {
  children: React.ReactNode;
}

export default function SectionLabel({ children }: Props) {
  return (
    <span className="inline-block text-xs font-bold text-bitcoin tracking-[0.15em] uppercase mb-4">
      {children}
    </span>
  );
}
