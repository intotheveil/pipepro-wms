import { useState, useEffect } from 'react';
import { NavLink, useParams } from 'react-router-dom';

const NAV_SECTIONS = [
  {
    label: 'ISOs',
    icon: '📐',
    items: [
      { label: 'ISO Register', to: 'isos' },
      { label: 'Spool Tracker', to: 'spools' },
    ],
  },
  {
    label: 'Production',
    icon: '🔧',
    items: [
      { label: 'Fit-up', to: 'fitup' },
      { label: 'Welding', to: 'welding' },
    ],
  },
  {
    label: 'NDT',
    icon: '🔬',
    items: [
      { label: 'NDT Requests', to: 'ndt-requests' },
      { label: 'NDT Results', to: 'ndt-results' },
    ],
  },
  {
    label: 'Supports',
    icon: '🏗️',
    items: [
      { label: 'Support Register', to: 'supports' },
    ],
  },
  {
    label: 'Testpacks',
    icon: '✅',
    items: [
      { label: 'Testpack Register', to: 'testpacks' },
    ],
  },
  {
    label: 'More',
    icon: '⚙️',
    items: [
      { label: 'Settings', to: 'settings' },
      { label: 'Users', to: 'users' },
    ],
  },
];

export default function Sidebar() {
  const { projectSlug } = useParams();
  const [collapsed, setCollapsed] = useState(false);
  const [expanded, setExpanded] = useState({});

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 900px)');
    const handler = (e) => setCollapsed(e.matches);
    handler(mq);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const toggle = (label) =>
    setExpanded((prev) => ({ ...prev, [label]: !prev[label] }));

  const base = `/p/${projectSlug}`;

  return (
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
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: 'var(--space-md)',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-sm)',
          whiteSpace: 'nowrap',
        }}
      >
        <span style={{ fontSize: 20, flexShrink: 0 }}>🔷</span>
        {!collapsed && (
          <span style={{ fontWeight: 600, fontSize: 15, color: 'var(--sidebar-text-active)' }}>
            PipePro WMS
          </span>
        )}
      </div>

      {/* Nav sections */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-sm) 0' }}>
        {NAV_SECTIONS.map((section) => (
          <div key={section.label} style={{ marginBottom: 'var(--space-xs)' }}>
            {/* Section header */}
            <button
              onClick={() => toggle(section.label)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-sm)',
                width: '100%',
                padding: collapsed
                  ? 'var(--space-sm) var(--space-md)'
                  : 'var(--space-sm) var(--space-md)',
                background: 'none',
                border: 'none',
                color: 'var(--sidebar-section-text)',
                cursor: 'pointer',
                fontSize: 11,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                whiteSpace: 'nowrap',
              }}
              title={collapsed ? section.label : undefined}
            >
              <span style={{ fontSize: 16, flexShrink: 0 }}>{section.icon}</span>
              {!collapsed && (
                <>
                  <span style={{ flex: 1, textAlign: 'left' }}>{section.label}</span>
                  <span style={{
                    fontSize: 10,
                    transition: 'transform var(--transition-fast)',
                    transform: expanded[section.label] ? 'rotate(90deg)' : 'rotate(0)',
                  }}>
                    ▶
                  </span>
                </>
              )}
            </button>

            {/* Sub-items */}
            {!collapsed && expanded[section.label] && (
              <div>
                {section.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={`${base}/${item.to}`}
                    style={({ isActive }) => ({
                      display: 'block',
                      padding: 'var(--space-xs) var(--space-md) var(--space-xs) 44px',
                      fontSize: 13,
                      color: isActive ? 'var(--sidebar-text-active)' : 'var(--sidebar-text)',
                      background: isActive ? 'var(--sidebar-active)' : 'transparent',
                      borderRadius: 'var(--radius-sm)',
                      margin: '0 var(--space-xs)',
                      textDecoration: 'none',
                      transition: 'background var(--transition-fast)',
                    })}
                    onMouseEnter={(e) => {
                      if (!e.currentTarget.classList.contains('active'))
                        e.currentTarget.style.background = 'var(--sidebar-hover)';
                    }}
                    onMouseLeave={(e) => {
                      if (!e.currentTarget.classList.contains('active'))
                        e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    {item.label}
                  </NavLink>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </nav>
  );
}
