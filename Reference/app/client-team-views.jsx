// ANVI Client Portal — My Team list, Employee PAGE, Report PAGE (no calendar here)
const { useState: useTV } = React;

// ---- Employee detail as a full page ----
function EmployeePage({ emp, onBack, onReport }) {
  const { COUNTRY_CAL } = window.CLIENT_TEAM;
  const cal = COUNTRY_CAL[emp.country];
  const log = window.CLIENT_TEAM.TEAM_LOG[emp.id] || [];
  return (
    <div className="cp-page cp-page-wide">
      <div className="cp-back-row">
        <button className="cp-back" onClick={onBack}><CIcon name="chevron" size={16} style={{ transform: "rotate(90deg)" }} /> Back to My Team</button>
      </div>
      <div className="cp-detail-hero">
        <div className={"cp-av emp-av-" + emp.avatarTone}>{emp.initials}<span className="cp-flag">{emp.flag}</span></div>
        <div style={{ flex: 1 }}>
          <div className="cp-d-name">{emp.name}</div>
          <div className="cp-d-title">{emp.role} · {emp.city}, {emp.country}</div>
        </div>
        <span className={"emp-status emp-status-" + (emp.status === "Active" ? "on" : "away")}>{emp.status}</span>
      </div>

      <div className="emp-grid">
        <div className="emp-col">
          <div className="emp-panel">
            <div className="cp-d-label"><CIcon name="wallet" size={13} /> Payroll · June 2026</div>
            <div className="emp-pay">
              <div className="emp-pay-main"><span>Monthly cost</span><b>${emp.monthly.toLocaleString()}</b></div>
              <div className="emp-pay-row"><span>Rate</span><b>${emp.rate}/hr · {emp.hoursMonth}h</b></div>
              <div className="emp-pay-row"><span>Working days · June</span><b>{cal.working} days</b></div>
              <div className="emp-pay-row"><span>Payment</span><b>{emp.payTerms}</b></div>
              <div className="emp-pay-row"><span>Next payout</span><b>{emp.nextPay}</b></div>
            </div>
          </div>

          <div className="emp-panel">
            <div className="cp-d-label"><CIcon name="briefcase" size={13} /> Contract & terms</div>
            <div className="emp-terms">
              <div><span>Type</span><b>{emp.contract}</b></div>
              <div><span>Started</span><b>{emp.started} · {emp.tenure}</b></div>
              <div><span>Notice</span><b>{emp.notice}</b></div>
              <div><span>Leave policy</span><b>{emp.paidLeavePolicy}</b></div>
            </div>
          </div>
        </div>

        <div className="emp-col">
          <div className="emp-panel">
            <div className="cp-d-label"><CIcon name="plane" size={13} /> Vacation balance</div>
            <div className="emp-vac">
              <div className="emp-vac-bar">
                <div className="emp-vac-used" style={{ width: (emp.vacation.used/emp.vacation.annual*100)+"%" }} />
                {emp.vacation.pending>0 && <div className="emp-vac-pend" style={{ width: (emp.vacation.pending/emp.vacation.annual*100)+"%", left:(emp.vacation.used/emp.vacation.annual*100)+"%" }} />}
              </div>
              <div className="emp-vac-legend">
                <span><i className="lg-used"/>{emp.vacation.used} used</span>
                {emp.vacation.pending>0 && <span><i className="lg-pend"/>{emp.vacation.pending} pending</span>}
                <span><i className="lg-bal"/>{emp.vacation.balance} left of {emp.vacation.annual}</span>
              </div>
              {emp.upcoming && (
                <div className="emp-upcoming">
                  <CIcon name="plane" size={14} />
                  <span><b>{emp.upcoming.type}</b> · {emp.upcoming.range} ({emp.upcoming.days}d)</span>
                  <span className={"cp-badge cp-badge-" + (emp.upcoming.status==="Approved"?"yes":"maybe")}>{emp.upcoming.status}</span>
                </div>
              )}
            </div>
          </div>

          <div className="emp-panel">
            <div className="cp-d-label"><CIcon name="list" size={13} /> Recent activity</div>
            <div className="emp-log">
              {log.map((l,i) => (
                <div key={i} className="emp-log-row">
                  <div className={"emp-log-ic emp-log-" + l.who}><CIcon name={l.icon} size={13} /></div>
                  <div className="emp-log-main"><div className="emp-log-text">{l.text}</div><div className="emp-log-when">{l.when}</div></div>
                  <span className="emp-log-status">{l.status}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="emp-actions">
        <button className="cp-cta-btn" onClick={() => onReport(emp.id)}><CIcon name="plane" size={15} /> Report time off</button>
        <button className="cp-mini" style={{flex:"none",padding:"0 16px",height:46}} onClick={() => onReport(emp.id)}><CIcon name="flag" size={15} /> Flag to ANVI</button>
        <button className="cp-mini" style={{flex:"none",padding:"0 16px",height:46}}><CIcon name="message" size={15} /> Message</button>
      </div>
    </div>
  );
}

// ---- Report time off / flag as a full page ----
function ReportPage({ emp, onBack }) {
  const [type, setType] = useTV("Vacation");
  const [range, setRange] = useTV("");
  const [note, setNote] = useTV("");
  const [done, setDone] = useTV(false);
  const types = [["Vacation","plane"],["Sick leave","sun"],["Unpaid leave","calendar"],["Flag to ANVI","flag"]];

  if (done) {
    return (
      <div className="cp-page">
        <div className="cp-back-row"><button className="cp-back" onClick={onBack}><CIcon name="chevron" size={16} style={{ transform: "rotate(90deg)" }} /> Back to My Team</button></div>
        <div className="emp-panel rm-done">
          <div className="sl-done-mark" style={{ background: "var(--good-bg)", color: "var(--good)" }}><CIcon name="check" size={28} stroke={2.2} /></div>
          <div className="rm-done-title">{type === "Flag to ANVI" ? "Sent to ANVI" : "Request submitted"}</div>
          <div className="rm-done-sub">{type === "Flag to ANVI" ? "Daria will follow up with you shortly." : `${type} ${range ? "· " + range : ""} for ${emp.name} sent to ANVI for approval. You'll be notified once confirmed.`}</div>
          <button className="cp-cta-btn" onClick={onBack}>Done</button>
        </div>
      </div>
    );
  }

  return (
    <div className="cp-page">
      <div className="cp-back-row"><button className="cp-back" onClick={onBack}><CIcon name="chevron" size={16} style={{ transform: "rotate(90deg)" }} /> Back to My Team</button></div>
      <div className="cp-detail-hero">
        <div className={"cp-av emp-av-" + emp.avatarTone}>{emp.initials}<span className="cp-flag">{emp.flag}</span></div>
        <div style={{ flex: 1 }}>
          <div className="cp-d-name" style={{ fontSize: 22 }}>Report for {emp.name}</div>
          <div className="cp-d-title">Log time off or flag something to ANVI</div>
        </div>
      </div>

      <div className="emp-panel">
        <div className="rm-body" style={{ padding: 0 }}>
          <div className="rm-field">
            <label>Type</label>
            <div className="rm-types">
              {types.map(([t,ic]) => (
                <button key={t} className={"rm-type" + (type===t?" on":"")} onClick={()=>setType(t)}><CIcon name={ic} size={15} /> {t}</button>
              ))}
            </div>
          </div>
          {type !== "Flag to ANVI" && (
            <div className="rm-field">
              <label>Dates</label>
              <input className="rm-input" value={range} onChange={e=>setRange(e.target.value)} placeholder="e.g. Jun 16 – Jun 20" />
            </div>
          )}
          <div className="rm-field">
            <label>{type === "Flag to ANVI" ? "What should ANVI know?" : "Note (optional)"}</label>
            <textarea className="rm-input rm-ta" rows={3} value={note} onChange={e=>setNote(e.target.value)}
              placeholder={type === "Flag to ANVI" ? "Performance, rate change, contract question…" : "Anything ANVI or the employee should know"} />
          </div>
          {type !== "Flag to ANVI" && (
            <div className="rm-bal"><CIcon name="plane" size={14} /> {emp.vacation.balance} of {emp.vacation.annual} vacation days remaining this year</div>
          )}
        </div>
      </div>

      <div className="emp-actions">
        <button className="cp-cta-btn" onClick={() => setDone(true)}><CIcon name="send" size={15} /> {type === "Flag to ANVI" ? "Send to ANVI" : "Submit request"}</button>
        <button className="cp-mini" style={{flex:"none",padding:"0 18px",height:46}} onClick={onBack}>Cancel</button>
      </div>
    </div>
  );
}

function MyTeamView({ onOpen, onReport }) {
  const { TEAM, COUNTRY_CAL } = window.CLIENT_TEAM;
  const totalMonthly = TEAM.reduce((s,e) => s + e.monthly, 0);
  const onVac = TEAM.filter(e => e.status === "On vacation").length;
  const pending = TEAM.filter(e => e.upcoming && e.upcoming.status.includes("Pending")).length;

  return (
    <div className="cp-section">
      <div className="cp-sec-head">
        <h2 className="cp-sec-title">My Team</h2>
        <p className="cp-sec-sub">{TEAM.length} people placed through ANVI · payroll, contracts and time off in one place.</p>
      </div>

      <div className="team-stats">
        <div className="team-stat"><div className="ts-ic"><CIcon name="wallet" size={16} /></div><div><b>${totalMonthly.toLocaleString()}</b><span>monthly cost · June</span></div></div>
        <div className="team-stat"><div className="ts-ic"><CIcon name="users" size={16} /></div><div><b>{TEAM.length}</b><span>active employees</span></div></div>
        <div className="team-stat"><div className="ts-ic"><CIcon name="plane" size={16} /></div><div><b>{onVac}</b><span>on vacation now</span></div></div>
        <div className="team-stat"><div className="ts-ic"><CIcon name="clock" size={16} /></div><div><b>{pending}</b><span>requests pending</span></div></div>
      </div>

      <div className="team-list">
        {TEAM.map(e => {
          const cal = COUNTRY_CAL[e.country];
          return (
            <div key={e.id} className="team-row" onClick={() => onOpen(e.id)}>
              <div className={"cp-av cp-av-sm emp-av-" + e.avatarTone}>{e.initials}<span className="cp-flag">{e.flag}</span></div>
              <div className="team-id">
                <div className="team-name">{e.name} <span className={"emp-status emp-status-" + (e.status === "Active" ? "on" : "away")}>{e.status}</span></div>
                <div className="team-role">{e.role} · {e.country}</div>
              </div>
              <div className="team-metric"><b>${e.monthly.toLocaleString()}</b><span>per month</span></div>
              <div className="team-metric"><b>{cal.working}</b><span>working days</span></div>
              <div className="team-metric"><b>{e.vacation.balance}</b><span>vacation left</span></div>
              <div className="team-metric team-metric-act">
                {e.upcoming
                  ? <span className={"cp-badge cp-badge-" + (e.upcoming.status==="Approved"?"yes":"maybe")}>{e.upcoming.type} · {e.upcoming.range.replace(/ – \w+ /, "–")}</span>
                  : <span className="team-ok"><CIcon name="check" size={12} /> All clear</span>}
              </div>
              <button className="team-report" onClick={(ev) => { ev.stopPropagation(); onReport(e.id); }}><CIcon name="plane" size={14} /> Report</button>
              <CIcon name="chevronR" size={18} style={{ color: "var(--txt-mute)" }} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

window.CLIENT_TEAMVIEW = { MyTeamView, EmployeePage, ReportPage };
