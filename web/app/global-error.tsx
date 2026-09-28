"use client";

// An error in the root layout itself: the page it would show in is gone, so
// the error page comes with its own document.
import "./globals.css";
import Crash from "./error";

export default function GlobalError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body>
        <Crash {...props} />
      </body>
    </html>
  );
}
