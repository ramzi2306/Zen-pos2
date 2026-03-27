import React from 'react';

/**
 * Sidebar — left navigation panel used inside the settings/admin shell.
 *
 * Renders two distinct nav sets depending on `type`:
 * - **pos_settings** → Branding · Locations · Staff · Localization · Role Management · Integration
 * - **admin_panel**  → Sales · Customers · Products · Human Resources
 *
 * Items are filtered by permission so users only see what they can access.
 * Active item is highlighted with the secondary colour + left border.
 *
 * @prop currentSetting    - ID of the currently active section (e.g. 'branding')
 * @prop setCurrentSetting - Navigate to a section by ID
 * @prop type              - Which nav set to render
 * @prop hasPermission     - Permission guard helper
 */
export const Sidebar = ({
  currentSetting,
  setCurrentSetting,
  type,
  hasPermission,
}: {
  currentSetting: string;
  setCurrentSetting: (s: string) => void;
  type: 'pos_settings' | 'admin_panel';
  hasPermission: (p: any) => boolean;
}) => {
  const navItems = [
    // POS Settings
    { id: 'branding',     icon: 'palette',              label: 'Branding',        category: 'pos_settings', permission: 'view_settings' },
    { id: 'locations',    icon: 'location_on',          label: 'Locations',       category: 'pos_settings', permission: 'view_settings' },
    { id: 'team',         icon: 'group',                label: 'Staff',           category: 'pos_settings', permission: 'view_staff'    },
    { id: 'localization', icon: 'language',             label: 'Localization',    category: 'pos_settings', permission: 'view_settings' },
    { id: 'roles',        icon: 'admin_panel_settings', label: 'Role Management', category: 'pos_settings', permission: 'manage_roles'  },
    { id: 'integration',   icon: 'hub',                  label: 'Integration',     category: 'pos_settings', permission: 'view_settings' },
    { id: 'notifications', icon: 'notifications_active', label: 'Notifications',   category: 'pos_settings', permission: 'view_settings' },
    { id: 'profile',       icon: 'manage_accounts',      label: 'My Profile',      category: 'pos_settings', permission: 'view_settings' },

    // Administration
    { id: 'sales',      icon: 'bar_chart',       label: 'Sales',           category: 'admin_panel', permission: 'view_orders'   },
    { id: 'customers',  icon: 'groups',          label: 'Customers',       category: 'admin_panel', permission: 'view_orders'   },
    { id: 'products',   icon: 'restaurant_menu', label: 'Products',        category: 'admin_panel', permission: 'view_settings' },
    { id: 'hr',         icon: 'badge',           label: 'Human Resources', category: 'admin_panel', permission: 'view_hr'       },
  ];

  const filteredItems = navItems.filter(
    item => item.category === type && (!item.permission || hasPermission(item.permission as any))
  );

  return (
    <aside className="w-64 flex-shrink-0 flex flex-col bg-surface-container-lowest border-r border-outline-variant/10 z-10 hidden md:flex">
      <div className="flex flex-col h-full py-8">
        <div className="px-6 mb-10">
          <span className="text-xl font-bold tracking-tighter text-primary font-headline">
            {type === 'pos_settings' ? 'Admin Settings' : 'Administration'}
          </span>
        </div>
        <nav className="flex-1 space-y-1">
          {filteredItems.map(item => (
            <button
              key={item.id}
              onClick={() => setCurrentSetting(item.id)}
              className={`w-full px-6 py-4 flex items-center gap-4 transition-colors duration-200 font-headline tracking-[0.05rem] uppercase text-xs font-semibold ${
                currentSetting === item.id
                  ? 'text-secondary border-l-4 border-secondary bg-surface-container-high'
                  : 'text-primary/60 hover:text-primary hover:bg-surface-container'
              }`}
            >
              <span className="material-symbols-outlined">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>
      </div>
    </aside>
  );
};
