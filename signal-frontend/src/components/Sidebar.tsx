export type TabId = 1 | 2 | 3;

interface Props {
  activeTab:   TabId;
  onTabChange: (t: TabId) => void;
  running:     boolean;
  done:        boolean;
  finished:    boolean;   // any terminal state (confirmed | low_confidence | no_signal | …)
}

const TABS: { id: TabId; name: string; sub: string }[] = [
  { id: 1, name: 'Setup',    sub: 'Configure & run'    },
  { id: 2, name: 'Analysis', sub: 'Agents at work'     },
  { id: 3, name: 'Results',  sub: 'Intelligence report' },
];

export function Sidebar({ activeTab, onTabChange, running, done, finished }: Props) {
  function accessible(id: TabId) {
    if (id === 1) return true;
    if (id === 2) return running || finished;
    if (id === 3) return finished;
    return false;
  }

  // Status bubble state
  const pipStatus = running ? 'running' : done ? 'done' : 'idle';
  const pipLabel  = running ? 'Pipeline running…' : done ? 'Signal confirmed' : 'Ready';

  return (
    <aside className="app-sidebar">

      {/* Brand block */}
      <div className="sidebar-brand">
        <div className="brand-name">
          Poly<span className="brand-accent">Signal</span>
        </div>
        <div className="brand-sub">K2 Think V2 · Multi-Agent</div>
      </div>

      {/* Nav */}
      <nav className="sidebar-nav">
        <div className="nav-group-label">Navigation</div>

        {TABS.map(tab => {
          const active = activeTab === tab.id;
          const canUse = accessible(tab.id);

          // Dot inside icon
          const isTabRunning  = tab.id === 2 && running;
          const isTabFinished = tab.id === 3 && finished;
          const dotEl = isTabRunning ? (
            <span style={{
              display: 'block', width: 6, height: 6, borderRadius: '50%',
              background: 'var(--pink2)',
              animation: 'pulseDot 1.2s ease-in-out infinite',
            }} />
          ) : isTabFinished ? (
            <span style={{
              display: 'block', width: 6, height: 6, borderRadius: '50%',
              background: 'var(--pink1)',
              boxShadow: '0 0 4px rgba(242,196,206,0.5)',
            }} />
          ) : (
            <span className="nav-step">0{tab.id}</span>
          );

          return (
            <button
              key={tab.id}
              className={`nav-tab${active ? ' active' : ''}`}
              disabled={!canUse}
              onClick={() => canUse && onTabChange(tab.id)}
            >
              <div className="nav-tab-icon">{dotEl}</div>
              <div className="nav-tab-text">
                <div className="nav-tab-name">{tab.name}</div>
                <div className="nav-tab-sub">{tab.sub}</div>
              </div>
            </button>
          );
        })}
      </nav>

      {/* Footer: only show when pipeline is active */}
      {(running || finished) && (
        <div className="sidebar-footer">
          <div className="status-bubble">
            <div className={`status-pip ${pipStatus}`} />
            <span className="status-text">{pipLabel}</span>
          </div>
        </div>
      )}

    </aside>
  );
}
