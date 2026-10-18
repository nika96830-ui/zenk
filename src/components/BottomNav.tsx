import { NavLink } from 'react-router-dom';
import { Mic, Settings, Home } from 'lucide-react';
import { useI18n } from '../i18n/I18nProvider';

export function BottomNav() {
  const { t } = useI18n();
  const items = [
    { to: '/', icon: Home, label: t.nav.meetings },
    { to: '/record', icon: Mic, label: t.nav.record },
    { to: '/settings', icon: Settings, label: t.nav.more },
  ];
  return (
    <nav className="bottom-nav">
      {items.map(({ to, icon: Icon, label }) => (
        <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
          <Icon strokeWidth={1.75} />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
