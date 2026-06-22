"use client";

export default function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex items-start gap-3 w-full text-left group"
    >
      <div
        className={`relative mt-0.5 w-9 h-5 rounded-full transition-colors shrink-0 ${
          checked ? "bg-[#00C8DC]" : "bg-[#687FA3]/30"
        }`}
      >
        <div
          className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-4" : "translate-x-0"
          }`}
        />
      </div>
      <div>
        <p className="text-sm font-bold text-white/90">{label}</p>
        {description && (
          <p className="text-xs text-[#687FA3] mt-0.5 leading-relaxed">
            {description}
          </p>
        )}
      </div>
    </button>
  );
}
