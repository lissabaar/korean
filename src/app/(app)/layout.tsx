/**
 * Layout for the app itself: home, Learn, Review, Add, Categories, Settings.
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
      {/* Required by the dictionary's licence (CC BY-SA 2.0 KR): name the source. */}
      <footer className="mx-auto max-w-6xl px-4 pb-8 pt-4 text-xs text-muted sm:px-6">
        Dictionary data:{" "}
        <a href="https://krdict.korean.go.kr/" className="underline underline-offset-2" target="_blank" rel="noreferrer">
          한국어기초사전 (Basic Korean Dictionary)
        </a>
        , National Institute of Korean Language,{" "}
        <a
          href="https://creativecommons.org/licenses/by-sa/2.0/kr/"
          className="underline underline-offset-2"
          target="_blank"
          rel="noreferrer"
        >
          CC BY-SA 2.0 KR
        </a>
        .
      </footer>
    </>
  );
}
