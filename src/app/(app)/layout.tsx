/**
 * Layout for the app itself: home, Learn, Review, Add, Categories, Settings,
 * Plans.
 *
 * "(app)" in parentheses is a Next.js route group: it groups pages under one
 * layout without adding "/app" to the URL (so (app)/add/page.tsx is /add).
 *
 * Server component. Reads the session; with none (a first-time visitor) it
 * renders <StartAnonymous/>, which creates an anonymous account in the
 * browser and reloads. Otherwise it shows the top navigation and the page.
 */

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
