export function InitialRatingInput({
  value,
  onChange,
  className,
  disabled,
  required,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  disabled?: boolean;
  required?: boolean;
}) {
  return (
    <input
      type="number"
      min={0}
      step="any"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="e.g. 3.00"
      disabled={disabled}
      required={required}
      className={className}
    />
  );
}
