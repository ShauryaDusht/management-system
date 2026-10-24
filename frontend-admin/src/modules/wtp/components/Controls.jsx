import { SHIFTS } from '../config';

// "Per shift / Per day" switch plus shift filter, shared by several reports
export function ViewControls({ view, setView, ash, setAsh }) {
  return (
    <>
      <label>View
        <select value={view} onChange={(e) => setView(e.target.value)}>
          <option value="shift">Per shift</option>
          <option value="day">Per day (total)</option>
          <option value="7days">7 days</option>
          <option value="15days">15 days</option>
          <option value="30days">30 days</option>
        </select>
      </label>
      {view === 'shift' && (
        <label>Shift
          <select value={ash} onChange={(e) => setAsh(e.target.value)}>
            <option value="all">All shifts</option>
            {SHIFTS.map((s) => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
          </select>
        </label>
      )}
    </>
  );
}

export const Kpi = ({ label, value, sub }) => (
  <div className="kpi"><span>{label}</span><b>{value}</b>{sub && <span>{sub}</span>}</div>
);
