// app/page.tsx
import Link from "next/link";
import Image from "next/image";

const WEBSITE_VERSION = "v0.0.18";

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gray-50 dark:bg-gray-900 font-sans">
      {/* Hero Section */}
      <div className="relative w-full max-w-4xl rounded-lg overflow-hidden shadow-lg">
        {/* Background image */}
        <div className="relative h-96 w-full">
          <Image
            src="/home-bg.jpg"
            alt="Home Background"
            fill
            className="object-cover"
          />

          {/* Overlay for readability */}
          <div className="absolute inset-0 bg-white/80 dark:bg-gray-800/70 flex flex-col items-center justify-center p-8 space-y-8">
            <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 dark:text-white text-center tracking-wide">
              Padel League Philippines
            </h1>

            <div className="flex flex-col sm:flex-row gap-6">
              <Link
                href="/players"
                className="px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow font-semibold text-center transition duration-200"
              >
                Players
              </Link>

              <Link
                href="/leaderboard"
                className="px-8 py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow font-semibold text-center transition duration-200"
              >
                Leaderboard
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="fixed bottom-3 right-3 text-[11px] text-gray-500 dark:text-gray-400">
        {WEBSITE_VERSION}
      </div>
    </div>
  );
}
