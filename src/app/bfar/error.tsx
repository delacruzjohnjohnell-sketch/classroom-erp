"use client";
// If a BFAR page fails (for example because of data an older version saved in this browser), the student gets a way forward instead of a dead end.
import { useEffect } from "react";

export default function BfarError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  const clearLocal = () => {
    try { localStorage.removeItem("bfar-accounting-v1"); } catch { /* storage may be blocked */ }
    window.location.reload();
  };
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md rounded-lg border border-gray-200 bg-white p-6 text-center">
        <h1 className="text-lg font-bold text-gray-900">This page could not load</h1>
        <p className="mt-2 text-sm text-gray-600">Something on this device did not match what the page expected. Try again first. If it keeps happening, clear this device&apos;s saved BFAR work and reload. Anything you saved or submitted to your teacher is kept safely and comes back when you open the practice set.</p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <button type="button" onClick={reset} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white">Try again</button>
          <button type="button" onClick={clearLocal} className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800">Clear this device&apos;s BFAR work and reload</button>
        </div>
      </div>
    </div>
  );
}
