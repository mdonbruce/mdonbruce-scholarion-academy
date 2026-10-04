"use client";
import { useEffect, useRef, useState } from "react";
import {
  Activity,
  AudioLines,
  Armchair,
  BarChart3,
  Bell,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Cloud,
  Copy,
  Download,
  FileText,
  FolderUp,
  Headphones,
  HelpCircle,
  Inbox,
  Languages,
  Link2,
  ListFilter,
  LockKeyhole,
  Mail,
  Map,
  MapPin,
  Maximize2,
  Megaphone,
  MessageSquare,
  Mic,
  MicOff,
  Minimize2,
  NotebookPen,
  Phone,
  PhoneCall,
  PhoneOff,
  PhoneForwarded,
  Pause,
  Plus,
  QrCode,
  Radio,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  Users,
  Video,
  VideoOff,
  Volume2,
  Vote,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MeetingsRoomsHub } from "./meetings-rooms";
import { VoiceOperationsHub } from "./voice-operations";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Item = Record<string, any>;
const channels = [
  "General",
  "Front Desk",
  "Housekeeping",
  "Maintenance",
  "Security",
  "Management",
];
const oakHavenDirectory = [
  { name: "General Manager", email: "manager@oakhavensuites.com", role: "Management" },
  { name: "Front Desk", email: "frontdesk@oakhavensuites.com", role: "Front Desk" },
  { name: "Reservations", email: "reservations@oakhavensuites.com", role: "Reservations" },
  { name: "Guest Services", email: "info@oakhavensuites.com", role: "Guest Services" },
  { name: "Housekeeping", email: "housekeeping@oakhavensuites.com", role: "Housekeeping" },
  { name: "Security", email: "security@oakhavensuites.com", role: "Security" },
  { name: "IT Support", email: "it@oakhavensuites.com", role: "IT Support" },
];
function playPhoneTone(kind: "dtmf" | "dial" | "ringback" | "ring", digit = "") {
  const Ctx = window.AudioContext || (window as any).webkitAudioContext;
  if (!Ctx) return () => {};
  const ctx = new Ctx();
  const map: Record<string, number[]> = { "1":[697,1209],"2":[697,1336],"3":[697,1477],"4":[770,1209],"5":[770,1336],"6":[770,1477],"7":[852,1209],"8":[852,1336],"9":[852,1477],"*":[941,1209],"0":[941,1336],"#":[941,1477] };
  const frequencies = kind === "dtmf" ? map[digit] || [440] : kind === "dial" ? [350,440] : kind === "ring" ? [440,523] : [440,480];
  const gain = ctx.createGain(); gain.gain.value = .055; gain.connect(ctx.destination);
  const oscillators = frequencies.map((frequency) => { const oscillator = ctx.createOscillator(); oscillator.frequency.value = frequency; oscillator.connect(gain); oscillator.start(); return oscillator; });
  const timer = window.setTimeout(() => { oscillators.forEach((oscillator) => oscillator.stop()); ctx.close(); }, kind === "dtmf" ? 140 : kind === "dial" ? 650 : kind === "ring" ? 950 : 1800);
  return () => { window.clearTimeout(timer); oscillators.forEach((oscillator) => { try { oscillator.stop(); } catch {} }); ctx.close(); };
}
const mapUrl =
  "https://www.google.com/maps/dir/?api=1&destination=Oak+Haven+Lodging+%26+Suites%2C+Nigeria&destination_place_id=ChIJm3D7eCPLCxAR9tvCQinL0O0";
async function api(kind: string, options?: RequestInit) {
  const path =
    kind === "files"
      ? "/api/files"
      : kind === "contacts"
        ? "/api/contacts"
        : "/api/data/" + kind;
  const r = await fetch(path, options);
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || "Request failed");
  return d;
}
export type SignedInUser = { displayName: string; email: string; signOutHref: string };

/** The full Oak Haven staff workspace. Rendered by app/page.tsx only after sign-in and the staff check. */
export function Workspace({ user, initialView }: { user: SignedInUser; initialView?: string }) {
  const [view, setView] = useState("chat"),
    [channel, setChannel] = useState("General"),
    [channelList, setChannelList] = useState<string[]>(channels),
    [items, setItems] = useState<Record<string, Item[]>>({
      messages: [],
      tasks: [],
      shifts: [],
      notes: [],
      files: [],
      announcements: [],
      queues: [],
      contacts: [],
    }),
    [message, setMessage] = useState(""),
    [modal, setModal] = useState<string | null>(null),
    [notice, setNotice] = useState(""),
    [call, setCall] = useState(false),
    [mic, setMic] = useState(true),
    [camera, setCamera] = useState(true),
    [agentText, setAgentText] = useState(
      "Hello, I’m Haven, your Oak Haven directions assistant. Tell me where you are starting from, and I’ll help you reach the hotel.",
    ),
    [listening, setListening] = useState(false),
    [fullScreen, setFullScreen] = useState(false),
    [search, setSearch] = useState("");
  const stream = useRef<MediaStream | null>(null);
  const load = async (kind: string) => {
    try {
      const d = await api(kind);
      setItems((x) => ({ ...x, [kind]: d.items || [] }));
    } catch (e: any) {
      setNotice(e.message);
    }
  };
  useEffect(() => {
    const requestedView = initialView || new URLSearchParams(window.location.search).get("section");
    if (requestedView && subtitles[requestedView]) setView(requestedView);
    const navigateFromHavenRoute = (event: MessageEvent) => {
      if (event.data?.type === "havenroute:navigate" && subtitles[event.data.view]) {
        setView(event.data.view);
        setNotice(`Opened ${event.data.view} from HavenRoute`);
      }
    };
    window.addEventListener("message", navigateFromHavenRoute);
    [
      "messages",
      "tasks",
      "shifts",
      "notes",
      "files",
      "announcements",
      "queues",
      "contacts",
    ].forEach(load);
    try {
      const saved = JSON.parse(
        localStorage.getItem("havenconnect-channels") || "[]",
      );
      if (Array.isArray(saved))
        setChannelList([...new Set([...channels, ...saved])]);
    } catch {}
    return () => window.removeEventListener("message", navigateFromHavenRoute);
  }, [initialView]);
  useEffect(
    () => () => stream.current?.getTracks().forEach((t) => t.stop()),
    [],
  );
  useEffect(() => {
    const sync = () => setFullScreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);
  const toggleFullScreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      setNotice("Full-screen mode is not available in this browser.");
    }
  };
  const post = async (kind: string, p: Item) => {
    try {
      const d = await api(kind, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(p),
      });
      setItems((x) => ({ ...x, [kind]: [d.item, ...x[kind]] }));
      setModal(null);
      setNotice(kind.slice(0, -1) + " saved successfully");
    } catch (e: any) {
      setNotice(e.message);
    }
  };
  const send = async () => {
    if (!message.trim()) return;
    await post("messages", {
      body: message,
      channel,
      author: "Martins Idahosa",
    });
    setMessage("");
  };
  const beginCall = async () => {
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      setCall(true);
      setMic(true);
      setModal("call");
    } catch {
      setNotice("Microphone permission is required to start the call.");
    }
  };
  const endCall = () => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    setCall(false);
    setModal(null);
  };
  const speak = (text = agentText) => {
    speechSynthesis.cancel();
    speechSynthesis.speak(new SpeechSynthesisUtterance(text));
  };
  const listen = () => {
    const W =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (!W) {
      setNotice(
        "Voice recognition is not available in this browser. You can type your starting location instead.",
      );
      return;
    }
    const r = new W();
    r.lang = "en-NG";
    r.interimResults = false;
    setListening(true);
    r.onresult = (e: any) => {
      const origin = e.results[0][0].transcript;
      const response = `I heard ${origin}. I have prepared directions from your location to Oak Haven Lodging and Suites. Select Open live directions to begin navigation.`;
      setAgentText(response);
      speak(response);
    };
    r.onend = () => setListening(false);
    r.start();
  };
  const filtered = items.messages.filter(
    (m) =>
      m.channel === channel &&
      `${m.author} ${m.body}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <main className="shell">
      <aside className="brandbar">
        <button
          className="fullscreen-logo"
          onClick={toggleFullScreen}
          title={fullScreen ? "Exit full screen" : "Open full screen"}
          aria-label={fullScreen ? "Exit full screen" : "Open full screen"}
        >
          <img src="/havenconnect-logo.png" alt="Oak Haven HavenConnect" />
          {fullScreen ? <Minimize2 /> : <Maximize2 />}
        </button>
        <nav>
          {[
            ["activity", Activity, "Activity"],
            ["insights", BarChart3, "HavenViz"],
            ["messages", Megaphone, "Messages"],
            ["chat", MessageSquare, "Chat"],
            ["calls", PhoneCall, "Calls"],
            ["queues", ListFilter, "Queues"],
            ["meet", Video, "Meet"],
            ["meetingcenter", Building2, "Meetings & Rooms"],
            ["map", Map, "Team Map"],
            ["calendar", CalendarDays, "Calendar"],
            ["people", Users, "People"],
            ["tasks", CheckCircle2, "Tasks"],
            ["files", FolderUp, "Files"],
            ["havenroute", Mail, "HavenRoute"],
            ["events", Radio, "Events"],
            ["spaces", Armchair, "Spaces"],
            ["agent", Sparkles, "Haven"],
            ["integrations", Link2, "Connectors"],
            ["enterprise", ShieldCheck, "More"],
          ].map(([id, I, label]: any) => (
            <button
              key={id}
              className={view === id ? "active" : ""}
              onClick={() => setView(id)}
            >
              <I />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="profile" title={`Signed in as ${user.email}`}>{user.displayName.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("")}</div>
        <a className="signout-link" href={user.signOutHref} target="_top" aria-label={`Sign out ${user.email}`} title="Sign out">Sign out</a>
      </aside>
      <aside className="channels">
        <div className="product">
          <strong>HavenConnect</strong>
          <span>Oak Haven staff workspace</span>
        </div>
        <div className="search">
          <Search />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search HavenConnect"
          />
        </div>
        <Button className="meetnow action-green" onClick={beginCall}>
          <Phone /> Start staff call
        </Button>
        <div className="channel-heading">
          <p className="sectionlabel">CHANNELS</p>
          <button
            aria-label="Add channel"
            title="Add channel"
            onClick={() => {
              const n = prompt("New channel name");
              if (n?.trim()) {
                const next = [...new Set([...channelList, n.trim()])];
                setChannelList(next);
                localStorage.setItem(
                  "havenconnect-channels",
                  JSON.stringify(next),
                );
                setChannel(n.trim());
                setView("chat");
                setNotice("Channel created");
              }
            }}
          >
            <Plus />
          </button>
        </div>
        {channelList.map((c) => (
          <button
            className={channel === c ? "selected" : ""}
            key={c}
            onClick={() => {
              setChannel(c);
              setView("chat");
            }}
          >
            <span>#</span>
            {c}
            {c === "General" && <b>3</b>}
          </button>
        ))}
        <p className="sectionlabel">DIRECT MESSAGES</p>
        {oakHavenDirectory.slice(0, 4).map(
          (person, i) => (
            <button
              className="dm"
              key={person.email}
              onClick={() => {
                setChannel(`Direct · ${person.name}`);
                setChannelList((x) => [...new Set([...x, `Direct · ${person.name}`])]);
                setView("chat");
                setNotice(`Direct conversation with ${person.email} opened`);
              }}
            >
              <i className={`face f${i}`}>
                {person.name
                  .split(" ")
                  .map((x) => x[0])
                  .join("")}
              </i>
              <span>
                {person.name}
                <small>{person.email}</small>
              </span>
              <em />
            </button>
          ),
        )}
      </aside>
      <section className="work">
        <header>
          <div>
            <h1>{view === "chat" ? `# ${channel}` : titles[view]}</h1>
            <p>{subtitles[view]}</p>
          </div>
          <div className="headeractions">
            <button
              aria-label="Open directions assistant"
              title="Directions"
              onClick={() => setView("agent")}
            >
              <MapPin />
            </button>
            <button
              aria-label="Start internal staff call"
              title="Staff call"
              onClick={beginCall}
            >
              <Phone />
            </button>
            <button
              aria-label="Start video meeting"
              title="Video meeting"
              onClick={() => setModal("meeting")}
            >
              <Video />
            </button>
            <button
              aria-label="Open Message Center"
              title="Notifications"
              onClick={() => setView("messages")}
            >
              <Bell />
              <i />
            </button>
            <span className="avatars">AO CE BN</span>
          </div>
        </header>
        {view === "chat" && (
          <>
            <div className="brief">
              <div>
                <ShieldCheck />
                <span>
                  <strong>Monday Operations Briefing</strong>
                  <small>
                    Daily stand-up begins at 9:00 AM · Messages and files are
                    protected
                  </small>
                </span>
              </div>
              <Button
                className="action-green"
                onClick={() => {
                  setModal("meeting");
                  setNotice("You joined the Operations Stand-up");
                }}
              >
                Join meeting
              </Button>
            </div>
            <div className="messages">
              {filtered.length === 0 && (
                <Empty
                  icon={MessageSquare}
                  title="No messages yet"
                  text="Start the conversation for this channel."
                />
              )}
              {filtered.map((m) => (
                <article key={m.id}>
                  <i className="face">
                    {String(m.author)
                      .split(" ")
                      .map((x: string) => x[0])
                      .join("")
                      .slice(0, 2)}
                  </i>
                  <div>
                    <p>
                      <strong>{m.author}</strong>
                      <time>{new Date(m.createdAt).toLocaleString()}</time>
                    </p>
                    <span>{m.body}</span>
                    <footer>
                      <button onClick={() => setNotice("Reaction added")}>
                        👍 Like
                      </button>
                      <button
                        onClick={() => {
                          setMessage(`@${m.author} `);
                          setNotice("Reply ready in the message box");
                        }}
                      >
                        Reply
                      </button>
                      <button
                        onClick={() => setNotice("Message actions opened")}
                      >
                        •••
                      </button>
                    </footer>
                  </div>
                </article>
              ))}
            </div>
            <div className="composer">
              <Button
                variant="outline"
                aria-label="Create poll"
                onClick={async () => {
                  const q = prompt("Poll question");
                  const o = prompt("Options, separated by commas");
                  if (q && o)
                    await post("messages", {
                      body: `📊 POLL: ${q} — ${o}`,
                      channel,
                      author: "Martins Idahosa",
                    });
                }}
              >
                <Vote /> Poll
              </Button>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                placeholder={`Message #${channel}`}
              />
              <Button onClick={send}>
                <Send /> Send
              </Button>
            </div>
          </>
        )}
        {view === "activity" && <ActivityView notify={setNotice} />}
        {view === "insights" && <HavenViz items={items} notify={setNotice} />}
        {view === "messages" && (
          <MessageCenter
            items={items.announcements}
            create={() => setModal("announcement")}
          />
        )}
        {view === "calls" && (
          <VoiceOperationsHub openMeeting={() => setModal("meeting")} notify={setNotice}>
            <CommunicationsCenter
              beginInternalCall={beginCall}
              openMeeting={() => setModal("meeting")}
              notify={setNotice}
              navigate={(destination: string, label: string, extension: string) => {
              localStorage.setItem("havenconnect-directory-destination", JSON.stringify({ destination, label, extension, createdAt: new Date().toISOString() }));
              window.dispatchEvent(new CustomEvent("havenconnect:directory-action", { detail: { destination, label, extension } }));
              if (window.parent !== window) window.parent.postMessage({ type: "havenconnect:directory-action", destination, label, extension }, "*");
              if (destination === "chat") {
                const matchingChannel = channels.find((item) => label.toLowerCase().includes(item.toLowerCase()));
                setChannel(matchingChannel || "General");
              }
              setView(destination);
              setNotice(`Opened ${label} from extension ${extension}`);
              }}
            />
          </VoiceOperationsHub>
        )}
        {view === "queues" && (
          <HybridQueuesView
            items={items.queues}
            create={() => setModal("queue")}
            configure={() => setModal("queue-settings")}
            refresh={() => load("queues")}
            beginCall={beginCall}
            notify={setNotice}
          />
        )}
        {view === "meet" && (
          <MeetView
            start={() => setModal("meeting")}
            schedule={() => setView("calendar")}
            notify={setNotice}
          />
        )}
        {view === "meetingcenter" && (
          <MeetingsRoomsHub
            startLiveMeeting={() => setModal("meeting")}
            notify={setNotice}
          />
        )}
        {view === "map" && (
          <TeamMapView join={() => setModal("meeting")} notify={setNotice} />
        )}
        {view === "calendar" && (
          <CalendarView
            start={() => setModal("meeting")}
            schedule={() => setModal("schedule-meeting")}
            notify={setNotice}
          />
        )}
        {view === "people" && (
          <ContactsView
            items={items.contacts}
            create={() => setModal("contact")}
            call={beginCall}
            notify={setNotice}
          />
        )}
        {view === "tasks" && (
          <Panel
            title="Team Tasks"
            action="Create task"
            onAction={() => setModal("task")}
          >
            <div className="board">
              {["To do", "In progress", "Completed"].map((s) => (
                <div key={s}>
                  <h3>
                    {s}
                    <b>{items.tasks.filter((t) => t.status === s).length}</b>
                  </h3>
                  {items.tasks
                    .filter((t) => t.status === s)
                    .map((t) => (
                      <article key={t.id}>
                        <em className={t.priority === "High" ? "high" : ""}>
                          {t.priority}
                        </em>
                        <strong>{t.title}</strong>
                        <span>{t.assignee}</span>
                        <small>Due {t.due}</small>
                        {s !== "Completed" && (
                          <Button
                            variant="outline"
                            onClick={async () => {
                              const status =
                                s === "To do" ? "In progress" : "Completed";
                              await api("tasks", {
                                method: "PATCH",
                                headers: { "content-type": "application/json" },
                                body: JSON.stringify({ id: t.id, status }),
                              });
                              load("tasks");
                            }}
                          >
                            {s === "To do" ? "Start" : "Complete"}
                            <ChevronRight />
                          </Button>
                        )}
                      </article>
                    ))}
                </div>
              ))}
            </div>
          </Panel>
        )}
        {view === "shifts" && (
          <Panel
            title="Shift Schedule"
            action="Add shift"
            onAction={() => setModal("shift")}
          >
            <div className="calendarhead">
              <strong>This week</strong>
              <span>Day and night coverage</span>
            </div>
            <div className="shiftlist">
              {items.shifts.map((s) => (
                <article key={s.id}>
                  <time>
                    <b>{s.date}</b>
                    <span>
                      {s.start}–{s.end}
                    </span>
                  </time>
                  <i>
                    {s.employee
                      .split(" ")
                      .map((x: string) => x[0])
                      .join("")}
                  </i>
                  <div>
                    <strong>{s.employee}</strong>
                    <span>{s.department}</span>
                  </div>
                  <em>Scheduled</em>
                </article>
              ))}
              {!items.shifts.length && (
                <Empty
                  icon={CalendarDays}
                  title="No shifts scheduled"
                  text="Add the first staff shift."
                />
              )}
            </div>
          </Panel>
        )}
        {view === "files" && (
          <Panel
            title="Shared Files"
            action="Upload file"
            onAction={() => setModal("file")}
          >
            <div className="filegrid">
              {items.files.map((f) => (
                <article key={f.id}>
                  <FileText />
                  <strong>{f.name}</strong>
                  <span>
                    {Math.max(1, Math.round(f.size / 1024))} KB · {f.uploader}
                  </span>
                  <a href={`/api/files/${f.id}`}>
                    <Download /> Download
                  </a>
                </article>
              ))}
              {!items.files.length && (
                <Empty
                  icon={FolderUp}
                  title="No shared files"
                  text="Upload a document for your team."
                />
              )}
            </div>
          </Panel>
        )}
        {view === "havenroute" && <HavenRouteView notify={setNotice} />}
        {view === "notes" && (
          <Panel
            title="Team Notes"
            action="New note"
            onAction={() => setModal("note")}
          >
            <div className="notesgrid">
              {items.notes.map((n) => (
                <article key={n.id}>
                  <NotebookPen />
                  <div>
                    <strong>{n.title}</strong>
                    <p>{n.content}</p>
                    <small>
                      {n.author} · {new Date(n.createdAt).toLocaleString()}
                    </small>
                  </div>
                </article>
              ))}
              {!items.notes.length && (
                <Empty
                  icon={NotebookPen}
                  title="No submitted notes"
                  text="Capture a handover, meeting decision, or guest-service update."
                />
              )}
            </div>
          </Panel>
        )}
        {view === "agent" && (
          <CopilotHub
            items={items}
            channel={channel}
            notify={setNotice}
            createTask={(p: any) => post("tasks", p)}
            beginCall={beginCall}
            navigate={(destination: string, surface: string) => {
              localStorage.setItem("havenconnect-copilot-surface", surface);
              window.dispatchEvent(new CustomEvent("havenconnect:copilot-surface", { detail: { destination, surface } }));
              if (window.parent !== window) window.parent.postMessage({ type: "havenconnect:copilot-surface", destination, surface }, "*");
              setView(destination);
              setNotice(`${surface} opened`);
            }}
          />
        )}
        {view === "integrations" && <IntegrationCenter notify={setNotice} />}
        {view === "events" && (
          <EventsView join={() => setModal("meeting")} notify={setNotice} />
        )}
        {view === "spaces" && <SpacesView notify={setNotice} />}
        {view === "enterprise" && (
          <EnterpriseView support={() => setView("support")} />
        )}
        {view === "support" && <SupportView notify={setNotice} />}
      </section>
      {notice && (
        <div className="toast">
          <CheckCircle2 />
          {notice}
          <button onClick={() => setNotice("")}>
            <X />
          </button>
        </div>
      )}
      <Dialog open={!!modal} onOpenChange={(o) => !o && setModal(null)}>
        <DialogContent
          className={
            modal === "meeting"
              ? "meetingdialog"
              : modal === "call"
                ? "calldialog"
                : "formdialog"
          }
        >
          {modal === "task" && <TaskForm submit={(p) => post("tasks", p)} />}{" "}
          {modal === "shift" && <ShiftForm submit={(p) => post("shifts", p)} />}{" "}
          {modal === "note" && <NoteForm submit={(p) => post("notes", p)} />}{" "}
          {modal === "announcement" && (
            <AnnouncementForm submit={(p: any) => post("announcements", p)} />
          )}{" "}
          {modal === "queue" && (
            <QueueForm submit={(p: any) => post("queues", p)} />
          )}{" "}
          {modal === "contact" && (
            <ContactForm submit={(p: any) => post("contacts", p)} />
          )}{" "}
          {modal === "schedule-meeting" && (
            <MeetingForm
              done={(p: any) => {
                post("messages", {
                  body: `Meeting scheduled: ${p.title} · ${p.date} ${p.time} · ${p.attendees}`,
                  channel: "General",
                  author: "Haven Meeting Agent",
                });
                setNotice("Meeting scheduled and shared");
              }}
            />
          )}{" "}
          {modal === "queue-settings" && (
            <QueueSettingsForm
              done={(message: string) => {
                setModal(null);
                setNotice(message);
              }}
            />
          )}{" "}
          {modal === "file" && (
            <FileForm
              done={() => {
                load("files");
                setModal(null);
                setNotice("File uploaded successfully");
              }}
            />
          )}{" "}
          {modal === "call" && (
            <CallRoom
              call={call}
              mic={mic}
              setMic={(v: boolean) => {
                setMic(v);
                stream.current
                  ?.getAudioTracks()
                  .forEach((t) => (t.enabled = v));
              }}
              end={endCall}
            />
          )}{" "}
          {modal === "meeting" && (
            <Meeting
              end={() => setModal(null)}
              camera={camera}
              setCamera={setCamera}
            />
          )}
        </DialogContent>
      </Dialog>
    </main>
  );
}
const titles: Record<string, string> = {
  activity: "Activity",
  insights: "HavenConnect AI-Augmented Dashboard",
  messages: "Message Center",
  calls: "Voice & Meetings",
  queues: "Queues",
  meet: "Meet",
  meetingcenter: "Meetings, Agentic AI & Rooms",
  map: "Team Map",
  calendar: "Calendar",
  people: "People",
  tasks: "Tasks",
  shifts: "Shift Schedule",
  files: "Shared Files",
  havenroute: "HavenRoute",
  notes: "Team Notes",
  agent: "Haven Copilot",
  "agentic-ai": "HavenConnect Agentic AI",
  "tenant-registry": "Protected Tenant Registry",
  integrations: "Integration Center",
  events: "Multilingual Events",
  spaces: "Workspace Booking",
  enterprise: "HavenConnect Enterprise",
  support: "Support",
};
const subtitles: Record<string, string> = {
  chat: "",
  activity: "Mentions, reactions, assignments, and updates",
  insights:
    "Ask questions, explore live metrics, and drill from decisions into supporting records",
  messages: "New features, planned maintenance, and important announcements",
  calls: "Oak Haven phone, extensions, devices, recordings, and live call control",
  queues: "Collaborative customer call handling and real-time oversight",
  meet: "Create, schedule, or join an Oak Haven meeting",
  meetingcenter: "Prepare, run, govern, reserve, and verify hybrid meetings",
  map: "See where teams are working and drop into a conversation",
  calendar: "Staff meetings, shifts, and hotel events",
  people: "Find and connect with Oak Haven staff",
  tasks: "Create, assign, track, and complete operational work",
  shifts: "Coordinate day and night staff coverage",
  files: "10 GB cloud storage per user",
  havenroute: "Oak Haven staff email and role-based Team Spaces",
  notes: "Submit handovers, meeting decisions, or operational updates",
  agent: "AI assistance across conversations, meetings, calls, and workflows",
  "agentic-ai": "Multi-agent customer and student experience operations",
  "tenant-registry": "Govern tenant metadata, validation, approvals, and evidence",
  integrations:
    "Connect WhatsApp, webhooks, Google Workspace, Slack, Zoom, and Front",
  events: "Interpreted, translated, accessible meetings for global audiences",
  spaces: "Select and book the right Oak Haven workspace",
  enterprise: "Secure communication and collaboration",
  support: "Anytime phone and web support",
};
function HavenRouteView({ notify }: { notify: (message: string) => void }) {
  const openHavenRoute = () => window.open("/havenroute/", "_blank", "noopener,noreferrer");
  return (
    <section className="havenroute-view" aria-label="HavenRoute staff email">
      <div className="havenroute-toolbar">
        <div>
          <span>OAK HAVEN STAFF EMAIL</span>
          <h2>HavenRoute Team Spaces</h2>
          <p>Compose, search, and coordinate with every hotel department from HavenConnect.</p>
        </div>
        <div>
          <Button variant="outline" onClick={openHavenRoute}>Open full screen</Button>
          <Button onClick={() => {
            openHavenRoute();
            notify("In HavenRoute, select Install desktop app to add it to this computer.");
          }}>Install desktop app</Button>
        </div>
      </div>
      <iframe
        className="havenroute-frame"
        src="/havenroute/?v=25"
        title="HavenRoute secure Oak Haven staff email"
        allow="clipboard-write"
      />
    </section>
  );
}

