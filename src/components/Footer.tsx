export function Footer() {
  return (
    <footer className="border-t border-gray-200 bg-white py-6">
      <div className="mx-auto max-w-7xl px-3 sm:px-4 space-y-2">
        <p className="text-center text-xs text-gray-500">
          Data source: Secretary-General reports from the{" "}
          <a
            href="https://digitallibrary.un.org"
            target="_blank"
            rel="noopener noreferrer"
            className="text-un-blue hover:underline"
          >
            UN Digital Library
          </a>{" "}
          (2023–2025)
        </p>
        <p className="text-center text-xs text-gray-400">
          © {new Date().getFullYear()} United Nations. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
