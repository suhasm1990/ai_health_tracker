export function Footer({ apiVersion, onOpenApiTester }: { apiVersion: string; onOpenApiTester: () => void }) {
  return (
    <footer className="border-t border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 mt-8 py-6 sm:mt-12 sm:py-8 transition-colors duration-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-4">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
          <div className="flex flex-col sm:flex-row sm:items-center space-y-1 sm:space-y-0 sm:space-x-2">
            <span className="font-semibold text-slate-700 dark:text-slate-300">AI Health Tracker</span>
            <span className="hidden sm:inline">•</span>
            <span>Powered by Google Health API ({apiVersion})</span>
            <span className="hidden sm:inline">•</span>
            <span>Fitbit & Apple Health Compatible</span>
          </div>
          <button onClick={onOpenApiTester} className="hover:text-slate-900 dark:hover:text-slate-300 transition-colors">
            API Explorer
          </button>
        </div>

        <details className="pt-3 border-t border-slate-200/60 dark:border-slate-800/60 text-[11px] leading-relaxed text-slate-400 dark:text-slate-500">
          <summary className="cursor-pointer select-none font-medium text-slate-500 dark:text-slate-400">Medical disclaimer & trademarks</summary>
          <p className="mt-2">
            <strong className="text-slate-500 dark:text-slate-400">Medical Disclaimer:</strong> AI Health Tracker is designed strictly for general fitness and wellness tracking and is not a regulated medical device. It is not intended to diagnose, treat, mitigate, cure, or prevent any medical condition or disease. Always seek the advice of a qualified healthcare provider with any medical questions.
          </p>
          <p className="mt-1.5">
            <strong className="text-slate-500 dark:text-slate-400">Trademark & Attribution:</strong> Google, Google Health, and Fitbit are trademarks of Google LLC. Apple and Apple Health are trademarks of Apple Inc. AI Health Tracker is an independently developed application and is not sponsored, endorsed, or certified by Google LLC or Apple Inc. Use of the Google Health API adheres to the Google API Services User Data Policy, including Limited Use requirements.
          </p>
        </details>
      </div>
    </footer>
  );
}
