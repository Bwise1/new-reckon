import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import ConfirmDialog, { type ConfirmVariant } from '@/components/ui/ConfirmDialog';

export interface ConfirmOptions {
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmVariant;
}

type Confirm = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<Confirm | null>(null);

interface QueuedConfirm extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

export const ConfirmProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [current, setCurrent] = useState<QueuedConfirm | null>(null);
  const currentRef = useRef<QueuedConfirm | null>(null);
  currentRef.current = current;

  const confirm = useCallback<Confirm>((options) => {
    return new Promise<boolean>((resolve) => {
      // If a dialog is somehow already open, cancel it before opening a new one.
      if (currentRef.current) {
        currentRef.current.resolve(false);
      }
      setCurrent({ ...options, resolve });
    });
  }, []);

  const handleConfirm = useCallback(() => {
    const active = currentRef.current;
    if (!active) return;
    active.resolve(true);
    setCurrent(null);
  }, []);

  const handleCancel = useCallback(() => {
    const active = currentRef.current;
    if (!active) return;
    active.resolve(false);
    setCurrent(null);
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <ConfirmDialog
        open={current !== null}
        title={current?.title ?? ''}
        message={current?.message ?? ''}
        confirmLabel={current?.confirmLabel}
        cancelLabel={current?.cancelLabel}
        variant={current?.variant}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    </ConfirmContext.Provider>
  );
};

export const useConfirm = (): Confirm => {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error('useConfirm must be used within a <ConfirmProvider>');
  }
  return ctx;
};
