import React, { createContext, useCallback, useContext, useState } from 'react';
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
  const [currentPrompt, setCurrentPrompt] = useState<QueuedPrompt | null>(null);

  // These previously mirrored state into refs and wrote them during render
  // (a React 19 correctness hazard). The functional setState updater already
  // hands us the latest value, so the mirrors are unnecessary.
  const confirm = useCallback<Confirm>((options) => {
    return new Promise<boolean>((resolve) => {
      setCurrentConfirm((active) => {
        // If a dialog is somehow already open, cancel it before opening a new one.
        active?.resolve(false);
        return { ...options, resolve };
      });
    });
  }, []);

  const prompt = useCallback<Prompt>((options) => {
    return new Promise<string | null>((resolve) => {
      setCurrentPrompt((active) => {
        active?.resolve(null);
        return { ...options, resolve };
      });
    });
  }, []);

  const handleConfirmConfirm = useCallback(() => {
    setCurrentConfirm((active) => {
      active?.resolve(true);
      return null;
    });
  }, []);

  const handleConfirmCancel = useCallback(() => {
    setCurrentConfirm((active) => {
      active?.resolve(false);
      return null;
    });
  }, []);

  const handlePromptConfirm = useCallback((value: string) => {
    setCurrentPrompt((active) => {
      active?.resolve(value);
      return null;
    });
  }, []);

  const handlePromptCancel = useCallback(() => {
    setCurrentPrompt((active) => {
      active?.resolve(null);
      return null;
    });
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
