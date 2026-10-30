import { redirect } from "next/navigation";

/** Landing page options (never merged): start on the first one; the bar on each page switches between them */
export default function LandingOptions() {
  redirect("/varianti/a");
}
