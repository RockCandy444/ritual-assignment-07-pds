import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import Planner from "../planner";
export const dynamic = "force-dynamic";
export default async function Diary() {
  const user = await currentUser(await headers());
  if (!user) redirect("/");
  return <Planner user={{ name: user.name, email: user.email }} />;
}
