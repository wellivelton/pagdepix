import { useRef, useEffect } from 'react';
import type { KeyboardEvent } from 'react';

interface CodeInputProps {
  value: string;
  onChange: (code: string) => void;
  length?: number;
  disabled?: boolean;
  error?: boolean;
}

export default function CodeInput({
  value,
  onChange,
  length = 6,
  disabled = false,
  error = false,
}: CodeInputProps) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const digits = value.split('').concat(Array(length - value.length).fill(''));

  useEffect(() => {
    inputRefs.current[value.length]?.focus();
  }, [value.length]);

  const handleChange = (index: number, char: string) => {
    if (!/^\d*$/.test(char)) return;
    const newDigits = [...digits];
    newDigits[index] = char.slice(-1);
    const newValue = newDigits.join('').slice(0, length);
    onChange(newValue);
  };

  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
      const newDigits = [...digits];
      newDigits[index - 1] = '';
      onChange(newDigits.join('').slice(0, length));
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    if (pasted) {
      onChange(pasted);
      inputRefs.current[Math.min(pasted.length, length - 1)]?.focus();
    }
  };

  return (
    <div
      className="flex gap-2 justify-center"
      onPaste={handlePaste}
    >
      {digits.slice(0, length).map((digit, i) => (
        <input
          key={i}
          ref={(el) => { inputRefs.current[i] = el; }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={digit}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          disabled={disabled}
          className={`
            w-10 h-12 sm:w-11 sm:h-14 text-center text-lg sm:text-xl font-bold
            bg-gray-900/50 rounded-lg border-2
            text-white placeholder-gray-500
            focus:outline-none focus:ring-2 focus:ring-bitcoin/50 focus:ring-offset-2 focus:ring-offset-gray-900
            transition-all duration-200
            disabled:opacity-50 disabled:cursor-not-allowed
            ${error ? 'border-red-500 animate-shake' : 'border-gray-600 focus:border-bitcoin'}
          `}
          aria-label={`Dígito ${i + 1} do código`}
        />
      ))}
    </div>
  );
}
