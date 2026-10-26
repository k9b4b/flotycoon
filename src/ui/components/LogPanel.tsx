import { formatGameTime } from '../../engine/time';
import type { Snapshot } from '../../engine/view';

export function LogPanel({ snap }: { snap: Snapshot }) {
  const entries = [...snap.log].reverse();
  return (
    <section className="panel area-log">
      <div className="panel-head">
        <span className="panel-title">Dziennik i CB-radio</span>
      </div>
      <div className="panel-body scroll log-scroll">
        {entries.map((e, i) => (
          <div className={`log-entry ${e.tone}`} key={`${e.t}-${i}`}>
            <span className="t">{formatGameTime(e.t)}</span>
            <span className="text">{e.text}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