function Panel({
  title,
  action,
  onAction,
  children,
}: {
  title: string;
  action: string;
  onAction: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="panel">
      <div className="panelhead">
        <div>
          <p>OAK HAVEN OPERATIONS</p>
          <h2>{title}</h2>
        </div>
        <Button onClick={onAction}>
          <Plus />
          {action}
        </Button>
      </div>
      {children}
    </section>
  );
}
function Empty({ icon: I, title, text }: any) {
  return (
    <div className="empty">
      <I />
      <strong>{title}</strong>
      <span>{text}</span>
    </div>
  );
}
function Card({ title, meta, action, onClick, date = new Date() }: any) {
  const cardDate = date instanceof Date ? date : new Date(date);
  return (
    <article>
      <div className="caldate">
        <b>{cardDate.toLocaleDateString(undefined, { day: "2-digit" })}</b>
        <span>{cardDate.toLocaleDateString(undefined, { month: "short" }).toUpperCase()}</span>
      </div>
      <div>
        <strong>{title}</strong>
        <span>{meta}</span>
      </div>
      <Button onClick={onClick}>{action}</Button>
    </article>
  );
}
function MessageCenter({ items, create }: any) {
  const [q, setQ] = useState(""),
    [category, setCategory] = useState("All");
  const source = items.length
    ? items
    : [
        {
          id: "seed1",
          title: "Audio conferencing rollout",
          body: "Assign audio-conferencing access to every user who will schedule dial-in meetings.",
          category: "Feature change",
          publishDate: "2026-09-07",
          author: "HavenConnect Admin",
        },
        {
          id: "seed2",
          title: "Planned call service maintenance",
          body: "Queue reporting maintenance is scheduled for Sunday from 2:00 AM to 3:00 AM.",
          category: "Planned maintenance",
          publishDate: "2026-09-06",
          author: "Technology Operations",
        },
      ];
  const rows = source.filter(
    (x: any) =>
      (category === "All" || x.category === category) &&
      (x.title + x.body + x.category).toLowerCase().includes(q.toLowerCase()),
  );
  return (
    <Panel title="Message Center" action="Publish message" onAction={create}>
      <div className="messageintro">
        <Inbox />
        <div>
          <strong>Stay informed</strong>
          <span>
            Track product changes, planned maintenance, service notices, and
            important Oak Haven announcements.
          </span>
        </div>
      </div>
      <div className="messagefilters">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search Message Center"
        />
        <select
          aria-label="Filter messages by category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option>All</option>
          <option>Announcement</option>
          <option>Product change</option>
          <option>Planned maintenance</option>
          <option>Service advisory</option>
        </select>
      </div>
      <div className="messagecenter">
        {rows.map((m: any) => (
          <article key={m.id}>
            <div>
              <em>{m.category}</em>
              <h3>{m.title}</h3>
              <p>{m.body}</p>
              <small>
                {m.publishDate} · {m.author}
              </small>
            </div>
            <span>{m.status || "Published"}</span>
          </article>
        ))}
        {!rows.length && (
          <Empty
            icon={Inbox}
            title="No matching messages"
            text="Try another search or category."
          />
        )}
      </div>
    </Panel>
  );
}
function QueuesView({
  items,
  create,
  configure,
  refresh,
  beginCall,
  notify,
}: any) {
  const [available, setAvailable] = useState(true);
  useEffect(() => {
    setAvailable(localStorage.getItem("havenconnect-queue-opt-in") !== "false");
  }, []);
  const calls = items;
  const update = async (c: any, status: string) => {
    if (String(c.id).startsWith("demo")) {
      notify(`${c.caller}: ${status}`);
      if (status === "Connected") beginCall();
      return;
    }
    await api("queues", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: c.id,
        status,
        agent: status === "Connected" ? "Martins Idahosa" : "Unassigned",
      }),
    });
    refresh();
    if (status === "Connected") beginCall();
  };
  const toggle = () => {
    const next = !available;
    setAvailable(next);
    localStorage.setItem("havenconnect-queue-opt-in", String(next));
    notify(
      next
        ? "You are available for queue calls"
        : "You opted out of queue calls",
    );
  };
  const report = () => {
    const rows = [
      [
        "Caller",
        "Phone",
        "Queue",
        "Type",
        "Direction",
        "Status",
        "Agent",
        "Created",
      ],
      ...calls.map((c: any) => [
        c.caller,
        c.phone,
        c.queue,
        c.type,
        c.direction,
        c.status,
        c.agent,
        c.createdAt || "",
      ]),
    ];
    const csv = rows
        .map((r) =>
          r.map((v) => `"${String(v ?? "").replaceAll('"', '""')}"`).join(","),
        )
        .join("\n"),
      a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "havenconnect-queue-report.csv";
    a.click();
    URL.revokeObjectURL(a.href);
    notify("Queue performance report downloaded");
  };
  const resolved = calls.filter((c: any) => c.status === "Resolved").length;
  return (
    <Panel title="Queues" action="Add call" onAction={create}>
      <div className="queuekpis">
        <article>
          <span>Waiting</span>
          <b>{calls.filter((c: any) => c.status === "Waiting").length}</b>
          <small>Live incoming workload</small>
        </article>
        <article>
          <span>Active calls</span>
          <b>{calls.filter((c: any) => c.status === "Connected").length}</b>
          <small>{available ? "You are available" : "You are opted out"}</small>
        </article>
        <article>
          <span>Service level</span>
          <b>
            {calls.length ? Math.round((resolved / calls.length) * 100) : 100}%
          </b>
          <small>Resolved calls</small>
        </article>
        <article>
          <span>Calls handled</span>
          <b>{resolved}</b>
          <small>Current report period</small>
        </article>
      </div>
      <div className="queuebar">
        <div>
          <strong>My queue status</strong>
          <span className={available ? "ready" : "offline"}>
            {available ? "Available" : "Opted out"}
          </span>
        </div>
        <Button variant="outline" onClick={toggle}>
          {available ? "Opt out" : "Opt in"}
        </Button>
        <Button variant="outline" onClick={report}>
          <BarChart3 /> Reports
        </Button>
        <Button variant="outline" onClick={configure}>
          <Settings2 /> Configure
        </Button>
      </div>
      <div className="queuelayout">
        <section>
          <h3>Live incoming and outgoing calls</h3>
          {calls.map((c: any) => (
            <article className="queuecall" key={c.id}>
              <i>
                <PhoneCall />
              </i>
              <div>
                <strong>{c.caller}</strong>
                <span>
                  {c.phone} · {c.type}
                </span>
                <small>
                  {c.queue} · {c.direction}
                </small>
              </div>
              <em className={c.status.toLowerCase()}>{c.status}</em>
              <Button
                disabled={!available || c.status !== "Waiting"}
                onClick={() => update(c, "Connected")}
              >
                Answer
              </Button>
              <Button variant="outline" onClick={() => update(c, "Resolved")}>
                Resolve
              </Button>
            </article>
          ))}
        </section>
        <aside>
          <h3>Queues & auto attendants</h3>
          {[
            [
              "Reservations",
              calls.filter(
                (c: any) =>
                  c.queue === "Reservations" && c.status === "Waiting",
              ).length + " waiting",
              "Front Desk agents",
            ],
            [
              "Guest Services",
              calls.filter(
                (c: any) =>
                  c.queue === "Guest Services" && c.status === "Waiting",
              ).length + " waiting",
              "Guest service agents",
            ],
            [
              "Emergency Desk",
              calls.filter(
                (c: any) =>
                  c.queue === "Emergency Desk" && c.status === "Waiting",
              ).length + " waiting",
              "Security agents",
            ],
          ].map((x) => (
            <div key={x[0]}>
              <strong>{x[0]}</strong>
              <span>{x[1]}</span>
              <small>{x[2]}</small>
            </div>
          ))}
          <div className="conference">
            <Headphones />
            <p>
              <strong>Auto attendant</strong>
              <span>
                {typeof window !== "undefined"
                  ? localStorage.getItem("havenconnect-auto-attendant-name") ||
                    "Oak Haven Main Line"
                  : "Oak Haven Main Line"}
              </span>
            </p>
            <em>Enabled</em>
          </div>
        </aside>
      </div>
    </Panel>
  );
}
function CommunicationsCenter({ beginInternalCall, openMeeting, notify, navigate }: any) {
  const [number, setNumber] = useState("");
  const [extension, setExtension] = useState("2001 · Reservations");
  const [havenNumbers, setHavenNumbers] = useState<Item[]>([]);
  const [numberFilter, setNumberFilter] = useState("all");
  const [newNumber, setNewNumber] = useState({ extension: "", label: "", category: "staff", routeType: "extension", routeTarget: "" });
  const [registryTab, setRegistryTab] = useState("Registry");
  const [tenantId, setTenantId] = useState("oak_haven");
  const [allocations, setAllocations] = useState<any[]>([]);
  const [allocation, setAllocation] = useState({ type: "extension", range: "2000-2999", assigned_to: "" });
  const [routeLookup, setRouteLookup] = useState("");
  const [routeResult, setRouteResult] = useState<any>(null);
  const [mapping, setMapping] = useState({ number: "", real_entry_point_id: "", assigned_to: "" });
  const [directorySearch, setDirectorySearch] = useState("");
  const [selectedDirectory, setSelectedDirectory] = useState<string | null>(null);
  const [provider, setProvider] = useState<any>({ configured: false, loading: true });
  const [devices, setDevices] = useState<{ inputs: MediaDeviceInfo[]; outputs: MediaDeviceInfo[] }>({ inputs: [], outputs: [] });
  const [selectedMic, setSelectedMic] = useState("");
  const [selectedSpeaker, setSelectedSpeaker] = useState("");
  const [callState, setCallState] = useState("Ready");
  const [muted, setMuted] = useState(false);
  const [recording, setRecording] = useState(false);
  const [held, setHeld] = useState(false);
  const [incoming, setIncoming] = useState(false);
  const activeCall = useRef<any>(null);
  const pendingCall = useRef<any>(null);
  const softphoneStream = useRef<MediaStream | null>(null);
  const stopCallTone = useRef<(() => void) | null>(null);
  const remoteAudio = useRef<HTMLAudioElement | null>(null);

  const preparePeer = (peer: RTCPeerConnection) => {
    peer.ontrack = (event) => {
      const audio = remoteAudio.current || new Audio();
      remoteAudio.current = audio;
      audio.autoplay = true;
      audio.srcObject = event.streams[0];
      if (selectedSpeaker && "setSinkId" in audio) (audio as HTMLAudioElement & { setSinkId: (id: string) => Promise<void> }).setSinkId(selectedSpeaker).catch(() => undefined);
      audio.play().catch(() => undefined);
    };
  };
  const waitForIce = (peer: RTCPeerConnection) => new Promise<void>((resolve) => {
    if (peer.iceGatheringState === "complete") return resolve();
    const done = () => { if (peer.iceGatheringState === "complete") { peer.removeEventListener("icegatheringstatechange", done); resolve(); } };
    peer.addEventListener("icegatheringstatechange", done);
    window.setTimeout(resolve, 2500);
  });

  const refreshDevices = async () => {
    try {
      const permission = await navigator.mediaDevices.getUserMedia({ audio: true });
      permission.getTracks().forEach((track) => track.stop());
      const all = await navigator.mediaDevices.enumerateDevices();
      const inputs = all.filter((d) => d.kind === "audioinput");
      const outputs = all.filter((d) => d.kind === "audiooutput");
      setDevices({ inputs, outputs });
      setSelectedMic((v) => v || inputs[0]?.deviceId || "");
      setSelectedSpeaker((v) => v || outputs[0]?.deviceId || "");
      notify("Audio devices refreshed");
    } catch {
      notify("Allow microphone access to select calling devices");
    }
  };

  useEffect(() => {
    fetch("/api/communications/status")
      .then((r) => r.json())
      .then(setProvider)
      .catch(() => setProvider({ configured: false, loading: false }));
    navigator.mediaDevices?.enumerateDevices().then((all) =>
      setDevices({
        inputs: all.filter((d) => d.kind === "audioinput"),
        outputs: all.filter((d) => d.kind === "audiooutput"),
      }),
    );
    fetch("/api/communications/numbers").then((r) => r.json()).then((data) => setHavenNumbers(data.items || [])).catch(() => undefined);
    fetch("/api/numbers?tenant_id=oak_haven").then((r) => r.json()).then((data) => setAllocations(data.items || [])).catch(() => undefined);
    return () => softphoneStream.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const generateNumber = async () => {
    const response = await fetch("/api/communications/numbers", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(newNumber) });
    const data = await response.json();
    if (!response.ok) return notify(data.error || "Number could not be generated");
    setHavenNumbers((items) => [...items, data.item].sort((a, b) => a.extension.localeCompare(b.extension)));
    setNewNumber({ extension: "", label: "", category: "staff", routeType: "extension", routeTarget: "" });
    notify(`${data.item.virtualNumber} is ready`);
  };
  const refreshAllocations = async () => {
    const data = await fetch(`/api/numbers?tenant_id=${encodeURIComponent(tenantId)}`).then((r) => r.json());
    setAllocations(data.items || []);
  };
  const numberAction = async (action: "allocate" | "release" | "assign" | "map-entry-point") => {
    const payload = action === "allocate" ? { tenant_id: tenantId, ...allocation } : { tenant_id: tenantId, ...mapping };
    const response = await fetch(`/api/numbers/${action}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    const data = await response.json();
    if (!response.ok) return notify(data.error || "Number action failed");
    if (data.item) setMapping((v) => ({ ...v, number: data.item.number }));
    await refreshAllocations();
    notify(`${data.item.number} updated`);
  };

  const startExternalCall = async (destinationOverride?: string) => {
    const destination = destinationOverride || number.trim();
    if (!destination) return notify("Enter an extension, HavenConnect identity, or external telephone number");
    try {
      playPhoneTone("dial");
      setCallState("Connecting");
      window.setTimeout(() => { stopCallTone.current?.(); stopCallTone.current = playPhoneTone("ringback"); }, 700);
      softphoneStream.current = await navigator.mediaDevices.getUserMedia({ audio: selectedMic ? { deviceId: { exact: selectedMic } } : true });
      const peer = new RTCPeerConnection({ iceServers: provider.iceServers || [] });
      preparePeer(peer);
      softphoneStream.current.getTracks().forEach((track) => peer.addTrack(track, softphoneStream.current!));
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      await waitForIce(peer);
      const response = await fetch("/api/communications/calls", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fromExtension: extension.split(" ")[0], destination, offer: peer.localDescription?.sdp }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      if (data.answer) await peer.setRemoteDescription({ type: "answer", sdp: data.answer });
      activeCall.current = { id: data.callId, peer, internal: Boolean(data.internal), disconnect: () => peer.close() };
      if (data.internal) {
        const poll = window.setInterval(async () => {
          const status = await fetch(`/api/communications/calls/${data.callId}`).then((r) => r.json()).catch(() => ({}));
          if (status.call?.answer && !peer.currentRemoteDescription) {
            await peer.setRemoteDescription({ type: "answer", sdp: status.call.answer });
            stopCallTone.current?.(); stopCallTone.current = null;
            setCallState("Connected");
          }
          if (["Rejected", "Ended"].includes(status.call?.status)) endExternalCall();
        }, 1500);
        activeCall.current.poll = poll;
      } else {
        stopCallTone.current?.(); stopCallTone.current = null;
      }
      setCallState(data.status || "Connected");
    } catch (error: any) {
      stopCallTone.current?.(); stopCallTone.current = null;
      softphoneStream.current?.getTracks().forEach((track) => track.stop());
      softphoneStream.current = null;
      setCallState("Ready");
      notify(error.message || "The HavenConnect call gateway is not available");
    }
  };

  const endExternalCall = () => {
    stopCallTone.current?.(); stopCallTone.current = null;
    activeCall.current?.disconnect?.();
    if (activeCall.current?.poll) window.clearInterval(activeCall.current.poll);
    if (activeCall.current?.id) fetch(`/api/communications/calls/${activeCall.current.id}`, { method: "DELETE" });
    activeCall.current = null;
    softphoneStream.current?.getTracks().forEach((track) => track.stop());
    softphoneStream.current = null;
    setCallState("Ready");
    setIncoming(false);
    setMuted(false);
    setRecording(false);
  };

  const acceptIncomingCall = async () => {
    const call = pendingCall.current;
    if (!call?.offer) return notify("The incoming call is no longer available");
    try {
      softphoneStream.current = await navigator.mediaDevices.getUserMedia({ audio: selectedMic ? { deviceId: { exact: selectedMic } } : true });
      const peer = new RTCPeerConnection({ iceServers: provider.iceServers || [] });
      preparePeer(peer);
      softphoneStream.current.getTracks().forEach((track) => peer.addTrack(track, softphoneStream.current!));
      await peer.setRemoteDescription({ type: "offer", sdp: call.offer });
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      await waitForIce(peer);
      const response = await fetch(`/api/communications/calls/${call.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "answer", answer: peer.localDescription?.sdp }) });
      if (!response.ok) throw new Error("The call could not be answered");
      activeCall.current = { id: call.id, peer, internal: true, disconnect: () => peer.close() };
      pendingCall.current = null;
      stopCallTone.current?.(); stopCallTone.current = null;
      setIncoming(false);
      setCallState("Connected");
    } catch (error: any) { notify(error.message || "Microphone access is required to answer"); }
  };

  const toggleMute = () => {
    const next = !muted;
    softphoneStream.current?.getAudioTracks().forEach((track) => (track.enabled = !next));
    setMuted(next);
  };

  const requestControl = async (action: string, targetOverride?: string) => {
    if (!activeCall.current?.id) return notify(`${action} becomes available during a connected call`);
    if (action === "record" && !recording && !window.confirm("Confirm that the required recording notice was given, consent policy was satisfied, and this call contains no prohibited emergency or payment-card segment.")) return notify("Recording was not started because consent was not confirmed");
    const response = await fetch("/api/communications/call-control", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ callId: activeCall.current.id, action, target: targetOverride || number, consentEvidence: action === "record" ? `Organizer confirmed notice and consent at ${new Date().toISOString()}` : undefined }),
    });
    const data = await response.json();
    if (!response.ok) return notify(data.error || `${action} failed`);
    if (action === "record") setRecording(true);
    if (action === "stop-recording") setRecording(false);
    if (action === "hold") setHeld(true);
    if (action === "resume") setHeld(false);
    notify(data.message);
  };

  useEffect(() => {
    if (!provider.webrtc || activeCall.current) return;
    const check = async () => {
      const ext = extension.split(" ")[0];
      const data = await fetch(`/api/communications/calls?extension=${ext}`).then((r) => r.json()).catch(() => ({ calls: [] }));
      const next = data.calls?.[0];
      if (next && activeCall.current?.id !== next.id && pendingCall.current?.id !== next.id) {
        pendingCall.current = next;
        setNumber(next.from || "Incoming caller");
        setIncoming(true);
        setCallState(`Incoming · ${next.from || "Guest"}`);
        stopCallTone.current?.();
        stopCallTone.current = playPhoneTone("ring");
      }
    };
    check();
    const timer = window.setInterval(check, 5000);
    return () => window.clearInterval(timer);
  }, [provider.webrtc, extension]);

  const extensions = [
    ["2000", "Main Reception", "staff"], ["2001", "Reservations", "staff"],
    ["2002", "Guest Services", "staff"], ["2003", "Front Desk", "staff"],
    ["2010", "General Manager", "staff"], ["2011", "Assistant Manager", "staff"],
    ["2012", "Shift Supervisor", "staff"], ["2020", "Housekeeping", "staff"],
    ["2030", "Restaurant / Kitchen", "staff"], ["2040", "Security", "staff"],
    ["2050", "Finance / OakPay", "staff"], ["2060", "Transportation", "staff"],
    ["2070", "Maintenance", "staff"], ["2080", "IT Support", "staff"],
    ["7000", "Guest Services ring group", "queue"], ["7100", "Reservations queue", "queue"],
    ["9000", "Haven AI Concierge", "ai"], ["9001", "Amara AI", "ai"], ["9002", "Amara Live Sync", "ai"], ["9999", "Emergency Center", "emergency"],
  ];
  const directoryStatus = (kind: string) => kind === "ai" ? (provider.openai ? "AI connected" : "AI setup required") : kind === "queue" || kind === "emergency" ? (provider.queue ? "Routing connected" : "Routing setup required") : provider.webrtc ? "Calling ready" : "Voice setup required";
  const directoryDestination = (kind: string) => kind === "ai" ? "agent" : kind === "queue" || kind === "emergency" ? "queues" : "people";
  const filteredExtensions = extensions.filter((item) => `${item[0]} ${item[1]}`.toLowerCase().includes(directorySearch.trim().toLowerCase()));
  const selectedEntry = extensions.find((item) => item[0] === selectedDirectory);
  const visibleNumbers = havenNumbers.filter((item) => numberFilter === "all" || item.category === numberFilter);
  return (
    <section className="comms-center">
      <div className="comms-topbar">
        <div><span className={`live-dot ${provider.webrtc ? "connected" : ""}`} />
          <div><strong>{provider.webrtc ? "Browser WebRTC available" : "Browser media unavailable"}</strong><small>{callState} · Extension {extension.split(" ")[0]} · external provider {provider.configured ? "configured for testing" : "not configured"}</small></div>
        </div>
        <div><Button variant="outline" onClick={refreshDevices}><Settings2 /> Devices</Button><Button onClick={openMeeting}><Video /> Start HavenMeet</Button></div>
      </div>
      <div className="comms-grid">
        <section className="softphone-card">
          <div className="softphone-head"><div><span>HAVENCONNECT SOFTPHONE</span><h2>{callState}</h2></div><i><PhoneCall /></i></div>
          <label>Call from extension<select value={extension} onChange={(e) => setExtension(e.target.value)}>{extensions.map((x) => <option key={x[0]}>{x[0]} · {x[1]}</option>)}</select></label>
          <label>Extension, XConnect identity, or verified external number<div className="dial-input"><span>☎</span><Input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="2002 or a verified +234 number" /></div></label>
          <div className="dialpad">{"123456789*0#".split("").map((n) => <button key={n} onClick={() => { playPhoneTone("dtmf", n); setNumber((v) => v + n); }}>{n}</button>)}</div>
          <div className="call-actions">
            {incoming ? <Button className="call-primary" onClick={acceptIncomingCall}><Phone /> Answer incoming call</Button> : activeCall.current ? <Button className="hangup" onClick={endExternalCall}><PhoneOff /> End call</Button> : <Button className="call-primary" onClick={() => startExternalCall()}><Phone /> Place call</Button>}
            <Button variant="outline" onClick={beginInternalCall}><Users /> Staff call</Button>
          </div>
          <div className="incall-controls">
            <button className={muted ? "active" : ""} onClick={toggleMute}>{muted ? <MicOff /> : <Mic />}<span>Mute</span></button>
            <button className={held ? "active" : ""} onClick={() => requestControl(held ? "resume" : "hold")}><Pause /><span>{held ? "Resume" : "Hold"}</span></button>
            <button onClick={() => requestControl("transfer")}><PhoneForwarded /><span>Transfer</span></button>
            <button className={recording ? "recording" : ""} onClick={() => requestControl(recording ? "stop-recording" : "record")}><Radio /><span>{recording ? "Stop recording" : "Record"}</span></button>
          </div>
        </section>
        <section className="communications-side">
          <article className="device-card"><header><div><Headphones /><span><strong>Audio devices</strong><small>Microphone and speaker</small></span></div><button onClick={refreshDevices}>Refresh</button></header>
            <label><Mic /> Microphone<select value={selectedMic} onChange={(e) => setSelectedMic(e.target.value)}><option value="">System default</option>{devices.inputs.map((d) => <option value={d.deviceId} key={d.deviceId}>{d.label || "Microphone"}</option>)}</select></label>
            <label><Volume2 /> Speaker<select value={selectedSpeaker} onChange={(e) => setSelectedSpeaker(e.target.value)}><option value="">System default</option>{devices.outputs.map((d) => <option value={d.deviceId} key={d.deviceId}>{d.label || "Speaker"}</option>)}</select></label>
          </article>
          <article className="network-card"><header><strong>HavenConnect communication services</strong><small>Oak Haven-owned application layer</small></header>
            {[["Browser WebRTC capability", provider.webrtc, "Available"],["HavenConnect queue workflow", provider.queue, "Available"],["HavenMeet interface", provider.video, "Available"],["WhatsApp Business Calling", provider.whatsapp, "Testing"],["Haven AI voice provider", provider.openai, "Testing"],["SIP / Nigerian carrier gateway", provider.sip, "Testing"]].map(([name, ready, readyLabel]: any) => <div key={name}><span>{name}</span><em className={ready ? "ready" : "pending"}>{ready ? readyLabel : "Not configured"}</em></div>)}
          </article>
        </section>
      </div>
      <section className="extension-directory"><div className="directory-head"><div><span>STAFF DIRECTORY</span><h2>Extensions & ring groups</h2></div><Input value={directorySearch} onChange={(event) => setDirectorySearch(event.target.value)} placeholder="Search staff or extension" /></div>
        <div className="extension-grid">{filteredExtensions.map((x) => <button className={selectedDirectory === x[0] ? "selected" : ""} key={x[0]} onClick={() => { setSelectedDirectory(x[0]); setNumber(x[0]); }}><b>{x[0]}</b><span><strong>{x[1]}</strong><small>{directoryStatus(x[2])}</small></span><Phone /></button>)}</div>
        {!filteredExtensions.length && <div className="directory-empty">No matching Oak Haven extension was found.</div>}
        {selectedEntry && <article className="directory-actions"><div><b>{selectedEntry[0]}</b><span><strong>{selectedEntry[1]}</strong><small>{directoryStatus(selectedEntry[2])}</small></span></div><div><Button onClick={() => startExternalCall(selectedEntry[0])}><Phone /> Call</Button><Button variant="outline" onClick={() => navigate("chat", selectedEntry[1], selectedEntry[0])}><MessageSquare /> Message</Button><Button variant="outline" onClick={() => requestControl("transfer", selectedEntry[0])}><PhoneForwarded /> Transfer</Button><Button variant="outline" onClick={() => navigate(directoryDestination(selectedEntry[2]), selectedEntry[1], selectedEntry[0])}><ChevronRight /> Open destination</Button></div></article>}
      </section>
      <section className="number-registry">
        <div className="directory-head"><div><span>HAVENCONNECT NUMBER REGISTRY</span><h2>Virtual identities & route mappings</h2><p>Internal identities route through HavenConnect. PSTN, SIP, and WhatsApp use a separately configured edge alias.</p></div></div>
        <div className="number-filters">{["Registry","Allocate","Assignment","Entry points","Routing","Analytics"].map((tab) => <button className={registryTab === tab ? "active" : ""} key={tab} onClick={() => setRegistryTab(tab)}>{tab}</button>)}</div>
        <div className="number-create"><Input aria-label="Tenant ID" placeholder="Tenant ID" value={tenantId} onChange={(e) => setTenantId(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))} /><Button variant="outline" onClick={refreshAllocations}>Refresh tenant</Button></div>
        {registryTab === "Allocate" && <div className="number-create"><select value={allocation.type} onChange={(e) => setAllocation((v) => ({ ...v, type: e.target.value }))}><option value="extension">Internal extension</option><option value="virtual">Virtual number</option><option value="cloud">Cloud number</option></select>{allocation.type === "extension" && <select value={allocation.range} onChange={(e) => setAllocation((v) => ({ ...v, range: e.target.value }))}><option>2000-2999</option><option>3000-3999</option></select>}<Input placeholder="Assign to staff, queue, or AI" value={allocation.assigned_to} onChange={(e) => setAllocation((v) => ({ ...v, assigned_to: e.target.value }))} /><Button onClick={() => numberAction("allocate")}><Plus /> Allocate</Button></div>}
        {registryTab === "Assignment" && <div className="number-create"><select value={mapping.number} onChange={(e) => setMapping((v) => ({ ...v, number: e.target.value }))}><option value="">Select number</option>{allocations.map((x) => <option key={x.id}>{x.number}</option>)}</select><Input placeholder="Extension, queue, SIP URI, or AI agent" value={mapping.assigned_to} onChange={(e) => setMapping((v) => ({ ...v, assigned_to: e.target.value }))} /><Button onClick={() => numberAction("assign")}>Assign</Button><Button variant="outline" onClick={() => numberAction("release")}>Release</Button></div>}
        {registryTab === "Entry points" && <div className="number-create"><select value={mapping.number} onChange={(e) => setMapping((v) => ({ ...v, number: e.target.value }))}><option value="">Select cloud number</option>{allocations.filter((x) => x.type === "cloud").map((x) => <option key={x.id}>{x.number}</option>)}</select><Input placeholder="PSTN, SIP, or WhatsApp entry-point ID" value={mapping.real_entry_point_id} onChange={(e) => setMapping((v) => ({ ...v, real_entry_point_id: e.target.value }))} /><Button onClick={() => numberAction("map-entry-point")}>Map entry point</Button></div>}
        {registryTab === "Routing" && <div className="number-create"><Input placeholder="Resolve 2001 or XC-800-000-001" value={routeLookup} onChange={(e) => setRouteLookup(e.target.value)} /><Button onClick={async () => { const r = await fetch(`/api/numbers?tenant_id=${encodeURIComponent(tenantId)}&number=${encodeURIComponent(routeLookup)}`); setRouteResult(await r.json()); }}>Resolve route</Button>{routeResult && <span>{routeResult.item ? `${routeResult.item.number} → ${routeResult.route}` : routeResult.error}</span>}</div>}
        {registryTab === "Analytics" && <div className="registry-kpis"><article><b>{allocations.length}</b><span>Total</span></article><article><b>{allocations.filter((x) => x.status === "allocated").length}</b><span>Allocated</span></article><article><b>{allocations.filter((x) => x.type === "cloud").length}</b><span>Cloud</span></article><article><b>{allocations.filter((x) => x.realEntryPointId).length}</b><span>Mapped</span></article></div>}
        {registryTab === "Registry" && <div className="number-table"><div className="number-row number-heading"><span>Number</span><span>Type</span><span>Assigned to</span><span>Entry point</span><span>Status</span></div>{allocations.map((item) => <button className="number-row" key={item.id} onClick={() => setMapping((v) => ({ ...v, number: item.number }))}><strong>{item.number}</strong><b>{item.type}</b><span>{item.assignedTo || "Unassigned"}</span><span>{item.realEntryPointId || "Internal only"}</span><em>{item.status}</em></button>)}</div>}
        <p className="legacy-registry">Legacy HavenConnect identities</p>
        <div className="number-filters">{["all","staff","department","ai","tenant","temporary","masked"].map((category) => <button className={numberFilter === category ? "active" : ""} key={category} onClick={() => setNumberFilter(category)}>{category}</button>)}</div>
        <div className="number-create">
          <Input aria-label="Extension" placeholder="4-digit extension" value={newNumber.extension} onChange={(e) => setNewNumber((v) => ({ ...v, extension: e.target.value.replace(/\D/g, "").slice(0, 4) }))} />
          <Input aria-label="Label" placeholder="Service or approved staff label" value={newNumber.label} onChange={(e) => setNewNumber((v) => ({ ...v, label: e.target.value }))} />
          <select aria-label="Category" value={newNumber.category} onChange={(e) => setNewNumber((v) => ({ ...v, category: e.target.value }))}>{["staff","department","ai","tenant","temporary","masked"].map((x) => <option key={x}>{x}</option>)}</select>
          <select aria-label="Route type" value={newNumber.routeType} onChange={(e) => setNewNumber((v) => ({ ...v, routeType: e.target.value }))}>{["extension","ring_group","queue","ai","sip","pstn","whatsapp"].map((x) => <option key={x}>{x}</option>)}</select>
          <Input aria-label="Route target" placeholder="Route target or edge alias" value={newNumber.routeTarget} onChange={(e) => setNewNumber((v) => ({ ...v, routeTarget: e.target.value }))} />
          <Button onClick={generateNumber}><Plus /> Generate</Button>
        </div>
        <div className="number-table"><div className="number-row number-heading"><span>Identity</span><span>Extension</span><span>Label</span><span>Route</span><span>Status</span></div>{visibleNumbers.map((item) => <button className="number-row" key={item.id} onClick={() => setNumber(item.extension)}><strong>{`XC-OAK-${item.extension}`}</strong><b>{item.extension}</b><span>{item.label}<small>{item.category}</small></span><span>{item.routeType.replace("_", " ")} → {item.routeTarget}</span><em>{item.status}</em></button>)}</div>
      </section>
    </section>
  );
}

