import Image from "next/image";

const COLORS: [string, string][] = [
  ["#162032", "#00C8DC"],
  ["#162032", "#2ECC71"],
  ["#162032", "#D4A017"],
  ["#1C2A40", "#E24B4A"],
  ["#0A2E33", "#00C8DC"],
  ["#3A2800", "#D4A017"],
];

function hashName(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) & 0xffffffff;
  }
  return Math.abs(h);
}

function initials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

interface Props {
  name: string;
  imageLink?: string;
  size?: number;
  className?: string;
}

export default function PlayerAvatar({
  name,
  imageLink,
  size = 48,
  className = "",
}: Props) {
  if (imageLink) {
    return (
      <div
        className={`rounded-full overflow-hidden flex-shrink-0 ${className}`}
        style={{ width: size, height: size }}
      >
        <Image
          src={imageLink}
          alt={name}
          width={size}
          height={size}
          className="object-cover w-full h-full"
          unoptimized
        />
      </div>
    );
  }

  const [bg, fg] = COLORS[hashName(name) % COLORS.length];
  return (
    <div
      className={`rounded-full flex items-center justify-center flex-shrink-0 font-mono font-medium ${className}`}
      style={{ width: size, height: size, background: bg, color: fg, fontSize: size * 0.35 }}
    >
      {initials(name)}
    </div>
  );
}
