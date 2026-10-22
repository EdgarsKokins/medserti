"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** On the homepage, the demo visitor has left the demo (logo, back button): sign the demo out so the page reads as public */
export default function EndDemo() {
  const router = useRouter();
  useEffect(() => {
    fetch("/api/auth/demo/exit", { method: "POST" })
      .then(() => router.refresh())
      .catch(() => {});
  }, [router]);
  return null;
}
