const LOAD_STEPS = [
  'Fetching fight list & roster...',
  'Reading pre-fight buffs...',
  'Scanning potion casts...',
  'Building player breakdown...',
];

// Delays in ms for each step transition (index 0 is immediate).
export const LOAD_STEP_DELAYS = [0, 3000, 8000, 16000];

export default function LoadingStatus({ step }) {
  return (
    <div className="load-status">
      <span className="load-spinner" />
      <span>{LOAD_STEPS[step] ?? LOAD_STEPS[LOAD_STEPS.length - 1]}</span>
    </div>
  );
}
