interface PasswordStrengthProps {
  password: string;
}

function getStrength(password: string): { level: number; label: string } {
  if (!password) return { level: 0, label: '' };
  let score = 0;
  if (password.length >= 6) score++;
  if (password.length >= 8) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;

  const labels = ['', 'Fraca', 'Regular', 'Boa', 'Forte'];
  return { level: Math.min(score, 4), label: labels[Math.min(score, 4)] };
}

export default function PasswordStrength({ password }: PasswordStrengthProps) {
  const { level, label } = getStrength(password);
  if (!password) return null;

  return (
    <div className="mt-2">
      <div className="flex gap-1">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors duration-200 ${
              i <= level
                ? level <= 1
                  ? 'bg-red-500'
                  : level <= 2
                    ? 'bg-amber-500'
                    : level <= 3
                      ? 'bg-yellow-500'
                      : 'bg-green-500'
                : 'bg-gray-700'
            }`}
          />
        ))}
      </div>
      {label && (
        <p
          className={`mt-1 text-xs ${
            level <= 1 ? 'text-red-400' : level <= 2 ? 'text-amber-400' : level <= 3 ? 'text-yellow-400' : 'text-green-400'
          }`}
        >
          {label}
        </p>
      )}
    </div>
  );
}
