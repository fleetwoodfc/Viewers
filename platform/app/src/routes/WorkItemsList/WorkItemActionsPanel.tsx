import React from 'react';

type WorkitemActionState = 'idle' | 'claiming' | 'completing' | 'canceling' | 'rejecting';

interface WorkItemActionsPanelProps {
  uid: string;
  procedureStepState: 'SCHEDULED' | 'IN PROGRESS' | 'COMPLETED' | 'CANCELED';
  isAssignedToMe: boolean;
  claimedByMe: boolean;
  actionState: WorkitemActionState;
  onClaim: (uid: string) => void;
  onComplete: (uid: string) => void;
  onCancel: (uid: string) => void;
  onReject: (uid: string) => void;
}

const btnBase =
  'rounded px-2 py-1 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50';

const btnPrimary = `${btnBase} bg-primary-main text-black hover:bg-primary-light focus:ring-primary-main`;
const btnDanger = `${btnBase} bg-red-600 text-white hover:bg-red-500 focus:ring-red-500`;
const btnWarning = `${btnBase} bg-yellow-600 text-white hover:bg-yellow-500 focus:ring-yellow-500`;
const btnGhost = `${btnBase} border border-gray-500 text-gray-300 hover:border-gray-300 hover:text-white focus:ring-gray-400`;

export default function WorkItemActionsPanel({
  uid,
  procedureStepState,
  isAssignedToMe,
  claimedByMe,
  actionState,
  onClaim,
  onComplete,
  onCancel,
  onReject,
}: WorkItemActionsPanelProps) {
  const busy = actionState !== 'idle';

  const state = (procedureStepState ?? '').toUpperCase() as
    | 'SCHEDULED'
    | 'IN PROGRESS'
    | 'COMPLETED'
    | 'CANCELED';

  if (state !== 'SCHEDULED' && state !== 'IN PROGRESS') {
    return null;
  }

  return (
    <div className="flex flex-row flex-wrap gap-1">
      {state === 'SCHEDULED' && (
        <button
          className={btnPrimary}
          disabled={busy}
          aria-label="Claim workitem"
          onClick={e => {
            e.stopPropagation();
            onClaim(uid);
          }}
        >
          {actionState === 'claiming' ? 'Claiming…' : 'Claim'}
        </button>
      )}

      {state === 'SCHEDULED' && isAssignedToMe && (
        <button
          className={btnGhost}
          disabled={busy}
          aria-label="Reject workitem"
          onClick={e => {
            e.stopPropagation();
            onReject(uid);
          }}
        >
          {actionState === 'rejecting' ? 'Rejecting…' : 'Reject'}
        </button>
      )}

      {state === 'IN PROGRESS' && claimedByMe && (
        <>
          <button
            className={btnPrimary}
            disabled={busy}
            aria-label="Complete workitem"
            onClick={e => {
              e.stopPropagation();
              onComplete(uid);
            }}
          >
            {actionState === 'completing' ? 'Completing…' : 'Complete'}
          </button>

          <button
            className={btnDanger}
            disabled={busy}
            aria-label="Cancel workitem"
            onClick={e => {
              e.stopPropagation();
              onCancel(uid);
            }}
          >
            {actionState === 'canceling' ? 'Canceling…' : 'Cancel'}
          </button>
        </>
      )}
    </div>
  );
}
