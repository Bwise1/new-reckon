import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import ConfirmDialog, { type ConfirmVariant } from '@/components/ui/ConfirmDialog';
import PromptDialog, { type PromptVariant } from '@/components/ui/PromptDialog';

export interface ConfirmOptions {
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmVariant;
}

export interface PromptOptions {
  title: string;
  message?: React.ReactNode;
  label?: string;
  placeholder?: string;
  defaultValue?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: PromptVariant;
  validate?: (value: string) => string | null;
}

type Confirm = (options: ConfirmOptions) => Promise<boolean>;
/** Returns the entered value on submit, or `null` on cancel. */
type Prompt = (options: PromptOptions) => Promise<string | null>;

interface DialogContextValue {
  confirm: Confirm;
  prompt: Prompt;
}

const DialogContext = createContext<DialogContextValue | null>(null);

interface QueuedConfirm extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

interface QueuedPrompt extends PromptOptions {
  resolve: (value: string | null) => void;
}

export const ConfirmProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentConfirm, setCurrentConfirm] = useState<QueuedConfirm | null>(null);
  const currentConfirmRef = useRef<QueuedConfirm | null>(null);
  currentConfirmRef.current = currentConfirm;

  const [currentPrompt, setCurrentPrompt] = useState<QueuedPrompt | null>(null);
  const currentPromptRef = useRef<QueuedPrompt | null>(null);
  currentPromptRef.current = currentPrompt;

  const confirm = useCallback<Confirm>((options) => {
    return new Promise<boolean>((resolve) => {
      // If a dialog is somehow already open, cancel it before opening a new one.
      if (currentConfirmRef.current) {
        currentConfirmRef.current.resolve(false);
      }
      setCurrentConfirm({ ...options, resolve });
    });
  }, []);

  const prompt = useCallback<Prompt>((options) => {
    return new Promise<string | null>((resolve) => {
      if (currentPromptRef.current) {
        currentPromptRef.current.resolve(null);
      }
      setCurrentPrompt({ ...options, resolve });
    });
  }, []);

  const handleConfirmConfirm = useCallback(() => {
    const active = currentConfirmRef.current;
    if (!active) return;
    active.resolve(true);
    setCurrentConfirm(null);
  }, []);

  const handleConfirmCancel = useCallback(() => {
    const active = currentConfirmRef.current;
    if (!active) return;
    active.resolve(false);
    setCurrentConfirm(null);
  }, []);

  const handlePromptConfirm = useCallback((value: string) => {
    const active = currentPromptRef.current;
    if (!active) return;
    active.resolve(value);
    setCurrentPrompt(null);
  }, []);

  const handlePromptCancel = useCallback(() => {
    const active = currentPromptRef.current;
    if (!active) return;
    active.resolve(null);
    setCurrentPrompt(null);
  }, []);

  return (
    <DialogContext.Provider value={{ confirm, prompt }}>
      {children}
      <ConfirmDialog
        open={currentConfirm !== null}
        title={currentConfirm?.title ?? ''}
        message={currentConfirm?.message ?? ''}
        confirmLabel={currentConfirm?.confirmLabel}
        cancelLabel={currentConfirm?.cancelLabel}
        variant={currentConfirm?.variant}
        onConfirm={handleConfirmConfirm}
        onCancel={handleConfirmCancel}
      />
      <PromptDialog
        open={currentPrompt !== null}
        title={currentPrompt?.title ?? ''}
        message={currentPrompt?.message}
        label={currentPrompt?.label}
        placeholder={currentPrompt?.placeholder}
        defaultValue={currentPrompt?.defaultValue}
        confirmLabel={currentPrompt?.confirmLabel}
        cancelLabel={currentPrompt?.cancelLabel}
        variant={currentPrompt?.variant}
        validate={currentPrompt?.validate}
        onConfirm={handlePromptConfirm}
        onCancel={handlePromptCancel}
      />
    </DialogContext.Provider>
  );
};

const useDialogContext = (hookName: string): DialogContextValue => {
  const ctx = useContext(DialogContext);
  if (!ctx) {
    throw new Error(`${hookName} must be used within a <ConfirmProvider>`);
  }
  return ctx;
};

export const useConfirm = (): Confirm => useDialogContext('useConfirm').confirm;
export const usePrompt = (): Prompt => useDialogContext('usePrompt').prompt;
