import { useState, useEffect } from 'react';
import { NavLink, useParams, useNavigate } from 'react-router-dom';
import { useProject } from '../lib/project.jsx';
import { useAuth } from '../lib/auth.jsx';
import { getSupabase } from '../lib/supabase';
import { getNotifications } from '../lib/notifications';

const NAV_SECTIONS = [
  {
    label: 'Home',
    icon: '\u{1F3E0}',
    items: [{ label: 'Home', to: '' }],
    single: true,
  },
  {
    label: 'ISOs',
    icon: '\u{1F4D0}',
    items: [{ label: 'ISO Register', to: 'isos' }],
  },
  {
    label: 'Production',
    icon: '\u{1F527}',
    items: [
      { label: 'Weld Log', to: 'welds' },
      { label: 'Welders', to: 'welders' },
      { label: 'WPS Register', to: 'wps' },
      { label: 'Spools', to: 'spools' },
      { label: 'Fab Dashboard', to: 'fabrication' },
      { label: 'Materials', to: 'materials' },
    ],
  },
  {
    label: 'NDT',
    icon: '\u{1F52C}',
    items: [{ label: 'NDT Register', to: 'ndt' }],
  },
  {
    label: 'Supports',
    icon: '\u{1F3D7}',
    items: [
      { label: 'Supports List', to: 'supports' },
      { label: 'Status', to: 'supports/status' },
      { label: 'Dashboard', to: 'supports/dashboard' },
    ],
  },
  {
    label: 'Testpacks',
    icon: '\u2705',
    items: [{ label: 'Testpack Register', to: 'testpacks', disabled: true }],
    disabled: true,
  },
  {
    label: 'More',
    icon: '\u2699\uFE0F',
    items: [
      { label: 'Documents', to: 'documents' },
      { label: 'Personnel', to: 'personnel' },
      { label: 'Equipment', to: 'equipment' },
      { label: 'QC Records', to: 'qc-records' },
      { label: 'Import Data', to: 'import' },
      { label: 'Reports', to: 'reports' },
      { label: 'Sign out', action: 'signout' },
    ],
  },
];

