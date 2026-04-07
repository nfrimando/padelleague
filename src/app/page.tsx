// app/page.tsx
import Link from "next/link";

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
      <h1 className="text-4xl font-bold mb-12 text-gray-800 dark:text-gray-100">
        Padel League App
      </h1>

      <div className="flex flex-col space-y-6 sm:flex-row sm:space-x-6 sm:space-y-0">
        {/* Players Page Link */}
        <Link
          href="/players"
          className="w-48 py-6 px-8 bg-blue-500 hover:bg-blue-600 text-white font-semibold text-center rounded-lg shadow-md transition"
        >
          Players
        </Link>

        {/* Matches Page Link */}
        <Link
          href="/matches"
          className="w-48 py-6 px-8 bg-green-500 hover:bg-green-600 text-white font-semibold text-center rounded-lg shadow-md transition"
        >
          Matches
        </Link>
      </div>
    </div>
  );
}
