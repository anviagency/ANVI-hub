// ANVI — App shell, sidebar, routing
const { useState: useSApp } = React;

const NAV = [
  { key: "chat", icon: "spark", label: "Ask ANVI" },
  { key: "vacancies", icon: "briefcase", label: "Vacancies" },
  { key: "candidates", icon: "users", label: "Talent pool" },
  { key: "clients", icon: "building", label: "Clients" },
];

function Sidebar({ route, setRoute, onNew }) {
  const { RECRUITER } = window.ANVI;
  return (
    <aside className="sidebar">
      <div className="brand">
        <img className="brand-logo" src={(window.__resources && window.__resources.anviLogo) || "assets/anvi-logo.png"} alt="ANVI" />
      </div>
      <button className="new-btn" onClick={onNew}><Icon name="plus" size={17} /> New chat</button>
      <nav className="nav">
        {NAV.map(n => (
          <button key={n.key} className="nav-item" data-active={route === n.key || undefined} onClick={() => setRoute(n.key)}>
            <Icon name={n.icon} size={18} /> <span>{n.label}</span>
          </button>
        ))}
      </nav>
      <div className="recent">
        <div className="recent-label">Recent</div>
        {["Full-Stack for Andy", "ML Engineer · Vektor", "Cheaper React devs"].map(r => (
          <button key={r} className="recent-item" onClick={() => setRoute("chat")}>{r}</button>
        ))}
      </div>
      <div className="user">
        <Avatar initials={RECRUITER.initials} size={32} accent />
        <div className="user-id"><div className="user-name">{RECRUITER.name}</div><div className="user-role">{RECRUITER.role}</div></div>
        <Icon name="sliders" size={16} className="user-set" />
      </div>
    </aside>
  );
}

function App() {
  const [route, setRoute] = useSApp("chat");
  const [vac, setVac] = useSApp(null);
  const [client, setClient] = useSApp(null);
  const [drawerCand, setDrawerCand] = useSApp(null);
  const [shortlist, setShortlist] = useSApp(null);
  const [seedPrompt, setSeedPrompt] = useSApp(null);
  const [chatKey, setChatKey] = useSApp(0);

  const onAction = (action, payload) => {
    switch (action) {
      case "candidate": setDrawerCand(payload); break;
      case "client": setClient(payload); setRoute("clientdetail"); break;
      case "vacancy": setVac(payload && payload.id ? payload : null); setRoute(payload && payload.id ? "vacdetail" : "vacancies"); break;
      case "pipeline": setVac(payload); setRoute("vacdetail"); break;
      case "findVac": setSeedPrompt("Find the best candidates for " + payload.title); setChatKey(k => k+1); setRoute("chat"); break;
      case "shortlist": setShortlist(payload || {}); break;
      case "newvac": setSeedPrompt("Open a new Senior Full-Stack role for Andy"); setChatKey(k => k+1); setRoute("chat"); break;
      case "prompt": setSeedPrompt(payload); setChatKey(k => k+1); setRoute("chat"); break;
      default: break;
    }
  };

  const newChat = () => { setSeedPrompt(null); setChatKey(k => k + 1); setRoute("chat"); };

  const sideRoute = (route === "vacdetail" ? "vacancies" : route === "clientdetail" ? "clients" : route);
  return (
    <div className="app">
      <Sidebar route={sideRoute} setRoute={(r) => { setVac(null); setClient(null); setRoute(r); }} onNew={newChat} />
      <main className="main">
        {route === "chat" && <ChatView key={chatKey} onNavigate={onAction} seedPrompt={seedPrompt} />}
        {route === "vacancies" && <VacanciesView onAction={onAction} />}
        {route === "vacdetail" && vac && <VacancyDetail vac={vac} onBack={() => { setVac(null); setRoute("vacancies"); }} onAction={onAction} />}
        {route === "candidates" && <CandidatesView onAction={onAction} />}
        {route === "clients" && <ClientsView onAction={onAction} />}
        {route === "clientdetail" && client && <ClientDetail client={client} onBack={() => { setClient(null); setRoute("clients"); }} onAction={onAction} />}
      </main>

      {drawerCand && <CandidateDrawer cand={drawerCand} vacId={vac ? vac.id : "v-fullstack"} onClose={() => setDrawerCand(null)} onAction={(a, p) => { setDrawerCand(null); onAction(a, p); }} />}
      {shortlist && <ShortlistBuilder seed={shortlist} onClose={() => setShortlist(null)} />}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