export default function AppLayout({ children }) {
  const project = useProject();
  const { projectSlug } = useParams();
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState({ ISOs: true, Production: true });
  const [collapsed, setCollapsed] = useState(false);
  const [notifCount, setNotifCount] = useState(0);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 900px)');
    const handler = (e) => setCollapsed(e.matches);
    handler(mq);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Fetch notification count
  useEffect(() => {
    if (!project?.id) return;
    let c = false;
    (async () => {
      try {
        const sb = getSupabase();
        const notifs = await getNotifications(sb, project.id);
        if (!c) setNotifCount(notifs.length);
      } catch {
        // silent
      }
    })();
    return () => { c = true; };
  }, [project?.id]);

  const toggle = (label) =>
    setExpanded((prev) => ({ ...prev, [label]: !prev[label] }));

  const base = `/p/${projectSlug}`;

  async function handleSignOut() {
    await signOut();
    navigate('/login', { replace: true });
  }

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      {/* Sidebar */}
      <nav
        style={{
          width: collapsed ? 'var(--sidebar-collapsed-width)' : 'var(--sidebar-width)',
          minWidth: collapsed ? 'var(--sidebar-collapsed-width)' : 'var(--sidebar-width)',
          height: '100%',
          background: 'var(--sidebar-bg)',
          color: 'var(--sidebar-text)',
          display: 'flex',
          flexDirection: 'column',
          transition: 'width var(--transition-normal), min-width var(--transition-normal)',
          overflow: 'hidden',
          userSelect: 'none',
        }}
      >
        {/* Project header */}
        <div
          style={{
            padding: 'var(--space-md)',
            background: 'var(--sidebar-bg-darker)',
            borderBottom: '1px solid var(--sidebar-divider)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          {collapsed ? (
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 'var(--radius-sm)',
                background: 'var(--color-primary)',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 12,
                fontWeight: 700,
              }}
              title={project.name}
            >
              {(project.code || 'P').slice(0, 2)}
            </div>
          ) : (
            <>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: 'var(--sidebar-text-active)',
                    lineHeight: 1.3,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {project.name}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: 'var(--sidebar-section-text)',
                    marginTop: 2,
                  }}
                >
                  {project.code}
                </div>
              </div>

              {/* Notification bell */}
              <button
                onClick={() => navigate(base)}
                title={notifCount > 0 ? `${notifCount} notification${notifCount !== 1 ? 's' : ''}` : 'No notifications'}
                style={{
                  position: 'relative',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 18,
                  padding: 4,
                  color: 'var(--sidebar-text)',
                  flexShrink: 0,
                }}
              >
                {'\uD83D\uDD14'}
                {notifCount > 0 && (
                  <span style={{
                    position: 'absolute',
                    top: 0,
                    right: 0,
                    width: 16,
                    height: 16,
                    borderRadius: '50%',
                    background: '#ef4444',
                    color: '#fff',
                    fontSize: 9,
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    lineHeight: 1,
                  }}>
                    {notifCount > 9 ? '9+' : notifCount}
                  </span>
                )}
              </button>
            </>
          )}
        </div>

        {/* Nav groups */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-sm) 0' }}>
          {NAV_SECTIONS.map((section) => {
            // Single-item sections (Home) — render as direct link
            if (section.single) {
              const item = section.items[0];
              return (
                <div key={section.label} style={{ marginBottom: 2 }}>
                  <NavLink
                    to={`${base}/${item.to}`}
                    end={item.to === ''}
                    style={({ isActive }) => ({
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--space-sm)',
                      width: '100%',
                      padding: '6px var(--space-md)',
                      background: isActive ? 'var(--sidebar-active)' : 'none',
                      border: 'none',
                      color: isActive ? 'var(--sidebar-text-active)' : 'var(--sidebar-section-text)',
                      cursor: 'pointer',
                      fontSize: 11,
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      whiteSpace: 'nowrap',
                      textDecoration: 'none',
                      borderRadius: 'var(--radius-sm)',
                      margin: '0 var(--space-xs)',
                    })}
                    title={collapsed ? section.label : undefined}
                  >
                    <span style={{ fontSize: 15, flexShrink: 0 }}>{section.icon}</span>
                    {!collapsed && <span>{section.label}</span>}
                  </NavLink>
                </div>
              );
            }

            return (
              <div key={section.label} style={{ marginBottom: 2 }}>
                {/* Section header */}
                <button
                  onClick={() => toggle(section.label)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-sm)',
                    width: '100%',
                    padding: '6px var(--space-md)',
                    background: 'none',
                    border: 'none',
                    color: section.disabled
                      ? 'rgba(122,154,187,0.4)'
                      : 'var(--sidebar-section-text)',
                    cursor: section.disabled ? 'default' : 'pointer',
                    fontSize: 11,
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    whiteSpace: 'nowrap',
                  }}
                  title={collapsed ? section.label : undefined}
                >
                  <span style={{ fontSize: 15, flexShrink: 0 }}>{section.icon}</span>
                  {!collapsed && (
                    <>
                      <span style={{ flex: 1, textAlign: 'left' }}>{section.label}</span>
                      {!section.disabled && (
                        <span
                          style={{
                            fontSize: 9,
                            transition: 'transform var(--transition-fast)',
                            transform: expanded[section.label]
                              ? 'rotate(90deg)'
                              : 'rotate(0)',
                          }}
                        >
                          &#9654;
                        </span>
                      )}
                      {section.disabled && (
                        <span style={{ fontSize: 10, opacity: 0.5 }}>soon</span>
                      )}
                    </>
                  )}
                </button>

                {/* Sub-items */}
                {!collapsed && expanded[section.label] && !section.disabled && (
                  <div style={{ padding: '2px 0' }}>
                    {section.items.map((item) => {
                      if (item.action === 'signout') {
                        return (
                          <button
                            key="signout"
                            onClick={handleSignOut}
                            style={{
                              display: 'block',
                              width: '100%',
                              textAlign: 'left',
                              padding: '5px var(--space-md) 5px 40px',
                              fontSize: 13,
                              color: 'var(--sidebar-text)',
                              background: 'transparent',
                              border: 'none',
                              cursor: 'pointer',
                              borderRadius: 'var(--radius-sm)',
                              margin: '0 var(--space-xs)',
                            }}
                            onMouseEnter={(e) =>
                              (e.currentTarget.style.background = 'var(--sidebar-hover)')
                            }
                            onMouseLeave={(e) =>
                              (e.currentTarget.style.background = 'transparent')
                            }
                          >
                            Sign out
                          </button>
                        );
                      }

                      if (item.disabled) {
                        return (
                          <span
                            key={item.to}
                            style={{
                              display: 'block',
                              padding: '5px var(--space-md) 5px 40px',
                              fontSize: 13,
                              color: 'rgba(184,204,224,0.35)',
                              cursor: 'default',
                            }}
                          >
                            {item.label}
                          </span>
                        );
                      }

                      return (
                        <NavLink
                          key={item.to}
                          to={`${base}/${item.to}`}
                          style={({ isActive }) => ({
                            display: 'block',
                            padding: '5px var(--space-md) 5px 40px',
                            fontSize: 13,
                            color: isActive
                              ? 'var(--sidebar-text-active)'
                              : 'var(--sidebar-text)',
                            background: isActive
                              ? 'var(--sidebar-active)'
                              : 'transparent',
                            borderRadius: 'var(--radius-sm)',
                            margin: '0 var(--space-xs)',
                            textDecoration: 'none',
                            transition: 'background var(--transition-fast)',
                          })}
                          onMouseEnter={(e) => {
                            if (!e.currentTarget.getAttribute('aria-current'))
                              e.currentTarget.style.background = 'var(--sidebar-hover)';
                          }}
                          onMouseLeave={(e) => {
                            if (!e.currentTarget.getAttribute('aria-current'))
                              e.currentTarget.style.background = 'transparent';
                          }}
                        >
                          {item.label}
                        </NavLink>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Bottom bar */}
        {!collapsed && (
          <div
            style={{
              padding: 'var(--space-sm) var(--space-md)',
              borderTop: '1px solid var(--sidebar-divider)',
              fontSize: 11,
              color: 'var(--sidebar-section-text)',
            }}
          >
            PipePro WMS
          </div>
        )}
      </nav>

      {/* Main content */}
      <main
        style={{
          flex: 1,
          overflow: 'auto',
          background: 'var(--color-bg)',
        }}
      >
        {children}
      </main>
    </div>
  );
}
