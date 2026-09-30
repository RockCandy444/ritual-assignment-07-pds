import LoginForm from "./login-form";
import { currentUser } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
export default async function Home() {
  // Anonymous requests do not need the database or auth configuration to see login.
  if ((await headers()).get("cookie")?.includes("better-auth.session_token")) {
    if (await currentUser(await headers())) redirect("/diary");
  }
  return <LoginForm />;
}
