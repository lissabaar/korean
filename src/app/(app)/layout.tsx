/**
 * Layout for the app itself: home, Learn, Review, Add, Categories, Settings.
 *
 * "(app)" in parentheses is a Next.js route group: it groups pages under one
 * layout without adding "/app" to the URL (so (app)/add/page.tsx is /add).
 *
 * Server component. Reads the session; with none (a first-time visitor, or a
 * search engine) it renders the public <Landing/> page, with <StartAnonymous/>
 * as its status line — that creates an anonymous account in the browser and
 * reloads into the app. Otherwise it shows the top navigation, the page and
 * the dictionary credit in the footer.
 */

import Nav from "@/components/Nav";
import Landing from "@/components/Landing";
import StartAnonymous from "@/components/StartAnonymous";
import { currentUser } from "@/lib/session";

/**
 * Everything in this group works without signing up. A first-time visitor
 * gets an anonymous session (created in the browser, so crawlers that do not
 * run JavaScript never create users); signing up later keeps their words.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  // No session yet: the public landing page (what crawlers index), while the
  // browser starts an anonymous session and then shows the app.
  if (!user) return <Landing status={<StartAnonymous />} />;
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
        .{" "}
        <a href="/privacy" className="underline underline-offset-2">
          Privacy
        </a>
      </footer>
    </>
  );
}
