import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';

export const VirtualKeyboard = () => {
  const [focusedInput, setFocusedInput] = useState<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 1024);

  useEffect(() => {
    const handleResize = () => setIsDesktop(window.innerWidth >= 1024);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        setFocusedInput(target as HTMLInputElement | HTMLTextAreaElement);
      }
    };

    const handleFocusOut = (e: FocusEvent) => {
      // Delay clearing so we can check if focus moved to the keyboard itself
      setTimeout(() => {
        const active = document.activeElement;
        if (!active || (active.tagName !== 'INPUT' && active.tagName !== 'TEXTAREA')) {
          setFocusedInput(null);
          setIsOpen(false);
        }
      }, 100);
    };

    document.addEventListener('focusin', handleFocusIn);
    document.addEventListener('focusout', handleFocusOut);
    return () => {
      document.removeEventListener('focusin', handleFocusIn);
      document.removeEventListener('focusout', handleFocusOut);
    };
  }, []);

  useEffect(() => {
    const handleOpen = () => setIsOpen(true);
    document.addEventListener('zen:openKeyboard', handleOpen);
    return () => document.removeEventListener('zen:openKeyboard', handleOpen);
  }, []);

  if (!isDesktop) return null;

  const handleKeyPress = (key: string) => {
    if (!focusedInput) return;

    const start = focusedInput.selectionStart || 0;
    const end = focusedInput.selectionEnd || 0;
    const value = focusedInput.value;

    let newValue = value;
    let newCursorPos = start;

    if (key === 'BACKSPACE') {
      if (start === end && start > 0) {
        newValue = value.slice(0, start - 1) + value.slice(end);
        newCursorPos = start - 1;
      } else if (start !== end) {
        newValue = value.slice(0, start) + value.slice(end);
        newCursorPos = start;
      }
    } else if (key === 'SPACE') {
      newValue = value.slice(0, start) + ' ' + value.slice(end);
      newCursorPos = start + 1;
    } else {
      newValue = value.slice(0, start) + key + value.slice(end);
      newCursorPos = start + key.length;
    }

    // Native value setter to trigger React onChange
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    if (nativeInputValueSetter && focusedInput instanceof HTMLInputElement) {
      nativeInputValueSetter.call(focusedInput, newValue);
    } else {
      const nativeTextAreaValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
      if (nativeTextAreaValueSetter && focusedInput instanceof HTMLTextAreaElement) {
        nativeTextAreaValueSetter.call(focusedInput, newValue);
      } else {
        focusedInput.value = newValue;
      }
    }

    const event = new Event('input', { bubbles: true });
    focusedInput.dispatchEvent(event);

    focusedInput.focus();
    focusedInput.setSelectionRange(newCursorPos, newCursorPos);
  };

  const rows = [
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
    ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
    ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
    ['Z', 'X', 'C', 'V', 'B', 'N', 'M', 'BACKSPACE']
  ];

  return (
    <>
      <AnimatePresence>
        {focusedInput && !isOpen && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 20 }}
            onMouseDown={(e) => {
              e.preventDefault();
              setIsOpen(true);
            }}
            className="absolute bottom-6 right-6 z-[100] w-16 h-16 bg-primary text-on-primary rounded-full shadow-lg flex items-center justify-center hover:bg-primary/90 transition-colors"
          >
            <span className="material-symbols-outlined text-3xl">keyboard</span>
          </motion.button>
        )}
      </AnimatePresence>

      {typeof document !== 'undefined' && createPortal(
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed bottom-0 left-0 right-0 lg:right-96 z-[110] bg-surface-container-high border-t border-outline-variant/20 shadow-2xl p-4 md:p-6"
            onMouseDown={(e) => e.preventDefault()}
          >
            <div className="w-full max-w-6xl mx-auto relative px-2">
              <button
                onMouseDown={(e) => {
                  e.preventDefault();
                  setIsOpen(false);
                }}
                className="absolute -top-[54px] right-0 w-12 h-12 bg-surface-container-high rounded-t-lg flex items-center justify-center text-on-surface-variant hover:text-primary border border-b-0 border-outline-variant/20 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]"
              >
                <span className="material-symbols-outlined">keyboard_hide</span>
              </button>

              <div className="flex flex-col gap-3 w-full">
                {rows.map((row, i) => (
                  <div key={i} className={`flex justify-center gap-2 md:gap-3 w-full ${i === 1 ? 'px-4 md:px-8' : i === 2 ? 'px-8 md:px-16' : i === 3 ? 'px-12 md:px-24' : ''}`}>
                    {row.map((key) => (
                      <button
                        key={key}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleKeyPress(key);
                        }}
                        className={`h-16 md:h-20 rounded-xl bg-surface-container-lowest border border-outline-variant/20 text-on-surface font-headline font-bold text-xl md:text-2xl hover:bg-primary hover:text-on-primary hover:border-primary transition-colors flex items-center justify-center shadow-sm active:scale-95 ${
                          key === 'BACKSPACE' ? 'px-4 flex-[2] min-w-[120px]' : 'flex-1 max-w-[100px]'
                        }`}
                      >
                        {key === 'BACKSPACE' ? <span className="material-symbols-outlined text-3xl">backspace</span> : key}
                      </button>
                    ))}
                  </div>
                ))}
                <div className="flex justify-center gap-2 md:gap-3 mt-1 w-full">
                  <button
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleKeyPress('SPACE');
                    }}
                    className="h-16 md:h-20 w-full max-w-4xl rounded-xl bg-surface-container-lowest border border-outline-variant/20 text-on-surface hover:bg-primary hover:text-on-primary hover:border-primary transition-colors shadow-sm active:scale-95 font-headline font-bold text-xl md:text-2xl"
                  >
                    SPACE
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>,
      document.body
      )}
    </>
  );
};
