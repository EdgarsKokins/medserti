import { redirect } from "next/navigation";
import { currentUserId } from "@/lib/auth";

export default async function Home() {
  redirect((await currentUserId()) ? "/dashboard" : "/login");
}
