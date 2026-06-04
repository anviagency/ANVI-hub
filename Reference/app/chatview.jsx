// ANVI — Chat view (conversation state, streaming, input bar)
const { useState: useSV, useEffect: useEV, useRef: useRV } = React;

function ThinkingTrace({ lines, onDone }) {
  const [step, setStep] = useSV(0);
  useEV(() => {
    if (step >= lines.length) { const t = setTimeout(onDone, 260); return () => clearTimeout(t); }
    const t = setTimeout(() => setStep(step + 1), 420);
    return () => clearTimeout(t);
  }, [step]);
  return (
    <div className="trace">
      {lines.slice(0, step).map((l, i) => (
        <div key={i} className="trace-line" data-last={i === step - 1 && step < lines.length}>
          <span className="trace-dot" /> {l}
        </div>
      ))}
    </div>
  );
}

function AssistantMessage({ msg, onAction }) {
  const [phase, setPhase] = useSV(msg.instant ? "ready" : "thinking"); // thinking -> typing -> ready
  const [typed, done] = window.useTypewriter(msg.intro, 9, phase === "typing");
  useEV(() => { if (phase === "typing" && done) setPhase("ready"); }, [done, phase]);
  return (
    <div className="msg msg-ai">
      <div className="ai-badge"><Icon name="spark" size={15} /></div>
      <div className="msg-body">
        {phase === "thinking" && <ThinkingTrace lines={msg.thinking} onDone={() => setPhase("typing")} />}
        {phase !== "thinking" && (
          <>
            <p className="ai-intro">{phase === "ready" ? msg.intro : typed}<span className="caret" data-on={phase === "typing"} /></p>
            {phase === "ready" && (
              <div className="ai-reveal">
                <ResponseBody kind={msg.kind} data={msg.data} onAction={onAction} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function UserMessage({ text }) {
  return <div className="msg msg-user"><div className="user-bubble">{text}</div></div>;
}

function InputBar({ onSubmit, big }) {
  const [val, setVal] = useSV("");
  const [model, setModel] = useSV("Match");
  const ref = useRV(null);
  const submit = () => { if (!val.trim()) return; onSubmit(val.trim()); setVal(""); if (ref.current) ref.current.style.height = "auto"; };
  const onKey = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } };
  const grow = (e) => { e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 200) + "px"; };
  return (
    <div className={"inputbar" + (big ? " inputbar-big" : "")}>
      <textarea ref={ref} className="inputbar-ta" rows={1} value={val}
        placeholder={big ? "Describe a role, or ask me to find candidates…" : "Message ANVI…"}
        onChange={(e) => { setVal(e.target.value); grow(e); }} onKeyDown={onKey} />
      <div className="inputbar-row">
        <button className="ib-icon" title="Attach CV or Excel"><Icon name="plus" size={18} /></button>
        <div className="ib-spacer" />
        <button className="ib-model" onClick={() => setModel(model === "Match" ? "Deep" : "Match")}>
          {model} <Icon name="chevron" size={14} />
        </button>
        <button className="ib-icon"><Icon name="mic" size={18} /></button>
        <button className="ib-send" onClick={submit} data-active={!!val.trim()}>
          <Icon name="arrowUp" size={18} stroke={2} />
        </button>
      </div>
    </div>
  );
}

function ChatView({ onNavigate, seedPrompt }) {
  const [msgs, setMsgs] = useSV([]);
  const scrollRef = useRV(null);

  const pushPrompt = (text) => {
    const resp = window.interpret(text, {});
    setMsgs(m => [...m, { role: "user", text, id: Math.random() }, { role: "ai", ...resp, id: Math.random() }]);
  };

  useEV(() => { if (seedPrompt) pushPrompt(seedPrompt); }, [seedPrompt]);
  useEV(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [msgs]);

  const handleAction = (action, payload) => {
    if (action === "prompt") return pushPrompt(payload);
    if (action === "find") return pushPrompt("Find the best candidates for this role");
    if (action === "telegram") return pushPrompt("Draft a Telegram update for the pipeline");
    // navigation actions bubble up
    onNavigate(action, payload);
  };

  const empty = msgs.length === 0;

  if (empty) {
    return (
      <div className="chat-hero">
        <div className="hero-mark"><img src={(window.__resources && window.__resources.anviIcon) || "assets/anvi-icon.png"} alt="ANVI" /></div>
        <h1 className="hero-title">What are we hiring today, <span>Daria</span>?</h1>
        <p className="hero-sub">Open roles, search the talent pool, build client shortlists — all from here.</p>
        <div className="hero-input"><InputBar big onSubmit={pushPrompt} /></div>
        <div className="hero-starters">
          {window.STARTERS.map(s => (
            <button key={s.label} className="starter" onClick={() => pushPrompt(s.label)}>
              <span className="starter-ic"><Icon name={s.icon} size={16} /></span>
              <span>{s.label}</span>
              <Icon name="chevronR" size={15} className="starter-go" />
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="chat-wrap">
      <div className="chat-scroll" ref={scrollRef}>
        <div className="chat-thread">
          {msgs.map(m => m.role === "user"
            ? <UserMessage key={m.id} text={m.text} />
            : <AssistantMessage key={m.id} msg={m} onAction={handleAction} />)}
        </div>
      </div>
      <div className="chat-foot">
        <InputBar onSubmit={pushPrompt} />
        <div className="foot-hint">ANVI can make mistakes. Verify candidate details before sharing with clients.</div>
      </div>
    </div>
  );
}

Object.assign(window, { ChatView });
