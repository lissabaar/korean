import Nav from "@/components/Nav";
import { requireUser } from "@/lib/session";

/** Everything in this group needs a signed-in user and shares the nav. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <>
      <Nav email={user.email} />
      {children}
    </>
  );
}
