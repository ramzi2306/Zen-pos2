import React from 'react';

/**
 * Switch — Material Design 3 toggle switch.
 *
 * @example
 * <Switch enabled={isActive} onChange={setIsActive} />
 *
 * @prop enabled  - Current on/off state
 * @prop onChange - Called with the new value when the user taps
 */
export const Switch = ({
  enabled,
  onChange,
}: {
  enabled: boolean;
  onChange: (val: boolean) => void;
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={enabled}
    onClick={() => onChange(!enabled)}
    className={`${
      enabled ? 'bg-secondary' : 'bg-surface-container-highest'
    } relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary`}
  >
    <span
      className={`${
        enabled ? 'translate-x-6' : 'translate-x-1'
      } inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200`}
    />
  </button>
);
