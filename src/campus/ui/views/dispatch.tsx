import { CampusError, type TenantStore } from "../../core";
import type { Actor } from "../../iam";
import { Denied } from "../kit";
import { AccountView, CalendarView, DashboardView, InboxView, NotificationsView, SearchView } from "./personal";
import { CourseView, CoursesList } from "./course";
import { TabPage } from "./tab";
import { AgentLabsList, AgentLabWorkspace } from "./agentlabs";
import { LearnArea } from "./learn";
import { EcoHub } from "./ecohub";
import { AccountPlans } from "./market";
import { CciWorkspace } from "./cci";
import { CommsHub } from "./comms";

type SP = Record<string, string | undefined>;

/** Route a signed-in campus path to its view. */
export function CampusPage({ store, actor, slug, path, sp }: { store: TenantStore; actor: Actor; slug: string; path: string[]; sp: SP }) {
  try {
    switch (path[0]) {
      case "dashboard":
        return <DashboardView store={store} actor={actor} slug={slug} sp={sp} />;
      case "courses":
        return path[1] ? <CourseView store={store} actor={actor} slug={slug} courseId={path[1]} rest={path.slice(2)} sp={sp} /> : <CoursesList store={store} actor={actor} slug={slug} />;
      case "calendar":
        return <CalendarView store={store} actor={actor} slug={slug} sp={sp} />;
      case "inbox":
        return <InboxView store={store} actor={actor} slug={slug} sp={sp} />;
      case "notifications":
        return <NotificationsView store={store} actor={actor} slug={slug} />;
      case "search":
        return <SearchView store={store} actor={actor} slug={slug} sp={sp} />;
      case "account":
        return (
          <>
            <AccountView store={store} actor={actor} slug={slug} />
            <AccountPlans store={store} actor={actor} slug={slug} />
          </>
        );
      case "t":
        return <TabPage store={store} actor={actor} slug={slug} tabSlug={path[1] ?? ""} sp={sp} />;
      case "comms":
        return <CommsHub store={store} actor={actor} slug={slug} path={path.slice(1)} sp={sp} />;
      case "cci":
        return <CciWorkspace store={store} actor={actor} slug={slug} section={path[1] ?? "dashboard"} sp={sp} />;
      case "hub":
        return <EcoHub store={store} actor={actor} slug={slug} section={path[1] ?? "overview"} sp={sp} />;
      case "learn":
        return path[1] ? <LearnArea store={store} actor={actor} slug={slug} courseId={path[1]} section={path[2] ?? "dashboard"} sp={sp} /> : <CoursesList store={store} actor={actor} slug={slug} />;
      case "agent-labs":
        return path[1] ? <AgentLabWorkspace store={store} actor={actor} slug={slug} labId={path[1]} sp={sp} /> : <AgentLabsList store={store} actor={actor} slug={slug} sp={sp} />;
      case "helpdesk":
        return <TabPage store={store} actor={actor} slug={slug} tabSlug="helpdesk" sp={sp} />;
      case "people":
        return <TabPage store={store} actor={actor} slug={slug} tabSlug="groups" sp={sp} />;
      case "observers":
        return <TabPage store={store} actor={actor} slug={slug} tabSlug="observers" sp={sp} />;
      case "credentials":
        return <TabPage store={store} actor={actor} slug={slug} tabSlug="credentials" sp={sp} />;
      default:
        return <Denied message="Page not found." />;
    }
  } catch (e) {
    return <Denied message={e instanceof CampusError ? e.message : "Something went wrong loading this page."} />;
  }
}
