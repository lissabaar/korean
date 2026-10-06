import Nav from "@/components/Nav";
import StartAnonymous from "@/components/StartAnonymous";
import { currentUser } from "@/lib/session";

/**
 * Everything in this group works without signing up. A first-time visitor
 * gets an anonymous session (created in the browser, so crawlers that do not
 * run JavaScript never create users); signing up later keeps their words.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) return <StartAnonymous />;
  return (
    <>
      <Nav email={user.isAnonymous ? null : user.email} />
      {children}
    </>
  );
}
