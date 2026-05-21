// Reusable table cell.
// value: boolean (flask/food/elixir) or number (potion cast count)
// na: renders — instead of ✓/✗
export default function Cell({ value, na }) {
  if (na && !value) return <td className="center na">—</td>;
  if (!value) return <td className="center"><span className="cross">✗</span></td>;
  if (value === true) return <td className="center"><span className="check">✓</span></td>;
  // Numeric count — show how many times the potion was used
  return <td className="center"><span className="check">{value}×</span></td>;
}
