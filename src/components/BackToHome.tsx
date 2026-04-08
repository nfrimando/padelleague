import Link from "next/link";

export default function BackToHome() {
  return (
    <div className="sticky top-0 bg-white dark:bg-gray-950 z-10 px-6 py-3">
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
        <span className="text-sm font-medium">Back</span>
      </Link>
    </div>
  );
}