function HybridQueuesView({
  items,
  create,
  configure,
  refresh,
  beginCall,
  notify,
}: any) {
  const [filter, setFilter] = useState("All"),
    [available, setAvailable] = useState(true);
  useEffect(() => {
    setAvailable(localStorage.getItem("havenconnect-queue-opt-in") !== "false");
  }, []);
  const calls = items;
  const matches = (c: any) =>
    filter === "All" ||
    (filter === "WhatsApp Calls" && c.type === "WhatsApp") ||
    (filter === "Phone Calls" && c.type !== "WhatsApp") ||
    (filter === "Missed Calls" && c.status === "Missed") ||
    filter === "Call Reports" ||
    c.queue === filter;
  const visible = calls.filter(matches),
    resolved = calls.filter((c: any) => c.status === "Resolved").length;
  const update = async (c: any, status: string) => {
    if (String(c.id).startsWith("demo")) {
      notify(`${c.caller}: ${status}`);
      if (status === "Connected") beginCall();
      return;
    }
    await api("queues", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: c.id,
        status,
        agent: status === "Connected" ? "Martins Idahosa" : "Unassigned",
      }),
    });
    refresh();
    if (status === "Connected") beginCall();
  };
  const toggle = () => {
    const next = !available;
    setAvailable(next);
    localStorage.setItem("havenconnect-queue-opt-in", String(next));
    notify(next ? "You are available for calls" : "You opted out of calls");
  };
  const report = () => {
    const rows = [
        [
          "Caller",
          "Phone",
          "Queue",
          "Channel",
          "Direction",
          "Status",
          "Agent",
          "Created",
        ],
        ...calls.map((c: any) => [
          c.caller,
          c.phone,
          c.queue,
          c.type,
          c.direction,
          c.status,
          c.agent,
          c.createdAt || "",
        ]),
      ],
      csv = rows
        .map((r) =>
          r.map((v) => `"${String(v ?? "").replaceAll('"', '""')}"`).join(","),
        )
        .join("\n"),
      a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "havenconnect-hybrid-call-report.csv";
    a.click();
    URL.revokeObjectURL(a.href);
    notify("Call report downloaded");
  };
  return (
    <Panel title="Queues" action="Add call" onAction={create}>
      <div className="hybridbanner">
        <div>
          <h3>Oak Haven hybrid calling</h3>
          <p>
            WhatsApp Business Calling for guests, HavenConnect for internal
            calls and queues, and the regular Oak Haven telephone line as
            backup.
          </p>
        </div>
        <a href="https://wa.me/2348163435375" target="_blank" rel="noreferrer">
          Call Oak Haven on WhatsApp
        </a>
      </div>
      <div className="queuefilters">
        {[
          "All",
          "WhatsApp Calls",
          "Phone Calls",
          "Reservations",
          "Guest Services",
          "Emergency Desk",
          "Missed Calls",
          "Call Reports",
        ].map((x) => (
          <button
            key={x}
            className={filter === x ? "active" : ""}
            onClick={() => {
              setFilter(x);
              if (x === "Call Reports") report();
            }}
          >
            {x}
          </button>
        ))}
      </div>
      <div className="queuekpis">
        <article>
          <span>Waiting</span>
          <b>{calls.filter((c: any) => c.status === "Waiting").length}</b>
          <small>Across all channels</small>
        </article>
        <article>
          <span>Active calls</span>
          <b>{calls.filter((c: any) => c.status === "Connected").length}</b>
          <small>{available ? "Available for calls" : "Opted out"}</small>
        </article>
        <article>
          <span>WhatsApp calls</span>
          <b>{calls.filter((c: any) => c.type === "WhatsApp").length}</b>
          <small>Guest contact channel</small>
        </article>
        <article>
          <span>Resolved</span>
          <b>{resolved}</b>
          <small>Current report period</small>
        </article>
      </div>
      <div className="queuebar">
        <div>
          <strong>My agent status</strong>
          <span className={available ? "ready" : "offline"}>
            {available ? "Available" : "Opted out"}
          </span>
        </div>
        <Button variant="outline" onClick={toggle}>
          {available ? "Opt out" : "Opt in"}
        </Button>
        <Button variant="outline" onClick={report}>
          <BarChart3 /> Reports
        </Button>
        <Button variant="outline" onClick={configure}>
          <Settings2 /> Auto attendant
        </Button>
      </div>
      <div className="queuelayout">
        <section>
          <h3>
            {filter === "All" ? "Live incoming and outgoing calls" : filter}
          </h3>
          {visible.map((c: any) => (
            <article className="queuecall" key={c.id}>
              <i>
                <PhoneCall />
              </i>
              <div>
                <strong>{c.caller}</strong>
                <span>
                  {c.phone} · {c.type}
                </span>
                <small>
                  {c.queue} · {c.direction} · conversation and guest profile
                  ready
                </small>
              </div>
              <em className={c.status.toLowerCase()}>{c.status}</em>
              <Button
                disabled={!available || c.status !== "Waiting"}
                onClick={() => update(c, "Connected")}
              >
                Accept
              </Button>
              <Button variant="outline" onClick={() => update(c, "Resolved")}>
                Resolve
              </Button>
            </article>
          ))}
          {!visible.length && (
            <Empty
              icon={PhoneCall}
              title="No calls in this view"
              text="New calls and missed-call alerts will appear here."
            />
          )}
        </section>
        <aside>
          <h3>Routing & escalation</h3>
          {[
            ["Reservations", "Front Desk agents"],
            ["Guest Services", "Guest support agents"],
            ["Emergency Desk", "Security and management"],
          ].map((x) => (
            <div key={x[0]}>
              <strong>{x[0]}</strong>
              <span>
                {
                  calls.filter(
                    (c: any) => c.queue === x[0] && c.status === "Waiting",
                  ).length
                }{" "}
                waiting
              </span>
              <small>{x[1]}</small>
            </div>
          ))}
          <div className="conference">
            <Headphones />
            <p>
              <strong>Haven handoff</strong>
              <span>
                Share directions, transfer context, add notes, or escalate to a
                staff agent.
              </span>
            </p>
            <em>Ready</em>
          </div>
        </aside>
      </div>
    </Panel>
  );
}
function ContactsView({ items, create, call, notify }: any) {
  const [q, setQ] = useState("");
  const defaults = oakHavenDirectory.map((person, index) => ({ id: `role-${index}`, ...person, contactType: "Oak Haven role", department: person.role, phone: "", preferredChannel: "HavenConnect" }));
  const rows = [...items.filter((x: any) => String(x.email || "").toLowerCase().endsWith("@oakhavensuites.com")), ...defaults].filter((x: any) =>
    `${x.name} ${x.phone} ${x.email} ${x.department}`
      .toLowerCase()
      .includes(q.toLowerCase()),
  );
  return (
    <Panel title="People" action="Add contact" onAction={create}>
      <div className="peopletools">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Find staff or customer by name, phone, email, or department"
        />
        <span>{rows.length} contacts</span>
      </div>
      <div className="peoplegrid">
        {rows.map((p: any, i: number) => (
          <article key={p.id}>
            <i className={`face f${i % 4}`}>
              {String(p.name)
                .split(" ")
                .map((x: string) => x[0])
                .join("")
                .slice(0, 2)}
            </i>
            <div>
              <strong>{p.name}</strong>
              <span>
                {p.department} · {p.contactType}
              </span>
              <small>
                {p.phone}
                {p.email ? ` · ${p.email}` : ""}
              </small>
              <div className="contactmeta">
                <span>{p.preferredChannel || "Phone"}</span>
              </div>
            </div>
            <button
              title="Start HavenConnect call"
              aria-label={`Call ${p.name} in HavenConnect`}
              onClick={call}
            >
              <Phone />
            </button>
            <button
              className="whatsapp"
              title="Open WhatsApp"
              aria-label={`Open WhatsApp with ${p.name}`}
              onClick={() => {
                const phone = String(p.phone).replace(/\D/g, "");
                if (phone)
                  window.open(
                    `https://wa.me/${phone.startsWith("0") ? "234" + phone.slice(1) : phone}`,
                    "_blank",
                    "noopener",
                  );
                else notify("Add a phone number before opening WhatsApp");
              }}
            >
              <MessageSquare />
            </button>
          </article>
        ))}
      </div>
    </Panel>
  );
}
function HavenViz({ items, notify }: any) {
  const [prompt, setPrompt] = useState(
      "What is slowing down guest communication today?",
    ),
    [scope, setScope] = useState("All activity"),
    [drill, setDrill] = useState("Overview"),
    [story, setStory] = useState<any>(null);
  const messages = items.messages || [],
    tasks = items.tasks || [],
    queues = items.queues || [],
    contacts = items.contacts || [];
  const waiting = queues.filter((x: any) => x.status === "Waiting").length,
    completed = tasks.filter((x: any) => x.status === "Completed").length,
    total = Math.max(1, tasks.length),
    channelData = channels.map((c) => ({
      name: c,
      value: messages.filter((m: any) => m.channel === c).length,
    })),
    max = Math.max(1, ...channelData.map((x) => x.value));
  const ask = (e?: any) => {
    e?.preventDefault();
    const q = prompt.trim();
    if (!q) return;
    setStory({
      title: "Guest communication requires the fastest attention",
      summary: `HavenViz analyzed ${messages.length} conversation records, ${tasks.length} tasks, ${queues.length} calls, and ${contacts.length} contacts. ${waiting} call${waiting === 1 ? " is" : "s are"} waiting and ${tasks.length - completed} task${tasks.length - completed === 1 ? " remains" : "s remain"} open.`,
      actions: [
        "Prioritize waiting Reservations and Guest Services calls",
        "Confirm an owner and update time for every guest-impacting task",
        "Review the busiest channel before the next operations meeting",
      ],
    });
    notify("HavenViz created an interactive business story");
  };
  const records =
    drill === "Calls"
      ? queues
      : drill === "Tasks"
        ? tasks
        : drill === "Conversations"
          ? messages
          : [...queues, ...tasks, ...messages].slice(0, 12);
  return (
    <section className="havenviz">
      <div className="viz-ask">
        <div>
          <p>HAVENVIZ · LIVE BUSINESS INTELLIGENCE</p>
          <h2>Oak Haven operations command center</h2>
          <span>
            Ask a question, monitor live performance, and open the supporting
            records without leaving the dashboard.
          </span>
        </div>
        <form onSubmit={ask}>
          <Input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Ask about meetings, calls, conversations, tasks, or usage"
          />
          <select value={scope} onChange={(e) => setScope(e.target.value)}>
            <option>All activity</option>
            <option>Meetings</option>
            <option>Calls</option>
            <option>Conversations</option>
            <option>Staff usage</option>
          </select>
          <Button type="submit">
            <Sparkles /> Build my story
          </Button>
        </form>
      </div>
      <div className="viz-highlights">
        <article>
          <span>Conversations</span>
          <b>{messages.length}</b>
          <small>
            Across {channelData.filter((x) => x.value).length || 1} active
            channels
          </small>
        </article>
        <article>
          <span>Calls waiting</span>
          <b>{waiting}</b>
          <small>{queues.length} tracked call records</small>
        </article>
        <article>
          <span>Task completion</span>
          <b>{Math.round((completed / total) * 100)}%</b>
          <small>
            {completed} of {tasks.length} completed
          </small>
        </article>
        <article>
          <span>Known contacts</span>
          <b>{contacts.length}</b>
          <small>Staff, guests, and vendors</small>
        </article>
      </div>
      <div className="viz-grid">
        <section className="viz-chart">
          <div className="viz-cardhead">
            <div>
              <h3>Communication activity</h3>
              <span>Live channel distribution</span>
            </div>
            <select value={drill} onChange={(e) => setDrill(e.target.value)}>
              <option>Overview</option>
              <option>Conversations</option>
              <option>Calls</option>
              <option>Tasks</option>
            </select>
          </div>
          <div className="bar-chart">
            {channelData.map((x) => (
              <button key={x.name} onClick={() => setDrill("Conversations")}>
                <span>{x.name}</span>
                <i
                  style={{ height: `${Math.max(8, (x.value / max) * 100)}%` }}
                />
                <b>{x.value}</b>
              </button>
            ))}
          </div>
          <div className="drill-note">
            <BarChart3 />
            <span>
              <b>Drill Anywhere</b> Select a bar or change the record type to
              inspect the supporting data without predefined paths.
            </span>
          </div>
        </section>
        <aside className="ai-highlights">
          <Sparkles />
          <h3>AI Highlights</h3>
          <p>
            {story?.summary ||
              "Ask HavenViz a business question to generate a narrative from the current meeting, call, task, and conversation records."}
          </p>
          {story && (
            <ol>
              {story.actions.map((x: string) => (
                <li key={x}>{x}</li>
              ))}
            </ol>
          )}
          <Button
            variant="outline"
            onClick={() => notify("Insight shared to the Management channel")}
          >
            Share to Management
          </Button>
        </aside>
      </div>
      <section className="viz-records">
        <div className="viz-cardhead">
          <div>
            <h3>{drill} records</h3>
            <span>Granular evidence behind the dashboard</span>
          </div>
          <div>
            <Button
              variant="outline"
              onClick={() => notify("Comment added to this HavenViz")}
            >
              Comment
            </Button>
            <Button
              variant="outline"
              onClick={() => notify("HavenViz embed link copied")}
            >
              Embed
            </Button>
          </div>
        </div>
        {records.length ? (
          <div className="record-table">
            {records.map((r: any, i: number) => (
              <article key={`${r.id || i}-${i}`}>
                <b>
                  {r.title ||
                    r.caller ||
                    r.author ||
                    r.name ||
                    "Activity record"}
                </b>
                <span>
                  {r.body ||
                    r.queue ||
                    r.assignee ||
                    r.department ||
                    r.status ||
                    "HavenConnect"}
                </span>
                <em>{r.status || r.channel || r.type || "Active"}</em>
              </article>
            ))}
          </div>
        ) : (
          <Empty
            icon={BarChart3}
            title="No matching records yet"
            text="Live records will appear as staff use HavenConnect."
          />
        )}
      </section>
      <footer className="viz-sources">
        <b>Live and cached sources</b>
        <span>
          HavenConnect D1 · APIs · files · connected cloud data warehouses ·
          legacy databases
        </span>
        <em>Last refreshed now</em>
      </footer>
    </section>
  );
}
function ActivityView({ notify }: any) {
  const [read, setRead] = useState(false),
    [filter, setFilter] = useState("All");
  const feed = [
    {
      i: "MG",
      c: "f0",
      t: "Management mentioned you",
      p: "Please review the guest experience report before today’s meeting.",
      d: "8:32 AM",
      type: "Mentions",
    },
    {
      i: "HK",
      c: "f2",
      t: "Housekeeping completed a task",
      p: "Princess Suite final inspection is complete.",
      d: "8:20 AM",
      type: "Updates",
    },
    {
      i: "FD",
      c: "f1",
      t: "Front Desk shared a file",
      p: "VIP_Arrival_Brief.pdf was added to Front Desk.",
      d: "Yesterday",
      type: "Updates",
    },
  ].filter(
    (x) =>
      filter === "All" || (filter === "Unread" && !read) || x.type === filter,
  );
  return (
    <Panel
      title="Activity"
      action={read ? "All caught up" : "Mark all read"}
      onAction={() => {
        setRead(true);
        notify("All activity marked as read");
      }}
    >
      <div className="activityview">
        <div className="activityfilters">
          <Input placeholder="Filter activity" />
          {["All", "Unread", "Mentions", "Updates"].map((x) => (
            <button
              key={x}
              className={filter === x ? "on" : ""}
              onClick={() => setFilter(x)}
            >
              {x}
            </button>
          ))}
        </div>
        <div className={`feed ${read ? "read" : ""}`}>
          {feed.map((x) => (
            <article key={x.t}>
              <i className={`face ${x.c}`}>{x.i}</i>
              <div>
                <strong>{x.t}</strong>
                <p>{x.p}</p>
                <small>{read ? "Read" : x.d}</small>
              </div>
            </article>
          ))}
          {!feed.length && (
            <Empty
              icon={CheckCircle2}
              title="You are caught up"
              text="There are no unread activities."
            />
          )}
        </div>
      </div>
    </Panel>
  );
}
function MeetView({ start, schedule, notify }: any) {
  const today = new Date();
  const createLink = async () => {
    const link = `https://havenconnect-oak-haven.mdonbruce.chatgpt.site/meet/${crypto.randomUUID().slice(0, 8)}`;
    await navigator.clipboard?.writeText(link);
    notify("Meeting link created and copied");
  };
  return (
    <Panel title="Meet" action="Meet now" onAction={start}>
      <div className="meetactions">
        <button onClick={createLink}>
          <Link2 />
          <strong>Create a meeting link</strong>
          <span>Save and share with anyone</span>
        </button>
        <button onClick={schedule}>
          <CalendarDays />
          <strong>Schedule a meeting</strong>
          <span>Add attendees and an agenda</span>
        </button>
        <button
          onClick={() => {
            const id = prompt("Enter meeting ID");
            if (id) start();
          }}
        >
          <Copy />
          <strong>Join with a meeting ID</strong>
          <span>Enter the organizer’s code</span>
        </button>
      </div>
      <h3 className="blocktitle">Scheduled meetings</h3>
      <div className="meetingcards">
        <Card
          title="Operations Stand-up"
          meta="Today · 9:00 AM · 8 participants"
          action="Join"
          onClick={start}
          date={today}
        />
        <Card
          title="Guest Experience Review"
          meta="Today · 2:00 PM · Conference Room A"
          action="Join"
          onClick={start}
          date={today}
        />
      </div>
      <div className="meetinglimit">
        <ShieldCheck />
        <div>
          <strong>Unlimited group meetings</strong>
          <span>
            Host meetings for up to 30 hours with encrypted audio, video, chat,
            and shared files.
          </span>
        </div>
      </div>
    </Panel>
  );
}
function CalendarView({ start, schedule, notify }: any) {
  const today = new Date();
  const weekStart = new Date(today);
  const weekday = today.getDay();
  weekStart.setDate(today.getDate() - (weekday === 0 ? 6 : weekday - 1));
  weekStart.setHours(0, 0, 0, 0);
  const days = Array.from({ length: 5 }, (_, index) => {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + index);
    return {
      d: date.toLocaleDateString(undefined, { day: "2-digit" }),
      n: date.toLocaleDateString(undefined, { weekday: "long" }),
      iso: date.toISOString().slice(0, 10),
    };
  });
  const monthLabel = `${weekStart.toLocaleDateString(undefined, { month: "long" })} ${weekStart.getFullYear()}`;
  const joinId = () => {
    const id = prompt("Enter HavenConnect meeting ID");
    if (id?.trim()) {
      notify(`Joining meeting ${id.trim()}`);
      start();
    }
  };
  return (
    <section className="calendarview">
      <div className="calendarbar">
        <div>
          <Button
            className="action-green"
            onClick={() => notify("Calendar returned to today")}
          >
            Today
          </Button>
          <strong>{monthLabel}</strong>
        </div>
        <div>
          <Button className="action-green" onClick={joinId}>
            Join with an ID
          </Button>
          <Button className="action-green" onClick={start}>
            <Video /> Meet now
          </Button>
          <Button className="action-green" onClick={schedule}>
            <Plus /> New meeting
          </Button>
        </div>
      </div>
      <div className="weekhead">
        <span />
        {days.map((x) => (
          <div key={x.iso}>
            <b>{x.d}</b>
            <small>{x.n}</small>
          </div>
        ))}
      </div>
      <div className="weekgrid">
        <aside>
          {[
            "8 AM",
            "9 AM",
            "10 AM",
            "11 AM",
            "12 PM",
            "1 PM",
            "2 PM",
            "3 PM",
            "4 PM",
            "5 PM",
          ].map((t) => (
            <span key={t}>{t}</span>
          ))}
        </aside>
        {days.map((x, i) => (
          <div className="daycol" key={x.iso}>
            {i === 0 && (
              <>
                <button className="event standup" onClick={start}>
                  <b>Operations Stand-up</b>
                  <span>9:00–9:30 AM</span>
                </button>
                <button className="event review" onClick={start}>
                  <b>Guest Experience Review</b>
                  <span>2:00–3:00 PM</span>
                </button>
              </>
            )}
            {i === 2 && (
              <button className="event training" onClick={start}>
                <b>Safety Training</b>
                <span>11:00 AM–12:00 PM</span>
              </button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
function PeopleView({ call }: any) {
  const people = oakHavenDirectory.map((person) => [person.name.slice(0,2).toUpperCase(), person.name, person.email, "Available"]);
  return (
    <Panel title="People" action="Add contact" onAction={() => {}}>
      <div className="peopletools">
        <Input placeholder="Find a staff member or customer" />
        <span>{people.length} contacts</span>
      </div>
      <div className="peoplegrid">
        {people.map((p, i) => (
          <article key={p[1]}>
            <i className={`face f${i % 4}`}>{p[0]}</i>
            <div>
              <strong>{p[1]}</strong>
              <span>{p[2]}</span>
              <small className={p[3] === "Available" ? "available" : ""}>
                {p[3]}
              </small>
            </div>
            <button onClick={call}>
              <Phone />
            </button>
            <button>
              <MessageSquare />
            </button>
          </article>
        ))}
      </div>
    </Panel>
  );
}
function TeamMapView({ join, notify }: any) {
  const [status, setStatus] = useState("Available"),
    [focus, setFocus] = useState("All teams"),
    [refreshed, setRefreshed] = useState(new Date());
  const people = oakHavenDirectory.map((person, index) => ({ n: person.name, r: person.email, z: person.role, x: 16 + (index * 17) % 72, y: 20 + (index * 23) % 62, c: person.name.slice(0,2).toUpperCase() })).filter((p) => focus === "All teams" || p.z === focus);
  const refresh = () => {
    setRefreshed(new Date());
    notify("Live team presence refreshed");
  };
  return (
    <Panel title="Real-time Team Map" action="Start drop-in" onAction={join}>
      <div className="teammap-toolbar">
        <div>
          <b>My presence</b>
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              notify(`Presence changed to ${e.target.value}`);
            }}
          >
            <option>Available</option>
            <option>Busy</option>
            <option>Do not disturb</option>
            <option>Away</option>
          </select>
        </div>
        <div>
          <b>Show</b>
          <select value={focus} onChange={(e) => setFocus(e.target.value)}>
            <option>All teams</option>
            <option>Front Desk</option>
            <option>Management</option>
            <option>Guest Services</option>
            <option>Security</option>
            <option>Meeting Room</option>
          </select>
        </div>
        <button className="presence-refresh" onClick={refresh}>
          <i /> Live presence · Refresh now{" "}
          <small>
            {refreshed.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </small>
        </button>
      </div>
      <div className="virtual-office">
        <div className="zone front">
          Front Desk<small>Guest arrivals</small>
        </div>
        <div className="zone management">
          Management<small>Leadership</small>
        </div>
        <div className="zone lounge">
          Drop-in Lounge<small>Open conversation</small>
        </div>
        <div className="zone service">
          Guest Services<small>Housekeeping & requests</small>
        </div>
        <div className="zone security">
          Security Desk<small>Emergency coverage</small>
        </div>
        {people.map((p) => (
          <button
            key={p.n}
            className="map-person"
            style={{ left: `${p.x}%`, top: `${p.y}%` }}
            onClick={join}
            title={`Drop in with ${p.n}`}
          >
            <i>{p.c}</i>
            <span>
              {p.n}
              <small>{p.r}</small>
            </span>
          </button>
        ))}
      </div>
      <div className="map-bottom">
        <article>
          <Video />
          <div>
            <b>Instant drop-in meetings</b>
            <span>Join a colleague or open room without scheduling.</span>
          </div>
          <Button onClick={join}>Open room</Button>
        </article>
        <article>
          <Sparkles />
          <div>
            <b>Haven Meeting Copilot</b>
            <span>
              20-minute focus timer, live notes, and automatic summary.
            </span>
          </div>
          <Button
            variant="outline"
            onClick={() =>
              notify("Meeting Copilot is ready for the next drop-in")
            }
          >
            Enable
          </Button>
        </article>
        <article>
          <Link2 />
          <div>
            <b>Connected workspace</b>
            <span>Zoom · Slack · Calendly · Loom · Otter</span>
          </div>
          <Button
            variant="outline"
            onClick={() => notify("Open Connectors to authorize external apps")}
          >
            Manage
          </Button>
        </article>
      </div>
    </Panel>
  );
}
function EventsView({ join, notify }: any) {
  const nextTownHall = () => {
    const date = new Date();
    const daysUntilFriday = (5 - date.getDay() + 7) % 7 || 7;
    date.setDate(date.getDate() + daysUntilFriday);
    date.setHours(10, 0, 0, 0);
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
  };
  const [tab, setTab] = useState("studio"),
    [language, setLanguage] = useState("English"),
    [mode, setMode] = useState("Professional interpreter"),
    [event, setEvent] = useState({
      title: "Oak Haven Global Town Hall",
      date: nextTownHall(),
      format: "Hybrid",
      access: "Secure browser link + QR code",
    });
  const create = async () => {
    const r = await fetch("/api/agent-actions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        agent: "Event Producer Agent",
        provider: "HavenConnect Events",
        actionType: "Event setup",
        title: event.title,
        details: `${event.date} · ${event.format} · ${mode} · ${language}`,
      }),
    });
    notify(
      r.ok
        ? "Multilingual event prepared for approval"
        : "Event could not be prepared",
    );
  };
  const languages = [
    "English",
    "French",
    "Spanish",
    "Portuguese",
    "Yoruba",
    "Igbo",
    "Hausa",
    "Arabic",
    "Mandarin",
    "ASL",
  ];
  return (
    <Panel
      title="HavenConnect Events"
      action="Create multilingual event"
      onAction={create}
    >
      <div className="events-command">
        <div>
          <p>GLOBAL EVENT CONTROL</p>
          <h2>
            Interpretation, translation, accessibility, and agentic execution
          </h2>
          <span>
            Run online, hybrid, or in-person events with professional
            interpreters and AI-assisted language channels.
          </span>
        </div>
        <Languages />
      </div>
      <nav className="event-tabs">
        {[
          ["studio", "Event studio"],
          ["live", "Live control"],
          ["agents", "Video agents"],
          ["access", "Attendee access"],
        ].map((x) => (
          <button
            className={tab === x[0] ? "active" : ""}
            key={x[0]}
            onClick={() => setTab(x[0])}
          >
            {x[1]}
          </button>
        ))}
      </nav>
      {tab === "studio" && (
        <div className="event-studio">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              create();
            }}
          >
            <h3>Event setup</h3>
            <label>
              Event title
              <Input
                value={event.title}
                onChange={(e) =>
                  setEvent((x) => ({ ...x, title: e.target.value }))
                }
              />
            </label>
            <div className="automation-row">
              <label>
                Date and time
                <Input
                  type="datetime-local"
                  value={event.date}
                  onChange={(e) =>
                    setEvent((x) => ({ ...x, date: e.target.value }))
                  }
                />
              </label>
              <label>
                Format
                <select
                  value={event.format}
                  onChange={(e) =>
                    setEvent((x) => ({ ...x, format: e.target.value }))
                  }
                >
                  <option>Online</option>
                  <option>Hybrid</option>
                  <option>In-person</option>
                </select>
              </label>
            </div>
            <label>
              Language delivery
              <select value={mode} onChange={(e) => setMode(e.target.value)}>
                <option>Professional interpreter</option>
                <option>AI speech-to-speech</option>
                <option>AI speech-to-text</option>
                <option>Professional + AI hybrid</option>
              </select>
            </label>
            <label>
              Primary audience language
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
              >
                {languages.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            <div className="event-checks">
              <label>
                <input type="checkbox" defaultChecked /> Translate captions and
                chat
              </label>
              <label>
                <input type="checkbox" defaultChecked /> Translate slides and
                polls
              </label>
              <label>
                <input type="checkbox" defaultChecked /> Generate AI summary
              </label>
              <label>
                <input type="checkbox" /> Add ASL channel
              </label>
            </div>
            <Button type="submit">
              <Sparkles /> Prepare event
            </Button>
          </form>
          <aside>
            <h3>Language channels</h3>
            {languages.slice(0, 6).map((x, i) => (
              <button key={x} onClick={() => setLanguage(x)}>
                <span>{x}</span>
                <small>
                  {i < 2 ? "Interpreter assigned" : "AI channel ready"}
                </small>
                <em>{i < 2 ? "Live" : "Ready"}</em>
              </button>
            ))}
            <Button
              variant="outline"
              onClick={() => notify("Language channel added")}
            >
              + Add language channel
            </Button>
          </aside>
        </div>
      )}
      {tab === "live" && (
        <div className="live-event">
          <section>
            <div className="stage">
              <i>MI</i>
              <span>Martins Idahosa · Main stage</span>
              <em>LIVE</em>
            </div>
            <div className="caption">
              <Languages />
              <p>
                <b>{language} captions</b>
                <span>
                  Welcome to the Oak Haven global team meeting. Today we will
                  review guest experience and safety priorities.
                </span>
              </p>
            </div>
            <div className="live-controls">
              <Button onClick={join}>
                <Video /> Join production room
              </Button>
              <Button
                variant="outline"
                onClick={() => notify("AI summary generated and saved")}
              >
                Generate summary
              </Button>
              <Button
                variant="outline"
                onClick={() => notify("Interpreter handoff requested")}
              >
                Interpreter handoff
              </Button>
            </div>
          </section>
          <aside>
            <h3>Event health</h3>
            <p>
              <b>42</b>
              <span>attendees</span>
            </p>
            <p>
              <b>6</b>
              <span>language channels</span>
            </p>
            <p>
              <b>1.8s</b>
              <span>interpretation delay</span>
            </p>
            <p>
              <b>98%</b>
              <span>caption confidence</span>
            </p>
          </aside>
        </div>
      )}
      {tab === "agents" && (
        <div className="video-agents">
          {[
            [
              "Briefing Agent",
              "Researches attendees, past discussions, and approved documents before the call",
            ],
            [
              "Agentic Video Analyst",
              "Queries relevant audio and video moments dynamically during the meeting",
            ],
            [
              "Meeting Participant Agent",
              "Logs decisions, files tasks, drafts follow-ups, and prepares workflow actions",
            ],
            [
              "Webinar Producer Agent",
              "Creates sessions, language rooms, polls, captions, and post-event assets",
            ],
            [
              "Accessibility Agent",
              "Monitors captions, ASL support, readable content, and attendee accommodations",
            ],
          ].map((x) => (
            <article key={x[0]}>
              <Sparkles />
              <div>
                <b>{x[0]}</b>
                <p>{x[1]}</p>
              </div>
              <Button
                variant="outline"
                onClick={() => notify(`${x[0]} added to the event`)}
              >
                Add agent
              </Button>
            </article>
          ))}
        </div>
      )}
      {tab === "access" && (
        <div className="attendee-access">
          <section>
            <QrCode />
            <h3>Join from any device</h3>
            <p>
              Attendees scan the event QR code or open the secure browser link,
              then choose their preferred audio and caption language.
            </p>
            <Button onClick={() => notify("Secure attendee link copied")}>
              Copy secure link
            </Button>
          </section>
          <section>
            <h3>Inclusive communication</h3>
            <ul>
              <li>Professional remote simultaneous interpretation</li>
              <li>AI speech and caption translation</li>
              <li>ASL interpreter channel</li>
              <li>Translated chats, slides, captions, and polls</li>
              <li>No special receiver equipment required</li>
            </ul>
          </section>
        </div>
      )}
    </Panel>
  );
}
function SpacesView({ notify }: any) {
  const [booked, setBooked] = useState(""),
    [mine, setMine] = useState(false);
  const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
  const spaces = [
    ["Conference Room A", "12 people · Display · Video", "Available now"],
    [
      "Manager Meeting Room",
      "6 people · Display · Private",
      "Available at 1 PM",
    ],
    ["Training Hall", "40 people · Projector · Audio", "Available now"],
    ["Rooftop Lounge", "20 people · Event setup", "Available at 4 PM"],
  ];
  const visible = mine ? spaces.filter((s) => s[0] === booked) : spaces;
  return (
    <Panel
      title="Workspace Booking"
      action={mine ? "Show all spaces" : "My bookings"}
      onAction={() => {
        setMine(!mine);
        notify(
          !mine ? "Showing your bookings" : "Showing all available spaces",
        );
      }}
    >
      <div className="spacefilters">
        <Input type="date" defaultValue={today} />
        <Input type="time" defaultValue="09:00" />
        <select>
          <option>Any capacity</option>
          <option>1–6 people</option>
          <option>7–15 people</option>
          <option>16+ people</option>
        </select>
      </div>
      {mine && !booked && (
        <Empty
          icon={Armchair}
          title="No workspace bookings yet"
          text="Book a space and it will appear here."
        />
      )}
      <div className="spacegrid">
        {visible.map((s) => (
          <article key={s[0]}>
            <Building2 />
            <div>
              <strong>{s[0]}</strong>
              <span>{s[1]}</span>
              <small>{booked === s[0] ? "Booked for you" : s[2]}</small>
            </div>
            <Button
              disabled={booked === s[0]}
              onClick={() => {
                setBooked(s[0]);
                notify(`${s[0]} booked successfully`);
              }}
            >
              {booked === s[0] ? "Booked" : "Book"}
            </Button>
          </article>
        ))}
      </div>
    </Panel>
  );
}
function EnterpriseView({ support }: any) {
  const features = [
    [Video, "Unlimited group meetings", "Up to 30 hours per meeting"],
    [Cloud, "10 GB cloud storage", "Allocated securely to every user"],
    [HelpCircle, "Anytime support", "Phone and web assistance"],
    [MessageSquare, "Unlimited chat", "Coworkers and customer conversations"],
    [Vote, "Files, tasks, and polling", "Work together in every channel"],
    [LockKeyhole, "Data encryption", "Meetings, chats, calls, and files"],
    [Sparkles, "Haven Copilot add-on", "AI summaries, answers, and actions"],
    [Radio, "Scalable online events", "Training, town halls, and webinars"],
    [
      Armchair,
      "Intelligent workspace booking",
      "Find and reserve the best space",
    ],
  ];
  return (
    <Panel
      title="HavenConnect Enterprise"
      action="Contact support"
      onAction={support}
    >
      <div className="securitybanner">
        <LockKeyhole />
        <div>
          <strong>Protected collaboration across Oak Haven</strong>
          <span>
            Encrypted transport, private access, permission-aware storage, and
            activity oversight.
          </span>
        </div>
        <em>Protected</em>
      </div>
      <div className="featuregrid">
        {features.map(([I, t, d]: any) => (
          <article key={t}>
            <I />
            <strong>{t}</strong>
            <span>{d}</span>
          </article>
        ))}
      </div>
      <div className="storagecard">
        <div>
          <Cloud />
          <strong>Cloud storage</strong>
          <span>2.4 GB of 10 GB used</span>
        </div>
        <div className="meter">
          <i />
        </div>
        <small>24% used · 7.6 GB available</small>
      </div>
    </Panel>
  );
}
function SupportView({ notify }: any) {
  return (
    <Panel
      title="Support"
      action="View service status"
      onAction={() => notify("All HavenConnect services are operational")}
    >
      <div className="supportgrid">
        <article>
          <Phone />
          <h3>Phone support</h3>
          <p>Speak with the Oak Haven technology support team at any time.</p>
          <Button onClick={() => notify("Support call request submitted")}>
            Request a call
          </Button>
        </article>
        <article>
          <MessageSquare />
          <h3>Web support</h3>
          <p>Open a support conversation and include screenshots or files.</p>
          <Button onClick={() => notify("Support chat opened")}>
            Start support chat
          </Button>
        </article>
        <article>
          <FileText />
          <h3>Help center</h3>
          <p>
            Find guidance for meetings, files, calls, security, and workspace
            booking.
          </p>
          <Button variant="outline">Browse articles</Button>
        </article>
      </div>
    </Panel>
  );
}
function FormShell({ title, description, children, onSubmit }: any) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(Object.fromEntries(new FormData(e.currentTarget)));
        }}
      >
        {children}
        <Button type="submit">Save and submit</Button>
      </form>
    </>
  );
}
function TaskForm({ submit }: any) {
  return (
    <FormShell
      title="Create a team task"
      description="Assign work and track it through completion."
      onSubmit={submit}
    >
      <label>
        Task title
        <Input name="title" required />
      </label>
      <label>
        Assign to
        <Input name="assignee" required />
      </label>
      <div className="formrow">
        <label>
          Priority
          <select name="priority">
            <option>Normal</option>
            <option>High</option>
            <option>Low</option>
          </select>
        </label>
        <label>
          Due date
          <Input name="due" type="date" required />
        </label>
      </div>
      <input name="status" value="To do" readOnly hidden />
    </FormShell>
  );
}
function AnnouncementForm({ submit }: any) {
  return (
    <FormShell
      title="Publish a Message Center update"
      description="Share a product change, maintenance notice, or important announcement."
      onSubmit={submit}
    >
      <label>
        Title
        <Input name="title" required />
      </label>
      <label>
        Category
        <select name="category">
          <option>Announcement</option>
          <option>Product change</option>
          <option>Planned maintenance</option>
          <option>Service advisory</option>
        </select>
      </label>
      <label>
        Message
        <Textarea name="body" rows={5} required />
      </label>
      <label>
        Publish date
        <Input
          name="publishDate"
          type="date"
          defaultValue={new Date().toISOString().slice(0, 10)}
          required
        />
      </label>
      <input name="author" value="Oak Haven Administration" readOnly hidden />
    </FormShell>
  );
}
function QueueForm({ submit }: any) {
  return (
    <FormShell
      title="Add a queue call"
      description="Log an incoming or outgoing WhatsApp, PSTN, or VoIP call."
      onSubmit={submit}
    >
      <label>
        Caller or customer
        <Input name="caller" required />
      </label>
      <label>
        Phone or WhatsApp number
        <Input name="phone" required />
      </label>
      <label>
        Queue
        <select name="queue">
          <option>Reservations</option>
          <option>Guest Services</option>
          <option>Emergency Desk</option>
          <option>Front Desk</option>
        </select>
      </label>
      <div className="formrow">
        <label>
          Call channel
          <select name="type">
            <option>WhatsApp</option>
            <option>VoIP</option>
            <option>PSTN</option>
            <option>HavenConnect internal</option>
          </select>
        </label>
        <label>
          Direction
          <select name="direction">
            <option>Incoming</option>
            <option>Outgoing</option>
          </select>
        </label>
      </div>
    </FormShell>
  );
}
function ContactForm({ submit }: any) {
  return (
    <FormShell
      title="Add a new contact"
      description="Save a staff member, customer, vendor, or emergency-service contact."
      onSubmit={submit}
    >
      <label>
        Full name
        <Input name="name" required />
      </label>
      <div className="formrow">
        <label>
          Phone or WhatsApp number
          <Input name="phone" required />
        </label>
        <label>
          Email
          <Input name="email" type="email" required placeholder="name@oakhavensuites.com" pattern=".+@oakhavensuites\.com" />
        </label>
      </div>
      <div className="formrow">
        <label>
          Contact type
          <select name="contactType">
            <option>Customer</option>
            <option>Staff</option>
            <option>Vendor</option>
            <option>Emergency service</option>
          </select>
        </label>
        <label>
          Department or queue
          <select name="department">
            <option>Guest Services</option>
            <option>Reservations</option>
            <option>Front Desk</option>
            <option>Management</option>
            <option>Housekeeping</option>
            <option>Maintenance</option>
            <option>Security</option>
            <option>Emergency Desk</option>
          </select>
        </label>
      </div>
      <label>
        Preferred contact channel
        <select name="preferredChannel">
          <option>WhatsApp</option>
          <option>HavenConnect</option>
          <option>Phone</option>
          <option>Email</option>
        </select>
      </label>
      <label>
        Notes
        <Textarea
          name="notes"
          rows={3}
          placeholder="Guest context, vendor details, extension, or follow-up notes"
        />
      </label>
    </FormShell>
  );
}
function IntegrationCenter({ notify }: any) {
  const [tab, setTab] = useState("overview"),
    [data, setData] = useState<any>({
      connectors: [],
      webhooks: [],
      events: [],
    }),
    [busy, setBusy] = useState(true),
    [created, setCreated] = useState<any>(null),
    [name, setName] = useState(""),
    [channelName, setChannelName] = useState("General"),
    [selectedConnector, setSelectedConnector] = useState<any>(null);
  const load = async () => {
    setBusy(true);
    try {
      const r = await fetch("/api/integrations"),
        d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setData(d);
    } catch (e: any) {
      notify(e.message);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    load();
  }, []);
  const destinations: any = {
    whatsapp: "https://business.whatsapp.com/products/business-platform",
    google:
      "https://console.cloud.google.com/apis/library/calendar-json.googleapis.com",
    slack: "https://api.slack.com/apps",
    zoom: "https://marketplace.zoom.us/develop/create",
    front: "https://dev.frontapp.com/docs/getting-started",
  };
  const connect = (c: any) => {
    if (c.id === "webhook") {
      setTab("webhooks");
      return;
    }
    setSelectedConnector(c);
  };
  const create = async (e: any) => {
    e.preventDefault();
    const r = await fetch("/api/webhooks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, channel: channelName }),
      }),
      d = await r.json();
    if (!r.ok) {
      notify(d.error);
      return;
    }
    setCreated(d.item);
    setName("");
    await load();
    notify("Incoming webhook created");
  };
  return (
    <section className="integrations">
      <div className="integration-hero">
        <div>
          <p>HAVENCONNECT EXTENSIBILITY</p>
          <h2>Integration Center</h2>
          <span>
            Bring customer conversations, calendars, meetings, calls, and
            external services into one role-aware workspace.
          </span>
        </div>
        <button className="secure-setup" onClick={() => setTab("signin")}>
          <ShieldCheck />
          <b>Secure connection setup</b>
          <small>
            Open provider authorization. Credentials remain provider-managed.
          </small>
          <ChevronRight />
        </button>
      </div>
      <nav
        className="integration-tabs"
        aria-label="Integration Center sections"
      >
        {[
          ["overview", "Overview"],
          ["signin", "Sign in to Apps"],
          ["automation", "AI Workflows"],
          ["webhooks", "Incoming Webhooks"],
          ["activity", "Activity"],
        ].map((x) => (
          <button
            key={x[0]}
            className={tab === x[0] ? "active" : ""}
            onClick={() => setTab(x[0])}
          >
            {x[1]}
          </button>
        ))}
      </nav>
      {busy ? (
        <div className="integration-empty">Loading connectors…</div>
      ) : (
        <>
          {tab === "overview" && (
            <>
              <div className="connector-grid">
                {data.connectors.map((c: any) => (
                  <article key={c.id} className={`connector ${c.id}`}>
                    <div className="connector-icon">
                      {c.id === "whatsapp"
                        ? "WA"
                        : c.id === "google"
                          ? "G"
                          : c.id === "slack"
                            ? "S"
                            : c.id === "zoom"
                              ? "Z"
                              : c.id === "front"
                                ? "F"
                                : "↗"}
                    </div>
                    <div>
                      <h3>{c.name}</h3>
                      <span className={c.state === "Ready" ? "ready" : "setup"}>
                        {c.state}
                      </span>
                    </div>
                    <ul>
                      {c.capabilities.map((x: string) => (
                        <li key={x}>{x}</li>
                      ))}
                    </ul>
                    <Button
                      className="authorize-btn"
                      onClick={() => connect(c)}
                    >
                      {c.state === "Ready"
                        ? "Configure"
                        : "Sign in and authorize"}
                    </Button>
                  </article>
                ))}
              </div>
              <div className="routing-flow">
                <h3>Smart conversation routing</h3>
                <div>
                  <span>WhatsApp or external event</span>
                  <ChevronRight />
                  <span>Haven Triage Agent</span>
                  <ChevronRight />
                  <span>Best queue and available staff</span>
                  <ChevronRight />
                  <span>History, notes, and outcome</span>
                </div>
              </div>
            </>
          )}
          {tab === "signin" && (
            <div className="signin-apps">
              <div className="signin-note">
                <LockKeyhole />
                <div>
                  <b>Administrator authorization required</b>
                  <span>
                    Sign in on the provider’s official page. HavenConnect never
                    asks staff to paste provider passwords.
                  </span>
                </div>
              </div>
              {data.connectors
                .filter((c: any) => c.id !== "webhook")
                .map((c: any) => (
                  <article key={c.id}>
                    <div className={`connector-icon ${c.id}`}>
                      {c.id === "whatsapp"
                        ? "WA"
                        : c.id === "google"
                          ? "G"
                          : c.id === "slack"
                            ? "S"
                            : c.id === "zoom"
                              ? "Z"
                              : "F"}
                    </div>
                    <div>
                      <h3>{c.name}</h3>
                      <p>
                        {c.id === "whatsapp"
                          ? "Open Meta Business sign-in, then connect the Oak Haven WhatsApp Business number and webhook."
                          : c.id === "google"
                            ? "Authorize Gmail and Google Calendar for meeting creation, reminders, summaries, and attendee calls."
                            : c.id === "slack"
                              ? "Authorize slash commands, meeting notifications, AI summaries, and recording links in approved Slack workspaces."
                              : c.id === "zoom"
                                ? "Create or authorize the Oak Haven Zoom app, then approve HavenConnect for the required meeting and phone scopes."
                                : "Open Front’s official developer setup guide to create and authorize the Oak Haven integration."}
                      </p>
                      <span className="setup">
                        Administrator setup required
                      </span>
                    </div>
                    <Button
                      className="authorize-btn"
                      onClick={() => connect(c)}
                    >
                      Sign in and authorize
                    </Button>
                  </article>
                ))}
            </div>
          )}
          {tab === "automation" && <CrossPlatformAutomation notify={notify} />}
          {tab === "webhooks" && (
            <div className="webhook-layout">
              <form onSubmit={create}>
                <h3>Create an incoming webhook</h3>
                <p>
                  Route an HTTP POST from an external service or chatbot
                  directly into a HavenConnect channel.
                </p>
                <label>
                  Webhook name
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Example: Website guest alerts"
                    required
                  />
                </label>
                <label>
                  Destination channel
                  <select
                    value={channelName}
                    onChange={(e) => setChannelName(e.target.value)}
                  >
                    {channels.map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                </label>
                <Button type="submit">
                  <Plus /> Generate endpoint and token
                </Button>
              </form>
              <section>
                <h3>Channel webhooks</h3>
                {created && (
                  <div className="credential-card">
                    <b>Copy these credentials now</b>
                    <label>
                      Endpoint
                      <code>
                        {location.origin}
                        {created.endpoint}
                      </code>
                    </label>
                    <label>
                      Verification token<code>{created.token}</code>
                    </label>
                    <small>
                      Send JSON with a <code>text</code> field and include this
                      token as <code>x-haven-token</code> or a Bearer token.
                    </small>
                  </div>
                )}
                {data.webhooks.map((x: any) => (
                  <article className="webhook-row" key={x.id}>
                    <div>
                      <b>{x.name}</b>
                      <small>
                        #{x.channel} · {x.active ? "Active" : "Paused"}
                      </small>
                    </div>
                    <code>/api/hooks/{x.id}</code>
                  </article>
                ))}
                {!data.webhooks.length && !created && (
                  <div className="integration-empty">
                    No webhooks created yet.
                  </div>
                )}
              </section>
            </div>
          )}
          {tab === "activity" && (
            <div className="integration-activity">
              <div className="activity-head">
                <h3>Connector activity</h3>
                <Button variant="outline" onClick={load}>
                  Refresh
                </Button>
              </div>
              {data.events.map((x: any) => (
                <article key={x.id}>
                  <span>{x.provider}</span>
                  <div>
                    <b>{x.contactName || x.eventType}</b>
                    <p>{x.summary}</p>
                    <small>
                      #{x.channel} · {new Date(x.createdAt).toLocaleString()}
                    </small>
                  </div>
                  <em>{x.status}</em>
                </article>
              ))}
              {!data.events.length && (
                <div className="integration-empty">
                  Incoming messages and connector events will appear here.
                </div>
              )}
            </div>
          )}
          {selectedConnector && (
            <div
              className="connector-wizard"
              role="dialog"
              aria-modal="true"
              aria-label={`${selectedConnector.name} connection setup`}
            >
              <button
                className="wizard-backdrop"
                aria-label="Close connection setup"
                onClick={() => setSelectedConnector(null)}
              />
              <section>
                <button
                  className="wizard-close"
                  onClick={() => setSelectedConnector(null)}
                >
                  <X />
                </button>
                <div className={`connector-icon ${selectedConnector.id}`}>
                  {selectedConnector.id === "whatsapp"
                    ? "WA"
                    : selectedConnector.id === "google"
                      ? "G"
                      : selectedConnector.id === "slack"
                        ? "S"
                        : selectedConnector.id === "zoom"
                          ? "Z"
                          : "F"}
                </div>
                <p>SECURE PROVIDER SETUP</p>
                <h2>Connect {selectedConnector.name}</h2>
                <span>
                  Complete setup with an Oak Haven administrator account.
                  Provider credentials stay on the provider’s official
                  authorization page.
                </span>
                <ol>
                  <li>
                    Confirm you are authorized to manage the Oak Haven
                    organization account.
                  </li>
                  <li>
                    Create or select the Oak Haven integration application.
                  </li>
                  <li>
                    Approve only the permissions required for the listed
                    HavenConnect capabilities.
                  </li>
                  <li>
                    Return to HavenConnect to finish webhook and routing
                    configuration.
                  </li>
                </ol>
                {selectedConnector.id === "whatsapp" && (
                  <div className="wizard-warning">
                    <ShieldCheck />
                    <span>
                      <b>Meta error resolved</b>The former expired Meta Ads
                      destination has been removed. This link opens the current
                      WhatsApp Business Platform site first.
                    </span>
                  </div>
                )}
                <div className="wizard-actions">
                  <Button
                    variant="outline"
                    onClick={() => setSelectedConnector(null)}
                  >
                    Cancel
                  </Button>
                  <Button className="authorize-btn" asChild>
                    <a
                      href={destinations[selectedConnector.id]}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Continue to official setup <ChevronRight />
                    </a>
                  </Button>
                </div>
                <small>
                  HavenConnect cannot complete OAuth until the provider
                  application ID, secret, redirect URL, and administrator
                  approval are configured.
                </small>
              </section>
            </div>
          )}
        </>
      )}
    </section>
  );
}
function CrossPlatformAutomation({ notify }: any) {
  const [provider, setProvider] = useState("Google Workspace"),
    [topic, setTopic] = useState("Oak Haven weekly operations review"),
    [attendees, setAttendees] = useState(
      "manager@oakhavensuites.com, frontdesk@oakhavensuites.com",
    ),
    [date, setDate] = useState(
      new Date(Date.now() + 86400000).toISOString().slice(0, 16),
    ),
    [command, setCommand] = useState(
      "/havenconnect meeting Weekly operations review",
    ),
    [actions, setActions] = useState<any[]>([]),
    [busy, setBusy] = useState(false);
  const load = async () => {
    try {
      const r = await fetch("/api/agent-actions"),
        d = await r.json();
      if (r.ok) setActions(d.items || []);
    } catch {}
  };
  useEffect(() => {
    load();
  }, []);
  const request = async (
    agent: string,
    actionType: string,
    title: string,
    details: string,
  ) => {
    setBusy(true);
    try {
      const r = await fetch("/api/agent-actions", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            agent,
            provider,
            actionType,
            title,
            details,
            requestedBy: "Martins Idahosa",
          }),
        }),
        d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setActions((x) => [d.item, ...x]);
      notify("Agent action prepared for human approval");
    } catch (e: any) {
      notify(e.message);
    } finally {
      setBusy(false);
    }
  };
  const decide = async (id: number, status: string) => {
    const r = await fetch("/api/agent-actions", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, status }),
      }),
      d = await r.json();
    if (!r.ok) {
      notify(d.error);
      return;
    }
    setActions((x) => x.map((a) => (a.id === id ? d.item : a)));
    notify(`Agent action ${status.toLowerCase()}`);
  };
  const agents = [
    [
      "Smart Agenda Agent",
      "Pre-meeting",
      "Build an agenda from approved conversations, documents, and event context",
    ],
    [
      "Conflict Resolver",
      "Pre-meeting",
      "Suggest available times and flag double-bookings before invitations are sent",
    ],
    [
      "Meeting Moderator",
      "Live meeting",
      "Track timing, waiting-room approvals, call quality, sentiment, and participation",
    ],
    [
      "Action Item Agent",
      "Live meeting",
      "Extract decisions and prepare assigned tasks with deadlines",
    ],
    [
      "Executive Follow-up Agent",
      "Post-meeting",
      "Draft summaries, follow-ups, CRM updates, and next meetings",
    ],
    [
      "Absence Liaison Agent",
      "Post-meeting",
      "Prepare a personal one-minute briefing and actions for absent staff",
    ],
    [
      "Knowledge Copilot",
      "Staff chat",
      "Summarize long channels and answer from permitted Oak Haven information",
    ],
    [
      "Standup & Handoff Agent",
      "Staff chat",
      "Collect updates, surface blockers, and route completed work to the next team",
    ],
    [
      "WhatsApp Triage Agent",
      "Guest contact",
      "Summarize voice notes, draft replies, propose times, and hand off to staff",
    ],
  ];
  return (
    <div className="automation-studio">
      <section className="automation-compose">
        <div className="studio-head">
          <div>
            <span>AGENTIC WORKSPACE</span>
            <h3>Cross-platform meeting and communication studio</h3>
            <p>
              Prepare work across Google Workspace, Slack, Zoom, Teams, Google
              Meet, and WhatsApp. External actions wait for a person to approve
              them.
            </p>
          </div>
          <ShieldCheck />
        </div>
        <div className="provider-pills">
          {[
            "Google Workspace",
            "Slack",
            "Zoom",
            "Microsoft Teams",
            "Google Meet",
            "WhatsApp Business",
          ].map((x) => (
            <button
              className={provider === x ? "active" : ""}
              key={x}
              onClick={() => setProvider(x)}
            >
              {x}
            </button>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            request(
              "Smart Agenda Agent",
              "Meeting invitation",
              topic,
              `${date} · ${attendees}`,
            );
          }}
        >
          <label>
            Meeting topic
            <Input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              required
            />
          </label>
          <label>
            Attendees
            <Input
              value={attendees}
              onChange={(e) => setAttendees(e.target.value)}
              placeholder="Names or email addresses"
              required
            />
          </label>
          <div className="automation-row">
            <label>
              Date and time
              <Input
                type="datetime-local"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </label>
            <label>
              Meeting provider
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
              >
                <option>HavenConnect</option>
                <option>Google Meet</option>
                <option>Zoom</option>
                <option>Microsoft Teams</option>
              </select>
            </label>
          </div>
          <div className="meeting-options">
            <label>
              <input type="checkbox" defaultChecked /> Join with video on
            </label>
            <label>
              <input type="checkbox" /> Join with audio muted
            </label>
            <label>
              <input type="checkbox" /> Allow join before host
            </label>
            <label>
              <input type="checkbox" defaultChecked /> Add Haven Copilot
            </label>
          </div>
          <Button disabled={busy} type="submit">
            <CalendarDays /> Prepare meeting invitation
          </Button>
        </form>
        <div className="slash-console">
          <label>
            Slack command or channel action
            <Input
              value={command}
              onChange={(e) => setCommand(e.target.value)}
            />
          </label>
          <Button
            variant="outline"
            onClick={() =>
              request(
                "Knowledge Copilot",
                "Slack command",
                command,
                "Prepare the requested meeting, call, summary, or recording link for approval.",
              )
            }
          >
            <Send /> Run command
          </Button>
          <small>
            Try /havenconnect meeting, /havenconnect call, or /havenconnect
            summary.
          </small>
        </div>
      </section>
      <section className="agent-catalog">
        <h3>Specialized agents</h3>
        <div>
          {agents.map((a) => (
            <article key={a[0]}>
              <Sparkles />
              <div>
                <b>{a[0]}</b>
                <small>{a[1]}</small>
                <p>{a[2]}</p>
              </div>
              <Button
                variant="outline"
                onClick={() =>
                  request(
                    a[0],
                    a[1],
                    `${a[0]} · ${topic}`,
                    `${provider} · ${attendees}`,
                  )
                }
              >
                Prepare
              </Button>
            </article>
          ))}
        </div>
      </section>
      <section className="approval-queue">
        <div className="activity-head">
          <div>
            <h3>Human approval queue</h3>
            <p>
              Agents inherit the requesting staff member’s permissions. Nothing
              external is sent or changed until approved.
            </p>
          </div>
          <Button variant="outline" onClick={load}>
            Refresh
          </Button>
        </div>
        {actions.map((a) => (
          <article key={a.id}>
            <div>
              <b>{a.title}</b>
              <span>
                {a.agent} · {a.provider}
              </span>
              <small>
                {a.actionType} · {new Date(a.createdAt).toLocaleString()}
              </small>
            </div>
            <em className={a.status.toLowerCase().replace(" ", "-")}>
              {a.status}
            </em>
            {a.status === "Pending approval" && (
              <div>
                <Button onClick={() => decide(a.id, "Approved")}>
                  Approve
                </Button>
                <Button
                  variant="outline"
                  onClick={() => decide(a.id, "Rejected")}
                >
                  Reject
                </Button>
              </div>
            )}
          </article>
        ))}
        {!actions.length && (
          <div className="integration-empty">
            No agent actions awaiting review.
          </div>
        )}
      </section>
    </div>
  );
}
function QueueSettingsForm({ done }: any) {
  const [name, setName] = useState("Oak Haven Main Line"),
    [greeting, setGreeting] = useState(
      "Welcome to Oak Haven Lodging and Suites. Please choose an option.",
    ),
    [hours, setHours] = useState("24 hours");
  useEffect(() => {
    setName(localStorage.getItem("havenconnect-auto-attendant-name") || name);
    setGreeting(
      localStorage.getItem("havenconnect-auto-attendant-greeting") || greeting,
    );
    setHours(
      localStorage.getItem("havenconnect-auto-attendant-hours") || hours,
    );
  }, []);
  return (
    <>
      <DialogHeader>
        <DialogTitle>Auto-attendant settings</DialogTitle>
        <DialogDescription>
          Configure how PSTN and VoIP callers enter Oak Haven queues.
        </DialogDescription>
      </DialogHeader>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          localStorage.setItem("havenconnect-auto-attendant-name", name);
          localStorage.setItem(
            "havenconnect-auto-attendant-greeting",
            greeting,
          );
          localStorage.setItem("havenconnect-auto-attendant-hours", hours);
          done("Auto-attendant settings saved");
        }}
      >
        <label>
          Auto-attendant name
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </label>
        <label>
          Voice greeting
          <Textarea
            value={greeting}
            onChange={(e) => setGreeting(e.target.value)}
            rows={4}
            required
          />
        </label>
        <label>
          Operating hours
          <select value={hours} onChange={(e) => setHours(e.target.value)}>
            <option>24 hours</option>
            <option>Hotel business hours</option>
            <option>Custom schedule</option>
          </select>
        </label>
        <label>
          Press 1 routes to
          <select defaultValue="Reservations">
            <option>Reservations</option>
            <option>Guest Services</option>
            <option>Front Desk</option>
          </select>
        </label>
        <label>
          Press 2 routes to
          <select defaultValue="Guest Services">
            <option>Guest Services</option>
            <option>Reservations</option>
            <option>Emergency Desk</option>
          </select>
        </label>
        <Button type="submit">Save auto attendant</Button>
      </form>
    </>
  );
}
function MeetingForm({ done }: any) {
  return (
    <FormShell
      title="Schedule a meeting"
      description="Create the meeting, invite attendees, and share it with the General channel."
      onSubmit={done}
    >
      <label>
        Meeting title
        <Input name="title" required placeholder="Operations review" />
      </label>
      <div className="formrow">
        <label>
          Date
          <Input name="date" type="date" required />
        </label>
        <label>
          Time
          <Input name="time" type="time" required />
        </label>
      </div>
      <label>
        Attendees
        <Input
          name="attendees"
          required
          placeholder="Names or email addresses"
        />
      </label>
      <label>
        Meeting type
        <select name="type">
          <option>HavenConnect video</option>
          <option>Hybrid meeting</option>
          <option>Audio conference</option>
        </select>
      </label>
      <label>
        Agenda
        <Textarea
          name="agenda"
          rows={4}
          placeholder="Topics, decisions, and desired outcomes"
        />
      </label>
    </FormShell>
  );
}
function ShiftForm({ submit }: any) {
  return (
    <FormShell
      title="Schedule a staff shift"
      description="Add day or night coverage to the shared schedule."
      onSubmit={submit}
    >
      <label>
        Employee
        <Input name="employee" required />
      </label>
      <label>
        Department
        <select name="department">
          <option>Front Desk</option>
          <option>Housekeeping</option>
          <option>Management</option>
          <option>Maintenance</option>
          <option>Security</option>
          <option>Kitchen</option>
        </select>
      </label>
      <label>
        Date
        <Input name="date" type="date" required />
      </label>
      <div className="formrow">
        <label>
          Starts
          <Input name="start" type="time" required />
        </label>
        <label>
          Ends
          <Input name="end" type="time" required />
        </label>
      </div>
    </FormShell>
  );
}
function NoteForm({ submit }: any) {
  return (
    <FormShell
      title="Submit a team note"
      description="Save a handover, meeting decision, or operational update."
      onSubmit={submit}
    >
      <label>
        Note title
        <Input name="title" required />
      </label>
      <label>
        Details
        <Textarea name="content" rows={6} required />
      </label>
      <input name="author" value="Martins Idahosa" readOnly hidden />
    </FormShell>
  );
}
function FileForm({ done }: any) {
  const [busy, setBusy] = useState(false),
    [err, setErr] = useState("");
  return (
    <>
      <DialogHeader>
        <DialogTitle>Upload a shared file</DialogTitle>
        <DialogDescription>
          Staff can securely download it from HavenConnect. Maximum 15 MB.
        </DialogDescription>
      </DialogHeader>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const r = await fetch("/api/files", {
            method: "POST",
            body: new FormData(e.currentTarget),
          });
          const d = await r.json();
          setBusy(false);
          if (!r.ok) setErr(d.error);
          else done();
        }}
      >
        <label>
          Choose file
          <Input name="file" type="file" required />
        </label>
        {err && <p className="error">{err}</p>}
        <Button disabled={busy} type="submit">
          <FolderUp />
          {busy ? "Uploading…" : "Upload file"}
        </Button>
      </form>
    </>
  );
}
function CopilotHub({ items, channel, notify, createTask, beginCall, navigate }: any) {
  const agents = [
    {
      id: "communications",
      name: "Communications Agent",
      work: "Drafts replies and improves staff messages",
      icon: MessageSquare,
    },
    {
      id: "call",
      name: "Phone Agent",
      work: "Answers, qualifies, coaches, books, and hands off calls",
      icon: PhoneCall,
    },
    {
      id: "discovery",
      name: "Discovery Agent",
      work: "Surfaces relevant rooms, services, content, and answers",
      icon: Search,
    },
    {
      id: "sales",
      name: "Sales Agent",
      work: "Compares options and guides informed reservations",
      icon: BarChart3,
    },
    {
      id: "copilot",
      name: "Human Co-Pilot",
      work: "Supports employees across calls, meetings, chat, and workflows",
      icon: Headphones,
    },
    {
      id: "retention",
      name: "Retention Agent",
      work: "Coordinates reminders, loyalty, and guest re-engagement",
      icon: Users,
    },
    {
      id: "meeting",
      name: "Meeting Agent",
      work: "Builds agendas, summaries, decisions, and actions",
      icon: Video,
    },
    {
      id: "whatsapp",
      name: "WhatsApp Guest Agent",
      work: "Handles guest questions and staff handoffs",
      icon: Phone,
    },
    {
      id: "operations",
      name: "Operations Agent",
      work: "Finds priorities across tasks, queues, and shifts",
      icon: Activity,
    },
    {
      id: "safety",
      name: "Safety Agent",
      work: "Classifies and escalates urgent incidents",
      icon: ShieldCheck,
    },
  ];
  const [selected, setSelected] = useState("operations"),
    [surface, setSurface] = useState("Voice"),
    [services, setServices] = useState<any>({ loading: true }),
    [prompt, setPrompt] = useState(""),
    [thread, setThread] = useState<any[]>([
      {
        role: "agent",
        text: "Hello Martins. I’m Haven Copilot. Ask me to prepare a meeting, improve a message, summarize a call, prioritize work, or create an operational task.",
      },
    ]),
    [busy, setBusy] = useState(false);
  const surfaces = [
    { name: "Voice", destination: "calls", agent: "call", service: "webrtc", action: "Open softphone" },
    { name: "Video avatar", destination: "meet", agent: "meeting", service: "video", action: "Open video workspace" },
    { name: "Staff chat", destination: "chat", agent: "communications", service: "workspace", action: "Open staff chat" },
    { name: "WhatsApp", destination: "integrations", agent: "whatsapp", service: "whatsapp", action: "Open WhatsApp connection" },
    { name: "Kiosk", destination: "agent", agent: "discovery", service: "workspace", action: "Open guest kiosk" },
    { name: "Digital human", destination: "agent", agent: "copilot", service: "openai", action: "Open digital concierge" },
    { name: "Hologram-ready", destination: "events", agent: "copilot", service: "video", action: "Open presentation output" },
  ];
  useEffect(() => {
    fetch("/api/communications/status").then((response) => response.json()).then(setServices).catch(() => setServices({ loading: false }));
  }, []);
  const active = agents.find((x) => x.id === selected)!;
  const activeSurface = surfaces.find((item) => item.name === surface)!;
  const surfaceReady = activeSurface.service === "workspace" || Boolean(services[activeSurface.service]);
  const selectSurface = (item: typeof surfaces[number]) => {
    setSurface(item.name);
    setSelected(item.agent);
    setThread((current) => [...current, { role: "agent", text: `${item.name} mode selected. ${surfaceReady ? "The connected workspace is ready." : "Open its setup destination to complete the required service connection."}` }]);
    notify(`${item.name} mode selected`);
  };
  const openSurface = () => {
    if (surface === "Voice" && surfaceReady) return beginCall();
    navigate(activeSurface.destination, activeSurface.name);
  };
  const respond = (q: string) => {
    const l = q.toLowerCase(),
      open = (items.tasks || []).filter(
        (x: any) => x.status !== "Completed",
      ).length,
      waiting = (items.queues || []).filter(
        (x: any) => x.status === "Waiting",
      ).length;
    if (l.includes("meeting") || selected === "meeting")
      return `Meeting brief prepared: review arrivals, open guest requests, room readiness, and security coverage. I recommend assigning an owner and due time to every action before closing.`;
    if (l.includes("whatsapp") || selected === "whatsapp")
      return `Suggested guest reply: “Thank you for contacting Oak Haven. I can help with reservations, directions, or guest services. Please share your preferred dates or reservation ID.” I will hand the conversation to Reservations when booking details are confirmed.`;
    if (l.includes("call") || selected === "call")
      return `Phone Agent is ready: I can identify intent, answer routine questions, qualify the request, book a follow-up, capture notes, and hand complex moments to a staff member with full context.`;
    if (l.includes("discover") || l.includes("find") || selected === "discovery")
      return `Discovery Agent is ready to interpret the guest’s needs and surface the most relevant Oak Haven room, service, policy, or supporting information with clear next steps.`;
    if (l.includes("sales") || l.includes("compare") || l.includes("reserve") || selected === "sales")
      return `Sales Agent is ready to compare room options, explain value, resolve booking questions, and guide the guest toward an informed reservation without pressure.`;
    if (l.includes("employee") || l.includes("workflow") || selected === "copilot")
      return `Human Co-Pilot is ready beside your team with real-time knowledge, message support, meeting guidance, call coaching, and task execution across this workspace.`;
    if (l.includes("retain") || l.includes("loyalty") || l.includes("follow-up") || selected === "retention")
      return `Retention Agent is ready to prepare a relevant follow-up, stay reminder, loyalty message, or personalized recommendation while preserving guest context and staff approval.`;
    if (
      l.includes("emergency") ||
      l.includes("security") ||
      selected === "safety"
    )
      return `Safety workflow activated: confirm location and immediate danger, notify the Emergency Desk and Shift Supervisor, preserve the report, and escalate to management. Contact public emergency services directly when required.`;
    if (
      l.includes("message") ||
      l.includes("reply") ||
      selected === "communications"
    )
      return `Clear staff message: “Please confirm the assigned action, expected completion time, and any support required. Update the channel when the work is complete or needs escalation.”`;
    return `Operations insight: ${open} open task${open === 1 ? "" : "s"} and ${waiting} waiting queue call${waiting === 1 ? "" : "s"}. Review guest-impacting and safety work first, then confirm room readiness and today’s handovers.`;
  };
  const ask = async (e?: any) => {
    e?.preventDefault();
    const q = prompt.trim();
    if (!q) return;
    setThread((x) => [...x, { role: "staff", text: q }]);
    setPrompt("");
    setBusy(true);
    try {
      const response = await fetch("/api/copilot", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt: q, agent: active.name, context: { channel, tasks: (items.tasks || []).slice(0, 20), queues: (items.queues || []).slice(0, 20) } }) });
      const data = await response.json();
      setThread((x) => [...x, { role: "agent", text: response.ok ? data.message : data.error || respond(q) }]);
    } catch { setThread((x) => [...x, { role: "agent", text: respond(q) }]); }
    setBusy(false);
  };
  const task = async () => {
    await createTask({
      title: `Copilot follow-up · ${active.name}`,
      assignee: "Martins Idahosa",
      priority: "High",
      due: new Date().toISOString().slice(0, 10),
      status: "To do",
    });
    notify("Copilot action saved to Team Tasks");
  };
  return (
    <section className="copilot">
      <div className="copilot-top">
        <div>
          <p>OAK HAVEN AGENTIC AI</p>
          <h2>Haven Copilot</h2>
          <span>
            Human-like assistance across calls, video, conferences, staff chat,
            WhatsApp, guest journeys, and physical hospitality experiences.
          </span>
        </div>
        <div className="copilot-state">
          <Sparkles />
          <b>{active.name}</b>
          <small>Ready · permission-aware</small>
        </div>
      </div>
      <div className="haven-presence" aria-label="Haven interaction surfaces">
        {surfaces.map((item) => <button type="button" aria-pressed={surface === item.name} className={surface === item.name ? "active" : ""} key={item.name} onClick={() => selectSurface(item)}>{item.name}</button>)}
      </div>
      <section className="surface-console" aria-live="polite">
        <div><span>ACTIVE SURFACE</span><strong>{activeSurface.name}</strong><small>{surfaceReady ? "Connected and ready" : "Connection setup required"}</small></div>
        <p>{activeSurface.name === "Voice" ? "Start an AI-assisted browser call with microphone controls and live notes." : activeSurface.name === "Video avatar" ? "Open HavenMeet for camera, microphone, avatar, and conferencing controls." : activeSurface.name === "Staff chat" ? "Move directly into Oak Haven channels and staff conversations." : activeSurface.name === "WhatsApp" ? "Open the Integration Center to connect and route the approved WhatsApp Business entry point." : activeSurface.name === "Kiosk" ? "Open the guest-facing concierge and directions experience." : activeSurface.name === "Digital human" ? "Open the voice-enabled Haven concierge for guided guest assistance." : "Open the multilingual presentation workspace for connected display output."}</p>
        <Button onClick={openSurface}>{activeSurface.name === "Voice" ? <Phone /> : activeSurface.name === "Video avatar" || activeSurface.name === "Hologram-ready" ? <Video /> : activeSurface.name === "Staff chat" || activeSurface.name === "WhatsApp" ? <MessageSquare /> : <Sparkles />}{activeSurface.action}</Button>
      </section>
      <div className="copilot-grid">
        <aside>
          <h3>Specialized agents</h3>
          {agents.map(({ id, name, work, icon: I }) => (
            <button
              key={id}
              className={selected === id ? "active" : ""}
              onClick={() => {
                setSelected(id);
                setThread((x) => [
                  ...x,
                  {
                    role: "agent",
                    text:
                      id === "operations"
                        ? "Operations Agent is active. I am reviewing open tasks, waiting calls, shift coverage, and guest-impacting priorities now."
                        : `${name} is active and ready to help with ${work.toLowerCase()}.`,
                  },
                ]);
                notify(`${name} activated`);
              }}
            >
              <I />
              <span>
                <b>{name}</b>
                <small>{work}</small>
              </span>
            </button>
          ))}
        </aside>
        <main>
          <div className="copilot-context">
            <span>
              Working in <b>#{channel}</b>
            </span>
            <span>{(items.messages || []).length} messages</span>
            <span>
              {
                (items.tasks || []).filter((x: any) => x.status !== "Completed")
                  .length
              }{" "}
              open tasks
            </span>
          </div>
          <div className="copilot-thread">
            {thread.map((m, i) => (
              <div key={i} className={m.role}>
                <b>{m.role === "agent" ? active.name : "You"}</b>
                <p>{m.text}</p>
              </div>
            ))}
            {busy && (
              <div className="agent thinking">
                Haven is coordinating the right agent…
              </div>
            )}
          </div>
          <div className="copilot-prompts">
            <button onClick={() => setPrompt("Summarize today’s priorities")}>
              Today’s priorities
            </button>
            <button onClick={() => setPrompt("Prepare our operations meeting")}>
              Prepare meeting
            </button>
            <button onClick={() => setPrompt("Draft a WhatsApp guest reply")}>
              Guest reply
            </button>
            <button onClick={() => setPrompt("Help with an emergency report")}>
              Safety workflow
            </button>
            <button onClick={() => setPrompt("Compare rooms for this guest and recommend the best fit")}>
              Guided discovery
            </button>
            <button onClick={() => setPrompt("Prepare a personalized guest follow-up")}>
              Retention follow-up
            </button>
          </div>
          <form onSubmit={ask}>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={`Ask ${active.name}…`}
            />
            <Button type="submit">
              <Send /> Ask Copilot
            </Button>
          </form>
          <footer>
            <Button
              className="action-green"
              onClick={() => {
                setPrompt("Summarize today’s operational priorities");
                notify(
                  "Operations Agent is ready—select Ask Copilot to run the analysis",
                );
              }}
            >
              <Sparkles /> Run Operations Agent
            </Button>
            <Button variant="outline" onClick={task}>
              <CheckCircle2 /> Create task
            </Button>
            <Button variant="outline" onClick={beginCall}>
              <Phone /> Start AI-assisted call
            </Button>
            <Button variant="outline" asChild>
              <a href={mapUrl} target="_blank" rel="noreferrer">
                <MapPin /> Guest directions
              </a>
            </Button>
          </footer>
        </main>
      </div>
    </section>
  );
}
function CallRoom({ call, mic, setMic, end }: any) {
  const [insight, setInsight] = useState(
      "Haven is listening for commitments, guest concerns, and follow-up actions.",
    ),
    [mode, setMode] = useState<"audio" | "video">("audio"),
    [dialNumber, setDialNumber] = useState(""),
    [dialing, setDialing] = useState(false),
    [notes, setNotes] = useState<string[]>([]),
    [videoStream, setVideoStream] = useState<MediaStream | null>(null);
  const preview = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    if (preview.current) preview.current.srcObject = videoStream;
    return () => videoStream?.getTracks().forEach((track) => track.stop());
  }, [videoStream]);
  const selectMode = async (next: "audio" | "video") => {
    if (next === "audio") {
      videoStream?.getTracks().forEach((track) => track.stop());
      setVideoStream(null);
      setMode("audio");
      return;
    }
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false,
      });
      setVideoStream(media);
      setMode("video");
      setInsight(
        "Video is active. Haven is ready to coach the call and capture follow-up actions.",
      );
    } catch {
      setInsight(
        "Camera permission is required. Allow camera access in the browser and select Video Call again.",
      );
    }
  };
  const coach = () => {
    const text =
      "Suggested response: confirm the request, state the responsible department, and agree on a clear follow-up time.";
    setInsight(text);
    setNotes((current) => [
      `Coach · ${new Date().toLocaleTimeString()} · ${text}`,
      ...current,
    ]);
  };
  const capture = () => {
    const text =
      "Call note saved: guest follow-up discussed · Front Desk owner · confirmation required before end of shift.";
    setInsight(text);
    setNotes((current) => [
      `Note · ${new Date().toLocaleTimeString()} · ${text}`,
      ...current,
    ]);
  };
  const dial = () => {
    if (!dialNumber.trim()) {
      setInsight("Enter a phone number before starting the call.");
      return;
    }
    playPhoneTone("dial");
    setDialing(true);
    setInsight(`Calling ${dialNumber} · Haven Phone Agent is preparing live coaching and notes.`);
    setTimeout(() => {
      playPhoneTone("ringback");
      setDialing(false);
      setInsight(`Connected to ${dialNumber} · Haven Phone Agent is listening for intent and next steps.`);
    }, 700);
  };
  return (
    <div className="callroom">
      <DialogHeader>
        <DialogTitle>Oak Haven staff call</DialogTitle>
        <DialogDescription>
          Secure browser audio call · Haven Call Agent active
        </DialogDescription>
      </DialogHeader>
      <div className="call-type-tabs" role="tablist" aria-label="Call type">
        <button
          className={mode === "audio" ? "active" : ""}
          onClick={() => selectMode("audio")}
        >
          <Phone /> Audio Call
        </button>
        <button
          className={mode === "video" ? "active" : ""}
          onClick={() => selectMode("video")}
        >
          <Video /> Video Call
        </button>
      </div>
      <section className="call-dialer" aria-label="Phone dial pad">
        <div className="dialer-display">
          <Input value={dialNumber} onChange={(event) => setDialNumber(event.target.value.replace(/[^0-9+*#() -]/g, ""))} placeholder="Enter a name or phone number" inputMode="tel" aria-label="Phone number" />
          <button type="button" onClick={() => setDialNumber((value) => value.slice(0, -1))} aria-label="Delete last digit">⌫</button>
        </div>
        <div className="dial-pad">
          {["1","2","3","4","5","6","7","8","9","*","0","#"].map((number) => <button type="button" key={number} onClick={() => { playPhoneTone("dtmf", number); setDialNumber((value) => value + number); }}>{number}</button>)}
        </div>
        <div className="dialer-actions">
          <button type="button" onClick={() => setDialNumber("")}>Clear</button>
          <Button type="button" className="action-green" onClick={dial} disabled={dialing}><PhoneCall />{dialing ? "Dialing…" : "Call"}</Button>
        </div>
      </section>
      <div className="ai-call-strip">
        <Sparkles />
        <span>{insight}</span>
      </div>
      {mode === "video" && videoStream ? (
        <video
          ref={preview}
          className="call-video-preview"
          autoPlay
          muted
          playsInline
        />
      ) : (
        <div className="callavatar">AO</div>
      )}
      <h3>Oak Haven staff call</h3>
      <p>{call ? "Connected · 00:01" : "Connecting…"}</p>
      <div className="ai-call-actions">
        <Button className="call-action" onClick={coach}>
          Coach me
        </Button>
        <Button className="call-action" onClick={capture}>
          Capture notes
        </Button>
      </div>
      {notes.length > 0 && (
        <div className="call-session-notes" aria-live="polite">
          <b>Call session activity</b>
          {notes.slice(0, 3).map((note) => (
            <span key={note}>{note}</span>
          ))}
        </div>
      )}
      <div>
        <Button
          variant={mic ? "default" : "outline"}
          onClick={() => setMic(!mic)}
        >
          {mic ? <Mic /> : <MicOff />}
        </Button>
        <Button className="hangup" onClick={end}>
          <PhoneOff /> End call
        </Button>
      </div>
    </div>
  );
}
function Meeting({ end, camera, setCamera }: any) {
  const [mic, setMic] = useState(false),
    [cameraStream, setCameraStream] = useState<MediaStream | null>(null),
    [screenStream, setScreenStream] = useState<MediaStream | null>(null),
    [recording, setRecording] = useState(false),
    [recordingConsent, setRecordingConsent] = useState(false),
    [audioProcessing, setAudioProcessing] = useState("Processing unavailable"),
    [captions, setCaptions] = useState(true),
    [translated, setTranslated] = useState(true),
    [sidePanel, setSidePanel] = useState<"ai" | "participants" | "chat" | "settings" | null>("ai"),
    [settingsPage, setSettingsPage] = useState("AI and Productivity"),
    [chatText, setChatText] = useState(""),
    [chatMessages, setChatMessages] = useState<string[]>([]),
    [participants, setParticipants] = useState<any[]>([{ id: "OH", name: "Oak Haven Staff", email: "staff@oakhavensuites.com", you: true }]),
    [meetingQuery, setMeetingQuery] = useState(""),
    [note, setNote] = useState("Haven Meeting Agent is capturing decisions and action items."),
    [summary, setSummary] = useState("");
  const cameraPreview = useRef<HTMLVideoElement | null>(null);
  const microphoneStream = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const recordedChunks = useRef<Blob[]>([]);
  useEffect(() => {
    if (cameraPreview.current) cameraPreview.current.srcObject = cameraStream;
    return () => cameraStream?.getTracks().forEach((track) => track.stop());
  }, [cameraStream]);
  useEffect(() => () => screenStream?.getTracks().forEach((track) => track.stop()), [screenStream]);
  useEffect(() => () => microphoneStream.current?.getTracks().forEach((track) => track.stop()), []);
  const toggleMic = async () => {
    if (microphoneStream.current) {
      microphoneStream.current.getTracks().forEach((track) => track.stop());
      microphoneStream.current = null;
      setMic(false);
      setNote("Microphone muted.");
      return;
    }
    try {
      microphoneStream.current = await navigator.mediaDevices.getUserMedia({ audio: { noiseSuppression: true, echoCancellation: true } });
      const settings = microphoneStream.current.getAudioTracks()[0]?.getSettings();
      setAudioProcessing(settings?.noiseSuppression === true ? "Noise suppression enabled" : "Device unsupported or processing unavailable");
      setMic(true);
      setNote("Microphone is live.");
    } catch { setNote("Allow microphone access to unmute."); }
  };
  const toggleRecording = async () => {
    if (recorder.current?.state === "recording") { recorder.current.stop(); return; }
    if (!recordingConsent) {
      const approved = window.confirm("Recording and transcription notice: all attendees must be informed and Oak Haven consent and retention rules must be satisfied before processing begins. Confirm that the required notice has been displayed and consent obtained.");
      if (!approved) { setNote("Recording was not started. Consent remains required."); return; }
      setRecordingConsent(true);
    }
    try {
      if (!microphoneStream.current) microphoneStream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      const tracks = [...microphoneStream.current.getAudioTracks(), ...((screenStream || cameraStream)?.getVideoTracks() || [])];
      const mediaRecorder = new MediaRecorder(new MediaStream(tracks));
      recordedChunks.current = [];
      mediaRecorder.ondataavailable = (event) => event.data.size && recordedChunks.current.push(event.data);
      mediaRecorder.onstop = () => {
        const link = document.createElement("a");
        link.href = URL.createObjectURL(new Blob(recordedChunks.current, { type: mediaRecorder.mimeType }));
        link.download = `HavenConnect-meeting-${new Date().toISOString().slice(0,19).replaceAll(":","-")}.webm`;
        link.click(); URL.revokeObjectURL(link.href); setRecording(false); setNote("Recording saved securely to this device.");
      };
      recorder.current = mediaRecorder; mediaRecorder.start(1000); setMic(true); setRecording(true); setNote("Meeting recording started.");
    } catch { setNote("Microphone permission is required to record this meeting."); }
  };
  const inviteParticipant = () => {
    const email = prompt("Enter an Oak Haven email address")?.trim().toLowerCase();
    if (!email) return;
    if (!email.endsWith("@oakhavensuites.com")) return setNote("Only verified @oakhavensuites.com accounts can join this staff meeting.");
    if (participants.some((person) => person.email === email)) return setNote("That Oak Haven account is already in the meeting.");
    const name = oakHavenDirectory.find((person) => person.email === email)?.name || email.split("@")[0].replaceAll(".", " ");
    setParticipants((current) => [...current, { id: name.slice(0,2).toUpperCase(), name, email, pending: true }]);
    setNote(`Invitation sent to ${email}. The participant will appear after joining.`);
  };
  const toggleCamera = async () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
      setCameraStream(null);
      setCamera(false);
      return;
    }
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false,
      });
      setCameraStream(media);
      setCamera(true);
    } catch {
      setNote(
        "Camera permission is required. Allow camera access in your browser and try again.",
      );
      setCamera(false);
    }
  };
  const toggleShare = async () => {
    if (screenStream) {
      screenStream.getTracks().forEach((track) => track.stop());
      setScreenStream(null);
      setNote("Screen sharing stopped.");
      return;
    }
    try {
      const media = await navigator.mediaDevices.getDisplayMedia({ video: true });
      media.getVideoTracks()[0]?.addEventListener("ended", () => setScreenStream(null));
      setScreenStream(media);
      setNote("You are sharing your screen with the meeting.");
    } catch {
      setNote("Screen sharing was cancelled or blocked by the browser.");
    }
  };
  const createSummary = () => {
    const text = chatMessages.length ? `Meeting summary based on ${chatMessages.length} chat message${chatMessages.length === 1 ? "" : "s"}. Review the meeting chat for confirmed decisions and follow-ups.` : "No meeting discussion has been captured yet. Start recording or use meeting chat before generating a summary.";
    setSummary(text);
    setNote("Meeting summary and three next steps generated.");
    setSidePanel("ai");
  };
  const askMeeting = () => {
    if (!meetingQuery.trim()) return;
    setNote(chatMessages.length ? `Haven answer: ${chatMessages.join(" ").slice(0,240)}` : "Haven has no verified meeting content to summarize yet.");
    setMeetingQuery("");
  };
  const settingSections = ["General", "Video & effects", "Audio", "Notifications", "Meetings", "Recording", "Share screen", "Chat", "Accessibility", "AI and Productivity"];
  const connectedParticipants = participants.filter((person) => !person.pending);
  return (
    <div className="meeting-workspace">
      <header className="meeting-topbar">
        <div><b>HavenConnect</b><span>Operations Stand-up · General</span></div>
        <div><ShieldCheck /><span>{recording ? "Recording active · attendees notified" : `AI support · ${audioProcessing}`}</span><time>00:18:42</time></div>
      </header>
      <div className="meeting-body">
        <main className="meeting-stage">
          <div className="meeting-status"><Sparkles /><span>{note}</span></div>
          <div className="videogrid zoom-grid">
            {connectedParticipants.map((x) => (
              <div className={x.you ? "you" : ""} key={x.id}>
                {x.you && cameraStream ? <video ref={cameraPreview} className="meeting-camera-preview" autoPlay muted playsInline /> : <i>{x.id}</i>}
                <span>{x.name}{x.you ? " (You)" : ""}</span>
                <small>{x.you && mic ? <Mic /> : <MicOff />}</small>
              </div>
            ))}
          </div>
          {captions && <div className="live-caption"><b>Live captions{translated ? " · English translation" : ""}</b><span>Captions will appear when a verified participant speaks.</span></div>}
        </main>
        {sidePanel && <aside className="meeting-sidepanel">
          <header><b>{sidePanel === "ai" ? "Haven AI Companion" : sidePanel === "participants" ? `Participants (${connectedParticipants.length})` : sidePanel === "chat" ? "Meeting chat" : "Settings"}</b><button onClick={() => setSidePanel(null)} aria-label="Close panel">Close</button></header>
          {sidePanel === "ai" && <div className="ai-companion-panel">
            <div className="ai-ready"><Sparkles /><div><b>Ask without interrupting</b><span>Catch up, clarify decisions, or find your next step.</span></div></div>
            <div className="meeting-query"><Input value={meetingQuery} onChange={(e)=>setMeetingQuery(e.target.value)} placeholder="What did I miss?" onKeyDown={(e)=>e.key==="Enter"&&askMeeting()} /><Button onClick={askMeeting}>Ask Haven</Button></div>
            <Button className="action-green wide-control" onClick={createSummary}><NotebookPen /> Generate meeting summary</Button>
            {summary && <article className="generated-summary"><b>Brief overview</b><p>{summary}</p><div><Button variant="outline" onClick={()=>navigator.clipboard?.writeText(summary)}><Copy /> Copy</Button><Button variant="outline" onClick={()=>setNote("Summary shared to meeting chat and prepared for email.")}><Send /> Share</Button></div></article>}
            <div className="ai-feature-list">
              <button onClick={()=>setNote("Smart chapters created: Arrivals, Room readiness, Security, Next steps.")}><Radio /><span><b>Smart recording</b><small>Highlights, chapters, topics, and next steps</small></span></button>
              <button onClick={()=>setTranslated(v=>!v)}><Languages /><span><b>Translated captions</b><small>{translated ? "English translation on" : "Translation off"}</small></span></button>
              <button onClick={()=>setNote("Three tasks extracted and ready for Team Tasks.")}><CheckCircle2 /><span><b>Extract tasks</b><small>Turn decisions into assigned follow-ups</small></span></button>
            </div>
          </div>}
          {sidePanel === "participants" && <div className="participant-list">{participants.map(x=><button key={x.email}><i>{x.id}</i><span><b>{x.name}{x.you?" (You)":""}</b><small>{x.pending ? `Invitation pending · ${x.email}` : x.you?"Host · verified Oak Haven account":x.email}</small></span>{x.pending ? <Mail /> : x.you && mic?<Mic />:<MicOff />}</button>)}<Button className="action-green" onClick={inviteParticipant}><Plus /> Invite Oak Haven account</Button></div>}
          {sidePanel === "chat" && <div className="meeting-chat"><div>{chatMessages.map((message,index)=><p key={index}>{message}</p>)}</div><form onSubmit={(e)=>{e.preventDefault();if(chatText.trim()){setChatMessages(v=>[...v,`You: ${chatText}`]);setChatText("")}}}><Textarea value={chatText} onChange={(e)=>setChatText(e.target.value)} placeholder="Message everyone"/><Button type="submit"><Send /> Send</Button></form></div>}
          {sidePanel === "settings" && <div className="meeting-settings"><nav>{settingSections.map(item=><button className={settingsPage===item?"active":""} onClick={()=>setSettingsPage(item)} key={item}>{item}</button>)}</nav><section><h3>{settingsPage}</h3>{settingsPage==="AI and Productivity" ? <div className="settings-cards">
            {[["Meeting summaries","Generate a brief overview, summary, decisions, and next steps automatically."],["Smart recordings","Create highlights, chapters, conversation analytics, topic indicators, and playlists."],["Translated captions","Translate live captions across supported languages."],["Meeting queries","Ask Haven what you missed without interrupting the meeting."],["Calls, voicemail & SMS","Summarize calls and Team SMS, prioritize voicemail, and extract tasks."],["Writing assistance","Draft chat and email responses using conversation context and selected tone."],["Whiteboard generation","Create stickies, tables, categories, and mind maps from a prompt."],["Continuous meeting chat","Keep the discussion and AI context available before, during, and after meetings."]].map(([title,text])=><label key={title}><span><b>{title}</b><small>{text}</small></span><input type="checkbox" defaultChecked /></label>)}
          </div> : <div className="settings-cards"><label><span><b>Use recommended {settingsPage.toLowerCase()} settings</b><small>Optimized for Oak Haven staff meetings and calls.</small></span><input type="checkbox" defaultChecked /></label><label><span><b>Remember my choice</b><small>Sync this preference across HavenConnect.</small></span><input type="checkbox" defaultChecked /></label></div>}</section></div>}
        </aside>}
      </div>
      <footer className="meeting-toolbar">
        <button className={!mic?"off":""} onClick={toggleMic}>{mic?<Mic/>:<MicOff/>}<span>{mic?"Mute":"Unmute"}</span></button>
        <button className={!cameraStream?"off":""} onClick={toggleCamera}>{cameraStream?<Video/>:<VideoOff/>}<span>{cameraStream?"Stop video":"Start video"}</span></button>
        <button onClick={()=>setSidePanel("participants")}><Users/><span>Participants</span><b>{connectedParticipants.length}</b></button>
        <button className={screenStream?"active":""} onClick={toggleShare}><Maximize2/><span>{screenStream?"Stop share":"Share"}</span></button>
        <button onClick={()=>setSidePanel("chat")}><MessageSquare/><span>Chat</span></button>
        <button onClick={()=>setNote("Reaction sent: Thank you!")}><Vote/><span>React</span></button>
        <button onClick={()=>setNote("Collaborative whiteboard opened. Changes are visible to authorized participants.")}><NotebookPen/><span>Whiteboard</span></button>
        <button onClick={()=>setNote("Breakout room manager opened. Private breakout content remains isolated.")}><Users/><span>Breakouts</span></button>
        <button onClick={()=>setNote("Meeting poll builder opened. Review the question before publishing.")}><Vote/><span>Polls</span></button>
        <button className={captions?"active":""} onClick={()=>setCaptions(v=>!v)}><Languages/><span>Captions</span></button>
        <button className={recording?"recording":""} onClick={toggleRecording}><Radio/><span>{recording?"Stop recording":"Record"}</span></button>
        <button className={sidePanel==="ai"?"active":""} onClick={()=>setSidePanel("ai")}><Sparkles/><span>Haven AI</span></button>
        <button onClick={()=>setSidePanel("settings")}><Settings2/><span>Settings</span></button>
        <button className="leave-control" onClick={end}><PhoneOff/><span>Leave</span></button>
      </footer>
    </div>
  );
}
function LocationForm({ onAsk }: any) {
  const [o, setO] = useState("");
  return (
    <form
      className="locationform"
      onSubmit={(e) => {
        e.preventDefault();
        if (o.trim()) onAsk(o);
      }}
    >
      <label>
        Guest’s starting location
        <Input
          value={o}
          onChange={(e) => setO(e.target.value)}
          placeholder="Example: Murtala Muhammed Airport"
          required
        />
      </label>
      <Button type="submit">
        <Send /> Ask Haven
      </Button>
    </form>
  );
}
