import React, { useState, useEffect, useRef } from 'react';

interface CancelWorkitemModalProps {
  onConfirm: (reason?: string) => void;
  onClose: () => void;
}

export default function CancelWorkitemModal({ onConfirm, onClose }: CancelWorkitemModalProps) {
  const [reason, setReason] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleConfirm = () => {
    onConfirm(reason.trim() || undefined);
  };

  return (
    <div className="flex min-w-[400px] flex-col gap-4 p-4">
      <p className="text-sm text-gray-300">
        The workitem will be marked <span className="font-semibold text-red-400">CANCELED</span>.
        You may optionally provide a reason below.
      </p>

      <div className="flex flex-col gap-1">
        <label
          htmlFor="cancel-reason"
          className="text-xs font-semibold text-gray-400"
        >
          Cancellation Reason (optional)
        </label>
        <textarea
          id="cancel-reason"
          ref={textareaRef}
          className="bg-secondary-dark placeholder-secondary-light focus:ring-primary-light rounded border border-gray-600 px-3 py-2 text-sm text-white outline-none focus:ring-1"
          rows={3}
          maxLength={256}
          placeholder="Enter reason…"
          value={reason}
          onChange={e => setReason(e.target.value)}
        />
        <span className="text-right text-xs text-gray-500">{reason.length}/256</span>
      </div>

      <div className="flex flex-row justify-end gap-2">
        <button
          className="rounded border border-gray-500 px-4 py-1.5 text-sm text-gray-300 hover:border-gray-300 hover:text-white focus:outline-none focus:ring-2 focus:ring-gray-400"
          onClick={onClose}
        >
          Dismiss
        </button>
        <button
          className="rounded bg-red-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-red-500 focus:outline-none focus:ring-2 focus:ring-red-500"
          onClick={handleConfirm}
        >
          Cancel Workitem
        </button>
      </div>
    </div>
  );
}
